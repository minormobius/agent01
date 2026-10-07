// music-worker.js — the endless duo, off the main thread. Composes and renders ahead of what is
// playing, and posts half a second at a time (each with the notes struck in it, for the light).
//
// The page tells it the clock (how scene seconds map to the real moment, and where), and what it
// has played so far; the worker keeps `lead` seconds rendered ahead of that. If it cannot keep up
// (a slow device), it thins the music out before it falls behind: density follows its own speed.
import { Music, parseWav } from './music.js';
import { sky } from './astro.js';
import { forecast, strikesIn, thunderDelay } from './weather.js';

const WASM = new URL('../vendor/pfsynth/pfstream.wasm', import.meta.url);
const BODY = new URL('../vendor/pfsynth/bodies/g34.wav', import.meta.url);
const BLOCKS = 11;                                   // ≈ 0.5 s at 44.1 kHz (2048-frame blocks)

let music = null, clock = null, place = null, want = 0, busy = false, started = 0, rendered = 0, density = 1;

/** The moment (ms) at scene second `t`, from the page's clock model. */
const msAt = (t) => (clock.speed === 0 ? clock.wallMs + (t - clock.tAt) * 1000 : clock.speed < 0 ? clock.msBase : clock.msBase + (t - clock.tBase) * 86400000 / clock.speed);

const wxAt = (t) => forecast(clock.seed, msAt(t), clock.lat, clock.lon, clock.wx);
function cond(t) {
  const ms = msAt(t), sk = sky(ms, clock.lat, clock.lon), D = Math.PI / 180;
  const el = Math.sin(sk.sun.alt * D), wx = wxAt(t), bar = music.composer.barSec;
  // thunder whose sound arrives in this bar (the flash was up to ~17 s earlier): the same schedule
  // the picture flashes by, so the piano's low cluster lands with the roll
  const thunder = strikesIn(clock.seed, t - 18, t + bar, (s) => wxAt(s).storm)
    .map((s) => ({ t: s.t + thunderDelay(s.dist), dist: s.dist })).filter((s) => s.t >= t && s.t < t + bar);
  return {
    el, rising: sk.sun.az < 180, night: Math.min(1, Math.max(0, (0.05 - el) * 4)),
    cover: wx.cover, rain: wx.rain, snow: wx.snow, fog: wx.fog, storm: wx.storm, thunder,
    moon: sk.moonLit * (1 - wx.overcast), place, density,
  };
}

async function start(msg) {
  const [w, b] = await Promise.all([fetch(WASM).then((r) => r.arrayBuffer()), fetch(BODY).then((r) => r.arrayBuffer())]);
  const { instance } = await WebAssembly.instantiate(w, {});
  clock = msg.clock; place = msg.place ?? null;
  music = new Music(instance.exports, { seed: msg.seed, biome: msg.biome, bpm: msg.bpm, sampleRate: msg.sampleRate, body: parseWav(b), t0: msg.t0 });
  music.cond = cond;
  started = performance.now(); rendered = 0;
  want = msg.want; pump();
}

async function pump() {
  if (busy || !music) return;
  busy = true;
  while (music && music.frame < want) {
    const r = music.render(BLOCKS), frames = r.pcm.length / 2;
    rendered += frames / music.sr;
    postMessage({ type: 'chunk', frame: music.frame - frames, frames, pcm: r.pcm.buffer, notes: r.notes, describe: r.describe }, [r.pcm.buffer]);
    // keep ahead: if the render runs at under 1.6× real time, thin the music (it recovers when it can)
    const speed = rendered / ((performance.now() - started) / 1000);
    density = Math.max(0.35, Math.min(1, density + (speed < 1.6 ? -0.05 : 0.02)));
    await new Promise((res) => setTimeout(res, 0));                // let messages in
  }
  busy = false;
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'start') start(m).catch((e) => postMessage({ type: 'error', message: String(e && e.message || e) }));
  else if (m.type === 'want') { want = m.want; pump(); }
  else if (m.type === 'clock') { clock = m.clock; if ('place' in m) place = m.place; }
  else if (m.type === 'stop') { music = null; }
};
