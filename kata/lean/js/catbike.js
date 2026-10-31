/* The Cheshire cat on a bicycle, no DOM. The cat is games/cheshire's (./cat.js, a byte-identical copy the selftest
   holds to the original); this puts it on a cat-sized one-axis bicycle and works out how it rides.

   WHY THE ONE-AXIS BIKE IS THE CAT'S. The cat's front paws stand across z (±8.8 cm) and its hind paws across w (±11 cm).
   - Front paws on the bars, across z, the frame's steering direction: one paw pushed, the other pulled, turns the
     bars in the (forward, z) plane: the one-axis steer.
   - Hind paws on the pedals: the cranks turn in the (forward, up) plane like the wheels, so the axle runs out along w
     and the pedals sit at ±w, where the hind feet already are.
   - A two-axis bike would want a paw at the bars out in w. The cat has none: two-axis steering is for some other animal.
   THE TWIST, AND THE TAIL. One-axis steering has to twist the frame in its own lateral (z, w) plane, and nothing on the
   ground can push it round. So it is the falling-cat problem: turn yourself with nothing to push on, which cats are
   famous for. Here the tail does it: swung round in the (z, w) plane it carries angular momentum the other way, so
   with no outside torque in that plane, I_body·α̇ + I_tail·θ̇ = 0, and the tail's angle is θ = θ₀ − (I_body/I_tail)·α.
   The tail is under 1% of the cat, so it must turn a couple of hundred times as far as the frame: the cat whirls it.
   THE BIKE is the benchmark bicycle (dyn.js BENCH) scaled to the cat, every length × SCALE, every mass × SCALE³, every
   inertia × SCALE⁵: it balances itself between 2.7 and 3.8 m/s (ours: 4.3–6.0), and standing still falls as e^(8.75 t)
   (ours e^(5.53 t)). Drawn in its own frame, (forward T, up u, the frame's y a, the frame's w b), metres. */
import { pose, MAT, LIMITS } from "./cat.js";
import { BENCH } from "./dyn.js";

export const SCALE = 0.4;
export function catBench(s = SCALE) {
  const P = { ...BENCH };
  for (const k of ["w", "c", "rR", "xB", "zB", "xH", "zH", "rF"]) P[k] *= s;
  for (const k of ["mR", "mB", "mH", "mF"]) P[k] *= s ** 3;
  for (const k of ["IRxx", "IRyy", "IBxx", "IByy", "IBzz", "IBxz", "IHxx", "IHyy", "IHzz", "IHxz", "IFxx", "IFyy"]) P[k] *= s ** 5;
  return P;
}
export const CAT_V = 3; // m/s: inside its self-stable band

/* the cat bike's geometry, in its frame: [forward, up] from the rear contact, metres */
export const GEO = {
  WB: 0.42, R: 0.13, TYRE: 0.016, LAMBDA: Math.PI / 10,
  bb: [0.15, 0.15], crank: 0.04, seat: [0.12, 0.25], head: [0.39, 0.27], headLow: [0.41, 0.2],
  bars: [0.43, 0.3], grip: 0.088, pedalW: 0.11,
  catAt: [0.2, 0.12], // where the cat's own origin (its floor under its middle) sits: crouched along the top tube
};
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const unit = (v) => sc(v, 1 / Math.hypot(...v));

/* the frame: the pose (from the page: p rear contact, T, u, a, b, Np steer direction, delta, Tf), made orthonormal */
export function frameOf(st) {
  const T = st.T, u = unit(add(st.u, T, -dot(st.u, T))), a = unit(add(add(st.a, T, -dot(st.a, T)), u, -dot(st.a, u)));
  const b0 = add(add(add(st.b, T, -dot(st.b, T)), u, -dot(st.b, u)), a, -dot(st.b, a)), b = unit(b0);
  return { T, u, a, b };
}
/* the cat's posed feet, in its own frame: front paws on the grips, hind paws on the pedals (crank angle ph, the two
   pedals half a turn apart, at ±w). o.feet wants contact points [x, z, w] and a height h over the cat's floor; the
   paw's centre sits at 0.021 + h */
export function catFeet(ph) {
  const [ox, oy] = GEO.catAt, at = (f, h) => [f - ox, h - oy - 0.021];
  const grip = at(GEO.bars[0] + 0.01, GEO.bars[1] + 0.012), feet = {};
  feet["front +z"] = { p: [grip[0], GEO.grip, 0], h: grip[1] }; feet["front −z"] = { p: [grip[0], -GEO.grip, 0], h: grip[1] };
  for (const [name, s] of [["hind +w", 1], ["hind −w", -1]]) {
    const q = at(GEO.bb[0] + GEO.crank * Math.cos(ph + (s > 0 ? 0 : Math.PI)), GEO.bb[1] + 0.012 + GEO.crank * Math.sin(ph + (s > 0 ? 0 : Math.PI)));
    feet[name] = { p: [q[0], 0, s * GEO.pedalW], h: q[1] };
  }
  return feet;
}
/* the tail, swung round the (z, w) plane to angle θ: the cat's own tail curve (up and back from the rump, curling),
   its sideways reach turned to point at θ round z and w */
