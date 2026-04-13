# How to start a new NeoTrellis script

This folder is a starter template. Copy it, rename things, and build from here.

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

## Step 3 — Declare your keyboard shortcuts (optional)

Add `@key` lines in the header block:

```lua
-- @key ↑↓←→: Steer
-- @key Space: Play/Stop
-- @key Tab: Settings
```

These appear automatically in the hint bar below the grid.

<details>
<summary><strong>▸ How key-to-pad wiring works (with examples)</strong></summary>

The emulator translates certain keyboard keys into **pad press events** — it calls `event_grid(x, y, z)` exactly as if the user had clicked that pad. **Your script decides what that coordinate means.** The wiring below is just how the serpentine reference script uses those pads; you are free to wire any pad to anything.

The only truly fixed key is `R` (reload) — that is handled by the emulator itself and cannot be overridden.

**Example wiring (serpentine reference):**

| Key | Pad fired | What serpentine does with it |
|-----|-----------|------------------------------|
| `↑` `↓` `←` `→` | x=15 y=7 / x=14 y=8 / x=15 y=8 / x=16 y=8 | D-PAD steering |
| `Tab` | x=1, y=8 (press + key-up release) | ALT — momentary hold |
| `Space` | x=1, y=8 (press only) | ALT — sticky toggle |
| `1` `2` `3` `4` | x=10–13, y=3 | BPM −10 / −1 / +1 / +10 |
| `A` / `a` | x=1, y=3 | Autopilot toggle |
| Right-click | any pad | Hold pad (z=1 until release) |

**Concrete example — how this lands in your script:**

When the user presses `↑`, the emulator fires:
```lua
event_grid(15, 7, 1)   -- z=1 = pressed
```
In serpentine that coordinate is the UP button of the D-PAD. In your script it could be anything — a note trigger, a page flip, a tempo nudge. The key just picks the coordinates; `event_grid` decides the meaning:

```lua
function event_grid(x, y, z)
  if z == 0 then return end  -- ignore releases

  if x == 15 and y == 7 then
    -- Arrow-Up (or a physical pad tap at that spot) lands here.
    -- Do whatever makes sense for your script:
    my_page = math.max(1, my_page - 1)
    redraw()
  end
end
```

To declare whichever keys you use for the hint bar:
```lua
-- @key ↑↓: Page up/down   ← just a label — you choose what it means
```

</details>

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
> encountered, so each group gets its own description. A `@detail` placed before any
> `@group` is attached to the first control that follows it.

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

The emulator supports both **RGB (NeoTrellis)** and **monochrome (Monome)** grids. Your script can target either or both.

| Call | When to use |
|------|-------------|
| `grid_led_rgb(x, y, r, g, b)` | RGB grids — r/g/b each 0–255 |
| `grid_led(x, y, lum)` | Monochrome grids — lum 0–15 |
| `grid_led_all(lum)` | Fill entire grid (0 = off) |
| `grid_color_intensity(val)` | Master brightness multiplier |

**The cross-device pattern** — write once, run on both:

```lua
-- Put this helper at the top of your script.
-- On NeoTrellis: uses full RGB. On monochrome: converts to luminance.
local function spx(x, y, r, g, b)
  if grid_led_rgb then
    grid_led_rgb(x, y, r, g, b)
  else
    local lv = math.floor(math.max(r, g, b) / 17)
    if lv < 4 and (r > 0 or g > 0 or b > 0) then lv = 4 end
    grid_led(x, y, lv)
  end
end

-- Then just call spx() everywhere instead of grid_led / grid_led_rgb:
spx(1, 1, 255, 80, 20)   -- orange on RGB, maps to ~lv15 on monochrome
spx(2, 1, 20, 100, 255)  -- blue on RGB, maps to ~lv6 on monochrome
```

The threshold `lv < 4` ensures dimly-coloured pads are still visibly lit on monochrome hardware — pure black deliberately falls through to 0.

**Full working example:** [`color_fallback_demo.lua`](../colorfallback/color_fallback_demo.lua) (in the parent repo at `scripts/colorfallback/`) — four colour zones with fallback, each pad cycles through brightness stages on press.
If using this template standalone: [view on GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/colorfallback/color_fallback_demo.lua).

---

### Single-colour tint — the simple case

If you only want **one colour across the whole grid** (like all-amber, or all-cyan) and don't need different hues per pad, you don't need `spx()` at all. Just call `grid_color(r, g, b)` once and keep using plain `grid_led()`:

```lua
-- Set the global tint once at startup — everything drawn with grid_led()
-- will come out in this colour, scaled by its brightness level (0–15).
grid_color(255, 120, 20)   -- amber tint

-- Now draw exactly as you would for monochrome — no RGB tables, no spx():
grid_led(1, 1, 15)   -- bright amber
grid_led(2, 1, 8)    -- mid amber
grid_led(3, 1, 4)    -- dim amber
grid_led(4, 1, 0)    -- off
grid_led_all(0)      -- clear (also respects tint, but 0 is always black)
grid_refresh()
```

`grid_color` sets a **global tint** — it multiplies every `grid_led` luminance value by that colour. The default tint is white `(255, 255, 255)`, which is why plain `grid_led` looks white/grey without it.

**Comparison at a glance:**

| Approach | When to use | Code change needed |
|----------|-------------|-------------------|
| `grid_color(r, g, b)` + `grid_led` | One colour for the whole grid, varying brightness | One line at the top — nothing else changes |
| `spx(x, y, r, g, b)` | Multiple colours on one grid (or RGB + monochrome fallback) | Replace every `grid_led` call with `spx()` |
| `grid_led_rgb(x, y, r, g, b)` | Full per-pixel colour, RGB hardware only | Direct call, no fallback |

