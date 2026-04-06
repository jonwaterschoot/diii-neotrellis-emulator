-- scriptname: Text Runner
-- v1.0.0
-- @author: jonwaterschoot
--
-- A small demo that renders a 3×5 pixel font and scrolls Serpentine-themed text.
-- Top-row buttons select slow/medium/fast scrolling or non-scrolling chunk mode.
-- @section Layout
-- x=1..16, y=1: Scroll speed / chunk mode slider.
-- x=1..16, y=2..6: Text rendering area.
-- x=1..16, y=8: Mode indicator.
-- @group

local W = grid_size_x()
local H = grid_size_y()

local FONT = {
  [" "]=0x00000,
  ["0"]=0x75557,["1"]=0x22222,["2"]=0x71747,["3"]=0x71717,["4"]=0x55711,
  ["5"]=0x74717,["6"]=0x74757,["7"]=0x71111,["8"]=0x75757,["9"]=0x75711,
  ["A"]=0x75755,["B"]=0x65656,["C"]=0x74447,["D"]=0x65556,["E"]=0x74747,
  ["F"]=0x74744,["G"]=0x74557,["H"]=0x55755,["I"]=0x72227,["J"]=0x71153,
  ["K"]=0x56465,["L"]=0x44447,["M"]=0x57555,["N"]=0x75555,["O"]=0x75557,
  ["P"]=0x75744,["Q"]=0x75573,["R"]=0x75765,["S"]=0x74717,["T"]=0x72222,
  ["U"]=0x55557,["V"]=0x55552,["W"]=0x55575,["X"]=0x55255,["Y"]=0x55222,
  ["Z"]=0x71247,["!"]=0x22202,["?"]=0x71202
}

local MODES = {
  {name = "SLOW", interval = 0.18, scroll = true, chunk = false},
  {name = "MED",  interval = 0.12, scroll = true, chunk = false},
  {name = "FAST", interval = 0.07, scroll = true, chunk = false},
  {name = "CHNK", interval = 0.9,  scroll = false, chunk = true}
}

local messages = {
  "SERPENTINE SEQUENCER",
  "GRID COLOR ARP",
  "BPM SNAKE LIVE",
  "HUMANIZE?",
  "WHY SERPENTINE",
  "COLOR LOOP",
  "SEQUENCE!"
}

local state = {
  mode = 1,
  message = 1,
  scroll_pos = 0,
  chunk_page = 1,
  last_tick = 0
}

local function spx(x, y, r, g, b, brightness)
  if x < 1 or x > W or y < 1 or y > H then return end
  brightness = brightness or 1.0
  r = r * brightness
  g = g * brightness
  b = b * brightness
  if grid_led_rgb then
    grid_led_rgb(x, y, math.max(0, math.min(255, math.floor(r + 0.5))),
                    math.max(0, math.min(255, math.floor(g + 0.5))),
                    math.max(0, math.min(255, math.floor(b + 0.5))))
  else
    local level = math.floor(math.max(r, g, b) / 17)
    if level < 4 and (r > 0 or g > 0 or b > 0) then level = 4 end
    grid_led(x, y, level)
  end
end

local function draw_char(x, y, char, r, g, b)
  local f = FONT[tostring(char)]
  if not f then return end
  for row = 1, 5 do
    local bits = (f >> ((5 - row) * 4)) & 0xF
    for col = 1, 3 do
      if (bits & (1 << (3 - col))) ~= 0 then
        spx(x + col - 1, y + row - 1, r, g, b)
      end
    end
  end
end

local function draw_text(x, y, text, r, g, b)
  for i = 1, #text do
    local char = text:sub(i, i)
    draw_char(x + (i - 1) * 4, y, char, r, g, b)
  end
end

local function text_pixel_width(text)
  if #text == 0 then return 0 end
  return #text * 4 - 1
end

local function current_message()
  return messages[state.message]
end

local function draw_slider()
  for x = 1, W do
    spx(x, 1, 16, 16, 28)
  end
  for mode_index = 1, #MODES do
    local start_x = (mode_index - 1) * 4 + 1
    local color = (state.mode == mode_index) and {220, 220, 100} or {80, 80, 120}
    for x = start_x, start_x + 3 do
      spx(x, 1, color[1], color[2], color[3])
    end
  end
end

local function draw_mode_label()
  local label = MODES[state.mode].name
  local offset = math.floor((W - text_pixel_width(label)) / 2) + 1
  draw_text(offset, 8, label, 220, 220, 220)
end

local function draw_text_area()
  local msg = current_message()
  if MODES[state.mode].chunk then
    local chunk_start = (state.chunk_page - 1) * 4 + 1
    local chunk_text = msg:sub(chunk_start, chunk_start + 3)
    local offset = math.floor((W - text_pixel_width(chunk_text)) / 2) + 1
    draw_text(offset, 2, chunk_text, 200, 120, 240)
  else
    local padded = msg .. "   "
    local width = text_pixel_width(padded)
    if width <= W then
      local offset = math.floor((W - width) / 2) + 1
      draw_text(offset, 2, padded, 200, 120, 240)
    else
      local total_space = width + W
      local scroll = state.scroll_pos % total_space
      local offset = W - scroll + 1
      draw_text(offset, 2, padded, 200, 120, 240)
    end
  end
end

local function redraw()
  grid_led_all(0)
  draw_slider()
  draw_text_area()
  draw_mode_label()
  grid_refresh()
end

local function advance_chunk()
  local msg = current_message()
  local pages = math.max(1, math.ceil(#msg / 4))
  state.chunk_page = state.chunk_page + 1
  if state.chunk_page > pages then
    state.chunk_page = 1
    state.message = state.message % #messages + 1
  end
end

local function advance_scroll()
  state.scroll_pos = state.scroll_pos + 1
  local msg = current_message() .. "   "
  local width = text_pixel_width(msg)
  if width > W then
    local total = width + W
    if state.scroll_pos >= total then
      state.scroll_pos = 0
      state.message = state.message % #messages + 1
    end
  else
    if state.scroll_pos > 4 then
      state.scroll_pos = 0
      state.message = state.message % #messages + 1
    end
  end
end

function event_grid(x, y, z)
  if z == 0 then return end
  if y == 1 then
    local mode = math.floor((x - 1) / 4) + 1
    if mode >= 1 and mode <= #MODES then
      if mode ~= state.mode then
        state.mode = mode
        state.scroll_pos = 0
        state.chunk_page = 1
      end
      redraw()
    end
  end
end

function init()
  local refresh_metro = metro.init(function()
    local now = get_time()
    local interval = MODES[state.mode].interval
    if now - state.last_tick >= interval then
      state.last_tick = now
      if MODES[state.mode].chunk then
        advance_chunk()
      else
        advance_scroll()
      end
      redraw()
    end
  end, 0.05)
  refresh_metro:start()
  redraw()
end

init()
