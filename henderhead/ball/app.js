// app.js — the arena, the fan, the spread plot and the Poincaré section.
//
// The engine owns the physics; this file owns pixels. Every typed array it
// hands back points into WebAssembly memory and dies at the next engine call,
// so nothing here holds one across a frame.

import { loadEngine } from './engine.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

const S = {
  radius: 1, gravity: 1, restitution: 1,
  offset: 0.145,          // where the video drops it, measured off the video
  height: 0,              // and from what height — the energy control
  delta: 0.02,            // radians of measurement error
  depth: 4,               // his own horizon: "hard to predict four bounces ahead"
  futures: 384,
  samples: 10,            // points drawn per flight per future
  speed: 1,
  playing: true,
  trail: true,
};

/** Above this the era is called chaotic. Nothing magic — it is the middle of
 *  the range the spread actually visits, and the page says so. */
const WILD = 0.18;

let eng = null;
let actx = null, sctx = null, pctx = null;

(async function start() {
  try {
    eng = await loadEngine(new URL('./bouncer.wasm', import.meta.url));
  } catch (err) {
    $('status').textContent = 'the engine did not load: ' + err;
    return;
  }
  actx = $('arena').getContext('2d');
  sctx = $('spread').getContext('2d');
  pctx = $('section').getContext('2d');
  readHash();
  eng.init(S);
  eng.buildSurvey(700, 45);
  wire();
  sizeCanvases();
  syncOutputs();
  addEventListener('resize', sizeCanvases);
  requestAnimationFrame(loop);
})();

function sizeCanvases() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const a = $('arena');
  const w = Math.round((a.clientWidth || 700) * dpr);
  if (w > 0 && a.width !== w) { a.width = a.height = w; }
  for (const [id, h] of [['spread', 105], ['section', 210]]) {
    const c = $(id);
    const want = Math.round((c.clientWidth || 300) * dpr);
    const hh = Math.round(h * dpr);
    if (c.width !== want || c.height !== hh) { c.width = want; c.height = hh; }
  }
}

// ------------------------------------------------------------------- loop --

let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (S.playing && dt > 0) eng.step(dt * S.speed, 0.008);
  eng.buildFan(S.futures, S.delta, S.depth, S.samples);
  drawArena();
  drawSpread();
  drawSection();
  drawStatus();
}

// ----------------------------------------------------------------- arena --

function drawArena() {
  const cv = $('arena');
  const W = cv.width;
  actx.fillStyle = '#071624';
  actx.fillRect(0, 0, W, W);
  const cx = W / 2, cy = W / 2;
  const px = (W * 0.455) / S.radius;

  // the fan, drawn as one path per future so a few hundred of them stay cheap,
  // with the stroke colour stepping from near-future to far-future
  const n = eng.fanCount();
  const pts = eng.fanPoints();
  const fan = eng.fan();
  const per = S.samples;
  actx.lineWidth = Math.max(0.6, W * 0.0011);
  actx.lineJoin = 'round';
  actx.lineCap = 'round';
  for (let d = 0; d < S.depth; d++) {
    const u = S.depth === 1 ? 0 : d / (S.depth - 1);
    // orange for the next bounce, violet for the far end
    const r = Math.round(255 + u * (140 - 255));
    const g = Math.round(154 + u * (107 - 154));
    const b = Math.round(78 + u * (216 - 78));
    actx.strokeStyle = `rgba(${r},${g},${b},${0.42 - 0.22 * u})`;
    actx.beginPath();
    for (let i = 0; i < n; i++) {
      const base = (i * pts + d * per) * 2;
      // join each flight to where the previous one ended, so a future reads as
      // one continuous path rather than a row of detached arcs
      if (d === 0) {
        actx.moveTo(cx + eng.ball().x * px, cy - eng.ball().y * px);
      } else {
        actx.moveTo(cx + fan[base - 2] * px, cy - fan[base - 1] * px);
      }
      for (let j = 0; j < per; j++) {
        actx.lineTo(cx + fan[base + j * 2] * px, cy - fan[base + j * 2 + 1] * px);
      }
    }
    actx.stroke();
  }

  // the ball's own recent path
  if (S.trail) {
    const tr = eng.trail();
    if (tr.length > 3) {
      actx.strokeStyle = 'rgba(159,201,238,0.22)';
      actx.lineWidth = Math.max(1, W * 0.0012);
      actx.beginPath();
      actx.moveTo(cx + tr[0] * px, cy - tr[1] * px);
      for (let i = 2; i < tr.length; i += 2) actx.lineTo(cx + tr[i] * px, cy - tr[i + 1] * px);
      actx.stroke();
    }
  }

  // the rim
  actx.strokeStyle = 'rgba(219,232,244,0.8)';
  actx.lineWidth = Math.max(1, W * 0.0016);
  actx.beginPath();
  actx.arc(cx, cy, S.radius * px, 0, TAU);
  actx.stroke();

  // the ball
  const b = eng.ball();
  actx.fillStyle = '#fff';
  actx.beginPath();
  actx.arc(cx + b.x * px, cy - b.y * px, W * 0.0075, 0, TAU);
  actx.fill();
  actx.strokeStyle = '#071624';
  actx.lineWidth = Math.max(1, W * 0.002);
  actx.stroke();
}

