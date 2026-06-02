// Syllis ramosa — the branching worm, grown INTO its sponge host. McIntosh
// (1879) described it from the Challenger expedition as the first animal with a
// branching body; its modern cousin Ramisyllis lives threaded through the canal
// system of a Petrosia sponge, one head deep inside and a posterior that forks
// again and again to fill the canals.
//
// Here the worm is OF the sponge: the forks, angles and lengths are not free —
// the growth front follows the host's gyroid canal network (sponge.js), forking
// where the canal branches, confined inside the sponge body, with a few stolon
// tips escaping through the surface. WHERE it grows is driven by the fluoddity
// brain (chemotaxis along the shared trail) layered on top of the canal-following.
import { TAU, norm, cross, rot } from '../lib/vec.js';
import { brainCenters, brainEval, h1 } from '../lib/brain.js';
import { trailEnsure, trailSample, trailDeposit } from '../lib/trail.js';
import { buildFlow } from '../lib/flow.js';
import { GROUPS, DEFAULTS } from '../lib/engine.js';
import { field, HOST_WGSL, writeHostUniforms } from '../lib/sponge.js';

export const meta = { shot: 'syllis-ramosa' };
const LUMP = 0.18;
const NT = 3; // primary trunks from the head

export const defaults = {
  ...DEFAULTS.motion, ...DEFAULTS.flow, ...DEFAULTS.brain, ...DEFAULTS.view,
  girth: 0.045, branchLen: 0.5, segPerBranch: 6, depth: 6, children: 2,
  splay: 0.7, irregular: 0.45, taper: 0.84, rings: 0.2, stiffness: 0.4,
  writhe: 0.4, writheSpeed: 1.5,
  // sponge host + canal-following
  spongeSize: 1.7, spongeScale: 2.6, porosity: 0.6, canalBias: 0.78,
  escape: 0.12, spongeSeed: 0.3, hostAlpha: 0.55,
  palette: 3, dist: 5.4,
};

export const sliders = [
  ...GROUPS.motion,
  { key: 'girth', label: 'girth', min: 0.02, max: 0.1, step: 0.002 },
  { key: 'branchLen', label: 'internode length', min: 0.25, max: 1.1, step: 0.01 },
  { key: 'segPerBranch', label: 'segments / branch', min: 3, max: 12, step: 1 },
  { key: 'depth', label: 'branch depth', min: 2, max: 8, step: 1 },
  { key: 'children', label: 'forks / branch', min: 1, max: 4, step: 1 },
  { key: 'splay', label: 'fork spread', min: 0.1, max: 1.6, step: 0.01 },
  { key: 'irregular', label: 'irregularity', min: 0, max: 1, step: 0.02 },
  { key: 'taper', label: 'taper', min: 0.5, max: 0.95, step: 0.01 },
  { key: 'rings', label: 'segmentation', min: 0, max: 0.5, step: 0.02 },
  { key: 'stiffness', label: 'nodal stiffness', min: 0, max: 1, step: 0.02 },
  { key: 'writhe', label: 'peristalsis', min: 0, max: 1.6, step: 0.02 },
  { key: 'writheSpeed', label: 'peristalsis speed', min: 0, max: 3.5, step: 0.02 },
  // sponge host
  { key: 'spongeSize', label: 'host size', min: 0.9, max: 2.4, step: 0.05 },
  { key: 'spongeScale', label: 'canal density', min: 1.2, max: 4.5, step: 0.05 },
  { key: 'porosity', label: 'porosity', min: 0.25, max: 1.1, step: 0.02 },
  { key: 'canalBias', label: 'canal-following', min: 0, max: 1, step: 0.02 },
  { key: 'escape', label: 'escaping stolons', min: 0, max: 0.4, step: 0.02 },
  { key: 'spongeSeed', label: 'host seed', min: 0, max: 1, step: 0.001 },
  { key: 'hostAlpha', label: 'host opacity', min: 0, max: 0.95, step: 0.02 },
  ...GROUPS.flow,
  ...GROUPS.brain,
  ...GROUPS.view,
];

