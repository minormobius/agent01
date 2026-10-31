/* The bicycle's dynamics, no DOM: the linearized Whipple bicycle (Meijaard, Papadopoulos, Ruina & Schwab 2007, "Linearized
   dynamics equations for the balance and steer of a bicycle: a benchmark and review", Proc. R. Soc. A 463:1955), lifted
   to four dimensions, a controller that rides it, and both steering mechanisms.

   OUR WORLD. Lean φ and steer δ about upright, straight running at speed v obey
       M q̈ + v C1 q̇ + (g K0 + v² K2) q = (0, T)        q = (φ, δ), T the steer torque,
   with M, C1, K0, K2 built from the bicycle's parameters (wheels, rear frame with rider, front assembly) by the paper's
   appendix formulas, which `matrices()` follows line for line. The selftest holds them to the paper's published values,
   and the eigenvalues to its weave and capsize speeds.

   FOUR DIMENSIONS. Near upright and straight, a 4D bicycle is two of these, one leaning into y and one into w. Rolling
   into y is rotation in the (y, z) plane and into w in the (w, z) plane; the wheels spin in (x, z), and the algebra of
   rotations pairs (x, z) with (z, y) into (x, y) and with (z, w) into (x, w), so the gyroscopic and caster couplings
   keep each lean with its own steer. The two meet only at second order. What differs between the copies is the
   inertia: a body's roll into w is Σm(w² + z²) where its roll into y is Σm(y² + z²), and its yaw into w Σm(x² + w²)
   where into y Σm(x² + y²). So the w copy is the same bicycle with each body's spread in y (Σmy², read off its 3D
   inertia) replaced by its spread in w: zero for a bike built as ours ("flat"), the same as y for one built round
   ("round"). The wheels are thin disks in (x, z), the same both ways.

   TWO MECHANISMS. Two-axis steering: both copies steer, each held by its own controller, and the frame doesn't twist.
   One-axis steering: only the frame's y copy steers. With the steer locked, the lean equation is Mφφ φ̈ + g K0φφ φ = 0,
   an inverted pendulum at every speed: no steering can catch a fall into the frame's w. The frame has to twist (rotate
   in its own lateral plane, which leaves the lean and the wheels where they are: a point contact pivots freely) until
   its y lies along the fall, and then steer. Nothing on the ground can supply that torque (the contact force acts
   through the contact point), so it is internal: the rider against a flywheel, or the rider's own body. The model
   drives the twist with a servo and reports the torque it takes.

   The controller: per steering copy, an LQR on (φ, δ, φ̇, δ̇) with the steer torque as input, about the steady turn the
   rider asks for. A rider asks for a lean (the phone's tilt, or the arrow keys); the autopilot asks for the lean that
   follows the track. Speeds in m/s, angles in radians, lengths in metres. */

/* ---------------------------------------------------------------- the benchmark bicycle (the paper's Table 1) */
export const BENCH = {
  w: 1.02, c: 0.08, lambda: Math.PI / 10, g: 9.81,
  rR: 0.3, mR: 2, IRxx: 0.0603, IRyy: 0.12,
  xB: 0.3, zB: -0.9, mB: 85, IBxx: 9.2, IByy: 11, IBzz: 2.8, IBxz: 2.4,
  xH: 0.9, zH: -0.7, mH: 4, IHxx: 0.05892, IHyy: 0.06, IHzz: 0.00708, IHxz: -0.00756,
  rF: 0.35, mF: 3, IFxx: 0.1405, IFyy: 0.28,
};
/* the paper's published matrices (its equations (A 21)–(A 24)), for the selftest to hold matrices() to */
export const PUBLISHED = {
  M: [[80.81722, 2.31941332208709], [2.31941332208709, 0.29784188199686]],
  C1: [[0, 33.86641391492494], [-0.85035641456978, 1.68540397397560]],
  K0: [[-80.95, -2.59951685249872], [-2.59951685249872, -0.80329488458618]],
  K2: [[0, 76.59734589573222], [0, 2.65431523794604]],
  weave: 4.292, capsize: 6.024, // m/s, to the paper's quoted precision
};

