// editor.js — the deck layout editor. Authors a Deck (place HBots + linear axes,
// mount them into a kinematic tree, add collision + sequence dependencies) and
// serializes it to YAML. Persists to localStorage and hands the deck to the
// motion suite. The 3D preview is a DeckView; this file is all UI/state glue.

import { Deck, defaultDeck } from '../lib/deck.js';
import { DEVICE_TYPES, interactionPoints } from '../lib/devices.js';
import { STEPPER_PRESETS } from '../lib/motor.js';
import { toYAML, fromYAML, objectToDeck, deckToObject } from '../lib/deckio.js';
import { buildManifest, checkSequence } from '../lib/manifest.js';
import { DeckView } from '../lib/deckscene.js';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'tjs.deck.current';
const TYPE_DOT = { linear: '#7ee787', hbot: '#39d6c8', wellplate: '#8ac6ff', tiprack: '#c08cff', tuberack: '#7ee787', waste: '#ffb454' };
const LABWARE = ['wellplate', 'tiprack', 'tuberack', 'waste'];

let deck = loadDeck();
let selectedId = deck.devices[0]?.id || null;
const preview = {}; // deviceId -> joint override

const view = new DeckView($('deckview'), { editor: true });
view.renderer.domElement.addEventListener('click', (e) => {
  const id = view.pickDeviceAt(e.clientX, e.clientY);
  if (id) { selectedId = id; refreshAll(); }
});

// ---- persistence -----------------------------------------------------------
function loadDeck() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return objectToDeck(JSON.parse(raw));
  } catch (e) { /* fall through to sample */ }
  return defaultDeck();
}
function autosave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(deckToObject(deck))); } catch (e) {}
}

// ---- view refresh ----------------------------------------------------------
function previewMap() {
  const m = {};
  for (const d of deck.devices) m[d.id] = preview[d.id] || d.previewState || {};
  return m;
}
function refreshView() {
  view.setDeck(deck);
  view.select(selectedId);
  view.setState(previewMap());
}
function refreshAll() {
  refreshView();
  renderDeviceList();
  renderInspector();
  renderRelations();
  renderSequence();
  renderStatus();
  autosave();
}
// Light path: model already mutated; update 3D + status without rebuilding the
// inspector DOM (keeps input focus while typing numbers).
function liveUpdate() { refreshView(); renderStatus(); renderDeviceList(); autosave(); }

// ---- device list -----------------------------------------------------------
function renderDeviceList() {
  const ul = $('deviceList');
  ul.innerHTML = '';
  for (const d of deck.devices) {
    const li = document.createElement('li');
    if (d.id === selectedId) li.classList.add('sel');
    const depth = mountDepth(d);
    li.innerHTML = `<span class="dot" style="background:${TYPE_DOT[d.type] || '#888'}"></span>` +
      `<span class="nm" style="padding-left:${depth * 12}px">${esc(d.id)}</span>` +
      `<span class="tt">${d.type}${d.mount.parent ? ' ▸ ' + esc(d.mount.parent) : ''}</span>`;
    li.addEventListener('click', () => { selectedId = d.id; refreshAll(); });
    ul.appendChild(li);
  }
}
function mountDepth(d) { let n = 0, cur = d; while (cur.mount.parent) { cur = deck.getDevice(cur.mount.parent); if (!cur) break; n++; } return n; }

