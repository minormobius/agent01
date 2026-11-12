// The Hopf habitat's physics: a hollow 3-sphere spun at equal rates in two orthogonal planes. No DOM; the page draws
// what this computes and test/habitat.selftest.mjs holds it to the page's claims.
//
// Spin a body in four dimensions with the same rate ω in two orthogonal planes (an isoclinic rotation): x(t) = e^{ωtJ}x,
// J the complex structure J(a, b, c, d) = (−b, a, −d, c), J² = −1. Then every point's acceleration is ω²J²x = −ω²x:
// centripetal, straight at the centre, ω²|x| for EVERY point. In the turning frame the centrifugal field is exactly
// radial. So a hollow 3-sphere hull of radius R has the same spin gravity ω²R, pointing straight "down" (outward), on
// every square metre of its floor: no poles, no axis, no endcaps. In 3D the hairy-ball theorem forbids it (a turning
// 2-sphere has two still poles); the 3-sphere can be combed, along the Hopf circles that J's flow runs on.
//
// Units: metres, seconds. "Up" in the habitat is toward the centre; "spinward" is J·x̂, along the Hopf circle.

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2], a[3] + k * b[3]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k, a[3] * k];
export const norm = (a) => Math.sqrt(dot(a, a));
export const unit = (a) => scale(a, 1 / norm(a));
/** the complex structure: multiplication by i on (a + ib, c + id). J² = −1, and J is a rotation. */
export const J = (x) => [-x[1], x[0], -x[3], x[2]];

/** Spin for gravity g at radius R: ω = √(g/R), its period, and the floor's speed. */
export function spin(R, g) {
  const omega = Math.sqrt(g / R);
  return { omega, period: (2 * Math.PI) / omega, rim: omega * R };
}

/** e^{aJ}x: turn x by angle a in both planes at once. */
export const turn = (x, a) => add(scale(x, Math.cos(a)), J(x), Math.sin(a));

/** Acceleration of a free object in the turning frame: centrifugal ω²x plus Coriolis −2ωJv. (No Euler term: ω is
 *  steady.) */
export const accel = (x, v, w) => add(scale(x, w * w), J(v), -2 * w);

/**
 * A free flight inside the hull, exactly. Seen from outside (not turning) the object moves in a straight line, with
 * the velocity it had relative to the floor plus the floor's own, ωJx. In the turning frame that line is turned back
 * by e^{−ωtJ}. It lands where the line meets |x| = R (the turn keeps lengths, so the inertial line's crossing is the
 * landing). Returns { tLand, at(t), vel(t), land }.
 */
export function flight(x0, v0, w, R) {
  const vi = add(v0, J(x0), w);                 // inertial velocity
  const a = dot(vi, vi), b = 2 * dot(x0, vi), c = dot(x0, x0) - R * R;
  const disc = b * b - 4 * a * c;
  const tLand = a > 0 && disc >= 0 ? (-b + Math.sqrt(disc)) / (2 * a) : Infinity;
  const at = (t) => turn(add(x0, vi, t), -w * t);
  const vel = (t) => { const xi = add(x0, vi, t); return add(turn(vi, -w * t), J(turn(xi, -w * t)), -w); };
  return { tLand, at, vel, land: Number.isFinite(tLand) ? at(tLand) : null, inertialSpeed: Math.sqrt(a) };
}

/** RK4 in the turning frame, for checking `flight`: step until it reaches the floor (bisecting the last step). */
export function integrate(x0, v0, w, R, dt = 1e-3) {
  let x = x0.slice(), v = v0.slice(), t = 0;
  const f = (x, v) => [v, accel(x, v, w)];
  for (let i = 0; i < 1e7; i++) {
    const [k1x, k1v] = f(x, v);
    const [k2x, k2v] = f(add(x, k1x, dt / 2), add(v, k1v, dt / 2));
    const [k3x, k3v] = f(add(x, k2x, dt / 2), add(v, k2v, dt / 2));
    const [k4x, k4v] = f(add(x, k3x, dt), add(v, k3v, dt));
    const xn = x.map((xi, j) => xi + (dt / 6) * (k1x[j] + 2 * k2x[j] + 2 * k3x[j] + k4x[j]));
    const vn = v.map((vj, j) => vj + (dt / 6) * (k1v[j] + 2 * k2v[j] + 2 * k3v[j] + k4v[j]));
    if (norm(xn) >= R) {   // crossed the floor in this step: linear fraction is plenty at this dt
      const r0 = norm(x), r1 = norm(xn), s = (R - r0) / (r1 - r0);
      return { tLand: t + s * dt, land: add(x, add(xn, x, -1), s) };
    }
    x = xn; v = vn; t += dt;
  }
  return null;
}

/** The floor's own frame at a point: down = x̂ (outward), spinward f = Jx̂, and two more directions e, Je spanning the
 *  rest of the floor ("across the spin"). J turns e into Je: the plane across the spin is a complex line. */
