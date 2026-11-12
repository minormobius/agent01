/* BRUT⁴'s architect. No DOM. One seed, one building, for ever.

   After tjs/brut (the brutalist kernel), one dimension up. Its floors are volumes: a storey's plate is a block in the
   three ground directions (x, z, w), a bay is a cube M on a side, and the columns stand on a 3D lattice. y is up.

   A building is a stack of TIERS, each a block of whole bays for a number of storeys, each no larger than the one
   below (a podium, setbacks, a tower), and all holding the bay at the origin, where the stair is. What comes out:
     tiers      the massing, in bays and storeys
     tree       a CAD⁴ feature tree (slabs, columns, walls, stair, ground), so the kernel can draw it, measure it,
                and tell a walker where the concrete is
     col        the column's side: not chosen but sized by the engineer's gravity takedown (struct.js), which is the
                first thing four dimensions does to a building
   Everything repeated (floors, columns, flights) is one shape on a lattice (the kernel's `array`), so a tower of a
   thousand columns costs the same to ask about as a hut. */
import { takedown } from "./struct.js";

import { M, H, SLAB, WALL, SILL, HEAD, PARAPET } from "./dims.js";
export { M, H, SLAB };
/* xmur3 → mulberry32, from a string */
export function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } let a = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const TYPES = ["ziggurat", "tower", "slab", "stack"];

/* the massing: tiers as bay ranges [a0, a1) along x, z, w, all containing bay 0 */
export function massing(seed, type) {
  const r = rng(seed + "/mass"), int = (a, b) => a + Math.floor(r() * (b - a + 1)), kind = type || TYPES[int(0, TYPES.length - 1)], tiers = [];
  /* every tier keeps the stair's bay (0 along each axis) and, along x, the bay before it, where the stair lets you off */
  const KEEP = [[-1, 1], [0, 1], [0, 1]], span = (n, ax) => { const need = KEEP[ax][1] - KEEP[ax][0]; n = Math.max(n, need); const lo = KEEP[ax][0] - int(0, n - need); return [lo, lo + n]; };
  let range, storeys;
  if (kind === "ziggurat") { range = [span(int(4, 5), 0), span(int(4, 5), 1), span(int(3, 4), 2)]; storeys = int(1, 2); }
  else if (kind === "tower") { range = [span(int(4, 6), 0), span(int(3, 4), 1), span(int(3, 4), 2)]; storeys = int(1, 2); }
  else if (kind === "slab") { range = [span(int(5, 7), 0), span(2, 1), span(int(2, 3), 2)]; storeys = int(4, 7); }
  else { range = [span(int(3, 4), 0), span(int(3, 4), 1), span(int(3, 4), 2)]; storeys = int(2, 3); }
  tiers.push({ range, storeys });
  const more = kind === "slab" ? int(0, 1) : kind === "tower" ? 1 : int(2, 3);
  for (let t = 0; t < more; t++) { const prev = tiers[tiers.length - 1].range;
    const shrink = (a, b, ax, cut) => { let lo = a, hi = b; for (let c = 0; c < cut; c++) { const canLo = lo < KEEP[ax][0], canHi = hi > KEEP[ax][1]; if (canLo && (!canHi || r() < 0.5)) lo++; else if (canHi) hi--; } return [lo, hi]; };
    let next = prev.map(([a, b], ax) => shrink(a, b, ax, kind === "tower" ? 99 : int(0, 2)));
    if (kind === "tower") next = next.map(([a, b], ax) => [a, b]);
    if (next.every(([a, b], ax) => a === prev[ax][0] && b === prev[ax][1])) { const ax = [0, 1, 2].find((i) => next[i][0] < KEEP[i][0] || next[i][1] > KEEP[i][1]); if (ax === undefined) break; next[ax] = shrink(next[ax][0], next[ax][1], ax, 1); }
    tiers.push({ range: next, storeys: kind === "tower" ? int(4, 7) : int(1, 3) }); }
  let at = 0; for (const t of tiers) { t.start = at; at += t.storeys; }
  return { kind, tiers, storeys: at };
}

