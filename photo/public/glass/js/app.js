// app.js — pixels in, panel out. The maths lives in glass.js; this file owns
// the photograph, the canvas, and the workbench.

import { stainedGlass, toSVG, PALETTES, rgbToHex, srgbToLab } from './glass.js';

// A fit is k-means over every pixel, so the photo is cut down to a working
// resolution first. 1000px on the long side is well past what a few thousand
// glass pieces can resolve; the geometry that comes back is vector anyway, so
// the panel still renders and exports at any size.
const WORK_MAX = 1000;
const EXPORT_SCALE = 2;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const sctx = stage.getContext('2d');

const p = {
  pieces: 900, compactness: 18, iterations: 10, straightness: 1.2,
  palette: '', texture: 0.35, glow: 0.45, lead: 2, leadColor: '#12101a',
  view: 'glass',
};

let photo = null;      // { rgba, W, H, bitmap }
let result = null;     // last fit from glass.js
let panelCanvas = null;
let panelDirty = true;
let placement = { x: 0, y: 0, scale: 1 };
let busy = false, queued = false, token = 0;

// on a phone the workbench is a full-width overlay, so it starts out of the way
const narrow = () => window.innerWidth <= 760;

// ───────────────────────────────────────────────────────── the worker ──

let worker = null;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
} catch { worker = null; }

function fit(rgba, W, H, opts) {
  if (!worker) return Promise.resolve(stainedGlass(rgba, W, H, opts));
  return new Promise((resolve, reject) => {
    const mine = ++token;
    const onMessage = (e) => {
      if (e.data.token !== mine) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.ok) resolve(e.data.result); else reject(new Error(e.data.error));
    };
    worker.addEventListener('message', onMessage);
    // the worker gets a copy: the source pixels are needed again on every recut
    const copy = rgba.slice();
    worker.postMessage({ rgba: copy, W, H, opts, token: mine }, [copy.buffer]);
  });
}

// ─────────────────────────────────────────────────── loading a photo ──

async function loadImage(src) {
  const bitmap = await createImageBitmap(src);
  const r = Math.min(WORK_MAX / bitmap.width, WORK_MAX / bitmap.height, 1);
  const W = Math.max(1, Math.round(bitmap.width * r));
  const H = Math.max(1, Math.round(bitmap.height * r));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);
  photo = { rgba: ctx.getImageData(0, 0, W, H).data, bitmap, W, H };

  $('drop').hidden = true;
  if (narrow()) setPanel(true);
  drawThumb();
  $('src-note').textContent = `${bitmap.width}×${bitmap.height} → fitted at ${W}×${H}`;
  recut();
}

function drawThumb() {
  const t = $('thumb');
  const ctx = t.getContext('2d');
  const s = Math.min(t.width / photo.W, t.height / photo.H);
  const w = photo.W * s, h = photo.H * s;
  ctx.clearRect(0, 0, t.width, t.height);
  ctx.drawImage(photo.bitmap, (t.width - w) / 2, (t.height - h) / 2, w, h);
}

async function loadFromFile(file) {
  if (!file || !/^image\//.test(file.type)) return fail('that is not an image');
  try { await loadImage(file); } catch (e) { fail(String(e.message || e)); }
}

// ?u=<image url> — Bluesky's CDN Origin-checks browser fetches, so those go
// through the surface's same-origin proxy (see photo/worker.js /api/img).
async function loadFromUrl(raw) {
  try {
    const u = new URL(raw, location.href);
    const bsky = /(^|\.)bsky\.(app|network)$/.test(u.hostname);
    const src = bsky ? `/api/img?u=${encodeURIComponent(u.toString())}` : u.toString();
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    await loadImage(await res.blob());
  } catch (e) {
    fail(`could not load that image — ${e.message || e}`);
  }
}

function fail(msg) {
  const el = $('drop-err');
  el.textContent = msg;
  el.hidden = false;
}

// ──────────────────────────────────────────────────────── the recut ──

async function recut() {
  if (!photo) return;
  if (busy) { queued = true; return; }
  busy = true;
  status('cutting glass…');
  try {
    result = await fit(photo.rgba, photo.W, photo.H, {
      pieces: p.pieces, compactness: p.compactness,
      iterations: p.iterations, straightness: p.straightness,
      palette: p.palette ? PALETTES[p.palette].colors : null,
    });
    panelDirty = true;
    showStats();
    paint();
  } catch (e) {
    status(`fit failed: ${e.message || e}`, 4000);
  } finally {
    busy = false;
    status('');
    if (queued) { queued = false; recut(); }
  }
}

let debounce = 0;
const recutSoon = () => { clearTimeout(debounce); debounce = setTimeout(recut, 140); };

// ───────────────────────────────────────────────────────── rendering ──

const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

function bbox(cell) {
  if (cell._bb) return cell._bb;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of cell.rings) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  cell._bb = [x0, y0, x1, y1];
  return cell._bb;
}

