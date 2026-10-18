/* Cascade — snake on snake on snake: the geometry, headless.

   Every snake here is a tube with volume and a tiled skin, and every skin is
   the same tiling: the world's (duct.js), because the world is your body
   (ouro.js). So one game state draws every layer:

     layer 0  the world: the skin swept along the world's own centreline
              (which is exactly Molt's rounded tube; the selftest checks it)
     layer 1  you: the same skin, a third the size, swept along a spine that
              runs through your body's cells on layer 0, lifted so the tube
              lies on the surface
     layer 2  you again, on your own skin, at the very same cells
     ...      as above, so below

   To sweep the skin along any spine, every point of the world's tube is
   given TUBE COORDINATES: which piece of the centreline it's nearest (one
   piece per cube, so per cell of you), how far along it (t), and its
   direction from it (phi from the way ahead, theta round from the snake's
   up). A spine is anything that, for a piece and a t, gives a place, the way
   ahead and an up; the tube of radius r round it puts every skin point back.

   The snake's up is the normal of the world it lies on (that's how Molt
   reads a body), so on a spine the up is the surface normal under it, and on
   the world's centreline it is the up the word carries cube to cube. */
import { centreline, cellPoint, VEC } from "./duct.js";

export const K_ = { R0: 0.42, DEPTH: 4 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function rotate(v, k, ang) { const c = Math.cos(ang), s = Math.sin(ang); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); }
/* the rotation taking frame (T0, U0) to (T1, U1), as an axis and an angle */
export function frameTurn(T0, U0, T1, U1) {
  const L0 = cross(U0, T0), L1 = cross(U1, T1);
  // R = B1 · B0ᵀ with columns T, U, L
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => T1[i] * T0[j] + U1[i] * U0[j] + L1[i] * L0[j]));
  const tr = R[0][0] + R[1][1] + R[2][2], ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  if (ang < 1e-9) return { axis: [0, 0, 1], ang: 0 };
  let axis = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  if (Math.hypot(...axis) < 1e-6) {                       // a half turn: the axis is the column of R + I with the most in it
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (R[i][j] + (i === j ? 1 : 0)) / 2)), i = [0, 1, 2].reduce((b, c) => (M[c][c] > M[b][b] ? c : b), 0);
    axis = M[i];
  }
  return { axis: norm(axis), ang };
}
const ortho = (U, T) => norm(sub(U, mul(T, dot(U, T))));

/* ---- the world's centreline as a spine: each cube's piece, its frame carried from the way it was entered (din, uin)
   to the way it's left (dout, and the next cube's up), turning smoothly round the bend */
export function worldSpine(W) {
  const line = centreline(W), L = W.L;
  const turns = line.map((pc, k) => {
    const T0 = VEC[W.din[k]], U0 = VEC[W.uin[k]], T1 = VEC[W.dout[k]], U1 = VEC[W.uin[Math.min(L - 1, k + 1)]];
    return k === 0 || k === L - 1 ? null : frameTurn(T0, U0, T1, U1);
  });
  const at = (k, t) => {
    const pc = line[k];
    let p, T;
    if (pc.O) { const a = t * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); p = [0, 1, 2].map((i) => pc.O[i] + 0.5 * (c * pc.ea[i] + s * pc.eb[i])); T = norm([0, 1, 2].map((i) => -s * pc.ea[i] + c * pc.eb[i])); }
    else { p = lerp(pc.a, pc.b, t); T = k === 0 ? VEC[W.dout[0]] : VEC[W.din[k]]; }
    const tr = turns[k], U0 = VEC[W.uin[k]];
    const U = tr ? ortho(rotate(U0, tr.axis, tr.ang * t), T) : ortho(U0, T);
    return { p, T, U };
  };
  return { n: L, at, line };
}

/* ---- tube coordinates of the world's skin: every corner of every cell, and every cell's middle */
export function tubeCoords(W, spine = worldSpine(W)) {
  const C = W.C, line = spine.line, nearest = (k, x) => {
    let best = null;
    for (let j = Math.max(0, k - 2); j <= Math.min(line.length - 1, k + 2); j++) {
      const pc = line[j];
      let t;
      if (pc.O) { const v = sub(x, pc.O); t = Math.max(0, Math.min(Math.PI / 2, Math.atan2(dot(v, pc.eb), dot(v, pc.ea)))) / (Math.PI / 2); }
      else { const d = sub(pc.b, pc.a), L2 = dot(d, d); t = L2 ? Math.max(0, Math.min(1, dot(sub(x, pc.a), d) / L2)) : 0; }
      const f = spine.at(j, t), d2 = dot(sub(x, f.p), sub(x, f.p));
      if (!best || d2 < best.d2 - 1e-12) best = { j, t, f, d2 };
    }
    const n = norm(sub(x, best.f.p)), { T, U } = best.f, Lv = cross(U, T);
    return [best.j, best.t, Math.acos(Math.max(-1, Math.min(1, dot(n, T)))), Math.atan2(dot(n, Lv), dot(n, U))];
  };
  const G = C + 1, grid = new Float64Array(W.faces.length * G * G * 4), mid = new Float64Array(W.N * 4);
  W.faces.forEach((F, f) => {
    for (let i = 0; i <= C; i++) for (let j = 0; j <= C; j++) grid.set(nearest(F.k, cellPoint(W, f * C * C, i, j)), ((f * G + i) * G + j) * 4);
    for (let c = f * C * C; c < (f + 1) * C * C; c++) mid.set(nearest(F.k, cellPoint(W, c, 0.5, 0.5)), c * 4);
  });
  return { grid, mid, G };
}

