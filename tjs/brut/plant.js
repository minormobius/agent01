// tjs/brut/plant.js — THE BOTANY. Pure, DOM-free, three.js-free.
//
// The course this belongs to is in ECOBRUTALISM.md; this is Phase 1 of it.
//
// A procedural tree is usually a decoration with a fractal in it. This one has
// to carry load, so it is built the other way round: the rule that decides the
// SHAPE is the same rule that decides the STRUCTURE, and there is only one of
// them.
//
// That rule is the PIPE MODEL (Shinozaki, 1964 — and Leonardo wrote it down in
// about 1500, which is why it is also called Leonardo's rule): every leaf is
// served by a fixed cross-section of conducting tissue, so the cross-sectional
// area of a branch is conserved through a fork:
//
//     d_parent^n  =  Σ d_child^n            n ≈ 2 … 2.5
//
// Botanically that is plumbing. Structurally it is a cantilever sized by the
// load it carries, because the leaves it feeds are also the sail area it holds
// against the wind. One equation does both jobs, which is the only reason a
// generated tree can be put into a structural model without lying.
//
// Three more things are real rather than tuned:
//
//   · the CROWN comes from space colonization (Runions et al., 2007) — scatter
//     attractors through an envelope, grow toward them, kill them as they are
//     reached. It takes the ENVELOPE as an argument, and that is the whole
//     coupling to the architecture: a tree under a soffit grows lopsided, one
//     against a facade grows out toward the light, one in a corner planter
//     fills a quadrant. Growing a tree in free space and scaling it to fit is
//     instancing with extra steps.
//
//   · the MASS comes from Chave's 2014 pantropical allometry, because the mass
//     IS the load and a made-up number here makes every downstream check
//     theatre.
//
//   · the DRAG uses Vogel reconfiguration. A tree is not a signboard: the crown
//     furls and the frontal area collapses as the wind rises, so F ∝ U^(2+Ψ)
//     with Ψ negative. Treating a crown as a rigid bluff body overestimates the
//     load on a big one by a factor of two, and it is the difference between a
//     planted tower that pencils and one that does not.

export const VERSION = 'plant/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const TAU = Math.PI * 2;

/* ────────────────────────────── the substrate ───────────────────────────── */
//
// THE LADDER RUNS DOWNWARD. Soil depth is not a landscape choice, it is
// whatever the slab will take — so the palette is a consequence of the
// structure rather than a wish handed to it. Every drawing of a "green roof"
// with trees on 200 mm of substrate is a drawing of dead trees.
//
// Saturated density is the number that matters: a green roof is designed wet,
// because it will be wet, and the difference between dry and saturated is most
// of the load.

export const SUBSTRATE = { dry: 1050, saturated: 1600 };   // kg/m³

export const SOIL = [
  { min: 0.08, label: 'sedum mat', palette: ['sedum', 'moss'],
    note: 'the thinnest thing that lives on a roof: a mat, not a soil. It survives drought by shutting down, which is why it is the only planting that needs no irrigation and the only one that never looks lush' },
  { min: 0.15, label: 'extensive', palette: ['sedum', 'grass', 'herb'],
    note: 'grasses and herbs. Still light enough to go on a roof designed for maintenance access and nothing else' },
  { min: 0.30, label: 'semi-intensive', palette: ['grass', 'herb', 'fern', 'climber'],
    note: 'perennials and small shrubs — the point where it stops being a roof finish and starts being a garden, and starts needing water' },
  { min: 0.60, label: 'intensive', palette: ['shrub', 'bamboo', 'climber'],
    note: 'large shrubs. Ten kilopascals saturated: four times an office floor’s live load, and the slab has to have been designed for it' },
  { min: 0.90, label: 'tree pit', palette: ['shrub', 'bamboo', 'smallTree', 'climber'],
    note: 'a small tree will live here. It will not thrive, and it will need staking for years, but it will live' },
  { min: 1.50, label: 'deep tree pit', palette: ['smallTree', 'tree', 'bamboo', 'climber'],
    note: 'what a real tree wants. Twenty-six kilopascals with the tree on it, which is why Bosco Verticale’s planters sized its structure rather than the other way round' },
];

// The band a depth falls in, and what will actually grow there.
export function soilFor(depth) {
  let out = null;
  for (const s of SOIL) if (depth >= s.min - 1e-9) out = s;
  return out;
}