// ---- inspector -------------------------------------------------------------
function renderInspector() {
  const host = $('inspector');
  const d = deck.getDevice(selectedId);
  if (!d) { host.innerHTML = '<div class="muted">Select a device to edit it.</div>'; return; }
  const motorOpts = Object.keys(STEPPER_PRESETS).map((k) => `<option value="${k}">${STEPPER_PRESETS[k].label}</option>`).join('');
  const p = d.params;

  let params = '';
  if (d.type === 'linear') {
    params = `
      ${sel('insp_axis', 'axis', ['x', 'y', 'z'], p.axis)}
      ${sel('insp_drive', 'drive', ['belt', 'screw'], p.drive)}
      ${num('insp_travel', 'travel', p.travel, 5, 2000)}
      ${selRaw('insp_motor', 'motor', motorOpts, p.motor)}
      ${p.drive === 'screw' ? num('insp_lead', 'lead mm/rev', p.lead, 1, 40) : num('insp_pt', 'pulley teeth', p.pulleyTeeth, 8, 60)}
      ${num('insp_cmass', 'carriage kg', p.carriageMass, 0.01, 50, 0.01)}
      ${sel('insp_tool', 'tool', ['none', 'gripper', 'pipettor'], d.tool || 'none')}
      ${limitFields(p.limits)}`;
  } else if (d.type === 'hbot') {
    params = `
      ${num('insp_bedx', 'bed X', p.bedX, 50, 2000)}
      ${num('insp_bedy', 'bed Y', p.bedY, 50, 2000)}
      ${num('insp_height', 'frame H', p.height, 20, 600)}
      ${selRaw('insp_motor', 'motor', motorOpts, p.motor)}
      ${num('insp_beam', 'beam kg', p.beamMass, 0.05, 50, 0.05)}
      ${num('insp_cmass', 'carriage kg', p.carriageMass, 0.01, 50, 0.01)}
      ${limitFields(p.limits)}`;
  } else if (d.type === 'waste') {
    params = `${num('insp_w', 'width', p.width, 20, 400)}${num('insp_d', 'depth', p.depth, 20, 400)}${num('insp_h', 'height', p.height, 10, 300)}`;
  } else {
    // gridded labware (well plate / tip rack / tube rack)
    params = `${num('insp_rows', 'rows', p.rows, 1, 32)}${num('insp_cols', 'cols', p.cols, 1, 48)}${num('insp_pitch', 'pitch mm', p.pitch, 2, 50)}${num('insp_lh', 'height', p.height, 2, 200)}
      <div class="muted" style="margin-top:4px">${interactionCount(d)} interaction sites</div>`;
  }

  const others = deck.devices.filter((x) => x.id !== d.id && !isDescendant(x.id, d.id));
  const parentOpts = `<option value="">— deck origin —</option>` +
    others.map((x) => `<option value="${x.id}" ${d.mount.parent === x.id ? 'selected' : ''}>${esc(x.id)}</option>`).join('');

  host.innerHTML = `
    <label class="fld">id <input id="insp_id" type="text" value="${esc(d.id)}"></label>
    <div class="muted" style="margin:2px 0 8px">${DEVICE_TYPES[d.type].label}</div>
    ${params}
    <h2 style="margin-top:12px">Mount</h2>
    <label class="fld">parent <select id="insp_parent">${parentOpts}</select></label>
    <label class="fld">attach <select id="insp_attach">
      <option value="frame" ${d.mount.attach === 'frame' ? 'selected' : ''}>frame (static)</option>
      <option value="carriage" ${d.mount.attach === 'carriage' ? 'selected' : ''}>carriage (rides parent)</option>
    </select></label>
    <div class="row3">offset mm
      <input id="insp_px" type="number" value="${d.mount.position[0]}" step="1">
      <input id="insp_py" type="number" value="${d.mount.position[1]}" step="1">
      <input id="insp_pz" type="number" value="${d.mount.position[2]}" step="1"></div>
    <div class="row3">rot °
      <input id="insp_rx" type="number" value="${d.mount.rotation[0]}" step="5">
      <input id="insp_ry" type="number" value="${d.mount.rotation[1]}" step="5">
      <input id="insp_rz" type="number" value="${d.mount.rotation[2]}" step="5"></div>
    <h2 style="margin-top:12px">Preview pose</h2>
    ${poseSliders(d)}`;

  bindInspector(d);
}

