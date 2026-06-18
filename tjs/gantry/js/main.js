// main.js — the Motion Suite. Loads a deck (from the layout editor's autosave or
// an imported YAML), lets you pick any motorized device, drive a jerk-limited
// move on it, and read the per-motor torque-vs-envelope analysis — now with the
// full mounted payload reflected to the rotor. Also plays the authored sequence
// across the whole cell. Rendering is the shared DeckView; analysis is deckengine.

import { Deck, defaultDeck } from '../../lib/deck.js';
import { objectToDeck, fromYAML } from '../../lib/deckio.js';
import { DeckView } from '../../lib/deckscene.js';
import { planDeviceMove, simulateDevice, jointStateAt, deviceJoints, defaultState, carriageBorneMass } from '../../lib/deckengine.js';
import { KinematicsScope, TorqueScope } from './scope.js';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'tjs.deck.current';

let deck = loadDeck();
const view = new DeckView($('viewport'), { editor: false });
const kinScope = new KinematicsScope($('kinScope'));
const torScope = new TorqueScope($('torScope'));

let activeId = null;
let stateMap = {};          // every device's current joint state
let targets = {};           // active device target joints
const toolState = {};       // deviceId -> {open, plunge}
let move = null, sim = null;
let anim = null, loop = false, speed = 1, lastFrac = null;

// ---- deck load -------------------------------------------------------------
function loadDeck() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return objectToDeck(JSON.parse(raw)); } catch (e) {}
  return defaultDeck();
}
function motorized() { return deck.devices.filter((d) => deviceJoints(d).length > 0); }

function adoptDeck(d) {
  deck = d;
  view.setDeck(deck);
  stateMap = {};
  for (const dev of deck.devices) stateMap[dev.id] = { ...defaultState(dev) };
  $('deckName').textContent = `${deck.name} · ${deck.devices.length} devices`;
  const m = motorized();
  buildDeviceSelector();
  renderSequence();
  if (m.length) selectDevice((m.find((x) => x.id === activeId) ? activeId : m[0].id));
  else { activeId = null; sim = null; drawScopes(null); $('verdict').innerHTML = '<div class="muted">deck has no motorized devices</div>'; }
  view.setState(stateMap);
}

// ---- device selection ------------------------------------------------------
function buildDeviceSelector() {
  const sel = $('deviceSel');
  sel.innerHTML = motorized().map((d) => `<option value="${d.id}">${d.id} · ${d.type}</option>`).join('');
  sel.value = activeId || '';
  sel.onchange = () => selectDevice(sel.value);
}

function selectDevice(id) {
  activeId = id;
  $('deviceSel').value = id;
  view.select(id);
  const dev = deck.getDevice(id);
  // default a representative target so the scope shows a profile immediately
  targets = dev.type === 'hbot'
    ? { x: Math.round(dev.params.bedX * 0.85), y: Math.round(dev.params.bedY * 0.18) }
    : { p: Math.round(dev.params.travel * 0.85) };
  buildJointControls(dev);
  buildAxisToggles(dev);
  const borne = carriageBorneMass(deck, id);
  $('loadInfo').innerHTML = `carriage carries <b style="color:#d8d8e6">${borne.toFixed(2)} kg</b> of mounted devices + tools`;
  resimulate();
}

function buildJointControls(dev) {
  const host = $('jointControls');
  const rows = deviceJoints(dev).map((k) => {
    const max = dev.type === 'hbot' ? (k === 'x' ? dev.params.bedX : dev.params.bedY) : dev.params.travel;
    const v = targets[k] ?? 0;
    return `<label class="row">target ${k.toUpperCase()} <span class="val"><span id="tg_${k}_v">${v}</span> mm</span></label>
            <input id="tg_${k}" type="range" min="0" max="${max}" step="1" value="${v}">`;
  }).join('');
  host.innerHTML = rows;
  for (const k of deviceJoints(dev)) {
    $(`tg_${k}`).addEventListener('input', (e) => { targets[k] = +e.target.value; $(`tg_${k}_v`).textContent = e.target.value; resimulate(); });
  }
}

