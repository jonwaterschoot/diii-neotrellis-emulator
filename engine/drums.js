/**
 * drums.js
 * A seven-voice drum kit for the emulator's sound. The sounds are made, not sampled:
 * ported from the Mangler's synth in WAV.builder (src/mangler/synth.ts, same author).
 * Every parameter is a range and a seed picks a value in it, so the dice give a new
 * take of the same drum, and a take can be made again from its seed.
 *
 * Notes reach the kit in one of two ways:
 *   'notes'    – notes on the kit's channel, by General MIDI drum note: the layout most
 *                4×4 pad kits use (36 kick, 38 snare, 42 closed hat, …)
 *   'channels' – each voice has its own channel and plays on any note there
 * Notes the kit takes don't go to the synth.
 */

// ── Seeded randomness (mulberry32, as in the Mangler) ──────────────────────

function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    logUniform: (min, max) => (min <= 0 || max <= min) ? Math.max(min, max)
      : Math.exp(Math.log(min) + next() * (Math.log(max) - Math.log(min))),
  };
}

export const randomSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;

// ── Generators: parameter ranges (min, max, default range, log) ────────────

const p = (key, min, max, range, log = false) => ({ key, min, max, range, log });

const GENERATORS = {
  kick: [
    p('startHz', 60, 400, [120, 220], true),
    p('endHz', 25, 90, [40, 60], true),
    p('sweepMs', 5, 200, [20, 60], true),
    p('decayMs', 80, 2000, [250, 700], true),
    p('click', 0, 1, [0.1, 0.5]),
    p('drive', 0, 1, [0, 0.4]),
  ],
  snare: [
    p('toneHz', 120, 400, [170, 240], true),
    p('toneMix', 0, 1, [0.3, 0.6]),
    p('noiseHz', 1500, 14000, [4000, 9000], true),
    p('snap', 0, 1, [0.3, 0.7]),
    p('decayMs', 50, 800, [120, 280], true),
  ],
  hat: [
    p('brightHz', 3000, 14000, [6000, 9000], true),
    p('metal', 0, 1, [0.4, 0.8]),
    p('decayMs', 15, 1500, [30, 120], true),
  ],
  clap: [
    p('bursts', 1, 6, [3, 4]),
    p('spreadMs', 3, 30, [7, 14]),
    p('tailMs', 40, 800, [120, 300], true),
    p('colorHz', 500, 4000, [900, 1600], true),
  ],
  perc: [
    p('pitchHz', 50, 1200, [100, 400], true),
    p('material', 0, 1, [0.2, 0.8]),
    p('decayMs', 30, 3000, [150, 600], true),
    p('strike', 0, 1, [0.2, 0.6]),
  ],
};

/** One value per parameter, in order, so a seed always gives the same take */
function pickValues(kind, ranges, seed) {
  const rng = createRng(seed);
  const out = {};
  for (const q of GENERATORS[kind]) {
    const [lo, hi] = ranges[q.key] ?? q.range;
    const a = Math.max(q.min, Math.min(lo, hi)), b = Math.min(q.max, Math.max(lo, hi));
    out[q.key] = q.log && a > 0 ? rng.logUniform(a, b) : rng.uniform(a, b);
  }
  return out;
}

// ── Building blocks ─────────────────────────────────────────────────────────

const MAX_SECONDS = 4;

/** −60 dB after `ms`: the gain at sample i */
const decayGain = (i, ms, sr) => Math.pow(10, (-3 * i) / Math.max(1, (ms / 1000) * sr));

const lengthFor = (ms, sr) => Math.round(Math.min(MAX_SECONDS * 1000, Math.max(20, ms)) / 1000 * sr);

