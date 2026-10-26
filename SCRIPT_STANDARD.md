# Script Documentation Standard

This document defines the standard for how scripts are documented in this emulator.
It is intentionally kept close to the norns/monome ecosystem conventions so that community
scripts can be imported with minimal adaptation.

---

## Overview

A script is a single `.lua` file, or a folder with the `.lua` file and more. The emulator reads its documentation from three places:

| Source | Used for |
|---|---|
| Comments in the `.lua` file | The Docs tab, the Live Manual overlay and the keyboard hints (sections 1, 2, 6 and 7) |
| `README.md` next to the `.lua` file | The Guide tab (section 3) |
| `manifest.json` in the folder | Which `.lua` file to load and where the README is, when importing from a repository (section 4) |

A script doesn't need all three. A `.lua` file with good comments works on its own; a repository with the `.lua` file and a `README.md` is the recommended minimum.

---

## 1. Lua file header (required)

The top of every script should have an uninterrupted block of `--` comments:

```lua
-- scriptname: Human Readable Script Name
-- v1.0.0
-- @author: Your Name
-- llllllll.co/t/your-thread  (or any URL)
--
-- One-line description of what the script does.
```

Rules:
- First line: `-- scriptname: Name` (parsed by `doc-extractor.js`)
- Second line: `-- vX.Y.Z` (semver, parsed as version)
- `@author` line is optional but encouraged
- A bare URL on its own line is parsed as the discussion/reference link
- The first untagged line after `scriptname` becomes the short description
- The header ends at the first non-comment line
- Optional: `-- @orientation portrait` (or `portrait-cw`, `portrait-ccw`) in the first 30 lines rotates the grid when the script loads, for scripts meant to be played with the grid turned 90°

This mirrors the norns script header convention used in the community catalog.

---

## 2. Inline control map comments (for the grid overlay)

Inside the script, use `--` comments in the following format to describe grid positions.
These are extracted by `doc-extractor.js` and rendered as the map overlay.

```lua
-- x=1, y=8: ALT toggle — momentary press opens Settings, double-tap = sticky
-- x=1..8, y=1: Spawn quantity slider (2 fruits per step, max 16)
-- Row 3, x=1: Autopilot mode cycles NON → SEM → AUT
-- Row 6, col 2..7: Black keys — C# D# F# G# A# (skips the gap)
```

Supported location formats (all case-insensitive):
- `x=N` — single column
- `x=N..M` — column range
- `y=N` — single row (as row number)
- `x=N, y=M` — specific cell
- `Row N` — entire row
- `Row N, col M` — specific cell by row/col
- `Cols N-M` / `Col N` — column range or single col

A control comment must end with `: description` — the colon is the delimiter.

### Sections, groups, and screen assignment

The hierarchy is: **Section → Group → Control**

```lua
-- @section Section Name    ← major logical block; resets @screen and @group
-- @screen live             ← all controls below go to the main (primary) grid
-- @screen settings         ← named alt screen — shown in the ghost grid beside main
-- @screen menu             ← another named alt screen — gets its own tab in the ghost grid

-- @group Group Name        ← start a named group; controls below belong to it
-- @detail First line of extended description for this group.
-- @detail Additional lines accumulate — each @detail line appends to the previous.
-- x=N, y=M: Description   ← sub-control inside the group
-- x=N, y=M: Description
-- @group                   ← empty @group clears the group; next controls are singletons
-- x=N, y=M: Description   ← singleton — gets its own overlay card
```

**`@detail text`** attaches an extended description to the group declared immediately
above it. Multiple consecutive `@detail` lines are concatenated with a newline, so
you can write multi-line explanations. The detail is cleared whenever a new `@group`
or `@section` tag is encountered, so each group gets its own isolated annotation.
The detail is surfaced in the live manual panel in the emulator as supplementary copy
below the group's control list.

```lua
-- @group Water Tracks
-- @detail Each row is an independent sequencer track with its own playhead.
-- @detail When a leaf sits on a playhead position, it triggers a note.
-- @detail Track length, speed, MIDI channel, and octave are set on the Seq screen.
-- Row 5: TR1 — Water surface, base octave
-- Row 6: TR2 — Underwater mid, one octave down
-- Row 7: TR3 — Underwater deep, two octaves down
```

