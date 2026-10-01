// pfguitar.js — the physical-modelling classical guitar: render it, then play it.
//
// John O'Laughlin's pfsynth guitar (MIT, vendored under vendor/pfsynth/: core/pf_pluck and
// host/pf_guitar, unmodified), compiled to its own module, pfguitar.wasm, behind our host
// pf_guitar_web.c. Six modelled nylon strings: each note is a pluck at a point on a string, the
// guitar chooses strings and frets itself (a search over hand positions), and a string rings
// until a hand would stop it — played again, its finger needed elsewhere, or a clash.
//
// It renders the strings' BRIDGE FORCE, which is not yet a guitar sound. Upstream's own demo
// gets the instrument by convolving that with a measured guitar body and then a room, and so do
// we (`dress` below): Manuel Contreras's 1971 guitar, measured by Robert Mores (Zenodo 4604577,
// CC BY 4.0, vendor/pfsynth/bodies/), and upstream's statistical "small studio" room.
//
// A score here was usually not written for a guitar, so `packGuitar` makes it playable rather
// than refusing it, and says what it did: notes outside E2–B5 fold in by octaves, and a chord of
// more than six notes keeps six (the outer two and an even spread between), because a guitar
// has six strings. Rendering, caching and playback are pfsynth.js's ModelPlayer: same wait, same
// progress bar, same cancel.

const LOW = 40, HIGH = 83, STRINGS = 6, RING = 3.5;
const NOTE_BYTES = 48;
const BODY_URL = new URL('../vendor/pfsynth/bodies/g34.wav', import.meta.url);

/**
 * A performance as the guitar will play it: [start s, end s, MIDI, velocity 1–127] per note,
 * sorted by start, plus how much was changed to fit the instrument.
 */
export function packGuitar(perf) {
  const events = [...perf.events].sort((a, b) => a.at - b.at || a.midi - b.midi);
  let folded = 0, dropped = 0;
  const groups = [];
  for (const e of events) {
    let p = e.midi;
    while (p < LOW) p += 12;
    while (p > HIGH) p -= 12;
    if (p !== e.midi) folded++;
    const g = groups.at(-1);
    const note = { at: e.at, end: Math.max(e.at + 0.05, e.at + e.dur), midi: p, vel: 20 + 107 * Math.min(1, Math.max(0, e.velocity)) };
    if (g && Math.abs(g[0].at - e.at) < 0.004) {
      const same = g.find((n) => n.midi === p);
      if (same) { same.end = Math.max(same.end, note.end); same.vel = Math.max(same.vel, note.vel); dropped++; }
      else g.push(note);
    } else groups.push([note]);
  }
  const notes = [];
  for (const g of groups) {
    g.sort((a, b) => a.midi - b.midi);
    let keep = g;
    if (g.length > STRINGS) {
      const idx = new Set(Array.from({ length: STRINGS }, (_, i) => Math.round((i * (g.length - 1)) / (STRINGS - 1))));
      keep = g.filter((_, i) => idx.has(i));
      dropped += g.length - keep.length;
    }
    for (const n of keep) notes.push(n);
  }
  const flat = new Float64Array(notes.length * 4);
  let last = 0;
  notes.forEach((n, i) => { flat[i * 4] = n.at; flat[i * 4 + 1] = n.end; flat[i * 4 + 2] = n.midi; flat[i * 4 + 3] = n.vel; last = Math.max(last, n.end); });
  return { notes: flat, count: notes.length, duration: last + RING, folded, dropped };
}

/**
 * Notes written FOR the guitar, already playable: [{ at, end, string (1 = high E … 6), fret,
 * velocity (MIDI, up to 4×127 of headroom), art?: 'hammer'|'pull'|'slide'|'harmonic'|'muted'|'tie',
 * artParam?, slideTo? }]. Pitch comes from the string and fret (a harmonic sounds over the open
 * string: artParam is the touched fret, 12 by default). Nothing is fitted: the shape is the
 * guitarist's. Returns the packed form `renderDry` takes, with each note's technique in `tech`.
 */
