// app.js — the controls, the canvas, and the three modes.
//
// The engine (cffourier.wasm) owns all the arithmetic; this file owns pixels
// and state. The one rule worth remembering while reading it: every view
// returned by the engine points straight into WebAssembly memory and is only
// valid until the next engine call, so nothing here holds one across a frame.

import { loadEngine } from './engine.js';
import { CONSTANTS, resolve } from './numbers.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

/** Frequencies above this are dropped: drawing one honestly costs more samples
 *  than a frame has, and its circle is far under a pixel anyway. */
const Q_DRAW = 15000;
/** Samples per cycle of the fastest term. Below about 8 the fine structure
 *  aliases into shapes the number does not have; 32 is where the smallest
 *  ripples stop looking faceted at full-screen size. */
const PER_CYCLE = 32;

const cv = $('c');
const ctx = cv.getContext('2d', { alpha: false });

const S = {
  mode: 'curve',
  input: 'pi',
  spec: null,
  exp: null,
  alpha: 1,
  k: 12,
  kMax: 12,
  epicycles: false,
  anim: null,          // 'build' | 'trace' | 'sweep' | null
  animT: 0,
  sweepN: 720,
  sweepI: 97,
  ovN: 4000,
  ovQ: 1024,
  ovDone: 0,
  ovScale: 0,
  dirty: true,
};

let eng = null;
let raf = 0;

// ------------------------------------------------------------------ startup --

(async function start() {
  try {
    eng = await loadEngine(new URL('./cffourier.wasm', import.meta.url));
  } catch (err) {
    $('status').textContent = 'the engine did not load';
    $('note').textContent = String(err);
    return;
  }
  buildGallery();
  wire();
  readHash();
  resize();
  addEventListener('resize', resize);
  addEventListener('hashchange', () => { readHash(); mark(); });
  loop();
})();

function buildGallery() {
  const g = $('gallery');
  for (const c of CONSTANTS) {
    const b = document.createElement('button');
    b.textContent = c.label;
    b.title = c.blurb;
    b.dataset.id = c.id;
    b.addEventListener('click', () => setInput(c.id));
    g.appendChild(b);
  }
}

// -------------------------------------------------------------------- state --

function setInput(v, { push = true } = {}) {
  S.input = v;
  $('x').value = v;
  const spec = resolve(v);
  if (spec.error) {
    $('x').classList.add('bad');
    $('note').textContent = spec.error;
    $('note').className = 'note warn';
    return;
  }
  $('x').classList.remove('bad');
  const exp = eng.setNumber(spec, 128);
  if (!exp) {
    $('x').classList.add('bad');
    $('note').textContent = 'the engine could not expand that';
    return;
  }
  S.spec = spec;
  S.exp = exp;
  // terms whose circle is worth sampling; the rest are named in the readout
  S.kMax = Math.max(1, exp.qs.filter((q) => q <= Q_DRAW).length);
  S.k = S.kMax;
  const ks = $('k');
  ks.max = String(S.kMax);
  ks.value = String(S.k);
  for (const b of $('gallery').children) b.classList.toggle('on', b.dataset.id === (spec.const && spec.const.id));
  if (push) writeHash();
  mark();
}

function mark() { S.dirty = true; }

// --------------------------------------------------------------------- hash --

function writeHash() {
  const p = new URLSearchParams();
  p.set('x', S.input);
  p.set('a', String(round(S.alpha, 2)));
  if (S.k !== S.kMax) p.set('k', String(S.k));
  if (S.mode !== 'curve') p.set('m', S.mode);
  const h = '#' + p.toString();
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  // an absent mode means the single-number view, not "leave it as it was" —
  // otherwise following a plain #x= link from the overlay stays on the overlay
  setMode(p.get('m') || 'curve', { push: false });
  const a = parseFloat(p.get('a'));
  if (Number.isFinite(a)) { S.alpha = clamp(a, 0.2, 1.5); $('alpha').value = String(S.alpha); }
  setInput(p.get('x') || S.input, { push: false });
  const k = parseInt(p.get('k'), 10);
  if (Number.isFinite(k)) { S.k = clamp(k, 1, S.kMax); $('k').value = String(S.k); }
  syncOutputs();
}