/* M, C1, K0, K2 from the parameters (the paper's appendix A, in its order) */
export function matrices(P) {
  const { w, c, lambda: l, rR, mR, IRxx, IRyy, xB, zB, mB, IBxx, IBzz, IBxz, xH, zH, mH, IHxx, IHzz, IHxz, rF, mF, IFxx, IFyy } = P;
  const sl = Math.sin(l), cl = Math.cos(l);
  const mT = mR + mB + mH + mF, xT = (xB * mB + xH * mH + w * mF) / mT, zT = (-rR * mR + zB * mB + zH * mH - rF * mF) / mT;
  const ITxx = IRxx + IBxx + IHxx + IFxx + mR * rR * rR + mB * zB * zB + mH * zH * zH + mF * rF * rF;
  const ITxz = IBxz + IHxz - mB * xB * zB - mH * xH * zH + mF * w * rF;
  const IRzz = IRxx, IFzz = IFxx, ITzz = IRzz + IBzz + IHzz + IFzz + mB * xB * xB + mH * xH * xH + mF * w * w;
  const mA = mH + mF, xA = (xH * mH + w * mF) / mA, zA = (zH * mH - rF * mF) / mA;
  const IAxx = IHxx + IFxx + mH * (zH - zA) ** 2 + mF * (rF + zA) ** 2;
  const IAxz = IHxz - mH * (xH - xA) * (zH - zA) + mF * (w - xA) * (rF + zA);
  const IAzz = IHzz + IFzz + mH * (xH - xA) ** 2 + mF * (w - xA) ** 2;
  const uA = (xA - w - c) * cl - zA * sl;
  const IAll = mA * uA * uA + IAxx * sl * sl + 2 * IAxz * sl * cl + IAzz * cl * cl;
  const IAlx = -mA * uA * zA + IAxx * sl + IAxz * cl, IAlz = mA * uA * xA + IAxz * sl + IAzz * cl;
  const mu = (c / w) * cl, SR = IRyy / rR, SF = IFyy / rF, ST = SR + SF, SA = mA * uA + mu * mT * xT;
  const M = [[ITxx, IAlx + mu * ITxz], [IAlx + mu * ITxz, IAll + 2 * mu * IAlz + mu * mu * ITzz]];
  const K0 = [[mT * zT, -SA], [-SA, -SA * sl]];
  const K2 = [[0, ((ST - mT * zT) / w) * cl], [0, ((SA + SF * sl) / w) * cl]];
  const C1 = [[0, mu * ST + SF * cl + (ITxz / w) * cl - mu * mT * zT], [-(mu * ST + SF * cl), (IAlz / w) * cl + mu * (SA + (ITzz / w) * cl)]];
  return { M, C1, K0, K2, mT, zT, ST, SA, ITxx };
}
/* a body's spread along its lateral axis, Σm y², from its 3D inertia about its centre: (Ixx + Izz − Iyy)/2 */
export const spreadY = (Ixx, Iyy, Izz) => (Ixx + Izz - Iyy) / 2;
/* the parameters of one lateral copy: "y" is the bicycle as given; "w" swaps each body's spread in y for its spread in
   w, nothing for a bike built as ours ("flat"), the same for one built round ("round") */
export function copyParams(P, axis = "y", build = "flat") {
  if (axis === "y" || build === "round") return { ...P };
  const yB = spreadY(P.IBxx, P.IByy, P.IBzz), yH = spreadY(P.IHxx, P.IHyy, P.IHzz);
  return { ...P, IBxx: P.IBxx - yB, IBzz: P.IBzz - yB, IHxx: P.IHxx - yH, IHzz: P.IHzz - yH };
}
/* how hard it is to twist the frame in its own lateral plane: Σm(y² + w²) of the frame, rider and fork (the wheels are
   thin disks in (x, z) and add nothing) */
export function twistInertia(P, build = "flat") {
  const y = spreadY(P.IBxx, P.IByy, P.IBzz) + spreadY(P.IHxx, P.IHyy, P.IHzz);
  return build === "round" ? 2 * y : y;
}

