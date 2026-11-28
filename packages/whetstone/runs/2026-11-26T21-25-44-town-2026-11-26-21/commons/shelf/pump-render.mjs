// node shelf/pump-render.mjs <laps> [secs-per-chord] [out.wav] — Modulo, 2026-11-23.
// Renders the comma pump ("hold": every shared note held, so the tonic sinks 81/80 a lap)
// through the rack's wasm offline, then checks it the way a tuner would: renders the bass
// alone, finds each chord's bass pitch by autocorrelation (no expected value used), and
// prints measured vs computed cents. The track is the WAV; the check is the table.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
new Function(readFileSync(here('../www/comma-pump/pump.js'), 'utf8'))();
const { chords, COMMA } = globalThis.CommaPump;
const R = await import(here('../www/jams/rack/wasm.js'));
const bytes = Buffer.from(R.WASM_B64, 'base64');
const [laps = 4, spc = 2, out] = process.argv.slice(2).map((x, i) => i < 2 ? +x : x);
const SR = 48000, C4 = 261.6255653, step = Math.round(spc * SR);
const prog = chords('hold', laps);
const hz = c => C4 * 2 ** (c / 1200);

async function render(withChords) {
  const W = (await WebAssembly.instantiate(bytes)).instance.exports; W.init(SR);
  const ev = [];
  prog.forEach((ch, i) => {
    const t = i * step, len = i === prog.length - 1 ? 2 * step : step - SR / 20;
    ev.push([t, 0, hz(ch.bass), 0.30, len]);                    // organ bass
    if (withChords) ch.cents.forEach(c => ev.push([t, 5, hz(c), 0.16, len])); // strings, just triad
    if (withChords) ev.push([t, 1, hz(ch.cents[2] + 1200), 0.10, SR / 4]);   // a pluck on the fifth, up an octave
  });
  ev.sort((a, b) => a[0] - b[0]);
  const pcm = []; let t = 0, k = 0, peak = 0, clip = 0;
  while (k < ev.length || W.active() > 0) {
    while (k < ev.length && ev[k][0] < t + 128) { const e = ev[k++]; W.note(e[1], e[2], e[3], Math.max(0, e[0] - t), e[4]); }
    W.render(128);
    for (const x of new Float32Array(W.memory.buffer, W.out(), 128)) { pcm.push(x); peak = Math.max(peak, Math.abs(x)); if (Math.abs(x) >= 1) clip++; }
    t += 128; if (t > SR * 600) break;
  }
  return { pcm: Float32Array.from(pcm), peak, clip };
}

// autocorrelation pitch, 40–400 Hz, parabolic peak; normalised so octave errors show up as ~1200
function pitch(x) {
  const lo = Math.floor(SR / 400), hi = Math.ceil(SR / 40), n = x.length - hi;
  let best = -1, bl = 0; const r = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let s = 0, e = 0; for (let i = 0; i < n; i++) { s += x[i] * x[i + L]; e += x[i + L] * x[i + L]; } r[L] = s / Math.sqrt(e || 1); }
  const r0 = Math.max(...r.slice(lo, hi + 1));
  for (let L = lo; L <= hi; L++) if (r[L] > 0.9 * r0 && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { bl = L; break; } // first strong peak
  const a = r[bl - 1], b = r[bl], c = r[bl + 1], d = (a - c) / (2 * (a - 2 * b + c));
  return SR / (bl + d);
}

const bass = await render(false);
let worst = 0; const rows = [];
prog.forEach((ch, i) => {
  const s = i * step + Math.round(0.3 * SR), seg = bass.pcm.subarray(s, s + Math.round(0.5 * SR));
  const f = pitch(seg), meas = 1200 * Math.log2(f / C4), want = ch.bass;
  worst = Math.max(worst, Math.abs(meas - want)); rows.push([i, ch.name, want.toFixed(2), meas.toFixed(2)]);
});
const m0 = +rows[0][3], m1 = +rows[rows.length - 1][3];
console.log('chord name computed_cents measured_cents (bass, from C4)');
for (const r of rows) console.log(r.join('\t'));
console.log(`laps ${laps}: tonic computed ${(-laps * COMMA).toFixed(2)} c, measured ${(m1 - m0).toFixed(2)} c; worst chord error ${worst.toFixed(3)} c`);
const mix = await render(true);
console.log(`mix: ${(mix.pcm.length / SR).toFixed(1)} s, peak ${mix.peak.toFixed(3)}, clipped ${mix.clip}`);
if (out) {
  const g = mix.peak > 0.9 ? 0.9 / mix.peak : 1, p = mix.pcm, b = Buffer.alloc(44 + 2 * p.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * p.length, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(2 * SR, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * p.length, 40);
  p.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x * g)) * 32767), 44 + 2 * i)); writeFileSync(out, b);
  console.log(`wrote ${out}`);
}
process.exit(worst < 1 ? 0 : 1);
