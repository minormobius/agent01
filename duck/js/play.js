// play.js — the course-play surface. Hit a golf ball across an O'Neill cylinder
// (or Earth, the control) and watch the Coriolis force bend every shot.
//
// The ball is the proven free particle of physics.js with drag + Magnus on top
// (golf.js). Three things make it read as edutainment:
//   • a free-look ORBIT camera (Minecraft-style: mouse moves the view, pointer-lock
//     on desktop, drag on touch) so you can study the curve from any angle;
//   • a live TRAJECTORY PREVIEW while you charge — two arcs, WITH and WITHOUT the
//     Coriolis term, in the same gravity, so the gap between them IS the deflection;
//   • TERRAIN grade (vendored from iris): the floor is carved into rolling humps,
//     the ball rolls downhill and putts break across the slope.

import { vec3, mat4 } from './math.js';
import { CYLINDERS, makeCylinder, cylinderForces, downDir, G0 } from './physics.js';
import { initRenderer } from './webgpu.js';
import * as geo from './geometry.js';
import * as terrain from './terrain.mjs';
import {
  BALL, CLUBS, launch, stepBall, floorToWorld, floorDistance, surfaceBasis,
  bearingTo, holed, hazardAt, randomCourse, decodeCourse,
} from './golf.js';

const DEG = Math.PI / 180;
const BALLR = BALL.radius;                       // collision radius; visual = same
const BOUNCE = 3.0;                              // descent speed above which the ball bounces
const HAZARD_COLOR = { water: [0.16, 0.42, 0.7], sand: [0.78, 0.71, 0.42], rough: [0.18, 0.36, 0.16] };

