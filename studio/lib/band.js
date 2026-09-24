// band.js — the rest of the band, and the noises of the city. Pure JS DSP.
//
// The piano is pfsynth (a physical model). Everything else is here: synthesised
// the way clef's patch bank synthesises (partials, filters, envelopes), plus a
// plucked string for the bass and a handful of Parade's noisemakers — Satie put
// a typewriter, a siren and a pistol in the pit in 1917, and so does this.
//
// Pure arithmetic on Float32Arrays, no WebAudio: so it renders identically on
// every device, runs in a worker, and runs in node, where the selftest measures
// it. Every random number is seeded by the event, so the band plays the same
// performance every time.
//
// renderBand(events, sampleRate, { seconds, wet }) -> { L, R }
//   events: { at, dur, inst, midi?, velocity, pan?, wet? } (seconds)
//   wet(t): the reverb send at time t (the room the scene is in), 0..1

const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

// ---- filters (RBJ biquads), applied in place ----------------------------------

function biquad(buf, type, f, q, sr, gainDb = 0) {
  const w = (TAU * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }   // peak
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

/** One-pole lowpass with a cutoff that moves: fc(i) in Hz. */
function sweepLP(buf, fc, sr) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = 1 - Math.exp((-TAU * Math.min(fc(i), sr * 0.45)) / sr);
    y += a * (buf[i] - y);
    buf[i] = y;
  }
  return buf;
}

// ---- oscillators: band-limited with polyBLEP, so high notes do not alias ----

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// ---- envelopes ----------------------------------------------------------------------

function adsr(i, sr, { a = 0.01, d = 0.1, s = 0.8, r = 0.1 }, holdS) {
  const t = i / sr;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < holdS) return s;
  return s * Math.max(0, 1 - (t - holdS) / r);
}

// ---- the instruments -----------------------------------------------------------------
// Each returns a mono Float32Array starting at the event's onset.

