# Documentation Revamp TODO (Phase 2)

As the project has grown, the documentation has become slightly repetitive across multiple files. The next phase of documentation should focus on creating a clear, linear structure without repeating concepts.

## Plan (2026-10-26)

Work through the steps in order: fix what's broken first, document once behavior is stable, add features last. Each step points to the notes further down in this file.

**Context for a new session**
- Engine: `engine/lua-loader.js` registers the Lua globals and the metro table; `engine/grid-api.js` holds the grid, MIDI, synth and metro timing. `index.html` holds the UI (script dropdown, MIDI monitor, FX).
- iii reference: the firmware repo at `../neotrellis-monome` has the real API. `neotrellis_monome_picosdk_iii/src/iii/lua/lib.lua` (metro, midi helpers, pset), `src/iii/vm.c` (built-ins such as `midi_tx`, `fs_*`), `src/device_lua.c` (grid functions). Match those when adding to the emulator.
- Testing without a browser: run the real engine in node with the `fengari` npm package. Set `globalThis.window = { fengari: require('fengari') }` and a `localStorage` stub, import `grid-api.js` and `lua-loader.js`, override `api.midi_note_on/off` to count notes, call `loader._execute(source, name)`, then drive keys with `api._luaEventGrid(x, y, z)` on timers. Run all scripts in `scripts/manifest.json` after engine changes to catch regressions. Confirm sound changes in the dev server (`npm start`).
- External scripts can be fetched with `gh api repos/<owner>/<repo>/contents/<file>.lua --jq .content | base64 -d`.

### Step 1 — Compatibility, round 2
- [x] **`event_midi`**: when the script defines `event_midi(d1, d2, d3)`, send incoming MIDI there and skip the note→pad mapping in `grid-api.js` `_handleMidiInput`. The filter CC keeps working. The status bar warns once when the script receives its own output (same bytes sent within 20 ms). Node test: stepiii and arpiii follow external clock, arpiii arpeggiates a chord from MIDI in. Still to try with a real MIDI device.
- [x] **sandman**: `midi_note_off(note, ch)` → `midi_note_off(note, 0, ch)` (5 calls in `scripts/sandman/sandman.lua`), then regenerate `sandman_min.lua` with `minify_lines()` from `scripts/minify.py`.
- [x] **`grid_led_get(x, y)`**: returns the 0–15 level, as on the firmware. Also added the firmware's `rel` flag: `grid_led(x, y, z, rel)` and `grid_led_all(z, rel)` add to the current level.
- [x] **Metro limit**: iii has 12 metros. Warn in the status bar when a script creates more. Added `metro.free(id)` and `metro.free_all()` too.
- [x] **selector in the emulator**: provide `fs_list_files()` and `fs_run_file(name)` from `scripts/manifest.json`. Selector and many-roads both work (node test). Marking them as loader scripts moves to the Step 3 registry.
- [x] **lib.lua helpers** (found while re-testing kria_iii): `engine/iii-lib.js` runs the firmware's lib.lua helpers before every script: `midi_out`, `midi_to_msg`, `ps`, `pt`, `round`, `linlin`, `wrap`, `clamp`, `_quote`, `slew`. `require` is `fs_run_file`, as on the device.
- [x] **Re-test the external list** below and update the notes. Done in node; arpiii and fell also checked by ear in the dev server (2026-10-26).

### Step 2 — Sound glitches
Done in `grid-api.js` (2026-10-26), checked with a mocked Web Audio in node; confirm by ear in the dev server.
- [x] Short fade on play/pause to remove clicks. The speaker toggle and volume fade (~60 ms) instead of jumping. Sound now really starts muted, as the speaker icon shows; clicking the grid or the speaker unmutes.
- [x] Smooth delay-time changes (no crackles). A tape-style glide still crackled, so each time change now starts a new delay line (at most every 80 ms while dragging): new sound goes to it while the old line's echoes ring out (≤ 3 s). Delay amount and feedback ramp.
- [x] Smooth reverb setting changes. Amount ramps. Decay applies on slider release: new sound goes to a new reverb while the old tail rings out. Decay 0 no longer throws.