/* ---------------------------------------------------------------- eigenvalues */
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const pmul = (p, q) => { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return r; };
/* Durand–Kerner's starting points: on a circle bigger than every root (Cauchy's bound), not symmetric */
const startRoots = (lowCoefs) => { const R = 1 + Math.max(...lowCoefs.map(Math.abs)); return [0, 1, 2, 3].map((k) => [R * Math.cos(0.4 + (k * Math.PI) / 2), R * Math.sin(0.4 + (k * Math.PI) / 2)]); };
/* the roots of det(M s² + v C1 s + g K0 + v² K2) = 0, a quartic in s (Durand–Kerner) */
export function eigen(m, v, g = 9.81) {
  const e = (i, j) => [g * m.K0[i][j] + v * v * m.K2[i][j], v * m.C1[i][j], m.M[i][j]]; // coefficients, low to high
  const a = pmul(e(0, 0), e(1, 1)), b = pmul(e(0, 1), e(1, 0)), p = a.map((x, i) => x - b[i]), lead = p[4], c = p.map((x) => x / lead);
  let r = startRoots(c.slice(0, 4));
  for (let it = 0; it < 500; it++) {
    r = r.map((z, i) => {
      let f = [1, 0]; for (let k = 3; k >= 0; k--) f = [f[0] * z[0] - f[1] * z[1] + c[k], f[0] * z[1] + f[1] * z[0]]; // Horner, monic
      let d = [1, 0]; r.forEach((y, j) => { if (j !== i) d = cmul(d, [z[0] - y[0], z[1] - y[1]]); });
      const q = cdiv(f, d); return [z[0] - q[0], z[1] - q[1]];
    });
  }
  return r.sort((x, y) => x[0] - y[0]);
}
export const maxRe = (m, v, g = 9.81) => Math.max(...eigen(m, v, g).map((z) => z[0]));
/* the self-stable speed range: weave (where the oscillating mode turns stable) to capsize (where the slow lean mode
   turns unstable), by bisection on the largest real part */
export function stableRange(m, g = 9.81) {
  const vs = []; for (let v = 0; v <= 12; v += 0.01) vs.push(v);
  let lo = null, hi = null;
  for (let i = 1; i < vs.length; i++) { const a = maxRe(m, vs[i - 1], g) < 0, b = maxRe(m, vs[i], g) < 0; if (!a && b && lo === null) lo = [vs[i - 1], vs[i]]; if (a && !b && lo !== null) { hi = [vs[i - 1], vs[i]]; break; } }
  const bis = ([x0, x1], wantStableAbove) => { for (let k = 0; k < 50; k++) { const xm = (x0 + x1) / 2, s = maxRe(m, xm, g) < 0; if (s === wantStableAbove) x1 = xm; else x0 = xm; } return (x0 + x1) / 2; };
  return { weave: lo ? bis(lo, true) : null, capsize: hi ? bis(hi, false) : null };
}

/* ---------------------------------------------------------------- the steady turn, and the controller */
/* the steady turn of the linear model at curvature κ (q̈ = q̇ = 0): δ from the kinematics (κ = δ cos λ / w), φ from the
   lean equation with no torque on the frame, T from the steer equation. Its lean against our calibration tan φ = v²κ/g
   is the selftest's: they agree but for the wheels' spin and the trail */
export function steady(m, P, v, kappa) {
  const g = P.g, delta = (kappa * P.w) / Math.cos(P.lambda);
  const phi = (-(g * m.K0[0][1] + v * v * m.K2[0][1]) * delta) / (g * m.K0[0][0]);
  const T = (g * m.K0[1][0] + v * v * m.K2[1][0]) * phi + (g * m.K0[1][1] + v * v * m.K2[1][1]) * delta;
  return { phi, delta, T };
}
/* the same, from the lean a rider asks for */
export function steadyFromLean(m, P, v, phi) {
  const k0 = steady(m, P, v, 1e-3); return steady(m, P, v, (1e-3 * phi) / k0.phi);
}
const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
const madd = (A, B, k = 1) => A.map((r, i) => r.map((x, j) => x + k * B[i][j]));
const T_ = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
const inv2 = (M) => { const d = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]]; };
/* the state-space form: x = (φ, δ, φ̇, δ̇), ẋ = A x + B T */
export function stateSpace(m, v, g = 9.81) {
  const Mi = inv2(m.M), K = madd(m.K0.map((r) => r.map((x) => g * x)), m.K2.map((r) => r.map((x) => v * v * x))), C = m.C1.map((r) => r.map((x) => v * x));
  const a = mm(Mi, K), b = mm(Mi, C), Bt = mm(Mi, [[0], [1]]);
  const A = [[0, 0, 1, 0], [0, 0, 0, 1], [-a[0][0], -a[0][1], -b[0][0], -b[0][1]], [-a[1][0], -a[1][1], -b[1][0], -b[1][1]]];
  return { A, B: [[0], [0], [Bt[0][0]], [Bt[1][0]]] };
}
/* LQR gains for one copy at speed v: discretize at dt and iterate the Riccati equation to its fixed point */
export const LQR_Q = [60, 6, 4, 0.4], LQR_R = 0.08;
export function lqr(m, v, g = 9.81, dt = 0.01) {
  const { A, B } = stateSpace(m, v, g), n = 4;
  let Ad = eye(n), term = eye(n), Bs = eye(n).map((r) => r.map((x) => x * dt)), tb = Bs;
  for (let k = 1; k < 14; k++) { term = mm(term, A).map((r) => r.map((x) => (x * dt) / k)); Ad = madd(Ad, term); tb = mm(tb, A).map((r) => r.map((x) => (x * dt) / (k + 1))); Bs = madd(Bs, tb); }
  const Bd = mm(Bs, B), Q = eye(n).map((r, i) => r.map((x) => x * LQR_Q[i]));
  let P = Q, K = [[0, 0, 0, 0]];
  for (let it = 0; it < 30000; it++) {
    const PB = mm(P, Bd), s = LQR_R + mm(T_(Bd), PB)[0][0];
    K = mm(T_(PB), Ad).map((r) => r.map((x) => x / s));
    let Pn = madd(madd(Q, mm(mm(T_(Ad), P), Ad)), mm(mm(T_(Ad), PB), K), -1); Pn = Pn.map((r, i) => r.map((x, j) => (x + Pn[j][i]) / 2)); // kept symmetric
    let d = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d = Math.max(d, Math.abs(Pn[i][j] - P[i][j]));
    P = Pn; if (d < 1e-9 * Math.max(1, Math.abs(P[0][0]))) break;
  }
  return K[0];
}
/* closed-loop eigenvalues' largest real part (the selftest checks it's negative), from A − B K by the characteristic
   polynomial of a 4×4 (Faddeev–LeVerrier) and Durand–Kerner */
