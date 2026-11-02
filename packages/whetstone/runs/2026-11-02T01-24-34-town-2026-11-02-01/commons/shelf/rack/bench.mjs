// node shelf/rack/bench.mjs <abs path to rack.wasm or www/jams/rack/wasm.js>
// How many voices fit in one core in real time, per instrument, at 48 kHz in 128-sample blocks.
// Also the organ and the pluck written again in plain JS, the same arithmetic, to price the language.
import { readFileSync } from 'node:fs';
const p = process.argv[2];
let bytes = p.endsWith('.js') ? Buffer.from((await import(p)).WASM_B64, 'base64') : readFileSync(p);
const { instance } = await WebAssembly.instantiate(bytes); const W = instance.exports;
const SR = 48000, SEC = 5, B = 128, NAMES = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
function wasmRun(kind, n) {
  W.init(SR);
  for (let i = 0; i < n; i++) W.note(kind, 110 * 2 ** (i / 12 % 3), 0.01, 0, SR * SEC);
  const t0 = performance.now(); let vs = 0;
  for (let b = 0; b < SR * SEC / B; b++) vs += W.render(B) * B;
  return [(performance.now() - t0) / 1000, vs / SR];
}
// JS twins (organ, pluck)
const TBL = 4096, SINE = new Float32Array(TBL); for (let i = 0; i < TBL; i++) SINE[i] = Math.sin(i / TBL * 2 * Math.PI);
const sinT = x => { const p = (x - Math.floor(x)) * TBL, i = p | 0, f = p - i; const a = SINE[i & 4095], b = SINE[(i + 1) & 4095]; return a + (b - a) * f; };
function jsRun(kind, n) {
  const vs = []; for (let i = 0; i < n; i++) { const f = 110 * 2 ** (i / 12 % 3); const L = Math.floor(SR / f);
    vs.push({ f, p: 0, age: 0, env: 0, line: Float32Array.from({ length: L }, () => Math.random() * 2 - 1), j: 0 }); }
  const out = new Float32Array(B); const t0 = performance.now();
  for (let b = 0; b < SR * SEC / B; b++) { out.fill(0);
    for (const v of vs) for (let i = 0; i < B; i++) {
      let s;
      if (kind === 0) { const t = v.age / SR; const a = t < 0.005 ? t / 0.005 : 1; v.p += v.f / SR; if (v.p >= 1) v.p -= 1;
        s = a * (sinT(v.p) + 0.5 * sinT(2 * v.p) + 0.25 * sinT(3 * v.p)) * 0.5; }
      else { const j = v.j, nx = j + 1 >= v.line.length ? 0 : j + 1, y = v.line[j]; v.line[j] = (y + v.line[nx]) * 0.5 * 0.996; v.j = nx; s = y * 0.8; }
      v.age++; out[i] += s * 0.01; }
    for (let i = 0; i < B; i++) out[i] = Math.max(-1, Math.min(1, out[i])); }
  return (performance.now() - t0) / 1000;
}
const N = 64;
console.log(`${N} voices held for ${SEC} s of audio at ${SR} Hz, ${B}-sample blocks; "x real time" = audio seconds per CPU second for all ${N} together`);
// best of 5 runs; "voices per core" = voice-seconds rendered per CPU second (a percussive voice counts only while it sounds)
const best = f => { let b = [Infinity]; for (let r = 0; r < 5; r++) { const x = f(); if (x[0] < b[0]) b = x; } return b; };
for (let k = 0; k < NAMES.length; k++) { const [s, vsec] = best(() => wasmRun(k, N));
  console.log(`wasm ${NAMES[k].padEnd(8)} ${(s * 1000).toFixed(0).padStart(4)} ms for ${vsec.toFixed(0).padStart(3)} voice-s  ≈ ${Math.floor(vsec / s)} voices per core`); }
for (const k of [0, 1]) { const [s] = best(() => [jsRun(k, N)]);
  console.log(`js   ${NAMES[k].padEnd(8)} ${(s * 1000).toFixed(0).padStart(4)} ms for ${N * SEC} voice-s  ≈ ${Math.floor(N * SEC / s)} voices per core`); }
