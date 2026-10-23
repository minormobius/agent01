/* KATABASIS's world and rules, no DOM: the page, the solver and the selftest share them.

   A cave in four dimensions, carved from rock on a fine grid: a voxel is a quarter of your height. You see
   the 3D slice of it through you, spanned by your right R, up U and forward F; the fourth direction, N, you
   can't see along. You walk in your slice, step up one voxel without thinking, and fall toward your feet.

   The verb is the FLIP: a coupled quarter turn, PLATEAU's double rotation at full coupling, quantized.
   Each turns one plane of your body by 90° and the plane perpendicular to it by 90° too, and each is
   named by what becomes your floor:
       ahead, behind   U↔F  with  R↔N
       right, left     U↔R  with  F↔N
       kata, ana       U↔N  with  F↔R   (your floor becomes the wall in w you couldn't see)
   Every such turn moves all four of your axes (at full coupling every direction turns by the same angle),
   so after a flip your up is a different direction of the cave, and gravity follows your feet: walls
   become floors, and one of the three directions you could see has swapped with w. A quarter turn maps the
   cave's grid onto itself, so wherever you land the slice is the grid again, cubes and nothing else: every
   floor is exact, and there are only finitely many ways to be turned (ORIENTATIONS, found by closure),
   which is what lets the solver prove a cave.

   Your body is a 4D box, BODY voxels along R, U, F, N. A flip needs room: you hop one voxel, and the 4D
   ball round your centre that holds every way of turning your body (radius: half its diagonal) must be
   clear of rock. The game checks exactly that before it lets you turn, and so does the solver.

   The world is a box of X × Y × Z × W voxels: 0 air, 1 rock, 2 the goal (a crystal you walk into), and
   outside the box is rock. */

export const BODY = [2, 4, 2, 2]; // voxels along your R, U, F, N
const HALF = BODY.map((v) => v / 2);
export const FLIP_R = Math.sqrt(HALF.reduce((s, v) => s + v * v, 0)); // the ball every turn of the body stays inside

/* ---------------------------------------------------------------- orientations
   An orientation says, for each of your axes R, U, F, N (in that order), which world axis it is and its
   sign: a signed permutation, [axis, sign] × 4. A flip says, for each new body axis, which old one it was
   and with what sign: cartwheel right is R' = U, U' = −R, F' = N, N' = −F. */
const B = { R: 0, U: 1, F: 2, N: 3 };
const flip = (spec) => ["R", "U", "F", "N"].map((k) => { const [s, a] = spec[k]; return [B[a], s]; });
export const FLIPS = {
  // each named by what becomes your floor: you fall toward that wall. The second half of the turn, in the
  // perpendicular plane, comes with it (one visible direction swaps with w)
  ahead: flip({ U: [-1, "F"], F: [1, "U"], R: [1, "N"], N: [-1, "R"] }),
  behind: flip({ U: [1, "F"], F: [-1, "U"], R: [-1, "N"], N: [1, "R"] }),
  right: flip({ U: [-1, "R"], R: [1, "U"], F: [1, "N"], N: [-1, "F"] }),
  left: flip({ U: [1, "R"], R: [-1, "U"], F: [-1, "N"], N: [1, "F"] }),
  kata: flip({ U: [1, "N"], N: [-1, "U"], F: [1, "R"], R: [-1, "F"] }),
  ana: flip({ U: [-1, "N"], N: [1, "U"], F: [-1, "R"], R: [1, "F"] }),
};
export const FLIP_NAMES = Object.keys(FLIPS);
const ID = [[0, 1], [1, 1], [2, 1], [3, 1]];
const okey = (o) => o.map(([a, s]) => (s > 0 ? "+" : "-") + a).join("");
/* apply a flip to an orientation: new body axis i is old body axis m[i][0] times m[i][1] */
export const turned = (o, m) => m.map(([b, s]) => [o[b][0], o[b][1] * s]);
/* every orientation the flips reach from upright, and the flip table between them */
export const ORIENTATIONS = [], OKEY = new Map();
{
  const q = [ID]; OKEY.set(okey(ID), 0); ORIENTATIONS.push(ID);
  while (q.length) { const o = q.shift(); for (const n of FLIP_NAMES) { const t = turned(o, FLIPS[n]), k = okey(t); if (!OKEY.has(k)) { OKEY.set(k, ORIENTATIONS.length); ORIENTATIONS.push(t); q.push(t); } } }
}
export const FLIP_TO = ORIENTATIONS.map((o) => FLIP_NAMES.map((n) => OKEY.get(okey(turned(o, FLIPS[n])))));
/* a body axis as a world vector */
export const axisVec = (o, b) => { const v = [0, 0, 0, 0]; v[o[b][0]] = o[b][1]; return v; };
/* the body's extent along each world axis, in this orientation */
export const dimsOf = (o) => { const d = [0, 0, 0, 0]; for (let b = 0; b < 4; b++) d[o[b][0]] = BODY[b]; return d; };