const INST = {
  // Upright bass, plucked: Karplus–Strong. A burst of filtered noise circulates
  // in a delay line one period long, losing its highs a little each trip.
  bass(e, sr, r) {
    const f = mtof(e.midi), n = Math.ceil((e.dur + 0.25) * sr), out = new Float32Array(n);
    const N = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = r();
    biquad(line, 'lp', 700 + e.velocity * 900, 0.7, sr);
    const hold = e.dur * sr;
    let p = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[p];
      const damp = i < hold ? 0.9985 : 0.94;      // the finger lifts
      line[p] = damp * 0.5 * (cur + prev);
      prev = cur;
      out[i] = cur * e.velocity * 1.4;
      p = (p + 1) % N;
    }
    return biquad(out, 'lp', 1400, 0.6, sr);
  },

  kick(e, sr) {
    const n = Math.ceil(0.35 * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (TAU * (46 + 80 * Math.exp(-t * 28))) / sr;
      out[i] = Math.sin(ph) * Math.exp(-t * 8) * e.velocity;
    }
    return out;
  },

  // Brushes on the snare: a spray of noise, a little drum tone underneath.
  snare(e, sr, r) {
    const n = Math.ceil(0.25 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = r() * Math.exp((-i / sr) * 22);
    biquad(out, 'bp', 3000, 0.8, sr);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += (TAU * 185) / sr; out[i] = (out[i] * 1.6 + Math.sin(ph) * 0.35 * Math.exp((-i / sr) * 30)) * e.velocity; }
    return out;
  },
  swish(e, sr, r) {
    const n = Math.ceil((e.dur + 0.1) * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = r() * Math.min(1, t / 0.06) * Math.exp(-Math.max(0, t - e.dur * 0.6) * 12) * e.velocity * 0.5; }
    return biquad(out, 'bp', 4200, 0.6, sr);
  },

  // Cymbals: a cluster of inharmonic square waves, high-passed: the 808 recipe.
  ride(e, sr, r, long = 1.4) {
    const n = Math.ceil(long * sr), out = new Float32Array(n);
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 1.7);
    const ph = fr.map(() => 0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < fr.length; k++) { ph[k] = (ph[k] + fr[k] / sr) % 1; s += ph[k] < 0.5 ? 1 : -1; }
      out[i] = (s / 6 + r() * 0.3) * Math.exp((-i / sr) * (3.2 / long)) * e.velocity * 0.5;
    }
    return biquad(out, 'hp', 5500, 0.7, sr);
  },
  hat(e, sr, r) { return INST.ride(e, sr, r, 0.12); },
  crash(e, sr, r) {
    const out = INST.ride(e, sr, r, 2.8);
    for (let i = 0; i < out.length; i++) out[i] *= 1.8;
    return out;
  },

  // Muted trumpet (a Harmon mute): a bright sawtooth squeezed through a narrow
  // nasal resonance, scooping up into each note.
  trumpet(e, sr) {
    const f0 = mtof(e.midi), n = Math.ceil((e.dur + 0.1) * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const scoop = Math.pow(2, (-45 * Math.exp(-t * 30)) / 1200);
      const vib = 1 + (t > 0.22 ? 0.006 * Math.sin(TAU * 5.6 * t) : 0);
      const dt = (f0 * scoop * vib) / sr;
      ph += dt; if (ph >= 1) ph -= 1;
      out[i] = (2 * ph - 1 - blep(ph, dt)) * adsr(i, sr, { a: 0.03, d: 0.1, s: 0.8, r: 0.08 }, e.dur) * e.velocity;
    }
    sweepLP(out, (i) => 1400 + 3200 * Math.exp((-i / sr) * 6), sr);
    const nasal = biquad(out.slice(), 'bp', 1750, 3.5, sr);
    for (let i = 0; i < n; i++) out[i] = out[i] * 0.35 + nasal[i] * 1.6;
    return out;
  },

  // Tenor sax: saw and square, formants at 450 Hz and 1.2 kHz, a little breath,
  // and — when the score asks for it — a growl.
  sax(e, sr, r) {
    const f0 = mtof(e.midi), n = Math.ceil((e.dur + 0.12) * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = 1 + (t > 0.25 ? 0.007 * Math.sin(TAU * 5.2 * t) : 0);
      const dt = (f0 * vib * Math.pow(2, (-30 * Math.exp(-t * 25)) / 1200)) / sr;
      ph += dt; if (ph >= 1) ph -= 1;
      const saw = 2 * ph - 1 - blep(ph, dt);
      let sq = ph < 0.5 ? 1 : -1; sq += blep(ph, dt); sq -= blep((ph + 0.5) % 1, dt);
      let v = saw * 0.6 + sq * 0.4 + r() * 0.04;
      if (e.growl) v *= 1 - 0.45 * (0.5 + 0.5 * Math.sin(TAU * 29 * t));
      out[i] = v * adsr(i, sr, { a: 0.035, d: 0.12, s: 0.82, r: 0.1 }, e.dur) * e.velocity;
    }
    sweepLP(out, (i) => 900 + 2600 * Math.exp((-i / sr) * 5), sr);
    biquad(out, 'pk', 450, 1.2, sr, 6);
    biquad(out, 'pk', 1200, 1.5, sr, 4);
    return out;
  },

  // Clarinet: a square wave — odd harmonics, the clarinet's hollow — gently filtered.
  clarinet(e, sr) {
    const f0 = mtof(e.midi), n = Math.ceil((e.dur + 0.1) * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const dt = (f0 * (1 + (t > 0.3 ? 0.004 * Math.sin(TAU * 5 * t) : 0))) / sr;
      ph += dt; if (ph >= 1) ph -= 1;
      let sq = ph < 0.5 ? 1 : -1; sq += blep(ph, dt); sq -= blep((ph + 0.5) % 1, dt);
      out[i] = sq * adsr(i, sr, { a: 0.045, d: 0.1, s: 0.85, r: 0.09 }, e.dur) * e.velocity;
    }
    return biquad(out, 'lp', Math.min(5000, f0 * 5 + 600), 0.7, sr);
  },

  // Vibraphone: bar partials, and the motor's tremolo.
  vibes(e, sr) {
    const f0 = mtof(e.midi), n = Math.ceil(Math.max(e.dur, 1.6) * sr), out = new Float32Array(n);
    const P = [[1, 1, 1.4], [3.98, 0.25, 4], [9.9, 0.08, 9]];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ra, g, dk] of P) s += Math.sin(TAU * f0 * ra * t) * g * Math.exp(-t * dk);
      out[i] = s * (1 - 0.35 * (0.5 + 0.5 * Math.sin(TAU * 5.2 * t))) * e.velocity * 0.8;
    }
    return out;
  },

  // Strings, after clef's patch: two sawtooths a hair apart, a slow bow, vibrato;
  // `trem` bows it fast.
  strings(e, sr) {
    const f0 = mtof(e.midi), n = Math.ceil((e.dur + 0.3) * sr), out = new Float32Array(n);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = 1 + (t > 0.25 ? 0.004 * Math.sin(TAU * 5.1 * t) : 0);
      const d1 = (f0 * vib) / sr, d2 = (f0 * 1.003 * vib) / sr;
      p1 += d1; if (p1 >= 1) p1 -= 1;
      p2 += d2; if (p2 >= 1) p2 -= 1;
      let v = (2 * p1 - 1 - blep(p1, d1)) * 0.55 + (2 * p2 - 1 - blep(p2, d2)) * 0.45;
      if (e.trem) v *= 0.45 + 0.55 * Math.abs(Math.sin(TAU * 6.5 * t));
      out[i] = v * adsr(i, sr, { a: e.trem ? 0.03 : 0.13, d: 0.3, s: 0.86, r: 0.28 }, e.dur) * e.velocity;
    }
    return biquad(out, 'lp', Math.min(6000, f0 * 6 + 500), 0.9, sr);
  },

  // ---- the noisemakers (Satie's, and the city's)
  type(e, sr, r) {                                  // a typewriter key
    const n = Math.ceil(0.07 * sr), out = new Float32Array(n);
    const k = 1000 + (r() + 1) * 400;
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (r() * Math.exp(-t * 300) * 0.9 + Math.sin(TAU * k * t) * Math.exp(-t * 90) * 0.5) * e.velocity; }
    return biquad(out, 'hp', 700, 0.7, sr);
  },
  carriage(e, sr, r) {                              // the bell at the end of the line
    const n = Math.ceil(0.9 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(TAU * 2850 * t) * 0.6 + Math.sin(TAU * 5130 * t) * 0.25) * Math.exp(-t * 5) * e.velocity + (t > 0.12 && t < 0.5 ? r() * 0.15 * e.velocity : 0); }
    return out;
  },
  siren(e, sr) {
    const n = Math.ceil(e.dur * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 480 + 420 * (0.5 - 0.5 * Math.cos((TAU * t) / (e.period || 2.6)));
      ph += f / sr;
      const env = Math.min(1, t / 0.4) * Math.min(1, (e.dur - t) / 0.6);
      out[i] = (Math.sin(TAU * ph) * 0.7 + Math.sin(TAU * ph * 2) * 0.2) * env * e.velocity;
    }
    return out;
  },
  horn(e, sr) {                                     // a taxi
    const n = Math.ceil((e.dur + 0.05) * sr), out = new Float32Array(n);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, bend = 1 - 0.04 * Math.max(0, (t - e.dur + 0.1) / 0.1);
      a = (a + (350 * bend) / sr) % 1; b = (b + (440 * bend) / sr) % 1;
      out[i] = ((a < 0.5 ? 1 : -1) + (b < 0.5 ? 1 : -1)) * 0.5 * Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (e.dur - t) / 0.03)) * e.velocity;
    }
    return biquad(out, 'lp', 1800, 0.8, sr);
  },
  shot(e, sr, r) {                                  // the pistol
    const n = Math.ceil(0.9 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (r() * Math.exp(-t * 38) * 1.5 + Math.sin(TAU * 58 * t) * Math.exp(-t * 9) * 1.2) * e.velocity; }
    return biquad(out, 'lp', 6000, 0.6, sr);
  },
  ding(e, sr) {                                     // the elevator, the desk bell
    const f0 = e.midi ? mtof(e.midi) : 1318, n = Math.ceil(2.2 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(TAU * f0 * t) + 0.5 * Math.sin(TAU * f0 * 2.76 * t) * Math.exp(-t * 2) + 0.25 * Math.sin(TAU * f0 * 5.4 * t) * Math.exp(-t * 4)) * Math.exp(-t * 1.8) * e.velocity * 0.6; }
    return out;
  },
  ratchet(e, sr, r) {                               // the lottery wheel; the elevator's cables
    const n = Math.ceil(e.dur * sr), out = new Float32Array(n);
    let next = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (i >= next) {
        const rate = (e.from || 16) + ((e.to || 5) - (e.from || 16)) * (t / e.dur);
        for (let k = 0; k < Math.min(220, n - i); k++) out[i + k] += r() * Math.exp(-k / (sr * 0.004)) * e.velocity;
        next = i + Math.round(sr / rate);
      }
    }
    return biquad(out, 'bp', 2600, 1.2, sr);
  },
  whistle(e, sr, r) {                               // police
    const n = Math.ceil(e.dur * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (2900 + 90 * Math.sin(TAU * 26 * t)) / sr;
      out[i] = (Math.sin(TAU * ph) + r() * 0.15) * Math.min(1, t / 0.02) * Math.min(1, (e.dur - t) / 0.05) * e.velocity * 0.5;
    }
    return out;
  },
  glass(e, sr) {
    const n = Math.ceil(0.6 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(TAU * 2350 * t) + 0.6 * Math.sin(TAU * 5900 * t)) * Math.exp(-t * 9) * e.velocity * 0.4; }
    return out;
  },
  crowd(e, sr, r) {                                 // a room full of people talking at once
    const n = Math.ceil(e.dur * sr), out = new Float32Array(n);
    const bands = [320, 540, 900, 1400].map((f) => biquad(Float32Array.from({ length: n }, () => r()), 'bp', f, 2.2, sr));
    const rs = rng((e.seed || 7) * 31);
    const phases = bands.map(() => [rs() * 6, 1 + rs() * 2.5]);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      bands.forEach((b, k) => { s += b[i] * (0.5 + 0.5 * Math.sin(phases[k][0] + t * phases[k][1] * TAU * 0.7)) ** 2; });
      out[i] = s * Math.min(1, t / 1.5) * Math.min(1, (e.dur - t) / 1.5) * e.velocity;
    }
    return out;
  },
  thud(e, sr, r) {
    const n = Math.ceil(0.7 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(TAU * 48 * t) * Math.exp(-t * 7) + r() * 0.5 * Math.exp(-t * 25)) * e.velocity; }
    return biquad(out, 'lp', 900, 0.7, sr);
  },
  step(e, sr, r) {                                  // a heel on the pavement
    const n = Math.ceil(0.09 * sr), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (r() * 0.6 + Math.sin(TAU * 110 * t)) * Math.exp(-t * 55) * e.velocity; }
    return biquad(out, 'lp', 1500, 0.7, sr);
  },
};

