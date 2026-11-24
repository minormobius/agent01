// node check.mjs score.json bass.wav — Modulo, 2026-11-23. The tuner, written before the render.
// bass.wav is the score's bass line alone (make it with --bass-score). Each chord's bass pitch is
// found by autocorrelation (35–500 Hz, first strong peak, parabolic), with no expected value fed in,
// and printed against what the score asked for, in cents from C4.
import { readFileSync, writeFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
const score = JSON.parse(readFileSync(a, 'utf8'));
const bass = score.parts[0].events.filter(e => e.velocity === 0.6);   // the bass voice is struck at 0.6
if (b === '--bass-score') { writeFileSync('bass-score.json', JSON.stringify({ parts: [{ instrument: 'piano', events: bass }] })); process.exit(0); }
const buf = readFileSync(b), SR = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
const n = buf.readUInt32LE(o + 4) / 2 / ch, x = new Float64Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(o + 8 + 2 * i * ch);
function pitch(s) {
  const lo = Math.floor(SR / 500), hi = Math.ceil(SR / 35), m = s.length - hi - 2, r = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let p = 0, e = 0; for (let i = 0; i < m; i++) { p += s[i] * s[i + L]; e += s[i + L] * s[i + L]; } r[L] = p / Math.sqrt(e || 1); }
  let r0 = 0; for (let L = lo; L <= hi; L++) r0 = Math.max(r0, r[L]);
  let bl = 0; for (let L = lo; L <= hi; L++) if (r[L] > 0.9 * r0 && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { bl = L; break; }
  const p = r[bl - 1], q = r[bl], u = r[bl + 1]; return SR / (bl + (p - u) / (2 * (p - 2 * q + u)));
}
const C4 = 440 * 2 ** (-9 / 12), rows = []; let worst = 0;
for (const e of bass) {
  const s = Math.round((e.at + 0.3) * SR), seg = x.subarray(s, s + Math.round(1.0 * SR));
  const meas = 1200 * Math.log2(pitch(seg) / C4), want = (e.midi - 60) * 100;
  worst = Math.max(worst, Math.abs(meas - want)); rows.push([e.at, want.toFixed(2), meas.toFixed(2), (meas - want).toFixed(3)]);
}
console.log('at_s\tasked_c\tmeasured_c\terror_c   (bass, cents from C4)');
for (const r of rows) console.log(r.join('\t'));
const cs = rows.filter((r, i) => i % 4 === 0), f = cs[0], l = cs[cs.length - 1];
console.log(`first C ${f[2]} c, last C ${l[2]} c: measured fall ${(l[2] - f[2]).toFixed(2)} c, asked ${(l[1] - f[1]).toFixed(2)} c; worst chord error ${worst.toFixed(3)} c over ${rows.length} chords`);
// The fall per lap, fitted over every bass note (least squares of measured − lap-0 pitch against lap):
// one note can be a few cents off on a real piano; 224 of them pin the slope.
const pts = rows.slice(0, -1).map((r, i) => [Math.floor(i / 4), r[2] - rows[i % 4][1]]);
const N = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / N, my = pts.reduce((s, p) => s + p[1], 0) / N;
let sxy = 0, sxx = 0; for (const [u, v] of pts) { sxy += (u - mx) * (v - my); sxx += (u - mx) ** 2; }
const slope = sxy / sxx, res = pts.map(([u, v]) => v - my - slope * (u - mx)), se = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (N - 2) / sxx);
console.log(`fitted fall per lap ${slope.toFixed(3)} ± ${se.toFixed(3)} c (asked ${(-1200 * Math.log2(81 / 80)).toFixed(3)}); over 56 laps ${(56 * slope).toFixed(2)} ± ${(56 * se).toFixed(2)} c`);