/* ---------------------------------------------------------------- the world */
export class Cave {
  constructor(X, Y, Z, W) { this.dims = [X, Y, Z, W]; this.v = new Uint8Array(X * Y * Z * W).fill(1); }
  idx(x, y, z, w) { const [X, Y, Z] = this.dims; return x + X * (y + Y * (z + Z * w)); }
  in(x, y, z, w) { const d = this.dims; return x >= 0 && y >= 0 && z >= 0 && w >= 0 && x < d[0] && y < d[1] && z < d[2] && w < d[3]; }
  at(x, y, z, w) { return this.in(x, y, z, w) ? this.v[this.idx(x, y, z, w)] : 1; }
  set(x, y, z, w, k) { if (this.in(x, y, z, w)) this.v[this.idx(x, y, z, w)] = k; }
  /* carve: every voxel whose centre is inside f (a function of the centre point) becomes k */
  carve(lo, hi, f, k = 0) {
    for (let w = Math.max(0, lo[3]); w < Math.min(this.dims[3], hi[3]); w++) for (let z = Math.max(0, lo[2]); z < Math.min(this.dims[2], hi[2]); z++)
      for (let y = Math.max(0, lo[1]); y < Math.min(this.dims[1], hi[1]); y++) for (let x = Math.max(0, lo[0]); x < Math.min(this.dims[0], hi[0]); x++)
        if (f([x + 0.5, y + 0.5, z + 0.5, w + 0.5])) this.v[this.idx(x, y, z, w)] = k;
  }
  ball(c, r, k = 0) { this.carve(c.map((v) => Math.floor(v - r)), c.map((v) => Math.ceil(v + r) + 1), (p) => p.reduce((s, v, i) => s + (v - c[i]) ** 2, 0) < r * r, k); }
  box(lo, hi, k = 0) { this.carve(lo, hi, () => true, k); }
  /* a tube of radius r from a to b (a 4D capsule) */
  tube(a, b, r, k = 0) {
    const ab = b.map((v, i) => v - a[i]), L = ab.reduce((s, v) => s + v * v, 0);
    const lo = a.map((v, i) => Math.floor(Math.min(v, b[i]) - r)), hi = a.map((v, i) => Math.ceil(Math.max(v, b[i]) + r) + 1);
    this.carve(lo, hi, (p) => { const t = Math.max(0, Math.min(1, p.reduce((s, v, i) => s + (v - a[i]) * ab[i], 0) / L)); return p.reduce((s, v, i) => s + (v - a[i] - t * ab[i]) ** 2, 0) < r * r; }, k);
  }
  /* weather the rock: rock touching air wears away where smooth 4D noise is high, pass after pass, so walls
     are bumpy and pocked rather than flat. It only ever turns rock to air (the levels are re-proved after) */
  erode(seed, passes = 2, amount = 0.38, scale = 3.2) {
    const [X, Y, Z, W] = this.dims, h = (x, y, z, w) => { let n = (Math.imul(x + 977, 73856093) ^ Math.imul(y + 977, 19349663) ^ Math.imul(z + 977, 83492791) ^ Math.imul(w + 977, 2654435761 | 0) ^ Math.imul(seed, 374761393)) >>> 0; n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n ^= n >>> 12; return (n >>> 0) / 4294967296; };
    const noise = (p) => { // value noise on a lattice of spacing `scale`, multilinear between its corners
      const q = p.map((v) => v / scale), b = q.map(Math.floor), f = q.map((v, i) => { const t = v - b[i]; return t * t * (3 - 2 * t); });
      let s = 0; for (let m = 0; m < 16; m++) { let wgt = 1; const k = [0, 1, 2, 3].map((i) => { const bit = (m >> i) & 1; wgt *= bit ? f[i] : 1 - f[i]; return b[i] + bit; }); s += wgt * h(...k); }
      return s;
    };
    for (let pass = 0; pass < passes; pass++) {
      const wear = [];
      for (let w = 1; w < W - 1; w++) for (let z = 1; z < Z - 1; z++) for (let y = 1; y < Y - 1; y++) for (let x = 1; x < X - 1; x++) {
        if (this.v[this.idx(x, y, z, w)] !== 1) continue;
        const nb = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
        if (!nb.some((o) => this.at(x + o[0], y + o[1], z + o[2], w + o[3]) !== 1)) continue;
        if (noise([x + 0.5 + pass * 7.3, y + 0.5, z + 0.5, w + 0.5]) > 1 - amount) wear.push(this.idx(x, y, z, w));
      }
      for (const i of wear) this.v[i] = 0;
    }
  }
  /* is every voxel of the box at corner c, extent d, free of rock? (the goal is walked into, not on) */
  clear(c, d) {
    for (let w = c[3]; w < c[3] + d[3]; w++) for (let z = c[2]; z < c[2] + d[2]; z++) for (let y = c[1]; y < c[1] + d[1]; y++) for (let x = c[0]; x < c[0] + d[0]; x++) if (this.at(x, y, z, w) === 1) return false;
    return true;
  }
  /* does the box touch the goal? */
  goal(c, d) {
    for (let w = c[3]; w < c[3] + d[3]; w++) for (let z = c[2]; z < c[2] + d[2]; z++) for (let y = c[1]; y < c[1] + d[1]; y++) for (let x = c[0]; x < c[0] + d[0]; x++) if (this.at(x, y, z, w) === 2) return true;
    return false;
  }
  /* is the ball of radius r round centre p clear (no rock voxel within r of p)? */
  ballClear(p, r) {
    const lo = p.map((v) => Math.floor(v - r)), hi = p.map((v) => Math.ceil(v + r));
    for (let w = lo[3]; w < hi[3]; w++) for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) for (let x = lo[0]; x < hi[0]; x++) {
      if (this.at(x, y, z, w) !== 1) continue;
      const v = [x, y, z, w]; let d2 = 0;
      for (let i = 0; i < 4; i++) { const e = Math.max(v[i] - p[i], 0, p[i] - v[i] - 1); d2 += e * e; } // from p to the voxel's cube
      if (d2 < r * r - 1e-9) return false;
    }
    return true;
  }
}

