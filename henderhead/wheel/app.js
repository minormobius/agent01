// app.js — the wheel, the gauge, the divergence plot and the controls.
//
// The engine owns the physics; this file owns pixels. Every typed array it
// hands back points into WebAssembly memory and dies at the next engine call,
// so nothing here holds one across a frame.

import { loadEngine } from './engine.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

/** Physical parameters, and the two that are only about watching. */
const S = {
  n: 24, q: 1.2, k: 0.2, nu: 10, inertia: 5, g: 9.81, radius: 1, spread: 0.7,
  speed: 1,
  playing: true,
  twin: false,
  lorenz: false,
};

/** Substep size: the wheel is smooth but chaotic, and the whole subject is how
 *  fast small errors grow, so this is tighter than the picture needs. */
const MAX_H = 2e-3;
/** Seconds of wheel time between trace samples. */
const SAMPLE = 0.02;

let eng = null;
let wctx = null, gctx = null, dctx = null;
/** log10 separation against time, for the divergence plot. */
let div = [];

(async function start() {
  try {
    eng = await loadEngine(new URL('./waterwheel.wasm', import.meta.url));
  } catch (err) {
    $('status').textContent = 'the engine did not load: ' + err;
    return;
  }
  wctx = $('wheel').getContext('2d');
  gctx = $('gauge').getContext('2d');
  dctx = $('diverge').getContext('2d');
  readHash();
  eng.init(S);
  eng.reset(0.05, 1e-9);
  wire();
  sizeCanvases();
  syncOutputs();
  addEventListener('resize', sizeCanvases);
  requestAnimationFrame(loop);
})();

// ------------------------------------------------------------------- loop --

let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (S.playing && dt > 0) {
    const sim = dt * S.speed;
    const sub = Math.min(64, Math.max(1, Math.ceil(sim / MAX_H)));
    eng.step(sim, sub, SAMPLE);
    const sep = eng.separation();
    div.push([eng.elapsed(), Math.log10(Math.max(sep, 1e-18))]);
    if (div.length > 4000) div.splice(0, div.length - 4000);
  }
  drawWheel();
  drawGauge();
  drawDiverge();
  drawStatus();
}

function sizeCanvases() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cv = $('wheel');
  const w = Math.round((cv.clientWidth || 700) * dpr);
  if (w > 0 && cv.width !== w) { cv.width = cv.height = w; }
  for (const id of ['gauge', 'diverge']) {
    const c = $(id);
    const want = Math.round((c.clientWidth || 300) * dpr);
    const h = Math.round((id === 'gauge' ? 38 : 100) * dpr);
    if (c.width !== want || c.height !== h) { c.width = want; c.height = h; }
  }
}

// ------------------------------------------------------------------ wheel --

