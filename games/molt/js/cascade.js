/* Cascade — snake on snake on snake: the geometry, headless.

   Every snake here is a tube with volume and a tiled skin, and every skin is
   the same tiling, because the world is your body (ouro.js) and every layer
   is the same snake. So one game state draws every layer:

     layer 0  the world: its skin round the world's centreline
     layer 1  you: the same skin, a third the size, round a spine that runs
              through your body's cells on layer 0, lifted so the tube lies on
              the surface
     layer 2  you again, on your own skin, at the very same cells
     ...      as above, so below

   THE SKIN is drawn by name, not by where the world's bends put its cells.
   Every cell of the world has a name on the skin (ouro.js namesOf): which
   cube of the body (one per cell of you), which wall (up, down, left, right,
   or a cap at either end), and where on it. So here every cube is a cube:
   four walls of C × C cells and, at the ends, a cap, each cell a fixed patch
   of a fixed segment of the snake, laid round the spine at its place along
   it; the spine does all the bending. A snake slithers by its skin sliding
   along its path, and since a patch of skin never changes its name, the
   slide is continuous. (On the world itself a bend moves cells from the
   inside of a turn to the outside; drawn by name, the inside of a bend is
   simply squeezed, as a real snake's is.)

   A wall cell's place on its cube is a point on the cube's square cross
   section, pushed out round the spine (the gnomonic projection: as Molt
   rounds its tube); past the end of a snake, a point of the cap or the last
   half cube is pushed out round the end, which makes it a dome.

   The snake's up is the normal of the world it lies on (that's how Molt
   reads a body), so on a spine the up is the surface normal under it, and on
   the world's centreline it is the up the word carries cube to cube. */
import { centreline, VEC, buildDuct } from "./duct.js";
import { namesOf } from "./ouro.js";

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
/* an up square to the way ahead; where the blend of the skin's normals runs along the way ahead (a body crossing a
   slot, where the skin folds right over), fall back to the normal of the cell itself, then to any square direction */
