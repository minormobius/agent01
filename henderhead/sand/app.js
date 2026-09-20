// app.js — the sand table, the curve it draws, and the numbers.
//
// Everything drawn here comes out of the wasm engine. The sand is a real
// relaxation and the curve is measured off it; the only thing this file
// computes is the theoretical overlay, and that is drawn dashed and labelled
// as prediction so it cannot be mistaken for the measurement.

import { loadEngine, KIND } from './engine.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '—');

const N = 145;               // plate, in cells
const PRESETS = {
  ellipse: {
    label: 'his ellipse',
    repose: 34,
    build: (E) => {
      E.clearFeatures();
      E.addFeature(KIND.POINT_SOURCE, 64, 80, { rate: 160 });
      E.addFeature(KIND.POINT_SINK, 80, 66);
      return { mode: 'pour', batches: 130, sum: true, pair: [0, 1] };
    },
    note: 'A pour point and a hole. The sum of the distances is what stays constant, so the seam is an ellipse.',
  },
  round: {
    label: 'toward a circle',
    repose: 34,
    build: (E) => {
      E.clearFeatures();
      E.addFeature(KIND.POINT_SOURCE, 72, 64, { rate: 160 });
      E.addFeature(KIND.POINT_SINK, 72, 78);
      return { mode: 'pour', batches: 130, sum: true, pair: [0, 1] };
    },
    note: 'The hole close under the pour point: the foci are nearly together and the ellipse has rounded out. Click to slide it closer and the curve gets rounder still — but a circle is another limit you cannot reach, because a hole exactly beneath the pour drains everything and leaves no pile to draw on.',
  },
  parabola: {
    label: 'parabola',
    repose: 34,
    build: (E) => {
      E.clearFeatures();
      E.addFeature(KIND.POINT_SINK, 72, 95);
      E.addFeature(KIND.LINE_SINK, 72, 44, { nx: 0, ny: 1 });
      return { mode: 'flood', depth: 38, sum: false, pair: [0, 1] };
    },
    note: 'A hole and a straight slot. This is the only way to reach e = 1 exactly — see the note below the table.',
  },
};

let E = null;
let state = null;
let preset = 'ellipse';
let running = false;
let raf = 0;

// ---------------------------------------------------------------- painting --

const cv = $('table');
const ctx = cv.getContext('2d', { alpha: false });
// The sand is painted at one pixel per cell into an offscreen buffer and then
// blown up. Painting into the visible canvas and then scaling it onto itself
// works in most browsers and is a bad idea in all of them.
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d', { alpha: false });
let img = null;

