# Script Documentation Standard

This document defines the standard for how scripts are documented in this emulator.
It is intentionally kept close to the norns/monome ecosystem conventions so that community
scripts can be imported with minimal adaptation.

---

## Overview

A "script package" can consist of either a single file or a folder with multiple files.
The emulator resolves documentation in the following priority order:

1. `manifest.json` (explicit, structured — highest priority)
2. `README.md` alongside the `.lua` file (human-readable, fetched from GitHub raw)
3. LDoc-style comments inside the `.lua` file (always present, used for overlay)

A script does **not** need all three. A solo `.lua` with good inline comments is valid.
A GitHub repo with a `.lua` + `README.md` is the recommended minimum.

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

This mirrors the norns script header convention used in the community catalog.

---

## 2. Inline control map comments (for the grid overlay)

Inside the script, use `--` comments in the following format to describe grid positions.
These are extracted by `doc-extractor.js` and rendered as the map overlay.

```lua
-- x=1, y=8: ALT toggle — momentary press opens Settings, double-tap = sticky
-- x=1..8, y=1: Spawn quantity slider (2 fruits per step, max 16)
-- Row 3, x=1: Autopilot mode cycles NON → SEM → AUT
-- Row 6: Black keys (C# D# F# G# A#) — root note selection when CUS active
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
-- @screen live             ← all controls below go to the game-view grid
-- @screen settings         ← all controls below go to the settings-view grid

-- @group Group Name        ← start a named group; controls below belong to it
-- x=N, y=M: Description   ← sub-control inside the group
-- x=N, y=M: Description
-- @group                   ← empty @group clears the group; next controls are singletons
-- x=N, y=M: Description   ← singleton — gets its own overlay card
```

**`@section`** defines a major logical grouping (e.g. "Grid Layout", "Settings View").
Resets both `@screen` and `@group`.

**`@screen live | settings | game | alt`** sets which visual grid this section/group renders
on in the map overlay. `live` and `game` are synonyms; `settings` and `alt` are synonyms.
Persists until the next `@section` or another `@screen` tag.

**`@group Name`** starts a named group. All controls until the next `@group`, `@group`
(empty, to close), or `@section` belong to this group. In the overlay, the group renders
as one card with a fan of bezier lines to each sub-control's pad position. An empty
`-- @group` closes the group — subsequent controls become singletons again.

**Full-grid controls** (`x=1..16, y=1..8`) are automatically excluded from the overlay
since they describe the whole grid rather than a specific interaction point.

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

A `README.md` in the same directory as the `.lua` file serves as the full human-readable guide,
displayed in the documentation panel below the grid overlays.

There is no required structure, but the following H2 sections are recognized and rendered
with special formatting in the emulator UI:

```markdown
## Controls        ← rendered as a controls reference table
## Settings        ← rendered inline, often maps to ALT-menu docs
## Usage           ← shown as a getting-started section
## Notes           ← rendered as a callout block
## Changelog       ← collapsed by default
```

Any other H2 sections are rendered as plain markdown.

The `serpentineseqr_docs.md` file is the reference implementation of this format —
it should be renamed to `README.md` when the script is packaged for external import.

---

## 4. manifest.json (optional, for emulator discovery)

A `manifest.json` in the script folder enables the emulator to display rich metadata
and supports future catalog-based browsing. The shape mirrors the norns community catalog:

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

Fields:
- `project_name` — display name
- `project_url` — GitHub repo root (used to derive raw file URLs if not overridden)
- `author` — display name
- `description` — one-liner, shown in the script selector
- `discussion_url` — llllllll.co thread or forum link
- `documentation_url` — direct URL to README.md (raw GitHub URL preferred)
- `tags` — array of strings for future filtering
- `lua_file` — filename of the main script (defaults to `index.lua` if omitted)

---

## 5. GitHub import flow (planned)

When a user pastes a GitHub repo URL, the emulator will:

1. Parse the URL to extract `owner/repo`
2. Try to fetch `manifest.json` from the default branch root via:
   `https://raw.githubusercontent.com/<owner>/<repo>/main/manifest.json`
3. If no manifest: try `README.md` at the same path
4. Fetch the `.lua` file (from `lua_file` in manifest, or by scanning for `*.lua`)
5. Run `doc-extractor.js` on the `.lua` source → powers the grid overlay
6. Render the README.md source → populates the docs panel below the grids

CORS: `raw.githubusercontent.com` returns `Access-Control-Allow-Origin: *` for public repos,
so no proxy is needed for the browser fetch.

---

## 6. LDoc tag reference (what doc-extractor.js recognizes)

| Tag | Usage | Example |
|-----|-------|---------|
| `--- description` | Triple-dash opens a doc block | `--- Updates the snake position` |
| `-- @tparam type name desc` | Typed parameter | `-- @tparam number x Grid column (1-16)` |
| `-- @treturn type desc` | Typed return value | `-- @treturn boolean True if alive` |
| `-- @param name desc` | Untyped parameter | `-- @param x Column` |
| `-- @section Name` | Groups following controls | `-- @section Spawner Engine` |
| `-- x=N: desc` | Control map (single cell) | `-- x=1, y=8: ALT toggle` |
| `-- Row N: desc` | Control map (full row) | `-- Row 6: Black keys` |

Tags from the full LDoc spec that are **not** currently extracted (low priority for grid scripts):
`@usage`, `@see`, `@field`, `@release`, `@license`, `@classmod`, `@module`, `@script`

These can be added to `doc-extractor.js` incrementally as needed.

---

## Reference implementations

| File | Role |
|------|------|
| [scripts/serpentineSeqr/serpentine_dev.lua](scripts/serpentineSeqr/serpentine_dev.lua) | Reference `.lua` with inline LDoc header and control map comments |
| [scripts/serpentineSeqr/serpentineseqr_docs.md](scripts/serpentineSeqr/serpentineseqr_docs.md) | Reference README (to be renamed and kept alongside the `.lua`) |
| [engine/doc-extractor.js](engine/doc-extractor.js) | Parser — extracts header + control map from `.lua` source |
