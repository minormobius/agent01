/* WAKE's boat, no DOM: hulls, how they float, how they heel, and how the boat steers.

   FLOATING is Archimedes', in any dimension: a hull floats when the water it pushes aside weighs what it does. Water
   here is a four-dimensional fluid (density RHO per 4-volume) whose surface, y = 0, is three-dimensional: the same
   x, z, w the ground has. Each hull is a 4D capsule (every point within r of a segment along the boat's heading) floating
   with its axis on the waterline, so half of it is under water: a half-3-ball of section along its length, half a 4-ball
   at its ends.

   HEELING: tipping the boat tilts its up toward one of the two directions across it, e1 (across, in the slice you see)
   or e2 (across, into w), so the heel is a 2-vector, like the bicycle's lean. What rights it is the metacentric height,
   GM = I/V − BG, but I (the second moment of the WATERPLANE, here a 3D solid, about the heel axis) is a 2×2 matrix over
   that plane, and so is GM. A hull that's thin in w has no I in w: it falls over kata or ana, at once. Two hulls side by
   side have I along the line between them only. Three hulls in a triangle across the plane have it every way.

   STEERING: the rudder turns the heading toward any direction across it, so a turn is a 2-vector too, and the stick is
   the rudder: right turns right, up turns ana. Turning at speed heels the boat outward (the water pulls the hulls in,
   below the weight), u·ω·(arm) against the hulls' righting. The frame (T, e1, e2) is carried without twisting about T,
   so "up" on the stick stays the direction your slice can't see. */
export const G = 9.81, RHO = 1000, CAPSIZE = 1.05, RMIN = 7; // capsize past ~60°; the tightest turn at speed, metres
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };

/* the boats: hulls { o: [across e1, across e2], L (the axis's length), r }, zG (the weight's height above the
   waterline), a top speed, and a colour */
export const BOATS = {
  triad: { name: "triad", say: "three hulls in a triangle across both directions: steady every way", zG: 0.32, vmax: 6, col: [0.95, 0.55, 0.2],
    hulls: [0, 120, 240].map((a) => ({ o: [1.15 * Math.cos((a * Math.PI) / 180), 1.15 * Math.sin((a * Math.PI) / 180)], L: 2.2, r: 0.3 })) },
  catamaran: { name: "catamaran", say: "two hulls side by side, weighted below the waterline: steady across, barely steady in w. Slow down to turn ana or kata", zG: -0.03, vmax: 7, col: [0.25, 0.7, 0.95],
    hulls: [{ o: [1.3, 0], L: 2.6, r: 0.28 }, { o: [-1.3, 0], L: 2.6, r: 0.28 }] },
  skiff: { name: "skiff", say: "one hull, ours: wide across and flat in w. It can't float upright here", zG: 0.3, vmax: 6, col: [0.85, 0.85, 0.8],
    hulls: [-0.6, -0.3, 0, 0.3, 0.6].map((s) => ({ o: [s, 0], L: 2.4, r: 0.15 })) },
};

/* hydrostatics: V (4-volume under water), W (the waterplane's 3-volume), I (its 2×2 second moment about its centroid),
   zB (the centre of buoyancy's depth), BM = I/V, GM = BM − BG, and the heel's radii of gyration */
