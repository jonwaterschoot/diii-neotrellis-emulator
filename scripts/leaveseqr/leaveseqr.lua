-- scriptname: LeaveSeqr
-- v0.3.0
-- @author: jonwaterschoot
--
-- Ambient leaf physics sequencer: leaves drift through air, float on water, sink to mud.
-- Three generative water tracks; triops leap from mud to eat leaves and decay into bass echoes.
--
-- @key Tab: Cycle screen (Live → Seq → Scale)
-- @key 1/2: BPM -10/-1
-- @key 3/4: BPM +1/+10

-- ---------------------------------------------------------------------------
-- @section Grid Layout
-- @screen live
-- @group Canopy
-- Row 1: Canopy — leaves grow here; tap leaf to knock loose, tap empty to plant
-- @group Wind
-- x=1..3, y=2: Left wind — gusts push leaves rightward; blows canopy loose
-- x=14..16, y=2: Right wind — gusts push leaves leftward; blows canopy loose
-- @group Air Zone
-- Row 2..4: Air — leaves drift slowly, wind pushes horizontal and upward
-- @group Water Tracks
-- Row 5: Water surface — Track 1, base octave
-- Row 6: Underwater mid — Track 2, one octave down
-- Row 7: Underwater deep — Track 3, two octaves down
-- @group Mud
-- Row 8: Mud — leaves collect; tap empty to spawn triop, tap triop to make it leap
-- @group Controls
-- x=1, y=3: ALT — cycle screens Live → Seq → Scale
-- x=2, y=3: Play/Stop
-- x=3, y=3: Auto-grow toggle
-- ---------------------------------------------------------------------------
-- @section Sequencer Settings
-- @screen seq
-- @group Options
-- x=1, y=1: LOOP — two taps on track set loop start then end
-- x=2, y=1: DIV — tap x=1..6 on a track row to set division
-- x=3, y=1: DIR — tap a track row to toggle fwd/rev
-- x=4, y=1: CH — tap x=1..3 on a track row to set MIDI channel
-- @group Tracks (tap at their live y positions)
-- Row 5: Track 1 (surface)
-- Row 6: Track 2 (mid water)
-- Row 7: Track 3 (deep water)
-- ---------------------------------------------------------------------------
-- @section Scale / Tempo Settings
-- @screen scale
-- @group Scale
-- x=1..6, y=1: Scale — MAJ MIN PMA PMI DOR LYD
-- x=9..12, y=1: Season — SP SU AU WI
-- @group Root Note
-- x=5..11, y=2: Black keys — C# D# (gap) F# G# A# (gap)
-- x=5..11, y=3: White keys — C D E F G A B
-- @group Timing
-- x=1..4, y=4: BPM — -10 -1 +1 +10
-- x=6..9, y=4: Octave base — 2 3 4 5
-- x=11..12, y=4: Leaf density — lo hi
-- @group Feel
-- x=1..3, y=5: Humanize — off on ex
-- x=5..7, y=5: Brightness — lo md hi
-- @group Environment
-- x=1..3, y=6: Wind strength — lo md hi
-- x=5, y=6: Triop auto-spawn — on/off
-- ---------------------------------------------------------------------------

local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen    then grid_set_screen    = function(_) end end
if not display_screen     then display_screen     = function(_) end end
if not get_focused_screen then get_focused_screen = function() return "live" end end
if not get_time           then get_time           = function() return 0 end end

-- ===========================================================================
-- CONSTANTS
-- ===========================================================================
local W, H   = 16, 8

local Y_CAN  = 1   -- canopy row
local Y_AIR1 = 2   -- top of air (also wind button row)
local Y_AIR2 = 4   -- bottom of air
local Y_SURF = 5   -- water surface — Track 1
local Y_MID  = 6   -- underwater mid — Track 2
local Y_DEEP = 7   -- underwater deep — Track 3
local Y_MUD  = 8   -- mud layer

-- Leaf types
local T_EMPTY   = 0
local T_CANOPY  = 1
local T_AIR     = 2
local T_SURFACE = 3
local T_UNDER   = 4
local T_MUD     = 5

-- Triop states
local TS_IDLE   = 0  -- wandering in mud
local TS_RISING = 1  -- leaping upward through water
local TS_PEAK   = 2  -- at peak, brief pause
local TS_SINK   = 3  -- sinking back to mud

-- Physics
local PHYS_HZ  = 8
local PHYS_INT = 1.0 / PHYS_HZ

-- Fall / sink probabilities per tick (ambient-slow)
local PROB_AIR  = 16   -- leaves hover in air
local PROB_SURF = 4    -- surface float is long
local PROB_MID  = 3    -- mid water sinks very slowly
local PROB_DEEP = 2    -- deep water almost still

-- Passive drift (brownian, no wind needed)
local DRIFT_AIR  = 14  -- lazy left/right in air
local DRIFT_SURF = 7   -- gentle surface drift
local DRIFT_MID  = 2   -- minimal underwater drift

-- ===========================================================================
-- COLORS (pre-allocated — no runtime alloc)
-- ===========================================================================
local S1A={r=80,g=220,b=80};  local S1B={r=165,g=230,b=58}
local S2A={r=28,g=155,b=48};  local S2B={r=18,g=178,b=108}
local S3A={r=215,g=105,b=18}; local S3B={r=175,g=45,b=18}
local S4A={r=130,g=175,b=215};local S4B={r=72,g=112,b=138}
local SEASONS = {{S1A,S1B},{S2A,S2B},{S3A,S3B},{S4A,S4B}}
local season   = 3  -- autumn default

