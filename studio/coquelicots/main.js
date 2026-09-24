// main.js — Coquelicots: the page. The score is the clock; paint accumulates.
//
//   ?t=90     a still of second 90, no audio (the painting is replayed to that moment)
//   ?silent   the picture without the piano
//
// Three layers, bottom to top: the WORLD canvas, which only ever gains paint
// (lib/paint.js Painter, marks from world.js); the PLANT canvas, repainted at
// 12 drawings a second (poppy.js); and the paper's tooth, laid over both so the
// moving paint sits in the same paper as the still paint.

import { events, cues, duration, title } from './score.js';
import { StreamPiano } from '../lib/piano.js';
import { makeRenderer } from './render.js';
import { mountExtras, EXTRAS_CSS } from '../lib/extras.js';

const qs = new URLSearchParams(location.search);
const still = qs.has('t') ? Number(qs.get('t')) : null;
const silent = qs.has('silent');

const piano = new StreamPiano(events, duration + 6);
let wallStart = null;
let finished = false;
let heldAt = null;

function now() {
  if (still !== null) return still;
  if (heldAt !== null) return heldAt;
  const a = piano.time;
  if (a !== null) return a;
  if (wallStart !== null) return (performance.now() - wallStart) / 1000;
  return 0;
}

const host = document.getElementById('stage');

new window.p5((p) => {
  let r = null;
  const build = () => {
    r = makeRenderer(host.clientWidth, host.clientHeight, Math.min(2, window.devicePixelRatio || 1));
  };

  p.setup = () => {
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    const c = p.createCanvas(host.clientWidth, host.clientHeight);
    c.parent(host);
    build();
    if (still !== null) p.noLoop();
  };

  // A resize rebuilds the painting and replays it to now, which is seconds of
  // work late in the piece, so wait until the window has stopped moving.
  let resizeTimer = null;
  p.windowResized = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      p.resizeCanvas(host.clientWidth, host.clientHeight);
      build();
      if (still !== null) p.redraw();
    }, 250);
  };

  p.draw = () => {
    const t = now();
    r.draw(p.drawingContext, t);
    if (!finished && (piano.playing || wallStart !== null) && t > duration + 1) end();
  };
}, host);

// --------------------------------------------------------------------- UI --

const card = document.getElementById('card');
const go = document.getElementById('go');
const status = document.getElementById('status');
const say = (s) => { status.textContent = s; };

if (still !== null) {
  card.hidden = true;
} else if (silent) {
  go.textContent = 'Begin (silent)';
  say('No piano: the picture alone.');
} else {
  try { piano.prepare(); } catch { say('This browser will not make sound here, so the picture plays alone.'); }
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
  try { await piano.start(); } catch { wallStart = performance.now(); }
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
  slug: 'coquelicots', title, subtitle: 'a field, painted outward from one seed',
  events, seconds: duration, makeRenderer, piano,
});

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
