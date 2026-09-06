// pfsynth-worker.js — the physical model, rendering off the main thread.
//
// WHY A WORKER AT ALL. Rendering the rondo takes ~26 seconds of solid compute.
// Run on the main thread that is 26 seconds with no paint, no scroll, no
// clicks, no way to cancel — the tab is simply frozen, and a progress bar drawn
// from that thread cannot advance, because the thread that would draw it is the
// thread doing the work. A progress bar and a cancel button are not decoration
// here; they are the whole reason this file exists.
//
// The protocol is deliberately small. One render at a time, addressed by id, so
// a stale render that the page has already given up on cannot deliver its
// buffer over a newer one.

const WASM_URL = new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url);
const NOTE_BYTES = 16;      // pfw_note: two int32, two float32

// How often to hand control back to the event loop. A worker cannot receive a
// message while it is inside a synchronous loop, so without this yield the
// cancel message sits in the queue until the render it would have cancelled has
// finished — which is exactly the wait we are trying to interrupt.
const YIELD_EVERY_BLOCKS = 8;

let X = null;
let cancelled = new Set();

async function load() {
  if (!X) {
    const res = await fetch(WASM_URL);
    if (!res.ok) throw new Error(`pfsynth.wasm: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    X = instance.exports;
  }
  return X;
}

const idle = () => new Promise((r) => setTimeout(r, 0));

/**
 * `notes` is a flat Float64Array of [start, end, midi, velocity] per note, in
 * SAMPLES, already sorted by start. Packed rather than sent as objects because
 * a structured clone of several thousand small objects is slower than the
 * render's first block, and because the shim wants a packed array anyway.
 */
async function render(id, notes, sampleRate, gain) {
  const x = await load();
  const maxNotes = x.pfw_max_notes();
  const block = x.pfw_block();
  const n = Math.floor(notes.length / 4);
  if (n > maxNotes) throw new Error(`too many notes for the model (${n} > ${maxNotes})`);

  const dv = new DataView(x.memory.buffer);
  const notesPtr = x.pfw_notes_ptr();
  let lastEnd = 0;
  for (let i = 0; i < n; i++) {
    const p = notesPtr + i * NOTE_BYTES;
    const start = notes[i * 4];
    const end = notes[i * 4 + 1];
    dv.setInt32(p, start, true);
    dv.setInt32(p + 4, end, true);
    dv.setFloat32(p + 8, notes[i * 4 + 2], true);
    dv.setFloat32(p + 12, notes[i * 4 + 3], true);
    if (end > lastEnd) lastEnd = end;
  }

  x.pfw_begin(sampleRate, n, gain);

  // Stop when every string has rung out rather than after a fixed padding: the
  // bass here decays for many seconds, and a fixed tail either truncates it or
  // spends real time rendering silence. The cap is a backstop against a patch
  // that never falls below the retire threshold.
  const hardCap = Math.ceil(lastEnd + 30 * sampleRate);
  const outPtr = x.pfw_out_ptr();
  const chunks = [];
  let frames = 0;
  let sinceYield = 0;

  while (frames < hardCap) {
    const got = x.pfw_render(block);
    // Copy immediately: the module reuses this buffer for the next block, and
    // a grown memory would detach the view.
    chunks.push(new Float32Array(x.memory.buffer, outPtr, got * 2).slice());
    frames += got;

    if (!x.pfw_active()) break;
    if (++sinceYield >= YIELD_EVERY_BLOCKS) {
      sinceYield = 0;
      // Denominator includes a nominal tail so the bar does not sit at 100%
      // through the ring-out; the last stretch is the decay, not a stall.
      const expected = lastEnd + 3 * sampleRate;
      postMessage({ type: 'progress', id, value: Math.min(0.99, frames / expected) });
      await idle();
      if (cancelled.has(id)) { cancelled.delete(id); return null; }
    }
  }

  const total = new Float32Array(frames * 2);
  let at = 0;
  for (const c of chunks) { total.set(c, at); at += c.length; }
  return { interleaved: total, sampleRate, frames };
}

onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type !== 'render') return;

  try {
    const out = await render(msg.id, new Float64Array(msg.notes), msg.sampleRate, msg.gain);
    if (!out) { postMessage({ type: 'cancelled', id: msg.id }); return; }
    postMessage({
      type: 'done', id: msg.id, sampleRate: out.sampleRate, frames: out.frames,
      interleaved: out.interleaved.buffer,
    }, [out.interleaved.buffer]);   // transfer, not copy: this is megabytes
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