/** RBJ biquad, in place */
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, hz, q, sr) {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Peak to −1 dBFS, and a 2 ms fade at the end so a cut tail doesn't click */
function finish(x, sr) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const gain = peak > 0 ? 0.891 / peak : 0;
  const fade = Math.min(x.length, Math.round(0.002 * sr));
  for (let i = 0; i < x.length; i++) {
    const tail = x.length - i <= fade ? (x.length - i) / fade : 1;
    x[i] *= gain * tail;
  }
  return x;
}

// ── Generators ──────────────────────────────────────────────────────────────

function kick(v, sr, seed) {
  const n = lengthFor(v.decayMs * 1.05 + 10, sr);
  const x = new Float32Array(n);
  const rng = createRng(seed ^ 0x5eed);
  const tau = v.sweepMs / 1000 / 3;
  const drive = 1 + v.drive * 8;
  const norm = Math.tanh(drive);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const hz = v.endHz + (v.startHz - v.endHz) * Math.exp(-t / tau);
    phase += (2 * Math.PI * hz) / sr;
    let y = Math.sin(phase) * decayGain(i, v.decayMs, sr);
    y += v.click * (rng.next() * 2 - 1) * Math.exp(-t / 0.0015);
    x[i] = Math.tanh(y * drive) / norm;
  }
  return finish(x, sr);
}

function snare(v, sr, seed) {
  const n = lengthFor(v.decayMs * 1.1 + 10, sr);
  const x = new Float32Array(n);
  const rng = createRng(seed ^ 0x54a2);
  const lp = new Biquad().set('lp', v.noiseHz, 0.7, sr);
  const hp = new Biquad().set('hp', 900, 0.7, sr);
  const snapHp = new Biquad().set('hp', 3000, 0.7, sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * v.toneHz * (1 + 0.4 * Math.exp(-t / 0.012))) / sr;
    const tone = Math.sin(phase) * decayGain(i, v.decayMs * 0.6, sr);
    const w = rng.next() * 2 - 1;
    const noise = lp.run(hp.run(w)) * decayGain(i, v.decayMs, sr);
    const snap = snapHp.run(w) * Math.exp(-t / 0.006) * v.snap;
    x[i] = v.toneMix * tone + (1 - v.toneMix) * noise * 1.6 + snap;
  }
  return finish(x, sr);
}

/** The 808's six square waves, tuned in its odd ratios */
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

function hat(v, sr, seed) {
  const n = lengthFor(v.decayMs * 1.1 + 5, sr);
  const x = new Float32Array(n);
  const rng = createRng(seed ^ 0x4a7);
  const bp = new Biquad().set('bp', 10000, 0.9, sr);
  const hp = new Biquad().set('hp', v.brightHz, 0.7, sr);
  const phases = METAL.map(() => rng.next());
  for (let i = 0; i < n; i++) {
    let sq = 0;
    for (let k = 0; k < METAL.length; k++) {
      phases[k] = (phases[k] + METAL[k] / sr) % 1;
      sq += phases[k] < 0.5 ? 1 : -1;
    }
    const src = v.metal * (sq / METAL.length) + (1 - v.metal) * (rng.next() * 2 - 1);
    x[i] = hp.run(bp.run(src)) * decayGain(i, v.decayMs, sr);
  }
  return finish(x, sr);
}

function clap(v, sr, seed) {
  const bursts = Math.max(1, Math.round(v.bursts));
  const lastAt = (bursts - 1) * v.spreadMs;
  const n = lengthFor(lastAt + v.tailMs * 1.1 + 10, sr);
  const x = new Float32Array(n);
  const rng = createRng(seed ^ 0xc1a9);
  const bp = new Biquad().set('bp', v.colorHz, 1.4, sr);
  // Each hand a little off the grid, so it sounds like people
  const starts = Array.from({ length: bursts }, (_, k) => (k * v.spreadMs + (k ? (rng.next() - 0.5) * v.spreadMs * 0.4 : 0)) / 1000);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 0;
    for (const s of starts) if (t >= s) env = Math.max(env, Math.exp(-(t - s) / 0.006));
    if (t >= lastAt / 1000) env = Math.max(env, 0.35 * decayGain(i - Math.round((lastAt / 1000) * sr), v.tailMs, sr));
    x[i] = bp.run(rng.next() * 2 - 1) * env;
  }
  return finish(x, sr);
}

