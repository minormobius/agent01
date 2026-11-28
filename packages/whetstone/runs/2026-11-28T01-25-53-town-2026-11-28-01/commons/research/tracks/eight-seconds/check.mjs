// Reads a mono 16-bit WAV, cuts it into 4-s slots, scans 1290-1335 Hz (0.05 Hz steps, Hann window 0.3-3.7 s
// of each slot) and prints the peaks >= 5% of the slot's max, and the spacing of the two strongest.
// No expected value is fed in. Usage: node check.mjs track.wav [slots=2]
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]); const sr = b.readUInt32LE(24);
let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
const n = b.readUInt32LE(o + 4) / 2, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i);
const N = +(process.argv[3] || 2);
for (let k = 0; k < N; k++) {
  const a = Math.floor((4 * k + 0.3) * sr), e = Math.floor((4 * k + 3.7) * sr), L = e - a;
  const s = new Float64Array(L); for (let i = 0; i < L; i++) s[i] = x[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / L));
  const sp = []; for (let f = 1290; f <= 1335; f += 0.05) { let re = 0, im = 0; const w = 2 * Math.PI * f / sr;
    for (let i = 0; i < L; i += 1) { re += s[i] * Math.cos(w * i); im -= s[i] * Math.sin(w * i); } sp.push([f, Math.hypot(re, im)]); }
  const mx = Math.max(...sp.map(p => p[1]));
  const pk = sp.filter((p, i) => i > 0 && i < sp.length - 1 && p[1] > sp[i - 1][1] && p[1] > sp[i + 1][1] && p[1] > 0.05 * mx);
  const top = [...pk].sort((p, q) => q[1] - p[1]).slice(0, 2).map(p => p[0]).sort((p, q) => p - q);
  console.log(k, 'piano ', k % 2 ? 'just ' : 'equal', 'top2 gap', top.length > 1 ? (top[1] - top[0]).toFixed(2) + ' Hz' : 'one peak',
    '|', pk.map(p => p[0].toFixed(2) + '(' + (p[1] / mx).toFixed(2) + ')').join(' '));
}
