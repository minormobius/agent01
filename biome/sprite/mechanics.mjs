// biome/sprite/mechanics.mjs — the STABILITY ORACLE. Pure 2D sagittal statics over a posed skeleton:
// it answers "does this muscle arrangement let the creature stand (and walk) without collapsing?" and
// is the physical scorer that KILLS failing arrangements (the gacha/oracle pattern, applied to bodies).
//
// Model (g = 1, masses normalised; all torques are about the out-of-plane axis):
//   • each bone carries a mass ∝ length × width² × a role weight (trunk/viscera heavy, feet light).
//   • the feet on the ground push up with ground-reaction forces (GRF) that sum to body weight, split
//     fore/aft by where the centre of mass sits.
//   • REQUIRED joint torque = free-body the sub-chain distal to the joint: sum the gravity torques of
//     its segments + the GRF torques of any feet below it. That is the torque trying to BUCKLE the joint.
//   • a joint is HELD if pull-only muscles on the correct side have capacity ≥ |required|, and STABLE
//     if it is also ANTAGONISED (muscle capacity on both sides → resists perturbation either way).
//   • the body STANDS iff every actuated joint is stable AND the CoM lies over the support interval.

import { solve } from './render.mjs';
import { attachPos, momentArm } from './muscle.mjs';

const G = 1;
const ROLE_MASS = { // viscera/flesh proxy: axial body is heavy, distal limb light
  thoracic: 1.6, lumbar: 1.6, sacral: 1.4, cervical: 1.0, caudal: 0.4,
  rib: 0.5, bone: 1.0, boneFar: 1.0, scapula: 0.8, pelvis: 0.9, keratin: 0.2,
};

const children = (sprite) => {
  const ch = {}; for (const s of sprite.segs) if (s.parent) (ch[s.parent] ||= []).push(s.id); return ch;
};
function distal(sprite, id, ch) { // id + all descendants
  const out = [id], stack = [id];
  while (stack.length) { const x = stack.pop(); for (const c of (ch[x] || [])) { out.push(c); stack.push(c); } }
  return out;
}
const mid = (w) => ({ x: (w.base.x + w.tip.x) / 2, y: (w.base.y + w.tip.y) / 2 });

// per-segment mass (normalised so Σ = 1)
export function segMasses(sprite) {
  const m = {}; let tot = 0;
  for (const s of sprite.segs) {
    const wdt = ((s.w0 || 1) + (s.w1 || 1)) / 2;
    const v = Math.max(1e-3, s.len * wdt * wdt) * (ROLE_MASS[s.role] ?? 0.8);
    m[s.id] = v; tot += v;
  }
  for (const id in m) m[id] /= tot || 1;
  return m;
}

// the actuated joints we grow muscle for: limb joints + head + every presacral VERTEBRA. The spine is
// a loaded bridge — without trunk muscle it sags — so the intervertebral joints are first-class here.
const SPINE_ROLES = new Set(['cervical', 'thoracic', 'lumbar']); // presacral & mobile (sacral is fused)
const isSpine = (s) => s.shape === 'vertebra' && SPINE_ROLES.has(s.role);
const isLimb = (s) => s.joint === 'upper' || s.joint === 'mid' || s.joint === 'lower';
export const spineChain = (sprite) => sprite.segs.filter(isSpine).map((s) => s.id); // caudal→cranial order
export const limbJoints = (sprite) => sprite.segs.filter(isLimb).map((s) => s.id);
export function actuatedJoints(sprite) {
  return sprite.segs.filter((s) => isLimb(s) || s.id === 'skull' || isSpine(s));
}