/* ---------------------------------------------------------------- the rules, on whole-voxel positions
   A state: c, the corner of your body's box (its least coordinate on every world axis), and o, the index
   of your orientation. You stand where your box is clear of rock and there is rock right under your feet. */
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
export function supported(cave, c, o) {
  const O = ORIENTATIONS[o], d = dimsOf(O), [a, s] = O[1]; // up is world axis a, sign s; down is −s
  const at = s > 0 ? c[a] - 1 : c[a] + d[a]; // the layer under your feet
  const lo = c.slice(), hi = c.map((v, i) => v + d[i]); lo[a] = at; hi[a] = at + 1;
  for (let w = lo[3]; w < hi[3]; w++) for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) for (let x = lo[0]; x < hi[0]; x++) if (cave.at(x, y, z, w) === 1) return true;
  return false;
}
/* fall toward your feet until there's ground (null: out of the cave, gone) */
export function settle(cave, c, o) {
  const down = axisVec(ORIENTATIONS[o], 1).map((v) => -v), d = dimsOf(ORIENTATIONS[o]);
  for (let n = 0; n < 4096; n++) {
    if (supported(cave, c, o)) return c;
    const nc = add(c, down); if (!cave.clear(nc, d)) return c; // (can't happen: unsupported means the layer below is clear)
    c = nc;
    if (c.some((v, i) => v < -8 || v > cave.dims[i] + 8)) return null;
  }
  return null;
}
/* a step along your R or F (dir: 0 +R, 1 −R, 2 +F, 3 −F): onto clear ground, or up one voxel if that's
   all that's in the way and there's headroom; then you fall to the ground. null: blocked */
