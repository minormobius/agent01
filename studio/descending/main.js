// main.js — Descending: the page. The score is the clock; the piano streams from pfsynth and the
// voice is sung whole (lib/chipsing.js) in the band worker as the page loads, then mixed in.
//
//   ?t=90     a still of second 90, no audio
//   ?silent   the picture without sound

import { events, duration, title } from './score.js';
import { StreamPiano } from '../lib/piano.js';
import { makeRenderer } from './render.js';
import { mountExtras, EXTRAS_CSS } from '../lib/extras.js';

const qs = new URLSearchParams(location.search);
const still = qs.has('t') ? Number(qs.get('t')) : null;
const silent = qs.has('silent');

const VOICE = new URL('./score.js', import.meta.url).href;
const piano = new StreamPiano(events, duration, { band: VOICE });
let wallStart = null, finished = false, heldAt = null;

function now() {
  if (still !== null) return still;
  if (heldAt !== null) return heldAt;
  const a = piano.time;
  if (a !== null) return a;
  if (wallStart !== null) return (performance.now() - wallStart) / 1000;
  return 0;
}

// ---- the canvas: sized from its own box, redrawn every frame ------------------------------------
const host = document.getElementById('stage'), canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
let draw = null;
function build() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = host.clientWidth, H = host.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  draw = makeRenderer(W, H, dpr);
}
new ResizeObserver(() => { build(); if (still !== null) draw(ctx, still); }).observe(host);
build();
function frame() {
  const t = now();
  try { draw(ctx, t); } catch (err) { console.error(err); }
  if (!finished && (piano.playing || wallStart !== null) && t > duration + 0.5) end();
  if (still === null) requestAnimationFrame(frame);
}
if (document.fonts?.ready) document.fonts.ready.then(() => { if (still !== null) draw(ctx, still); });
frame();

// ---- the card --------------------------------------------------------------------------------------
const card = document.getElementById('card'), go = document.getElementById('go'), status = document.getElementById('status');
const say = (s) => { status.textContent = s; };
if (still !== null) card.hidden = true;
else if (silent) { go.textContent = 'Begin (silent)'; say('No sound: the picture alone.'); }
else {
  try { piano.prepare(); } catch { say('This browser will not make sound here, so the picture plays alone.'); }
  piano.onStatus = (pn) => {
    if (pn.error) { say(`The voice failed to load (${pn.error.message}). Begin plays the picture alone.`); return; }
    if (pn.playing) return;
    const x = pn.speed ? `${pn.speed.toFixed(1)}× real time` : '';
    if (pn.waitingForBand) { say('Teaching the voice the song, on this device…'); return; }
    if (pn.done) say(`Ready: ${Math.round(pn.rendered)} s of piano and voice, made on this device.`);
    else if (pn.ready) say(`Rendering the piano on this device · ${x}. Ready.`);
    else say(`Rendering the piano on this device · ${x} · ${Math.ceil(pn.shortfall / Math.max(0.2, pn.speed))} s`);
  };
  say('Teaching the voice the song…');
}

async function begin() {
  finished = false; heldAt = null;
  card.classList.add('gone');
  document.body.classList.add('playing');
  if (silent || piano.error || !piano.ctx) { wallStart = performance.now(); return; }
  try { await piano.start(); } catch { wallStart = performance.now(); }
}
function end() {
  finished = true; heldAt = now();
  piano.stop(); wallStart = null;
  go.textContent = 'Again';
  say(`${title} · ${Math.round(duration)} s · Daisy Bell, for piano and a voice made of arithmetic`);
  card.classList.remove('gone');
  document.body.classList.remove('playing');
}
go.addEventListener('click', begin);

const style = document.createElement('style');
style.textContent = EXTRAS_CSS;
document.head.appendChild(style);
mountExtras({
  slug: 'descending', title, subtitle: 'Daisy Bell, sung by arithmetic', score: false,
  events, band: VOICE, seconds: duration, makeRenderer, piano, ink: '#efe4cc', onInk: '#21160d',
});

async function togglePause() {
  if (!piano.ctx || !piano.playing) return;
  if (piano.ctx.state === 'running') { await piano.ctx.suspend(); document.body.classList.add('paused'); }
  else { await piano.ctx.resume(); document.body.classList.remove('paused'); }
}
host.addEventListener('click', togglePause);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (!card.classList.contains('gone')) begin(); else togglePause();
});
