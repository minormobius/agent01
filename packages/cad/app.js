// app.js — cad.mino.mobi. The viewer and the judgement surface: a tree on
// the left, the part in the middle, the numbers on the right. Every edit
// rebuilds through the worker; the preview lands first, the exact build with
// named faces lands behind it. `window.__cad` is the test hook.
import { Camera } from './camera.js';
import { Renderer } from './gl.js';

const $ = (s) => document.querySelector(s);
const BENCH = ['gear', 'arbor', 'plate', 'escape', 'case', 'case-fillet'];

const state = {
  tree: null, treeText: '', name: 'gear',
  buildId: 0, preview: null, exact: null, error: null, resolved: null,
  faces: [], hover: -1, select: -1, timings: {}, exactStale: true,
};

const canvas = $('#view');
const renderer = new Renderer(canvas);
const cam = new Camera();
let needsRender = true;
const invalidate = () => { needsRender = true; };

// ── worker ────────────────────────────────────────────────────────────────
const worker = new Worker('./build-worker.js', { type: 'module' });
const ready = new Promise((resolve) => { worker.addEventListener('message', function onready(e) { if (e.data.type === 'ready') { worker.removeEventListener('message', onready); resolve(e.data); } }); });
worker.postMessage({ type: 'init' });

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'ready') { setStatus(`engine v${m.engine} + manifold ready in ${m.ms.toFixed(0)} ms`); return; }
  if (m.id !== undefined && m.id !== state.buildId && m.type !== 'export') return; // stale
  if (m.type === 'resolved') { state.resolved = m; renderTree(); return; }
  if (m.type === 'preview') {
    state.preview = m; state.timings.preview = m.ms;
    if (!state.exact || state.exactStale) { renderer.preview = true; renderer.setMesh(m.streams, m.edges, m.bbox); if (state.fitNext) { cam.fit(m.bbox); state.fitNext = false; } }
    state.error = null; renderReport(); invalidate(); return;
  }
  if (m.type === 'exact') {
    state.exact = m; state.exactStale = false; state.faces = m.report.faces; state.timings.exact = m.ms;
    renderer.preview = false; renderer.setMesh(m.streams, m.edges, m.bbox);
    if (state.fitNext) { cam.fit(m.bbox); state.fitNext = false; }
    renderReport(); invalidate(); return;
  }
  if (m.type === 'error') {
    if (m.stage === 'exact') { state.exact = null; state.faces = []; state.exactError = m.error; }
    else if (m.stage === 'preview') { state.previewError = m.error; }
    else { state.error = m.error; renderer.clearMesh(); invalidate(); }
    renderReport(); return;
  }
  if (m.type === 'export') { download(new Blob([m.bytes], { type: 'model/stl' }), `${state.name}.stl`); }
};

function build({ fit = false } = {}) {
  state.buildId++; state.fitNext = fit || state.fitNext;
  state.exactStale = true; state.error = null; state.previewError = null; state.exactError = null;
  state.faces = []; state.hover = -1; state.select = -1; renderer.hover = -1; renderer.select = -1;
  worker.postMessage({ type: 'build', id: state.buildId, tree: state.treeText, want: { preview: true, exact: true, step: false } });
  setStatus('building…');
}

// ── tree + params ─────────────────────────────────────────────────────────
function setTree(obj, name) {
  state.tree = obj; state.name = name || state.name;
  state.treeText = JSON.stringify(obj, null, 2);
  $('#json').value = state.treeText;
  renderParams();
  history.replaceState(null, '', name && BENCH.includes(name) ? `?part=${name}` : `#t=${b64(state.treeText)}`);
}

function renderParams() {
  const box = $('#params'); box.innerHTML = '';
  const params = state.tree?.params || {};
  for (const [k, v] of Object.entries(params)) {
    const row = document.createElement('label'); row.className = 'param';
    const name = document.createElement('span'); name.textContent = k; name.title = 'drag to scrub';
    const input = document.createElement('input');
    const isNum = typeof v === 'number';
    input.type = isNum ? 'number' : 'text'; input.value = v; if (isNum) input.step = 'any';
    input.addEventListener('input', () => { const val = isNum ? Number(input.value) : input.value; if (isNum && !Number.isFinite(val)) return; state.tree.params[k] = val; state.treeText = JSON.stringify(state.tree, null, 2); $('#json').value = state.treeText; build(); });
    if (isNum) scrub(name, () => Number(input.value), (nv) => { input.value = +nv.toPrecision(6); input.dispatchEvent(new Event('input')); });
    row.append(name, input); box.append(row);
  }
  if (!Object.keys(params).length) box.innerHTML = '<div class="dim">no params</div>';
}

