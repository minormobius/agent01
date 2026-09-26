// env.js — the world that turns with the figure: the song written on the wall as a spectrogram, and
// the stairs becoming light. World-space data, worked out once at load; render.js lights it by t.
//
// The wall is a score of what was heard. The flight is laid out in time already (one tread a bar),
// so the wall behind tread j carries bar j+3's sound (written five treads ahead of the figure): a column every eighth of a bar, and in each
// column a glint at every partial that was sounding, at a height by log frequency (80 Hz half a metre
// over the tread, 8 kHz at 3.1 m). The voice's harmonics are shaped by its vowel's resonances (chipvoice's formants),
// the piano's by 1/k. A glint lights when its moment is played and stays, so the wall fills in as the
// song goes: the architecture records it.

import { PHONES } from '../lib/chipvoice.js';
import { events, sec, B } from './score.js';
import { NOTES, RUN, RISE, STEPS, WIDTH, FIRST_BAR } from './figure.js';

const hash = (a, b = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const LO = Math.log(80), HI = Math.log(8000), LEAD = 5;
export const WALL_Z = -WIDTH / 2 + 0.002;

/** Where a moment of the song sits along the flight, and how high a frequency sits on the wall. */
export function wallAt(t) {
  // the bar (fractional) at t, by the score's own clock
  let lo = 0, hi = 140;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (sec(B(1) + mid * 3) <= t) lo = mid; else hi = mid; }
  // written a few treads AHEAD of where the figure is when it is sung: the right of the frame, where the
  // figure is walking to (behind it the wall is under its own trail of light)
  const bar = 1 + lo, j = bar - FIRST_BAR + LEAD;               // the tread (the intro's first bars go on the landing)
  const x = j < 0 ? (j / (FIRST_BAR - 1)) * 2.4 + 0.02 : j * RUN + 0.02;
  const base = j < 0 ? 0 : -Math.min(STEPS, Math.floor(j)) * RISE;
  return { x, base };
}
const height = (f) => 0.5 + (2.6 * (Math.log(f) - LO)) / (HI - LO);

// the vowel's resonances, as a gain on each harmonic
function vowelGain(vowel, f) {
  const P = PHONES[vowel], F = P?.F || [500, 1500, 2500];
  let g = 0;
  [[F[0] * 1.09, 90, 1], [F[1] * 1.09, 120, 0.7], [F[2] * 1.09, 170, 0.45]].forEach(([c, bw, a]) => { g += a / (1 + ((f - c) / bw) ** 2); });
  return g * (f < 300 ? 1 : 1 / Math.sqrt(f / 300));
}

