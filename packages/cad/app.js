// app.js — cad.mino.mobi. The viewer and the judgement surface, for one part
// or for an assembly of them. Every edit rebuilds through the worker; the
// preview lands first, the exact build with named faces behind it. An
// assembly is components (with transforms, sub-assemblies flattened) and
// mates (gear, fixed) solved as a kinematic chain from one driven component;
// `spin` drives it and reports the frame rate. `window.__cad` is the hook.
import { Camera } from './camera.js';
import { Renderer } from './gl.js';
import { flatten, solveAngles as solveKin, modelOf } from './lib/assembly.js';
import { measure, describe, faceWorld } from './lib/measure.js';

const $ = (s) => document.querySelector(s);
const BENCH = ['clock', 'train', 'gear', 'arbor', 'plate', 'escape', 'case', 'case-fillet', 'pinion', 'pallet', 'balance', 'hand', 'dial'];
const q = new URLSearchParams(location.search);
const OCCT_BASE = q.get('occt') || null;
const occtAllowed = () => !!OCCT_BASE || localStorage.getItem('cad.occt') === '1';

const state = {
  mode: 'part', name: 'gear', tree: null, treeText: '',
  buildId: 0, checkId: 0, fitNext: false,
  // per slot: {preview, exact, error, exactError, previewError, faces, needsOcct}
  slots: new Map(),
  // assembly
  asm: null, components: [], mates: [], drive: null, angles: new Map(), spin: false, t0: 0, tAcc: 0, fps: 0, speed: 1,
  hover: null, select: null, measureB: null, check: null, occt: 'idle',
};

const canvas = $('#view');
const renderer = new Renderer(canvas);
const cam = new Camera();
let needsRender = true;
const invalidate = () => { needsRender = true; };

// ── worker ────────────────────────────────────────────────────────────────
const worker = new Worker('./build-worker.js', { type: 'module' });
const ready = new Promise((resolve) => { worker.addEventListener('message', function onready(e) { if (e.data.type === 'ready') { worker.removeEventListener('message', onready); resolve(e.data); } }); });
worker.postMessage({ type: 'init', occtBase: OCCT_BASE ? new URL(OCCT_BASE, location.href).href : undefined });

const slotOf = (m) => { const k = m.slot || 'main'; if (!state.slots.has(k)) state.slots.set(k, {}); return state.slots.get(k); };
const isStale = (m) => m.id !== undefined && m.id !== (slotOf(m).buildId ?? -1);

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'ready') { setStatus(`engine v${m.engine} + manifold ready in ${m.ms.toFixed(0)} ms`); console.info(`cad: ready (engine v${m.engine}, ${m.ms.toFixed(0)} ms)`); return; }
  if (m.type === 'occt-status') { state.occt = m.state; if (m.state === 'ready') console.info(`cad: occt ready (${m.ms.toFixed(0)} ms)`); setStatus(m.state === 'loading' ? 'loading OCCT (66 MB, once; the browser caches it)…' : m.state === 'ready' ? `OCCT ready in ${(m.ms / 1000).toFixed(1)} s` : `OCCT failed: ${m.msg}`); renderReport(); return; }
  if (m.type === 'export') { download(new Blob([m.bytes], { type: 'model/stl' }), `${m.name || state.name}.stl`); return; }
  if (m.type === 'check') { state.check = { pairs: m.pairs, tested: m.tested, ms: m.ms, missing: m.missing }; renderCheck(); console.info(`cad: check ${m.pairs.length} pairs interfere of ${m.tested} tested`); return; }
  if (isStale(m)) return;
  const s = slotOf(m);
  if (m.type === 'resolved') { s.needsOcct = m.needsOcct; s.resolved = m; renderTree(); renderReport(); return; }
  if (m.type === 'preview') {
    s.preview = m; s.previewError = null;
    if (!s.exact || s.exactStale) applyMesh(m.slot || 'main', m, true);
    renderReport(); invalidate(); return;
  }
  if (m.type === 'exact') {
    s.exact = m; s.exactStale = false; s.exactError = null; s.faces = m.report.faces;
    applyMesh(m.slot || 'main', m, false);
    console.info(`cad: exact ${state.name}${m.slot && m.slot !== 'main' ? ' ' + m.slot : ''} volume ${m.invariants.volume.toFixed(3)} χ=${m.invariants.euler} faces ${m.report.faces.length} (${m.kernel})`);
    renderReport(); invalidate(); return;
  }
  if (m.type === 'error') {
    if (m.stage === 'exact') { s.exact = null; s.faces = []; s.exactError = m.error; s.occtWouldHelp = !!m.occtWouldHelp; }
    else if (m.stage === 'preview') { s.previewError = m.error; }
    else { s.error = m.error; if (state.mode === 'part') renderer.clearMesh(); invalidate(); }
    renderReport(); return;
  }
};

