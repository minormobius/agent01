// worker.js — the radio, off the main thread. Composes and renders a little ahead of what is playing
// (the page asks for `want` frames) and posts half a second at a time, with the notes struck in it and
// the bars begun in it, for the picture. The dials arrive as they move and are read at the next bar,
// rounded to whole percents: that, and the radio's state saved before every bar, is what lets a moment
// be sent back as a link ("that bit") and replayed exactly. If the device cannot keep up, the guitar's
// quieter notes thin out before it falls behind, and come back when it can.
//
//   start { seed, sampleRate, knobs, want, clip? }   clip: play a saved moment first (clip.js)
//   want { want } · knobs { knobs } · clip { from, to } → clip { clip } · stop
import { RadioStream } from './stream.js';
import { Radio, KNOBS } from './composer.js';
import { parseWav } from '../cycle/music.js';

const WASM = new URL('../vendor/pfsynth/pfstream.wasm', import.meta.url);
const BODY = new URL('../vendor/pfsynth/bodies/g34.wav', import.meta.url);
const BLOCKS = 11;                                   // ≈ 0.5 s at 44.1 kHz (2048-frame blocks)
const KEEP = 96;                                     // bars of saved states (a minute or more)

let s = null, want = 0, busy = false, started = 0, rendered = 0, thin = 1, knobs = {}, seed = 1;
let replay = null;                                    // { clip, from }: a saved moment being played
const states = new Map(), dials = new Map();          // bar → the radio's state before it, the dials it was played at

const round = (k) => [...KNOBS.map((n) => Math.round((k[n] ?? 0.5) * 100)), Math.round(thin * 20) * 5];
const asKnobs = (a) => ({ ...Object.fromEntries(KNOBS.map((n, i) => [n, a[i] / 100])), thin: a[KNOBS.length] / 100 });

async function start(msg) {
  const [w, b] = await Promise.all([fetch(WASM).then((r) => r.arrayBuffer()), fetch(BODY).then((r) => r.arrayBuffer())]);
  const { instance } = await WebAssembly.instantiate(w, {});
  knobs = msg.knobs; seed = msg.seed;
  s = new RadioStream(instance.exports, { seed, sampleRate: msg.sampleRate, body: parseWav(b) });
  if (msg.clip) { s.use(Radio.from(msg.clip.state)); replay = { clip: msg.clip, from: msg.clip.state.n }; }
  // before each bar: the dials it will be played at (a replay's own, while it lasts), and the state to save
  s.beforeBar = (radio) => {
    let a = round(knobs);
    if (replay) {
      const off = radio.n - replay.from;
      if (off < replay.clip.bars) { const e = replay.clip.knobs.find(([at]) => at === off); if (e) replay.a = e[1]; if (replay.a) a = replay.a; }
      else replay = null;
    }
    s.knobs = asKnobs(a);
    states.set(radio.n, radio.state()); dials.set(radio.n, a);
    for (const m of [states, dials]) for (const key of m.keys()) if (key < radio.n - KEEP) m.delete(key);
  };
  started = performance.now(); rendered = 0;
  want = msg.want; pump();
}

async function pump() {
  if (busy || !s) return;
  busy = true;
  while (s && s.frame < want) {
    const r = s.render(BLOCKS), frames = r.pcm.length / 2;
    rendered += frames / s.sr;
    postMessage({ type: 'chunk', frame: s.frame - frames, frames, pcm: r.pcm.buffer, notes: r.notes, bars: r.bars }, [r.pcm.buffer]);
    const speed = rendered / ((performance.now() - started) / 1000);
    thin = Math.max(0.35, Math.min(1, thin + (speed < 1.5 ? -0.05 : 0.02)));
    await new Promise((res) => setTimeout(res, 0));                // let messages in
  }
  busy = false;
}

/** A clip of bars from…to: the state before `from` and the dials of each bar (only where they change). */
function clip(from, to) {
  while (!states.has(from) && from < to) from++;
  if (!states.has(from)) return null;
  const k = [];
  let last = '';
  for (let b = from; b <= to && dials.has(b); b++) { const key = dials.get(b).join(); if (key !== last) { k.push([b - from, dials.get(b)]); last = key; } }
  return { v: 1, state: states.get(from), bars: to - from + 1, knobs: k };
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'start') start(m).catch((e) => postMessage({ type: 'error', message: String((e && e.message) || e) }));
  else if (m.type === 'want') { want = m.want; pump(); }
  else if (m.type === 'knobs') knobs = m.knobs;
  else if (m.type === 'clip') postMessage({ type: 'clip', clip: clip(m.from, m.to) });
  else if (m.type === 'stop') s = null;
};
