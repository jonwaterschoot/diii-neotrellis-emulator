/**
 * grid-api.js
 * JS shim layer that maps the NeoTrellis/iii firmware grid API to browser equivalents.
 * This module is injected into the Fengari Lua runtime as globals before script execution.
 *
 * API Contract (what a Lua script can call):
 *   grid_led(x, y, lum, rel)       – set pad at (x,y) to mono brightness 0–15 (rel: add to current level)
 *   grid_led_get(x, y)             – current mono level 0–15 of a pad (grid_led_rgb leaves it alone)
 *   grid_led_rgb(x, y, r, g, b)    – set pad at (x,y) to RGB (0–255 each)
 *   grid_color(r, g, b)            – set global tint for grid_led output
 *   grid_led_all(lum, rel)         – set all pads to brightness (rel: add to current levels)
 *   grid_refresh()                 – flush frame buffer to DOM
 *   grid_color_intensity(val)      – set master brightness multiplier
 *   midi_note_on(note, vel)        – send MIDI note on + Web Audio fallback
 *   midi_note_off(note)            – send MIDI note off
 *   midi_tx(d1, d2, d3)            – raw MIDI out (clock, transport, any channel message)
 *   get_time()                     – seconds since page load (float)
 *   wrap(v, lo, hi)               – integer range wrapping utility
 *   metro.init(fn, time, count)    – create a timer; fn(stage), endless when count is omitted
 *   metro:start([time], [count])   – start the metro (on a running metro: change its period)
 *   metro:stop()                   – stop the metro timer
 *   event_grid(x, y, z)           – called BY the emulator when a pad is clicked
 *   event_midi(d1, d2, d3)        – called BY the emulator for incoming MIDI, when the script defines it
 *   event_key(key)                – called BY the emulator on a key press, when the script defines it (emulator only)
 */

import { SoundEngine } from './sound.js';

/** Incoming bytes that match something sent within this window count as our own output echoed back */
const MIDI_ECHO_WINDOW_MS = 20;

export class MonomeAPI {
  /**
   * @param {Object} opts
   * @param {number} opts.cols   – grid width (default 16)
   * @param {number} opts.rows   – grid height (default 8)
   * @param {Function} opts.onLedUpdate – called after gridRefresh with the frame buffer
   * @param {Function} opts.onAltLedUpdate – optional separate channel for alt/settings layer
   */
  constructor(opts = {}) {
    this.cols = opts.cols || 16;
    this.rows = opts.rows || 8;
    this.onLedUpdate = opts.onLedUpdate || (() => {});
    this.onDisplayScreen = opts.onDisplayScreen || (() => {});
    this.onOutOfBounds = opts.onOutOfBounds || null;
    /** Called with (direction:'in'|'out', bytes:Uint8Array|number[], timestampMs:number) for every MIDI message */
    this.onMidiMonitor = opts.onMidiMonitor || null;
    this._outOfBoundsWriteCount = 0;

    // Per-screen frame buffers. 'live' is always present; others created on demand.
    // grid_set_screen(name) switches which buffer _setCell writes to.
    this._screenBuffers = {
      live: new Array(this.cols * this.rows).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    };
    // 0–15 level per pad and screen, as the firmware's mmap: what grid_led_get returns
    this._levelBuffers = { live: new Array(this.cols * this.rows).fill(0) };
    this._currentScreen = 'live';
    this._globalTint = { r: 255, g: 255, b: 255 };
    this.masterBright = 12; // 1–15 scale

    // MIDI
    this.midiOut = null;
    this.midiIn = null;

    // Everything the emulator plays: synth parts, drum kit, effects (see sound.js)
    this.sound = new SoundEngine();

    // Metro registry
    this._metros = [];

    // Lua event functions – set once the script is loaded
    this._luaEventGrid = null;
    this._luaEventMidi = null;
    this._luaEventKey = null;
    // Bytes of recently sent messages → time sent, to spot our own output coming back in
    this._recentOut = new Map();
    this._startTime = performance.now();

    // Tracks which screen the most recent user interaction came from
    this._focusedScreen = 'live';
  }

  setFocusedScreen(name) { this._focusedScreen = name; }
  getFocusedScreen() { return this._focusedScreen; }

  // ─── GRID LED API ─────────────────────────────────────────────────────────

  /** Set single pad to monochrome brightness (0–15); with rel, lum is added to the current level */
  grid_led(x, y, lum, rel = false) {
    let level = Math.floor(lum || 0);
    if (rel && this._inBounds(x, y)) level += this._levelBuffers[this._currentScreen][this._cellIndex(x, y)];
    level = Math.max(0, Math.min(15, level));
    const [r, g, b] = this._tinted(level);
    this._setCell(x, y, r, g, b);
    if (this._inBounds(x, y)) this._levelBuffers[this._currentScreen][this._cellIndex(x, y)] = level;
  }

