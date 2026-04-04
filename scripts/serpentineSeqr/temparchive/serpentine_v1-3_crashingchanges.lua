local W, H = 16, 8
local ALT_X, ALT_Y = 1, 8
local PANIC_X, PANIC_Y = 2, 8
local DPAD = {{x=15,y=7,dx=0,dy=-1},{x=14,y=8,dx=-1,dy=0},{x=15,y=8,dx=0,dy=1},{x=16,y=8,dx=1,dy=0}}
local num_fruits = 3
local auto_mode = 0
local auto_target = {x=0, y=0}
local auto_has_target = false
local bpm = 120
local temp_slow_steps = 0
local function get_interval()
  local current_bpm = (temp_slow_steps > 0) and (bpm / 2) or bpm
  return 60 / current_bpm / 4
end
local ECHO_MAX = 4
local ECHO_BUF = {}
for i=1,ECHO_MAX do ECHO_BUF[i] = {active=false, note=0, vel=0, ticks_left=0, current_interval=0, bounces=0} end
local arp_pool = {}
for i=1,8 do arp_pool[i]={note=0,x=0,y=0,kind=0,prob=1.0} end
local arp_pool_len = 0
local arp_pool_max = 8
local arp_mode = 1
local arp_enabled = true
local humanize_level = 0
local humanize_hold = false
local ACCENT_DIVS = {0,2,3,4,6,8,12,16}
local accent_div_idx = 4
local arp_labels = {"ORD","RND","UP","DWN"}
local auto_labels = {"NON","SEM","AUT"}
local SORT_BUF = {}
for i=1,8 do SORT_BUF[i]={note=0,x=0,y=0,kind=0,prob=1.0} end
local FRUIT_COL = {{r=220,g=40,b=20},{r=80,g=120,b=240},{r=240,g=200,b=20},{r=40,g=220,b=200},{r=255,g=140,b=0},{r=200,g=40,b=240}}
local FRUIT_W = {20, 40, 20, 20, 15, 10}
local fruit_enabled = {true, true, true, true, true, true}
local arp_first_note = false
local halo_s = {}
local halo_l = {}
for i=1,W*H do halo_s[i]=0; halo_l[i]=0 end
local SCALE_NAMES = {"MAJ", "MIN", "PMA", "PMI", "DOR", "LYD", "CUS"}
local SCALE_MASKS = {
  {0,2,4,5,7,9,11}, {0,2,3,5,7,8,10}, {0,2,4,7,9}, {0,3,5,7,10}, {0,2,3,5,7,9,10}, {0,2,4,6,7,9,11}
}
local scale_mode = 3
local root_note = 0
local custom_scale = {true,false,true,false,true,false,false,true,false,true,false,false}
local SCALE = {0,2,4,7,9,0,0,0,0,0,0,0}
local SCALE_LEN = 5
local BASE = 24
local oct_base = 1
local oct_range = 2
local KB_MAP = { [7] = {[1]=0, [2]=2, [3]=4, [4]=5, [5]=7, [6]=9, [7]=11}, [6] = {[2]=1, [3]=3, [5]=6, [6]=8, [7]=10} }
local function generate_scale()
  SCALE_LEN = 0
  if scale_mode == 7 then
    for i=0,11 do
      if custom_scale[i+1] then SCALE_LEN=SCALE_LEN+1; SCALE[SCALE_LEN]=i end
    end
    if SCALE_LEN == 0 then SCALE_LEN=1; SCALE[1]=0; custom_scale[1]=true end
  else
    local mask = SCALE_MASKS[scale_mode]
    for i=1,#mask do
      SCALE_LEN = SCALE_LEN + 1
      SCALE[SCALE_LEN] = mask[i] + root_note
    end
  end
end
generate_scale()
local SNAKE_MAX = W * H
local SNAKE_X = {}
local SNAKE_Y = {}
for i=1,SNAKE_MAX do SNAKE_X[i]=0; SNAKE_Y[i]=0 end
local snake_head = 1
local snake_len = 0
local snk_len = 4
local function snk(i)
  local k = (snake_head+i-2)%SNAKE_MAX+1
  return SNAKE_X[k], SNAKE_Y[k]