// Saturated load of a substrate depth, in Pa. This is the number the whole
// argument for doing this properly rests on: one metre is 16 kPa against an
// office floor's 2.4.
export function soilLoad(depth, g = 9.81) {
  return depth * SUBSTRATE.saturated * g;
}

/* ─────────────────────────────── the species ────────────────────────────── */
//
// A SPECIES IS DATA, NOT CODE. If adding one needs a new branch in `grow()`,
// the model is wrong. Everything here is either a measured allometric constant
// or a habit parameter the growth model reads directly.
//
//   ρ        wood density, g/cm³ — Chave's equation is most sensitive to it
//   hA, hB   height from diameter: H = hA · D^hB, D in metres
//   crownA/B crown spread from diameter: CD = crownA + crownB · D
//   pipe     the pipe-model exponent, 2 for a strict area conservation and
//            higher for species that taper harder than plumbing requires
//   vogel    the reconfiguration exponent Ψ, in leaf
//   cd0      rigid-body drag coefficient at the reference speed
//   soil     the minimum substrate depth it will actually live in
//   wind     the mean wind speed above which it will not survive on a facade

export const SPECIES = {
  sedum: {
    label: 'sedum', kind: 'mat', h: [0.06, 0.12], soil: 0.08,
    rho: 0.10, hA: 1.4, hB: 0.5, crownA: 0.3, crownB: 2, pipe: 2.0,
    vogel: -0.3, cd0: 0.4, wind: 40, evergreen: true, lai: 2.0,
    kgPerM2: 14,
    note: 'a succulent mat that shuts down in drought — the only roof planting that survives with no irrigation at all',
  },
  grass: {
    label: 'ornamental grass', kind: 'tuft', h: [0.4, 1.2], soil: 0.15,
    rho: 0.12, hA: 6, hB: 0.6, crownA: 0.2, crownB: 6, pipe: 2.0,
    vogel: -1.2, cd0: 0.6, wind: 35, evergreen: false, lai: 3.0,
    kgPerM2: 7,
    note: 'reconfigures more than anything else here — it lies flat in a gale and stands up again, which is why it survives on parapets',
  },
  herb: {
    label: 'herb layer', kind: 'tuft', h: [0.2, 0.6], soil: 0.15,
    rho: 0.15, hA: 4, hB: 0.6, crownA: 0.25, crownB: 5, pipe: 2.0,
    vogel: -1.0, cd0: 0.6, wind: 30, evergreen: false, lai: 2.5,
    kgPerM2: 5,
    note: 'wildflower and herb — the layer that makes an extensive roof an ecosystem rather than a surface',
  },
  fern: {
    label: 'fern', kind: 'tuft', h: [0.4, 1.0], soil: 0.30,
    rho: 0.14, hA: 5, hB: 0.55, crownA: 0.4, crownB: 5, pipe: 2.0,
    vogel: -0.9, cd0: 0.7, wind: 18, evergreen: true, lai: 4.0,
    kgPerM2: 9,
    note: 'wants shade and shelter, so it belongs under a soffit or in a court and nowhere near a corner at height',
  },
  shrub: {
    label: 'shrub', kind: 'shrub', h: [1.0, 3.0], soil: 0.60,
    rho: 0.55, hA: 11, hB: 0.55, crownA: 0.5, crownB: 9, pipe: 2.2,
    vogel: -0.8, cd0: 0.8, wind: 28, evergreen: true, lai: 4.0,
    note: 'the workhorse of a planted facade: dense enough to read as green from the street, small enough not to need a metre of soil',
  },
  bamboo: {
    label: 'bamboo', kind: 'cane', h: [3.0, 8.0], soil: 0.60,
    rho: 0.65, hA: 30, hB: 0.75, crownA: 0.3, crownB: 4, pipe: 2.0,
    vogel: -1.1, cd0: 0.9, wind: 32, evergreen: true, lai: 5.0,
    note: 'a grass pretending to be a tree — very tall for its diameter, and it survives wind by bending almost to the ground',
  },
  climber: {
    label: 'climber', kind: 'climber', h: [2.0, 12.0], soil: 0.30,
    rho: 0.35, hA: 40, hB: 0.9, crownA: 0.2, crownB: 2, pipe: 2.0,
    vogel: -0.7, cd0: 0.5, wind: 45, evergreen: false, lai: 5.5,
    note: 'the cheapest square metre of green there is, because the wall carries it — and the one planting a brutalist facade was always going to get',
  },
  smallTree: {
    label: 'small tree', kind: 'tree', h: [4.0, 8.0], soil: 0.90,
    rho: 0.58, hA: 18, hB: 0.55, crownA: 0.6, crownB: 14, pipe: 2.3,
    vogel: -0.7, cd0: 0.9, wind: 24, evergreen: false, lai: 4.0,
    note: 'a terrace tree: big enough to sit under, small enough that a metre of soil is honest rather than optimistic',
  },
  tree: {
    label: 'tree', kind: 'tree', h: [8.0, 16.0], soil: 1.50,
    rho: 0.62, hA: 22, hB: 0.55, crownA: 0.8, crownB: 18, pipe: 2.4,
    vogel: -0.6, cd0: 1.0, wind: 20, evergreen: false, lai: 4.5,
    note: 'the real thing, and the reason the structure has to know: a mature one is most of a tonne of fresh mass on a cantilever, root-anchored against a gust it will feel more of than anything else on the building',
  },
};
export const SPECIES_IDS = Object.keys(SPECIES);

