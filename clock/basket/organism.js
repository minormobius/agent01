// Basket Star (Gorgonocephalus) — a furling fractal crown. A flattened central
// disk sprouts `arms` primary arms; each arm curls and bifurcates into `children`
// in an ALTERNATING plane, recursing `depth` times. Rebuilt every frame as beads
// + tubes; coupled by a shared flow field, Kuramoto arm phases, and the
// fluoddity brain. This is the engine's reference organism.
import { TAU, norm, cross, rot, mix } from '../lib/vec.js';
import { brainCenters, brainEval } from '../lib/brain.js';
import { trailEnsure, trailSample, trailDeposit } from '../lib/trail.js';
import { buildFlow } from '../lib/flow.js';
import { GROUPS, DEFAULTS } from '../lib/engine.js';

export const meta = { shot: 'basket-star' };

export const defaults = {
  ...DEFAULTS.motion, ...DEFAULTS.flow, ...DEFAULTS.brain, ...DEFAULTS.view,
  arms: 5, depth: 5, children: 2, branchLen: 0.95, splay: 0.62, lenFall: 0.74,
  thickness: 0.045, stiffness: 0.4, writhe: 0.6, writheSpeed: 1.4, couple: 0.8,
};

export const sliders = [
  ...GROUPS.motion,
  { key: 'arms', label: 'arms', min: 3, max: 8, step: 1 },
  { key: 'depth', label: 'branch depth', min: 2, max: 7, step: 1 },
  { key: 'children', label: 'child branches', min: 1, max: 4, step: 1 },
  { key: 'branchLen', label: 'branch length', min: 0.4, max: 1.6, step: 0.01 },
  { key: 'splay', label: 'fork splay', min: 0.2, max: 1.8, step: 0.01 },
  { key: 'lenFall', label: 'child shrink', min: 0.5, max: 0.9, step: 0.01 },
  { key: 'thickness', label: 'thickness', min: 0.015, max: 0.09, step: 0.002 },
  { key: 'stiffness', label: 'nodal stiffness', min: 0, max: 1, step: 0.02 },
  { key: 'writhe', label: 'writhe', min: 0, max: 1.6, step: 0.02 },
  { key: 'writheSpeed', label: 'writhe speed', min: 0, max: 3.5, step: 0.02 },
  ...GROUPS.flow,
  { key: 'couple', label: 'arm coupling', min: 0, max: 2.0, step: 0.02 },
  ...GROUPS.brain,
  ...GROUPS.view,
];

// Kuramoto-coupled arm oscillators: each arm nudges its two ring neighbours.
// couple=0 → independent; turn it up → arms synchronise into travelling waves.
export function tick(ctx, dt) {
  const p = ctx.params, st = ctx.state;
  const arms = Math.round(p.arms);
  let A = st.armPhase, O = st.armOmega;
  if (!A || A.length !== arms) {
    const old = A || [];
    A = new Array(arms); O = new Array(arms);
    for (let a = 0; a < arms; a++) {
      A[a] = old[a] ?? (a * 1.7);
      O[a] = 1 + 0.35 * ((arms > 1 ? a / (arms - 1) : 0) - 0.5); // detune ±17%
    }
    st.armPhase = A; st.armOmega = O;
  }
  if (ctx.rt.paused) return;
  const K = p.couple, base = p.writheSpeed;
  const np = new Array(arms);
  for (let a = 0; a < arms; a++) {
    const L = A[(a - 1 + arms) % arms], R = A[(a + 1) % arms];
    const d = base * O[a] + K * (Math.sin(L - A[a]) + Math.sin(R - A[a]));
    np[a] = A[a] + d * dt;
  }
  for (let a = 0; a < arms; a++) A[a] = np[a];
}

