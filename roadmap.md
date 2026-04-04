## in the serpentine dev script

[x]- allow BPM to go to 1
[0]- make BPM able to sync in or out? - failed attempts


## in the webapp:
- add two sliders for a reverb and delay in the browser synth 
  - with basic settings for both a general slider for amount, and a expand button allows for fine control. 

[x]- the dimmed buttons are rendered too dark, it does not fit the brightness of the actual device. e.g. the dimmed middle character in the 3 digit display. 

- integrate the script that allows to autostrip / minimize the lua scripts, so that when downloading you could choose to optimize for use on device (github pages probably doesn't have a run python script option?)

- somehow add an option to overlay the functions cfr the way we originally made a manual / graphic with the labeled groups.

- the webapp seems to stop playing - partially - when not in focus? 

- more clearly show when a custom script is loaded, disabling the download button / graying out the list , showing in the list, custom script = loaded







vvvv IGNORE BELOW vvvvv



----
----
vvv -- DONE / scratchpad -- vvv
----



[x]- when toggling arp on / off show ARP
- use the humanize toggle to have 4 levels
    - when toggling humanize on / off show HU1, HU2, HU3, HU4
Pool display, we could use P in blue and letters in slider color
- when moving slider pool fruit quantity / amount: PAM 
- when moving slider pool Arpeggio pool max capacity: PMX

Remove any remnants of the Arpeggio lifespan slider:
use that slider to set the accent timing to different intervals:
- 1 = off, 2, 3, 4 (current default)

- current panic button isn't (fully?) working


Plan: strip features to reclaim bytes, then re-add humanize display.
Goal: get below ~25,957 bytes (v1-9 working baseline) with room to spare.

### Strip phase
[x] 1. Remove SEM auto mode — collapse autopilot to 2-state toggle (MAN/AUT). Use button color change (dim vs bright) instead of display label. Saved: 751 bytes (v1-15 = 25,206 bytes vs v1-9 baseline 25,957).
[x] 2. Remove arp lifespan slider (x=1..8, y=2) — eliminated lifespan slider, arp_steps_remaining, and dead arp_first_note variable. Saved: 732 bytes (v1-16 = 24,474 bytes, now 1,483 bytes under baseline).
[ ] 3. Audit remaining display branches — any that can be replaced with color-only feedback.

### Re-add phase (after strip confirms headroom)
[ ] 4. Re-add humanize on/off display — using hum_flash counter approach (no new elseif, no new string constant). Labels: ACT / OFF.
[ ] 5. If enough headroom: re-add humanize levels H1–H4 (cycle 0→4, display label H1/H2/H3/H4).

### Notes
- v1-9 (25,957 bytes) = last known working build
- Adding ANY new elseif display branch or new string constant to alt_disp_mode chain causes freeze — root cause unknown, possibly Pico Lua heap/string-table interaction
- hum_flash counter approach (avoids new elseif) also froze — may be size-related after all
- Adding font glyphs can sometimes FIX freezes (F glyph fixed v1-8 → v1-9) — memory layout effect



[x]- when viewed with the serial app https://dessertplanet.github.io/viii/ viii i can test what the app would look like on a regular grid. 
    - The main game and the secondary settings page make it clear that most of the dimmed pixels are not lighting up.
        - eg. the middle characters in the display
        - toogle for fruits, only shown when on
        - sliders, only active part lights up
        - On game screen the controls on the left and the 'arrow keys' on the right are not lit up
        - Snake itself is rendering correctly with a gradient

[x]- death animation X2 speed
[x]- octave range filter: 1 button cycles through base octave, another cycles trough range
    [x]- OC1 - OC6 = base octave  
    [x]- RA1 - RA6 = octave range


----
