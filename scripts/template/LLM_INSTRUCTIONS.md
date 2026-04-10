# LLM Instructions — NeoTrellis Script Template

## Context

You are helping a developer write a Lua script for the **NeoTrellis 16×8 RGB grid emulator**.
The emulator runs in a browser and mirrors the API surface of a Raspberry Pi Pico running the
**monome iii/diii firmware** — a C program that embeds a standard Lua 5.4 interpreter.
Scripts also target real hardware, so compatibility matters.

This instruction file is the canonical reference for code generation.
Cross-reference the full specification at:
https://raw.githubusercontent.com/jonwaterschoot/diii-neotrellis-emulator/main/SCRIPT_STANDARD.md

---

## Project constraints (always apply)

| Constraint | Detail |
|------------|--------|
| Language | Lua 5.4 (Pico via iii firmware) / Lua 5.3 via Fengari (browser emulator). No external libraries. |
| Grid size | 16 columns × 8 rows. `W=16, H=8`. Coordinates are 1-based. |
| Memory | Pico RAM is ~200 KB. Pre-allocate fixed buffers; avoid growing tables in hot loops. No deep string table expansion inside ticks. |
| MIDI | `midi_note_on(note, vel)`, `midi_note_off(note)`, `midi_panic()`. Always pair every `note_on` with exactly one `note_off`. |
| Timing | `metro.new(callback, interval_seconds)`. Never use `sleep()`. |
| No `require` | The emulator sandbox provides a fixed API — no require or external modules. |

---

## Required file structure

Every script package must provide:

```
scripts/<name>/
  <name>.lua         ← main script (required)
  manifest.json      ← emulator metadata (required)
  README.md          ← user documentation (strongly recommended)
```

---

## Lua header (parsed by doc-extractor.js — must be exact)

Place this at the very top of the `.lua` file, no blank lines within it:

```lua
-- scriptname: Human Readable Name   ← required (line 1)
-- v0.1.0                            ← semver (line 2)
-- @author: Name                     ← optional
-- https://url.optional              ← optional, bare URL on its own line
--
-- One-sentence description.         ← required, first untagged line = short desc
--
-- @key KEY: Label                   ← zero or more keyboard hint lines
```

**Rules:**
- Line 1 must be exactly `-- scriptname: ...`
- Line 2 must be `-- vX.Y.Z`
- The header block ends at the first non-comment line
- Do not split the header with `local` or code statements

---

## Control-map comments (parsed for the grid overlay)

Place these in the header block or grouped under `-- @section` tags anywhere in the file:

```lua
-- @section Section Name   ← resets @screen and @group
-- @screen live             ← main grid (use "live" for the primary screen)
-- @screen settings         ← secondary screen name (any lowercase word)
-- @group Group Name        ← fan of bezier lines in overlay
-- x=N, y=M: Description   ← single cell
-- x=N..M, y=R: Desc       ← column range
-- Row N: Desc              ← full row
-- @group                   ← empty @group = close group, next controls are singletons
```

**Rules:**
- Descriptions must end after the `:` delimiter
- Full-grid controls (`x=1..16, y=1..8`) are excluded from the overlay automatically
- Always declare `@screen live` for main-grid content

---

## Compatibility stubs (required at top of code section)

```lua
local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen    then grid_set_screen    = function(_) end end
if not display_screen     then display_screen     = function(_) end end
if not get_focused_screen then get_focused_screen = function() return "live" end end
```

These ensure the script runs on real hardware where emulator-only functions are absent.

---

## Multi-screen redraw pattern (required if using >1 screen)

```lua
local function redraw()
  if supports_multi_screen then
    grid_set_screen("live")
    grid_led_all(0)
    -- draw live content

    grid_set_screen("settings")
    grid_led_all(0)
    -- draw settings content
  else
    -- hardware: draw only the active screen
    if alt_held then
      -- draw settings
    else
      -- draw live
    end
  end
  grid_refresh()   -- ONE call at the end — flushes all buffers simultaneously
end
```

**Never call `grid_refresh()` mid-draw.** Call it exactly once at the end of `redraw()`.