local HC1={r=55,g=55,b=55}; local HC2={r=18,g=195,b=175}; local HC3={r=215,g=75,b=215}
local HUM_COLORS = {HC1, HC2, HC3}
local SC1={r=75,g=195,b=75}; local SC2={r=18,g=145,b=55}
local SC3={r=195,g=95,b=18}; local SC4={r=72,g=112,b=152}
local SEA_COLORS = {SC1, SC2, SC3, SC4}
local BRI_VALS = {255, 138, 58}

-- ===========================================================================
-- GRID STATE (flat pre-allocated [1..128])
-- ===========================================================================
local GTYPE  = {}
local GCOL   = {}
local GMOVED = {}
local P_R, P_G, P_B = {}, {}, {}

for i = 1, W * H do
  GTYPE[i]=0; GCOL[i]=1; GMOVED[i]=false
  P_R[i]=-1; P_G[i]=-1; P_B[i]=-1
end

local function gidx(x, y)  return (y - 1) * W + x  end
local function dirty_all()
  for i = 1, W * H do P_R[i]=-1; P_G[i]=-1; P_B[i]=-1 end
end

-- ===========================================================================
-- SCALE / MUSIC
-- ===========================================================================
local SCALE_MASKS = {
  {0,2,4,5,7,9,11}, {0,2,3,5,7,8,10}, {0,2,4,7,9},
  {0,3,5,7,10},     {0,2,3,5,7,9,10}, {0,2,4,6,7,9,11},
}
local SCALE     = {}
local SCALE_LEN = 5
local scale_mode = 3
local root_note  = 0
local oct_base   = 3

local KB_WHITE = {0, 2, 4, 5, 7, 9, 11}
local KB_BLACK = {1, 3,-1, 6, 8,10,-1}

for i = 1, 12 do SCALE[i] = 0 end

local function gen_scale()
  local m = SCALE_MASKS[scale_mode]
  SCALE_LEN = #m
  for i = 1, SCALE_LEN do SCALE[i] = (m[i] + root_note) % 12 end
end
gen_scale()

local function col_to_note(x, oct_off)
  local deg  = ((x - 1) % SCALE_LEN) + 1
  local eoct = math.floor((x - 1) / SCALE_LEN)
  return math.max(24, math.min(108,
    12 + (oct_base + (oct_off or 0) + eoct) * 12 + SCALE[deg]))
end

-- ===========================================================================
-- BPM / TIMING
-- ===========================================================================
local bpm            = 60
local humanize_level = 0
local dim_lvl        = 0
local dim_f          = 1.0
local DIM_VALS       = {1.0, 0.55, 0.25}
local HUM_VEL        = {0, 14, 30}
local HUM_DUR        = {0, 1, 2}
local function get_interval() return 60.0 / bpm / 4 end

-- ===========================================================================
-- ACTIVE NOTE TRACKING
-- ===========================================================================
local MAX_ACT = 16
local ANS = {}
for i = 1, MAX_ACT do ANS[i] = {note=0, active=false, ticks=0, ch=1} end

local function play_note(note, vel, dur, ch)
  ch = ch or 1
  local slot, oldest_t = 1, math.huge
  for i = 1, MAX_ACT do
    if not ANS[i].active then slot = i; break end
    if ANS[i].ticks < oldest_t then oldest_t = ANS[i].ticks; slot = i end
  end
  if ANS[slot].active then midi_note_off(ANS[slot].note, ANS[slot].ch) end
  if humanize_level > 0 then
    local hv = HUM_VEL[humanize_level + 1]
    vel = math.max(1, math.min(127, vel + math.random(-hv, hv)))
    dur = dur + math.random(0, HUM_DUR[humanize_level + 1])
  end
  midi_note_on(note, vel, ch)
  ANS[slot].note=note; ANS[slot].active=true; ANS[slot].ticks=dur; ANS[slot].ch=ch
end

local function notes_off()
  for i = 1, MAX_ACT do
    if ANS[i].active then midi_note_off(ANS[i].note, ANS[i].ch); ANS[i].active=false end
  end
  if midi_panic then midi_panic() end
end

local function tick_notes()
  for i = 1, MAX_ACT do
    if ANS[i].active then
      ANS[i].ticks = ANS[i].ticks - 1
      if ANS[i].ticks <= 0 then
        midi_note_off(ANS[i].note, ANS[i].ch); ANS[i].active = false
      end
    end
  end
end

-- ===========================================================================
-- TRIOP ECHO — bouncing decay (short → long gaps, falling pitch)
-- Reversed-ball: first hit fast, each bounce slower and lower.
-- ===========================================================================
local MAX_ECH = 4
local ECH = {}
for i = 1, MAX_ECH do ECH[i] = {active=false, note=0, delay=0, b=0, ch=4} end
local BDEL = {1, 2, 4, 8}
local BVEL = {88, 65, 42, 20}

local function start_echo(note, ch)
  ch = ch or 4
  for i = 1, MAX_ECH do
    if not ECH[i].active then
      ECH[i].active=true; ECH[i].note=note; ECH[i].delay=BDEL[1]; ECH[i].b=1; ECH[i].ch=ch
      midi_note_on(note, BVEL[1], ch)
      return
    end
  end
end