export function hydro(boat) {
  let V = 0, W = 0, zBV = 0, c = [0, 0];
  const parts = boat.hulls.map((h) => {
    const v = h.L * ((2 * Math.PI) / 3) * h.r ** 3 + (Math.PI ** 2 / 4) * h.r ** 4; // half a 3-ball's section along L, half a 4-ball
    const zb = (h.L * ((2 * Math.PI) / 3) * h.r ** 3 * ((3 * h.r) / 8) + (Math.PI ** 2 / 4) * h.r ** 4 * ((16 * h.r) / (15 * Math.PI))) / v;
    const w = h.L * Math.PI * h.r ** 2 + ((4 * Math.PI) / 3) * h.r ** 3; // a disc along L, a 3-ball at the ends
    const iOwn = (h.L * Math.PI * h.r ** 4) / 4 + ((4 * Math.PI) / 15) * h.r ** 5; // about its own axis, the same both ways
    V += v; W += w; zBV += v * zb; c = add(c, h.o, w); return { h, v, w, iOwn };
  });
  c = sc(c, 1 / W);
  const I = [[0, 0], [0, 0]];
  for (const p of parts) { const o = add(p.h.o, c, -1); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) I[i][j] += (i === j ? p.iOwn : 0) + p.w * o[i] * o[j]; }
  const zB = zBV / V, BG = boat.zG + zB, BM = I.map((r) => r.map((x) => x / V)), GM = BM.map((r, i) => r.map((x, j) => x - (i === j ? BG : 0)));
  const gyr = [0, 1].map((i) => Math.sqrt(parts.reduce((s, p) => s + p.v * ((p.h.o[i] - c[i]) ** 2 + 0.4 * p.h.r ** 2), 0) / V + BG * BG));
  return { V, W, I, zB, BG, BM, GM, gyr, mass: RHO * V, arm: boat.zG + 0.5 * Math.max(...boat.hulls.map((h) => h.r)), draft: Math.max(...boat.hulls.map((h) => h.r)) };
}
/* GM's two principal values: where it's stiffest and where it's softest (negative: it falls that way) */
export function principal(GM) { const a = GM[0][0], b = GM[0][1], d = GM[1][1], m = (a + d) / 2, s = Math.hypot((a - d) / 2, b); return [m + s, m - s]; }