// ── BOUNDARY CONDITIONS ─────────────────────────────────────────────────────────────────────────
// Passive structures (joint capsules, intervertebral & nuchal ligaments, the "stay apparatus") carry a
// share of the load before muscle is recruited — a real boundary condition, and why animals stand cheap.
// Returns the fraction of a joint's required torque that passive tissue covers (so muscleNeed = req·(1−f)).
export function passiveFraction(seg) {
  if (seg.id === 'skull') return 0.35;          // nuchal ligament holds much of the head cantilever
  if (isSpine(seg)) return seg.role === 'thoracic' ? 0.4 : 0.3; // supraspinous/intervertebral ligaments
  return 0.1;                                    // limb joint capsules: mostly active control
}

// ground contacts at this pose: foot tips (keratin) within a band of the lowest point are bearing load.
function contacts(sprite, W) {
  const tips = sprite.segs.filter((s) => s.role === 'keratin').map((s) => ({ id: s.id, ...W[s.id].tip }));
  if (!tips.length) return [];
  const ground = Math.max(...tips.map((t) => t.y));
  const band = 0.12 * (W.__span || 100);   // a foot is "planted" if near the lowest contact line
  return tips.filter((t) => t.y >= ground - band);
}

// ground-reaction forces: total weight split fore/aft by CoM, shared within each end.
function groundForces(sprite, W, mass, com) {
  const cs = contacts(sprite, W);
  if (cs.length === 0) return new Map();
  const W_tot = G; // Σ mass = 1
  const front = cs.filter((c) => c.id[0] === 'F'), back = cs.filter((c) => c.id[0] === 'B');
  const grf = new Map();
  if (!front.length || !back.length) { // single support line — share equally
    for (const c of cs) grf.set(c.id, W_tot / cs.length); return grf;
  }
  const xf = front.reduce((s, c) => s + c.x, 0) / front.length;
  const xb = back.reduce((s, c) => s + c.x, 0) / back.length;
  let ff = (com.x - xb) / (xf - xb); ff = Math.max(0, Math.min(1, ff)); // fraction on the front
  const Ff = W_tot * ff, Fb = W_tot * (1 - ff);
  for (const c of front) grf.set(c.id, Ff / front.length);
  for (const c of back) grf.set(c.id, Fb / back.length);
  return grf;
}

export function centreOfMass(sprite, W, mass) {
  let x = 0, y = 0; for (const s of sprite.segs) { const c = mid(W[s.id]); x += mass[s.id] * c.x; y += mass[s.id] * c.y; }
  return { x, y };
}

// torque that must be supplied by muscle at this joint = −(gravity + GRF torque on its distal chain).
function requiredTorque(sprite, W, mass, grf, ch, jointId) {
  const j = W[jointId].base; let tau = 0;
  const sub = new Set(distal(sprite, jointId, ch));
  for (const id of sub) tau += (mid(W[id]).x - j.x) * (mass[id] * G);  // gravity (down = +y)
  for (const [fid, f] of grf) if (sub.has(fid)) tau += (W[fid].tip.x - j.x) * (-f); // GRF pushes up
  return -tau; // muscle must cancel it
}

// muscle capacity at a joint, split by side (sign of moment arm). Returns {pos, neg} torque capacities.
function jointCapacity(W, muscles, jointId) {
  let pos = 0, neg = 0;
  for (const m of muscles) {
    if (!m.joints.includes(jointId)) continue;
    const r = momentArm(attachPos(W, m.a), attachPos(W, m.b), W[jointId].base);
    const t = m.fmax * r;
    if (t >= 0) pos += t; else neg += -t;
  }
  return { pos, neg };
}

// span (for thresholds) = bbox diagonal-ish
function span(sprite, W) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of sprite.segs) for (const p of [W[s.id].base, W[s.id].tip]) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return Math.max(x1 - x0, y1 - y0); }

// median limb-bone length — the scale for muscle standoff / candidate generation
export function limbScale(sprite, W) {
  const ls = sprite.segs.filter((s) => s.joint).map((s) => s.len).sort((a, b) => a - b);
  return ls.length ? ls[ls.length >> 1] : 20;
}

