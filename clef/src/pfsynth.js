// pfsynth.js — the physical-modelling piano: render it, then play it.
//
// `audio.js` synthesises from partials and an envelope. That is the right
// engine for PROOFREADING — it starts instantly, it costs nothing, and it is
// pleasant enough not to fight you while you check whether bar 14 says what you
// meant. It is not a piano and it never will be.
//
// This is: John O'Laughlin's pfsynth (MIT, vendored under vendor/pfsynth/),
// compiled to WebAssembly. A digital waveguide per string, two or three coupled
// and detuned strings per note, a nonlinear felt hammer solved implicitly every
// sample. The hammer is why it sounds struck rather than plucked, and the
// coupling is why a held note beats and swells instead of decaying cleanly.
//
// HOW IT PLAYS, given that it cannot play in real time. Measured on desktop
// Chromium the 487-note rondo renders at about 2.1x real time; a phone will be
// slower, and cost tracks how many strings are ringing rather than how many
// notes there are. So it is NOT wired into the live scheduler, which would have
// to stay ahead of the audio clock on a 140 ms lookahead and would stutter the
// moment a dense bar arrived. Instead the whole piece is rendered first — off
// the main thread, with a progress bar and a cancel — and then played back as
// one buffer. Waiting once with a bar that moves is a better deal than a
// preview that breaks up, and it is honest about what the machine is doing.
//
// The render is CACHED against the notes it came from, so pressing play a
// second time on an unchanged score starts instantly. Edit a note and the key
// changes and it re-renders; that is the price of the good piano.

const NOTE_BYTES = 16;
const DEFAULT_GAIN = 110;   // upstream engine.c's own makeup gain

let worker = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map();

/**
 * The worker, or null if this browser cannot make one.
 *
 * Module workers are the only sane way to resolve the .wasm URL relative to
 * this file, and they are also the thing most likely to be missing. A failure
 * here is not fatal: renderInThread below does the same work on the main
 * thread, freezing the page while it runs, which is bad but better than the
 * feature simply not existing.
 */
function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./pfsynth-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data;
      const job = pending.get(m.id);
      if (!job) return;                 // a render the page has already abandoned
      if (m.type === 'progress') { job.onProgress?.(m.value); return; }
      pending.delete(m.id);
      if (m.type === 'done') {
        job.resolve({
          interleaved: new Float32Array(m.interleaved),
          sampleRate: m.sampleRate,
          frames: m.frames,
        });
      } else if (m.type === 'cancelled') {
        job.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      } else {
        job.reject(new Error(m.message || 'render failed'));
      }
    };
    worker.onerror = () => { workerBroken = true; worker = null; };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Pack a performance into the flat [start, end, midi, velocity] the worker wants. */
function packNotes(perf, sampleRate) {
  // The shim admits notes with a single forward cursor, so they MUST be sorted
  // by start — an out-of-order note is never struck at all, and silently.
  const events = [...perf.events].sort((a, b) => a.at - b.at);
  const out = new Float64Array(events.length * 4);
  events.forEach((e, i) => {
    const start = Math.max(0, Math.round(e.at * sampleRate));
    // A damper falling on the same sample as the strike produces nothing.
    const end = Math.max(start + 1, Math.round((e.at + e.dur) * sampleRate));
    out[i * 4] = start;
    out[i * 4 + 1] = end;
    out[i * 4 + 2] = e.midi;
    out[i * 4 + 3] = Math.min(1, Math.max(0.001, e.velocity));
  });
  return out;
}

/**
 * Render a performance through the model.
 *
 * Returns interleaved stereo plus its sample rate — what `wavBlobInterleaved`
 * in audio.js wants, and what an AudioBuffer is filled from below. Everything
 * sounds like a piano, because the model is a model of one instrument: a score
 * that names a violin gets a piano playing the violin's part. The UI says so
 * rather than leaving it to be discovered.
 */
export function render(perf, { sampleRate = 44100, gain = DEFAULT_GAIN, onProgress, signal, noWorker = false } = {}) {
  const notes = packNotes(perf, sampleRate);
  // `noWorker` exists so the two paths can be compared against each other:
  // they must produce identical audio, and nothing else would notice if they
  // drifted apart.
  const w = noWorker ? null : ensureWorker();
  if (!w) return renderInThread(notes, sampleRate, gain, onProgress);

  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
  });
  if (signal) {
    signal.addEventListener('abort', () => {
      if (pending.has(id)) w.postMessage({ type: 'cancel', id });
    }, { once: true });
  }
  w.postMessage({ type: 'render', id, notes: notes.buffer, sampleRate, gain }, [notes.buffer]);
  return promise;
}

/**
 * The same render with no worker, which freezes the page for its duration.
 *
 * Kept because a browser without module workers should still get the piano, and
 * because it is the reference the worker is checked against: pass `noWorker`
 * and the two must agree sample for sample, or one of them is wrong. (Verified
 * in a browser, not in the node selftests — neither Worker nor fetch exists
 * there, so the node tests only exercise the wasm module itself.)
 */
