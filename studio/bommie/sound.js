// sound.js — The Bommie's soundtrack, synthesised in plain JS (node, a worker, the page alike).
//
// A reef is loud: its bed is the crackle of snapping shrimp, thousands of clicks a second, and
// that is this show's studio audience: when a gag lands, the crackle swells (LAUGHS). Over it:
// the residents' voices, gibberish with each creature's own source and formants, timed from
// the same syllables that open their mouths (script.js sayings); the foley (a parrotfish
// crunching coral, a tin can rolling, a conch that won't lift); and a sitcom theme, a marimba
// and a plucked bass, for the titles and the credits.
//
// Deterministic: every random number is a hash of what it is for, so a render is the same
// render every time, and the selftest can measure it.

import { CAST, LAUGHS, FOLEY, DURATION, sayings } from './script.js';

const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- filters --------------------------------------------------------------------------
/** An RBJ biquad, run over a mono buffer in place. */
function biquad(buf, type, f, q, rate, from = 0, to = buf.length) {
  const w = (TAU * f) / rate, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }                  // band-pass, peak gain 1
  a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from; i < to; i++) {
    const x = buf[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y;
  }
  return buf;
}

// ---- voices -----------------------------------------------------------------------------
// vowel formants (F1, F2), for a person; a creature's are scaled by its size (FORMANT)
const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1720]];
const FORMANT = { gus: 0.8, nell: 1.5, dot: 1.25, dash: 1.35, pip: 0.9, barry: 0.62 };

/** One syllable into a mono scratch buffer at offset `o` (samples). */
function syllable(out, o, rate, who, s, seed) {
  const v = CAST[who].voice, n = Math.floor((s.dur + 0.06) * rate);
  const src = new Float32Array(n);
  const f0 = v.pitch * s.pitch;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, tt = i / rate;
    let f = f0;
    // each creature's shape of a syllable
    if (v.timbre === 'chirp') f *= 1 + 0.35 * u;                        // bright, upward
    if (v.timbre === 'bubble') f *= 1.15 - 0.3 * u;                     // a blub, falling
    if (v.timbre === 'mumble') f *= 1 - 0.1 * u;
    if (v.timbre === 'gravel') f *= 1 + 0.08 * (hash(seed + Math.floor(tt * 40)) - 0.5);   // fry: a rough pitch
    f *= 1 + 0.02 * Math.sin(TAU * 5.5 * tt);                           // vibrato
    ph += f / rate;
    const saw = 2 * (ph - Math.floor(ph)) - 1;
    let x;
    if (v.timbre === 'breath') x = (hash(seed * 7 + i) - 0.5) * 1.4 + 0.25 * Math.sin(TAU * ph);
    else if (v.timbre === 'chirp' || v.timbre === 'bubble') x = Math.sin(TAU * ph) * 0.8 + saw * 0.25;
    else x = saw;
    if (v.timbre === 'bubble') x *= 0.6 + 0.4 * Math.sin(TAU * 17 * tt);                 // gurgle
    if (v.timbre === 'gravel' && (Math.floor(tt * 90) % 3 === 0)) x *= 0.4;             // clicky rasp
    const att = Math.min(1, tt / 0.012), rel = Math.min(1, (s.dur + 0.04 - tt) / 0.05);
    src[i] = x * Math.max(0, Math.min(att, rel));
  }
  // two formants for a vowel, chosen per syllable, scaled to the creature
  const [F1, F2] = VOWELS[Math.floor(hash(seed) * VOWELS.length)].map((x) => x * FORMANT[who]);
  const a = biquad(src.slice(), 'bp', F1, 3.5, rate), b = biquad(src.slice(), 'bp', Math.min(F2, rate * 0.45), 5, rate);
  const gain = { gus: 1.3, nell: 1.1, dot: 1.1, dash: 1.1, pip: 1.6, barry: 1.4 }[who];
  for (let i = 0; i < n && o + i < out.length; i++) out[o + i] += (a[i] + 0.6 * b[i] + 0.08 * src[i]) * gain * (0.7 + 0.3 * s.open);
}

