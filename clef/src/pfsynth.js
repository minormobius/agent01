// pfsynth.js — the physical-modelling piano, for export.
//
// `audio.js` synthesises everything from partials and an envelope. That is the
// right engine for PROOFREADING: it starts instantly, it costs nothing, and it
// is pleasant enough not to fight you while you check whether bar 14 says what
// you meant. It is not a piano, and it never will be.
//
// This is: John O'Laughlin's pfsynth (MIT, vendored under vendor/pfsynth/),
// compiled to WebAssembly. A digital waveguide per string, two or three coupled
// and detuned strings per note, a nonlinear felt hammer solved implicitly each
// sample, stiffness dispersion and decay both fitted to a real instrument. The
// hammer is why it sounds struck rather than plucked, and the coupling is why a
// held note swells and beats instead of fading exponentially.
//
// WHY EXPORT ONLY, with a number rather than a hunch. pfsynth is written for
// offline rendering — its own README's target renders a whole piece during a
// loading screen, where CPU is free. Measured here: a sparse chord renders 31x
// faster than real time, but the 487-note rondo renders only **2.1x** faster,
// on desktop Chromium. Cost scales with how many strings are ringing, and the
// live scheduler has to stay ahead of the audio clock on a 140 ms lookahead —
// on a phone, at 2x headroom on a desktop, that is a promise this cannot keep.
// A preview that stutters is worse than one that is merely synthetic, so the
// two engines have different jobs and the UI says which is which.
//
// The module imports NOTHING — no WASI, no callbacks, no environment — so it
// instantiates with an empty import object in any browser that has WebAssembly.

const WASM_URL = new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url);

// Matches `pfw_note` in vendor/pfsynth/pf_web.c: two int32 then two float32.
const NOTE_BYTES = 16;

let modulePromise = null;

/** Fetch and instantiate once; every later render reuses the instance. */
async function load() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const res = await fetch(WASM_URL);
      if (!res.ok) throw new Error(`pfsynth.wasm: HTTP ${res.status}`);
      const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
      return instance.exports;
    })().catch((err) => { modulePromise = null; throw err; });
  }
  return modulePromise;
}

/** True if the model is reachable — used to decide whether to offer it at all. */
export async function available() {
  try { await load(); return true; } catch { return false; }
}

/**
 * Render a performance through the physical model.
 *
 * Returns interleaved stereo Float32Array plus the sample rate, which is what
 * `wavBlob` in audio.js wants. Everything sounds like a piano: the model is a
 * piano, so a score that names a violin gets a piano playing the violin's part.
 * That is stated in the UI rather than hidden — silently ignoring the
 * instrument a score asks for is the kind of thing that makes someone think
 * the ensemble work is broken.
 */
export async function render(perf, { sampleRate = 44100, gain = 110, onProgress } = {}) {
  const X = await load();
  const maxNotes = X.pfw_max_notes();
  const block = X.pfw_block();

  // The shim admits notes with a single forward cursor, so they MUST be sorted
  // by start — an out-of-order note is never struck at all, silently.
  const events = [...perf.events].sort((a, b) => a.at - b.at);
  if (events.length > maxNotes) {
    throw new Error(`too many notes for the model (${events.length} > ${maxNotes})`);
  }

  const notesPtr = X.pfw_notes_ptr();
  const dv = new DataView(X.memory.buffer);
  let n = 0;
  for (const e of events) {
    const start = Math.max(0, Math.round(e.at * sampleRate));
    // A damper that falls at the same sample as the strike produces nothing;
    // give every note at least one sample of ring.
    const end = Math.max(start + 1, Math.round((e.at + e.dur) * sampleRate));
    const p = notesPtr + n * NOTE_BYTES;
    dv.setInt32(p, start, true);
    dv.setInt32(p + 4, end, true);
    dv.setFloat32(p + 8, e.midi, true);
    dv.setFloat32(p + 12, Math.min(1, Math.max(0.001, e.velocity)), true);
    n++;
  }

  X.pfw_begin(sampleRate, n, gain);

  // Render until the last note is struck AND every string has rung out, rather
  // than to a fixed padding: bass notes here decay for many seconds, and a
  // fixed tail either truncates them or wastes time on silence.
  const lastEnd = events.length
    ? Math.max(...events.map((e) => (e.at + e.dur))) * sampleRate
    : 0;
  const hardCap = Math.ceil(lastEnd + 30 * sampleRate);
  const outPtr = X.pfw_out_ptr();
  const chunks = [];
  let frames = 0;

  while (frames < hardCap) {
    const got = X.pfw_render(block);
    // Copy out immediately: the wasm buffer is reused by the next block, and
    // memory can move if it ever grows.
    chunks.push(new Float32Array(X.memory.buffer, outPtr, got * 2).slice());
    frames += got;
    if (!X.pfw_active()) break;
    if (onProgress && lastEnd > 0) onProgress(Math.min(0.98, frames / (lastEnd + sampleRate)));
  }

  const total = new Float32Array(frames * 2);
  let at = 0;
  for (const c of chunks) { total.set(c, at); at += c.length; }
  if (onProgress) onProgress(1);
  return { interleaved: total, sampleRate, frames };
}