function paintSand() {
  const n = E.n;
  if (buf.width !== n) {
    buf.width = n;
    buf.height = n;
  }
  if (!img || img.width !== n) img = bctx.createImageData(n, n);
  const sh = E.shade(2.2, -0.55, -0.7, 0.85);
  const labels = $('showBasins').checked ? E.labels() : null;
  const d = img.data;
  for (let i = 0; i < n * n; i++) {
    const v = sh[i];
    let r, g, b;
    if (v === 0) {
      // bare plate
      r = 26; g = 32; b = 44;
    } else {
      const t = v / 255;
      r = 232 * t + 14;
      g = 224 * t + 16;
      b = 202 * t + 20;
      if (labels) {
        const l = labels[i];
        if (l === 0) { r = Math.min(255, r * 1.06); g *= 0.86; b *= 0.70; }
        else if (l === 1) { r *= 0.72; g *= 0.90; b = Math.min(255, b * 1.10); }
        else if (l === 2) { r *= 0.80; g = Math.min(255, g * 1.05); b *= 0.78; }
      }
    }
    const o = i * 4;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
}

function toScreen(x, y, w) {
  return [(x / E.n) * w, (y / E.n) * w];
}

function paintOverlay() {
  const w = cv.width;
  const s = w / E.n;

  // the measured seam
  if ($('showSeam').checked) {
    const pts = E.seam();
    ctx.fillStyle = '#ff5a52';
    for (let i = 0; i < pts.length; i += 2) {
      const [X, Y] = toScreen(pts[i] + 0.5, pts[i + 1] + 0.5, w);
      ctx.fillRect(X - s * 0.45, Y - s * 0.45, s * 0.9, s * 0.9);
    }
  }

  // the theoretical curve, dashed, from the feature positions and the
  // measured 2a — drawn so the two can be compared, never instead of them
  if ($('showIdeal').checked && state && state.pair) {
    drawIdeal(w);
  }

  // the features themselves
  for (let i = 0; i < E.featureCount(); i++) {
    const k = E.featureKind(i);
    const [fx, fy] = E.featureXY(i);
    const [X, Y] = toScreen(fx + 0.5, fy + 0.5, w);
    ctx.lineWidth = 2;
    if (k === KIND.LINE_SOURCE || k === KIND.LINE_SINK) {
      ctx.strokeStyle = k === KIND.LINE_SINK ? '#7fd4ff' : '#ffd166';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, Y);
      ctx.lineTo(w, Y);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.arc(X, Y, 6, 0, Math.PI * 2);
    ctx.fillStyle = k === KIND.POINT_SINK ? '#7fd4ff' : '#ffd166';
    ctx.fill();
    ctx.strokeStyle = '#0b1220';
    ctx.stroke();
  }
}

function drawIdeal(w) {
  const [a, b] = state.pair;
  if (E.featureKind(a) > 1 || E.featureKind(b) > 1) return; // needs two points
  const [ax, ay] = E.featureXY(a);
  const [bx, by] = E.featureXY(b);
  const pts = E.seam();
  if (pts.length < 12) return;
  // the constant, measured off the curve rather than assumed
  let acc = 0;
  let cnt = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const r1 = Math.hypot(pts[i] - ax, pts[i + 1] - ay);
    const r2 = Math.hypot(pts[i] - bx, pts[i + 1] - by);
    acc += state.sum ? r1 + r2 : Math.abs(r1 - r2);
    cnt++;
  }
  const K = acc / cnt;
  if (!state.sum) return; // only the sum case closes into a drawable loop here

  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  ctx.strokeStyle = '#7fe7c4';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2;
    // bisect for the radius at which r1 + r2 = K
    let lo = 0;
    let hi = E.n;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const X = cx + Math.cos(t) * mid;
      const Y = cy + Math.sin(t) * mid;
      const v = Math.hypot(X - ax, Y - ay) + Math.hypot(X - bx, Y - by);
      if (v < K) lo = mid;
      else hi = mid;
    }
    const [X, Y] = toScreen(cx + Math.cos(t) * lo + 0.5, cy + Math.sin(t) * lo + 0.5, w);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function paint() {
  paintSand();
  const w = cv.width;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf, 0, 0, E.n, E.n, 0, 0, w, w);
  paintOverlay();
}

// ------------------------------------------------------------------ report --

function report() {
  const found = E.measure();
  $('nPoints').textContent = String(found);
  if (found < 8) {
    $('conicType').textContent = 'no curve yet';
    $('conicType').className = 'v dim';
    ['ecc', 'pct', 'rms', 'predicted', 'agree'].forEach((k) => {
      $(k).textContent = '—';
    });
    return;
  }
  // Nothing measured off sand that is still moving means anything: while a
  // crater is still cutting its way outwards the crease is halfway between
  // where it started and where it is going, and the fitted eccentricity swings
  // wildly (1.003 settled, 53.2 a few seconds earlier on the same table). Say
  // so rather than printing it straight.
  const moving = E.oversteep() > 0.02;
  const t = E.conicType(0.08);
  $('conicType').textContent = (t ?? '—') + (moving ? ' (still settling)' : '');
  $('conicType').className = moving ? 'v dim' : 'v hot';
  $('readings').className = moving ? 'read moving' : 'read';
  $('predicted').textContent = E.predictedType() ?? '—';
  $('ecc').textContent = fmt(E.eccentricity(), 3);
  $('rms').textContent = fmt(E.rms(), 2) + ' cells';

  const [a, b] = state.pair;
  const pct = E.focalConstancy(a, b, state.sum);
  $('pct').textContent = Number.isFinite(pct) ? fmt(pct, 2) + '%' : '—';

  // 2c / 2a, measured: the separation of the two features over the constant
  if (E.featureKind(a) <= 1 && E.featureKind(b) <= 1) {
    const [ax, ay] = E.featureXY(a);
    const [bx, by] = E.featureXY(b);
    const sep = Math.hypot(ax - bx, ay - by);
    const pts = E.seam();
    let acc = 0;
    let cnt = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const r1 = Math.hypot(pts[i] - ax, pts[i + 1] - ay);
      const r2 = Math.hypot(pts[i] - bx, pts[i + 1] - by);
      acc += state.sum ? r1 + r2 : Math.abs(r1 - r2);
      cnt++;
    }
    const K = acc / cnt;
    $('agree').textContent = K > 1e-6 ? fmt(sep / K, 3) : '—';
  } else {
    $('agree').textContent = 'n/a (a slot has no second focus)';
  }

  $('settled').textContent = fmt(E.oversteep() * 100, 1) + '%';
  $('apex').textContent = fmt(E.maxHeight(), 1);
}

