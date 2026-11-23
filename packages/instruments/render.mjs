#!/usr/bin/env node
// render.mjs — the physical-modelling piano and classical guitar from clef (mino.mobi), offline, in node.
//
//   node render.mjs <score.json> --out <file.wav> [--mono] [--rate 44100]   render a score to 16-bit WAV
//   node render.mjs --health                                               prove this copy works (seconds)
//
// The instruments are John O'Laughlin's pfsynth (MIT; vendor/LICENSE), compiled to WebAssembly by clef:
// vendor/pfsynth.wasm (a waveguide piano: coupled, detuned strings, a nonlinear felt hammer, a soundboard,
// a room) and vendor/pfguitar.wasm (six modal nylon strings; the guitar picks strings and frets itself),
// with a measured 1971 Contreras guitar body (vendor/bodies/, CC BY 4.0). The piano's host below is
// clef/src/pfsynth.js renderInThread; the guitar's DSP is clef/src/pfguitar.js (lib/pfguitar-core.mjs).
// GUIDE.md says how to write a score. Writes only the --out file.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packGuitar, packTab, renderDry, dress } from './lib/pfguitar-core.mjs';

const HERE = new URL('.', import.meta.url);
export const RATES = [22050, 44100, 48000], MAX_SECONDS = 600, PEAK = 0.89; // −1 dBFS
const PIANO_NOTE_BYTES = 16, PIANO_GAIN = 110; // upstream engine.c's makeup gain

async function load(name) {
  const { instance } = await WebAssembly.instantiate(readFileSync(new URL(`vendor/${name}`, HERE)), {});
  return instance.exports;
}

// Score events → the piano's notes, in samples, sorted (the module admits notes with one forward cursor).
function pianoEvents(events, sr) {
  return [...events].sort((a, b) => a.at - b.at).map((e) => {
    const start = Math.max(0, Math.round(e.at * sr));
    return { start, end: Math.max(start + 1, Math.round((e.at + e.dur) * sr)), midi: e.midi, vel: Math.min(1, Math.max(0.001, e.velocity ?? 0.7)) };
  });
}

/** The piano: interleaved stereo Float32Array. It rings past the last damper until every string is quiet. */
export async function renderPiano(events, sr, { gain = PIANO_GAIN } = {}) {
  const X = await load('pfsynth.wasm'), notes = pianoEvents(events, sr);
  if (notes.length > X.pfw_max_notes()) throw new Error(`too many piano notes (${notes.length} > ${X.pfw_max_notes()})`);
  const dv = new DataView(X.memory.buffer), ptr = X.pfw_notes_ptr();
  let lastEnd = 0;
  notes.forEach((n, i) => {
    const p = ptr + i * PIANO_NOTE_BYTES;
    dv.setInt32(p, n.start, true); dv.setInt32(p + 4, n.end, true); dv.setFloat32(p + 8, n.midi, true); dv.setFloat32(p + 12, n.vel, true);
    lastEnd = Math.max(lastEnd, n.end);
  });
  X.pfw_begin(sr, notes.length, gain);
  const out = X.pfw_out_ptr(), block = X.pfw_block(), cap = Math.ceil(lastEnd + 30 * sr), chunks = [];
  let frames = 0;
  while (frames < cap) {
    const got = X.pfw_render(block);
    chunks.push(new Float32Array(X.memory.buffer, out, got * 2).slice());
    frames += got;
    if (frames >= lastEnd && !X.pfw_active()) break;
  }
  const all = new Float32Array(frames * 2); let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}

/** The guitar: interleaved stereo, body and room applied, peak at −1 dBFS. `tab` (string/fret) or `events` (pitches). */
export async function renderGuitar(part, sr) {
  const X = await load('pfguitar.wasm');
  const packed = part.tab ? packTab(part.tab) : packGuitar({ events: part.events.map((e) => ({ ...e, velocity: e.velocity ?? 0.7 })) });
  const dry = await renderDry(X, packed, sr, { yieldEvery: 1e9 });
  return { stereo: await dress(dry, sr), folded: packed.folded, dropped: packed.dropped };
}

export function checkScore(s) {
  const bad = [], parts = s.parts || (s.instrument ? [s] : []);
  if (!parts.length) bad.push('a score has "parts": [{ "instrument": "piano"|"guitar", "events": [...] }] (or one part at the top level)');
  if (s.rate != null && !RATES.includes(s.rate)) bad.push(`"rate" is one of ${RATES.join(', ')}`);
  parts.forEach((p, i) => {
    if (!['piano', 'guitar'].includes(p.instrument)) bad.push(`part ${i}: "instrument" is "piano" or "guitar"`);
    if (p.tab && p.instrument !== 'guitar') bad.push(`part ${i}: only the guitar takes "tab"`);
    const evs = p.tab || p.events;
    if (!Array.isArray(evs) || !evs.length) bad.push(`part ${i}: "events" (or, for the guitar, "tab") is a non-empty list`);
    else if (!p.tab) evs.forEach((e, j) => { if (!(e.at >= 0) || !(e.dur > 0) || !(e.midi >= 21 && e.midi <= 108) || (e.velocity != null && !(e.velocity > 0 && e.velocity <= 1))) bad.push(`part ${i} event ${j}: at ≥ 0 s, dur > 0 s, midi 21–108 (fractions allowed on the piano), velocity 0–1`); });
    if (p.gain != null && !(p.gain > 0 && p.gain <= 4)) bad.push(`part ${i}: "gain" is above 0, at most 4`);
  });
  const end = Math.max(0, ...parts.flatMap((p) => (p.tab || p.events || []).map((e) => (p.tab ? e.end : e.at + e.dur))));
  if (end > MAX_SECONDS) bad.push(`the last note ends at ${end.toFixed(1)} s; the limit is ${MAX_SECONDS} s`);
  return bad.slice(0, 12);
}

