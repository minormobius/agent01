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
  const clear = (v) => { v = add(v, xhat, -dot(v, xhat)); for (const u of out) v = add(v, u, -dot(v, u)); return v; };
  for (const v0 of vs) {
    let v = clear(v0);
    // a vector that was (nearly) in the span of the ones before it: fill the gap from the axes instead
    if (norm(v) < 1e-6) for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { v = clear(ax); if (norm(v) > 0.3) break; }
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

// ------------------------------------------------------------------ riding --
// A track is a closed curve on the floor. Riding it at speed v, the ground must push with F/m = a − g_app, where a is
// the path's acceleration (v² times the curve's second derivative in R⁴, which includes the floor's own curvature) and
// g_app = ω²x − 2ωJv the spin's field. F's part toward the centre is what you weigh; its part sideways (across the
// track, along the floor) is what the tyres must grip, and a bike balances by leaning so its frame lies along F: the
// lean is a vector, sideways/normal, in the two-dimensional plane across the track (kata's rule, tan φ = v²κ/g, as a
// vector). Neither ω²x nor −2ωJv has a part along the track, so the spin never speeds you up or slows you down.

/**
 * A track through the unit 3-sphere: x(θ) = normalise(cos θ·a + sin θ·b + A sin(kθ)·c + B sin(lθ)·d), θ ∈ [0, 2π), with
 * a, b, c, d orthonormal (a = where it starts, b its first direction). A = B = 0 is a great circle. Sampled at N points
 * with arc length (on the unit sphere), unit tangent and second derivative by arc length.
 */
export function makeTrack({ a, b, c, d, A = 0, B = 0, k = 0, l = 0 }, N = 4096) {
  const at = (th) => unit(add(add(add(scale(a, Math.cos(th)), b, Math.sin(th)), c, A * Math.sin(k * th)), d, B * Math.sin(l * th)));
  const P = [], S = [0];
  for (let i = 0; i < N; i++) P.push(at((2 * Math.PI * i) / N));
  for (let i = 1; i <= N; i++) S.push(S[i - 1] + norm(add(P[i % N], P[i - 1], -1)));
  const len = S[N];
  // tangent and second derivative by arc length, central differences on the (nearly even) samples
  const T = [], K = [];
  for (let i = 0; i < N; i++) {
    const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N];
    const h1 = norm(add(p1, p0, -1)), h2 = norm(add(p2, p1, -1));
    T.push(unit(add(p2, p0, -1)));
    const d1 = scale(add(p2, p1, -1), 1 / h2), d0 = scale(add(p1, p0, -1), 1 / h1);
    K.push(scale(add(d1, d0, -1), 2 / (h1 + h2)));
  }
  return { P, S, T, K, len, N, spec: { a, b, c, d, A, B, k, l } };
}

/** The track at arc length σ (unit sphere, wrapped): position, tangent, second derivative, interpolated. */
export function trackAt(tr, sigma) {
  const s = ((sigma % tr.len) + tr.len) % tr.len;
  let lo = 0, hi = tr.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr.S[m] <= s) lo = m; else hi = m; }
  const f = (s - tr.S[lo]) / (tr.S[lo + 1] - tr.S[lo]), j = (lo + 1) % tr.N;
  const mix = (A, B) => add(scale(A, 1 - f), B, f);
  return { x: unit(mix(tr.P[lo], tr.P[j])), t: unit(mix(tr.T[lo], tr.T[j])), k: mix(tr.K[lo], tr.K[j]) };
}

/**
 * What the ground must do for a rider at unit-sphere point u, unit tangent t, curvature vector κ (d²u/dσ²), riding at
 * v m/s (negative: backwards along t) in a habitat of radius R spun at ω. Returns the push toward the centre (what you
 * weigh, m/s²), the sideways push (a vector across the track), the lean (sideways/normal, a vector), its angle, the
 * grip needed (|sideways|/normal), and the push along the track (zero: the spin never drives you).
 */
export function ride(u, t, kappa, v, R, w) {
  const x = scale(u, R), vel = scale(t, v);
  const a = scale(kappa, (v * v) / R);                        // d²x/ds² = κ/R for x = R·u, s = R·σ
  const gApp = add(scale(x, w * w), J(vel), -2 * w);
  const F = add(a, gApp, -1);
  const normal = -dot(F, u), along = dot(F, t);
  const side = add(add(F, t, -along), u, -dot(F, u));
  const lean = scale(side, 1 / normal);
  return { normal, side, lean, angle: Math.atan(norm(lean)), grip: norm(side) / normal, along, spinShare: dot(t, J(u)) };
}

/** The tracks the page offers, built through where you stand (x̂) from your floor frame: the Hopf circle you're on
 *  (spinward), a great circle across the spin, one at 45°, and a slalom that weaves sideways and through w. */
export function tracksAt(xhat) {
  const F = floorFrame(xhat), diag = unit(add(F.f, F.e)), anti = unit(add(F.f, F.e, -1));
  return {
    spin: { a: xhat, b: F.f, c: F.e, d: F.Je },
    across: { a: xhat, b: F.e, c: F.Je, d: F.f },
    diagonal: { a: xhat, b: diag, c: anti, d: F.Je },
    slalom: { a: xhat, b: F.e, c: F.Je, d: F.f, k: 9, l: 5 },   // amplitudes set from R by the page: A, B in metres / R
  };
}

