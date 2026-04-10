## to do

- [x] blink eyes faster
- [x] make figure hold at reset


summary of what each particle type does:

## Grain Types

### Sand (yellow/amber, orange, brown, pink tones)

- Medium velocity (75–105), with accent boosts on bar downbeats
Very short note duration (staccato)
- Triggers a quiet echo a perfect 5th below (–7 semitones) at ~45% velocity, 2 ticks later
- Note pitch follows column (scale degree) and row (octave)

### Leaf (green tones)

- Soft velocity (38–65), long hold (3 ticks)
- No echo
- Same pitch mapping as sand

### Water (blue tones)

- Medium velocity (55–85)
- Pitch is one octave higher than the equivalent sand/leaf position (+12 semitones)
- Hold duration depends on adjacency: if a neighboring cell is also water → 4 ticks (longer, more legato); otherwise 1 tick (short)


### All types share the same pitch grid:

Column (1–8) → scale degree + octave extension beyond the scale length
Row (9–16) → octave band, shifting up every 4 rows
Root, scale mode, and base octave are configurable







### Future Feature Ideas:

- [x] **Auto Drop**: Portrait Col 8, Row 4. Random drops/streams at various intervals across 4 drop slots.
- [x] **Clear-Bottom**: Portrait Col 8, Row 5. Clear row 16 (hold to keep eating). 
 > we're clearing 2 rows by random with a toggle + key combo to remove all grains of 1 color at once 

### To include at later stage:
- toggle sequencer between midi melody and midi drum mode, where each of the 4 tracks becomes 1 instrument with different velocities playing standard notes on each track for Kick, snare, hihat, tom (kick is bottom)