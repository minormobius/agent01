// bismuth — the genome. One integer seed → every parameter the growth engine
// and the renderer read. Nothing else is random anywhere on the site; the
// engine's own draws come from stream(seed, "growth"), so the genome can gain
// fields without re-rolling a single brick of an existing crystal.
//
// The physics knobs map onto real crystal-growth ideas:
//   rim      — the Berg effect. Supersaturation is highest at edges and corners
//              and lowest over face centres, so face centres starve. `rim` is
//              how far in from a face's outline the melt still feeds: the
//              width of every terrace.
//   k1/k3    — Kossel–Stranski terrace-ledge-kink energetics. Attaching to a
//              flat terrace (1 bond) is rare (2D nucleation barrier), to a
//              ledge (2 bonds) is the unit rate, into a kink (3+ bonds) is fast.
//   axis     — growth-rate anisotropy per face normal: which faces hopper.
//   oxide    — the thin-film palette. Bi₂O₃ grows on the hot crystal while it
//              cools, so older bricks carry thicker films and sit further along
//              the interference sequence (gold → magenta → blue → green).

import { stream, rint, rf, pick } from "./prng.js";

export const GRID = 128;           // lattice edge; the crystal lives inside it
export const CHUNK = 16;           // renderer chunk edge (mesh rebuild unit)

// The laws of the mason brain that are not per-seed. The engine reads these
// through genome.brain (merged over the defaults), so the playground can
// rewrite a law without touching the seeded surface: with the defaults, every
// permalink lays exactly the bricks it always did (the selftest pins that
// with golden hashes).
export const DEFAULT_BRAIN = {
  arriveFromAbove: 0.6,   // fraction of arrivals that come down from the melt's surface
  skyPull: 2.5,           // walk weight multiplier for cells with open sky above
  bondPull: 2,            // walk weight is 1 + nb^bondPull · mobility (integer exponent)
  lipAlong: 0.35,         // lip nucleation weight with only one neighbour along the lip
  lipDepth: 2,            // lip nucleation × depth^lipDepth (0 = a skirt spreads from the foot)
  patchMin: 5,            // in-plane neighbours a terrace needs under a new layer…
  patchFull: 8,           // …and how many for the full rate
  patchPart: 0.45,        // the rate between patchMin and patchFull
  skyRule: true,          // the melt is above: nothing is laid under an existing brick
  lipRule: true,          // lateral nucleation only at a top lip
  coolExtra: 0.15,        // bricks the cool-down may add, as a fraction of the budget
};

// Population control: a fixed colony by default (what the seeded surface
// does). The playground can grow or thin it.
export const DEFAULT_POPULATION = {
  birthEvery: 0,          // add a mason every N bricks laid (0 = never)
  retireAfter: 0,         // a mason retires after laying N bricks (0 = never)
  min: 1,                 // never retire below this many
  max: 64,                // never breed above this many
};

const HABITS = [
  // name, axis-weight recipe, nucleus recipe. Weights are for +x -x +y -y +z -z.
  { id: "hopper",    w: () => [0.6, 0.6, 0.6, 0.6, 1.0, 0],       desc: "a single funnel, stepping down into its own pit" },
  { id: "staircase", w: () => [1.0, 0.25, 0.45, 0.45, 1.0, 0],    desc: "terraces running off in one direction" },
  { id: "twin",      w: () => [0.7, 0.7, 0.4, 0.4, 1.0, 0],       desc: "two hoppers grown into each other" },
  { id: "plate",     w: () => [1.0, 1.0, 1.0, 1.0, 0.55, 0],      desc: "wide and shallow — broad treads, low risers" },
  { id: "tower",     w: () => [0.5, 0.5, 0.5, 0.5, 1.0, 0],       desc: "steep — a stack of rings climbing out of the melt" },
];

export function genome(seed) {
  seed = normalizeSeed(seed);
  const r = stream(seed, "genome");

  const habit = HABITS[pick(r, [6, 3, 2, 2, 2])];
  const axis = habit.w().map((w) => w * rf(r, 0.8, 1.2));

  // The nucleus: the grain the melt froze around — a small plate, or two for
  // twins. Everything else is laid by masons.
  const nucleiN = habit.id === "twin" ? 2 : pick(r, [8, 1]) + 1;
  const nuclei = [];
  const c = GRID >> 1;
  for (let i = 0; i < nucleiN; i++) {
    const spread = i === 0 ? 0 : rint(r, 6, 12);
    const s = rint(r, 3, 7);
    nuclei.push({
      x: c + (i === 0 ? 0 : rint(r, -spread, spread)),
      y: c + (i === 0 ? 0 : rint(r, -spread, spread)),
      z: c - 20 + (i === 0 ? 0 : rint(r, -2, 2)),
      sx: s + rint(r, -1, 2), sy: s + rint(r, -1, 2), sz: rint(r, 1, 2),
    });
  }

  const g = {
    seed,
    habit: habit.id,
    habitDesc: habit.desc,
    grid: GRID,
    masons: rint(r, 6, 18),
    budget: rint(r, 3200, 11000),
    rim: pick(r, [2, 5, 4]) + 2,            // 2..4 — terrace width the melt can feed
    k1: rf(r, 0.004, 0.011),                // terrace nucleation, per visit
    k2: rf(r, 0.55, 0.9),                   // ledge advance, per visit
    k3: rf(r, 0.92, 1.0),                   // kink fill, per visit
    patience: rint(r, 40, 140),             // surface-diffusion steps before desorbing
    mobility: rf(r, 0.3, 2.0),              // how hard bonds pull the walk
    flight: rint(r, 2, 5),                  // ticks spent in the melt between bricks
    axis,
    nuclei,
    oxide: {
      base: rf(r, 40, 240),                 // nm, thinnest (youngest) film
      ramp: rf(r, 60, 230),                 // nm added over the crystal's age
      grain: rf(r, 1.5, 6),                 // nm, per-brick jitter
      warp: rf(r, 0.2, 1.0),                // strength of the slow spatial drift
      wavelength: rf(r, 9, 26),             // bricks, period of that drift
    },
  };
  g.label = label(g);
  return g;
}

export function normalizeSeed(s) {
  const n = parseInt(String(s), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 999999999);
}

function label(g) {
  const b = g.oxide.base, top = b + g.oxide.ramp;
  const band = (d) => d < 95 ? "silver-gold" : d < 150 ? "gold" : d < 205 ? "magenta" : d < 265 ? "blue" : d < 330 ? "cyan-green" : d < 400 ? "green-gold" : "second-order";
  const lo = band(b), hi = band(top);
  return `${g.habit} · ${lo === hi ? lo : lo + " → " + hi}`;
}
