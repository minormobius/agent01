/* KATABASIS's cave generator, no DOM: the page runs it in a worker, the selftest runs it in node.

   A cave is carved from a seed (rooms, the passages between them, shafts up from a ceiling flush with one wall,
   pillars), weathered, and then the crystal is placed, not hoped for. One layered search from the start
   finds, for every voxel, the fewest flips after which your body can touch it; the crystal goes on a voxel
   that takes exactly the tier's par, sitting on the floor of the way up that reaches it, with nothing within
   a voxel of it reachable sooner (so a body straddling a ledge between two whole-voxel places can't reach it
   early). Then the finished cave is proved again by the solver: par is the fewest flips, and a cave that says
   it needs a wall in w takes more flips without one. Half the caves are asked to need one (for their first
   12 tries; after that any cave will do, so none takes long).

   The same tier and seed make the same cave everywhere: the noise is integer hashing and polynomials, with
   no transcendental functions to differ in their last bit between browsers. */
import { Cave, explore, fewestFlips, dimsOf, ORIENTATIONS } from "./cave.js";

export const TIERS = { easy: 1, medium: 2, hard: 3 }; // the par each makes
export const TIER_NAMES = Object.keys(TIERS);

/* a seeded generator in [0, 1) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* a seed from a string (the daily cave's date) */
export function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/* the rock and air of a cave, and where you start: room 0's floor, in its middle. loft: a sealed room above
   the rest, whose only way in is a hole in a ceiling below too narrow to climb on a wall: you fall up it,
   which is two flips in, so a crystal on the loft's walls takes three */
export function carve(seed, { loft = false } = {}) {
  const r = rng(seed), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const LOFT = loft ? 16 : 0, dims = [ri(24, 30), ri(26, 34) + LOFT, ri(24, 30), ri(14, 18)], c = new Cave(...dims), rooms = [];
  const top = dims[1] - LOFT; // the rooms below stay under this
  for (let n = ri(3, 5), i = 0; i < n; i++) {
    const size = [ri(8, 14), ri(8, 14), ri(8, 14), ri(7, Math.min(11, dims[3] - 4))];
    const lo = size.map((s, k) => ri(2, (k === 1 ? top : dims[k]) - 2 - s));
    c.box(lo, lo.map((v, k) => v + size[k]));
    rooms.push({ lo, hi: lo.map((v, k) => v + size[k]), ctr: lo.map((v, k) => v + size[k] / 2) });
  }
  // passages between them, wide enough to walk (a body's cross-section needs a radius of about 2.45)
  for (let i = 1; i < rooms.length; i++) c.tube(rooms[i - 1].ctr, rooms[i].ctr, 2.6 + r() * 0.6);
  // shafts up from a ceiling, flush with one wall (x, z or w): too narrow to flip in, so you climb them on
  // that wall or fall up them from the ceiling
  for (let k = ri(1, 2); k--; ) {
    const R = rooms[ri(0, rooms.length - 1)], ax = [0, 2, 3][ri(0, 2)], lo = R.lo.slice(), hi = R.hi.slice();
    for (const a of [0, 2, 3]) if (a !== ax) { const wd = ri(3, 4), m = Math.floor(R.ctr[a] - wd / 2); lo[a] = m; hi[a] = m + wd; }
    const dep = ri(4, 5); if (r() < 0.5) lo[ax] = hi[ax] - dep; else hi[ax] = lo[ax] + dep;
    lo[1] = hi[1] - 1; hi[1] = Math.min(top - 2, hi[1] + ri(6, 14));
    c.box(lo, hi);
  }
  if (loft) {
    // over the room whose ceiling is highest: a hole 3 voxels square in its ceiling (a body needs 4 across its
    // up to stand in it, so no wall-walker fits), at least 4 voxels of rock, and the loft
    const R = rooms.reduce((a, b) => (b.hi[1] > a.hi[1] ? b : a)), size = [ri(8, 11), ri(8, 9), ri(8, 11), Math.min(dims[3] - 4, ri(7, 9))];
    const fy = top + 2, lo = [0, fy, 0, 0];
    for (const a of [0, 2, 3]) lo[a] = Math.max(2, Math.min(dims[a] - 2 - size[a], Math.floor(R.ctr[a] - size[a] / 2)));
    c.box(lo, lo.map((v, k) => v + size[k]));
    const hole = [0, 2, 3].map((a) => Math.max(lo[a] + 1, Math.min(lo[a] + size[a] - 4, Math.floor(R.ctr[a]) - 1)));
    const hl = [hole[0], R.hi[1] - 1, hole[1], hole[2]];
    c.box(hl, [hl[0] + 3, fy + 1, hl[2] + 3, hl[3] + 3]);
  }
  // pillars standing on room floors: ledges, and things to see round
  for (let k = ri(1, 4); k--; ) {
    const R = rooms[ri(0, rooms.length - 1)], sz = [ri(2, 4), ri(2, Math.max(2, R.hi[1] - R.lo[1] - 3)), ri(2, 4), ri(2, 4)];
    const lo = sz.map((s, i) => (i === 1 ? R.lo[1] : R.lo[i] + ri(0, Math.max(0, R.hi[i] - R.lo[i] - s))));
    c.box(lo, lo.map((v, i) => v + sz[i]), 1);
  }
  c.erode(seed, loft ? 1 : 2);
  const R0 = rooms[0], st = [Math.floor(R0.ctr[0]) - 1, R0.lo[1], Math.floor(R0.ctr[2]) - 1, Math.floor(R0.ctr[3]) - 1];
  c.box(st, [st[0] + 2, st[1] + 4, st[2] + 2, st[3] + 2]); // room for you, whatever the pillars did
  return { cave: c, start: { c: st, o: 0 } };
}

