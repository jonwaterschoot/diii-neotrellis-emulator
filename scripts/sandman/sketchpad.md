# Sequencer settings:

Two halves top 8*8 + bottom 8*8
- bottom is the sequences
- top is the settings

## Top half is where we have:
- Main alt page switcher, play/stop and lock toggles always visible & occupied 
- in the top part we can toggle between a few things:
  - By a row of selectors we can apply those settings to the sequences
    - 3 selectors so far
## bottom half:
There are 4 sequences:

- each 2*8, 16 steps left to right top to bottom 
  -- alternate the color intensity to indicate the difference
    - 2 * lighter
    - 2 * darker
    - 2 * lighter
    - 2 * darker

### option 1
- Sequencer length
  - by choosing option one in top half we can change length of each track:
    - clicking inside the 16 steps can set the pattern begin and end point
      - the part between the two selected pads becomes the played part, steps will loop through that zone, logic is Always, first press is start, second press is end, this logic cycles
    - clcicking inside a sequencer restarts the begin end logic

### option 2
- sequencer division (whether it moves at 1/2nd, 1/4 th, 1/8th etc)

### option 3
- toggle notes on/off

--

### Future Feature Ideas:
- [x] **Reset Screen**: Portrait Col 8, Row 3. Restores initial portrait art.
- [ ] **Auto Drop**: Portrait Col 8, Row 4. Random drops/streams at various intervals across 4 drop slots.
- [ ] **Clear-Bottom**: Portrait Col 8, Row 5. Clear row 16 (hold to keep eating).

To include at later stage:
- toggle sequencer between midi melody and midi drum mode, where each of the 4 tracks becomes 1 instrument with different velocities playing standard notes on each track for Kick, snare, hihat, tom (kick is bottom)