export const STEPS = [[0, 1], [0, -1], [2, 1], [2, -1]];
export function step(cave, c, o, dir) {
  const O = ORIENTATIONS[o], d = dimsOf(O), mv = axisVec(O, STEPS[dir][0]).map((v) => v * STEPS[dir][1]), up = axisVec(O, 1);
  let n = add(c, mv);
  if (!cave.clear(n, d)) { const h = add(n, up); if (!cave.clear(h, d) || !cave.clear(add(c, up), d)) return null; n = h; }
  return settle(cave, n, o);
}
/* a flip: hop a voxel (headroom needed), turn about your centre (the ball round it clear), land */
export function flipFrom(cave, c, o, f) {
  const O = ORIENTATIONS[o], d = dimsOf(O), up = axisVec(O, 1), h = add(c, up);
  if (!cave.clear(h, d)) return null;
  const ctr = h.map((v, i) => v + d[i] / 2);
  if (!cave.ballClear(ctr, FLIP_R)) return null;
  const o2 = FLIP_TO[o][f], d2 = dimsOf(ORIENTATIONS[o2]), c2 = ctr.map((v, i) => v - d2[i] / 2);
  const s = settle(cave, c2, o2);
  return s && { c: s, o: o2 };
}

/* ---------------------------------------------------------------- the solver
   Breadth-first over (corner, orientation), every move costing one: a step or a flip. Returns the fewest
   moves to the goal (and how many flips that took, and the path), or null. flips = false: walking only */
export function solve(level, { flips = true, limit = 3e6 } = {}) {
  const { cave, start } = level, X = cave.dims;
  const key = (c, o) => ((((c[3] + 8) * (X[2] + 16) + c[2] + 8) * (X[1] + 16) + c[1] + 8) * (X[0] + 16) + c[0] + 8) * ORIENTATIONS.length + o;
  const s0 = settle(cave, start.c, start.o); if (!s0) return null;
  const prev = new Map([[key(s0, start.o), null]]), q = [{ c: s0, o: start.o, n: 0 }];
  for (let i = 0; i < q.length && q.length < limit; i++) {
    const s = q[i];
    if (cave.goal(s.c, dimsOf(ORIENTATIONS[s.o]))) {
      const path = []; let k = key(s.c, s.o); while (prev.get(k)) { const p = prev.get(k); path.push(p.move); k = p.from; }
      path.reverse();
      return { moves: s.n, flips: path.filter((m) => m.startsWith("flip")).length, path, states: q.length, end: s };
    }
    const from = key(s.c, s.o);
    for (let dir = 0; dir < 4; dir++) { const c = step(cave, s.c, s.o, dir); if (!c) continue; const k = key(c, s.o); if (!prev.has(k)) { prev.set(k, { from, move: "step" + dir }); q.push({ c, o: s.o, n: s.n + 1 }); } }
    if (flips) for (let f = 0; f < FLIP_NAMES.length; f++) { const r = flipFrom(cave, s.c, s.o, f); if (!r) continue; const k = key(r.c, r.o); if (!prev.has(k)) { prev.set(k, { from, move: "flip:" + FLIP_NAMES[f] }); q.push({ c: r.c, o: r.o, n: s.n + 1 }); } }
  }
  return null;
}

/* the fewest FLIPS to the goal, walking free (a 0-1 search: steps cost nothing, flips one). Par is in flips:
   walking is continuous in the game, so its steps aren't a count anyone makes */
export function fewestFlips(level, { limit = 3e6 } = {}) {
  const { cave, start } = level, X = cave.dims;
  const key = (c, o) => ((((c[3] + 8) * (X[2] + 16) + c[2] + 8) * (X[1] + 16) + c[1] + 8) * (X[0] + 16) + c[0] + 8) * ORIENTATIONS.length + o;
  const s0 = settle(cave, start.c, start.o); if (!s0) return null;
  const best = new Map([[key(s0, start.o), 0]]); let cur = [{ c: s0, o: start.o }], n = 0, seen = 1;
  while (cur.length && seen < limit) {
    // spread everything reachable on foot at this many flips, then flip once from all of it
    for (let i = 0; i < cur.length; i++) {
      const s = cur[i];
      if (cave.goal(s.c, dimsOf(ORIENTATIONS[s.o]))) return { flips: n, states: seen };
      for (let dir = 0; dir < 4; dir++) { const c = step(cave, s.c, s.o, dir); if (!c) continue; const k = key(c, s.o); if (!best.has(k)) { best.set(k, n); cur.push({ c, o: s.o }); seen++; } }
    }
    const next = [];
    for (const s of cur) for (let f = 0; f < FLIP_NAMES.length; f++) { const r = flipFrom(cave, s.c, s.o, f); if (!r) continue; const k = key(r.c, r.o); if (!best.has(k)) { best.set(k, n + 1); next.push(r); seen++; } }
    cur = next; n++;
  }
  return null;
}