/* ═══════════════════════════════ allometry ══════════════════════════════════
   The dimensions that have to be RIGHT, because everything downstream is a
   consequence of them. These are measured relations, not shape parameters. */

// Trunk diameter at breast height from height, and back. `H = a·D^b` inverts
// exactly, and the selftest checks the round trip — a one-way relation is how
// a load ends up being computed from a diameter the geometry never had.
export function dbhFor(sp, height) {
  const S = SPECIES[sp] || SPECIES.tree;
  return Math.pow(Math.max(1e-6, height) / S.hA, 1 / S.hB);
}
export function heightFor(sp, dbh) {
  const S = SPECIES[sp] || SPECIES.tree;
  return S.hA * Math.pow(Math.max(1e-9, dbh), S.hB);
}
export function crownFor(sp, dbh) {
  const S = SPECIES[sp] || SPECIES.tree;
  return S.crownA + S.crownB * dbh;
}

// CHAVE ET AL. 2014, the pantropical above-ground biomass equation:
//
//     AGB = 0.0673 · (ρ · D² · H)^0.976        D in cm, H in m, ρ in g/cm³
//
// It is the standard, it is fitted to four thousand harvested trees, and it is
// where the LOAD comes from — so it is the one relation in this file worth
// getting from the literature rather than from intuition. It returns DRY mass;
// a living tree is roughly twice that, and the structure feels the living one.
export function dryMass(sp, dbh, height) {
  const S = SPECIES[sp] || SPECIES.tree;
  const D = dbh * 100;
  return 0.0673 * Math.pow(S.rho * D * D * height, 0.976);
}
export const MOISTURE = 1.9;                    // fresh ÷ dry, for a living tree
export function freshMass(sp, dbh, height) {
  return dryMass(sp, dbh, height) * MOISTURE;
}

/* ═════════════════════════════ the pipe model ══════════════════════════════
   d_parent^n = Σ d_child^n. Applied bottom-up over the skeleton, which is what
   makes the taper a consequence of the crown rather than a parameter of it: a
   branch is thick because of what hangs off it. */

export function pipeRadius(childRadii, n = 2.0, tipR = 0.004) {
  if (!childRadii.length) return tipR;
  let s = 0;
  for (const r of childRadii) s += Math.pow(r, n);
  return Math.pow(s, 1 / n);
}

/* ═══════════════════════════ the growth model ══════════════════════════════
   Space colonization. The crown is not a fractal and not a spline: it is what
   grows when a stem reaches toward light that is scattered through a volume,
   and consumes it as it arrives. The VOLUME is the argument, and the building
   supplies it. */

// A seeded stream, matching arch.js's so a tree is part of the permalink.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function Rand(seed, salt = '') {
  const f = mulberry32(xmur3(String(seed) + '::' + salt)());
  return { f, range: (a, b) => a + f() * (b - a), chance: (p) => f() < p };
}

