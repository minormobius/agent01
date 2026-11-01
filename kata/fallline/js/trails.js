/* FALL LINE's trails, hill and downhill, no DOM.

   A LEVEL is a tree of trails down a hill. Each trail is a run of segments as TAILSPIN's courses are, { len, r, dir,
   twist, grade }: dir is the bend's direction in the rider's frame (0 right, 90 ana, 180 left, 270 kata), and grade is
   how fast it drops (0.1: ten centimetres a metre). The first trail starts at the top; every other starts on a trail
   already made ({ from: i, at: metres along it }), heading the way that trail heads, its frame that trail's frame, so a
   fork is two ways out of one place and the rider's frame carries straight on into either. Every trail ends at the
   bottom: there is more than one way down.

   THE HILL is made around the trails. Their heights, spread out over the ground (inverse-distance weights over the
   trails' points, on a coarse grid then smoothed up to one sample a metre), with a little lumpiness away from them,
   rising to valley walls where the stadium ends. Then the trails are benched into it, as real trails are: within the
   radius R the ground is the trail's own height (level across, falling along), easing back to the hill over SHOULDER.
   The heights and the trails' field (distance to the nearest centreline; which trail, how far along) are what the
   shader draws and what the physics rides: one sample a metre over the ground (x, z, w), read trilinearly by both.

   DOWNHILL: speed along the bike's heading changes as
       dv/dt = −g·grade − c_rr·g − k·v² (+ the cat pedalling, below V_PEDAL),
   c_rr rolling resistance (0.015 on a trail, 0.09 on the rough hillside), k the cat's drag (tuned so a 10% slope runs
   at about 5 m/s: a game choice, labelled). */
import { bendAt, lengthOf, DS, G } from "../../tailspin/js/course.js";

export const BOX = [240, 160, 80], HN = [241, 161, 81]; // the ground (metres; longer than Lean's stadium, for a descent) and its samples (one a metre, ends included)
export const BASIN = { c: [120, 80, 40], a: [114, 74, 34] }; // the valley: an ellipsoid over (x, z, w), walls rising past 0.8 of the way out
export const SHOULDER = 2.5; // m: where a trail's bench eases back into the hill
export const PHYS = { crrOn: 0.015, crrOff: 0.09, k: 0.035, vPedal: 2.4, aPedal: 1.6, vMin: 0.6 };
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => sc(a, 1 / Math.hypot(...a)), cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/* the grade asked for at distance s along a segment list (a segment's own, or the trail's) */
function gradeAt(segs, s, g0) { let s0 = 0; for (const g of segs) { if (s < s0 + g.len || g === segs[segs.length - 1]) return g.grade ?? g0; s0 += g.len; } return g0; }

/* integrate one trail from a start (point, height, frame) */
function integrate(tr, start, g0) {
  const L = lengthOf(tr.segs), n = Math.round(L / DS);
  let { p, y, T, e1, e2 } = start;
  const out = { pts: [p], y: [y], fr: [{ T, e1, e2 }], bend: [bendAt(tr.segs, 0)], grade: [gradeAt(tr.segs, 0, g0)] };
  for (let i = 1; i <= n; i++) {
    const kv = (s) => { const b = bendAt(tr.segs, s); return add(sc(e1, b[0]), e2, b[1]); };
    const k0 = kv((i - 0.5) * DS), Tm = unit(add(T, k0, DS / 2)), gr = gradeAt(tr.segs, (i - 0.5) * DS, g0);
    p = add(p, Tm, DS); y -= gr * DS;
    T = unit(add(T, k0, DS)); e1 = add(e1, T, -DS * dot(k0, e1)); e2 = add(e2, T, -DS * dot(k0, e2));
    e1 = unit(add(e1, T, -dot(e1, T))); e2 = unit(add(add(e2, T, -dot(e2, T)), e1, -dot(e2, e1)));
    out.pts.push(p); out.y.push(y); out.fr.push({ T, e1, e2 }); out.bend.push(bendAt(tr.segs, i * DS)); out.grade.push(gr);
  }
  out.len = n * DS; return out;
}
/* the 24 rotations that keep the grid's axes, proper (so ana stays ana) */
const ROTS = (() => {
  const out = [], perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const pm of perms) for (let sg = 0; sg < 8; sg++) { const rows = pm.map((j, i) => { const r = [0, 0, 0]; r[j] = sg & (1 << i) ? -1 : 1; return r; }); if (dot(cross(rows[0], rows[1]), rows[2]) > 0) out.push(rows); }
  return out;
})();
const basinE = (q) => Math.hypot((q[0] - BASIN.c[0]) / BASIN.a[0], (q[1] - BASIN.c[1]) / BASIN.a[1], (q[2] - BASIN.c[2]) / BASIN.a[2]);

