# NeoTrellis RP2040 Firmware

This UF2 was built from a fork of [okyeron's neotrellis repo](https://github.com/okyeron/neotrellis-monome).

---

## Installing the firmware

1. Hold the **boot button** on the Pico while powering it on — it will mount as a drive in your file explorer / Finder.
2. Drag [neotrellis-iii-128-20260419-jonwtr-color-memory.uf2](https://github.com/jonwaterschoot/diii-neotrellis-emulator/raw/main/uf2s/neotrellis-iii-128-20260419-jonwtr-color-memory.uf2) into that drive.
3. The Pico will reboot automatically with the new firmware.

---

## Selecting a mode at startup

Hold the **top-left (1.1) button** while powering on to cycle between modes:

- **1 pixel lit** — regular serial / monome (norns) mode
- **3 pixels lit across the top row** — diii mode

Power off and repeat to toggle to the next mode.

---

## Loading a script

Open the **diii web app** and upload a `.lua` script. You can set a script to auto-run at boot, or use a small launcher script that presents a selector on startup.

> [!NOTE]
> When uploading a script I have found it best to reboot the device and not to perform that action while a script is playing, non heavy scripts probably wont be an issue. 
>Either cycle power, or use the `reboot` button in the diii app.

---

## Recovery (bricked Pico)

If a bad script is set to run at boot and crashes the device:

- **Option 1:** Boot into serial mode, then use the **viii webapp** — it has options to reformat storage and enter the bootloader.
- **Option 2:** Flash a [RPI Pico "nuke" UF2](https://datasheets.raspberrypi.com/soft/flash_nuke.uf2) to fully erase the flash and start fresh.

See the other `.md` files in this folder for guidance on writing scripts with a crash-fallback methodology.
