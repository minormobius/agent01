// piano-worker.js — render a performance off the main thread, as a stream.
//
// Posts a 'chunk' roughly every half second of audio, so the page can start
// playing long before the render finishes. Rendering is ~10x real time on a
// desktop for a sparse piece, and the page decides when it has enough of a lead
// (see piano.js); this file only renders and reports.

import { instantiate, begin } from './pfsynth-core.js';

const WASM_URL = new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url);
const BLOCKS_PER_CHUNK = 6;          // 6 x 4096 frames ≈ 0.56 s at 44.1 kHz

let X = null;
let current = 0;

async function load() {
  if (!X) {
    const res = await fetch(WASM_URL);
    if (!res.ok) throw new Error(`pfsynth.wasm: HTTP ${res.status}`);
    X = await instantiate(await res.arrayBuffer());
  }
  return X;
}

// A worker cannot receive a message while it is inside a synchronous loop, so
// it yields between chunks; otherwise a cancel would queue until the render it
// was meant to stop had finished.
const idle = () => new Promise((r) => setTimeout(r, 0));

async function render(id, events, sampleRate, gain) {
  const x = await load();
  const r = begin(x, events, sampleRate, gain);
  let frame = 0;
  for (;;) {
    const parts = [];
    let done = false;
    for (let b = 0; b < BLOCKS_PER_CHUNK; b++) {
      const p = r.pull();
      if (!p) { done = true; break; }
      parts.push(p);
    }
    if (parts.length) {
      const len = parts.reduce((s, p) => s + p.length, 0);
      const out = new Float32Array(len);
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.length; }
      postMessage({ type: 'chunk', id, frame, frames: len / 2, pcm: out.buffer }, [out.buffer]);
      frame += len / 2;
    }
    if (done) { postMessage({ type: 'done', id, frames: frame }); return; }
    await idle();
    if (id !== current) return;          // superseded or cancelled
  }
}

onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { if (msg.id === current) current = 0; return; }
  if (msg.type !== 'render') return;
  current = msg.id;
  render(msg.id, msg.events, msg.sampleRate, msg.gain).catch((err) => {
    postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  });
};
