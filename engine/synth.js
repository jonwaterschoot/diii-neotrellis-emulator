/**
 * synth.js
 * The synth's models: the oscillators (and filter) of one voice. The amplitude envelope
 * (ADSR), effects and the main filter come after it, in grid-api.js.
 *
 * Two settings work on every model:
 *   drift    – 0–1: each oscillator starts a little out of tune and wanders slowly, as on
 *              an analogue synth
 *   movement – 0–1: the voice's filter sweeps slowly up and down, at a rate of its own
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
};

/**
 * One voice of `model` at `freq`, starting at `now`. Returns the node to connect to the
 * envelope, and the sources to stop when the note ends.
 */
export function buildVoice(ctx, model, freq, now, { drift = 0, movement = 0 } = {}) {
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

  if (m.fm) {
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
