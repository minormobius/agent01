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

/* the numbers the geometry chapter states, for its generator */
export function numbers() {
  const per = {};
  for (const d of [1, 2, 3, 4]) per[d] = { area: sphereArea(d), volume: ballVolume(d), doubling: 2 ** (d - 1), atTen: spread(d, 10), ballInCube: ballInCube(d), skin10: skin(d, 0.1), meanAbsCos: d > 1 ? meanAbsCos(d) : 1, within30: d > 1 ? capShare(d, Math.PI / 6) : 0.5, kissing: KISSING[d], packing: packing(d), turnPlanes: turnPlanes(d), turnRates: turnRates(d) };
  return { per, tesseract: [0, 1, 2, 3].map((k) => cubeParts(4, k)), cube: [0, 1, 2].map((k) => cubeParts(3, k)), d10: { skin10: skin(10, 0.1), ballInCube: ballInCube(10), meanAbsCos: meanAbsCos(10) } };
}
