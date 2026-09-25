// main.js — The Bommie, the page: the soundtrack is the clock, the reef is drawn at its time.
//
//   ?t=42&still     one frame at 42 s, no sound (stills, tests, the share card)
//   ?smooth         the cast at the full frame rate instead of on twos
//
// The soundtrack renders in a worker as the page loads (sound.js, ~2 s on a desktop), so the
// Watch button can start it at once. The picture is a pure function of the song's time:
// seeking is just a new time.

import { makeRenderer, frameState, project } from './render.js';
import { particlesAt, subtitleAt, DURATION } from './world.js';
import { CAST, TITLE, CREDITS } from './script.js';

const qs = new URLSearchParams(location.search);
const still = qs.has('still');
const ONES = qs.has('smooth');
// stop-motion: the cast is posed 12 times a second, as a stop-motion animator shoots on twos;
// the water (caustics, snow, the light) runs smooth, as a real tank would
const pose = (t) => (ONES ? t : Math.floor(t * 12) / 12);

// ---- the canvases ------------------------------------------------------------------------
const cv = document.getElementById('reef'), fx = document.getElementById('fx'), fctx = fx.getContext('2d');
let R = null, lostAt = 0;
function makeGL() {
  try { R = makeRenderer(cv); lostAt = 0; } catch (e) { R = null; lostAt = performance.now(); console.error(e); }
}
cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R = null; lostAt = performance.now(); });
cv.addEventListener('webglcontextrestored', () => makeGL());
makeGL();
// the reef's resolution follows the time between frames: a raymarch is costly, and a phone
// would rather see a softer picture at 30 frames than a sharp one at 8. Under water, soft is fine
let scale = still ? 1 : 0.6, frameMs = 16, last = 0;
function size() {
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(64, Math.round(w * scale)), H = Math.max(64, Math.round(h * scale));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  if (fx.width !== Math.round(w * dpr) || fx.height !== Math.round(h * dpr)) { fx.width = Math.round(w * dpr); fx.height = Math.round(h * dpr); }
}
size();
if (window.ResizeObserver) new ResizeObserver(() => { size(); if (still) frame(); }).observe(cv);