function scrub(el, get, set) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const x0 = e.clientX, v0 = get(); const scale = Math.max(Math.abs(v0), 1) / 200;
    const move = (ev) => set(v0 + (ev.clientX - x0) * scale * (ev.shiftKey ? 0.1 : 1));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}

function renderTree() {
  const box = $('#features'); box.innerHTML = '';
  const feats = state.tree?.features || [];
  for (const f of feats) {
    const li = document.createElement('div'); li.className = 'feat';
    li.innerHTML = `<b>${f.op}</b> <span>${f.id}</span>`;
    const detail = Object.entries(f).filter(([k]) => !['op', 'id', 'loops'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
    li.title = detail;
    box.append(li);
  }
}

// ── report ────────────────────────────────────────────────────────────────
const fmt = (x, d = 3) => (x === undefined || x === null || !isFinite(x) ? '–' : Number(x).toFixed(d));
function renderReport() {
  const p = state.preview, x = state.exact;
  const rows = [];
  const inv = (m) => m?.invariants;
  const cell = (a, b) => `<td>${a}</td><td>${b}</td>`;
  rows.push(`<tr><th></th><th>preview<br><small>manifold</small></th><th>exact<br><small>truck</small></th></tr>`);
  rows.push(`<tr><td>build</td>${cell(p ? `${fmt(p.ms, 0)} ms` : '–', x ? `${fmt(x.ms, 0)} ms` : state.exactError ? `<span class="bad">${state.exactError.unsupported ? 'unsupported' : 'failed'}</span>` : '…')}</tr>`);
  rows.push(`<tr><td>volume</td>${cell(fmt(inv(p)?.volume), fmt(inv(x)?.volume))}</tr>`);
  rows.push(`<tr><td>area</td>${cell(fmt(inv(p)?.area, 2), fmt(inv(x)?.area, 2))}</tr>`);
  rows.push(`<tr><td>χ</td>${cell(inv(p)?.euler ?? '–', inv(x)?.euler ?? '–')}</tr>`);
  rows.push(`<tr><td>watertight</td>${cell(wt(inv(p)), wt(inv(x)))}</tr>`);
  rows.push(`<tr><td>triangles</td>${cell(inv(p)?.tris ?? '–', inv(x)?.tris ?? '–')}</tr>`);
  rows.push(`<tr><td>bbox</td>${cell(bb(inv(p)), bb(inv(x)))}</tr>`);
  rows.push(`<tr><td>named faces</td>${cell('–', x ? new Set(x.report.faces.flatMap((f) => f.names)).size : '–')}</tr>`);
  $('#report').innerHTML = `<table>${rows.join('')}</table>`;
  const err = state.error || state.previewError;
  $('#error').textContent = err ? `${err.op}: ${err.msg}` : state.exactError ? `exact (${state.exactError.op}): ${state.exactError.msg}` : '';
  $('#error').className = state.error || state.previewError ? 'bad' : state.exactError ? 'warn' : '';
  setStatus(x ? `exact ${fmt(x.ms, 0)} ms · preview ${fmt(p?.ms, 0)} ms` : p ? `preview ${fmt(p.ms, 0)} ms · exact…` : '');
  renderFace();
}
const wt = (i) => (i ? (i.watertight ? '✓' : `✗ ${i.open_edges}/${i.flipped_edges}`) : '–');
const bb = (i) => (i ? `${i.bbox[0].map((v) => fmt(v, 1)).join(',')} → ${i.bbox[1].map((v) => fmt(v, 1)).join(',')}` : '–');

function renderFace() {
  const id = state.select >= 0 ? state.select : state.hover;
  const box = $('#face');
  if (id < 0) { box.innerHTML = '<span class="dim">hover a face</span>'; return; }
  const f = state.faces[id];
  if (!f) { box.innerHTML = `<span class="dim">${state.exact ? 'face ' + id : 'preview face ' + id + ' — names arrive with the exact build'}</span>`; return; }
  box.innerHTML = `<div class="names">${f.names.map((n) => `<code>${n}</code>`).join(' ')}</div><div>area ${fmt(f.area)} · n (${f.normal.map((v) => fmt(v, 2)).join(', ')}) · c (${f.centroid.map((v) => fmt(v, 2)).join(', ')})</div>`;
}

function setStatus(s) { $('#status').textContent = s; }

// ── interaction ───────────────────────────────────────────────────────────
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved = true;
    if (drag.b === 0 && !drag.shift) cam.orbit(dx, dy); else cam.pan(dx, dy, canvas.clientHeight);
    invalidate(); return;
  }
  const r = canvas.getBoundingClientRect();
  const id = renderer.pick(e.clientX - r.left, e.clientY - r.top, cam);
  if (id !== state.hover) { state.hover = id; renderer.hover = id; renderFace(); invalidate(); }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) { const r = canvas.getBoundingClientRect(); const id = renderer.pick(e.clientX - r.left, e.clientY - r.top, cam); state.select = state.select === id ? -1 : id; renderer.select = state.select; renderFace(); invalidate(); }
  drag = null;
});
canvas.addEventListener('pointerleave', () => { if (state.hover !== -1) { state.hover = -1; renderer.hover = -1; renderFace(); invalidate(); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dolly(Math.exp(e.deltaY * 0.0015)); invalidate(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', invalidate);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'f') { cam.fit(currentBbox()); invalidate(); }
  else if (k === 'e') { renderer.showEdges = !renderer.showEdges; invalidate(); }
  else if (k === 'g') { renderer.showGrid = !renderer.showGrid; invalidate(); }
  else if (k === 'o') { cam.ortho = !cam.ortho; invalidate(); }
  else if ({ 1: 'front', 3: 'right', 7: 'top', 0: 'iso' }[k]) { cam.preset({ 1: 'front', 3: 'right', 7: 'top', 0: 'iso' }[k]); invalidate(); }
});
const currentBbox = () => (state.exact && !state.exactStale ? state.exact.bbox : state.preview?.bbox);

for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { cam.preset(b.dataset.view); invalidate(); });
$('#fit').addEventListener('click', () => { cam.fit(currentBbox()); invalidate(); });
$('#ortho').addEventListener('click', () => { cam.ortho = !cam.ortho; invalidate(); });
$('#edges').addEventListener('click', () => { renderer.showEdges = !renderer.showEdges; invalidate(); });
$('#apply').addEventListener('click', () => { try { const obj = JSON.parse($('#json').value); setTree(obj, obj.__name || 'custom'); build({ fit: true }); } catch (err) { $('#error').textContent = `JSON: ${err.message}`; $('#error').className = 'bad'; } });
$('#part').addEventListener('change', () => loadBench($('#part').value));
$('#stl').addEventListener('click', () => worker.postMessage({ type: 'export', id: ++state.exportId, which: state.exact && !state.exactStale ? 'exact' : 'preview' }));
$('#views').addEventListener('click', () => snapshots());
$('#share').addEventListener('click', async () => { const url = location.href; try { await navigator.clipboard.writeText(url); setStatus('link copied'); } catch { setStatus(url); } });
$('#file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; const text = await f.text(); try { const obj = JSON.parse(text); setTree(obj, f.name.replace(/\.json$/, '')); build({ fit: true }); } catch (err) { $('#error').textContent = `JSON: ${err.message}`; } });

function snapshots() {
  const strip = $('#strip'); strip.innerHTML = '';
  const keep = { yaw: cam.yaw, pitch: cam.pitch, ortho: cam.ortho };
  for (const v of ['iso', 'front', 'top']) {
    cam.preset(v); cam.ortho = v !== 'iso'; renderer.render(cam);
    const img = document.createElement('img'); img.src = renderer.snapshot(); img.title = v; strip.append(img);
  }
  Object.assign(cam, keep); invalidate();
}

function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

async function loadBench(name) {
  const r = await fetch(`./bench/${name}.json`); if (!r.ok) throw new Error(`no bench part ${name}`);
  const obj = await r.json(); $('#part').value = name; setTree(obj, name); build({ fit: true });
}

// ── frame loop ────────────────────────────────────────────────────────────
function frame() { if (needsRender) { needsRender = false; renderer.render(cam); } requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// ── boot ──────────────────────────────────────────────────────────────────
const sel = $('#part'); for (const b of BENCH) { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.append(o); }
const q = new URLSearchParams(location.search);
const boot = ready.then(async () => {
  if (location.hash.startsWith('#t=')) { const obj = JSON.parse(unb64(location.hash.slice(3))); setTree(obj, 'custom'); build({ fit: true }); }
  else await loadBench(BENCH.includes(q.get('part')) ? q.get('part') : 'gear');
});

window.__cad = {
  ready: boot, state, cam, renderer, load: loadBench,
  // resolves when both preview and exact have answered (or errored) for the current build
  settled: () => new Promise((resolve) => { const t = setInterval(() => { const done = (state.preview && state.preview.id === state.buildId) || state.previewError || state.error; const exactDone = (state.exact && state.exact.id === state.buildId) || state.exactError || state.error; if (done && exactDone) { clearInterval(t); resolve({ preview: state.preview?.invariants, exact: state.exact?.invariants, error: state.error, exactError: state.exactError, previewError: state.previewError, faces: state.faces.length }); } }, 50); }),
  render: () => renderer.render(cam),
};