local function tick_echo()
  for i = 1, MAX_ECH do
    local e = ECH[i]
    if e.active then
      e.delay = e.delay - 1
      if e.delay <= 0 then
        midi_note_off(e.note, e.ch)
        e.b = e.b + 1
        if e.b > 4 then
          e.active = false
        else
          e.note  = math.max(24, e.note - 2)
          e.delay = BDEL[e.b]
          midi_note_on(e.note, BVEL[e.b], e.ch)
        end
      end
    end
  end
end

local function echo_off()
  for i = 1, MAX_ECH do
    if ECH[i].active then midi_note_off(ECH[i].note, ECH[i].ch); ECH[i].active=false end
  end
end

-- ===========================================================================
-- TRIOPS — leap from mud into water to eat leaves, then sink and disappear
-- ===========================================================================
local MAX_TR   = 4
local triops_on = true

-- Pre-allocated triop structs
local TR = {}
for i = 1, MAX_TR do
  TR[i] = {
    active=false, x=1, y=Y_MUD, dir=1, state=TS_IDLE,
    age=0, mv=0,           -- mv = move countdown ticks
    peak_y=Y_DEEP,         -- how high it leaps (Y_DEEP or Y_MID)
    pause_t=0,             -- ticks to wait at peak
    rise_wait=0,           -- ticks until auto-leap
  }
end

--- Spawn a new triop at column x (mud row). Returns true on success.
local function spawn_triop(x)
  for i = 1, MAX_TR do
    if not TR[i].active then
      TR[i].active=true; TR[i].x=x; TR[i].y=Y_MUD
      TR[i].dir=math.random(2)==1 and 1 or -1
      TR[i].state=TS_IDLE; TR[i].age=0; TR[i].mv=0
      TR[i].peak_y = math.random(2)==1 and Y_DEEP or Y_MID
      TR[i].pause_t=0
      TR[i].rise_wait = 48 + math.random(64)   -- auto-leap in 6–14 s
      return true
    end
  end
  return false
end

--- Trigger an immediate leap for any idle triop at column x.
local function trigger_leap(x)
  for i = 1, MAX_TR do
    local tr = TR[i]
    if tr.active and tr.state == TS_IDLE and tr.x == x then
      tr.state = TS_RISING
      tr.mv    = 0
      tr.peak_y = math.random(2)==1 and Y_DEEP or Y_MID
      return
    end
  end
end

-- ===========================================================================
-- SEQUENCER STATE — three independent tracks
-- ===========================================================================
local seq_running = false
local beat_count  = 0

-- Division multipliers (relative to 1 tick = 1/16th note at 4 subticks/beat)
-- x=1..6 → 1/32 1/16 1/8 1/4 1/2 1/1
local DIV_MULT = {4.0, 2.0, 1.0, 0.5, 0.25, 0.125}

-- t1: water surface, base oct; t2: mid water, -1 oct; t3: deep, -2 oct
local t1 = {y=Y_SURF, step=1, div=3, dir=1, ch=1, accum=0.0, start_step=1, end_step=16, loop_input=0, oct=0}
local t2 = {y=Y_MID,  step=1, div=4, dir=1, ch=2, accum=0.0, start_step=1, end_step=16, loop_input=0, oct=-1}
local t3 = {y=Y_DEEP, step=1, div=5, dir=1, ch=3, accum=0.0, start_step=1, end_step=16, loop_input=0, oct=-2}
local TRACKS = {t1, t2, t3}

local function advance_track(tr)
  tr.step = tr.step + tr.dir
  if tr.dir == 1 then
    if tr.step > tr.end_step   then tr.step = tr.start_step end
  else
    if tr.step < tr.start_step then tr.step = tr.end_step   end
  end
end

-- ===========================================================================
-- WIND
-- ===========================================================================
local WIND_DIR   = 0
local WIND_TIMER = 0
local WIND_STR   = 1
-- Wind buttons at y=2 (top of air zone): x=1-3 left, x=14-16 right
local WIND_L_MAX = 3
local WIND_R_MIN = 14
-- Gust duration and push probability by strength
local WIND_TICKS = {6, 10, 16}
local WIND_PROB  = {30, 52, 75}

-- ===========================================================================
-- CANOPY / AUTO-GROW
-- ===========================================================================
local auto_grow    = true
local grow_density = 1
local grow_timer   = 0
local GROW_INT     = {32, 14}

-- ===========================================================================
-- CONTROL STATE
-- ===========================================================================
local ALT_X, ALT_Y   = 1, 3
local PLAY_X, PLAY_Y = 2, 3
local AUTO_X, AUTO_Y = 3, 3

local cur_screen = "live"
local seq_opt    = 1   -- 1=LOOP 2=DIV 3=DIR 4=CH

local function cycle_screen()
  if     cur_screen == "live"  then cur_screen = "seq"
  elseif cur_screen == "seq"   then cur_screen = "scale"
  else                              cur_screen = "live" end
  if display_screen then display_screen(cur_screen) end
  dirty_all()
end

-- ===========================================================================
-- PIXEL HELPER (differential, with brightness and mono fallback)
-- ===========================================================================
local function spx(x, y, r, g, b)
  if x < 1 or x > W or y < 1 or y > H then return end
  r = math.floor(r * dim_f); g = math.floor(g * dim_f); b = math.floor(b * dim_f)
  local i = (y - 1) * W + x
  if P_R[i] == r and P_G[i] == g and P_B[i] == b then return end
  P_R[i]=r; P_G[i]=g; P_B[i]=b
  if grid_led_rgb then
    grid_led_rgb(x, y, r, g, b)
  else
    local lv = math.floor(math.max(r, g, b) / 17)
    if lv < 4 and (r > 0 or g > 0 or b > 0) then lv = 4 end
    grid_led(x, y, lv)
  end
