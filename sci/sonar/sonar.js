// sonar.js — the signal path of sci.mino.mobi/sonar/, with no browser in it.
//
// Everything the page computes from a recording lives here, so the selftest
// (sci.selftest.mjs §7) can run it against synthetic echoes whose delay is
// known exactly. The page adds only Web Audio plumbing and drawing.

// ---- the medium ----------------------------------------------------------

// Speed of sound in dry air, ideal gas: c = 331.3·√(1 + T/273.15) m/s.
// Cramer 1993 gives the full dependence on humidity and CO₂; at room
// conditions it moves c by a few tenths of a percent, below what a phone
// can resolve.
export function speedOfSound(tC) {
  return 331.3 * Math.sqrt(1 + tC / 273.15);
}

// Atmospheric absorption, ISO 9613-1:1993 (Bass et al. 1995), in dB per metre.
// f in Hz, tC in °C, rh in percent, p in kPa.
export function absorptionDbPerM(f, tC, rh, p = 101.325) {
  const T = tC + 273.15, T0 = 293.15, T01 = 273.16, pr = 101.325;
  const C = -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151;
  const h = rh * Math.pow(10, C) / (p / pr);            // molar water vapour, %
  const frO = (p / pr) * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
  const frN = (p / pr) * Math.pow(T / T0, -0.5)
            * (9 + 280 * h * Math.exp(-4.170 * (Math.pow(T / T0, -1 / 3) - 1)));
  const f2 = f * f;
  return 8.686 * f2 * (
    1.84e-11 * (pr / p) * Math.sqrt(T / T0)
    + Math.pow(T / T0, -2.5) * (
        0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO)
      + 0.1068  * Math.exp(-3352.0 / T) / (frN + f2 / frN)));
}

// ---- the pulse -----------------------------------------------------------

// A linear chirp f0→f1 over `dur` seconds under a taper. The default is a
// full Hann window: a 0.2 Tukey edge leaves the narrow 17–20.5 kHz chirp's
// range sidelobes at −21 dB 20 cm out, enough to bury a real echo; Hann puts
// them at −43 dB for a mainlobe about twice as wide (selftest §7). Returns the in-phase pulse (what is
// played) and its quadrature twin (used only by the matched filter, so the
// envelope does not ripple at the carrier).
export function chirp(fs, f0, f1, dur, taper = 1) {
  const n = Math.max(8, Math.round(fs * dur));
  const i = new Float32Array(n), q = new Float32Array(n);
  const k = (f1 - f0) / dur, edge = Math.max(1, Math.floor(taper * n / 2));
  for (let j = 0; j < n; j++) {
    const t = j / fs;
    const ph = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
    let w = 1;
    if (j < edge) w = 0.5 - 0.5 * Math.cos(Math.PI * j / edge);
    else if (j >= n - edge) w = 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - j) / edge);
    i[j] = w * Math.sin(ph);
    q[j] = w * Math.cos(ph);
  }
  return { i, q, n };
}

// The matched filter (Turin 1960): correlate the recording with the pulse
// and its quadrature; the magnitude is the echo envelope. env[m] peaks where
// a copy of the pulse begins at sample m. A chirp of bandwidth B compresses
// to a peak about 1/B wide, which is what sets range resolution c/(2B).
export function matchedEnvelope(x, pulse, out) {
  const { i, q, n } = pulse;
  const m = Math.max(0, x.length - n + 1);
  const env = out && out.length >= m ? out : new Float32Array(m);
  for (let a = 0; a < m; a++) {
    let si = 0, sq = 0;
    for (let b = 0; b < n; b++) { const v = x[a + b]; si += v * i[b]; sq += v * q[b]; }
    env[a] = Math.sqrt(si * si + sq * sq);
  }
  return env;
}

export function argmax(a, from = 0, to = a.length) {
  let best = from, v = -Infinity;
  for (let j = Math.max(0, from); j < Math.min(a.length, to); j++) if (a[j] > v) { v = a[j]; best = j; }
  return best;
}

// ---- delay → range -------------------------------------------------------

// Delays are measured from the direct path (speaker straight into the mic),
// which arrives first and loudest. That makes the unknown output and input
// latency of the phone or headset cancel out. With the speaker and mic `s`
// metres apart and a target at range d, the echo travels ≈2d against the
// direct path's s, so τ = (2d − s)/c and d = (cτ + s)/2.
export function rangeFromDelay(tau, c, s) { return (c * tau + s) / 2; }
export function delayFromRange(d, c, s) { return (2 * d - s) / c; }

export function rangeResolution(c, bandwidth) { return c / (2 * bandwidth); }
export function unambiguousRange(c, interval) { return c * interval / 2; }

