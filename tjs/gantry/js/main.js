// main.js — wires the machine model, the 3D view, and the two scopes into one
// interactive playground. Changing any motor/limit/tool config re-simulates the
// current move and refreshes the verdict + scopes immediately; "Run" animates
// the gantry along the seven-segment profile with a shared playhead; the
// pick→place demo chains coordinated moves with gripper/pipettor actuation.

import { Machine, defaultConfig, TOOLS } from './machine.js';
import { STEPPER_PRESETS } from '../../lib/motor.js';
import { GantryView } from './scene.js';
import { KinematicsScope, TorqueScope } from './scope.js';

const $ = (id) => document.getElementById(id);

const machine = new Machine();
const view = new GantryView($('viewport'));
const kinScope = new KinematicsScope($('kinScope'));
const torScope = new TorqueScope($('torScope'));

const axisVisible = { x: true, y: true, z1: true, z2: true };
let move = null, sim = null;
let anim = null; // active animation/sequence state
let loop = false;
let speed = 1.0;

// ---- helpers ---------------------------------------------------------------
function pulleyK() { return { rMm: machine.pulleyRadiusMm(), k: (2 * Math.PI) / machine.cfg.geometry.leadScrew }; }
function anglesFromSample(s) {
  const { rMm, k } = pulleyK();
  return {
    A: (s.cart.x.p + s.cart.y.p) / rMm,
    B: (s.cart.x.p - s.cart.y.p) / rMm,
    Z1: s.cart.z1.p * k, Z2: s.cart.z2.p * k,
  };
}
function toolState() {
  return { z1: { ...machine.tool.z1 }, z2: { ...machine.tool.z2 } };
}

// Re-plan + simulate a move to `target`; refresh scopes/verdict statically.
function resimulate(target, { keepPlayhead = false } = {}) {
  move = machine.planTo(target);
  if (!move) { sim = null; renderStatic(); return; }
  sim = machine.simulate(move, 600);
  renderStatic(keepPlayhead ? lastFrac : null);
  updateVerdict();
}

let lastFrac = null;
function renderStatic(frac = null) {
  kinScope.draw(sim, axisVisible, frac);
  torScope.draw(sim, frac);
}

function setViewToFrac(frac) {
  if (!move) return;
  const s = machine.sample(move, frac * move.T);
  view.setState(s, anglesFromSample(s), toolState());
}

function updateVerdict() {
  const wrap = $('verdict');
  if (!sim) { wrap.innerHTML = '<div class="muted">no move</div>'; return; }
  const rows = ['A', 'B', 'Z1', 'Z2'].map((k) => {
    const u = sim.verdict.peakUtil[k];
    const stall = sim.verdict.stall[k];
    const over = sim.verdict.overspeed[k];
    const pct = Math.min(100, Math.round(u * 100));
    const cls = stall ? 'bad' : u > 0.85 ? 'warn' : 'ok';
    const tag = stall ? (over ? 'STALL · OVERSPEED' : 'STALL') : `${pct}%`;
    return `<div class="vrow">
      <span class="vk" style="color:${MC[k]}">${k}</span>
      <span class="vbar"><i class="${cls}" style="width:${pct}%"></i></span>
      <span class="vtag ${cls}">${tag}</span></div>`;
  }).join('');
  const peakRack = Math.max(...sim.racking);
  $('verdict').innerHTML = rows +
    `<div class="vmeta">move time <b>${move.T.toFixed(3)} s</b> · bottleneck <b>${move.bottleneck?.toUpperCase() || '—'}</b> · peak racking <b>${peakRack.toFixed(2)} N·m</b></div>` +
    (sim.verdict.anyStall ? '<div class="vwarn">⚠ commanded profile is NOT deliverable by these motors — reduce accel/speed, fit a stronger motor, or lighten the load.</div>' : '<div class="vok">✓ profile is within the motor envelope.</div>');
}
const MC = { A: '#39d6c8', B: '#ffb454', Z1: '#7ee787', Z2: '#c08cff' };