/// Put a mesh on the bodies that show this slot (one for a part, one per
/// component using the part for an assembly).
function applyMesh(slot, m, preview) {
  if (state.mode === 'part') { renderer.preview = preview; renderer.setMesh(m.streams, m.edges, m.bbox); }
  else {
    renderer.preview = false;
    for (const c of state.components) if (c.partKey === slot) { renderer.setBody(c.id, m.streams, m.edges, m.bbox); renderer.setHidden(c.id, !!c.hidden); c.tint = preview ? 0.9 : 1; }
    updateModels();
    renderer.setGrid(renderer.sceneBbox());
  }
  if (state.fitNext) { cam.fit(state.mode === 'part' ? m.bbox : renderer.sceneBbox()); state.fitNext = false; }
}

function buildSlot(slot, treeText) {
  const s = slotOf({ slot });
  s.buildId = ++state.buildId; s.exactStale = true; s.error = null; s.previewError = null; s.exactError = null; s.faces = [];
  worker.postMessage({ type: 'build', id: s.buildId, slot, tree: treeText, want: { preview: true, exact: true, occt: occtAllowed(), step: false } });
}

function build({ fit = false } = {}) {
  state.fitNext = fit || state.fitNext;
  state.hover = null; state.select = null; state.measureB = null; renderer.hover = -1; renderer.select = -1;
  if (state.mode === 'part') { buildSlot('main', state.treeText); setStatus('building…'); return; }
  // assembly: one slot per distinct part key
  const keys = new Set(state.components.map((c) => c.partKey));
  for (const k of keys) buildSlot(k, state.partTrees.get(k));
  setStatus(`building ${keys.size} part${keys.size === 1 ? '' : 's'}…`);
}

// ── trees, parts, assemblies ──────────────────────────────────────────────
async function setDocument(obj, name) {
  state.name = name || state.name;
  state.treeText = JSON.stringify(obj, null, 2);
  $('#json').value = state.treeText;
  for (const k of [...renderer.bodies.keys()]) renderer.removeBody(k);
  state.slots.clear();
  if (obj.components) { state.mode = 'asm'; state.asm = obj; await prepareAssembly(obj); }
  else { state.mode = 'part'; state.tree = obj; state.asm = null; state.components = []; state.mates = []; state.drive = null; state.spin = false; }
  document.body.dataset.mode = state.mode;
  renderParams(); renderTree();
  history.replaceState(null, '', name && BENCH.includes(name) ? `?part=${name}${OCCT_BASE ? '&occt=' + encodeURIComponent(OCCT_BASE) : ''}` : `#t=${b64(state.treeText)}`);
}

const benchCache = new Map();
async function fetchBench(name) {
  if (!benchCache.has(name)) benchCache.set(name, fetch(`./bench/${name}.json`).then((r) => { if (!r.ok) throw new Error(`no bench part ${name}`); return r.json(); }));
  return structuredClone(await benchCache.get(name));
}
const resolveRef = async (ref) => (typeof ref === 'string' && ref.startsWith('bench:') ? fetchBench(ref.slice(6)) : structuredClone(ref));

