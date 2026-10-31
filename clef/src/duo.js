// duo.js — a score for piano AND guitar, each staff on its own physical model.
//
// The two physical voices are one instrument each: pfsynth.js's piano and pfguitar.js's guitar.
// A score that names both (guitar staves are marked by guitar.js; their notes carry `gtr`)
// is rendered as a duo: the piano model plays every other staff, the guitar model the guitar
// staves, and the two are balanced, placed a little apart, and mixed. Either physical voice in
// the picker plays a duo this way: choosing "the piano" for a piano-and-guitar score should not
// turn the guitar into a piano.
import * as pfsynth from './pfsynth.js';
import * as pfguitar from './pfguitar.js';

/** True when a performance has both guitar notes and others. */
export const isDuo = (perf) => perf.events.some((e) => e.gtr) && perf.events.some((e) => !e.gtr);

/**
 * Mix two interleaved stereo renders. The guitar is brought to the piano's loudness (RMS over
 * the samples where each is actually sounding, so a long rest does not count as quiet), the
 * piano sits a little left and the guitar a little right (as a duo does on a stage), and the sum
 * is peak-normalised to −1 dBFS. Pure: the selftest checks it in node.
 */
export function mixDuo(piano, guitar, { balance = 0.95, spread = 0.86 } = {}) {
  const rms = (x) => { let e = 0, n = 0; for (const v of x) if (Math.abs(v) > 1e-4) { e += v * v; n++; } return n ? Math.sqrt(e / n) : 0; };
  const rp = rms(piano), rg = rms(guitar), g = rg > 0 && rp > 0 ? (balance * rp) / rg : 1;
  const frames = Math.max(piano.length, guitar.length) / 2, out = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const pl = piano[i * 2] ?? 0, pr = piano[i * 2 + 1] ?? 0, gl = (guitar[i * 2] ?? 0) * g, gr = (guitar[i * 2 + 1] ?? 0) * g;
    out[i * 2] = pl + gl * spread;
    out[i * 2 + 1] = pr * spread + gr;
  }
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) { const k = 0.89 / peak; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

/** Render a duo: the piano's staves and the guitar's at once, then the mix. Same shape as the others. */
export async function renderDuo(perf, { sampleRate = 44100, onProgress, signal } = {}) {
  const piano = { ...perf, events: perf.events.filter((e) => !e.gtr) };
  const guitar = { ...perf, events: perf.events.filter((e) => e.gtr) };
  // In parallel: each model renders in its own worker, so the wait is the slower of the two,
  // not their sum (a phone has the cores). The bar shows the one that is further behind.
  let vp = 0, vg = 0;
  const tell = () => onProgress?.(Math.min(vp, vg) * 0.98);
  const [p, g] = await Promise.all([
    pfsynth.render(piano, { sampleRate, signal, onProgress: (v) => { vp = v; tell(); } }),
    pfguitar.render(guitar, { sampleRate, signal, onProgress: (v) => { vg = v; tell(); } }),
  ]);
  const interleaved = mixDuo(p.interleaved, g.interleaved);
  onProgress?.(1);
  return { interleaved, sampleRate, frames: interleaved.length / 2 };
}

/** A physical voice's render function, duo-aware: `solo` when the score has one instrument. */
export const duoAware = (solo) => (perf, opts) => (isDuo(perf) ? renderDuo(perf, opts) : solo(perf, opts));