export function closedLoopMaxRe(m, v, K, g = 9.81) {
  const { A, B } = stateSpace(m, v, g), Acl = madd(A, mm(B, [K]), -1), n = 4;
  let Mk = eye(n), c = [1]; const coef = [1];
  for (let k = 1; k <= n; k++) { const AM = mm(Acl, Mk), ck = -AM.reduce((s, r, i) => s + r[i], 0) / k; coef.push(ck); Mk = madd(AM, eye(n), ck); }
  c = coef; // s⁴ + c1 s³ + c2 s² + c3 s + c4
  let r = startRoots([c[4], c[3], c[2], c[1]]);
  for (let it = 0; it < 800; it++) r = r.map((z, i) => { let f = [1, 0]; for (let k = 1; k <= 4; k++) f = [f[0] * z[0] - f[1] * z[1] + c[k], f[0] * z[1] + f[1] * z[0]]; let d = [1, 0]; r.forEach((y, j) => { if (j !== i) d = cmul(d, [z[0] - y[0], z[1] - y[1]]); }); const q = cdiv(f, d); return [z[0] - q[0], z[1] - q[1]]; });
  return Math.max(...r.map((z) => z[0]));
}

/* ---------------------------------------------------------------- one lateral copy, simulated */
/* ẍ for x = [φ, δ, φ̇, δ̇] under steer torque T (steer = false locks the steer: lean only) */
function accel(m, v, g, x, T, steer = true) {
  const K = (i, j) => g * m.K0[i][j] + v * v * m.K2[i][j], C = (i, j) => v * m.C1[i][j];
  if (!steer) return [-(K(0, 0) * x[0]) / m.M[0][0], 0];
  const r0 = -(C(0, 0) * x[2] + C(0, 1) * x[3] + K(0, 0) * x[0] + K(0, 1) * x[1]), r1 = T - (C(1, 0) * x[2] + C(1, 1) * x[3] + K(1, 0) * x[0] + K(1, 1) * x[1]);
  const Mi = inv2(m.M); return [Mi[0][0] * r0 + Mi[0][1] * r1, Mi[1][0] * r0 + Mi[1][1] * r1];
}
export { accel as copyAccel };

/* ---------------------------------------------------------------- the 4D bicycle on the ground
   Ground vectors are 3D, (x, z, w). The bike carries a heading T and a non-twisting lateral pair (c, d) (transported
   along its path without rotating about T); its frame's own lateral axes are (a, b) = (c, d) turned by the twist α
   (always 0 for two-axis steering). Each lateral copy is [φ, δ, φ̇, δ̇] along a or b. */
