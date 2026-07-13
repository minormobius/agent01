// main.js — the Homunculus surface. Fetches the FLTD system description, builds
// the world model's 3D self-image (systemToHomunculus -> a tjs deck + device
// profiles), renders it with the shared DeckView, lets you drive any axis, and
// plays the demo sequence through the oracle (deckengine + checkSequence) so the
// motor/collision verdict is visible. Pure static page — the same lib that the
// node twin-plant bridge (twin/server.mjs) uses to drive the real-vs-twin seam.

import * as THREE from 'three';
import { systemToHomunculus } from '../../lib/homunculus.js';
import { DeckView } from '../../lib/deckscene.js';
import { planDeviceMove, simulateDevice, jointStateAt, deviceJoints, defaultState } from '../../lib/deckengine.js';
import { checkSequence } from '../../lib/manifest.js';
import { initWorld, expand } from '../../lib/verbs.js';
import { KinematicsScope, TorqueScope } from '../../gantry/js/scope.js';

const $ = (id) => document.getElementById(id);
const SYS_URL = new URL('../../systems/mps-1.system.json', import.meta.url);

let deck, profiles, view;
let stateMap = {}, activeId = null, targets = {};
let anim = null, loop = false, lastFrac = null, sim = null;
let kinScope, torScope;

boot();

async function boot() {
  const sys = await (await fetch(SYS_URL)).json();
  const built = systemToHomunculus(sys);
  deck = built.deck; profiles = built.profiles;

  view = new DeckView($('viewport'), { editor: false });
  view.setDeck(deck);
  for (const d of deck.devices) stateMap[d.id] = { ...defaultState(d) };
  view.setState(stateMap);
  fitView();
  kinScope = new KinematicsScope($('kinScope'));
  torScope = new TorqueScope($('torScope'));

  $('sysName').textContent = `${deck.name} · ${deck.devices.length} bodies · ${profiles.length} profiles`;
  $('badge').innerHTML = `<b>${deck.name}</b><br>the world model's homunculus — a self-image of the motion skeleton + deck. Click a part to inspect; drive an axis or run the demo sequence.`;
  $('sysNotes').textContent = built.notes.length ? `mapping notes: ${built.notes.join(' · ')}` : '';

  buildDeviceSelector();
  buildProfileTable();
  renderSequence();
  wire();
  requestAnimationFrame(frame);
}