export const ARTS = { normal: 0, hammer: 1, pull: 2, slide: 3, harmonic: 4, muted: 5, tie: 6 };
const OPEN = [64, 59, 55, 50, 45, 40];
const HARMONIC_UP = { 12: 12, 7: 19, 5: 24, 4: 28 };
export function packTab(tab, ring = RING) {
  const ns = [...tab].sort((a, b) => a.at - b.at || b.string - a.string);
  const notes = new Float64Array(ns.length * 4), tech = new Float64Array(ns.length * 5);
  let last = 0;
  ns.forEach((n, i) => {
    const art = ARTS[n.art || 'normal'], open = OPEN[n.string - 1];
    const pitch = art === ARTS.harmonic ? open + (HARMONIC_UP[n.artParam || 12] ?? 12) : open + n.fret;
    notes.set([n.at, Math.max(n.at + 0.03, n.end), pitch, n.velocity], i * 4);
    tech.set([n.string, art === ARTS.harmonic ? 0 : n.fret, art, n.artParam || (art === ARTS.harmonic ? 12 : 0), n.slideTo ? OPEN[n.string - 1] + n.slideTo : 0], i * 5);
    last = Math.max(last, n.end);
  });
  return { notes, tech, count: ns.length, duration: last + ring, folded: 0, dropped: 0 };
}

/** Write packed notes into the module and render the dry bridge force, mono. Node and worker share it. */
export async function renderDry(X, packed, sampleRate, { onProgress, cancelled, yieldEvery = 8 } = {}) {
  const n = packed.count;
  if (n > X.pgw_max_notes()) throw new Error(`too many notes for the guitar (${n} > ${X.pgw_max_notes()})`);
  const base = X.pgw_notes_ptr();
  new Uint8Array(X.memory.buffer, base, n * NOTE_BYTES).fill(0);
  const dv = new DataView(X.memory.buffer);
  for (let i = 0; i < n; i++) {
    const o = base + i * NOTE_BYTES;
    dv.setFloat64(o, packed.notes[i * 4], true);
    dv.setFloat64(o + 8, packed.notes[i * 4 + 1], true);
    dv.setFloat32(o + 16, packed.notes[i * 4 + 2], true);
    dv.setFloat32(o + 20, packed.notes[i * 4 + 3], true);
    dv.setInt8(o + 40, -1); dv.setInt8(o + 41, -1); dv.setInt8(o + 42, -1);   // string, fret, finger: the guitar chooses
    if (packed.tech) {                                                            // …unless the part says (packTab)
      const t = packed.tech;
      dv.setInt8(o + 40, t[i * 5]); dv.setInt8(o + 41, t[i * 5 + 1]); dv.setUint8(o + 43, t[i * 5 + 2]);
      dv.setFloat32(o + 24, t[i * 5 + 3], true); dv.setFloat32(o + 28, t[i * 5 + 4], true);
    }
  }
  const err = X.pgw_begin(sampleRate, n, packed.duration);
  if (err) throw new Error(`the guitar refused the score (${err})`);
  const total = Math.round(packed.duration * sampleRate), out = new Float32Array(total), ptr = X.pgw_out_ptr();
  let at = 0, k = 0, got;
  while ((got = X.pgw_render(X.pgw_block())) > 0) {
    out.set(new Float32Array(X.memory.buffer, ptr, got), at);
    at += got;
    if (++k % yieldEvery === 0) {
      onProgress?.(Math.min(0.99, at / total));
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled?.()) return null;
    }
  }
  return out.subarray(0, at);
}

// ------------------------------------------------------------- body and room --

