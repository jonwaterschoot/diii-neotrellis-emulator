local bpm = 120
local seq_running = false
local clock_ext = false
local PATTERN = {24, 27, 24, 29}
local pat_idx = 0
local on_note = nil
local m_seq = nil
local m_clk = nil
local ext_pulses = 0
local ext_last_t = nil
local function note_off()
  if on_note then midi_tx(0x80, on_note, 0); on_note = nil end
end
local function step()
  note_off()
  pat_idx = (pat_idx % 4) + 1
  on_note = PATTERN[pat_idx]
  midi_tx(0x90, on_note, 100)
end
local function draw()
  grid_led_all(0)
  for i = 1, 4 do
    if i == pat_idx then grid_led_rgb(i*2, 4, 0, 200, 20)
    else grid_led_rgb(i*2, 4, 15, 30, 15) end
  end
  if seq_running then grid_led_rgb(1, 8, 20, 200, 40) else grid_led_rgb(1, 8, 200, 20, 20) end
  if not clock_ext then
    grid_led_rgb(3, 8, bpm == 40  and 220 or 30, 60, 10)
    grid_led_rgb(5, 8, 10, bpm == 130 and 220 or 60, 10)
  end
  grid_led_rgb(7, 8, clock_ext and 20 or 25, 25, clock_ext and 220 or 25)
  grid_refresh()
end
local function update_metros()
  if seq_running and not clock_ext then
    m_seq:start(60 / bpm)
    m_clk:start(60 / bpm / 24)
  else
    m_seq:stop()
    m_clk:stop()
  end
end
local function start_seq()
  seq_running = true
  pat_idx = 0
  midi_tx(0xFA, 0, 0)
  ext_pulses = 0; ext_last_t = nil
  update_metros()
  draw()
end
local function stop_seq()
  seq_running = false
  note_off()
  midi_tx(0xFC, 0, 0)
  update_metros()
  draw()
end
function event_grid(x, y, z)
  if z == 0 then return end
  if x == 1 and y == 8 then
    if seq_running then stop_seq() else start_seq() end
  elseif x == 3 and y == 8 and not clock_ext then
    bpm = 40; update_metros(); draw()
  elseif x == 5 and y == 8 and not clock_ext then
    bpm = 130; update_metros(); draw()
  elseif x == 7 and y == 8 then
    clock_ext = not clock_ext
    ext_pulses = 0; ext_last_t = nil
    update_metros()
    draw()
  end
end
function event_midi(b1, b2, b3)
  if not clock_ext or b1 ~= 0xF8 then return end
  ext_pulses = ext_pulses + 1
  if ext_pulses >= 24 then
    ext_pulses = 0
    local now = get_time()
    if ext_last_t then
      bpm = math.max(1, math.min(240, math.floor(60 / (now - ext_last_t) + 0.5)))
      if seq_running then step() end
    end
    ext_last_t = now
  end
end
m_seq = metro.init(function() if seq_running then step(); draw() end end, 60 / bpm)
m_clk = metro.init(function() midi_tx(0xF8, 0, 0) end, 60 / bpm / 24)
draw()
