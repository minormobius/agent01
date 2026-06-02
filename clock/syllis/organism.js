// Syllis ramosa — the branching worm. McIntosh (1879) described it from the
// Challenger expedition as the first animal with a branching body: one head and
// a posterior that bifurcates again and again to fill its sponge host's canals.
// Here: one anterior head, a few primary trunks, each a chain of metameric
// segments that fork DICHOTOMOUSLY at IRREGULAR (hashed) angles, recursing to
// `depth`. Same engine, same fluoddity brain — the brain's canal-following is
// exactly the chemotaxis a sponge-dweller uses. (Substrate: free-floating for
// now; the visible sponge host is the next pass.)
import { TAU, norm, cross, rot, mix } from '../lib/vec.js';
import { brainCenters, brainEval, h1 } from '../lib/brain.js';
import { trailEnsure, trailSample, trailDeposit } from '../lib/trail.js';
import { buildFlow } from '../lib/flow.js';
import { GROUPS, DEFAULTS } from '../lib/engine.js';

export const meta = { shot: 'syllis-ramosa' };

export const defaults = {
  ...DEFAULTS.motion, ...DEFAULTS.flow, ...DEFAULTS.brain, ...DEFAULTS.view,
  girth: 0.05, branchLen: 0.7, segPerBranch: 7, depth: 6, children: 2,
  splay: 0.6, irregular: 0.5, taper: 0.8, rings: 0.2, stiffness: 0.4,
  writhe: 0.5, writheSpeed: 1.6,
  // worm-flavoured view/look overrides
  palette: 3, dist: 5.6,
};

export const sliders = [
  ...GROUPS.motion,
  { key: 'girth', label: 'girth', min: 0.02, max: 0.12, step: 0.002 },
  { key: 'branchLen', label: 'internode length', min: 0.3, max: 1.4, step: 0.01 },
  { key: 'segPerBranch', label: 'segments / branch', min: 3, max: 14, step: 1 },
  { key: 'depth', label: 'branch depth', min: 2, max: 8, step: 1 },
  { key: 'children', label: 'forks / branch', min: 1, max: 4, step: 1 },
  { key: 'splay', label: 'fork angle', min: 0.1, max: 1.6, step: 0.01 },
  { key: 'irregular', label: 'irregularity', min: 0, max: 1, step: 0.02 },
  { key: 'taper', label: 'taper', min: 0.5, max: 0.95, step: 0.01 },
  { key: 'rings', label: 'segmentation', min: 0, max: 0.5, step: 0.02 },
  { key: 'stiffness', label: 'nodal stiffness', min: 0, max: 1, step: 0.02 },
  { key: 'writhe', label: 'peristalsis', min: 0, max: 1.6, step: 0.02 },
  { key: 'writheSpeed', label: 'peristalsis speed', min: 0, max: 3.5, step: 0.02 },
  ...GROUPS.flow,
  ...GROUPS.brain,
  ...GROUPS.view,
];

const NT = 3; // primary trunks fanning from the head