/* for every voxel, the fewest flips after which the body can touch it (255: not within maxFlips), and the up
   of the first body that did */
export function reach(cave, start, { maxFlips, noW = false } = {}) {
  const [X, Y, Z] = cave.dims, touch = new Uint8Array(cave.v.length).fill(255), up = new Int8Array(cave.v.length);
  explore(cave, start, {
    maxFlips, noW,
    visit: (s, n) => {
      const O = ORIENTATIONS[s.o], d = dimsOf(O), c = s.c, u = (O[1][0] + 1) * O[1][1];
      for (let w = c[3]; w < c[3] + d[3]; w++) for (let z = c[2]; z < c[2] + d[2]; z++) for (let y = c[1]; y < c[1] + d[1]; y++) for (let x = c[0]; x < c[0] + d[0]; x++) {
        const i = x + X * (y + Y * (z + Z * w)); if (touch[i] === 255) { touch[i] = n; up[i] = u; }
      }
      return false;
    },
  });
  return { touch, up };
}

const WHERE = (u) => { const a = Math.abs(u) - 1, s = Math.sign(u); return a === 1 ? (s > 0 ? "on the floor" : "on the ceiling") : a === 3 ? (s > 0 ? "on the kata wall" : "on the ana wall") : "on a wall"; };

/* a cave of this tier from this seed: { cave, start, par, needs, line, name, tier, seed, attempt } or null */
export function generate(tier, seed, { attempts = 40 } = {}) {
  const par = TIERS[tier], r0 = rng(seed ^ 0x51ed27), wantW = r0() < 0.5;
  for (let t = 0; t < attempts; t++) {
    const cs = (Math.imul(seed, 2654435761) + t * 40503 + 7) >>> 0, r = rng(cs);
    const { cave, start } = carve(cs, { loft: par >= 3 || (par === 2 && r() < 0.4) }), [X, Y, Z, W] = cave.dims, N = cave.v.length;
    const { touch, up } = reach(cave, start, { maxFlips: par });
    const nw = wantW ? reach(cave, start, { maxFlips: par, noW: true }).touch : null;
    // near: within a voxel (every way, diagonals too) of something reachable in fewer flips than par
    const near = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (touch[i] >= par) continue;
      const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / (X * Y)) % Z, w = Math.floor(i / (X * Y * Z));
      for (let dw = -1; dw <= 1; dw++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = y + dy, cc = z + dz, e = w + dw;
        if (a >= 0 && b >= 0 && cc >= 0 && e >= 0 && a < X && b < Y && cc < Z && e < W) near[a + X * (b + Y * (cc + Z * e))] = 1;
      }
    }
    // candidates: air reached at exactly par, on the floor of the up that reached it, not near
    const cand = [], sc = start.c.map((v, i) => v + 1);
    for (let i = 0; i < N; i++) {
      if (touch[i] !== par || near[i] || cave.v[i] !== 0 || (nw && t < 12 && nw[i] !== 255)) continue;
      const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / (X * Y)) % Z, w = Math.floor(i / (X * Y * Z)), p = [x, y, z, w];
      const a = Math.abs(up[i]) - 1, q = p.slice(); q[a] -= Math.sign(up[i]);
      if (cave.at(...q) !== 1) continue;
      cand.push({ i, p, a, s: Math.sign(up[i]), far: Math.hypot(...p.map((v, k) => v - sc[k])) + r() * 6 });
    }
    if (!cand.length) continue;
    cand.sort((u, v) => v.far - u.far);
    const pick = cand[Math.floor(r() * Math.max(1, Math.ceil(cand.length / 4)))];
    // the crystal: that voxel and its neighbours across the floor and one up, where they're air and not near
    const grow = [[0, 0, 0, 0]]; for (let k = 0; k < 4; k++) { const e = [0, 0, 0, 0]; e[k] = k === pick.a ? pick.s : 1; grow.push(e); }
    for (const e of grow) {
      const p = pick.p.map((v, k) => v + e[k]); if (!cave.in(...p)) continue;
      const i = cave.idx(...p); if (cave.v[i] === 0 && !near[i] && touch[i] >= par) cave.v[i] = 2;
    }
    // prove it
    const level = { cave, start }, f = fewestFlips(level);
    if (!f || f.flips !== par) continue;
    const g = fewestFlips(level, { noW: true }), needs = !g || g.flips > par ? "w" : "flipping";
    if (wantW && t < 12 && needs !== "w") continue; // after 12 tries, any cave will do
    const where = WHERE((pick.a + 1) * pick.s);
    const line = `A made cave. The crystal is ${where}, ${par} flip${par > 1 ? "s" : ""} away${needs === "w" ? ", and one of them puts a wall in w under you" : ""}.`;
    return { cave, start, par, needs, line, name: `${tier} ${seed.toString(36)}`, tier, seed, attempt: t };
  }
  return null;
}