// ------------------------------------------------------------------- drive --

function rebuild() {
  const p = PRESETS[preset];
  E.setRepose(p.repose);
  $('repose').value = String(p.repose);
  $('reposeV').textContent = p.repose + '°';
  E.reset();
  state = p.build(E);
  state.poured = 0;
  $('note').textContent = p.note;
  if (state.mode === 'flood') {
    E.flood(state.depth);
  }
  report();
  paint();
}

function tick() {
  if (!running) return;
  const t0 = performance.now();
  if (state.mode === 'pour') {
    while (state.poured < state.batches && performance.now() - t0 < 24) {
      E.step(1);
      E.settle(1e-2, 120);
      state.poured++;
    }
    $('progress').textContent = `${state.poured} / ${state.batches} helpings`;
    if (state.poured >= state.batches) {
      E.settle(1e-2, 2000);
      running = false;
      $('run').textContent = '▶ pour';
    }
  } else {
    let n = 0;
    while (performance.now() - t0 < 32 && n < 200) {
      const v = E.settle(1e-2, 400);
      n++;
      if (v < 1e-2) {
        running = false;
        $('run').textContent = '▶ drain';
        break;
      }
    }
    $('progress').textContent = running ? 'draining…' : 'settled';
  }
  report();
  paint();
  if (running) raf = requestAnimationFrame(tick);
}

function toggleRun() {
  running = !running;
  $('run').textContent = running ? '⏸ pause' : (state.mode === 'pour' ? '▶ pour' : '▶ drain');
  if (running) raf = requestAnimationFrame(tick);
  else cancelAnimationFrame(raf);
}

// -------------------------------------------------------------------- boot --

(async function boot() {
  try {
    E = await loadEngine();
  } catch (err) {
    $('note').textContent = 'The sand engine did not load: ' + err.message;
    return;
  }
  E.init(N, 34);
  cv.width = 580;
  cv.height = 580;

  for (const key of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = PRESETS[key].label;
    b.dataset.k = key;
    b.className = key === preset ? 'on' : '';
    b.addEventListener('click', () => {
      preset = key;
      running = false;
      cancelAnimationFrame(raf);
      $('run').textContent = '▶ run';
      [...$('presets').children].forEach((c) => {
        c.className = c.dataset.k === key ? 'on' : '';
      });
      rebuild();
    });
    $('presets').appendChild(b);
  }

  $('run').addEventListener('click', toggleRun);
  $('again').addEventListener('click', () => {
    running = false;
    cancelAnimationFrame(raf);
    $('run').textContent = '▶ run';
    rebuild();
  });
  $('repose').addEventListener('input', (ev) => {
    const d = +ev.target.value;
    $('reposeV').textContent = d + '°';
    E.setRepose(d);
    report();
    paint();
  });
  for (const id of ['showSeam', 'showIdeal', 'showBasins']) {
    $(id).addEventListener('change', paint);
  }

  // clicking the plate moves the nearest point feature
  cv.addEventListener('click', (ev) => {
    const r = cv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * E.n;
    const y = ((ev.clientY - r.top) / r.height) * E.n;
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < E.featureCount(); i++) {
      if (E.featureKind(i) > 1) continue;
      const [fx, fy] = E.featureXY(i);
      const d = Math.hypot(fx - x, fy - y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    E.moveFeature(best, x, y);
    report();
    paint();
  });

  rebuild();
})();