// ---- foley ------------------------------------------------------------------------------
function foley(out, rate, f, seed) {
  const o = Math.floor(f.at * rate);
  const put = (i, x) => { if (o + i >= 0 && o + i < out.length) out[o + i] += x; };
  const noise = (i) => hash(seed * 13 + i * 0.37) * 2 - 1;
  if (f.fx === 'crunch') {
    // grains of a bite: a dozen bright cracks over 0.2 s, band-passed like teeth on limestone
    const n = Math.floor(0.3 * rate), g = new Float32Array(n);
    for (let k = 0; k < 14; k++) {
      const at = Math.floor(hash(seed + k) * 0.2 * rate), amp = 0.5 + hash(seed * 3 + k);
      for (let i = 0; i < 300 && at + i < n; i++) g[at + i] += noise(k * 1000 + i) * amp * Math.exp(-i / 60);
    }
    biquad(g, 'bp', 2400, 1.2, rate);
    for (let i = 0; i < n; i++) put(i, g[i] * 2.2);
  } else if (f.fx === 'pop') {
    const n = Math.floor(0.12 * rate);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += (900 - 600 * (i / n)) / rate; put(i, Math.sin(TAU * ph) * Math.exp(-i / (0.03 * rate)) * 0.5); }
  } else if (f.fx === 'clonk') {
    // tin: a few inharmonic partials, fast decay
    const n = Math.floor(0.8 * rate);
    for (const [fr, a, d] of [[420, 0.5, 0.25], [1130, 0.3, 0.15], [1870, 0.2, 0.1], [2710, 0.12, 0.06]])
      for (let i = 0; i < n; i++) put(i, Math.sin(TAU * fr * (i / rate)) * a * Math.exp(-i / (d * rate)) * 0.8);
  } else if (f.fx === 'roll') {
    // a can rolling on sand: a hollow rumble with a tick at each turn
    const n = Math.floor(f.dur * rate), g = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / n; g[i] = noise(i) * 0.3 * Math.sin(Math.PI * u); }
    biquad(g, 'bp', 380, 2, rate);
    for (let turn = 0; turn < 5; turn++) {
      const at = Math.floor(((turn + 0.5) / 5) * n * (0.6 + 0.4 * (turn / 5)));
      for (let i = 0; i < 0.15 * rate && at + i < n; i++) g[at + i] += Math.sin(TAU * 520 * (i / rate)) * 0.25 * Math.exp(-i / (0.03 * rate));
    }
    for (let i = 0; i < n; i++) put(i, g[i] * 1.6);
  } else if (f.fx === 'scrape') {
    // legs scrabbling at a shell: dry scratches
    const n = Math.floor(f.dur * rate), g = new Float32Array(n);
    for (let k = 0; k < f.dur * 14; k++) {
      const at = Math.floor(hash(seed + k * 3) * n);
      for (let i = 0; i < 0.03 * rate && at + i < n; i++) g[at + i] += noise(k * 777 + i) * Math.exp(-i / (0.008 * rate)) * (0.4 + hash(k));
    }
    biquad(g, 'hp', 1500, 0.7, rate);
    for (let i = 0; i < n; i++) put(i, g[i] * 0.9);
  } else if (f.fx === 'thud') {
    const n = Math.floor(0.4 * rate);
    for (let i = 0; i < n; i++) put(i, Math.sin(TAU * (70 + 60 * Math.exp(-i / (0.02 * rate))) * (i / rate)) * Math.exp(-i / (0.09 * rate)) * 0.9);
  } else if (f.fx === 'poof') {
    const n = Math.floor(1.6 * rate), g = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / n; g[i] = noise(i) * Math.min(1, u * 12) * Math.exp(-u * 3.5); }
    biquad(g, 'lp', 700, 0.8, rate); biquad(g, 'lp', 700, 0.8, rate);
    for (let i = 0; i < n; i++) put(i, g[i] * 3.2);
  } else if (f.fx === 'shake') {
    const n = Math.floor(0.7 * rate);
    for (let k = 0; k < 16; k++) {
      const at = Math.floor((k / 16) * n);
      for (let i = 0; i < 0.02 * rate; i++) put(at + i, noise(k * 99 + i) * 0.5 * Math.exp(-i / (0.004 * rate)));
    }
  } else if (f.fx === 'bubbles') {
    // bubbles: each a sine that rises as it rings (Minnaert: the smaller, the higher)
    for (let k = 0; k < 7; k++) {
      const at = Math.floor(k * 0.35 * rate + hash(seed + k) * 0.1 * rate), fr = 500 + 900 * hash(seed * 5 + k), n = Math.floor(0.09 * rate);
      let ph = 0;
      for (let i = 0; i < n; i++) { ph += (fr * (1 + 1.5 * (i / n))) / rate; put(at + i, Math.sin(TAU * ph) * 0.18 * Math.exp(-i / (0.025 * rate))); }
    }
  }
}

