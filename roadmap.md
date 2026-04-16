# NeoTrellis Emulator Roadmap

## Serpentine Lua Script

### Core Features & Bugfixes
- [x] Investigate note-off message issue (clicking stop does not clear all notes).
- [ ] Make the death animation faster or de/increment speed (e.g., from fast to slow at the last 2-3 bars).
- [ ] Fix panic button not (fully?) working.
- [ ] Investigate BPM syncing (in or out) - failed previous attempts.
- [ ] Docs: Spawn quantity - needs a title?

## Webapp & Emulator UI

### UI / UX Enhancements
- [ ] Show an icon when key is on hold down. / current is a yellow border, and main serpentine grid has a yellow color, so not very visible.

- [ ] A better structure in the scripts list sorted with divisions and sub-divisions. and maybe a search / filter bar. 
- [x] Allow other pixel dimensions than 16x8 (common sizes: 8*8, 16*16, but also custom sizes like 32*32, etc.)
- [x] fixing layout on mobile sizes, beautifying the top bar and full screen look

### Documentation & Script UI Integration

- [x] tasks done

### External Scripts

- when loading external script aftyer import show it's repo link in the docs section and above the readme, explaining that it was live pulled from that repo

- [x] Allow other sources like Codeberg (prelink scripts from tehn at `https://codeberg.org/tehn/iii-scripts/src/branch/main/grid`).
  - [x] *Note: These do not adhere to our structure standard and license is unsure, so just link them and give due credit (e.g., subcategory "external scripts -tehn-").*
    - currently integrated by loading links in the preset list, but this is not ideal. Links are visble in the console, but thats not loading by default
- maybe someone makes a script and they'd like to add it (imagine :-P) - what should they do?

## Documentation & Project Structure

- [x] Prepare an empty project with the structure that is easy to clone (super clear instructions on the difference between cloning and starting a new repo based on the template).
- [ ] Create a changelog for the emulator app.

## Future Exploration / Ports

- [ ] **Serpentine Port:** How "easy" would it be to port the serpentine lua script to a native norns (shieldXL) device? Can it still use the color info?
- [ ] **Anbernic Port:** How feasible to port to my Anbernic (using a synth triggered by NeoTrellis), or make an expanded version using larger screen resolution with more pixels?
- [ ] **Standard:** Momentary/hold icons — needs a `@type hold|toggle` annotation in the standard. Not wired yet, worth a separate pass when the annotation format is settled.