/** Every glint: [x, y, z, t (when it lights), brightness, warmth (0 piano … 1 voice)], flattened. */
export const GLINTS = (() => {
  const out = [];
  const COL = 1 / 8;                                            // a column every eighth of a bar
  const push = (t, f, b, warm) => {
    if (f < 80 || f > 8000 || b < 0.04) return;
    const { x, base } = wallAt(t);
    const k = out.length / 6;
    out.push(x + (hash(k, 1) - 0.5) * 0.01, base + height(f) + (hash(k, 2) - 0.5) * 0.008, WALL_Z, t, b, warm);
  };
  // the voice: a column of harmonics while each vowel sounds
  for (const n of NOTES) {
    let syl = n.syl;
    for (let i = NOTES.indexOf(n); !syl && i >= 0; i--) syl = NOTES[i].syl;
    const f0 = hz(n.midi), bar = sec(B(2)) - sec(B(1)), step = (bar / 3) * 3 * COL;
    for (let t = n.t; t < n.t + n.dur * 0.9; t += step) for (let k = 1; k * f0 < 6000; k++) push(t, k * f0, Math.min(1, 1.4 * vowelGain(syl?.vowel, k * f0)), 1);
  }
  // the piano: each note's first partials, dying away over the note
  for (const e of events) {
    const f0 = hz(e.midi), bar = sec(B(2)) - sec(B(1)), step = bar * COL, len = Math.min(e.dur, bar * 1.2);
    for (let t = e.at; t < e.at + len; t += step) {
      const fade = Math.exp(-(t - e.at) / (bar * 0.5));
      for (let k = 1; k <= 6; k++) push(t, k * f0, e.velocity * 1.6 * fade / k, 0);
    }
  }
  // sorted along the wall, so a visible stretch of it is one range
  const n = out.length / 6, order = Array.from({ length: n }, (_, i) => i).sort((a, b) => out[a * 6] - out[b * 6]);
  const sorted = new Float32Array(out.length);
  order.forEach((o, i) => { for (let c = 0; c < 6; c++) sorted[i * 6 + c] = out[o * 6 + c]; });
  return sorted;
})();
export const GLINT_COUNT = GLINTS.length / 6;
/** The first glint at or past x along the wall. */
export function glintFrom(x) {
  let lo = 0, hi = GLINT_COUNT;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (GLINTS[mid * 6] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/** A tread's light: points on its edges and scattered over it, in the tread's own coordinates (x 0..1 along, z 0..1 across, y 0 top, −1 the riser's foot). */
export const STAIR = (() => {
  const out = [];
  for (let i = 0; i < 64; i++) out.push([1, 0, i / 63], [0, 0, i / 63]);          // the nose and the back
  for (let i = 0; i < 20; i++) out.push([i / 19, 0, 1], [i / 19, 0, 0]);          // the sides
  for (let i = 0; i < 24; i++) out.push([1, -i / 23, 1]);                          // the near corner, down the riser
  for (let i = 0; i < 90; i++) out.push([hash(i, 11), 0, hash(i, 12)]);           // the tread's face
  for (let i = 0; i < 50; i++) out.push([1, -hash(i, 13), hash(i, 14)]);          // the riser's face
  return out;
})();

/**
 * Each tread as a circuit board: traces routed the way a board router does, in runs of 0°, 45° and 90°
 * on a 1/24 grid, between pads, with vias where a trace changes layer; and gold fingers down the riser
 * (an edge connector at the nose). Local coordinates as STAIR's. Hashed by tread, so every tread differs
 * and every frame agrees. { traces: [[x, z]…][], pads: [x, z][], vias: [x, z][], fingers: z[] }
 */
export function circuit(j) {
  const H = (a, b) => hash(j * 131 + a, b), G = 24, snap = (v) => Math.round(v * G) / G;
  const traces = [], pads = [], vias = [];
  const n = 7 + Math.floor(H(1, 1) * 6);
  for (let k = 0; k < n; k++) {
    // from the nose (an edge finger) or a pad on the face, wandering back across the tread
    let x = k % 3 === 0 ? 1 : snap(0.2 + 0.7 * H(k, 2)), z = snap(0.06 + 0.88 * H(k, 3));
    const path = [[x, z]];
    pads.push([x, z]);
    const legs = 2 + Math.floor(H(k, 4) * 4);
    for (let l = 0; l < legs; l++) {
      const dir = Math.floor(H(k * 7 + l, 5) * 4), len = snap(0.08 + 0.3 * H(k * 7 + l, 6));
      if (dir === 0) x -= len;                                   // back along the tread
      else if (dir === 1) { x -= len * 0.7; z += (H(k, 8) < 0.5 ? -1 : 1) * len * 0.7; }   // 45°
      else if (dir === 2) z += (H(k * 7 + l, 9) < 0.5 ? -1 : 1) * len;   // across
      else x -= len * 0.5;
      x = Math.max(0.03, Math.min(1, snap(x))); z = Math.max(0.04, Math.min(0.96, snap(z)));
      path.push([x, z]);
      if (H(k * 7 + l, 10) < 0.25) vias.push([x, z]);
    }
    pads.push(path[path.length - 1]);
    traces.push(path);
  }
  const fingers = Array.from({ length: 11 }, (_, i) => 0.1 + (0.8 * i) / 10);
  return { traces, pads, vias, fingers };
}