// ------------------------------------------------------------------- wiring --

function wire() {
  $('x').value = S.input;
  $('x').addEventListener('change', (e) => setInput(e.target.value.trim()));
  $('x').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  for (const id of ['m-curve', 'm-sweep', 'm-overlay']) {
    $(id).addEventListener('click', () => setMode($(id).dataset.mode));
  }

  $('alpha').addEventListener('input', (e) => { S.alpha = parseFloat(e.target.value); S.ovDone = 0; syncOutputs(); writeHash(); mark(); });
  $('k').addEventListener('input', (e) => { S.k = parseInt(e.target.value, 10); stop(); syncOutputs(); writeHash(); mark(); });
  $('a-half').addEventListener('click', () => { S.alpha = 0.5; $('alpha').value = '0.5'; S.ovDone = 0; syncOutputs(); writeHash(); mark(); });
  $('a-one').addEventListener('click', () => { S.alpha = 1; $('alpha').value = '1'; S.ovDone = 0; syncOutputs(); writeHash(); mark(); });

  $('play-build').addEventListener('click', () => toggle('build'));
  $('play-trace').addEventListener('click', () => toggle('trace'));
  $('epi').addEventListener('click', () => {
    S.epicycles = !S.epicycles;
    $('epi').setAttribute('aria-pressed', String(S.epicycles));
    mark();
  });

  $('sweepN').addEventListener('input', (e) => {
    S.sweepN = parseInt(e.target.value, 10);
    $('sweepI').max = String(S.sweepN - 1);
    S.sweepI = Math.min(S.sweepI, S.sweepN - 1);
    $('sweepI').value = String(S.sweepI);
    syncOutputs(); mark();
  });
  $('sweepI').addEventListener('input', (e) => { S.sweepI = parseInt(e.target.value, 10); S.anim = null; syncOutputs(); mark(); });
  $('ovN').addEventListener('input', (e) => { S.ovN = parseInt(e.target.value, 10); S.ovDone = 0; syncOutputs(); mark(); });
  $('ovQ').addEventListener('input', (e) => { S.ovQ = parseInt(e.target.value, 10); S.ovDone = 0; syncOutputs(); mark(); });

  $('save-png').addEventListener('click', savePNG);
  $('save-svg').addEventListener('click', saveSVG);
  $('link').addEventListener('click', copyLink);

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); toggle(S.mode === 'sweep' ? 'sweep' : 'trace'); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const ids = CONSTANTS.map((c) => c.id);
      const cur = S.spec && S.spec.const ? ids.indexOf(S.spec.const.id) : -1;
      const next = (cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1) + ids.length) % ids.length;
      setInput(ids[next]);
    }
  });
}

function setMode(m, { push = true } = {}) {
  if (!['curve', 'sweep', 'overlay'].includes(m)) return;
  S.mode = m;
  S.anim = m === 'sweep' ? 'sweep' : null;
  S.ovDone = 0;
  for (const id of ['m-curve', 'm-sweep', 'm-overlay']) {
    $(id).setAttribute('aria-pressed', String($(id).dataset.mode === m));
  }
  $('pane-curve').hidden = m !== 'curve';
  $('pane-sweep').hidden = m !== 'sweep';
  $('pane-overlay').hidden = m !== 'overlay';
  // the term count and the animations only mean something for a single number
  for (const id of ['k', 'play-build', 'play-trace', 'epi']) $(id).disabled = m !== 'curve';
  $('row-k').style.opacity = m === 'curve' ? '1' : '.45';
  if (push) writeHash();
  syncOutputs();
  mark();
}