/** A score → { stereo (interleaved Float32Array), rate, report }. Parts are summed, then the mix is peak-normalised to −1 dBFS. */
export async function renderScore(s, { rate } = {}) {
  const bad = checkScore(s); if (bad.length) throw new Error(bad.join('\n'));
  const sr = rate || s.rate || 44100, parts = s.parts || [s], rendered = [], report = { rate: sr, parts: [] };
  for (const p of parts) {
    const t0 = Date.now();
    let stereo, extra = {};
    if (p.instrument === 'piano') stereo = await renderPiano(p.events, sr);
    else { const g = await renderGuitar(p, sr); stereo = g.stereo; extra = { folded_by_octave: g.folded, dropped_from_chords: g.dropped }; }
    rendered.push({ stereo, gain: p.gain ?? 1 });
    report.parts.push({ instrument: p.instrument, notes: (p.tab || p.events).length, seconds: +(stereo.length / 2 / sr).toFixed(2), render_s: +((Date.now() - t0) / 1000).toFixed(1), ...extra });
  }
  const len = Math.max(...rendered.map((r) => r.stereo.length)), mix = new Float32Array(len);
  for (const r of rendered) for (let i = 0; i < r.stereo.length; i++) mix[i] += r.stereo[i] * r.gain;
  let peak = 0, bad2 = 0;
  for (const v of mix) { if (!Number.isFinite(v)) bad2++; else peak = Math.max(peak, Math.abs(v)); }
  if (bad2) throw new Error(`${bad2} samples are not finite`);
  if (!(peak > 0)) throw new Error('the score rendered silence');
  const k = PEAK / peak; for (let i = 0; i < len; i++) mix[i] *= k;
  Object.assign(report, { seconds: +(len / 2 / sr).toFixed(2), peak_before_normalising: +peak.toFixed(4), gain_applied_db: +(20 * Math.log10(k)).toFixed(2) });
  return { stereo: mix, rate: sr, report };
}

/** 16-bit PCM WAV, stereo or (averaged) mono. TPDF dither, seeded, so a render is reproducible byte for byte. */
export function wav(stereo, rate, { mono = false } = {}) {
  const ch = mono ? 1 : 2, frames = stereo.length / 2, data = frames * ch * 2, buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(data, 40);
  let seed = 0x9e3779b9; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let o = 44;
  for (let i = 0; i < frames; i++) {
    const vals = mono ? [(stereo[2 * i] + stereo[2 * i + 1]) / 2] : [stereo[2 * i], stereo[2 * i + 1]];
    for (const v of vals) { const s = Math.round(v * 32767 + (r() - r())); buf.writeInt16LE(Math.max(-32768, Math.min(32767, s)), o); o += 2; }
  }
  return buf;
}

// One second of each instrument: proves the copy loads, renders sound, and writes a WAV.
export async function health() {
  const chord = [60, 64, 67].map((m) => ({ at: 0, dur: 0.6, midi: m, velocity: 0.6 }));
  const { stereo, rate, report } = await renderScore({ parts: [{ instrument: 'piano', events: chord }, { instrument: 'guitar', events: chord }] }, { rate: 22050 });
  const w = wav(stereo, rate);
  if (w.length < 44 + rate * 4 || report.parts.some((p) => !(p.seconds > 0.5))) throw new Error('health: too short');
  return { ok: true, ...report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
  try {
    if (args.includes('--health')) { console.log(JSON.stringify(await health())); process.exit(0); }
    const file = args.find((a) => !a.startsWith('--') && a !== arg('out') && a !== arg('rate')), out = arg('out');
    if (!file || !out) { console.error('usage: node render.mjs <score.json> --out <file.wav> [--mono] [--rate 22050|44100|48000]\n       node render.mjs --health'); process.exit(2); }
    const { stereo, rate, report } = await renderScore(JSON.parse(readFileSync(file, 'utf8')), { rate: arg('rate') ? Number(arg('rate')) : undefined });
    const w = wav(stereo, rate, { mono: args.includes('--mono') });
    writeFileSync(out, w);
    console.log(JSON.stringify({ out, bytes: w.length, channels: args.includes('--mono') ? 1 : 2, ...report }));
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
