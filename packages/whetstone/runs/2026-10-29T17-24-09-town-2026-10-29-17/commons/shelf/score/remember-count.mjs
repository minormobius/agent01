// node shelf/score/remember-count.mjs [abs path to www/jams/score/wasm.js]
// Counts generate vs generate2 over seeds 1..100,000: tunes changed, tunes with a leap of a
// fourth or more not answered by a step back, where the unanswered ones are, and invariants.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const f = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../www/jams/score/wasm.js');
const W = (await WebAssembly.instantiate(Buffer.from(fs.readFileSync(f, 'utf8').match(/WASM_B64 = "([^"]+)"/)[1], 'base64'))).instance.exports;
const tune = (fn, s) => { const n = W[fn](s); const m = new Uint8Array(W.memory.buffer, W.buf(), 2 * n); const d = [], L = []; for (let i = 0; i < n; i++) { d.push(m[2*i] - 2); L.push(m[2*i+1]); } return { d, L }; };
const out = { changed: 0, unanswered: { generate: 0, generate2: 0 }, intoG_unanswered: { generate: 0, generate2: 0 }, where_generate2: {}, invariant_fails: 0 };
for (let s = 1; s <= 100000; s++) {
  const a = tune('generate', s), b = tune('generate2', s);
  if (a.d.join() !== b.d.join() || a.L.join() !== b.L.join()) out.changed++;
  for (const [k, t] of [['generate', a], ['generate2', b]]) {
    let e = 0, g = 0; while (e < 28) e += t.L[g++];
    let any = false; const where = new Set(); let t8 = 0;
    for (let j = 0; j < t.d.length - 1; j++) {
      if (j > 0) { const l = t.d[j] - t.d[j-1]; if (Math.abs(l) >= 3 && t.d[j+1] - t.d[j] !== -Math.sign(l)) { any = true; where.add('lands bar ' + (Math.floor(t8 / 8) + 1)); if (j === g) out.intoG_unanswered[k]++; } }
      t8 += t.L[j];
    }
    if (any) out.unanswered[k]++;
    if (k === 'generate2') for (const w of where) out.where_generate2[w] = (out.where_generate2[w] || 0) + 1;
    if (t.L.reduce((x, y) => x + y, 0) !== 64 || t.d.at(-1) !== 0 || t.d[g] !== 4) out.invariant_fails++;
  }
}
console.log(JSON.stringify(out, null, 1));