  /** Current mono level (0–15) of a pad. Coordinates wrap around the grid, as on the firmware. */
  grid_led_get(x, y) {
    const cx = ((Math.floor(x) - 1) % this.cols + this.cols) % this.cols;
    const cy = ((Math.floor(y) - 1) % this.rows + this.rows) % this.rows;
    return this._levelBuffers[this._currentScreen][cy * this.cols + cx];
  }

  /** Set single pad to RGB color (0–255 each) */
  grid_led_rgb(x, y, r, g, b) {
    this._setCell(x, y, r, g, b);
  }

  /**
   * Explicitly signal the emulator which screen should be visible.
   * In single-view this switches the main grid; in dual-view it switches the ghost grid.
   * Scripts call this after changing display state (e.g. opening a settings page).
   */
  display_screen(name) {
    this.onDisplayScreen(name);
  }

  /** Switch which screen buffer subsequent grid_led / grid_led_rgb / grid_led_all calls write to */
  grid_set_screen(name) {
    if (!this._screenBuffers[name]) {
      this._screenBuffers[name] = new Array(this.cols * this.rows).fill(null).map(() => ({ r: 0, g: 0, b: 0 }));
      this._levelBuffers[name] = new Array(this.cols * this.rows).fill(0);
    }
    this._currentScreen = name;
  }

  /** Set a global tint for subsequent grid_led() / grid_led_all() output. */
  grid_color(r, g, b) {
    this._globalTint = {
      r: Math.max(0, Math.min(255, Math.floor(r || 0))),
      g: Math.max(0, Math.min(255, Math.floor(g || 0))),
      b: Math.max(0, Math.min(255, Math.floor(b || 0)))
    };
  }

  /** Set all pads of the current screen to a brightness level (0–15), default 0; with rel, add to each level */
  grid_led_all(lum, rel = false) {
    const buf = this._screenBuffers[this._currentScreen];
    const levels = this._levelBuffers[this._currentScreen];
    for (let i = 0; i < buf.length; i++) {
      const level = Math.max(0, Math.min(15, Math.floor(lum || 0) + (rel ? levels[i] : 0)));
      [buf[i].r, buf[i].g, buf[i].b] = this._tinted(level);
      levels[i] = level;
    }
  }

  /** Flush ALL screen buffers to the DOM — each screen fires onLedUpdate with its name */
  grid_refresh() {
    const bs = this.masterBright / 12;
    for (const [screenName, buf] of Object.entries(this._screenBuffers)) {
      const out = buf.map(cell => ({
        r: Math.min(255, Math.floor(cell.r * bs)),
        g: Math.min(255, Math.floor(cell.g * bs)),
        b: Math.min(255, Math.floor(cell.b * bs)),
      }));
      this.onLedUpdate(out, this.cols, this.rows, screenName);
    }
    if (this._outOfBoundsWriteCount > 0 && this.onOutOfBounds) {
      this.onOutOfBounds(this._outOfBoundsWriteCount);
      this._outOfBoundsWriteCount = 0;
    }
  }

  /** Set master brightness multiplier (1–15) */
  grid_color_intensity(val) {
    this.masterBright = Math.max(1, Math.min(15, val));
  }

  /** RGB for a 0–15 level in the current grid_color tint */
  _tinted(level) {
    const scale = level / 15;
    const t = this._globalTint;
    return [t.r, t.g, t.b].map(c => Math.max(0, Math.min(255, Math.floor(c * scale))));
  }

  _inBounds(x, y) { return x >= 1 && x <= this.cols && y >= 1 && y <= this.rows; }
  _cellIndex(x, y) { return (y - 1) * this.cols + (x - 1); }

  _setCell(x, y, r, g, b) {
    if (!this._inBounds(x, y)) {
      if (r > 0 || g > 0 || b > 0) this._outOfBoundsWriteCount++;
      return;
    }
    const i = this._cellIndex(x, y);
    const buf = this._screenBuffers[this._currentScreen];
    buf[i].r = r; buf[i].g = g; buf[i].b = b;
  }

  // ─── MIDI + AUDIO ──────────────────────────────────────────────────────────

  setMidiOut(midiOut) {
    this.midiOut = midiOut;
  }

  setMidiIn(midiIn) {
    if (this.midiIn) {
      this.midiIn.onmidimessage = null;
    }
    this.midiIn = midiIn;
    if (this.midiIn) {
      this.midiIn.onmidimessage = (msg) => this._handleMidiInput(msg);
    }
  }

