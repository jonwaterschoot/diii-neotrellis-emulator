# LeaveSeqr

Ambient leaf physics sequencer for Neotrellis grids: leaves drift through the air, float on the water surface, and sink slowly to the mud. Three independent generative water tracks play notes as leaves pass over the playheads. Triops leap into the water to eat the sinking leaves, causing a bouncing bass echo delay.

- **Author:** jonwaterschoot
- **Version:** v0.3.0

---

## Usage

Navigate the grid using three screens. Hold **ALT** (`x=1, y=3`) to cycle between the screens: **Live** (physics simulation), **Seq** (sequencer settings), and **Scale** (musical settings). By default, the sequencer runs at full 16 steps and runs at different relative speeds from top to bottom (surface is fastest, mid is slower, deep is the slowest).

---

## Controls

### Main Controls (Present on all screens)

| Location   | Label      | Description                              |
|------------|------------|------------------------------------------|
| x=1, y=3   | ALT        | Cycle screens: Live → Seq → Scale        |
| x=2, y=3   | Play/Stop  | Play or stop the sequence and physics    |
| x=3, y=3   | Auto-grow  | Toggle auto-growing leaves in the canopy |

---

## Screen 1: Live Simulation (Default)

The primary view where the ambient ecosystem lives.

- **Row 1 (Canopy):** Leaves grow here. Tap a leaf to knock it loose, or tap an empty spot to plant.
- **Row 2 (Wind):**
  - **x=1..3**: Left wind — gusts push leaves horizontally to the right, and blows canopy loose.
  - **x=14..16**: Right wind — gusts push leaves horizontally to the left, and blows canopy loose.
- **Row 2..4 (Air Zone):** Leaves drift slowly down. Wind pushes horizontally and sometimes upward.
- **Row 5 (Water Surface):** Track 1, plays at base octave limit.
- **Row 6 (Underwater Mid):** Track 2, plays one octave down.
- **Row 7 (Underwater Deep):** Track 3, plays two octaves down.
- **Row 8 (Mud):** Leaves collect at the bottom. Tap an empty spot to spawn a triop. Tap a triop to make it leap into the water!

---

## Screen 2: Sequencer Settings

Customize how the leaves trigger notes when they reach the water.

**Top Row (y=1) Options:**
1. `x=1` LOOP — tap a track row twice to set loop start and end bounds.
2. `x=2` DIV — tap `x=1..6` on a track row to set track division (playback speed).
3. `x=3` DIR — tap a track row to toggle forward/reverse.
4. `x=4` CH — tap `x=1..3` on a track row to set MIDI channel.

**Tracks:**
Modify the tracks by tapping at their live `y` positions (Rows 5, 6, 7).

---

## Screen 3: Scale & Environment

Tune the harmony, environment, and physical appearance.

| Component      | Location               | Controls Description                                         |
|----------------|------------------------|--------------------------------------------------------------|
| **Scale**      | `x=1..6, y=1`          | Select scale: MAJ, MIN, PMA, PMI, DOR, LYD                   |
| **Season**     | `x=9..12, y=1`         | Select leaf colors: Spring, Summer, Autumn, Winter           |
| **Root Note**  | `x=5..11, y=2..3`      | `y=2`: Black keys (C# D# F# G# A#). `y=3` White keys (C..B) |
| **BPM**        | `x=1..4, y=4`          | Adjust master tempo: -10, -1, +1, +10                        |
| **Octave**     | `x=6..9, y=4`          | Octave base: 2, 3, 4, 5                                      |
| **Density**    | `x=11..12, y=4`        | Leaf density: low vs high                                    |
| **Humanize**   | `x=1..3, y=5`          | Micro-timing and velocity shifts: off, on, extreme           |
| **Brightness** | `x=5..7, y=5`          | Grid brightness: low, mid, high                              |
| **Wind Str**   | `x=1..3, y=6`          | Wind strength: low, mid, high                                |
| **Triops**     | `x=5, y=6`             | Toggle triop auto-spawn: on/off                              |
