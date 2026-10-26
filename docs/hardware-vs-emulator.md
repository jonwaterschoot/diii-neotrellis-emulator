# Hardware vs. emulator

The emulator runs your Lua script in the browser. On a grid, the same script runs on the Pico with the iii firmware. Most scripts behave the same in both places. This page lists where they don't, so that a script that works in the emulator also works on the device.

## Before you upload

- Download the script with **↓ Device**. It strips comments to make the file smaller, and the status bar warns about code the device won't load.
- Use at most 11 metros. The status bar warns when a script uses more.
- Call emulator-only functions behind a check, such as `if grid_set_screen then`.
- Call `midi_note_off(note, vel, ch)` with all three arguments.
- Free a metro with `metro.free(m.id)`, not `metro.free(m)`.
- Don't count on `fs_write_file`: the emulator's files are read-only.

## Lua version

| | Device | Emulator |
|---|---|---|
| Lua | 5.5 | 5.3 ([Fengari](https://fengari.io)) |

- **Read-only loop variables.** Lua 5.5 doesn't let a script assign to a `for` loop variable. `for i = 1, 8 do i = i + 1 end` runs in the emulator, but the device won't load the script. Copy the variable instead: `local j = i`. **↓ Device** warns about these assignments.
- **Newer features.** `local x <const> = 1` and `<close>` come from Lua 5.4: the device runs them, the emulator gives a parse error. `warn()` is also 5.4: in the emulator it doesn't exist.
- **Integers.** Grid coordinates in `event_grid`, `grid_size_x()` and `grid_size_y()` are integers in both, so `x .. ""` gives `"1"`, not `"1.0"`.

## Memory and script size

The device has little memory. A large script can run out of memory while uploading or while running. The emulator has no memory limit and can't measure memory use:

- `collectgarbage("count")` returns 0.
- `collectgarbage("step")` returns `false`.
- The other `collectgarbage` options do nothing.

A script that runs in the emulator can still be too big for the device. Stock iii can't upload scripts larger than about 32 KB; [my firmware fork](https://github.com/jonwaterschoot/neotrellis-monome) fixes that. **↓ Device** makes a smaller copy without comments.

## Metros

| | Device | Emulator |
|---|---|---|
| Metros | 12; `slew` takes one at boot, so a script gets 11 | No limit; the status bar warns past 12 (counting slew's) |
| When none is left | `metro.init` returns `nil` and prints `metro.init: nothing available` | Keeps working |
| Timing | Hardware timers | Browser timers |

- `metro.free` takes the metro's number: `metro.free(m.id)`. Passing the metro itself, `metro.free(m)`, is an error on the device, and the emulator raises the same error.
- `metro.free_all()` also stops slew's metro, on both.
- Normal tempos keep time in the browser. Very short periods (a few milliseconds) depend on the browser. A tab in the background is slowed down; the emulator then skips ticks instead of playing the missed ones all at once.

## MIDI

Both have `midi_note_on`, `midi_note_off`, `midi_cc`, `midi_tx`, `midi_out` and `event_midi`.

| | Device | Emulator |
|---|---|---|
| MIDI out | USB MIDI to the connected computer | The MIDI output picked in the toolbar (Web MIDI, Chromium-based browsers), plus a built-in synth |
| MIDI in | `event_midi(d1, d2, d3)` | `event_midi` too. A script without `event_midi` gets incoming notes as pad presses (emulator only) |
| CC 74 | Sent as a CC | Also moves the emulator's filter |

- **Note-offs.** Use `midi_note_off(note, vel, ch)`. The emulator still accepts the old two-argument form `midi_note_off(note, ch)`. On the device the second argument is the velocity, so those note-offs go to channel 1.
- **Echo.** If the emulator's MIDI input and output are the same device, a script hears its own output, such as its own clock. The status bar warns when that happens.

## Files and presets

The device has a small file system. The emulator has a read-only stand-in:

| Function | Device | Emulator |
|---|---|---|
| `fs_list_files()` | Files on the device | The bundled scripts, by file name |
| `fs_run_file(name)`, `require(name)` | Runs a file | Runs a bundled script, or a file next to the running script |
| `fs_read_file(name)` | Reads a file | Reads the same files |
| `fs_write_file`, `fs_remove_file`, `fs_file_size`, `fs_free_space`, `fs_reformat` | Yes | Not available |
| `pset_init`, `pset_write`, `pset_read`, `pset_delete` | `pset_*.lua` files | Browser storage |

Because presets live in browser storage, they don't show up in `fs_list_files()`, and presets saved in one browser aren't in another.

The REPL helpers from iii's `lib.lua` (`first`, `ls`, `rm`, `cat`, `mem`, `gc`) don't exist in the emulator. Use them from the diii console.

## Grid and LEDs

| Functions | Where |
|---|---|
| `grid_led` (with `rel`), `grid_led_all` (with `rel`), `grid_led_get`, `grid_refresh`, `grid_size_x`, `grid_size_y`, `grid_intensity` | Device and emulator |
| `grid_led_rgb`, `grid_color`, `grid_color_intensity` | NeoTrellis firmware and emulator. Not on a monochrome monome grid: check `if grid_led_rgb then` ([monochrome fallback](main-readme.md#monochrome-fallback-implementation)) |
| `grid_set_screen`, `display_screen`, `get_focused_screen`, `grid_brightness` | Emulator only ([multiple screens](multi-screen-test.md)) |

- **Size and rotation.** A device's grid size is fixed. In the emulator you pick it in the toolbar, or a script's manifest sets it. `grid_size_x()` and `grid_size_y()` report the chosen size.
- **Colours.** The emulator brightens dim LEDs to look like real ones, but it doesn't copy the NeoTrellis colour shifts at low brightness. See [colour accuracy](main-readme.md#hardware-limitations-color-accuracy).

## Errors, printing and time

| | Device | Emulator |
|---|---|---|
| `print` | The diii console | The browser's developer console (F12), not the Console tab |
| Errors | Printed in the diii console | Each different error shows once in the status bar and the Console tab; the Source tab marks its line |
| `get_time()` | Seconds since the device started | Seconds since the script was loaded |

Use `get_time()` to measure time between events, not as a clock.

## Only in the emulator

- Keyboard shortcuts: R reloads the script, and the other shortcuts press fixed pads, whatever the script. See [keyboard shortcuts](walkthrough.md#keyboard-shortcuts).
- The built-in synth, the effects and the filter play what the script sends as MIDI. The device only sends MIDI.