/** The body's measured response: a 32-bit float (or 16-bit) mono WAV, read without decodeAudioData. */
async function loadBody() { return parseWav(await (await fetch(BODY_URL)).arrayBuffer()); }
/** A mono WAV's samples and rate (32-bit float or 16-bit PCM). */
export function parseWav(buf) {
  const dv = new DataView(buf);
  let p = 12, fmt = 3, bits = 32, rate = 44100;
  while (p + 8 <= buf.byteLength) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') { fmt = dv.getUint16(p + 8, true); rate = dv.getUint32(p + 12, true); bits = dv.getUint16(p + 22, true); }
    if (id === 'data') {
      const n = size / (bits / 8), x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = fmt === 3 ? dv.getFloat32(p + 8 + i * 4, true) : dv.getInt16(p + 8 + i * 2, true) / 32768;
      return { x, rate };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('guitar body: no audio in the file');
}

/**
 * Resample a short signal (an impulse response) from one rate to another by windowed sinc
 * (Lanczos, 8 lobes), band-limited to the lower rate's Nyquist. Exact at equal rates.
 */
export function resample(x, from, to) {
  if (from === to) return x;
  const ratio = to / from, n = Math.max(1, Math.round(x.length * ratio)), out = new Float32Array(n);
  const cut = Math.min(1, ratio), A = 8, half = Math.ceil(A / cut);
  const sinc = (t) => (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t));
  for (let i = 0; i < n; i++) {
    const c = i / ratio, k0 = Math.floor(c) - half, k1 = Math.floor(c) + half;
    let acc = 0;
    for (let k = Math.max(0, k0); k <= Math.min(x.length - 1, k1); k++) {
      const t = (c - k) * cut;
      if (Math.abs(t) < A) acc += x[k] * cut * sinc(t) * sinc(t / A);
    }
    out[i] = acc;
  }
  return out;
}

/**
 * A statistical room, stereo: upstream's roomImpulse (docs/guitar/guitar.js, after
 * tools/guitar_room_fit.room_impulse), unchanged but for returning two arrays, not an AudioBuffer.
 * Band-limited noise in octave bands, each decaying at its own reverberation time.
 */
function roomImpulse(rtLow, rtHigh, ratio, sr) {
  const rt = (f) => Math.exp(Math.log(rtLow) + (Math.log(rtHigh) - Math.log(rtLow)) * (Math.log(f) - Math.log(200)) / (Math.log(4000) - Math.log(200)));
  const n = Math.round(1.3 * Math.max(rtLow, rtHigh) * sr), pre = Math.round(.012 * sr), chans = [new Float32Array(n + pre), new Float32Array(n + pre)];
  const edges = [44, 88, 177, 355, 710, 1420, 2840, 5680, 11360, 20000];
  for (let ch = 0; ch < 2; ch++) {
    const out = chans[ch]; out[0] = 1; let seed = 1 + ch * 7919;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let b = 0; b + 1 < edges.length; b++) {
      const lo = edges[b], hi = Math.min(edges[b + 1], sr * .49);
      if (hi <= lo * 1.05) continue;   // a band above this rate's Nyquist (upstream assumed ≥ 44.1 kHz)
      const fc = Math.sqrt(lo * hi), q = fc / (hi - lo), w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q);
      const b0 = al / (1 + al), b2 = -b0, a1 = -2 * Math.cos(w) / (1 + al), a2 = (1 - al) / (1 + al), T = rt(fc), band = new Float32Array(n);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
      for (let i = 0; i < n; i++) {
        const x = rand(); let y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
        const z = b0 * y + b2 * u2 - a1 * v1 - a2 * v2; u2 = u1; u1 = y; v2 = v1; v1 = z;
        band[i] = z * Math.exp(-6.9078 * i / sr / T);
      }
      let e = 0; for (const v of band) e += v * v; const g = Math.sqrt(ratio * 2 * (hi - lo) / sr / (e || 1));
      for (let i = 0; i < n; i++) out[pre + i] += g * band[i];
    }
  }
  return chans;
}

/** In-place iterative radix-2 FFT (re, im of length a power of two); inverse when `inv`. */
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Convolve a long signal with an impulse response, by FFT overlap-add, into `length` samples.
 * Two real blocks ride one complex FFT (one in the real part, one in the imaginary), so the
 * cost is about one transform per block of input.
 */