// The pre-muscle standing DEMAND: everything the grower needs — the posed geometry plus the torque
// each actuated joint must have cancelled (computed with NO muscles, i.e. the raw buckling load).
export function standingDemand(sprite) {
  const ch = children(sprite);
  const W = solve(sprite, 0); W.__span = span(sprite, W);
  const mass = segMasses(sprite);
  const com = centreOfMass(sprite, W, mass);
  const grf = groundForces(sprite, W, mass, com);
  const required = {};
  for (const seg of actuatedJoints(sprite)) required[seg.id] = requiredTorque(sprite, W, mass, grf, ch, seg.id);
  return { W, mass, com, grf, ch, required, scale: limbScale(sprite, W), span: W.__span };
}

// ── STANDING ─────────────────────────────────────────────────────────────────────────────────────
export function evaluateStanding(sprite, muscles, opt = {}) {
  const margin = opt.margin ?? 0.12;       // perturbation reserve (fraction of |required|)
  const ch = children(sprite);
  const W = solve(sprite, 0);
  W.__span = span(sprite, W);
  const mass = segMasses(sprite);
  const com = centreOfMass(sprite, W, mass);
  const grf = groundForces(sprite, W, mass, com);
  const minCap = opt.minAntagonist ?? 1e-6; // antagonised = some pull-capacity on BOTH sides of the joint

  const joints = [];
  for (const seg of actuatedJoints(sprite)) {
    const req = requiredTorque(sprite, W, mass, grf, ch, seg.id);
    const cap = jointCapacity(W, muscles, seg.id);
    const need = Math.abs(req) * (1 - passiveFraction(seg)) * (1 + margin); // passive tissue carries a share
    const holdSide = req >= 0 ? 'pos' : 'neg';
    const held = cap[holdSide] >= need;
    const antagonized = cap.pos >= minCap && cap.neg >= minCap;
    joints.push({ id: seg.id, required: req, need, holdSide, cap, held, antagonized, stable: held && antagonized });
  }
  // CoM over support interval
  const cs = contacts(sprite, W);
  const xs = cs.map((c) => c.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), w = (x1 - x0) || 1;
  const comFrac = (com.x - x0) / w;                 // 0..1 inside support
  const comOver = cs.length >= 2 && comFrac > 0.05 && comFrac < 0.95;

  const stable = comOver && joints.every((j) => j.stable);
  return { stable, comOver, com, comFrac, joints, contacts: cs, mass, grf };
}

// ── WALKING (quasi-static first cut) ──────────────────────────────────────────────────────────────
// replay the gait clip; at each phase the support shrinks (lifted feet) and torques change. The set
// must keep every joint held and the CoM over the (moving) support across the whole cycle.
export function evaluateWalking(sprite, muscles, opt = {}) {
  const steps = opt.steps ?? 12;
  const ch = children(sprite), mass = segMasses(sprite);
  let ok = true, worst = null, held = 0, total = 0;
  for (let k = 0; k < steps; k++) {
    const phase = (k / steps) * Math.PI * 2;
    const W = solve(sprite, phase); W.__span = span(sprite, W);
    const com = centreOfMass(sprite, W, mass);
    const grf = groundForces(sprite, W, mass, com);
    const cs = contacts(sprite, W);
    const xs = cs.map((c) => c.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const comOver = cs.length >= 1 && com.x > x0 - 1e-6 && com.x < x1 + 1e-6;
    for (const seg of actuatedJoints(sprite)) {
      const req = requiredTorque(sprite, W, mass, grf, ch, seg.id);
      const cap = jointCapacity(W, muscles, seg.id);
      const side = req >= 0 ? 'pos' : 'neg';
      total++; if (cap[side] >= Math.abs(req)) held++; else { ok = false; if (!worst) worst = { phase, joint: seg.id, req, cap }; }
    }
    if (!comOver) { ok = false; if (!worst) worst = { phase, com: com.x, support: [x0, x1] }; }
  }
  return { ok, held, total, coverage: total ? held / total : 0, worst };
}

export default { segMasses, actuatedJoints, centreOfMass, evaluateStanding, evaluateWalking };
