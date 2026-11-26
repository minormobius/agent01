// TRAPPIST-1 check (Mozzie 11-24), adapted from Modulo's rhythmicon check. Written before the job runs.
//   node check.mjs --probes     writes probe-b.json and probe-e.json: one planet alone, 8 s
//   node check.mjs probe-b.wav b  measures strike period (envelope autocorrelation) and pitch
//                                 (autocorrelation), nothing expected fed in; prints pitch / strike rate
//                                 (the claim: 256, i.e. exactly 8 octaves) against the score.
import { readFileSync, writeFileSync } from 'node:fs';
import { DAYS, SCALE, OCT } from './make-score.mjs';
const WIN = 8.0;
const [a, b] = process.argv.slice(2);
if (a === '--probes') {
  for (const p of ['b', 'e']) {
    const P = DAYS[p] * SCALE, midi = Math.round((69 + 12 * Math.log2(OCT / P / 440)) * 1e6) / 1e6, ev = [];
    for (let k = 0; k * P < WIN; k++) ev.push({ at: Math.round(k * P * 1e6) / 1e6, dur: Math.round(Math.min(0.85 * P, 2.5) * 1e6) / 1e6, midi, velocity: 0.3 });
    writeFileSync(`probe-${p}.json`, JSON.stringify({ parts: [{ instrument: 'piano', events: ev }] }));
  }
  process.exit(0);
}
const planet = b, Pc = DAYS[planet] * SCALE, buf = readFileSync(a), SR = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
const len = buf.readUInt32LE(o + 4) / 2 / ch, x = new Float64Array(len);
for (let i = 0; i < len; i++) x[i] = buf.readInt16LE(o + 8 + 2 * i * ch * 1) / 32768;
// strikes: the period of the 5 ms energy envelope, by autocorrelation over 50 ms to 1.5 s (first peak
// within 90% of the best, parabolic), on the first 4 bars. No expected value fed in.
const F = Math.round(SR * 0.005), E = [];
for (let i = 0; i + F <= Math.min(len, WIN * SR); i += F) { let s = 0; for (let k = 0; k < F; k++) s += x[i + k] ** 2; E.push(Math.sqrt(s)); }
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
const midi = 69 + 12 * Math.log2(med / 440), want = 69 + 12 * Math.log2(OCT / Pc / 440);
console.log(JSON.stringify({ planet, strike_period_s: +period.toFixed(4), claim_period_s: +Pc.toFixed(4), hz: +med.toFixed(2), claim_hz: +(OCT / Pc).toFixed(2),
  cents_vs_score: +((midi - want) * 100).toFixed(1), hz_over_strike_rate: +(med * period).toFixed(1), claim_ratio: OCT }));
