// node shelf/wander/count.mjs [abs path to www/rack/wander-wasm.js] [phrases=1000000] [seed=1]
// Checks the wander's promises from the page's own bytes, and counts how much of it repeats.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const p = process.argv[2] || fileURLToPath(new URL('../../www/rack/wander-wasm.js', import.meta.url));
const N = +(process.argv[3] || 1e6), seed = +(process.argv[4] || 1);
const M = await import(p); const bytes = Buffer.from(M.WASM_B64, 'base64');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
ok(createHash('sha256').update(bytes).digest('hex') === M.WASM_SHA, 'bytes match the stamped sha256');
const W = (await WebAssembly.instantiate(bytes)).instance.exports;
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const pitch = (k, d) => 60 + k + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
W.start(seed);
const seen = new Map(); let dup = 0, worstSeam = 0, bad = 0, badLen = 0, lo = 999, hi = 0, turns = 0, prevKey = 0, prevLast = null, out = 0;
const keys = new Set(), states = new Set(); let stateDup = 0; const seams = {}, leaps = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const n = W.phrase(), m = new Uint8Array(W.memory.buffer, W.buf(), 9 + 2 * n);
  const key = m[0] - 64; keys.add(key); if (i && key !== prevKey) turns++;
  let len = 0; const ps = [];
  for (let j = 0; j < n; j++) { const d = m[9 + 2 * j] - 16; if (d < -2 || d > 9) out++; ps.push(pitch(key, d)); len += m[10 + 2 * j]; }
  if (len !== 64) badLen++;
  for (let j = 1; j < ps.length; j++) { const L = Math.abs(ps[j] - ps[j - 1]); leaps[L] = (leaps[L] || 0) + 1; if (L > 12) bad++; }
  if (prevLast !== null) { const s = Math.abs(ps[0] - prevLast); seams[s] = (seams[s] || 0) + 1; worstSeam = Math.max(worstSeam, s); }
  prevLast = ps[ps.length - 1]; prevKey = key;
  for (const x of ps) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  const h = createHash('md5').update(Buffer.from(ps)).update(Buffer.from(m.slice(9).filter((_, j) => j % 2))).digest('hex');
  if (seen.has(h)) dup++; else seen.set(h, i);
  if (i < 200000) { const st = W.state_hi() + ':' + W.state_lo(); if (states.has(st)) stateDup++; states.add(st); }
}
ok(badLen === 0, `every phrase is 8 bars of eighths (${badLen} not)`);
ok(out === 0, `every note's degree stays in -2..9 of its key (${out} outside)`);
ok(bad === 0, `no leap inside a phrase wider than an octave (${bad})`);
ok(worstSeam <= 7, `no seam between phrases wider than a fifth (widest ${worstSeam} semitones)`);
ok(stateDup === 0, `the random state never recurs in the first ${Math.min(N, 200000).toLocaleString()} phrases (period 2^64 - 1 draws)`);
console.log(`\n${N.toLocaleString()} phrases from seed ${seed} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`distinct phrases (pitches + rhythm): ${seen.size.toLocaleString()}; phrases that had sounded before: ${dup.toLocaleString()} (${(100 * dup / N).toFixed(2)}%)`);
console.log(`key turns: ${turns.toLocaleString()} (one phrase in ${(N / turns).toFixed(2)}); keys visited: ${[...keys].sort((a, b) => a - b).join(' ')} (semitones from C)`);
console.log(`leaps inside phrases (semitones: count): ${Object.entries(leaps).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join(" ")}`);
console.log(`range: midi ${lo}..${hi}; seam sizes (semitones: count): ${Object.entries(seams).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(' ')}`);
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