function toggle(which) {
  S.anim = S.anim === which ? null : which;
  S.animT = 0;
  $('play-build').textContent = S.anim === 'build' ? '■ build up' : '▶ build up';
  $('play-trace').textContent = S.anim === 'trace' ? '■ trace' : '▶ trace';
  mark();
}
function stop() { if (S.anim === 'build' || S.anim === 'trace') toggle(S.anim); }

function syncOutputs() {
  $('alpha-o').textContent = S.alpha === 0.5 ? '½' : round(S.alpha, 2).toFixed(2);
  $('k-o').textContent = `${S.k}/${S.exp ? S.exp.n : S.kMax}`;
  $('sweepN-o').textContent = String(S.sweepN);
  $('sweepI-o').textContent = `${S.sweepI}/${S.sweepN}`;
  $('ovN-o').textContent = String(S.ovN);
  $('ovQ-o').textContent = `q≤${S.ovQ}`;
}

// ------------------------------------------------------------------- canvas --

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(cv.clientWidth * dpr);
  if (w > 0 && (cv.width !== w || cv.height !== w)) { cv.width = w; cv.height = w; S.ovDone = 0; }
  mark();
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (S.mode === 'overlay') { stepOverlay(); return; }
  // the epicycle chain turns on its own even when no animation is "playing" —
  // a still picture of the circles is much less use than a moving one
  if (S.anim || (S.mode === 'curve' && S.epicycles)) { S.animT += 1 / 60; S.dirty = true; }
  if (!S.dirty) return;
  S.dirty = false;
  if (S.mode === 'sweep') drawSweep();
  else drawCurve();
}

/** Map curve coordinates into the canvas, fitting `bbox` with a margin. */
function fitter(bbox, pad = 0.09) {
  const W = cv.width, H = cv.height;
  const w = Math.max(bbox[2] - bbox[0], 1e-6), h = Math.max(bbox[3] - bbox[1], 1e-6);
  const s = Math.min(W / w, H / h) * (1 - pad * 2);
  const mx = (bbox[0] + bbox[2]) / 2, my = (bbox[1] + bbox[3]) / 2;
  return { s, x: (u) => W / 2 + (u - mx) * s, y: (v) => H / 2 - (v - my) * s };
}

function clearCanvas() {
  ctx.fillStyle = '#071624';
  ctx.fillRect(0, 0, cv.width, cv.height);
}

function strokeXY(xy, T, from = 0, to = xy.length / 2, close = true) {
  ctx.beginPath();
  ctx.moveTo(T.x(xy[from * 2]), T.y(xy[from * 2 + 1]));
  for (let i = from + 1; i < to; i++) ctx.lineTo(T.x(xy[i * 2]), T.y(xy[i * 2 + 1]));
  if (close && to === xy.length / 2) ctx.lineTo(T.x(xy[0]), T.y(xy[1]));
  ctx.stroke();
}

// ------------------------------------------------------------- mode: curve --

function drawCurve() {
  if (!S.exp) return;
  const k = S.anim === 'build' ? buildK() : S.k;
  const { xy, bbox, arc, n } = sample(k);
  const T = fitter(bbox);
  clearCanvas();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#9fc9ee';
  ctx.lineWidth = Math.max(1, cv.width / 700);

  if (S.anim === 'trace') {
    const frac = (S.animT / 6) % 1;
    const upto = Math.max(2, Math.floor(n * frac));
    ctx.globalAlpha = 0.28;
    strokeXY(xy, T);
    ctx.globalAlpha = 1;
    strokeXY(xy, T, 0, upto, false);
    drawChain(k, TAU * frac, T);
  } else {
    strokeXY(xy, T);
    if (S.epicycles) drawChain(k, ((S.animT / 8) % 1) * TAU, T);
  }

  stamp(k, arc, n);
}