// Pick a band the link can actually carry. fsEff is the lower of the output
// and input sample rates; a Bluetooth headset microphone often runs at 16 kHz,
// whose Nyquist limit is 8 kHz.
export const BANDS = {
  quiet: { label: "near-ultrasonic", f0: 17000, f1: 20500 },
  wide:  { label: "wideband click",  f0: 2000,  f1: 20000 },
  voice: { label: "audible",         f0: 1500,  f1: 7000 },
};
export function fitBand(name, fsEff) {
  const b = BANDS[name] || BANDS.quiet;
  const top = 0.45 * fsEff;
  if (b.f1 <= top) return { ...b, name };
  const f1 = Math.floor(top / 100) * 100;
  if (f1 - b.f0 >= 2000) return { ...b, name, f1, clipped: true };   // 44.1 kHz: 17–19.8 kHz
  if (name !== "voice") return { ...fitBand("voice", fsEff), fellBack: true };
  return { ...b, name, f1: Math.max(b.f0 + 1000, f1), clipped: true };
}

// ---- one ping → one profile ------------------------------------------------

// Given the envelope around one ping, find its direct-path peak inside the
// search window [lo, hi) and return the profile that follows it.
export function profileAfterPeak(env, lo, hi, bins) {
  const p = argmax(env, lo, hi);
  const out = new Float32Array(bins);
  for (let j = 0; j < bins; j++) out[j] = env[p + j] || 0;
  return { peak: p, direct: env[p], profile: out };
}

// The dead zone: the range out to which the direct path's own compressed
// peak and sidelobes stay louder than `db` relative to its peak. Measured
// from the pulse's autocorrelation, not assumed, because the taper sets the
// skirt and a 2/B rule of thumb leaves it at about −20 dB.
export function deadZone(pulse, fs, c, s, db = -45) {
  const x = new Float32Array(3 * pulse.n);
  x.set(pulse.i, pulse.n);
  const env = matchedEnvelope(x, pulse);
  const lim = env[pulse.n] * Math.pow(10, db / 20);
  let last = pulse.n;
  for (let j = pulse.n; j < env.length; j++) if (env[j] > lim) last = j;
  return rangeFromDelay((last - pulse.n + 1) / fs, c, s);
}

// Strongest echo beyond the dead zone in a (baseline-subtracted) profile,
// returned as a range in metres, or null if nothing clears the threshold.
export function strongestEcho(profile, fs, c, s, deadZone, threshold) {
  let best = -1, v = threshold;
  for (let j = 0; j < profile.length; j++) {
    if (rangeFromDelay(j / fs, c, s) < deadZone) continue;
    if (profile[j] > v) { v = profile[j]; best = j; }
  }
  return best < 0 ? null : { range: rangeFromDelay(best / fs, c, s), level: v, bin: best };
}

// ---- removing the room ----------------------------------------------------
//
// A room returns the same echoes on every ping. On a phone the speaker and
// microphone share one clock, so those echoes repeat sample for sample, phase
// included. Subtracting a trailing average of the *complex* correlation (I and
// Q, before taking a magnitude) cancels them far more completely than
// subtracting envelopes, because an envelope keeps the noise's magnitude and
// loses its sign.
//
// What is left is then averaged as a *magnitude* across pings. A moving hand
// shifts by a wavelength (1.8 cm at 19 kHz) within a few pings, so averaging
// the complex residual would cancel the hand along with the noise. The
// selftest (§8) measures all three choices on a moving target.

// The matched filter without the magnitude: I and Q correlations.
export function matchedIQ(x, pulse, outI, outQ) {
  const { i, q, n } = pulse;
  const m = Math.max(0, x.length - n + 1);
  const I = outI && outI.length >= m ? outI : new Float32Array(m);
  const Q = outQ && outQ.length >= m ? outQ : new Float32Array(m);
  for (let a = 0; a < m; a++) {
    let si = 0, sq = 0;
    for (let b = 0; b < n; b++) { const v = x[a + b]; si += v * i[b]; sq += v * q[b]; }
    I[a] = si; Q[a] = sq;
  }
  return { I, Q };
}

// A trailing average of the complex echo profile: the room map.
// The first `warm` profiles form a plain mean, so the map is usable after a
// couple of seconds. After that each profile moves it by `alpha`, an
// exponential trailing average with a time constant of 1/alpha pings. A
// target that stays still long enough becomes part of the room.
export class ClutterMap {
  constructor(bins) { this.I = new Float64Array(bins); this.Q = new Float64Array(bins); this.n = 0; }
  get bins() { return this.I.length; }
  // Profile bins are I[off + j], scaled by `scale` (1 / the direct-path amplitude).
  // `res` is this ping's residual. Bins standing well above the residual's
  // median are foreground (a hand) and are learned ten times more slowly.
  // Otherwise the map absorbs part of the hand while it is there, and leaves
  // a ghost of it behind when it goes.
  add(I, Q, off, scale, alpha, warm, res) {
    const warming = this.n < warm, a = warming ? 1 / (this.n + 1) : alpha;
    let thr = Infinity;
    if (!warming && res) { const t = Float32Array.from(res).sort(); thr = 3 * t[t.length >> 1]; }
    for (let j = 0; j < this.I.length; j++) {
      const aj = res && res[j] > thr ? a * 0.1 : a;
      this.I[j] += aj * (I[off + j] * scale - this.I[j]);
      this.Q[j] += aj * (Q[off + j] * scale - this.Q[j]);
    }
    this.n++;
  }
  residual(I, Q, off, scale, out = new Float32Array(this.I.length)) {
    for (let j = 0; j < this.I.length; j++) out[j] = Math.hypot(I[off + j] * scale - this.I[j], Q[off + j] * scale - this.Q[j]);
    return out;
  }
}