// ---- the theme ----------------------------------------------------------------------------
// a sitcom bumper: marimba over a plucked bass, F major, 118 bpm. [beat, midi, dur(beats), inst]
const THEME = [
  [0, 65, 0.5, 'm'], [0.5, 69, 0.5, 'm'], [1, 72, 0.5, 'm'], [1.5, 74, 0.5, 'm'], [2, 72, 1, 'm'], [3, 69, 0.5, 'm'], [3.5, 70, 0.5, 'm'],
  [4, 72, 0.5, 'm'], [4.5, 77, 1.5, 'm'], [6, 76, 0.5, 'm'], [6.5, 74, 0.5, 'm'], [7, 72, 1, 'm'],
  [0, 41, 1, 'b'], [1.5, 48, 0.5, 'b'], [2, 46, 1, 'b'], [3.5, 45, 0.5, 'b'], [4, 43, 1, 'b'], [5.5, 48, 0.5, 'b'], [6, 41, 2, 'b'],
];
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function theme(out, rate, at, bars = 1) {
  const spb = 60 / 118;
  for (let rep = 0; rep < bars; rep++) for (const [b, m, d, inst] of THEME) {
    const o = Math.floor((at + (b + rep * 8) * spb) * rate), f = midiHz(m);
    if (inst === 'm') {
      const n = Math.floor(1.2 * rate);
      for (let i = 0; i < n && o + i < out.length; i++) {
        const tt = i / rate;
        // a marimba bar: the fundamental and its 4th and 10th partials, the high ones gone first
        out[o + i] += (Math.sin(TAU * f * tt) * Math.exp(-tt / 0.45) + 0.35 * Math.sin(TAU * f * 3.93 * tt) * Math.exp(-tt / 0.08) + 0.12 * Math.sin(TAU * f * 9.2 * tt) * Math.exp(-tt / 0.03)) * 0.16;
      }
    } else {
      // a plucked bass: Karplus-Strong
      const P = Math.max(2, Math.round(rate / f)), n = Math.floor(d * spb * rate * 1.1), line = new Float32Array(P);
      for (let i = 0; i < P; i++) line[i] = hash(m * 31 + i + rep * 7) * 2 - 1;
      let idx = 0;
      for (let i = 0; i < n && o + i < out.length; i++) {
        const nx = (idx + 1) % P, y = 0.5 * (line[idx] + line[nx]) * 0.996;
        line[idx] = y; idx = nx;
        out[o + i] += y * 0.32 * Math.min(1, (n - i) / (0.02 * rate));
      }
    }
  }
}

// ---- a room: a little reverb, for water ---------------------------------------------------
function reverb(buf, rate, mix = 0.25) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.floor(s * rate)), fb = 0.78;
  const wet = new Float32Array(buf.length);
  for (const D of combs) {
    const line = new Float32Array(D); let j = 0, lp = 0;
    for (let i = 0; i < buf.length; i++) { const y = line[j]; lp = lp * 0.4 + y * 0.6; line[j] = buf[i] + lp * fb; j = (j + 1) % D; wet[i] += y * 0.25; }
  }
  for (const D of [Math.floor(0.005 * rate), Math.floor(0.0017 * rate)]) {
    const line = new Float32Array(D); let j = 0;
    for (let i = 0; i < wet.length; i++) { const x = wet[i], y = line[j]; line[j] = x + y * 0.5; wet[i] = y - x * 0.5; j = (j + 1) % D; }
  }
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] * (1 - mix) + wet[i] * mix * 1.6;
  return buf;
}

/** The shrimp's click rate at t: a dawn and a dusk chorus, and the laughs. Clicks a second. */
export function crackleAt(t) {
  return 90 + 60 * Math.exp(-(((t - 4) / 5) ** 2)) + 80 * Math.exp(-(((t - 94) / 6) ** 2)) + 1600 * laughAt(t);
}
/** How hard the audience is laughing at t, 0..1: a quick swell, a longer fall. */
export function laughAt(t) {
  let l = 0;
  for (const [at, k, dur] of LAUGHS) {
    const u = (t - at) / dur;
    if (u > 0 && u < 1) l = Math.max(l, k * Math.sin(Math.PI * Math.pow(u, 0.6)) ** 2);
  }
  return l;
}

/**
 * The whole episode, stereo: { L, R, rate }. Voices are panned by where each resident stands
 * for the master shot (left of the bommie left).
 */
