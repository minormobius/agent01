/* Standing and walking on a 3D floor, no DOM: the gait panel's numbers.

   Gravity is along −y, so the floor is the 3D space (x, z, w) and every point here is a floor point [x, z, w]. A body
   rests on point feet only while its centre of mass is over the convex hull of the feet on the floor, and that hull is
   a solid only if the feet span all three floor directions: four feet not in one plane, at least. Fewer, or four in a
   plane, make a flat support (a triangle, a line, a point), and the body is free to tip across it: 3 − dim of the
   support's directions are uncaught, and only a dynamic gait (falling and catching, as we walk) gets across them.
     hull(P)              the feet's support: its dimension (0–3) and, if solid, its faces { n, c } (n·p ≤ c inside)
     margin(h, p)         how far p is inside (negative: outside), metres
     cheb(h)              the deepest point of a solid support and its depth (Chebyshev's centre, by linear programming)
     swayTo(h, p0, need)  the least move of the centre of mass from p0 that puts it `need` inside, or null
     analyse(plan)        stand, creep (lift one foot at a time) and the plan's alternating halves, judged
     tailReach(pitch)     which of the three tipping planes a tail raised `pitch` above the horizontal can push against
   The tipping planes all contain up (xy, zy, wy), so every tipping turn is y ∧ h for some horizontal h: one plane at a
   time. A tail of direction u swung with velocity v ⊥ u pushes back in the plane u ∧ v, and its tipping part is
   (u_y v_k − v_y u_k) for k = x, z, w. Held level it reaches pitch only; raised, all three, sideways in proportion to how
   high. A double rotation (two planes at once, which righting in mid-air can need) is never u ∧ v: one tail can't. */

const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), len = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const EPS = 1e-9;

/* symmetric 3×3 eigenvalues (Jacobi), for the spread of a set of points */
function eig3(A) {
  const a = A.map((r) => r.slice());
  for (let s = 0; s < 50; s++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(a[p][q]) < 1e-300) continue;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - sn * y; a[k][q] = sn * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - sn * y; a[q][k] = sn * x + c * y; }
  }
  return [a[0][0], a[1][1], a[2][2]].sort((x, y) => x - y);
}
/* the support: its dimension (how many floor directions the feet span, to a millimetre) and, when solid, its faces */
export function hull(P) {
  if (!P.length) return { dim: -1, faces: [], P };
  const m = [0, 1, 2].map((k) => P.reduce((s, p) => s + p[k], 0) / P.length), C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => P.reduce((s, p) => s + (p[i] - m[i]) * (p[j] - m[j]), 0) / P.length));
  const dim = eig3(C).filter((e) => Math.sqrt(Math.max(e, 0)) > 1e-3).length;
  if (dim < 3) return { dim, faces: [], P };
  const faces = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    let n = cross(sub(P[j], P[i]), sub(P[k], P[i])); const L = len(n); if (L < 1e-12) continue; n = n.map((x) => x / L);
    let c = dot(n, P[i]), side = P.map((p) => dot(n, p) - c);
    if (side.every((s) => s <= 1e-9)) {} else if (side.every((s) => s >= -1e-9)) { n = n.map((x) => -x); c = -c; } else continue;
    if (!faces.some((f) => len(sub(f.n, n)) < 1e-9 && Math.abs(f.c - c) < 1e-9)) faces.push({ n, c });
  }
  return { dim, faces, P };
}
export const margin = (h, p) => (h.dim < 3 ? -Infinity : Math.min(...h.faces.map((f) => f.c - dot(f.n, p))));

/* Chebyshev's centre: maximize r with n·p + r ≤ c on every face. The optimum sits where four constraints are tight, so
   try every four (a support has a handful of faces) */
function solve4(M, b) {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null; [A[p], A[c]] = [A[c], A[p]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[4] / r[i]);
}
export function cheb(h) {
  if (h.dim < 3) return { r: 0, p: null };
  const F = h.faces; let best = { r: -Infinity, p: null };
  for (let a = 0; a < F.length; a++) for (let b = a + 1; b < F.length; b++) for (let c = b + 1; c < F.length; c++) for (let d = c + 1; d < F.length; d++) {
    const s = solve4([a, b, c, d].map((i) => [...F[i].n, 1]), [a, b, c, d].map((i) => F[i].c));
    if (!s || s[3] <= best.r) continue;
    const p = s.slice(0, 3); if (F.every((f) => dot(f.n, p) + s[3] <= f.c + 1e-9)) best = { r: s[3], p };
  }
  return best;
}
/* the least sway: project p0 onto the support shrunk by `need` (Dykstra's alternating projections onto its faces) */
export function swayTo(h, p0, need) {
  if (h.dim < 3 || cheb(h).r < need) return null;
  let x = p0.slice(); const inc = h.faces.map(() => [0, 0, 0]);
  for (let it = 0; it < 3000; it++) {
    const before = x.slice();
    h.faces.forEach((f, i) => {
      const y = x.map((v, k) => v + inc[i][k]), e = dot(f.n, y) - (f.c - need), z = e > 0 ? y.map((v, k) => v - e * f.n[k]) : y;
      inc[i] = y.map((v, k) => v - z[k]); x = z;
    });
    if (it > 8 && len(sub(x, before)) < 1e-12) break; // settled
  }
  return margin(h, x) >= need - 1e-7 ? { p: x, d: len(sub(x, p0)) } : null;
}