/// Flatten an assembly through the shared library; the page keeps the
/// components, mates and drive and asks the library for angles and matrices.
async function prepareAssembly(asm) {
  const { components, mates, drive, partTrees } = await flatten(asm, resolveRef);
  for (const c of components) c.tint = 1;
  state.components = components; state.mates = mates; state.partTrees = partTrees; state.drive = drive;
  state.spin = false; state.tAcc = 0; state.check = null;
  solveAngles(0);
}
function solveAngles(t) { state.angles = solveKin(state.components, state.mates, state.drive, t); return state.angles; }
function updateModels() { for (const c of state.components) renderer.setModel(c.id, modelOf(c, state.angles), c.tint); }

// ── UI: params / tree ─────────────────────────────────────────────────────
function renderParams() {
  const box = $('#params'); box.innerHTML = '';
  if (state.mode === 'asm') {
    const d = state.drive;
    const ctl = d?.kind === 'escapement' ? `<label>beat <input id="beat" type="number" step="any" min="0.01" value="${d.beat}"> s</label>` : `<label>rpm <input id="rpm" type="number" step="any" value="${d ? d.rpm : 0}" ${d ? '' : 'disabled'}></label>`;
    box.innerHTML = `<div class="asm-ctl"><button id="spin">${state.spin ? 'stop' : 'spin'}</button> ${ctl} <label>×<input id="speed" type="number" step="any" min="0" value="${state.speed}" title="time scale"></label> <span id="fps" class="dim"></span></div><div class="asm-ctl"><button id="check" title="intersect every overlapping pair of components at the current pose (Manifold)">check interference</button> <span id="checkout" class="dim">${state.check ? checkSummary() : ''}</span></div>`;
    $('#spin').addEventListener('click', toggleSpin);
    $('#check').addEventListener('click', runCheck);
    $('#rpm')?.addEventListener('input', () => { if (state.drive) state.drive.rpm = Number($('#rpm').value) || 0; });
    $('#beat')?.addEventListener('input', () => { if (state.drive) state.drive.beat = Math.max(0.01, Number($('#beat').value) || 1); });
    $('#speed').addEventListener('input', () => { state.speed = Math.max(0, Number($('#speed').value) || 0); });
    const list = document.createElement('div');
    for (const c of state.components) {
      const row = document.createElement('div'); row.className = 'feat' + (c.hidden ? ' off' : ''); row.dataset.comp = c.id; row.innerHTML = `<b>${c.part}</b> <span>${c.id}</span>`;
      row.title = `at ${c.place.slice(12, 15).map((v) => +v.toFixed(2)).join(', ')} phase ${(+c.phase).toFixed(2)}° — click to hide/show`;
      row.addEventListener('pointerenter', () => highlightComponent(c.id)); row.addEventListener('pointerleave', () => highlightComponent(state.select?.name || state.hover?.name || null));
      row.addEventListener('click', () => { c.hidden = !c.hidden; renderer.setHidden(c.id, c.hidden); row.classList.toggle('off', c.hidden); invalidate(); });
      list.append(row);
    }
    box.append(list);
    return;
  }
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
  if (state.mode === 'asm') {
    for (const m of state.mates) { const li = document.createElement('div'); li.className = 'feat'; li.innerHTML = `<b>${m.kind}</b> <span>${m.a} ↔ ${m.b}${m.kind === 'gear' ? ` (${m.za}:${m.zb})` : ''}</span>`; box.append(li); }
    if (state.drive) { const li = document.createElement('div'); li.className = 'feat'; li.innerHTML = state.drive.kind === 'escapement' ? `<b>escapement</b> <span>${state.drive.wheel} · ${state.drive.pallet} · ${state.drive.balance}, ${state.drive.teeth} teeth, ${state.drive.beat} s beat</span>` : `<b>drive</b> <span>${state.drive.component} at ${state.drive.rpm} rpm</span>`; box.append(li); }
    return;
  }
  for (const f of state.tree?.features || []) {
    const li = document.createElement('div'); li.className = 'feat';
    li.innerHTML = `<b>${f.op}</b> <span>${f.id}</span>`;
    li.title = Object.entries(f).filter(([k]) => !['op', 'id', 'loops'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
    box.append(li);
  }
}

// ── UI: report ────────────────────────────────────────────────────────────
const fmt = (x, d = 3) => (x === undefined || x === null || !isFinite(x) ? '–' : Number(x).toFixed(d));
const wt = (i) => (i ? (i.watertight ? '✓' : `✗ ${i.open_edges}/${i.flipped_edges}`) : '–');
const bb = (i) => (i ? `${i.bbox[0].map((v) => fmt(v, 1)).join(',')} → ${i.bbox[1].map((v) => fmt(v, 1)).join(',')}` : '–');
const exactLabel = (s) => (s.exact ? `${fmt(s.exact.ms, 0)} ms<br><small>${s.exact.kernel}</small>` : s.exactError ? `<span class="bad">${s.exactError.unsupported ? 'unsupported' : 'failed'}</span>` : '…');

function renderReport() {
  const box = $('#report');
  if (state.mode === 'asm') {
    const rows = [`<tr><th>component</th><th>part</th><th>exact</th><th>volume</th></tr>`];
    let total = 0;
    for (const c of state.components) { const s = state.slots.get(c.partKey) || {}; const inv = (s.exact || s.preview)?.invariants; if (inv) total += inv.volume; rows.push(`<tr data-comp="${c.id}"><td>${c.id}</td><td>${c.part}</td><td>${exactLabel(s)}${s.exact && !s.exact.invariants.watertight ? ' <span class="bad" title="not watertight">✗</span>' : ''}</td><td>${fmt(inv?.volume)}</td></tr>`); }
    rows.push(`<tr><td>total</td><td></td><td></td><td>${fmt(total)}</td></tr>`);
    box.innerHTML = `<table>${rows.join('')}</table><h2>interference</h2><div id="checks"></div>`;
    renderCheck();
    const errs = [...state.slots.values()].map((s) => s.error || s.previewError || s.exactError).filter(Boolean);
    $('#error').textContent = errs.length ? errs.map((e) => `${e.op}: ${e.msg}`).join(' · ') : '';
    $('#error').className = errs.length ? 'warn' : '';
    renderOcct(); renderFace(); return;
  }
  const s = state.slots.get('main') || {};
  const p = s.preview, x = s.exact;
  const inv = (m) => m?.invariants;
  const cell = (a, b) => `<td>${a}</td><td>${b}</td>`;
  const rows = [];
  rows.push(`<tr><th></th><th>preview<br><small>manifold${p?.approx ? ' (no fillet)' : ''}</small></th><th>exact<br><small>${x ? x.kernel : s.needsOcct ? 'occt' : 'truck'}</small></th></tr>`);
  rows.push(`<tr><td>build</td>${cell(p ? `${fmt(p.ms, 0)} ms` : s.previewError ? `<span class="bad">${s.previewError.unsupported ? 'unsupported' : 'failed'}</span>` : '–', exactLabel(s))}</tr>`);
  rows.push(`<tr><td>volume</td>${cell(fmt(inv(p)?.volume), fmt(inv(x)?.volume))}</tr>`);
  rows.push(`<tr><td>area</td>${cell(fmt(inv(p)?.area, 2), fmt(inv(x)?.area, 2))}</tr>`);
  rows.push(`<tr><td>χ</td>${cell(inv(p)?.euler ?? '–', inv(x)?.euler ?? '–')}</tr>`);
  rows.push(`<tr><td>watertight</td>${cell(wt(inv(p)), wt(inv(x)))}</tr>`);
  rows.push(`<tr><td>triangles</td>${cell(inv(p)?.tris ?? '–', inv(x)?.tris ?? '–')}</tr>`);
  rows.push(`<tr><td>bbox</td>${cell(bb(inv(p)), bb(inv(x)))}</tr>`);
  rows.push(`<tr><td>named faces</td>${cell('–', x ? new Set(x.report.faces.flatMap((f) => f.names)).size : '–')}</tr>`);
  box.innerHTML = `<table>${rows.join('')}</table>`;
  const err = s.error || s.previewError;
  $('#error').textContent = err ? `${err.op}: ${err.msg}` : s.exactError ? `exact (${s.exactError.op}): ${s.exactError.msg}${x?.report?.truckError ? '' : ''}` : x?.report?.truckError ? `truck: ${x.report.truckError.msg} → OCCT` : '';
  $('#error').className = s.error || s.previewError ? 'bad' : s.exactError ? 'warn' : x?.report?.truckError ? 'dim' : '';
  setStatus(x ? `exact ${fmt(x.ms, 0)} ms (${x.kernel}) · preview ${fmt(p?.ms, 0)} ms` : p ? `preview ${fmt(p.ms, 0)} ms · exact…` : '');
  renderOcct(); renderFace();
}

function renderOcct() {
  const b = $('#occt');
  const wants = [...state.slots.values()].some((s) => s.occtWouldHelp || (s.needsOcct && !s.exact));
  b.hidden = !(wants && !occtAllowed() && state.occt !== 'ready');
  b.textContent = state.occt === 'loading' ? 'loading OCCT…' : 'exact with OCCT (66 MB)';
}

/// The component under the cursor (or pinned) lights up in the component
/// list and the report table.
function highlightComponent(id) {
  for (const el of document.querySelectorAll('[data-comp]')) el.classList.toggle('hl', !!id && el.dataset.comp === id);
}

/// The exact face behind a pick, in world coordinates (assembly poses applied).
function faceOf(pick) {
  if (!pick) return null;
  const comp = state.mode === 'asm' ? state.components.find((c) => c.id === pick.name) : null;
  const slotKey = state.mode === 'part' ? 'main' : comp?.partKey;
  const s = state.slots.get(slotKey) || {};
  const f = s.faces?.[pick.fid];
  if (!f) return null;
  return faceWorld(f, comp ? modelOf(comp, state.angles) : null);
}
const geomLine = (f) => { const d = describe(f); return d.kind === 'cylinder' ? `<b>⌀ ${fmt(d.diameter)}</b> cylinder, axis (${d.axis.map((v) => fmt(v, 2)).join(', ')})` : d.kind === 'plane' ? `plane, n (${d.normal.map((v) => fmt(v, 2)).join(', ')})` : 'face'; };
function measureLine(a, b) {
  const m = measure(a, b);
  if (m.kind === 'plane-plane') return m.parallel ? `<b>${fmt(m.distance)}</b> plane to plane` : `planes at ${fmt(m.angle, 1)}° — not parallel; centroids ${fmt(m.centroidDistance)} apart`;
  if (m.kind === 'cylinder-cylinder') return m.parallel ? `<b>${fmt(m.distance)}</b> axis to axis · ⌀ ${fmt(m.diameters[0])} and ⌀ ${fmt(m.diameters[1])} · wall ${fmt(m.wall)}` : `axes not parallel; centroids ${fmt(m.centroidDistance)} apart`;
  if (m.kind === 'plane-cylinder') return m.parallel ? `<b>${fmt(m.distance)}</b> axis to plane · ⌀ ${fmt(m.diameter)}` : `axis not in the plane; centroids ${fmt(m.centroidDistance)} apart`;
  return `centroids <b>${fmt(m.centroidDistance)}</b> apart (no exact geometry on one face)`;
}
function renderFace() {
  const box = $('#face');
  const pick = state.select || state.hover;
  if (state.mode === 'asm') highlightComponent(pick ? pick.name : null);
  if (!pick) { box.innerHTML = '<span class="dim">hover a face · click to pin · click a second face to measure</span>'; return; }
  const comp = state.mode === 'asm' ? `<code class="comp">${pick.name}</code> ` : '';
  const f = faceOf(pick);
  const slotKey = state.mode === 'part' ? 'main' : state.components.find((c) => c.id === pick.name)?.partKey;
  const s = state.slots.get(slotKey) || {};
  if (!f) { box.innerHTML = `${comp}<span class="dim">${s.exact ? 'face ' + pick.fid : 'preview face ' + pick.fid + ' — names and geometry arrive with the exact build'}</span>`; return; }
  let html = `${comp}<div class="names">${f.names.length ? f.names.map((n) => `<code>${n}</code>`).join(' ') : `<code>face[${pick.fid}]</code>`}</div><div>${geomLine(f)} · area ${fmt(f.area)}</div>`;
  if (state.select && state.measureB) {
    const b = faceOf(state.measureB);
    if (b) html += `<div class="measure">↔ <code>${state.measureB.name && state.mode === 'asm' ? state.measureB.name + ' ' : ''}${b.names[0] || 'face[' + state.measureB.fid + ']'}</code>: ${measureLine(f, b)}</div>`;
  } else if (state.select) html += `<div class="dim">click a second face to measure</div>`;
  box.innerHTML = html;
}

function setStatus(s) { $('#status').textContent = s; }

// ── interaction: mouse, touch (one finger orbit, two pan + pinch), keys ───
const pointers = new Map();
let gesture = null;
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {} // synthetic pointers have no capture
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
  gesture = { moved: false, start: [...pointers.values()] };
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) {
    const prev = pointers.get(e.pointerId);
    const cur = { ...prev, x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) gesture.moved = true;
      if (prev.b === 0 && !prev.shift) cam.orbit(dx, dy); else cam.pan(dx, dy, canvas.clientHeight);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const other = a === prev ? b : a;
      const c0 = [(prev.x + other.x) / 2, (prev.y + other.y) / 2], c1 = [(cur.x + other.x) / 2, (cur.y + other.y) / 2];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      cam.pan(c1[0] - c0[0], c1[1] - c0[1], canvas.clientHeight);
      if (d0 > 0 && d1 > 0) cam.dolly(d0 / d1);
      gesture.moved = true;
    }
    pointers.set(e.pointerId, cur);
    invalidate(); return;
  }
  if (e.pointerType === 'mouse') hoverAt(e);
});
const endPointer = (e) => {
  const was = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (was && gesture && !gesture.moved && pointers.size === 0) {
    const r = canvas.getBoundingClientRect(); const pick = renderer.pick(e.clientX - r.left, e.clientY - r.top, cam);
    if (!pick || !state.select || pick.key === state.select.key || state.measureB) { state.select = pick && state.select && pick.key === state.select.key ? null : pick; state.measureB = null; }
    else state.measureB = pick;
    renderer.select = state.select ? state.select.key : -1; renderFace(); invalidate();
  }
  if (pointers.size === 0) gesture = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (state.hover) { state.hover = null; renderer.hover = -1; renderFace(); invalidate(); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dolly(Math.exp(e.deltaY * 0.0015)); invalidate(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function hoverAt(e) {
  const r = canvas.getBoundingClientRect();
  const pick = renderer.pick(e.clientX - r.left, e.clientY - r.top, cam);
  const key = pick ? pick.key : -1;
  if (key !== (state.hover ? state.hover.key : -1)) { state.hover = pick; renderer.hover = key; renderFace(); invalidate(); }
}
window.addEventListener('resize', invalidate);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'f') { cam.fit(renderer.sceneBbox()); invalidate(); }
  else if (k === 'e') { renderer.showEdges = !renderer.showEdges; invalidate(); }
  else if (k === 'g') { renderer.showGrid = !renderer.showGrid; invalidate(); }
  else if (k === 'o') { cam.ortho = !cam.ortho; invalidate(); }
  else if (k === ' ' && state.mode === 'asm') { e.preventDefault(); toggleSpin(); }
  else if ({ 1: 'front', 3: 'right', 7: 'top', 0: 'iso' }[k]) { cam.preset({ 1: 'front', 3: 'right', 7: 'top', 0: 'iso' }[k]); invalidate(); }
});

