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
 */

import { DocExtractor } from './doc-extractor.js';

const extractor = new DocExtractor();

export class LuaLoader {
  /**
   * @param {Object} opts
   * @param {MonomeAPI} opts.api   – the grid-api instance
   * @param {Function} opts.onScriptLoad   – called after a script loads successfully: (name, docs)
   * @param {Function} opts.onScriptError  – called on runtime error: (errorMessage)
   * @param {Function} opts.onStatusChange – called with status text updates: (msg, level)
   * @param {string}   opts.wsUrl          – WebSocket URL for hot-reload (default: auto)
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
      return await res.json();
    } catch (e) {
      this.onStatusChange('Manifest unavailable — use File Picker to load scripts', 'warn');
      return [];
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
      await this._execute(source, filename);
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
      await this._execute(this._currentSource, this._currentScriptName);
    } else {
      await this.loadFromServer(this._currentScriptName, baseUrl);
    }
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

  async _execute(source, name) {
    this._currentSource = source;

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

    const getNum = (L2, idx) => lua.lua_tonumber(L2, idx);
    const getInt = (L2, idx) => Math.round(lua.lua_tonumber(L2, idx));

    // grid_size_x() → number, grid_size_y() → number
    setGlobal('grid_size_x', (L2) => {
      lua.lua_pushnumber(L2, api.cols); return 1;
    });
    setGlobal('grid_size_y', (L2) => {
      lua.lua_pushnumber(L2, api.rows); return 1;
    });

    // grid_led(x, y, lum)
    setGlobal('grid_led', (L2) => {
      api.grid_led(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3)); return 0;
    });

    // grid_led_rgb(x, y, r, g, b)
    setGlobal('grid_led_rgb', (L2) => {
      api.grid_led_rgb(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3), getInt(L2, 4), getInt(L2, 5)); return 0;
    });

    // grid_led_all(lum)
    setGlobal('grid_led_all', (L2) => {
      api.grid_led_all(getInt(L2, 1)); return 0;
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

    // midi_note_on(note, vel, ch)
    setGlobal('midi_note_on', (L2) => {
      api.midi_note_on(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3) || 1); return 0;
    });

    // midi_note_off(note, ch)
    setGlobal('midi_note_off', (L2) => {
      api.midi_note_off(getInt(L2, 1), getInt(L2, 2) || 1); return 0;
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

    // get_time() → number
    setGlobal('get_time', (L2) => {
      lua.lua_pushnumber(L2, api.get_time()); return 1;
    });

    // wrap(v, lo, hi) → number
    setGlobal('wrap', (L2) => {
      lua.lua_pushnumber(L2, api.wrap(getInt(L2, 1), getInt(L2, 2), getInt(L2, 3))); return 1;
    });

    // clamp(v, lo, hi) → number  (iii firmware built-in)
    setGlobal('clamp', (L2) => {
      const v = getNum(L2, 1), lo = getNum(L2, 2), hi = getNum(L2, 3);
      lua.lua_pushnumber(L2, Math.max(lo, Math.min(hi, v))); return 1;
    });

    // ps(fmt, ...) — iii firmware status-bar printf, silently ignored in emulator
    setGlobal('ps', (_L2) => 0);

    // math.random / math.randomseed  (already in lualib, but ensure it's active)
    // metro table: metro.init(fn, interval)
    this._injectMetro(L, lua, lauxlib, api);

    // pset_init / pset_write / pset_read  (iii preset persistence, backed by localStorage)
    this._injectPset(L, lua, lauxlib);

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
    lua.lua_getglobal(L, luaStr('event_grid'));
    const hasEventGrid = lua.lua_isfunction(L, -1);
    lua.lua_pop(L, 1);

    if (hasEventGrid) {
      api.setEventGridHandler((x, y, z) => {
        lua.lua_getglobal(L, luaStr('event_grid'));
        lua.lua_pushnumber(L, x);
        lua.lua_pushnumber(L, y);
        lua.lua_pushnumber(L, z);
        lua.lua_pcall(L, 3, 0, 0);
      });
    }

    this.onStatusChange(`✓ ${name} loaded`, 'success');
    this.onScriptLoad(name, docs);
  }

  _injectMetro(L, lua, lauxlib, api) {
    const { to_luastring } = window.fengari;
    const luaStr = (s) => to_luastring(s);

    // Create a JS-backed metro table to inject at "metro" global
    // We use a Lua helper that stores metros in a Lua table,
    // but delegates start/stop to JS via closures.

    // Strategy: inject metro.init as a C function that returns a userdata-like table
    // with :start() and :stop() methods pointing to JS functions.

    // Build the `metro` global table
    lua.lua_newtable(L);

    // metro.init = function(fn, interval)  [C closure]
    lua.lua_pushstring(L, luaStr('init'));
    lua.lua_pushcfunction(L, (L2) => {
      // arg1: function, arg2: interval (optional)
      const interval = lua.lua_isnumber(L2, 2) ? lua.lua_tonumber(L2, 2) : 1;

      // We store the Lua function ref in a JS closure
      // by making a reference using the registry
      lua.lua_pushvalue(L2, 1); // copy fn to top
      const fnRef = lauxlib.luaL_ref(L2, lua.LUA_REGISTRYINDEX);

      const wrappedFn = () => {
        lua.lua_rawgeti(L2, lua.LUA_REGISTRYINDEX, fnRef);
        lua.lua_pcall(L2, 0, 0, 0);
      };

      const metro = api.createMetro(wrappedFn, interval);

      // Build and push back a Lua table with :start() and :stop()
      lua.lua_newtable(L2);

      // :start([interval])
      lua.lua_pushstring(L2, luaStr('start'));
      lua.lua_pushcfunction(L2, (L3) => {
        const newInterval = lua.lua_isnumber(L3, 2) ? lua.lua_tonumber(L3, 2) : undefined;
        metro.start(newInterval);
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

      // Add __index metamethod so m:start() works (colon syntax)
      lua.lua_newtable(L2); // metatable
      lua.lua_pushstring(L2, luaStr('__index'));
      lua.lua_pushvalue(L2, -3); // the metro table itself
      lua.lua_settable(L2, -3);
      lua.lua_setmetatable(L2, -2);

      return 1; // returns the metro table
    });
    lua.lua_settable(L, -3); // metro.init = <cfn>

    lua.lua_setglobal(L, luaStr('metro'));
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
  }
}
