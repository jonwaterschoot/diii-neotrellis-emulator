-- scriptname: Sandman
-- v0.1.0
-- @author: jonwaterschoot
-- https://llllllll.co/t/sandman
--
-- A living portrait: falling sand, leaves and water that become music.
-- Rotate device 90 degrees CCW (power cable at top). Portrait: 8 wide x 16 tall.
--
-- @key Tab: Seq Settings
-- @key Space: Scale Settings

-- ---------------------------------------------------------------------------
-- @section Global Controls
-- These controls are persistent across all three screens (x and y refer to landscape hardware coordinates).
-- @group Persistent Controls
-- x=14, y=1: ALT — cycle through Live, Sequence, and Scale screens.
-- x=13, y=1: Play/Stop — Toggle sequencer running state.
-- x=12, y=1: Lock (Dissolve State) — Toggle particle dissolve rate (Off/Half/Normal).
-- ---------------------------------------------------------------------------
-- @section Portrait Live Grid
-- @screen live
-- @group Reservoir
-- x=16, y=1..8: Reservoir row — pending grains.
-- @group Drop Zone
-- x=15, y=3..6: Drop slots — tap to release one grain; hold to stream.
-- @group Play Grid
-- x=1..14, y=1..8: Falling sand, leaves, and water interacting physically.
-- ---------------------------------------------------------------------------
-- @section Sequence Settings
-- @screen seq
-- @group Sequence Toggles
-- x=10, y=1..5: Select Sequence Option: Length, Division, Mute Notes, Track On/Off, and MIDI Channel.
-- @group Sequence Views
-- x=1..8, y=1..8: 4 Sequences, each 2x8 (16 steps). Tapping modifies based on chosen toggle above.
-- ---------------------------------------------------------------------------
-- @section Scale Settings
-- @screen scale
-- @group Scale
-- x=11, y=1..6: Scale mode MAJ/MIN/PMA/PMI/DOR/LYD
-- x=9, y=1..7: Black keys root note
-- x=8, y=1..7: White keys root note
-- @group Playback
-- x=6, y=1..4: BPM adjust (-10, -1, +1, +10)
-- x=5, y=1..4: Octave base (oct2..oct5)
-- x=4, y=1..3: Humanizer off/on/extreme (randomizes timing and velocity)
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- COMPATIBILITY STUBS
-- ===========================================================================
local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen    then grid_set_screen    = function(_) end end
if not display_screen     then display_screen     = function(_) end end
if not get_focused_screen then get_focused_screen = function() return "live" end end
if not get_time           then get_time           = function() return 0 end end

-- ===========================================================================
-- PORTRAIT COORDINATE SYSTEM
-- Hardware 16x8 landscape -> Portrait 8x16 (CCW 90 degrees, power cable top)
-- hw(pc,pr) -> hx=17-pr, hy=pc
-- pt(hx,hy) -> pc=hy, pr=17-hx
-- Verified: hardware(16,1) = portrait top-left (1,1)
-- ===========================================================================
local W, H   = 16, 8
local PW, PH = 8, 16

local function hw(pc, pr) return 17 - pr, pc end
local function pt(hx, hy) return hy, 17 - hx end

-- ===========================================================================
-- COLORS — per type (1=sand,2=leaf,3=water), per sub-tone (1=A,2=B)
-- ===========================================================================
local COLR = {
  { -- 1: sand
    {r=255,g=240,b=50},  -- Y (Yellow/Amber)
    {r=255,g=100,b=20},  -- O (Orange)
    {r=80, g=40, b=20},  -- S (Skin Brown) -- Swapped S to brown
    {r=255,g=180,b=180}, -- D (Pink Eyes)   -- Swapped D to pink
    {r=255,g=170,b=220}, -- P (Light Pink)
  },
  { -- 2: leaf
    {r=100,g=255,b=120}, -- G (Light Green)
    {r=110,g=185,b=30},
  },
  { -- 3: water
    {r=120,g=220,b=255}, -- B (Light Blue)
    {r=30,g=165,b=150},
  }
}

-- ===========================================================================
-- GRID STATE — flat pre-allocated arrays [1..(PW*PH)]
-- ===========================================================================
local GTYPE  = {}  -- 0=empty 1=sand 2=leaf 3=water
local function idx(pc, pr) return (pr - 1) * 8 + pc end

local GSUB   = {}  -- 1 or 2 (color sub-tone)
local GDIM   = {}  -- 1-15 brightness; decays to 0 -> cell cleared
local GMINE  = {}  -- tap counter for mining 0-3
local GMOVED = {}  -- dirty flag, reset each physics tick
local GSIL   = {}  -- silent step (sequencer)
local GSTAB  = {}  -- water stability counter 0-15; at max, cell settles
local P_R, P_G, P_B = {}, {}, {} -- Color buffer for differential drawing

-- Global Physics Constants
local PHYS_HZ  = 10     -- ticks per second (Stable Baseline)
local PHYS_INT = 1.0 / PHYS_HZ
local WATER_STAB_MAX = 10
local WATER_MOVE_DIV = 1
local phys_ticker    = 0

for i = 1, PW * PH do
  GTYPE[i]=0; GSUB[i]=1; GDIM[i]=15; GMINE[i]=0; GMOVED[i]=false; GSIL[i]=false; GSTAB[i]=0
  P_R[i]=-1; P_G[i]=-1; P_B[i]=-1 -- force first draw
end

