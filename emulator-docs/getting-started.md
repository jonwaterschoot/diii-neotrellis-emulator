# Getting started

There are three ways in: play scripts in the browser, run the emulator on your own computer to write scripts, or put scripts on a NeoTrellis grid.

## Use it in the browser

1. Open the emulator: [jonwaterschoot.github.io/diii-neotrellis-emulator](https://jonwaterschoot.github.io/diii-neotrellis-emulator/).
2. Pick a script from the list and press **▶ Load**.
3. Click the grid. The sound starts muted, and the first click unmutes it.

To send MIDI to a synth or DAW, pick a MIDI output in the toolbar. That needs a Chromium-based browser (Chrome, Edge). The [walkthrough](walkthrough.md) explains the rest of the screen.

## Run it on your computer

Running the emulator locally lets you edit scripts in your own editor: when you save a `.lua` file in `scripts/`, the emulator reloads it.

You need [Node.js](https://nodejs.org/).

```bash
git clone https://github.com/jonwaterschoot/diii-neotrellis-emulator.git
cd diii-neotrellis-emulator
npm install
npm start
```

Then open [http://localhost:3141](http://localhost:3141).

To write your own script, pick **Write your own → Script template** in the script list, or read [Start a script](start-a-script.md).

## Put scripts on a NeoTrellis grid

The grid runs my fork of [okyeron's neotrellis-monome firmware](https://github.com/okyeron/neotrellis-monome), with monome's iii scripting and colour support added: [jonwaterschoot/neotrellis-monome](https://github.com/jonwaterschoot/neotrellis-monome).

### Install the firmware

1. Download a `.uf2` file from the [latest firmware release](https://github.com/jonwaterschoot/neotrellis-monome/releases/latest). `neotrellis-iii-pico-128-…uf2` is for a Pico with a 16×8 grid. The release also has 8×8, 4×4 and dink-ii builds, which haven't been tested on hardware.
2. Hold the **BOOTSEL** button on the Pico while plugging it in. It shows up as a drive.
3. Drag the `.uf2` file onto that drive. The Pico restarts with the new firmware.

To build the firmware yourself, or for other boards and grid sizes, see the [firmware README](https://github.com/jonwaterschoot/neotrellis-monome/tree/main/neotrellis_monome_picosdk_iii).

### Startup options

- **Mode:** hold the **top-left** button while powering on to switch modes. One lit pixel means serial mode (monome/norns apps); three lit pixels across the top row mean iii mode (diii scripts).
- **Colour:** hold the **top-right** button while powering on to pick the colour that tints monochrome scripts. Press a colour, then the top-right button to save it. Scripts that set their own colours aren't affected.

Hold both buttons to do both in one go.

### Upload scripts

Upload `.lua` files with the [diii web app](https://monome.org/diii/) (Chrome).

- Before uploading, read [Hardware vs. emulator](hardware-vs-emulator.md#before-you-upload), and download the script with **↓ Device**: it strips comments and warns about code the device won't load.
- Restart the grid before uploading, or at least stop a busy script: an upload while a heavy script runs can fail.
- To choose a script at startup, use [selector](https://github.com/jonwaterschoot/neotrellis-monome/tree/main/neotrellis_monome_picosdk_iii/doc/scripts/selector) (also on the release page). Every script on the grid gets a coloured slot: press it once to see the name, again to start it. Make selector the startup script with `first("selector.lua")` in the diii console.

### If the grid won't start

A script that crashes at startup can lock you out. To recover:

- Start in serial mode and open the [viii web app](https://dessertplanet.github.io/viii/): it can reformat the storage and enter the bootloader.
- Or flash the Raspberry Pi [flash nuke UF2](https://datasheets.raspberrypi.com/soft/flash_nuke.uf2), which erases everything, then install the firmware again.
