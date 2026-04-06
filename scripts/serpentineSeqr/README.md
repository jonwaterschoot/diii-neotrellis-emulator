# Serpentine Sequencer

A snake sequencer game for the NeoTrellis / Monome-compatible 16x8 RGB grid.
The snake eats fruit to collect notes into an arpeggiator pool.
Each fruit type triggers a different musical event on collection.

- **Author:** jonwaterschoot (jonwtr)
- **Version:** v1.3.0-dev
- **Forum:** _(link pending)_

---

## Usage

Navigate the snake with the **D-PAD** (bottom-right corner of the grid).
Hold or double-tap **ALT** (bottom-left) to open the Settings overlay without stopping the sequencer.

The snake eats coloured fruit. Each fruit type adds a note to the arpeggiator pool and triggers
a musical side-effect. The sequencer runs continuously — ALT mode is a live overlay.

---

## Controls

### Global (always active)

| Location | Label | Description |
|----------|-------|-------------|
| x=1, y=8 | ALT | Momentary hold opens Settings; double-tap = sticky toggle; sequencer keeps running |
| x=2, y=8 | Play/Stop | Green = running, red = stopped; stop sends MIDI panic (all notes off) |
| x=15, y=7 | D-PAD UP | Move snake up |
| x=14, y=8 | D-PAD LEFT | Move snake left |
| x=15, y=8 | D-PAD DOWN | Move snake down |
| x=16, y=8 | D-PAD RIGHT | Move snake right |

---

## Settings

Open by holding or double-tapping **ALT** (x=1, y=8). The sequencer continues running.

### Row 1 — Spawner Engine

| Location | Description |
|----------|-------------|
| x=1..8, y=1 | **Spawn Quantity** — slider, each step = 2 fruits, max 16 on grid simultaneously |
| x=11..16, y=1 | **Fruit Type Toggles** — enable/disable each fruit colour independently (see Fruit Types below) |

### Row 2 — Timing & Pool

| Location | Description |
|----------|-------------|
| x=1..8, y=2 | **Accent Interval** — slider sets accent beat spacing (1–8 steps); lit LEDs show active beats in 8-step window |
| x=9..16, y=2 | **Arp Pool Max Capacity** — sets maximum number of notes the pool can hold (1–8) |

### Row 3 — Playback Controls

| Location | Description |
|----------|-------------|
| x=1, y=3 | **Autopilot** — dim = manual control; bright green = auto (BFS pathfinding to nearest fruit) |
| x=3, y=3 | **Arp Playback Order** — cycles ORD (FIFO) / RND (random) / UP (low→high) / DWN (high→low) |
| x=5, y=3 | **Arp On/Off** — green = arp plays notes; dim red = eat notes into pool only, no MIDI output |
| x=7, y=3 | **Humanize** — cyan = on (±velocity + duration drift applied); dim = off; display shows HU1 / HU0 |
| x=3, y=8 | **Base Octave** (green) — cycles OC1–OC6, shifts all MIDI note output up/down by octave |
| x=4, y=8 | **Octave Range** (blue) — cycles RA1–RA6, spreads arp notes across multiple octaves |
| x=10, y=3 | **BPM −10** |
| x=11, y=3 | **BPM −1** |
| x=12, y=3 | **BPM +1** |
| x=13, y=3 | **BPM +10** |
| x=15, y=3 | **Brightness** — steps through 3 LED brightness limits (4 → 8 → 12) |
| x=16, y=3 | **Monochrome Tint** — cycles through 5 cinematic tint overlays + full colour off |

### Row 4 — Scale System

| Location | Description |
|----------|-------------|
| x=1, y=4 | **MAJ** — Major scale |
| x=2, y=4 | **MIN** — Minor scale |
| x=3, y=4 | **PMA** — Pentatonic Major |
| x=4, y=4 | **PMI** — Pentatonic Minor |
| x=5, y=4 | **DOR** — Dorian mode |
| x=6, y=4 | **LYD** — Lydian mode |
| x=7, y=4 | **CUS** — Custom manual scale (use keyboard rows to set active intervals) |
| x=8..16, y=4 | **LED Readout** — 3×5 block font displays current BPM, scale name, and arp mode |

### Rows 6–7 — Root Note Keyboard

Used to lock the global root note, or to set custom scale intervals when **CUS** is active.

| Row | Keys |
|-----|------|
| Row 6 — black keys | x=1 (C#), x=2 (D#), x=4 (F#), x=5 (G#), x=6 (A#) |
| Row 7 — white keys | x=1 (C), x=2 (D), x=3 (E), x=4 (F), x=5 (G), x=6 (A), x=7 (B) |

---

## Fruit Types

Each fruit is toggled on/off via x=11–16, y=1 in Settings. Tapping a fruit toggle also plays a demo sound.

| Toggle | Colour | Effect on eat | Demo sound |
|--------|--------|---------------|------------|
| x=11, y=1 | Red | Shrinks tail by 1; adds note to pool | High sharp single note |
| x=12, y=1 | Blue | Grows tail by 1; adds note to pool | Two-note fifth |
| x=13, y=1 | Yellow | Halves tempo for 16 ticks; adds note | Accent burst |
| x=14, y=1 | Cyan | Plays diatonic triad (3 stages per position) | Triad demo |
| x=15, y=1 | Orange | Adds note with 33% per-note trigger probability; grows tail | Soft single note |
| x=16, y=1 | Purple | Spawns decaying echo bounces; grows tail | Echo bounce demo |

---

## Notes

- The sequencer never stops when entering/exiting Settings — ALT is a live overlay
- MIDI panic (all notes off) fires automatically when Play/Stop is toggled to stopped
- BPM can be set as low as 1; no upper limit enforced in script
- Monochrome mode tints are cinematic presets, not user-configurable per-tint
- Memory on the Pico is tight — avoid adding new `elseif` display branches or new string constants to the alt display chain as these can cause freezes (root cause unknown, possibly Lua heap/string-table interaction on Pico)

---

## Changelog

See [CHANGELOG.md](temparchive/CHANGELOG.md) for version history.