-- ===========================================================================
-- INITIAL PIXEL ART (8x16)
-- . = empty; 1 = sand sub-tone 1 (amber); 2 = sand sub-tone 2 (orange)
-- ===========================================================================
local INITIAL_IMG = "PPGPYBBP..PGPB..P.......G..YYY..D.YYSS....YDSD...YYSSS..YYOOOOO.Y.OOOOO...SOOOS...SOOOS...SGGGS..S.G.GS....G.G.....G.G.....G.G.."

local phys_active  = false
local is_dirty     = true
local eye_idxs     = {}

-- Blink animation state (declared here so draw_live captures as upvalue)
local blink_t      = 0
local blink_closed = false    -- true during the brief "eyes shut" window
local T_OPEN  = 25            -- ticks open   (~7 s at 10 Hz)
local T_BLINK =  3            -- ticks closed (~0.3 s)

local function init_pixels()
  eye_idxs = {}
  -- Wipe all grid state
  for i = 1, 128 do
    GTYPE[i]=0; GSUB[i]=1; GDIM[i]=15; GMINE[i]=0; GMOVED[i]=false; GSIL[i]=false; GSTAB[i]=0
  end
  local map = { P={1,5}, G={2,1}, Y={1,1}, B={3,1}, S={1,3}, O={1,2}, D={1,4} }
  for i = 1, 128 do
    local char = INITIAL_IMG:sub(i,i)
    local entry = map[char]
    if entry then
      GTYPE[i], GSUB[i] = entry[1], entry[2]
      if char == "D" then
        local r, c = math.floor((i-1)/8)+1, ((i-1)%8)+1
        if not (c==1 and r>=3 and r<=5) then table.insert(eye_idxs, i) end
      end
    end
  end
end

-- ===========================================================================
-- RESERVOIR (portrait row 1, all 8 cols) + DROP ZONE (portrait row 2, cols 3-6)
-- ===========================================================================
local RES  = {}  -- [1..PW] {t,s}
local DROP = {}  -- [1..4]  {t,s}  (col 3-6 of portrait row 2)
for i = 1, PW do RES[i]  = {t=0, s=1} end
for i = 1, 4  do DROP[i] = {t=0, s=1} end

-- ===========================================================================
-- SCALE / MUSIC
-- ===========================================================================
local SNAMES = {"MAJ","MIN","PMA","PMI","DOR","LYD"}
local SMASKS = {
  {0,2,4,5,7,9,11}, {0,2,3,5,7,8,10}, {0,2,4,7,9},
  {0,3,5,7,10},     {0,2,3,5,7,9,10}, {0,2,4,6,7,9,11},
}
local SCALE     = {}
local SCALE_LEN = 7
local scale_mode= 1
local root_note = 0
local oct_base  = 3
local BASE      = 12

for i = 1, 12 do SCALE[i] = 0 end

local function gen_scale()
  local m = SMASKS[scale_mode]
  SCALE_LEN = #m
  for i = 1, SCALE_LEN do SCALE[i] = m[i] + root_note end
end
gen_scale()

-- White key roots: C D E F G A B (offsets 0..6 -> MIDI semitones)
local KB_WHITE = {0, 2, 4, 5, 7, 9, 11}
-- Black key roots: C# D# gap F# G# A# gap
local KB_BLACK = {1, 3,-1, 6, 8,10,-1}

--- Map portrait position to MIDI note.
-- @tparam number pc portrait column 1-8
-- @tparam number pr portrait row 9-16
-- @tparam number gt grain type (3=water gets +12)
local function grain_note(pc, pr, gt)
  local deg = ((pc - 1) % SCALE_LEN) + 1
  local eoct = math.floor((pc - 1) / SCALE_LEN)
  local rin  = pr - 9  -- 0..7
  local oct  = oct_base + math.floor(rin / 4) + eoct
  local sh   = (gt == 3) and 12 or 0
  return math.max(24, math.min(108, BASE + oct * 12 + SCALE[deg] + sh))
end

-- ===========================================================================
-- BPM / TIMING
-- ===========================================================================
local bpm = 120
local humanize_level = 0

local function seq_interval() return 60 / bpm / 4 end

-- ===========================================================================
-- SEQUENCER STATE
-- ===========================================================================
local seq_running = false
local beat_count  = 0
local seq_opt     = 1   -- Top half selected option for seq settings (1-4)

local tracks = {}
for i = 1, 4 do
  tracks[i] = {
    start_step = 1,
    end_step = 16,
    div = 4,         -- 1=1/1, 2=1/2, 3=1/4, 4=1/8, 5=1/16, 6=1/32
    step = 1,
    running = true,
    loop_input = 0,  -- 0=wait for start, 1=wait for end
    accum = 0.0,
    step_jitter = 0.0,
    dir_fwd = true,  -- track playback direction (for reverse playback)
    ch = 1           -- MIDI channel
  }
end

-- Division multipliers relative to 1 step per beat (1/4 note is 1 step per beat)
-- 1/1(1)=0.25, 1/2(2)=0.5, 1/4(3)=1.0, 1/8(4)=2.0, 1/16(5)=4.0, 1/32(6)=8.0
local div_mult = {0.25, 0.5, 1.0, 2.0, 4.0, 8.0}

--- Map 1..16 sequence steps to the portrait layout grid
local function track_step_pos(track, step)
  local pc = (step - 1) % 8 + 1
  local pr_start = 9 + (track - 1) * 2  -- 9, 11, 13, 15
  local pr = pr_start + math.floor((step - 1) / 8)
  return pc, pr
end

-- ===========================================================================
-- ACTIVE NOTE TRACKING
-- ===========================================================================
local MAX_ACT = 12
local ANS = {}   -- active note slots
for i = 1, MAX_ACT do ANS[i] = {note=0, active=false, ticks=0, ch=1} end