// ---- animation / sequencing ------------------------------------------------
function playMove(target, after) {
  resimulate(target);
  if (!move) { after && after(); return; }
  anim = { type: 'move', t0: performance.now(), after };
}

// Sequence: array of steps. {move:{...}} or {tool:{z, open?, plunge?}, dwell}
function runSequence(steps) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) { anim = null; return; }
    const step = steps[i++];
    if (step.move) {
      playMove(step.move, () => { commitPos(step.move); next(); });
    } else if (step.tool) {
      const t = machine.tool[step.tool.z];
      if (step.tool.open !== undefined) t.open = step.tool.open;
      if (step.tool.plunge !== undefined) t.plunge = step.tool.plunge;
      // Refresh the 3D tool actuation at the current (held) position.
      const hold = machine.planTo({}) || { start: machine.pos, evaluators: {}, T: 1e-3 };
      view.setState(machine.sample(hold, 0), null, toolState());
      setTimeout(next, (step.dwell || 0.3) * 1000 / speed);
    } else next();
  };
  next();
}

function commitPos(target) {
  machine.pos = { ...machine.pos, ...target };
}

function pickPlaceDemo() {
  const safeZ = 0, downZ = 95;
  machine.pos = { x: 60, y: 80, z1: safeZ, z2: safeZ };
  machine.tool.z1.open = true;
  runSequence([
    { move: { x: 60, y: 80 } },
    { move: { z1: downZ } },
    { tool: { z: 'z1', open: false }, dwell: 0.25 },
    { move: { z1: safeZ } },
    { move: { x: 240, y: 220 } },
    { move: { z1: downZ } },
    { tool: { z: 'z1', open: true }, dwell: 0.25 },
    { move: { z1: safeZ } },
    { move: { x: 150, y: 150 } },
  ]);
}

// RAF loop.
function frame() {
  if (anim && anim.type === 'move' && move) {
    const elapsed = (performance.now() - anim.t0) / 1000 * speed;
    const frac = Math.min(1, elapsed / Math.max(move.T, 1e-3));
    lastFrac = frac;
    setViewToFrac(frac);
    renderStatic(frac);
    if (frac >= 1) {
      const cb = anim.after; anim = null;
      if (cb) cb();
      else if (loop) { anim = { type: 'move', t0: performance.now(), after: null }; }
    }
  }
  view.frame();
  requestAnimationFrame(frame);
}

