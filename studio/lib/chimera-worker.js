// chimera-worker.js — CHIMERA in a module worker, so the page keeps moving while it renders
// (a sentence takes about half its own length to compute on a desktop).
//
//   → { id, say: text, body?, sampleRate? }          ← { id, audio: Float32Array, seconds, ms }
//   → { id, sing: { bpm, lyrics, notes }, body?, sampleRate? }
//   ← { id, error } on failure
//
// The wasm and the dictionary load once, on the first message.

import { instantiate, loadDictionary, say, sing, renderAll } from './chimera-core.js';

const base = new URL('../vendor/chimera/', import.meta.url);
let ready = null;
async function load() {
  const [wasm, dict] = await Promise.all([
    fetch(new URL('chimera.wasm', base)).then((r) => { if (!r.ok) throw new Error(`chimera.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(new URL('cmudict.txt.gz', base)).then((r) => { if (!r.ok) throw new Error(`cmudict: HTTP ${r.status}`); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text(); }),
  ]);
  const X = await instantiate(wasm);
  loadDictionary(X, dict);
  return X;
}

self.onmessage = async ({ data: m }) => {
  try {
    ready ??= load();
    ready.catch(() => { ready = null; });   // a failed load is retried on the next message
    const X = await ready;
    const opts = { body: m.body ?? 'male', sampleRate: m.sampleRate ?? 48000 };
    const t0 = performance.now();
    const r = m.sing ? sing(X, m.sing, opts) : say(X, m.say, opts);
    const audio = renderAll(r.next);
    self.postMessage({ id: m.id, audio, seconds: r.seconds, ms: performance.now() - t0 }, [audio.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, error: String(e?.message ?? e) });
  }
};
