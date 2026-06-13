// game.js — the duck flight sim. Wires the renderer, the two-frame physics, an
// arcade flight model, a chase camera, breadcrumbs, and the HUD.
//
// The duck's AERODYNAMICS (thrust, lift, drag, banking) are identical in both
// modes. Only the BODY force differs — uniform gravity on Earth, centrifugal +
// Coriolis in the cylinder's co-rotating frame (physics.js). So the same bird
// flies measurably differently, and breadcrumbs (pure ballistic, no wings) show
// the frame's fingerprint: straight fall on Earth, a Coriolis-bent arc in spin.

import { vec3, quat, mat4 } from './math.js';
import {
  CYLINDERS, makeCylinder, earthAccel, cylinderAccel, cylinderForces,
  downDir, stepFreeParticle, G0,
} from './physics.js';
import { initRenderer } from './webgpu.js';
import * as geo from './geometry.js';
import { generateCourse, crossedGate } from './course.js';

const TAU = Math.PI * 2;

// ── flight tuning (mass = 1; accelerations in m/s²) ──
const FLIGHT = {
  thrustMax: 62, dragK: 0.008, liftK: 0.0065, liftCap: 3.2 * G0,
  pitchRate: 1.15, rollRate: 2.1, yawRate: 0.7, grip: 1.4, duckScale: 1.5,
};
const CRUMB = { interval: 0.05, life: 12, max: 700 };
// Touch / pointer flight: a tap is a wingbeat (impulse along forward + body-up),
// and where you tap relative to screen centre steers (above = nose up, right =
// bank right). Holding keeps flapping so you can sustain a climb on a phone.
const FLAP = { fwd: 9, up: 8, interval: 0.34, deadzone: 0.12 };

