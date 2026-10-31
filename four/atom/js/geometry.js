/* Geometry, no DOM: what d dimensions of space are like before any physics. Chapter 1's numbers come from here, and the
   selftest checks each against sampling or counting. */

/* Γ(n/2) for a whole number n ≥ 1, exactly: (n/2 − 1)! for even n, √π (n − 2)!!/2^((n−1)/2) for odd */
export function gammaHalf(n) {
  if (n % 2 === 0) { let g = 1; for (let k = 2; k < n / 2; k++) g *= k; return g; }
  let g = Math.sqrt(Math.PI); for (let k = 1; k < n - 1; k += 2) g *= k / 2; return g;
}
/* a sphere of radius r in d dimensions: its surface (the (d − 1)-sphere) and the ball it bounds */
export const sphereArea = (d, r = 1) => ((2 * Math.PI ** (d / 2)) / gammaHalf(d)) * r ** (d - 1);
export const ballVolume = (d, r = 1) => (sphereArea(d, r) * r) / d;
/* something conserved spreading from a point (light, field lines, heat, a gas of particles) crosses each sphere
   whole, so how thinly it's spread at r goes as 1/r^(d − 1): the field of a point, by Gauss, in any dimension */
export const spread = (d, r) => 1 / r ** (d - 1);
/* how much of the cube round a ball the ball fills, and how much of a ball lies in its outer skin */
export const ballInCube = (d) => ballVolume(d) / 2 ** d;
export const skin = (d, f = 0.1) => 1 - (1 - f) ** d;
/* a cube's parts: the k-dimensional faces of a d-cube, C(d, k) 2^(d − k) */
export function cubeParts(d, k) { let c = 1; for (let i = 0; i < k; i++) c = (c * (d - i)) / (i + 1); return c * 2 ** (d - k); }

/* directions: the angle θ between two random directions has density ∝ sin^(d − 2) θ on [0, π] */
export const angleDensity = (d, th) => (Math.sin(th) ** (d - 2) * gammaHalf(d)) / (Math.sqrt(Math.PI) * gammaHalf(d - 1));
export const meanAbsCos = (d) => gammaHalf(d) / (Math.sqrt(Math.PI) * gammaHalf(d + 1));
/* the share of random directions within θ0 of a given one (a cap), by Simpson's rule */
export function capShare(d, th0, n = 2000) { const h = th0 / n; let s = angleDensity(d, 0) + angleDensity(d, th0); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * angleDensity(d, i * h); return (s * h) / 3; }

/* packing: how many equal balls can touch one, and the densest lattice packing (hexagonal in 2D, then D_d: fcc in 3D
   and the 24-cell's lattice in 4D, whose shortest vectors are the 24-cell's corners) */
export const KISSING = { 1: 2, 2: 6, 3: 12, 4: 24 };
export const packing = (d) => (d === 1 ? 1 : d === 2 ? Math.PI / (2 * Math.sqrt(3)) : (ballVolume(d) * (1 / Math.SQRT2) ** d) / 2);
/* D_d's shortest vectors: two entries ±1, the rest 0 */
export function shortestD(d) { const out = []; for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) for (const a of [1, -1]) for (const b of [1, -1]) { const v = new Array(d).fill(0); v[i] = a; v[j] = b; out.push(v); } return out; }

/* flats: in d dimensions an a-flat and a b-flat in general position meet in a (a + b − d)-flat, or miss */
export const meet = (a, b, d) => a + b - d;
/* turning: one number per plane of axes, d(d − 1)/2, and up to ⌊d/2⌋ planes turning at once at their own rates */
export const turnPlanes = (d) => (d * (d - 1)) / 2;
export const turnRates = (d) => Math.floor(d / 2);

/* combing: a flow of unit speed over the 3-sphere, v(x) = Jx with J the quarter turn (x, y, z, w) → (−y, x, −w, z).
   It never vanishes, and its streamlines are the Hopf circles: each a great circle, no two meeting. On the ordinary
   sphere every flow vanishes somewhere (Poincaré–Brouwer, the hairy ball) */
export const J = (p) => [-p[1], p[0], -p[3], p[2]];
/* the Hopf circle through the point (cos η e^{ia}, sin η e^{ib}) of the 3-sphere, as n points */
export const hopfCircle = (eta, a, b, n = 96) => Array.from({ length: n + 1 }, (_, k) => { const t = (2 * Math.PI * k) / n; return [Math.cos(eta) * Math.cos(a + t), Math.cos(eta) * Math.sin(a + t), Math.sin(eta) * Math.cos(b + t), Math.sin(eta) * Math.sin(b + t)]; });
/* stereographic projection of the 3-sphere into our space, from the pole (0, 0, 0, 1) */
export const stereo = (p) => [p[0] / (1 - p[3]), p[1] / (1 - p[3]), p[2] / (1 - p[3])];

/* random walks: on the grid of whole-number points, a step to one of the 2d neighbours at random. Pólya: in 1D and 2D a
   walker comes back home for sure; from 3D on it may never. The chance it does is 1 − 1/G, with G the expected number
   of visits home, G = ∫₀^∞ e^(−t) I₀(t/d)^d dt (Montroll). e^(−x) I₀(x) by its series, or far out its asymptotic form */