end
local dir = {x=1,y=0}
local queued = {x=1,y=0}
local death_phase = 0
local death_col = 1
local seq_i = 1
local beat_count = 0
local on_note = nil
local eat_note = nil
local on_chord = false
local chord_hold_ticks = 0
local chord_notes = {0,0,0}
local alt_held = false
local menu_sticky = false
local last_alt_tap = 0
local master_bright = 12
local alt_disp_timer = 0
local alt_disp_mode = "BPM"
local mono_mode = 0
local MONO_TINTS = {
  {r=0.14,g=1.0,b=0.79},{r=1.0,g=0.20,b=0.90},
  {r=0.80,g=0.80,b=0.80},{r=1.0,g=0.63,b=0.08},
  {r=1.0,g=1.0,b=1.0}
}
local fruits = {}
local m_game, m_death
local BFS_SZ = W * H
local BFS_S = {}
local BFS_Q = {}
local BFS_T = {}
for i=1,BFS_SZ do BFS_S[i]=0; BFS_Q[i]=0; BFS_T[i]=false end
local DIR_DX = {1, -1, 0, 0}
local DIR_DY = {0, 0, 1, -1}
local function bfs_run(use_tgt_flags, tx, ty)
  if snake_len == 0 then return 0 end
  local sx, sy = snk(1)
  for i=1,BFS_SZ do BFS_S[i]=0 end
  for i=1,snake_len-1 do
    local ix, iy = snk(i)
    BFS_S[(iy-1)*W+ix] = 5
  end
  BFS_S[(sy-1)*W+sx] = 5
  local qi, qe = 1, 0
  for d=1,4 do
    local nx = wrap(sx+DIR_DX[d],1,W)
    local ny = wrap(sy+DIR_DY[d],1,H)
    local k = (ny-1)*W+nx
    if BFS_S[k] == 0 then BFS_S[k]=d; qe=qe+1; BFS_Q[qe]=k end
  end
  local tk = (ty-1)*W+tx
  while qi <= qe do
    local ck = BFS_Q[qi]; qi=qi+1
    if use_tgt_flags then
      if BFS_T[ck] then return BFS_S[ck] end
    else
      if ck == tk then return BFS_S[ck] end
    end
    local cx = ((ck-1)%W)+1
    local cy = math.floor((ck-1)/W)+1
    local fd = BFS_S[ck]
    for d=1,4 do
      local nx = wrap(cx+DIR_DX[d],1,W)
      local ny = wrap(cy+DIR_DY[d],1,H)
      local k = (ny-1)*W+nx
      if BFS_S[k] == 0 then BFS_S[k]=fd; qe=qe+1; BFS_Q[qe]=k end
    end
  end
  return 0
end
local function spx(x,y,r,g,b)
  if x<1 or x>W or y<1 or y>H then return end
  if mono_mode > 0 then
    local lum = r*0.299 + g*0.587 + b*0.114
    local t = MONO_TINTS[mono_mode]
    r,g,b = math.floor(lum*t.r), math.floor(lum*t.g), math.floor(lum*t.b)
  end
  if grid_led_rgb then grid_led_rgb(x,y,r,g,b)
  else grid_led(x,y,math.floor(math.max(r,g,b)/17)) end
end
local function clr() grid_led_all(0) end
local function degree_note(deg, oct)
  local _d = ((deg-1)%SCALE_LEN)+1
  local deg_oct = math.floor((deg-1)/SCALE_LEN)
  local note = BASE + oct_base*12 + SCALE[_d] + math.min(oct+deg_oct, oct_range-1)*12
  return math.max(24,math.min(108,note))
end
local function note_for(x,y)
  local oct = math.floor((H-y)/4) + math.floor((x-1)/SCALE_LEN)%2
  return degree_note(x, oct)
