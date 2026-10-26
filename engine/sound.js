/**
 * sound.js
 * Everything the emulator plays: synth parts and the drum kit, three shared effects
 * (reverb, delay, chorus) and the master volume.
 *
 *   synth part:  voices → level → filter ─┬→ master
 *                                         ├→ reverb send
 *                                         ├→ delay send
 *                                         └→ chorus send
 *   drum kit:    drums → level ─ same sends
 *
 * A note goes to the drum kit if the kit takes it (see drums.js), otherwise to every synth
 * part on its channel (a part on channel 0 takes any channel), so parts on the same channel
 * play together. A CC on a part's channel moves its filter when it matches the part's CC.
 *
 * Quality 'light' (for phones) keeps fewer voices, a shorter mono reverb, no chorus and
 * no drift or movement.
 */

import { DrumKit } from './drums.js';
import { buildVoice, SYNTH_MODELS } from './synth.js';

const GAIN_SMOOTHING = 0.02;      // s, time constant for levels and sends
const FX_INPUT_FADE = 0.03;       // s; a new reverb or delay line takes over new sound this fast
const DELAY_MAX_RING_OUT = 3;     // s
const DELAY_UPDATE_MS = 80;       // while dragging, the delay time changes at most this often
const LIGHT_VOICES = 6;           // per part, in light quality

/** Built-in starting points for a synth part */
export const SYNTH_PRESETS = {
  'Soft keys':     { model: 'triangle', drift: 0, movement: 0, adsr: { attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.4 }, cutoff: 1, sends: { reverb: 0.2, delay: 0.1, chorus: 0 } },
  'Warm pad':      { model: 'pad', drift: 0.4, movement: 0.3, adsr: { attack: 0.6, decay: 0.8, sustain: 0.8, release: 1.5 }, cutoff: 0.85, sends: { reverb: 0.45, delay: 0.15, chorus: 0.3 } },
  'Glass bell':    { model: 'fm', drift: 0, movement: 0, adsr: { attack: 0.002, decay: 1.2, sustain: 0.2, release: 1.2 }, cutoff: 1, sends: { reverb: 0.35, delay: 0.2, chorus: 0 } },
  'Pluck':         { model: 'pluck', drift: 0.1, movement: 0, adsr: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.25 }, cutoff: 1, sends: { reverb: 0.2, delay: 0.3, chorus: 0 } },
  'Drifting lead': { model: 'saw', drift: 0.6, movement: 0.2, adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 }, cutoff: 0.9, sends: { reverb: 0.2, delay: 0.2, chorus: 0.4 } },
  'Plucked string': { model: 'string', drift: 0.05, movement: 0, adsr: { attack: 0.001, decay: 3, sustain: 1, release: 0.6 }, cutoff: 1, sends: { reverb: 0.3, delay: 0.1, chorus: 0.15 } },
  'Hollow bass':   { model: 'square', drift: 0.1, movement: 0, adsr: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.15 }, cutoff: 0.55, sends: { reverb: 0.05, delay: 0, chorus: 0 } },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function newSynthPart(name, channel = 0, preset = 'Soft keys') {
  return { kind: 'synth', name, channel, preset, cc: 74, level: 0.8, ...clone(SYNTH_PRESETS[preset]) };
}