function poseSliders(d) {
  if (!DEVICE_TYPES[d.type].dof) return '<div class="muted">static deck component — no axes to pose</div>';
  const st = preview[d.id] || d.previewState || {};
  if (d.type === 'linear') {
    const v = st.p ?? 0;
    return `<label class="fld">${d.params.axis.toUpperCase()} pos <input id="pose_p" type="range" min="0" max="${d.params.travel}" step="1" value="${v}"></label>`;
  }
  const x = st.x ?? d.params.bedX / 2, y = st.y ?? d.params.bedY / 2;
  return `<label class="fld">X <input id="pose_x" type="range" min="0" max="${d.params.bedX}" step="1" value="${x}"></label>
          <label class="fld">Y <input id="pose_y" type="range" min="0" max="${d.params.bedY}" step="1" value="${y}"></label>`;
}

function bindInspector(d) {
  // id rename
  on('insp_id', 'change', (e) => {
    const nid = e.target.value.trim().replace(/\s+/g, '_');
    if (!nid || deck.devices.some((x) => x.id === nid)) { e.target.value = d.id; return; }
    const old = d.id;
    for (const x of deck.devices) if (x.mount.parent === old) x.mount.parent = nid;
    for (const r of deck.relations) r.between = (r.between || []).map((b) => b === old ? nid : b);
    for (const s of deck.sequences) for (const step of s.steps) if (step.device === old) step.device = nid;
    if (preview[old]) { preview[nid] = preview[old]; delete preview[old]; }
    d.id = nid; selectedId = nid; refreshAll();
  });

  // params — number/select. structural ones re-render inspector.
  const P = d.params;
  bindNum('insp_travel', (v) => { P.travel = v; }, true);
  bindNum('insp_lead', (v) => { P.lead = v; });
  bindNum('insp_pt', (v) => { P.pulleyTeeth = v; });
  bindNum('insp_cmass', (v) => { P.carriageMass = v; });
  bindNum('insp_bedx', (v) => { P.bedX = v; }, true);
  bindNum('insp_bedy', (v) => { P.bedY = v; }, true);
  bindNum('insp_height', (v) => { P.height = v; }, true);
  bindNum('insp_beam', (v) => { P.beamMass = v; });
  bindNum('insp_lvmax', (v) => { P.limits.vmax = v; });
  bindNum('insp_lamax', (v) => { P.limits.amax = v; });
  bindNum('insp_ljmax', (v) => { P.limits.jmax = v; });
  // labware params (all structural — they reshape geometry)
  bindNum('insp_w', (v) => { P.width = v; }, true);
  bindNum('insp_d', (v) => { P.depth = v; }, true);
  bindNum('insp_h', (v) => { P.height = v; }, true);
  bindNum('insp_rows', (v) => { P.rows = v; }, true);
  bindNum('insp_cols', (v) => { P.cols = v; }, true);
  bindNum('insp_pitch', (v) => { P.pitch = v; }, true);
  bindNum('insp_lh', (v) => { P.height = v; }, true);
  on('insp_axis', 'change', (e) => { P.axis = e.target.value; refreshAll(); });
  on('insp_drive', 'change', (e) => { P.drive = e.target.value; refreshAll(); });
  on('insp_motor', 'change', (e) => { P.motor = e.target.value; liveUpdate(); });
  on('insp_tool', 'change', (e) => { d.tool = e.target.value; refreshAll(); });

  // mount
  on('insp_parent', 'change', (e) => { d.mount.parent = e.target.value || null; if (!d.mount.parent) d.mount.attach = 'frame'; refreshAll(); });
  on('insp_attach', 'change', (e) => { d.mount.attach = e.target.value; liveUpdate(); });
  for (const [id, i] of [['insp_px', 0], ['insp_py', 1], ['insp_pz', 2]]) bindNum(id, (v) => { d.mount.position[i] = v; });
  for (const [id, i] of [['insp_rx', 0], ['insp_ry', 1], ['insp_rz', 2]]) bindNum(id, (v) => { d.mount.rotation[i] = v; });

  // pose
  on('pose_p', 'input', (e) => { preview[d.id] = { p: +e.target.value }; view.setState(previewMap()); renderStatus(); });
  on('pose_x', 'input', (e) => { preview[d.id] = { ...(preview[d.id] || {}), x: +e.target.value }; view.setState(previewMap()); renderStatus(); });
  on('pose_y', 'input', (e) => { preview[d.id] = { ...(preview[d.id] || {}), y: +e.target.value }; view.setState(previewMap()); renderStatus(); });
}

