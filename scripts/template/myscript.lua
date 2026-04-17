-- scriptname: My Script Name
-- v1.0.0
-- @author: Your Name
-- https://llllllll.co/t/your-thread  (replace or remove)
--
-- One sentence: what does this script do?
-- Add a second line here if you need a bit more context.
--
-- @key ↑↓←→: (example — delete or replace)
-- @key Space: (example — delete or replace)

-- ---------------------------------------------------------------------------
-- @section Grid Layout
-- @screen live
-- @group Example Group
-- @detail Describe your main screen controls here using the control-map format.
-- @detail Multiple @detail lines are captured by the coordinate line below.
-- x=1, y=8: BUTTON — What it does
-- x=2..8, y=8: SLIDER — R1 R2 R3 R4 R5 R6 R7 (Prefix ignored for pad labels)
--
-- @section Settings
-- @screen settings
-- x=1, y=1: Example settings control — what it does
-- ---------------------------------------------------------------------------

-- ============================================================
-- COMPATIBILITY STUBS
-- Guard all emulator-only functions so the script also runs on
-- real NeoTrellis hardware (Pico) without crashing.
-- ============================================================
local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen  then grid_set_screen  = function(_) end end
if not display_screen   then display_screen   = function(_) end end
if not get_focused_screen then get_focused_screen = function() return "live" end end

-- ============================================================
-- CONSTANTS
-- ============================================================
local W, H = 16, 8  -- grid dimensions (NeoTrellis 16×8)

-- ============================================================
-- STATE
-- Define your script's variables here.
-- ============================================================
local my_value = 0

-- ============================================================
-- HELPERS
-- ============================================================

--- Short description of what this helper does.
-- @tparam number x  grid column (1-based)
-- @tparam number y  grid row (1-based)
-- @treturn boolean  true if the position is valid
local function in_bounds(x, y)
  return x >= 1 and x <= W and y >= 1 and y <= H
end

-- ============================================================
-- DRAWING
-- ============================================================

--- Draw the primary (live) screen content.
local function draw_live()
  if supports_multi_screen then grid_set_screen("live") end
  grid_led_all(0)
  -- TODO: draw your live screen here
  -- Example: grid_led_rgb(1, 1, 255, 0, 0)  -- red pixel at (1,1)
end

--- Draw the settings (alt) screen content.
-- Remove this function if you only use one screen.
local function draw_settings()
  if supports_multi_screen then grid_set_screen("settings") end
  grid_led_all(0)
  -- TODO: draw your settings screen here
end

--- Render all screens and flush the display.
-- Call grid_refresh() ONCE at the end — it flushes every buffer simultaneously.
local function redraw()
  if supports_multi_screen then
    draw_live()
    draw_settings()  -- remove if not using a second screen
  else
    -- On hardware: only draw the currently visible screen
    draw_live()      -- or draw_settings() depending on state
  end
  grid_refresh()
end

-- ============================================================
-- INPUT
-- ============================================================

--- Grid key event handler — called by the emulator/hardware on pad press or release.
-- @tparam number x  grid column (1-based)
-- @tparam number y  grid row (1-based)
-- @tparam number z  1 = pressed, 0 = released
function event_grid(x, y, z)
  if z == 0 then return end  -- ignore releases (remove this line if you need release events)

  -- TODO: handle your pad presses here
  -- Example: toggle my_value on any press
  my_value = my_value + 1

  redraw()
end

-- ============================================================
-- KEYBOARD INPUT (emulator only — ignored on hardware)
-- ============================================================
-- Uncomment and implement if your script uses keyboard shortcuts.
--
-- function event_key(key)
--   if key == "space" then
--     -- do something
--     redraw()
--   end
-- end

-- ============================================================
-- METRO / CLOCK (optional — delete if not needed)
-- ============================================================
-- local m_clock
--
-- local function clock_tick()
--   -- called every tick
--   redraw()
-- end
--
-- m_clock = metro.new(clock_tick, 0.5)  -- 0.5s interval = 120 BPM quarter note
-- m_clock:start()

-- ============================================================
-- INIT
-- ============================================================
-- Code here runs once when the script loads.
redraw()