function buildAxisToggles(dev) {
  const host = $('axisToggles');
  host.innerHTML = deviceJoints(dev).map((k) => {
    const c = (sim && sim.colors.axis[k]) || '#39d6c8';
    return `<label class="chk"><input type="checkbox" data-axis="${k}" checked><i style="background:${c}"></i>${k.toUpperCase()}</label>`;
  }).join('');
  host.querySelectorAll('[data-axis]').forEach((cb) => cb.addEventListener('change', () => drawScopes(lastFrac)));
}
function axisVisible() {
  const m = {};
  $('axisToggles').querySelectorAll('[data-axis]').forEach((cb) => { m[cb.dataset.axis] = cb.checked; });
  return m;
}

// ---- simulate + draw -------------------------------------------------------
function resimulate() {
  move = planDeviceMove(deck, activeId, targets, stateMap);
  sim = move ? simulateDevice(deck, activeId, move, 600) : null;
  lastFrac = null;
  drawScopes(null);
  renderVerdict();
  if (move) view.setState({ ...stateMap, [activeId]: { ...stateMap[activeId] } });
}
function drawScopes(frac) { kinScope.draw(sim, sim ? axisVisible() : {}, frac); torScope.draw(sim, frac); }

function renderVerdict() {
  if (!sim) { $('verdict').innerHTML = '<div class="muted">target equals current pose — move a target slider</div>'; return; }
  const rows = sim.motorKeys.map((k) => {
    const u = sim.verdict.peakUtil[k], stall = sim.verdict.stall[k], over = sim.verdict.overspeed[k];
    const pct = Math.min(100, Math.round(u * 100));
    const cls = stall ? 'bad' : u > 0.85 ? 'warn' : 'ok';
    const tag = stall ? (over ? 'STALL·OVERSPD' : 'STALL') : `${pct}%`;
    return `<div class="vrow"><span class="vk" style="color:${sim.colors.motor[k]}">${k}</span>
      <span class="vbar"><i class="${cls}" style="width:${pct}%"></i></span>
      <span class="vtag ${cls}">${tag}</span></div>`;
  }).join('');
  const rack = Math.max(...sim.racking);
  $('verdict').innerHTML = rows +
    `<div class="vmeta">move <b>${move.T.toFixed(3)} s</b> · bottleneck <b>${(move.bottleneck || '—').toUpperCase()}</b>${rack > 1e-6 ? ` · peak racking <b>${rack.toFixed(2)} N·m</b>` : ''}</div>` +
    (sim.verdict.anyStall
      ? '<div class="vwarn">⚠ not deliverable by this motor + load — ease accel/speed, fit a stronger motor, or lighten the carriage.</div>'
      : '<div class="vok">✓ within the motor envelope.</div>');
}

// ---- animation -------------------------------------------------------------
function stallAt(frac) {
  if (!sim) return false;
  const i = Math.min(sim.time.length - 1, Math.round(frac * (sim.time.length - 1)));
  return sim.motorKeys.some((k) => sim.motors[k][i].stall);
}
function poseActive(t) {
  const j = jointStateAt(deck, activeId, move, t);
  stateMap[activeId] = j;
  view.setState(stateMap);
  view.spinMotors(activeId, j);
  if (toolState[activeId]) view.actuateTool(activeId, toolState[activeId]);
}

function runMove() {
  if (!move) return;
  anim = { type: 'move', t0: performance.now(), after: () => { stateMap[activeId] = { ...targets }; } };
}

function frame() {
  if (anim && anim.type === 'move' && move) {
    const frac = Math.min(1, (performance.now() - anim.t0) / 1000 * speed / Math.max(move.T, 1e-3));
    lastFrac = frac;
    poseActive(frac * move.T);
    view.setStall(activeId, stallAt(frac));
    drawScopes(frac);
    if (frac >= 1) { const cb = anim.after; anim = null; cb && cb(); if (loop && !cb) runMove(); }
  }
  view.frame();
  requestAnimationFrame(frame);
}

