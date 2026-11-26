// Convergence check (Modulo 11-24). Written before the job runs.
//   node check.mjs score.json [convergence.wav]
// Score: (1) how many notes start at the same instant, and when (most voices at once);
//        (2) is the onset pattern a palindrome about that instant; (3) is every pitch a whole multiple
//        of C1/8 = 4.0879 Hz (within float32 midi rounding).  None of T, the voice list or the unit is read
//        from the score's own header: they are recomputed from the events.
// Audio: the biggest 5-ms attack in the file (rise of RMS from one window to the next), found with no
//        expected time fed in, and RMS in 10-s windows (the density arch).
import { readFileSync } from 'node:fs';
const [sf, wf] = process.argv.slice(2);
const ev = JSON.parse(readFileSync(sf, 'utf8')).parts[0].events;
const by = new Map(); for (const e of ev) by.set(e.at, (by.get(e.at) || 0) + 1);
const [T, n] = [...by].sort((a, b) => b[1] - a[1])[0];
console.log(`onsets: ${ev.length} notes, ${by.size} distinct times; most at once: ${n} notes at ${T} s`);
const times = [...by.keys()].sort((a, b) => a - b);
const unmatched = times.filter((t) => { const m = 2 * T - t; let lo = 0, hi = times.length - 1; while (lo < hi) { const k = (lo + hi) >> 1; if (times[k] < m) lo = k + 1; else hi = k; } return !([times[lo], times[lo - 1]].some((x) => x != null && Math.abs(x - m) < 1e-5)); }).length;
console.log(`palindrome about ${T} s: ${times.length - unmatched}/${times.length} onset times have a mirror (to 10 µs)`);
const unit = 440 * 2 ** ((24 - 69) / 12) / 8;
let worst = 0; const hs = new Set();
for (const e of ev) { const f = 440 * 2 ** ((Math.fround(e.midi) - 69) / 12), h = f / unit; hs.add(Math.round(h)); worst = Math.max(worst, Math.abs(1200 * Math.log2(h / Math.round(h)))); }
console.log(`pitches: every one is k × ${unit.toFixed(4)} Hz, k in ${Math.min(...hs)}..${Math.max(...hs)} (${hs.size} distinct); worst error ${worst.toFixed(5)} c`);
const chord = ev.filter((e) => e.at === T).map((e) => Math.round(440 * 2 ** ((Math.fround(e.midi) - 69) / 12) / unit)).sort((a, b) => a - b);
console.log(`chord at ${T} s, in units of C1/8: ${chord.join(' ')}`);
if (wf) {
  const buf = readFileSync(wf), SR = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
  let o = 12; while (buf.toString('ascii', o, o + 4) !== 'data') o += 8 + buf.readUInt32LE(o + 4);
  const len = buf.readUInt32LE(o + 4) / 2 / ch, W = Math.round(SR * 0.005), rms = [];
  for (let i = 0; i + W <= len; i += W) { let s = 0; for (let j = 0; j < W; j++) { const v = buf.readInt16LE(o + 8 + 2 * (i + j) * ch) / 32768; s += v * v; } rms.push(Math.sqrt(s / W)); }
  let best = 1; for (let i = 1; i < rms.length; i++) if (rms[i] - rms[i - 1] > rms[best] - rms[best - 1]) best = i;
  console.log(`audio: ${(len / SR).toFixed(2)} s at ${SR} Hz; biggest 5-ms attack at ${(best * W / SR).toFixed(3)} s (rise ${(rms[best] - rms[best - 1]).toFixed(4)})`);
  const per = Math.round(10 / 0.005), arch = [];
  for (let i = 0; i < rms.length; i += per) { const w = rms.slice(i, i + per); arch.push(Math.sqrt(w.reduce((a, b) => a + b * b, 0) / w.length).toFixed(3)); }
  console.log(`RMS per 10 s: ${arch.join(' ')}`);
}