### Step 3 — Script list and loader
Done 2026-10-26; the UI part is not yet tried in a browser.
- [x] JSON registry of external scripts that links to the originals (no copies): `scripts/external.json`, shown as "External scripts (from their repos)" in the dropdown. Entries can set `file`, `gridSize`, `orientation` (sluiiice: USB up), `docs` and `loader` (selector, many-roads). Repos without a README (fell) get a generated Guide page. The scripts are credited to their authors and aren't copied: the file's `about` note, the dropdown label, a notice above each one's Guide and a "Scripts by others" section in the README say so, with an issue link for authors who'd rather not be listed.
- [x] Remember loaded scripts in browser storage: a "Recent" group with the last 8 repos imported with ⇱ (fetched fresh) and files opened from disk (source kept, up to 200 KB). "✕ Clear recent" empties it.
- [x] Show the Lua source in the inspector: a Source tab with line numbers and Lua colouring; a Lua error marks its line. It scrolls by itself, so the horizontal scrollbar stays in view; "Wrap" wraps long lines.
- [x] Edit and run: "✎ Edit" opens the source in an editor that keeps the colours and line numbers (a transparent textarea over a coloured copy). Lines changed from the loaded script are flagged (amber changed, green added, red tick where lines were removed); click a flag to restore that change, or "↺ Restore all"; Ctrl+Z undoes a restore. The view flags changed lines too. "▶ Run" (Ctrl+Enter) runs it as the current script, "Auto-run" runs 1 s after you stop typing. Edited scripts are kept under Recent. Editable parameters (sliders for values): later.
- [x] ↻ Reload and hot reload no longer blank the Guide tab.
- [x] Clear link to the (llm) example: "Write your own → Script template" in the dropdown loads `template/myscript.lua` with `GUIDE.md` in the Guide tab, which now links `LLM_INSTRUCTIONS.md`. The Docs tab's empty state points there too.
- [x] README links and images now resolve against the script's own folder instead of the emulator page.

### Step 4 — Docs
- [x] Hardware vs. Emulation Differences: `docs/hardware-vs-emulator.md` (in the docs nav under Emulator Usage), 2026-10-26.
- [x] Found while writing it: **↓ Device** checked for Lua 5.1, but the device runs Lua 5.5, so it flagged valid code (`//`, bit operators). It now flags what the device really refuses: assigning to a `for` loop variable (read-only in 5.5). `LLM_INSTRUCTIONS.md` said Lua 5.4; now 5.5.
- [x] Consolidate Getting Started: `docs/getting-started.md` (browser, local, NeoTrellis grid). Building the firmware links to the firmware README.
- [x] README script list: by group, with the template; the README is now the short pillar page.
- [x] Restructure the Walkthrough: UI only, current. Internals → `docs/developer-guide.md`.
- [x] Docs audit below, done 2026-10-26: new `colour.md`, `start-a-script.md` (the template guide), LeaveSeqr page; `uf2s/` and `roadmap.md` merged and removed; script standard and guide corrected. The site builds without warnings and all links resolve.
- [x] Found during the audit: live reload didn't work for scripts in subfolders (`fs.watch` wasn't recursive), and the multi-screen test's thumbnail clicks no longer matched its name. Both fixed.
- [x] New screenshots (2026-10-26): `emulator_screenshot2.png` (Live Manual, README and walkthrough) and `emulator_screenshot_editor.png` (Source editor, walkthrough).
- [x] **`event_key` was never called** (Sandman, LeaveSeqr and the template defined it). Now the emulator calls `event_key(key)` on each key press when a script defines it, instead of its fixed pad presses (2026-10-26). LeaveSeqr's handles Tab now (it relied on the Tab → x1, y8 pad), and Sandman's hints match its handler. Documented in the walkthrough, script standard, guide, template and LLM instructions.
- [x] MIDI Documentation: kept general (2026-10-26), since MIDI ports and connections differ per system. The walkthrough's MIDI section covers the browser permission, virtual ports and timing; Hardware vs. emulator covers the differences. No screenshots.