export function build(em, ctx, time) {
  const p = ctx.params;
  const girth = p.girth;
  const headR = girth * 4 + 0.12;
  em.push([0, 0, 0], [headR, headR * 0.92, headR], 0.0); // anterior head
  // two simple eye dots near the front of the head
  for (const sx of [-1, 1]) {
    const e = [sx * headR * 0.45, headR * 0.55, headR * 0.7];
    em.push(e, [headR * 0.22, headR * 0.22, headR * 0.22], 0.55);
  }

  const maxD = Math.round(p.depth);
  const segN = Math.max(2, Math.round(p.segPerBranch));
  const furl = ctx.rt.furl;
  const baseCurl = (furl - 0.5) * 0.18; // breathing coil

  const flowAmt = p.flow;
  const flowAt = buildFlow(p, time);

  const brainOn = p.brain > 0;
  let BC = null;
  if (brainOn) { trailEnsure(); BC = brainCenters(p.brainSeed); }
  const LAT = 0.06;
  const art = mix(2.0, 0.3, p.stiffness);
  const nc = Math.max(1, Math.round(p.children));

  // primary trunks fan from the head, biased posteriorly (down/out)
  const stack = [];
  for (let k = 0; k < NT; k++) {
    const ang = k / NT * TAU;
    const dir = norm([Math.cos(ang), -0.3, Math.sin(ang)]);
    const B = norm(cross(dir, [0, 1, 0]));
    const N = norm(cross(B, dir));
    const base = [dir[0] * headR * 0.8, dir[1] * headR * 0.8, dir[2] * headR * 0.8];
    stack.push({ p: base, t: dir, n: N, b: B, len: p.branchLen, rad: girth, gen: 0, phase: k * 2.1, id: k + 1, seg0: 0 });
  }

  while (stack.length) {
    const br = stack.pop();
    let pos = br.p, t = br.t, nn = br.n, b = br.b;
    const seg = br.len / segN;
    const ctBase = br.gen / (maxD + 1);
    const TUBE = 0.8;
    let prevP = null, prevR = 0;

    for (let i = 0; i < segN; i++) {
      const gs = br.seg0 + i;                              // global segment index
      const ringMod = 1 + p.rings * Math.sin(gs * 2.0);   // metameric pulsing
      const rr = br.rad * ringMod;
      em.push(pos, [rr, rr, rr], ctBase + (i / segN) * 0.05);
      if (prevP) em.pushLink(prevP, pos, prevR * TUBE, rr * TUBE, ctBase + (i / segN) * 0.05);
      prevP = pos; prevR = rr;

      // peristalsis: a wave of bending travelling down the body
      const wob = p.writhe * Math.sin(gs * 0.6 - time * p.writheSpeed + br.phase) * art;
      const dtheta = baseCurl + wob * 0.16;
      t = rot(t, b, dtheta); nn = rot(nn, b, dtheta);
      const tw = wob * 0.08;
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
          const a = Math.asin(Math.min(1, sl)), k = [axx / sl, axy / sl, axz / sl];
          nn = rot(nn, k, a); b = rot(b, k, a);
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
    const tipR = br.rad * 0.55;
    if (prevP) em.pushLink(prevP, pos, prevR * TUBE, tipR * TUBE, ctBase + 0.05);
    em.push(pos, [tipR, tipR, tipR], ctBase + 0.05);

    if (br.gen < maxD) {
      for (let j = 0; j < nc; j++) {
        const frac = nc === 1 ? 0 : (j / (nc - 1) - 0.5) * 2;
        // irregular dichotomy: hashed jitter on angle + a hashed fork plane
        const jit = p.irregular * (h1(br.id * 1.3 + 1.7, j * 2.1 + 0.5) * 2 - 1);
        const sang = (frac + jit) * p.splay;
        const plane = (0.5 + 0.5 * p.irregular) * Math.PI * (h1(br.id * 0.7 + 3.1, j + 0.9) * 2 - 1) + Math.PI / 2;
        let ct = rot(t, b, sang);
        let cn = rot(nn, b, sang);
        let cb = norm(cross(ct, cn));
        cn = norm(cross(cb, ct));
        cn = rot(cn, ct, plane); cb = rot(cb, ct, plane);
        stack.push({
          p: pos, t: ct, n: cn, b: cb,
          len: br.len * p.taper, rad: br.rad * p.taper,
          gen: br.gen + 1, phase: br.phase + frac * 0.9 + br.gen * 0.5,
          id: br.id * 4 + j + 1, seg0: br.seg0 + segN,
        });
      }
    }
  }
}

export function surprise(ctx) {
  const p = ctx.params, r = (a, b) => a + Math.random() * (b - a);
  p.depth = Math.round(r(4, 7));
  p.segPerBranch = Math.round(r(5, 10));
  p.branchLen = r(0.5, 1.0);
  p.girth = r(0.035, 0.07);
  p.splay = r(0.35, 0.9);
  p.irregular = r(0.3, 0.9);
  p.taper = r(0.72, 0.88);
  p.rings = r(0.1, 0.4);
  p.writhe = r(0.3, 1.0);
  p.writheSpeed = r(0.9, 2.6);
  p.flow = r(0.2, 0.9);
  p.flowScale = r(0.3, 1.6);
  p.flowChurn = r(0.2, 0.9);
  p.brain = r(0.0, 0.9);
  p.brainSeed = Math.random();
  p.sensorGain = r(0.5, 4);
  p.sensorAngle = r(-0.5, 0.5);
  p.furlSpeed = r(0.3, 1.2);
  p.palette = Math.floor(r(0, 7));
  p.spinSpeed = r(-0.3, 0.3);
  ctx.rt.furlAuto = true;
}

export function wild(ctx) {
  const p = ctx.params, r = (a, b) => a + Math.random() * (b - a);
  const children = Math.round(r(1, 3));
  const branchesAt = (d) => children <= 1 ? (d + 1) : (Math.pow(children, d + 1) - 1) / (children - 1);
  let depth = Math.round(r(3, 8));
  const segN = Math.round(r(4, 11));
  while (depth > 2 && NT * branchesAt(depth) * segN > 13000) depth--;
  p.children = children; p.depth = depth; p.segPerBranch = segN;
  p.branchLen = r(0.4, 1.3);
  p.girth = r(0.03, 0.09);
  p.splay = r(0.2, 1.4);
  p.irregular = r(0.0, 1.0);
  p.taper = r(0.6, 0.92);
  p.rings = r(0.0, 0.5);
  p.stiffness = r(0.0, 0.85);
  p.writhe = r(0.2, 1.4);
  p.writheSpeed = r(0.6, 3.0);
  p.flow = r(0.0, 1.0);
  p.flowScale = r(0.3, 2.0);
  p.flowChurn = r(0.1, 1.0);
  p.furlSpeed = r(0.2, 1.4);
  p.spinSpeed = r(-0.4, 0.4);
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

export const organism = { meta, defaults, sliders, build, surprise, wild };
