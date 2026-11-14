// chimera-core.js — drive the CHIMERA voice (vendor/chimera/chimera.wasm) from the studio.
//
// CHIMERA is Jameson Hodge's physical-modelling voice (github.com/jamesondh/chimera-vocal-synth,
// MIT): lungs, vocal folds, a branched vocal tract, lips and nose simulated on a grid, so every
// sound comes out of an airway rather than a filter bank. The module is its own build, unchanged;
// this file is only the host: the JSON call interface (planning, G2P), the 272-byte gesture
// records (a port of upstream src/wasm/wire.ts), and an offline block render.
//
// The two entry points mirror upstream's CLI (crates/chimera-cli/src/render.rs), so a sentence
// rendered here and by `chimera render text` is the same plan on the same engine:
//   say(X, text, {body})             `render text`: CMUdict G2P, the phrase planner, t0 50 ms
//   sing(X, {bpm, lyrics, notes}, …) `render notes`: one syllable per sounding note, rests split phrases
// Both return a pull function like pfsynth-core's begin(): one mono Float32Array block per call,
// null at the end, so a page can start playing before the whole thing is rendered.
//
// No DOM, no Worker API: the browser's worker and node's selftest both use it.

export const GESTURE_RECORD = 272;
export const LAYOUT_VERSION = 1;
export const BLOCK = 4096;               // MAX_RENDER in the wasm
const MAX_SCHEDULE = 4000;               // engine.rs
const LABEL_CAP = 24;
const CONTROL_KEYS = [
  'jaw', 'tbX', 'tbY', 'ttX', 'ttY', 'ttCurl', 'root', 'lipAp', 'lipProt', 'lipWidth', 'labiodental', 'velum', 'larynx', 'epilarynx', 'ventricular', 'lateral', 'dorsum',
  'abduction', 'closure', 'breath', 'f0', 'vibrato',
];
const KEY = Object.fromEntries(CONTROL_KEYS.map((k, i) => [k, i]));
// the body presets (upstream src/ui/body.ts): female 0..1, child 0..1, and render.rs's speaking f0
export const BODIES = { male: [0, 0, 112], female: [1, 0, 205], child: [0, 1, 250] };

export async function instantiate(bytes) {
  const mod = await WebAssembly.compile(bytes);
  if (WebAssembly.Module.imports(mod).length) throw new Error('chimera: the module must not have imports');
  const X = (await WebAssembly.instantiate(mod, {})).exports;
  if (X.chimera_layout_version() !== LAYOUT_VERSION) throw new Error(`chimera: layout ${X.chimera_layout_version()}, this host speaks ${LAYOUT_VERSION}`);
  return X;
}

const enc = new TextEncoder(), dec = new TextDecoder();

/** The engine's JSON interface (crates/chimera-wasm/src/api.rs). Throws on an engine error. */
export function call(X, fn, args = {}) {
  const bytes = enc.encode(JSON.stringify({ fn, ...args }));
  const p = X.chimera_alloc(bytes.length);
  new Uint8Array(X.memory.buffer, p, bytes.length).set(bytes);
  const status = X.chimera_call(p, bytes.length);
  X.chimera_free(p, bytes.length);
  const v = JSON.parse(dec.decode(new Uint8Array(X.memory.buffer, X.chimera_result_ptr(), X.chimera_result_len())));
  if (status !== 0) throw new Error(`chimera ${fn}: ${v.error}`);
  return v;
}

/** Load the pronouncing dictionary (the text of vendor/chimera/cmudict.txt.gz, decompressed). Once per instance. */
export function loadDictionary(X, text) { call(X, 'g2pLoad', { text }); }

function writeGestures(X, h, gestures) {
  const at = X.engine_records(h), n = gestures.length;
  const dv = new DataView(X.memory.buffer, at, n * GESTURE_RECORD), bytes = new Uint8Array(X.memory.buffer, at, n * GESTURE_RECORD);
  bytes.fill(0);
  gestures.forEach((g, i) => {
    const o = i * GESTURE_RECORD;
    [g.t0, g.t1, g.rampIn, g.rampOut, g.strength, g.speed ?? NaN, g.releaseHold ?? NaN, g.tag ?? NaN].forEach((x, j) => dv.setFloat64(o + j * 8, x, true));
    for (let k = 0; k < CONTROL_KEYS.length; k++) dv.setFloat64(o + 64 + k * 8, NaN, true);
    for (const [key, value] of Object.entries(g.targets ?? {})) if (KEY[key] !== undefined && value != null) dv.setFloat64(o + 64 + KEY[key] * 8, value, true);
    if (g.label == null) { bytes[o + 240] = 255; return; }
    let b = enc.encode(g.label);
    if (b.length > LABEL_CAP) { let m = LABEL_CAP; while (m > 0 && (b[m] & 0xc0) === 0x80) m--; b = b.slice(0, m); }
    bytes[o + 240] = b.length; bytes.set(b, o + 241);
  });
}

