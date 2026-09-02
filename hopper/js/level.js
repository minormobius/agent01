// hopper — the level. One integer → a slab in the void, a pocket of mason
// packs, and (after the survey) a bucket somewhere above. Same number, same
// level, forever: everything here is the bismuth engine's own PRNG streams
// and integer arithmetic, and the survey that places the bucket is the
// engine itself, run to the end — so the bucket is exactly as high as a
// stack of these packs can reach, times a margin.
//
// The world is a bismuth Growth whose colony 0 is the slab and is frozen at
// birth: nothing grows until the player deploys a pack. Every pack the
// player lays becomes a colony, freezing whatever was still growing, with
// the chosen brick's plane as its floor — the reseed-from-this-plane
// primitive, and the whole game.

import { stream, rint, pick } from "./prng.js";
import { genome, GRID } from "./genome.js";
import { Growth } from "./crystal.js";
import { SHAPES } from "./tilings.js";

export const LEVEL_VERSION = 1;
export const C = GRID >> 1;               // the slab sits on the lattice's centre column
export const SLAB_Z = 6;                  // its lowest layer
export const MAX_LEVEL = 9999;
export const TILING_R = 44;               // a prism world's tiling radius, in edge lengths
export const PRISM_LAYERS = 96;           // Prism.Z: the layers a prism world has

export function normalizeShape(t) { return SHAPES.includes(t) ? t : "grid"; }

export function normalizeLevel(n) {
  const v = parseInt(String(n), 10);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, MAX_LEVEL);
}

// A pack: a specimen's laws (habit, kinetics, oxide) with a budget and a
// crew sized for a level, plus the plate it lands as. Passed straight to
// Growth.deploy, so the colony's PRNG stream is keyed by the pack's own seed.
export function pack(seed, r) {
  const g = genome(seed);
  return {
    seed,
    habit: g.habit,
    habitDesc: g.habitDesc,
    label: g.label,
    masons: rint(r, 8, 16),
    budget: rint(r, 900, 1500),
    rim: g.rim,
    k1: g.k1, k2: g.k2, k3: g.k3,
    patience: g.patience,
    mobility: g.mobility,
    flight: g.flight,
    axis: g.axis,
    oxide: g.oxide,
    size: pick(r, [2, 3]) === 0 ? 3 : 5,
    thick: 1,
  };
}

// The same number on a different tiling is the same slab, pocket and offset
// — only the substrate changes, and with it what the packs grow and where
// the survey says the bucket goes. A prism pack always lands two rings wide:
// one ring of rhombs or triangles can nucleate nothing.
export function level(n, shape = "grid") {
  n = normalizeLevel(n);
  shape = normalizeShape(shape);
  const r = stream(n, "level");
  const size = rint(r, 16, 24);
  const slab = { x: C, y: C, z: SLAB_Z, size, thick: 2 };
  const npacks = Math.min(6, 3 + Math.floor(n / 3));
  const packs = [];
  for (let i = 0; i < npacks; i++) packs.push(pack(rint(r, 1, 900000), r));
  // the bucket sits off to one side: further with every level
  const spread = Math.min(28, 4 + 3 * n);
  const off = { dx: rint(r, -spread, spread), dy: rint(r, -spread, spread) };
  // ...and at this fraction of the height a naive stack of the packs reaches
  const climb = Math.min(0.9, 0.66 + 0.02 * n);
  const prism = shape !== "grid";
  if (prism) for (const p of packs) p.size = 5;
  return { n, seed: n, version: LEVEL_VERSION, shape, prism, slab, packs, off, climb, zMax: prism ? PRISM_LAYERS - 8 : GRID - 10 };
}

// where the slab is centred, in world coordinates: the lattice centre, or
// a tiling's origin
export function origin(lv) { return lv.prism ? [0, 0] : [lv.slab.x, lv.slab.y]; }