function drawWheel() {
  const cv = $('wheel');
  const W = cv.width;
  wctx.fillStyle = '#071624';
  wctx.fillRect(0, 0, W, W);

  const cx = W / 2;
  const cy = W * 0.52;
  const R = W * 0.34;                 // rim radius in pixels
  const px = R / S.radius;            // pixels per wheel radius
  const theta = eng.theta();
  const mass = eng.mass();
  const n = mass.length;
  const full = Math.max(1e-9, eng.totalMass() / n * 3.2);   // a "full" bucket

  drawPipe(cx, cy, R, W);

  // leak streams first, so buckets sit on top of them
  wctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const a = theta + (TAU * i) / n;
    const bx = cx + Math.cos(a) * R;
    const by = cy - Math.sin(a) * R;
    const fill = Math.min(1, mass[i] / full);
    if (fill < 0.02) continue;
    const g = wctx.createLinearGradient(0, by, 0, W);
    g.addColorStop(0, `rgba(79,163,227,${0.55 * fill})`);
    g.addColorStop(1, 'rgba(79,163,227,0)');
    wctx.strokeStyle = g;
    wctx.lineWidth = Math.max(1, W * 0.004 * (0.4 + fill));
    wctx.beginPath();
    wctx.moveTo(bx, by + W * 0.004);
    wctx.lineTo(bx, W);
    wctx.stroke();
  }

  // rim and spokes
  wctx.strokeStyle = 'rgba(219,232,244,0.55)';
  wctx.lineWidth = Math.max(1, W * 0.0022);
  wctx.beginPath();
  wctx.arc(cx, cy, R, 0, TAU);
  wctx.stroke();
  for (let i = 0; i < n; i++) {
    const a = theta + (TAU * i) / n;
    wctx.beginPath();
    wctx.moveTo(cx, cy);
    wctx.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
    wctx.stroke();
  }

  // buckets: upright whatever the wheel is doing, and drawn bigger the more
  // they hold, which is the only way the mass is visible at a glance
  for (let i = 0; i < n; i++) {
    const a = theta + (TAU * i) / n;
    const bx = cx + Math.cos(a) * R;
    const by = cy - Math.sin(a) * R;
    const fill = Math.min(1, mass[i] / full);
    bucket(bx, by, W * (0.020 + 0.026 * fill), fill);
  }

  // hub
  wctx.fillStyle = '#dbe8f4';
  wctx.beginPath();
  wctx.arc(cx, cy, W * 0.009, 0, TAU);
  wctx.fill();

  // the traces, in the same plane. The Lorenz overlay goes on top and dashed:
  // for the first half-minute it lies exactly along the orange, which is the
  // claim being made, and after that chaos pulls the two apart — which is not a
  // failure of the correspondence but the thing the correspondence predicts.
  if (S.twin) trail(eng.twinTrace(), cx, cy, px, [185, 140, 255], W * 0.0026);
  trail(eng.trace(), cx, cy, px, [255, 177, 78], W * 0.0032);
  if (S.lorenz) trail(eng.lorenzTrace(), cx, cy, px, [127, 227, 196], W * 0.0022, [W * 0.012, W * 0.010]);

  if (S.twin) {
    const [tx, ty] = eng.twinCom();
    dot(cx + tx * px, cy - ty * px, W * 0.008, '#b98cff');
  }
  const [ox, oy] = eng.com();
  dot(cx + ox * px, cy - oy * px, W * 0.011, '#ffb14e');
}

/** An upright V with water in it. */
function bucket(x, y, w, fill) {
  const h = w * 1.15;
  wctx.strokeStyle = 'rgba(240,247,255,0.9)';
  wctx.lineWidth = Math.max(1.2, w * 0.16);
  wctx.lineJoin = 'round';
  wctx.lineCap = 'round';
  wctx.beginPath();
  wctx.moveTo(x - w, y - h * 0.5);
  wctx.lineTo(x - w * 0.34, y + h * 0.5);
  wctx.lineTo(x + w * 0.34, y + h * 0.5);
  wctx.lineTo(x + w, y - h * 0.5);
  wctx.stroke();
  if (fill > 0.015) {
    // the water surface stays level; the V's walls slope, so the wet width
    // grows with depth
    const top = y + h * 0.5 - h * fill;
    const wt = w * (0.34 + 0.66 * fill);
    wctx.fillStyle = fill > 0.6 ? '#63b2ee' : '#4fa3e3';
    wctx.beginPath();
    wctx.moveTo(x - w * 0.34, y + h * 0.5);
    wctx.lineTo(x + w * 0.34, y + h * 0.5);
    wctx.lineTo(x + wt, top);
    wctx.lineTo(x - wt, top);
    wctx.closePath();
    wctx.fill();
  }
}

function dot(x, y, r, colour) {
  wctx.fillStyle = colour;
  wctx.beginPath();
  wctx.arc(x, y, r, 0, TAU);
  wctx.fill();
  wctx.strokeStyle = 'rgba(255,255,255,0.85)';
  wctx.lineWidth = Math.max(1, r * 0.25);
  wctx.stroke();
}