/** Terms shown by the build-up animation: one more every 0.6 s, then a hold. */
function buildK() {
  const step = Math.floor(S.animT / 0.6);
  const hold = 4;
  const cycle = S.kMax + hold;
  return clamp((step % cycle) + 1, 1, S.k);
}

function sample(k) {
  const floor = Math.round(cv.width * 3);
  const cap = 1 << 20;
  return eng.build(k, S.alpha, { perCycle: PER_CYCLE, floor, cap });
}

function drawChain(k, t, T) {
  const c = eng.chain(k, S.alpha, t);
  const pts = [];
  for (let i = 0; i < c.length; i += 2) pts.push([T.x(c[i]), T.y(c[i + 1])]);
  ctx.save();
  ctx.strokeStyle = 'rgba(160,200,230,0.35)';
  ctx.lineWidth = Math.max(1, cv.width / 1100);
  for (let i = 0; i + 1 < pts.length; i++) {
    const r = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (r < 1.2) continue;
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], r, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,215,154,0.85)';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  const pen = pts[pts.length - 1];
  ctx.fillStyle = '#ffd79a';
  ctx.beginPath();
  ctx.arc(pen[0], pen[1], Math.max(2, cv.width / 260), 0, TAU);
  ctx.fill();
  ctx.restore();
}

// -------------------------------------------------------------- mode: sweep --

function drawSweep() {
  if (S.anim === 'sweep') {
    S.sweepI = 1 + Math.floor((S.animT * 60) % (S.sweepN - 1));
    $('sweepI').value = String(S.sweepI);
    $('sweepI-o').textContent = `${S.sweepI}/${S.sweepN}`;
  }
  const exp = eng.setNumber({ kind: 'ratio', p: BigInt(S.sweepI), q: BigInt(S.sweepN) });
  const k = exp.qs.filter((q) => q <= Q_DRAW).length || 1;
  const { xy, bbox, arc, n } = eng.build(k, S.alpha, { perCycle: PER_CYCLE, floor: cv.width * 2, cap: 1 << 19 });
  // a fixed frame, so the shape's size means something as x moves
  const R = 1.35 * (1 + 1 / Math.pow(2, S.alpha) + 1 / Math.pow(3, S.alpha));
  const T = fitter([-R, -R, R, R], 0.04);
  clearCanvas();
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = '#9fc9ee';
  ctx.lineWidth = Math.max(1, cv.width / 800);
  strokeXY(xy, T);
  const g = gcdInt(S.sweepI, S.sweepN);
  $('stamp').innerHTML = `<b>${S.sweepI / g}/${S.sweepN / g}</b><br>${fmtTerms(exp.terms, exp.n)}`;
  $('status').textContent = `${k} terms · ${n.toLocaleString()} samples · arc ${arc.toFixed(2)}`;
  $('readout').innerHTML = qsLine(exp, k);
  $('note').className = 'note';
  $('note').textContent = 'Every x here is a rational, so every expansion is exact and finite — and the picture jumps rather than glides, because the terms of i/N and (i+1)/N have nothing to do with each other.';
  void bbox;
}

function gcdInt(a, b) { while (b) { [a, b] = [b, a % b]; } return a || 1; }

// ------------------------------------------------------------ mode: overlay --

function stepOverlay() {
  const W = Math.min(cv.width, 1400), H = W;
  if (S.ovDone === 0) {
    S.ovScale = overlayScale(W);
    eng.planeInit(W, H, 0, 0, S.ovScale);
    clearCanvas();
  }
  if (S.ovDone >= S.ovN) { paintPlane(W, H); return; }
  const batch = Math.max(20, Math.round(S.ovN / 60));
  const from = S.ovDone + 1;
  const to = Math.min(S.ovN, S.ovDone + batch);
  eng.planeAdd(from, to + 1, S.ovN, S.alpha, S.ovQ, 12, 1 << 16);
  S.ovDone = to;
  paintPlane(W, H);
}

