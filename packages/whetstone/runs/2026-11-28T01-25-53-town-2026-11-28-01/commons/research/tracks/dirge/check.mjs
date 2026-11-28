// Reads a mono 16-bit WAV of The Bell Stays and finds, on the first bar of each lap and in the coda (where the bell
// and the band's Am both hold an A3), the three strongest distinct spectral peaks between 195 and 228 Hz, each with its size
// against the strongest. The bell is the line that stays put; the band's A3 is the one a comma lower
// each lap. Each window runs 0.15 s to 3.15 s after the downbeat, Hann-windowed, scanned in 0.05-Hz steps. No expected value is fed in; peaks closer than 1.2 Hz count as one.
// Usage: node check.mjs dirge.wav
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]); const sr = b.readUInt32LE(24);
let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
const n = b.readUInt32LE(o + 4) / 2, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i);
const BAR = 4.8, at = [['lap 1', 1], ['lap 2', 5], ['lap 3', 9], ['lap 4', 13], ['lap 5', 17], ['coda', 21]];
for (const [name, bar] of at) {
  const a = Math.floor((bar * BAR + 0.15) * sr), L = Math.floor(3.0 * sr), win = new Float64Array(L);
  for (let i = 0; i < L; i++) win[i] = x[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / L));
  const sp = [];
  for (let f = 195; f <= 228; f += 0.05) { let re = 0, im = 0; const w = 2 * Math.PI * f / sr;
    for (let i = 0; i < L; i++) { re += win[i] * Math.cos(w * i); im -= win[i] * Math.sin(w * i); }
    sp.push([f, Math.hypot(re, im)]); }
  const pk = sp.filter((s, i) => i > 0 && i < sp.length - 1 && s[1] > sp[i - 1][1] && s[1] >= sp[i + 1][1]).sort((u, v) => v[1] - u[1]);
  const top = [pk[0]]; for (const q of pk) if (top.length < 3 && top.every(t => Math.abs(q[0] - t[0]) > 1.2)) top.push(q);
  console.log(name, 'peaks', top.map(q => q[0].toFixed(2) + ' Hz (' + (q[1] / top[0][1]).toFixed(2) + ')').join(', '));
}