/* build a level's trails: integrated, turned (one of the 24 grid-keeping rotations, the best fit) and centred in the
   stadium; heights so the lowest end is at 2 m. { trails: [{ pts, y, fr, bend, grade, len, from, at, leaf }], R, fit } */
export function buildTrails(level) {
  const R = level.R ?? 3, g0 = level.grade ?? 0.1, T0 = [1, 0, 0], e10 = [0, 1, 0], trails = [];
  for (const [i, tr] of level.trails.entries()) {
    let start;
    if (tr.from == null) start = { p: [0, 0, 0], y: 0, T: T0, e1: e10, e2: cross(e10, T0) };
    else { const P = trails[tr.from], k = Math.min(P.pts.length - 1, Math.round(tr.at / DS)); start = { p: P.pts[k], y: P.y[k], ...P.fr[k] }; }
    trails.push({ ...integrate(tr, start, tr.grade ?? g0), from: tr.from ?? null, at: tr.at ?? 0, id: i });
  }
  for (const t of trails) t.leaf = true; // every trail runs to the bottom: a trail with others forking off it is still a way down
  // turn and centre: the rotation whose fit (the largest of the basin measure over every trail point, widened by R + a
  // margin for the hill around) is smallest
  const all = trails.flatMap((t) => t.pts.filter((_, i) => i % 10 === 0));
  let best = null, bs = Infinity, mid = null;
  for (const Q of ROTS) {
    const q = all.map((p) => Q.map((r) => dot(r, p))), m = [0, 1, 2].map((j) => (Math.min(...q.map((v) => v[j])) + Math.max(...q.map((v) => v[j]))) / 2);
    let e = 0; for (const v of q) e = Math.max(e, Math.hypot((Math.abs(v[0] - m[0]) + R + 4) / BASIN.a[0], (Math.abs(v[1] - m[1]) + R + 4) / BASIN.a[1], (Math.abs(v[2] - m[2]) + R + 4) / BASIN.a[2]));
    if (e < bs) { bs = e; best = Q; mid = m; }
  }
  const rot = (v) => best.map((r) => dot(r, v)), shift = [0, 1, 2].map((j) => BASIN.c[j] - mid[j]);
  const ylo = Math.min(...trails.map((t) => Math.min(...t.y)));
  for (const t of trails) { t.pts = t.pts.map((p) => add(rot(p), shift)); t.fr = t.fr.map((f) => ({ T: rot(f.T), e1: rot(f.e1), e2: rot(f.e2) })); t.y = t.y.map((y) => y - ylo + 2); }
  // nowhere too near itself: points of different stretches (or of different trails away from where they fork) apart
  let near = Infinity; const samp = trails.flatMap((t) => t.pts.map((p, i) => ({ p, t: t.id, s: i * DS })).filter((_, i) => i % 10 === 0));
  for (let a = 0; a < samp.length; a++) for (let b = a + 1; b < samp.length; b++) {
    const A = samp[a], Bq = samp[b]; if (A.t === Bq.t && Math.abs(A.s - Bq.s) < 4 * R + 8) continue;
    if (A.t !== Bq.t) { const fa = forkDist(trails, A, Bq); if (fa < 35) continue; } // (a fork's two ways are close for a while)
    near = Math.min(near, Math.hypot(A.p[0] - Bq.p[0], A.p[1] - Bq.p[1], A.p[2] - Bq.p[2]));
  }
  return { trails, R, fit: { inBasin: bs, clearance: near, ok: bs < 0.9 && near > 2 * R + 1 } };
}
/* how far two points of different trails are from where those trails meet (along the trails): a fork's two ways are
   allowed to be close near it */
function forkDist(trails, A, B) {
  const chain = (t, s) => { const c = []; let id = t, at = s; while (id != null) { c.push({ id, s: at }); const T = trails[id]; at = T.at; id = T.from; } return c; };
  const ca = chain(A.t, A.s), cb = chain(B.t, B.s);
  // the first trail both chains pass through: the distance along it between where each chain leaves it, plus how far
  // each point is out along its own chain from there
  const along = (c, k, s) => { let d = 0; for (let j = 0; j < k; j++) d += j === 0 ? s : trails[c[j - 1].id].at; return d; };
  for (let a = 0; a < ca.length; a++) { const b = cb.findIndex((q) => q.id === ca[a].id); if (b >= 0) return Math.abs(ca[a].s - cb[b].s) + (a ? A.s : 0) + (b ? B.s : 0); }
  return Infinity;
}

