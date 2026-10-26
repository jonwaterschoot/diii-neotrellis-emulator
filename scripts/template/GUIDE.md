# How to start a new NeoTrellis script

This folder is a starter template. Copy it, rename things, and build from here.

Working with an LLM? Give it [`LLM_INSTRUCTIONS.md`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/template/LLM_INSTRUCTIONS.md) together with [`myscript.lua`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/template/myscript.lua). All template files: [`scripts/template/`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/tree/main/scripts/template).

---

## Step 1 — Copy and rename the folder

1. Duplicate this `template/` folder somewhere inside `scripts/`.
2. Rename the folder to match your script (e.g. `scripts/mysequencer/`).
3. Rename `myscript.lua` to match your script name (e.g. `mysequencer.lua`).
   - Lowercase, no spaces — use underscores if needed.

---

## Step 2 — Edit the Lua header

Open your `.lua` file. The first block of comments is parsed by the emulator.
Fill in every field:

```lua
-- scriptname: My Sequencer         ← required, shown in the UI
-- v0.1.0                           ← semver, update as you go
-- @author: Your Name               ← optional but encouraged
-- https://llllllll.co/t/...        ← your forum thread URL (add when you have one)
--
-- What the script does in one line. ← required, becomes the short description
```

> **Do not leave empty lines** inside this header block.
> The parser stops at the first non-comment line.

---

## Step 3 — Keyboard shortcuts (optional, emulator only)

Handle keys in `event_key`, and list them with `@key` lines in the header so they show under the grid:

```lua
-- @key Tab: Next screen
-- @key Space: Play/Stop

function event_key(key)
  if key == "tab" then next_screen()
  elseif key == "space" then toggle_play() end
end
```

`key` is the key's name: `"space"`, `"tab"`, `"enter"`, `"up"`, `"down"`, `"left"`, `"right"`, or the character in lower case (`"a"`, `"1"`). It's called on each press, not on release. R always reloads the script.