export async function start(canvas, hud) {
  const renderer = await initRenderer(canvas);

  const M = {
    ball: renderer.mesh(geo.buildBall(), 1),
    dot: renderer.mesh(geo.buildDot(), 2048),    // trail + both preview arcs + aim line
    aim: renderer.mesh(geo.buildArrow(), 1),
    flag: renderer.mesh(geo.buildFlag(), 1),
    tee: renderer.mesh(geo.buildTee(), 1),
    disc: renderer.mesh(geo.buildDisc(), 1),     // green + hazards (tinted per instance)
    trees: geo.TREE_KIT.map((m) => renderer.mesh(m, 256)),
    pylon: renderer.mesh(geo.buildPylon(), 64),
    ground: renderer.mesh(geo.buildGround(), 1),
    shell: null, sun: null,
  };

  const state = {
    course: null, mode: 'cylinder', cyl: null, R: 0, len: 0, omega: 0,
    ball: { pos: [0, 0, 0], vel: [0, 0, 0], spin: [0, 0, 0] },
    lie: { u: 0, v: 0 },
    phase: 'aim',                    // 'aim' | 'flying' | 'holed'
    club: 0, power: 0, sidespin: 0,
    charging: false,
    strokes: 0, penalty: 0,
    trail: [], settle: 0,
    // free-look camera: yaw IS the aim heading; pitch swings the gaze from the
    // fairway (down) all the way up the axis to the sun/curling sky; dist zooms
    cam: { yaw: 0, pitch: -0.1, dist: 30, eye: [0, 0, 0], center: [0, 0, 0], set: false },
    locked: false,
    time: 0, paused: false,
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const club = () => CLUBS[state.club];
  const terr = () => state.course.terrain;

  function toast(msg, kind = '') {
    const t = hud.toast; if (!t) return;
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth;
    t.className = `toast show ${kind}`;
  }

  // ── load + world ──
  function loadCourse(course) {
    state.course = course;
    if (!course.terrain) course.terrain = terrain.defaultTerrain();
    state.mode = course.mode || 'cylinder';
    state.cyl = makeCylinder(CYLINDERS[course.preset] || CYLINDERS[0]);
    state.R = state.cyl.R; state.len = state.cyl.len; state.omega = state.cyl.omega;
    buildWorld();
    state.strokes = 0; state.penalty = 0;
    state.lie = { ...course.tee };
    teeUp(); aimAtPin();
  }

  function buildWorld() {
    const t = terr();
    if (state.mode === 'cylinder') {
      const { R, len } = state.cyl;
      if (M.shell) { M.shell.vbuf.destroy(); M.shell.ibuf.destroy(); }
      if (M.sun) { M.sun.vbuf.destroy(); M.sun.ibuf.destroy(); }
      M.shell = renderer.mesh(geo.buildCylinderShell(R, len, 160, 110, (th, z) => terrain.height(t, 'cylinder', R, th, z)), 1);
      M.sun = renderer.mesh(geo.buildSunRod(len, Math.max(10, R * 0.0025)), 1);
      renderer.setInstances(M.shell, instOne(mat4.create(), [1, 1, 1, 0]));
      renderer.setInstances(M.sun, instOne(mat4.create(), [1, 1, 1, 1]));
      const s = geo.scatterCylinder(R, len);
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

  // drop scattered props (trees/pylons) onto the terrain surface so they don't
  // float over / sink under the carved floor.
  function liftTransforms(list) {
    const t = terr();
    return list.map((tr) => {
      const p = tr.pos;
      const u = state.mode === 'cylinder' ? Math.atan2(p[1], p[0]) : p[0];
      const v = p[2];
      const e = terrain.height(t, state.mode, state.R, u, v);
      const np = state.mode === 'cylinder'
        ? [Math.cos(u) * (state.R - e), Math.sin(u) * (state.R - e), v]
        : [p[0], e, p[2]];
      return { pos: np, q: tr.q, scale: tr.scale };
    });
  }

  function teeUp() {
    const e = terrain.height(terr(), state.mode, state.R, state.lie.u, state.lie.v);
    floorToWorld(state.ball.pos, state.mode, state.R, state.lie, e + BALLR);
    state.ball.vel = [0, 0, 0]; state.ball.spin = [0, 0, 0];
    state.phase = 'aim'; state.power = 0; state.charging = false;
    state.trail.length = 0; state.settle = 0; state.cam.set = false;
  }

  function aimAtPin() { state.cam.yaw = bearingTo(state.mode, state.R, state.lie, state.course.pin); }

  // ── the swing ──
  function hit() {
    if (state.phase !== 'aim') return;
    const power = clamp(state.power, 0.05, 1);
    const { vel, spin } = launch(state.mode, state.ball.pos, { club: club(), power, aim: state.cam.yaw, sidespin: state.sidespin * 60 });
    state.ball.vel = vel; state.ball.spin = spin;
    state.phase = 'flying'; state.strokes++;
    state.trail.length = 0; state.settle = 0;
    state.lieStart = { ...state.lie };
    toast(`${club().label} · ${(power * 100) | 0}%`, '');
  }

  const floorOf = (p) => state.mode === 'cylinder' ? { u: Math.atan2(p[1], p[0]), v: p[2] } : { u: p[0], v: p[2] };
  const ballFloor = () => floorOf(state.ball.pos);

  // ── one physics substep: field (golf.stepBall) + terrain contact ──
  // Shared by the live loop AND the trajectory predictor, so the preview is the
  // EXACT physics the shot will follow. Returns whether the ball is rolling.
  const _n = [0, 0, 0];
  function integrate(b, mode, dt, opts) {
    stepBall(b, mode, state.omega, dt, opts);
    return contact(b, mode, dt);
  }
  function contact(b, mode, dt) {
    const t = terr();
    let rolling = false, n = null, vn0 = 0;
    if (mode === 'cylinder') {
      const u = Math.atan2(b.pos[1], b.pos[0]), v = b.pos[2];
      const surfR = state.R - terrain.height(t, 'cylinder', state.R, u, v);
      const restR = surfR - BALLR;
      const rho = Math.hypot(b.pos[0], b.pos[1]) || 1e-9;
      if (rho >= restR) {
        const ux = b.pos[0] / rho, uy = b.pos[1] / rho;
        b.pos[0] = ux * restR; b.pos[1] = uy * restR;
        n = terrain.normalAt(_n, t, 'cylinder', state.R, u, v);
        vn0 = b.vel[0] * n[0] + b.vel[1] * n[1] + b.vel[2] * n[2];
        applyContact(b, n, vn0);
        rolling = vn0 > -BOUNCE;
      }
      b.pos[2] = clamp(b.pos[2], 1, state.len - 1);
    } else {
      const x = b.pos[0], v = b.pos[2];
      const surfY = terrain.height(t, 'earth', 0, x, v);
      const restY = surfY + BALLR;
      if (b.pos[1] <= restY) {
        b.pos[1] = restY;
        n = terrain.normalAt(_n, t, 'earth', 0, x, v);
        vn0 = vec3.dot(b.vel, n);
        applyContact(b, n, vn0);
        rolling = vn0 > -BOUNCE;
      }
    }
    if (rolling && n) groundRoll(b, n, dt);
    return rolling;
  }
  // reflect a hard landing (restitution) or strip the normal velocity for a roll
  function applyContact(b, n, vn) {
    if (vn >= 0) return;                          // moving away from the surface
    const k = (-vn > BOUNCE) ? (1 + BALL.restitution) : 1;
    b.vel[0] -= n[0] * vn * k; b.vel[1] -= n[1] * vn * k; b.vel[2] -= n[2] * vn * k;
  }
  // rolling: friction on the tangential velocity. The field (centrifugal + Coriolis
  // + the down-slope component of gravity) was already integrated by stepBall and
  // only its normal part removed, so the ball FEELS THE GRADE — it accelerates
  // downhill and Coriolis keeps breaking it. Friction just bleeds the roll off.
  function groundRoll(b, n, dt) {
    const vn = vec3.dot(b.vel, n);
    const tx = b.vel[0] - n[0] * vn, ty = b.vel[1] - n[1] * vn, tz = b.vel[2] - n[2] * vn;
    const ts = Math.hypot(tx, ty, tz);
    const fl = floorOf(b.pos);
    const onGreen = floorDistance(state.mode, state.R, fl, state.course.pin) < 26;
    const haz = hazardAt(state.mode, state.R, state.course.hazards, fl);
    let fr = onGreen ? BALL.greenFriction : BALL.rollFriction;
    if (haz && haz.kind === 'sand') fr *= 3.2;
    if (haz && haz.kind === 'rough') fr *= 1.8;
    const nts = Math.max(0, ts - fr * dt), s = ts > 1e-6 ? nts / ts : 0;
    b.vel[0] = tx * s; b.vel[1] = ty * s; b.vel[2] = tz * s;
    b.spin[0] *= 0.6; b.spin[1] *= 0.6; b.spin[2] *= 0.6;
  }

  function flightTick(dt) {
    const b = state.ball;
    const rolling = integrate(b, state.mode, dt);
    if (state.trail.length === 0 || vec3.len(vec3.sub([0, 0, 0], b.pos, state.trail[state.trail.length - 1])) > 1.4) {
      state.trail.push(vec3.clone(b.pos));
      if (state.trail.length > 600) state.trail.shift();
    }
    const speed = vec3.len(b.vel);
    if (rolling && holed(state.mode, state.R, b.pos, state.course.pin, speed)) { holeOut(); return; }
    if (rolling && speed < BALL.stopSpeed) { state.settle += dt; if (state.settle > 0.25) settle(); }
    else state.settle = 0;
  }

  function settle() {
    const haz = hazardAt(state.mode, state.R, state.course.hazards, ballFloor());
    if (haz && haz.kind === 'water') {
      state.penalty++; toast('🌊 in the water — penalty stroke', 'rough');
      state.lie = { ...(state.lieStart || state.course.tee) };
    } else {
      state.lie = ballFloor();
      if (haz && haz.kind === 'sand') toast('bunkered — short next swing', '');
    }
    teeUp(); aimAtPin();
  }

  function holeOut() {
    state.phase = 'holed';
    const total = state.strokes + state.penalty, rel = total - state.course.par;
    const name = rel <= -2 ? 'EAGLE' : rel === -1 ? 'BIRDIE' : rel === 0 ? 'PAR'
      : rel === 1 ? 'BOGEY' : rel === 2 ? 'DOUBLE BOGEY' : `+${rel}`;
    toast(`⛳ HOLED — ${total} strokes · ${name}`, 'gold');
    if (hud.again) hud.again.style.display = '';
  }

  // ── trajectory predictor (no state mutation) ──
  // Simulate the pending shot with the shared integrator. coriolis:false gives the
  // ghost arc; runs until the ball has all but stopped or the cap is hit.
  function predict(mode, opts) {
    const power = clamp(state.charging ? state.power : 0.7, 0.05, 1);
    const { vel, spin } = launch(mode, state.ball.pos, { club: club(), power, aim: state.cam.yaw, sidespin: state.sidespin * 60 });
    const b = { pos: vec3.clone(state.ball.pos), vel, spin };
    const pts = [vec3.clone(b.pos)];
    const dt = 1 / 90; let grounded = 0;
    for (let i = 0; i < 900; i++) {
      const rolling = integrate(b, mode, dt, opts);
      if (i % 2 === 0) pts.push(vec3.clone(b.pos));
      if (rolling) { grounded++; if (vec3.len(b.vel) < 1.2 && grounded > 4) break; }
    }
    return pts;
  }

  // ── camera (free-look orbit; yaw = aim) ──
  function lookDirAt(pos, yaw) {
    const { fwd, right } = surfaceBasis(state.mode, pos);
    return [fwd[0] * Math.cos(yaw) + right[0] * Math.sin(yaw),
            fwd[1] * Math.cos(yaw) + right[1] * Math.sin(yaw),
            fwd[2] * Math.cos(yaw) + right[2] * Math.sin(yaw)];
  }
  // The eye rides just above-and-behind the ball; the VIEW direction is what yaw +
  // pitch steer, so pitching up swings the gaze off the fairway and up the axis —
  // the floor curls overhead and the axial sun comes into frame. Eye stays above
  // the floor (up·camHeight) so it never dips under the grass.
  function updateCamera(dt) {
    const b = state.ball;
    const up = vec3.scale([0, 0, 0], downDir([0, 0, 0], state.mode, b.pos), -1);
    const horiz = lookDirAt(b.pos, state.cam.yaw);
    const dist = state.cam.dist, p = state.cam.pitch;
    const back = dist * 0.55, high = clamp(dist * 0.42, 4, Math.max(6, state.R * 0.45));
    const eye = [
      b.pos[0] - horiz[0] * back + up[0] * high,
      b.pos[1] - horiz[1] * back + up[1] * high,
      b.pos[2] - horiz[2] * back + up[2] * high,
    ];
    const cp = Math.cos(p), sp = Math.sin(p);
    const viewDir = [horiz[0] * cp + up[0] * sp, horiz[1] * cp + up[1] * sp, horiz[2] * cp + up[2] * sp];
    const center = [eye[0] + viewDir[0] * 50, eye[1] + viewDir[1] * 50, eye[2] + viewDir[2] * 50];
    if (!state.cam.set) { state.cam.eye = eye; state.cam.center = center; state.cam.set = true; }
    const t = Math.min(1, dt * (state.phase === 'flying' ? 6 : 12));
    vec3.lerp(state.cam.eye, state.cam.eye, eye, t);
    vec3.lerp(state.cam.center, state.cam.center, center, t);
    return up;
  }

  // ── render ──
  const _m = mat4.create();
  function draw(up) {
    renderer.resize();
    const fogFar = state.mode === 'cylinder' ? Math.min(2.2 * state.R + state.len, 26000) : 7000;
    const proj = mat4.perspectiveZO(mat4.create(), 60 * DEG, renderer.aspect || 1, 0.4, fogFar * 1.1);
    const view = mat4.lookAt(mat4.create(), state.cam.eye, state.cam.center, up);
    const viewProj = mat4.multiply(mat4.create(), proj, view);
    const sky = state.mode === 'cylinder' ? [0.45, 0.55, 0.66] : [0.53, 0.72, 0.95];
    const light = state.mode === 'cylinder'
      ? vec3.scale([0, 0, 0], downDir([0, 0, 0], 'cylinder', state.ball.pos), -1)
      : vec3.normalize([0, 0, 0], [0.4, 1.0, 0.35]);
    renderer.setFrame({ viewProj, camPos: state.cam.eye, lightDir: light, sky, fogFar });
    // ray-traced backdrop: axial sun glow + end-cap void (cylinder), sky (earth)
    renderer.setSky({
      invViewProj: mat4.invert(mat4.create(), viewProj), camPos: state.cam.eye,
      mode: state.mode === 'cylinder' ? 1 : 0, R: state.R, len: state.len,
      sunGlow: state.R * 0.05, sunBright: 1.5, haze: sky,
    });

    const bm = mat4.fromRTS(mat4.create(), [0, 0, 0, 1], state.ball.pos, [BALLR * 2, BALLR * 2, BALLR * 2]);
    renderer.setInstances(M.ball, instOne(bm, state.phase === 'holed' ? [1, 0.85, 0.3, 0.6] : [1, 1, 1, 0.12]));

    placeProps();
    drawDots();

    const list = state.mode === 'cylinder'
      ? [M.shell, M.sun, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.aim, M.dot, M.ball]
      : [M.ground, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.aim, M.dot, M.ball];
    renderer.render(list, sky);
  }

  // model matrix mapping mesh +Y onto a given normal, placed at pos, uniform scale
  function toNormal(out, n, pos, scale) {
    const f = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], f, n));
    const fwd = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], right, n));
    return geo.basisModel(out, right, n, fwd, pos, [scale, scale, scale]);
  }
  // a floor point lifted onto the terrain surface
  function onSurface(out, pt) {
    return floorToWorld(out, state.mode, state.R, pt, terrain.height(terr(), state.mode, state.R, pt.u, pt.v));
  }

  function placeProps() {
    const c = state.course;
    const teeW = onSurface([0, 0, 0], c.tee), pinW = onSurface([0, 0, 0], c.pin);
    const teeN = terrain.normalAt([0, 0, 0], terr(), state.mode, state.R, c.tee.u, c.tee.v);
    const pinN = terrain.normalAt([0, 0, 0], terr(), state.mode, state.R, c.pin.u, c.pin.v);
    renderer.setInstances(M.tee, instOne(toNormal(_m, teeN, teeW, 1.2), [1, 1, 1, 0]));
    renderer.setInstances(M.flag, instOne(toNormal(_m, pinN, pinW, 1.4), [1, 1, 1, 0]));

    const discs = [{ u: c.pin.u, v: c.pin.v, r: 24, col: [0.30, 0.62, 0.32] }]
      .concat((c.hazards || []).map((h) => ({ u: h.u, v: h.v, r: h.r, col: HAZARD_COLOR[h.kind] || [0.4, 0.4, 0.4] })));
    const data = new Float32Array(discs.length * 20);
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i];
      const e = terrain.height(terr(), state.mode, state.R, d.u, d.v);
      const w = floorToWorld([0, 0, 0], state.mode, state.R, { u: d.u, v: d.v }, e + 0.5);
      const n = terrain.normalAt([0, 0, 0], terr(), state.mode, state.R, d.u, d.v);
      toNormal(_m, n, w, d.r); data.set(_m, i * 20);
      data[i * 20 + 16] = d.col[0]; data[i * 20 + 17] = d.col[1]; data[i * 20 + 18] = d.col[2]; data[i * 20 + 19] = 0.28;
    }
    renderer.setInstances(M.disc, data);

    if (state.phase === 'aim') {
      const n = terrain.normalAt([0, 0, 0], terr(), state.mode, state.R, state.lie.u, state.lie.v);
      const look = lookDirAt(state.ball.pos, state.cam.yaw);
      const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], look, n));
      const fwd = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], n, right)); // look projected onto the slope
      const base = vec3.scaleAndAdd([0, 0, 0], state.ball.pos, n, -BALLR + 0.4);
      geo.basisModel(_m, right, n, fwd, base, [2.4, 2.4, 3 + state.power * 5]);
      renderer.setInstances(M.aim, instOne(_m, [0.95, 0.82, 0.25, 0.7]));
    } else M.aim.count = 0;
  }

  function drawDots() {
    const dots = [];
    // flight trail
    for (let i = 0; i < state.trail.length; i++) {
      const f = i / Math.max(1, state.trail.length - 1);
      dots.push({ pos: state.trail[i], s: 0.6, col: [0.45 + 0.5 * f, 0.9, 0.95 - 0.3 * f], emit: 0.85 });
    }
    // preview while aiming: the real arc + the no-Coriolis ghost (cylinder only)
    if (state.phase === 'aim') {
      const real = predict(state.mode, {});
      const dim = state.charging ? 1 : 0.6;
      for (let i = 0; i < real.length; i++) dots.push({ pos: real[i], s: 0.5, col: [1, 0.84, 0.25], emit: 0.9 * dim });
      if (state.mode === 'cylinder') {
        const ghost = predict('cylinder', { coriolis: false });
        for (let i = 0; i < ghost.length; i++) dots.push({ pos: ghost[i], s: 0.42, col: [0.5, 0.7, 1], emit: 0.7 * dim });
      }
    }
    if (!dots.length) { M.dot.count = 0; return; }
    const n = Math.min(dots.length, 2048);
    const data = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) {
      const d = dots[i];
      mat4.fromRTS(_m, [0, 0, 0, 1], d.pos, [d.s, d.s, d.s]); data.set(_m, i * 20);
      data[i * 20 + 16] = d.col[0]; data[i * 20 + 17] = d.col[1]; data[i * 20 + 18] = d.col[2]; data[i * 20 + 19] = d.emit;
    }
    renderer.setInstances(M.dot, data);
  }

  // ── HUD ──
  function updateHud() {
    const c = state.course, cyl = state.cyl, b = state.ball;
    hud.mode.textContent = state.mode === 'cylinder' ? 'O’NEILL CYLINDER (rotating frame)' : 'EARTH (uniform gravity — control)';
    hud.mode.className = 'mode ' + state.mode;
    hud.hole.textContent = `${c.name} · par ${c.par}`;
    const total = state.strokes + state.penalty;
    hud.strokes.textContent = `${state.strokes}${state.penalty ? ` (+${state.penalty} pen)` : ''} · ${total} total`;
    hud.dist.textContent = `${floorDistance(state.mode, state.R, ballFloor(), c.pin).toFixed(0)} m to pin`;
    hud.club.textContent = `${club().label} · ${(state.power * 100) | 0}%`;
    if (hud.powerBar) hud.powerBar.style.width = `${state.power * 100}%`;
    hud.aimv.textContent = `${(state.cam.yaw / DEG).toFixed(1)}°  ${state.sidespin > 0.05 ? 'draw' : state.sidespin < -0.05 ? 'fade' : ''}`;
    if (state.mode === 'cylinder') {
      const { cor } = cylinderForces(b.pos, b.vel, cyl.omega), rho = Math.hypot(b.pos[0], b.pos[1]);
      hud.glocal.textContent = `${(cyl.omega * cyl.omega * rho).toFixed(2)} m/s²  (${(cyl.omega * cyl.omega * rho / G0).toFixed(2)} g)`;
      hud.coriolis.textContent = `${vec3.len(cor).toFixed(2)} m/s²  bending the shot`;
      hud.spin.textContent = `${cyl.label} · ω ${cyl.omega.toFixed(4)} rad/s`;
      hud.coriolisRow.style.display = ''; hud.spinRow.style.display = '';
    } else {
      hud.glocal.textContent = `${G0.toFixed(2)} m/s²  (1.00 g)`;
      hud.coriolisRow.style.display = 'none'; hud.spinRow.style.display = 'none';
    }
    if (hud.reticle) hud.reticle.style.display = state.phase === 'aim' ? '' : 'none';
  }

  // ── loop (schedule first so a stray frame error never freezes the game) ──
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!state.paused) {
      state.time += dt;
      if (state.charging && state.phase === 'aim') state.power = Math.min(1, state.power + dt * 0.9);
      if (state.phase === 'flying') { const h = dt / 4; for (let i = 0; i < 4; i++) if (state.phase === 'flying') flightTick(h); }
    }
    const up = updateCamera(dt);
    draw(up); updateHud();
  }

  // ── input: free-look (pointer lock / drag) + charge-to-swing ──
  function toggleMode() {
    state.mode = state.mode === 'cylinder' ? 'earth' : 'cylinder'; state.course.mode = state.mode;
    buildWorld(); teeUp(); aimAtPin();
    toast(state.mode === 'cylinder' ? 'O’Neill cylinder' : 'Earth (control)', '');
  }
  function replay() { state.strokes = 0; state.penalty = 0; state.lie = { ...state.course.tee }; if (hud.again) hud.again.style.display = 'none'; teeUp(); aimAtPin(); }
  function selectClub(i) { state.club = (i + CLUBS.length) % CLUBS.length; if (hud.clubName) hud.clubName.textContent = club().label; }
  function startCharge() { if (state.phase === 'aim') { state.charging = true; state.power = 0; } }
  function release() { if (state.charging) { state.charging = false; hit(); } }

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === ' ') { startCharge(); return; }
    if (k === 'g') { toggleMode(); return; }
    if (k === 'r') { replay(); return; }
    if (k === 'p') { state.paused = !state.paused; last = performance.now(); return; }
    if (k === 'h') { hud.help.classList.toggle('hidden'); return; }
    if (k === '[') return selectClub(state.club - 1);
    if (k === ']') return selectClub(state.club + 1);
    if (k >= '1' && k <= '5') return selectClub(+k - 1);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ') { release(); return; } keys.delete(k); });
  setInterval(() => {
    if (state.phase !== 'aim') return;
    const a = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (a) state.cam.yaw += a * 0.7 * DEG;
    const up = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    if (up) state.cam.pitch = clamp(state.cam.pitch + up * 0.9 * DEG, -0.55, 1.5);
    const ss = (keys.has('.') ? 1 : 0) - (keys.has(',') ? 1 : 0);
    if (ss) state.sidespin = clamp(state.sidespin + ss * 0.04, -1, 1);
  }, 16);

  // pointer lock for desktop free-look; drag fallback for touch / pre-lock
  const sens = 0.0026;
  function applyLook(dx, dy) {
    state.cam.yaw += dx * sens;
    state.cam.pitch = clamp(state.cam.pitch - dy * sens, -0.55, 1.5);   // up = look at the sky
  }
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (hud.lockhint) hud.lockhint.style.display = state.locked ? 'none' : '';
  });
  document.addEventListener('mousemove', (e) => { if (state.locked) applyLook(e.movementX, e.movementY); });
  document.addEventListener('mousedown', (e) => { if (state.locked && e.button === 0) startCharge(); });
  document.addEventListener('mouseup', (e) => { if (state.locked && e.button === 0) release(); });

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && !state.locked) { canvas.requestPointerLock?.(); return; }
    drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (drag) { applyLook(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; } });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { state.cam.dist = clamp(state.cam.dist * (1 + e.deltaY * 0.0011), 8, Math.min(220, state.R * 0.6)); e.preventDefault(); }, { passive: false });

  hud.btnHit.addEventListener('pointerdown', (e) => { startCharge(); e.preventDefault?.(); });
  hud.btnHit.addEventListener('pointerup', release);
  hud.btnHit.addEventListener('pointerleave', release);
  hud.btnClubPrev?.addEventListener('click', () => selectClub(state.club - 1));
  hud.btnClubNext?.addEventListener('click', () => selectClub(state.club + 1));
  hud.btnAimL?.addEventListener('click', () => { if (state.phase === 'aim') state.cam.yaw -= 2 * DEG; });
  hud.btnAimR?.addEventListener('click', () => { if (state.phase === 'aim') state.cam.yaw += 2 * DEG; });
  hud.btnMode?.addEventListener('click', toggleMode);
  hud.btnReset?.addEventListener('click', replay);
  hud.again?.addEventListener('click', replay);

  function courseFromHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h) { const c = decodeCourse(h); if (c) return c; }
    return randomCourse((Date.now() / 1000) | 0, 0, { mode: 'cylinder', R: 8000, len: 6000 });
  }
  window.addEventListener('hashchange', () => loadCourse(courseFromHash()));
  loadCourse(courseFromHash());
  selectClub(0);
  requestAnimationFrame(frame);
  return state;
}

// ── instance helpers (20 floats = mat4 model + vec4 tint) ──
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
