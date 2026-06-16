// designer.js — the course-design surface (twin screen #1).
//
// Two linked views of the same hole:
//   • a live 3D preview of the cylinder interior (the same renderer + world the
//     play surface uses), slowly orbiting the hole;
//   • a 2D PLAN editor where you drag the tee, the pin and the hazards.
//
// Editing is on the floor in floor coordinates (golf.js), so the hole means the
// same thing in both frames. "Play this hole" encodes the course into the URL and
// hands it to play.html; "copy share link" yields a permalink to exactly this hole.
//
// The 3D preview needs WebGPU; the plan editor does not, so a missing GPU degrades
// to "editor only" rather than blocking the page.

import { vec3, mat4 } from './math.js';
import { CYLINDERS, makeCylinder, downDir } from './physics.js';
import * as geo from './geometry.js';
import * as terrain from './terrain.mjs';
import {
  floorToWorld, floorDistance, surfaceBasis, par, randomCourse,
  decodeCourse, encodeCourse,
} from './golf.js';

const HAZARD_COLOR = { water: [0.16, 0.42, 0.7], sand: [0.78, 0.71, 0.42], rough: [0.18, 0.36, 0.16] };
const HAZARD_2D = { water: '#3f74c8', sand: '#cdb86a', rough: '#4a7a3a' };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export async function start(ui) {
  const state = {
    course: null, presetIdx: 0, mode: 'cylinder',
    cyl: null, R: 0, len: 0,
    sel: -1,                         // selected hazard index, −1 = none
    addKind: null,                   // pending "add hazard" kind
    orbit: 0, camHold: false,
  };

  function toast(msg) {
    const t = ui.toast; if (!t) return;
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.className = 'toast show';
  }

  // ── course init / world build ──
  function setWorld(presetIdx, mode) {
    state.presetIdx = presetIdx; state.mode = mode;
    state.cyl = makeCylinder(CYLINDERS[presetIdx]);
    state.R = state.cyl.R; state.len = state.cyl.len;
  }

  function loadCourse(c) {
    state.course = c;
    if (!c.terrain) c.terrain = terrain.defaultTerrain();
    setWorld(c.preset ?? 0, c.mode || 'cylinder');
    state.sel = -1; ui.cname.value = c.name || 'Hole 1';
    if (ui.crest) ui.crest.value = String(c.terrain.crest);
    if (ui.teeth) ui.teeth.value = String(c.terrain.teeth);
    if (gpuReady) buildWorld();
    refresh();
  }

  function newRandom() {
    const seed = (Math.random() * 1e9) | 0;
    const c = randomCourse(seed, state.presetIdx, { mode: state.mode, R: state.R, len: state.len });
    c.name = ui.cname.value || c.name;
    loadCourse(c);
  }

  // recompute par + readouts + re-encode the share/play links + redraw plan
  function refresh() {
    const c = state.course;
    c.preset = state.presetIdx; c.mode = state.mode; c.name = ui.cname.value || c.name;
    const dist = floorDistance(state.mode, state.R, c.tee, c.pin);
    c.par = par(dist);
    ui.length.textContent = `${dist.toFixed(0)} m`;
    ui.parv.textContent = String(c.par);
    ui.preset.textContent = CYLINDERS[state.presetIdx].label;
    ui.mode.textContent = state.mode === 'cylinder' ? 'O’Neill cylinder' : 'Earth (control)';
    drawPlan();
  }

  function shareCode() { return encodeCourse({ ...state.course, preset: state.presetIdx, mode: state.mode, name: ui.cname.value }); }

  // ── 3D preview (optional — needs WebGPU) ──
  let renderer = null, M = null, gpuReady = false;
  async function initPreview() {
    try {
      const { initRenderer } = await import('./webgpu.js');
      renderer = await initRenderer(ui.canvas);
    } catch (e) {
      toast('3D preview needs WebGPU — the plan editor still works.');
      return;
    }
    gpuReady = true;
    M = {
      dot: renderer.mesh(geo.buildDot(), 64),
      flag: renderer.mesh(geo.buildFlag(), 1),
      tee: renderer.mesh(geo.buildTee(), 1),
      disc: renderer.mesh(geo.buildDisc(), 1),
      trees: geo.TREE_KIT.map((m) => renderer.mesh(m, 256)),
      pylon: renderer.mesh(geo.buildPylon(), 64),
      ground: renderer.mesh(geo.buildGround(), 1),
      shell: null, sun: null,
    };
    buildWorld();
    requestAnimationFrame(loop);
  }

  const terr = () => state.course.terrain;
  // drop scattered props onto the carved terrain surface
  function liftTransforms(list) {
    const t = terr();
    return list.map((tr) => {
      const p = tr.pos, u = state.mode === 'cylinder' ? Math.atan2(p[1], p[0]) : p[0], v = p[2];
      const e = terrain.height(t, state.mode, state.R, u, v);
      const np = state.mode === 'cylinder' ? [Math.cos(u) * (state.R - e), Math.sin(u) * (state.R - e), v] : [p[0], e, p[2]];
      return { pos: np, q: tr.q, scale: tr.scale };
    });
  }

  function buildWorld() {
    if (!gpuReady) return;
    const t = terr();
    if (state.mode === 'cylinder') {
      const { R: rad, len } = state.cyl;
      if (M.shell) { M.shell.vbuf.destroy(); M.shell.ibuf.destroy(); }
      if (M.sun) { M.sun.vbuf.destroy(); M.sun.ibuf.destroy(); }
      M.shell = renderer.mesh(geo.buildCylinderShell(rad, len, 160, 110, (th, z) => terrain.height(t, 'cylinder', rad, th, z)), 1);
      M.sun = renderer.mesh(geo.buildSunRod(len, Math.max(10, rad * 0.0025)), 1);
      renderer.setInstances(M.shell, instOne(mat4.create(), [1, 1, 1, 0]));
      renderer.setInstances(M.sun, instOne(mat4.create(), [1, 1, 1, 1]));
      const s = geo.scatterCylinder(rad, len);
      s.trees.forEach((list, v) => renderer.setInstances(M.trees[v], instMany(liftTransforms(list))));
      renderer.setInstances(M.pylon, instMany(liftTransforms(s.pylons)));
    } else {
      if (M.ground.vbuf) { M.ground.vbuf.destroy(); M.ground.ibuf.destroy(); }
      M.ground = renderer.mesh(geo.buildGround(9000, 140, (x, z) => terrain.height(t, 'earth', 0, x, z)), 1);
      renderer.setInstances(M.ground, instOne(mat4.create(), [1, 1, 1, 0]));
      const s = geo.scatterEarth();
      s.trees.forEach((list, v) => renderer.setInstances(M.trees[v], instMany(liftTransforms(list))));
      renderer.setInstances(M.pylon, instMany(liftTransforms(s.pylons)));
    }
  }

  const _m = mat4.create();
  function yToUp(out, up, pos, scale) {
    const f = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], f, up));
    const fwd = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], right, up));
    return geo.basisModel(out, right, up, fwd, pos, [scale, scale, scale]);
  }

  const liftOnto = (out, pt) => floorToWorld(out, state.mode, state.R, pt, terrain.height(terr(), state.mode, state.R, pt.u, pt.v));
  const normOf = (pt) => terrain.normalAt([0, 0, 0], terr(), state.mode, state.R, pt.u, pt.v);

  function placeProps() {
    const c = state.course, t = terr();
    renderer.setInstances(M.tee, instOne(yToUp(_m, normOf(c.tee), liftOnto([0, 0, 0], c.tee), 1.6), [1, 1, 1, 0]));
    renderer.setInstances(M.flag, instOne(yToUp(_m, normOf(c.pin), liftOnto([0, 0, 0], c.pin), 1.6), [1, 1, 1, 0]));

    const discs = [{ u: c.pin.u, v: c.pin.v, r: 24, col: [0.30, 0.62, 0.32] }]
      .concat((c.hazards || []).map((h) => ({ u: h.u, v: h.v, r: h.r, col: HAZARD_COLOR[h.kind] || [0.4, 0.4, 0.4] })));
    const data = new Float32Array(discs.length * 20);
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i];
      const e = terrain.height(t, state.mode, state.R, d.u, d.v);
      const w = floorToWorld([0, 0, 0], state.mode, state.R, { u: d.u, v: d.v }, e + 0.5);
      yToUp(_m, normOf(d), w, d.r); data.set(_m, i * 20);
      data[i * 20 + 16] = d.col[0]; data[i * 20 + 17] = d.col[1]; data[i * 20 + 18] = d.col[2]; data[i * 20 + 19] = 0.28;
    }
    renderer.setInstances(M.disc, data);

    // a dotted guide line tee→pin, riding the terrain surface
    const n = 28, dots = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const u = state.mode === 'cylinder' ? c.tee.u + angDiff(c.pin.u, c.tee.u) * f : c.tee.u + (c.pin.u - c.tee.u) * f;
      const v = c.tee.v + (c.pin.v - c.tee.v) * f;
      const e = terrain.height(t, state.mode, state.R, u, v);
      const w = floorToWorld([0, 0, 0], state.mode, state.R, { u, v }, e + 0.8);
      mat4.fromRTS(_m, [0, 0, 0, 1], w, [0.7, 0.7, 0.7]); dots.set(_m, i * 20);
      dots[i * 20 + 16] = 0.95; dots[i * 20 + 17] = 0.85; dots[i * 20 + 18] = 0.35; dots[i * 20 + 19] = 0.8;
    }
    renderer.setInstances(M.dot, dots);
  }

  function loop() {
    if (!gpuReady) return;
    renderer.resize();
    if (!state.camHold) state.orbit += 0.0016;
    const c = state.course;
    // frame the hole: orbit an overview eye around the tee↔pin midpoint
    const midU = state.mode === 'cylinder' ? c.tee.u + angDiff(c.pin.u, c.tee.u) * 0.5 : (c.tee.u + c.pin.u) / 2;
    const midPt = { u: midU, v: (c.tee.v + c.pin.v) / 2 };
    const midW = floorToWorld([0, 0, 0], state.mode, state.R, midPt, 0);
    const { up, fwd, right } = surfaceBasis(state.mode, midW);
    const dist = Math.max(120, floorDistance(state.mode, state.R, c.tee, c.pin));
    const H = Math.min(900, dist * 0.55), back = Math.min(1600, dist * 1.0);
    const ca = Math.cos(state.orbit), sa = Math.sin(state.orbit);
    const dirT = [fwd[0] * ca + right[0] * sa, fwd[1] * ca + right[1] * sa, fwd[2] * ca + right[2] * sa];
    const eye = [midW[0] + up[0] * H - dirT[0] * back, midW[1] + up[1] * H - dirT[1] * back, midW[2] + up[2] * H - dirT[2] * back];
    const center = [midW[0] + up[0] * H * 0.12, midW[1] + up[1] * H * 0.12, midW[2] + up[2] * H * 0.12];

    const fogFar = state.mode === 'cylinder' ? Math.min(2.2 * state.R + state.len, 26000) : 7000;
    const proj = mat4.perspectiveZO(mat4.create(), 58 * Math.PI / 180, renderer.aspect || 1, 0.6, fogFar * 1.1);
    const view = mat4.lookAt(mat4.create(), eye, center, up);
    const viewProj = mat4.multiply(mat4.create(), proj, view);
    const sky = state.mode === 'cylinder' ? [0.45, 0.55, 0.66] : [0.53, 0.72, 0.95];
    const light = state.mode === 'cylinder' ? up : vec3.normalize([0, 0, 0], [0.4, 1.0, 0.35]);
    renderer.setFrame({ viewProj, camPos: eye, lightDir: light, sky, fogFar });
    renderer.setSky({
      invViewProj: mat4.invert(mat4.create(), viewProj), camPos: eye,
      mode: state.mode === 'cylinder' ? 1 : 0, R: state.R, len: state.len,
      sunGlow: state.R * 0.05, sunBright: 1.4, haze: sky,
    });

    placeProps();
    const list = state.mode === 'cylinder'
      ? [M.shell, M.sun, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.dot]
      : [M.ground, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.dot];
    renderer.render(list, sky);
    requestAnimationFrame(loop);
  }

  // ── 2D plan editor ──
  const plan = ui.plan, pctx = plan.getContext('2d');
  let T = null;                       // active screen transform

  function computeTransform() {
    const c = state.course, R = state.R, refU = c.tee.u;
    const pts = [c.tee, c.pin, ...(c.hazards || [])];
    const sOf = (p) => state.mode === 'cylinder' ? R * angDiff(p.u, refU) : p.u;
    let minS = Infinity, maxS = -Infinity, minV = Infinity, maxV = -Infinity, pad = 70;
    for (const p of pts) {
      const s = sOf(p); const r = p.r || 0;
      minS = Math.min(minS, s - r); maxS = Math.max(maxS, s + r);
      minV = Math.min(minV, p.v - r); maxV = Math.max(maxV, p.v + r);
    }
    minS -= pad; maxS += pad; minV -= pad; maxV += pad;
    const sMid = (minS + maxS) / 2, vMid = (minV + maxV) / 2;
    const w = plan.width, h = plan.height;
    const scale = Math.min(w * 0.92 / (maxS - minS), h * 0.92 / (maxV - minV));
    return { cx: w / 2, cy: h / 2, scale, sMid, vMid, refU, R, mode: state.mode };
  }
  const toScreen = (t, p) => {
    const s = t.mode === 'cylinder' ? t.R * angDiff(p.u, t.refU) : p.u;
    return [t.cx + (s - t.sMid) * t.scale, t.cy - (p.v - t.vMid) * t.scale];
  };
  const toFloor = (t, px, py) => {
    const s = (px - t.cx) / t.scale + t.sMid, v = t.vMid - (py - t.cy) / t.scale;
    return { u: t.mode === 'cylinder' ? t.refU + s / t.R : s, v };
  };

  function drawPlan() {
    T = computeTransform();
    const c = state.course, w = plan.width, h = plan.height;
    pctx.clearRect(0, 0, w, h);
    pctx.fillStyle = state.mode === 'cylinder' ? '#16241c' : '#15301a';
    pctx.fillRect(0, 0, w, h);
    // hazards
    for (let i = 0; i < (c.hazards || []).length; i++) {
      const hz = c.hazards[i], [x, y] = toScreen(T, hz);
      pctx.beginPath(); pctx.arc(x, y, hz.r * T.scale, 0, Math.PI * 2);
      pctx.fillStyle = HAZARD_2D[hz.kind] || '#888'; pctx.globalAlpha = 0.6; pctx.fill(); pctx.globalAlpha = 1;
      if (i === state.sel) { pctx.strokeStyle = '#8ef0c0'; pctx.lineWidth = 2; pctx.stroke(); }
    }
    // green
    const [gx, gy] = toScreen(T, c.pin);
    pctx.beginPath(); pctx.arc(gx, gy, 24 * T.scale, 0, Math.PI * 2);
    pctx.fillStyle = '#4e9e54'; pctx.globalAlpha = 0.5; pctx.fill(); pctx.globalAlpha = 1;
    // tee→pin line
    const [tx, ty] = toScreen(T, c.tee);
    pctx.strokeStyle = 'rgba(224,192,96,0.7)'; pctx.lineWidth = 1.5; pctx.setLineDash([5, 4]);
    pctx.beginPath(); pctx.moveTo(tx, ty); pctx.lineTo(gx, gy); pctx.stroke(); pctx.setLineDash([]);
    // pin marker
    pctx.fillStyle = '#e0c060'; pctx.font = 'bold 16px ui-monospace, monospace'; pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
    pctx.fillText('⚑', gx, gy - 1);
    // tee marker
    pctx.fillStyle = '#8ef0c0';
    pctx.beginPath(); pctx.arc(tx, ty, 8, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#04110b'; pctx.font = 'bold 11px ui-monospace, monospace'; pctx.fillText('T', tx, ty);
  }

  function pickHandle(px, py) {
    const c = state.course;
    const near = (p, r = 12) => { const [x, y] = toScreen(T, p); return Math.hypot(px - x, py - y) <= r; };
    if (near(c.tee)) return { kind: 'tee' };
    if (near(c.pin)) return { kind: 'pin' };
    for (let i = (c.hazards || []).length - 1; i >= 0; i--) {
      const hz = c.hazards[i], [x, y] = toScreen(T, hz);
      if (Math.hypot(px - x, py - y) <= Math.max(12, hz.r * T.scale)) return { kind: 'haz', i };
    }
    return null;
  }

  let drag = null;
  const planXY = (e) => { const r = plan.getBoundingClientRect(); return [(e.clientX - r.left) * plan.width / r.width, (e.clientY - r.top) * plan.height / r.height]; };
  plan.addEventListener('pointerdown', (e) => {
    const [px, py] = planXY(e);
    if (state.addKind) {                       // placing a new hazard
      const f = toFloor(T, px, py);
      state.course.hazards = state.course.hazards || [];
      state.course.hazards.push({ kind: state.addKind, u: f.u, v: f.v, r: 20 });
      state.sel = state.course.hazards.length - 1;
      state.addKind = null; ui.hazButtons.forEach((b) => b.classList.remove('on'));
      showSel(); refresh(); return;
    }
    const hit = pickHandle(px, py);
    if (!hit) { state.sel = -1; showSel(); drawPlan(); return; }
    drag = { ...hit, T };
    if (hit.kind === 'haz') { state.sel = hit.i; showSel(); }
    else { state.sel = -1; showSel(); }
    plan.setPointerCapture?.(e.pointerId);
  });
  plan.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [px, py] = planXY(e);
    const f = toFloor(drag.T, px, py);
    const c = state.course;
    if (drag.kind === 'tee') { c.tee.u = f.u; c.tee.v = f.v; }
    else if (drag.kind === 'pin') { c.pin.u = f.u; c.pin.v = f.v; }
    else if (drag.kind === 'haz') { c.hazards[drag.i].u = f.u; c.hazards[drag.i].v = f.v; }
    refresh();
  });
  const endDrag = () => { drag = null; };
  plan.addEventListener('pointerup', endDrag);
  plan.addEventListener('pointercancel', endDrag);

  function showSel() {
    const on = state.sel >= 0 && state.course.hazards[state.sel];
    ui.selpanel.style.display = on ? '' : 'none';
    if (on) ui.hazr.value = String(state.course.hazards[state.sel].r | 0);
  }

  // ── controls ──
  ui.preset.addEventListener('click', () => {
    setWorld((state.presetIdx + 1) % CYLINDERS.length, state.mode);
    buildWorld(); refresh(); toast(CYLINDERS[state.presetIdx].label);
  });
  ui.mode.addEventListener('click', () => {
    setWorld(state.presetIdx, state.mode === 'cylinder' ? 'earth' : 'cylinder');
    buildWorld(); refresh();
  });
  ui.randomize.addEventListener('click', newRandom);
  ui.resetCam.addEventListener('click', () => { state.orbit = 0; });
  ui.cname.addEventListener('input', () => { state.course.name = ui.cname.value; });
  ui.crest?.addEventListener('input', () => { state.course.terrain.crest = +ui.crest.value; buildWorld(); refresh(); });
  ui.teeth?.addEventListener('input', () => { state.course.terrain.teeth = +ui.teeth.value; buildWorld(); refresh(); });
  ui.hazButtons.forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.haz;
    state.addKind = state.addKind === k ? null : k;
    ui.hazButtons.forEach((x) => x.classList.toggle('on', x === b && state.addKind));
    toast(state.addKind ? `click the plan to drop ${k}` : 'cancelled');
  }));
  ui.hazr.addEventListener('input', () => { if (state.sel >= 0) { state.course.hazards[state.sel].r = +ui.hazr.value; refresh(); } });
  ui.hazdel.addEventListener('click', () => {
    if (state.sel < 0) return;
    state.course.hazards.splice(state.sel, 1); state.sel = -1; showSel(); refresh();
  });
  ui.play.addEventListener('click', () => { location.href = 'play.html#' + shareCode(); });
  ui.share.addEventListener('click', async () => {
    const url = new URL('play.html#' + shareCode(), location.href).href;
    try { await navigator.clipboard.writeText(url); toast('share link copied ✓'); }
    catch { prompt('copy this link:', url); }
  });
  // pause the orbit while interacting with the 3D canvas (so it sits still to inspect)
  ui.canvas.addEventListener('pointerdown', () => { state.camHold = true; });
  window.addEventListener('pointerup', () => { state.camHold = false; });

  // ── boot ──
  const h = (location.hash || '').replace(/^#/, '');
  const fromHash = h && decodeCourse(h);
  if (fromHash) {
    state.presetIdx = fromHash.preset ?? 0; state.mode = fromHash.mode || 'cylinder';
    setWorld(state.presetIdx, state.mode);
    loadCourse(fromHash);
  } else {
    setWorld(0, 'cylinder');
    loadCourse(randomCourse((Math.random() * 1e9) | 0, 0, { mode: 'cylinder', R: state.R, len: state.len }));
  }
  showSel();
  await initPreview();
}

// ── instance helpers ──
function instOne(model16, tint) { const d = new Float32Array(20); d.set(model16, 0); d.set(tint, 16); return d; }
function instMany(transforms) {
  const mats = geo.instanceMatrices(transforms);
  const d = new Float32Array(transforms.length * 20);
  for (let i = 0; i < transforms.length; i++) {
    d.set(mats.subarray(i * 16, i * 16 + 16), i * 20);
    d[i * 20 + 16] = 1; d[i * 20 + 17] = 1; d[i * 20 + 18] = 1; d[i * 20 + 19] = 0;
  }
  return d;
}