// ------------------------------------------------------------------ the land --
// The shader's terrain, twinned here so the page can map the lakes and lay tracks round them. GLSL's floats are 32-bit,
// so each step rounds through Math.fround; a point within a hair of a lake's edge may still be called differently.
const fr = Math.fround;
const fract = (x) => fr(x - Math.floor(x));
function hash4(p) {
  let a = fract(fr(p[0] * fr(0.1031))), b = fract(fr(p[1] * fr(0.1030))), c = fract(fr(p[2] * fr(0.0973))), d = fract(fr(p[3] * fr(0.1099)));
  const s = fr(fr(fr(a * fr(d + fr(33.33))) + fr(b * fr(c + fr(33.33)))) + fr(fr(c * fr(a + fr(33.33))) + fr(d * fr(b + fr(33.33)))));
  a = fr(a + s); b = fr(b + s); c = fr(c + s); d = fr(d + s);
  return fract(fr(fr(a + b) * fr(c + d)));
}
function n4(x) {
  const i = x.map(Math.floor), f = x.map((v, k) => { const t = fr(v - i[k]); return fr(t * t * fr(3 - 2 * t)); });
  let r = 0;
  for (let k = 0; k < 16; k++) {
    const c = [k & 1, (k >> 1) & 1, (k >> 2) & 1, (k >> 3) & 1];
    let w = 1;
    for (let j = 0; j < 4; j++) w *= c[j] ? f[j] : 1 - f[j];
    r += hash4([i[0] + c[0], i[1] + c[1], i[2] + c[2], i[3] + c[3]]) * w;
  }
  return r;
}
const fbm = (x) => 0.55 * n4(x) + 0.3 * n4(x.map((v) => v * 2.03 + 7.1)) + 0.15 * n4(x.map((v) => v * 4.1 + 3.3));
/** Is the floor at unit point u a lake? (the shader's `m < 0.37`) */
export const WATER = 0.37;
export const isWater = (u) => fbm(u.map((v) => v * 3.2 + 11)) < WATER;

// ------------------------------------------------------------------- the map --
/** The floor seen from where you stand: each point at its walking distance, in the direction you'd walk to reach it,
 *  written in your frame (right, forward, w). The whole habitat fits in a ball of radius πR; the point opposite you is
 *  its rim. (The logarithm of the 3-sphere at x̂.) */
export function mapOf(xhat, [fwd, right, w], u, R) {
  const c = Math.max(-1, Math.min(1, dot(u, xhat))), d = Math.acos(c);
  if (d < 1e-12) return [0, 0, 0];
  const v = add(u, xhat, -c), s = norm(v) || 1, k = (R * d) / s;
  return [k * dot(v, right), k * dot(v, fwd), k * dot(v, w)];
}
/** Its inverse: walk from x̂ along the map's direction for the map's distance. */
export function fromMap(xhat, [fwd, right, w], m, R) {
  const d = Math.hypot(...m) / R;
  if (d < 1e-12) return xhat.slice();
  const dir = unit(add(add(scale(right, m[0]), fwd, m[1]), w, m[2]));
  return add(scale(xhat, Math.cos(d)), dir, Math.sin(d));
}

/** The share of a track's samples over water. */
export function wetness(tr, n = 720) {
  let wet = 0;
  for (let i = 0; i < n; i++) if (isWater(trackAt(tr, (tr.len * i) / n).x)) wet++;
  return wet / n;
}
/** Lay a track of a kind through x̂ on the driest line its freedoms allow. With the spin there's no freedom (it's the
 *  Hopf circle you stand on): it is what it is, bridged where wet. Across the spin, the across-plane has a circle of
 *  directions; at 45°, the same; the slalom also picks how its wiggles lean. Returns { spec, wet, tried }. */
export function layTrack(kind, xhat, R, steps = 24) {
  const F = floorFrame(xhat);
  const turnIn = (a) => [add(scale(F.e, Math.cos(a)), F.Je, Math.sin(a)), add(scale(F.e, -Math.sin(a)), F.Je, Math.cos(a))];
  const specs = [];
  if (kind === 'spin' || kind === 'against') specs.push({ a: xhat, b: F.f, c: F.e, d: F.Je });
  else for (let i = 0; i < steps; i++) {
    const [p, q] = turnIn((2 * Math.PI * i) / steps);
    if (kind === 'across') specs.push({ a: xhat, b: p, c: q, d: F.f });
    else if (kind === 'diagonal') specs.push({ a: xhat, b: unit(add(F.f, p)), c: unit(add(F.f, p, -1)), d: q });
    else specs.push({ a: xhat, b: p, c: q, d: F.f, A: 14 / R, B: 9 / R, k: 9, l: 5 });
  }
  let best = null;
  for (const spec of specs) {
    const tr = makeTrack(spec, 1024), wet = wetness(tr, 360);
    if (!best || wet < best.wet) best = { spec, wet };
    if (wet === 0) break;
  }
  return { ...best, tried: specs.length };
}

/** The towers as landmarks: a letter and a colour each (hue round the wheel), and home where you start. */
export const LANDMARKS = towers().map((p, i) => ({ name: String.fromCharCode(65 + i), p, hue: i / 24 }));
export const HOME = [1, 0, 0, 0];