> **Hardware note:** `grid_color` affects the emulator and the NeoTrellis (RGB hardware) identically — it shifts the tint before writing to the frame buffer. On an original monochrome Monome grid the tint has no effect because the hardware only receives a brightness byte, not RGB. If hardware compatibility matters and you want a tinted *look* on monochrome too, use `spx()` instead.

---

### ⚠ Hardware edge case — dim mixed-colour pixels lose their hue

On the physical NeoTrellis, each RGB sub-LED is driven by PWM. At very low duty cycles, individual channels can't sustain their colour: they effectively snap to off before the others do, because each sub-LED has a **minimum threshold** below which it produces no visible light.

**The orange-goes-red problem** is the clearest example. Orange is roughly R=255, G=120, B=0. At dim levels the calculated values shrink proportionally:

```
full bright (lv=15): R=255  G=120  B=0   → looks orange ✓
half bright (lv=8):  R=136  G=64   B=0   → still orange ✓
dim        (lv=3):   R=51   G=24   B=0   → may look orange-ish
very dim   (lv=1):   R=17   G=8    B=0   → G likely falls below LED threshold
                                          → hardware shows red, not orange ✗
```

The green channel drops below the hardware's minimum drive level and disappears, leaving only red. The emulator looks correct because it has no such threshold — which is one of the ways the emulator and hardware can diverge.

**Workaround options:**

1. **Floor your minimum brightness** — don't go below lv 4–5 for mixed-colour pads. The `spx()` helper already does this for the luminance fallback; apply the same idea explicitly in your draw logic:

   ```lua
   -- Instead of drawing at lv=1 (which may shift hue on hardware),
   -- use lv=0 (off) or jump straight to lv=5:
   local function safe_lv(lv)
     if lv <= 0 then return 0 end
     return math.max(5, lv)   -- avoid the dim-but-hue-broken zone
   end
   ```

2. **Use `grid_led_rgb` with pre-scaled values** — compute the dim colour yourself at a ratio that keeps all channels above their threshold:

   ```lua
   -- Dim orange that stays orange on hardware:
   -- Scale down uniformly but keep green channel >= ~20
   local function dim_orange(x, y, scale)   -- scale 0.0–1.0
     local r = math.max(0, math.floor(255 * scale))
     local g = math.max(0, math.floor(120 * scale))
     -- if g would fall below ~20, either zero it (snap to red) or
     -- keep a minimum to preserve the hue:
     if g > 0 and g < 20 then g = 20 end
     grid_led_rgb(x, y, r, g, 0)
   end
   ```

3. **Accept it** — for many scripts the very-dim range is rarely seen and the snap-to-red is barely noticeable. It's worth knowing about rather than always working around.

> The exact threshold varies between NeoTrellis hardware batches and the firmware's LED driver settings. Test on your device if colour accuracy at low brightness matters to your design.

---

**Full colour API reference:**
- [Emulator Walkthrough → Grid Rendering](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/walkthrough/) — look for the **"Grid Rendering"** heading and the `grid_led` / `grid_led_rgb` table.
  > *If that URL has moved: open the project docs, navigate to **Emulator Usage → Walkthrough**, and search the page for `grid_led_rgb`.*
- [Hardware & Compatibility info](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/) — look for **"Monome vs NeoTrellis (Color Setup)"**.
  > *If that URL has moved: open the project docs **Home** page and search for `color setup`.*

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
  "file": "mysequencer/mysequencer.lua",
  "readme": "mysequencer/README.md",
  "description": "What it does",
  "author": "Your Name",
  "version": "0.1.0",
  "gridSize": [16, 8]
}
```

After saving, your script will appear in the emulator's script selector.

---

## Step 9 — Write your README.md

The emulator renders certain H2 sections with special formatting:

| Section        | How it renders |
|----------------|----------------|
| `## Usage`     | Getting-started block |
| `## Controls`  | Reference table |
| `## Settings`  | Inline settings docs |
| `## Notes`     | Callout block |
| `## Changelog` | Collapsed by default |

Any other H2 is rendered as plain markdown.

---

## Quick reference

- **Full standard:** [Script Standards](https://jonwaterschoot.github.io/diii-neotrellis-emulator/script-standards/) — hosted docs, always up to date
  - Raw file (for offline use / LLMs): [`SCRIPT_STANDARD.md`](https://raw.githubusercontent.com/jonwaterschoot/diii-neotrellis-emulator/main/SCRIPT_STANDARD.md)
- **Reference script:** [`serpentine_dev.lua`](../serpentineSeqr/serpentine_dev.lua) (parent repo) · [view on GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/serpentine_dev.lua)
- **Reference README:** [`serpentineSeqr/README.md`](../serpentineSeqr/README.md) (parent repo) · [view on GitHub](https://github.com/jonwaterschoot/diii-neotrellis-emulator/blob/main/scripts/serpentineSeqr/README.md)

---

## Common gotchas

- Always call `grid_refresh()` **once** at the end of `redraw()` — not after individual `grid_led` calls.
- Guard `display_screen()` calls: `if display_screen then display_screen("settings") end`
- Pico memory is limited: avoid large string tables, deep elseif chains, and anonymous function allocation inside hot loops.
- The parser stops the header at the first non-comment line — don't put `local` declarations before closing the header block.
- `@detail` is scoped to the group it follows — a new `@group` or `@section` clears the accumulated detail. Write all `@detail` lines before any control-map lines for that group.
