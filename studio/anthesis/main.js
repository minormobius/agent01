// main.js — Anthesis: the page. Wires the score, the piano and the picture together.
//
//   ?t=42      a still of second 42, no audio (for thumbnails and checking)
//   ?silent    play the picture without the piano
//
// The audio clock drives everything once it is running. Before that, and in
// ?silent, a wall clock stands in.

import { events, cues, duration, title } from './score.js';
import { StreamPiano } from '../lib/piano.js';
import { clamp, span, ease, lerp, rgba } from './util.js';
import {
  makeClock, lightAt, drawSky, makeStars, drawStars, drawLights, makeHills, drawHills,
  makeSoil, makeDrops, drawDropsFalling, drawSplashes, drawSoak, imbibed,
} from './world.js';
import { makePlant, drawPlant, flowerPoint } from './plant.js';

const qs = new URLSearchParams(location.search);
const still = qs.has('t') ? Number(qs.get('t')) : null;
const silent = qs.has('silent');

const clock = makeClock(cues);
const P = makePlant(cues);
const drops = makeDrops(cues);
const stars = makeStars();
const hills = makeHills();
const day0 = Math.floor(clock(0));

const CAPTIONS = [
  [0, 'a poppy seed, in the dark'],
  [cues.drops[0].at, 'water'],
  [cues.crack, 'the root goes first'],
  [cues.hypocotyl, 'the shoot comes up hooked, head down'],
  [cues.emerge, 'light'],
  [cues.cotyledons, 'seed leaves'],
  [cues.leaves[0], 'true leaves'],
  [cues.bud, 'a bud, nodding'],
  [cues.lift, 'it lifts its head'],
  [cues.petals[0], 'anthesis'],
  [cues.last, ''],
];

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
  let W, H, gy, u, soil = null;

  const layout = () => {
    W = host.clientWidth; H = host.clientHeight;
    gy = Math.round(H * 0.7);
    u = Math.min(H * 0.98, W * 1.45);
    soil?.remove();
    soil = makeSoil(p, W, H, gy);
  };

  p.setup = () => {
    const c = p.createCanvas(host.clientWidth, host.clientHeight);
    c.parent(host);
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    layout();
    if (still !== null) p.noLoop();
  };

  p.windowResized = () => {
    p.resizeCanvas(host.clientWidth, host.clientHeight);
    layout();
    if (still !== null) p.redraw();
  };

  p.draw = () => {
    const t = now();
    const ctx = p.drawingContext;
    const env = lightAt(clock(t));
    P.imbibed = imbibed(t, drops);

    // Sky, in screen space: it does not zoom.
    const sky = drawSky(p, W, gy, env);
    drawStars(p, W, gy, env, stars, still ?? performance.now() / 1000);
    drawLights(p, W, gy, env);
    drawHills(p, W, H, gy, env, hills, sky);

    // The world: ground at y = 0, units of u. The camera eases toward the
    // flower after it opens.
    const zoom = 1 + 0.13 * ease(span(t, cues.bloom - 4, cues.end - 4));
    const F = zoom > 1 ? flowerPoint(P, t, env) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(W / 2, gy);
    ctx.scale(u, u);
    ctx.translate(F.x, F.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-F.x, -F.y);

    // Soil slab (image in pixels, so undo the unit scale for it).
    ctx.save();
    ctx.scale(1 / u, 1 / u);
    ctx.drawImage(soil.elt ?? soil.canvas, -W / 2, 0, W, soil.height);
    ctx.restore();
    drawSoak(p, t, drops);
    // Night falls on the cutaway too.
    ctx.fillStyle = rgba([6, 8, 22], (1 - env.light) * 0.5);
    ctx.fillRect(-W / u, 0, (2 * W) / u, (H - gy) / u + 0.1);
    // Surface line.
    ctx.strokeStyle = rgba([150, 118, 88], 0.55 + 0.3 * env.light);
    ctx.lineWidth = 0.0025;
    ctx.beginPath(); ctx.moveTo(-W / u, 0); ctx.lineTo(W / u, 0); ctx.stroke();

    // Shadow of the plant on the soil, cast away from the sun.
    if (t > cues.cotyledons) {
      const h = clamp((t - cues.cotyledons) / 40);
      const sx = -env.sunX * 0.09 * h;
      const g = ctx.createRadialGradient(sx, 0, 0, sx, 0, 0.1 + 0.08 * h);
      g.addColorStop(0, `rgba(20,12,8,${0.28 * env.light})`);
      g.addColorStop(1, 'rgba(20,12,8,0)');
      ctx.save(); ctx.scale(1, 0.12);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, 0, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawPlant(p, P, t, env);
    drawDropsFalling(p, t, drops, -gy / u - 0.05, env);
    drawSplashes(p, t, drops, env);
    ctx.restore();

    drawOverlay(p, t, env);
    if (!finished && piano.playing && t > duration + 1.5) end();
    if (!finished && wallStart !== null && t > duration + 1.5) end();
  };

  function drawOverlay(p, t, env) {
    const ctx = p.drawingContext;
    const pad = Math.max(14, Math.min(W, H) * 0.03);
    // The timelapse camera's timestamp.
    const ph = clock(t);
    const day = Math.floor(ph) - day0 + 1;
    const mins = Math.floor((((ph % 1) + 1) % 1) * 24 * 60);
    const stamp = `DAY ${String(day).padStart(2, '0')}  ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    ctx.font = `500 ${Math.round(Math.max(11, W * 0.011))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.2 * (1 - env.light)})`;
    ctx.textBaseline = 'top';
    ctx.fillText(stamp, pad, pad);

    // What is happening, in a line, down in the soil.
    let cap = null, capAt = 0, next = Infinity;
    for (let i = 0; i < CAPTIONS.length; i++) {
      if (t >= CAPTIONS[i][0]) { cap = CAPTIONS[i][1]; capAt = CAPTIONS[i][0]; next = CAPTIONS[i + 1]?.[0] ?? Infinity; }
    }
    if (cap && (piano.playing || wallStart !== null || still !== null)) {
      const a = ease(span(t, capAt, capAt + 1)) * (1 - ease(span(t, next - 0.8, next)));
      ctx.font = `italic 400 ${Math.round(Math.max(15, Math.min(W, H) * 0.028))}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = `rgba(246,236,218,${0.85 * a})`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(cap, pad, H - pad);
    }
  }
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
