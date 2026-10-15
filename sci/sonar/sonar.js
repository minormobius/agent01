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
