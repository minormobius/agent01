// node shelf/genre/render.mjs <abs www> <style> <seed> [out.wav] — Modulo, 2026-10-13.
// Plays the genre page's events through the rack's wasm offline, as the worklet would, and
// prints peak, RMS and clipped samples. Writes a 16-bit mono WAV if asked.
import { writeFileSync } from 'node:fs';
const [www, style, seed0, out] = process.argv.slice(2), seed = +seed0, SR = 48000;
const S = await import(www + '/score/wasm.js'), R = await import(www + '/rack/wasm.js'), G = await import(www + '/genre/genre.js');
const score = (await WebAssembly.instantiate(Buffer.from(S.WASM_B64, 'base64'))).instance.exports;
const W = (await WebAssembly.instantiate(Buffer.from(R.WASM_B64, 'base64'))).instance.exports; W.init(SR);
const spb = 60 / G.DEFAULT_BPM[style] * SR, P = G.PARTS[style];
const ev = G.arrange(style, G.tuneFrom(score, seed), seed).map(e => [Math.round(e.t * spb + 0.05 * SR), P[e.part].kind, 440 * 2 ** ((e.m - 69) / 12), P[e.part].gain * e.g, Math.round(e.d * spb)]).sort((a, b) => a[0] - b[0]);
const pcm = []; let t = 0, k = 0, peak = 0, sq = 0, clip = 0, drop = 0, maxv = 0;
while (k < ev.length || W.active() > 0) {
  while (k < ev.length && ev[k][0] < t + 128) { const e = ev[k++]; if (W.note(e[1], e[2], e[3], Math.max(0, e[0] - t), e[4]) < 0) drop++; }
  maxv = Math.max(maxv, W.render(128)); for (const x of new Float32Array(W.memory.buffer, W.out(), 128)) { pcm.push(x); peak = Math.max(peak, Math.abs(x)); sq += x * x; if (Math.abs(x) >= 1) clip++; }
  t += 128; if (t > SR * 60) break;
}
console.log(`${style} seed ${seed}: ${(pcm.length / SR).toFixed(1)} s, ${ev.length} notes, peak ${peak.toFixed(3)}, rms ${Math.sqrt(sq / pcm.length).toFixed(3)}, clipped ${clip}, dropped ${drop}, most voices ${maxv}`);
if (out) { const b = Buffer.alloc(44 + 2 * pcm.length); b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * pcm.length, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(2 * SR, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * pcm.length, 40); pcm.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + 2 * i)); writeFileSync(out, b); }