export function floorFrame(xhat) {
  const f = J(xhat);
  let e = null;
  for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
    let v = add(ax, xhat, -dot(ax, xhat));
    v = add(v, f, -dot(v, f));
    if (norm(v) > 0.3) { e = unit(v); break; }
  }
  return { down: xhat, f, e, Je: J(e) };
}

/** A displacement d written in the floor's frame at x̂: along the spin, across it (two parts) and vertical. */
export function decompose(xhat, d) {
  const F = floorFrame(xhat);
  return { spinward: dot(d, F.f), across: [dot(d, F.e), dot(d, F.Je)], down: dot(d, F.down) };
}

/** Apparent weight (the floor's push, per unit mass) on something moving along the floor at velocity vRel relative to
 *  it: its inertial velocity is vRel + ωJx, and any path on a sphere of radius R needs |v|²/R toward the centre. */
export function weight(x, vRel, w) {
  const vi = add(vRel, J(x), w), R = norm(x);
  return dot(vi, vi) / R;
}

/** Hoop stress of a thin hull, as the specific stress σ/ρ, when its floor's load is g per unit mass of hull:
 *  a cylinder (O'Neill) σ/ρ = gR; a 2-sphere under even pressure gR/2; the Hopf 3-sphere gR/3. In general a thin
 *  (n−1)-sphere shell in n dimensions under even load carries σ = pR/((n−1)t). */
export const hoopStress = { cylinder: (g, R) => g * R, hopf: (g, R) => (g * R) / 3 };
/** The biggest hull of a material (σ/ρ in J/kg) at gravity g, the hull carrying only itself: cylinder σ/(ρg), Hopf
 *  3σ/(ρg). */
export const maxRadius = { cylinder: (s, g) => s / g, hopf: (s, g) => (3 * s) / g };
export const MATERIALS = [
  { name: 'structural steel', s: 500e6 / 7850 },
  { name: 'titanium alloy', s: 1000e6 / 4430 },
  { name: 'Kevlar', s: 3.6e9 / 1440 },
];

/** Gravity across the floor, as a fraction of its best, at "latitude" lat (0 at the spin's equator): a 2-sphere spun
 *  in one plane gets ω²R cos(lat); the Hopf habitat gets 1 everywhere. */
export const floorGravity = { sphere3: (lat) => Math.cos(lat), hopf: () => 1 };

/** The Hopf map S³ → S²: every point of one spin circle (a Hopf circle, e^{θJ}x) maps to the same point. */
export function hopf(x) {
  const [a, b, c, d] = x;
  return [2 * (a * c + b * d), 2 * (b * c - a * d), a * a + b * b - c * c - d * d];
}

/** Walk on the floor: move the point x̂ (unit) a distance s along the unit floor direction m, carrying the frame vectors
 *  with it (parallel transport along the great circle). Returns the new x̂ and the carried vectors. */
export function walk(xhat, m, s, R, vectors) {
  const th = s / R, c = Math.cos(th), sn = Math.sin(th);
  const x2 = add(scale(xhat, c), m, sn);
  const m2 = add(scale(m, c), xhat, -sn);
  const carried = vectors.map((v) => { const a = dot(v, m); return add(v, add(m2, m, -1), a); });
  return { xhat: unit(x2), vectors: orthonormalTo(unit(x2), carried) };
}
/** Gram–Schmidt the vectors against x̂ and each other (keeps a walked frame exact over a long walk). */
export function orthonormalTo(xhat, vs) {
  const out = [];
  for (let v of vs) {
    v = add(v, xhat, -dot(v, xhat));
    for (const u of out) v = add(v, u, -dot(v, u));
    out.push(unit(v));
  }
  return out;
}

/** Towers on the floor: the 24-cell's 24 vertices (evenly spread over S³), turned off the axes. */
export function towers() {
  const v = [];
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const p = [0, 0, 0, 0]; p[i] = s; v.push(p); }
  for (let k = 0; k < 16; k++) v.push([0, 1, 2, 3].map((i) => ((k >> i) & 1 ? -0.5 : 0.5)));
  // a fixed turn so none stands where you start
  const t = (p) => { let q = p; const pl = [[0, 2, 0.41], [1, 3, 0.73], [0, 1, 0.29], [2, 3, 0.53]];
    for (const [a, b, th] of pl) { const c = Math.cos(th), s = Math.sin(th), qa = q[a], qb = q[b]; q = q.slice(); q[a] = c * qa - s * qb; q[b] = s * qa + c * qb; }
    return q; };
  return v.map(t);
}

/** Road circles: the Hopf circles over the 12 vertices of an icosahedron on the base 2-sphere. */
export function roads() {
  const p = (1 + Math.sqrt(5)) / 2, v = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) { v.push([0, s1, s2 * p], [s1, s2 * p, 0], [s2 * p, 0, s1]); }
  return v.map((x) => { const m = Math.hypot(...x); return x.map((c) => c / m); });
}