// ---- sequence --------------------------------------------------------------
function renderSequence() {
  const s = deck.sequences[0];
  $('seqInfo').textContent = s ? `“${s.id}” · ${s.steps.length} steps` : 'no sequence in this deck';
  const ul = $('seqList'); ul.innerHTML = '';
  if (!s) return;
  s.steps.forEach((st, i) => {
    const li = document.createElement('li'); li.id = `step_${i}`;
    const what = st.move ? `move ${Object.entries(st.move).map(([k, v]) => `${k}=${v}`).join(' ')}` : st.tool ? `tool ${st.tool.open ? 'open' : 'close'}` : st.dwell != null ? `dwell ${st.dwell}s` : '?';
    li.innerHTML = `<span class="pill">${st.device || '—'}</span> ${what}`;
    ul.appendChild(li);
  });
}

function runSequence() {
  const s = deck.sequences[0]; if (!s || !s.steps.length) return;
  let i = 0;
  const clearActive = () => document.querySelectorAll('.steps li.active').forEach((e) => e.classList.remove('active'));
  const next = () => {
    clearActive();
    if (i >= s.steps.length) { anim = null; if (loop) { i = 0; } else return; }
    const step = s.steps[i++];
    const liEl = $(`step_${i - 1}`); if (liEl) liEl.classList.add('active');
    const dev = deck.getDevice(step.device);
    if (step.move && dev) {
      activeId = step.device; $('deviceSel').value = activeId; view.select(activeId);
      targets = { ...stateMap[activeId], ...step.move };
      move = planDeviceMove(deck, activeId, targets, stateMap);
      sim = move ? simulateDevice(deck, activeId, move, 400) : null;
      renderVerdict();
      if (!move) { return next(); }
      anim = { type: 'move', t0: performance.now(), after: () => { stateMap[activeId] = { ...targets }; next(); } };
    } else if (step.tool && dev) {
      const t = dev.tool === 'pipettor' ? { plunge: step.tool.open ? 0 : 1 } : { open: step.tool.open };
      toolState[step.device] = t; view.actuateTool(step.device, t);
      setTimeout(next, (step.dwell || 0.3) * 1000 / speed);
    } else if (step.dwell != null) {
      setTimeout(next, step.dwell * 1000 / speed);
    } else next();
  };
  next();
}

// ---- IO --------------------------------------------------------------------
function reloadFromEditor() {
  const d = loadDeck(); activeId = null; adoptDeck(d);
}
async function importFile(file) {
  try { const text = await file.text(); adoptDeck(await fromYAML(text)); }
  catch (e) { $('verdict').innerHTML = `<div class="vwarn">import failed: ${e.message}</div>`; }
}

// ---- wire ------------------------------------------------------------------
function wire() {
  $('btnRun').addEventListener('click', () => { anim = null; resimulate(); runMove(); });
  $('btnReset').addEventListener('click', () => { stateMap[activeId] = { ...defaultState(deck.getDevice(activeId)) }; view.setState(stateMap); resimulate(); });
  $('btnRunSeq').addEventListener('click', runSequence);
  $('btnLoop').addEventListener('click', () => { loop = !loop; $('btnLoop').classList.toggle('on', loop); });
  $('speed').addEventListener('input', () => { speed = +$('speed').value; $('speedv').textContent = speed.toFixed(1) + '×'; });
  $('btnReloadDeck').addEventListener('click', reloadFromEditor);
  $('btnImport').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); });
  addEventListener('resize', () => drawScopes(lastFrac));
}

function boot() {
  wire();
  adoptDeck(deck);
  requestAnimationFrame(frame);
  // autoplay the first device's move so the scope animates on load
  setTimeout(() => { if (move) runMove(); }, 500);
}
boot();
