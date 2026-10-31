/* The autopilot bicycle, no DOM: where it is, how it leans, how it steers, and the shapes the shader draws. Kinematic:
   it rides the track's centreline at a set speed in the steady-turn calibration. The dynamics (a 4D Whipple model
   with a controller) come later; this is the target any controller has to reach.

   THE CALIBRATION (the same argument as on our ground, done with vectors). In a steady turn the line from the rear
   contact to the centre of mass leans so that gravity and the centripetal pull balance about the contact line:
       up = (g Y + v² κ N) / |…|,   so   tan φ = v² κ / g,   and the lean points along N.
   N, the principal normal, lies in the plane across the direction of travel, so the lean is a 2-vector: its size is
   set by the curvature, its direction is wherever the curve bends, ana, kata or in between. Nothing else picks it.
   Along the track N turns round the tangent at the torsion τ (Frenet: N′ = −κT + τB), so the lean's direction turns
   at τ·v rad/s. Steer: the kinematic δ = atan(w κ / cos λ) (wheelbase w, head angle λ), toward N.

   TWO MECHANISMS, which differ only in how the frame carries that turning lean:
   - "two-axis" steering: the fork turns into either of the frame's two lateral directions, so the frame never rolls
     about its direction of travel. Its lateral axes are the curve's rotation-minimizing (Bishop) frame: they don't
     twist, and the lean and the steer turn round inside them at τ. Round a lap they come back turned by ∫τ ds, the
     track's holonomy.
   - "one-axis" steering: the fork turns only toward the frame's own y. So y must point along N, and the whole frame
     rolls about its direction of travel at τ·v, the "precession into w". The wheel's point contact lets it pivot in
     the plane across its axle without slipping; something has to drive that roll, and the dynamics will say what.

   Coordinates are IRIS⁴'s (y up, the ground x, z, w); lengths in metres. */
import { frenet, S, NS, LAP, TRACK_H, VS } from "./world.js";

export const V = 5, G = 9.81; // m/s, m/s²
// geometry (close to Meijaard et al. 2007's benchmark bicycle): wheelbase, head angle from vertical, wheel radius,
// tyre radius, and the centre of mass's height over the ground (bike and rider)
export const BIKE = { WB: 1.02, LAMBDA: Math.PI / 10, R: 0.34, TYRE: 0.03, H: 1.0 };
export const MECHS = ["two-axis", "one-axis"];
const Y = [0, 1, 0, 0];
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), sc = (a, k) => a.map((v) => v * k), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v) => sc(v, 1 / Math.hypot(...v));

/* θ(s) = ∫τ ds along the polyline, so the Frenet normal sits at angle θ from the non-twisting frame's first axis */
export const TH = new Float64Array(NS + 1);
for (let i = 0; i < NS; i++) TH[i + 1] = TH[i] + frenet((2 * Math.PI * (i + 0.5)) / NS).tau * (S[i + 1] - S[i]);
export const HOLONOMY = TH[NS]; // rad: how far the non-twisting frame has turned, relative to Frenet's, after a lap

/* the parameter t, and θ, at arc length s (any s: laps wrap, and θ keeps the holonomy of each lap it has done) */
export function atS(s) {
  const lap = Math.floor(s / LAP), r = s - lap * LAP; let lo = 0, hi = NS;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= r) lo = m; else hi = m; }
  const u = (r - S[lo]) / (S[lo + 1] - S[lo]);
  return { t: (2 * Math.PI * (lo + u)) / NS, theta: lap * HOLONOMY + TH[lo] + u * (TH[lo + 1] - TH[lo]) };
}

/* the bike at arc length s: { p (rear contact), T, N, B (the track's Frenet frame), u (the bike's up, leaned), Np (the
   lean-plane lateral, N tilted with the bike), a, b (the frame's own lateral axes), kappa, tau, phi (lean, rad), delta
   (steer, rad), theta, lean (unit 4D: the lean's direction across the ground), steer (unit lateral: which way the
   fork turns), steerInFrame ([cos, sin] of the steer's direction in the frame's (a, b)), twistRate (rad/s: the
   frame's roll about its direction of travel, against not twisting), Tf (the front wheel's heading), front (front
   contact) } */
export function state(s, mech = "two-axis", v = V, g = G) {
  const { t, theta } = atS(s), f = frenet(t), p = f.p.slice();
  const up = unit(add(sc(Y, g), f.N, v * v * f.kappa)), phi = Math.atan2(v * v * f.kappa, g);
  const Np = add(sc(f.N, Math.cos(phi)), Y, -Math.sin(phi)); // N, leaned with the bike: still ⟂ T and ⟂ up
  const al = mech === "two-axis" ? theta : 0;
  const a = add(sc(Np, Math.cos(al)), f.Bn, -Math.sin(al)), b = add(sc(Np, Math.sin(al)), f.Bn, Math.cos(al));
  const delta = Math.atan((BIKE.WB * f.kappa) / Math.cos(BIKE.LAMBDA));
  const Tf = add(sc(f.T, Math.cos(delta)), f.N, Math.sin(delta)); // the front wheel's heading, level on the ground
  return {
    s, t, p, T: f.T, N: f.N, B: f.Bn, u: up, Np, a, b, kappa: f.kappa, tau: f.tau, phi, delta, theta, mech, v,
    lean: f.N, steer: Np, steerInFrame: [dot(Np, a), dot(Np, b)], twistRate: mech === "one-axis" ? f.tau * v : 0,
    Tf, front: add(p, f.T, BIKE.WB),
  };
}