export function build(em, ctx, time) {
  const p = ctx.params, st = ctx.state;
  const th0 = p.thickness;
  const bodyR = th0 * 3.4 + 0.16;
  em.push([0, 0, 0], [bodyR, bodyR * 0.5, bodyR], 0.02);          // central disk
  const arms = Math.round(p.arms);
  const maxD = Math.round(p.depth);
  const furl = ctx.rt.furl;
  const segs = 6;
  const curlOpen = 0.45 * Math.PI;
  const curlClosed = 2.7 * Math.PI;

  const flowAmt = p.flow;
  const flowAt = buildFlow(p, time);

  const brainOn = p.brain > 0;
  let BC = null;
  if (brainOn) { trailEnsure(); BC = brainCenters(p.brainSeed); }
  const LAT = 0.06; // brain lateral output → per-segment turn (radians)
  const art = mix(2.0, 0.3, p.stiffness); // nodal stiffness → joint freedom
  const nc = Math.max(1, Math.round(p.children));

  const A = st.armPhase || [];
  const stack = [];
  for (let a = 0; a < arms; a++) {
    const ang = a / arms * TAU + 0.0;
    const T = norm([Math.cos(ang), 0.5, Math.sin(ang)]);
    const B = norm(cross(T, [0, 1, 0]));
    const N = norm(cross(B, T));
    const base = [Math.cos(ang) * bodyR * 0.82, 0.02, Math.sin(ang) * bodyR * 0.82];
    stack.push({ p: base, t: T, n: N, b: B, len: p.branchLen, rad: th0, gen: 0, phase: A[a] ?? (a * 1.7) });
  }

  while (stack.length) {
    const br = stack.pop();
    let pos = br.p, t = br.t, nn = br.n, b = br.b;
    const seg = br.len / segs;
    const curlTotal = mix(curlOpen, curlClosed, furl) * (1 - 0.12 * br.gen);
    const ctBase = br.gen / (maxD + 1);

    if (br.gen === 0) em.pushLink([0, 0.02, 0], br.p, bodyR * 0.5, br.rad, 0.03);

    let prevP = null, prevR = 0;
    const TUBE = 0.82;
    for (let i = 0; i < segs; i++) {
      const u = i / segs;
      const r = br.rad * (1 - 0.4 * u);
      const knob = 1 + 0.22 * Math.sin(u * 9 + br.phase);
      const rr = r * knob;
      em.push(pos, [rr, rr, rr], ctBase + u * 0.06);
      if (prevP) em.pushLink(prevP, pos, prevR * TUBE, rr * TUBE, ctBase + u * 0.06);
      prevP = pos; prevR = rr;
      const wob = p.writhe * Math.sin(br.phase + i * 0.6 + br.gen * 1.3) * art;
      const dtheta = curlTotal / segs + wob * 0.14;
      t = rot(t, b, dtheta); nn = rot(nn, b, dtheta);
      const tw = wob * 0.10;
      nn = rot(nn, t, tw); b = rot(b, t, tw);
      if (flowAmt > 0) {
        const fe = flowAmt * art;
        const fl = flowAt(pos);
        const fd = t[0] * fl[0] + t[1] * fl[1] + t[2] * fl[2];
        let tx = t[0] + fe * (fl[0] - t[0] * fd);
        let ty = t[1] + fe * (fl[1] - t[1] * fd);
        let tz = t[2] + fe * (fl[2] - t[2] * fd);
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const axx = t[1] * tz - t[2] * ty, axy = t[2] * tx - t[0] * tz, axz = t[0] * ty - t[1] * tx;
        const sl = Math.hypot(axx, axy, axz);
        if (sl > 1e-6) {
          const ang = Math.asin(Math.min(1, sl)), k = [axx / sl, axy / sl, axz / sl];
          nn = rot(nn, k, ang); b = rot(b, k, ang);
        }
        t = [tx, ty, tz];
      }
      if (brainOn) {
        const sd = p.sensorDist, gain = p.sensorGain, ang = p.sensorAngle * Math.PI;
        const lo = rot(t, b, ang), ro = rot(t, b, -ang);
        const Lv = trailSample([pos[0] + lo[0] * sd, pos[1] + lo[1] * sd, pos[2] + lo[2] * sd]);
        const Rv = trailSample([pos[0] + ro[0] * sd, pos[1] + ro[1] * sd, pos[2] + ro[2] * sd]);
        const Lf = (Lv[0] * t[0] + Lv[1] * t[1] + Lv[2] * t[2]) * gain;
        const Ll = (Lv[0] * nn[0] + Lv[1] * nn[1] + Lv[2] * nn[2]) * gain;
        const Rf = (Rv[0] * t[0] + Rv[1] * t[1] + Rv[2] * t[2]) * gain;
        const Rl = (Rv[0] * nn[0] + Rv[1] * nn[1] + Rv[2] * nn[2]) * gain;
        const bse = brainEval(BC, [Lf, Ll, Rf, Rl]);
        const mir = brainEval(BC, [Rf, -Rl, Lf, -Ll]);
        const turn = (bse[1] - mir[1]) * LAT * p.brain * art;
        const twist = (bse[3] - mir[3]) * LAT * p.brain * 0.6 * art;
        t = rot(t, b, turn); nn = rot(nn, b, turn);
        nn = rot(nn, t, twist); b = rot(b, t, twist);
        trailDeposit(pos, t, 1);
      }
      pos = [pos[0] + t[0] * seg, pos[1] + t[1] * seg, pos[2] + t[2] * seg];
    }
    const tipR = br.rad * 0.6;
    if (prevP) em.pushLink(prevP, pos, prevR * TUBE, tipR * TUBE, ctBase + 0.06);
    em.push(pos, [tipR, tipR, tipR], ctBase + 0.06);

    if (br.gen < maxD) {
      for (let j = 0; j < nc; j++) {
        const frac = nc === 1 ? 0 : (j / (nc - 1) - 0.5) * 2;
        const sang = frac * p.splay;
        let ct = rot(t, b, sang);
        let cn = rot(nn, b, sang);
        let cb = norm(cross(ct, cn));
        cn = norm(cross(cb, ct));
        cn = rot(cn, ct, Math.PI / 2); cb = rot(cb, ct, Math.PI / 2);
        stack.push({
          p: pos, t: ct, n: cn, b: cb,
          len: br.len * p.lenFall, rad: br.rad * p.lenFall,
          gen: br.gen + 1, phase: br.phase + frac * 0.9 + br.gen * 0.5,
        });
      }
    }
  }
}