// THE ENVELOPE is where the architecture gets to shape the tree. It is a
// predicate over a point in the crown's own frame (x, y, z with y up and the
// origin at the base of the crown) plus the bounds to scatter within — so a
// soffit is `(p) => p.y < clear`, a facade is `(p) => p.z > 0`, and a corner
// planter is both. Everything else about the tree follows from what is left.
export function envelopeFor(o = {}) {
  const { r = 3, h = 6, clear = Infinity, half = null, lean = 0 } = o;
  return {
    r, h, clear, lean,
    bounds: { x: [-r, r], y: [0, Math.min(h, clear)], z: [-r, r] },
    // an ellipsoid crown, clipped by whatever the building puts in the way
    test: (x, y, z) => {
      if (y < 0 || y > Math.min(h, clear)) return false;
      // half === 'z+' keeps the crown on one side, which is what a tree hard
      // against a facade actually does — it grows toward the light
      if (half === 'z+' && z < -r * 0.15) return false;
      if (half === 'z-' && z > r * 0.15) return false;
      if (half === 'x+' && x < -r * 0.15) return false;
      if (half === 'x-' && x > r * 0.15) return false;
      const yc = (y - h * 0.5) / (h * 0.5);
      const rr = (x * x + z * z) / (r * r);
      return rr + yc * yc <= 1;
    },
  };
}

