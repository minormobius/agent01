// node shelf/rack/selftest.mjs [abs path to www/jams/rack/wasm.js]  — checks the rack's promises from its bytes.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const p = process.argv[2] || fileURLToPath(new URL('../../www/jams/rack/wasm.js', import.meta.url));
const M = await import(p); const bytes = Buffer.from(M.WASM_B64, 'base64');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
ok(createHash('sha256').update(bytes).digest('hex') === M.WASM_SHA, 'bytes match the stamped sha256');
const W = (await WebAssembly.instantiate(bytes)).instance.exports; const SR = 48000;
const block = n => Float32Array.from(new Float32Array(W.memory.buffer, W.out(), n));
for (let k = 0; k < 6; k++) {
  W.init(SR); W.note(k, 220, 0.5, 40, SR / 4); const a = block(0); W.render(128); const b = block(128);
  ok(b.slice(0, 40).every(x => x === 0) && b.slice(40).some(x => x !== 0), `kind ${k}: silent before its sample (40), sounding from it`);
  let peak = 0, finite = true, n = 0; for (; n < SR * 6 / 128 && W.active() > 0; n++) { W.render(128); for (const x of block(128)) { finite &&= Number.isFinite(x); peak = Math.max(peak, Math.abs(x)); } }
  ok(finite && peak <= 1 && peak > 0.01, `kind ${k}: finite, within ±1, audible (peak ${peak.toFixed(3)})`);
  ok(W.active() === 0, `kind ${k}: frees its voice after release (${(n * 128 / SR).toFixed(2)} s)`);
}
W.init(SR); let got = 0; for (let i = 0; i < 200; i++) if (W.note(0, 440, 0.001, 0, SR) >= 0) got++;
ok(got === 192, `pool takes 192 voices, then refuses (took ${got})`);
ok(W.note(0, 440, 0.001, 0, SR) === -1, 'a note with no free voice returns -1 (dropped, never late)');
W.init(SR); W.note(1, 5, 0.5, 0, 100); W.render(128); ok(Number.isFinite(block(128)[0]), 'pluck below the delay line clamps instead of overrunning');
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