const VLEN = (v) => Math.hypot(v[0], v[1], v[2]);
const N3 = (v) => { const l = VLEN(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const MIXV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Rotate the (t,n,b) frame so t glides toward `target` (assumed unit) by `amt`.
function steer(t, n, b, target, amt) {
  const bl = N3(MIXV(t, target, amt));
  const ax = cross(t, bl), s = VLEN(ax);
  if (s > 1e-6) {
    const ang = Math.asin(Math.min(1, s)), k = [ax[0] / s, ax[1] / s, ax[2] / s];
    n = rot(n, k, ang); b = rot(b, k, ang);
  }
  return [bl, n, b];
}

export function build(em, ctx, time) {
  const p = ctx.params;
  const P = { size: p.spongeSize, scale: p.spongeScale, wall: p.porosity, seed: p.spongeSeed, lump: LUMP };
  const girth = p.girth;
  const headR = girth * 4 + 0.12;
  em.push([0, 0, 0], [headR, headR * 0.92, headR], 0.0); // anterior head, deep inside
  for (const sx of [-1, 1]) {
    em.push([sx * headR * 0.45, headR * 0.55, headR * 0.7], [headR * 0.22, headR * 0.22, headR * 0.22], 0.55);
  }

  const maxD = Math.round(p.depth);
  const segN = Math.max(2, Math.round(p.segPerBranch));
  const furl = ctx.rt.furl;
  const baseCurl = (furl - 0.5) * 0.1;

  const flowAmt = p.flow;
  const flowAt = buildFlow(p, time);
  const brainOn = p.brain > 0;
  let BC = null;
  if (brainOn) { trailEnsure(); BC = brainCenters(p.brainSeed); }
  const LAT = 0.06;
  const art = 2.0 + (0.3 - 2.0) * p.stiffness;
  const nc = Math.max(1, Math.round(p.children));
  const cb = p.canalBias;

  const stack = [];
  for (let k = 0; k < NT; k++) {
    const ang = k / NT * TAU;
    const dir = N3([Math.cos(ang), -0.3, Math.sin(ang)]);
    const B = N3(cross(dir, [0, 1, 0]));
    const N = N3(cross(B, dir));
    const base = [dir[0] * headR * 0.8, dir[1] * headR * 0.8, dir[2] * headR * 0.8];
    stack.push({ p: base, t: dir, n: N, b: B, len: p.branchLen, rad: girth, gen: 0, phase: k * 2.1, id: k + 1, seg0: 0, escaping: false });
  }

  while (stack.length) {
    const br = stack.pop();
    let pos = br.p, t = br.t, nn = br.n, b = br.b;
    const seg = br.len / segN;
    const ctBase = br.gen / (maxD + 1);
    const TUBE = 0.8;
    let prevP = null, prevR = 0;
    let poppedOut = false;

    for (let i = 0; i < segN; i++) {
      const gs = br.seg0 + i;
      const ringMod = 1 + p.rings * Math.sin(gs * 2.0);
      const rr = br.rad * ringMod;
      em.push(pos, [rr, rr, rr], ctBase + (i / segN) * 0.05);
      if (prevP) em.pushLink(prevP, pos, prevR * TUBE, rr * TUBE, ctBase + (i / segN) * 0.05);
      prevP = pos; prevR = rr;

      // --- canal following: glide along the gyroid channel, recentre into it ---
      const fl = field(pos, P);
      const gn = N3([fl.gx, fl.gy, fl.gz]);
      const td = t[0] * gn[0] + t[1] * gn[1] + t[2] * gn[2];
      let tp = [t[0] - gn[0] * td, t[1] - gn[1] * td, t[2] - gn[2] * td];
      tp = VLEN(tp) > 1e-4 ? N3(tp) : t;
      const recenter = Math.max(0, (p.porosity + 0.25) - fl.G); // climb into the canal
      let des = N3([tp[0] + gn[0] * recenter * 0.8, tp[1] + gn[1] * recenter * 0.8, tp[2] + gn[2] * recenter * 0.8]);
      // confinement to the host body, or escape outward for stolons
      const on = N3(pos);
      if (br.escaping) {
        des = N3([des[0] + on[0] * 0.6, des[1] + on[1] * 0.6, des[2] + on[2] * 0.6]);
      } else if (fl.dOut > -0.18) {
        const bend = Math.min(1, (fl.dOut + 0.18) / 0.18);
        des = N3([des[0] - on[0] * bend, des[1] - on[1] * bend, des[2] - on[2] * bend]);
      }
      [t, nn, b] = steer(t, nn, b, des, cb);

      // peristalsis (travelling wave) + breathing coil
      const wob = p.writhe * Math.sin(gs * 0.6 - time * p.writheSpeed + br.phase) * art;
      t = rot(t, b, baseCurl + wob * 0.12); nn = rot(nn, b, baseCurl + wob * 0.12);
      const tw = wob * 0.07; nn = rot(nn, t, tw); b = rot(b, t, tw);

      // flow swirl (weaker than the canal pull)
      if (flowAmt > 0) {
        const fe = flowAmt * art * (1 - 0.5 * cb);
        const f2 = flowAt(pos);
        const fd = t[0] * f2[0] + t[1] * f2[1] + t[2] * f2[2];
        const tgt = N3([t[0] + fe * (f2[0] - t[0] * fd), t[1] + fe * (f2[1] - t[1] * fd), t[2] + fe * (f2[2] - t[2] * fd)]);
        [t, nn, b] = steer(t, nn, b, tgt, 1.0);
      }

      // --- fluoddity brain: chemotaxis along the shared trail ---
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

      if (br.escaping && fl.dOut > 0.08) { poppedOut = true; break; } // stolon emerged
    }
    const tipR = br.rad * 0.55;
    if (prevP) em.pushLink(prevP, pos, prevR * TUBE, tipR * TUBE, ctBase + 0.05);
    em.push(pos, [tipR, tipR, tipR], ctBase + 0.05);

    if (br.gen < maxD && !poppedOut) {
      const fl = field(pos, P);
      let fgn = N3([fl.gx, fl.gy, fl.gz]);
      for (let j = 0; j < nc; j++) {
        const frac = nc === 1 ? 0 : (j / (nc - 1) - 0.5) * 2;
        const jit = p.irregular * (h1(br.id * 1.3 + 1.7, j * 2.1 + 0.5) * 2 - 1);
        const sang = (frac + jit) * p.splay;
        let ct = rot(t, fgn, sang); // fork within the canal-perpendicular plane
        let cn = cross(ct, fgn);
        cn = VLEN(cn) > 1e-4 ? N3(cn) : N3(cross(ct, [0, 1, 0]));
        let cbf = N3(cross(ct, cn));
        const escaping = br.escaping || (br.gen >= 2 && h1(br.id * 2.1 + 0.3, br.gen + 0.7) < p.escape);
        stack.push({
          p: pos, t: ct, n: cn, b: cbf,
          len: br.len * p.taper, rad: br.rad * p.taper,
          gen: br.gen + 1, phase: br.phase + frac * 0.9 + br.gen * 0.5,
          id: br.id * 4 + j + 1, seg0: br.seg0 + segN, escaping,
        });
      }
    }
  }
}

export const host = {
  wgsl: HOST_WGSL,
  writeUniforms(arr, invVP, p) {
    writeHostUniforms(arr, invVP, {
      size: p.spongeSize, scale: p.spongeScale, wall: p.porosity,
      seed: p.spongeSeed, lump: LUMP, alpha: p.hostAlpha,
    });
  },
};

export function surprise(ctx) {
  const p = ctx.params, r = (a, b) => a + Math.random() * (b - a);
  p.depth = Math.round(r(4, 7));
  p.segPerBranch = Math.round(r(5, 9));
  p.branchLen = r(0.35, 0.7);
  p.girth = r(0.03, 0.06);
  p.splay = r(0.4, 1.0);
  p.irregular = r(0.3, 0.8);
  p.taper = r(0.78, 0.9);
  p.rings = r(0.1, 0.4);
  p.writhe = r(0.25, 0.7);
  p.writheSpeed = r(0.9, 2.4);
  p.spongeScale = r(1.8, 3.6);
  p.porosity = r(0.45, 0.85);
  p.canalBias = r(0.6, 0.92);
  p.escape = r(0.04, 0.2);
  p.spongeSeed = Math.random();
  p.flow = r(0.1, 0.5);
  p.brain = r(0.2, 0.9);
  p.brainSeed = Math.random();
  p.sensorGain = r(0.5, 4);
  p.sensorAngle = r(-0.5, 0.5);
  p.furlSpeed = r(0.3, 1.0);
  p.palette = Math.floor(r(0, 7));
  p.spinSpeed = r(-0.25, 0.25);
  ctx.rt.furlAuto = true;
}

export function wild(ctx) {
  const p = ctx.params, r = (a, b) => a + Math.random() * (b - a);
  const children = Math.round(r(1, 3));
  const branchesAt = (d) => children <= 1 ? (d + 1) : (Math.pow(children, d + 1) - 1) / (children - 1);
  let depth = Math.round(r(3, 8));
  const segN = Math.round(r(4, 10));
  while (depth > 2 && NT * branchesAt(depth) * segN > 13000) depth--;
  p.children = children; p.depth = depth; p.segPerBranch = segN;
  p.branchLen = r(0.3, 0.9);
  p.girth = r(0.025, 0.075);
  p.splay = r(0.2, 1.4);
  p.irregular = r(0.0, 1.0);
  p.taper = r(0.6, 0.92);
  p.rings = r(0.0, 0.5);
  p.stiffness = r(0.0, 0.85);
  p.writhe = r(0.15, 1.0);
  p.writheSpeed = r(0.6, 3.0);
  p.spongeSize = r(1.2, 2.2);
  p.spongeScale = r(1.5, 4.0);
  p.porosity = r(0.35, 1.0);
  p.canalBias = r(0.4, 0.95);
  p.escape = r(0.0, 0.35);
  p.spongeSeed = Math.random();
  p.flow = r(0.0, 0.7);
  p.flowScale = r(0.3, 2.0);
  p.flowChurn = r(0.1, 1.0);
  p.furlSpeed = r(0.2, 1.2);
  p.spinSpeed = r(-0.35, 0.35);
  p.brain = r(0.0, 1.0);
  p.brainSeed = Math.random();
  p.sensorGain = r(0.4, 5);
  p.sensorAngle = r(-0.6, 0.6);
  p.sensorDist = r(0.05, 0.45);
  p.trailDecay = r(0.7, 0.98);
  p.trailDiffuse = r(0.0, 1.3);
  p.palette = Math.floor(r(0, 7));
  ctx.rt.furlAuto = true;
}

export const organism = { meta, defaults, sliders, build, host, surprise, wild };