/* the stair well, in the bay at the origin: the hole in every floor (x, z, w) */
export const WELL = { lo: [0.45, 0.75, 1.15], hi: [3.65, 3.25, 2.85] };
const box = (size, by) => ({ op: "move", by, of: { op: "box", size } });
/* the building as a CAD⁴ tree */
export function tree(mass, col) {
  const S = mass.storeys, slabs = [], cols = [], walls = [];
  mass.tiers.forEach((t, ti) => { const [X, Z, Wd] = t.range.map(([a, b]) => (b - a) * M), [cx, cz, cw] = t.range.map(([a, b]) => ((a + b) / 2) * M), y0 = t.start * H, k0 = t.start + 1, k1 = t.start + t.storeys;
    /* the floors above each storey of the tier (the last is its roof): one slab, stacked */
    /* (built from up to six blocks round the stair well, not as a plate with a hole cut in it: a cut's distance is only
       a lower bound and points the wrong way out at the hole's edge, which stops a walker at the top of the stair) */
    const lo3 = t.range.map(([a]) => a * M), hi3 = t.range.map(([, b]) => b * M), piece = (a, b) => { const sz = [0, 1, 2].map((i) => b[i] - a[i]); return sz.every((v) => v > 1e-6) ? { op: "box", size: [sz[0], SLAB, sz[1], sz[2]], at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] } : null; };
    const pieces = [piece(lo3, [WELL.lo[0], hi3[1], hi3[2]]), piece([WELL.hi[0], lo3[1], lo3[2]], hi3), piece([WELL.lo[0], lo3[1], lo3[2]], [WELL.hi[0], WELL.lo[1], hi3[2]]), piece([WELL.lo[0], WELL.hi[1], lo3[2]], [WELL.hi[0], hi3[1], hi3[2]]), piece([WELL.lo[0], WELL.lo[1], lo3[2]], [WELL.hi[0], WELL.hi[1], WELL.lo[2]]), piece([WELL.lo[0], WELL.lo[1], WELL.hi[2]], [WELL.hi[0], WELL.hi[1], hi3[2]])].filter(Boolean);
    slabs.push({ op: "move", by: [0, -SLAB / 2, 0, 0], of: { op: "array", step: [0, H], lo: [0, k0], hi: [0, k1], of: { op: "union", of: pieces.map((q) => ({ op: "move", by: [q.at[0], 0, q.at[1], q.at[2]], of: { op: "box", size: q.size } })) } } });
    /* the columns: one, on the bay lattice, the height of the tier */
    cols.push({ op: "move", by: [0, y0 + (t.storeys * H - SLAB) / 2, 0, 0], of: { op: "array", step: [M, 0, M, M], lo: [t.range[0][0], 0, t.range[1][0], t.range[2][0]], hi: [t.range[0][1], 0, t.range[1][1], t.range[2][1]], of: { op: "box", size: [col, t.storeys * H - SLAB, col, col] } } });
    /* the walls: a ring round each storey with a ribbon of window cut out all the way round; the ground storey of the
       building stands open on its columns. Where the tier below reaches further there is a terrace, and a doorway */
    const first = ti === 0 ? 1 : 0, clear = H - SLAB, doors = [];
    /* doors, on the tier's lowest storey only (a door higher up would open on air), in the middle of a bay so no column
       stands in one: 1.3 wide both ways across the face, 2.2 high, the cutter running well through the wall */
    if (ti > 0) { const below = mass.tiers[ti - 1].range, mid = t.range.map(([a, b2]) => (Math.floor((a + b2 - 1) / 2) + 0.5) * M); [0, 1, 2].forEach((ax) => [0, 1].forEach((side) => { if (!(side ? below[ax][1] > t.range[ax][1] : below[ax][0] < t.range[ax][0])) return; const c = mid.slice(), sz = [1.3, 1.3, 1.3]; c[ax] = (side ? t.range[ax][1] : t.range[ax][0]) * M; sz[ax] = 3; doors.push(box([sz[0], 2.2 + 2, sz[1], sz[2]], [c[0], 1.1 - 1 - clear / 2, c[1], c[2]])); })); }
    const ring = (cutters) => ({ op: "cut", of: [box([X, clear, Z, Wd], [cx, 0, cz, cw]), box([X - 2 * WALL, clear + 6, Z - 2 * WALL, Wd - 2 * WALL], [cx, 0, cz, cw]), box([X + 8, HEAD - SILL, Z + 8, Wd + 8], [cx, (SILL + HEAD) / 2 - clear / 2, cz, cw]), ...cutters] });
    const stack = (k0s, k1s, cutters) => { if (k1s >= k0s) walls.push({ op: "move", by: [0, clear / 2, 0, 0], of: { op: "array", step: [0, H], lo: [0, k0s], hi: [0, k1s], of: ring(cutters) } }); };
    if (doors.length) { stack(t.start, t.start, doors); stack(t.start + 1, t.start + t.storeys - 1, []); } else stack(t.start + first, t.start + t.storeys - 1, []);
    /* a parapet round the tier's roof */
    walls.push({ op: "cut", of: [box([X, PARAPET, Z, Wd], [cx, k1 * H + PARAPET / 2, cz, cw]), box([X - 2 * WALL, PARAPET + 6, Z - 2 * WALL, Wd - 2 * WALL], [cx, k1 * H + PARAPET / 2, cz, cw])] }); });
  /* the stair, in the bay at the origin: two flights a storey, side by side in z, 1.6 wide in w, with a landing
     between; the slabs are cut open over it. Steep ramps, not treads */
  const rise = H / 2, run = 2.55, ang = (Math.atan2(rise, run) * 180) / Math.PI, len = Math.hypot(rise, run), drop = 0.1 / Math.cos((ang * Math.PI) / 180);
  const flight = (z, y, sgn) => ({ op: "move", by: [WELL.lo[0] + run / 2, y - drop, z, 2], of: { op: "rotate", plane: [0, 1], deg: sgn * ang, of: { op: "box", size: [len, 0.2, 1.1, 1.6] } } });
  const unit = { op: "union", of: [flight(1.35, rise / 2, 1), flight(2.65, rise * 1.5, -1), box([0.65, 0.2, 2.4, 1.6], [WELL.lo[0] + run + 0.325, rise - 0.1, 2, 2])] };
  const stair = { op: "array", step: [0, H], lo: [0, 0], hi: [0, S - 1], both: 1, of: unit };
  return { params: {}, parts: {
      ground: box([140, 1, 140, 140], [0, -0.5, 0, 0]),
      slabs: { op: "union", of: slabs },
      columns: { op: "union", of: cols }, walls: { op: "union", of: walls }, stair },
    show: ["ground", "slabs", "columns", "walls", "stair"] };
}
/* seed → building. The column is sized by the takedown, then the tree is made with it */
export function generate(seed, type) { const mass = massing(String(seed), type), eng = takedown(mass), col = eng.col; return { seed: String(seed), ...mass, col, tree: tree(mass, col), engineer: eng,
  bounds: { lo: [0, 1, 2].map((ax) => Math.min(...mass.tiers.map((t) => t.range[ax][0])) * M), hi: [0, 1, 2].map((ax) => Math.max(...mass.tiers.map((t) => t.range[ax][1])) * M), top: mass.storeys * H } }; }
