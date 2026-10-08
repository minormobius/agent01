// worker.js — the radio, off the main thread. Composes and renders a little ahead of what is playing
// (the page asks for `want` frames) and posts half a second at a time, with the notes struck in it and
// the bars begun in it, for the duende and the piano roll. The dials arrive as they move and are read
// at the next bar. If the device cannot keep up, the guitar's quieter notes thin out before it falls
// behind, and come back when it can.
import { RadioStream } from './stream.js';
import { parseWav } from '../cycle/music.js';

const WASM = new URL('../vendor/pfsynth/pfstream.wasm', import.meta.url);
const BODY = new URL('../vendor/pfsynth/bodies/g34.wav', import.meta.url);
const BLOCKS = 11;                                   // ≈ 0.5 s at 44.1 kHz (2048-frame blocks)

let s = null, want = 0, busy = false, started = 0, rendered = 0, thin = 1, knobs = {};

async function start(msg) {
  const [w, b] = await Promise.all([fetch(WASM).then((r) => r.arrayBuffer()), fetch(BODY).then((r) => r.arrayBuffer())]);
  const { instance } = await WebAssembly.instantiate(w, {});
  knobs = msg.knobs;
  s = new RadioStream(instance.exports, { seed: msg.seed, sampleRate: msg.sampleRate, body: parseWav(b) });
  s.knobs = { ...knobs, thin };
  started = performance.now(); rendered = 0;
  want = msg.want; pump();
}

async function pump() {
  if (busy || !s) return;
  busy = true;
  while (s && s.frame < want) {
    s.knobs = { ...knobs, thin };
    const r = s.render(BLOCKS), frames = r.pcm.length / 2;
    rendered += frames / s.sr;
    postMessage({ type: 'chunk', frame: s.frame - frames, frames, pcm: r.pcm.buffer, notes: r.notes, bars: r.bars }, [r.pcm.buffer]);
    const speed = rendered / ((performance.now() - started) / 1000);
    thin = Math.max(0.35, Math.min(1, thin + (speed < 1.5 ? -0.05 : 0.02)));
    await new Promise((res) => setTimeout(res, 0));                // let messages in
  }
  busy = false;
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'start') start(m).catch((e) => postMessage({ type: 'error', message: String((e && e.message) || e) }));
  else if (m.type === 'want') { want = m.want; pump(); }
  else if (m.type === 'knobs') knobs = m.knobs;
  else if (m.type === 'stop') s = null;
};
