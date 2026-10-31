// pfsynth-core.js — drive the pfsynth wasm module one block at a time.
//
// The module is clef's (vendor/pfsynth/, byte-identical; the selftest checks),
// and so is the note layout. What differs from clef is the shape of the render:
// clef renders a whole piece and then plays it, because a reader is proofreading
// and a wait with a progress bar is fine. A piece in the studio is a
// performance with a picture attached, so it is rendered as a STREAM of blocks
// that the page can start playing while the rest is still being computed.
//
// No DOM, no Worker API: the browser's worker and node's selftest both use it.

const NOTE_BYTES = 16;   // pfw_note: int32 start, int32 end, float32 midi, float32 velocity
export const DEFAULT_GAIN = 110;   // upstream engine.c's makeup gain, as in clef

export async function instantiate(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
}

/**
 * Load a performance ({at, dur, midi, velocity} in seconds) into the module and
 * return a pull function: each call renders one block and returns a fresh
 * Float32Array of interleaved stereo, or null once every string has rung out.
 */
export function begin(X, events, sampleRate, gain = DEFAULT_GAIN) {
  // The host admits notes with a single forward cursor: an out-of-order note is
  // never struck, silently. Sort, whatever the caller promised.
  const evs = [...events].sort((a, b) => a.at - b.at);
  if (evs.length > X.pfw_max_notes()) throw new Error(`too many notes (${evs.length})`);
  const dv = new DataView(X.memory.buffer);
  const ptr = X.pfw_notes_ptr();
  let lastEnd = 0;
  evs.forEach((e, i) => {
    const start = Math.max(0, Math.round(e.at * sampleRate));
    const end = Math.max(start + 1, Math.round((e.at + e.dur) * sampleRate));
    const p = ptr + i * NOTE_BYTES;
    dv.setInt32(p, start, true);
    dv.setInt32(p + 4, end, true);
    dv.setFloat32(p + 8, e.midi, true);
    dv.setFloat32(p + 12, Math.min(1, Math.max(0.001, e.velocity)), true);
    if (end > lastEnd) lastEnd = end;
  });
  X.pfw_begin(sampleRate, evs.length, gain);

  const block = X.pfw_block();
  const outPtr = X.pfw_out_ptr();
  const hardCap = Math.ceil(lastEnd + 30 * sampleRate);   // backstop, as in clef
  let frames = 0;
  let done = false;

  return {
    block,
    lastEnd,
    pull() {
      if (done || frames >= hardCap) return null;
      const got = X.pfw_render(block);
      frames += got;
      // Copy now: the module reuses this memory for the next block.
      const out = new Float32Array(X.memory.buffer, outPtr, got * 2).slice();
      // The piece is over once every string is quiet AND the last damper has
      // fallen; before that a quiet stretch is a rest, not the end.
      if (!X.pfw_active() && frames >= lastEnd) done = true;
      return out;
    },
    get frames() { return frames; },
  };
}
