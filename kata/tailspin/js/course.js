/* TAILSPIN's courses, no DOM. A course is a run of segments, each a length of track bending one way:
     { len (m), r (bend radius, m; 0 or Infinity for straight), dir (degrees), twist (degrees per metre, optional) }
   `dir` is the way the track bends, which is the way you lean, in the rider's own frame: 0 right, 90 ana (stick up),
   180 left, 270 kata (stick down). The rider's frame is carried along the track without twisting (the camera's "no
   twist"), so a segment's dir is exactly where the stick has to point, and a segment with twist turns the bend's
   direction as you ride it, which is the track's torsion: the stick goes round.

   The centreline is integrated from the start: heading T, and the rider's right e1 and ana e2, carried by
   T′ = κ, e1′ = −(κ·e1) T, e2′ = −(κ·e2) T (κ = (1/r)(cos dir e1 + sin dir e2)), so e1 and e2 never twist about T. Between
   segments the bend eases over EASE metres, so the lean asked for never jumps. Then the whole course is moved so its
   middle sits at the middle of Lean's stadium, and checked: inside the basin with room to spare, and never near itself.

   Coordinates: the ground is (x, z, w), as world.js has it; e2 = e1 × T, which makes e2 the camera's ana when the bike
   is placed with c = e1 (dyn.js Bike.place). */
import { BASIN, basinE, course as polyCourse, VS as VOXEL } from "../../lean/js/world.js";

export const DS = 0.1; // m: the integration step, and the polyline's
export const EASE = 4; // m: how far a change of bend is eased
export const V_CAT = 3; // m/s: the cat bike's speed
export const G = 9.81;
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]), sc = (a, k) => a.map((x) => x * k), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => sc(a, 1 / Math.hypot(...a)), cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const rad = (d) => (d * Math.PI) / 180;

/* the bend asked for at distance s along a segment list, as (κ, dir) in the rider's frame: [kr, ka] = κ (cos dir, sin dir),
   eased from the last segment's over EASE */
export function bendAt(segs, s) {
  let s0 = 0, prev = [0, 0];
  for (const g of segs) {
    if (s < s0 + g.len || g === segs[segs.length - 1]) {
      const k = g.r && isFinite(g.r) ? 1 / g.r : 0, d = rad(g.dir || 0) + rad(g.twist || 0) * (s - s0), here = [k * Math.cos(d), k * Math.sin(d)];
      const e = Math.min(EASE, g.len / 2), f = Math.min(1, (s - s0) / e), sm = f * f * (3 - 2 * f);
      return [prev[0] + (here[0] - prev[0]) * sm, prev[1] + (here[1] - prev[1]) * sm];
    }
    const k = g.r && isFinite(g.r) ? 1 / g.r : 0, d = rad(g.dir || 0) + rad(g.twist || 0) * g.len;
    prev = [k * Math.cos(d), k * Math.sin(d)]; s0 += g.len;
  }
  return prev;
}
export const lengthOf = (segs) => segs.reduce((a, g) => a + g.len, 0);

/* integrate a segment list into a course: points (ground, 3D), the rider's frame at each (T, e1, e2), and the bend
   asked for there, then centred in the stadium. R: the track's radius */
export function build(segs, R = 3) {
  const L = lengthOf(segs), n = Math.round(L / DS);
  let p = [0, 0, 0], T = [1, 0, 0], e1 = [0, 1, 0], e2 = cross(e1, T);
  const pts = [p], fr = [{ T, e1, e2 }], bend = [bendAt(segs, 0)];
  for (let i = 1; i <= n; i++) {
    const kv = (s) => { const b = bendAt(segs, s); return add(sc(e1, b[0]), e2, b[1]); };
    // midpoint: half a step, then the full step from the midpoint's curvature
    const k0 = kv((i - 0.5) * DS), Tm = unit(add(T, k0, DS / 2));
    p = add(p, Tm, DS);
    T = unit(add(T, k0, DS)); e1 = add(e1, T, -DS * dot(k0, e1)); e2 = add(e2, T, -DS * dot(k0, e2));
    e1 = unit(add(e1, T, -dot(e1, T))); e2 = unit(add(add(e2, T, -dot(e2, T)), e1, -dot(e2, e1)));
    pts.push(p); fr.push({ T, e1, e2 }); bend.push(bendAt(segs, i * DS));
  }
  // turn it to fit the stadium (148 m across in x and z, 58 in w) by one of the 24 rotations that keep the grid's axes
  // (so you start squared to the voxels, and the centre line and kerbs are crisp), proper so ana stays ana, the one
  // whose bounding box fits best; then centre it
  const Q = squareFit(pts, R), rot = (v) => [dot(Q[0], v), dot(Q[1], v), dot(Q[2], v)];
  const pr = pts.map(rot), frr = fr.map((f) => ({ T: rot(f.T), e1: rot(f.e1), e2: rot(f.e2) }));
  const lo = [0, 1, 2].map((j) => Math.min(...pr.map((q) => q[j]))), hi = [0, 1, 2].map((j) => Math.max(...pr.map((q) => q[j])));
  const shift = [0, 1, 2].map((j) => BASIN.c[j] - (lo[j] + hi[j]) / 2 + VOXEL / 2), P = pr.map((q) => add(q, shift)); // (through cells' middles: the line one cell wide)
  return { segs, R, len: n * DS, pts: P, fr: frr, bend, poly: polyCourse(P, false, R), extent: hi.map((h, j) => h - lo[j]) };
}