---

## Switching the displayed screen

```lua
-- When entering a secondary screen:
if display_screen then display_screen("settings") end

-- When returning to main:
if display_screen then display_screen("live") end
```

Always guard with `if display_screen then` for hardware compatibility.

---

## event_grid signature

```lua
--- Grid key event handler.
-- @tparam number x  grid column (1-based)
-- @tparam number y  grid row (1-based)
-- @tparam number z  1 = pressed, 0 = released
function event_grid(x, y, z)
  -- determine which screen this input comes from (emulator-aware)
  local screen = get_focused_screen and get_focused_screen() or "live"
  local in_settings = alt_held or (screen ~= "live")
  ...
end
```

---

## MIDI note hygiene (critical)

- Track every active note in a variable or buffer.
- Send `midi_note_off` before overwriting a note variable.
- On stop/panic, iterate all active notes and send `off` for each.
- Use `midi_panic()` as a last resort (sends CC 120 All Sound Off).
- Chord notes need their own separate tracking (e.g. `chord_notes = {0, 0, 0}`).

---

## Metro / clock

```lua
local m_clock

local function tick()
  -- game logic here
  redraw()
end

m_clock = metro.new(tick, 60 / bpm / 4)  -- interval in seconds
m_clock:start()

-- To change interval without restarting:
m_clock:start(new_interval)
```

---

## LDoc function comments

Use triple-dash for documented functions:

```lua
--- Short description of the function.
-- Longer explanation if needed.
-- @tparam type name description
-- @treturn type description
local function my_func(x, y)
```

---

## manifest.json shape

```json
{
  "project_name": "my-script",
  "project_url":  "https://github.com/user/repo",
  "author":       "Your Name",
  "description":  "One-sentence summary for the script selector",
  "discussion_url": "https://llllllll.co/t/thread/12345",
  "documentation_url": "https://raw.githubusercontent.com/user/repo/main/README.md",
  "tags": ["neotrellis", "sequencer"],
  "lua_file": "myscript.lua"
}
```

The top-level `scripts/manifest.json` also needs an entry:

```json
{
  "name": "My Script",
  "file": "my-script/myscript.lua",
  "readme": "my-script/README.md",
  "description": "One-sentence summary",
  "author": "Your Name",
  "version": "0.1.0",
  "gridSize": [16, 8]
}
```

---

## README.md recognized sections

The emulator renders these H2 headings with special UI treatment:

| Heading       | Treatment |
|---------------|-----------|
| `## Usage`    | Getting-started block |
| `## Controls` | Reference table |
| `## Settings` | Inline docs |
| `## Notes`    | Callout block |
| `## Changelog`| Collapsed by default |

Other H2 sections render as plain markdown.

---

## Code generation checklist

Before returning any generated code, verify:

- [ ] Header block is at line 1, uninterrupted, correct field order
- [ ] `-- scriptname:` on line 1, `-- vX.Y.Z` on line 2
- [ ] Compatibility stubs present and placed before any use of the guarded functions
- [ ] `redraw()` ends with a single `grid_refresh()` call
- [ ] Every `midi_note_on` has a paired `midi_note_off` path
- [ ] `display_screen` calls are guarded with `if display_screen then`
- [ ] No `require()` calls
- [ ] No growing tables or string concatenation inside metro tick callbacks on Pico paths
- [ ] `manifest.json` fields are all filled in (no placeholder URLs left)
- [ ] README has at least `## Usage` and `## Controls` sections

---

## Reference files

| File | Role |
|------| ------|
| [`SCRIPT_STANDARD.md`](https://raw.githubusercontent.com/jonwaterschoot/diii-neotrellis-emulator/main/SCRIPT_STANDARD.md) | Canonical parser spec — fetch from GitHub for always-current version |
| `serpentineSeqr/serpentine_dev.lua` (parent repo · [GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/serpentine_dev.lua)) | Full reference implementation |
| `serpentineSeqr/README.md` (parent repo · [GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/README.md)) | Reference README |
| `engine/doc-extractor.js` (parent repo · [GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/engine/doc-extractor.js)) | Parser source |