/* ------------------------------------------------------------------ the hill */
function vnoise(x, z, w, seed) {
  const h = (a, b, c) => { let n = (Math.imul(a + 7, 73856093) ^ Math.imul(b + 11, 19349663) ^ Math.imul(c + 13, 83492791) ^ Math.imul(seed, 374761393)) >>> 0; n ^= n >>> 13; n = Math.imul(n, 0x5bd1e995) >>> 0; n ^= n >>> 15; return (n >>> 0) / 4294967296; };
  const ix = Math.floor(x), iz = Math.floor(z), iw = Math.floor(w), fx = x - ix, fz = z - iz, fw = w - iw, s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fz), q = s(fw);
  let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += h(ix + a, iz + b, iw + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? q : 1 - q);
  return r;
}
/* bake the hill and the trails' field: H (heights, HN samples), F (pairs: distance to the nearest centreline, capped
   at 20; that trail's id + its fraction along), L (the steepest slope inside the basin), and for each trail its
   direction along it (rows of BINS + 1, for the kerbs) */
export const BINS = 255;
export function bake(level, built = buildTrails(level), seed = 1) {
  const { trails, R } = built, [NX, NZ, NW] = HN, N = NX * NZ * NW, idx = (x, z, w) => x + NX * (z + NZ * w);
  // the trails' points, densely, with their heights and places
  const dense = []; for (const t of trails) for (let i = 0; i < t.pts.length; i += 2) dense.push({ p: t.pts[i], y: t.y[i], id: t.id, f: (i * DS) / Math.max(t.len, 1e-6) });
  // the trails' field: stamp each point's neighbourhood
  const D = new Float32Array(N).fill(20), ID = new Float32Array(N), TY = new Float32Array(N), reach = R + SHOULDER + 1.5, rr = Math.ceil(reach);
  for (const q of dense) {
    const cx = Math.round(q.p[0]), cz = Math.round(q.p[1]), cw = Math.round(q.p[2]);
    for (let w = Math.max(0, cw - rr); w <= Math.min(NW - 1, cw + rr); w++) for (let z = Math.max(0, cz - rr); z <= Math.min(NZ - 1, cz + rr); z++) for (let x = Math.max(0, cx - rr); x <= Math.min(NX - 1, cx + rr); x++) {
      const d = Math.hypot(x - q.p[0], z - q.p[1], w - q.p[2]), i = idx(x, z, w);
      if (d < D[i]) { D[i] = d; ID[i] = q.id + Math.min(0.999, q.f); TY[i] = q.y; }
    }
  }
  // the hill: the trails' heights spread over a coarse grid (every 4 m) by inverse-distance weights, smoothed up
  const sparse = dense.filter((_, i) => i % 15 === 0), CS = 4, cn = BOX.map((b) => Math.round(b / CS) + 1), C = new Float32Array(cn[0] * cn[1] * cn[2]);
  for (let w = 0; w < cn[2]; w++) for (let z = 0; z < cn[1]; z++) for (let x = 0; x < cn[0]; x++) {
    let sw = 0, sy = 0; const X = x * CS, Z = z * CS, Wq = w * CS;
    for (const q of sparse) { const d2 = (X - q.p[0]) ** 2 + (Z - q.p[1]) ** 2 + (Wq - q.p[2]) ** 2, wt = 1 / (d2 + 36) ** 1.5; sw += wt; sy += wt * q.y; }
    C[x + cn[0] * (z + cn[1] * w)] = sy / sw;
  }
  const coarse = (x, z, w) => { const fx = Math.min(cn[0] - 1.001, x / CS), fz = Math.min(cn[1] - 1.001, z / CS), fw = Math.min(cn[2] - 1.001, w / CS), ix = Math.floor(fx), iz = Math.floor(fz), iw = Math.floor(fw), u = fx - ix, v = fz - iz, s = fw - iw;
    let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += C[ix + a + cn[0] * (iz + b + cn[1] * (iw + c))] * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? s : 1 - s); return r; };
  const H = new Float32Array(N), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let w = 0; w < NW; w++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
    const i = idx(x, z, w), d = D[i], e = basinE([x, z, w]);
    let h = coarse(x, z, w) + 1.6 * (vnoise(x / 17, z / 17, w / 17, seed) - 0.5) * sm(R + SHOULDER, R + SHOULDER + 8, d) + 1.0 * (vnoise(x / 6, z / 6, w / 6, seed + 1) - 0.5) * sm(R + SHOULDER, R + SHOULDER + 4, d);
    h += 28 * sm(0.8, 1.0, e) ** 2; // the valley walls
    if (d < R + SHOULDER) h = TY[i] + (h - TY[i]) * sm(R, R + SHOULDER, d); // the bench: level across, the trail's height
    H[i] = h;
  }
  let L = 0;
  for (let w = 1; w < NW - 1; w++) for (let z = 1; z < NZ - 1; z++) for (let x = 1; x < NX - 1; x++) {
    if (basinE([x, z, w]) > 0.8) continue; // (the valley walls are steeper, but thick: a ray that oversteps into one is still caught)
    const i = idx(x, z, w), gx = (H[i + 1] - H[i - 1]) / 2, gz = (H[i + NX] - H[i - NX]) / 2, gw = (H[i + NX * NZ] - H[i - NX * NZ]) / 2; L = Math.max(L, Math.hypot(gx, gz, gw));
  }
  const F = new Float32Array(N * 2); for (let i = 0; i < N; i++) { F[2 * i] = D[i]; F[2 * i + 1] = ID[i]; }
  const tan = new Float32Array(trails.length * (BINS + 1) * 4);
  for (const t of trails) for (let b = 1; b <= BINS; b++) {
    const k = Math.min(t.fr.length - 1, Math.round((((b - 0.5) / BINS) * t.len) / DS)), T = t.fr[k].T; tan.set([T[0], 0, T[1], T[2]], 4 * (t.id * (BINS + 1) + b));
  }
  return { H, F, L: Math.max(0.4, Math.min(3, L * 1.15)), tan, rows: trails.length, built };
}
/* reading them back (as the GPU does, trilinearly) */
export function sampler(B) {
  const [NX, NZ, NW] = HN;
  const tri = (A, stride, off, g) => {
    const fx = Math.max(0, Math.min(NX - 1.0001, g[0])), fz = Math.max(0, Math.min(NZ - 1.0001, g[1])), fw = Math.max(0, Math.min(NW - 1.0001, g[2]));
    const ix = Math.floor(fx), iz = Math.floor(fz), iw = Math.floor(fw), u = fx - ix, v = fz - iz, s = fw - iw;
    let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += A[stride * (ix + a + NX * (iz + b + NZ * (iw + c))) + off] * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? s : 1 - s);
    return r;
  };
  return { height: (g) => tri(B.H, 1, 0, g), dist: (g) => tri(B.F, 2, 0, g) };
}