  /**
   * Incoming MIDI. A script that defines event_midi gets every message, as on iii;
   * otherwise notes are mapped to pad presses. The filter CC works either way.
   */
  _handleMidiInput(msg) {
    const [status, data1 = 0, data2 = 0] = msg.data;
    const type = status & 0xF0;
    const now = performance.now();

    // Emit to MIDI monitor (all incoming messages)
    if (this.onMidiMonitor) this.onMidiMonitor('in', msg.data, now);

    const sentAt = this._recentOut.get(msg.data.join(','));
    const echo = sentAt !== undefined && now - sentAt < MIDI_ECHO_WINDOW_MS;
    const toScript = this._luaEventMidi ? this._luaEventMidi(status, data1, data2, echo) : false;

    // Simplistic mapping: MIDI notes to grid coordinates
    if (!toScript && (type === 0x90 || type === 0x80)) {
      const isPress = (type === 0x90 && data2 > 0);
      const x = (data1 % 16) + 1;
      const y = Math.floor(data1 / 16) + 1;
      if (x <= this.cols && y <= this.rows) {
        this.handlePadEvent(x, y, isPress ? 1 : 0);
      }
    } else if (type === 0xB0) {
      // A CC can move a synth part's filter
      this.sound.cc(data1, data2, (status & 0x0F) + 1);
    }
  }

  /** Send to the MIDI output (if any), show in the monitor, and remember it for echo detection */
  _sendOut(bytes) {
    const now = performance.now();
    if (this.midiOut) {
      try { this.midiOut.send(bytes); } catch (e) { console.warn('[midi out]', e); }
      this._recentOut.set(bytes.join(','), now);
      if (this._recentOut.size > 64) {
        for (const [k, t] of this._recentOut) if (now - t >= MIDI_ECHO_WINDOW_MS) this._recentOut.delete(k);
      }
    }
    if (this.onMidiMonitor) this.onMidiMonitor('out', bytes, now);
  }

  midi_note_on(note, vel, ch = 1) {
    note = note & 0x7F;
    vel = vel & 0x7F;
    const status = 0x90 + ((ch - 1) & 0x0F);
    this._sendOut([status, note, vel]);
    this.sound.noteOn(note, vel, ch);
  }

  midi_note_off(note, p2, p3) {
    let vel, ch;
    if (p3 === undefined) {
      // Backward compatibility: midi_note_off(note, ch)
      vel = 0;
      ch = p2 || 1;
    } else {
      // Standard signature: midi_note_off(note, vel, ch)
      vel = p2;
      ch = p3;
    }
    note = note & 0x7F;
    const status = 0x80 + ((ch - 1) & 0x0F);
    this._sendOut([status, note, vel & 0x7F]);
    this.sound.noteOff(note, ch);
  }

  midi_cc(cc, val, ch = 1) {
    cc = cc & 0x7F;
    val = val & 0x7F;
    const status = 0xB0 + ((ch - 1) & 0x0F);
    this._sendOut([status, cc, val]);
    this.sound.cc(cc, val, ch); // as for incoming CCs: may move a synth part's filter
  }

  /**
   * Raw MIDI out, like iii's midi_tx(d1, d2, d3). Note and CC messages go through
   * midi_note_on/off and midi_cc so they also reach the emulator's sound.
   * Clock and transport (0xF8, 0xFA, 0xFC, ...) are sent as single bytes.
   */
  midi_tx(d1, d2 = 0, d3 = 0) {
    d1 &= 0xFF;
    const type = d1 & 0xF0;
    const ch = (d1 & 0x0F) + 1;
    if (type === 0x90 && d3 > 0) return this.midi_note_on(d2, d3, ch);
    if (type === 0x90 || type === 0x80) return this.midi_note_off(d2, d3, ch);
    if (type === 0xB0) return this.midi_cc(d2, d3, ch);
    let bytes;
    if (d1 < 0x80 || d1 === 0xF0 || d1 === 0xF7 || d1 === 0xF4 || d1 === 0xF5) return; // data bytes, sysex
    else if (d1 >= 0xF6) bytes = [d1];
    else if (type === 0xC0 || type === 0xD0 || d1 === 0xF1 || d1 === 0xF3) bytes = [d1, d2 & 0x7F];
    else bytes = [d1, d2 & 0x7F, d3 & 0x7F];
    this._sendOut(bytes);
  }

  midi_panic() {
    this._sendOut([0xB0, 120, 0]); // all sound off
    this._sendOut([0xB0, 123, 0]); // all notes off
    this.sound.allOff();
  }

  // ─── METRO ────────────────────────────────────────────────────────────────

