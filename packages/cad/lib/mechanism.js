// mechanism.js — what a mechanism DOES, by virtual work, from the poser that
// is already here.
//
// The poser IS the mechanism. Finite-difference the forward pose with respect
// to each input and every velocity ratio in the assembly falls out; mechanical
// advantage is the reciprocal of a ratio, by virtual work; the effort that
// holds a load is the sum of F·∂p/∂q. There is no constraint solving here, no
// Newton iteration, no stiffness matrix and no indeterminacy — because the
// only question asked is about a degree of freedom the document already has.
// (The argument, and the 30-line proof of it against a 45-component gripper,
// came from the practitioner who needed it: `morphyx/gripper/jacobian.mjs` on
// claude/gripper-mechanism-design-efcdzz, 2026-09-15.)
//
// What it is for, in the order it gets used:
//
//   * ratios — how far one part moves per unit of an input, and therefore the
//     mechanical advantage: a jaw that moves 0.36 mm per mm of nut travel
//     multiplies the thrust by 2.8.
//   * effort — the force or TORQUE at an input that holds a load at a part.
//     A screw's whole torque reaches its nut; taking F·lead/2π off as "useful
//     work" under-sizes a brake by a quarter, and this is the instrument that
//     says so in one line.
//   * invariants — a span rate. "The link is a link" and "rolling does not
//     change the grip" are both `d(distance)/d(input) = 0`, which is what an
//     author otherwise writes a hundred lines of oracle to assert.
//   * dead points — a ratio going to zero (self-locking, infinite advantage)
//     or to infinity (a toggle), found by sweeping an input.
//
// Units, stated once. Positions are mm and turns are degrees, so a rate is
// mm (or deg) per unit of the input. Forces are newtons and applied torques
// newton-metres, so the effort at an input whose unit is:
//   mm  → newtons        (N·mm per mm)
//   deg → newton-metres  (per radian, /1000)
//   s   → watts          (a drive: work per second)
// Anything else is reported as N·mm per unit, unconverted and labelled.
import { solveAngles, modelOf, periodOf } from './assembly.js';

const DEG = Math.PI / 180;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (pose, a, b) => { const p = pose.get(a), q = pose.get(b); if (!p || !q) throw new Error(`no component \`${pose.has(a) ? b : a}\``); return Math.hypot(p.p[0] - q.p[0], p.p[1] - q.p[1], p.p[2] - q.p[2]); };

/// The axes this document can be differentiated against: the inputs it
/// declares, and `t` when it has a drive — time is the input that runs.
export function axesOf({ drive = null, inputs = [] } = {}) {
  const out = inputs.map((x) => ({ ...x, time: false }));
  if (drive) out.push({ name: 't', unit: 's', min: 0, max: periodOf(drive), steps: 9, default: 0, time: true, description: 'one period of the drive' });
  return out;
}
export const axisNamed = (kin, name) => axesOf(kin).find((a) => a.name === name) || null;