/** Pixels per unit for the overlay: fit the widest curve in the family, so the
 *  frame is the same for every number and the pile-up is meaningful. */
function overlayScale(W) {
  let R = 1;
  for (let i = 1; i < 24; i++) {
    const p = Math.max(1, Math.round((i * S.ovN) / 24));
    const e = eng.setNumber({ kind: 'ratio', p: BigInt(p), q: BigInt(S.ovN) });
    const k = e.qs.filter((q) => q <= S.ovQ).length || 1;
    const b = eng.build(k, S.alpha, { perCycle: 8, floor: 2048, cap: 1 << 16 }).bbox;
    R = Math.max(R, Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]));
  }
  if (S.spec) eng.setNumber(S.spec, 128);
  return (W / 2) / (R * 1.04);
}

function paintPlane(W, H) {
  const px = eng.planePixels(W, H);
  const max = Math.max(1, eng.planeMax());
  const img = ctx.createImageData(W, H);
  const d = img.data;
  // log tone curve: the interesting structure lives in the low counts, and a
  // linear ramp would show only the few brightest ridges
  const norm = 1 / Math.log1p(max);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) {
    const v = px[i];
    if (v === 0) { d[j] = 7; d[j + 1] = 22; d[j + 2] = 36; d[j + 3] = 255; continue; }
    // a touch of gamma on top of the log keeps the single-visit haze from
    // flooding the frame, which is where the empty regions stop being visible
    const u = Math.pow(Math.min(1, Math.log1p(v) * norm), 1.35);
    d[j] = Math.round(7 + u * (232 - 7));
    d[j + 1] = Math.round(22 + u * (243 - 22));
    d[j + 2] = Math.round(36 + u * (255 - 36));
    d[j + 3] = 255;
  }
  clearCanvas();
  const off = (cv.width - W) / 2;
  ctx.putImageData(img, off, off);
  $('stamp').innerHTML = `<b>i / ${S.ovN}</b><br>every number on the lattice`;
  $('status').textContent = `${S.ovDone.toLocaleString()} / ${S.ovN.toLocaleString()} curves · brightest pixel visited by ${max}`;
  $('readout').innerHTML =
    `<span class="qs">α = <em>${round(S.alpha, 2)}</em> · terms with <em>q ≤ ${S.ovQ}</em> · ` +
    `pixel brightness = how many of the ${S.ovN.toLocaleString()} numbers pass through it</span>`;
  $('note').className = 'note';
  $('note').textContent = S.ovDone >= S.ovN
    ? 'Matt asked of his version of this picture: is it a fractal, and what shape are the parts that stay empty? Nobody in the thread answered.'
    : 'building…';
}

// ------------------------------------------------------------------ readout --

function stamp(k, arc, n) {
  const e = S.exp;
  $('stamp').innerHTML = `<b>${escapeHTML(S.spec.label)}</b><br>${fmtTerms(e.terms, k)}`;
  const hidden = e.n - S.kMax;
  $('status').textContent =
    `${k} of ${e.n} terms · ${n.toLocaleString()} samples · arc ${arc.toFixed(2)}` +
    (hidden > 0 ? ` · ${hidden} finer than the screen` : '');
  $('readout').innerHTML = qsLine(e, k);
  const warn = S.spec.approx;
  $('note').className = 'note' + (warn ? ' warn' : '');
  $('note').textContent = (S.spec.const ? S.spec.const.blurb + ' ' : '') + S.spec.note;
}

function fmtTerms(terms, k) {
  const parts = terms.slice(0, Math.min(k, 14)).map((a, i) =>
    i < k ? `<b>${fmtInt(a)}</b>` : fmtInt(a));
  let s = `[${parts[0]}; ${parts.slice(1).join(', ')}`;
  if (terms.length > 14) s += ', …';
  return s + ']';
}