// ---- the clock ---------------------------------------------------------------------------
const clock = { t: Number(qs.get('t') || 0), playing: false, ctx: null, src: null, startAt: 0, from: 0 };
let audio = null;                                       // { buffer } once the worker is done
const soundReady = new Promise((resolve) => {
  if (still) return resolve(null);
  try {
    const w = new Worker(new URL('./sound-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { audio = e.data; resolve(audio); w.terminate(); };
    w.onerror = () => resolve(null);
    w.postMessage({ rate: 32000 });
  } catch { resolve(null); }
});
function now() {
  if (!clock.playing) return clock.t;
  if (clock.src) return clock.from + (clock.ctx.currentTime - clock.startAt);
  return clock.from + (performance.now() / 1000 - clock.startAt);
}
function playFrom(t, withSound) {
  stop();
  clock.from = Math.max(0, Math.min(DURATION - 0.05, t));
  if (withSound && audio) {
    if (!clock.ctx) clock.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = clock.ctx;
    ctx.resume();
    const buf = ctx.createBuffer(2, audio.L.length, audio.rate);
    buf.copyToChannel(audio.L, 0); buf.copyToChannel(audio.R, 1);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    clock.startAt = ctx.currentTime + 0.05;
    src.start(clock.startAt, clock.from);
    clock.src = src;
  } else {
    clock.startAt = performance.now() / 1000;
  }
  clock.playing = true;
  document.body.classList.add('playing');
}
function stop() {
  if (clock.src) { try { clock.src.stop(); } catch {} clock.src = null; }
  clock.t = now(); clock.playing = false;
}

// ---- the overlays -----------------------------------------------------------------------
const subEl = document.getElementById('sub'), titleEl = document.getElementById('title'), credEl = document.getElementById('credits');
const bar = document.getElementById('bar'), fill = document.getElementById('fill');
titleEl.innerHTML = `<div class="show">${TITLE.show}</div><div class="ep">${TITLE.episode}</div>`;
credEl.innerHTML = CREDITS.lines.map((l, i) => `<div class="${i ? '' : 'show'}">${l}</div>`).join('');
let lastSub = '';
function overlays(t) {
  titleEl.style.opacity = t < 0.6 ? t / 0.6 : t < 5.2 ? 1 : Math.max(0, 1 - (t - 5.2) / 0.8);
  credEl.style.opacity = t < CREDITS.at ? 0 : Math.min(1, (t - CREDITS.at) / 1.5);
  const s = subtitleAt(t), key = s ? s.who + s.text : '';
  if (key !== lastSub) {
    lastSub = key;
    subEl.innerHTML = s ? `<b style="color:${CAST[s.who].color}">${CAST[s.who].name}</b> ${s.text}` : '';
    subEl.hidden = !s;
  }
  fill.style.width = `${(100 * t) / DURATION}%`;
}
function particles(S, t) {
  const W = fx.width, H = fx.height;
  fctx.clearRect(0, 0, W, H);
  for (const q of particlesAt(pose(t))) {
    const s = project(S, q.p, W, H);
    if (!s) continue;
    const r = Math.max(0.8, (q.r * H) / (s[2] * S.cam.tanF * 2));
    fctx.globalAlpha = Math.max(0, Math.min(1, q.a)) * Math.min(1, 6 / s[2]);
    if (q.kind === 'bubble') { fctx.strokeStyle = 'rgba(230,250,255,0.9)'; fctx.lineWidth = Math.max(1, r * 0.25); fctx.beginPath(); fctx.arc(s[0], s[1], r, 0, 7); fctx.stroke(); fctx.fillStyle = 'rgba(255,255,255,0.8)'; fctx.beginPath(); fctx.arc(s[0] - r * 0.35, s[1] - r * 0.35, r * 0.25, 0, 7); fctx.fill(); }
    else {
      // sand: soft grains, a haze more than a hail
      const g = fctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 1.6);
      g.addColorStop(0, 'rgba(236,222,186,0.75)'); g.addColorStop(1, 'rgba(236,222,186,0)');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(s[0], s[1], r * 1.6, 0, 7); fctx.fill();
    }
  }
  fctx.globalAlpha = 1;
}

// ---- the frame ---------------------------------------------------------------------------
function frame() {
  const t0 = performance.now();
  let t = now();
  if (clock.playing && t >= DURATION) { stop(); clock.t = DURATION; t = DURATION; document.body.classList.remove('playing'); document.body.classList.add('ended'); }
  if (!R && lostAt && performance.now() - lostAt > 1500) makeGL();
  const S = frameState(t, pose(t));
  if (R) R.draw(S, t);
  particles(S, t);
  overlays(t);
  if (last && !still) {
    frameMs = frameMs * 0.9 + (t0 - last) * 0.1;
    const was = scale;
    if (frameMs > 40) scale = Math.max(0.3, scale - 0.02); else if (frameMs < 24) scale = Math.min(1, scale + 0.01);
    if (Math.abs(was - scale) > 0.049 || (was !== scale && Math.round(was * 50) !== Math.round(scale * 50))) size();
  }
  last = t0;
}
let complained = false;
function loop() {
  try { frame(); } catch (e) { if (!complained) { complained = true; console.error('bommie frame', e); } }
  if (!still) requestAnimationFrame(loop);
}

// ---- the controls ------------------------------------------------------------------------
const playBtn = document.getElementById('play'), quietBtn = document.getElementById('quiet'), status = document.getElementById('status');
soundReady.then((a) => { status.textContent = a ? '' : 'The sound could not be made here; it plays without.'; playBtn.disabled = false; playBtn.textContent = '▶ Watch'; });
playBtn.addEventListener('click', () => { const again = clock.t >= DURATION - 0.1; document.body.classList.remove('ended', 'paused'); playFrom(again ? 0 : clock.t, true); });
quietBtn.addEventListener('click', () => { const again = clock.t >= DURATION - 0.1; document.body.classList.remove('ended', 'paused'); playFrom(again ? 0 : clock.t, false); });
bar.addEventListener('click', (e) => {
  const r = bar.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width) * DURATION;
  if (clock.playing) playFrom(t, !!clock.src); else { clock.t = t; }
});
addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); if (clock.playing) { const hadSound = !!clock.src; stop(); document.body.classList.remove('playing'); document.body.classList.add('paused'); clock.hadSound = hadSound; } else { document.body.classList.remove('paused'); playFrom(clock.t, clock.hadSound !== false); } }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const t = now() + (e.key === 'ArrowRight' ? 5 : -5); if (clock.playing) playFrom(t, !!clock.src); else clock.t = Math.max(0, t); }
});

if (still) { document.body.classList.add('playing'); frame(); }
else loop();
window.__bommie = { ready: true, clock, frame, get scale() { return scale; }, get R() { return R; } };