local ECHO = {}  -- sand echo buffer
for i = 1, 4 do ECHO[i] = {active=false, note=0, vel=0, ticks=0, ch=1} end

local function notes_off()
  for i = 1, MAX_ACT do
    if ANS[i].active then midi_note_off(ANS[i].note, ANS[i].ch); ANS[i].active=false end
  end
  for i = 1, 4 do
    if ECHO[i].active then midi_note_off(ECHO[i].note, ECHO[i].ch); ECHO[i].active=false end
  end
  if midi_panic then midi_panic() end
end

--- Play a note, tracking it in the first free slot (evicts oldest if full).
-- @tparam number note  MIDI note
-- @tparam number vel   velocity
-- @tparam number dur   ticks to hold
local function play_note(note, vel, dur, ch)
  ch = ch or 1
  local slot = 1
  for i = 1, MAX_ACT do
    if not ANS[i].active then slot = i; break end
  end
  if ANS[slot].active then midi_note_off(ANS[slot].note, ANS[slot].ch) end
  midi_note_on(note, vel, ch)
  ANS[slot].note=note; ANS[slot].active=true; ANS[slot].ticks=dur; ANS[slot].ch=ch
end

--- Queue a decaying echo for sand grains.
local function queue_echo(note, vel, ch)
  ch = ch or 1
  for i = 1, 4 do
    if not ECHO[i].active then
      ECHO[i].active=true
      ECHO[i].note=math.max(24, note - 7)
      ECHO[i].vel=math.floor(vel * 0.45)
      ECHO[i].ticks=2
      ECHO[i].ch=ch
      return
    end
  end
end

-- Per-type hold duration (seq ticks): sand=staccato, leaf=long, water=short
local TYPE_DUR = {1, 3, 1}

-- ===========================================================================
-- DIM DECAY
-- Per-type ticks between each dim-level drop.
-- dissolve_state: 0=off(locked) 1=half speed 2=normal speed
-- ===========================================================================
local DIM_RATES      = {30, 18, 50}  -- sand: slow, leaf: med, water: persists much longer
local dissolve_state = 0              -- 0=off 1=half 2=normal
local dim_ticker     = 0

-- ===========================================================================
-- STREAM MODE
-- ===========================================================================
local STREAM_MAX    = 16
local STREAM_TICKS  = 6    -- physics ticks held before streaming (~0.5s at 12.5fps)
local stream_on     = false
local stream_cnt    = 0
local stream_slot   = 0
local stream_type   = 0    -- grain type locked for the current stream
local stream_sub    = 1    -- sub-tone locked for the current stream
local key_held_slot = 0    -- drop slot currently pressed (0=none)
local key_held_ticks= 0    -- physics ticks since press (for hold detection)

-- ===========================================================================
-- CONTROL STATE
-- ===========================================================================
local cur_screen = "live"

-- Portrait positions of the three toggle buttons
local ALT_PC,ALTP_R  = 1, 3
local PLAY_PC,PLAYP_R= 1, 4
local LOCK_PC,LOCKP_R= 1, 5

-- Secondary Controls (Opposite column)
local RESET_PC,RESETP_R = 8, 3
local AUTO_PC,AUTOP_R   = 8, 4
local CLEAR_PC,CLEARP_R = 8, 5

-- ===========================================================================
-- PIXEL HELPER (portrait coordinates)
-- ===========================================================================
local function spx(pc, pr, r, g, b)
  if pc<1 or pc>8 or pr<1 or pr>16 then return end
  local i = (pr - 1) * 8 + pc
  -- Aggressive Optimization: Only send if color changed
  if P_R[i]==r and P_G[i]==g and P_B[i]==b then return end
  P_R[i], P_G[i], P_B[i] = r, g, b
  
  local hx, hy = hw(pc, pr)
  if grid_led_rgb then
    grid_led_rgb(hx, hy, r, g, b)
  else
    local lv = math.floor(math.max(r,g,b)/17)
    if lv<4 and (r>0 or g>0 or b>0) then lv=4 end
    grid_led(hx, hy, lv)
  end
end

local function rand_type()
  local r = math.random(100)
  if r <= 50 then return 1, math.random(2)
  elseif r <= 70 then return 2, math.random(2)
  else return 3, math.random(2) end
end

-- ===========================================================================
-- UI & RESERVOIR (Non-hot path)
-- ===========================================================================
local function fill_res(i)
  local t,s = rand_type(); RES[i].t=t; RES[i].s=s
end

local function init_reservoir()
  for i=1,PW do fill_res(i) end
end

local function res_shift_left()
  for i=1,PW-1 do RES[i].t=RES[i+1].t; RES[i].s=RES[i+1].s end
  fill_res(PW)
end

local function res_shift_right()
  for i=PW,2,-1 do RES[i].t=RES[i-1].t; RES[i].s=RES[i-1].s end
  fill_res(1)
end

local function load_drop(slot)
  local ri = 2 + slot
  DROP[slot].t=RES[ri].t; DROP[slot].s=RES[ri].s
  for i=ri, PW-1 do RES[i].t=RES[i+1].t; RES[i].s=RES[i+1].s end
  fill_res(PW)
end

local function release_drop(slot)
  local t = stream_on and stream_type or DROP[slot].t
  local s = stream_on and stream_sub  or DROP[slot].s
  if t == 0 then return end
  local pc = 2 + slot
  for pr = 3, PH do
    local i = (pr - 1) * 8 + pc
    -- In-lined is_ctrl check
    if not (pc==1 and pr>=3 and pr<=5) and GTYPE[i] == 0 then
      GTYPE[i]=t; GSUB[i]=s; GDIM[i]=15; GMINE[i]=0; GSTAB[i]=0
      break
    end
  end
  if not stream_on then load_drop(slot) end
