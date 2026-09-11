// app.js — cad.mino.mobi. The viewer and the judgement surface, for one part
// or for an assembly of them. Every edit rebuilds through the worker; the
// preview lands first, the exact build with named faces behind it. An
// assembly is components (with transforms, sub-assemblies flattened) and
// mates (gear, fixed) solved as a kinematic chain from one driven component;
// `spin` drives it and reports the frame rate. `window.__cad` is the hook.
import { Camera, mul4 } from './camera.js';
import { Renderer } from './gl.js';

const $ = (s) => document.querySelector(s);
const BENCH = ['clock', 'train', 'gear', 'arbor', 'plate', 'escape', 'case', 'case-fillet', 'pinion', 'pallet', 'balance', 'hand', 'dial'];
const q = new URLSearchParams(location.search);
const OCCT_BASE = q.get('occt') || null;
const occtAllowed = () => !!OCCT_BASE || localStorage.getItem('cad.occt') === '1';

const state = {
  mode: 'part', name: 'gear', tree: null, treeText: '',
  buildId: 0, fitNext: false,
  // per slot: {preview, exact, error, exactError, previewError, faces, needsOcct}
  slots: new Map(),
  // assembly
  asm: null, components: [], mates: [], drive: null, angles: new Map(), spin: false, t0: 0, tAcc: 0, fps: 0, speed: 1,
  hover: null, select: null, occt: 'idle',
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
  if (m.type === 'export') { download(new Blob([m.bytes], { type: 'model/stl' }), `${state.name}.stl`); return; }
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
  state.hover = null; state.select = null; renderer.hover = -1; renderer.select = -1;
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

/// Flatten an assembly (sub-assemblies included) into components with world
/// placements, distinct part trees (params overrides make distinct parts),
/// and mates with prefixed ids.
async function prepareAssembly(asm) {
  const components = [], mates = [], partTrees = new Map();
  async function walk(a, prefix, parent) {
    const parts = a.parts || {};
    for (const c of a.components || []) {
      const id = prefix + c.id;
      const place = mul4(parent, placement(c));
      if (c.assembly !== undefined) { const sub = await resolveRef(c.assembly); await walk(sub, id + '/', place); continue; }
      const tree = await resolveRef(parts[c.part] ?? `bench:${c.part}`);
      if (c.params) tree.params = { ...(tree.params || {}), ...c.params };
      const partKey = `${c.part}${c.params ? '|' + JSON.stringify(c.params) : ''}`;
      if (!partTrees.has(partKey)) partTrees.set(partKey, JSON.stringify(tree));
      components.push({ id, part: c.part, partKey, place, phase: c.phase || 0, phaseGiven: c.phase !== undefined, tint: 1 });
    }
    for (const m of a.mates || []) mates.push({ ...m, a: prefix + m.a, b: prefix + m.b });
  }
  await walk(asm, '', IDENT);
  state.components = components; state.mates = mates; state.partTrees = partTrees;
  const d = asm.drive;
  state.drive = !d ? null : d.escapement ? { kind: 'escapement', wheel: d.escapement.wheel, pallet: d.escapement.pallet, balance: d.escapement.balance, teeth: d.escapement.teeth ?? 15, beat: d.escapement.beat ?? 1, lift: d.escapement.lift ?? 8, swing: d.escapement.swing ?? 220 } : { kind: 'rpm', component: d.component, rpm: d.rpm ?? 6 };
  state.spin = false; state.tAcc = 0;
  autoPhase();
  solveAngles(0);
}

/// Gear phases: unless the document gives one, a gear's tooth 0 (its local
/// +x) is turned to point at its mate, and the mate turns half a pitch so a
/// gap faces back. Each gear component has one mesh (its pinion is the
/// arbor, its own mate is one wheel), so this always lines up.
function autoPhase() {
  const byId = new Map(state.components.map((c) => [c.id, c]));
  const set = new Set(state.components.filter((c) => c.phaseGiven).map((c) => c.id));
  const deg = (v) => (v * 180) / Math.PI;
  for (const m of state.mates) {
    if (m.kind !== 'gear') continue;
    const a = byId.get(m.a), b = byId.get(m.b); if (!a || !b) continue;
    const dx = b.place[12] - a.place[12], dy = b.place[13] - a.place[13];
    const ab = deg(Math.atan2(dy, dx)), ba = ab + 180;
    const local = (c, ang) => ang - deg(Math.atan2(c.place[1], c.place[0])); // undo the component's own rotate about z
    if (!set.has(a.id)) { a.phase = mod(local(a, ab), 360 / m.za); set.add(a.id); }
    if (!set.has(b.id)) { b.phase = mod(local(b, ba) + 180 / m.zb, 360 / m.zb); set.add(b.id); }
  }
}
const mod = (x, n) => ((x % n) + n) % n;

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const T = (v) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1];
function R(axis, deg) {
  const l = Math.hypot(...axis) || 1; const [x, y, z] = axis.map((v) => v / l); const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
}
const placement = (c) => mul4(T(c.at || [0, 0, 0]), c.rotate ? R(c.rotate.axis || [0, 0, 1], c.rotate.deg || 0) : IDENT);