end
local FONT={["0"]=0x75557,["1"]=0x22222,["2"]=0x71747,["3"]=0x71717,["4"]=0x55711,["5"]=0x74717,["6"]=0x74757,["7"]=0x71111,["8"]=0x75757,["9"]=0x75711,["A"]=0x75755,["C"]=0x74447,["D"]=0x65556,["E"]=0x74747,["H"]=0x55755,["I"]=0x72227,["J"]=0x71153,["L"]=0x44447,["M"]=0x57555,["N"]=0x75555,["O"]=0x75557,["P"]=0x75744,["R"]=0x75765,["S"]=0x74717,["T"]=0x72222,["U"]=0x55557,["W"]=0x55575,["X"]=0x55255,["Y"]=0x55222}
local FDIV = {65536, 4096, 256, 16, 1}
local BDIV = {4, 2, 1}
local function draw_char(x,y,char,r,g,b,bm)
  local f = FONT[tostring(char)]
  if not f then return end
  bm = bm or 1.0
  for row=1,5 do
    local bits = math.floor(f / FDIV[row]) % 16
    for col=1,3 do
      if math.floor(bits / BDIV[col]) % 2 ~= 0 then
        spx(x+col-1, y+row-1, math.floor(r*bm), math.floor(g*bm), math.floor(b*bm))
      end
    end
  end
end
local function draw_label(x,y,str,r,g,b,hl_idx)
  for i=1,#str do
    draw_char(x+(i-1)*3, y, str:sub(i,i), r, g, b, (i==hl_idx) and 0.2 or 1.0)
  end
end
local function draw_scene_raw()
  for hkey=1,128 do
    if halo_l[hkey] > 0 then
      local hx = ((hkey-1)%W)+1
      local hy = math.floor((hkey-1)/W)+1
      if halo_s[hkey] == 1 then
        spx(hx-1,hy,10,40,50); spx(hx+1,hy,10,40,50)
        spx(hx,hy-1,10,40,50); spx(hx,hy+1,10,40,50)
      elseif halo_s[hkey] == 2 then
        spx(hx,hy,20,80,100)
      end
      spx(hx,hy,5,20,25)
    end
  end
  if auto_has_target then spx(auto_target.x, auto_target.y, 200, 100, 15) end
  for i=1,#fruits do
    local f=fruits[i]; local c=FRUIT_COL[f.kind]
    spx(f.x, f.y, c.r, c.g, c.b)
  end
  spx(ALT_X, ALT_Y, alt_held and 232 or 50, alt_held and 112 or 18, alt_held and 18 or 5)
  spx(PANIC_X, PANIC_Y, 80, 10, 10)
  for i=1,#DPAD do local a=DPAD[i]; spx(a.x,a.y,12,12,28) end
  local n = snake_len
  for i=n,2,-1 do
    local sx, sy = snk(i)
    local bright = math.max(34, math.floor((1 - i/n)*187)+34)
    spx(sx, sy, math.floor(bright*0.18), bright, 0)
  end
  if n > 0 then local hx,hy=snk(1); spx(hx, hy, 95, 210, 28) end
end
local function draw_game()
  clr()
  draw_scene_raw()
  grid_refresh()