export function slabTop(lv) { return lv.slab.z + lv.slab.thick - 1; }

// The world: a Growth whose colony 0 is the slab, frozen — it grew nothing
// and never will. Its genome is the level's own specimen (oxide, laws), so
// the slab wears the level's palette.
export function world(lv) {
  const gen = genome(lv.seed);
  if (lv.prism) {
    // a disk of tiles the width of the cubic slab, the same two layers deep
    gen.substrate = { shape: lv.shape, R: TILING_R, ic: { disk: lv.slab.size / 2, thickness: lv.slab.thick }, z0: lv.slab.z };
    gen.budget = 0;
    const g = new Growth(gen);
    g.freeze();
    return g;
  }
  const vox = [];
  const half = lv.slab.size >> 1, s = lv.slab;
  for (let k = 0; k < s.thick; k++) for (let dy = -half; dy < s.size - half; dy++) for (let dx = -half; dx < s.size - half; dx++)
    vox.push([s.x - C + dx, s.y - C + dy, s.z + k - (C - 20)]);   // Lattice.seed offsets from (C, C, C-20)
  gen.voxels = vox;
  gen.budget = 0;
  const g = new Growth(gen);
  g.freeze();
  return g;
}

// The survey: stack every pack on the summit of the last, run each to the
// end, and report how high that reaches. The engine is deterministic, so the
// page and the worker and the selftest all get the same answer. `onPack` is
// called after each pack for progress.
export function survey(lv, onPack) {
  const g = world(lv);
  let reach = g.sub.describe(g.sub.summit());
  for (let i = 0; i < lv.packs.length; i++) {
    const idx = g.deploy(lv.packs[i], null);
    if (idx < 0) break;
    const col = g.colonies[idx];
    while (!col.done) g.step();
    reach = g.sub.describe(g.sub.summit());
    if (onPack) onPack(i, reach);
  }
  return { reach, bricks: g.bricks.length, ticks: g.tick };
}

// Where the bucket goes, given the survey's reach. Interior 3×3, walls one
// brick thick and three high, a floor: 5×5×4 cells. `x, y` is the centre
// column, `z` the floor layer.
export function bucketOf(lv, reach) {
  const top = slabTop(lv);
  const rise = Math.max(0, reach.z - top);
  const z = Math.min(lv.zMax, top + Math.max(8, Math.round(rise * lv.climb)));
  const o = origin(lv);
  let x, y;
  if (lv.prism) {
    // inside the tiling, with room for the walls
    const lim = TILING_R - 12;
    x = Math.max(-lim, Math.min(lim, o[0] + lv.off.dx));
    y = Math.max(-lim, Math.min(lim, o[1] + lv.off.dy));
  } else {
    x = Math.max(8, Math.min(GRID - 9, o[0] + lv.off.dx));
    y = Math.max(8, Math.min(GRID - 9, o[1] + lv.off.dy));
  }
  return { x, y, z, rim: z + 3, reach };
}

export function bucketCells(b) {
  const out = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    out.push([b.x + dx, b.y + dy, b.z]);
    if (Math.abs(dx) === 2 || Math.abs(dy) === 2) for (let k = 1; k <= 3; k++) out.push([b.x + dx, b.y + dy, b.z + k]);
  }
  return out;
}

// Is a point (feet) inside the bucket — over its floor, within its walls?
export function inBucket(b, x, y, z) {
  return b && Math.abs(Math.floor(x) - b.x) <= 1 && Math.abs(Math.floor(y) - b.y) <= 1 && z >= b.z + 1 - 1e-3 && z < b.z + 4;
}

export function plateLabel(lv, p) { return lv.prism ? `${Math.max(1, p.size >> 1)} rings` : `${p.size}×${p.size}`; }
export function packLabel(lv, p) {
  return `${p.habit} · ${p.masons} masons · ${p.budget.toLocaleString("en-US")} bricks · ${plateLabel(lv, p)} plate`;
}
