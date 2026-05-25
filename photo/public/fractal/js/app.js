import { FractalGL } from './fractal-gl.js';
import { extractPalette, paletteToGradient, computeHistogram, drawHistogram, rgbToHex } from './palette.js';
import { encodeVideo } from './video.js';

const canvas = document.getElementById('fractal');
const overlay = document.getElementById('overlay');
const fileInput = document.getElementById('file-input');

let gl;
try { gl = new FractalGL(canvas); }
catch (e) { alert('WebGL is required: ' + e.message); throw e; }

const p = {
  centerX: -0.5, centerY: 0, scale: 1.35, rot: 0,
  type: 0, power: 2, maxIter: 220, escape: 16,
  juliaRe: -0.7, juliaIm: 0.27,
  colorMode: 0, trapType: 0, trapX: 0, trapY: 0,
  imgScale: 0.5, imgRot: 0, imgOffX: 0, imgOffY: 0,
  paletteShift: 0, paletteScale: 1, mix: 0.5,
  interior: [0.04, 0.04, 0.08],
  crop: [0, 0, 1, 1],
  brightness: 0, contrast: 1, saturation: 1.1, gamma: 1,
};

let hasPhoto = false;
let dirty = true, raf = 0, interacting = false, idleTimer = 0;
let histData = null;
let exporting = false;
let lastPrecision = 0;

// ---------- render loop (on-demand) ----------
function requestRender() {
  dirty = true;
  if (!raf) raf = requestAnimationFrame(loop);
}
function loop() {
  raf = 0;
  if (!dirty) return;
  dirty = false;
  doRender();
}
function doRender() {
  if (exporting) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  gl.resize(dpr);
  const iter = interacting ? Math.min(p.maxIter, 150) : p.maxIter;
  lastPrecision = gl.render({ ...p, maxIter: iter });
  updateHud();
}
function markInteracting() {
  interacting = true;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { interacting = false; requestRender(); }, 170);
}

// ---------- coordinate mapping ----------
function aspect() { return canvas.width / canvas.height; }
function relComplex(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const uvx = (cx - rect.left) / rect.width;
  const uvy = 1 - (cy - rect.top) / rect.height;
  const px = (uvx - 0.5) * 2 * aspect() * p.scale;
  const py = (uvy - 0.5) * 2 * p.scale;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return { x: c * px + s * py, y: -s * px + c * py };
}
function screenToComplex(cx, cy) {
  const r = relComplex(cx, cy);
  return { x: p.centerX + r.x, y: p.centerY + r.y };
}

function updateHud() {
  document.getElementById('hud-coords').textContent =
    `${p.centerX.toFixed(6)}, ${p.centerY.toFixed(6)}`;
  const z = 1.35 / p.scale;
  const zoomStr = `zoom ${z >= 1000 ? z.toExponential(1) : z.toFixed(1)}×`;
  document.getElementById('hud-zoom').textContent =
    lastPrecision === 1 ? `${zoomStr} · hi-precision` : zoomStr;
}

// ---------- canvas interaction ----------
let dragging = false, downPx = null, downCenter = null;
let pickJulia = false;

canvas.addEventListener('pointerdown', (e) => {
  if (pickJulia) {
    const c = screenToComplex(e.clientX, e.clientY);
    setVal('juliaRe', c.x); setVal('juliaIm', c.y);
    p.juliaRe = c.x; p.juliaIm = c.y;
    pickJulia = false;
    document.getElementById('pick-julia').textContent = 'pick seed by clicking the canvas';
    if (p.type !== 1) { p.type = 1; document.getElementById('type').value = '1'; syncJuliaVisibility(); }
    requestRender();
    return;
  }
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  downPx = [e.clientX, e.clientY];
  downCenter = [p.centerX, p.centerY];
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const now = relComplex(e.clientX, e.clientY);
  const down = relComplex(downPx[0], downPx[1]);
  p.centerX = downCenter[0] - (now.x - down.x);
  p.centerY = downCenter[1] - (now.y - down.y);
  markInteracting();
  requestRender();
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = screenToComplex(e.clientX, e.clientY);
  const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
  p.scale = Math.min(4, Math.max(1e-11, p.scale * factor));
  const after = screenToComplex(e.clientX, e.clientY);
  p.centerX += before.x - after.x;
  p.centerY += before.y - after.y;
  markInteracting();
  requestRender();
}, { passive: false });

