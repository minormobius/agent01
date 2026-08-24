// unit — chroma: color as sound. No deps but ./spectrum.js, no DOM, no Web
// Audio. Pure functions, so the node selftest can check the physics and the
// page only has to make noise with it.
//
// The premise, and the catch:
//
//   Visible light runs 384–789 THz. That is a ratio of 2.05 — the entire
//   rainbow is ONE OCTAVE. Drop it by 2^40 and it lands almost exactly on
//   F4 → F5, which is why that shift is the default.
//
//   The catch is that one octave is not much room. The CIE color-matching
//   table samples every 5 nm; near 550 nm two neighbouring samples are 15.6
//   cents apart — a sixth of a semitone. So a broad spectrum does not arrive
//   as a chord, it arrives as a CLUSTER: dozens of partials inside a single
//   octave, beating against each other. That roughness is not a bug in the
//   mapping, it is what a spectrum sounds like when you are honest about the
//   scale, and `roughness()` measures it.
//
// The interesting part is that a screen is not a spectrum. It has three
// narrow emitters, so screen-white is a three-note chord while daylight at
// the same white point is a cluster — two colors that look identical and
// sound nothing alike. That is metamerism, made audible.

import S from './spectrum.js';

const K = {};

K.SHIFT = 40;                    // octaves to drop light by, to land in hearing
K.A4 = 440;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ── the mapping ──
K.toAudio = (nm, shift = K.SHIFT) => S.frequency(nm) / Math.pow(2, shift);
K.fromAudio = (hz, shift = K.SHIFT) => (S.C / (hz * Math.pow(2, shift))) * 1e9;

// the audible image of the visible band, low (red) to high (violet)
K.range = (shift = K.SHIFT) => ({
  lo: K.toAudio(S.VISIBLE.max, shift),
  hi: K.toAudio(S.VISIBLE.min, shift),
  octaves: Math.log2(S.frequency(S.VISIBLE.min) / S.frequency(S.VISIBLE.max)),
});

K.cents = (f1, f2) => 1200 * Math.log2(f2 / f1);

K.note = (hz) => {
  const midi = 12 * Math.log2(hz / K.A4) + 69;
  const n = Math.round(midi);
  const cents = Math.round((midi - n) * 100);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return { midi: n, name, octave, cents, label: `${name}${octave}${cents >= 0 ? '+' : '−'}${Math.abs(cents)}¢` };
};

// Stretch the octave open. k = 1 is the honest mapping; k > 1 spreads the same
// spectrum over k octaves so the ear can resolve what is inside it. This is a
// LIE — it is no longer the frequency of the light — but it is the only way to
// hear structure that real physics packs into 1245 cents. The page says so.
K.stretch = (hz, k = 1, shift = K.SHIFT) => {
  if (k === 1) return hz;
  const anchor = K.toAudio(S.VISIBLE.max, shift);
  return anchor * Math.pow(hz / anchor, k);
};

// ── spectral power distributions ──
// Every source is a function of wavelength returning relative power.

const gauss = (mu, sigma) => (nm) => Math.exp(-0.5 * Math.pow((nm - mu) / sigma, 2));

// Display emitters. Peaks and widths are the narrowest single bumps whose
// luminance-weighted mix reproduces D65 to within 0.005 in xy — checked in the
// selftest by integrating them back through the CIE observer in spectrum.js.
// They sit close to a real LED-backlit panel's measured peaks.
//
// One honest caveat the page repeats: no single red emitter can BE the sRGB
// red primary. (0.64, 0.33) is slightly inside the spectral locus, and the
// locus is nearly straight through the reds, so any red bump lands at about
// (0.655, 0.345) — a little more saturated than sRGB asks for.
K.PRIMARIES = [
  { key: 'r', name: 'Red emitter',   peak: 627.5, sigma: 25.5 },
  { key: 'g', name: 'Green emitter', peak: 546.0, sigma: 26.0 },
  { key: 'b', name: 'Blue emitter',  peak: 455.5, sigma: 26.0 },
];
const LUMA = { r: 0.2126729, g: 0.7151522, b: 0.0721750 };

// integrate any SPD back through the CIE observer — the round trip that keeps
// these models honest
K.chromaticityOf = (spd, step = 1) => {
  let X = 0, Y = 0, Z = 0;
  for (let nm = S.VISIBLE.min; nm <= S.VISIBLE.max; nm += step) {
    const c = S.cmf(nm), p = spd(nm);
    X += c.X * p; Y += c.Y * p; Z += c.Z * p;
  }
  const s = X + Y + Z;
  return s > 0 ? { x: X / s, y: Y / s, Y } : { x: NaN, y: NaN, Y: 0 };
};

// scale each emitter so R=G=B=1 comes out at D65 with the right luminance split
const NORM = {};
for (const p of K.PRIMARIES) {
  NORM[p.key] = LUMA[p.key] / K.chromaticityOf(gauss(p.peak, p.sigma)).Y;
}
K.PRIMARY_GAIN = NORM;