end

-- ===========================================================================
-- SHARED DRAW HELPERS
-- ===========================================================================
local function draw_ctrl_buttons()
  spx(ALT_X,  ALT_Y,  cur_screen=="live" and 22 or 80, cur_screen=="live" and 22 or 80, cur_screen=="live" and 22 or 80)
  if seq_running then spx(PLAY_X, PLAY_Y, 16, 170, 55)
  else                spx(PLAY_X, PLAY_Y, 170, 26, 16) end
  if auto_grow then spx(AUTO_X, AUTO_Y, 32, 112, 72)
  else              spx(AUTO_X, AUTO_Y, 16, 26, 16) end
end

--- Draw one track row on the seq screen with option overlays + playhead.
-- tr = track table, ry = y row to draw on
local function draw_track_row(ry, tr)
  -- Base zone colors (surface vs underwater)
  local br = ry == Y_SURF and 0 or 0
  local bg = ry == Y_SURF and 12 or 6
  local bb = ry == Y_SURF and 26 or 20

  for x = 1, W do
    local gi  = gidx(x, ry)
    local lt  = GTYPE[gi]
    local r, g, b = br, bg, bb

    if seq_opt == 1 then   -- LOOP: highlight range, mark endpoints
      local in_loop = (x >= tr.start_step and x <= tr.end_step)
      if in_loop then r=r+14; g=g+10; b=b+6 end
      if x == tr.start_step then r=r+120; g=g+64; b=b end
      if x == tr.end_step   then r=r+155; g=g+96; b=b end
    elseif seq_opt == 2 then   -- DIV: x=1..6 selectors
      if x <= 6 then
        if x == tr.div then r=155; g=45; b=175 else r=26; g=8; b=32 end
      end
    elseif seq_opt == 3 then   -- DIR: x=1=fwd, x=2=rev
      if x == 1 then
        r=18; g = tr.dir==1 and 185 or 35; b = tr.dir==1 and 65 or 18
      elseif x == 2 then
        r = tr.dir==-1 and 125 or 28; g=18; b = tr.dir==-1 and 175 or 38
      else
        r=br; g=bg; b=bb
      end
    elseif seq_opt == 4 then   -- CH: x=1..3 selectors
      if x <= 3 then
        if x == tr.ch then r=185; g=105; b=18 else r=32; g=18; b=6 end
      end
    end

    -- Playhead flash (orange)
    if seq_running and x == tr.step then
      r=math.min(255,r+100); g=math.min(255,g+68); b=math.min(255,b+6)
    end

    -- Leaf tint blend
    if lt ~= T_EMPTY then
      local c = SEASONS[season][GCOL[gi]]
      r=math.min(255,r+math.floor(c.r*0.25))
      g=math.min(255,g+math.floor(c.g*0.25))
      b=math.min(255,b+math.floor(c.b*0.20))
    end

    spx(x, ry, r, g, b)
  end
end

-- ===========================================================================
-- DRAW: LIVE
-- ===========================================================================
local function draw_live()
  if supports_multi_screen then grid_set_screen("live"); dirty_all() end

  for y = 1, H do
    for x = 1, W do
      local i = gidx(x, y)
      local t = GTYPE[i]
      local r, g, b = 0, 0, 0

      -- Zone tints
      if y == Y_SURF then r,g,b = 0,12,26
      elseif y == Y_MID  then r,g,b = 0,8,22
      elseif y == Y_DEEP then r,g,b = 0,5,18
      elseif y == Y_MUD  then r,g,b = 14,9,4
      end

      -- Sequencer playheads
      if seq_running then
        if y == Y_SURF and x == t1.step and x >= t1.start_step and x <= t1.end_step then
          r=math.min(255,r+22); g=math.min(255,g+16); b=math.min(255,b+6)
        elseif y == Y_MID and x == t2.step and x >= t2.start_step and x <= t2.end_step then
          r=math.min(255,r+8); g=math.min(255,g+22); b=math.min(255,b+40)
        elseif y == Y_DEEP and x == t3.step and x >= t3.start_step and x <= t3.end_step then
          r=math.min(255,r+5); g=math.min(255,g+12); b=math.min(255,b+55)
        end
      end

      -- Wind button indicators at y=2
      if y == Y_AIR1 and (x <= WIND_L_MAX or x >= WIND_R_MIN) then
        local lit = (WIND_DIR==1 and x<=WIND_L_MAX) or (WIND_DIR==-1 and x>=WIND_R_MIN)
        -- Only show if no leaf covering the spot
        if t == T_EMPTY then
          r=lit and 55 or 8; g=lit and 55 or 8; b=lit and 110 or 18
        end
      end

      -- Leaf rendering
      if t == T_CANOPY then
        local c = SEASONS[season][GCOL[i]]
        r=math.floor(c.r*0.80); g=math.floor(c.g*0.80); b=math.floor(c.b*0.80)
      elseif t == T_AIR then
        local c = SEASONS[season][GCOL[i]]
        r=c.r; g=c.g; b=c.b
      elseif t == T_SURFACE then
        local c = SEASONS[season][GCOL[i]]
        r=math.floor(c.r*0.60+14); g=math.floor(c.g*0.60+16); b=math.floor(c.b*0.50+52)
      elseif t == T_UNDER then
        local c = SEASONS[season][GCOL[i]]
        -- Slightly different tint at MID vs DEEP rows
        local df = y == Y_MID and 0.28 or 0.18
        r=math.floor(c.r*df+8); g=math.floor(c.g*(df+0.08)+10); b=math.floor(c.b*(df-0.02)+52)
      elseif t == T_MUD then
        local c = SEASONS[season][GCOL[i]]
        r=math.floor(c.r*0.12+14); g=math.floor(c.g*0.12+9); b=math.floor(c.b*0.07+3)
      end

      spx(x, y, r, g, b)
    end
  end

  -- Triops (amber glow, drawn at their current y — can be in water rows)
  for i = 1, MAX_TR do
    local tr = TR[i]
    if tr.active then
      local tr_r, tr_g, tr_b
      if tr.state == TS_IDLE then
        tr_r=165; tr_g=100; tr_b=12     -- dim amber when idle
      else
        tr_r=220; tr_g=140; tr_b=20     -- bright when leaping
      end
      spx(tr.x, tr.y, tr_r, tr_g, tr_b)
    end
  end

  draw_ctrl_buttons()