const v3 = { add: (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc: (a, k) => a.map((x) => x * k), dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], unit: (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); } };
export const EASY_TAU = 0.05; // s: how fast the easy rider gets the lean asked for
export const TWIST_MAX = 6; // rad/s: the fastest the frame can twist (a rider's quick twist; past it, it falls)
export class Bike {
  constructor({ mech = "two-axis", build = "flat", v = 5, P = BENCH } = {}) {
    this.P = P; this.mech = mech; this.build = build; this.g = P.g;
    this.limits = true; // false: no falling, no twist limit (the linear model, followed however far it's pushed: not physics past ~45°)
    this.my = matrices(copyParams(P, "y", build)); this.mw = matrices(copyParams(P, "w", build));
    this.Itw = twistInertia(P, build); this.setSpeed(v);
    this.pos = [0, 0, 0]; this.T = [1, 0, 0]; this.c = [0, 1, 0]; this.d = [0, 0, 1];
    this.qa = [0, 0, 0, 0]; this.qb = [0, 0, 0, 0]; this.alpha = 0; this.alphaDot = 0;
    this.dist = 0; this.torque = [0, 0]; this.twistTorque = 0; this.crashed = false;
  }
  setSpeed(v) { this.v = v; this.Ka = lqr(this.my, v, this.g); this.Kb = lqr(this.mw, v, this.g); }
  setMech(m) { if (m === this.mech) return; this.mech = m; this.alpha = 0; this.alphaDot = 0; this.peakTwistRate = 0; }
  /* start in the steady turn for a lean (so the bike doesn't have to fall into it from upright) */
  settle(want) {
    const one = this.mech === "one-axis", sa = steadyFromLean(this.my, this.P, this.v, v3.dot(want, this.c)), sb = steadyFromLean(one ? this.my : this.mw, this.P, this.v, v3.dot(want, this.d));
    this.qa = [sa.phi, sa.delta, 0, 0]; this.qb = [sb.phi, sb.delta, 0, 0];
    if (one) this.alpha = Math.atan(sb.delta / sa.delta || 0);
  }
  get a() { return v3.add(v3.sc(this.c, Math.cos(this.alpha)), this.d, Math.sin(this.alpha)); }
  get b() { return v3.add(v3.sc(this.c, -Math.sin(this.alpha)), this.d, Math.cos(this.alpha)); }
  /* the lean and the steer as ground vectors (lateral), and the path's curvature vector the steer makes */
  // the copies' states live on the non-twisting pair (c, d) (for two-axis steering that is the frame's own (a, b))
  get lean() { return v3.add(v3.sc(this.c, this.qa[0]), this.d, this.qb[0]); }
  get leanRate() { return v3.add(v3.sc(this.c, this.qa[2]), this.d, this.qb[2]); }
  get steer() { return v3.add(v3.sc(this.c, this.qa[1]), this.d, this.qb[1]); }
  get curvature() { return v3.sc(this.steer, Math.cos(this.P.lambda) / this.P.w); }
  place(pos, T, c) { this.pos = pos.slice(); this.T = v3.unit(T); this.c = v3.unit(v3.add(c, this.T, -v3.dot(c, this.T))); this.d = [this.T[1] * this.c[2] - this.T[2] * this.c[1], this.T[2] * this.c[0] - this.T[0] * this.c[2], this.T[0] * this.c[1] - this.T[1] * this.c[0]]; this.qa = [0, 0, 0, 0]; this.qb = [0, 0, 0, 0]; this.alpha = this.alphaDot = 0; this.overTwist = 0; this.crashed = false; this.why = ""; }
  /* one step. want: the lean asked for, a ground vector across the heading (its size the angle), held by the LQR rider.
     Or hands on: hands = the steer torques (N m) on the two copies, along c and d, and no rider at all: the bike's own
     dynamics, which balance it by themselves between the weave and capsize speeds, and nowhere else */
  /* easy: no dynamics for the lean and steer. Each copy goes straight to the steady turn for the lean asked for, with
     a lag of EASY_TAU: an ideal rider, no countersteer, no wobble, no fall. The path still follows the steer */
  step(dt, want, hands = null, easy = false) {
    const P = this.P, v = this.v, g = this.g, n = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / n;
    for (let k = 0; k < n; k++) {
      const a = this.a, b = this.b;
      const one = this.mech === "one-axis", a2 = one ? this.c : this.a, b2 = one ? this.d : this.b, mb = one ? this.my : this.mw, Kb = one ? this.Ka : this.Kb;
      // each steering copy: the steady turn for the lean asked for, held by LQR about it
      const ctl = (m, K, q, phiWant) => { const s = steadyFromLean(m, P, v, phiWant), e = [q[0] - s.phi, q[1] - s.delta, q[2], q[3]]; return s.T - (K[0] * e[0] + K[1] * e[1] + K[2] * e[2] + K[3] * e[3]); };
      if (easy) {
        const k2 = 1 - Math.exp(-h / EASY_TAU), go = (m, q, phiWant) => { const s = steadyFromLean(m, P, v, phiWant), p0 = q[0], d0 = q[1]; q[0] += (s.phi - q[0]) * k2; q[1] += (s.delta - q[1]) * k2; q[2] = (q[0] - p0) / h; q[3] = (q[1] - d0) / h; };
        go(this.my, this.qa, v3.dot(want, a2)); go(mb, this.qb, v3.dot(want, b2)); this.torque = [0, 0];
      } else {
      const Ta = hands ? hands[0] : ctl(this.my, this.Ka, this.qa, v3.dot(want, a2));
      const Tb = hands ? hands[1] : ctl(mb, Kb, this.qb, v3.dot(want, b2));
      this.torque = [Ta, Tb];
      const sa = accel(this.my, v, g, this.qa, Ta), sb = accel(mb, v, g, this.qb, Tb);
      // semi-implicit Euler: rates first, then angles
      this.qa[2] += sa[0] * h; this.qa[3] += sa[1] * h; this.qa[0] += this.qa[2] * h; this.qa[1] += this.qa[3] * h;
      this.qb[2] += sb[0] * h; this.qb[3] += sb[1] * h; this.qb[0] += this.qb[2] * h; this.qb[1] += this.qb[3] * h;
      }
      // the path: the heading turns toward the steer at κ = δ cos λ / w, carrying (c, d) with it without twisting them
      const kv = this.curvature, kc = v3.dot(kv, this.c), kd = v3.dot(kv, this.d);
      this.T = v3.unit(v3.add(this.T, kv, v * h)); this.c = v3.unit(v3.add(this.c, this.T, -v * h * kc)); this.d = v3.unit(v3.add(this.d, this.T, -v * h * kd));
      this.c = v3.unit(v3.add(this.c, this.T, -v3.dot(this.c, this.T))); this.d = v3.unit(v3.add(v3.add(this.d, this.T, -v3.dot(this.d, this.T)), this.c, -v3.dot(this.d, this.c)));
      this.pos = v3.add(this.pos, this.T, v * h); this.dist += v * h;
      if (one) {
        // the frame twists to keep its one steering axis along the steer: α is the steer's direction, mod a half turn
        // (held while the steer is near zero, when its direction means nothing). If that asks for more than TWIST_MAX
        // for more than a moment while it is steering, the frame can't keep up and the bike falls
        const ds = Math.hypot(this.qa[1], this.qb[1]), prev = this.alpha;
        if (ds > 2e-3) { let e = Math.atan2(this.qb[1], this.qa[1]) - this.alpha; e -= Math.PI * Math.round(e / Math.PI); this.alpha += e; }
        const rate = (this.alpha - prev) / h, prevDot = this.alphaDot;
        this.alphaDot += (rate - this.alphaDot) * Math.min(1, h * 30); // what a rider would feel: the rate, smoothed over ~30 ms
        this.twistTorque = (this.Itw * (this.alphaDot - prevDot)) / h;
        this.overTwist = Math.abs(rate) > TWIST_MAX && ds > 0.01 ? (this.overTwist || 0) + h : 0;
        if (this.overTwist > 0.15 && this.limits) { this.crashed = true; this.why = "twist"; }
        this.peakTwistRate = Math.max(this.peakTwistRate || 0, Math.abs(this.alphaDot));
      }
      if (this.limits && Math.hypot(this.qa[0], this.qb[0]) > 1.0) { this.crashed = true; this.why = "lean"; }
    }
  }
}

/* ---------------------------------------------------------------- following a path
   Pure pursuit: aim at the point a lookahead ahead along the curve, and ask for the curvature of the circle through
   it, 2·(its offset across the heading)/(its distance)², which a rider gets by leaning: the steady turn's lean per
   curvature (≈ v²/g) times that. The lookahead grows with speed, to cover the lag between asking for a lean and having
   it. `ahead` is the curve's point that far on (the caller finds it). */
export const lookahead = (v) => 2.5 + 0.8 * v;
export function followLean(bike, ahead) {
  const r = v3.add(ahead, bike.pos, -1), lat = v3.add(r, bike.T, -v3.dot(r, bike.T)), d2 = v3.dot(r, r);
  const kWant = v3.sc(lat, 2 / Math.max(d2, 1e-6));
  return v3.sc(kWant, steady(bike.my, bike.P, bike.v, 1).phi);
}