end

-- ===========================================================================
-- PHYSICS
-- ===========================================================================


-- ===========================================================================
-- PHYSICS HELPERS
-- ===========================================================================
-- ===========================================================================
-- CONSOLIDATED CORE TICK: Single-pass Physics & Dimming
-- ===========================================================================
local function core_tick()
  phys_ticker = phys_ticker + 1
  for i=1,128 do GMOVED[i]=false end
  local i_dim = (dissolve_state > 0)
  dim_ticker = dim_ticker + 1
  local dim_half = (dissolve_state == 1 and dim_ticker % 2 ~= 0)

  for pr=16,3,-1 do
    local offset = (pr - 1) * 8
    for pc=1,8 do
      local i = offset + pc
      local t = GTYPE[i]
      
      -- 1. PHYSICS
      if t > 0 and not GMOVED[i] and not (pc==1 and pr>=3 and pr<=5) then
        if pr < 16 then
          local bi = i + 8
          if t == 2 then -- LEAF: own branch first, zigzags even in open space
            if GSTAB[i] < 12 then
              local dx = (math.random(2)==1) and -1 or 1
              local di = bi + dx
              if pc+dx >= 1 and pc+dx <= 8 and GTYPE[di] == 0 then
                GTYPE[di]=2; GSUB[di]=GSUB[i]; GDIM[di]=GDIM[i]; GMINE[di]=GMINE[i]; GSTAB[di]=0
                GTYPE[i]=0; GSTAB[i]=0; GMOVED[di]=true; is_dirty=true
              elseif GTYPE[bi] == 0 then
                GTYPE[bi]=2; GSUB[bi]=GSUB[i]; GDIM[bi]=GDIM[i]; GMINE[bi]=GMINE[i]; GSTAB[bi]=0
                GTYPE[i]=0; GSTAB[i]=0; GMOVED[bi]=true; is_dirty=true
              elseif pc-dx >= 1 and pc-dx <= 8 and GTYPE[bi-dx] == 0 then
                GTYPE[bi-dx]=2; GSUB[bi-dx]=GSUB[i]; GDIM[bi-dx]=GDIM[i]; GMINE[bi-dx]=GMINE[i]; GSTAB[bi-dx]=0
                GTYPE[i]=0; GSTAB[i]=0; GMOVED[bi-dx]=true; is_dirty=true
              else
                GSTAB[i] = GSTAB[i] + 1
              end
            end
          elseif GTYPE[bi] == 0 then -- Generic fall (sand, water)
            GTYPE[bi]=t; GSUB[bi]=GSUB[i]; GDIM[bi]=GDIM[i]; GMINE[bi]=GMINE[i]; GSTAB[bi]=GSTAB[i]
            GTYPE[i]=0; GSTAB[i]=0; GMOVED[bi]=true; is_dirty=true
          elseif t == 1 then -- Sand Piling
            local dx = (math.random(2)==1) and 1 or -1
            local si = bi + dx
            if pc+dx >= 1 and pc+dx <= 8 and GTYPE[si] == 0 then
              GTYPE[si]=1; GSUB[si]=GSUB[i]; GDIM[si]=GDIM[i]; GMINE[si]=GMINE[i]; GSTAB[si]=GSTAB[i]
              GTYPE[i]=0; GSTAB[i]=0; GMOVED[si]=true; is_dirty=true
            end
          elseif t == 3 then -- Water: spread sideways, settle
            if GSTAB[i] < 8 then
              local dx = (math.random(2)==1) and 1 or -1
              local si = i + dx
              if pc+dx >= 1 and pc+dx <= 8 and GTYPE[si] == 0 then
                GTYPE[si]=3; GSUB[si]=GSUB[i]; GDIM[si]=GDIM[i]; GSTAB[si]=0
                GTYPE[i]=0; GSTAB[i]=0; GMOVED[si]=true; is_dirty=true
              else
                GSTAB[i] = GSTAB[i] + 1
              end
            end
          end
        end
      end
      
      -- 2. DIMMING
      if i_dim and not dim_half then
        if t > 0 and dim_ticker % DIM_RATES[t] == 0 then
          GDIM[i] = GDIM[i] - 1; is_dirty = true
          if GDIM[i] <= 0 then GTYPE[i]=0; GDIM[i]=15; GMINE[i]=0; GSTAB[i]=0 end
        end
      end
    end
  end
end

