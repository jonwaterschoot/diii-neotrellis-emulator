# NeoTrellis RP2040 Firmware

The firmware is built from my fork of [okyeron's neotrellis repo](https://github.com/okyeron/neotrellis-monome), [jonwaterschoot/neotrellis-monome](https://github.com/jonwaterschoot/neotrellis-monome).

---

## Installing the firmware

1. Download a `.uf2` from the [latest firmware release](https://github.com/jonwaterschoot/neotrellis-monome/releases/latest). `neotrellis-iii-pico-128-…uf2` is for a Pico with a 16x8 grid. The release also has 8x8, 4x4 and dink-ii builds (not tested on hardware).
2. Hold the **boot button** on the Pico while powering it on — it will mount as a drive in your file explorer / Finder.
3. Drag the `.uf2` into that drive.
4. The Pico will reboot automatically with the new firmware.

Older builds are in the firmware repo's [releases](https://github.com/jonwaterschoot/neotrellis-monome/releases).

---

## Selecting a mode at startup

Hold the **top-left (1.1) button** while powering on to cycle between modes:

- **1 pixel lit** — regular serial / monome (norns) mode
- **3 pixels lit across the top row** — diii mode

Power off and repeat to toggle to the next mode.

---

## Choosing the default color

Hold the **top-right button** while powering on to open the color picker:

- column 1 is white, the other columns are hues, and rows fade from full color (top) to pastel
- the bottom row previews brightness levels 1–15 in the chosen color
- press a color to choose it (it blinks), then press the top-right button to save and continue booting

The color is remembered and tints monochrome output in both modes: norns apps in serial mode, and diii scripts written for standard monochrome grids. Scripts that set their own colors with `grid_color()` or `grid_led_rgb()` are not affected. Hold top-left and top-right together to switch mode and pick a color in one go.

---

## Loading a script

Open the **diii web app** and upload a `.lua` script. You can set a script to auto-run at boot, or use a launcher script that presents a selector on startup.

My launcher is [selector.lua](https://github.com/jonwaterschoot/neotrellis-monome/tree/main/neotrellis_monome_picosdk_iii/doc/scripts/selector), also attached to the [release](https://github.com/jonwaterschoot/neotrellis-monome/releases/latest). Every script on the device gets a colored slot. Press a slot once to show the script's name on the grid, then press it again to load it. Make it the boot script with `first("selector.lua")` in the diii REPL, and reboot to pick another script.

> [!NOTE]
> When uploading a script I have found it best to reboot the device and not to perform that action while a script is playing, non heavy scripts probably wont be an issue. 
>Either cycle power, or use the `reboot` button in the diii app.

---

## Recovery (bricked Pico)

If a bad script is set to run at boot and crashes the device:

- **Option 1:** Boot into serial mode, then use the **viii webapp** — it has options to reformat storage and enter the bootloader.
- **Option 2:** Flash a [RPI Pico "nuke" UF2](https://datasheets.raspberrypi.com/soft/flash_nuke.uf2) to fully erase the flash and start fresh.

See the other `.md` files in this folder for guidance on writing scripts with a crash-fallback methodology.