/* ------------------------------------------------------------------ downhill */
/* one step of speed: the grade along the heading (dh/ds; negative going down), on a trail or not */
export function speedStep(v, grade, onTrail, dt) {
  let a = -G * grade - (onTrail ? PHYS.crrOn : PHYS.crrOff) * G - PHYS.k * v * v;
  if (v < PHYS.vPedal) a += PHYS.aPedal * (1 - v / PHYS.vPedal) + 0.4; // the cat pedals on the flat and the rises
  return Math.max(PHYS.vMin, v + a * dt);
}
/* the speed a slope settles at, on a trail (for the levels' notes and the selftest) */
export function terminal(grade) { const a = G * (grade - PHYS.crrOn); return a > 0 ? Math.sqrt(a / PHYS.k) : 0; }

/* the routes down: for every trail, the chain from the top to that trail's end, as one polyline (points, frames,
   bends, heights) */
export function routes(built) {
  const { trails } = built, out = [];
  for (const leaf of trails.filter((t) => t.leaf)) {
    const chain = []; let t = leaf; while (t) { chain.unshift(t); t = t.from == null ? null : trails[t.from]; }
    const R = { ids: chain.map((c) => c.id), pts: [], fr: [], bend: [], y: [] };
    for (let k = 0; k < chain.length; k++) {
      const c = chain[k], upto = k + 1 < chain.length ? Math.round(chain[k + 1].at / DS) : c.pts.length - 1;
      for (let i = 0; i <= upto; i++) { if (k > 0 && i === 0) continue; R.pts.push(c.pts[i]); R.fr.push(c.fr[i]); R.bend.push(c.bend[i]); R.y.push(c.y[i]); }
    }
    R.len = (R.pts.length - 1) * DS; out.push(R);
  }
  return out;
}