const GAIN = {
  bass: 0.55, kick: 0.7, snare: 0.35, swish: 0.3, ride: 0.2, hat: 0.18, crash: 0.3,
  trumpet: 0.22, sax: 0.26, clarinet: 0.2, vibes: 0.3, strings: 0.12,
  type: 0.35, carriage: 0.25, siren: 0.16, horn: 0.2, shot: 0.9, ding: 0.35, ratchet: 0.28,
  whistle: 0.2, glass: 0.3, crowd: 0.06, thud: 0.8, step: 0.35,
};
const PAN = { bass: 0, kick: 0, snare: 0.15, swish: 0.15, ride: -0.3, hat: 0.3, crash: -0.2, trumpet: 0.3, sax: -0.3, clarinet: 0.28, vibes: -0.25, strings: 0 };

export const INSTRUMENTS = Object.keys(INST);

// ---- reverb: Freeverb, eight combs and four allpasses a side ----------------------

function freeverb(input, sr, room = 0.84, damp = 0.3) {
  const scale = sr / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => Math.round(x * scale));
  const apT = [556, 441, 341, 225].map((x) => Math.round(x * scale));
  const side = (spread) => {
    const out = new Float32Array(input.length);
    const combs = combT.map((n) => ({ buf: new Float32Array(n + spread), p: 0, store: 0 }));
    const aps = apT.map((n) => ({ buf: new Float32Array(n + spread), p: 0 }));
    for (let i = 0; i < input.length; i++) {
      const x = input[i] * 0.015;
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.p];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.p] = x + c.store * room;
        c.p = (c.p + 1) % c.buf.length;
        s += y;
      }
      for (const a of aps) {
        const b = a.buf[a.p];
        a.buf[a.p] = s + b * 0.5;
        s = b - s;
        a.p = (a.p + 1) % a.buf.length;
      }
      out[i] = s;
    }
    return out;
  };
  return [side(0), side(Math.round(23 * scale))];
}

