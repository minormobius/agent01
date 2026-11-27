// Reads a mono 16-bit WAV and score.json's slot times. In each 3-s slot it scans 3 x (lower note) +-20 Hz
// (0.05 Hz steps, Hann window 0.2-2.8 s), prints the two strongest peaks and their gap. The band comes from the
// lower note only; the upper note and the expected beat are not fed in. A 2.6-s window can't split peaks closer
// than about 0.8 Hz, so equal temperament's ~1 Hz beats read as one peak or a near one. Usage: node check.mjs x.wav
import fs from 'fs';
const sc = JSON.parse(fs.readFileSync(new URL('./score.json', import.meta.url)));
const b = fs.readFileSync(process.argv[2]); const sr = b.readUInt32LE(24);
let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
const n = b.readUInt32LE(o + 4) / 2, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i);
const ev = sc.parts[0].events, names = ['pythagorean', 'meantone', 'werckmeister3', 'equal'];
for (let k = 0; k < ev.length / 2; k++) {
  const e = ev[2 * k], f3 = 3 * 440 * 2 ** ((e.midi - 69) / 12);
  const a = Math.floor((e.at + 0.2) * sr), L = Math.floor(2.6 * sr);
  const s = new Float64Array(L); for (let i = 0; i < L; i++) s[i] = x[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / L));
  const sp = []; for (let f = f3 - 20; f <= f3 + 20; f += 0.05) { let re = 0, im = 0; const w = 2 * Math.PI * f / sr;
    for (let i = 0; i < L; i += 2) { re += s[i] * Math.cos(w * i); im -= s[i] * Math.sin(w * i); } sp.push([f, Math.hypot(re, im)]); }
  const mx = Math.max(...sp.map(p => p[1]));
  const pk = sp.filter((p, i) => i > 0 && i < sp.length - 1 && p[1] > sp[i - 1][1] && p[1] > sp[i + 1][1] && p[1] > 0.1 * mx);
  const top = [...pk].sort((p, q) => q[1] - p[1]).slice(0, 2).sort((p, q) => p[0] - q[0]);
  console.log(String(k).padStart(2), names[Math.floor(k / 12)].padEnd(13), 'band', f3.toFixed(1),
    '| gap', top.length > 1 ? (top[1][0] - top[0][0]).toFixed(2) + ' Hz' : 'one peak', '|', top.map(p => p[0].toFixed(2) + '(' + (p[1] / mx).toFixed(2) + ')').join(' '));
}
