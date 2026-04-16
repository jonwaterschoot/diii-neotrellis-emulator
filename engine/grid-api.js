/**
 * grid-api.js
 * JS shim layer that maps the NeoTrellis/iii firmware grid API to browser equivalents.
 * This module is injected into the Fengari Lua runtime as globals before script execution.
 *
 * API Contract (what a Lua script can call):
 *   grid_led(x, y, lum)            – set pad at (x,y) to mono brightness 0–15
 *   grid_led_rgb(x, y, r, g, b)    – set pad at (x,y) to RGB (0–255 each)
 *   grid_color(r, g, b)            – set global tint for grid_led output
 *   grid_led_all(lum)              – set all pads to brightness
 *   grid_refresh()                 – flush frame buffer to DOM
 *   grid_color_intensity(val)      – set master brightness multiplier
 *   midi_note_on(note, vel)        – send MIDI note on + Web Audio fallback
 *   midi_note_off(note)            – send MIDI note off
 *   get_time()                     – seconds since page load (float)
 *   wrap(v, lo, hi)               – integer range wrapping utility
 *   metro.init(fn, interval)       – create a repeating timer object
 *   metro:start([interval])        – start/restart the metro timer
 *   metro:stop()                   – stop the metro timer
 *   event_grid(x, y, z)           – called BY the emulator when a pad is clicked
 */

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
    this._currentScreen = 'live';
    this._globalTint = { r: 255, g: 255, b: 255 };
    this.masterBright = 12; // 1–15 scale

    // MIDI
    this.midiOut = null;
    this.midiIn = null;
    this._activeNodes = new Map();
    this._audioCtx = null;
    this._masterGain = null;

    // Volume/attack/release controlled by emulator UI
    this.volume = 0.7;
    this.adsr = {
      attack: 0.005,
      decay: 0.1,
      sustain: 0.6,
      release: 0.2,
    };

    // FX controlled by emulator UI
    this.reverb = {
      amount: 0.2,
      decay: 1.5,
      stereo: true,
    };
    this.delay = {
      amount: 0.2,
      time: 0.25,
      feedback: 0.3,
    };

    // Filter controlled by MIDI CC/UI
    this.filter = {
      enabled: true,
      cc: 74,
      cutoff: 1.0,
    };
    this._filterNode = null;

    // Metro registry
    this._metros = [];

    // Lua event function – set once the script is loaded
    this._luaEventGrid = null;
    this._startTime = performance.now();

    // Tracks which screen the most recent user interaction came from
    this._focusedScreen = 'live';
  }

  setFocusedScreen(name) { this._focusedScreen = name; }
  getFocusedScreen() { return this._focusedScreen; }

  // ─── GRID LED API ─────────────────────────────────────────────────────────

  /** Set single pad to monochrome brightness (0–15) */
  grid_led(x, y, lum) {
    const level = Math.max(0, Math.min(15, Math.floor(lum || 0)));
    const scale = level / 15;
    const r = Math.max(0, Math.min(255, Math.floor(this._globalTint.r * scale)));
    const g = Math.max(0, Math.min(255, Math.floor(this._globalTint.g * scale)));
    const b = Math.max(0, Math.min(255, Math.floor(this._globalTint.b * scale)));
    this._setCell(x, y, r, g, b);
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

  /** Clear all pads of the current screen to a brightness level (0–15), default 0 */
  grid_led_all(lum) {
    const level = Math.max(0, Math.min(15, Math.floor(lum || 0)));
    const scale = level / 15;
    const r = Math.max(0, Math.min(255, Math.floor(this._globalTint.r * scale)));
    const g = Math.max(0, Math.min(255, Math.floor(this._globalTint.g * scale)));
    const b = Math.max(0, Math.min(255, Math.floor(this._globalTint.b * scale)));
    const buf = this._screenBuffers[this._currentScreen];
    for (let i = 0; i < buf.length; i++) { buf[i].r = r; buf[i].g = g; buf[i].b = b; }
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

  _setCell(x, y, r, g, b) {
    if (x < 1 || x > this.cols || y < 1 || y > this.rows) {
      if (r > 0 || g > 0 || b > 0) this._outOfBoundsWriteCount++;
      return;
    }
    const i = (y - 1) * this.cols + (x - 1);
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

  setFilterCutoff(val) {
    this.filter.cutoff = Math.max(0, Math.min(1, val));
    if (this._filterNode && this._audioCtx) {
      const freq = 20 * Math.pow(1000, this.filter.cutoff);
      this._filterNode.frequency.setTargetAtTime(freq, this._audioCtx.currentTime, 0.05);
    }
  }

  _handleMidiInput(msg) {
    const [status, data1, data2] = msg.data;
    const type = status & 0xF0;

    // Emit to MIDI monitor (all incoming messages)
    if (this.onMidiMonitor) this.onMidiMonitor('in', msg.data, performance.now());

    // Simplistic mapping: MIDI notes to grid coordinates
    if (type === 0x90 || type === 0x80) {
      const isPress = (type === 0x90 && data2 > 0);
      const x = (data1 % 16) + 1;
      const y = Math.floor(data1 / 16) + 1;
      if (x <= this.cols && y <= this.rows) {
        this.handlePadEvent(x, y, isPress ? 1 : 0);
      }
    } else if (type === 0xB0) {
      // Control Change
      const cc = data1;
      const val = data2;
      if (this.filter.enabled && cc === this.filter.cc) {
        this.setFilterCutoff(val / 127);
        if (this.onFilterUpdate) this.onFilterUpdate(this.filter.cutoff);
      }
    }
  }

  _ensureAudio() {
    if (this._audioCtx) return;
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this._masterGain = this._audioCtx.createGain();
    this._masterGain.gain.value = this.volume;
    this._masterGain.connect(this._audioCtx.destination);

    // Create FX chain
    this._reverbNode = this._audioCtx.createConvolver();
    this._reverbGain = this._audioCtx.createGain();
    this._reverbGain.gain.value = this.reverb.amount;
    this._reverbNode.connect(this._reverbGain).connect(this._masterGain);
    this._generateReverbImpulse();

    this._delayNode = this._audioCtx.createDelay(1.0);
    this._delayGain = this._audioCtx.createGain();
    this._delayFeedback = this._audioCtx.createGain();
    this._delayGain.gain.value = this.delay.amount;
    this._delayNode.delayTime.value = this.delay.time;
    this._delayFeedback.gain.value = this.delay.feedback;

    this._delayNode.connect(this._delayFeedback);
    this._delayFeedback.connect(this._delayNode);
    this._delayNode.connect(this._delayGain).connect(this._masterGain);

    // Create Filter node (placed before FX/Master split)
    this._filterNode = this._audioCtx.createBiquadFilter();
    this._filterNode.type = 'lowpass';
    const initialFreq = 20 * Math.pow(1000, this.filter.cutoff);
    this._filterNode.frequency.value = initialFreq;
    
    // The filter connects to the master and FX nodes
    this._filterNode.connect(this._masterGain);
    this._filterNode.connect(this._reverbNode);
    this._filterNode.connect(this._delayNode);
  }

  _generateReverbImpulse() {
    const sr = this._audioCtx.sampleRate;
    const len = sr * this.reverb.decay;
    const impulse = this._audioCtx.createBuffer(this.reverb.stereo ? 2 : 1, len, sr);
    const dataL = impulse.getChannelData(0);
    for (let i = 0; i < len; i++) {
      dataL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
    if (this.reverb.stereo) {
      const dataR = impulse.getChannelData(1);
      for (let i = 0; i < len; i++) {
        dataR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
      }
    }
    this._reverbNode.buffer = impulse;
  }

  midi_note_on(note, vel, ch = 1) {
    note = note & 0x7F;
    vel = vel & 0x7F;
    const status = 0x90 + ((ch - 1) & 0x0F);
    const bytes = [status, note, vel];
    if (this.midiOut) this.midiOut.send(bytes);
    if (this.onMidiMonitor) this.onMidiMonitor('out', bytes, performance.now());
    this._synthOn(note, vel);
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
    const bytes = [status, note, vel & 0x7F];
    if (this.midiOut) this.midiOut.send(bytes);
    if (this.onMidiMonitor) this.onMidiMonitor('out', bytes, performance.now());
    this._synthOff(note);
  }

  midi_cc(cc, val, ch = 1) {
    cc = cc & 0x7F;
    val = val & 0x7F;
    const status = 0xB0 + ((ch - 1) & 0x0F);
    const bytes = [status, cc, val];
    if (this.midiOut) this.midiOut.send(bytes);
    if (this.onMidiMonitor) this.onMidiMonitor('out', bytes, performance.now());
    // Self-apply: if this CC targets the internal filter, route it there too.
    // Mirrors what _handleMidiInput does for incoming hardware CC.
    if (this.filter.enabled && cc === this.filter.cc) {
      this.setFilterCutoff(val / 127);
      if (this.onFilterUpdate) this.onFilterUpdate(this.filter.cutoff, val);
    }
  }

  midi_panic() {
    const soundOff = [0xB0, 120, 0];
    const notesOff = [0xB0, 123, 0];
    if (this.midiOut) {
      this.midiOut.send(soundOff);
      this.midiOut.send(notesOff);
    }
    if (this.onMidiMonitor) {
      const t = performance.now();
      this.onMidiMonitor('out', soundOff, t);
      this.onMidiMonitor('out', notesOff, t);
    }
    for (const note of [...this._activeNodes.keys()]) {
      this._synthOff(note);
    }
  }

  _synthOn(note, vel) {
    this._ensureAudio();
    this._synthOff(note);
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc = this._audioCtx.createOscillator();
    const g = this._audioCtx.createGain();
    const now = this._audioCtx.currentTime;
    const attackTime = now + this.adsr.attack;
    const decayTime = attackTime + this.adsr.decay;
    const peakGain = (vel / 127) * 0.4;
    const sustainGain = peakGain * this.adsr.sustain;

    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peakGain, attackTime);
    g.gain.linearRampToValueAtTime(sustainGain, decayTime);
    
    osc.connect(g);
    
    // Connect to filter (which connects to master, reverb, delay)
    if (this._filterNode) {
        g.connect(this._filterNode);
    } else {
        // Fallback if audio not fully initialized or filter removed
        g.connect(this._masterGain);
        g.connect(this._reverbNode);
        g.connect(this._delayNode);
    }
    
    osc.start();
    const tid = setTimeout(() => this._synthOff(note), 3000);
    this._activeNodes.set(note, { osc, g, tid });
  }

  _synthOff(note) {
    const n = this._activeNodes.get(note);
    if (!n) return;
    clearTimeout(n.tid);
    const rel = this.adsr.release;
    const now = this._audioCtx.currentTime;
    n.g.gain.cancelScheduledValues(now);
    n.g.gain.setValueAtTime(n.g.gain.value, now);
    n.g.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    setTimeout(() => {
      try { n.osc.stop(); } catch (e) {}
      n.osc.disconnect();
      n.g.disconnect();
    }, (rel + 0.1) * 1000);
    this._activeNodes.delete(note);
  }

  // ─── METRO ────────────────────────────────────────────────────────────────

  /**
   * Create a metro (repeating timer) object.
   * Compatible with Norns metro.init() signature.
   * @param {Function} fn - callback on each tick
   * @param {number} interval - time between ticks in seconds
   * @returns {Metro} metro object with start() and stop() methods
   */
  createMetro(fn, interval) {
    const metro = {
      _fn: fn,
      _interval: interval || 1,
      _timerId: null,
      _api: this,
      start(newInterval) {
        if (newInterval !== undefined) this._interval = newInterval;
        this.stop();
        const ms = Math.max(8, Math.floor(this._interval * 1000));
        this._timerId = setInterval(() => {
          try { this._fn(); } catch (e) { console.error('[metro tick error]', e); }
        }, ms);
      },
      stop() {
        if (this._timerId !== null) {
          clearInterval(this._timerId);
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
    for (const [note] of this._activeNodes) this._synthOff(note);
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

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  /** Full cleanup before reloading a script */
  reset() {
    this.stopAllMetros();
    this.stopAllNotes();
    // Clear all screen buffers and reset to live screen
    this._screenBuffers = {
      live: new Array(this.cols * this.rows).fill(null).map(() => ({ r: 0, g: 0, b: 0 }))
    };
    this._currentScreen = 'live';
    this._luaEventGrid = null;
    this._startTime = performance.now();
    this._outOfBoundsWriteCount = 0;
  }
}
