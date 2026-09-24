// main.js — Anthesis: the page. Wires the score, the piano and the picture together.
//
//   ?t=42      a still of second 42, no audio (for thumbnails and checking)
//   ?silent    play the picture without the piano
//
// The audio clock drives everything once it is running. Before that, and in
// ?silent, a wall clock stands in.

import { events, cues, duration, title } from './score.js';
import { StreamPiano } from '../lib/piano.js';
import { makeRenderer } from './render.js';
import { mountExtras, EXTRAS_CSS } from '../lib/extras.js';

const qs = new URLSearchParams(location.search);
const still = qs.has('t') ? Number(qs.get('t')) : null;
const silent = qs.has('silent');

// ------------------------------------------------------------------ clock --

const piano = new StreamPiano(events, duration + 6);
let wallStart = null;          // for ?silent, or if audio fails
let finished = false;
let heldAt = null;         // the last frame, held under the card when the piece ends

function now() {
  if (still !== null) return still;
  if (heldAt !== null) return heldAt;
  const a = piano.time;
  if (a !== null) return a;
  if (wallStart !== null) return (performance.now() - wallStart) / 1000;
  return 0;
}

// ------------------------------------------------------------------ sketch --

const host = document.getElementById('stage');

new window.p5((p) => {
  let r = null;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  p.setup = () => {
    const c = p.createCanvas(host.clientWidth, host.clientHeight);
    c.parent(host);
    p.pixelDensity(dpr());
    r = makeRenderer(host.clientWidth, host.clientHeight, dpr());
    if (still !== null) p.noLoop();
  };

  p.windowResized = () => {
    p.resizeCanvas(host.clientWidth, host.clientHeight);
    r = makeRenderer(host.clientWidth, host.clientHeight, dpr());
    if (still !== null) p.redraw();
  };

  p.draw = () => {
    const t = now();
    r.draw(p.drawingContext, t, {
      captions: piano.playing || wallStart !== null || still !== null,
      twinkle: still ?? performance.now() / 1000,
    });
    if (!finished && piano.playing && t > duration + 1.5) end();
    if (!finished && wallStart !== null && t > duration + 1.5) end();
  };
}, host);

// --------------------------------------------------------------------- UI --

const card = document.getElementById('card');
const go = document.getElementById('go');
const status = document.getElementById('status');

function say(s) { status.textContent = s; }

if (still !== null) {
  card.hidden = true;
} else if (silent) {
  go.textContent = 'Begin (silent)';
  say('No piano: the picture alone.');
} else {
  try { piano.prepare(); } catch (err) { say('This browser will not make sound here, so the picture plays alone.'); }
  piano.onStatus = (pn) => {
    if (pn.error) { say(`The piano failed to load (${pn.error.message}). Begin plays the picture alone.`); return; }
    if (pn.playing) return;
    const x = pn.speed ? `${pn.speed.toFixed(1)}× real time` : '';
    if (pn.done) say(`The piano is rendered: ${Math.round(pn.rendered)} s of music, made on this device.`);
    else if (pn.ready) say(`Rendering the piano on this device · ${x}. Ready.`);
    else say(`Rendering the piano on this device · ${x} · ${Math.ceil(pn.shortfall / Math.max(0.2, pn.speed))} s`);
  };
  say('Tuning the piano…');
}

async function begin() {
  finished = false;
  heldAt = null;
  card.classList.add('gone');
  document.body.classList.add('playing');
  if (silent || piano.error || !piano.ctx) { wallStart = performance.now(); return; }
  try {
    await piano.start();
  } catch (err) {
    wallStart = performance.now();
  }
}

function end() {
  finished = true;
  heldAt = now();
  piano.stop();
  wallStart = null;
  go.textContent = 'Again';
  say(`${title} · ${Math.round(duration)} s · an original piece for physically-modelled piano`);
  card.classList.remove('gone');
  document.body.classList.remove('playing');
}

go.addEventListener('click', begin);

const style = document.createElement('style');
style.textContent = EXTRAS_CSS;
document.head.appendChild(style);
mountExtras({
  slug: 'anthesis', title, subtitle: 'a poppy, from seed to bloom',
  events, seconds: duration, makeRenderer, piano, ink: '#f6ecda', onInk: '#1b1016',
});

// Space or a tap on the picture pauses. Suspending the audio context stops its
// clock, so the plant stops with it: there is nothing else to keep in step.
async function togglePause() {
  if (!piano.ctx || !piano.playing) return;
  if (piano.ctx.state === 'running') { await piano.ctx.suspend(); document.body.classList.add('paused'); }
  else { await piano.ctx.resume(); document.body.classList.remove('paused'); }
}
document.getElementById('stage').addEventListener('click', togglePause);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (!card.classList.contains('gone')) begin(); else togglePause();
});
