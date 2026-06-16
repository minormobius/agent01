// play.js — the course-play surface. Hit a golf ball across an O'Neill cylinder
// (or Earth, the control) and watch the Coriolis force bend every shot.
//
// The ball is the proven free particle of physics.js with drag + Magnus on top
// (golf.js). The teaching beat is the AIM LINE: a straight dotted ray along your
// heading. On Earth the ball tracks it; in the cylinder Coriolis peels the flight
// off the line, and a rolling putt keeps breaking on the curved green — so you
// have to aim off the pin. Press G to replay the exact shot under the other frame.

import { vec3, quat, mat4 } from './math.js';
import { CYLINDERS, makeCylinder, cylinderForces, downDir, G0 } from './physics.js';
import { initRenderer } from './webgpu.js';
import * as geo from './geometry.js';
import {
  BALL, CLUBS, launch, stepBall, floorToWorld, floorDistance, surfaceBasis,
  bearingTo, holed, heightAboveFloor, hazardAt, randomCourse, decodeCourse, encodeCourse,
} from './golf.js';

const DEG = Math.PI / 180;
const HAZARD_COLOR = { water: [0.16, 0.42, 0.7], sand: [0.78, 0.71, 0.42], rough: [0.18, 0.36, 0.16] };

export async function start(canvas, hud) {
  const renderer = await initRenderer(canvas);

  const M = {
    ball: renderer.mesh(geo.buildBall(), 1),
    dot: renderer.mesh(geo.buildDot(), 512),     // trail + aim-line tracer
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
    lie: { u: 0, v: 0 },             // floor coord the current shot is played from
    phase: 'aim',                    // 'aim' | 'flying' | 'holed'
    aim: 0, club: 0, power: 0, sidespin: 0,
    charging: false,
    strokes: 0, penalty: 0,
    trail: [], settle: 0,
    cam: { eye: [0, 0, 0], center: [0, 0, 0], yaw: 0, pitch: 0.35, set: false },
    time: 0, paused: false,
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const club = () => CLUBS[state.club];

  function toast(msg, kind = '') {
    const t = hud.toast; if (!t) return;
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth;
    t.className = `toast show ${kind}`;
  }

  // ── load the course (from the URL hash) and build its world ──
  function loadCourse(course) {
    state.course = course;
    state.mode = course.mode || 'cylinder';
    const preset = CYLINDERS[course.preset] || CYLINDERS[0];
    state.cyl = makeCylinder(preset);
    state.R = state.cyl.R; state.len = state.cyl.len; state.omega = state.cyl.omega;
    buildWorld();
    state.strokes = 0; state.penalty = 0;
    state.lie = { ...course.tee };
    teeUp();
    aimAtPin();
  }

  function buildWorld() {
    if (state.mode === 'cylinder') {
      const { R, len } = state.cyl;
      if (M.shell) { M.shell.vbuf.destroy(); M.shell.ibuf.destroy(); }
      if (M.sun) { M.sun.vbuf.destroy(); M.sun.ibuf.destroy(); }
      M.shell = renderer.mesh(geo.buildCylinderShell(R, len), 1);
      M.sun = renderer.mesh(geo.buildSunRod(len, Math.max(10, R * 0.0025)), 1);
      renderer.setInstances(M.shell, instOne(mat4.create(), [1, 1, 1, 0]));
      renderer.setInstances(M.sun, instOne(mat4.create(), [1, 1, 1, 1]));
      const s = geo.scatterCylinder(R, len);
      s.trees.forEach((list, v) => renderer.setInstances(M.trees[v], instMany(list)));
      renderer.setInstances(M.pylon, instMany(s.pylons));
    } else {
      renderer.setInstances(M.ground, instOne(mat4.create(), [1, 1, 1, 0]));
      const s = geo.scatterEarth();
      s.trees.forEach((list, v) => renderer.setInstances(M.trees[v], instMany(list)));
      renderer.setInstances(M.pylon, instMany(s.pylons));
    }
  }

  // place the ball on its current lie, at rest
  function teeUp() {
    floorToWorld(state.ball.pos, state.mode, state.R, state.lie, BALL.radius);
    state.ball.vel = [0, 0, 0];
    state.ball.spin = [0, 0, 0];
    state.phase = 'aim'; state.power = 0; state.charging = false;
    state.trail.length = 0; state.settle = 0;
    state.cam.set = false;
  }

  // point the aim straight at the pin (a sensible default; the bend is the player's
  // problem to solve from here)
  function aimAtPin() {
    state.aim = bearingTo(state.mode, state.R, state.lie, state.course.pin);
  }

  // ── the swing ──
  function hit() {
    if (state.phase !== 'aim') return;
    const power = clamp(state.power, 0.05, 1);
    const { vel, spin } = launch(state.mode, state.ball.pos, {
      club: club(), power, aim: state.aim, sidespin: state.sidespin * 60,
    });
    state.ball.vel = vel; state.ball.spin = spin;
    state.phase = 'flying'; state.strokes++;
    state.trail.length = 0; state.settle = 0;
    state.lieStart = { ...state.lie };   // remember, for water re-drops
    toast(`${club().label} · ${(power * 100) | 0}%`, '');
  }

  // current floor coord of the ball
  function ballFloor() {
    const p = state.ball.pos;
    return state.mode === 'cylinder' ? { u: Math.atan2(p[1], p[0]), v: p[2] } : { u: p[0], v: p[2] };
  }

  // ── per-substep ball integration + ground contact ──
  // A contact descending faster than BOUNCE bounces (restitution) and stays
  // airborne; a slower contact just has its normal velocity removed and the ball
  // ROLLS (groundRoll). That split avoids the centrifugal field micro-bouncing a
  // settled ball forever, while still letting a long drive bounce and run out.
  const BOUNCE = 3.0;
  function ballStep(dt) {
    const b = state.ball;
    stepBall(b, state.mode, state.omega, dt);
    let rolling = false;
    if (state.mode === 'cylinder') {
      const rho = Math.hypot(b.pos[0], b.pos[1]) || 1e-9;
      const floorR = state.R - BALL.radius;
      if (rho >= floorR) {
        const ux = b.pos[0] / rho, uy = b.pos[1] / rho;        // outward = "down"
        b.pos[0] = ux * floorR; b.pos[1] = uy * floorR;
        const vr = b.vel[0] * ux + b.vel[1] * uy;              // descending (outward) speed
        if (vr > BOUNCE) { const k = vr * (1 + BALL.restitution); b.vel[0] -= ux * k; b.vel[1] -= uy * k; }
        else { if (vr > 0) { b.vel[0] -= ux * vr; b.vel[1] -= uy * vr; } rolling = true; }
      }
      b.pos[2] = clamp(b.pos[2], 1, state.len - 1);
    } else if (b.pos[1] <= BALL.radius) {
      b.pos[1] = BALL.radius;
      if (b.vel[1] < -BOUNCE) b.vel[1] = -b.vel[1] * BALL.restitution;
      else { if (b.vel[1] < 0) b.vel[1] = 0; rolling = true; }
    }
    if (rolling) groundRoll(b, dt);
    return rolling;
  }

  // rolling: friction on the tangential velocity; the field (incl. Coriolis) still
  // acts each substep via stepBall, so a putt BREAKS on the curved floor.
  function groundRoll(b, dt) {
    const down = downDir([0, 0, 0], state.mode, b.pos);
    const vn = vec3.dot(b.vel, down);
    const tang = [b.vel[0] - down[0] * vn, b.vel[1] - down[1] * vn, b.vel[2] - down[2] * vn];
    const ts = vec3.len(tang);
    const onGreen = floorDistance(state.mode, state.R, ballFloor(), state.course.pin) < 26;
    const haz = hazardAt(state.mode, state.R, state.course.hazards, ballFloor());
    let fr = onGreen ? BALL.greenFriction : BALL.rollFriction;
    if (haz && haz.kind === 'sand') fr *= 3.2;
    if (haz && haz.kind === 'rough') fr *= 1.8;
    const nts = Math.max(0, ts - fr * dt);
    if (ts > 1e-6) {
      const s = nts / ts;
      b.vel[0] = tang[0] * s; b.vel[1] = tang[1] * s; b.vel[2] = tang[2] * s;
    }
    b.spin[0] *= 0.6; b.spin[1] *= 0.6; b.spin[2] *= 0.6;   // ground kills spin fast
  }

  function flightTick(dt) {
    const b = state.ball;
    const grounded = ballStep(dt);
    // trail samples (cap)
    if (state.trail.length === 0 || vec3.len(vec3.sub([0, 0, 0], b.pos, state.trail[state.trail.length - 1])) > 1.4) {
      state.trail.push(vec3.clone(b.pos));
      if (state.trail.length > 480) state.trail.shift();
    }
    const speed = vec3.len(b.vel);
    // holed?
    if (grounded && holed(state.mode, state.R, b.pos, state.course.pin, speed)) { holeOut(); return; }
    // at rest?
    if (grounded && speed < BALL.stopSpeed) {
      state.settle += dt;
      if (state.settle > 0.25) settle();
    } else state.settle = 0;
  }

  function settle() {
    const haz = hazardAt(state.mode, state.R, state.course.hazards, ballFloor());
    if (haz && haz.kind === 'water') {
      state.penalty++;
      toast('🌊 in the water — penalty stroke', 'rough');
      state.lie = { ...(state.lieStart || state.course.tee) };   // re-drop from the last lie
    } else {
      state.lie = ballFloor();
      if (haz && haz.kind === 'sand') toast('bunkered — short next swing', '');
    }
    teeUp(); aimAtPin();
  }

  function holeOut() {
    state.phase = 'holed';
    const total = state.strokes + state.penalty;
    const par = state.course.par;
    const rel = total - par;
    const name = rel <= -2 ? 'EAGLE' : rel === -1 ? 'BIRDIE' : rel === 0 ? 'PAR'
      : rel === 1 ? 'BOGEY' : rel === 2 ? 'DOUBLE BOGEY' : `+${rel}`;
    toast(`⛳ HOLED — ${total} strokes · ${name}`, 'gold');
    if (hud.again) hud.again.style.display = '';
  }

  // ── camera ──
  function aimHorizDir() {
    const { up, fwd, right } = surfaceBasis(state.mode, state.ball.pos);
    const ca = Math.cos(state.aim), sa = Math.sin(state.aim);
    return { dir: [fwd[0] * ca + right[0] * sa, fwd[1] * ca + right[1] * sa, fwd[2] * ca + right[2] * sa], up };
  }

  function updateCamera(dt) {
    const b = state.ball;
    const down = downDir([0, 0, 0], state.mode, b.pos);
    const up = vec3.scale([0, 0, 0], down, -1);
    let look;
    if (state.phase === 'flying') {
      const v = vec3.len(b.vel) > 4 ? vec3.normalize([0, 0, 0], b.vel) : aimHorizDir().dir;
      look = v;
    } else {
      look = aimHorizDir().dir;     // behind the ball, down the aim line
    }
    const back = 13, high = 6, ahead = 22;
    const eye = [
      b.pos[0] - look[0] * back + up[0] * high,
      b.pos[1] - look[1] * back + up[1] * high,
      b.pos[2] - look[2] * back + up[2] * high,
    ];
    const center = [b.pos[0] + look[0] * ahead, b.pos[1] + look[1] * ahead, b.pos[2] + look[2] * ahead];
    if (!state.cam.set) { state.cam.eye = eye; state.cam.center = center; state.cam.set = true; }
    const t = Math.min(1, dt * (state.phase === 'flying' ? 5 : 8));
    vec3.lerp(state.cam.eye, state.cam.eye, eye, t);
    vec3.lerp(state.cam.center, state.cam.center, center, t);
    return up;
  }

  // ── render ──
  function draw(up) {
    renderer.resize();
    const fogFar = state.mode === 'cylinder' ? Math.min(2.2 * state.R + state.len, 26000) : 7000;
    const proj = mat4.perspectiveZO(mat4.create(), 60 * DEG, renderer.aspect || 1, 0.5, fogFar * 1.1);
    const view = mat4.lookAt(mat4.create(), state.cam.eye, state.cam.center, up);
    const viewProj = mat4.multiply(mat4.create(), proj, view);
    const sky = state.mode === 'cylinder' ? [0.45, 0.55, 0.66] : [0.53, 0.72, 0.95];
    const light = state.mode === 'cylinder'
      ? vec3.scale([0, 0, 0], downDir([0, 0, 0], 'cylinder', state.ball.pos), -1)
      : vec3.normalize([0, 0, 0], [0.4, 1.0, 0.35]);
    renderer.setFrame({ viewProj, camPos: state.cam.eye, lightDir: light, sky, fogFar });

    // ball
    const bm = mat4.fromRTS(mat4.create(), [0, 0, 0, 1], state.ball.pos, [BALL.radius, BALL.radius, BALL.radius]);
    const bt = state.phase === 'holed' ? [1, 0.85, 0.3, 0.6] : [1, 1, 1, 0.15];
    renderer.setInstances(M.ball, instOne(bm, bt));

    // tee marker, flag, green, hazards, aim
    placeProps();

    // trail + aim-line dots
    drawDots();

    const list = state.mode === 'cylinder'
      ? [M.shell, M.sun, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.aim, M.dot, M.ball]
      : [M.ground, ...M.trees, M.pylon, M.disc, M.tee, M.flag, M.aim, M.dot, M.ball];
    renderer.render(list, sky);
  }

  const _m = mat4.create();
  function placeProps() {
    // tee marker on the original tee, flag at the pin — orient +Y onto local up
    const teeW = floorToWorld([0, 0, 0], state.mode, state.R, state.course.tee, 0);
    const pinW = floorToWorld([0, 0, 0], state.mode, state.R, state.course.pin, 0);
    const teeUpDir = vec3.scale([0, 0, 0], downDir([0, 0, 0], state.mode, teeW), -1);
    const pinUpDir = vec3.scale([0, 0, 0], downDir([0, 0, 0], state.mode, pinW), -1);
    renderer.setInstances(M.tee, instOne(yToUp(_m, teeUpDir, teeW, 1), [1, 1, 1, 0]));
    renderer.setInstances(M.flag, instOne(yToUp(_m, pinUpDir, pinW, 1), [1, 1, 1, 0]));

    // discs: the green (around the pin) + each hazard. One batch, tinted per disc.
    const discs = [{ u: state.course.pin.u, v: state.course.pin.v, r: 24, col: [0.30, 0.62, 0.32] }]
      .concat((state.course.hazards || []).map((h) => ({ u: h.u, v: h.v, r: h.r, col: HAZARD_COLOR[h.kind] || [0.4, 0.4, 0.4] })));
    const data = new Float32Array(discs.length * 20);
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i];
      const w = floorToWorld([0, 0, 0], state.mode, state.R, { u: d.u, v: d.v }, -0.4); // slightly proud of the floor
      const u = vec3.scale([0, 0, 0], downDir([0, 0, 0], state.mode, w), -1);
      yToUp(_m, u, w, d.r);
      data.set(_m, i * 20);
      data[i * 20 + 16] = d.col[0]; data[i * 20 + 17] = d.col[1]; data[i * 20 + 18] = d.col[2]; data[i * 20 + 19] = 0.25;
    }
    renderer.setInstances(M.disc, data);

    // aim arrow lying flat on the floor, pointing along the aim heading
    if (state.phase === 'aim') {
      const { up, fwd, right } = surfaceBasis(state.mode, state.ball.pos);
      const ca = Math.cos(state.aim), sa = Math.sin(state.aim);
      const aimDir = [fwd[0] * ca + right[0] * sa, fwd[1] * ca + right[1] * sa, fwd[2] * ca + right[2] * sa];
      const aimRight = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], aimDir, up));
      const base = vec3.scaleAndAdd([0, 0, 0], state.ball.pos, up, -BALL.radius + 0.3);
      geo.basisModel(_m, aimRight, up, aimDir, base, [2.5, 2.5, 2.5 + state.power * 4]);
      renderer.setInstances(M.aim, instOne(_m, [0.95, 0.82, 0.25, 0.7]));
    } else { M.aim.count = 0; }
  }

  // model matrix that maps mesh +Y onto `up`, placing at pos with uniform scale
  function yToUp(out, up, pos, scale) {
    let f = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], f, up));
    const fwd = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], right, up));
    return geo.basisModel(out, right, up, fwd, pos, [scale, scale, scale]);
  }

  function drawDots() {
    const dots = [];
    // the trail (cyan→white fade)
    for (let i = 0; i < state.trail.length; i++) {
      const f = i / Math.max(1, state.trail.length - 1);
      dots.push({ pos: state.trail[i], s: 0.55, col: [0.4 + 0.5 * f, 0.85, 0.95 - 0.3 * f], emit: 0.7 });
    }
    // the straight AIM LINE while setting up — what a naive aim predicts; the shot
    // will peel off it in the cylinder. Drawn just above the floor.
    if (state.phase === 'aim') {
      const { dir, up } = aimHorizDir();
      const reach = 60 + state.power * club().speed * 6;
      const n = 26;
      for (let i = 1; i <= n; i++) {
        const d = (i / n) * reach;
        const p = vec3.scaleAndAdd([0, 0, 0], state.ball.pos, dir, d);
        // keep it riding the floor (constant height) rather than going ballistic
        const lift = floorToWorld([0, 0, 0], state.mode, state.R, ballFloorAt(p), 0.6);
        dots.push({ pos: lift, s: 0.4, col: [0.95, 0.85, 0.35], emit: 0.8 });
      }
    }
    if (!dots.length) { M.dot.count = 0; return; }
    const data = new Float32Array(dots.length * 20);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      mat4.fromRTS(_m, [0, 0, 0, 1], d.pos, [d.s, d.s, d.s]);
      data.set(_m, i * 20);
      data[i * 20 + 16] = d.col[0]; data[i * 20 + 17] = d.col[1]; data[i * 20 + 18] = d.col[2]; data[i * 20 + 19] = d.emit;
    }
    renderer.setInstances(M.dot, data);
  }
  const ballFloorAt = (p) => state.mode === 'cylinder' ? { u: Math.atan2(p[1], p[0]), v: p[2] } : { u: p[0], v: p[2] };

  // ── HUD ──
  function updateHud() {
    const c = state.course, cyl = state.cyl, b = state.ball;
    hud.mode.textContent = state.mode === 'cylinder' ? 'O’NEILL CYLINDER (rotating frame)' : 'EARTH (uniform gravity — control)';
    hud.mode.className = 'mode ' + state.mode;
    hud.hole.textContent = `${c.name} · par ${c.par}`;
    const total = state.strokes + state.penalty;
    hud.strokes.textContent = `${state.strokes}${state.penalty ? ` (+${state.penalty} pen)` : ''} · ${total} total`;
    const dist = floorDistance(state.mode, state.R, ballFloor(), c.pin);
    hud.dist.textContent = `${dist.toFixed(0)} m to pin`;
    hud.club.textContent = club().label;
    hud.power.textContent = `${(state.power * 100) | 0}%`;
    if (hud.powerBar) hud.powerBar.style.width = `${state.power * 100}%`;
    hud.aimv.textContent = `${(state.aim / DEG).toFixed(1)}°  ${state.sidespin > 0.05 ? 'draw' : state.sidespin < -0.05 ? 'fade' : ''}`;

    if (state.mode === 'cylinder') {
      const { cor } = cylinderForces(b.pos, b.vel, cyl.omega);
      const rho = Math.hypot(b.pos[0], b.pos[1]);
      hud.glocal.textContent = `${(cyl.omega * cyl.omega * rho).toFixed(2)} m/s²  (${(cyl.omega * cyl.omega * rho / G0).toFixed(2)} g)`;
      hud.coriolis.textContent = `${vec3.len(cor).toFixed(2)} m/s²  bending the shot`;
      hud.spin.textContent = `${cyl.label} · ω ${cyl.omega.toFixed(4)} rad/s`;
      hud.coriolisRow.style.display = ''; hud.spinRow.style.display = '';
    } else {
      hud.glocal.textContent = `${G0.toFixed(2)} m/s²  (1.00 g)`;
      hud.coriolisRow.style.display = 'none'; hud.spinRow.style.display = 'none';
    }
  }

  // ── loop ──
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    if (!state.paused) {
      state.time += dt;
      if (state.charging && state.phase === 'aim') state.power = Math.min(1, state.power + dt * 0.9);
      if (state.phase === 'flying') {
        const steps = 4, h = dt / steps;
        for (let i = 0; i < steps; i++) if (state.phase === 'flying') flightTick(h);
      }
    }
    const up = updateCamera(dt);
    draw(up);
    updateHud();
    requestAnimationFrame(frame);
  }

  // ── input ──
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === ' ') { if (state.phase === 'aim') { state.charging = true; state.power = 0; } return; }
    if (k === 'g') { state.mode = state.mode === 'cylinder' ? 'earth' : 'cylinder'; state.course.mode = state.mode;
      buildWorld(); teeUp(); aimAtPin(); toast(state.mode === 'cylinder' ? 'O’Neill cylinder' : 'Earth (control)', ''); return; }
    if (k === 'r') { state.strokes = 0; state.penalty = 0; state.lie = { ...state.course.tee }; if (hud.again) hud.again.style.display = 'none'; teeUp(); aimAtPin(); return; }
    if (k === 'p') { state.paused = !state.paused; last = performance.now(); return; }
    if (k === 'h') { hud.help.classList.toggle('hidden'); return; }
    if (k === '[') { selectClub(state.club - 1); return; }
    if (k === ']') { selectClub(state.club + 1); return; }
    if (k >= '1' && k <= '5') { selectClub(+k - 1); return; }
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { if (state.charging) { state.charging = false; hit(); } return; }
    keys.delete(k);
  });
  // continuous keys (aim + sidespin) ticked off a small interval so they feel smooth
  setInterval(() => {
    if (state.phase !== 'aim') return;
    const a = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (a) state.aim = clamp(state.aim + a * 0.6 * DEG, -60 * DEG, 60 * DEG);
    const ss = (keys.has('.') ? 1 : 0) - (keys.has(',') ? 1 : 0);
    if (ss) state.sidespin = clamp(state.sidespin + ss * 0.04, -1, 1);
  }, 16);

  // pointer: drag horizontally to aim; the HIT button charges + fires
  let dragX = null;
  canvas.addEventListener('pointerdown', (e) => { if (state.phase === 'aim') { dragX = e.clientX; canvas.setPointerCapture?.(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX == null || state.phase !== 'aim') return;
    const dx = (e.clientX - dragX) / canvas.clientWidth;
    state.aim = clamp(state.aim + dx * 0.9, -60 * DEG, 60 * DEG);
    dragX = e.clientX;
  });
  const endDrag = () => { dragX = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function selectClub(i) { state.club = (i + CLUBS.length) % CLUBS.length; if (hud.clubName) hud.clubName.textContent = club().label; }

  // buttons
  const startCharge = (e) => { if (state.phase === 'aim') { state.charging = true; state.power = 0; } e.preventDefault?.(); };
  const releaseCharge = () => { if (state.charging) { state.charging = false; hit(); } };
  hud.btnHit.addEventListener('pointerdown', startCharge);
  hud.btnHit.addEventListener('pointerup', releaseCharge);
  hud.btnHit.addEventListener('pointerleave', () => { if (state.charging) { state.charging = false; hit(); } });
  hud.btnClubPrev?.addEventListener('click', () => selectClub(state.club - 1));
  hud.btnClubNext?.addEventListener('click', () => selectClub(state.club + 1));
  hud.btnAimL?.addEventListener('click', () => { if (state.phase === 'aim') state.aim = clamp(state.aim - 2 * DEG, -60 * DEG, 60 * DEG); });
  hud.btnAimR?.addEventListener('click', () => { if (state.phase === 'aim') state.aim = clamp(state.aim + 2 * DEG, -60 * DEG, 60 * DEG); });
  hud.btnMode?.addEventListener('click', () => {
    state.mode = state.mode === 'cylinder' ? 'earth' : 'cylinder'; state.course.mode = state.mode;
    buildWorld(); teeUp(); aimAtPin(); toast(state.mode === 'cylinder' ? 'O’Neill cylinder' : 'Earth (control)', '');
  });
  hud.btnReset?.addEventListener('click', () => { state.strokes = 0; state.penalty = 0; state.lie = { ...state.course.tee }; if (hud.again) hud.again.style.display = 'none'; teeUp(); aimAtPin(); });
  hud.again?.addEventListener('click', () => { hud.again.style.display = 'none'; state.strokes = 0; state.penalty = 0; state.lie = { ...state.course.tee }; teeUp(); aimAtPin(); });

  // ── boot: course from the hash, else a procedural default ──
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

// ── instance-data helpers (20 floats = mat4 model + vec4 tint) ──
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