function upFrom(u, T, ...fallbacks) {
  for (const v of [u, ...fallbacks]) { const w = sub(v, mul(T, dot(v, T))); if (Math.hypot(w[0], w[1], w[2]) > 1e-3) return norm(w); }
  const a = Math.abs(T[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm(cross(T, a));
}

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

/* ---- a spine through a body's cells on a layer: Q, the cells' middles lifted off the skin by the new tube's radius,
   and N, the skin's normals under them; both head first. Piece k (tail to head) runs through cell n−1−k: half a piece
   at each end, and between, a curve from the middle of one joint to the middle of the next, bending at the cell */
export function bodySpine(Q, N) {
  const n = Q.length, q = Q.slice().reverse(), m = N.slice().reverse();
  const M = (k) => lerp(q[k], q[k + 1], 0.5), MN = (k) => { const v = lerp(m[k], m[k + 1], 0.5); return Math.hypot(v[0], v[1], v[2]) > 1e-6 ? norm(v) : m[k]; };
  const at = (k, t) => {
    let p, d, u, own;
    if (n === 1) { p = q[0]; d = [1, 0, 0]; u = m[0]; own = m[0]; }
    else if (k === 0) { p = lerp(q[0], M(0), t); d = sub(M(0), q[0]); u = lerp(m[0], MN(0), t); own = m[0]; }
    else if (k === n - 1) { p = lerp(M(n - 2), q[n - 1], t); d = sub(q[n - 1], M(n - 2)); u = lerp(MN(n - 2), m[n - 1], t); own = m[n - 1]; }
    else {
      const a = M(k - 1), b = q[k], c = M(k), s = 1 - t;
      p = [0, 1, 2].map((i) => s * s * a[i] + 2 * s * t * b[i] + t * t * c[i]);
      d = [0, 1, 2].map((i) => 2 * s * (b[i] - a[i]) + 2 * t * (c[i] - b[i]));
      if (Math.hypot(...d) < 1e-12) d = sub(c, a);
      const na = MN(k - 1), nc = MN(k);
      u = [0, 1, 2].map((i) => s * s * na[i] + 2 * s * t * m[k][i] + t * t * nc[i]); own = m[k];
    }
    const T = norm(d);
    return { p, T, U: upFrom(u, T, own) };
  };
  return { n, at };
}

/* ---- where along a spine: u runs 0 … n−1 from the tail's middle to the head's, a unit a piece (the end pieces are
   halves; cube k spans k − ½ … k + ½). Every spine here is built so, so a skin can slide along one by a fraction. */
export function atU(spine, u) {
  const n = spine.n;
  if (n === 1) return spine.at(0, 0);
  u = Math.max(0, Math.min(n - 1, u));
  if (u <= 0.5) return spine.at(0, u / 0.5);
  if (u >= n - 1.5) return spine.at(n - 1, (u - (n - 1.5)) / 0.5);
  const k = Math.floor(u + 0.5);
  return spine.at(k, u - k + 0.5);
}
/* ---- the skin by name: for every cell, its cube and the four corners and middle of its patch, as points (x along,
   y up, z left) on that cube's own square cross section, from −½ to ½ */
const SLOT = [(a, r) => [a, 0.5, r], (a, r) => [a, -0.5, -r], (a, r) => [a, -r, 0.5], (a, r) => [a, r, -0.5]];
export function skinOf(W, names) {
  const C = W.C, CC = C * C, per = 5 * CC, cube = new Int32Array(W.N), at = new Float64Array(W.N * 5 * 3), h = 0.5 / C;
  for (let c = 0; c < W.N; c++) {
    const key = names.key[c], k = Math.floor(key / per), rest = key % per, s = Math.floor(rest / CC), a0 = (Math.floor((rest % CC) / C) + 0.5) / C - 0.5, r0 = ((rest % C) + 0.5) / C - 0.5;
    const place = s < 4 ? SLOT[s] : (a, r) => [k === 0 ? -0.5 : 0.5, a, r];
    cube[c] = k;
    [[a0 - h, r0 - h], [a0 + h, r0 - h], [a0 + h, r0 + h], [a0 - h, r0 + h], [a0, r0]].forEach(([a, r], i) => at.set(place(a, r), (c * 5 + i) * 3));
  }
  return { cube, at };
}
/* a point of cube k's cross section (x, y, z), on a tube of radius r round a spine of n pieces, the skin slid along by
   shift: round the spine at its place along it, or past an end, round the end */
function onTube(spine, r, n, k, x, y, z, shift, out) {
  let u = k + x, d;
  const tail = k === 0 && x < 0, head = k === n - 1 && x > 0;
  if (tail || head) u = k;
  const { p, T, U } = atU(spine, u + shift), Lv = cross(U, T);
  if (tail || head) { const m = Math.hypot(x, y, z) || 1; d = [x / m, y / m, z / m]; }
  else { const m = Math.hypot(y, z) || 1; d = [0, y / m, z / m]; }
  const v = [d[0] * T[0] + d[1] * U[0] + d[2] * Lv[0], d[0] * T[1] + d[1] * U[1] + d[2] * Lv[1], d[0] * T[2] + d[1] * U[2] + d[2] * Lv[2]];
  if (out) out.n = v;
  return [p[0] + r * v[0], p[1] + r * v[1], p[2] + r * v[2]];
}

/* ---- the stack: layer 0 the world, each next layer the body laid on the one before.
   Each layer: { spine, r, pts (each cell's four corners), mid (its middle), nrm (outward there), live }.
   heads[j] is where layer j+1's head is; the last goes one layer further, towards the point the zoom falls into.

   motion (optional) draws the stack part way (motion.f) through a step. The world slithers along its own path: its
   skin slides along a spine with one more cube at its tail end (motion.world: where it was before the step). Each
   body's segment moves from the cell it lay on before the step (motion.from) to the one it lies on now: the next one
   along when it simply slithered, wherever the world re-laid it when a bend swept under it. */
export function buildStack(W, body, depth = K_.DEPTH, skin = skinOf(W, namesOf(W, "skin")), motion = null) {
  const C = W.C, s = 1 / C, layers = [], heads = [], n = body.length, N = W.N;
  const moving = !!(motion && motion.world && motion.from && motion.from.length === n), shift = moving ? motion.f : 0, f = shift;
  const from = moving ? motion.from.map((c, i) => (c >= 0 ? c : body[i])) : body, path = moving ? [...new Set([...body, ...from])] : body;
  // a layer has a piece per cube of the world; a body shorter than the world (only at the very start) lies on its head end
  const off = W.L - n;
  let spine = moving ? motion.world : worldSpine(W), r = K_.R0, slide = shift;
  const o = {};
  for (let j = 0; j <= depth; j++) {
    const drop = j === 0 ? 0 : off, pieces = j === 0 ? W.L : n;
    const pts = new Float64Array(N * 12), mid = new Float64Array(N * 3), nrm = new Float64Array(N * 3), live = new Uint8Array(N);
    const want = j < depth ? null : new Set(path);
    for (let c = 0; c < N; c++) {
      if (want && !want.has(c)) continue;
      const k = skin.cube[c] - drop; if (k < 0) continue;
      const A = skin.at, b = c * 15;
      // the world's tail cube straightens as it slides (it was bent where it lay; a tail has no bend): ease that in
      const fix = moving && j === 0 && k === 0, put = (x, y, z, out) => {
        const p = onTube(spine, r, pieces, k, x, y, z, slide, out);
        if (!fix) return p;
        const o1 = {}, o2 = {}, a1 = onTube(spine, r, pieces, k, x, y, z, 1, o1), a2 = onTube(motion.now, r, pieces, k, x, y, z, 0, o2);
        if (out) out.n = norm(add(out.n, mul(sub(o2.n, o1.n), f)));
        return add(p, mul(sub(a2, a1), f));
      };
      mid.set(put(A[b + 12], A[b + 13], A[b + 14], o), c * 3); nrm.set(o.n, c * 3); live[c] = 1;
      if (!want) for (let i = 0; i < 4; i++) pts.set(put(A[b + i * 3], A[b + i * 3 + 1], A[b + i * 3 + 2]), c * 12 + i * 3);
    }
    if (j < depth) layers.push({ spine, r, pts, mid, nrm, live, j });
    if (path.some((c) => !live[c])) break;
    // the next layer: your body on this one, a tube a third the size lying on the skin
    const r2 = r * s, P = (c) => [mid[c * 3], mid[c * 3 + 1], mid[c * 3 + 2]], Nn = (c) => [nrm[c * 3], nrm[c * 3 + 1], nrm[c * 3 + 2]];
    const Qc = (c) => add(P(c), mul(Nn(c), r2));
    const next = moving
      ? bodySpine(body.map((c, i) => lerp(Qc(from[i]), Qc(c), f)), body.map((c, i) => norm(lerp(Nn(from[i]), Nn(c), f))))
      : bodySpine(body.map(Qc), body.map(Nn));
    heads.push(atU(next, n - 1).p);
    spine = next; r = r2; slide = 0;
  }
  return { layers, heads, s, C };
}

/* the motion of a game's last step, if it was one the stack can slither through (a plain step, nothing cut): the world
   as it was with the new head cube on it, laid where it lay, and the cells the body lay on before, found on the new
   world by name */
export function motionOf(g) {
  const L = g.last, n = g.body.length;
  if (!L || L.kind !== "step" || L.cut || n < 2 || g.opts.anchor !== "path" || L.prevBody.length !== n) return null;
  const P = L.prev, world = worldSpine(buildDuct(P.word + L.tok, P.C, { pos: P.P[0], f: P.dout[0], u: P.uin[0] }));
  const from = L.prevBody.map((c) => { const c2 = g.names.at.get(L.prevNames.key[c]); return c2 === undefined ? -1 : c2; });
  return { world, from, now: worldSpine(g.world) };
}