/** Filter cutoff 0–1 → Hz (20 Hz – 20 kHz, exponential) */
const cutoffHz = (c) => 20 * Math.pow(1000, Math.max(0, Math.min(1, c)));

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
    this.light = false;
    this.fx = {
      reverb: { type: 'hall', decay: 1.8, level: 1 },
      delay: { time: 0.25, feedback: 0.3, level: 1 },
      chorus: { rate: 0.6, depth: 0.5, level: 1 },
    };
    this.parts = [newSynthPart('Synth 1')];
    this.drums = new DrumKit();
    this.drumSends = { reverb: 0.35, delay: 0, chorus: 0 };
    this.noteGuard = 30;       // s: a note with no note off stops after this; 0 = never
    this.onPartChange = null;  // (partIndex) — a CC moved a part's filter
    this._graphs = new Map();  // part → its audio nodes
    this._delayTimer = null;
  }

  // ── Settings to keep ────────────────────────────────────────────────────────

  toJSON() {
    return { fx: this.fx, parts: this.parts, drums: this.drums.toJSON(), drumSends: this.drumSends, noteGuard: this.noteGuard };
  }

  load(saved) {
    if (!saved) return;
    if (saved.fx) for (const k of ['reverb', 'delay', 'chorus']) Object.assign(this.fx[k], saved.fx[k] || {});
    if (Array.isArray(saved.parts) && saved.parts.length) {
      this.parts = saved.parts.map((p, i) => {
        const part = { ...newSynthPart(`Synth ${i + 1}`), ...p };
        if (!SYNTH_MODELS[part.model]) part.model = 'triangle';
        return part;
      });
    }
    if (saved.drums) this.drums.load(saved.drums);
    if (saved.drumSends) Object.assign(this.drumSends, saved.drumSends);
    if (typeof saved.noteGuard === 'number') this.noteGuard = saved.noteGuard;
  }

  // ── Audio graph ──────────────────────────────────────────────────────────────

  ensure() {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // Reverb: _reverbIn → (input fade → convolver) → _reverbOut; _swapReverb replaces the convolver
    this._reverbIn = ctx.createGain();
    this._reverbOut = ctx.createGain();
    this._reverbOut.gain.value = this.fx.reverb.level;
    this._reverbOut.connect(this.master);
    this._reverb = null;
    this._swapReverb();

    // Delay: _delayIn → (input fade → delay ⟲ feedback → output) → _delayOut
    this._delayIn = ctx.createGain();
    this._delayOut = ctx.createGain();
    this._delayOut.gain.value = this.fx.delay.level;
    this._delayOut.connect(this.master);
    this._delayLine = null;
    this._swapDelay();

    this._buildChorus();

    // Drum kit: its own level, then the same dry/send split as a synth part
    this._drumBus = this._partBus(this.drumSends, null);
    this.drums.connect(ctx, this._drumBus.input);
    return ctx;
  }

  _smooth(param, value) {
    if (this.ctx) param.setTargetAtTime(value, this.ctx.currentTime, GAIN_SMOOTHING);
  }

  /** input → (filter) → master, plus one send per effect */
  _partBus(sends, filterHz) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let out = input;
    let filter = null;
    if (filterHz !== null) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterHz;
      input.connect(filter);
      out = filter;
    }
    out.connect(this.master);
    const sendNodes = {};
    for (const [fx, dest] of [['reverb', this._reverbIn], ['delay', this._delayIn], ['chorus', this._chorusIn]]) {
      const g = ctx.createGain();
      g.gain.value = this._sendLevel(fx, sends[fx]);
      out.connect(g).connect(dest);
      sendNodes[fx] = g;
    }
    return { input, filter, sends: sendNodes };
  }

  _sendLevel(fx, amount) {
    return fx === 'chorus' && this.light ? 0 : amount;
  }

  _graph(part) {
    let g = this._graphs.get(part);
    if (!g) {
      this.ensure();
      g = { ...this._partBus(part.sends, cutoffHz(part.cutoff)), voices: new Map() };
      g.input.gain.value = part.level;
      this._graphs.set(part, g);
    }
    return g;
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  noteOn(note, vel, ch) {
    this.ensure();
    if (this.drums.noteOn(note, vel, ch)) return;
    for (const part of this.parts) if (!part.channel || part.channel === ch) this._voiceOn(part, note, vel);
  }

  noteOff(note, ch) {
    if (!this.ctx) return;
    if (this.drums.takes(note, ch)) return; // drums ring out
    for (const part of this.parts) if (!part.channel || part.channel === ch) this._voiceOff(part, note);
  }

  /** A CC: moves the filter of the parts on that channel that listen to it */
  cc(cc, val, ch) {
    this.parts.forEach((part, i) => {
      if ((part.channel && part.channel !== ch) || part.cc !== cc) return;
      this.setPart(i, { cutoff: val / 127 });
      if (this.onPartChange) this.onPartChange(i);
    });
  }

  /** Play a note on one part only, ignoring channels (the Try button) */
  playOn(partIndex, note, vel, ms) {
    const part = this.parts[partIndex];
    if (!part) return;
    this.ensure();
    this._voiceOn(part, note, vel);
    setTimeout(() => this._voiceOff(part, note), ms);
  }

  _voiceOn(part, note, vel) {
    const g = this._graph(part);
    this._voiceOff(part, note);
    if (this.light && g.voices.size >= LIGHT_VOICES) this._voiceOff(part, g.voices.keys().next().value);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const voice = buildVoice(ctx, part.model, freq, now, this.light ? { vel } : { ...part, vel });
    const env = ctx.createGain();
    const { attack, decay, sustain } = part.adsr;
    const peak = (vel / 127) * 0.4;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + attack);
    env.gain.linearRampToValueAtTime(peak * sustain, now + attack + decay);
    voice.output.connect(env).connect(g.input);
    const tid = this.noteGuard ? setTimeout(() => this._voiceOff(part, note), this.noteGuard * 1000) : 0;
    g.voices.set(note, { ...voice, env, tid });
  }

  _voiceOff(part, note) {
    const g = this._graphs.get(part);
    const v = g && g.voices.get(note);
    if (!v) return;
    g.voices.delete(note);
    clearTimeout(v.tid);
    const rel = Math.max(0.01, part.adsr.release);
    const now = this.ctx.currentTime;
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(v.env.gain.value, now);
    v.env.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    setTimeout(() => {
      for (const src of v.sources) {
        try { src.stop(); } catch (e) { /* already stopped */ }
        src.disconnect();
      }
      v.output.disconnect();
      v.env.disconnect();
    }, (rel + 0.1) * 1000);
  }

  /** Release every synth note, and cut a ringing open hat */
  allOff() {
    for (const part of this.parts) {
      const g = this._graphs.get(part);
      if (g) for (const note of [...g.voices.keys()]) this._voiceOff(part, note);
    }
    this.drums.stopAll();
  }

  // ── Parts ────────────────────────────────────────────────────────────────────

  /** Change a part's settings; levels, filter and sends ramp */
  setPart(i, changes) {
    const part = this.parts[i];
    if (!part) return;
    if (changes.sends) changes = { ...changes, sends: { ...part.sends, ...changes.sends } };
    if (changes.adsr) changes = { ...changes, adsr: { ...part.adsr, ...changes.adsr } };
    Object.assign(part, changes);
    const g = this._graphs.get(part);
    if (!g) return;
    if ('level' in changes) this._smooth(g.input.gain, part.level);
    if ('cutoff' in changes) this._smooth(g.filter.frequency, cutoffHz(part.cutoff));
    if (changes.sends) for (const fx in g.sends) this._smooth(g.sends[fx].gain, this._sendLevel(fx, part.sends[fx]));
  }

  applyPreset(i, name) {
    const preset = SYNTH_PRESETS[name];
    if (preset) this.setPart(i, { ...clone(preset), preset: name });
  }

  addPart() {
    const used = new Set(this.parts.map(p => p.channel));
    let ch = 1;
    while (used.has(ch) && ch < 16) ch++;
    this.parts.push(newSynthPart(`Synth ${this.parts.length + 1}`, ch));
    return this.parts.length - 1;
  }

  removePart(i) {
    const part = this.parts[i];
    if (!part || this.parts.length < 2) return;
    const g = this._graphs.get(part);
    if (g) {
      for (const note of [...g.voices.keys()]) this._voiceOff(part, note);
      setTimeout(() => { g.input.disconnect(); if (g.filter) g.filter.disconnect(); for (const s of Object.values(g.sends)) s.disconnect(); }, 5000);
      this._graphs.delete(part);
    }
    this.parts.splice(i, 1);
  }

  setDrumSends(changes) {
    Object.assign(this.drumSends, changes);
    if (this._drumBus) for (const fx in this._drumBus.sends) this._smooth(this._drumBus.sends[fx].gain, this._sendLevel(fx, this.drumSends[fx]));
  }

  // ── Master and quality ───────────────────────────────────────────────────────

  setVolume(volume) {
    this.volume = volume;
    if (this.master) this._smooth(this.master.gain, this.muted ? 0 : volume);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this._smooth(this.master.gain, muted ? 0 : this.volume);
  }

  /** Light: fewer voices, a shorter mono reverb, no chorus, no drift or movement */
  setLight(light) {
    if (this.light === light) return;
    this.light = light;
    if (!this.ctx) return;
    this._swapReverb();
    for (const [part, g] of this._graphs) this._smooth(g.sends.chorus.gain, this._sendLevel('chorus', part.sends.chorus));
    if (this._drumBus) this._smooth(this._drumBus.sends.chorus.gain, this._sendLevel('chorus', this.drumSends.chorus));
  }

  // ── Effects ──────────────────────────────────────────────────────────────────

  setFx(fx, changes) {
    Object.assign(this.fx[fx], changes);
    if (!this.ctx) return;
    if ('level' in changes) this._smooth({ reverb: this._reverbOut, delay: this._delayOut, chorus: this._chorusOut }[fx].gain, changes.level);
    if (fx === 'reverb' && ('type' in changes || 'decay' in changes)) this._swapReverb();
    if (fx === 'delay' && 'time' in changes) this._setDelayTime();
    if (fx === 'delay' && 'feedback' in changes && this._delayLine) this._smooth(this._delayLine.feedback.gain, changes.feedback);
    if (fx === 'chorus') {
      if ('rate' in changes) this._smooth(this._chorusLfo.frequency, changes.rate);
      if ('depth' in changes) for (const d of this._chorusDepths) this._smooth(d.gain, this._chorusDepth());
    }
  }

  /** Reverb impulse for the current type and decay. Plate/spring: bright and dense at once,
   *  with flutter echoes. Hall: a pre-delay, a slower build-up, darker as it decays. */
  _makeImpulse() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const { type } = this.fx.reverb;
    const decay = Math.max(0.1, this.light ? Math.min(1.2, this.fx.reverb.decay) : this.fx.reverb.decay);
    const channels = this.light ? 1 : 2;
    const len = Math.round(sr * decay);
    const impulse = ctx.createBuffer(channels, len, sr);
    for (let c = 0; c < channels; c++) {
      const d = impulse.getChannelData(c);
      if (type === 'plate') {
        const flutter = Math.round(sr * (0.029 + c * 0.004));  // spring-like repeats
        for (let i = 0; i < len; i++) {
          const env = Math.pow(1 - i / len, 2.5);
          d[i] = (Math.random() * 2 - 1) * env;
          if (i >= flutter) d[i] += d[i - flutter] * 0.35;
        }
      } else {
        const pre = Math.round(sr * 0.025);
        const build = sr * 0.08;
        let lp = 0;
        for (let i = 0; i < len; i++) {
          if (i < pre) { d[i] = 0; continue; }
          const t = i - pre;
          const env = Math.min(1, t / build) * Math.pow(1 - i / len, 3);
          const k = 0.6 + 0.38 * (i / len);  // more smoothing later: the tail darkens
          lp = k * lp + (1 - k) * (Math.random() * 2 - 1);
          d[i] = lp * env * 2.2;
        }
      }
    }
    return impulse;
  }

  _swapReverb() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse();
    input.gain.setValueAtTime(this._reverb ? 0 : 1, now);
    input.gain.linearRampToValueAtTime(1, now + FX_INPUT_FADE);
    this._reverbIn.connect(input).connect(conv).connect(this._reverbOut);
    const old = this._reverb;
    if (old) {
      old.input.gain.cancelScheduledValues(now);
      old.input.gain.setValueAtTime(old.input.gain.value, now);
      old.input.gain.linearRampToValueAtTime(0, now + FX_INPUT_FADE);
      setTimeout(() => { this._reverbIn.disconnect(old.input); old.conv.disconnect(); }, (FX_INPUT_FADE + old.decay + 0.2) * 1000);
    }
    this._reverb = { input, conv, decay: conv.buffer.duration };
  }

  _setDelayTime() {
    if (this._delayTimer) return;
    this._swapDelay();
    this._delayTimer = setTimeout(() => {
      this._delayTimer = null;
      if (this._delayLine.time !== this.fx.delay.time) this._setDelayTime();
    }, DELAY_UPDATE_MS);
  }

  /** A new delay line for the current time; the old one rings out at its own spacing */
  _swapDelay() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { time, feedback: fb } = this.fx.delay;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    const feedback = ctx.createGain();
    const output = ctx.createGain();
    delay.delayTime.value = time;
    feedback.gain.value = fb;
    input.gain.setValueAtTime(this._delayLine ? 0 : 1, now);
    input.gain.linearRampToValueAtTime(1, now + FX_INPUT_FADE);
    this._delayIn.connect(input).connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(output).connect(this._delayOut);
    const old = this._delayLine;
    if (old) {
      old.input.gain.cancelScheduledValues(now);
      old.input.gain.setValueAtTime(old.input.gain.value, now);
      old.input.gain.linearRampToValueAtTime(0, now + FX_INPUT_FADE);
      const repeats = fb > 0.001 ? 1 + Math.log(0.001) / Math.log(fb) : 1;
      const ringOut = Math.min(DELAY_MAX_RING_OUT, FX_INPUT_FADE + repeats * Math.max(old.time, 0.01));
      old.output.gain.setValueAtTime(1, now + ringOut * 0.6);
      old.output.gain.linearRampToValueAtTime(0, now + ringOut);
      setTimeout(() => {
        this._delayIn.disconnect(old.input);
        old.delay.disconnect(); old.feedback.disconnect(); old.output.disconnect();
      }, (ringOut + 0.1) * 1000);
    }
    this._delayLine = { input, delay, feedback, output, time };
  }

  _chorusDepth() { return 0.004 * this.fx.chorus.depth; }

  /** Two short delays, swept by one LFO in opposite directions, one per side */
  _buildChorus() {
    const ctx = this.ctx;
    this._chorusIn = ctx.createGain();
    this._chorusOut = ctx.createGain();
    this._chorusOut.gain.value = this.fx.chorus.level;
    this._chorusOut.connect(this.master);
    const merger = ctx.createChannelMerger(2);
    merger.connect(this._chorusOut);
    this._chorusLfo = ctx.createOscillator();
    this._chorusLfo.frequency.value = this.fx.chorus.rate;
    this._chorusDepths = [];
    [1, -1].forEach((sign, side) => {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = 0.015;
      const depth = ctx.createGain();
      depth.gain.value = this._chorusDepth();
      const flip = ctx.createGain();
      flip.gain.value = sign;
      this._chorusLfo.connect(flip).connect(depth).connect(d.delayTime);
      this._chorusIn.connect(d).connect(merger, 0, side);
      this._chorusDepths.push(depth);
    });
    this._chorusLfo.start();
  }
}