// ---------------------------------------------------------------- spread --

function drawSpread() {
  const cv = $('spread');
  const h = eng.spreadHistory();
  sctx.clearRect(0, 0, cv.width, cv.height);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (h.length < 4) return;
  const t0 = h[0], t1 = Math.max(h[h.length - 2], t0 + 1);
  const X = (t) => ((t - t0) / (t1 - t0)) * cv.width;
  const Y = (v) => cv.height - v * (cv.height - 4 * dpr) - 2 * dpr;

  // the threshold the era badge uses
  sctx.strokeStyle = 'rgba(123,156,184,0.35)';
  sctx.setLineDash([3 * dpr, 3 * dpr]);
  sctx.lineWidth = dpr;
  sctx.beginPath();
  sctx.moveTo(0, Y(WILD));
  sctx.lineTo(cv.width, Y(WILD));
  sctx.stroke();
  sctx.setLineDash([]);

  const grad = sctx.createLinearGradient(0, Y(1), 0, Y(0));
  grad.addColorStop(0, '#ff9a4e');
  grad.addColorStop(1, '#7fe3c4');
  sctx.strokeStyle = grad;
  sctx.lineWidth = 1.5 * dpr;
  sctx.beginPath();
  sctx.moveTo(X(h[0]), Y(h[1]));
  for (let i = 2; i < h.length; i += 2) sctx.lineTo(X(h[i]), Y(h[i + 1]));
  sctx.stroke();
}

// --------------------------------------------------------------- section --

function drawSection() {
  const cv = $('section');
  pctx.fillStyle = '#0c1f31';
  pctx.fillRect(0, 0, cv.width, cv.height);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const X = (a) => ((a + Math.PI) / TAU) * cv.width;
  const Y = (s) => ((1 - s) / 2) * cv.height;

  // the portrait first, dim: hundreds of other orbits on the same energy
  // surface, which is what makes the islands visible at all
  const sv = eng.survey();
  pctx.fillStyle = 'rgba(140,107,216,0.30)';
  const sr = Math.max(0.7, dpr * 0.6);
  for (let i = 0; i < sv.length; i += 2) {
    pctx.fillRect(X(sv[i]) - sr / 2, Y(sv[i + 1]) - sr / 2, sr, sr);
  }

  const sec = eng.section();
  pctx.fillStyle = 'rgba(159,201,238,0.75)';
  const r = Math.max(0.7, dpr * 0.7);
  for (let i = 0; i < sec.length; i += 2) {
    pctx.fillRect(X(sec[i]) - r / 2, Y(sec[i + 1]) - r / 2, r, r);
  }
  // the most recent bounce, so you can see where on the section you are
  if (sec.length >= 2) {
    pctx.fillStyle = '#ff9a4e';
    pctx.beginPath();
    pctx.arc(X(sec[sec.length - 2]), Y(sec[sec.length - 1]), 2.6 * dpr, 0, TAU);
    pctx.fill();
  }
  pctx.strokeStyle = 'rgba(123,156,184,0.25)';
  pctx.lineWidth = dpr;
  pctx.beginPath();
  pctx.moveTo(0, cv.height / 2);
  pctx.lineTo(cv.width, cv.height / 2);
  pctx.stroke();
}

// ---------------------------------------------------------------- status --

