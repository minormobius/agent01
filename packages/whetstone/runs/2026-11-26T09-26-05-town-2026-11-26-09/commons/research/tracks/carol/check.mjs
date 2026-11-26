// Reads a mono 16-bit WAV and finds where the hook's held note sits: in each chorus, "Hold the note, hold the note"
// holds one G5 across a change of chord (G to C), at bars 1-2 and again at bars 5-6. Each window (0.05 s after the
// note starts to 2.05 s later) is Hann-windowed and scanned 715-860 Hz (G5 +-160 c) in 0.1-Hz steps; it prints the
// strongest peak and its cents from equal-tempered G5 (783.99 Hz). No expected value is fed in.
// Usage: node check.mjs carol.wav
import fs from 'fs';
const b = fs.readFileSync(process.argv[2]); const sr = b.readUInt32LE(24);
let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
const n = b.readUInt32LE(o + 4) / 2, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i);
const choruses = [['chorus 1', 18], ['chorus 2', 48], ['chorus 3', 72]];
for (const [name, t] of choruses) for (const [hook, dt] of [['bars 1-2', 0.75], ['bars 5-6', 6.75]]) {
  const a = Math.floor((t + dt + 0.05) * sr), L = Math.floor(2.0 * sr);
  let best = [0, 0];
  for (let f = 715; f <= 860; f += 0.1) { let re = 0, im = 0; const w = 2 * Math.PI * f / sr;
    for (let i = 0; i < L; i++) { const s = x[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / L)); re += s * Math.cos(w * i); im -= s * Math.sin(w * i); }
    const m = Math.hypot(re, im); if (m > best[1]) best = [f, m]; }
  console.log(name, hook, 'peak', best[0].toFixed(1), 'Hz', (1200 * Math.log2(best[0] / 783.991)).toFixed(1), 'c from equal G5');
}