end

-- ===========================================================================
-- DRAW: SEQ
-- ===========================================================================
local function draw_seq()
  if supports_multi_screen then grid_set_screen("seq"); dirty_all() end
  for y = 1, H do for x = 1, W do spx(x, y, 0, 0, 0) end end

  -- y=1: Option selectors
  local oc = {{140,88,14},{155,45,175},{18,185,65},{185,105,18}}
  for x = 1, 4 do
    local on = (x == seq_opt)
    local v = on and 1.0 or 0.12
    spx(x, 1, math.floor(oc[x][1]*v), math.floor(oc[x][2]*v), math.floor(oc[x][3]*v))
  end

  -- y=2: Loop pending indicators
  if seq_opt == 1 then
    for ti = 1, 3 do
      local tr = TRACKS[ti]
      local on = tr.loop_input == 1
      spx(ti, 2, on and 185 or 28, on and 88 or 14, on and 14 or 6)
    end
  end

  -- y=3-4: Dark spacer (air zone)
  -- (cleared by the global clear above)

  -- y=5,6,7: Tracks at their live y positions
  draw_track_row(Y_SURF, t1)
  draw_track_row(Y_MID,  t2)
  draw_track_row(Y_DEEP, t3)

  -- y=8: Mud reference (just tint, no interaction)
  for x = 1, W do
    local gi = gidx(x, Y_MUD)
    local t  = GTYPE[gi]
    local r, g, b = 12, 8, 3
    if t == T_MUD then r=32; g=22; b=8 end
    spx(x, Y_MUD, r, g, b)
  end

  draw_ctrl_buttons()
end

-- ===========================================================================
-- DRAW: SCALE
-- ===========================================================================
local function draw_scale()
  if supports_multi_screen then grid_set_screen("scale"); dirty_all() end
  for y = 1, H do for x = 1, W do spx(x, y, 0, 0, 0) end end

  -- y=1: Scale / Season
  for x = 1, 6 do
    local on = (x == scale_mode)
    spx(x, 1, on and 212 or 36, on and 192 or 32, on and 42 or 8)
  end
  for x = 1, 4 do
    local c = SEA_COLORS[x]; local v = (x==season) and 1.0 or 0.13
    spx(8+x, 1, math.floor(c.r*v), math.floor(c.g*v), math.floor(c.b*v))
  end

  -- y=2: Black keys
  for x = 1, 7 do
    local s = KB_BLACK[x]
    if s >= 0 then
      local on = (s == root_note)
      spx(x+4, 2, on and 16 or 16, on and 112 or 16, on and 242 or 36)
    end
  end

  -- y=3: White keys
  for x = 1, 7 do
    local s = KB_WHITE[x]; local on = (s == root_note)
    spx(x+4, 3, on and 16 or 52, on and 132 or 52, on and 242 or 72)
  end

  -- y=4: BPM / Octave / Density
  spx(1,4,192,52,16); spx(2,4,192,112,16); spx(3,4,16,172,72); spx(4,4,16,212,52)
  for x = 1, 4 do
    local on = (x+1 == oct_base)
    spx(5+x, 4, on and 72 or 10, on and 72 or 10, on and 232 or 36)
  end
  for x = 1, 2 do
    local on = (x == grow_density)
    spx(10+x, 4, on and 72 or 10, on and 192 or 32, on and 72 or 10)
  end

  -- y=5: Humanize / Brightness
  for x = 1, 3 do
    local c = HUM_COLORS[x]; local v = (x-1==humanize_level) and 1.0 or 0.11
    spx(x, 5, math.floor(c.r*v), math.floor(c.g*v), math.floor(c.b*v))
  end
  for x = 1, 3 do
    local v = (x-1==dim_lvl) and BRI_VALS[x] or math.floor(BRI_VALS[x]*0.13)
    spx(4+x, 5, v, v, v)
  end

  -- y=6: Wind strength / Triop auto
  for x = 1, 3 do
    local on = (x == WIND_STR)
    spx(x, 6, math.floor(112*(on and 1 or 0.11)), math.floor(112*(on and 1 or 0.11)), math.floor(192*(on and 1 or 0.11)))
  end
  spx(5, 6, triops_on and 192 or 26, triops_on and 112 or 16, triops_on and 16 or 8)

  draw_ctrl_buttons()
end

-- ===========================================================================
-- REDRAW
-- ===========================================================================
local is_dirty = true