/// Kinematics, as a function of time in seconds: the driven component's
/// angle, propagated through gear and fixed mates (an undirected chain).
/// Unreached components stay at 0. An escapement drive steps its wheel half
/// a tooth per beat (a quick slide over the first 15 % of the beat), rocks
/// the pallet fork ±lift with the same slide, and swings the balance over a
/// two-beat period — the train then ticks through the mates.
function solveAngles(t) {
  const angles = new Map(state.components.map((c) => [c.id, 0]));
  const d = state.drive;
  if (!d) { state.angles = angles; return; }
  let root, theta;
  if (d.kind === 'escapement') {
    const beats = t / d.beat, n = Math.floor(beats), frac = beats - n;
    const e = Math.min(1, frac / 0.15); const ease = e * e * (3 - 2 * e);
    const step = 360 / d.teeth / 2;
    root = d.wheel; theta = step * (n + ease);
    const sign = n % 2 === 0 ? 1 : -1;
    angles.set(d.pallet, d.lift * (-sign + 2 * sign * ease));
    angles.set(d.balance, (d.swing / 2) * Math.cos(Math.PI * beats));
  } else { root = d.component; theta = (d.rpm * 360 * t) / 60; }
  angles.set(root, theta);
  const seen = new Set([root]); const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    for (const m of state.mates) {
      const other = m.a === cur ? m.b : m.b === cur ? m.a : null;
      if (!other || seen.has(other)) continue;
      const θ = angles.get(cur);
      let v;
      if (m.kind === 'gear') { const [zc, zo] = m.a === cur ? [m.za, m.zb] : [m.zb, m.za]; v = -θ * (zc / zo); }
      else if (m.kind === 'fixed') v = θ;
      else continue;
      angles.set(other, v); seen.add(other); queue.push(other);
    }
  }
  state.angles = angles;
}

function updateModels() {
  for (const c of state.components) {
    const θ = (state.angles.get(c.id) || 0) + c.phase;
    renderer.setModel(c.id, mul4(c.place, R([0, 0, 1], θ)), c.tint);
  }
}

// ── UI: params / tree ─────────────────────────────────────────────────────
function renderParams() {
  const box = $('#params'); box.innerHTML = '';
  if (state.mode === 'asm') {
    const d = state.drive;
    const ctl = d?.kind === 'escapement' ? `<label>beat <input id="beat" type="number" step="any" min="0.01" value="${d.beat}"> s</label>` : `<label>rpm <input id="rpm" type="number" step="any" value="${d ? d.rpm : 0}" ${d ? '' : 'disabled'}></label>`;
    box.innerHTML = `<div class="asm-ctl"><button id="spin">${state.spin ? 'stop' : 'spin'}</button> ${ctl} <label>×<input id="speed" type="number" step="any" min="0" value="${state.speed}" title="time scale"></label> <span id="fps" class="dim"></span></div>`;
    $('#spin').addEventListener('click', toggleSpin);
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
    box.innerHTML = `<table>${rows.join('')}</table>`;
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

function renderFace() {
  const box = $('#face');
  const pick = state.select || state.hover;
  if (state.mode === 'asm') highlightComponent(pick ? pick.name : null);
  if (!pick) { box.innerHTML = '<span class="dim">hover a face</span>'; return; }
  const slotKey = state.mode === 'part' ? 'main' : state.components.find((c) => c.id === pick.name)?.partKey;
  const s = state.slots.get(slotKey) || {};
  const f = s.faces?.[pick.fid];
  const comp = state.mode === 'asm' ? `<code class="comp">${pick.name}</code> ` : '';
  if (!f) { box.innerHTML = `${comp}<span class="dim">${s.exact ? 'face ' + pick.fid : 'preview face ' + pick.fid + ' — names arrive with the exact build'}</span>`; return; }
  box.innerHTML = `${comp}<div class="names">${f.names.length ? f.names.map((n) => `<code>${n}</code>`).join(' ') : `<code>face[${pick.fid}]</code>`}</div><div>area ${fmt(f.area)} · n (${f.normal.map((v) => fmt(v, 2)).join(', ')}) · c (${f.centroid.map((v) => fmt(v, 2)).join(', ')})</div>`;
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
    state.select = pick && state.select && pick.key === state.select.key ? null : pick;
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
$('#stl').addEventListener('click', () => { const slot = state.mode === 'part' ? 'main' : state.components[0]?.partKey; worker.postMessage({ type: 'export', id: 0, slot, which: 'exact' }); });
$('#views').addEventListener('click', () => snapshots());
$('#share').addEventListener('click', async () => { const url = location.href; try { await navigator.clipboard.writeText(url); setStatus('link copied'); } catch { setStatus(url); } });
$('#occt').addEventListener('click', () => { localStorage.setItem('cad.occt', '1'); worker.postMessage({ type: 'load-occt' }); build(); });
$('#file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); await setDocument(obj, f.name.replace(/\.json$/, '')); build({ fit: true }); } catch (err) { $('#error').textContent = `JSON: ${err.message}`; } });

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
  ready: boot, state, cam, renderer, load: loadBench, toggleSpin, solveAngles,
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