export function convolve(x, h, length = x.length + h.length - 1) {
  let N = 1; while (N < 2 * h.length) N <<= 1;
  const B = N - h.length + 1, Hr = new Float64Array(N), Hi = new Float64Array(N);
  Hr.set(h); fft(Hr, Hi, false);
  const out = new Float32Array(length), re = new Float64Array(N), im = new Float64Array(N);
  for (let at = 0; at < x.length; at += 2 * B) {
    re.fill(0); im.fill(0);
    re.set(x.subarray(at, Math.min(x.length, at + B)));
    if (at + B < x.length) im.set(x.subarray(at + B, Math.min(x.length, at + 2 * B)));
    fft(re, im, false);
    for (let k = 0; k < N; k++) { const a = re[k], b = im[k]; re[k] = a * Hr[k] - b * Hi[k]; im[k] = a * Hi[k] + b * Hr[k]; }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      const p = at + i, q = at + B + i;
      if (p < length) out[p] += re[i];
      if (q < length && at + B < x.length) out[q] += im[i];
    }
  }
  return out;
}

/**
 * Bridge force → a guitar in a room: the body by convolution (normalised to unit energy, as
 * upstream's demo does), then the room, stereo. Done here, in JavaScript, by FFT, not by the
 * browser's convolver: Safari's OfflineAudioContext first refused the body (a sample-rate rule
 * Chrome does not enforce) and then, fixed, still played silence on an iPhone. Plain arithmetic
 * is the same on every browser and is checked in node. Peak-normalised to −1 dBFS: the bridge
 * force has no natural loudness, and a whole piece is rendered before it plays. Returns
 * interleaved stereo. `body` may be passed in (the node selftest has no fetch).
 */
export async function dress(dry, sampleRate, { body = null } = {}) {
  const raw = body ?? await loadBody(), x = resample(raw.x, raw.rate, sampleRate);
  let e = 0; for (const v of x) e += v * v;
  const length = dry.length + Math.round(1.2 * sampleRate);
  const shaped = convolve(dry, x, length), g = 1 / Math.sqrt(e || 1);
  for (let i = 0; i < length; i++) shaped[i] *= g;
  const [rl, rr] = roomImpulse(0.5, 0.3, 0.25, sampleRate);
  const L = convolve(shaped, rl, length), R = convolve(shaped, rr, length);
  let peak = 0; for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (!(peak > 0)) throw new Error('the guitar rendered silence');
  const k = 0.89 / peak, out = new Float32Array(length * 2);
  for (let i = 0; i < length; i++) { out[i * 2] = L[i] * k; out[i * 2 + 1] = R[i] * k; }
  return out;
}

// ---------------------------------------------------------------- the render --

let worker = null, workerBroken = false, nextId = 1;
const pending = new Map();
function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./pfsynth-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data, job = pending.get(m.id);
      if (!job) return;
      if (m.type === 'progress') { job.onProgress?.(m.value * 0.92); return; }
      pending.delete(m.id);
      if (m.type === 'done-guitar') job.resolve(new Float32Array(m.mono));
      else if (m.type === 'cancelled') job.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      else job.reject(new Error(m.message || 'render failed'));
    };
    worker.onerror = () => { workerBroken = true; worker = null; };
  } catch { workerBroken = true; worker = null; }
  return worker;
}

let direct = null;
async function loadDirect() {
  if (!direct) {
    const res = await fetch(new URL('../vendor/pfsynth/pfguitar.wasm', import.meta.url));
    if (!res.ok) throw new Error(`pfguitar.wasm: HTTP ${res.status}`);
    direct = (await WebAssembly.instantiate(await res.arrayBuffer(), {})).instance.exports;
  }
  return direct;
}

/** True if the guitar can be offered at all: the module loads. */
export async function available() {
  try { await loadDirect(); return true; } catch { return false; }
}