/* a point of the tube of radius r round a spine, from tube coordinates; and the outward direction there */
export function sweep(spine, r, k, t, phi, theta, out) {
  const { p, T, U } = spine.at(k, t), Lv = cross(U, T), sp = Math.sin(phi), cp = Math.cos(phi), ct = Math.cos(theta), st = Math.sin(theta);
  const d = [cp * T[0] + sp * (ct * U[0] + st * Lv[0]), cp * T[1] + sp * (ct * U[1] + st * Lv[1]), cp * T[2] + sp * (ct * U[2] + st * Lv[2])];
  if (out) { out.n = d; }
  return [p[0] + r * d[0], p[1] + r * d[1], p[2] + r * d[2]];
}

/* ---- a spine through a body's cells on a layer: Q, the cells' middles lifted off the skin by the new tube's radius,
   and N, the skin's normals under them; both head first. Piece k (tail to head) runs through cell n−1−k: half a piece
   at each end, and between, a curve from the middle of one joint to the middle of the next, bending at the cell */
export function bodySpine(Q, N) {
  const n = Q.length, q = Q.slice().reverse(), m = N.slice().reverse();
  const M = (k) => lerp(q[k], q[k + 1], 0.5), MN = (k) => norm(lerp(m[k], m[k + 1], 0.5));
  const at = (k, t) => {
    let p, d, u;
    if (n === 1) { p = q[0]; d = [1, 0, 0]; u = m[0]; }
    else if (k === 0) { p = lerp(q[0], M(0), t); d = sub(M(0), q[0]); u = lerp(m[0], MN(0), t); }
    else if (k === n - 1) { p = lerp(M(n - 2), q[n - 1], t); d = sub(q[n - 1], M(n - 2)); u = lerp(MN(n - 2), m[n - 1], t); }
    else {
      const a = M(k - 1), b = q[k], c = M(k), s = 1 - t;
      p = [0, 1, 2].map((i) => s * s * a[i] + 2 * s * t * b[i] + t * t * c[i]);
      d = [0, 1, 2].map((i) => 2 * s * (b[i] - a[i]) + 2 * t * (c[i] - b[i]));
      if (Math.hypot(...d) < 1e-12) d = sub(c, a);
      const na = MN(k - 1), nc = MN(k);
      u = [0, 1, 2].map((i) => s * s * na[i] + 2 * s * t * m[k][i] + t * t * nc[i]);
    }
    const T = norm(d);
    return { p, T, U: ortho(u, T) };
  };
  return { n, at };
}

/* ---- the stack: layer 0 the world, each next layer the body laid on the one before.
   Each layer: { spine, r, pts (every skin corner), mid (every cell's middle), nrm (its outward normal) }.
   heads[j] is where layer j's head is; heads[depth] goes one further, towards the point the zoom falls into. */
export function buildStack(W, body, depth = K_.DEPTH, coords = tubeCoords(W)) {
  const C = W.C, s = 1 / C, layers = [], heads = [];
  const nCells = W.N, G = coords.G, nPts = W.faces.length * G * G;
  // a layer's skin has a piece per cube of the world; a body shorter than the world (only at the very start) lies on its head end
  const off = W.L - body.length;
  let spine = worldSpine(W), r = K_.R0;
  for (let j = 0; j <= depth; j++) {
    const shift = j === 0 ? 0 : off, ok = (k) => k - shift >= 0;
    const pts = new Float64Array(nPts * 3), mid = new Float64Array(nCells * 3), nrm = new Float64Array(nCells * 3), live = new Uint8Array(nCells);
    const o = {};
    if (j < depth) {
      for (let i = 0; i < nPts; i++) {
        const k = coords.grid[i * 4]; if (!ok(k)) continue;
        pts.set(sweep(spine, r, k - shift, coords.grid[i * 4 + 1], coords.grid[i * 4 + 2], coords.grid[i * 4 + 3]), i * 3);
      }
    }
    const cellsNeeded = j < depth ? null : new Set([body[0]]);
    for (let c = 0; c < nCells; c++) {
      if (cellsNeeded && !cellsNeeded.has(c)) continue;
      const k = coords.mid[c * 4]; if (!ok(k)) continue;
      mid.set(sweep(spine, r, k - shift, coords.mid[c * 4 + 1], coords.mid[c * 4 + 2], coords.mid[c * 4 + 3], o), c * 3); nrm.set(o.n, c * 3); live[c] = 1;
    }
    const layer = { spine, r, pts, mid, nrm, live, j };
    const P = (c) => [mid[c * 3], mid[c * 3 + 1], mid[c * 3 + 2]], Nn = (c) => [nrm[c * 3], nrm[c * 3 + 1], nrm[c * 3 + 2]];
    if (j < depth) layers.push(layer);
    // the next layer: your body on this one, a tube a third the size lying on the skin
    const r2 = r * s;
    if (body.some((c) => !live[c]) && j < depth) { break; }
    const Q = body.map((c) => add(P(c), mul(Nn(c), r2))), N = body.map(Nn);
    heads.push(Q[0]);
    if (j === depth) break;
    spine = bodySpine(Q, N); r = r2;
  }
  return { layers, heads, s, C, G };
}