/* the rows of the axis-keeping proper rotation (a signed permutation, determinant +1) under which the points' bounding
   box's middle put at the stadium's, the course fits it best (the largest of fits()'s ellipsoid measure, smallest) */
const SQUARE_ROTS = (() => {
  const out = [], perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const pm of perms) for (let sg = 0; sg < 8; sg++) {
    const rows = pm.map((j, i) => { const r = [0, 0, 0]; r[j] = sg & (1 << i) ? -1 : 1; return r; });
    if (dot(cross(rows[0], rows[1]), rows[2]) > 0) out.push(rows);
  }
  return out;
})();
function squareFit(pts, R = 3) {
  let best = null, bs = Infinity;
  for (const Q of SQUARE_ROTS) {
    const q = pts.filter((_, i) => i % 10 === 0).map((p) => Q.map((row) => dot(row, p)));
    const mid = [0, 1, 2].map((j) => (Math.min(...q.map((v) => v[j])) + Math.max(...q.map((v) => v[j]))) / 2);
    let e = 0; for (const v of q) e = Math.max(e, Math.hypot((Math.abs(v[0] - mid[0]) + R) / BASIN.a[0], (Math.abs(v[1] - mid[1]) + R) / BASIN.a[1], (Math.abs(v[2] - mid[2]) + R) / BASIN.a[2]));
    if (e < bs - 1e-9) { bs = e; best = Q; }
  }
  return best;
}
/* does it fit? every point of the track (its centreline widened by R) inside the basin with a margin, and no two
   stretches more than a few track-widths apart along it closer than two track-widths plus a metre */
export function fits(C, margin = 0.9) {
  let worst = 0;
  for (const q of C.pts) {
    const d = [0, 1, 2].map((j) => Math.max(0, Math.abs(q[j] - BASIN.c[j]) + C.R)), e = Math.hypot(d[0] / BASIN.a[0], d[1] / BASIN.a[1], d[2] / BASIN.a[2]);
    worst = Math.max(worst, e);
  }
  let near = Infinity; const step = Math.max(1, Math.round(1 / DS)), gap = 4 * C.R + 2;
  for (let i = 0; i < C.pts.length; i += step) for (let j = i + step; j < C.pts.length; j += step) {
    if ((j - i) * DS < gap * 1.6) continue;
    const a = C.pts[i], b = C.pts[j]; near = Math.min(near, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return { ok: worst < margin && near > 2 * C.R + 1, inBasin: worst, clearance: near };
}

/* what a segment list asks of the rider, before anyone rides it: the lean (v²κ/g, radians, its size), how fast the
   lean has to move (rad/s), and how much of the course bends out of the plane you start in */
export function demands(C, v = V_CAT) {
  let lean = 0, rate = 0, intoW = 0, all = 0;
  for (let i = 1; i < C.bend.length; i++) {
    const a = C.bend[i], b = C.bend[i - 1], l = Math.atan((v * v * Math.hypot(...a)) / G);
    lean = Math.max(lean, l); rate = Math.max(rate, ((v * v) / G) * Math.hypot(a[0] - b[0], a[1] - b[1]) * (v / DS));
    intoW += Math.abs(a[1]); all += Math.hypot(...a);
  }
  return { lean, rate, wShare: all ? intoW / all : 0 };
}
/* the track's nearest sample to a ground point, searching near a hint (and the whole course when far off) */
export function nearest(C, g, hint = 0, span = 200) {
  let best = Infinity, bi = hint; const lo = Math.max(0, hint - span), hi = Math.min(C.pts.length - 1, hint + span);
  for (let i = lo; i <= hi; i++) { const q = C.pts[i], d = Math.hypot(g[0] - q[0], g[1] - q[1], g[2] - q[2]); if (d < best) { best = d; bi = i; } }
  return { i: bi, d: best, s: bi * DS };
}
export { basinE };