-- ===========================================================================
-- SEQUENCER TICK PROCESSOR
-- ===========================================================================
local function process_seq_ticks()
  -- Decay active notes
  for i=1,MAX_ACT do
    if ANS[i].active then
      ANS[i].ticks=ANS[i].ticks-1
      if ANS[i].ticks<=0 then midi_note_off(ANS[i].note, ANS[i].ch); ANS[i].active=false end
    end
  end
  for i=1,4 do
    if ECHO[i].active then
      ECHO[i].ticks=ECHO[i].ticks-1
      if ECHO[i].ticks<=0 then midi_note_off(ECHO[i].note, ECHO[i].ch); ECHO[i].active=false end
    end
  end

  if not seq_running then return end

  beat_count = beat_count + 1

  for t=1,4 do
    local tr = tracks[t]
    if tr.running then
      -- accumulate step
      local step_hz = (bpm / 60) * div_mult[tr.div]
      tr.accum = tr.accum + (step_hz / PHYS_HZ)
      
      while tr.accum >= (1.0 + (tr.step_jitter or 0.0)) do
        tr.accum = tr.accum - 1.0
        
        if humanize_level == 1 then tr.step_jitter = (math.random() - 0.5) * 0.20
        elseif humanize_level == 2 then tr.step_jitter = (math.random() - 0.5) * 0.55
        else tr.step_jitter = 0.0 end
        
        -- trigger step
        local pc, pr = track_step_pos(t, tr.step)
        local ci = (pr - 1) * 8 + pc
        local gtype = GTYPE[ci]
        
        if gtype > 0 and not GSIL[ci] then
          local note = grain_note(pc, pr, gtype)
          
          if gtype==1 then  -- Sand: medium vel, staccato + echo
            local vel = math.random(75,105)
            if beat_count%16==1 then vel=math.min(127,vel+22)
            elseif beat_count%8==1 then vel=math.min(127,vel+10) end
            if humanize_level == 1 then vel = vel + math.random(-10, 10)
            elseif humanize_level == 2 then vel = vel + math.random(-30, 30) end
            vel = math.max(1, math.min(127, math.floor(vel)))
            play_note(note, vel, 1, tr.ch)
            queue_echo(note, vel, tr.ch)

          elseif gtype==2 then  -- Leaf: soft, long
            local vel = math.random(38,65)
            if humanize_level == 1 then vel = vel + math.random(-8, 8)
            elseif humanize_level == 2 then vel = vel + math.random(-25, 25) end
            vel = math.max(1, math.min(127, math.floor(vel)))
            play_note(note, vel, 3, tr.ch)

          elseif gtype==3 then  -- Water: oct+12 (handled in grain_note), check group
            local adj=false
            for dx=-1,1,2 do
              local apc=pc+dx
              if apc>=1 and apc<=8 and GTYPE[(pr - 1) * 8 + apc]==3 then adj=true; break end
            end
            local vel = math.random(55,85)
            if humanize_level == 1 then vel = vel + math.random(-10, 10)
            elseif humanize_level == 2 then vel = vel + math.random(-30, 30) end
            vel = math.max(1, math.min(127, math.floor(vel)))
            play_note(note, vel, adj and 4 or 1, tr.ch)
          end
        end
        
        -- advance step
        is_dirty = true
        if tr.dir_fwd then
          tr.step = tr.step + 1
          if tr.step > tr.end_step or tr.step < tr.start_step then tr.step = tr.start_step end
        else
          tr.step = tr.step - 1
          if tr.step < tr.end_step or tr.step > tr.start_step then tr.step = tr.start_step end
        end
      end
    end
  end
end

-- ===========================================================================
-- MINING
-- ===========================================================================
local MINE_MAX = 3

local function mine_cell(pc, pr)
  if pr<3 or pr>16 or pc<1 or pc>8 then return end
  local i = (pr - 1) * 8 + pc
  if GTYPE[i]==0 then return end
  GMINE[i]=GMINE[i]+1
  if GMINE[i]>=MINE_MAX then
    GTYPE[i]=0; GDIM[i]=15; GMINE[i]=0
  end
end

-- ===========================================================================
-- DRAW HELPERS
-- ===========================================================================
local function draw_grain(pc, pr)
  local i = (pr - 1) * 8 + pc
  local t = GTYPE[i]
  local r, g, b = 0, 0, 0
  if t > 0 then
    local c = COLR[t][GSUB[i]]
    local sc = GDIM[i] / 15.0
    if GMINE[i]>0 then sc = math.min(1.0, sc + 0.3) end
    r, g, b = math.floor(c.r * sc), math.floor(c.g * sc), math.floor(c.b * sc)
  end
  
  -- In-lined spx
  if P_R[i]==r and P_G[i]==g and P_B[i]==b then return end
  P_R[i], P_G[i], P_B[i] = r, g, b
  local hx, hy = 17 - pr, pc
  if grid_led_rgb then grid_led_rgb(hx, hy, r, g, b)
  else grid_led(hx, hy, math.floor(math.max(r,g,b)/17)) end
end

-- Pre-computed component colors per screen (no table allocation in hot path)
local ALT_COL_R = {live=60,  seq=20,  scale=140}
local ALT_COL_G = {live=40,  seq=120, scale=20}
local ALT_COL_B = {live=8,   seq=200, scale=200}
local hum_labels = {{r=80,g=80,b=80},{r=160,g=80,b=180},{r=255,g=20,b=255}}

local function draw_ctrl_buttons()
  -- ALT colour shows active screen
  local s = cur_screen
  spx(ALT_PC, ALTP_R, ALT_COL_R[s] or 60, ALT_COL_G[s] or 40, ALT_COL_B[s] or 8)
  -- Start/Stop
  if seq_running then spx(PLAY_PC,PLAYP_R, 20,200,60)
  else spx(PLAY_PC,PLAYP_R, 200,30,20) end
  -- Dissolve state: 0=off(red) 1=half(amber) 2=normal(dim blue)
  if dissolve_state==0 then     spx(LOCK_PC,LOCKP_R, 180,20,20)
  elseif dissolve_state==1 then spx(LOCK_PC,LOCKP_R, 180,100,10)
  else                          spx(LOCK_PC,LOCKP_R, 15,25,55) end

  -- RESET button (soft white/grey)
  spx(RESET_PC, RESETP_R, 120, 120, 120)
end

local function draw_reservoir()
  for pc=1,PW do
    local r=RES[pc]
    if r.t>0 then
      local c=COLR[r.t][r.s]
      spx(pc,1, math.floor(c.r*0.5), math.floor(c.g*0.5), math.floor(c.b*0.5))
    else
      spx(pc,1, 8,8,8)
    end
  end
end

