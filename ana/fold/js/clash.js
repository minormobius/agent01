// Do two cells pass through each other? No DOM.
//
// A cell is { o, P, H }: the points o + P·u (P three orthonormal 4D columns, u its own 3D coordinates) with
// h.n·u ≤ h.b for every face h (n unit). Two cells' insides meet when some point lies inside both, away from every
// face. `depthCells` finds the deepest such point: the largest s with a common point at least s from each face of
// both cells. s > 0: they pass through each other (two solids crossing in 4D); s = 0: they only touch (along a hinge,
// an edge or a corner); s < 0: apart.
//
// Two hyperplanes in 4D meet in a 2-plane, or coincide. On that 2-plane (or in the shared 3-space) every face becomes
// a line (or plane) constraint g·z + s ≤ h, and the largest s sits where d + 1 of them meet (d = 2 or 3). We try every
// such set: exact up to rounding, with no pivoting to go wrong. (A simplex was tried first and misreported touching
// cells, judged against scipy's HiGHS; this agrees with HiGHS on every case checked.)

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const scale = (a, k) => a.map((v) => v * k);

/** The unit normal of the hyperplane spanned by three 4D directions. */
function normal(P) {
  let best = null;
  for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
    let v = ax.slice(); for (const p of P) v = add(v, p, -dot(v, p) / dot(p, p));
    const l = Math.sqrt(dot(v, v)); if (!best || l > best.l) best = { v: scale(v, 1 / l), l };
  }
  return best.v;
}
/** Solve the square system M x = r (Gaussian elimination with partial pivoting); null if singular. */
function solve(M, r) {
  const n = r.length, A = M.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    if (Math.abs(A[p][c]) < 1e-10) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}
/** max s subject to g·z + s ≤ h for each constraint { g, h } (z ∈ R^d), by trying every vertex. The cells are bounded,
 *  so the optimum is a vertex; −Infinity if there were too few constraints to pin one. */
function maxMargin(C, d) {
  let best = -Infinity; const k = d + 1, idx = [];
  const rec = (start) => {
    if (idx.length === k) {
      const x = solve(idx.map((i) => [...C[i].g, 1]), idx.map((i) => C[i].h)); if (!x) return;
      const s = x[d]; if (s <= best) return; const z = x.slice(0, d);
      for (const c of C) if (dot(c.g, z) + s > c.h + 1e-9) return;
      best = s; return;
    }
    for (let i = start; i < C.length; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  };
  rec(0);
  return best;
}

/** How deep two cells interpenetrate (see the top of the file): > 0 crossing, 0 touching, < 0 apart. */
export function depthCells(A, B) {
  const nB = normal(B.P);
  // A's points o_A + P_A u that also lie in B's hyperplane: g·u = c
  const g = A.P.map((p) => dot(nB, p)), c = dot(nB, add(B.o, A.o, -1)), gl = Math.sqrt(dot(g, g));
  // B's coordinates of a point x in its hyperplane: v = P_Bᵀ (x − o_B)
  const inB = (x) => B.P.map((p) => dot(p, add(x, B.o, -1)));
  if (gl < 1e-9) {
    if (Math.abs(c) > 1e-9) return -1;                    // parallel hyperplanes, apart
    // one hyperplane: constraints on u ∈ R³. B's face n·v ≤ b with v = P_Bᵀ(o_A − o_B) + (P_Bᵀ P_A) u
    const v0 = inB(A.o), R = B.P.map((pb) => A.P.map((pa) => dot(pb, pa)));
    const C = [...A.H.map((h) => ({ g: h.n, h: h.b })), ...B.H.map((h) => ({ g: [0, 1, 2].map((j) => h.n.reduce((s, nk, k) => s + nk * R[k][j], 0)), h: h.b - dot(h.n, v0) }))];
    return maxMargin(C, 3);
  }
  // the 2-plane: u = u0 + α e1 + β e2, with u0 = c g/|g|² and e1, e2 orthonormal across g
  const gn = scale(g, 1 / gl), u0 = scale(gn, c / gl);
  let e1 = Math.abs(gn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; e1 = add(e1, gn, -dot(e1, gn)); e1 = scale(e1, 1 / Math.sqrt(dot(e1, e1)));
  const e2 = [gn[1] * e1[2] - gn[2] * e1[1], gn[2] * e1[0] - gn[0] * e1[2], gn[0] * e1[1] - gn[1] * e1[0]];
  const X = (u) => add(A.o, A.P.reduce((s, p, i) => add(s, p, u[i]), [0, 0, 0, 0]));
  const x0 = X(u0), x1 = add(X(add(u0, e1)), x0, -1), x2 = add(X(add(u0, e2)), x0, -1);
  const v0 = inB(x0), v1 = B.P.map((p) => dot(p, x1)), v2 = B.P.map((p) => dot(p, x2));
  const C = [
    ...A.H.map((h) => ({ g: [dot(h.n, e1), dot(h.n, e2)], h: h.b - dot(h.n, u0) })),
    ...B.H.map((h) => ({ g: [dot(h.n, v1), dot(h.n, v2)], h: h.b - dot(h.n, v0) })),
  ];
  return maxMargin(C, 2);
}

/** A cube of side 1 as a cell: centre o, its three edge directions P (unit). */
export const CUBE_FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((n) => ({ n, b: 0.5 }));
export const cube = (o, P) => ({ o, P, H: CUBE_FACES });