/**
 * Render every band event (anything that is not the piano) to stereo.
 * `wet(t)` is the reverb send by time: the room the story is in.
 */
export function renderBand(events, sampleRate, { seconds, wet = () => 0.2, slap = () => 0 } = {}) {
  const sr = sampleRate;
  const n = Math.ceil(seconds * sr);
  const L = new Float32Array(n), R = new Float32Array(n), send = new Float32Array(n), slapSend = new Float32Array(n);
  events.forEach((e, idx) => {
    const fn = INST[e.inst];
    if (!fn) return;
    const r = rng(idx * 7919 + 13);
    const buf = fn(e, sr, r);
    const g = (GAIN[e.inst] ?? 0.3) * (e.gain ?? 1);
    const pan = e.pan ?? PAN[e.inst] ?? 0;
    const gl = g * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = g * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const start = Math.round(e.at * sr);
    const w = e.wet ?? wet(e.at), sl = slap(e.at);
    for (let i = 0; i < buf.length && start + i < n; i++) {
      if (start + i < 0) continue;
      const v = buf[i];
      L[start + i] += v * gl; R[start + i] += v * gr;
      send[start + i] += v * g * w;
      slapSend[start + i] += v * g * sl;
    }
  });
  const [wl, wr] = freeverb(send, sr);
  // the street's slapback: one echo off the buildings across the way
  const d = Math.round(0.11 * sr);
  for (let i = 0; i < n; i++) {
    L[i] += wl[i] + (i >= d ? slapSend[i - d] * 0.5 : 0);
    R[i] += wr[i] + (i >= d + 90 ? slapSend[i - d - 90] * 0.5 : 0);
  }
  return { L, R };
}

/** Piano and band into one stereo pair, with a gentle ceiling so the sum never clips. */
export function mix(pianoL, pianoR, band, from = 0, pianoGain = 0.85) {
  const n = pianoL.length;
  for (let i = 0; i < n; i++) {
    const j = from + i;
    const bl = j < band.L.length ? band.L[j] : 0, br = j < band.R.length ? band.R[j] : 0;
    pianoL[i] = Math.tanh(pianoL[i] * pianoGain + bl);
    pianoR[i] = Math.tanh(pianoR[i] * pianoGain + br);
  }
}
