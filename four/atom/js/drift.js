/* A charge in 4D fields (no DOM): what drift golf (four/drift/) plays on, and the plasma page's single-particle facts.
   Units with q/m = 1: dv/dt = E + F v − γ v, F the magnetic bivector as a 4×4 antisymmetric matrix acting on the
   velocity (F[i][j] v[j]), E an electric push, γ a drag (collisions with the gas, so a pushed charge comes to rest).

   Two facts the game is built on, checked by the selftest:
   - In a two-plane field (Pf F ≠ 0) F is invertible, and a charge with no push stays within 2|v|/min(|a|, |b|) of where
     it started, for ever: x(t) = x₀ + F⁻¹(e^{Ft} − 1)v₀. There are no field lines to run along. A uniform 4D magnet of
     two planes is a perfect bottle, where ours leaks out of its ends.
   - Under a steady push the charge drifts at v_d = −(F − γ)⁻¹E: at right angles to the push within each plane when γ is
     small, at |E|/a in the first plane and |E|/b in the second (the weaker plane drifts faster). In a one-plane field a
     push along the field's free sheet (its kernel) isn't turned at all, and with no drag it runs away. */

export const zero4 = () => [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
export function bivector(planes) { // {xy: 2, zw: 1, …} → F
  const F = zero4(), idx = { x: 0, y: 1, z: 2, w: 3 };
  for (const [k, v] of Object.entries(planes)) { const i = idx[k[0]], j = idx[k[1]]; F[i][j] += v; F[j][i] -= v; }
  return F;
}
export const pf = (F) => F[0][1] * F[2][3] - F[0][2] * F[1][3] + F[0][3] * F[1][2];
const mv = (A, x) => A.map((r) => r[0] * x[0] + r[1] * x[1] + r[2] * x[2] + r[3] * x[3]);
/* solve A x = b (4×4, partial pivoting) */
export function solve4(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 4; c++) { let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[p], M[c]] = [M[c], M[p]]; if (Math.abs(M[c][c]) < 1e-14) return null; for (let r = c + 1; r < 4; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  const x = [0, 0, 0, 0]; for (let r = 3; r >= 0; r--) { let s = M[r][4]; for (let k = r + 1; k < 4; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; } return x;
}
/* the steady drift under push E with drag γ: v = −(F − γ)⁻¹E (null when it doesn't exist: no drag, and E along a
   one-plane field's free sheet, where the charge runs away) */
export function driftVelocity(F, E, gamma) { const A = F.map((r, i) => r.map((v, j) => v - (i === j ? gamma : 0))); const x = solve4(A, E); return x && x.map((v) => -v); }
/* one RK4 step of the motion; field(x) gives F at a place, push the E acting */
export function step(s, field, E, gamma, dt) {
  const f = (x, v) => { const F = field(x), Fv = mv(F, v); return [v, [0, 1, 2, 3].map((i) => E[i] + Fv[i] - gamma * v[i])]; };
  const add = (a, b, h) => a.map((q, i) => q + h * b[i]);
  const [k1x, k1v] = f(s.x, s.v), [k2x, k2v] = f(add(s.x, k1x, dt / 2), add(s.v, k1v, dt / 2)), [k3x, k3v] = f(add(s.x, k2x, dt / 2), add(s.v, k2v, dt / 2)), [k4x, k4v] = f(add(s.x, k3x, dt), add(s.v, k3v, dt));
  return { x: s.x.map((q, i) => q + (dt / 6) * (k1x[i] + 2 * k2x[i] + 2 * k3x[i] + k4x[i])), v: s.v.map((q, i) => q + (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i])) };
}

/* ------------------------------------------------------------------ drift golf's course and strokes (no DOM) */
/* a hole: a grid of tiles (proof: a way round in par, found by `solvable` and replayed by the selftest, degrees and
   strengths), (rows of letters, each a field from `kinds`), the tee and the cup in the (x, y) green (one unit
   a tile), par. A tile letter names a field; "." is no field, "#" a wall */
export const KINDS = {
  ".": { name: "bare", F: {} },
  r: { name: "rough", F: { xy: 3, zw: 1.5 } }, // two planes, the green's own plane stiff: pushes turn sideways, slowly
  s: { name: "soft rough", F: { xy: 1, zw: 2.5 } }, // two planes, the green's plane weak: turned sideways, fast
  R: { name: "back rough", F: { xy: -3, zw: 1.5 } }, // turns the other way
  h: { name: "highway", F: { zw: 3 } }, // one plane, out of the green: the green is its free sheet, pushes go straight
  t: { name: "slant", F: { xz: 2.4, yw: 1.2 } }, // two planes, each half in the green and half out: pushes drift off the green
  l: { name: "left", F: { xy: 2, zw: 2 } }, // all left: a = b, every circle a great circle
  "#": { name: "wall", F: {}, wall: true },
};
export const HOLES = [
  { name: "Plain", rows: ["..........", "..........", "..........", ".........."], tee: [1.5, 2], cup: [8.5, 2], par: 1, proof: [[0, 0.65]], note: "No field: the ball goes where it's pushed." },
  { name: "Sideways", rows: ["rrrrrrrrrr", "rrrrrrrrrr", "rrrrrrrrrr", "rrrrrrrrrr", "rrrrrrrrrr"], tee: [2, 0.8], cup: [2.2, 4.2], par: 2, proof: [[165, 1], [125, 1]], note: "A field of two planes, its stiff one the green's own: a push turns nearly a right angle." },
  { name: "Stiff and soft", rows: ["rrrrrsssss", "rrrrrsssss", "rrrrrsssss", "rrrrrsssss"], tee: [1, 3], cup: [9, 1], par: 3, proof: [[65, 1], [50, 1], [0, 0.8]], note: "The same turn, but the right half's green plane is weak: there the ball drifts three times as far." },
  { name: "Highway", rows: ["rrrrrrrrrr", "rrrrrrrrrr", "hhhhhhhhhh", "rrrrrrrrrr", "rrrrrrrrrr"], tee: [0.8, 4.2], cup: [9.2, 2.5], par: 2, proof: [[30, 1], [0, 0.5]], note: "The middle row's field is one plane, all out of the green, so the green is its free sheet: a push there isn't turned." },
  { name: "The slant", rows: ["rrrrrrrrrr", "rrrtttttrr", "rrrtttttrr", "rrrrrrrrrr"], tee: [1, 2], cup: [9, 2], par: 3, proof: [[0, 1], [355, 1], [160, 1]], note: "The slant's planes are half in the green, half out: drift there carries the ball off into z and w. Bring it back by drifting the other way." },
  { name: "Two turns", rows: ["rrrrrRRRRR", "rrrrrRRRRR", "rrrrrRRRRR", "rrrrrRRRRR", "rrrrrRRRRR"], tee: [1, 4], cup: [9, 4], par: 3, proof: [[80, 1], [85, 1], [180, 0.5]], note: "The right half's field turns the other way." },
  { name: "Left", rows: ["llllllllll", "llllllllll", "lll####lll", "llllllllll", "llllllllll"], tee: [1, 1], cup: [9, 4], par: 2, proof: [[95, 1], [55, 1]], note: "An all-left field: its two planes turn at the same rate." },
];
export const GAMMA = 0.5, PUSH_T = 1.2, EMAX = 5, CUP_R = 0.32, OFF = 1.25;
export function fieldOf(hole) {
  const cache = new Map(), H = hole.rows.length, W = hole.rows[0].length;
  const at = (c) => { if (!cache.has(c)) cache.set(c, bivector(KINDS[c].F)); return cache.get(c); };
  return { W, H, kind: (x, y) => { const i = Math.floor(x), j = Math.floor(H - y); return i < 0 || j < 0 || i >= W || j >= H ? "#" : hole.rows[j][i]; }, F: (p) => at((() => { const i = Math.floor(p[0]), j = Math.floor(H - p[1]); return i < 0 || j < 0 || i >= W || j >= H ? "." : hole.rows[j][i]; })()) };
}
/* one stroke from a rest position: push at angle θ (in the green) with strength s ∈ [0, 1] for PUSH_T, then coast until
   the ball is nearly still. Walls and the green's edge bounce it. Returns the path (sampled), where it ended, whether it
   dropped in the cup (in the green's plane within CUP_R and within CUP_R of the green in z and w) or left the green (z or
   w past OFF) */
export function stroke(hole, from, theta, s, { dt = 0.01, every = 3, tmax = 30 } = {}) {
  const G = fieldOf(hole), E = [Math.cos(theta) * s * EMAX, Math.sin(theta) * s * EMAX, 0, 0], path = [];
  let st = { x: from.slice(), v: [0, 0, 0, 0] }, t = 0, n = 0, holed = false, off = false;
  while (t < tmax) {
    const push = t < PUSH_T ? E : [0, 0, 0, 0], nx = step(st, G.F, push, GAMMA, dt);
    // walls and the green's edge: reflect the in-green velocity component that crossed
    for (const k of [0, 1]) { const lim = k === 0 ? G.W : G.H; if (nx.x[k] < 0.05 || nx.x[k] > lim - 0.05) { nx.x[k] = Math.min(lim - 0.05, Math.max(0.05, nx.x[k])); nx.v[k] = -nx.v[k] * 0.6; } }
    if (G.kind(nx.x[0], nx.x[1]) === "#") { const bx = G.kind(st.x[0], nx.x[1]) === "#", by = G.kind(nx.x[0], st.x[1]) === "#"; nx.x = st.x.slice(); nx.v = st.v.slice(); if (bx || !by) nx.v[1] *= -0.6; if (by || !bx) nx.v[0] *= -0.6; }
    st = nx; t += dt;
    if (n++ % every === 0) path.push([...st.x, t]);
    if (Math.hypot(st.x[0] - hole.cup[0], st.x[1] - hole.cup[1]) < CUP_R && Math.abs(st.x[2]) < CUP_R && Math.abs(st.x[3]) < CUP_R) { holed = true; break; }
    if (Math.abs(st.x[2]) > OFF || Math.abs(st.x[3]) > OFF) { off = true; break; }
    if (t > PUSH_T && Math.hypot(...st.v) < 0.01) break;
  }
  path.push([...st.x, t]);
  return { path, end: st.x, holed, off, t };
}
/* the course's own check: a coarse search for a way round in par (angles every 5°, strengths in tenths), keeping the
   best few positions after each stroke */
export function solvable(hole, { beam = 6, angles = 72, strengths = [0.2, 0.35, 0.5, 0.65, 0.8, 1] } = {}) {
  let front = [{ x: [...hole.tee, 0, 0], plays: [] }];
  for (let k = 0; k < hole.par; k++) {
    const next = [];
    for (const f of front) for (let a = 0; a < angles; a++) for (const s of strengths) {
      const r = stroke(hole, f.x, (2 * Math.PI * a) / angles, s, { every: 1000 });
      const plays = [...f.plays, [a * (360 / angles), s]];
      if (r.holed) return { plays, strokes: k + 1 };
      if (!r.off) next.push({ x: r.end, plays, d: Math.hypot(r.end[0] - hole.cup[0], r.end[1] - hole.cup[1]) + 2 * (Math.abs(r.end[2]) + Math.abs(r.end[3])) });
    }
    next.sort((a, b) => a.d - b.d); front = [];
    for (const n of next) { if (front.length >= beam) break; if (front.every((f) => Math.hypot(f.x[0] - n.x[0], f.x[1] - n.x[1]) > 0.4)) front.push(n); }
  }
  return null;
}