local function redraw()
  if not is_dirty then return end
  if supports_multi_screen then
    draw_live(); draw_seq(); draw_scale()
  else
    if     cur_screen == "seq"   then draw_seq()
    elseif cur_screen == "scale" then draw_scale()
    else                              draw_live() end
  end
  grid_refresh()
  is_dirty = false
end

-- ===========================================================================
-- PHYSICS TICK
-- ===========================================================================
local triop_spawn_t = 0
local TRIOP_INT     = 52   -- auto-spawn every ~6.5 s

local function physics_tick()
  for i = 1, W * H do GMOVED[i] = false end

  -- ── Leaf physics (y=2..7; mud y=8 is static) ────────────────────────────
  for y = Y_DEEP, Y_AIR1, -1 do   -- bottom of deep water up to top of air
    for x = 1, W do
      local i = gidx(x, y)
      if GTYPE[i] ~= T_EMPTY and not GMOVED[i] then
        local t = GTYPE[i]

        local fall_prob, drift_prob, wind_push_prob
        if y <= Y_AIR2 then          -- air zone y=2..4
          fall_prob      = PROB_AIR
          drift_prob     = DRIFT_AIR
          wind_push_prob = WIND_DIR ~= 0 and WIND_PROB[WIND_STR] or 0
        elseif y == Y_SURF then      -- surface
          fall_prob      = PROB_SURF
          drift_prob     = DRIFT_SURF
          wind_push_prob = WIND_DIR ~= 0 and math.floor(WIND_PROB[WIND_STR]*0.38) or 0
        elseif y == Y_MID then       -- mid water
          fall_prob      = PROB_MID
          drift_prob     = DRIFT_MID
          wind_push_prob = WIND_DIR ~= 0 and math.floor(WIND_PROB[WIND_STR]*0.08) or 0
        else                         -- deep water y=7
          fall_prob      = PROB_DEEP
          drift_prob     = 0
          wind_push_prob = 0
        end

        local moved = false

        -- 1. Wind push — horizontal AND occasionally upward in air
        if wind_push_prob > 0 and math.random(100) < wind_push_prob then
          -- 20% chance upward push (only in air zone, not at canopy ceiling)
          if y <= Y_AIR2 and y > Y_AIR1 and math.random(5) == 1 then
            local ny = y - 1   -- push up
            local ni = gidx(x, ny)
            if GTYPE[ni] == T_EMPTY then
              GTYPE[ni]=T_AIR; GCOL[ni]=GCOL[i]; GMOVED[ni]=true
              GTYPE[i]=T_EMPTY; GCOL[i]=1; moved=true
            end
          end
          -- Sideways push
          if not moved then
            local nx = x + WIND_DIR
            if nx >= 1 and nx <= W then
              local ni = gidx(nx, y)
              if GTYPE[ni] == T_EMPTY then
                GTYPE[ni]=t; GCOL[ni]=GCOL[i]; GMOVED[ni]=true
                GTYPE[i]=T_EMPTY; GCOL[i]=1; moved=true
              else
                -- Merge into neighbor (dominant note wins at sequencer)
                GTYPE[i]=T_EMPTY; GCOL[i]=1; moved=true
              end
            end
          end
        end

        -- 2. Passive brownian drift
        if not moved and drift_prob > 0 and math.random(100) < drift_prob then
          local dx = math.random(2)==1 and 1 or -1
          local nx = x + dx
          if nx >= 1 and nx <= W then
            local ni = gidx(nx, y)
            if GTYPE[ni] == T_EMPTY then
              GTYPE[ni]=t; GCOL[ni]=GCOL[i]; GMOVED[ni]=true
              GTYPE[i]=T_EMPTY; GCOL[i]=1; moved=true
            end
          end
        end

        -- 3. Gravity fall
        if not moved and math.random(100) < fall_prob then
          local ny = y + 1
          local nt
          if ny == Y_SURF then nt = T_SURFACE
          elseif ny == Y_MID  then nt = T_UNDER
          elseif ny == Y_DEEP then nt = T_UNDER
          elseif ny == Y_MUD  then nt = T_MUD
          else                     nt = T_AIR end

          local ni = gidx(x, ny)
          if GTYPE[ni] == T_EMPTY then
            GTYPE[ni]=nt; GCOL[ni]=GCOL[i]; GMOVED[ni]=true
            GTYPE[i]=T_EMPTY; GCOL[i]=1
          elseif y <= Y_AIR2 then
            -- Blocked in air: try diagonal
            local dx = math.random(2)==1 and 1 or -1
            local nx2 = x + dx
            if nx2 >= 1 and nx2 <= W then
              local ni2 = gidx(nx2, ny)
              if GTYPE[ni2] == T_EMPTY then
                GTYPE[ni2]=nt; GCOL[ni2]=GCOL[i]; GMOVED[ni2]=true
                GTYPE[i]=T_EMPTY; GCOL[i]=1
              end
            end
          end
        end
      end
    end
  end

  -- ── Wind knocks canopy leaves loose ──────────────────────────────────────
  if WIND_DIR ~= 0 then
    local knock_prob = math.floor(WIND_PROB[WIND_STR] * 0.18)
    for x = 1, W do
      local ci = gidx(x, Y_CAN)
      if GTYPE[ci] == T_CANOPY and math.random(100) < knock_prob then
        -- Drop into first available air row
        for dy = Y_AIR1, Y_AIR2 do
          local di = gidx(x, dy)
          if GTYPE[di] == T_EMPTY then
            GTYPE[di]=T_AIR; GCOL[di]=GCOL[ci]
            GTYPE[ci]=T_EMPTY; GCOL[ci]=1
            break
          end
        end
      end
    end
  end

  -- ── Triop lifecycle ───────────────────────────────────────────────────────
  if triops_on then
    for i = 1, MAX_TR do
      local tr = TR[i]
      if tr.active then
        tr.age = tr.age + 1
        tr.mv  = tr.mv  + 1

        if tr.state == TS_IDLE then
          -- Slow horizontal wander (every 5 ticks ≈ 0.6 s)
          if tr.mv >= 5 then
            tr.mv = 0
            if math.random(5) == 1 then tr.dir = -tr.dir end
            local nx = tr.x + tr.dir
            if nx < 1 then nx=1; tr.dir=1 elseif nx > W then nx=W; tr.dir=-1 end
            tr.x = nx
          end
          -- Auto-leap countdown
          tr.rise_wait = tr.rise_wait - 1
          if tr.rise_wait <= 0 then
            tr.state  = TS_RISING
            tr.mv     = 0
            tr.peak_y = math.random(2)==1 and Y_DEEP or Y_MID
          end

        elseif tr.state == TS_RISING then
          -- Rise one row every 2 ticks
          if tr.mv >= 2 then
            tr.mv = 0
            tr.y  = tr.y - 1
            -- Check for leaf to eat at new position
            local li = gidx(tr.x, tr.y)
            if GTYPE[li] ~= T_EMPTY then
              start_echo(col_to_note(tr.x, -3), 4)
              GTYPE[li]=T_EMPTY; GCOL[li]=1
              tr.state  = TS_PEAK
              tr.pause_t = 6   -- short pause after eating
            elseif tr.y <= tr.peak_y then
              -- Reached max height without eating
              tr.state  = TS_PEAK
              tr.pause_t = 3
            end
          end

        elseif tr.state == TS_PEAK then
          tr.pause_t = tr.pause_t - 1
          if tr.pause_t <= 0 then
            tr.state = TS_SINK
            tr.mv    = 0
          end

        elseif tr.state == TS_SINK then
          -- Sink one row every 3 ticks
          if tr.mv >= 3 then
            tr.mv = 0
            tr.y  = tr.y + 1
            if tr.y >= Y_MUD then
              tr.y = Y_MUD
              tr.active = false   -- disappears after returning to mud
            end
          end
        end
      end
    end

    -- Auto-spawn timer
    triop_spawn_t = triop_spawn_t + 1
    if triop_spawn_t >= TRIOP_INT then
      triop_spawn_t = 0
      spawn_triop(math.random(W))
    end
  end

  tick_echo()

  -- ── Auto-grow canopy ─────────────────────────────────────────────────────
  if auto_grow then
    grow_timer = grow_timer + 1
    if grow_timer >= GROW_INT[grow_density] then
      grow_timer = 0
      local tries = 5
      while tries > 0 do
        local cx = math.random(W)
        local ci = gidx(cx, Y_CAN)
        if GTYPE[ci] == T_EMPTY then
          GTYPE[ci]=T_CANOPY; GCOL[ci]=math.random(2); break
        end
        tries = tries - 1
      end
    end
  end

  -- ── Wind timer decay ─────────────────────────────────────────────────────
  if WIND_TIMER > 0 then
    WIND_TIMER = WIND_TIMER - 1
    if WIND_TIMER == 0 then WIND_DIR = 0 end
  end

  is_dirty = true
  redraw()
