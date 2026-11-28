// Rhythmicon check (Modulo 11-24). Written before the job runs.
//   node check.mjs --probes        writes probe-7.json and probe-11.json: one partial alone, 4 bars
//   node check.mjs probe-7.wav 7   counts strikes (envelope onsets) and tunes the pitch (autocorrelation),
//                                  with no expected value fed to either; prints them against the claim.
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 36, BAR = 2.0;
const [a, b] = process.argv.slice(2);
if (a === '--probes') {
  for (const n of [7, 11]) {
    const ev = [];
    for (let bar = 0; bar < 4; bar++) for (let j = 0; j < n; j++)
      ev.push({ at: Math.round((bar * BAR + j * BAR / n) * 1e6) / 1e6, dur: Math.round(BAR / n * 0.85 * 1e6) / 1e6, midi: Math.round((BASE + 12 * Math.log2(n)) * 1e6) / 1e6, velocity: 0.25 });
    writeFileSync(`probe-${n}.json`, JSON.stringify({ parts: [{ instrument: 'piano', events: ev }] }));
  }
  process.exit(0);
}
const n = +b, buf = readFileSync(a), SR = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
const len = buf.readUInt32LE(o + 4) / 2 / ch, x = new Float64Array(len);
for (let i = 0; i < len; i++) x[i] = buf.readInt16LE(o + 8 + 2 * i * ch * 1) / 32768;
// strikes: the period of the 5 ms energy envelope, by autocorrelation over 50 ms to 1.5 s (first peak
// within 90% of the best, parabolic), on the first 4 bars. No expected value fed in.
const F = Math.round(SR * 0.005), E = [];
for (let i = 0; i + F <= Math.min(len, 4 * BAR * SR); i += F) { let s = 0; for (let k = 0; k < F; k++) s += x[i + k] ** 2; E.push(Math.sqrt(s)); }
const em = E.reduce((p, q) => p + q, 0) / E.length; for (let i = 0; i < E.length; i++) E[i] -= em;
const ac = []; for (let L = 0; L <= 302; L++) { let p = 0; for (let i = 0; i + L < E.length; i++) p += E[i] * E[i + L]; ac.push(p / (E.length - L)); }
let a0 = 0; for (let L = 10; L <= 300; L++) a0 = Math.max(a0, ac[L]);
let P = 10; for (; P <= 300; P++) if (ac[P] > 0.9 * a0 && ac[P] >= ac[P - 1] && ac[P] >= ac[P + 1]) break;
const dP = (ac[P - 1] - ac[P + 1]) / (2 * (ac[P - 1] - 2 * ac[P] + ac[P + 1]));
const period = (P + dP) * 0.005;
// onsets, only to place the pitch windows: frames over 4x the previous 30 ms mean, 60 ms apart
const on = []; let last = -1e9;
for (let f = 6; f < E.length; f++) { let m = 0; for (let k = 1; k <= 6; k++) m += E[f - k] + em; m /= 6;
  if (E[f] + em > 4 * m && (f - last) * 0.005 > 0.06) { on.push(f * 0.005); last = f; } }
const inBars = on;
// pitch: autocorrelation on 0.1 s after each of the first 8 onsets, 100–1500 Hz, parabolic peak
function pitch(s) {
  const lo = Math.floor(SR / 1500), hi = Math.ceil(SR / 100), m = s.length - hi - 2, r = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let p = 0, e = 0; for (let i = 0; i < m; i++) { p += s[i] * s[i + L]; e += s[i + L] ** 2; } r[L] = p / Math.sqrt(e || 1); }
  let r0 = 0; for (let L = lo; L <= hi; L++) r0 = Math.max(r0, r[L]);
  let L = lo; for (; L <= hi; L++) if (r[L] > 0.9 * r0 && r[L] >= r[L - 1] && r[L] >= r[L + 1]) break;
  const d = (r[L - 1] - r[L + 1]) / (2 * (r[L - 1] - 2 * r[L] + r[L + 1]));
  return SR / (L + d);
}
const hz = inBars.slice(0, 8).map(t => { const i = Math.round((t + 0.02) * SR); return pitch(x.subarray(i, i + Math.round(0.15 * SR) + Math.ceil(SR / 100) + 4)); });
hz.sort((p, q) => p - q); const med = hz[hz.length >> 1];
const midi = 69 + 12 * Math.log2(med / 440), want = BASE + 12 * Math.log2(n), et = Math.round(midi);
console.log(JSON.stringify({ partial: n, strike_period_s: +period.toFixed(4), claim_period_s: +(BAR / n).toFixed(4), strikes_per_bar: +(BAR / period).toFixed(3), claim_per_bar: n,
  hz: +med.toFixed(2), claim_hz: +(440 * 2 ** ((want - 69) / 12)).toFixed(2), cents_vs_score: +((midi - want) * 100).toFixed(1), cents_from_nearest_equal_key: +((midi - et) * 100).toFixed(1), nearest_key_midi: et }));