export function surprise(ctx) {
  const p = ctx.params, r = (a, b) => a + Math.random() * (b - a);
  p.arms = Math.round(r(4, 7));
  p.depth = Math.round(r(4, 6));
  p.splay = r(0.4, 1.0);
  p.lenFall = r(0.62, 0.82);
  p.branchLen = r(0.7, 1.3);
  p.thickness = r(0.03, 0.07);
  p.writhe = r(0.3, 1.2);
  p.writheSpeed = r(0.8, 2.6);
  p.flow = r(0.2, 0.9);
  p.flowScale = r(0.3, 1.6);
  p.flowChurn = r(0.2, 0.9);
  p.couple = r(0.0, 1.6);
  p.brain = r(0.0, 0.9);
  p.brainSeed = Math.random();
  p.sensorGain = r(0.5, 4);
  p.sensorAngle = r(-0.5, 0.5);
  p.furlSpeed = r(0.3, 1.2);
  p.palette = Math.floor(r(0, (ctx.palettes || []).length || 7));
  p.spinSpeed = r(-0.3, 0.3);
  ctx.rt.furlAuto = true;
}

export function wild(ctx) {
  const p = ctx.params, st = ctx.state, r = (a, b) => a + Math.random() * (b - a);
  const arms = Math.round(r(3, 8));
  const children = Math.round(r(1, 3));
  const branchesAt = (d) => children <= 1 ? (d + 1) : (Math.pow(children, d + 1) - 1) / (children - 1);
  let depth = Math.round(r(3, 7));
  while (depth > 2 && arms * branchesAt(depth) > 3400) depth--;
  p.arms = arms; p.children = children; p.depth = depth;
  p.branchLen = r(0.5, 1.5);
  p.splay = r(0.3, 1.7);
  p.lenFall = r(0.6, 0.85);
  p.thickness = r(0.025, 0.075);
  p.stiffness = r(0.0, 0.85);
  p.writhe = r(0.2, 1.4);
  p.writheSpeed = r(0.6, 3.0);
  p.flow = r(0.0, 1.0);
  p.flowScale = r(0.3, 2.0);
  p.flowChurn = r(0.1, 1.0);
  p.couple = r(0.0, 1.8);
  p.furlSpeed = r(0.2, 1.4);
  p.spinSpeed = r(-0.4, 0.4);
  p.brain = r(0.0, 1.0);
  p.brainSeed = Math.random();
  p.sensorGain = r(0.4, 5);
  p.sensorAngle = r(-0.6, 0.6);
  p.sensorDist = r(0.05, 0.45);
  p.trailDecay = r(0.7, 0.98);
  p.trailDiffuse = r(0.0, 1.3);
  p.palette = Math.floor(r(0, (ctx.palettes || []).length || 7));
  ctx.rt.furlAuto = true;
  delete st.armPhase; delete st.armOmega;
}

export const organism = { meta, palettes: undefined, defaults, sliders, tick, build, surprise, wild };
