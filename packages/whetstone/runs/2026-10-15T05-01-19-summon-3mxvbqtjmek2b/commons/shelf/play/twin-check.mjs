// node shelf/play/twin-check.mjs <abs path to www/jams/rack/wander-wasm.js> [seeds] [phrases]
// Compares the JS twin with the wasm, phrase by phrase, with drift draws interleaved as the page does.
import { walker } from './wander-twin.mjs';
const WD = await import(process.argv[2]);
const b = Buffer.from(WD.WASM_B64, 'base64');
const w = (await WebAssembly.instantiate(b)).instance.exports;
const seeds = +(process.argv[3] || 200), P = +(process.argv[4] || 500); let bad = 0, n = 0;
for (let seed = 1; seed <= seeds; seed++) {
  w.start(seed); const t = walker(seed);
  for (let p = 0; p < P; p++) {
    if (p > 0) { const a = w.draw(3), c = t.draw(3); if (a !== c) bad++; if (a === 0) { if (w.draw(4) !== t.draw(4)) bad++; if (w.draw(7) !== t.draw(7)) bad++; } }
    const k = w.phrase(), m = new Uint8Array(w.memory.buffer, w.buf(), 9 + 2 * k), x = t.phrase();
    const got = [x.key + 64, ...x.bass.map(v => v + 16), ...x.notes.flatMap(([d, l]) => [d + 16, l])];
    if (got.length !== m.length || got.some((v, i) => v !== m[i])) { if (bad++ < 3) console.log('differs', seed, p); }
    n++;
  }
}
console.log(`${n} phrases from ${seeds} seeds, drift draws between: ${bad} differ`);
process.exit(bad ? 1 : 0);
