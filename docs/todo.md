# Documentation Revamp TODO (Phase 2)

As the project has grown, the documentation has become slightly repetitive across multiple files. The next phase of documentation should focus on creating a clear, linear structure without repeating concepts.

## Tasks
- [ ] **Consolidate 'Getting Started'**: Combine firmware flashing (`firmware-installation.md`), building (`building-firmware.md`), and general setup into a single, cohesive setup guide.
- [ ] **Restructure the Walkthrough**: Extract the detailed Lua execution logic and LDoc API reference out of `walkthrough.md` and move it to a dedicated developer-focused `script-standards.md` or `developer-guide.md`. Keep `walkthrough.md` solely for navigating the emulator UI.
- [ ] **Hardware vs. Emulation Differences**: Create a specific page clearly outlining the differences between running scripts natively in the browser emulator versus exporting and running them natively on the hardware.
- [ ] **MIDI Documentation**: Add screenshots and clearer diagrams explaining MIDI connectivity and the challenges with multiple timers/clock syncing logic so script developers understand the physical constraints.

--

## Sorting my own scripts: 
- better structure
  - done (2026-10-25): this repo is now the only home for the scripts. The firmware repo keeps only selector and the upload threshold tests.
  - the dropdown is grouped (Music / Color demos / Tests) via a `group` field in `scripts/manifest.json`
  - `monochrome_fallback.lua` moved from `uf2s/` to `scripts/colorfallback/`, `powertest/power_test.lua` restored, stale `_min` files regenerated
- clear link to the (llm) example

### Scripts dedicated list / modal?

In general: perhaps we make a json file that can be used to add other scripts from which we can load into our repo, still linking to the originals not copying. 
A more elaborate list to load scripts that remembers / stores the scripts locally in browser memory   


## Testing scripts:

https://github.com/nolliegray/stepiii

  - loads but doesn't seem to play, or respond beyond initial loading. Is it a clock issue?
  - fixed (2026-10-25): it calls `midi_tx` for MIDI clock, which the emulator didn't have. Every failing metro tick left its error on the Lua stack, and after ~20 errors every metro and key press failed. The emulator now has `midi_tx`, clears errors and shows each one once. Checked in the dev server: works.

https://github.com/duncangeere/sluiiice

  - ok it's a 90° script, but we cannot know this from any settings file, so it's ok

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
  - uses 11 metros. iii has 12, the emulator has no limit (yet).

https://github.com/nolliegray/arpiii

  - loads but doesn't seem to play, or respond beyond initial loading. Is it a clock issue?
  - fixed (2026-10-25): same stack problem, caused by `collectgarbage("step")` every 0.1 s. It also relies on metro counts (one-shot gate-off) and `m.time = x` (swing); emulator metros now follow iii for both. Plays in a node test.
  - MIDI keyboard input still won't work: see "Open compatibility issues" below.


https://github.com/liamelliot/iiinvert/

  - works
  - geared towards drums, perhaps the emulator should include a few drum options (e.g. take the models I used in WAV.builder Mangler)

https://github.com/liamelliot/fell

  - works, first one i fiind that uses 16 x 16 grid, and first proven use case!
  - only lua file, no readme for docs → https://llllllll.co/t/fell/72593

  - This makes a good case for also allowing to view the content of lua files inside the inspector (even allowing to change parameters!)


https://github.com/behindkeyframes/fugace

  - works

https://github.com/boreal-ground/many-roads-grid

  - stays empty, but that's logical since it's needing those lua's in place, we could mark it as a script loader
  - I made my own version: selector

C:\Users\jonwa\Documents\GitHub\neotrellis-monome\neotrellis_monome_picosdk_iii\doc\scripts\selector\selector.lua  

  - logical error:
```
Loading selector.lua…
Lua runtime error: selector.lua:52: attempt to call a nil value (global 'fs_list_files')
Error: selector.lua:52: attempt to call a nil value (global 'fs_list_files')
```
   - also mark as a selecting script and use the scripts in the the loader
   - idea: provide `fs_list_files()` (and `fs_run_file()`) from `scripts/manifest.json`, so selector shows the bundled scripts

## Open compatibility issues (found 2026-10-25)

- **`event_midi` is never called.** Incoming MIDI notes are turned into grid presses and nothing reaches the script, so external clock sync (stepiii/arpiii clock source 2) and arpiii's MIDI keyboard don't work. Proposal: when a script defines `event_midi`, send incoming MIDI there and skip the note→pad mapping.
- **sandman note-offs on hardware**: `midi_note_off(note, ch)` uses the 2-argument form. On iii the second argument is the velocity, so on the device the note-offs go to channel 1. The emulator still accepts the 2-argument form, so this doesn't show here. Fix in sandman: `midi_note_off(note, 0, ch)`.
- **Metro limit**: iii has 12 metros, the emulator has none. Warn when a script makes more than 12?
- **Not in the emulator yet**: `grid_led_get`, `fs_*` functions, `metro.free`.
- **Emulator-only**: `grid_brightness`, `grid_set_screen`, `display_screen`, `get_focused_screen` don't exist on the device. Scripts should check `if grid_brightness then` (leaveseqr does).
- All of this belongs on the "Hardware vs. Emulation Differences" page above.

 
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