// A single wavelength. `width` is instrument resolution, not physics: a real
// laser line is far narrower than anything the ear could tell apart here.
K.spdLaser = (nm, width = 2) => gauss(nm, width);

// What a screen emits to show a color. Takes LINEAR rgb (0–1), not sRGB bytes.
K.spdDisplay = (lin) => (nm) =>
  K.PRIMARIES.reduce((a, p) => a + Math.max(0, lin[p.key]) * NORM[p.key] * gauss(p.peak, p.sigma)(nm), 0);

// Planck's law in wavelength — the sun, a filament, a star.
const HC_K = 1.4387768775e7;                     // hc/k in nm·K
K.spdBlackbody = (T) => (nm) => {
  const x = HC_K / (nm * T);
  return Math.pow(nm, -5) / (Math.expm1(x)) * 1e18;   // scale only, shape is what matters
};
K.wienPeak = (T) => 2.897771955e6 / T;           // nm, for the selftest to check against

// Illuminant E: every wavelength equally. The flat spectrum nothing real emits.
K.spdEqual = () => () => 1;

K.SOURCES = [
  { id: 'laser',     name: 'Pure light',      hint: 'one wavelength — a laser line' },
  { id: 'display',   name: 'Your screen',     hint: 'three emitters mixing to a color' },
  { id: 'blackbody', name: 'Hot object',      hint: 'sunlight, a filament, a star' },
  { id: 'equal',     name: 'Equal energy',    hint: 'every wavelength at once' },
];

// ── the bank ──
// Every source is played through the SAME fixed set of frequencies, log-spaced
// across the visible octave. A color only changes their GAINS.
//
// This matters twice. Musically, it means roughness is a property of the color
// rather than of how finely I happened to sample — sample a spectrum twice as
// densely and a naive partial list gets twice as rough, which would make the
// number meaningless. Practically, it means the page builds one oscillator
// bank at startup and never rebuilds it; changing color is a gain envelope.
K.bank = ({ count = 48, shift = K.SHIFT, stretch = 1 } = {}) => {
  const fLo = S.frequency(S.VISIBLE.max), fHi = S.frequency(S.VISIBLE.min);
  const out = [];
  for (let i = 0; i < count; i++) {
    // bin centre, log-spaced in frequency (which is log-spaced in 1/λ)
    const t = (i + 0.5) / count;
    const fq = fLo * Math.pow(fHi / fLo, t);
    const nm = (S.C / fq) * 1e9;
    out.push({
      nm,
      hz: K.stretch(fq / Math.pow(2, shift), stretch, shift),
      lo: (S.C / (fLo * Math.pow(fHi / fLo, i / count))) * 1e9,
      hi: (S.C / (fLo * Math.pow(fHi / fLo, (i + 1) / count))) * 1e9,
    });
  }
  return out;
};

// Integrate a spectrum into a bank's bins and normalise to a peak of 1.
K.gains = (spd, bank, subdiv = 6) => {
  const raw = bank.map(b => {
    const lo = Math.min(b.lo, b.hi), hi = Math.max(b.lo, b.hi);
    let sum = 0;
    for (let k = 0; k < subdiv; k++) sum += Math.max(0, spd(lo + (hi - lo) * (k + 0.5) / subdiv));
    return (sum / subdiv) * (hi - lo);        // power per bin, not per nm
  });
  const peak = raw.reduce((m, v) => Math.max(m, v), 0);
  return peak > 0 ? raw.map(v => v / peak) : raw.map(() => 0);
};

K.partials = (spd, bank, { floor = 0.01 } = {}) => {
  const g = K.gains(spd, bank);
  return bank.map((b, i) => ({ nm: b.nm, hz: b.hz, gain: g[i] })).filter(p => p.gain >= floor);
};

// Where the humps are. A spectrum's local maxima are the thing you would call
// its "notes" if you were being generous — three for a screen, one for a hot
// object, none for a flat spectrum. The sound is the whole cluster; this is
// the idealisation of it, and the page lets you hear both.
K.lobes = (spd, { step = 2, minProminence = 0.12 } = {}) => {
  const xs = [];
  for (let nm = S.VISIBLE.min; nm <= S.VISIBLE.max; nm += step) xs.push({ nm, p: Math.max(0, spd(nm)) });
  const peak = xs.reduce((m, v) => Math.max(m, v.p), 0);
  if (!(peak > 0)) return [];
  const out = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (xs[i].p > xs[i - 1].p && xs[i].p >= xs[i + 1].p && xs[i].p / peak >= minProminence) {
      // power-weighted centroid of the hump, so a lopsided bump reports honestly
      let lo = i, hi = i;
      while (lo > 0 && xs[lo - 1].p < xs[lo].p) lo--;
      while (hi < xs.length - 1 && xs[hi + 1].p < xs[hi].p) hi++;
      let num = 0, den = 0;
      for (let j = lo; j <= hi; j++) { num += xs[j].nm * xs[j].p; den += xs[j].p; }
      out.push({ nm: xs[i].nm, centroid: den > 0 ? num / den : xs[i].nm, strength: xs[i].p / peak });
    }
  }
  // A spectrum that only slopes across the visible band — a cool filament, a
  // flat illuminant — has no interior peak at all. Report the edge it leans
  // on rather than nothing, and flag it, because "no hump" is the finding.
  if (!out.length) {
    const ends = [xs[0], xs[xs.length - 1]];
    const top = ends[0].p >= ends[1].p ? ends[0] : ends[1];
    if (top.p / peak >= 0.5 && ends[0].p !== ends[1].p) {
      out.push({ nm: top.nm, centroid: top.nm, strength: 1, edge: true });
    }
  }
  return out;
};