end
local function draw_alt()
  clr()
  for x=1,8 do
    if x*2<=num_fruits then spx(x,1,20,140,110) else spx(x,1,5,30,25) end
  end
  for x=11,16 do
    local f_idx = x-10
    local c = FRUIT_COL[f_idx]
    if fruit_enabled[f_idx] then spx(x,1,c.r,c.g,c.b)
    else spx(x,1,math.floor(c.r*0.1),math.floor(c.g*0.1),math.floor(c.b*0.1)) end
  end
  for x=1,8 do
    if x <= accent_div_idx then spx(x,2,200,80,160) else spx(x,2,40,10,35) end
  end
  for x=9,16 do
    if (x-8)<=arp_pool_max then spx(x,2,100,100,255) else spx(x,2,20,20,50) end
  end
  spx(10,3,180,20,10); spx(11,3,200,80,20); spx(12,3,20,200,80); spx(13,3,10,180,20)
  if auto_mode == 0 then spx(1,3,30,8,4)
  elseif auto_mode == 1 then spx(1,3,130,75,10)
  else spx(1,3,20,240,50) end
  spx(3,3,240,150,20)
  if arp_enabled then spx(5,3,20,220,80) else spx(5,3,60,20,20) end
  if humanize_level > 0 then spx(7,3,math.floor(humanize_level*5),math.floor(humanize_level*50),math.floor(humanize_level*55)) else spx(7,3,10,40,45) end
  local b_r = math.floor(master_bright*17)
  spx(15,3,b_r,b_r,b_r)
  if mono_mode > 0 then
    local t = MONO_TINTS[mono_mode]
    spx(16,3,math.floor(t.r*200),math.floor(t.g*200),math.floor(t.b*200))
  else spx(16,3,30,30,30) end
  for y_kb=6,7 do
    for x_kb=1,7 do
      local note = KB_MAP[y_kb][x_kb]
      if note then
        local is_root, is_active = false, false
        if scale_mode == 7 then
          is_active = custom_scale[note+1]
        else
          is_root = (note == root_note)
          for i=1,SCALE_LEN do if (SCALE[i] % 12) == note then is_active = true break end end
        end
        if is_root then spx(x_kb, y_kb, 20, 100, 255)
        elseif is_active then spx(x_kb, y_kb, 200, 200, 200)
        else spx(x_kb, y_kb, 15, 15, 15) end
      end
    end
  end
  for x_sc=1,7 do
    if scale_mode == x_sc then spx(x_sc, 4, 255, 255, 255)
    else spx(x_sc, 4, 40, 40, 40) end
  end
  if alt_disp_timer > 0 and alt_disp_mode == "ARP" then
    local label = arp_labels[arp_mode]
    if label == "UP" then label = " UP" end
    draw_label(8, 4, label, 200, 150, 10, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "APE" then
    draw_label(8, 4, "ARP", arp_enabled and 20 or 60, arp_enabled and 220 or 20, arp_enabled and 80 or 20, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "HUM" then
    draw_label(8, 4, string.format("HU%d", humanize_level), 20, 180, 200, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "PAM" then
    draw_char(8, 4, "P", 20, 80, 220, 1.0)
    draw_char(11, 4, "A", 20, 140, 110, 1.0)
    draw_char(14, 4, "M", 20, 140, 110, 1.0)
  elseif alt_disp_timer > 0 and alt_disp_mode == "PMX" then
    draw_char(8, 4, "P", 20, 80, 220, 1.0)
    draw_char(11, 4, "M", 100, 100, 255, 1.0)
    draw_char(14, 4, "X", 100, 100, 255, 1.0)
  elseif alt_disp_timer > 0 and alt_disp_mode == "ACC" then
    local ad = ACCENT_DIVS[accent_div_idx]
    if ad == 0 then draw_label(8, 4, "AC0", 200, 80, 160, 2)
    else draw_label(8, 4, string.format("A%02d", ad), 200, 80, 160, 2) end
  elseif alt_disp_timer > 0 and alt_disp_mode == "AUTO" then
    draw_label(8, 4, auto_labels[auto_mode + 1], 20, 200, 60, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "SCA" then
    draw_label(8, 4, SCALE_NAMES[scale_mode], 100, 255, 100, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "OCT" then
    draw_label(8, 4, string.format("OC%d", oct_base), 80, 200, 255, 2)
  elseif alt_disp_timer > 0 and alt_disp_mode == "RAN" then
    draw_label(8, 4, string.format("RA%d", oct_range), 80, 160, 255, 2)
  else
    local s_bpm = string.format("%03d", bpm)
    draw_label(8, 4, s_bpm, 180, 120, 20, 2)
  end
  spx(3, 8, 20, 180, 60)
  spx(4, 8, 20, 80, 220)
  spx(PANIC_X, PANIC_Y, 220, 20, 20)
  spx(ALT_X, ALT_Y, 232, 112, 18)
  grid_refresh()
end
local function is_dpad(x,y)
  for i=1,#DPAD do if DPAD[i].x==x and DPAD[i].y==y then return true end end
  return false
end
local function occupied(x,y)
  for i=1,snake_len do
    local sx,sy = snk(i); if sx==x and sy==y then return true end
  end
  for i=1,#fruits do
    local f = fruits[i]; if f.x==x and f.y==y then return true end
  end
  return (x==ALT_X and y==ALT_Y) or (x==PANIC_X and y==PANIC_Y) or is_dpad(x,y)
end
local function reposition_fruit(f)
  f.x, f.y = -1, -1
  for _=1,100 do
    local x, y = math.random(W), math.random(H)
    if not occupied(x,y) then
      local wt = 0; for i=1,#FRUIT_W do if fruit_enabled[i] then wt=wt+FRUIT_W[i] end end
      if wt == 0 then fruit_enabled[1]=true; wt=FRUIT_W[1] end
      local roll, acc, k = math.random(wt), 0, #FRUIT_W
      for i=1,#FRUIT_W do
        if fruit_enabled[i] then
          acc = acc + FRUIT_W[i]
          if roll <= acc then k=i; break end
        end
      end
      f.x, f.y, f.kind = x, y, k
      return
    end
  end
end
local function spawn_fruit()
  if #fruits >= num_fruits then return end
  local f = {x=-1, y=-1, kind=0}
  table.insert(fruits, f)
  reposition_fruit(f)
end
local function reset_snake()
  snake_head, snake_len = 1, 4
  for i=1,4 do
    local k = (snake_head+i-2)%SNAKE_MAX+1
    SNAKE_X[k]=10-i; SNAKE_Y[k]=4
  end
  dir.x, dir.y, queued.x, queued.y = 1,0,1,0
  snk_len, auto_has_target = 4, false
end
local function death_tick()
  if on_note then midi_note_off(on_note); on_note=nil end
  local note
  if arp_pool_len > 0 then
    note = arp_pool[math.random(arp_pool_len)].note
  else
    note = math.max(36, math.min(96, 84 - death_col*2 + math.random(0,12) - 6))
  end
  midi_note_on(note, math.random(15, 65)); on_note = note
  clr()
  for y=1,H do spx(death_col,y,210,90,20) end
  grid_refresh()
  death_col = death_col + 1
  if death_col > W then
    if on_note then midi_note_off(on_note); on_note=nil end
    arp_pool_len = 0
    arp_first_note = false
    for hk=1,W*H do halo_s[hk]=0; halo_l[hk]=0 end
    for ei=1,ECHO_MAX do
      if ECHO_BUF[ei].active then midi_note_off(ECHO_BUF[ei].note) end
      ECHO_BUF[ei].active=false
    end
    reset_snake()
    for fi=#fruits,1,-1 do fruits[fi]=nil end
    while #fruits < num_fruits do spawn_fruit() end
    death_phase, death_col = 0, 1
    draw_game()
  end
end
local function arp_add(note, x, y, kind)
  if arp_pool_len >= arp_pool_max then
    local old = arp_pool[1]
    for i=2,arp_pool_max do arp_pool[i-1] = arp_pool[i] end
    arp_pool[arp_pool_max] = old
    arp_pool_len = arp_pool_max
  else
    arp_pool_len = arp_pool_len + 1
  end
  local target = arp_pool[arp_pool_len]
  target.note, target.x, target.y, target.kind = note, x, y, kind
  target.prob = (kind == 5) and 0.33 or 1.0
  arp_first_note = true
end
local function seq_tick()
  if on_note then
    if humanize_hold then humanize_hold = false
    else midi_note_off(on_note); on_note = nil end
  end
  if on_chord then
    chord_hold_ticks = chord_hold_ticks - 1
    if chord_hold_ticks <= 0 then
      for i=1,3 do midi_note_off(chord_notes[i]) end
      on_chord = false
    end
  end
  if not arp_enabled then return end
  if arp_pool_len == 0 then return end
  if arp_first_note then arp_first_note = false end
  local n = arp_pool_len
  for i=1,n do arp_pool[i].note = note_for(arp_pool[i].x, arp_pool[i].y) end
  local triggered_note_obj = nil
  if arp_mode == 3 or arp_mode == 4 then
    for i=1,n do SORT_BUF[i].note = arp_pool[i].note; SORT_BUF[i].kind = arp_pool[i].kind; SORT_BUF[i].prob = arp_pool[i].prob end
    for i=2,n do
      local key_n = SORT_BUF[i].note; local key_k = SORT_BUF[i].kind; local key_p = SORT_BUF[i].prob; local j = i-1
      if arp_mode == 3 then
        while j>=1 and SORT_BUF[j].note>key_n do
          SORT_BUF[j+1].note=SORT_BUF[j].note; SORT_BUF[j+1].kind=SORT_BUF[j].kind; SORT_BUF[j+1].prob=SORT_BUF[j].prob; j=j-1
        end
      else
        while j>=1 and SORT_BUF[j].note<key_n do
          SORT_BUF[j+1].note=SORT_BUF[j].note; SORT_BUF[j+1].kind=SORT_BUF[j].kind; SORT_BUF[j+1].prob=SORT_BUF[j].prob; j=j-1
        end
      end
      SORT_BUF[j+1].note = key_n; SORT_BUF[j+1].kind = key_k; SORT_BUF[j+1].prob = key_p
    end
    seq_i = (seq_i%n)+1
    triggered_note_obj = SORT_BUF[seq_i]
  elseif arp_mode == 2 then
    seq_i = math.random(n)
    triggered_note_obj = arp_pool[seq_i]
  else
    seq_i = (seq_i%n)+1
    triggered_note_obj = arp_pool[seq_i]
  end
  if triggered_note_obj == nil then return end
  if triggered_note_obj.prob < 1.0 and math.random() > triggered_note_obj.prob then return end
  beat_count = beat_count + 1
  local vel
  local ad = ACCENT_DIVS[accent_div_idx]
  if ad == 0 then vel = 90
  elseif beat_count % ad == 1 then vel = 127
  else vel = 80
  end
  if humanize_level > 0 then
    local spread = humanize_level * 6
    local hold_thresh = humanize_level * 15 + 10
    vel = math.max(1, math.min(127, vel + math.random(0, spread*2) - spread))
    humanize_hold = (math.random(100) <= hold_thresh)
  end
  midi_note_on(triggered_note_obj.note, vel); on_note = triggered_note_obj.note
end
local need_interval_update = false
local fast_tick = 0
local function game_tick()
  if alt_held then return end
  fast_tick = fast_tick + 1
  for i=  @xe          忊e�MJEI  @      �R��A�`x��a|o���{=;��PO$�%��<����]|TK{�
�� �.��Dz�B%*W���e����z��������T��P��`�q/?��:ҵ��#�·*��C��BVz�t0�����F����A���' �����_�I��2{,N�0���udՠQ��l�Tb�;�ןEM���� }ǡ_���t�I��}���>!�g��'�:wo���͂������,AL���=4��PFr��m��R�k k} �J�Z��� ��r�h~�x0���7��yB��K�i�m=�����o���TUA�n C=�0�*��1���}��#$o3u��A�� ���me�� ;�}@nw��n��%P>��o��oE�ד�@J�^���ǝ�(�t��(a�Ɯ�Z�k\L��d�|�$���B�>&(�RUe�ϳ�W�$�:�{ y��n��dN��@�vt�V&��`P��
�T�r�@�wZ�iDߐ��*�MII�+�!A[����\���iq?0�n)�H��#YT����	h���6����`��%�}�3A���L�Ov"6�]�wX����2���U0�5��z ��6ǯO��gf�%�2���W	��_o�P�V�$���@����4�����
�|Q`#	0�vP����9{@n�����������jǴ�= �)�s) '~R��Ϸ�h�$Z���q��!B�u�oS���k�s�6%�<���k������$`��s��B�f���5��-�o�t�Þ�6����M$^&�,(;�0A���������yB�L/8��B�+{��G,w�,kQ���d��d��$Z�͸�jO��=��8ED���{2Z��I@i�2�m�H�!d��"��[8�E��L���wf��yh���0"�~y/$���a�cq�������g��.-�
L�:Y���߭���C S���X_D2W���9�0����cy������
��H�H�*1r��J?܅��?�P@݃E�vLS?Ygngʾ~��#uDU4�!��(?ܣo�   2.�E;���	V�   (9                                                          2�*¾ź:���   ��   0��`��B��P��   �I��9                                                          0C#�\���)���   ��;   /9Ix�;�C@�}�   �u�9                                                          /h��nx�~&a��   u�Z   .�x�w��oUNf�   7�d9                                                          .$e\��h��]�   %�v�   3���ͯA��(��   ��9                                                          3�mIʮ� ��M�   h(�E   1ub][;�>Ǒs��   �Q�9                                                          1 ]�E��ŀ-��   �=   >���A!o�   ��R�9                                                          >r�\�ht�Ù��   �ئ   6$�Ј�e�äy��   "��9                                                          6����-�]�H�   �"��	  ����������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������K��\	  ����������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������6M& )                     8            k�bq  � �      zr0� ��  8�   �  �      �     �       � p�     p�      H�N�g�� �[(                              M�>����C     �z p    �  �  l }     H�  �c�IE5��w�>         +����~i��, 0@PPT          Ȼ                          p�                                      �  ��  ؽ  ��  �  8�  X�  x�  ��  ��  ؾ  ��  �  8�  X�  x�  ��  ��  ؿ  ��  �  8�  X�  x�  ��  ��  ��                  ��                  ��  ��  0
 ��  h�  p�  ��  ��  ��  ��  h�  ��  ��  ��  ��  p�  h�  ��  ��  �  X�  x�  �  ��  ��  ��  ��  �  ��  (�  ��   �   �  ��  ��  �  ��  ��   
 h�  P�  x�  @�  X�  ��  ��  �& X�  ��  h�  ��  ��  ��  ��  ��  ��  ��   �  `�  0�  �� x �  (�  p�  ��  H�  �  8�  ��  h�  ��  �  `�  �  (�  X�  ��  ��  ��  ��   �  (�  x�  H�  p�  ��  ؽ  ��  ��  ��  P�  ��  (�  �	 0�  ��  ��  H�  ��  ��  �  ��  x�  ��  8�          t�0m�o�)    � p� �     8�      F1n����m   i   ��  ~���ED      � � ��      1�    �| 9{  ��     FD    Hd �        D+�    �� �  �W!   ��  ?        X�      ϢLY    �  
 D�                                @� ��      �  �Z         x�     1    �   ��2�    print('__webdiii_begin:11') A          D_b    ��  9{          D1������  9{  �  �  @      ��         )   �   ��d�h� print(device_id())    0�  `�    (   x�   $��1    __webdiii_begin:11 �9          D/�    0�              D�    �       �>�   Q      ��  D F    h�  ���  0�  !   ��  ?        ��       �xY   ��  
 �/�                                ��  �      @�  P�         ��  �s�   � �         �      �  ��      �  !   ��   �a�    _LOADED     !   H�            �     �  !   ��   �&R    stdout      !   ��  H     0�  dE  	    !   ��   f��;x�  stderr  ��  !   ��   s+��    utf8    ��  !   �            �      ��  !   H�   ^q��    help {  ED  !   H�   �[�G    dostring �  !   h�   �zc�    midi_tx @�  !   ��   	�Y��    metro_set           �     !   �   _^�    math    ��  !   ؼ           ��      @�  !   ��   ����H�  ceil    (�     �   �>�N    cos    8�   A.�N    deg    P�   �J�N��  exp !   h�   	,�`�    tointeger                )        1x�    not enough memory �!   ��   �H��    __index ���!   ؽ   
T��(    __newindex X!   ��   %�J�    __gc )���f"!   �   j�/S    __mode �%T�!   8�   pR    __len ݪL���!   X�   x���    __eq �s�0C!   x�   cjF�    __add ���G!   ��   �3�\    __sub ��^��!   ��   ��R    __mul ����0!   ؾ   #�    __mod �����!   ��   ~.�W��  __pow ��F�!   �   ۴y�    __div [}�>F�!   8�   W*�b    __idiv o�T8!   X�   R�o�    __band �#!!   x�   _�W    __bor 5e's�	!   ��   [L%    __bxor ��v !   ��   ��RR�  __shl �&��[�!   ؿ   ͲSR    __shr W4�!   ��   F��]    __unm ����pg!   �   ;MR    __bnot ��9�!   8�   Q��    __lt ��j�� 	!   X�   ����    __le &�G�J!   x�   � 
�    __concat ��a!   ��   ��W�    __call ����!   ��   �HO^    __close ��1�!   ��   �T�    _ENV �.@q�E   ��  ~z�N�  and !   �  �X�]    break �����   0�  �"��0�  do W!   P�  �v��h�  else _=�i!   h�  �I^h�  elseif |�K�   ��  zz�N    end !   ��  S<n��  false ������   ��  ]S�N    for !   ��  	|TUQ    function �co!   ��  
%���    goto A���S�   �  r"��    if �   8�  t#��    in y!   P�  ؟VR    local ^o*��1   h�  ���N�U nil    ��  |:�N��  not    ��  �"��p�  or �!   ��  �8�b    repeat ��Q�!   ��  Rg�C    return ���^�!   ��  w��    then �m� �vs!   �  �⭅    true ��m<ƛ�!   0�  mJQR��  until �^��!   P�  ��B� [ while �5;hq�!   ��   ���    _PRELOAD    !   ��               ��  !   �   p��    _G  ��    )   �g��2��  9{  ��  9{  �,m�9{  EH!   h�           ��      0�  !   ��           ��      ��     �   ���,D   L�)   @� �� 8�  `�  ��               !   ��   �d�v    assert x>4!   ��   ��S    dofile \    )   ��   k�)L    collectgarbage A��fG!   ��   �O]    error �\�]!   ��   n�T~    ipairs  �X!    �   ���:] loadfile DAj!   @�   ��]�    load    ��  !   `�   �"��    next ��\    )    �   ��    getmetatable ��P�X!   ��   2��]    pairs   `�  !   ��   � �R    pcall �\Y_!   ��   �o�W    print dD��!   �   �"��`�  warn    ��  !   (�   �iyQ�R rawequal W!   H�   ��>    rawlen D��!   H�   T��b��  select ��U)   ��   ��    setmetatable    ��  !   ��   �}W>��  tonumber V!   ��   �[�G    tostring D��!   ��    ���    type    @�  !   �   6�W�    xpcall \�W!   0�   �)�    _VERSION D{�!   P�   >��0Y Lua 5.5 (�  !   ��   	U����  coroutine   !   p�   9ܵ    package D�j!   ��   �ہ��  _CLIBS  h�  !       H         8�  ��     ��   ���,�   ��!   h�   ��9C    rawget ��P�!   (�   �/Ch�  rawset X �X�!   p�   x-B�    table   �  !   h�           ��      ��  �   ��  �(  ��   �D    ��  9{  ��   �D    `�  9{  ��   �D     x�  9{  ��   �D      ��  9{  ��   �D  ������  9{  )�   �D    ��  9{  ��   �D      ��  9{  ��   �D    x�  9{  ��  !   ��   J0�b    concat \�U!   x�   �k�v    insert Da�!   ��   �魅    move     �  !   ��   �U�    sort {  ��  �   x�  p*     �D   �  9{  y   �D   ��  9{  ��  ���\     D��       �D    ��  9{  ��  ���\     D�����H�     �DD    (�  9{  Q   �D    ��  9{  �   �D    ��  9{  H�  !   (�   �ZC    offset  5V!   ��   	�E�ph codepoint �!   ��   �^]    codes   ��  !   �   H�Pt    charpattern 1   (�   ls�_    [ -�-�][�-�]*  ؼ  9{  0   !   ��   �R    stdin �0�  !   ��  H     0�  �D  	EDP�)   x�   
>��k    _IO_output  ���\(   !   �3���\D��    �  �����Z"!   8�           (�      ��  �   (�  ����  ���\DD�   (�  9{  ��  ���\ED�,    ��  ���i6���\D.$������  ����5���\D0p    �  �����  ��ED    0�  ���X�  9{  TD�o    P�  ����  9{  TD{�����p�  ����  ��ED    ��  ������!    �   z*R��  loadlib �N�{!   ��   
�N�    searchpath r!   �   �0@L��  preload Tf��!   0�   �w�@�  cpath �^o�!   P�   b^�    path ��{u�!   p�   	���    searchers ��!   ��   �wp    loaded 7�2��!   ��      �      ��  )   ��  9{  h�  9{  @�  9{  �  9{  ffff)   ��  &��  U4 �  9{  E_�b����A)   �  &�  �9 �  9{  E_�:�x а�F})   @�  &h@�  18 �  9{  EPY�ϱQ�Q���)   h�  &�h�  �8 �  9{  E�|rf��sg�!   H�   �)P�H�  require _5_5!   ��           ��      (�               !   X�   
H썔    /
;
?
!
-
 J!   �   ▤H    config  ��)   (�  &}�  �1 �  9{  E@]�&±
Z�A!   X�   ���    debug    �      �   �"��    io  �   ��  E����9{  DF    ��  9{  }�9{  DZ    X�  9{  �9{  D�O   8�  9{  =�9{  D��    ��  9{  y�9{  DX    ��  9{  -�9{  D�������  9{  %�9{  D��    �  9{  Q�9{  Db�����x�  9{  ��G!   ��   �WP��  