function bindNum(id, set, structural = false) {
  const elm = $(id); if (!elm) return;
  elm.addEventListener('input', () => {
    const v = parseFloat(elm.value); if (Number.isNaN(v)) return;
    set(v);
    if (structural) liveUpdate(); else liveUpdate();
  });
}

// ---- relations -------------------------------------------------------------
function renderRelations() {
  const host = $('relList');
  const cols = deck.collisions(previewMap());
  host.innerHTML = '';
  deck.relations.forEach((r, idx) => {
    if (r.type !== 'collision') return;
    const c = cols.find((x) => x.between[0] === r.between[0] && x.between[1] === r.between[1]);
    const dist = c ? c.dist.toFixed(0) : '—';
    const bad = c && c.violated;
    const row = document.createElement('div');
    row.className = 'relrow';
    row.innerHTML = `<div><span class="pill">${esc(r.between[0])}</span> ↔ <span class="pill">${esc(r.between[1])}</span>
        <div class="meta">min ${r.minDist} mm · now <span class="pill ${bad ? 'bad' : ''}">${dist} mm</span></div></div>
      <button class="sm danger" data-rel="${idx}">✕</button>`;
    host.appendChild(row);
  });
  host.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    deck.relations.splice(+b.dataset.rel, 1); refreshAll();
  }));
}

function addRelation() {
  if (deck.devices.length < 2) return;
  const a = selectedId || deck.devices[0].id;
  const b = (deck.devices.find((x) => x.id !== a) || {}).id;
  deck.relations.push({ type: 'collision', between: [a, b], minDist: 25, note: '' });
  refreshAll();
}