// Grow one plant. Returns a SKELETON — nodes, segments with radii, and the
// derived quantities the structure needs — and nothing about how to draw it.
export function grow(sp, opts = {}) {
  const S = SPECIES[sp] || SPECIES.tree;
  const rnd = opts.rnd || Rand(opts.seed || 'plant', sp);
  const height = opts.height != null ? opts.height : rnd.range(S.h[0], S.h[1]);
  const dbh = dbhFor(sp, height);
  const spread = opts.spread != null ? opts.spread : crownFor(sp, dbh);

  // trunk to the crown base, then the crown itself
  const crownBase = S.kind === 'tree' ? height * 0.38 : height * 0.12;
  const env = opts.envelope || envelopeFor({
    r: spread / 2, h: height - crownBase, clear: opts.clear != null ? opts.clear - crownBase : Infinity,
    half: opts.half || null,
  });

  // ── the attractors ───────────────────────────────────────────────────────
  // Rejection-sampled inside the envelope, so a clipped crown really is thinner
  // rather than the same crown squashed.
  const want = Math.max(24, Math.round(opts.detail != null ? opts.detail : 140));
  const pts = [];
  for (let tries = 0; tries < want * 40 && pts.length < want; tries++) {
    const x = rnd.range(env.bounds.x[0], env.bounds.x[1]);
    const y = rnd.range(env.bounds.y[0], env.bounds.y[1]);
    const z = rnd.range(env.bounds.z[0], env.bounds.z[1]);
    if (env.test(x, y, z)) pts.push({ x, y: y + crownBase, z, dead: false });
  }

  // ── the skeleton ─────────────────────────────────────────────────────────
  // The step has to be small relative to the CROWN, not just to the height: a
  // kill radius wider than the crown itself consumes every attractor on the
  // first pass, which is how a herb layer came out as an eight-segment stick.
  const crownR = Math.max(0.05, env.bounds.x[1]);
  const step = Math.max(0.02, Math.min(Math.max(0.08, (env.bounds.y[1] || height) / 14), crownR * 0.3));
  const kill = step * 1.7, influence = step * 9;
  const nodes = [{ x: 0, y: 0, z: 0, parent: -1, depth: 0 }];
  // grow the clear stem first, so the crown starts where the species says
  let cur = 0;
  for (let y = step; y <= crownBase + 1e-9; y += step) {
    nodes.push({ x: 0, y: r3(y), z: 0, parent: cur, depth: 0 });
    cur = nodes.length - 1;
  }

  const stemTop = nodes.length - 1;        // the last node of the clear stem
  const maxIter = 260;
  for (let it = 0; it < maxIter; it++) {
    // each live attractor pulls on its nearest node within reach
    const pull = new Map();
    let live = 0;
    for (const a of pts) {
      if (a.dead) continue;
      live++;
      let best = -1, bd = influence * influence;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        // THE CLEAR STEM IS NOT A BRANCHING SURFACE. Letting an attractor pull
        // on a node below the crown base grows branches out of the trunk's
        // foot — which is not what a tree does, and which forks the root so
        // that "the trunk" is no longer a single thing to measure.
        if (i < stemTop) continue;
        const d = (n.x - a.x) ** 2 + (n.y - a.y) ** 2 + (n.z - a.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) continue;
      const v = pull.get(best) || { x: 0, y: 0, z: 0, n: 0 };
      const L = Math.sqrt(bd) || 1;
      v.x += (a.x - nodes[best].x) / L; v.y += (a.y - nodes[best].y) / L; v.z += (a.z - nodes[best].z) / L;
      v.n++;
      pull.set(best, v);
    }
    if (!live || !pull.size) break;

    // every pulled node puts out one new segment along the mean direction
    const added = [];
    for (const [i, v] of pull) {
      let { x, y, z } = v;
      const L = Math.hypot(x, y, z);
      if (L < 1e-9) continue;
      x /= L; y /= L; z /= L;
      // a small seeded wobble, so two branches pulled by the same cloud do not
      // grow as one line — and it is seeded, so the tree is still a permalink
      x += rnd.range(-0.12, 0.12); z += rnd.range(-0.12, 0.12); y += rnd.range(-0.04, 0.09);
      const L2 = Math.hypot(x, y, z) || 1;
      const p = nodes[i];
      added.push({
        x: r3(p.x + (x / L2) * step), y: r3(p.y + (y / L2) * step), z: r3(p.z + (z / L2) * step),
        parent: i, depth: p.depth + 1,
      });
    }
    if (!added.length) break;
    for (const a of added) nodes.push(a);

    // and consume the light that has been reached
    for (const a of pts) {
      if (a.dead) continue;
      for (const nd of added) {
        if ((nd.x - a.x) ** 2 + (nd.y - a.y) ** 2 + (nd.z - a.z) ** 2 < kill * kill) { a.dead = true; break; }
      }
    }
  }

  // ── the radii, bottom-up, by the pipe model ─────────────────────────────
  // A branch is thick because of what hangs off it. That is the botany and it
  // is also the statics, which is why one pass does both.
  const kids = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) if (nodes[i].parent >= 0) kids[nodes[i].parent].push(i);
  const tipR = Math.max(0.003, dbh * 0.035);
  const radius = new Array(nodes.length).fill(tipR);
  // BOTTOM-UP MEANS REVERSE INDEX ORDER, not descending branch depth. Every
  // node is pushed after its parent, so reverse index is a guaranteed
  // topological order — where `depth` is the BRANCHING depth, which every node
  // of the clear stem shares. Sorting on it left the trunk's own order
  // arbitrary, so the pipe model was summing radii that had not been computed
  // yet and the trunk came out at whatever the last write happened to be.
  const order = [...nodes.keys()].reverse();
  for (const i of order) {
    radius[i] = kids[i].length ? pipeRadius(kids[i].map((k) => radius[k]), S.pipe, tipR) : tipR;
  }
  // the base is the measured trunk, so the model and the allometry agree at the
  // one place they can both be checked. Uniform scaling preserves the pipe
  // relation exactly — (Σ(k·r)^n)^(1/n) = k·(Σr^n)^(1/n) — which is the only
  // reason it is allowed to happen after the fact rather than before.
  //
  // NOT ROUNDED. A twig is three millimetres; rounding radii to the millimetre
  // put a thirteen per cent error into the one equation this whole file rests
  // on, which is the same class of mistake as rounding a riser. Rounding is for
  // the part list, and the part list does it.
  const scale = radius[0] > 1e-9 ? (dbh / 2) / radius[0] : 1;
  for (let i = 0; i < radius.length; i++) radius[i] *= scale;

  // ── the segments the drawing and the model both read ────────────────────
  const segments = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[nodes[i].parent], b = nodes[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    segments.push({
      x0: a.x, y0: a.y, z0: a.z, x1: b.x, y1: b.y, z1: b.z,
      len: r3(len), r: radius[i], depth: b.depth,
      dir: [r3(dx / len), r3(dy / len), r3(dz / len)],
      tip: kids[i].length === 0,
    });
  }

  const realH = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  // A SPREAD IS NEVER ZERO. A climber with nothing to climb grows as a bare
  // stem, and its crown really does have no radius — but zero spread divides
  // by nothing downstream (spacing, drag area, the plan symbol), so the floor
  // is the stem itself, which is what is actually there.
  const realR = Math.max(dbh / 2,
    nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.z)), 0));
  return {
    version: VERSION, species: sp, label: S.label, kind: S.kind,
    height: r2(realH), spread: r2(realR * 2), dbh: r3(dbh),
    designHeight: r2(height), crownBase: r2(crownBase),
    nodes, segments, tips: segments.filter((s) => s.tip).length,
    soil: S.soil, evergreen: S.evergreen,
    ...massAndSail(sp, dbh, realH, realR),
  };
}