// ── how rough does that sound? ──
// Plomp & Levelt's dissonance curve as parameterised by Sethares: a pair of
// partials contributes roughness that peaks when they sit about a quarter of a
// critical band apart, and vanishes when they are far apart or identical. One
// tone scores ~0; a cluster packed inside a single octave scores high. Run over
// a fixed bank (above), this is a property of the COLOR, and it is what makes
// "the whole spectrum is one octave" into a number you can watch move.
K.roughness = (partials) => {
  const B1 = 3.5, B2 = 5.75, S1 = 0.0207, S2 = 18.96;
  let total = 0, amp = 0;
  for (let i = 0; i < partials.length; i++) {
    amp += partials[i].gain;
    for (let j = i + 1; j < partials.length; j++) {
      const a = partials[i], b = partials[j];
      const fmin = Math.min(a.hz, b.hz), df = Math.abs(a.hz - b.hz);
      const sc = 0.24 / (S1 * fmin + S2);
      total += a.gain * b.gain * (Math.exp(-B1 * sc * df) - Math.exp(-B2 * sc * df));
    }
  }
  // Divide by total amplitude SQUARED — every partial weighed against every
  // other. Sum-of-squares would grow like N while the pair count grows like
  // N², leaving the score a measure of the bank size instead of the color.
  return amp > 0 ? total / (amp * amp) : 0;
};

// The humps, named — what you would write on a stave if you had to.
K.chord = (spd, { shift = K.SHIFT, stretch = 1 } = {}) =>
  K.lobes(spd).map(l => {
    const hz = K.stretch(K.toAudio(l.nm, shift), stretch, shift);
    return { ...l, hz, note: K.note(hz), color: S.hex(l.nm, { fade: false }) };
  }).sort((p, q) => p.hz - q.hz);      // musical order: lowest note first

// ── metamers: the whole point ──
// Two spectra that look identical and sound nothing alike. Not "close" — the
// eye reduces any spectrum to three numbers, so an EXACT match exists and can
// be solved for.
//
// A blackbody will not do it. The Planckian locus runs below the daylight
// locus, so the closest hot object to screen-white is still 0.007 off in xy —
// a tint you can catch side by side. Instead take three broad, overlapping
// humps and solve the 3×3 system for the weights that reproduce the target's
// XYZ exactly. The result matches to floating-point precision, stays positive
// everywhere (so it is a spectrum something could really emit), and is one
// smooth hill where the screen has three spikes.
K.xyz = (spd, step = 1) => {
  let X = 0, Y = 0, Z = 0;
  for (let nm = S.VISIBLE.min; nm <= S.VISIBLE.max; nm += step) {
    const c = S.cmf(nm), p = spd(nm);
    X += c.X * p; Y += c.Y * p; Z += c.Z * p;
  }
  return [X, Y, Z];
};

K.SMOOTH_BASIS = [{ peak: 450, sigma: 70 }, { peak: 550, sigma: 70 }, { peak: 650, sigma: 70 }];

const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

// Solve a smooth spectrum with the same XYZ as `spd`. Returns null if the
// solution would need negative light somewhere — no such thing exists, and a
// demo that quietly showed one would be a lie.
K.metamerOf = (spd, basis = K.SMOOTH_BASIS) => {
  const fns = basis.map(b => gauss(b.peak, b.sigma));
  const cols = fns.map(f => K.xyz(f));
  const M = [0, 1, 2].map(row => cols.map(c => c[row]));
  const D = det3(M);
  if (Math.abs(D) < 1e-12) return null;
  const target = K.xyz(spd);
  const w = [];
  for (let c = 0; c < 3; c++) {
    const m = M.map(r => r.slice());
    for (let r = 0; r < 3; r++) m[r][c] = target[r];
    w.push(det3(m) / D);
  }
  const out = (nm) => fns.reduce((acc, f, i) => acc + w[i] * f(nm), 0);
  for (let nm = S.VISIBLE.min; nm <= S.VISIBLE.max; nm += 2) if (out(nm) < 0) return null;
  return Object.assign(out, { weights: w });
};

K.metamers = () => {
  const screen = K.spdDisplay({ r: 1, g: 1, b: 1 });
  return {
    screen: { label: 'Screen white', sub: 'three narrow emitters', spd: screen },
    smooth: { label: 'A smooth spectrum', sub: 'solved to the same XYZ, exactly', spd: K.metamerOf(screen) },
  };
};

if (typeof globalThis !== 'undefined') globalThis.CHROMA = K;
export default K;
