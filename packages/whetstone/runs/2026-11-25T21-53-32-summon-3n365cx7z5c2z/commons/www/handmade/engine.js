// engine.js — the render job's piano and guitar, in a browser (Morphyx, 2026-11-24).
// A port of engines/instruments/render.mjs: the same wasm bytes (bins.js), the same note packing, the same
// mix, the same −1 dBFS normalising and the same seeded dither, writing the same 16-bit WAV. Changes, all
// of them: the wasm comes from base64 instead of disk, the WAV is written with a DataView instead of
// node's Buffer, and the CLI is gone. selftest.mjs renders the same scores both ways and compares sha256.
import { PIANO_B64, GUITAR_B64 } from './bins.js';
import { packGuitar, packTab, renderDry, dress } from './guitar.js';

export const RATES = [22050, 44100, 48000], MAX_SECONDS = 600, PEAK = 0.89;
const PIANO_NOTE_BYTES = 16, PIANO_GAIN = 110;
const unb64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const BYTES = { 'pfsynth.wasm': unb64(PIANO_B64), 'pfguitar.wasm': unb64(GUITAR_B64) };

async function load(name) {
  const { instance } = await WebAssembly.instantiate(BYTES[name], {});
  return instance.exports;
}

function pianoEvents(events, sr) {
  return [...events].sort((a, b) => a.at - b.at).map((e) => {
    const start = Math.max(0, Math.round(e.at * sr));
    return { start, end: Math.max(start + 1, Math.round((e.at + e.dur) * sr)), midi: e.midi, vel: Math.min(1, Math.max(0.001, e.velocity ?? 0.7)) };
  });
}

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

/** 16-bit PCM WAV as a Uint8Array: render.mjs's wav(), byte for byte, with a DataView for node's Buffer. */
export function wav(stereo, rate, { mono = false } = {}) {
  const ch = mono ? 1 : 2, frames = stereo.length / 2, data = frames * ch * 2, buf = new Uint8Array(44 + data), dv = new DataView(buf.buffer);
  const str = (s, o) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str('RIFF', 0); dv.setUint32(4, 36 + data, true); str('WAVE', 8); str('fmt ', 12);
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str('data', 36); dv.setUint32(40, data, true);
  let seed = 0x9e3779b9; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let o = 44;
  for (let i = 0; i < frames; i++) {
    const vals = mono ? [(stereo[2 * i] + stereo[2 * i + 1]) / 2] : [stereo[2 * i], stereo[2 * i + 1]];
    for (const v of vals) { const s = Math.round(v * 32767 + (r() - r())); dv.setInt16(o, Math.max(-32768, Math.min(32767, s)), true); o += 2; }
  }
  return buf;
}

export async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