The device has no keyboard, so make every action reachable from the grid too. Scripts without `event_key` get fixed pad presses instead (Tab and Space press x1, y8, the arrows press x14–16, y7–8); the [script standard](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/script-standards/#6-keyboard-shortcuts) has the details.

---

## Step 4 — Map your grid controls

Add control-map comments **before the first non-comment line** of real code
(or grouped under `-- @section` headings anywhere in the file):

```lua
-- @section Main Screen
-- @screen live
-- x=1, y=8: ALT — opens Settings
-- x=2, y=8: Play/Stop

-- @section Settings
-- @screen settings
-- x=1..8, y=1: My slider — range description
```

These become the interactive overlay the emulator draws over the grid.

### Adding extended descriptions with `@detail`

Place one or more `-- @detail` lines **immediately after a `@group` line** to attach
a longer description to that group. Multiple `@detail` lines accumulate (newline-joined).
The emulator surfaces these as supplementary copy beneath the group's control list in
the live manual panel.

```lua
-- @group Water Tracks
-- @detail Each row is an independent sequencer track with its own playhead.
-- @detail When a leaf sits on a playhead position, it triggers a MIDI note.
-- @detail Track length, speed, channel, and octave are set in the Seq screen.
-- Row 5: TR1 — Water surface, base octave
-- Row 6: TR2 — Underwater mid, one octave down
-- Row 7: TR3 — Underwater deep, two octaves down
```

> The `@detail` annotation is cleared whenever a new `@group` or `@section` tag is
> encountered, so each group gets its own description. 
>
> **Best Practice for Ordering**: Always place your coordinate lines (e.g. `x=1..4: ...`) at the **bottom** of the group block. This ensures the sidebar "live manual" captures all the detail text that came before it.
>
> **Best Practice for Labels**: Use a prefix header for ranges (e.g. `SEAS — SPR SUM AUT WIN`). The emulator ignores words before the dash when mapping labels to pads, allowing for better sidebar clarity.

---

## Step 5 — Keep the compatibility stubs

The template includes these at the top of the code section:

```lua
local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen  then grid_set_screen  = function(_) end end
if not display_screen   then display_screen   = function(_) end end
```

**Leave these in place.** They let your script run on real Pico hardware
(where those functions don't exist) without errors.


## Step 6 — Write your `redraw()` and `event_grid()` functions

These are the two cores of every script:

- `redraw()` — called by your clock or after any input. Always end with `grid_refresh()`.
- `event_grid(x, y, z)` — called by the hardware/emulator whenever a pad is pressed or released.

The template shows the minimal structure. Expand from there.

---

## Step 6b — Colour

A NeoTrellis grid shows colour; a monome grid shows brightness levels 0–15. The colour functions only exist on the NeoTrellis firmware (and in the emulator), so check before calling them.

**One colour for the whole grid:** set a tint once, then draw with `grid_led` as usual.

```lua
if grid_color then grid_color(255, 120, 20) end -- amber on NeoTrellis, white elsewhere
grid_led(1, 1, 15)
```

**Several colours:** draw every pad through one helper that falls back to brightness levels.

```lua
local function spx(x, y, r, g, b)
  if grid_led_rgb then
    grid_led_rgb(x, y, r, g, b)
  else
    local level = math.floor(math.max(r, g, b) / 17)
    if level < 4 and (r > 0 or g > 0 or b > 0) then level = 4 end -- 1–3 are too dim to see
    grid_led(x, y, level)
  end
end

spx(1, 1, 255, 80, 20) -- orange, or level 15 on a monome grid
```

Dim tinted colours can change hue on NeoTrellis hardware, which the emulator doesn't show. The details, measured thresholds and test scripts are in [Colour and monochrome](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/colour/). Full example: [`color_fallback_demo.lua`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/colorfallback/color_fallback_demo.lua).

---

## Step 7 — Update `manifest.json`

Open `manifest.json` and fill in every field:

| Field | What to put |
|-------|-------------|
| `project_name` | Same as folder name, lowercase |
| `project_url`  | Your GitHub repo URL |
| `author`       | Your display name |
| `description`  | Same one-liner as the Lua header |
| `discussion_url` | llllllll.co thread (add when ready) |
| `documentation_url` | Raw GitHub URL to your README.md |
| `tags`         | Relevant tags: e.g. `["sequencer", "neotrellis"]` |
| `lua_file`     | Your `.lua` filename |

---

## Step 8 — Register your script in `scripts/manifest.json`

Open the top-level `scripts/manifest.json` and add an entry:

```json
{
  "name": "My Sequencer",
  "group": "Music",
  "file": "mysequencer/mysequencer.lua",
  "readme": "mysequencer/README.md",
  "description": "What it does",
  "author": "Your Name",
  "version": "0.1.0",
  "gridSize": [16, 8]
}
```

After saving, your script appears in the emulator's script list, under its `group` (scripts with the same group are listed together, in file order). `gridSize` sets the grid when it loads; add `"orientation": "portrait"` for a script played with the grid turned 90°.

---

## Step 9 — Write your README.md

Fill in the template's `README.md`: it's the manual people read in the Guide tab. Usage, Controls, Settings, Notes and Changelog are a good order; the [script standard](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/script-standards/#3-readmemd-recommended-for-github-repos) has more.

---

## Quick reference

- **Script standard:** [hosted docs](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/script-standards/), or the raw file for offline use and LLMs: [`SCRIPT_STANDARD.md`](https://raw.githubusercontent.com/jonwaterschoot/diii-neotrellis-emulator/main/SCRIPT_STANDARD.md)
- **Before uploading to a grid:** [Hardware vs. emulator](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/hardware-vs-emulator/)
- **Reference script:** [`serpentine_dev.lua`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/serpentine_dev.lua)
- **Reference README:** [`serpentineSeqr/README.md`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/README.md)

---

## Common gotchas

- Always call `grid_refresh()` **once** at the end of `redraw()` — not after individual `grid_led` calls.
- Guard `display_screen()` calls: `if display_screen then display_screen("settings") end`
- Pico memory is limited: avoid large string tables, deep elseif chains, and anonymous function allocation inside hot loops.
- The parser stops the header at the first non-comment line — don't put `local` declarations before closing the header block.
- `@detail` is scoped to the group it follows — a new `@group` or `@section` clears the accumulated detail. Write all `@detail` lines before any control-map lines for that group.