  /**
   * Create a metro (repeating timer) object.
   * Compatible with Norns metro.init() signature.
   * @param {Function} fn - callback on each tick
   * @param {number} interval - time between ticks in seconds
   * @returns {Metro} metro object with start() and stop() methods
   */
  /**
   * Timer with iii metro semantics. fn(stage) gets 1..count for a counted metro
   * and -1 for an endless one (count -1). As on the device, start() on a running
   * metro only changes its period. Ticks are scheduled against a running target
   * time, so tempo doesn't drift the way chained intervals do.
   */
  createMetro(fn, interval, count = -1) {
    const metro = {
      _fn: fn,
      _interval: interval || 1,
      _count: count,
      _stages: count,
      _remaining: count,
      _next: 0,
      _timerId: null,
      _api: this,
      get running() { return this._timerId !== null; },
      start(newInterval, newCount) {
        if (newInterval !== undefined) this._interval = newInterval;
        if (newCount !== undefined) this._count = Math.trunc(newCount);
        if (this._timerId !== null) return;
        this._stages = this._remaining = this._count;
        this._next = performance.now();
        this._schedule();
      },
      setTime(t) {
        if (t > 0) this._interval = t;
      },
      _schedule() {
        const ms = Math.max(1, this._interval * 1000);
        const now = performance.now();
        this._next += ms;
        if (this._next < now - 100) this._next = now + ms; // far behind (background tab): skip, don't burst
        this._timerId = setTimeout(() => this._tick(), Math.max(0, this._next - now));
      },
      _tick() {
        this._timerId = null;
        let stage = -1;
        if (this._remaining >= 0) {
          if (this._remaining > 0) this._remaining--;
          stage = this._stages - this._remaining;
        }
        if (this._remaining !== 0) this._schedule();
        try { this._fn(stage); } catch (e) { console.error('[metro tick error]', e); }
      },
      stop() {
        if (this._timerId !== null) {
          clearTimeout(this._timerId);
          this._timerId = null;
        }
      }
    };
    this._metros.push(metro);
    return metro;
  }

  /** Stop all running metros (called on script unload/reload) */
  stopAllMetros() {
    for (const m of this._metros) m.stop();
    this._metros = [];
  }

  stopAllNotes() {
    this.sound.allOff();
  }

  // ─── TIMING ───────────────────────────────────────────────────────────────

  /** Returns seconds elapsed since emulator start */
  get_time() {
    return (performance.now() - this._startTime) / 1000;
  }

  /** Integer range wrapping: wrap(v, lo, hi) */
  wrap(v, lo, hi) {
    const r = hi - lo + 1;
    return lo + (((v - lo) % r) + r) % r;
  }

  // ─── INPUT BRIDGE ─────────────────────────────────────────────────────────

  /**
   * Called by the emulator UI when a pad is pressed or released.
   * Routes to the Lua event_grid function if available.
   * @param {number} x
   * @param {number} y
   * @param {number} z  – 1 = press, 0 = release
   */
  handlePadEvent(x, y, z) {
    if (this._luaEventGrid) {
      try {
        this._luaEventGrid(x, y, z);
      } catch (e) {
        console.error('[event_grid error]', e);
      }
    }
  }

  /** Register the Lua event_grid callback (called by lua-loader after script init) */
  setEventGridHandler(fn) {
    this._luaEventGrid = fn;
  }

  /**
   * Register the event_midi bridge (called by lua-loader after script init).
   * fn(d1, d2, d3, echo) returns true when the script handled the message;
   * echo is true when the same bytes were sent out moments ago.
   */
  setEventMidiHandler(fn) {
    this._luaEventMidi = fn;
  }

  /**
   * A key press, by name ("space", "tab", "up", "a", "1"…). Goes to the script's event_key
   * if it has one (a held key's repeats are swallowed, not passed on); returns false when the
   * script has no event_key, so the caller can press its fixed pads instead.
   */
  handleKeyEvent(key, repeat = false) {
    return this._luaEventKey ? this._luaEventKey(key, repeat) : false;
  }

  /** Register the event_key bridge (called by lua-loader after script init); fn returns true when handled */
  setEventKeyHandler(fn) {
    this._luaEventKey = fn;
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  /** Full cleanup before reloading a script */
  reset() {
    this.stopAllMetros();
    this.stopAllNotes();
    // Clear all screen buffers and reset to live screen
    this._screenBuffers = {
      live: new Array(this.cols * this.rows).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    };
    this._levelBuffers = { live: new Array(this.cols * this.rows).fill(0) };
    this._currentScreen = 'live';
    this._luaEventGrid = null;
    this._luaEventMidi = null;
    this._luaEventKey = null;
    this._recentOut.clear();
    this._startTime = performance.now();
    this._outOfBoundsWriteCount = 0;
  }
}