export async function start(canvas, hud) {
  const renderer = await initRenderer(canvas);

  // static meshes (shared)
  const M = {
    duck: renderer.mesh(geo.buildDuck(), 1),
    crumb: renderer.mesh(geo.buildCrumb(), CRUMB.max),
    tree: renderer.mesh(geo.buildTree(), 400),
    pylon: renderer.mesh(geo.buildPylon(), 64),
    ground: renderer.mesh(geo.buildGround(), 1),
    ring: renderer.mesh(geo.buildRing(), 16),  // course gates + landing pad
    sun: null,        // built per cylinder
    shell: null,      // built per cylinder
  };

  const state = {
    mode: 'earth',
    cylIdx: 0,
    cyl: makeCylinder(CYLINDERS[0]),
    duck: { pos: [0, 220, 0], vel: [0, 0, -55], q: quat.create(), throttle: 0.6 },
    crumbs: [],
    crumbTimer: 0,
    keys: new Set(),
    pointer: { active: false, nx: 0, ny: 0, flaps: 0, flapTimer: 0 },
    crumbHold: false,
    cam: { eye: [0, 230, 30], center: [0, 220, 0] },
    course: null, courseSeed: 1,        // { gates, pad, idx, done, t0, finishT, pulse }
    onGround: false,                     // landing-event edge detector
    paused: false,
    time: 0,
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const worldScale = () => (state.mode === 'cylinder' ? Math.max(1, state.cyl.R / 320) ** 0.35 : 1);

  function toast(msg, kind = '') {
    const t = hud.toast; if (!t) return;
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth;
    t.className = `toast show ${kind}`;
  }

  // ── world (re)build ──
  function buildWorld() {
    if (state.mode === 'cylinder') {
      const { R, len } = state.cyl;
      if (M.shell) { M.shell.vbuf.destroy(); M.shell.ibuf.destroy(); }
      if (M.sun) { M.sun.vbuf.destroy(); M.sun.ibuf.destroy(); }
      M.shell = renderer.mesh(geo.buildCylinderShell(R, len), 1);
      M.sun = renderer.mesh(geo.buildSunRod(len, Math.max(10, R * 0.0025)), 1);
      renderer.setInstances(M.shell, instOne(I(), [1, 1, 1, 0]));
      renderer.setInstances(M.sun, instOne(I(), [1, 1, 1, 1]));
      const s = geo.scatterCylinder(R, len);
      renderer.setInstances(M.tree, instMany(s.trees));
      renderer.setInstances(M.pylon, instMany(s.pylons));
    } else {
      renderer.setInstances(M.ground, instOne(I(), [1, 1, 1, 0]));
      const s = geo.scatterEarth();
      renderer.setInstances(M.tree, instMany(s.trees));
      renderer.setInstances(M.pylon, instMany(s.pylons));
    }
    resetDuck();
  }

  function makeCourse() {
    const { R, len } = state.cyl;
    const c = generateCourse({ mode: state.mode, R, len, seed: state.courseSeed, scale: worldScale() });
    state.course = { ...c, idx: 0, done: false, t0: state.time, finishT: 0 };
    state.onGround = false;
  }

  function resetDuck() {
    const d = state.duck;
    quat.identity(d.q); d.throttle = 0.6; d.vel = [0, 0, -55];
    state.crumbs.length = 0;
    if (state.mode === 'cylinder') {
      const { R, len } = state.cyl;
      d.pos = [0, -(R - 60), len * 0.3];     // 60 m above the "bottom" floor → down ≈ −Y
    } else {
      d.pos = [0, 240, 0];
    }
    makeCourse();
  }

  // ── per-frame physics ──
  function flightStep(dt) {
    const d = state.duck, k = state.keys, pt = state.pointer;
    // controls → orientation (keyboard is ±1; pointer/touch adds continuous steer)
    let pitch = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let roll = (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0);
    const yaw = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (pt.active) {
      const dz = FLAP.deadzone;
      const axis = (n) => (Math.abs(n) < dz ? 0 : (n - Math.sign(n) * dz) / (1 - dz));
      pitch += -axis(clamp(pt.ny, -1, 1));   // tap above centre → nose up
      roll += -axis(clamp(pt.nx, -1, 1));    // tap right of centre → bank right
      // hold to keep flapping
      pt.flapTimer -= dt;
      if (pt.flapTimer <= 0) { pt.flaps++; pt.flapTimer = FLAP.interval; }
    }
    pitch = clamp(pitch, -1, 1); roll = clamp(roll, -1, 1);
    if (pitch) quat.rotateLocal(d.q, d.q, [1, 0, 0], pitch * FLIGHT.pitchRate * dt);
    if (roll) quat.rotateLocal(d.q, d.q, [0, 0, 1], roll * FLIGHT.rollRate * dt);
    if (yaw) quat.rotateLocal(d.q, d.q, [0, 1, 0], yaw * FLIGHT.yawRate * dt);
    if (k.has('shift')) d.throttle = Math.min(1, d.throttle + 0.6 * dt);
    if (k.has('control')) d.throttle = Math.max(0, d.throttle - 0.6 * dt);

    const fwd = vec3.transformQuat([0, 0, 0], [0, 0, -1], d.q);
    const up = vec3.transformQuat([0, 0, 0], [0, 1, 0], d.q);
    // wingbeats: each queued flap is an impulse forward + along body-up
    if (pt.flaps > 0) {
      const n = Math.min(pt.flaps, 3);
      vec3.scaleAndAdd(d.vel, d.vel, fwd, FLAP.fwd * n);
      vec3.scaleAndAdd(d.vel, d.vel, up, FLAP.up * n);
      pt.flaps = 0;
    }
    const speed = vec3.len(d.vel);

    // aerodynamic acceleration
    const a = [0, 0, 0];
    vec3.scaleAndAdd(a, a, fwd, d.throttle * FLIGHT.thrustMax);          // thrust
    vec3.scaleAndAdd(a, a, d.vel, -FLIGHT.dragK * speed);                // quadratic drag
    const lift = Math.min(FLIGHT.liftK * speed * speed, FLIGHT.liftCap); // lift along body-up
    vec3.scaleAndAdd(a, a, up, lift);

    // body force of the active frame
    const body = [0, 0, 0];
    if (state.mode === 'cylinder') cylinderAccel(body, d.pos, d.vel, state.cyl.omega);
    else earthAccel(body);
    vec3.add(a, a, body);

    // integrate
    vec3.scaleAndAdd(d.vel, d.vel, a, dt);
    // "grip": steer velocity toward facing so the duck flies, not skids
    const grip = Math.min(FLIGHT.grip * dt, 1);
    const want = vec3.scale([0, 0, 0], fwd, speed);
    vec3.lerp(d.vel, d.vel, want, grip);
    const prev = vec3.clone(d.pos);
    vec3.scaleAndAdd(d.pos, d.pos, d.vel, dt);

    courseStep(prev, d.pos);
    collide(d, up);
    spawnCrumbs(dt);
  }

  // returns { contact, vDown, vHoriz } so landing can be graded on the impact
  function collide(d, up) {
    let contact = false, vDown = 0, vHoriz = 0;
    if (state.mode === 'cylinder') {
      const { R, len } = state.cyl;
      const rho = Math.hypot(d.pos[0], d.pos[1]);
      const floorR = R - 1.6;
      if (rho > floorR) {
        const ux = d.pos[0] / rho, uy = d.pos[1] / rho;
        const vr = d.vel[0] * ux + d.vel[1] * uy;        // outward (descent) speed
        contact = true; vDown = Math.max(0, vr);
        vHoriz = Math.sqrt(Math.max(0, vec3.dot(d.vel, d.vel) - vr * vr));
        d.pos[0] = ux * floorR; d.pos[1] = uy * floorR;
        if (vr > 0) { d.vel[0] -= ux * vr * 1.3; d.vel[1] -= uy * vr * 1.3; }
      }
      const core = Math.max(14, R * 0.004);
      if (rho < core && rho > 0) { const ux = d.pos[0] / rho, uy = d.pos[1] / rho; d.pos[0] = ux * core; d.pos[1] = uy * core; }
      if (d.pos[2] < 8) { d.pos[2] = 8; if (d.vel[2] < 0) d.vel[2] *= -0.4; }
      if (d.pos[2] > len - 8) { d.pos[2] = len - 8; if (d.vel[2] > 0) d.vel[2] *= -0.4; }
    } else if (d.pos[1] < 1.6) {
      contact = true; vDown = Math.max(0, -d.vel[1]); vHoriz = Math.hypot(d.vel[0], d.vel[2]);
      d.pos[1] = 1.6;
      if (d.vel[1] < 0) { d.vel[1] *= -0.25; d.vel[0] *= 0.96; d.vel[2] *= 0.96; }
    }
    landingEdge(contact, vDown, vHoriz, up, d);
  }

  // fire a graded landing message on the airborne→ground transition only
  function landingEdge(contact, vDown, vHoriz, up, d) {
    if (contact && !state.onGround) {
      const down = downDir([0, 0, 0], state.mode, d.pos);
      const level = -(up[0] * down[0] + up[1] * down[1] + up[2] * down[2]) > 0.82;
      const pad = state.course && state.course.pad;
      const onPad = pad && vec3.len(vec3.sub([0, 0, 0], d.pos, pad.pos)) < pad.r;
      let kind, msg;
      if (vDown < 4 && vHoriz < 22 && level) { kind = 'good'; msg = '🦆 smooth landing'; }
      else if (vDown < 9 && level) { kind = ''; msg = '🦆 bumpy landing'; }
      else { kind = 'rough'; msg = '💥 rough touchdown'; }
      msg += `  ·  ${vDown.toFixed(1)} m/s down`;
      if (onPad) { msg += '  —  ON THE PAD ✓'; kind = 'gold'; }
      toast(msg, kind);
    }
    state.onGround = contact && vHoriz < 30;   // stay grounded while slow; lift-off rearms the edge
  }

  function courseStep(prev, cur) {
    const c = state.course;
    if (!c || c.done || c.idx >= c.gates.length) return;
    if (crossedGate(prev, cur, c.gates[c.idx])) {
      c.idx++;
      if (c.idx >= c.gates.length) {
        c.done = true; c.finishT = state.time - c.t0;
        toast(`COURSE CLEAR · ${c.finishT.toFixed(1)} s — now land on the pad`, 'gold');
      } else {
        toast(`gate ${c.idx}/${c.gates.length} ✓`, 'good');
      }
    }
  }

  function spawnCrumbs(dt) {
    if (!state.keys.has(' ') && !state.crumbHold) { state.crumbTimer = 0; return; }
    state.crumbTimer -= dt;
    if (state.crumbTimer <= 0) {
      state.crumbTimer = CRUMB.interval;
      state.crumbs.push({ pos: vec3.clone(state.duck.pos), vel: vec3.clone(state.duck.vel), age: 0, rest: false });
      if (state.crumbs.length > CRUMB.max) state.crumbs.shift();
    }
  }

  function stepCrumbs(dt) {
    const { omega, R, len } = state.cyl;
    for (const c of state.crumbs) {
      c.age += dt;
      if (c.rest) continue;
      stepFreeParticle(c, state.mode, omega, dt, 0.015);
      if (state.mode === 'cylinder') {
        const rho = Math.hypot(c.pos[0], c.pos[1]);
        if (rho > R - 1) { const u = (R - 1) / rho; c.pos[0] *= u; c.pos[1] *= u; c.rest = true; }
        if (c.pos[2] < 1 || c.pos[2] > len - 1) c.rest = true;
      } else if (c.pos[1] < 0.6) { c.pos[1] = 0.6; c.rest = true; }
    }
    state.crumbs = state.crumbs.filter((c) => c.age < CRUMB.life);
  }

  // ── camera ──
  function updateCamera(dt) {
    const d = state.duck;
    const down = downDir([0, 0, 0], state.mode, d.pos);
    const up = vec3.scale([0, 0, 0], down, -1);
    const fwd = vec3.transformQuat([0, 0, 0], [0, 0, -1], d.q);
    const scale = worldScale();
    const back = 9 * scale, high = 3.2 * scale, ahead = 7 * scale;
    const eye = [
      d.pos[0] - fwd[0] * back + up[0] * high,
      d.pos[1] - fwd[1] * back + up[1] * high,
      d.pos[2] - fwd[2] * back + up[2] * high,
    ];
    const center = vec3.scaleAndAdd([0, 0, 0], d.pos, fwd, ahead);
    const t = Math.min(1, dt * 7);
    vec3.lerp(state.cam.eye, state.cam.eye, eye, t);
    vec3.lerp(state.cam.center, state.cam.center, center, t);
    return up;
  }

  // ── render assembly ──
  function draw(up) {
    const d = state.duck;
    renderer.resize();
    const fogFar = state.mode === 'cylinder'
      ? Math.min(2.2 * state.cyl.R + state.cyl.len, 26000)
      : 7000;
    const proj = mat4.perspectiveZO(mat4.create(), (62 * Math.PI) / 180, renderer.aspect || 1, 0.8, fogFar * 1.1);
    const view = mat4.lookAt(mat4.create(), state.cam.eye, state.cam.center, up);
    const viewProj = mat4.multiply(mat4.create(), proj, view);

    const sky = state.mode === 'cylinder' ? [0.45, 0.55, 0.66] : [0.53, 0.72, 0.95];
    const light = state.mode === 'cylinder'
      ? vec3.scale([0, 0, 0], downDir([0, 0, 0], 'cylinder', d.pos), -1) // from the axis
      : vec3.normalize([0, 0, 0], [0.4, 1.0, 0.35]);
    renderer.setFrame({ viewProj, camPos: state.cam.eye, lightDir: light, sky, fogFar });

    // duck instance
    const dm = mat4.fromRTS(mat4.create(), d.q, d.pos, [FLIGHT.duckScale, FLIGHT.duckScale, FLIGHT.duckScale]);
    renderer.setInstances(M.duck, instOne(dm, [1, 1, 1, 0]));

    // crumbs instance
    if (state.crumbs.length) {
      const data = new Float32Array(state.crumbs.length * 20);
      const m = mat4.create();
      for (let i = 0; i < state.crumbs.length; i++) {
        const c = state.crumbs[i];
        const fade = 1 - c.age / CRUMB.life;
        mat4.fromRTS(m, [0, 0, 0, 1], c.pos, [0.9, 0.9, 0.9]);
        data.set(m, i * 20);
        data[i * 20 + 16] = 1.0; data[i * 20 + 17] = 0.5 + 0.4 * fade; data[i * 20 + 18] = 0.12;
        data[i * 20 + 19] = 0.55 + 0.35 * fade; // emissive so the trail glows
      }
      renderer.setInstances(M.crumb, data);
    } else { M.crumb.count = 0; }

    // course gates + landing pad
    renderer.setInstances(M.ring, courseInstances());

    const list = state.mode === 'cylinder'
      ? [M.shell, M.sun, M.tree, M.pylon, M.ring, M.crumb, M.duck]
      : [M.ground, M.tree, M.pylon, M.ring, M.crumb, M.duck];
    renderer.render(list, sky);
  }

  // gate + pad instances (≤13), tinted by status; the next gate glows + pulses
  const _ring = mat4.create(), _q = [0, 0, 0, 1];
  function courseInstances() {
    const c = state.course;
    if (!c) { M.ring.count = 0; return new Float32Array(0); }
    const g = c.gates, data = new Float32Array((g.length + 1) * 20);
    const pulse = 1 + 0.08 * Math.sin(state.time * 5);
    for (let i = 0; i < g.length; i++) {
      quat.fromTo(_q, [0, 0, 1], g[i].fwd);
      let col, emit, sc = g[i].r;
      if (i < c.idx) { col = [0.3, 0.9, 0.45]; emit = 0.35; }           // cleared
      else if (i === c.idx) { col = [1, 0.82, 0.2]; emit = 1; sc *= pulse; } // next
      else { col = [0.4, 0.78, 1]; emit = 0.55; }                       // upcoming
      mat4.fromRTS(_ring, _q, g[i].pos, [sc, sc, sc]);
      data.set(_ring, i * 20);
      data[i * 20 + 16] = col[0]; data[i * 20 + 17] = col[1]; data[i * 20 + 18] = col[2]; data[i * 20 + 19] = emit;
    }
    const p = c.pad, o = g.length * 20;
    quat.fromTo(_q, [0, 0, 1], p.up);
    mat4.fromRTS(_ring, _q, p.pos, [p.r, p.r, p.r]);
    data.set(_ring, o);
    const lit = c.done ? 1 : 0.5, pc = c.done ? [1, 0.85, 0.3] : [0.55, 0.7, 0.85];
    data[o + 16] = pc[0]; data[o + 17] = pc[1]; data[o + 18] = pc[2]; data[o + 19] = lit;
    return data;
  }

  // ── HUD ──
  function updateHud() {
    const d = state.duck, c = state.cyl;
    const speed = vec3.len(d.vel);
    hud.mode.textContent = state.mode === 'cylinder' ? 'O’NEILL CYLINDER (rotating frame)' : 'EARTH (uniform gravity)';
    hud.mode.className = 'mode ' + state.mode;
    hud.speed.textContent = `${speed.toFixed(1)} m/s · ${(speed * 3.6).toFixed(0)} km/h`;
    hud.throttle.textContent = `${(d.throttle * 100).toFixed(0)}%`;

    // course progress + a bearing to the next gate
    const co = state.course;
    if (co && hud.course) {
      if (co.done) {
        hud.course.textContent = `✓ clear · ${co.finishT.toFixed(1)} s · land on the pad`;
      } else {
        const g = co.gates[co.idx];
        const to = vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], g.pos, d.pos));
        const dist = vec3.len(vec3.sub([0, 0, 0], g.pos, d.pos));
        const fwd = vec3.transformQuat([0, 0, 0], [0, 0, -1], d.q);
        const right = vec3.transformQuat([0, 0, 0], [1, 0, 0], d.q);
        const upv = vec3.transformQuat([0, 0, 0], [0, 1, 0], d.q);
        const ah = vec3.dot(to, fwd), lr = vec3.dot(to, right), ud = vec3.dot(to, upv);
        let arrow = ah < -0.1 ? '↺ turn around' : ah > 0.9 ? '▲ dead ahead'
          : `${lr > 0.12 ? '▶' : lr < -0.12 ? '◀' : ''}${ud > 0.12 ? '▲' : ud < -0.12 ? '▼' : ''}` || '•';
        hud.course.textContent = `gate ${co.idx + 1}/${co.gates.length} · ${dist.toFixed(0)} m  ${arrow}`;
      }
    }

    if (state.mode === 'cylinder') {
      const rho = Math.hypot(d.pos[0], d.pos[1]);
      const alt = c.R - rho;
      const gLocal = c.omega * c.omega * rho;
      const { cor } = cylinderForces(d.pos, d.vel, c.omega);
      const corMag = vec3.len(cor);
      // spinward tendency: tangential (spin) component of velocity
      const tang = (-d.pos[1] * d.vel[0] + d.pos[0] * d.vel[1]) / (rho || 1);
      hud.preset.textContent = c.label;
      hud.alt.textContent = `${alt.toFixed(0)} m above floor  ·  r = ${rho.toFixed(0)} m`;
      hud.glocal.textContent = `${gLocal.toFixed(2)} m/s²  (${(gLocal / G0).toFixed(2)} g)`;
      hud.coriolis.textContent = `${corMag.toFixed(2)} m/s²  ${tang > 0.5 ? '↻ flying spinward — heavier' : tang < -0.5 ? '↺ flying antispinward — lighter' : '·'}`;
      hud.ship.textContent = `ω ${c.omega.toFixed(4)} rad/s · rim ${(c.rimSpeed).toFixed(0)} m/s · spin ${(c.spinPeriod).toFixed(0)} s/rev`;
      hud.shipRow.style.display = '';
      hud.coriolisRow.style.display = '';
    } else {
      hud.preset.textContent = 'sea level';
      hud.alt.textContent = `${d.pos[1].toFixed(0)} m altitude`;
      hud.glocal.textContent = `${G0.toFixed(2)} m/s²  (1.00 g)`;
      hud.shipRow.style.display = 'none';
      hud.coriolisRow.style.display = 'none';
    }
  }

  // ── loop ──
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    if (!state.paused) {
      state.time += dt;
      // substep physics for stability at high speed
      const steps = 2; const h = dt / steps;
      for (let i = 0; i < steps; i++) { flightStep(h); stepCrumbs(h); }
    }
    const up = updateCamera(dt);
    draw(up);
    updateHud();
    requestAnimationFrame(frame);
  }

  // ── input ──
  const norm = (e) => {
    let k = e.key.toLowerCase();
    if (k === 'control') k = 'control';
    return k;
  };
  window.addEventListener('keydown', (e) => {
    const k = norm(e);
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === 'g') { state.mode = state.mode === 'earth' ? 'cylinder' : 'earth'; buildWorld(); return; }
    if (k === 'c') { state.cylIdx = (state.cylIdx + 1) % CYLINDERS.length; state.cyl = makeCylinder(CYLINDERS[state.cylIdx]); state.mode = 'cylinder'; buildWorld(); return; }
    if (k === 'r') { resetDuck(); return; }
    if (k === 'n') { state.courseSeed = (state.courseSeed + 1) >>> 0; makeCourse(); toast('new course', 'good'); return; }
    if (k === 'p') { state.paused = !state.paused; last = performance.now(); return; }
    if (k === 'h') { hud.help.classList.toggle('hidden'); return; }
    state.keys.add(k);
  });
  window.addEventListener('keyup', (e) => state.keys.delete(norm(e)));
  window.addEventListener('blur', () => { state.keys.clear(); endPointer(); });

  // ── pointer / touch flight: tap = flap, tap position = steer ──
  const pt = state.pointer;
  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pt.nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pt.ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    if (hud.tapdot) {
      hud.tapdot.style.left = `${e.clientX}px`;
      hud.tapdot.style.top = `${e.clientY}px`;
    }
  }
  function endPointer() {
    pt.active = false; pt.flaps = 0; pt.flapTimer = 0;
    document.body.classList.remove('flying');
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    pt.active = true; setPointer(e);
    pt.flaps++; pt.flapTimer = FLAP.interval;        // an immediate wingbeat on tap
    document.body.classList.add('flying');
    if (hud.tapdot) { hud.tapdot.classList.remove('ping'); void hud.tapdot.offsetWidth; hud.tapdot.classList.add('ping'); }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => { if (pt.active) setPointer(e); });
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (pt.active && e.pointerType !== 'touch') endPointer(); });

  // buttons (mode / preset / reset are taps; breadcrumbs is hold-to-drop)
  const cycleMode = () => { state.mode = state.mode === 'earth' ? 'cylinder' : 'earth'; buildWorld(); };
  const cyclePreset = () => { state.cylIdx = (state.cylIdx + 1) % CYLINDERS.length; state.cyl = makeCylinder(CYLINDERS[state.cylIdx]); state.mode = 'cylinder'; buildWorld(); };
  hud.btnMode.addEventListener('click', cycleMode);
  hud.btnPreset.addEventListener('click', cyclePreset);
  hud.btnReset.addEventListener('click', () => resetDuck());
  if (hud.btnCrumb) {
    const on = (e) => { state.crumbHold = true; e.preventDefault(); };
    const off = () => { state.crumbHold = false; };
    hud.btnCrumb.addEventListener('pointerdown', on);
    hud.btnCrumb.addEventListener('pointerup', off);
    hud.btnCrumb.addEventListener('pointerleave', off);
    hud.btnCrumb.addEventListener('pointercancel', off);
  }

  buildWorld();
  requestAnimationFrame(frame);
  return state;
}

// ── instance-data helpers (20 floats = mat4 model + vec4 tint) ──
function I() { return mat4.create(); }
function instOne(model16, tint) {
  const d = new Float32Array(20); d.set(model16, 0); d.set(tint, 16); return d;
}
function instMany(transforms) {
  const mats = geo.instanceMatrices(transforms);
  const d = new Float32Array(transforms.length * 20);
  for (let i = 0; i < transforms.length; i++) {
    d.set(mats.subarray(i * 16, i * 16 + 16), i * 20);
    d[i * 20 + 16] = 1; d[i * 20 + 17] = 1; d[i * 20 + 18] = 1; d[i * 20 + 19] = 0;
  }
  return d;
}