export class Boat {
  /* at p (x, z, w), heading T, e1 the direction across you see (e2 completes the frame) */
  constructor(kind, p, T, e1) {
    this.kind = kind; this.B = BOATS[kind]; this.H = hydro(this.B);
    this.pos = p.slice(); this.T = unit(T); this.e1 = unit(add(e1, this.T, -dot(e1, this.T)));
    this.e2 = cross3(this.T, this.e1); // (x, z, w): the third direction across
    this.u = 0; this.w = [0, 0]; this.h = [0, 0]; this.hd = [0, 0]; this.capsized = false; this.aground = false; this.t = 0;
    // the hull that can't float upright starts barely off upright: the first nudge sets which way it goes
    if (principal(this.H.GM)[1] < 0) this.h = [0, 0.01];
  }
  /* turn: the rudder (a 2-vector, |turn| ≤ 1, in e1 and e2); throttle −0.3…1; depth(g) the water's depth there */
  step(dt, turn, throttle, depth) {
    if (this.capsized) return;
    const B = this.B, H = this.H, m = Math.hypot(...turn), tq = m > 1 ? sc(turn, 1 / m) : turn;
    // the rudder: the turn it asks for grows with speed (a little from the propeller's wash when slow), taken in 0.3 s
    const wmax = Math.max(Math.abs(this.u), 1.2) / RMIN * Math.sign(this.u || 1), k = 1 - Math.exp(-dt / 0.3);
    this.w = this.w.map((x, i) => x + (tq[i] * wmax - x) * k);
    // speed: thrust, drag (a top speed of vmax at full throttle), turning costs a little
    const kd = 1.4 / (B.vmax * B.vmax), a = 1.4 * throttle - kd * this.u * Math.abs(this.u) - 0.25 * Math.hypot(...this.w) * this.u;
    this.u += a * dt;
    // the heel: righting (GM, as sin of the angle), heeled outward by the turn, damped by the water
    const ph = Math.hypot(...this.h), s = ph > 1e-9 ? sc(this.h, Math.sin(ph) / ph) : this.h;
    for (let i = 0; i < 2; i++) {
      const g2 = H.gyr[i] ** 2, gm = Math.max(Math.abs(H.GM[i][i]), 0.03), c = 2 * 0.3 * H.gyr[i] * Math.sqrt(G * gm);
      const acc = (-G * (H.GM[i][0] * s[0] + H.GM[i][1] * s[1]) - this.u * this.w[i] * H.arm - c * this.hd[i]) / g2;
      this.hd[i] += acc * dt;
    }
    this.h = add(this.h, this.hd, dt);
    if (Math.hypot(...this.h) > CAPSIZE) { this.capsized = true; return; }
    // the heading turns toward w (no twist about it), then the boat moves
    const T = unit(add(add(this.T, this.e1, this.w[0] * dt), this.e2, this.w[1] * dt));
    let e1 = add(this.e1, this.T, -this.w[0] * dt); e1 = unit(add(e1, T, -dot(e1, T)));
    let e2 = add(this.e2, this.T, -this.w[1] * dt); e2 = add(e2, T, -dot(e2, T)); e2 = unit(add(e2, e1, -dot(e2, e1)));
    this.T = T; this.e1 = e1; this.e2 = e2;
    const next = add(this.pos, T, this.u * dt), L = Math.max(...B.hulls.map((h) => h.L / 2 + h.r));
    this.aground = [0, L, -L].some((x) => depth(add(next, T, x)) < H.draft * 0.9);
    if (this.aground) this.u = -0.6 * Math.sign(this.u || 1); else this.pos = next;
    this.t += dt;
  }
  /* the boat's frame in 4D (x, y, z, w), heeled: where a point given as (along T, across e1, across e2, up) goes */
  frame(y0 = 0) {
    const to4 = (v) => [v[0], 0, v[1], v[2]], UP = [0, 1, 0, 0], T = to4(this.T), E1 = to4(this.e1), E2 = to4(this.e2);
    const ph = Math.hypot(...this.h), hh = ph > 1e-9 ? add(sc(E1, this.h[0] / ph), E2, this.h[1] / ph) : E1;
    const rot = (v) => { const a = dot(v, hh), b = dot(v, UP); return add(add(v, hh, a * (Math.cos(ph) - 1) + b * Math.sin(ph)), UP, -a * Math.sin(ph) + b * (Math.cos(ph) - 1)); };
    const O = [this.pos[0], y0, this.pos[1], this.pos[2]], A = [T, rot(E1), rot(E2), rot(UP)];
    return { O, A, at: (l) => add(O, A.reduce((s, ax, i) => add(s, ax, l[i]), [0, 0, 0, 0])) };
  }
  /* the shapes the shader draws (capsules: ends, radius, part — 1 the hull colour, 2 white, 4 dark), ≤ 24 */
  parts() {
    const f = this.frame(), caps = [], B = this.B;
    for (const h of B.hulls) caps.push({ a: f.at([-h.L / 2, h.o[0], h.o[1], 0]), b: f.at([h.L / 2, h.o[0], h.o[1], 0]), r: h.r, m: 1 });
    if (B.hulls.length > 1) for (const h of B.hulls) caps.push({ a: f.at([0.1, 0, 0, 0.32]), b: f.at([0.1, h.o[0], h.o[1], h.r * 0.7]), r: 0.06, m: 2 }); // the beams
    caps.push({ a: f.at([-0.35, 0, 0, 0.3]), b: f.at([0.45, 0, 0, 0.3]), r: 0.13, m: 4 }); // the hub the cat sits on
    caps.push({ a: f.at([-0.45, 0, 0, 0.3]), b: f.at([-0.7, 0, 0, -0.25]), r: 0.03, m: 2 }); // the rudder post
    caps.push({ a: f.at([-0.7, 0, 0, -0.1]), b: f.at([-0.7, ...this.w.map((x) => -0.6 * x / (1.2 / RMIN) * 0.25), -0.45]), r: 0.05, m: 4 }); // the rudder, turned
    const far = [1e4, -1e4, 1e4, 1e4];
    return { tori: [{ c: far, e1: [1, 0, 0, 0], e2: [0, 0, 1, 0], R: 0.01, r: 0.001 }, { c: far, e1: [1, 0, 0, 0], e2: [0, 0, 1, 0], R: 0.01, r: 0.001 }], caps, f };
  }
}
/* the camera's frame for a heading T and the across direction e1: R (right), F (forward), N (the direction your slice
   can't see: ana), in 4D, N chosen so (R, F, N) has the camera's handedness, as TAILSPIN's camFrame */
export function camFrame(T, e1, e2) {
  const to4 = (v) => [v[0], 0, v[1], v[2]], R = to4(e1), F = to4(T); let N = to4(e2);
  const det = R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
  if (det < 0) N = N.map((v) => -v);
  return { R, F, N, ana: [N[0], N[2], N[3]] };
}
export function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