// ---------- slider / control wiring ----------
const fmts = {
  power: v => v.toFixed(2), iter: v => v.toFixed(0), escape: v => v.toFixed(0),
  juliaRe: v => v.toFixed(3), juliaIm: v => v.toFixed(3),
  rot: v => Math.round(v) + '°', imgRot: v => Math.round(v) + '°',
  trapX: v => v.toFixed(2), trapY: v => v.toFixed(2),
  imgScale: v => v.toFixed(2), imgOffX: v => v.toFixed(2), imgOffY: v => v.toFixed(2),
  paletteShift: v => v.toFixed(2), paletteScale: v => v.toFixed(1), mix: v => v.toFixed(2),
  brightness: v => v.toFixed(2), contrast: v => v.toFixed(2),
  saturation: v => v.toFixed(2), gamma: v => v.toFixed(2),
};
// slider id -> [state key, transform from slider value to state value]
const sliderMap = {
  power: ['power', v => v], iter: ['maxIter', v => v | 0], escape: ['escape', v => v],
  juliaRe: ['juliaRe', v => v], juliaIm: ['juliaIm', v => v],
  rot: ['rot', v => v * Math.PI / 180], imgRot: ['imgRot', v => v * Math.PI / 180],
  trapX: ['trapX', v => v], trapY: ['trapY', v => v],
  imgScale: ['imgScale', v => v], imgOffX: ['imgOffX', v => v], imgOffY: ['imgOffY', v => v],
  paletteShift: ['paletteShift', v => v], paletteScale: ['paletteScale', v => v], mix: ['mix', v => v],
  brightness: ['brightness', v => v], contrast: ['contrast', v => v],
  saturation: ['saturation', v => v], gamma: ['gamma', v => v],
};

for (const id of Object.keys(sliderMap)) {
  const el = document.getElementById(id);
  const [key, xf] = sliderMap[id];
  el.addEventListener('input', () => {
    const raw = parseFloat(el.value);
    p[key] = xf(raw);
    const vb = document.getElementById(id + '-v');
    if (vb && fmts[id]) vb.textContent = fmts[id](raw);
    requestRender();
  });
}

// Set a slider's value programmatically (updates readout + state).
function setVal(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  const vb = document.getElementById(id + '-v');
  if (vb && fmts[id]) vb.textContent = fmts[id](parseFloat(value));
}

document.getElementById('type').addEventListener('change', (e) => {
  p.type = parseInt(e.target.value, 10);
  syncJuliaVisibility();
  requestRender();
});
document.getElementById('colorMode').addEventListener('change', (e) => {
  p.colorMode = parseInt(e.target.value, 10); requestRender();
});
document.getElementById('trapType').addEventListener('change', (e) => {
  p.trapType = parseInt(e.target.value, 10); requestRender();
});
document.getElementById('interior').addEventListener('input', (e) => {
  p.interior = hexToRgb01(e.target.value); requestRender();
});

function syncJuliaVisibility() {
  document.getElementById('julia-grp').hidden = (p.type !== 1);
}

document.getElementById('reset-view').addEventListener('click', () => {
  p.centerX = -0.5; p.centerY = 0; p.scale = 1.35; p.rot = 0;
  setVal('rot', 0);
  requestRender();
});
document.getElementById('pick-julia').addEventListener('click', (e) => {
  pickJulia = !pickJulia;
  e.target.textContent = pickJulia ? 'click the canvas…' : 'pick seed by clicking the canvas';
});

// ---------- histogram ----------
const histCanvas = document.getElementById('hist');
document.getElementById('hist-mode').addEventListener('change', (e) => {
  if (histData) drawHistogram(histCanvas, histData, e.target.value);
});

// ---------- photo loading ----------
function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const img = new Image();
  img.onload = () => {
    gl.setPhoto(img);
    const sw = extractPalette(img, 8);
    gl.setPalette(paletteToGradient(sw));
    renderPaletteStrip(sw);
    histData = computeHistogram(img);
    drawHistogram(histCanvas, histData, document.getElementById('hist-mode').value);
    drawPreview(img);
    p.crop = [0, 0, 1, 1];
    hasPhoto = true;
    overlay.style.display = 'none';
    URL.revokeObjectURL(img.src);
    requestRender();
  };
  img.src = URL.createObjectURL(file);
}