local function draw_drop_zone()
  for sl=1,4 do
    local pc=2+sl
    local d=DROP[sl]
    if d.t>0 then
      local c=COLR[d.t][d.s]
      -- Brighter if this slot is streaming
      local sc = (stream_on and stream_slot==sl) and 1.0 or 0.7
      spx(pc,2, math.floor(c.r*sc), math.floor(c.g*sc), math.floor(c.b*sc))
    else
      spx(pc,2, 5,5,5)
    end
  end
end

-- ===========================================================================
-- DRAW — LIVE SCREEN
-- ===========================================================================
local function draw_live()
  if supports_multi_screen then grid_set_screen("live") end
  draw_reservoir()
  draw_drop_zone()
  -- Draw all grains first
  for pr=3,PH do
    for pc=1,PW do draw_grain(pc,pr) end
  end
  -- Draw control buttons LAST so they always paint over grain cells at col=1,row=3-5
  draw_ctrl_buttons()
  -- Blink: overdraw eye cells ONLY if they still contain the eye-colored sand
  for _, ei in ipairs(eye_idxs) do
    if GTYPE[ei] == 1 and GSUB[ei] == 4 then
      local epc = ((ei - 1) % 8) + 1
      local epr = math.floor((ei - 1) / 8) + 1
      if blink_closed then
        local c = COLR[1][3] -- Skin color for "closed" state
        spx(epc, epr, c.r, c.g, c.b)
      else
        draw_grain(epc, epr)
      end
    end
  end
  -- Highlight active seq step
  for t=1, 4 do
    local tr = tracks[t]
    if seq_running and tr.running then
      local spc, spr = track_step_pos(t, tr.step)
      if spr>=9 and spr<=PH then
        spx(spc,spr, 255,255,255)
      end
    end
  end
end

-- ===========================================================================
-- DRAW — SEQ SETTINGS SCREEN (in portrait coordinates via spx)
-- ===========================================================================
local function draw_seq()
  if supports_multi_screen then grid_set_screen("seq") end
  -- grid_led_all(0): Removed for differential optimization
  draw_ctrl_buttons()

  -- Draw the 5 options at pr=7, pc=1..5:
  -- Option 1: Loop, Option 2: Division, Option 3: Mute, Option 4: Run Status, Option 5: Channel
  for x = 1, 5 do
    if x == seq_opt then spx(x, 7, 200, 200, 50) -- highlighted
    else spx(x, 7, 40, 40, 10) end
  end

  -- Draw the tracks (bottom half, pr=9..16)
  for t = 1, 4 do
    local tr = tracks[t]
    
    for s = 1, 16 do
      local pc, pr = track_step_pos(t, s)
      local si = (pr - 1) * 8 + pc
      
      -- Base background colors (alternating by track)
      local r,g,b = 0,0,0
      if t % 2 == 1 then
        r,g,b = 25, 30, 40   -- Lighter base
      else
        r,g,b = 10, 15, 20   -- Darker base
      end
      
      -- Dim if track is fully turned off
      if not tr.running then r,g,b = math.floor(r*0.4), math.floor(g*0.4), math.floor(b*0.4) end

      -- Grain colors overlay
      local has_grain = false
      if GTYPE[si] > 0 then
        has_grain = true
        if seq_opt == 3 then
          local c = COLR[GTYPE[si]][GSUB[si]]
          r,g,b = math.floor(c.r*0.6), math.floor(c.g*0.6), math.floor(c.b*0.6)
          if GSIL[si] then
             r,g,b = 40,40,40  -- dimmed if silenced
          end
        end
      end
      
      -- Option Specific Visuals
      if seq_opt == 1 then
        local in_loop = false
        if tr.dir_fwd then in_loop = (s >= tr.start_step and s <= tr.end_step)
        else in_loop = (s >= tr.end_step and s <= tr.start_step) end
        
        if in_loop then
          -- Boost inside loop
          r,g,b = math.min(255, r+30), math.min(255, g+30), math.min(255,b+30)
          if s == tr.start_step or s == tr.end_step then
            r,g,b = math.min(255, r+80), math.min(255, g+80), math.min(255,b+80)
          end
        else
          -- Dim slightly outside loop, but DO NOT turn completely black
          r,g,b = math.floor(r*0.6), math.floor(g*0.6), math.floor(b*0.6)
        end
      elseif seq_opt == 2 then
        if s <= 6 then
           if s == tr.div then r,g,b = 200,80,200 else r,g,b = math.max(r, 40), math.max(g, 10), math.max(b, 40) end
        end
      elseif seq_opt == 4 then
        if tr.running then r,g,b = math.min(255, r+20), math.min(255, g+20), math.min(255,b+20) end
      elseif seq_opt == 5 then
        if s == tr.ch then r,g,b = 200,80,200 else r,g,b = math.max(r, 40), math.max(g, 10), math.max(b, 40) end
      end
      
      -- Always show playhead brightly if track is running
      if seq_running and tr.running and s == tr.step then
        r,g,b = 255, 255, 255
      end
      
      spx(pc, pr, r, g, b)
    end
  end
end