/// Every component's pose at one state: where it is and how far it has turned.
export function poseAt(kin, values, t = 0) {
  const a = solveAngles(kin.components, kin.mates, kin.drive, t, values);
  const out = new Map();
  for (const c of kin.components) { const m = modelOf(c, a); out.set(c.id, { p: [m[12], m[13], m[14]], turn: a.get(c.id) || 0, m }); }
  return out;
}
const at3 = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/// ∂(pose)/∂(one axis) for every component: a central difference where the
/// axis has room for one and a one-sided difference at an end, so a range's
/// last state is still measurable and nothing is evaluated outside the range
/// the author declared (`sqrt` of a negative is how that goes wrong).
///
/// Returns the rates AND the two poses it differenced, so anything else made
/// of them — a span, an angle, a distance to a plane — costs no more poses.
export function rates(kin, axis, { values = {}, t = 0, h = null } = {}) {
  if (!axis) throw new Error('rates: no such input');
  const span = (axis.max ?? 1) - (axis.min ?? 0);
  const step = h ?? Math.max(Math.abs(span) * 1e-5, 1e-7);
  const at = axis.time ? t : (values[axis.name] ?? axis.default ?? 0);
  let a = at - step, b = at + step;
  // Time is periodic and has no ends, so it is always differenced centrally —
  // clamping it at t = 0 would hide the dead point that lives exactly there.
  // A declared input does have ends, and they are real states an author must
  // be able to ask about, so there the difference goes one-sided rather than
  // stepping outside the range (a `sqrt` just past it is how that goes wrong).
  if (!axis.time) {
    if (axis.min !== undefined && a < axis.min) { a = axis.min; b = Math.min(axis.max ?? Infinity, a + 2 * step); }
    else if (axis.max !== undefined && b > axis.max) { b = axis.max; a = Math.max(axis.min ?? -Infinity, b - 2 * step); }
  }
  const dq = b - a;
  if (!(Math.abs(dq) > 0)) throw new Error(`rates: input \`${axis.name}\` has no range to differentiate over`);
  const lo = axis.time ? poseAt(kin, values, a) : poseAt(kin, { ...values, [axis.name]: a }, t);
  const hi = axis.time ? poseAt(kin, values, b) : poseAt(kin, { ...values, [axis.name]: b }, t);
  const of = new Map();
  for (const [id, p] of hi) {
    const q = lo.get(id);
    const d = [(p.p[0] - q.p[0]) / dq, (p.p[1] - q.p[1]) / dq, (p.p[2] - q.p[2]) / dq];
    of.set(id, { d, speed: Math.hypot(...d), dturn: (p.turn - q.turn) / dq });
  }
  return { axis, at, dq, of, lo, hi, values: axis.time ? values : { ...values, [axis.name]: at }, t };
}

/// The rate of the distance between two components. An invariant of a
/// mechanism is this being zero: a link whose ends stay a link's length apart,
/// a jaw whose distance from the roll axis does not depend on the roll.
export const spanRate = (r, a, b) => (dist(r.hi, a, b) - dist(r.lo, a, b)) / r.dq;
export const spanAt = (r, a, b) => (dist(r.hi, a, b) + dist(r.lo, a, b)) / 2;

/// One part's motion per unit of the input, and what that buys: the advantage
/// is the reciprocal — a part moving half as far as the input carries twice
/// the force. `axis` projects onto a direction (a jaw's own travel) instead of
/// taking the speed.
export function ratioOf(r, id, { along = null } = {}) {
  const d = r.of.get(id); if (!d) throw new Error(`no component \`${id}\``);
  const rate = along ? dot3(d.d, along) / (Math.hypot(...along) || 1) : d.speed;
  return { id, rate, speed: d.speed, d: d.d, dturn: d.dturn, advantage: Math.abs(rate) > 1e-12 ? 1 / Math.abs(rate) : Infinity };
}

/// The rate of one point of a part, in the part's own coordinates. A part's
/// rate is its ORIGIN's: a hand pinned at its boss has a rate of zero and a
/// turn rate that is the whole story, and the tip of that hand moves r·ω.
/// Face geometry is in the same coordinates, so `anchorOf(face)` goes here.
export function pointRate(r, id, local = [0, 0, 0]) {
  const hi = r.hi.get(id), lo = r.lo.get(id); if (!hi) throw new Error(`no component \`${id}\``);
  const a = at3(lo.m, local), b = at3(hi.m, local);
  const d = [(b[0] - a[0]) / r.dq, (b[1] - a[1]) / r.dq, (b[2] - a[2]) / r.dq];
  return { d, speed: Math.hypot(...d), at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] };
}

const UNITS = { mm: { effort: 'N', per: 1 }, deg: { effort: 'N·m', per: (180 / Math.PI) / 1000 }, '°': { effort: 'N·m', per: (180 / Math.PI) / 1000 }, s: { effort: 'W', per: 1 / 1000 } };