function drawStatus() {
  const spread = eng.spreadAt(S.depth - 1);
  const wild = spread > WILD;
  $('status').innerHTML =
    `t <b>${eng.clock().toFixed(1)}</b>` +
    `<span>bounces <b>${eng.bounces()}</b></span>` +
    `<span>λ <b>${eng.lyapunov().toFixed(3)}</b>/s, <b>${eng.lyapunovPerBounce().toFixed(2)}</b>/bounce</span>` +
    `<span>energy drift <b>${fmtExp(eng.energyDrift())}</b></span>` +
    `<span>spread after ${S.depth} <b>${spread.toFixed(3)}</b></span>` +
    `<span class="era ${wild ? 'wild' : 'calm'}">${wild ? 'chaotic era' : 'stable era'}</span>`;
}

const fmtExp = (v) => (Math.abs(v) < 1e-14 ? '0' : v.toExponential(1));

// ---------------------------------------------------------------- wiring --

function wire() {
  $('play').addEventListener('click', () => {
    S.playing = !S.playing;
    $('play').textContent = S.playing ? '❚❚ pause' : '▶ play';
    $('play').setAttribute('aria-pressed', String(S.playing));
  });
  $('drop').addEventListener('click', () => { eng.reset(S.offset, S.height); writeHash(); });
  $('trail').addEventListener('click', () => {
    S.trail = !S.trail;
    $('trail').setAttribute('aria-pressed', String(S.trail));
  });

  slider('speed', (v) => { S.speed = v; });
  slider('delta', (v) => { S.delta = v; });
  slider('depth', (v) => { S.depth = Math.round(v); });
  slider('futures', (v) => { S.futures = Math.round(v); });
  slider('offset', (v) => { S.offset = v; eng.reset(S.offset, S.height); });
  // the drop height *is* the energy, so the phase portrait changes with it
  slider('height', (v) => { S.height = v; eng.reset(S.offset, S.height); eng.buildSurvey(700, 45); });
  // gravity only sets the timescale — rescale t and any g becomes 1 — so the
  // portrait is untouched by it and is not rebuilt
  slider('gravity', (v) => { S.gravity = v; eng.setParams(S); eng.reset(S.offset, S.height); });
  slider('rest', (v) => { S.restitution = v; eng.setParams(S); });

  // clicking the section launches the ball from that state
  $('section').addEventListener('click', (ev) => {
    const cv = $('section');
    const r = cv.getBoundingClientRect();
    const angle = ((ev.clientX - r.left) / r.width) * TAU - Math.PI;
    const sin = 1 - ((ev.clientY - r.top) / r.height) * 2;
    if (eng.launchFromSection(angle, sin)) writeHash();
  });

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); $('play').click(); }
    if (e.key === 'r') $('drop').click();
  });
}

function slider(id, set) {
  $(id).addEventListener('input', (e) => {
    set(parseFloat(e.target.value));
    syncOutputs();
    writeHash();
  });
}

function syncOutputs() {
  $('speed').value = String(S.speed);
  $('delta').value = String(S.delta);
  $('depth').value = String(S.depth);
  $('futures').value = String(S.futures);
  $('offset').value = String(S.offset);
  $('height').value = String(S.height);
  $('gravity').value = String(S.gravity);
  $('rest').value = String(S.restitution);
  $('speed-o').textContent = S.speed.toFixed(1) + '×';
  $('delta-o').textContent = S.delta === 0 ? 'exact' : S.delta.toFixed(3);
  $('depth-o').textContent = S.depth + ' bnc';
  $('futures-o').textContent = String(S.futures);
  $('offset-o').textContent = S.offset.toFixed(3);
  $('height-o').textContent = S.height.toFixed(2);
  $('gravity-o').textContent = S.gravity.toFixed(2);
  $('rest-o').textContent = S.restitution.toFixed(2);
  $('trail').setAttribute('aria-pressed', String(S.trail));
}

// ------------------------------------------------------------------ hash --

function writeHash() {
  const p = new URLSearchParams();
  for (const k of ['offset', 'height', 'delta', 'depth', 'futures', 'gravity', 'restitution']) p.set(k, String(S[k]));
  const h = '#' + p.toString();
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (k, lo, hi, cur) => {
    const v = parseFloat(p.get(k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : cur;
  };
  S.offset = num('offset', -0.9, 0.9, S.offset);
  S.height = num('height', -0.95, 0.5, S.height);
  S.delta = num('delta', 0, 0.08, S.delta);
  S.depth = Math.round(num('depth', 1, 8, S.depth));
  S.futures = Math.round(num('futures', 16, 1024, S.futures));
  S.gravity = num('gravity', 0.02, 3, S.gravity);
  S.restitution = num('restitution', 0.5, 1, S.restitution);
}