-- ===========================================================================
-- DRAW — SCALE SETTINGS SCREEN (in portrait coordinates via spx)
-- ===========================================================================
local function draw_scale()
  if supports_multi_screen then grid_set_screen("scale") end
  draw_ctrl_buttons()

  -- Row 6: Scale mode (cols 1-6: MAJ MIN PMA PMI DOR LYD)
  for x=1,6 do
    if x==scale_mode then spx(x,6, 200,200,50)
    else spx(x,6, 40,40,10) end
  end
  -- Row 8: Black keys root (C# D# gap F# G# A# gap)
  for x=1,7 do
    local semi=KB_BLACK[x]
    if semi>=0 then
      local is_r=(semi==root_note)
      local in_s=false
      for si=1,SCALE_LEN do if SCALE[si]%12==semi then in_s=true; break end end
      if is_r then spx(x,8, 20,120,255)
      elseif in_s then spx(x,8, 120,120,120)
      else spx(x,8, 18,18,18) end
    end
  end
  -- Row 9: White keys root (C D E F G A B)
  for x=1,7 do
    local semi=KB_WHITE[x]
    local is_r=(semi==root_note)
    local in_s=false
    for si=1,SCALE_LEN do if SCALE[si]%12==semi then in_s=true; break end end
    if is_r then spx(x,9, 20,120,255)
    elseif in_s then spx(x,9, 160,160,160)
    else spx(x,9, 20,20,20) end
  end
  -- Row 11: BPM adjust (cols 1-4: -10 -1 +1 +10)
  spx(1,11, 200,60,20); spx(2,11, 200,120,20)
  spx(3,11, 20,180,80); spx(4,11, 20,220,60)
  -- Row 12: Octave base (cols 1-4: oct2 oct3 oct4 oct5)
  for x=1,4 do
    if x==oct_base-1 then spx(x,12, 80,80,240) else spx(x,12, 10,10,40) end
  end
  -- Row 13: Humanizer state (cols 1-3: off/on/extreme)
  for x=1,3 do
    local c=hum_labels[x]
    if (x-1)==humanize_level then spx(x,13, c.r,c.g,c.b)
    else spx(x,13, math.floor(c.r*0.1),math.floor(c.g*0.1),math.floor(c.b*0.1)) end
  end
end

-- ===========================================================================
-- REDRAW — flush all screens once
-- ===========================================================================
local function redraw()
  if not is_dirty then return end
  
  if supports_multi_screen then
    draw_live()
    draw_seq()
    draw_scale()
  else
    if cur_screen=="seq" then
      draw_seq()
    elseif cur_screen=="scale" then
      draw_scale()
    else
      draw_live()
    end
  end
  grid_refresh()
  is_dirty = false
end

-- ===========================================================================
-- SWITCH SCREEN
-- ===========================================================================
local function set_screen(name)
  cur_screen = name
  -- Physically clear the hardware so no LEDs bleed from previous screen
  if grid_led_all then grid_led_all(0) end
  if grid_refresh then grid_refresh() end
  -- Reset P-buffer so every pixel is re-sent on next frame
  for i=1,PW*PH do P_R[i]=-2 end
  is_dirty = true
  if display_screen then display_screen(name) end
end

-- ===========================================================================
-- SINGLE METRO — physics + sequencer + stream in one callback
-- Sequencer subdivisions tracked with an integer counter.
-- ===========================================================================
local m_phys
-- PHYS_HZ and PHYS_INT shifted to top for scope
-- The tick timing is handled by process_seq_ticks natively


local function phys_tick()
  -- 1. Optimized Core simulation (Combined Physics + Dimming)
  if phys_active then
    core_tick()
  end

  -- Blink animation (simplified)
  local prev_closed = blink_closed
  blink_t = (blink_t + 1) % 60
  blink_closed = (blink_t > 57)
  if blink_closed ~= prev_closed then is_dirty = true end

  -- 2. Stream hold: count ticks, start streaming once threshold reached
  if key_held_slot > 0 and not stream_on then
    key_held_ticks = key_held_ticks + 1
    if key_held_ticks >= STREAM_TICKS then
      stream_on=true; stream_cnt=0; stream_slot=key_held_slot
    end
  end

  -- 3. Stream release: one grain per physics tick while streaming
  if stream_on and stream_slot > 0 then
    release_drop(stream_slot)
    stream_cnt = stream_cnt + 1
    if stream_cnt >= STREAM_MAX then
      stream_on=false; stream_cnt=0; stream_slot=0
      stream_type=0; key_held_slot=0; key_held_ticks=0
    end
  end

  -- 4. Sequencer subdivision
  process_seq_ticks()

  -- 5. Redraw (hardware: current screen only; emulator: all buffers)
  redraw()
end

-- ===========================================================================
-- EVENT GRID
-- ===========================================================================

--- Grid key event handler.
-- @tparam number x hardware column (1-based)
-- @tparam number y hardware row (1-based)
-- @tparam number z 1=pressed 0=released
function event_grid(x, y, z)
  local scr = get_focused_screen and get_focused_screen() or "live"
  -- Convert to portrait
  local pc, pr = pt(x, y)

  -- ---- ALT button: tap cycles live -> seq -> scale -> live ----
  if pc==ALT_PC and pr==ALTP_R then
    if z==1 then
      if cur_screen=="live" then set_screen("seq")
      elseif cur_screen=="seq" then set_screen("scale")
      else set_screen("live") end
    end
    return
  end

  -- ---- Play/Stop ----
  if pc==PLAY_PC and pr==PLAYP_R then
    if z==0 then return end
    seq_running = not seq_running
    if seq_running then phys_active = true end
    if not seq_running then notes_off() end
    is_dirty = true
    return
  end

  -- ---- RESET SCREEN (Secondary Control 1) ----
  if pc==RESET_PC and pr==RESETP_R then
    if z==1 then
      notes_off()
      init_pixels()
      -- Reset P-buffer to force a full redraw of the portrait
      for i=1,128 do P_R[i]=-2 end
      is_dirty = true
    end
    return
  end

  -- ---- Dissolve cycle (Lock button): off -> half -> normal -> off ----
  if pc==LOCK_PC and pr==LOCKP_R then
    if z==0 then return end
    dissolve_state = (dissolve_state + 1) % 3
    is_dirty = true
    return
  end

  -- ---- Reservoir row (portrait row 1) ----
  if pr==1 then
    if z==0 then return end
    phys_active = true
    if pc<=4 then res_shift_left() else res_shift_right() end
    is_dirty = true
    return
  end

  -- ---- Drop zone (portrait row 2, cols 3-6) ----
  if pr==2 and pc>=3 and pc<=6 then
    local slot = pc - 2
    if z==1 then
      phys_active = true
      -- Record press; hold detection runs in phys_tick
      key_held_slot  = slot
      key_held_ticks = 0
      stream_type    = DROP[slot].t
      stream_sub     = DROP[slot].s
    else
      -- Released
      if stream_on then
        -- Stop stream
        stream_on=false; stream_cnt=0; stream_slot=0; stream_type=0
      elseif key_held_ticks < STREAM_TICKS then
        -- Short tap: release exactly one grain
        release_drop(slot)
      end
      key_held_slot=0; key_held_ticks=0
      is_dirty = true
    end
    return
  end

  -- ---- SEQ SETTINGS SCREEN ----
  if scr=="seq" or cur_screen=="seq" then
    if z==0 then return end
    
    -- Option selection (Row 7, cols 1-5)
    if pr==7 and pc<=5 then
      seq_opt = pc
      is_dirty = true
      return
    end

    -- Tracks logic (bottom half: pr 9-16)
    if pr>=9 and pr<=16 and pc>=1 and pc<=8 then
      local track = math.floor((pr - 9) / 2) + 1
      -- Step mapped correctly left-to-right top-to-bottom
      local s = pc + ((pr % 2 == 0) and 8 or 0)
      local tr = tracks[track]
      
      if seq_opt == 1 then
         -- Length/Loop Editor
         if tr.loop_input == 0 then
           tr.start_step = s
           tr.end_step = s
           tr.dir_fwd = true
           tr.step = s -- Reset step on new start point
           tr.loop_input = 1
         else
           tr.end_step = s
           tr.dir_fwd = (tr.end_step >= tr.start_step)
           -- Immediately clamp playhead if we just bounded the loop
           if tr.dir_fwd and (tr.step < tr.start_step or tr.step > tr.end_step) then tr.step = tr.start_step end
           if not tr.dir_fwd and (tr.step > tr.start_step or tr.step < tr.end_step) then tr.step = tr.start_step end
           tr.loop_input = 0
         end
      elseif seq_opt == 2 then
         -- Division Editor
         if s <= 6 then tr.div = s end
      elseif seq_opt == 3 then
         -- Mute
         local ci = (pr - 1) * 8 + pc
         if GTYPE[ci]>0 then GSIL[ci] = not GSIL[ci] end
      elseif seq_opt == 4 then
         -- Active Track
         tr.running = not tr.running
      elseif seq_opt == 5 then
         -- MIDI Channel Editor
         tr.ch = s
      end
      return
    end
    return
  end

  -- ---- SCALE SETTINGS SCREEN ----
  if scr=="scale" or cur_screen=="scale" then
    if z==0 then return end
    -- Scale settings uses portrait coords so input maps the same way
    if pr==6 and pc<=6 then
      scale_mode=pc; gen_scale(); return
    end
    if pr==8 and pc<=7 and KB_BLACK[pc]>=0 then
      root_note=KB_BLACK[pc]; gen_scale(); return
    end
    if pr==9 and pc<=7 then
      root_note=KB_WHITE[pc]; gen_scale(); return
    end
    if pr==11 then
      if pc==1 then bpm=math.max(40,bpm-10)
      elseif pc==2 then bpm=math.max(40,bpm-1)
      elseif pc==3 then bpm=math.min(240,bpm+1)
      elseif pc==4 then bpm=math.min(240,bpm+10)
      end
      return
    end
    if pr==12 and pc<=4 then
      oct_base=pc+1; return
    end
    if pr==13 and pc<=3 then
      humanize_level=pc-1; return
    end
    return
  end

  -- ---- LIVE SCREEN input ----
  if z==0 then
    -- On release, stop stream
    if stream_on then stream_on=false; stream_cnt=0; stream_slot=0; stream_type=0 end
    key_held_slot=0
    return
  end

  -- Long-press detection for drop zone handled above.
  -- Tapping grains in falling/pile area = mining (or direct play when locked)
  if pr>=3 and pr<=16 then
    if z==1 then phys_active = true end
    if dissolve_state == 0 then
      -- Locked: tap plays note
      local i = (pr - 1) * 8 + pc
      if GTYPE[i]>0 then
        play_note(grain_note(pc,pr,GTYPE[i]), 90, TYPE_DUR[GTYPE[i]])
      end
    else
      mine_cell(pc, pr)
    end
    is_dirty = true
  end
end

-- ===========================================================================
-- KEYBOARD (emulator only)
-- ===========================================================================
function event_key(key)
  if key=="tab" or key=="space" then
    -- Both keys cycle screens: live -> seq -> scale -> live
    if cur_screen=="live" then set_screen("seq")
    elseif cur_screen=="seq" then set_screen("scale")
    else set_screen("live") end
  end
end

-- ===========================================================================
-- INIT
-- ===========================================================================
init_reservoir()
for i=1,4 do load_drop(i) end
init_pixels()

-- Memory: Release large startup data to free Pico RAM
-- (Disabled for Reset function)
-- init_pixels = nil
-- INITIAL_IMG = nil

m_phys = metro.init(phys_tick, PHYS_INT)
m_phys:start()

redraw()