### Best Practices for Layout and Ordering

#### 1. Range Prefixing and Labels
When documenting a range of pads (e.g., `x=1..4`), you can include a descriptive "prefix" followed by a separator like an em-dash (` — `) or colon (`:`). The renderer ignores this prefix when calculating how many words match the pad count.
- **Good:** `-- x=1..4, y=7: SEAS — SPR SUM AUT WIN` (4 labels for 4 pads; prefix ignored)
- **Bad:** `-- x=1..4, y=7: SEAS SPR SUM AUT WIN` (5 words for 4 pads; labels may break)

#### 2. The Capture Rule for @detail
To ensure that the sidebar "live manual" captures the full description, always place the coordinate mapping line at the **bottom** of the group block.
- **Correct Ordering:**
  ```lua
  -- @group Themes
  -- @detail Each season changes the color and character of the notes.
  -- x=1..4, y=7: SEAS — SPR SUM AUT WIN
  ```

#### 3. Handling Gaps (Piano Layouts)
For non-contiguous controls (like piano black keys), use **split ranges** instead of placeholders to ensure perfect physical alignment:
```lua
-- x=2..3, y=3: BLACK — C# D#
-- x=5..7, y=3: BLACK — F# G# A#
```

**`@section`** defines a major logical grouping (e.g. "Grid Layout", "Settings View").
Resets both `@screen` and `@group`.

**`@screen <name>`** sets which visual grid this section/group renders on in the map overlay.

**Naming convention:**
- `live` — always the primary/main screen. This name is fixed and expected by the emulator.
  It is the only screen shown in single-view by default and always occupies the main grid in dual-view.
- Any other name becomes a **secondary screen** — shown in the ghost grid (dual-view) or swapped
  in as the main view (single-view). Use short, descriptive lowercase words: `settings`, `menu`,
  `edit1`, `page2`, etc. Scripts with multiple secondary screens get a tab row in dual-view
  so the user can switch between them.

The name is used as the ghost grid label and in the minimap. Persists until the next
`@section` or another `@screen` tag.

**`@group Name`** starts a named group. All controls until the next `@group`, `@group`
(empty, to close), or `@section` belong to this group. In the overlay, the group renders
as one card with a fan of bezier lines to each sub-control's pad position. An empty
`-- @group` closes the group — subsequent controls become singletons again.

**Full-grid controls** (`x=1..16, y=1..8`) are automatically excluded from the overlay
since they describe the whole grid rather than a specific interaction point.

### Multi-screen rendering (required pattern for dual-view and minimap)

The emulator maintains a **separate frame buffer per screen name**. The minimap and ghost grid
(dual-view) are only populated if content is written to those buffers. A script that only ever
draws to `live` will have empty thumbnails and an empty ghost grid.

**Required approach:** render ALL screens into their buffers on every `redraw()`, then call
`grid_refresh()` once. `grid_refresh()` flushes every buffer simultaneously — the minimap,
ghost grid, and main grid all update in one pass.

```lua
function redraw()
    -- Primary screen
    grid_set_screen('live')
    grid_led_all(0)
    -- ... draw live content ...

    -- Each secondary screen gets its own buffer
    grid_set_screen('settings')
    grid_led_all(0)
    -- ... draw settings content ...

    -- One flush updates everything: main grid, ghost grid, all minimap tiles
    grid_refresh()
end
```

**`grid_set_screen(name)`** switches which buffer subsequent `grid_led` / `grid_led_rgb` /
`grid_led_all` calls write to. Call it before drawing each screen's content.

**`display_screen(name)`** signals the emulator which screen is currently *active* — this
controls the minimap highlight and switches the ghost grid in dual-view. Call it whenever
the user navigates between screens. Guard with `if display_screen then` for hardware
compatibility (the function only exists in the emulator; see
[Hardware vs. emulator](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/hardware-vs-emulator/)):

```lua
-- When navigating to a secondary screen:
if display_screen then display_screen('settings') end

-- When returning to main:
if display_screen then display_screen('live') end
```

