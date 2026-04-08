# Sandman

A living portrait of falling sand, leaves and water that turn into music.

Mount your NeoTrellis rotated **90° counterclockwise** (power cable at top). The grid becomes 8 columns × 16 rows in portrait. Grains accumulate at the bottom and become a step sequencer.

- **Author:** jonwaterschoot
- **Version:** v0.1.0
- **Forum:** _(link pending)_

---

## Usage

1. Boot the script. The top row fills with random grains (**reservoir**).
2. Tap one of the four **drop-zone** pads (portrait col 3-6, row 2) to release a grain — it falls and piles up.
3. Hold a drop-zone pad for 0.4 s then release to **stream** up to 16 grains automatically.
4. Tap **left or right half of the reservoir row** to shift it left or right; new grains appear on the far side.
5. Press **Start/Stop** to start the sequencer. Grains that have settled in the **bottom 8 rows** (portrait rows 9-16) become playable steps.
6. Tap settled grains to **mine** them (3 taps clears a grain, freeing space above).
7. Enable **Lock** to freeze physics — grains stop dissolving and the settled area plays like a normal pad grid.

---

## Controls

### Main (Live) Screen

| Portrait position | Hardware position | Label | Description |
|---|---|---|---|
| Col 1, Row 3 | x=14, y=1 | **ALT** | Tap → Cycle screens (Live/Seq/Scale) |
| Col 1, Row 4 | x=13, y=1 | **Start/Stop** | Green = running, Red = stopped |
| Col 1, Row 5 | x=12, y=1 | **Lock** | Cycle dissolve rate (Off/Half/Normal) |
| Col 8, Row 3 | x=14, y=8 | **Reset** | Soft White/Grey. Resets the portrait. |
| Row 1 (all) | x=16, y=1-8 | **Reservoir** | Tap left half (y=1-4) to shift left; right half (y=5-8) to shift right |
| Row 2, Col 3-6 | x=15, y=3-6 | **Drop Zone** | Tap = release 1 grain; hold 0.5s = stream up to 16 |
| Rows 3-16 | — | **Physics area** | Dynamic interaction zone. Grains land here. |
| Rows 9-16 | x=8-1, y=1-8 | **Sequencer area**| Bottom 8 rows; grains here become active sequence steps |

### Keyboard Shortcuts (emulator only)

| Key | Action |
|-----|--------|
| Tab | Toggle Seq Settings screen |
| Space | Toggle Scale Settings screen |

---

## Grain Types

| Type | Color tones | Physics | MIDI character |
|------|-------------|---------|----------------|
| **Sand** | Amber / Orange | Falls straight; slides sideways when pile ≥ 3 high; can land on leaves | Medium velocity staccato + decaying echo |
| **Leaf** | Soft green / Warm green | Drifts slightly sideways; piles up to max 2 high | Soft velocity, long held note (3 ticks) |
| **Water** | Light cyan / Seafoam | Falls straight; flows sideways; splashes up when hitting leaves | Octave +1 higher; when adjacent water → extended note |

All grains decay slowly over time (unless Lock is on). Dim speed varies per type: sand is slowest, water is fastest.

---

## Settings

### Seq Settings (ALT or Tab key)

| Hardware pos | Description |
|---|---|
| **x=10, y=1-5** | **Option Select** — Choose edit mode: 1:Length, 2:Division, 3:Mute, 4:Run State, 5:MIDI Channel |
| **x=8-1, y=1-8** | **Track Grid** — 4 sequences (2 rows each). Tapping a step modifies it based on selection above. |

### Scale Settings (Space key)

| Hardware pos | Description |
|---|---|
| **x=11, y=1-6** | **Scale mode** — MAJ / MIN / PMA / PMI / DOR / LYD |
| **x=9, y=1-7** | **Root (Black keys)** — C# D# — F# G# A# (Blue = root, White = in scale) |
| **x=8, y=1-7** | **Root (White keys)** — C D E F G A B (Blue = root, White = in scale) |
| **x=6, y=1-4** | **BPM** — −10 / −1 / +1 / +10; cols 5-8 = fill indicator |
| **x=5, y=1-4** | **Base octave** — oct 2 / 3 / 4 / 5 |
| **x=4, y=1-3** | **Dissolve** — Off / Half / Normal (syncs with Lock button) |
| **x=3, y=1-3** | **Humanizer** — Off / On / Extreme (adds timing/velocity jitter) |

---

## Notes

- The grid must be mounted **90° CCW** (portrait). The emulator will show the grid in landscape but the script draws in portrait — best tested on hardware or in your imagination.
- Portrait column 1 (hardware column 16) is the rightmost physical column in landscape = top column in portrait.
- Mining a grain leaves a gap that gravity fills on the next physics tick.
- Sequencer steps without a grain present are skipped silently.
- In **Lock mode**, the sequencer still runs but grains no longer dim down — useful for building a stable pattern.
- With 4 active sequences and seq_len=16, you get up to 64 total steps spanning all 8 bottom rows.

---

## Changelog

- **v0.1.0** — Initial release: physics simulation, 3 grain types, portrait orientation, 3-screen UI, step sequencer with mining
- **v0.1.1** (Dev) — Added Reset function; optimized RAM; fixed eye-blinking presence check.

---

## Future Ideas (TODO)

- [ ] **Auto Drop**: Implement a toggleable mode that releases grains at randomized intervals, simulating both single and long presses (streams) across the 4 drop slots.
- [ ] **Clear-Bottom**: Add a utility button to clear the bottom-most row of the grid, allowing the pile to lower (hold to keep "eating" the bottom).
