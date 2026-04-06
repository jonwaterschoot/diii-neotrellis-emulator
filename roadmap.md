## in the serpentine dev script

[x]- allow BPM to go to 1
[0]- make BPM able to sync in or out? - failed attempts

- Spawn quantity = not a title?

- make the death animation faster or de/increment speed -actually would be cool if it went from fast to slow at the last 2-3 bars

- still a big problem with the note off messages, try to find out which methods cause the prblem, clicking stop does not clear all notes

- look into the option to re-enable display for autorun

## in the webapp:

---

show an icon when key is on hold down

----

 Info / about page with links + short summary on how to get the scripts onto neotrellis: use my uf2 and goto diii upload minified files

---

UI:
- Mobile view is not fitting fully, width of the grids is overflown
- menu buttons outside view? - check after push

---
UX:

/// nothing atm



---


### Live Manual:

/// nothing atm

## Other

Prepare a empty project with all the structure that is easy to clone; 
- perhaps super clear instructions on the difference between cloning and starting a new repo based on this template

- create a changelog for the emulator app itself

### future implementation option:

- Momentary/hold icons — needs a @type hold|toggle annotation in the standard. Not wired yet, worth a separate pass when the annotation format is settled.

### porting Serpentine

- how "easy" would it be to port my serpentine lua script to a native norns (shieldXL) device, would there be a way to still make that use the color info?
- how feasible to port to my anbernic, or use a synth on anbernic that get's triggered by neotrellis, make an expanded version using larger screen resolution with more pixels

vvvv IGNORE BELOW vvvvv

----
----
vvv -- DONE / scratchpad -- vvv
----
- add two sliders for a reverb and delay in the browser synth 
  - with basic settings for both a general slider for amount, and a expand button allows for fine control. 


Scripts content:
- allow other sources like codeberg, specifically we could already prelink the scripts from tehn at: https://codeberg.org/tehn/iii-scripts/src/branch/main/grid
Though these scripts do not adhere to our so called and thus unofficial structure standard. they are made by the main monome team. I'm not sure about the license of these so i'd rather not blindly copy them into our own repository but just link them and give due credit. as tehn + linking to the repo.
   - we could use a subcategory in the selector list called "external scripts -tehn-"

- accent color - use the current slider colors tint as base for the accent for buttons, site icon, headers, ...
- add short descriptors inside the grid, defined by the first letter or fitting the word of the title of the section, or add a value in the pixel where applicable, the notes for keyboards etc. leave empty when unsure/undocumented 
- more clearly show when a custom script is loaded, disabling the download button / graying out the list , showing in the list, custom script = loaded

- keyboard bindings for webapp are these integrated in the script / docs?

[x] - general overlay approach is getting better; though we need a better way to extract groups so there are less individual seperate blocks.
[x] - the full grid layout overlay just saying full 16*8 should be excluded by default.
[x] - we need a standard in our docs that embraces the main group - sub controls approach
[x] - on our overlay it becomes apparent that the two octave buttons are part of both grids, which isn't the case, or at least shouldn't be.
[x] - this makes it more needed to have a clear distinction on what lives on which view / screen
[x] - examples of ungrouped items:
    [x] - black keys and white keys are two groups, should be one
    [x] - Dpad 4 pixels are not grouped
    [x] - fruits are a question, should it be one group with different sub settings, ort kept seperate (i'd think a group with subs)



[x]- the dimmed buttons are rendered too dark, it does not fit the brightness of the actual device. e.g. the dimmed middle character in the 3 digit display. 

[x]- integrate the script that allows to autostrip / minimize the lua scripts, so that when downloading you could choose to optimize for use on device (github pages probably doesn't have a run python script option?)

- somehow add an option to overlay the functions cfr the way we originally made a manual / graphic with the labeled groups.

we have a first implementation of an mapping overview that overlays info onto the grid.
 
- should be more detailed,
    - e.g. using a label/title and then more optional info
      - x=1, y=8  ALT toggle — momentary press opens Settings, double-tap = sticky; sequencer keeps running
- should show two (or more grids per screen) beneath each other
- avoid zooming conflict - a min and max zoom level?

SCRIPT_STANDARD.md is written. Here's what it covers:

Section 1 — Lua header format (what doc-extractor.js already parses), aligned with norns convention  
Section 2 — Control map comment syntax for the grid overlay, including all supported location formats and @section grouping  
Section 3 — README.md format, with the recognized H2 sections the UI can render specially; notes that serpentineseqr_docs.md is the reference implementation and should be renamed  
Section 4 — manifest.json shape, deliberately mirroring the norns community catalog fields  
Section 5 — The GitHub import flow, including the CORS confirmation that no proxy is needed  
Section 6 — LDoc tag reference table, with explicit callout of what doc-extractor.js handles vs what's deferred  

Next natural steps from here (none started yet, your call on order):

- Rename serpentineseqr_docs.md → README.md to make it the first real conforming package
- Build the GitHub import UI (paste URL → fetch → render)
- Improve the overlay to show richer label + detail format per the roadmap notes
- Add the docs panel below the grids that renders the README



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