**Backwards compatibility note:** with serial testing with the viii app
to run scripts over serial for OG monome norns compatibility — i learned to not provide
`grid_set_screen`. In that case, scripts should either stub it or branch around it and
draw only the active screen. For example:

```lua
local supports_multi_screen = (grid_set_screen ~= nil)
if not grid_set_screen then grid_set_screen = function(name) end end

function redraw()
  if supports_multi_screen then
    grid_set_screen('live')
    -- draw live and alternate screen buffers...
    grid_set_screen('settings')
    -- draw settings screen...
  else
    -- draw only the currently active screen
  end
  grid_refresh()
end
```

The same compatibility pattern applies to `display_screen` and any alternate-screen logic.

Full example (from serpentine_dev.lua):

```lua
-- @section Grid Layout
-- @screen live
-- x=1, y=8: ALT — momentary hold opens Settings; double-tap = sticky
-- x=2, y=8: Play/Stop — green=running, red=stopped
-- @group D-PAD
-- x=15, y=7: UP
-- x=14, y=8: LEFT
-- x=15, y=8: DOWN
-- x=16, y=8: RIGHT

-- @section Settings View (hold ALT)
-- @screen settings
-- x=1..8, y=1: Spawn Quantity — slider, each step = 2 fruits
-- @group Fruit Type Toggles
-- x=11, y=1: Red — tail shrink, note to pool
-- x=12, y=1: Blue — tail grow, note to pool
-- @group
-- x=1, y=3: Autopilot — dim=manual, bright=auto
-- @group BPM Adjust
-- x=10, y=3: −10 BPM
-- x=11, y=3: −1 BPM
-- x=12, y=3: +1 BPM
-- x=13, y=3: +10 BPM
-- @group
-- @group Root Note Keyboard
-- x=1..7, y=6: Black keys (C# D# F# G# A#)
-- x=1..7, y=7: White keys (C D E F G A B)
```

---

## 3. README.md (recommended for GitHub repos)

A `README.md` in the same folder as the `.lua` file is the script's full manual. The emulator shows it in the Guide tab, rendered as Markdown. Relative links and images resolve against the README's own folder, so `![](img/layout.png)` works.

There's no required structure. These sections are a good order for a grid script:

```markdown
## Usage       ← how to start: what to press first
## Controls    ← what each pad does, often as a table
## Settings    ← the settings or ALT screens
## Notes       ← limits, hardware notes, tips
## Changelog
```

The reference is [`scripts/serpentineSeqr/README.md`](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/README.md).

---

## 4. manifest.json (optional, for importing)

A `manifest.json` in the script's folder tells the emulator which file to load when someone imports the repository. The shape follows the norns community catalog:

```json
{
  "project_name": "serpentine",
  "project_url": "https://github.com/user/repo",
  "author": "your-name",
  "description": "Snake sequencer with arpeggiator for NeoTrellis 16x8",
  "discussion_url": "https://llllllll.co/t/your-thread/12345",
  "documentation_url": "https://raw.githubusercontent.com/user/repo/main/README.md",
  "tags": ["sequencer", "generative", "neotrellis", "rgb"],
  "lua_file": "myscript.lua"
}
```

The emulator uses two fields:

- `lua_file`: the script to load. Without it, the emulator tries `<repository name>.lua`, then `index.lua`, then the first `.lua` file in the folder.
- `documentation_url`: where the README is. Without it, the emulator uses `README.md` in the script's folder, then in the repository root.

The other fields describe the script for people and for future catalogs.

Scripts that come with the emulator are listed in `scripts/manifest.json` instead, which also sets their group in the script list, their README and their grid size: see [Start a script](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/start-a-script/).

---

## 5. Importing from GitHub or Codeberg

**⇱ Import script repo** takes a repository address: `github.com/owner/repo`, `codeberg.org/owner/repo`, or `owner/repo` for GitHub. A folder inside a repository works too: `github.com/owner/repo/tree/main/path/to/script`. The emulator:

1. Tries the `main` branch, then `master`, unless the address names a branch.
2. Reads `manifest.json` if there is one, and finds the `.lua` file as in section 4.
3. Runs the script, and reads its comments for the Docs tab and Live Manual.
4. Shows the README in the Guide tab.