async function renderInThread(notes, sampleRate, gain, onProgress) {
  const X = await loadDirect();
  const block = X.pfw_block();
  const n = Math.floor(notes.length / 4);
  if (n > X.pfw_max_notes()) throw new Error(`too many notes for the model (${n} > ${X.pfw_max_notes()})`);

  const dv = new DataView(X.memory.buffer);
  const ptr = X.pfw_notes_ptr();
  let lastEnd = 0;
  for (let i = 0; i < n; i++) {
    const p = ptr + i * NOTE_BYTES;
    dv.setInt32(p, notes[i * 4], true);
    dv.setInt32(p + 4, notes[i * 4 + 1], true);
    dv.setFloat32(p + 8, notes[i * 4 + 2], true);
    dv.setFloat32(p + 12, notes[i * 4 + 3], true);
    if (notes[i * 4 + 1] > lastEnd) lastEnd = notes[i * 4 + 1];
  }
  X.pfw_begin(sampleRate, n, gain);

  const outPtr = X.pfw_out_ptr();
  const hardCap = Math.ceil(lastEnd + 30 * sampleRate);
  const chunks = [];
  let frames = 0;
  while (frames < hardCap) {
    const got = X.pfw_render(block);
    chunks.push(new Float32Array(X.memory.buffer, outPtr, got * 2).slice());
    frames += got;
    if (!X.pfw_active()) break;
  }
  const total = new Float32Array(frames * 2);
  let at = 0;
  for (const c of chunks) { total.set(c, at); at += c.length; }
  onProgress?.(1);
  return { interleaved: total, sampleRate, frames };
}

let directModule = null;
async function loadDirect() {
  if (!directModule) {
    const url = new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pfsynth.wasm: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    directModule = instance.exports;
  }
  return directModule;
}

/** True if the model is reachable at all — used to decide whether to offer it. */
export async function available() {
  try { await loadDirect(); return true; } catch { return false; }
}

// ------------------------------------------------------------- playback ---

/**
 * What identifies a render: the notes, and nothing else.
 *
 * Not the score text — reformatting the source, or moving a slur, changes the
 * file without changing a single struck string, and re-rendering 26 seconds of
 * audio for that would be a bad trade. Two performances that would strike the
 * same strings at the same samples share a render.
 */
function cacheKey(perf, sampleRate, gain) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v | 0; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(sampleRate); mix(gain * 1000); mix(perf.events.length);
  for (const e of perf.events) {
    mix(Math.round(e.at * 4410));
    mix(Math.round(e.dur * 4410));
    mix(e.midi);
    mix(Math.round(e.velocity * 1000));
  }
  return h >>> 0;
}

/**
 * Plays a performance through the model: render once, cache, then play.
 *
 * Deliberately matches the shape of `Player` in audio.js — `load`, `play`,
 * `stop`, `position`, `onTick`, `onEnd` — so the page's playhead, the score
 * following, and the play button do not have to know which engine is running.
 * The one thing it adds is `onRenderProgress`, because this engine makes you
 * wait and the page has to say so.
 */
export class ModelPlayer {
  constructor() {
    this.ctx = null;
    this.perf = null;
    this.playing = false;
    this.rendering = false;
    this.buffer = null;
    this.bufferKey = null;
    this.source = null;
    this.gainNode = null;
    this.startedAt = 0;
    this.startOffset = 0;
    this.timer = null;
    this.volume = 0.85;
    this.gain = DEFAULT_GAIN;
    this.onTick = null;
    this.onEnd = null;
    this.onRenderProgress = null;
    this.abort = null;
  }

  load(perf) {
    this.perf = perf;
    // A new performance invalidates nothing by itself — the key decides.
  }

  setVolume(v) {
    this.volume = v;
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  ensure() {
    if (!this.ctx) {
      claimPlaybackSession();
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Render if needed (reporting progress), then play from `fromSeconds`. */
  async play(fromSeconds = 0) {
    if (!this.perf?.events.length) return;
    const ctx = this.ensure();
    const key = cacheKey(this.perf, ctx.sampleRate, this.gain);

    if (this.bufferKey !== key || !this.buffer) {
      this.rendering = true;
      this.abort = new AbortController();
      try {
        const { interleaved, frames } = await render(this.perf, {
          sampleRate: ctx.sampleRate,
          gain: this.gain,
          onProgress: (v) => this.onRenderProgress?.(v),
          signal: this.abort.signal,
        });
        const buf = ctx.createBuffer(2, Math.max(1, frames), ctx.sampleRate);
        const L = buf.getChannelData(0);
        const R = buf.getChannelData(1);
        for (let i = 0; i < frames; i++) { L[i] = interleaved[i * 2]; R[i] = interleaved[i * 2 + 1]; }
        this.buffer = buf;
        this.bufferKey = key;
      } finally {
        this.rendering = false;
        this.abort = null;
      }
      this.onRenderProgress?.(1);
    }

    // The page may have pressed stop while we were rendering.
    if (this.stopRequested) { this.stopRequested = false; return; }

    this.startOffset = Math.max(0, Math.min(fromSeconds, this.buffer.duration));
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.onended = () => {
      if (!this.playing) return;       // a stop() we asked for
      this.playing = false;
      this.onEnd?.();
    };
    this.startedAt = ctx.currentTime;
    this.playing = true;
    this.source.start(0, this.startOffset);
    this.pump();
  }

  /** Drive the playhead. The audio clock is the truth; this only reads it. */
  pump() {
    if (!this.playing) return;
    this.onTick?.(this.position);
    this.timer = setTimeout(() => this.pump(), 25);
  }

  get position() {
    if (!this.playing || !this.ctx) return this.startOffset;
    return this.ctx.currentTime - this.startedAt + this.startOffset;
  }

  stop() {
    if (this.rendering) { this.abort?.abort(); this.stopRequested = true; }
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.source) {
      try { this.source.stop(); } catch { /* already ended */ }
      this.source.disconnect();
      this.source = null;
    }
  }
}

/**
 * Same reasoning as audio.js: on iOS a bare AudioContext gets the `ambient`
 * category, which the Ring/Silent switch mutes while headphones still play.
 */
function claimPlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* leave it ambient rather than throw on the way to playing */ }
}
