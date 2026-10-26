/**
 * lua-loader.js
 * Handles Lua script discovery, loading, execution inside Fengari, and hot-reload.
 *
 * Responsibilities:
 *   - Fetch the scripts/manifest.json to populate the script browser
 *   - Fetch individual .lua files via HTTP (requires serve.js to be running)
 *   - Accept a user-picked .lua file via the File Picker API (works without server)
 *   - Execute Lua source inside Fengari with MonomeAPI globals injected
 *   - Connect to WebSocket hot-reload signal from serve.js
 *   - Extract and call event_grid from the Lua global scope
 *   - Serve iii's fs_list_files / fs_run_file / fs_read_file from a virtual filesystem:
 *     the bundled scripts by file name, plus files next to the running script
 */

import { DocExtractor } from './doc-extractor.js';
import { III_LIB } from './iii-lib.js';

const extractor = new DocExtractor();

/** iii has 12 metros; metro.init returns nil for a 13th */
const III_METRO_COUNT = 12;

/** fs_run_file is synchronous on the device, so files are fetched with a synchronous request */
function readUrlSync(url) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  try { xhr.send(); } catch (e) { return null; }
  return xhr.status === 200 ? xhr.responseText : null;
}

export class LuaLoader {
  /**
   * @param {Object} opts
   * @param {MonomeAPI} opts.api   – the grid-api instance
   * @param {Function} opts.onScriptLoad   – called after a script loads successfully: (name, docs)
   * @param {Function} opts.onScriptError  – called on runtime error: (errorMessage)
   * @param {Function} opts.onStatusChange – called with status text updates: (msg, level)
   * @param {string}   opts.wsUrl          – WebSocket URL for hot-reload (default: auto)
   * @param {Function} opts.readFileSync   – (url) → text | null, for the virtual filesystem (default: sync XHR)
   */
  constructor(opts = {}) {
    this.api = opts.api;
    this.onScriptLoad = opts.onScriptLoad || (() => {});
    this.onScriptError = opts.onScriptError || (() => {});
    this.onStatusChange = opts.onStatusChange || (() => {});

    this._currentScriptName = null;
    this._currentSource = null;
    this._L = null;          // Fengari Lua state
    this._ws = null;
    this._wsUrl = opts.wsUrl || null;  // auto-detected from serve.js
    this._wsAutoReconnectTimer = null;

    // Virtual filesystem for fs_* and require: file name → URL, plus the running script's folder
    this.readFileSync = opts.readFileSync || readUrlSync;

    // Monochrome: the script doesn't get the NeoTrellis colour functions, as on a monome
    // grid, so it runs its own fallback. Takes effect on the next load.
    this.monochrome = false;
    this._fsFiles = new Map();
    this._scriptDir = null;

    // Fengari module refs (populated after init)
    this._fengari = null;
    this._lualib = null;
    this._lauxlib = null;
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  get currentSource() { return this._currentSource; }
  get currentScriptName() { return this._currentScriptName; }

  /** Fetch the manifest and return array of script descriptors */
  async fetchManifest(baseUrl = '') {
    try {
      const res = await fetch(`${baseUrl}/scripts/manifest.json`);
      if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
      const manifest = await res.json();
      this.setBundledFiles(manifest, baseUrl);
      return manifest;
    } catch (e) {
      this.onStatusChange('Manifest unavailable — use File Picker to load scripts', 'warn');
      return [];
    }
  }

  /** Bundled scripts become the files that fs_list_files() lists, by file name as on the device */
  setBundledFiles(manifest, baseUrl = '') {
    this._fsFiles.clear();
    for (const entry of manifest) {
      this._fsFiles.set(entry.file.split('/').pop(), `${baseUrl}/scripts/${entry.file}`);
    }
  }

  /** Load a named script from the server's scripts/ folder */
  async loadFromServer(filename, baseUrl = '') {
    this.onStatusChange(`Fetching ${filename}…`, 'info');
    try {
      const res = await fetch(`${baseUrl}/scripts/${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const source = await res.text();
      this._currentScriptName = filename;
      await this._execute(source, filename, `${baseUrl}/scripts/${filename.replace(/[^/]*$/, '')}`);
    } catch (e) {
      this.onStatusChange(`Load failed: ${e.message}`, 'error');
      this.onScriptError(e.message);
    }
  }

  /** Called when user picks a .lua file via <input type="file"> */
  async loadFromFile(file) {
    this.onStatusChange(`Loading ${file.name}…`, 'info');
    try {
      const source = await file.text();
      this._currentScriptName = file.name;
      await this._execute(source, file.name);
    } catch (e) {
      this.onStatusChange(`File load failed: ${e.message}`, 'error');
      this.onScriptError(e.message);
    }
  }

  /** Reload the currently loaded script (re-fetch + re-execute) */
  async reload(baseUrl = '') {
    if (!this._currentScriptName) return;
    // If it was loaded from file picker, we don't have the source again
    // so we try the server path; if unavailable, re-execute cached source
    if (this._currentSource) {
      await this._execute(this._currentSource, this._currentScriptName, this._scriptDir);
    } else {
      await this.loadFromServer(this._currentScriptName, baseUrl);
    }
  }

  /** Run edited source in place of the current script, under the same name and folder */
  async runSource(source) {
    this._currentScriptName = this._currentScriptName || 'edited.lua';
    await this._execute(source, this._currentScriptName, this._scriptDir);
  }

  // ─── WEBSOCKET HOT-RELOAD ─────────────────────────────────────────────────

  /**
   * Connect to the serve.js WebSocket for hot-reload.
   * @param {string} url – ws://localhost:PORT/ws
   * @param {string} baseUrl – base HTTP URL for re-fetching scripts
   */
  connectHotReload(url, baseUrl = '') {
    this._wsUrl = url;
    this._wsBaseUrl = baseUrl;
    this._connectWS();
  }

  _connectWS() {
    if (this._ws) {
      try { this._ws.close(); } catch (e) {}
    }
    try {
      this._ws = new WebSocket(this._wsUrl);
    } catch (e) {
      this._scheduleWSReconnect();
      return;
    }

    this._ws.onopen = () => {
      this.onStatusChange('🔥 Hot-reload connected', 'success');
      clearTimeout(this._wsAutoReconnectTimer);
    };

    this._ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'file_changed') {
          // Only reload if the changed file is the currently loaded one
          if (!this._currentScriptName || msg.name === this._currentScriptName) {
            this.onStatusChange(`↻ Detected change: ${msg.name} — reloading`, 'info');
            await this.loadFromServer(msg.name, this._wsBaseUrl);
          }
        } else if (msg.type === 'connected') {
          this.onStatusChange(`🔥 Hot-reload ready (watching scripts/)`, 'success');
        }
      } catch (e) {}
    };

    this._ws.onerror = () => {
      this.onStatusChange('Hot-reload disconnected — retrying…', 'warn');
    };

    this._ws.onclose = () => {
      this._scheduleWSReconnect();
    };
  }

  _scheduleWSReconnect() {
    clearTimeout(this._wsAutoReconnectTimer);
    this._wsAutoReconnectTimer = setTimeout(() => this._connectWS(), 3000);
  }

  // ─── FENGARI EXECUTION ────────────────────────────────────────────────────

  /**
   * @param {string} source
   * @param {string} name
   * @param {string|null} dir – URL of the script's folder (ends in /), where fs_run_file looks
   *                            for files that aren't bundled scripts; null for picked files
   */
  async _execute(source, name, dir = null) {
    this._currentSource = source;
    this._scriptDir = dir;

    // Cleanup any previous script run
    this.api.reset();

    // Extract docs before execution (pure string parsing, no runtime needed)
    const docs = extractor.parse(source);

    // Ensure Fengari is available (loaded via <script> tag in HTML)
    if (!window.fengari) {
      this.onStatusChange('Fengari runtime not loaded — check <script> tag', 'error');
      this.onScriptError('Fengari not found');
      return;
    }

    // fengari-web exposes: fengari.lua, fengari.lauxlib, fengari.lualib
    // PLUS top-level helpers: fengari.to_luastring, fengari.to_jsstring
    const { lua, lualib, lauxlib, to_luastring } = window.fengari;
    this._lua = lua;
    this._lualib = lualib;
    this._lauxlib = lauxlib;

    // Create a fresh Lua state
    const L = lauxlib.luaL_newstate();
    this._L = L;
    lualib.luaL_openlibs(L);

    // ── Inject MonomeAPI globals into the Lua state ──────────────────────

    const api = this.api;
    const luaStr = (s) => to_luastring(s);

    const pushFn = (name, fn) => {
      lua.lua_pushstring(L, luaStr(name));
      lua.lua_pushcfunction(L, (L2) => {
        try {
          fn(L2);
        } catch (e) {
          lua.lua_pushstring(L2, luaStr(`[API error in ${name}]: ${e.message}`));
          lua.lua_error(L2);
        }
        return 0;
      });
      lua.lua_settable(L, lua.LUA_REGISTRYINDEX);
    };

    // Helper to get global (set at _G level)
    const setGlobal = (name, fn) => {
      lua.lua_pushcfunction(L, (L2) => {
        try { return fn(L2) || 0; } catch (e) {
          lua.lua_pushstring(L2, luaStr(String(e)));
          lua.lua_error(L2);
          return 0;
        }
      });
      lua.lua_setglobal(L, luaStr(name));
    };

    const getInt = (L2, idx) => Math.round(lua.lua_tonumber(L2, idx));

    // grid_size_x() → integer, grid_size_y() → integer (as on the device)
    setGlobal('grid_size_x', (L2) => {
      lua.lua_pushinteger(L2, api.cols); return 1;
    });
    setGlobal('grid_size_y', (L2) => {
      lua.lua_pushinteger(L2, api.rows); return 1;
    });

    // grid_led(x, y, lum, rel) — rel adds lum to the current level
    setGlobal('grid_led', (L2) => {
      api.grid_led(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3), lua.lua_toboolean(L2, 4)); return 0;
    });

    // grid_led_get(x, y) → 0–15 level
    setGlobal('grid_led_get', (L2) => {
      lua.lua_pushinteger(L2, api.grid_led_get(getInt(L2, 1), getInt(L2, 2))); return 1;
    });

    // grid_led_rgb(x, y, r, g, b)
    setGlobal('grid_led_rgb', (L2) => {
      api.grid_led_rgb(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3), getInt(L2, 4), getInt(L2, 5)); return 0;
    });

    // grid_led_all(lum, rel)
    setGlobal('grid_led_all', (L2) => {
      api.grid_led_all(getInt(L2, 1), lua.lua_toboolean(L2, 2)); return 0;
    });

    // grid_refresh()
    setGlobal('grid_refresh', (_L2) => {
      api.grid_refresh(); return 0;
    });

    // grid_set_screen(name) — switch which screen buffer draws write to
    setGlobal('grid_set_screen', (L2) => {
      const name = lua.lua_tojsstring(L2, 1);
      api.grid_set_screen(name); return 0;
    });

    // get_focused_screen() → string — which grid the last user interaction came from
    setGlobal('get_focused_screen', (L2) => {
      lua.lua_pushstring(L2, luaStr(api.getFocusedScreen())); return 1;
    });

    // display_screen(name) — signal the emulator which screen should be shown
    setGlobal('display_screen', (L2) => {
      const name = lua.lua_tojsstring(L2, 1);
      api.display_screen(name); return 0;
    });

    // grid_color(r, g, b)
    setGlobal('grid_color', (L2) => {
      api.grid_color(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3)); return 0;
    });

    // grid_color_intensity(val)
    setGlobal('grid_color_intensity', (L2) => {
      api.grid_color_intensity(getInt(L2, 1)); return 0;
    });

    // midi_note_on(note, vel, ch) — vel defaults to 100 as in iii's lib.lua
    setGlobal('midi_note_on', (L2) => {
      const vel = lua.lua_isnumber(L2, 2) ? getInt(L2, 2) : 100;
      api.midi_note_on(getInt(L2, 1), vel, getInt(L2, 3) || 1); return 0;
    });

    // midi_note_off(note, vel, ch) as in iii; the 2-arg form (note, ch) is kept for older scripts
    setGlobal('midi_note_off', (L2) => {
      if (lua.lua_gettop(L2) >= 3) api.midi_note_off(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3) || 1);
      else api.midi_note_off(getInt(L2, 1), getInt(L2, 2) || 1);
      return 0;
    });

    // midi_tx(d1, d2, d3) — raw MIDI out (iii built-in)
    setGlobal('midi_tx', (L2) => {
      api.midi_tx(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3)); return 0;
    });

    // midi_panic()
    setGlobal('midi_panic', (L2) => {
      api.midi_panic(); return 0;
    });

    // midi_cc(cc, val, ch)  — CC automation output
    setGlobal('midi_cc', (L2) => {
      api.midi_cc(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3) || 1); return 0;
    });

    // grid_brightness(val)  — set master brightness (1..15); alias for grid_color_intensity
    setGlobal('grid_brightness', (L2) => {
      api.grid_color_intensity(getInt(L2, 1)); return 0;
    });

    // grid_intensity(z)  — firmware global LED brightness (0..15); same master brightness here
    setGlobal('grid_intensity', (L2) => {
      api.grid_color_intensity(getInt(L2, 1)); return 0;
    });

    // get_time() → number
    setGlobal('get_time', (L2) => {
      lua.lua_pushnumber(L2, api.get_time()); return 1;
    });

    if (this.monochrome) {
      for (const fn of ['grid_led_rgb', 'grid_color', 'grid_color_intensity']) {
        lua.lua_pushnil(L);
        lua.lua_setglobal(L, luaStr(fn));
      }
    }

    // wrap, clamp, ps and the other lib.lua helpers come from III_LIB below

    // collectgarbage(opt) — Fengari has no lua_gc and throws "lua_gc not implemented",
    // so answer like an idle collector: "count" → 0 KB, "step" → false, others → 0
    setGlobal('collectgarbage', (L2) => {
      const opt = lua.lua_isstring(L2, 1) ? lua.lua_tojsstring(L2, 1) : 'collect';
      if (opt === 'step' || opt === 'isrunning') lua.lua_pushboolean(L2, opt === 'isrunning');
      else lua.lua_pushnumber(L2, 0);
      return 1;
    });

    // Errors from metro ticks and grid events are reported once per distinct message.
    // The error object must be popped: a leftover on every failing tick overflows the
    // stack, after which every metro and key press throws and the script goes dead.
    const reported = new Set();
    const reportPcall = (L2, status, where) => {
      if (status === lua.LUA_OK) return;
      const err = lua.lua_isstring(L2, -1) ? lua.lua_tojsstring(L2, -1) : '(non-string error)';
      lua.lua_pop(L2, 1);
      const msg = `${where}: ${err}`;
      if (reported.has(msg)) return;
      reported.add(msg);
      console.error(`[lua] ${msg}`);
      this.onStatusChange(`Lua runtime error in ${msg}`, 'error');
      this.onScriptError(msg);
    };

    // math.random / math.randomseed  (already in lualib, but ensure it's active)
    // metro table: metro.init(fn, time, count)
    // The metro warning waits until the script has loaded, so "✓ loaded" doesn't hide it.
    let loaded = false;
    let metroWarned = false;
    const checkMetroLimit = () => {
      const inUse = api._metros.filter(m => !m.freed).length;
      if (!loaded || metroWarned || inUse <= III_METRO_COUNT) return;
      metroWarned = true;
      this.onStatusChange(`${name}: ${inUse} metros in use, counting the one slew takes at boot. iii has ${III_METRO_COUNT}, so on the device metro.init returns nil past that`, 'warn');
    };
    this._injectMetro(L, lua, lauxlib, api, reportPcall, checkMetroLimit);

    // fs_list_files / fs_run_file / fs_read_file, and require = fs_run_file as in iii's lib.lua
    this._injectFs(L, lua, lauxlib, reportPcall);

    // pset_init / pset_write / pset_read  (iii preset persistence, backed by localStorage)
    this._injectPset(L, lua, lauxlib);

    // midi_out, slew, wrap, ps and the rest of iii's lib.lua (see iii-lib.js)
    const lib = luaStr(III_LIB);
    let libStatus = lauxlib.luaL_loadbuffer(L, lib, lib.length, luaStr('@lib.lua'));
    if (libStatus === lua.LUA_OK) libStatus = lua.lua_pcall(L, 0, 0, 0);
    reportPcall(L, libStatus, 'lib.lua');

    // ── Execute the Lua source ──────────────────────────────────────────

    const encoded = luaStr(source);
    const chunkName = luaStr(`@${name}`);
    const loadStatus = lauxlib.luaL_loadbuffer(L, encoded, encoded.length, chunkName);

    if (loadStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(L, -1);
      this.onStatusChange(`Lua parse error: ${err}`, 'error');
      this.onScriptError(err);
      return;
    }

    const callStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
    if (callStatus !== lua.LUA_OK) {
      const err = lua.lua_tojsstring(L, -1);
      this.onStatusChange(`Lua runtime error: ${err}`, 'error');
      this.onScriptError(err);
      return;
    }

    // ── Wire up event_grid from Lua globals ────────────────────────────
    // Looked up on every press, as on the device: a script may define or replace
    // event_grid later (selector clears it, then fs_run_file loads one that sets it).
    // Integers as on the device, so `x .. ""` gives "1", not "1.0".
    api.setEventGridHandler((x, y, z) => {
      lua.lua_getglobal(L, luaStr('event_grid'));
      if (!lua.lua_isfunction(L, -1)) { lua.lua_pop(L, 1); return; }
      lua.lua_pushinteger(L, x);
      lua.lua_pushinteger(L, y);
      lua.lua_pushinteger(L, z);
      reportPcall(L, lua.lua_pcall(L, 3, 0, 0), 'event_grid');
    });

    // ── event_midi, the same way: when the script defines it, it gets all incoming MIDI
    let echoWarned = false;
    api.setEventMidiHandler((d1, d2, d3, echo) => {
      lua.lua_getglobal(L, luaStr('event_midi'));
      if (!lua.lua_isfunction(L, -1)) { lua.lua_pop(L, 1); return false; }
      if (echo && !echoWarned) {
        echoWarned = true;
        this.onStatusChange(`${name} is receiving its own MIDI output (MIDI in and out may be the same device, or two devices both send clock). Pick another MIDI input to avoid a feedback loop.`, 'warn');
      }
      lua.lua_pushinteger(L, d1);
      lua.lua_pushinteger(L, d2);
      lua.lua_pushinteger(L, d3);
      reportPcall(L, lua.lua_pcall(L, 3, 0, 0), 'event_midi');
      return true;
    });

    // ── event_key(key): emulator only. A script that defines it gets key presses by name
    // instead of the emulator's fixed pad presses.
    api.setEventKeyHandler((key, repeat) => {
      lua.lua_getglobal(L, luaStr('event_key'));
      if (!lua.lua_isfunction(L, -1)) { lua.lua_pop(L, 1); return false; }
      if (repeat) { lua.lua_pop(L, 1); return true; }
      lua.lua_pushstring(L, luaStr(key));
      reportPcall(L, lua.lua_pcall(L, 1, 0, 0), 'event_key');
      return true;
    });

    this.onStatusChange(`✓ ${name} loaded`, 'success');
    this.onScriptLoad(name, docs);
    loaded = true;
    checkMetroLimit();
  }

  _injectMetro(L, lua, lauxlib, api, reportPcall, checkMetroLimit) {
    const { to_luastring } = window.fengari;
    const luaStr = (s) => to_luastring(s);

    // Mirrors iii's lib.lua metro:
    //   m = metro.init(fn, time, count)  or  metro.init{event=fn, time=t, count=n}
    //   m:start([time], [count])  m:stop()
    //   m.time / m.count / m.event can be read and assigned; m.is_running, m.id are read-only
    //   metro.free(id), metro.free_all() stop metros and give their slots back
    // The callback gets the stage (1..count, or -1 for an endless metro).
    // iii has 12 metro slots. There is no limit here, but checkMetroLimit warns past 12.

    const optNum = (L2, idx) => lua.lua_isnumber(L2, idx) ? lua.lua_tonumber(L2, idx) : undefined;
    const fieldNum = (L2, idx, key) => {
      lua.lua_getfield(L2, idx, luaStr(key));
      const v = optNum(L2, -1);
      lua.lua_pop(L2, 1);
      return v;
    };

    // Build the `metro` global table
    lua.lua_newtable(L);

    lua.lua_pushstring(L, luaStr('init'));
    lua.lua_pushcfunction(L, (L2) => {
      let interval, count;
      if (lua.lua_istable(L2, 1)) {
        interval = fieldNum(L2, 1, 'time');
        count = fieldNum(L2, 1, 'count');
        lua.lua_getfield(L2, 1, luaStr('event'));
      } else {
        interval = optNum(L2, 2);
        count = optNum(L2, 3);
        lua.lua_pushvalue(L2, 1);
      }
      // Keep the callback in the registry; m.event = fn swaps it
      let fnRef = lauxlib.luaL_ref(L2, lua.LUA_REGISTRYINDEX);

      const wrappedFn = (stage) => {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, fnRef);
        if (lua.lua_isnil(L, -1)) { lua.lua_pop(L, 1); return; }
        lua.lua_pushinteger(L, stage);
        reportPcall(L, lua.lua_pcall(L, 1, 0, 0), 'metro');
      };

      const metro = api.createMetro(wrappedFn, interval || 1, count === undefined ? -1 : Math.trunc(count));
      const id = api._metros.length;
      checkMetroLimit();

      lua.lua_newtable(L2);

      // :start([time], [count])  or  :start{time=, count=}
      lua.lua_pushstring(L2, luaStr('start'));
      lua.lua_pushcfunction(L2, (L3) => {
        if (lua.lua_istable(L3, 2)) metro.start(fieldNum(L3, 2, 'time'), fieldNum(L3, 2, 'count'));
        else metro.start(optNum(L3, 2), optNum(L3, 3));
        return 0;
      });
      lua.lua_settable(L2, -3);

      // :stop()
      lua.lua_pushstring(L2, luaStr('stop'));
      lua.lua_pushcfunction(L2, (_L3) => {
        metro.stop();
        return 0;
      });
      lua.lua_settable(L2, -3);

      lua.lua_newtable(L2); // metatable

      lua.lua_pushstring(L2, luaStr('__index'));
      lua.lua_pushcfunction(L2, (L3) => {
        const key = lua.lua_isstring(L3, 2) ? lua.lua_tojsstring(L3, 2) : null;
        if (key === 'time') lua.lua_pushnumber(L3, metro._interval);
        else if (key === 'count') lua.lua_pushinteger(L3, metro._count);
        else if (key === 'is_running') lua.lua_pushboolean(L3, metro.running);
        else if (key === 'id') lua.lua_pushinteger(L3, id);
        else if (key === 'event') lua.lua_rawgeti(L3, lua.LUA_REGISTRYINDEX, fnRef);
        else lua.lua_pushnil(L3);
        return 1;
      });
      lua.lua_settable(L2, -3);

      lua.lua_pushstring(L2, luaStr('__newindex'));
      lua.lua_pushcfunction(L2, (L3) => {
        const key = lua.lua_isstring(L3, 2) ? lua.lua_tojsstring(L3, 2) : null;
        if (key === 'time') metro.setTime(lua.lua_tonumber(L3, 3));
        else if (key === 'count') metro._count = Math.trunc(lua.lua_tonumber(L3, 3));
        else if (key === 'event') {
          lauxlib.luaL_unref(L3, lua.LUA_REGISTRYINDEX, fnRef);
          lua.lua_pushvalue(L3, 3);
          fnRef = lauxlib.luaL_ref(L3, lua.LUA_REGISTRYINDEX);
        } else {
          lua.lua_settop(L3, 3);
          lua.lua_rawset(L3, 1);
        }
        return 0;
      });
      lua.lua_settable(L2, -3);

      lua.lua_setmetatable(L2, -2);

      return 1; // returns the metro table
    });
    lua.lua_settable(L, -3); // metro.init = <cfn>

    // metro.free(id) — stop the metro and stop counting it toward the 12.
    // Anything but a metro id (e.g. the metro itself) errors, as it does on the device.
    lua.lua_pushstring(L, luaStr('free'));
    lua.lua_pushcfunction(L, (L2) => {
      const m = lua.lua_isinteger(L2, 1) ? api._metros[lua.lua_tointeger(L2, 1) - 1] : undefined;
      if (!m) {
        lua.lua_pushstring(L2, luaStr(`metro.free: no metro with id ${lauxlib.luaL_tolstring(L2, 1) && lua.lua_tojsstring(L2, -1)} (pass m.id, not the metro)`));
        return lua.lua_error(L2);
      }
      m.stop();
      m.freed = true;
      return 0;
    });
    lua.lua_settable(L, -3);

    // metro.free_all()
    lua.lua_pushstring(L, luaStr('free_all'));
    lua.lua_pushcfunction(L, (_L2) => {
      for (const m of api._metros) { m.stop(); m.freed = true; }
      return 0;
    });
    lua.lua_settable(L, -3);

    lua.lua_setglobal(L, luaStr('metro'));
  }

  // ─── FILESYSTEM (fs_list_files, fs_run_file, fs_read_file) ───────────────

  /**
   * The device's flat filesystem, read-only: fs_list_files() lists the bundled scripts by
   * file name, and fs_run_file(name) runs one in the current Lua state, which is how loader
   * scripts such as selector and many-roads start another script. Names that aren't bundled
   * scripts are looked up next to the running script (many-roads keeps its data file there).
   */
  _injectFs(L, lua, lauxlib, reportPcall) {
    const { to_luastring } = window.fengari;
    const luaStr = (s) => to_luastring(s);
    const cache = new Map();

    const readFile = (name) => {
      if (cache.has(name)) return cache.get(name);
      const url = this._fsFiles.get(name) ?? (this._scriptDir && !name.includes('/') ? this._scriptDir + name : null);
      const text = url ? this.readFileSync(url) : null;
      cache.set(name, text);
      return text;
    };

    const listFiles = () => {
      const files = [...this._fsFiles.keys()];
      const own = (this._currentScriptName || '').split('/').pop();
      if (own && !files.includes(own)) files.push(own);
      return files;
    };

    // fs_list_files() → { "name.lua", ... }
    lua.lua_pushcfunction(L, (L2) => {
      const files = listFiles();
      lua.lua_createtable(L2, files.length, 0);
      files.forEach((f, i) => {
        lua.lua_pushstring(L2, luaStr(f));
        lua.lua_rawseti(L2, -2, i + 1);
      });
      return 1;
    });
    lua.lua_setglobal(L, luaStr('fs_list_files'));

    // fs_read_file(name) → string | false
    lua.lua_pushcfunction(L, (L2) => {
      const text = readFile(lua.lua_tojsstring(L2, 1));
      if (text === null) lua.lua_pushboolean(L2, 0);
      else lua.lua_pushstring(L2, luaStr(text));
      return 1;
    });
    lua.lua_setglobal(L, luaStr('fs_read_file'));

    // fs_run_file(name) → first result of the chunk, or nil when it is missing or fails
    lua.lua_pushcfunction(L, (L2) => {
      const name = lua.lua_tojsstring(L2, 1);
      const text = readFile(name);
      if (text === null) {
        this.onStatusChange(`fs_run_file: ${name} not found`, 'warn');
        lua.lua_pushnil(L2);
        return 1;
      }
      const code = luaStr(text);
      const base = lua.lua_gettop(L2);
      let status = lauxlib.luaL_loadbuffer(L2, code, code.length, luaStr(`@${name}`));
      if (status === lua.LUA_OK) status = lua.lua_pcall(L2, 0, 1, 0);
      if (status !== lua.LUA_OK) {
        reportPcall(L2, status, name);
        lua.lua_settop(L2, base);
        lua.lua_pushnil(L2);
      } else {
        this.onStatusChange(`▶ ${name} (run by fs_run_file)`, 'info');
      }
      return 1;
    });
    lua.lua_pushvalue(L, -1);
    lua.lua_setglobal(L, luaStr('fs_run_file'));
    lua.lua_setglobal(L, luaStr('require'));
  }

  // ─── PSET (preset persistence, backed by localStorage) ──────────────────

  _injectPset(L, lua, lauxlib) {
    const { to_luastring } = window.fengari;
    const luaStr = (s) => to_luastring(s);
    let _psetNs = 'pset';   // namespace set by pset_init

    const setGlobal = (name, fn) => {
      lua.lua_pushcfunction(L, (L2) => {
        try { return fn(L2) || 0; } catch (e) {
          lua.lua_pushstring(L2, luaStr(String(e)));
          lua.lua_error(L2);
          return 0;
        }
      });
      lua.lua_setglobal(L, luaStr(name));
    };

    // ── Lua table ↔ JS object helpers ──────────────────────────────────

    /** Recursively convert a Lua table at absolute stack index to a JS object */
    const luaTableToJS = (L2, absIdx) => {
      const result = {};
      lua.lua_pushnil(L2);
      while (lua.lua_next(L2, absIdx) !== 0) {
        // key at -2, value at -1
        let key;
        const kt = lua.lua_type(L2, -2);
        if (kt === lua.LUA_TNUMBER) {
          key = lua.lua_tonumber(L2, -2);
        } else if (kt === lua.LUA_TSTRING) {
          key = lua.lua_tojsstring(L2, -2);
        } else {
          lua.lua_pop(L2, 1);
          continue;
        }
        const vt = lua.lua_type(L2, -1);
        let val;
        if (vt === lua.LUA_TNUMBER) {
          val = lua.lua_tonumber(L2, -1);
        } else if (vt === lua.LUA_TSTRING) {
          val = lua.lua_tojsstring(L2, -1);
        } else if (vt === lua.LUA_TBOOLEAN) {
          val = lua.lua_toboolean(L2, -1) !== 0;
        } else if (vt === lua.LUA_TTABLE) {
          const top = lua.lua_gettop(L2);
          val = luaTableToJS(L2, top);
        } else {
          val = null;
        }
        result[key] = val;
        lua.lua_pop(L2, 1); // pop value, keep key for next iteration
      }
      return result;
    };

    /** Recursively push a JS object as a Lua table onto L2's stack */
    const jsToLuaTable = (L2, obj) => {
      lua.lua_newtable(L2);
      for (const [k, v] of Object.entries(obj)) {
        // push key: numeric strings become Lua numbers (restores 1-based arrays)
        const numKey = Number(k);
        if (!isNaN(numKey) && String(numKey) === k) {
          lua.lua_pushnumber(L2, numKey);
        } else {
          lua.lua_pushstring(L2, luaStr(k));
        }
        // push value
        if (v === null || v === undefined) {
          lua.lua_pushboolean(L2, 0);
        } else if (typeof v === 'boolean') {
          lua.lua_pushboolean(L2, v ? 1 : 0);
        } else if (typeof v === 'number') {
          lua.lua_pushnumber(L2, v);
        } else if (typeof v === 'string') {
          lua.lua_pushstring(L2, luaStr(v));
        } else if (typeof v === 'object') {
          jsToLuaTable(L2, v);
        } else {
          lua.lua_pushboolean(L2, 0);
        }
        lua.lua_settable(L2, -3);
      }
    };

    // ── pset_init(name) ─────────────────────────────────────────────────
    setGlobal('pset_init', (L2) => {
      if (lua.lua_isstring(L2, 1)) {
        _psetNs = lua.lua_tojsstring(L2, 1);
      }
      return 0;
    });

    // ── pset_write(slot, table) ──────────────────────────────────────────
    setGlobal('pset_write', (L2) => {
      const slot = Math.round(lua.lua_tonumber(L2, 1));
      if (lua.lua_type(L2, 2) !== lua.LUA_TTABLE) return 0;
      const data = luaTableToJS(L2, 2);
      try {
        localStorage.setItem(`${_psetNs}_slot_${slot}`, JSON.stringify(data));
      } catch (e) {
        console.warn('[pset_write] localStorage error:', e);
      }
      return 0;
    });

    // ── pset_read(slot) → table | nil ───────────────────────────────────
    setGlobal('pset_read', (L2) => {
      const slot = Math.round(lua.lua_tonumber(L2, 1));
      let raw;
      try { raw = localStorage.getItem(`${_psetNs}_slot_${slot}`); } catch (e) {}
      if (!raw) {
        lua.lua_pushnil(L2);
        return 1;
      }
      try {
        const obj = JSON.parse(raw);
        jsToLuaTable(L2, obj);
        return 1;
      } catch (e) {
        lua.lua_pushnil(L2);
        return 1;
      }
    });

    // ── pset_delete(slot) ────────────────────────────────────────────────
    setGlobal('pset_delete', (L2) => {
      const slot = Math.round(lua.lua_tonumber(L2, 1));
      try { localStorage.removeItem(`${_psetNs}_slot_${slot}`); } catch (e) {}
      return 0;
    });
  }
}