function cellPath(cell, scale) {
  const path = new Path2D();
  for (const ring of cell.rings) {
    path.moveTo(ring[0][0] * scale, ring[0][1] * scale);
    for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0] * scale, ring[i][1] * scale);
    path.closePath();
  }
  return path;
}

let noiseTile = null;
function noise() {
  if (noiseTile) return noiseTile;
  const n = document.createElement('canvas');
  n.width = n.height = 128;
  const ctx = n.getContext('2d');
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    // banded noise: seedy glass has bubbles and streaks, not TV static
    const x = (i / 4) % 128, y = ((i / 4) / 128) | 0;
    const v = 128 + (hash(x * 3.1 + y * 0.7) - 0.5) * 70 + Math.sin(y * 0.35 + hash(y) * 6) * 14;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = n;
  return n;
}

function leadPath(res, scale) {
  const path = new Path2D();
  for (const arc of res.arcs) {
    path.moveTo(arc[0][0] * scale, arc[0][1] * scale);
    for (let i = 1; i < arc.length; i++) path.lineTo(arc[i][0] * scale, arc[i][1] * scale);
  }
  return path;
}

/** The panel itself, at `scale` × working resolution. */
function renderPanel(res, scale) {
  const W = Math.round(res.width * scale), H = Math.round(res.height * scale);

  const glass = document.createElement('canvas');
  glass.width = W; glass.height = H;
  const g = glass.getContext('2d');

  for (const cell of res.cells) {
    if (!cell.rings.length) continue;
    const [r, gg, b] = cell.rgb;
    let style = `rgb(${r},${gg},${b})`;
    if (p.texture > 0) {
      // each sheet is rolled, so light through it varies along one direction
      const [x0, y0, x1, y1] = bbox(cell);
      const ang = hash(cell.id) * Math.PI * 2;
      const cx = (x0 + x1) / 2 * scale, cy = (y0 + y1) / 2 * scale;
      const rad = (Math.hypot(x1 - x0, y1 - y0) / 2 + 1) * scale;
      const grad = g.createLinearGradient(
        cx - Math.cos(ang) * rad, cy - Math.sin(ang) * rad,
        cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
      const k = 26 * p.texture * (0.5 + hash(cell.id * 7.3));
      const shift = (v, d) => Math.max(0, Math.min(255, Math.round(v + d)));
      grad.addColorStop(0, `rgb(${shift(r, -k)},${shift(gg, -k)},${shift(b, -k * 0.8)})`);
      grad.addColorStop(0.5, style);
      grad.addColorStop(1, `rgb(${shift(r, k)},${shift(gg, k * 0.95)},${shift(b, k * 1.1)})`);
      style = grad;
    }
    g.fillStyle = style;
    g.fill(cellPath(cell, scale), 'evenodd');
  }

  if (p.texture > 0) {
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.16 + 0.34 * p.texture;
    const pat = g.createPattern(noise(), 'repeat');
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = '#08060f';
  o.fillRect(0, 0, W, H);
  o.drawImage(glass, 0, 0);

  // backlight: the panel is lit from behind, so bright glass blooms into its leads
  if (p.glow > 0 && 'filter' in o) {
    o.save();
    o.globalCompositeOperation = 'lighter';
    o.globalAlpha = 0.45 * p.glow;
    o.filter = `blur(${Math.max(2, 7 * scale)}px)`;
    o.drawImage(glass, 0, 0);
    o.restore();
  }

  if (p.lead > 0) {
    const path = leadPath(res, scale);
    o.lineJoin = o.lineCap = 'round';
    o.strokeStyle = p.leadColor;
    o.lineWidth = p.lead * scale;
    o.stroke(path);
    // the came is round in section: a thin highlight along its crown
    o.save();
    o.globalAlpha = 0.35;
    o.strokeStyle = 'rgba(220,215,235,0.5)';
    o.lineWidth = Math.max(0.5, p.lead * scale * 0.28);
    o.translate(-0.25 * scale, -0.35 * scale);
    o.stroke(path);
    o.restore();
  }
  return out;
}

function renderCartoon(res, scale) {
  const W = Math.round(res.width * scale), H = Math.round(res.height * scale);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f2e9';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1a1620';
  ctx.lineWidth = Math.max(1, (p.lead || 2) * scale * 0.7);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.stroke(leadPath(res, scale));
  return c;
}

// night → ruby → gold: dark where the glass tells the truth
const HEAT = [[0, [7, 6, 22]], [0.3, [78, 20, 96]], [0.62, [200, 55, 60]], [1, [255, 226, 146]]];
function heat(u) {
  let i = 0;
  while (i < HEAT.length - 2 && u > HEAT[i + 1][0]) i++;
  const [a, ca] = HEAT[i], [b, cb] = HEAT[i + 1];
  const t = (u - a) / (b - a);
  return ca.map((v, j) => Math.round(v + (cb[j] - v) * t));
}

// Where the flat glass is lying. Cool = honest, hot = a piece papering over
// detail it cannot hold.
function renderResidual(res) {
  const { W, H, rgba } = photo;
  // the scale auto-ranges: a good fit would be uniformly dark on a fixed one
  const span = Math.max(4, res.stats.deltaE * 3);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0, q = 0; i < W * H; i++, q += 4) {
    const cell = res.cells[res.labels[i]];
    const lab = srgbToLab(rgba[q], rgba[q + 1], rgba[q + 2]);
    const t = cell.snapped || [cell.L, cell.a, cell.b];
    const dE = Math.hypot(lab[0] - t[0], lab[1] - t[1], lab[2] - t[2]);
    const c2 = heat(Math.min(1, dE / span));
    img.data[q] = c2[0]; img.data[q + 1] = c2[1]; img.data[q + 2] = c2[2];
    img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function currentLayer(scale) {
  if (p.view === 'cartoon') return renderCartoon(result, scale);
  if (p.view === 'residual') return renderResidual(result);
  if (p.view === 'photo') return photo.bitmap;
  return renderPanel(result, scale);
}

function paint() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);
  if (!result || !photo) return;

  const panelOpen = !$('panel').classList.contains('hidden') && w > 760;
  const left = panelOpen ? 300 : 0;
  const pad = 26;
  const availW = w - left - pad * 2, availH = h - pad * 2;
  const scale = Math.min(availW / photo.W, availH / photo.H);

  if (panelDirty || !panelCanvas) {
    panelCanvas = currentLayer(Math.min(2, Math.max(1, scale * dpr)));
    panelDirty = false;
  }

  const dw = photo.W * scale, dh = photo.H * scale;
  const x = left + pad + (availW - dw) / 2, y = pad + (availH - dh) / 2;
  placement = { x, y, scale };

  sctx.save();
  sctx.shadowColor = 'rgba(0,0,0,0.8)';
  sctx.shadowBlur = 40;
  sctx.drawImage(panelCanvas, x, y, dw, dh);
  sctx.restore();
}

const restyle = () => { panelDirty = true; paint(); };

// ────────────────────────────────────────────────────────── the numbers ──

function showStats() {
  const s = result.stats;
  const pct = (v) => (v * 100).toFixed(2) + '%';
  const rows = [
    ['pieces', s.pieces.toLocaleString(), ''],
    ['R² (fit)', pct(s.r2), s.r2 > 0.95 ? 'good' : s.r2 > 0.9 ? 'warn' : ''],
  ];
  if (p.palette) {
    rows.push(['R² (as glazed)', pct(s.r2Final), s.r2Final > 0.9 ? 'good' : 'warn']);
    rows.push(['palette cost', '+' + s.paletteCost.toFixed(2) + ' ΔE', 'warn']);
  }
  rows.push(
    ['mean ΔE', s.deltaE.toFixed(2), s.deltaE < 6 ? 'good' : ''],
    ['RMSE (sRGB)', s.rmse.toFixed(2), ''],
    ['PSNR', (s.psnr === Infinity ? '∞' : s.psnr.toFixed(1)) + ' dB', s.psnr > 26 ? 'good' : ''],
    ['lead', Math.round(s.leadLength).toLocaleString() + ' px', ''],
    ['vertices', s.vertices.toLocaleString(), ''],
  );
  $('stats').innerHTML = rows
    .map(([k, v, cls]) => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`).join('');
}

let statusTimer = 0;
function status(msg, ms = 0) {
  const el = $('status');
  clearTimeout(statusTimer);
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
  if (ms) statusTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ───────────────────────── solving for a target fidelity ──────────────────
//
// R² climbs with the piece count but nobody can say where it crosses a target
// without cutting the glass — so bracket by doubling, then bisect. Every step
// is a real fit; the cost is honest and shown.

async function solve() {
  if (!photo || busy) return;
  const target = parseFloat($('target').value);
  const opts = (pieces) => ({
    pieces, compactness: p.compactness, iterations: Math.min(p.iterations, 8),
    straightness: p.straightness, palette: p.palette ? PALETTES[p.palette].colors : null,
  });
  busy = true;
  $('solve-btn').disabled = true;
  let steps = 0;
  try {
    let lo = 40, hi = 40, r = null;
    for (;;) {
      steps++;
      status(`solving — ${hi.toLocaleString()} pieces (step ${steps})…`);
      r = await fit(photo.rgba, photo.W, photo.H, opts(hi));
      if (r.stats.r2 >= target || hi >= 4000) break;
      lo = hi; hi = Math.min(4000, Math.round(hi * 2.5));
    }
    if (r.stats.r2 < target) {
      status(`even ${hi.toLocaleString()} pieces only reach R² ${(r.stats.r2 * 100).toFixed(1)}%`, 5000);
    } else {
      for (let i = 0; i < 4 && hi - lo > Math.max(20, lo * 0.08); i++) {
        const mid = Math.round((lo + hi) / 2);
        steps++;
        status(`solving — ${mid.toLocaleString()} pieces (step ${steps})…`);
        const rm = await fit(photo.rgba, photo.W, photo.H, opts(mid));
        if (rm.stats.r2 >= target) { hi = mid; r = rm; } else lo = mid;
      }
      status(`${r.stats.pieces.toLocaleString()} pieces reach R² ${(r.stats.r2 * 100).toFixed(2)}% — ${steps} fits`, 5000);
    }
    p.pieces = hi;
    $('pieces').value = String(hi);
    $('pieces-v').textContent = hi;
    result = await fit(photo.rgba, photo.W, photo.H, opts(hi));
    panelDirty = true;
    showStats();
    paint();
  } catch (e) {
    status(`solve failed: ${e.message || e}`, 4000);
  } finally {
    busy = false;
    $('solve-btn').disabled = false;
  }
}

// ──────────────────────────────────────────────────────────── export ──

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const stem = () => `glass-${result.stats.pieces}pc${p.palette ? '-' + p.palette : ''}`;

/** Whatever is currently on the stage, at export resolution. */
function exportCanvas() {
  const scale = Math.min(EXPORT_SCALE, 4000 / Math.max(photo.W, photo.H));
  return p.view === 'cartoon' ? renderCartoon(result, scale)
    : p.view === 'residual' ? renderResidual(result)
      : renderPanel(result, scale);
}

const pngBlob = () => new Promise((res) => exportCanvas().toBlob(res, 'image/png'));

function exportPNG() {
  if (!result) return;
  pngBlob().then((b) => download(b, `${stem()}.png`));
}

/**
 * Straight to the clipboard, no file on disk. The blob is handed to
 * ClipboardItem as a *promise* first: Safari drops the user-gesture permission
 * if you await before writing, and both engines accept a pending value. If a
 * browser rejects that shape, retry with the resolved blob.
 */
async function copyImage() {
  if (!result) return;
  if (!(navigator.clipboard?.write && window.ClipboardItem)) {
    return status('this browser has no image clipboard — save the PNG instead', 4500);
  }
  status('copying…');
  const blob = pngBlob();
  try {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob })]);
    }
    status('copied — paste it anywhere', 2500);
  } catch (e) {
    status(`the clipboard refused it (${e.message || e}) — save the PNG instead`, 5000);
  }
}

function exportSVG() {
  if (!result) return;
  const svg = p.view === 'cartoon'
    ? toSVG({ ...result, cells: [] }, { scale: 1, lead: p.lead, leadColor: '#1a1620', background: '#f6f2e9', texture: false })
    : toSVG(result, { scale: 1, lead: p.lead, leadColor: p.leadColor, texture: p.texture > 0 });
  download(new Blob([svg], { type: 'image/svg+xml' }), `${stem()}.svg`);
}

// ──────────────────────────────────────────────────────────── wiring ──

const bindSlider = (id, key, fmt = (v) => v, after = recutSoon) => {
  const el = $(id), out = $(id + '-v');
  el.addEventListener('input', () => {
    p[key] = parseFloat(el.value);
    if (out) out.textContent = fmt(p[key]);
    after();
  });
  if (out) out.textContent = fmt(p[key]);
};

bindSlider('pieces', 'pieces');
bindSlider('compact', 'compactness');
bindSlider('iters', 'iterations');
bindSlider('straight', 'straightness', (v) => v.toFixed(1));
bindSlider('texture', 'texture', (v) => v.toFixed(2), restyle);
bindSlider('glow', 'glow', (v) => v.toFixed(2), restyle);
bindSlider('lead', 'lead', (v) => v.toFixed(2), restyle);

$('lead-color').addEventListener('change', (e) => { p.leadColor = e.target.value; restyle(); });

$('palette').addEventListener('change', (e) => {
  p.palette = e.target.value;
  const pal = PALETTES[p.palette];
  $('swatches').innerHTML = pal
    ? pal.colors.map((c) => `<i style="background:${c}" title="${c}"></i>`).join('') : '';
  $('palette-note').textContent = pal
    ? pal.note + ' — each piece snaps to its nearest sheet.'
    : 'Every piece takes its own fitted colour.';
  recut();
});

$('view').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  p.view = b.dataset.view;
  for (const btn of $('view').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn === b));
  }
  restyle();
  if (p.view === 'residual' && result) {
    status(`residual — dark is faithful, gold is ΔE ≥ ${Math.max(4, result.stats.deltaE * 3).toFixed(1)}`, 5000);
  }
});

$('browse-btn').addEventListener('click', () => $('file-input').click());
$('drop-browse').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => loadFromFile(e.target.files[0]));
$('solve-btn').addEventListener('click', solve);
$('copy-btn').addEventListener('click', copyImage);
$('png-btn').addEventListener('click', exportPNG);
$('svg-btn').addEventListener('click', exportSVG);

function setPanel(hidden) {
  $('panel').classList.toggle('hidden', hidden);
  $('panel-toggle').classList.toggle('collapsed', hidden);
  $('panel-toggle').textContent = hidden ? '⮞' : '⮜';
  paint();
}
$('panel-toggle').addEventListener('click',
  () => setPanel(!$('panel').classList.contains('hidden')));

$('docs-btn').addEventListener('click', () => $('docs').showModal());
$('docs-close').addEventListener('click', () => $('docs').close());

// drop / paste anywhere
for (const ev of ['dragenter', 'dragover']) {
  window.addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('dragging'); });
}
window.addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFromFile(f);
});
window.addEventListener('paste', (e) => {
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith('image/')) { loadFromFile(item.getAsFile()); return; }
  }
  const text = e.clipboardData?.getData('text');
  if (text && /^https?:\/\//.test(text.trim())) loadFromUrl(text.trim());
});

// hovering a piece names the glass it is made of
stage.addEventListener('pointermove', (e) => {
  if (!result || p.view === 'photo') return;
  const x = Math.floor((e.clientX - placement.x) / placement.scale);
  const y = Math.floor((e.clientY - placement.y) / placement.scale);
  const hud = $('hud');
  if (x < 0 || y < 0 || x >= photo.W || y >= photo.H) { hud.hidden = true; return; }
  const cell = result.cells[result.labels[y * photo.W + x]];
  if (!cell) { hud.hidden = true; return; }
  hud.innerHTML = `<i style="background:${rgbToHex(cell.rgb)}"></i>` +
    `${rgbToHex(cell.rgb)} · ${Math.round(cell.n).toLocaleString()} px · ` +
    `${cell.rings.reduce((s, r) => s + r.length, 0)} sides`;
  hud.hidden = false;
});
stage.addEventListener('pointerleave', () => { $('hud').hidden = true; });

window.addEventListener('resize', () => { panelDirty = true; paint(); });

// ?u=<image url> lets the rest of the surface hand a picture straight over
{
  const u = new URLSearchParams(location.search).get('u');
  if (u) loadFromUrl(u);
}
if (narrow()) setPanel(true);
paint();