export function tailChain(theta, N = 9) {
  const pts = [];
  for (let i = 0; i <= N; i++) { const s = i / N, rho = 0.13 * s * s + 0.05 * s ** 4; pts.push([-0.27 - 0.17 * s + 0.07 * s ** 3, 0.25 + 0.2 * Math.sin(s * 2.2) + 0.04 * s * s, rho * Math.cos(theta), rho * Math.sin(theta)]); }
  const caps = []; for (let i = 0; i < N; i++) caps.push({ a: pts[i], b: pts[i + 1], ra: 0.034 - 0.017 * (i / N), rb: 0.034 - 0.017 * ((i + 1) / N), m: MAT.fur, wx: 0, g: "tail" });
  return caps;
}
/* the cat, posed on the bike: its parts in its own frame (the tail swung to θ), for the shader; held still (no idle) */
export function catOnBike(ph, theta, mouth = 0) {
  const P = pose(0, { idle: false, feet: catFeet(ph), mouth });
  P.caps = P.caps.filter((c) => c.g !== "tail").concat(tailChain(theta));
  if (P.caps.length > LIMITS.caps || P.ells.length > LIMITS.ells) throw new Error("the cat outgrew the shader's arrays");
  return P;
}
/* the cat's frame in the world: origin and rows (T, u, a, b), so a world point q is at M·(q − O) in the cat's frame */
export function catFrame(st) { const f = frameOf(st), O = add(add(st.p, f.T, GEO.catAt[0]), f.u, GEO.catAt[1]); return { O, M: [f.T, f.u, f.a, f.b] }; }

/* the twist's inertias: each part's Σ(volume)(z² + w²) about the bike's midplane (its own spread across z and w
   included), body (and everything but the tail) against tail; the ratio is how many times as far as the frame the tail
   must turn. Uniform density, the parts' volumes as cat.js's mass() takes them */
export function twistInertias(P = catOnBike(0, 0)) {
  let body = 0, tail = 0;
  const capI = (k) => { const r = (k.ra + k.rb) / 2, L = Math.hypot(...add(k.b, k.a, -1)), V = ((4 * Math.PI) / 3) * r ** 3 * L, c = sc(add(k.a, k.b), 0.5), ez = (k.b[2] - k.a[2]) ** 2 / 12, ew = (k.b[3] - k.a[3]) ** 2 / 12; return V * (c[2] ** 2 + c[3] ** 2 + ez + ew + r * r / 2); };
  const ellI = (e) => { const V = (Math.PI ** 2 / 2) * e.r.reduce((x, y) => x * y, 1); return V * (e.c[2] ** 2 + e.c[3] ** 2 + (e.r[2] ** 2 + e.r[3] ** 2) / 6); };
  for (const k of P.caps) if (k.m < MAT.eye) { if (k.g === "tail") tail += capI(k); else body += capI(k); }
  for (const e of P.ells) if (e.m < MAT.eye) body += ellI(e);
  return { body, tail, ratio: body / tail };
}

/* the cat bike's own frame, tyres and bar (no rider: the cat is drawn by the shader's cat), as bike.js parts(): tori
   and capsules in the world, metres */
export function bikeParts(st) {
  const { T, u, a, b } = frameOf(st), p = st.p, G = GEO, at = (f, h, x = 0, y = 0) => add(add(add(add(p, T, f), u, h), a, x), b, y);
  const delta = st.delta, Np = st.Np || a, Tf = st.Tf || T, uf = unit(add(u, Tf, -dot(u, Tf)));
  const rearHub = at(0, G.R), frontHub = add(add(p, T, G.WB), uf, G.R), bb = at(...G.bb), seat = at(...G.seat), head = at(...G.head), hl = at(...G.headLow), bar = at(...G.bars);
  const turn = (vv) => { const k = dot(vv, Np); return add(add(vv, Np, -k), add(sc(Np, Math.cos(delta)), T, -Math.sin(delta)), k); };
  const caps = [], C = (A, B, r, m) => caps.push({ a: A, b: B, r, m });
  C(rearHub, bb, 0.01, 1); C(bb, seat, 0.011, 1); C(seat, rearHub, 0.008, 1); C(seat, head, 0.012, 1); C(bb, hl, 0.012, 1); C(hl, head, 0.013, 1); C(hl, frontHub, 0.009, 1); C(head, bar, 0.009, 4);
  const d = turn(a); C(add(bar, d, -0.1), add(bar, d, 0.1), 0.008, 2); // the bar, across the frame's y (z, for the cat): one-axis
  // the crank's axle runs out along w, the pedals at ±w
  const ph = st.ph || 0;
  for (const s of [1, -1]) { const pe = add(add(bb, add(sc(T, Math.cos(ph + (s > 0 ? 0 : Math.PI))), u, Math.sin(ph + (s > 0 ? 0 : Math.PI))), G.crank), b, s * G.pedalW); C(add(bb, b, s * G.pedalW), pe, 0.006, 4); C(bb, add(bb, b, s * G.pedalW), 0.008, 4); }
  return { tori: [{ c: rearHub, e1: T, e2: u, R: G.R - G.TYRE, r: G.TYRE }, { c: frontHub, e1: Tf, e2: uf, R: G.R - G.TYRE, r: G.TYRE }], caps };
}
export const CAT_BOUND = 0.62; // a ball round the cat's middle (its frame: [0.03, 0.25, 0, 0]) holds all of it, the whirling tail too
export const CAT_MID = [0.03, 0.25, 0, 0];