function renderPaletteStrip(swatches) {
  const strip = document.getElementById('palette');
  strip.innerHTML = '';
  for (const c of swatches) {
    const d = document.createElement('div');
    d.style.background = rgbToHex(c);
    d.title = rgbToHex(c);
    strip.appendChild(d);
  }
}

fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadImageFile(e.target.files[0]); });
document.getElementById('browse-btn').addEventListener('click', () => fileInput.click());
document.getElementById('start-btn').addEventListener('click', () => fileInput.click());

// drag & drop anywhere
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, (e) => {
  e.preventDefault(); overlay.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, (e) => {
  e.preventDefault(); overlay.classList.remove('dragover');
}));
window.addEventListener('drop', (e) => {
  const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
  if (f) loadImageFile(f);
});

// ---------- preview + crop selection ----------
const preview = document.getElementById('preview');
let previewImg = null, drawRect = null;
function drawPreview(img) {
  previewImg = img;
  const ctx = preview.getContext('2d');
  const PW = preview.width, PH = preview.height;
  ctx.clearRect(0, 0, PW, PH);
  const r = Math.min(PW / img.width, PH / img.height);
  const w = img.width * r, h = img.height * r;
  const x = (PW - w) / 2, y = (PH - h) / 2;
  drawRect = { x, y, w, h };
  ctx.drawImage(img, x, y, w, h);
  drawCropOverlay();
}
function drawCropOverlay() {
  if (!previewImg) return;
  const ctx = preview.getContext('2d');
  const { x, y, w, h } = drawRect;
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.drawImage(previewImg, x, y, w, h);
  // shade everything, then redraw the crop region bright (clipped).
  ctx.fillStyle = 'rgba(7,6,15,0.55)';
  ctx.fillRect(0, 0, preview.width, preview.height);
  const cx = x + p.crop[0] * w;
  // crop.y is measured from bottom (GL convention); convert to top-origin.
  const cyTop = y + (1 - p.crop[1] - p.crop[3]) * h;
  const cw = p.crop[2] * w, ch = p.crop[3] * h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cyTop, cw, ch);
  ctx.clip();
  ctx.drawImage(previewImg, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = '#b69dff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx, cyTop, cw, ch);
}

let cropDrag = null;
preview.addEventListener('pointerdown', (e) => {
  if (!previewImg) return;
  const r = preview.getBoundingClientRect();
  cropDrag = {
    sx: (e.clientX - r.left) * preview.width / r.width,
    sy: (e.clientY - r.top) * preview.height / r.height,
  };
  preview.setPointerCapture(e.pointerId);
});
preview.addEventListener('pointermove', (e) => {
  if (!cropDrag) return;
  const r = preview.getBoundingClientRect();
  const x2 = (e.clientX - r.left) * preview.width / r.width;
  const y2 = (e.clientY - r.top) * preview.height / r.height;
  applyCropFromPixels(cropDrag.sx, cropDrag.sy, x2, y2);
});
preview.addEventListener('pointerup', (e) => {
  cropDrag = null;
  try { preview.releasePointerCapture(e.pointerId); } catch {}
  requestRender();
});
function applyCropFromPixels(x1, y1, x2, y2) {
  const { x, y, w, h } = drawRect;
  let ax = Math.max(x, Math.min(x1, x2)), ay = Math.max(y, Math.min(y1, y2));
  let bx = Math.min(x + w, Math.max(x1, x2)), by = Math.min(y + h, Math.max(y1, y2));
  if (bx - ax < 4 || by - ay < 4) return;
  const fx = (ax - x) / w, fyTop = (ay - y) / h;
  const fw = (bx - ax) / w, fh = (by - ay) / h;
  // convert top-origin to GL bottom-origin
  p.crop = [fx, 1 - fyTop - fh, fw, fh];
  drawCropOverlay();
  requestRender();
}
document.getElementById('reset-crop').addEventListener('click', () => {
  p.crop = [0, 0, 1, 1];
  if (previewImg) drawPreview(previewImg);
  requestRender();
});