// ---- sequence --------------------------------------------------------------
function seq() { if (!deck.sequences[0]) deck.sequences.push({ id: 'sequence', steps: [] }); return deck.sequences[0]; }
function renderSequence() {
  const s0 = deck.sequences[0];
  let summary = s0 ? `“${s0.id}” · ${s0.steps.length} steps` : 'no sequence';
  if (s0 && s0.steps.length) {
    const r = checkSequence(deck, s0.steps);
    summary += r.ok ? ` · ✓ ${r.cycleTime}s cycle` : ` · ⚠ ${r.diagnostics.filter((d) => d.severity === 'error').length} issue(s)`;
  }
  $('seqName').textContent = summary;
  const host = $('seqList'); host.innerHTML = '';
  const s = deck.sequences[0]; if (!s) return;
  s.steps.forEach((step, i) => {
    const row = document.createElement('div'); row.className = 'steprow';
    const label = step.move ? `move → ${jointStr(step.move)}` : step.tool ? `tool ${step.tool.open ? 'open' : 'close'}` : step.dwell != null ? `dwell ${step.dwell}s` : '?';
    row.innerHTML = `<div><span class="pill">${esc(step.device || '—')}</span> <span class="meta">${label}</span></div>
      <div class="btns"><button class="sm" data-up="${i}">↑</button><button class="sm" data-down="${i}">↓</button><button class="sm danger" data-del="${i}">✕</button></div>`;
    host.appendChild(row);
  });
  // add-row
  const add = document.createElement('div'); add.className = 'steprow';
  const devOpts = deck.devices.map((x) => `<option value="${x.id}">${esc(x.id)}</option>`).join('');
  add.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <select id="seqDev">${devOpts}</select>
      <select id="seqAct"><option value="move">move to pose</option><option value="open">tool open</option><option value="close">tool close</option><option value="dwell">dwell 0.3s</option></select>
    </div><button class="sm" id="seqAdd">+ add</button>`;
  host.appendChild(add);
  if (selectedId) $('seqDev').value = selectedId;
  host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { s.steps.splice(+b.dataset.del, 1); refreshAll(); }));
  host.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.up; if (i > 0) { [s.steps[i - 1], s.steps[i]] = [s.steps[i], s.steps[i - 1]]; refreshAll(); } }));
  host.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.down; if (i < s.steps.length - 1) { [s.steps[i + 1], s.steps[i]] = [s.steps[i], s.steps[i + 1]]; refreshAll(); } }));
  $('seqAdd').addEventListener('click', () => addStep($('seqDev').value, $('seqAct').value));
}
function addStep(devId, act) {
  const d = deck.getDevice(devId); if (!d) return;
  const s = seq();
  if (act === 'move') {
    const st = preview[devId] || d.previewState || {};
    const move = d.type === 'linear' ? { p: Math.round(st.p ?? 0) } : { x: Math.round(st.x ?? d.params.bedX / 2), y: Math.round(st.y ?? d.params.bedY / 2) };
    s.steps.push({ device: devId, move });
  } else if (act === 'open' || act === 'close') {
    s.steps.push({ device: devId, tool: { open: act === 'open' } });
  } else if (act === 'dwell') {
    s.steps.push({ device: devId, dwell: 0.3 });
  }
  refreshAll();
}

// ---- status ----------------------------------------------------------------
function renderStatus() {
  const v = deck.validate();
  const cols = deck.collisions(previewMap()).filter((c) => c.violated);
  const host = $('status');
  if (!v.ok) { host.className = 'status err'; host.textContent = '⚠ ' + v.errors.join(' · '); return; }
  if (cols.length) { host.className = 'status err'; host.textContent = `⚠ collision: ${cols.map((c) => c.between.join('↔')).join(', ')}`; return; }
  host.className = 'status ok'; host.textContent = `✓ ${deck.devices.length} devices · valid tree`;
}

// ---- IO --------------------------------------------------------------------
async function doExport() {
  const text = await toYAML(deck);
  $('ioText').value = text;
  download(`${slug(deck.name)}.deck.yaml`, text);
}
function doManifest() {
  const text = JSON.stringify(buildManifest(deck), null, 2);
  $('ioText').value = text;
  navigator.clipboard?.writeText(text).then(() => flash('manifest copied — hand it to your local Claude ✓', true), () => {});
}
async function applyText() {
  try {
    const d = await fromYAML($('ioText').value);
    deck = d; selectedId = deck.devices[0]?.id || null;
    for (const k of Object.keys(preview)) delete preview[k];
    refreshAll();
    flash('imported ✓', true);
  } catch (e) { flash('import failed: ' + e.message, false); }
}
function importFile(file) {
  const r = new FileReader();
  r.onload = () => { $('ioText').value = r.result; applyText(); };
  r.readAsText(file);
}
function flash(msg, ok) { const h = $('status'); h.className = 'status ' + (ok ? 'ok' : 'err'); h.textContent = msg; }

// ---- toolbar ---------------------------------------------------------------
function addDevice(type) {
  const parent = (selectedId && deck.getDevice(selectedId)) ? selectedId : null;
  const attach = parent ? 'carriage' : 'frame';
  const dev = deck.addDevice(type, { mount: { parent, attach, position: type === 'linear' ? [0, 0, 0] : [0, 20, 0] } });
  selectedId = dev.id; refreshAll();
}
function addLabware(type) {
  // labware sits on the deck floor, not on a carriage
  const n = deck.devices.filter((d) => LABWARE.includes(d.type)).length;
  const dev = deck.addDevice(type, { mount: { parent: null, attach: 'frame', position: [120 + n * 30, 0, -120] } });
  selectedId = dev.id; refreshAll();
}
function interactionCount(d) { return interactionPoints(d).length; }
function duplicate() {
  const d = deck.getDevice(selectedId); if (!d) return;
  const copy = deck.addDevice(d.type, { params: JSON.parse(JSON.stringify(d.params)), tool: d.tool, mount: { ...d.mount, position: d.mount.position.map((v) => v + 10) } });
  selectedId = copy.id; refreshAll();
}
function remove() { if (selectedId) { deck.removeDevice(selectedId); selectedId = deck.devices[0]?.id || null; refreshAll(); } }

function wireToolbar() {
  $('deckName').addEventListener('input', (e) => { deck.name = e.target.value; autosave(); });
  $('btnAddLinear').addEventListener('click', () => addDevice('linear'));
  $('btnAddHbot').addEventListener('click', () => addDevice('hbot'));
  $('btnAddWellplate').addEventListener('click', () => addLabware('wellplate'));
  $('btnAddTiprack').addEventListener('click', () => addLabware('tiprack'));
  $('btnAddTuberack').addEventListener('click', () => addLabware('tuberack'));
  $('btnAddWaste').addEventListener('click', () => addLabware('waste'));
  $('btnDup').addEventListener('click', duplicate);
  $('btnDelete').addEventListener('click', remove);
  $('btnAddRel').addEventListener('click', addRelation);
  $('btnAddStep').addEventListener('click', () => { if (selectedId) addStep(selectedId, 'move'); });
  $('btnReach').addEventListener('click', () => { view.setReachVisible(!view.showReach); $('btnReach').classList.toggle('on', view.showReach); });
  $('btnExport').addEventListener('click', doExport);
  $('btnManifest').addEventListener('click', doManifest);
  $('btnCopy').addEventListener('click', async () => { if (!$('ioText').value) await doExport(); try { await navigator.clipboard.writeText($('ioText').value); flash('copied ✓', true); } catch { flash('select & copy from the box', false); } });
  $('btnImportFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); });
  $('btnApplyText').addEventListener('click', applyText);
  $('btnLoadDefault').addEventListener('click', () => { deck = defaultDeck(); selectedId = deck.devices[0]?.id || null; refreshAll(); });
  $('btnNew').addEventListener('click', () => { deck = new Deck({ name: 'New deck' }); selectedId = null; refreshAll(); });
}

// ---- helpers (markup) ------------------------------------------------------
function num(id, label, val, min, max, step = 1) { return `<label class="fld">${label} <input id="${id}" type="number" value="${val}" min="${min}" max="${max}" step="${step}"></label>`; }
function sel(id, label, opts, val) { return `<label class="fld">${label} <select id="${id}">${opts.map((o) => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`; }
function selRaw(id, label, optsHtml, val) { return `<label class="fld">${label} <select id="${id}">${optsHtml.replace(`value="${val}"`, `value="${val}" selected`)}</select></label>`; }
function limitFields(L) { return `<div class="muted" style="margin:6px 0 2px">limits</div>
  ${num('insp_lvmax', 'v max', L.vmax, 1, 2000)}${num('insp_lamax', 'a max', L.amax, 10, 80000, 10)}${num('insp_ljmax', 'jerk', L.jmax, 100, 2000000, 100)}`; }
function jointStr(m) { return Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' '); }
function on(id, ev, fn) { const e = $(id); if (e) e.addEventListener(ev, fn); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function isDescendant(id, ofId) { let cur = deck.getDevice(id); while (cur && cur.mount.parent) { if (cur.mount.parent === ofId) return true; cur = deck.getDevice(cur.mount.parent); } return false; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck'; }
function download(name, text) { const b = new Blob([text], { type: 'text/yaml' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

// ---- boot ------------------------------------------------------------------
function loop() { view.frame(); requestAnimationFrame(loop); }
function boot() {
  $('deckName').value = deck.name;
  wireToolbar();
  refreshAll();
  requestAnimationFrame(loop);
}
boot();