/* the shapes: two tyres (the set of points within TYRE of a circle, a wheel's 4D tyre) and capsules (frame, bars,
   rider). A point given as [forward, up, a, b] in the bike's own frame, from the rear contact */
export function parts(st) {
  const { p, T, u, a, b, Np, Tf, delta } = st, R = BIKE.R, L = BIKE.LAMBDA;
  const at = (f, h, x = 0, y = 0) => add(add(add(add(p, T, f), u, h), a, x), b, y);
  const uf = unit(add(u, Tf, -dot(u, Tf))); // the front wheel's own up: the lean, square to its steered heading
  const rearHub = at(0, R), frontHub = add(st.front, uf, R), bb = at(0.4, 0.28), seat = at(0.27, 0.88), hb = at(0.93, 0.72);
  const ht = add(hb, add(sc(T, -Math.sin(L)), u, Math.cos(L)), 0.2), bar = add(ht, add(sc(T, -0.06), u, 0.07), 1);
  // the fork turns: a lateral bar vector, turned by δ toward the front in the plane of T and the steer direction
  const turn = (vv) => { const k = dot(vv, Np); return add(add(vv, Np, -k), add(sc(Np, Math.cos(delta)), T, -Math.sin(delta)), k); };
  const caps = [], C = (A, B2, r, m) => caps.push({ a: A, b: B2, r, m });
  C(rearHub, bb, 0.022, 1); C(bb, seat, 0.025, 1); C(seat, rearHub, 0.018, 1); C(seat, hb, 0.025, 1); C(bb, hb, 0.028, 1);
  C(hb, ht, 0.03, 1); C(hb, frontHub, 0.02, 1); C(seat, at(0.25, 0.98), 0.02, 4); C(at(0.17, 0.99), at(0.36, 0.99), 0.035, 4); // seatpost, saddle
  C(ht, bar, 0.02, 4);
  // the bars: a cross for two-axis steering (it steers either way), a single bar for one-axis
  const arms = st.mech === "two-axis" ? [a, b] : [a];
  const ends = [];
  for (const v of arms) { const d = turn(v); C(add(bar, d, -0.26), add(bar, d, 0.26), 0.016, 2); ends.push(add(bar, d, -0.24), add(bar, d, 0.24)); }
  // the rider: hips, a leaning torso, a head, arms to the first bar's ends, legs to the pedals
  const hip = at(0.27, 1.06), sh = at(0.6, 1.5), head = at(0.68, 1.72), crank = 0.17, ph = (st.s / (2.1 * Math.PI * R)) * 2 * Math.PI * 0.55;
  const pedal = (sgn) => add(bb, add(sc(T, Math.cos(ph) * crank * sgn), u, Math.sin(ph) * crank * sgn), 1);
  C(hip, sh, 0.13, 3); C(head, head, 0.11, 5);
  for (const k of [0, 1]) { const e = ends[k], s2 = add(sh, a, (k ? 1 : -1) * 0.17); C(s2, e, 0.045, 3); }
  for (const sgn of [1, -1]) { const h2 = add(hip, a, sgn * 0.1), pd = add(pedal(sgn), a, sgn * 0.1), knee = add(add(sc(add(h2, pd), 0.5), T, 0.18), u, 0.12); C(h2, knee, 0.06, 6); C(knee, pd, 0.045, 6); }
  const tori = [{ c: rearHub, e1: T, e2: u, R: R - BIKE.TYRE, r: BIKE.TYRE }, { c: frontHub, e1: Tf, e2: uf, R: R - BIKE.TYRE, r: BIKE.TYRE }]; // the tyre's outside is R from the hub
  return { tori, caps };
}
/* the distance from a point to the bike (metres), and which part: the shader's sdBike() is this, line for line */
export function sdf(P, q) {
  let d = Infinity, m = 0;
  for (const w of P.tori) {
    const o = add(q, w.c, -1), x = dot(o, w.e1), y = dot(o, w.e2), rest = add(add(o, w.e1, -x), w.e2, -y), rho = Math.hypot(x, y);
    const e = Math.hypot(rho - w.R, Math.hypot(...rest)) - w.r; if (e < d) { d = e; m = 0; }
  }
  for (const c of P.caps) {
    const ab = add(c.b, c.a, -1), ao = add(q, c.a, -1), L2 = dot(ab, ab), h = L2 > 0 ? Math.max(0, Math.min(1, dot(ao, ab) / L2)) : 0;
    const e = Math.hypot(...add(ao, ab, -h)) - c.r; if (e < d) { d = e; m = c.m; }
  }
  return { d, m };
}
/* everything the bike is drawn from fits in a ball this big round its middle */
export const BOUND = 1.6;
export const middle = (st) => add(add(st.p, st.T, BIKE.WB / 2), st.u, 0.8);
export const GROUND_Y = TRACK_H * VS;