for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { cam.preset(b.dataset.view); invalidate(); });
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { document.body.dataset.tab = b.dataset.tab; for (const o of document.querySelectorAll('[data-tab]')) o.classList.toggle('on', o === b); });
$('#fit').addEventListener('click', () => { cam.fit(renderer.sceneBbox()); invalidate(); });
$('#ortho').addEventListener('click', () => { cam.ortho = !cam.ortho; invalidate(); });
$('#edges').addEventListener('click', () => { renderer.showEdges = !renderer.showEdges; invalidate(); });
$('#apply').addEventListener('click', async () => { try { const obj = JSON.parse($('#json').value); await setDocument(obj, obj.name || 'custom'); build({ fit: true }); } catch (err) { $('#error').textContent = `JSON: ${err.message}`; $('#error').className = 'bad'; } });
$('#part').addEventListener('change', () => loadBench($('#part').value));
$('#stl').addEventListener('click', () => {
  if (state.mode === 'part') return worker.postMessage({ type: 'export', id: 0, slot: 'main', which: 'exact' });
  const c = state.components.find((x) => x.id === (state.select?.name || state.hover?.name)) || state.components[0];
  if (c) worker.postMessage({ type: 'export', id: 0, slot: c.partKey, which: 'exact', name: `${state.name}-${c.id.replace(/\//g, '_')}` });
  else setStatus('pin a component to export its part');
});
$('#views').addEventListener('click', () => snapshots());
$('#share').addEventListener('click', async () => { const url = location.href; try { await navigator.clipboard.writeText(url); setStatus('link copied'); } catch { setStatus(url); } });
$('#occt').addEventListener('click', () => { localStorage.setItem('cad.occt', '1'); worker.postMessage({ type: 'load-occt' }); build(); });
$('#file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); await setDocument(obj, f.name.replace(/\.json$/, '')); build({ fit: true }); } catch (err) { $('#error').textContent = `JSON: ${err.message}`; } });

// ── interference ─────────────────────────────────────────────────────────
function runCheck() {
  if (state.mode !== 'asm') return;
  const bodies = state.components.map((c) => ({ id: c.id, slot: c.partKey, model: modelOf(c, state.angles) }));
  state.check = { pending: true };
  worker.postMessage({ type: 'check', id: ++state.checkId, bodies });
  const o = $('#checkout'); if (o) o.textContent = 'checking…';
}
const fixedPair = (a, b) => state.mates.some((m) => m.kind === 'fixed' && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
function checkSummary() {
  const c = state.check; if (!c || c.pending) return 'checking…';
  const real = c.pairs.filter((p) => !fixedPair(p.a, p.b));
  return real.length ? `${real.length} interfering pair${real.length === 1 ? '' : 's'} (${c.tested} tested, ${c.ms.toFixed(0)} ms)` : `no interference (${c.tested} pairs tested, ${c.ms.toFixed(0)} ms)`;
}
function renderCheck() {
  const o = $('#checkout'); if (o) o.textContent = checkSummary();
  const box = $('#checks'); if (!box) return;
  const c = state.check; if (!c || c.pending) { box.innerHTML = ''; return; }
  box.innerHTML = c.pairs.map((p) => `<div class="feat ${fixedPair(p.a, p.b) ? 'dim' : 'bad'}" data-pair="${p.a}|${p.b}"><b>${fixedPair(p.a, p.b) ? '~' : '✗'}</b> <span>${p.a} × ${p.b} · ${p.volume.toFixed(4)} mm³${fixedPair(p.a, p.b) ? ' (fixed-mated)' : ''}</span></div>`).join('') || '<div class="dim">no interference at this pose</div>';
  for (const el of box.querySelectorAll('[data-pair]')) el.addEventListener('pointerenter', () => { const [a, b] = el.dataset.pair.split('|'); for (const r of document.querySelectorAll('[data-comp]')) r.classList.toggle('hl', r.dataset.comp === a || r.dataset.comp === b); });
}

// ── spin ──────────────────────────────────────────────────────────────────
function toggleSpin() {
  if (state.mode !== 'asm' || !state.drive) return;
  state.spin = !state.spin; state.t0 = performance.now(); state.frames = 0; state.fpsT = performance.now();
  const b = $('#spin'); if (b) b.textContent = state.spin ? 'stop' : 'spin';
  invalidate();
}
function tick(now) {
  if (state.spin && state.drive) {
    const dt = (now - state.t0) / 1000; state.t0 = now; state.tAcc += dt * state.speed;
    solveAngles(state.tAcc);
    updateModels(); needsRender = true;
    state.frames++;
    if (now - state.fpsT >= 500) { state.fps = (state.frames * 1000) / (now - state.fpsT); state.frames = 0; state.fpsT = now; const f = $('#fps'); if (f) f.textContent = `${state.fps.toFixed(0)} fps`; }
  }
  if (needsRender) { needsRender = false; renderer.render(cam); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

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
  const obj = await fetchBench(name); $('#part').value = name; await setDocument(obj, name); build({ fit: true });
}

// ── boot ──────────────────────────────────────────────────────────────────
const sel = $('#part'); for (const b of BENCH) { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.append(o); }
const boot = ready.then(async () => {
  if (location.hash.startsWith('#t=')) { const obj = JSON.parse(unb64(location.hash.slice(3))); await setDocument(obj, obj.name || 'custom'); build({ fit: true }); }
  else await loadBench(BENCH.includes(q.get('part')) ? q.get('part') : 'gear');
});

window.__cad = {
  ready: boot, state, cam, renderer, load: loadBench, toggleSpin, solveAngles, updateModels, runCheck,
  loadDocument: async (obj, name) => { await setDocument(obj, name); build({ fit: true }); },
  faceOf, measure: (a, b) => measure(faceOf(a), faceOf(b)), describe: (p) => describe(faceOf(p)),
  checked: () => new Promise((resolve) => { const t = setInterval(() => { if (state.check && !state.check.pending) { clearInterval(t); resolve(state.check); } }, 50); }),
  hide: (id, on = true) => { const c = state.components.find((c) => c.id === id); if (c) { c.hidden = on; renderer.setHidden(id, on); renderParams(); invalidate(); } },
  // resolves when every slot of the current document has answered (preview and exact, or errored)
  settled: () => new Promise((resolve) => { const t = setInterval(() => {
    const slots = [...state.slots.values()];
    if (!slots.length) return;
    const done = slots.every((s) => (s.preview && s.preview.id === s.buildId) || s.previewError || s.error);
    const exactDone = slots.every((s) => (s.exact && s.exact.id === s.buildId) || s.exactError || s.error);
    if (done && exactDone) { clearInterval(t); const s = state.slots.get('main') || slots[0]; resolve({ mode: state.mode, preview: s.preview?.invariants, exact: s.exact?.invariants, exactKernel: s.exact?.kernel, error: s.error, exactError: s.exactError, previewError: s.previewError, faces: s.faces?.length || 0, slots: slots.length, components: state.components.length }); }
  }, 50); }),
  render: () => renderer.render(cam),
};