end

-- ===========================================================================
-- SEQUENCER TICK
-- ===========================================================================
local m_seq   -- forward-declared

local function seq_tick()
  if not seq_running then return end
  tick_notes()
  beat_count = beat_count + 1

  for ti = 1, 3 do
    local tr = TRACKS[ti]
    tr.accum = tr.accum + DIV_MULT[tr.div]
    while tr.accum >= 1.0 do
      tr.accum = tr.accum - 1.0
      local ii = gidx(tr.step, tr.y)
      if GTYPE[ii] ~= T_EMPTY then
        -- Velocity scales with depth: surface is brighter, deep is quieter
        local vel_base = 82 - ti * 14
        play_note(col_to_note(tr.step, tr.oct), math.random(vel_base-12, vel_base+10), 3+ti, tr.ch)
      end
      advance_track(tr)
    end
  end

  is_dirty = true
end

-- ===========================================================================
-- INPUT HANDLER
-- ===========================================================================

--- Handle seq-screen track tap for a given track based on current option.
local function seq_track_tap(tr, x)
  if seq_opt == 1 then   -- LOOP
    if tr.loop_input == 0 then
      tr.start_step = x; tr.loop_input = 1
      if tr.step < tr.start_step then tr.step = tr.start_step end
    else
      if x < tr.start_step then tr.end_step=tr.start_step; tr.start_step=x
      else                       tr.end_step=x end
      tr.loop_input = 0
      if tr.step > tr.end_step then tr.step = tr.start_step end
    end
  elseif seq_opt == 2 and x <= 6 then  -- DIV
    tr.div = x
  elseif seq_opt == 3 then             -- DIR
    tr.dir = -tr.dir
  elseif seq_opt == 4 and x <= 3 then  -- CH
    tr.ch = x
  end
end

