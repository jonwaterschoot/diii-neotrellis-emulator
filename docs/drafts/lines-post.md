# Lines forum post (draft)

Not posted yet: lines doesn't allow New and Basic Users (Trust Level 0 and 1) to post LLM-generated code. Post it when my trust level or that rule changes.

Before posting:

- Use a monochrome screenshot (◐ View → Monochrome), for example of kria iii. The YouTube short can go in as a second item: https://youtube.com/shorts/uC-vHQKUrx8
- Check the version and download link. Better: tag a release on this repo and link to that instead of `main`.
- Update the roadmap and the list of scripts by others.

---

**diii-neotrellis-emulator**

A browser emulator for iii grid scripts: run, hear and read diii scripts without a grid connected.

[image or video]

I started this as an interactive manual for my own script, Serpentine. Once it could play the script I kept going, and now it runs most iii scripts I've thrown at it, including several posted here on lines.

You load a script, either a bundled one, one from any GitHub or Codeberg repo, or a file from your computer. It then runs on a virtual grid that behaves as closely as I could get it to the real thing. It plays through a built-in synth (several engines, from soft keys to Karplus–Strong strings, plus a drum kit and effects) or sends MIDI out to your own gear. A script's README shows in a Guide tab next to the grid, and its code in a Source tab.

Things that might be useful if you write iii scripts:

- **Monochrome view:** a plain monome grid with varibright levels. The emulator also supports colour for NeoTrellis grids, so this view hides the colour functions to match a real monome grid. A script that leans on them without checking first shows up as an error.
- **Download for device:** makes a copy of your script without comments, ready for diii, and warns about code that runs in the browser but won't load on the device. For example, the device runs Lua 5.5, which doesn't allow assigning to a `for` loop variable. It also warns when you use more than the 11 metros you get on the device.
- **Live reload:** edit in the browser, or in your own editor and see the change right away.
- **Live Manual:** each script's controls drawn over the grid.
- **MIDI in and out:** clock-following and keyboard-driven scripts work too.

Scripts by others load straight from their authors' repos, and nothing is copied into mine: kria iii (aktsom), stepiii and arpiii (nolliegray), fugace (behindkeyframes), iiinvert and fell (liamelliot), sluiiice (duncangeere), many-roads (boreal-ground), and tehn's iii-scripts. All credit goes to them. If you're one of these authors and would rather not be listed, let me know and I'll take it out.

A caveat: I don't own a monome grid. I built this around a NeoTrellis clone running okyeron's firmware with iii, and I test the monochrome side with viii. So if you notice something behaving differently from your real grid, I'd really like to hear about it. The [Hardware vs. emulator](https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/hardware-vs-emulator/) page lists the differences I know of.

The colour features belong to my NeoTrellis fork, not to monome. Please don't bother monome with questions about them; ask me here instead.

Roadmap: better script browsing, closer timing and behaviour to the device, and more synth options. Script submissions and bug reports are welcome.

**Requirements**

- A browser. Chrome or Edge gets you MIDI in/out (Web MIDI); the built-in synth works anywhere.
- Optional: a monome grid (or a compatible one) with iii and diii, to upload your scripts once they work.
- Optional: Node.js, to run it locally with live reload.

**Documentation**

- Docs: https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/
- Walkthrough: https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/walkthrough/
- Writing scripts that work on both monochrome and colour grids: https://jonwaterschoot.github.io/diii-neotrellis-emulator/docs/colour/

**LLM disclosure**

This project is largely LLM-generated. I'm not a developer by trade, and I built it with Claude and Gemini in VS Code and Google Antigravity. Nearly all of the emulator code (JavaScript, the Lua runtime bridge, the synth engines) was written by those models from my direction. I designed it and tested it on hardware, and I spent many hours steering, debugging and reviewing. My own scripts (Serpentine, LeaveSeqr, Sandman) were also made with LLM help. The scripts by others that the emulator loads aren't part of this and are their authors' own work.

**Download**

v0.1.0: https://github.com/jonwaterschoot/diii-neotrellis-emulator/archive/refs/heads/main.zip (source: https://github.com/jonwaterschoot/diii-neotrellis-emulator)

diii-neotrellis-emulator web app: https://jonwaterschoot.github.io/diii-neotrellis-emulator/

Tags: `iii`, `grid`, `web`