/**
 * Render a performance on the guitar: the strings in the worker (or here, if there is none),
 * then the body and the room. Same shape as pfsynth.js's render, so ModelPlayer can drive it.
 */
export async function render(perf, opts = {}) {
  return renderPacked(packScore(perf), opts);
}

/**
 * A performance as the guitar plays it. Notes the score placed on the guitar (guitar.js: a
 * guitar staff or a TabStaff, with strings, frets and techniques) go as tab, exactly as the tab
 * staff draws them; a chord of three or more is strummed low to high, 8 ms a string (45 ms
 * under `\arpeggio`). Anything else (a piano part, a note no string could reach) is fitted
 * by packGuitar, and the two are played together.
 */
export function packScore(perf) {
  const onGuitar = (e) => e.string && e.fret != null;
  const tabbed = perf.events.filter(onGuitar);
  if (!tabbed.length) return packGuitar(perf);
  const byAt = new Map();
  for (const e of tabbed) { const k = Math.round(e.at * 1000); if (!byAt.has(k)) byAt.set(k, []); byAt.get(k).push(e); }
  const tab = [];
  for (const group of byAt.values()) {
    group.sort((a, b) => b.string - a.string);
    const roll = group.length >= 3 ? (group.some((e) => e.arpeggio) ? 0.045 : 0.008) : 0;
    group.forEach((e, i) => tab.push({
      at: e.at + i * roll, end: e.at + e.dur, string: e.string, fret: e.fret,
      velocity: 20 + 107 * Math.min(1, Math.max(0, e.velocity ?? 0.7)),
      art: e.art, artParam: e.artParam, slideTo: e.slideTo,
    }));
  }
  const packed = packTab(tab);
  const rest = perf.events.filter((e) => !onGuitar(e));
  if (!rest.length) return packed;
  // the rest, fitted, merged in time order (their strings left to the guitar: -1)
  const fit = packGuitar({ events: rest }), rows = [];
  for (let i = 0; i < packed.count; i++) rows.push([...packed.notes.subarray(i * 4, i * 4 + 4), ...packed.tech.subarray(i * 5, i * 5 + 5)]);
  for (let i = 0; i < fit.count; i++) rows.push([...fit.notes.subarray(i * 4, i * 4 + 4), -1, -1, 0, 0, 0]);
  rows.sort((a, b) => a[0] - b[0]);
  const notes = new Float64Array(rows.length * 4), tech = new Float64Array(rows.length * 5);
  rows.forEach((r, i) => { notes.set(r.slice(0, 4), i * 4); tech.set(r.slice(4), i * 5); });
  return { notes, tech, count: rows.length, duration: Math.max(packed.duration, fit.duration), folded: fit.folded, dropped: fit.dropped };
}

/** Render packed notes (packGuitar's, or packTab's for a part written for the guitar). */
export async function renderPacked(packed, { sampleRate = 44100, onProgress, signal, noWorker = false } = {}) {
  const w = noWorker ? null : ensureWorker();
  let dry;
  if (w) {
    const id = nextId++;
    dry = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      signal?.addEventListener('abort', () => { if (pending.has(id)) w.postMessage({ type: 'cancel', id }); }, { once: true });
      const notes = packed.notes.slice(), tech = packed.tech ? packed.tech.slice() : null;
      w.postMessage({ type: 'render-guitar', id, notes: notes.buffer, tech: tech?.buffer ?? null, count: packed.count, duration: packed.duration, sampleRate }, tech ? [notes.buffer, tech.buffer] : [notes.buffer]);
    });
  } else {
    dry = await renderDry(await loadDirect(), packed, sampleRate, { onProgress: (v) => onProgress?.(v * 0.92), cancelled: () => signal?.aborted });
    if (!dry) throw Object.assign(new Error('cancelled'), { cancelled: true });
  }
  const interleaved = await dress(dry, sampleRate);
  onProgress?.(1);
  return { interleaved, sampleRate, frames: interleaved.length / 2, folded: packed.folded, dropped: packed.dropped };
}