function event_grid(x, y, z)
  local screen = get_focused_screen and get_focused_screen() or "live"

  -- ALT: cycle screens on press
  if x == ALT_X and y == ALT_Y then
    if z == 1 then cycle_screen(); is_dirty = true end
    return
  end

  if z == 0 then return end

  -- PLAY/STOP (all screens)
  if x == PLAY_X and y == PLAY_Y then
    seq_running = not seq_running
    if not seq_running then
      notes_off(); echo_off()
      for ti = 1, 3 do TRACKS[ti].accum = 0 end
    end
    is_dirty = true; return
  end

  -- AUTO-GROW (all screens)
  if x == AUTO_X and y == AUTO_Y then
    auto_grow = not auto_grow; is_dirty = true; return
  end

  local active_screen = supports_multi_screen and screen or cur_screen

  -- ── SEQ SCREEN ───────────────────────────────────────────────────────────
  if active_screen == "seq" then
    if y == 1 and x >= 1 and x <= 4 then
      seq_opt = x
      for ti = 1, 3 do TRACKS[ti].loop_input = 0 end
    elseif y == Y_SURF then seq_track_tap(t1, x)
    elseif y == Y_MID  then seq_track_tap(t2, x)
    elseif y == Y_DEEP then seq_track_tap(t3, x)
    end
    is_dirty = true; return
  end

  -- ── SCALE SCREEN ─────────────────────────────────────────────────────────
  if active_screen == "scale" then
    if y == 1 then
      if x >= 1 and x <= 6 then scale_mode=x; gen_scale()
      elseif x >= 9 and x <= 12 then season=x-8 end
    elseif y == 2 then
      if x >= 5 and x <= 11 then
        local s = KB_BLACK[x-4]; if s >= 0 then root_note=s; gen_scale() end
      end
    elseif y == 3 then
      if x >= 5 and x <= 11 then root_note=KB_WHITE[x-4]; gen_scale() end
    elseif y == 4 then
      if     x==1 then bpm=math.max(20,bpm-10)
      elseif x==2 then bpm=math.max(20,bpm-1)
      elseif x==3 then bpm=math.min(200,bpm+1)
      elseif x==4 then bpm=math.min(200,bpm+10)
      elseif x>=6 and x<=9 then oct_base=x-4
      elseif x==11 then grow_density=1
      elseif x==12 then grow_density=2
      end
      if m_seq then m_seq:start(get_interval()) end
    elseif y == 5 then
      if x>=1 and x<=3 then humanize_level=x-1
      elseif x>=5 and x<=7 then dim_lvl=x-5; dim_f=DIM_VALS[dim_lvl+1]; dirty_all() end
    elseif y == 6 then
      if x>=1 and x<=3 then WIND_STR=x
      elseif x==5 then triops_on=not triops_on end
    end
    is_dirty = true; return
  end

  -- ── LIVE SCREEN ──────────────────────────────────────────────────────────

  -- Wind buttons at y=2 (top of air zone)
  if y == Y_AIR1 and (x <= WIND_L_MAX or x >= WIND_R_MIN) then
    WIND_DIR   = x <= WIND_L_MAX and 1 or -1
    WIND_TIMER = WIND_TICKS[WIND_STR]
    is_dirty   = true; return
  end

  -- Canopy tap: knock loose or plant
  if y == Y_CAN then
    local ci = gidx(x, y)
    if GTYPE[ci] == T_CANOPY then
      for dy = Y_AIR1, Y_AIR2 do
        local di = gidx(x, dy)
        if GTYPE[di] == T_EMPTY then
          GTYPE[di]=T_AIR; GCOL[di]=GCOL[ci]; break
        end
      end
      GTYPE[ci]=T_EMPTY; GCOL[ci]=1
    else
      GTYPE[ci]=T_CANOPY; GCOL[ci]=math.random(2)
    end
    is_dirty = true; return
  end

  -- Mud tap: click triop (immediate leap) or spawn new one
  if y == Y_MUD then
    -- First check if a triop is at this column in idle state → trigger leap
    local found = false
    for i = 1, MAX_TR do
      if TR[i].active and TR[i].state == TS_IDLE and TR[i].x == x then
        trigger_leap(x)
        found = true
        break
      end
    end
    -- No idle triop at this column → spawn one
    if not found then
      spawn_triop(x)
    end
    is_dirty = true; return
  end
end

-- ===========================================================================
-- KEYBOARD (BPM via 1/2/3/4 keys)
-- ===========================================================================
function event_key(key)
  if     key=="1" then bpm=math.max(20,bpm-10); if m_seq then m_seq:start(get_interval()) end; is_dirty=true
  elseif key=="2" then bpm=math.max(20,bpm-1);  if m_seq then m_seq:start(get_interval()) end; is_dirty=true
  elseif key=="3" then bpm=math.min(200,bpm+1); if m_seq then m_seq:start(get_interval()) end; is_dirty=true
  elseif key=="4" then bpm=math.min(200,bpm+10);if m_seq then m_seq:start(get_interval()) end; is_dirty=true
  end
end

-- ===========================================================================
-- METRO CLOCKS
-- ===========================================================================
local m_phys = metro.init(physics_tick, PHYS_INT)
m_phys:start()

m_seq = metro.init(seq_tick, get_interval())
m_seq:start()

-- ===========================================================================
-- INIT — seed canopy and a couple of triops
-- ===========================================================================
local seed_cols = {3, 6, 8, 11, 14}
for i = 1, #seed_cols do
  local ci = gidx(seed_cols[i], Y_CAN)
  GTYPE[ci]=T_CANOPY; GCOL[ci]=math.random(2)
end

spawn_triop(4)
spawn_triop(11)

redraw()