// Frame the camera + fog to the actual bench bounds. DeckView's defaults are
// tuned for the small pipetting sample; an MPS-1-scale deck needs a wider near/
// far, fitted distance limits (so a scroll-zoom can't dolly into the fog and
// black out), and the orbit target on the deck centre.
function fitView() {
  view.scene.updateMatrixWorld(true);          // ensure mesh world matrices are current
  const box = new THREE.Box3().setFromObject(view.root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  const cam = view.camera, ctl = view.controls;
  const dir = new THREE.Vector3(0.9, 0.8, 1.1).normalize();
  cam.position.copy(center).addScaledVector(dir, r * 2.4);
  cam.near = Math.max(0.05, r * 0.01); cam.far = r * 80; cam.updateProjectionMatrix();
  ctl.target.copy(center);
  // smooth, continuous, target-anchored dolly (zoomToCursor jumps to a clamp in
  // one wheel step at this scale). Multiplicative step ~5%/notch over a wide range.
  ctl.enableDamping = true; ctl.dampingFactor = 0.09;
  ctl.zoomToCursor = false; ctl.zoomSpeed = 0.8;
  ctl.minDistance = r * 0.15; ctl.maxDistance = r * 40; ctl.update();
  if (view.scene.fog) { view.scene.fog.near = r * 5; view.scene.fog.far = r * 60; }
}

// ---- device driving --------------------------------------------------------
function motorized() { return deck.devices.filter((d) => deviceJoints(d).length > 0); }

function buildDeviceSelector() {
  const sel = $('deviceSel');
  sel.innerHTML = motorized().map((d) => `<option value="${d.id}">${d.id} · ${d.type}</option>`).join('');
  sel.onchange = () => selectDevice(sel.value);
  selectDevice(motorized()[0]?.id);
}

// Click-to-inspect: pick any body (motorized or labware), highlight it, show
// what it is + its device profile(s), and make it the active drive target if it
// has joints.
function inspect(id) {
  if (!id) return;
  const dev = deck.getDevice(id); if (!dev) return;
  view.select(id);
  const ps = profiles.filter((p) => p.deviceId === id);
  const profLine = ps.length
    ? ps.map((p) => `${p.axis}${p.joint ? '·' + p.joint : ''}${p.node != null ? ' (amp ' + p.node + ')' : ''} — ${p.role}`).join('<br>')
    : 'static labware — no axis';
  const tool = dev.tool && dev.tool !== 'none' ? ` · tool: <b>${dev.tool}</b>` : '';
  $('selInfo').innerHTML = `<b style="color:var(--accent)">${id}</b> · ${dev.type}${tool}<br><span style="color:var(--soft)">${profLine}</span>`;
  if (deviceJoints(dev).length) selectDevice(id);
}

function selectDevice(id) {
  if (!id) return;
  activeId = id; $('deviceSel').value = id; view.select(id);
  const dev = deck.getDevice(id);
  targets = dev.type === 'hbot'
    ? { x: Math.round(dev.params.bedX * 0.7), y: Math.round(dev.params.bedY * 0.3) }
    : { p: Math.round(dev.params.travel * 0.6) };
  const host = $('jointControls');
  host.innerHTML = deviceJoints(dev).map((k) => {
    const max = dev.type === 'hbot' ? (k === 'x' ? dev.params.bedX : dev.params.bedY) : dev.params.travel;
    return `<label class="row">target ${k.toUpperCase()} <span class="val"><span id="tv_${k}">${targets[k]}</span> mm</span></label>
            <input id="tg_${k}" type="range" min="0" max="${max}" step="1" value="${targets[k]}">`;
  }).join('');
  for (const k of deviceJoints(dev)) $(`tg_${k}`).addEventListener('input', (e) => { targets[k] = +e.target.value; $(`tv_${k}`).textContent = e.target.value; resimulate(); });
  buildAxisToggles(dev);
  resimulate();
}

function runMove() {
  const move = planDeviceMove(deck, activeId, targets, stateMap);
  if (!move) return;
  anim = { id: activeId, move, t0: performance.now(), dur: Math.max(move.T, 0.2), after: () => { stateMap[activeId] = { ...stateMap[activeId], ...targets }; } };
}

// ---- dynamic analysis: kinematics + torque scopes + motor verdict ----------
// Same instruments as the Motion Suite (/gantry), reading deckengine's per-device
// simulation: jerk-limited p/v/a/jerk and per-motor torque-demand vs. envelope
// with the full mounted payload reflected to the rotor.
function buildAxisToggles(dev) {
  const host = $('axisToggles'); if (!host) return;
  host.innerHTML = deviceJoints(dev).map((k) => {
    const c = (sim && sim.colors.axis[k]) || '#39d6c8';
    return `<label class="chk"><input type="checkbox" data-axis="${k}" checked><i style="background:${c}"></i>${k.toUpperCase()}</label>`;
  }).join('');
  host.querySelectorAll('[data-axis]').forEach((cb) => cb.addEventListener('change', () => drawScopes(lastFrac)));
}
function axisVisible() {
  const m = {}; const host = $('axisToggles');
  if (host) host.querySelectorAll('[data-axis]').forEach((cb) => { m[cb.dataset.axis] = cb.checked; });
  return m;
}
function resimulate() {
  const move = planDeviceMove(deck, activeId, targets, stateMap);
  sim = move ? simulateDevice(deck, activeId, move, 600) : null;
  lastFrac = null; drawScopes(null); renderVerdict();
}
function drawScopes(frac) {
  if (kinScope) kinScope.draw(sim, sim ? axisVisible() : {}, frac);
  if (torScope) torScope.draw(sim, frac);
}
function stallAt(frac) {
  if (!sim) return false;
  const i = Math.min(sim.time.length - 1, Math.round((frac || 0) * (sim.time.length - 1)));
  return sim.motorKeys.some((k) => sim.motors[k][i].stall);
}
function renderVerdict() {
  const host = $('moveVerdict'); if (!host) return;
  if (!sim) { host.innerHTML = '<div class="muted">target equals current pose — move a target slider</div>'; return; }
  const rows = sim.motorKeys.map((k) => {
    const u = sim.verdict.peakUtil[k], stall = sim.verdict.stall[k], over = sim.verdict.overspeed[k];
    const pct = Math.min(100, Math.round(u * 100));
    const cls = stall ? 'bad' : u > 0.85 ? 'warn' : 'ok';
    const tag = stall ? (over ? 'STALL·OVSPD' : 'STALL') : `${pct}%`;
    return `<div class="vrow"><span class="vk" style="color:${sim.colors.motor[k]}">${k}</span><span class="vbar"><i class="${cls}" style="width:${pct}%"></i></span><span class="vtag ${cls}">${tag}</span></div>`;
  }).join('');
  const rack = sim.racking && sim.racking.length ? Math.max(...sim.racking) : 0;
  host.innerHTML = rows +
    `<div class="vmeta">${activeId} · move <b>${sim.T.toFixed(3)} s</b>${rack > 1e-6 ? ` · peak racking <b>${rack.toFixed(2)} N·m</b>` : ''}</div>` +
    (sim.verdict.anyStall
      ? '<div style="margin-top:6px;color:var(--bad);font-size:11.5px">⚠ exceeds the motor + payload envelope</div>'
      : '<div style="margin-top:6px;color:var(--ok);font-size:11.5px">✓ within the motor envelope</div>');
}

// ---- demo sequence + oracle ------------------------------------------------
function renderSequence() {
  const s = deck.sequences[0];
  const ul = $('seqList'); ul.innerHTML = '';
  if (!s) { $('verdict').innerHTML = '<div class="muted">no demo sequence</div>'; return; }
  s.steps.forEach((st, i) => {
    const li = document.createElement('li'); li.id = `step_${i}`;
    li.innerHTML = `<span class="pill">${st.device}</span> ${stepLabel(st)}`;
    ul.appendChild(li);
  });
  const r = checkSequence(deck, s.steps);
  const issues = r.diagnostics.filter((d) => d.severity === 'error').slice(0, 4)
    .map((d) => `<div style="color:var(--bad);font-size:11px">step ${d.step + 1}: ${d.message}</div>`).join('');
  $('verdict').innerHTML =
    `<div class="vmeta">cycle <b>${r.cycleTime}s</b> · ${r.anyStall ? '<span style="color:var(--bad)">motor stall</span>' : 'motors ok'} · ${r.anyCollision ? '<span style="color:var(--bad)">collision</span>' : 'clear'}</div>` +
    (r.ok ? '<div class="vok">✓ deliverable by the modeled motors + payload</div>'
          : '<div class="vwarn">⚠ not deliverable as modeled — placeholder limits/motors exceed the envelope (the twin flags it before metal).</div>') + issues;
}

function stepLabel(st) {
  if (st.move) return `move ${Object.entries(st.move).map(([k, v]) => `${k}=${v}`).join(' ')}`;
  if (st.grip) return `grip <b>${st.grip}</b>`;
  if (st.release) return `release → <b>${st.release}</b>`;
  if (st.pickTip) return `pickTip <b>${st.pickTip}</b>`;
  if (st.dropTip) return `dropTip`;
  if (st.aspirate) return `aspirate <b>${st.aspirate}</b> ${st.uL || ''}µL`;
  if (st.dispense) return `dispense → <b>${st.dispense}</b> ${st.uL || ''}µL`;
  if (st.moveOver) return `moveOver ${st.moveOver}`;
  return '?';
}

// Run the demo sequence: lower each high-level verb to primitives via expand()
// (the same path the oracle dry-ran), animate the primitives, then apply the
// world-state effects (tip on/off, gripper). Mirrors the proven /gantry runner.
let world = null;
function runSequence() {
  const s = deck.sequences[0]; if (!s) return;
  world = initWorld(deck);
  let vi = 0;
  const clear = () => document.querySelectorAll('.steps li.active').forEach((e) => e.classList.remove('active'));

  const runPrims = (prims, done) => {
    let pi = 0;
    const nextPrim = () => {
      if (pi >= prims.length) { done(); return; }
      const prim = prims[pi++];
      if (prim.move && deck.getDevice(prim.device)) {
        activeId = prim.device; $('deviceSel').value = activeId; view.select(activeId);
        targets = { ...stateMap[activeId], ...prim.move };
        const move = planDeviceMove(deck, activeId, targets, stateMap);
        if (!move) { stateMap[activeId] = { ...stateMap[activeId], ...targets }; view.setState(stateMap); nextPrim(); return; }
        sim = simulateDevice(deck, activeId, move, 400); buildAxisToggles(deck.getDevice(activeId)); renderVerdict();
        anim = { id: activeId, move, t0: performance.now(), dur: Math.max(move.T, 0.25), after: () => { stateMap[activeId] = { ...targets }; nextPrim(); } };
      } else if (prim.tool && deck.getDevice(prim.device)) {
        const dev = deck.getDevice(prim.device);
        const t = dev.tool === 'pipettor' ? { plunge: prim.tool.open ? 0 : 1 } : { open: prim.tool.open };
        view.actuateTool(prim.device, t); setTimeout(nextPrim, 220);
      } else if (prim.dwell != null) { setTimeout(nextPrim, prim.dwell * 800); }
      else nextPrim();
    };
    nextPrim();
  };

  const nextVerb = () => {
    clear();
    if (vi >= s.steps.length) { anim = null; if (loop) { vi = 0; world = initWorld(deck); nextVerb(); } return; }
    const step = s.steps[vi++]; const li = $(`step_${vi - 1}`); if (li) li.classList.add('active');
    const ex = expand(deck, step, world, stateMap);
    if (ex.error) { nextVerb(); return; } // the oracle panel already surfaces this
    runPrims(ex.primitives, () => { ex.apply(world); applyWorldVisuals(); nextVerb(); });
  };
  nextVerb();
}

// Reflect the tjs world state onto the 3D: pipettor tip on/off, gripper open/closed.
function applyWorldVisuals() {
  if (!world) return;
  for (const [id, t] of Object.entries(world.tools)) {
    const d = deck.getDevice(id);
    if (d && d.tool === 'pipettor') view.setTip(id, t.tip);
    if (d && d.tool === 'gripper') view.actuateTool(id, { open: !t.holding });
  }
}

// ---- animation loop --------------------------------------------------------
function frame() {
  if (anim) {
    const frac = Math.min(1, (performance.now() - anim.t0) / 1000 / anim.dur);
    const j = jointStateAt(deck, anim.id, anim.move, frac * anim.move.T);
    stateMap[anim.id] = j;
    view.setState(stateMap);
    view.spinMotors(anim.id, j);
    lastFrac = frac;
    view.setStall(anim.id, stallAt(frac));
    drawScopes(frac);
    if (frac >= 1) { const cb = anim.after; anim = null; cb && cb(); }
  }
  view.frame();
  requestAnimationFrame(frame);
}

// ---- profile table ---------------------------------------------------------
function buildProfileTable() {
  const tb = $('profTable').querySelector('tbody');
  tb.innerHTML = profiles.map((p) => {
    const maps = p.rendered ? `${p.deviceId}.${p.joint}` : (p.role === 'rotary' ? '— (no body)' : `${p.deviceId || '—'}`);
    const nodeCell = p.node != null ? `<span class="pill amp">${p.node}</span>` : '—';
    return `<tr class="${p.role === 'rotary' ? 'rot' : ''}"><td>${p.axis}</td><td>${nodeCell}</td><td>${maps}</td><td>${p.role}</td></tr>`;
  }).join('');
}

// ---- wire ------------------------------------------------------------------
function wire() {
  $('btnRun').addEventListener('click', () => { anim = null; resimulate(); runMove(); });
  $('btnReset').addEventListener('click', () => { stateMap[activeId] = { ...defaultState(deck.getDevice(activeId)) }; view.setState(stateMap); resimulate(); });
  $('btnSeq').addEventListener('click', runSequence);
  $('btnLoop').addEventListener('click', () => { loop = !loop; $('btnLoop').classList.toggle('on', loop); });
  addEventListener('resize', () => { view.resize(); drawScopes(lastFrac); });
  // click-to-inspect (distinguish a click from an orbit-drag)
  const el = view.renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5) return; // it was a drag/orbit, not a pick
    const id = view.pickDeviceAt(e.clientX, e.clientY);
    if (id) inspect(id);
  });
}