const HARMONIC = [1, 2, 3, 4, 5];
const MEMBRANE = [1, 1.593, 2.136, 2.296, 2.653];

function perc(v, sr, seed) {
  const n = lengthFor(v.decayMs * 1.05 + 10, sr);
  const x = new Float32Array(n);
  const rng = createRng(seed ^ 0x9e2c);
  const hp = new Biquad().set('hp', Math.min(8000, v.pitchHz * 4), 0.7, sr);
  const ratios = HARMONIC.map((h, k) => h + (MEMBRANE[k] - h) * v.material);
  const phases = ratios.map(() => 0);
  for (let i = 0; i < n; i++) {
    let y = 0;
    for (let k = 0; k < ratios.length; k++) {
      const hz = v.pitchHz * ratios[k];
      if (hz > sr * 0.45) continue;
      phases[k] += (2 * Math.PI * hz) / sr;
      y += (Math.sin(phases[k]) / (k + 1)) * decayGain(i, v.decayMs / (1 + k * 0.6), sr);
    }
    y += v.strike * hp.run(rng.next() * 2 - 1) * Math.exp(-(i / sr) / 0.004);
    x[i] = y;
  }
  return finish(x, sr);
}

const RENDER = { kick, snare, hat, clap, perc };

/** One take of a voice: mono samples at `sampleRate` */
export function renderVoice(voice, sampleRate) {
  return RENDER[voice.kind](pickValues(voice.kind, voice.ranges, voice.seed), sampleRate, voice.seed);
}

// ── The kit ─────────────────────────────────────────────────────────────────

/**
 * The seven voices, as on TouchPlaited and the Mangler, with the General MIDI drum
 * notes each one answers to. Together they cover 36–51, the usual 4×4 pad layout.
 * Toms follow the note's pitch.
 */
export const DEFAULT_VOICES = [
  { name: 'Kick', kind: 'kick', ranges: {}, notes: [35, 36] },
  { name: 'Snare', kind: 'snare', ranges: {}, notes: [38, 40] },
  { name: 'Closed hat', kind: 'hat', ranges: { decayMs: [30, 80] }, notes: [42, 44] },
  { name: 'Open hat', kind: 'hat', ranges: { decayMs: [250, 550] }, notes: [46, 49, 51, 52, 55, 57, 59] },
  { name: 'Clap', kind: 'clap', ranges: {}, notes: [39] },
  { name: 'Tom', kind: 'perc', ranges: { pitchHz: [80, 170], material: [0.6, 0.9], decayMs: [220, 450], strike: [0.2, 0.4] }, notes: [41, 43, 45, 47, 48, 50], pitched: 45 },
  { name: 'Perc', kind: 'perc', ranges: { pitchHz: [450, 1100], decayMs: [60, 200], strike: [0.3, 0.6] }, notes: [37, 54, 56, 58, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 75, 76, 77] },
];

const CLOSED_HAT = 2, OPEN_HAT = 3;

export class DrumKit {
  constructor() {
    this.enabled = true;
    this.mode = 'notes';   // 'notes' | 'channels'
    this.channel = 10;     // 'notes' mode: the kit's channel, 0 = any
    this.level = 0.8;
    this.voices = DEFAULT_VOICES.map((v, i) => ({
      ...v, ranges: { ...v.ranges }, notes: [...v.notes],
      seed: 0x1000 + i * 0x9e37,  // a fixed first take, so the kit sounds the same on every load
      level: 0.8,
      channel: 10 + i,            // 'channels' mode: voices on channels 10–16
    }));
    this._buffers = [];
    this._open = null;      // the open hat's playing source, for the choke
    this._ctx = null;
    this._out = null;
    this.onTrigger = null;  // (voiceIndex, velocity) — for the UI
  }