// ---------- export ----------
document.getElementById('export-btn').addEventListener('click', () => {
  if (!hasPhoto) { fileInput.click(); return; }
  const scale = parseInt(document.getElementById('exportScale').value, 10);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const ow = canvas.width, oh = canvas.height;
  const w = Math.floor(canvas.clientWidth * dpr * scale);
  const h = Math.floor(canvas.clientHeight * dpr * scale);
  canvas.width = w; canvas.height = h;
  gl.gl.viewport(0, 0, w, h);
  gl.render(p);
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `fractalize-${Date.now()}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    canvas.width = ow; canvas.height = oh;
    gl.gl.viewport(0, 0, ow, oh);
    requestRender();
  }, 'image/png');
});

// ---------- randomize ----------
document.getElementById('randomize-btn').addEventListener('click', () => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  p.colorMode = [0, 0, 3, 1][Math.floor(Math.random() * 4)];
  document.getElementById('colorMode').value = String(p.colorMode);
  p.trapType = Math.floor(Math.random() * 5);
  document.getElementById('trapType').value = String(p.trapType);
  setVal('trapX', (p.trapX = rnd(-1, 1)).toFixed(2));
  setVal('trapY', (p.trapY = rnd(-1, 1)).toFixed(2));
  setVal('imgScale', (p.imgScale = rnd(0.15, 1.4)).toFixed(2));
  setVal('imgRot', Math.round((p.imgRot = rnd(-Math.PI, Math.PI)) * 180 / Math.PI));
  setVal('paletteShift', (p.paletteShift = Math.random()).toFixed(2));
  setVal('paletteScale', (p.paletteScale = rnd(0.5, 3)).toFixed(1));
  setVal('mix', (p.mix = rnd(0.2, 0.8)).toFixed(2));
  setVal('saturation', (p.saturation = rnd(0.8, 1.8)).toFixed(2));
  requestRender();
});

// ---------- video: keyframes + render ----------
const keyframes = [];
const kfCount = document.getElementById('kf-count');
const ANIM_KEYS = ['centerX', 'centerY', 'scale', 'rot', 'juliaRe', 'juliaIm',
  'paletteShift', 'imgRot', 'imgScale', 'trapX', 'trapY'];

function snapshot() {
  const s = {};
  for (const k of ANIM_KEYS) s[k] = p[k];
  return s;
}
function refreshKfCount() {
  kfCount.textContent = `${keyframes.length} keyframe${keyframes.length === 1 ? '' : 's'}`;
}
document.getElementById('kf-add').addEventListener('click', () => {
  keyframes.push(snapshot()); refreshKfCount();
});
document.getElementById('kf-clear').addEventListener('click', () => {
  keyframes.length = 0; refreshKfCount();
});

const lerp = (a, b, t) => a + (b - a) * t;
const geo = (a, b, t) => a * Math.pow(b / a, t);
const ease = (t) => t * t * (3 - 2 * t);

function diveStart(target) {
  return {
    ...target,
    scale: Math.min(4, target.scale * 300),
    rot: target.rot - 0.35,
    paletteShift: target.paletteShift - 0.4,
  };
}
function frameParamsAt(global, kfs, eased) {
  const n = kfs.length;
  const seg = Math.min(n - 2, Math.floor(global * (n - 1)));
  let lt = global * (n - 1) - seg;
  if (eased) lt = ease(lt);
  const A = kfs[seg], B = kfs[seg + 1];
  const out = {};
  for (const k of ANIM_KEYS) out[k] = (k === 'scale') ? geo(A[k], B[k], lt) : lerp(A[k], B[k], lt);
  return out;
}

let cancelRender = false;
const renderOverlay = document.getElementById('render-overlay');
const renderFill = document.getElementById('render-fill');
const renderMsg = document.getElementById('render-msg');
const renderTitle = document.getElementById('render-title');
document.getElementById('render-cancel').addEventListener('click', () => {
  cancelRender = true;
  if (!exporting) renderOverlay.hidden = true;
});

function onRenderProgress(ev) {
  if (ev.stage === 'loading-ffmpeg') { renderTitle.textContent = 'Loading encoder…'; renderMsg.textContent = ev.message || ''; }
  else if (ev.stage === 'rendering') {
    renderTitle.textContent = 'Rendering frames…';
    renderFill.style.width = `${Math.round(ev.progress * 60)}%`;
    if (ev.frame) renderMsg.textContent = `frame ${ev.frame} / ${ev.totalFrames}`;
  } else if (ev.stage === 'encoding') {
    renderTitle.textContent = 'Encoding video…';
    // libx264 on an image sequence often doesn't emit a clean ratio, so the
    // bar may sit; the live log line below proves it's still working.
    if (typeof ev.progress === 'number' && ev.progress > 0)
      renderFill.style.width = `${60 + Math.round(ev.progress * 38)}%`;
  } else if (ev.stage === 'ffmpeg-log') {
    // Show frame=/time= lines while encoding so it doesn't look frozen.
    const m = ev.message || '';
    if (/frame=|time=|fps=/.test(m)) renderMsg.textContent = m.trim().slice(0, 64);
  } else if (ev.stage === 'done') {
    renderFill.style.width = '100%';
  }
}

async function renderVideoFrame(i, totalFrames, kfs, W, H, eased) {
  if (cancelRender) throw new Error('cancelled');
  const t = totalFrames <= 1 ? 0 : i / (totalFrames - 1);
  const fp = frameParamsAt(t, kfs, eased);
  const full = { ...p, ...fp };
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W; canvas.height = H;
    gl.gl.viewport(0, 0, W, H);
  }
  gl.render(full);
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}

document.getElementById('vid-dur').addEventListener('input', (e) => {
  document.getElementById('vid-dur-v').textContent = e.target.value + 's';
});

document.getElementById('vid-render').addEventListener('click', async () => {
  if (!hasPhoto) { fileInput.click(); return; }
  const dur = parseInt(document.getElementById('vid-dur').value, 10);
  const fps = parseInt(document.getElementById('vid-fps').value, 10);
  const [W, H] = document.getElementById('vid-size').value.split('x').map(Number);
  const crf = parseInt(document.getElementById('vid-crf').value, 10);
  const eased = document.getElementById('vid-ease').checked;
  const totalFrames = Math.max(2, Math.round(dur * fps));

  let kfs;
  if (keyframes.length >= 2) kfs = keyframes.slice();
  else { const target = keyframes[0] || snapshot(); kfs = [diveStart(target), target]; }

  const ow = canvas.width, oh = canvas.height;
  exporting = true;
  cancelRender = false;
  renderOverlay.hidden = false;
  renderFill.style.width = '0%';
  renderTitle.textContent = 'Preparing…';
  renderMsg.textContent = '';

  try {
    const blob = await encodeVideo({
      totalFrames, fps, crf,
      getFrame: (i) => renderVideoFrame(i, totalFrames, kfs, W, H, eased),
      onProgress: onRenderProgress,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fractalize-${Date.now()}.mp4`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    renderMsg.textContent = `done · ${(blob.size / 1e6).toFixed(1)} MB`;
    setTimeout(() => { renderOverlay.hidden = true; }, 1200);
  } catch (e) {
    if (e.message === 'cancelled') { renderOverlay.hidden = true; }
    else { renderTitle.textContent = 'Render failed'; renderMsg.textContent = e.message || String(e); }
  } finally {
    exporting = false;
    canvas.width = ow; canvas.height = oh;
    gl.gl.viewport(0, 0, ow, oh);
    requestRender();
  }
});

// ---------- panel toggle ----------
document.getElementById('panel-toggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-hidden');
});

// ---------- docs overlay ----------
const docsOverlay = document.getElementById('docs-overlay');
const openDocs = () => { docsOverlay.hidden = false; };
const closeDocs = () => { docsOverlay.hidden = true; };
document.getElementById('docs-btn').addEventListener('click', openDocs);
document.getElementById('docs-close').addEventListener('click', closeDocs);
docsOverlay.addEventListener('click', (e) => { if (e.target === docsOverlay) closeDocs(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDocs(); });

window.addEventListener('resize', requestRender);
syncJuliaVisibility();
requestRender();