#### Docs audit (2026-10-26)

The README is the pillar: what this is, what it can do, and links into the docs. The docs go deeper without repeating it. Firmware details live in the firmware repo and its releases; here we only link.

| File | Now | Plan |
|---|---|---|
| `README.md` | Story, colour details, outdated script list, generic setup | ✓ Condense: what it is, links, scripts (mine by group + others + template), credits, license. Colour details → colour page |
| `docs/index.md` | Overview that repeats the README; also the emulator's About dialog | ✓ Short docs home: one paragraph + map of the docs |
| `docs/walkthrough.md` | Outdated (old file names, `emulator.html`), mixes UI and internals | ✓ UI only, current. Internals → developer guide |
| `SCRIPT_STANDARD.md` | Reference; some stale parts (import "planned", missing reference file, README "special formatting" that doesn't exist) | ✓ Keep as the reference, fix stale parts |
| `scripts/template/GUIDE.md` | Tutorial; repeats colour advice | ✓ Keep; colour → link to the colour page; add to the docs site |
| `scripts/template/LLM_INSTRUCTIONS.md` | Self-contained for LLMs | Keep self-contained (repetition is the point) |
| `uf2s/readme.md` | Firmware install notes | ✓ → `docs/getting-started.md` |
| `uf2s/copy-readme-…md` | Copy of the firmware README, with dead links | ✓ Deleted; links the firmware repo |
| `roadmap.md` | Old list; much done | ✓ Merged into "Ideas" below; deleted |
| Script READMEs | Manuals | ✓ Keep; LeaveSeqr added to the docs site |

Target nav: Home · Getting started · Using the emulator (Walkthrough, Hardware vs. emulator) · Writing scripts (Start a script, Script standard, Colour & monochrome, Developer guide) · Scripts · Project (README, To do).

### Step 5 — New sound features
- [x] Drum sounds (2026-10-26): `engine/drums.js`, seven drums ported from the Mangler (WAV.builder). General MIDI notes on one channel (36–51 = 4×4 pads), or a channel per drum; ⚄ re-rolls a drum; closed hat chokes open hat. In a new Sound tab.
- [x] Sound tab pops out into a movable, resizable window (desktop); docked on mobile.
- [x] Synth models (`engine/synth.js`): Triangle, Sine, Soft saw, Hollow square, Wide pad, Pluck, FM bell, with Drift (pitch wander) and Movement (filter sweep). Loudness matched (RMS 0.54–0.58).
- [ ] Listen to all of it in the dev server: drum levels against the synth, the models, drift/movement depths.
- [ ] Reverb models (not started).
- [ ] Notes still stop after 3 s if the script never sends a note off (a guard against stuck notes); long pads may want more.

### Step 6 — Design
- [x] Favicon (grid icon, `docs/img/favicon.svg`, also the docs site's) and pure-grey backgrounds: every colour is a token now, the blue tints became neutral greys of the same brightness (2026-10-26).
- [x] ◐ View menu: light theme (the grid stays dark; darker accents for contrast) and pad corners (square / slightly round / round). Dark and slightly round stay the default; both are kept in the browser.
- [x] Six side tabs fit again (they size by their label).
- [x] Monochrome: ◐ View → Grid → Monochrome hides `grid_led_rgb`, `grid_color` and `grid_color_intensity` from the script, so it runs its own fallback as on a monome grid (switching reloads the script). Invert dropped: the light theme covers it.
- [x] Mechatrellis keys (◐ View → Keys): dark keycaps close together with a glowing LED at the top middle; Fit uses the tighter gap. The light theme's grid panel is light grey.

## Tasks
Moved into Step 4 above (2026-10-26); all done.

--

## Sorting my own scripts: 
- better structure
  - done (2026-10-25): this repo is now the only home for the scripts. The firmware repo keeps only selector and the upload threshold tests.
  - the dropdown is grouped (Music / Color demos / Tests) via a `group` field in `scripts/manifest.json`
  - `monochrome_fallback.lua` moved from `uf2s/` to `scripts/colorfallback/`, `powertest/power_test.lua` restored, stale `_min` files regenerated
- clear link to the (llm) example

### Scripts dedicated list / modal?

Done (2026-10-26): `scripts/external.json` plus a "Recent" list in browser storage, both in the dropdown (see Step 3).

In general: perhaps we make a json file that can be used to add other scripts from which we can load into our repo, still linking to the originals not copying. 
A more elaborate list to load scripts that remembers / stores the scripts locally in browser memory   


## Testing scripts:

https://github.com/nolliegray/stepiii

  - loads but doesn't seem to play, or respond beyond initial loading. Is it a clock issue?
  - fixed (2026-10-25): it calls `midi_tx` for MIDI clock, which the emulator didn't have. Every failing metro tick left its error on the Lua stack, and after ~20 errors every metro and key press failed. The emulator now has `midi_tx`, clears errors and shows each one once. Checked in the dev server: works.

https://github.com/duncangeere/sluiiice

  - ok it's a 90° script, but we cannot know this from any settings file, so it's ok
  - script bug, shows on the device: `strum()` calls `metro.free(strumclock)` with the metro instead of its id (`strumclock.id`). On iii that throws, so every strum leaks a metro, and after about 10 strums `metro.init` returns nil. The emulator now throws the same error ("pass m.id, not the metro"). Worth reporting upstream.

https://github.com/aktsom/kria_iii
  
  - Fails to load with error: 
    ```
    Connecting to github:aktsom/kria_iii…
    Trying kria_iii.lua…
    Fetching README…
    Lua runtime error: kria_iii.lua:2: lua_gc not implemented
    Error: kria_iii.lua:2: lua_gc not implemented
    ```
  - fixed (2026-10-25): fengari has no garbage collector API, so `collectgarbage()` now gets a stand-in that returns 0. Loads; playback not tested yet.
  - uses 11 metros. iii has 12, and lib.lua's slew takes one at boot, so kria fits exactly.
  - fixed (2026-10-26): play (row 7, step 15) failed with `attempt to call a nil value (global 'midi_out')`. The emulator now runs the lib.lua helpers. Plays notes and MIDI clock in a node test.

https://github.com/nolliegray/arpiii

  - loads but doesn't seem to play, or respond beyond initial loading. Is it a clock issue?
  - fixed (2026-10-25): same stack problem, caused by `collectgarbage("step")` every 0.1 s. It also relies on metro counts (one-shot gate-off) and `m.time = x` (swing); emulator metros now follow iii for both. Plays in a node test.
  - MIDI keyboard input still won't work: see "Open compatibility issues" below.
  - re-tested (2026-10-26): no errors, sends clock and notes; sounds right in the dev server.
  - fixed (2026-10-26): MIDI keyboard and external clock now reach `event_midi` (node test).


https://github.com/liamelliot/iiinvert/

  - works (re-tested 2026-10-26, node: plays, no errors)
  - uses `metro.free_all()`, which the emulator now has. On the device this also stops slew's metro.
  - geared towards drums, perhaps the emulator should include a few drum options (e.g. take the models I used in WAV.builder Mangler)

https://github.com/liamelliot/fell

  - works, first one i fiind that uses 16 x 16 grid, and first proven use case!
  - only lua file, no readme for docs → https://llllllll.co/t/fell/72593

  - This makes a good case for also allowing to view the content of lua files inside the inspector (even allowing to change parameters!)
  - re-tested (2026-10-26): no errors, and its 5 ms metro sounds right in the dev server (node on Windows can't time below ~15 ms, so node tests undercount its notes).


https://github.com/behindkeyframes/fugace

  - works (re-tested 2026-10-26, node: piano roll + play on row 7 x5 plays notes)
  - uses `ps()` a lot; the emulator now prints it to the console instead of dropping it.

https://github.com/boreal-ground/many-roads-grid

  - stays empty, but that's logical since it's needing those lua's in place, we could mark it as a script loader
  - I made my own version: selector
  - works (2026-10-26, node): it runs `many-roads-data.lua` from its own repo, lists the bundled scripts and `require`s the one you press. Files that aren't bundled scripts are looked up next to the running script.

C:\Users\jonwa\Documents\GitHub\neotrellis-monome\neotrellis_monome_picosdk_iii\doc\scripts\selector\selector.lua  

  - logical error:
```
Loading selector.lua…
Lua runtime error: selector.lua:52: attempt to call a nil value (global 'fs_list_files')
Error: selector.lua:52: attempt to call a nil value (global 'fs_list_files')
```
   - also mark as a selecting script and use the scripts in the the loader
   - done (2026-10-26): `fs_list_files()` lists the bundled scripts by file name and `fs_run_file()` runs one. Load selector with the file picker or the GitHub import (`github.com/jonwaterschoot/neotrellis-monome/tree/main/neotrellis_monome_picosdk_iii/doc/scripts/selector`).

## Open compatibility issues (found 2026-10-25)

Settled in Step 1; what's left for script writers is on the [Hardware vs. Emulator](hardware-vs-emulator.md) page.

- **Firmware bug** (for the firmware fork): lib.lua's `slew.deinit()` calls `metro.free(slew.id)`, but `slew.id` is the metro, not its number, so it throws on the device and in the emulator. Fix: `metro.free(slew.id.id)`, or store the number.
- **sluiiice** calls `metro.free(strumclock)` with the metro; worth reporting to its author (see its note above).

## Ideas (from the old roadmap.md, 2026-10-26)

**Serpentine**
- Make the death animation faster, or speed it up over the last 2–3 bars.
- The panic button doesn't (fully) work.
- BPM sync in or out (earlier attempts failed; `event_midi` now gets clock, see stepiii for an example).
- Docs: the spawn quantity control needs a title.

**Emulator**
- Show which pads are held (right-click hold); the yellow border is hard to see on Serpentine's yellow.
- Search or filter in the script list.
- A changelog for the emulator itself.
- How can someone add their script to the list? Answer in the docs: open an issue or a pull request adding it to `scripts/external.json`.
- Script standard: a `@type hold|toggle` annotation for momentary vs. toggle pads.

**Ports**
- Serpentine on norns (shield XL): can it keep its colours?
- An Anbernic version, with a synth driven by the NeoTrellis, or a bigger grid on its screen.

## Synth / sound

- play pause small fade to avoid clicks
- synth (more models?)
- delay:
  - smooth delay time changes so it doesn't create glitches or crackles
- reverb: 
  - different models
  - smoothly fade settings (e.g. changing )
- add drum sounds (option to set channels per sound, add seven sounds at most, variable randomizer for duifferent sounds)

## Design 

**ICO icon** use a grid icon for the pages

**bg colors** use pure grays for backgrounds instead of current bluish tints.

**option to toggle rounded corners**

**Other UI options?** e.g. monochrome, invert, light mode → Dark mode is always default

## UF2 versions 
- delete here and only refer to the release of the og fork?
  - done (2026-10-26): UF2 files removed from `uf2s/`; the docs link to [v2026.10](https://github.com/jonwaterschoot/neotrellis-monome/releases/tag/v2026.10) via releases/latest.

