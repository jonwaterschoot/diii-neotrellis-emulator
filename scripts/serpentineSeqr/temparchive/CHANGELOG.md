# Serpentine Sequencer — Changelog

Versioned archives start from v1-4 onward. Earlier files in this folder are kept for reference but predate this log.

Each version is a full (unminified) copy of `serpentine_dev.lua` at the time of release.
The corresponding minified release lives one level up at `scripts/serpentine_vX-Y.lua`.

## v1-4 — 2026-04-03
fix monochrome fallback: clamp non-black RGB to minimum brightness 1 in spx, preventing dim UI elements from mapping to 0

## v1-5 — 2026-04-03
fix monochrome fallback: monochrome floor raised from 1 to 2. On a real monochrome grid, dim-but-intentional pixels now show at 2/15 brightness (13%) instead of 1/15 (7%)

## v1-6 — 2026-04-03
fix monochrome fallback: lift minimum brightness before grid_led_rgb/grid_led branch so the floor applies regardless of which API the host exposes; dim-but-intentional pixels now reliably show at level 2/15 on monochrome grids

## v1-7 — 2026-04-03
fix monochrome floor: raise minimum brightness level from 2 to 4 — level 2 is physically invisible on NeoTrellis hardware via viii/mext; level 4 is confirmed visible (matches lowest master_bright step)



## v1-8 — 2026-04-03
adding a display for the arp toggle

## v1-9 — 2026-04-03
adding F

## v1-10 — 2026-04-03 ---- Breaking update need to revert 
Humanize toggle with 4 states HU1- HU4, H added to font, level scales 5 to 20 hold probability level 4 

## v1-11 — 2026-04-03
reverting and trying to only keep on/off + displaying HU0 - HU1

## v1-12 — 2026-04-03
show ACT (cyan) when humanize is on and OFF (red) when off — still clear, and uses only letters already proven to work on the device

## v1-13 — 2026-04-04
test size

## v1-14 — 2026-04-04
new approach to add HUM

## v1-15 — 2026-04-04
strip SEM mode, collapse autopilot to 2-state toggle

## v1-16 — 2026-04-04
strip arp lifespan slider and dead arp_first_note variable

## v1-17 — 2026-04-04
H1-H4 humanize levels, fix BPM handover

## v1-18 — 2026-04-04
fix humanize display: force alt_disp_timer=0 so hum_flash shows reliably

## v1-19 — 2026-04-04
introducing accent divider with 8 positions

## v1-20 — 2026-04-04
make the sequencer keep on playing while in the settings menu, the panic button is now a play/stop toggle

## v1-21 — 2026-04-04
allow 1BPM as lowest setting instead of 40

## v1-22 — 2026-04-04
clock sync: INTernal, OUT 24ppqn + start stop play, EXT, follow incoming midi clock

## v1-23 — 2026-04-04
clock sync broke the device, stripping to just internal and external

## v1-24 — 2026-04-04
clock sync adding start/stop

## v1-25 — 2026-04-04
clock sync adding start/stop midi_out requires a type key

## v1-26 — 2026-04-04
clock sync start stop clock implemented

## v1-27 — 2026-04-04
clock sync start stop clock implemented: Strip it back to state changes only

## v1-28 — 2026-04-04
clock sync start stop clock implemented: adjust do_panic

## v1-29 — 2026-04-04
clock sync clock-only. Play/stop stays manual on the device

## v1-30 — 2026-04-04
clock was failing so stripped back, no sync for now, clock_test.lua can serve as a testing ground later