/**
 * A trail, oldest end faded.
 *
 * Drawn in a couple of dozen chunks with stepped alpha rather than per-segment,
 * which is the difference between one stroke call per chunk and twenty thousand
 * of them. Without the fade the picture is legible for a minute and a solid
 * orange blob after five.
 */
function trail(xy, cx, cy, px, rgb, width, dash) {
  const pts = xy.length / 2;
  if (pts < 2) return;
  wctx.lineJoin = 'round';
  wctx.lineCap = 'round';
  wctx.lineWidth = width;
  if (dash) wctx.setLineDash(dash); else wctx.setLineDash([]);
  const chunks = 24;
  const per = Math.ceil(pts / chunks);
  for (let c = 0; c < chunks; c++) {
    const from = c * per;
    const to = Math.min(pts, from + per + 1);
    if (to - from < 2) continue;
    const age = c / (chunks - 1);            // 0 = oldest chunk
    wctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.18 + 0.72 * age})`;
    wctx.beginPath();
    wctx.moveTo(cx + xy[from * 2] * px, cy - xy[from * 2 + 1] * px);
    for (let i = from + 1; i < to; i++) wctx.lineTo(cx + xy[i * 2] * px, cy - xy[i * 2 + 1] * px);
    wctx.stroke();
  }
  wctx.setLineDash([]);
}

/** The tap: in from the left, elbow, and down onto the top bucket. */
function drawPipe(cx, cy, R, W) {
  const topY = cy - R - W * 0.055;
  const x = cx;
  wctx.lineCap = 'butt';
  wctx.lineJoin = 'round';
  wctx.strokeStyle = '#4fa3e3';
  wctx.lineWidth = W * 0.022;
  wctx.beginPath();
  wctx.moveTo(0, W * 0.035);
  wctx.lineTo(x - W * 0.011, W * 0.035);
  wctx.lineTo(x - W * 0.011, topY);
  wctx.stroke();
  wctx.strokeStyle = 'rgba(219,232,244,0.9)';
  wctx.lineWidth = W * 0.006;
  wctx.beginPath();
  wctx.moveTo(0, W * 0.035 - W * 0.011);
  wctx.lineTo(x - W * 0.017, W * 0.035 - W * 0.011);
  wctx.lineTo(x - W * 0.017, topY);
  wctx.stroke();
  // the falling stream
  const g = wctx.createLinearGradient(0, topY, 0, cy - R);
  g.addColorStop(0, 'rgba(99,178,238,0.95)');
  g.addColorStop(1, 'rgba(99,178,238,0.5)');
  wctx.strokeStyle = g;
  wctx.lineWidth = W * 0.007;
  wctx.beginPath();
  wctx.moveTo(x - W * 0.011, topY);
  wctx.lineTo(x - W * 0.011, cy - R);
  wctx.stroke();
}

// ------------------------------------------------------------------ gauge --

function drawGauge() {
  const cv = $('gauge');
  const L = eng.lorenz();
  gctx.clearRect(0, 0, cv.width, cv.height);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pad = 8 * dpr;
  const w = cv.width - pad * 2;
  const y = cv.height * 0.46;
  const h = 10 * dpr;

  // log scale from ρ = 0.1 to whichever is larger, 4ρ_Hopf or 2ρ
  const hopf = Number.isFinite(L.rhoHopf) ? L.rhoHopf : 0;
  const hi = Math.max(60, hopf * 3, L.rho * 1.4);
  const pos = (r) => pad + (Math.log10(Math.max(r, 0.1) / 0.1) / Math.log10(hi / 0.1)) * w;

  const bands = [
    [0.1, 1, '#23405c'],
    [1, hopf || hi, '#1f4f37'],
    [hopf || hi, hi, '#5c3a12'],
  ];
  for (const [a, b, c] of bands) {
    if (b <= a) continue;
    gctx.fillStyle = c;
    gctx.fillRect(pos(a), y, pos(b) - pos(a), h);
  }
  for (const [r, label] of [[1, 'ρ=1'], [hopf, 'ρ_H']]) {
    if (!r || !Number.isFinite(r)) continue;
    gctx.fillStyle = 'rgba(219,232,244,0.6)';
    gctx.fillRect(pos(r) - dpr * 0.5, y - 3 * dpr, dpr, h + 6 * dpr);
    gctx.font = `${9 * dpr}px ui-monospace, monospace`;
    gctx.fillText(label, pos(r) + 2 * dpr, y - 5 * dpr);
  }
  // the marker
  const x = pos(L.rho);
  gctx.fillStyle = '#ffb14e';
  gctx.beginPath();
  gctx.moveTo(x, y - 5 * dpr);
  gctx.lineTo(x + 5 * dpr, y - 13 * dpr);
  gctx.lineTo(x - 5 * dpr, y - 13 * dpr);
  gctx.closePath();
  gctx.fill();
  gctx.fillRect(x - dpr, y, dpr * 2, h);
}

// -------------------------------------------------------------- divergence --

function drawDiverge() {
  const cv = $('diverge');
  dctx.clearRect(0, 0, cv.width, cv.height);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (div.length < 2) return;
  const t0 = div[0][0], t1 = Math.max(div[div.length - 1][0], t0 + 1);
  const lo = -18, hi = 2;
  const X = (t) => ((t - t0) / (t1 - t0)) * cv.width;
  const Y = (v) => cv.height - ((v - lo) / (hi - lo)) * cv.height;

  dctx.strokeStyle = 'rgba(123,156,184,0.25)';
  dctx.lineWidth = dpr;
  dctx.font = `${8 * dpr}px ui-monospace, monospace`;
  dctx.fillStyle = 'rgba(123,156,184,0.75)';
  for (const v of [-15, -10, -5, 0]) {
    dctx.beginPath();
    dctx.moveTo(0, Y(v));
    dctx.lineTo(cv.width, Y(v));
    dctx.stroke();
    dctx.fillText('1e' + v, 2 * dpr, Y(v) - 2 * dpr);
  }
  dctx.strokeStyle = S.twin ? '#b98cff' : 'rgba(185,140,255,0.55)';
  dctx.lineWidth = 1.6 * dpr;
  dctx.beginPath();
  dctx.moveTo(X(div[0][0]), Y(div[0][1]));
  for (const [t, v] of div) dctx.lineTo(X(t), Y(v));
  dctx.stroke();
}

// ---------------------------------------------------------------- readout --

const REGIME = [
  ['r0', 'standing still', 'Not enough water to start it turning.'],
  ['r1', 'steady spin', 'It turns one way at ω = k√(β(ρ−1)) and stays there.'],
  ['r2', 'chaotic', 'The steady spins are unstable; it reverses at unpredictable intervals.'],
];

function drawStatus() {
  const L = eng.lorenz();
  const rev = eng.theta() / TAU;
  $('status').innerHTML =
    `t <b>${eng.elapsed().toFixed(1)}s</b>` +
    `<span>ω <b>${eng.omega().toFixed(3)}</b> rad/s</span>` +
    `<span>turns <b>${rev.toFixed(2)}</b></span>` +
    `<span>water <b>${eng.totalMass().toFixed(2)}</b></span>` +
    (S.twin ? `<span>twin gap <b>${fmtExp(eng.separation())}</b></span>` : '');

  const [cls, name, blurb] = REGIME[L.regime] || REGIME[0];
  const hopf = Number.isFinite(L.rhoHopf) ? L.rhoHopf.toFixed(1) : '∞';
  $('derived').innerHTML =
    `<span class="k">σ = ν/(I k) =</span> <b>${L.sigma.toFixed(2)}</b><br>` +
    `<span class="k">ρ = πgr q₁/(ν k²) =</span> <b>${L.rho.toFixed(2)}</b><br>` +
    `<span class="k">β =</span> <b>1</b> <span class="k">— a waterwheel has no choice</span><br>` +
    `<span class="k">ρ<sub>Hopf</sub> =</span> <b>${hopf}</b><br>` +
    `<span class="k">bucket ripple</span> <b>${fmtRipple(eng.ripple())}</b><br>` +
    `<span class="badge ${cls}">${name}</span>`;
  $('gauge-capt').textContent = !Number.isFinite(L.rhoHopf)
    ? 'σ ≤ β+1, so the steady spin never loses stability: this wheel cannot be made chaotic at any flow. Turn the damping up.'
    : blurb;
}

const fmtExp = (v) => (v === 0 ? '0' : v.toExponential(1));

/** The ripple is tiny for any sensible wheel — a Gaussian stream aliases
 *  exponentially — so a fixed "0.0%" would hide the whole point of the slider. */
function fmtRipple(r) {
  const pct = r * 100;
  if (pct >= 1) return pct.toFixed(1) + '%';
  if (pct >= 1e-4) return pct.toPrecision(2) + '%';
  return 'below 1 ppm';
}

// ----------------------------------------------------------------- wiring --

function wire() {
  $('play').addEventListener('click', () => {
    S.playing = !S.playing;
    $('play').textContent = S.playing ? '❚❚ pause' : '▶ play';
    $('play').setAttribute('aria-pressed', String(S.playing));
  });
  $('restart').addEventListener('click', () => {
    eng.reset(0.05, 1e-9);
    div = [];
    writeHash();
  });
  $('clear').addEventListener('click', () => {
    // the traces live in the engine, so the cheapest honest clear is a restart
    // of the traces only — keep the wheel turning
    eng.reset(eng.omega(), 1e-9);
    div = [];
  });

  for (const id of ['q', 'k', 'nu', 'inertia', 'spread', 'n']) {
    $(id).addEventListener('input', (e) => {
      S[id] = id === 'n' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
      if (eng.setParams(S)) div = [];
      syncOutputs();
      writeHash();
    });
  }
  $('speed').addEventListener('input', (e) => { S.speed = parseFloat(e.target.value); syncOutputs(); });

  for (const [id, key] of [['t-twin', 'twin'], ['t-lorenz', 'lorenz']]) {
    $(id).addEventListener('click', () => {
      S[key] = !S[key];
      $(id).setAttribute('aria-pressed', String(S[key]));
      writeHash();
    });
  }

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') { e.preventDefault(); $('play').click(); }
    if (e.key === 'r') $('restart').click();
  });
}

function syncOutputs() {
  for (const id of ['q', 'k', 'nu', 'inertia', 'spread', 'n', 'speed']) $(id).value = String(S[id]);
  $('q-o').textContent = S.q.toFixed(2);
  $('k-o').textContent = S.k.toFixed(2);
  $('nu-o').textContent = S.nu.toFixed(1);
  $('inertia-o').textContent = S.inertia.toFixed(1);
  $('n-o').textContent = String(S.n);
  $('spread-o').textContent = S.spread.toFixed(2);
  $('speed-o').textContent = S.speed + '×';
  $('t-twin').setAttribute('aria-pressed', String(S.twin));
  $('t-lorenz').setAttribute('aria-pressed', String(S.lorenz));
}

// -------------------------------------------------------------------- hash --

function writeHash() {
  const p = new URLSearchParams();
  for (const id of ['q', 'k', 'nu', 'inertia', 'spread', 'n']) p.set(id, String(S[id]));
  if (S.twin) p.set('twin', '1');
  if (S.lorenz) p.set('lz', '1');
  const h = '#' + p.toString();
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (key, lo, hi, cur) => {
    const v = parseFloat(p.get(key));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : cur;
  };
  S.q = num('q', 0.01, 6, S.q);
  S.k = num('k', 0.05, 1, S.k);
  S.nu = num('nu', 0.5, 40, S.nu);
  S.inertia = num('inertia', 0.5, 20, S.inertia);
  S.spread = num('spread', 0.2, 3, S.spread);
  S.n = Math.round(num('n', 5, 96, S.n));
  S.twin = p.get('twin') === '1';
  S.lorenz = p.get('lz') === '1';
}
