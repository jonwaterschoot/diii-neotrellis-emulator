# Documentation Revamp TODO (Phase 2)

As the project has grown, the documentation has become slightly repetitive across multiple files. The next phase of documentation should focus on creating a clear, linear structure without repeating concepts.

## Tasks
- [ ] **Consolidate 'Getting Started'**: Combine firmware flashing (`firmware-installation.md`), building (`building-firmware.md`), and general setup into a single, cohesive setup guide.
- [ ] **Restructure the Walkthrough**: Extract the detailed Lua execution logic and LDoc API reference out of `walkthrough.md` and move it to a dedicated developer-focused `script-standards.md` or `developer-guide.md`. Keep `walkthrough.md` solely for navigating the emulator UI.
- [ ] **Hardware vs. Emulation Differences**: Create a specific page clearly outlining the differences between running scripts natively in the browser emulator versus exporting and running them natively on the hardware.
- [ ] **MIDI Documentation**: Add screenshots and clearer diagrams explaining MIDI connectivity and the challenges with multiple timers/clock syncing logic so script developers understand the physical constraints.