/// Virtual work: the effort at this input that holds these loads.
///
/// A force on a part does work through that part's motion, so the effort is
/// Σ F·(∂p/∂q) — no free body diagrams, no reaction bookkeeping, and every
/// path through the mechanism counted exactly once because the poser already
/// counted it. Lossless: friction is not modelled, so this is the floor.
export function effortFor(r, loads = []) {
  let work = 0; const terms = [];
  for (const l of loads) {
    const d = r.of.get(l.component); if (!d) throw new Error(`no component \`${l.component}\``);
    let w = dot3(l.force || [0, 0, 0], d.d);                  // N·mm per input unit
    if (l.torque) w += l.torque * 1000 * d.dturn * DEG;       // N·m about its own turn → N·mm
    terms.push({ component: l.component, work: w });
    work += w;
  }
  const u = UNITS[r.axis.unit] || null;
  return { effort: u ? work * u.per : work, unit: u ? u.effort : `N·mm per ${r.axis.unit || 'unit'}`, work, terms, lossless: true };
}

/// One input from end to end: the rates at each step, what moves fastest, and
/// where anything stops moving. A dead point is a part whose ratio passes
/// through zero — the mechanism is self-locking there, the advantage infinite,
/// and a toggle is the same event seen from the other side.
export function sweepRates(kin, axis, { steps = null, values = {}, t = 0, h = null, dead = 1e-6 } = {}) {
  const n = Math.max(2, Math.round(steps || axis.steps || 5));
  const samples = [];
  // a period repeats, so its last sample IS its first: time is sampled
  // half-open, an input's range closed, because its ends are real states
  const span = axis.max - axis.min, div = axis.time ? n : n - 1;
  for (let k = 0; k < n; k++) {
    const v = axis.min + (span * k) / div;
    samples.push(rates(kin, axis, { values: axis.time ? values : { ...values, [axis.name]: v }, t: axis.time ? v : t, h }));
  }
  const ids = [...samples[0].of.keys()];
  // How far a part actually goes over the whole input: the integral of its
  // rate, trapezoidally, which is the number a person asks for when they ask
  // how far the jaw opens. A period closes on itself, so its last interval
  // wraps back to the first sample.
  const step = Math.abs(span) / div;
  const integrate = (v) => { let sum = 0; for (let k = 0; k + 1 < n; k++) sum += ((v[k] + v[k + 1]) / 2) * step; if (axis.time) sum += ((v[n - 1] + v[0]) / 2) * step; return sum; };
  // The NET motion, end to end, from two more poses rather than from the
  // samples. It matters: an escapement is locked for most of a beat and slides
  // over the rest, so uniform samples under-resolve it and the integral of
  // twelve of them can read zero for a train that turned. The difference of
  // the two end poses cannot — it is exact whatever the sampling, and for a
  // clock it is the number being asked for (how far did the hand advance?).
  const endA = axis.time ? poseAt(kin, values, axis.min) : poseAt(kin, { ...values, [axis.name]: axis.min }, t);
  const endB = axis.time ? poseAt(kin, values, axis.max) : poseAt(kin, { ...values, [axis.name]: axis.max }, t);
  const per = ids.map((id) => {
    const speeds = samples.map((s) => s.of.get(id).speed), turns = samples.map((s) => Math.abs(s.of.get(id).dturn));
    const max = Math.max(...speeds), min = Math.min(...speeds), turn = Math.max(...turns);
    const a = endA.get(id), b = endB.get(id);
    const net = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]), netTurn = b.turn - a.turn;
    // a part that only turns has a rate of zero and is not still; neither is
    // one the samples happened to catch at rest but that ended somewhere else
    const moves = max > dead || turn > dead || net > dead || Math.abs(netTurn) > dead;
    const stopped = speeds.map((s, i) => (s <= dead ? i : -1)).filter((i) => i >= 0);
    return { id, max, min, turn, moves, travel: Math.max(integrate(speeds), net), turned: Math.max(integrate(turns), Math.abs(netTurn)), net, netTurn, deadAt: max > dead ? stopped.map((i) => samples[i].at) : [] };
  });
  return { axis, samples, per, moving: per.filter((x) => x.moves).sort((a, b) => b.max - a.max || b.turn - a.turn) };
}
