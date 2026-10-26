# Developer guide

How the emulator works inside, for changing or extending it. To write scripts instead, start with [Start a script](start-a-script.md).

## Files

```
index.html               The whole interface: grid, toolbar, side panel, sound, MIDI
serve.js                 Development server, and live reload over a WebSocket
engine/
  grid-api.js            Grid, LEDs, MIDI and metro timing (the "hardware")
  sound.js               Everything that plays: synth parts, drum kit, reverb, delay, chorus
  synth.js               The synth models (one voice's oscillators and filter; Karplus–Strong strings)
  drums.js               The drum kit: seven synthesised drums (from the Mangler in WAV.builder)
  lua-loader.js          Runs a script in Fengari and gives it the iii functions
  iii-lib.js             Parts of iii's lib.lua, run before every script
  doc-extractor.js       Reads the script's comments for the Docs tab and Live Manual
  script-importer.js     Fetches a script and README from GitHub or Codeberg
  lua-minifier.js        ↓ Device: strips comments, checks for code Lua 5.5 refuses
scripts/
  manifest.json          The bundled scripts in the script list
  external.json          Scripts by others: names and repository links only
  template/              Starting point for new scripts
docs/, mkdocs.yml        This documentation site
```

There is no build step. The page loads Fengari (Lua 5.3 in JavaScript) and [marked](https://marked.js.org/) from a CDN.

## How a script runs

`LuaLoader._execute(source, name, dir)` in `lua-loader.js`:

1. Resets the grid and stops all metros and notes.
2. Creates a new Lua state and opens the standard libraries.
3. Adds the iii functions: `grid_*`, `midi_*`, `metro`, `fs_*`, `pset_*`, `get_time` and more. Most are small wrappers around `MonomeAPI` in `grid-api.js`.
4. Runs `iii-lib.js`: the parts of the firmware's `lib.lua` the emulator doesn't implement in JavaScript, such as `midi_out` and `slew`. They're copied unchanged from the firmware.
5. Runs the script.
6. Connects pad presses to `event_grid` and incoming MIDI to `event_midi`. Both are looked up on every call, as on the device, so a script can define or replace them later.

Errors in metro ticks and events are reported once per message, and the error is taken off the Lua stack. Otherwise every later call fails as well.

`dir` is the script's folder (a URL). `fs_run_file` and `require` look there for files that aren't bundled scripts.

## Matching the device

The real API is in the firmware repo, [neotrellis-monome](https://github.com/jonwaterschoot/neotrellis-monome), under `neotrellis_monome_picosdk_iii/src/`:

- `iii/lua/lib.lua`: metro, MIDI helpers, pset, slew
- `iii/vm.c`: built-ins such as `midi_tx`, `get_time` and `fs_*`
- `device_lua.c`: grid functions

When you add or change a function, match what these do, including argument order and integer or float results. Where the emulator can't match the device, add it to [Hardware vs. emulator](hardware-vs-emulator.md).

### Adding a function

Implement it in `grid-api.js` and register it in `lua-loader.js`, next to the others:

```js
// lua-loader.js, in _execute()
setGlobal('my_fn', (L2) => {
  lua.lua_pushinteger(L2, api.my_fn(getInt(L2, 1)));
  return 1; // number of values returned to Lua
});
```

```js
// grid-api.js
my_fn(value) {
  return value * 2;
}
```

If the function is easier to write in Lua and the firmware has it in `lib.lua`, copy it into `iii-lib.js` instead.

## Live reload

`serve.js` serves the folder on port 3141 and watches `scripts/` and its subfolders. When a `.lua` file changes, it sends its path (such as `leaveseqr/leaveseqr.lua`) over the WebSocket at `/ws`. If that script is running, the emulator loads it again.

```bash
npm start            # port 3141
node serve.js 8080   # another port
```

## Testing without a browser

The engine runs in Node with the `fengari` npm package, which is useful to check that scripts still run after an engine change:

```js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.window = { fengari: require('fengari') };
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { MonomeAPI } = await import('./engine/grid-api.js');
const { LuaLoader } = await import('./engine/lua-loader.js');

const api = new MonomeAPI({ cols: 16, rows: 8 });
let notes = 0;
api.midi_note_on = () => notes++;   // the synth needs Web Audio, which Node doesn't have
api.midi_note_off = () => {};
const loader = new LuaLoader({ api, onScriptError: e => console.error(e) });

await loader._execute(source, 'myscript.lua');
api.handlePadEvent(1, 1, 1);         // press a pad
```

Run every script in `scripts/manifest.json` this way after changing the engine. Node on Windows can't time metros faster than about 15 ms, so check timing and sound in the browser.

## Documentation

The documentation is built with [MkDocs](https://www.mkdocs.org/) and the Material theme. Several pages include files from elsewhere in the repo (the README, the script standard, script READMEs) with `include-markdown`, so each text exists once.

```bash
pip install mkdocs-material mkdocs-include-markdown-plugin
mkdocs serve
```

`docs/index.md` is also shown in the emulator's About dialog, so keep it plain Markdown (no `include-markdown`).

## Publishing

Every push to `main` publishes the site through `.github/workflows/deploy.yml`:

1. It builds this documentation into `docs/` of the site.
2. It copies the emulator (`index.html`, `engine/`, `scripts/` and so on) next to it, and the raw `docs/` folder as `emulator-docs/` for the About dialog.
3. It pushes the result to the `gh-pages` branch, which GitHub Pages serves.

So the emulator is at `/diii-neotrellis-emulator/` and the documentation at `/diii-neotrellis-emulator/docs/`. In a fork, set **Settings → Pages → Source** to the `gh-pages` branch after the first run.