Files from public GitHub and Codeberg repositories can be fetched straight from the browser, so no server is needed.

---

## 6. Keyboard shortcuts

In the emulator, a script can handle keys with `event_key(key)`. It's called once per key press (not on release, and not for a held key's repeats), with the key's name: `"space"`, `"tab"`, `"enter"`, `"up"`, `"down"`, `"left"`, `"right"`, or the character in lower case (`"a"`, `"1"`).

```lua
function event_key(key)
  if key == "tab" then next_screen() end
end
```

R always reloads the script and never reaches `event_key`. A script without `event_key` gets the emulator's fixed pad presses instead (Tab and Space press x1, y8, and so on; see the [walkthrough](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/walkthrough/#keyboard-shortcuts)). The device has no keyboard and never calls `event_key`, so keep every action reachable from the grid too.

### Hints (`@key`)

Scripts can declare their keyboard shortcuts using `@key` tags in the header block.
The emulator reads these and populates the hints bar below the grid automatically.
The `R` key (Reload) is always shown as an app-level entry at the end; do not redeclare it.

```lua
-- @key ↑↓←→: Steer
-- @key Tab: Settings
-- @key Space: Sticky
-- @key 1/2: BPM−
-- @key 3/4: BPM+
-- @key A: Autopilot
```

**Notation rules:**
- Place `@key` lines anywhere in the leading comment block (same area as the header)
- Format: `-- @key KEYS: Label`
- `KEYS` is the text shown in the badge — keep it short (≤8 characters)
- Use `/` to separate two keys that share a label: `1/2` renders as two separate badges with `/` between them
- Unicode symbols are fine: `↑↓←→`, `⌘`, `⇧`
- `Label` is plain text; keep it to 1–2 words

---

## 7. LDoc tag reference (what doc-extractor.js recognizes)

| Tag | Usage | Example |
|-----|-------|---------|
| `-- scriptname: Name` | Script name (first header line) | `-- scriptname: Serpentine` |
| `-- @author: name` | Author (header) | `-- @author: jonwaterschoot` |
| `-- @orientation o` | Rotate the grid on load (header, first 30 lines) | `-- @orientation portrait` |
| `--- description` | Triple-dash opens a doc block | `--- Updates the snake position` |
| `-- @tparam type name desc` | Typed parameter | `-- @tparam number x Grid column (1-16)` |
| `-- @treturn type desc` | Typed return value (`@returns` also works) | `-- @treturn boolean True if alive` |
| `-- @param name desc` | Untyped parameter | `-- @param x Column` |
| `-- @section Name` | Groups following controls | `-- @section Spawner Engine` |
| `-- @screen name` | Which screen the following controls are on | `-- @screen settings` |
| `-- @group Name` | Starts a named group | `-- @group D-PAD` |
| `-- @detail text` | Extended description for the current group (multi-line, accumulates) | `-- @detail Leaves drift slowly downward.` |
| `-- @key KEYS: Label` | Keyboard shortcut hint | `-- @key ↑↓←→: Steer` |
| `-- x=N: desc` | Control map (single cell) | `-- x=1, y=8: ALT toggle` |
| `-- Row N: desc` | Control map (full row) | `-- Row 6: Black keys` |

Tags from the full LDoc spec that are **not** currently extracted (low priority for grid scripts):
`@usage`, `@see`, `@field`, `@release`, `@license`, `@classmod`, `@module`, `@script`

These can be added to `doc-extractor.js` incrementally as needed.

---

## Reference implementations

| File | Role |
|------|------|
| [scripts/serpentineSeqr/serpentine_dev.lua](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/serpentine_dev.lua) | Reference `.lua` — LDoc header, `@section`/`@screen`/`@group` control map |
| [scripts/serpentineSeqr/README.md](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/README.md) | Reference README |
| [scripts/leaveseqr/leaveseqr.lua](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/leaveseqr/leaveseqr.lua) | Full example of `@detail` usage — multi-line group descriptions across all screens |
| [engine/doc-extractor.js](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/engine/doc-extractor.js) | Parser — extracts header + control map from `.lua` source |