export function scaledI0(x) {
  if (x < 18) { let term = 1, sum = 1; const q = (x * x) / 4; for (let k = 1; k < 200; k++) { term *= q / (k * k); sum += term; if (term < 1e-17 * sum) break; } return sum * Math.exp(-x); }
  const y = 1 / x; return (1 + y / 8 + (9 * y * y) / 128 + (225 * y ** 3) / 3072 + (11025 * y ** 4) / 98304) / Math.sqrt(2 * Math.PI * x);
}
export function returnChance(d) {
  if (d <= 2) return 1;
  const T = 1e7, n = 40000, s0 = Math.log(1e-8), s1 = Math.log(T), h = (s1 - s0) / n, f = (s) => { const t = Math.exp(s); return t * scaledI0(t / d) ** d; };
  let G = f(s0) + f(s1); for (let i = 1; i < n; i++) G += (i % 2 ? 4 : 2) * f(s0 + i * h); G *= h / 3;
  const k = d / 2, c = (d / (2 * Math.PI)) ** k; G += c * (T ** (1 - k) / (k - 1) + ((d * d) / 8) * (T ** -k / k)); // the tail, from the asymptotic form
  return 1 - 1 / G;
}
/* simulated: the share of walks home by each step, sampled at steps 1, 2, 4, 8, … (a seeded generator, so repeatable) */
export function walkReturns(d, walks = 2000, steps = 4096, seed = 7) {
  let s = seed >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const first = new Int32Array(steps + 1), p = new Int32Array(d);
  for (let w = 0; w < walks; w++) { p.fill(0); for (let t = 1; t <= steps; t++) { const r = rnd() * 2 * d, a = Math.floor(r / 2); p[a] += r - 2 * a < 1 ? 1 : -1; let home = true; for (let c = 0; c < d; c++) if (p[c]) { home = false; break; } if (home) { first[t]++; break; } } }
  const out = []; let cum = 0; for (let t = 1; t <= steps; t++) { cum += first[t]; if ((t & (t - 1)) === 0 || t === steps) out.push([t, cum / walks]); }
  return out;
}

/* counting in thin shells: the whole-number points with r ≤ |n| < r + 1. Their number grows as the sphere's surface,
   S_d r^(d−1): the count behind thermal physics (states at each speed, light's modes at each frequency) */
export function shellCounts(d, R) {
  const counts = new Array(R + 1).fill(0), n = new Array(d).fill(-R);
  for (;;) { const r = Math.sqrt(n.reduce((t, u) => t + u * u, 0)); if (r < R + 1) counts[Math.floor(r)]++; let c = 0; while (c < d && ++n[c] > R) n[c++] = -R; if (c === d) break; }
  return counts;
}

/* slicing: a tesseract (corners (±1, ±1, ±1, ±1)) cut by the 3D space x·u = h. Each edge crossing it gives one corner of
   the slice; corners lying in it count once */
export function tesseract() { const V = [], E = []; for (let i = 0; i < 16; i++) V.push([0, 1, 2, 3].map((b) => (i & (1 << b) ? 1 : -1))); for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) if (!(i & (1 << b))) E.push([i, i | (1 << b)]); return { V, E }; }
export function sliceCorners(V, E, u, h, eps = 1e-9) {
  const at = V.map((v) => v.reduce((t, x, k) => t + x * u[k], 0) - h), pts = [];
  V.forEach((v, i) => { if (Math.abs(at[i]) < eps) pts.push(v); });
  for (const [a, b] of E) if ((at[a] < -eps && at[b] > eps) || (at[a] > eps && at[b] < -eps)) { const t = at[a] / (at[a] - at[b]); pts.push(V[a].map((x, k) => x + t * (V[b][k] - x))); }
  return pts;
}

/* the Clifford torus: a circle in xy times a circle in zw, both of radius 1/√2, so it lies on the 3-sphere. Its two
   directions are at right angles and equally long everywhere: it is flat. Its diagonals are Hopf circles */
export const clifford = (a, b) => [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)].map((x) => x / Math.SQRT2);

/* the numbers the geometry chapter states, for its generator */
export function numbers() {
  const per = {};
  for (const d of [1, 2, 3, 4]) per[d] = { area: sphereArea(d), volume: ballVolume(d), doubling: 2 ** (d - 1), atTen: spread(d, 10), ballInCube: ballInCube(d), skin10: skin(d, 0.1), meanAbsCos: d > 1 ? meanAbsCos(d) : 1, within30: d > 1 ? capShare(d, Math.PI / 6) : 0.5, kissing: KISSING[d], packing: packing(d), turnPlanes: turnPlanes(d), turnRates: turnRates(d) };
  for (const d of [1, 2, 3, 4]) per[d].returnChance = returnChance(d);
  return { per, tesseract: [0, 1, 2, 3].map((k) => cubeParts(4, k)), cube: [0, 1, 2].map((k) => cubeParts(3, k)), d10: { skin10: skin(10, 0.1), ballInCube: ballInCube(10), meanAbsCos: meanAbsCos(10) }, returnD5: returnChance(5) };
}