export function renderEpisode(rate = 32000, { seconds = DURATION } = {}) {
  const N = Math.floor(seconds * rate);
  const L = new Float32Array(N), R = new Float32Array(N);
  // 1. the shrimp: clicks, each a spit of bright noise, a Poisson stream at crackleAt's rate
  {
    let t = 0, k = 0;
    while (t < seconds) {
      const r = crackleAt(t);
      t += -Math.log(1 - hash(k * 1.13 + 0.5) * 0.9999) / r;
      const o = Math.floor(t * rate), amp = (0.02 + 0.12 * Math.pow(hash(k * 3.7 + 1), 6)) * (1 + 4 * laughAt(t)), pan = hash(k * 5.3 + 2);
      for (let i = 0; i < 40 && o + i < N; i++) { const x = (hash(k * 71 + i) * 2 - 1) * amp * Math.exp(-i / 7); L[o + i] += x * (1 - pan); R[o + i] += x * pan; }
      k++;
    }
    // a laugh is thousands of them at once: under the clicks, the fizz they fuse into
    const fz = [new Float32Array(N), new Float32Array(N)];
    for (let i = 0; i < N; i++) { const l = laughAt(i / rate); if (l > 0) { fz[0][i] = (hash(i * 0.731) * 2 - 1) * l * 0.4; fz[1][i] = (hash(i * 0.613 + 9) * 2 - 1) * l * 0.4; } }
    for (const [ch, src] of [[L, fz[0]], [R, fz[1]]]) { biquad(src, 'bp', 4200, 0.8, rate); for (let i = 0; i < N; i++) ch[i] += src[i]; }
    biquad(L, 'hp', 1800, 0.7, rate); biquad(R, 'hp', 1800, 0.7, rate);
  }
  // 2. the water: a slow, low swell
  {
    const w = new Float32Array(N);
    let b = 0;
    for (let i = 0; i < N; i++) { b = b * 0.995 + (hash(i * 0.917) * 2 - 1) * 0.05; w[i] = b * (0.6 + 0.4 * Math.sin(TAU * 0.07 * (i / rate))); }
    biquad(w, 'lp', 160, 0.7, rate);
    for (let i = 0; i < N; i++) { L[i] += w[i] * 0.06; R[i] += w[i] * 0.06; }
  }
  // 3. voices and foley, dry into a mono bus with pans, then the room
  const PAN = { gus: 0.6, nell: 0.35, dot: 0.2, dash: 0.2, pip: 0.15, barry: 0.5 };
  const bus = { L: new Float32Array(N), R: new Float32Array(N) };
  for (const [li, line] of sayings().entries()) {
    if (line.at > seconds) continue;
    const mono = new Float32Array(Math.floor((line.end - line.at + 0.5) * rate));
    line.syl.forEach((s, si) => syllable(mono, Math.floor((s.at - line.at) * rate), rate, line.who, s, li * 100 + si));
    const o = Math.floor(line.at * rate), p = PAN[line.who];
    for (let i = 0; i < mono.length && o + i < N; i++) { bus.L[o + i] += mono[i] * (1 - p) * 1.4; bus.R[o + i] += mono[i] * p * 1.4; }
  }
  {
    const mono = new Float32Array(N);
    FOLEY.forEach((f, i) => { if (f.at < seconds) foley(mono, rate, f, i + 1); });
    for (let i = 0; i < N; i++) { bus.L[i] += mono[i] * 0.55; bus.R[i] += mono[i] * 0.55; }
  }
  reverb(bus.L, rate, 0.22); reverb(bus.R, rate, 0.22);
  // under water, the top end goes first
  biquad(bus.L, 'lp', 5200, 0.7, rate); biquad(bus.R, 'lp', 5200, 0.7, rate);
  for (let i = 0; i < N; i++) { L[i] += bus.L[i]; R[i] += bus.R[i]; }
  // 4. the theme: over the titles, and over the credits (twice through)
  {
    const m = new Float32Array(N);
    theme(m, rate, 0.4, 1);
    theme(m, rate, 88.4, 2);
    for (let i = 0; i < N; i++) { L[i] += m[i] * 0.9; R[i] += m[i] * 0.9; }
  }
  // a soft ceiling
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1) * 0.9; R[i] = Math.tanh(R[i] * 1.1) * 0.9; }
  return { L, R, rate };
}

/** RMS in dB over [t0, t1), both channels. */
export function rmsDb({ L, R, rate }, t0, t1) {
  const a = Math.floor(t0 * rate), b = Math.min(L.length, Math.floor(t1 * rate));
  let s = 0;
  for (let i = a; i < b; i++) s += L[i] * L[i] + R[i] * R[i];
  return 10 * Math.log10(s / Math.max(1, 2 * (b - a)) + 1e-12);
}