// ---- UI wiring -------------------------------------------------------------
function buildControls() {
  // motor preset selects
  const presetOpts = Object.keys(STEPPER_PRESETS).map((k) => `<option value="${k}">${STEPPER_PRESETS[k].label}</option>`).join('');
  for (const id of ['mGantry', 'mZ1', 'mZ2']) $(id).innerHTML = presetOpts;
  $('mGantry').value = machine.cfg.motors.gantry;
  $('mZ1').value = machine.cfg.motors.z1;
  $('mZ2').value = machine.cfg.motors.z2;

  // tool selects
  const toolOpts = Object.keys(TOOLS).map((k) => `<option value="${k}">${TOOLS[k].label}</option>`).join('');
  $('tZ1').innerHTML = toolOpts; $('tZ2').innerHTML = toolOpts;
  $('tZ1').value = machine.cfg.tools.z1; $('tZ2').value = machine.cfg.tools.z2;

  // limit fields
  syncLimitInputs();
  syncTargetInputs();

  // events
  for (const [id, slot] of [['mGantry', 'gantry'], ['mZ1', 'z1'], ['mZ2', 'z2']]) {
    $(id).addEventListener('change', () => { machine.cfg.motors[slot] = $(id).value; machine.rebuild(); reSim(); });
  }
  $('tZ1').addEventListener('change', () => { machine.cfg.tools.z1 = $('tZ1').value; view.setToolKind('z1', toolKind('z1')); reSim(); });
  $('tZ2').addEventListener('change', () => { machine.cfg.tools.z2 = $('tZ2').value; view.setToolKind('z2', toolKind('z2')); reSim(); });
  $('payZ1').addEventListener('change', () => { machine.cfg.payload.z1 = $('payZ1').checked; reSim(); });
  $('payZ2').addEventListener('change', () => { machine.cfg.payload.z2 = $('payZ2').checked; reSim(); });

  const limitMap = [
    ['lXV', 'xy', 'vmax'], ['lXA', 'xy', 'amax'], ['lXJ', 'xy', 'jmax'],
    ['lZV', 'z', 'vmax'], ['lZA', 'z', 'amax'], ['lZJ', 'z', 'jmax'],
  ];
  for (const [id, grp, key] of limitMap) {
    $(id).addEventListener('input', () => {
      machine.cfg.limits[grp][key] = parseFloat($(id).value) || 0;
      $(id + 'v').textContent = $(id).value;
      reSim();
    });
  }

  for (const id of ['tgX', 'tgY', 'tgZ1', 'tgZ2']) {
    $(id).addEventListener('input', () => { $(id + 'v').textContent = $(id).value; reSimTarget(); });
  }

  for (const a of ['x', 'y', 'z1', 'z2']) {
    $('vis_' + a).addEventListener('change', (e) => { axisVisible[a] = e.target.checked; renderStatic(lastFrac); });
  }

  $('btnRun').addEventListener('click', () => {
    const tgt = currentTarget();
    machine.pos = { ...machine.pos }; // keep
    anim = null;
    playMove(tgt, () => commitPos(tgt));
  });
  $('btnDemo').addEventListener('click', () => { pickPlaceDemo(); });
  $('btnLoop').addEventListener('click', () => { loop = !loop; $('btnLoop').classList.toggle('on', loop); });
  $('btnReset').addEventListener('click', () => { machine.pos = { x: 150, y: 150, z1: 0, z2: 0 }; syncTargetInputs(); reSimTarget(); });
  $('speed').addEventListener('input', () => { speed = parseFloat($('speed').value); $('speedv').textContent = speed.toFixed(1) + '×'; });
}

function toolKind(z) { return machine.cfg.tools[z] === 'pipettor' ? 'pipettor' : 'gripper'; }
function reSim() { resimulate(currentTarget(), { keepPlayhead: true }); setViewToFrac(lastFrac ?? 1); }
function reSimTarget() { resimulate(currentTarget()); setViewToFrac(1); }
function currentTarget() {
  return { x: +$('tgX').value, y: +$('tgY').value, z1: +$('tgZ1').value, z2: +$('tgZ2').value };
}
function syncLimitInputs() {
  const L = machine.cfg.limits;
  const set = (id, val) => { if ($(id)) { $(id).value = val; if ($(id + 'v')) $(id + 'v').textContent = val; } };
  set('lXV', L.xy.vmax); set('lXA', L.xy.amax); set('lXJ', L.xy.jmax);
  set('lZV', L.z.vmax); set('lZA', L.z.amax); set('lZJ', L.z.jmax);
  $('payZ1').checked = machine.cfg.payload.z1; $('payZ2').checked = machine.cfg.payload.z2;
}
function syncTargetInputs() {
  const set = (id, val) => { $(id).value = val; $(id + 'v').textContent = val; };
  // default a fresh diagonal target
  set('tgX', 250); set('tgY', 240); set('tgZ1', machine.pos.z1); set('tgZ2', machine.pos.z2);
}

// ---- boot ------------------------------------------------------------------
function boot() {
  buildControls();
  view.setToolKind('z1', toolKind('z1'));
  view.setToolKind('z2', toolKind('z2'));
  machine.pos = { x: 50, y: 60, z1: 0, z2: 0 };
  resimulate(currentTarget());
  setViewToFrac(0);
  requestAnimationFrame(frame);
  // autoplay the first move so the scope animates on load
  setTimeout(() => playMove(currentTarget(), () => commitPos(currentTarget())), 400);
  addEventListener('resize', () => renderStatic(lastFrac));
}
boot();