function qsLine(e, k) {
  const qs = e.qs.slice(0, Math.min(e.n, 16)).map((q, i) =>
    i < k ? `<em>${fmtInt(q)}</em>` : fmtInt(q));
  const tail = e.n > 16 ? ', …' : '';
  const per = e.period ? ` · periodic from term ${e.period.start}, length ${e.period.length}` : '';
  // a decimal standing in for a constant "terminates" only as the rational it
  // literally is, which would read as a claim about the constant
  const end = e.terminated && !(S.spec && S.spec.approx) ? ' · terminates' : '';
  return `<span class="terms">${fmtTerms(e.terms, k)}</span><br>` +
         `<span class="qs">q = ${qs.join(', ')}${tail}${per}${end}</span>`;
}

function fmtInt(v) {
  return Math.abs(v) >= 1e15 ? v.toExponential(3) : Math.round(v).toLocaleString('en-US');
}

function escapeHTML(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ------------------------------------------------------------------ exports --

function fileStem() {
  // prefer the constant's id: "phi" survives a filename, "φ" does not
  const name = (S.spec && S.spec.const && S.spec.const.id) || (S.spec ? S.spec.label : '');
  const base = String(name).replace(/[^\w.+-]+/g, '_').replace(/^_+|_+$/g, '') || 'curve';
  return `cf-${base}-a${round(S.alpha, 2)}`;
}

function savePNG() {
  cv.toBlob((blob) => download(blob, `${fileStem()}.png`), 'image/png');
}

/**
 * SVG export. The on-screen curve can be a million points; a path that size is
 * useless as a file, so points closer than a third of a pixel to the last one
 * kept are dropped. That is a rendering decision, not a maths one — the
 * discarded points are inside the stroke width.
 */
function saveSVG() {
  if (S.mode !== 'curve' || !S.exp) { $('note').textContent = 'SVG export draws the single-number view.'; return; }
  const size = 1000;
  const { xy, bbox } = sample(S.k);
  const w = Math.max(bbox[2] - bbox[0], 1e-6), h = Math.max(bbox[3] - bbox[1], 1e-6);
  const s = Math.min(size / w, size / h) * 0.9;
  const mx = (bbox[0] + bbox[2]) / 2, my = (bbox[1] + bbox[3]) / 2;
  const X = (u) => (size / 2 + (u - mx) * s).toFixed(2);
  const Y = (v) => (size / 2 - (v - my) * s).toFixed(2);
  const out = [`M${X(xy[0])} ${Y(xy[1])}`];
  let lx = parseFloat(X(xy[0])), ly = parseFloat(Y(xy[1]));
  for (let i = 1; i < xy.length / 2; i++) {
    const px = parseFloat(X(xy[i * 2])), py = parseFloat(Y(xy[i * 2 + 1]));
    if (Math.abs(px - lx) + Math.abs(py - ly) < 0.33) continue;
    out.push(`L${px} ${py}`);
    lx = px; ly = py;
  }
  out.push('Z');
  const label = escapeHTML(S.spec.label);
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<title>z(t) = sum exp(i q_k t) / q_k^${round(S.alpha, 2)} for ${label}</title>
<desc>Continued fraction Fourier curve. q = ${S.exp.qs.slice(0, S.k).join(', ')}. After a demo by Matt Henderson (matthen.com).</desc>
<rect width="${size}" height="${size}" fill="#071624"/>
<path d="${out.join('')}" fill="none" stroke="#9fc9ee" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;
  download(new Blob([svg], { type: 'image/svg+xml' }), `${fileStem()}.svg`);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function copyLink() {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    $('link').textContent = 'copied';
  } catch {
    $('link').textContent = location.href;
  }
  setTimeout(() => { $('link').textContent = 'copy link'; }, 1600);
}

// -------------------------------------------------------------------- utils --

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function round(v, d) { const m = Math.pow(10, d); return Math.round(v * m) / m; }