/* ═══════════════════════════ loads and the wind ════════════════════════════ */

// CHAVE'S EQUATION IS FOR WOODY PLANTS, and asking it for a sedum mat gives a
// two-hundred-microgram plant — because a 5 mm "trunk" carrying 90 mm of height
// is outside the domain the equation was fitted on, and outside a fitted domain
// an allometry does not degrade gracefully, it just lies quietly. A mat and a
// tuft are measured the way the trade measures them instead: kilograms per
// square metre of cover, saturated.
function massAndSail(sp, dbh, height, crownR) {
  const S = SPECIES[sp] || SPECIES.tree;
  const dry = S.kgPerM2 != null
    ? S.kgPerM2 * Math.PI * crownR * crownR / MOISTURE
    : dryMass(sp, dbh, Math.max(0.1, height));
  // the frontal area of the crown, which is what the wind sees — an ellipse,
  // not the plan circle, and the LAI is what makes it porous rather than solid
  const crownH = Math.max(0.1, height * (S.kind === 'tree' ? 0.62 : 0.88));
  const frontal = Math.PI * crownR * (crownH / 2);
  return {
    // NOT rounded to two places: a sedum plant weighs grams, and r2 makes it
    // weigh nothing at all — which is how a roof of them came out weightless
    dryMass: r3(dry), freshMass: r3(dry * MOISTURE),
    crownArea: r2(Math.PI * crownR * crownR),
    frontalArea: r2(frontal),
    lai: S.lai,
  };
}

// VOGEL RECONFIGURATION. A tree is not a signboard. As the wind rises the
// leaves furl, the branches bend downwind and the frontal area collapses, so
// the drag grows more slowly than U²:
//
//     F  =  ½ ρ Cd₀ A U²  ·  (U / U_ref)^Ψ            Ψ ≈ −0.6 … −1.2
//
// At U_ref it is exactly the rigid-body answer, and above it, less. Ignoring
// this overestimates the load on a big crown by a factor of two, which is the
// difference between a planted tower that pencils and one that does not — and
// a bare deciduous crown in a winter gale has almost no reconfiguration left,
// which is why the two load cases are genuinely different.
export const AIR = 1.225;                       // kg/m³
export const U_REF = 10;                        // m/s, where Cd₀ is measured

export function dragOn(tree, U, opts = {}) {
  const S = SPECIES[tree.species] || SPECIES.tree;
  const inLeaf = opts.inLeaf != null ? opts.inLeaf : true;
  // out of leaf: the branches remain, the sail area does not, and what is left
  // is far more nearly rigid
  const A = tree.frontalArea * (inLeaf ? 1 : 0.22);
  const cd = S.cd0 * (inLeaf ? 1 : 1.15);
  const psi = inLeaf ? S.vogel : -0.15;
  const rigid = 0.5 * AIR * cd * A * U * U;
  const recon = rigid * Math.pow(Math.max(1e-6, U) / U_REF, psi);
  return {
    U, inLeaf, area: r2(A), cd: r3(cd), vogel: psi,
    rigid: r2(rigid), force: r2(recon),
    // the moment about the base of the trunk, which is what the anchorage and
    // the planter have to resist — and on a facade it is the number that
    // decides whether a tree may be there at all
    moment: r2(recon * tree.height * 0.62),
    ratio: r3(recon / Math.max(1e-9, rigid)),
  };
}

/* ═══════════════════════════ what gets built ═══════════════════════════════
   One list, for the bench and the drawing both — the same rule the stairs live
   by. `dir` is carried rather than an Euler triple because a branch points
   anywhere, and three angles in a fixed order is how a branch ends up pointing
   somewhere else. */