function schedule(X, h, gestures) {
  for (let i = 0; i < gestures.length; i += MAX_SCHEDULE) {
    const part = gestures.slice(i, i + MAX_SCHEDULE);
    writeGestures(X, h, part);
    X.engine_schedule(h, part.length, 0, 0);
  }
}

// source values, engine_set_source's order: f0, glide, pressure, breathiness, tension, fry,
// roughness, vibratoDepth, vibratoRate, drift, voiced, brightness (NaN: unchanged)
const SOURCE = ['f0', 'glide', 'pressure', 'breathiness', 'tension', 'fry', 'roughness', 'vibratoDepth', 'vibratoRate', 'drift', 'voiced', 'brightness'];
function setSource(X, h, patch) {
  const v = new Float64Array(X.memory.buffer, X.engine_values(h), 32);
  v.fill(NaN);
  SOURCE.forEach((k, i) => { if (patch[k] != null) v[i] = typeof patch[k] === 'boolean' ? +patch[k] : patch[k]; });
  X.engine_set_source(h);
}

function engine(X, sampleRate, body) {
  const b = BODIES[body];
  if (!b) throw new Error(`chimera: unknown body ${body}; have ${Object.keys(BODIES).join(', ')}`);
  const h = X.engine_new(sampleRate);
  X.engine_set_body(h, b[0], b[1]);
  return h;
}

/** A pull function over `frames` samples of handle `h`, freeing it at the end. */
function pull(X, h, frames) {
  let done = 0;
  return () => {
    if (done >= frames) { if (h) { X.engine_free(h); h = 0; } return null; }
    const n = Math.min(BLOCK, frames - done);
    const p = X.engine_render(h, n);
    done += n;
    return new Float32Array(X.memory.buffer, p, n).slice();   // copy: memory may grow
  };
}

/** Speak English text, as `chimera render text` does. Returns { next, seconds, plan }. */
export function say(X, text, { body = 'male', sampleRate = 48000, f0 = BODIES[body]?.[2], tail = 0.3 } = {}) {
  const phrases = call(X, 'g2pPhrases', { text });
  const plan = call(X, 'planPhrases', {
    phrases: phrases.map((p) => ({ segments: p.segments, intonation: p.intonation, pause: p.pause })),
    options: { body, t0: 0.05, f0 },
  });
  const h = engine(X, sampleRate, body);
  setSource(X, h, { f0 });
  schedule(X, h, plan.gestures);
  const seconds = plan.end + tail;
  return { next: pull(X, h, Math.round(sampleRate * seconds)), seconds, plan };
}

/**
 * Sing a melody, as `chimera render notes` does: song = { bpm, lyrics, notes: [[midi, beats], …],
 * vibrato?, t0? } (midi <= 0 is a rest), or `syllables` (IPA onset/nucleus/coda per sounding note)
 * in place of English `lyrics`. Returns { next, seconds, phrases } (each phrase's plan, for cues).
 */
export function sing(X, song, { body = 'male', sampleRate = 48000, tail = 0.4 } = {}) {
  const { bpm, notes } = song, vibrato = song.vibrato ?? 35, beat = 60 / bpm;
  const syl = song.syllables ?? call(X, 'lyricsToSyllables', { text: song.lyrics });
  const sounding = notes.filter((n) => n[0] > 0).length;
  if (syl.length !== sounding) throw new Error(`chimera: ${syl.length} syllables for ${sounding} notes: ${syl.map((s) => s.text).join(' ')}`);
  const first = notes.find((n) => n[0] > 0);
  const h = engine(X, sampleRate, body);
  setSource(X, h, { f0: 440 * 2 ** ((first[0] - 69) / 12), voiced: true, pressure: 9, tension: 0.55 });
  const phrases = [];
  let t = song.t0 ?? 0.3, k = 0, end = 0, start = t, phrase = [];
  const flush = () => {
    if (!phrase.length) return;
    const plan = call(X, 'planSong', { notes: phrase, options: { body, bpm, t0: start, vibrato } });
    schedule(X, h, plan.gestures);
    phrases.push({ t0: start, end: plan.end, plan });
    end = Math.max(end, plan.end);
    phrase = [];
  };
  for (const [midi, beats] of notes) {
    if (midi > 0) { if (!phrase.length) start = t; phrase.push({ midi, beats, syl: syl[k++] }); }
    else flush();
    t += beats * beat;
  }
  flush();
  const seconds = end + tail;
  return { next: pull(X, h, Math.round(sampleRate * seconds)), seconds, phrases };
}

/** Drain a pull function into one Float32Array. */
export function renderAll(next) {
  const parts = []; let n = 0;
  for (let b; (b = next()); ) { parts.push(b); n += b.length; }
  const out = new Float32Array(n); let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
