/**
 * synth.js
 * The synth's models: the oscillators (and filter) of one voice. The amplitude envelope
 * (ADSR), effects and the main filter come after it, in grid-api.js.
 *
 * Two settings work on every model:
 *   drift    – 0–1: each oscillator starts a little out of tune and wanders slowly, as on
 *              an analogue synth
 *   movement – 0–1: the voice's filter sweeps slowly up and down, at a rate of its own
 *
 * The string models are Karplus–Strong: a noise burst circulates in a delay line one period
 * long and is damped on every pass. Web Audio can't run that loop (a DelayNode in a feedback
 * loop is held to 128 samples, so nothing above ~375 Hz), so each note is computed into a
 * buffer instead, like the drums.
 */

// `gain` evens out loudness: every model about as loud as the triangle
export const SYNTH_MODELS = {
  triangle: { label: 'Triangle', gain: 1, oscs: [{ type: 'triangle' }] },
  sine:     { label: 'Sine', gain: 0.78, oscs: [{ type: 'sine' }] },
  saw:      { label: 'Soft saw', gain: 0.8, cutoff: 5, q: 0.8, oscs: [{ type: 'sawtooth', detune: -6 }, { type: 'sawtooth', detune: 6 }] },
  square:   { label: 'Hollow square', gain: 0.64, cutoff: 6, q: 0.7, oscs: [{ type: 'square' }] },
  pad:      { label: 'Wide pad', gain: 0.67, cutoff: 3, q: 0.6, oscs: [{ type: 'sawtooth', detune: -14 }, { type: 'sawtooth' }, { type: 'sawtooth', detune: 14 }] },
  pluck:    { label: 'Pluck', gain: 1.05, cutoff: 1.2, q: 2, sweep: { from: 12, time: 0.18 }, oscs: [{ type: 'sawtooth' }] },
  fm:       { label: 'FM bell', gain: 0.77, fm: { ratio: 3.5, index: 3, decay: 1.2 } },
  // Plucks are mostly attack: a higher gain makes them about as loud, peaks stay under 0.9
  string:   { label: 'String (Karplus–Strong)', gain: 2.4, ks: { bright: 0.9, ring: 3 } },
  nylon:    { label: 'Nylon (Karplus–Strong)', gain: 2.4, ks: { bright: 0.3, ring: 1.8 } },
};

/**
 * One plucked note, Karplus–Strong. `bright` (0–1) low-passes the noise burst: a soft or
 * hard pluck, also harder with velocity. `ring` is how long it rings at 110 Hz, to −60 dB;
 * higher notes ring shorter, as on a real string.
 */
export function stringNote(sampleRate, freq, { bright, ring }, vel = 100) {
  const sr = sampleRate;
  const period = sr / freq;
  const n = Math.max(2, Math.floor(period - 0.5));  // the averaging adds half a sample
  const frac = period - n - 0.5;                     // the rest comes from an allpass
  const c = (1 - frac) / (1 + frac);
  const t60 = Math.max(0.3, Math.min(4, ring * Math.pow(110 / freq, 0.35)));
  const loss = Math.pow(0.001, 1 / (freq * t60));     // per pass, to reach −60 dB at t60
  const len = Math.round(sr * t60);
  const out = new Float32Array(len);
  const line = new Float32Array(n);
  // The pluck: noise, low-passed less for a brighter or harder pluck
  const b = Math.min(1, bright * (0.4 + 0.6 * vel / 127));
  let lp = 0, mean = 0;
  for (let i = 0; i < n; i++) { lp += b * (Math.random() * 2 - 1 - lp); line[i] = lp; mean += lp / n; }
  for (let i = 0; i < n; i++) line[i] -= mean;  // no offset, so it doesn't thump
  let idx = 0, prev = 0, apIn = 0, apOut = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    out[i] = cur;
    peak = Math.max(peak, Math.abs(cur));
    const avg = loss * 0.5 * (cur + prev);      // the string's damping
    prev = cur;
    const y = c * avg + apIn - c * apOut;       // allpass: the fraction of a sample
    apIn = avg; apOut = y;
    line[idx] = y;
    idx = idx + 1 === n ? 0 : idx + 1;
  }
  const gain = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.min(len, Math.round(0.005 * sr));
  for (let i = 0; i < len; i++) out[i] *= gain * (len - i <= fade ? (len - i) / fade : 1);
  return out;
}

/**
 * One voice of `model` at `freq`, starting at `now`. Returns the node to connect to the
 * envelope, and the sources to stop when the note ends.
 */
export function buildVoice(ctx, model, freq, now, { drift = 0, movement = 0, vel = 100 } = {}) {
  const m = SYNTH_MODELS[model] || SYNTH_MODELS.triangle;
  const sources = [];
  const output = ctx.createGain();
  output.gain.value = m.gain;

  // Slow wander of a pitch (in cents), for drift
  const wander = (detune) => {
    if (drift <= 0) return;
    detune.value += (Math.random() * 2 - 1) * 8 * drift;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08 + Math.random() * 0.35;
    const depth = ctx.createGain();
    depth.gain.value = 14 * drift;
    lfo.connect(depth).connect(detune);
    lfo.start(now);
    sources.push(lfo);
  };

  // The voice's filter: the model's tone, and what movement sweeps
  let dest = output;
  const cutoff = m.cutoff ? freq * m.cutoff : (movement > 0 ? freq * 8 : 0);
  if (cutoff) {
    const base = Math.min(18000, cutoff);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = m.q ?? 0.7;
    if (m.sweep) {
      filter.frequency.setValueAtTime(Math.min(18000, freq * m.sweep.from), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, base), now + m.sweep.time);
    } else {
      filter.frequency.value = base;
    }
    if (movement > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.15 + Math.random() * 0.5;
      const depth = ctx.createGain();
      depth.gain.value = base * 0.6 * movement;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start(now);
      sources.push(lfo);
    }
    filter.connect(output);
    dest = filter;
  }

  if (m.ks) {
    const data = stringNote(ctx.sampleRate, freq, m.ks, vel);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    wander(src.detune);
    src.connect(dest);
    src.start(now);
    sources.push(src);
  } else if (m.fm) {
    // A sine whose pitch is modulated by another sine, the modulation fading over `decay`
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const index = ctx.createGain();
    carrier.frequency.value = freq;
    mod.frequency.value = freq * m.fm.ratio;
    index.gain.setValueAtTime(freq * m.fm.index, now);
    index.gain.exponentialRampToValueAtTime(freq * m.fm.index * 0.1, now + m.fm.decay);
    mod.connect(index).connect(carrier.frequency);
    carrier.connect(dest);
    wander(carrier.detune);
    carrier.start(now);
    mod.start(now);
    sources.push(carrier, mod);
  } else {
    for (const o of m.oscs) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = freq;
      osc.detune.value = o.detune || 0;
      wander(osc.detune);
      osc.connect(dest);
      osc.start(now);
      sources.push(osc);
    }
  }
  return { output, sources };
}