/* the leg plans the panel compares. Feet are floor points [x, z, w], metres; com is the centre of mass's floor point */
const D = Math.PI / 180, ring = (x, r, degs) => degs.map((a) => [x, r * Math.cos(a * D), r * Math.sin(a * D)]);
export function plans(cat) { // cat: { feet, labels, com, comTail, tailFoot, five: { feet, labels, com } } from the cat itself (cat.js)
  const c4 = cat.feet.slice(0, 4), cl = cat.labels.slice(0, 4);
  return [
    { id: "cat", name: "the cat", legs: 4, feet: c4, labels: cl, com: cat.com, halves: { name: "trot", sets: [[0, 3], [1, 2]] }, about: "hips turned: front legs across z, hind legs across w" },
    { id: "aligned", name: "hips aligned", legs: 4, feet: [[0.16, 0.088, 0], [0.16, -0.088, 0], [-0.16, 0.088, 0], [-0.16, -0.088, 0]], labels: ["front +z", "front −z", "hind +z", "hind −z"], com: [0, 0, 0], about: "both pairs across z, as ours are" },
    { id: "tail", name: "tail as a foot", legs: 5, feet: [...c4, cat.tailFoot], labels: [...cl, "tail"], com: cat.comTail || cat.com, about: "the cat with its tail planted behind" },
    cat.five ? { id: "five", name: "five legs", legs: 5, feet: cat.five.feet, labels: cat.five.labels, com: cat.five.com, about: "the five-legged cat: a pair in front across z, three behind round z and w, no side of their triangle along z (turn them 90° and lifting one lays the other four in a plane)" }
      : { id: "five", name: "five legs", legs: 5, feet: [[0.16, 0.09, 0], [0.16, -0.09, 0], ...ring(-0.16, 0.1, [0, 120, 240])], labels: ["front +z", "front −z", "hind 0°", "hind 120°", "hind 240°"], com: [0, 0, 0], about: "a pair in front across z, three behind round z and w, no two of them in line with the front pair (turn them 90° and lifting one lays the other four in a plane)" },
    { id: "six", name: "six legs", legs: 6, feet: [...ring(0.16, 0.1, [0, 120, 240]), ...ring(-0.16, 0.1, [60, 180, 300])], labels: ["front 0°", "front 120°", "front 240°", "hind 60°", "hind 180°", "hind 300°"], com: [0, 0, 0], halves: { name: "alternate threes", sets: [[0, 2, 4], [1, 3, 5]] }, about: "three round each hip, the back three turned 60°" },
    { id: "eight", name: "eight legs", legs: 8, feet: [...ring(0.16, 0.1, [0, 90, 180, 270]), ...ring(-0.16, 0.1, [0, 90, 180, 270])], labels: ["front +z", "front +w", "front −z", "front −w", "hind +z", "hind +w", "hind −z", "hind −w"], com: [0, 0, 0], halves: { name: "alternate fours", sets: [[0, 2, 5, 7], [1, 3, 4, 6]] }, about: "four round each hip; each half is the cat's own stance" },
  ];
}

/* the judgment: standing on all feet; creeping (each foot lifted alone, the body swaying first); the alternating halves */
export const NEED = 0.01; // a stance counts as static with the centre of mass at least 1 cm inside
export function judge(feet, com, need = NEED) {
  const h = hull(feet), m = margin(h, com), c = cheb(h), s = h.dim === 3 ? (m >= need ? { p: com, d: 0 } : swayTo(h, com, need)) : null;
  return { dim: h.dim, free: Math.max(0, 3 - h.dim), margin: m, depth: c.r, sway: s, ok: !!s, hull: h };
}
export function analyse(plan, need = NEED) {
  const stand = judge(plan.feet, plan.com, need);
  const creep = plan.feet.map((_, i) => ({ lift: [i], label: `lift ${plan.labels[i]}`, ...judge(plan.feet.filter((_, k) => k !== i), plan.com, need) }));
  const halves = plan.halves ? plan.halves.sets.map((set) => ({ down: set, label: `${plan.halves.name}: ${set.map((k) => plan.labels[k]).join(", ")} down`, ...judge(set.map((k) => plan.feet[k]), plan.com, need) })) : [];
  const swayMax = Math.max(0, ...creep.map((c) => (c.sway ? c.sway.d : 0)));
  return { stand, creep, halves, canStand: stand.ok, canCreep: stand.ok && creep.every((c) => c.ok), swayMax, halvesStatic: halves.length ? halves.every((h) => h.ok) : null };
}

/* a tail raised `pitch` (radians) above the horizontal, pointing back: the tipping turns it can push against by being
   swung. Returns the rank (how many of the three tipping planes) and the strengths (singular values, per unit swing) */
export function tailReach(pitch) {
  const u = [-Math.cos(pitch), Math.sin(pitch), 0, 0]; // [x, y, z, w]
  const vs = [[Math.sin(pitch), Math.cos(pitch), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; // swings: every direction ⊥ u
  const T = (v) => [0, 2, 3].map((k) => u[1] * v[k] - v[1] * u[k]); // its tipping part in xy, zy, wy
  const M = vs.map(T), MtM = [0, 1, 2].map((i) => [0, 1, 2].map((j) => M.reduce((s, r) => s + r[i] * r[j], 0)));
  const sv = eig3(MtM).map((e) => Math.sqrt(Math.max(0, e))).reverse();
  // per tipping plane (xy, zy, wy): the most a unit swing can push against it
  const reach = [0, 1, 2].map((k) => Math.sqrt(M.reduce((s, r) => s + r[k] * r[k], 0)));
  return { rank: sv.filter((s) => s > 1e-9).length, sv, reach };
}