export function plantParts(tree, o = {}) {
  const { x = 0, y = 0, z = 0, level = 0 } = o;
  const out = [];
  for (const s of tree.segments) {
    out.push({
      mat: 'wood', kind: 'branch', level,
      x: r3(x + (s.x0 + s.x1) / 2), y: r3(y + (s.y0 + s.y1) / 2), z: r3(z + (s.z0 + s.z1) / 2),
      w: r3(s.r * 2), h: s.len, d: r3(s.r * 2), dir: s.dir, depth: s.depth,
    });
  }
  // the foliage: one blob per tip, sized so the whole canopy comes out at the
  // crown volume the allometry asked for rather than at whatever looks full
  if (tree.kind !== 'mat') {
    const tips = tree.segments.filter((s) => s.tip);
    const rLeaf = tips.length ? Math.max(0.12, (tree.spread / 2) / Math.cbrt(tips.length) * 0.9) : 0.3;
    for (const s of tips) {
      out.push({
        mat: 'leaf', kind: 'foliage', level,
        x: r3(x + s.x1), y: r3(y + s.y1), z: r3(z + s.z1),
        w: r3(rLeaf * 2), h: r3(rLeaf * 2), d: r3(rLeaf * 2), sphere: true,
      });
    }
  }
  return out;
}

// THE PLAN SYMBOL every landscape drawing uses: the spread as a circle, a
// centre cross at the trunk, and the trunk itself at its real diameter. A tree
// drawn at anything other than its mature spread is a tree that will be cut
// down in ten years, so the circle is the dimension that matters and it is the
// one taken from the allometry.
export function plantPlan(tree, o = {}) {
  const { x = 0, z = 0 } = o;
  return {
    x, z, r: r2(tree.spread / 2), trunk: r3(tree.dbh / 2),
    label: tree.label, kind: tree.kind, evergreen: tree.evergreen,
  };
}

/* ═════════════════════════════ the check list ══════════════════════════════
   Same shape as the stair's and the lift's: every check says what it protects.
   These are the ones that decide whether a plant may be where it has been put,
   and all four of them are reasons a real planted facade gets redesigned. */

export function check(tree, o = {}) {
  const S = SPECIES[tree.species] || SPECIES.tree;
  const { depth = 0, gust = 20, heightAboveGrade = 0, slabCapacity = null, inLeaf = true } = o;
  const c = [];
  const add = (id, label, pass, value, note) => c.push({ id, label, pass, value, note });

  add('soil', 'Substrate depth', depth >= S.soil - 1e-9,
    `${Math.round(depth * 1000)} mm of ${Math.round(S.soil * 1000)} needed`,
    'the hard one. A tree in 200 mm is not a small tree, it is a dead tree in two summers — soil depth decides the palette and nothing negotiates with it');

  const load = soilLoad(depth) + (tree.freshMass * 9.81) / Math.max(1, tree.crownArea);
  add('load', 'Saturated load on the slab', slabCapacity == null || load <= slabCapacity,
    `${(load / 1000).toFixed(1)} kPa${slabCapacity ? ` of ${(slabCapacity / 1000).toFixed(1)}` : ''}`,
    'designed WET, because it will be wet. A metre of saturated substrate is 16 kPa against an office floor’s 2.4 — this is the load case that sizes the slab, not the one applied to it afterwards');

  const d = dragOn(tree, gust, { inLeaf });
  add('wind', 'Crown drag at the design gust', gust <= S.wind + 1e-9,
    `${(d.force / 1000).toFixed(2)} kN at ${gust} m/s (rigid would say ${(d.rigid / 1000).toFixed(2)})`,
    `this species gives up above ${S.wind} m/s mean. The crown reconfigures — it furls and bends downwind — so the drag is ${Math.round(d.ratio * 100)} % of what a signboard of the same area would take, and assuming otherwise doubles the anchorage`);

  add('anchor', 'Root anchorage', depth >= S.soil * 0.9,
    `${d.moment.toFixed(0)} N·m overturning about the base`,
    heightAboveGrade > 20
      ? 'above twenty metres this is the check that matters most: a tree that comes off a facade is not a landscaping problem, which is why Bosco Verticale root-caged every one of its nine hundred'
      : 'the moment the planter and its fixings have to resist');

  return { checks: c, pass: c.every((q) => q.pass), governing: c.find((q) => !q.pass) || null };
}