  /** Connect to the audio graph. Takes are rendered when first needed. */
  connect(ctx, destination) {
    this._ctx = ctx;
    this._out = ctx.createGain();
    this._out.gain.value = this.level;
    this._out.connect(destination);
    this._buffers = [];
  }

  setLevel(level) {
    this.level = level;
    if (this._out) this._out.gain.setTargetAtTime(level, this._ctx.currentTime, 0.02);
  }

  /** The voice a note goes to, or -1 when the kit doesn't take it */
  voiceFor(note, ch) {
    if (!this.enabled) return -1;
    if (this.mode === 'channels') return this.voices.findIndex(v => v.channel === ch);
    if (this.channel && ch !== this.channel) return -1;
    return this.voices.findIndex(v => v.notes.includes(note));
  }

  /** Play the note if the kit takes it; returns false when it doesn't (the synth plays it) */
  noteOn(note, vel, ch) {
    const i = this.voiceFor(note, ch);
    if (i < 0) return false;
    this.play(i, vel, note);
    return true;
  }

  /** A note off for the kit: drums ring out, so there's nothing to stop */
  takes(note, ch) {
    return this.voiceFor(note, ch) >= 0;
  }

  play(i, vel = 100, note = null) {
    if (!this._ctx) return;
    const v = this.voices[i];
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffer(i);
    if (v.pitched && note !== null && this.mode === 'notes') src.playbackRate.value = Math.pow(2, (note - v.pitched) / 24);
    const g = this._ctx.createGain();
    g.gain.value = v.level * Math.pow(vel / 127, 1.5);
    src.connect(g).connect(this._out);
    if (i === CLOSED_HAT && this._open) this._choke(this._open);
    if (i === OPEN_HAT) {
      if (this._open) this._choke(this._open);
      this._open = { src, g };
      src.onended = () => { if (this._open && this._open.src === src) this._open = null; };
    }
    src.start();
    if (this.onTrigger) this.onTrigger(i, vel);
  }

  /** Cut a ringing open hat (the other drums are short) */
  stopAll() {
    if (this._open && this._ctx) this._choke(this._open);
  }

  /** The closed hat cuts off the open one, as on a real kit */
  _choke({ src, g }) {
    const now = this._ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.01);
    try { src.stop(now + 0.02); } catch (e) { /* already stopped */ }
    this._open = null;
  }

  _buffer(i) {
    if (!this._buffers[i]) {
      const data = renderVoice(this.voices[i], this._ctx.sampleRate);
      const buf = this._ctx.createBuffer(1, data.length, this._ctx.sampleRate);
      buf.getChannelData(0).set(data);
      this._buffers[i] = buf;
    }
    return this._buffers[i];
  }

  /** A new take of a voice: same drum, other values in its ranges */
  reroll(i) {
    this.voices[i].seed = randomSeed();
    this._buffers[i] = null;
  }

  rerollAll() {
    this.voices.forEach((_, i) => this.reroll(i));
  }

  /** Settings to keep (seeds, levels, routing); the sounds are made again from them */
  toJSON() {
    return {
      enabled: this.enabled, mode: this.mode, channel: this.channel, level: this.level,
      voices: this.voices.map(v => ({ seed: v.seed, level: v.level, channel: v.channel })),
    };
  }

  load(saved) {
    if (!saved) return;
    for (const k of ['enabled', 'mode', 'channel', 'level']) if (saved[k] !== undefined) this[k] = saved[k];
    (saved.voices || []).forEach((s, i) => {
      if (!this.voices[i]) return;
      for (const k of ['seed', 'level', 'channel']) if (s[k] !== undefined) this.voices[i][k] = s[k];
    });
    this._buffers = [];
    if (this._out) this._out.gain.value = this.level;
  }
}