// An exponential trailing average of magnitudes, in place. alpha = 1/N
// averages over roughly the last N pings.
export function trail(acc, x, alpha) {
  for (let j = 0; j < acc.length; j++) acc[j] += alpha * (x[j] - acc[j]);
  return acc;
}

// Where the direct path sits in each ping's window, robustly. On one clock it
// never moves; a single noisy ping can still flip the argmax of a broad peak
// by a sample, which would misalign the room map by a third of a cycle. So the
// anchor moves only when the median of the recent offsets does, and a link
// whose offsets scatter (Bluetooth) is reported as jittery.
export class Anchor {
  constructor(keep = 9) { this.keep = keep; this.hist = []; }
  push(offset) { this.hist.push(offset); if (this.hist.length > this.keep) this.hist.shift(); }
  // The shift to apply to the anchor, in samples (0 while the median is 0).
  shift() {
    if (this.hist.length < Math.min(5, this.keep)) return 0;
    const s = [...this.hist].sort((a, b) => a - b), m = s[s.length >> 1];
    if (m !== 0) this.hist = this.hist.map((v) => v - m);
    return m;
  }
  spread() {
    if (this.hist.length < 3) return 0;
    const s = [...this.hist].sort((a, b) => a - b), m = s[s.length >> 1];
    const d = s.map((v) => Math.abs(v - m)).sort((a, b) => a - b);
    return d[d.length >> 1];
  }
}

// ---- many phones: two-way ranging ------------------------------------------
//
// Two phones cannot share a clock, but each can hear both chirps on its own.
// Phone A hears its own chirp at t_AA and B's at t_AB, both on A's clock;
// B hears A's at t_BA and its own at t_BB, on B's clock. Then
//
//   d = (c/2)·[(t_AB − t_AA) − (t_BB − t_BA)] + (s_A + s_B)/2
//
// Each bracket is a difference on one clock, so the offset between the two
// clocks cancels. So do the latencies: each emission is heard by both phones,
// so its output delay appears in both brackets, and each phone's input delay
// applies to both of the arrivals it times.
// s is each phone's own speaker-to-microphone spacing, which its self-hearing
// adds. What comes out is the mean of the two speaker-to-microphone paths
// between the phones (Peng et al. 2007). The selftest (§9) synthesises two
// phones with different sample rates, clock errors, latencies and offsets.

export function twoWayRange(tAA, tAB, tBB, tBA, c, sA, sB) {
  return (c / 2) * ((tAB - tAA) - (tBB - tBA)) + (sA + sB) / 2;
}

// The direct path is the first arrival, not the loudest: with no line of
// sight a reflection can be louder. Take the first local maximum, inside
// [lo, hi), that reaches `frac` of the window's peak, and refine it to a
// fraction of a sample with a parabola through its neighbours. Returns null
// unless the peak stands `minSnr` above the window's median.
export function firstArrival(env, lo, hi, frac = 0.5, minSnr = 8) {
  lo = Math.max(1, lo | 0); hi = Math.min(env.length - 1, hi | 0);
  if (hi - lo < 3) return null;
  let max = 0;
  for (let j = lo; j < hi; j++) if (env[j] > max) max = env[j];
  const w = Float32Array.from(env.subarray(lo, hi)).sort();
  const med = w[w.length >> 1] || 1e-30;
  if (max < minSnr * med) return null;
  for (let j = lo; j < hi; j++) {
    if (env[j] >= frac * max && env[j] >= env[j - 1] && env[j] >= env[j + 1]) {
      const a = env[j - 1], b = env[j], g = env[j + 1], den = a - 2 * b + g;
      const dj = den < 0 ? 0.5 * (a - g) / den : 0;
      return { idx: j + Math.max(-0.5, Math.min(0.5, dj)), peak: b, snr: max / med };
    }
  }
  return null;
}

// The lobby's schedule. Every phone chirps once per round, in its own slot,
// alternating rising and falling chirps so that a late chirp is not mistaken
// for its neighbour's. Times are the lobby's (server) milliseconds.
export const LOBBY = { slotMs: 300, leadMs: 40, f0: 17000, f1: 19800, dur: 0.01 };
export function slotTime(T0, n, round, slot, L = LOBBY) {
  return T0 + (round * n + slot) * L.slotMs + L.leadMs;
}
export function slotChirp(fs, slot, L = LOBBY) {
  return slot % 2 ? chirp(fs, L.f1, L.f0, L.dur) : chirp(fs, L.f0, L.f1, L.dur);
}
