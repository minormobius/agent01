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

export const VERSION = 'plant/2';

// A budget, for the same reason the manifold has a node budget: a mature plane
// on a roof garden is one of fifty plants, and the bench instances every branch.
// Past a few hundred segments a crown is not getting fuller, it is only getting
// more expensive — the FOLIAGE is what the eye reads.
export const SEGMENT_CAP = 700;

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
  { min: 0.08, label: 'sedum mat', palette: ['sedum'],
    note: 'the thinnest thing that lives on a roof: a mat, not a soil. It survives drought by shutting down, which is why it is the only planting that needs no irrigation and the only one that never looks lush' },
  { min: 0.15, label: 'extensive', palette: ['sedum', 'grass', 'herb'],
    note: 'grasses and herbs. Still light enough to go on a roof designed for maintenance access and nothing else' },
  { min: 0.30, label: 'semi-intensive', palette: ['grass', 'herb', 'fern', 'climber'],
    note: 'perennials and small shrubs — the point where it stops being a roof finish and starts being a garden, and starts needing water' },
  { min: 0.60, label: 'intensive', palette: ['shrub', 'bamboo', 'climber'],
    note: 'large shrubs. Ten kilopascals saturated: four times an office floor’s live load, and the slab has to have been designed for it' },
  { min: 0.90, label: 'tree pit', palette: ['shrub', 'bamboo', 'climber', 'olive', 'rowan', 'birch', 'pollard', 'pleach'],
    note: 'a small tree will live here. It will not thrive, and it will need staking for years, but it will live' },
  { min: 1.50, label: 'deep tree pit', palette: ['rowan', 'birch', 'olive', 'magnolia', 'maple', 'plane', 'poplar', 'pine', 'willow', 'palm', 'pollard', 'pleach', 'bamboo', 'climber'],
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

/* ──────────────────────────────── the habit ─────────────────────────────── */
//
// WHAT MAKES A TREE RECOGNISABLE AT TWO HUNDRED METRES IS ITS HABIT, and nothing
// else. Nobody identifies a Lombardy poplar by its leaf; they identify it
// because it is a column. A cedar is a stack of plates, a willow pours downward,
// an olive is three trunks that argue with each other. Leaf shape is a botanist's
// key and habit is everybody else's — so it is the thing worth modelling, and it
// is the difference between "a tree" and a tree.
//
// A habit is three numbers and a curve:
//
//   crownBase   how far up the clear stem runs before anything branches. This
//               one parameter separates a forest tree from a shrub.
//   radiusAt(t) the crown's PROFILE — its radius as a fraction of the maximum,
//               at height t ∈ [0,1] through the crown. One line each, and it is
//               simultaneously the growth envelope AND the elevation silhouette,
//               which is why a drawn tree and a modelled tree cannot diverge.
//   tropism     the standing bias on every growth step. Up for a poplar, down
//               for a willow, almost nothing for a spreading oak. Space
//               colonization on its own makes blobs; this is what makes shapes.
//   shell       how deep the leafy skin is, as a fraction of the crown radius.
//               A conifer holds foliage close to its branches; a plane carries
//               it in a thick outer shell with a hollow middle you can stand in.
//
// Two of these are URBAN habits rather than natural ones, and they are the two
// that belong on a brutalist building more than anything else here: a POLLARD
// (cut back to the same knuckles every few years, which is why a London plane
// survives a street) and a PLEACH (trained flat into a hedge on stilts). Both
// are shapes a person made, which is the whole argument for putting them next
// to shuttered concrete.

export const HABITS = {
  domed: {
    label: 'domed', crownBase: 0.36, shell: 0.45, tropism: [0, 0.10, 0],
    radiusAt: (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
    note: 'the default forest tree: a clear stem, then a dome. Oak, plane, maple — the shape a tree makes when nothing is stopping it',
  },
  spreading: {
    label: 'spreading', crownBase: 0.22, shell: 0.42, tropism: [0, 0.02, 0],
    radiusAt: (t) => Math.sqrt(Math.max(0, 1 - (1.35 * t - 0.35) ** 2)),
    note: 'wider than it is tall, and branching almost from the ground. A magnolia does this, and so does anything that grew up with no competition',
  },
  columnar: {
    label: 'columnar', crownBase: 0.10, shell: 0.60, tropism: [0, 0.55, 0],
    radiusAt: (t) => (t > 0.92 ? (1 - t) * 12 : 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1))),
    note: 'the Lombardy poplar: every branch turned almost vertical, so the whole tree is a line. Planted in rows it is a wall you can see through',
  },
  conical: {
    label: 'conical', crownBase: 0.04, shell: 0.30, tropism: [0, 0.50, 0],
    radiusAt: (t) => Math.max(0, 1 - 0.94 * t),
    note: 'a conifer: branches to the ground, each whorl shorter than the one below, and a leader that never stops being the leader',
  },
  vase: {
    label: 'vase', crownBase: 0.44, shell: 0.44, tropism: [0, 0.34, 0],
    radiusAt: (t) => 0.26 + 0.74 * Math.sqrt(Math.max(0, t)),
    note: 'narrow at the bottom and open at the top — the elm shape, and the one street trees are pruned into because it leaves the pavement clear',
  },
  weeping: {
    label: 'weeping', crownBase: 0.40, shell: 0.52, tropism: [0, -0.42, 0],
    radiusAt: (t) => 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.75)),
    note: 'the branches give up and pour downward. A willow does it by growing shoots too slender to hold themselves up, which is a structural fact rather than a mood',
  },
  gnarled: {
    label: 'gnarled', crownBase: 0.20, shell: 0.40, tropism: [0, -0.04, 0], stems: 3, wander: 0.34,
    radiusAt: (t) => Math.sqrt(Math.max(0, 1 - (1.5 * t - 0.5) ** 2)),
    note: 'several trunks leaning away from each other and a crown that never resolves. An old olive: two hundred years of being cut back and growing round it',
  },
  clump: {
    label: 'multi-stem', crownBase: 0.16, shell: 0.50, tropism: [0, 0.30, 0], stems: 3, wander: 0.16,
    radiusAt: (t) => Math.sqrt(Math.max(0, 1 - (1.25 * t - 0.28) ** 2)),
    note: 'three or five slender stems from one root plate — how a birch is sold and planted, because one birch is thin and five are a thing',
  },
  pollard: {
    label: 'pollarded', crownBase: 0.60, shell: 0.75, tropism: [0, 0.28, 0], knuckle: true, wander: 0.22,
    radiusAt: (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
    note: 'cut back to the same knuckles every few years, so the trunk thickens and the crown is a tight ball of one season’s shoots. It is why a London plane survives a street, and it is a shape a person made',
  },
  pleached: {
    label: 'pleached', crownBase: 0.52, shell: 0.85, tropism: [0, 0.06, 0], flat: 0.30, stems: 1,
    radiusAt: (t) => (t < 0.1 ? t * 10 : 1),
    note: 'trained flat on a frame — a hedge on stilts. Limes take it best, and a row of them is a wall of leaves with a colonnade of bare trunks under it',
  },
  palm: {
    label: 'palm', crownBase: 0.84, shell: 1.0, tropism: [0, 0, 0], radial: 15, frondDroop: 0.5,
    radiusAt: (t) => Math.max(0, 1 - Math.abs(2 * t - 1) ** 1.5),
    note: 'THE ONE EXCEPTION IN THIS FILE. A palm is a monocot: no secondary thickening, no branching at all, ever. A bare column and a crown of fronds is not a habit the branching model can be persuaded into, so it gets its own generator and the code says so rather than fudging it',
  },
};
export const HABIT_IDS = Object.keys(HABITS);

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
    label: 'sedum', kind: 'mat', habit: 'spreading', h: [0.06, 0.12], soil: 0.08,
    rho: 0.10, hA: 1.4, hB: 0.5, crownA: 0.3, crownB: 2, pipe: 2.0,
    vogel: -0.3, cd0: 0.4, wind: 40, evergreen: true, lai: 2.0, kgPerM2: 14,
    note: 'a succulent mat that shuts down in drought — the only roof planting that survives with no irrigation at all',
  },
  grass: {
    label: 'ornamental grass', kind: 'tuft', habit: 'columnar', h: [0.4, 1.2], soil: 0.15,
    rho: 0.12, hA: 6, hB: 0.6, crownA: 0.2, crownB: 6, pipe: 2.0,
    vogel: -1.2, cd0: 0.6, wind: 35, evergreen: false, lai: 3.0, kgPerM2: 7,
    note: 'reconfigures more than anything else here — it lies flat in a gale and stands up again, which is why it survives on parapets',
  },
  herb: {
    label: 'herb layer', kind: 'tuft', habit: 'spreading', h: [0.2, 0.6], soil: 0.15,
    rho: 0.15, hA: 4, hB: 0.6, crownA: 0.25, crownB: 5, pipe: 2.0,
    vogel: -1.0, cd0: 0.6, wind: 30, evergreen: false, lai: 2.5, kgPerM2: 5,
    note: 'wildflower and herb — the layer that makes an extensive roof an ecosystem rather than a surface',
  },
  fern: {
    label: 'fern', kind: 'tuft', habit: 'vase', h: [0.4, 1.0], soil: 0.30,
    rho: 0.14, hA: 5, hB: 0.55, crownA: 0.4, crownB: 5, pipe: 2.0,
    vogel: -0.9, cd0: 0.7, wind: 18, evergreen: true, lai: 4.0, kgPerM2: 9,
    note: 'wants shade and shelter, so it belongs under a soffit or in a court and nowhere near a corner at height',
  },

  // ─── the shrub layer ───────────────────────────────────────────────────
  shrub: {
    label: 'shrub', kind: 'shrub', habit: 'domed', h: [1.0, 3.0], soil: 0.60,
    rho: 0.55, hA: 11, hB: 0.55, crownA: 0.5, crownB: 9, pipe: 2.2,
    vogel: -0.8, cd0: 0.8, wind: 28, evergreen: true, lai: 4.5,
    note: 'the workhorse of a planted facade: dense enough to read as green from the street, small enough not to need a metre of soil',
  },
  olive: {
    label: 'olive', kind: 'shrub', habit: 'gnarled', h: [3.0, 6.0], soil: 0.90,
    rho: 0.88, hA: 9, hB: 0.5, crownA: 0.8, crownB: 11, pipe: 2.1,
    vogel: -0.5, cd0: 0.85, wind: 30, evergreen: true, lai: 3.0,
    note: 'three trunks that argue with each other and a crown that never resolves — two centuries of being cut back and growing round it. Drought-hard, wind-hard, and the densest wood on this list',
  },
  bamboo: {
    label: 'bamboo', kind: 'cane', habit: 'columnar', h: [3.0, 8.0], soil: 0.60,
    rho: 0.65, hA: 30, hB: 0.75, crownA: 0.7, crownB: 7, pipe: 2.0,
    vogel: -1.1, cd0: 0.9, wind: 32, evergreen: true, lai: 5.0,
    note: 'a grass pretending to be a tree — very tall for its diameter, and it survives wind by bending almost to the ground',
  },
  climber: {
    label: 'climber', kind: 'climber', habit: 'pleached', h: [2.0, 12.0], soil: 0.30,
    rho: 0.35, hA: 40, hB: 0.9, crownA: 1.1, crownB: 4, pipe: 2.0,
    vogel: -0.7, cd0: 0.5, wind: 45, evergreen: false, lai: 5.5,
    note: 'the cheapest square metre of green there is, because the wall carries it — and the one planting a brutalist facade was always going to get',
  },

  // ─── the trees, by HABIT rather than by leaf ───────────────────────────
  rowan: {
    label: 'rowan', kind: 'tree', habit: 'vase', h: [4.0, 8.0], soil: 0.90,
    rho: 0.58, hA: 18, hB: 0.55, crownA: 0.6, crownB: 12, pipe: 2.3,
    vogel: -0.7, cd0: 0.9, wind: 26, evergreen: false, lai: 3.8,
    note: 'a terrace tree: open enough to sit under, small enough that a metre of soil is honest rather than optimistic, and it holds its berries into winter',
  },
  birch: {
    label: 'birch clump', kind: 'tree', habit: 'clump', h: [6.0, 12.0], soil: 0.90,
    rho: 0.60, hA: 21, hB: 0.6, crownA: 0.5, crownB: 10, pipe: 2.2,
    vogel: -0.95, cd0: 0.75, wind: 28, evergreen: false, lai: 2.8,
    note: 'sold and planted as three or five stems from one root plate, because one birch is thin and five are a thing. The finest canopy here — you see the building through it',
  },
  maple: {
    label: 'maple', kind: 'tree', habit: 'domed', h: [7.0, 13.0], soil: 1.20,
    rho: 0.62, hA: 20, hB: 0.55, crownA: 0.7, crownB: 15, pipe: 2.4,
    vogel: -0.6, cd0: 1.0, wind: 24, evergreen: false, lai: 4.8,
    note: 'the middle of the range in every way, which is why it is the default street tree of half the northern hemisphere',
  },
  plane: {
    label: 'London plane', kind: 'tree', habit: 'domed', h: [12.0, 20.0], soil: 1.50,
    rho: 0.64, hA: 24, hB: 0.55, crownA: 1.0, crownB: 19, pipe: 2.4,
    vogel: -0.6, cd0: 1.0, wind: 24, evergreen: false, lai: 4.5,
    note: 'the tree that made cities habitable: it tolerates compacted soil, bad air and hard pruning, and it is most of a tonne of fresh mass on a cantilever',
  },
  poplar: {
    label: 'Lombardy poplar', kind: 'tree', habit: 'columnar', h: [12.0, 22.0], soil: 1.50,
    rho: 0.40, hA: 34, hB: 0.62, crownA: 0.3, crownB: 4, pipe: 2.1,
    vogel: -0.9, cd0: 0.7, wind: 30, evergreen: false, lai: 3.4,
    note: 'a line rather than a tree. Planted in a row it is a wall you can see through, and it is the one thing on this list that is tall without being wide',
  },
  pine: {
    label: 'pine', kind: 'tree', habit: 'conical', h: [8.0, 16.0], soil: 1.50,
    rho: 0.50, hA: 22, hB: 0.58, crownA: 0.5, crownB: 11, pipe: 2.2,
    vogel: -0.4, cd0: 1.1, wind: 26, evergreen: true, lai: 5.5,
    note: 'evergreen, so it is a winter load case as well as a summer one — the crown never sheds and never stops taking wind',
  },
  willow: {
    label: 'willow', kind: 'tree', habit: 'weeping', h: [7.0, 13.0], soil: 1.50,
    rho: 0.45, hA: 19, hB: 0.55, crownA: 0.9, crownB: 17, pipe: 2.3,
    vogel: -1.1, cd0: 0.85, wind: 25, evergreen: false, lai: 4.2,
    note: 'pours downward, because its shoots grow too slender to hold themselves up — a structural fact rather than a mood. Wants more water than a roof will ever give it',
  },
  magnolia: {
    label: 'magnolia', kind: 'tree', habit: 'spreading', h: [4.0, 8.0], soil: 1.20,
    rho: 0.53, hA: 14, hB: 0.5, crownA: 0.9, crownB: 16, pipe: 2.3,
    vogel: -0.65, cd0: 0.95, wind: 20, evergreen: false, lai: 4.0,
    note: 'wider than it is tall and branching almost from the ground — a courtyard tree, and it wants shelter to keep its flowers',
  },
  palm: {
    label: 'palm', kind: 'tree', habit: 'palm', h: [5.0, 11.0], soil: 1.20,
    rho: 0.35, hA: 26, hB: 0.85, crownA: 1.2, crownB: 8, pipe: 2.0,
    vogel: -0.8, cd0: 1.2, wind: 34, evergreen: true, lai: 3.0,
    note: 'a monocot: no branching, ever, and no secondary thickening either — the trunk is the diameter it was when it emerged. Takes more wind than anything else here and looks like it should take less',
  },

  // ─── the two shapes a person made ─────────────────────────────────────
  pollard: {
    label: 'pollarded plane', kind: 'tree', habit: 'pollard', h: [4.0, 7.0], soil: 0.90,
    rho: 0.64, hA: 13, hB: 0.45, crownA: 0.5, crownB: 8, pipe: 2.4,
    vogel: -0.75, cd0: 0.9, wind: 30, evergreen: false, lai: 5.0,
    note: 'cut back to the same knuckles every few years, so the trunk thickens and the crown is one season of shoots. Half the weight of the tree it would otherwise be, in the same footprint — which is exactly why a terrace can carry it',
  },
  pleach: {
    label: 'pleached lime', kind: 'tree', habit: 'pleached', h: [4.0, 6.0], soil: 0.90,
    rho: 0.55, hA: 12, hB: 0.45, crownA: 1.4, crownB: 6, pipe: 2.2,
    vogel: -0.7, cd0: 1.1, wind: 26, evergreen: false, lai: 5.2,
    note: 'trained flat on a frame — a hedge on stilts. A row of them is a wall of leaves over a colonnade of bare trunks, which is a building move rather than a planting one',
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
  const S = SPECIES[sp] || SPECIES.maple;
  return Math.pow(Math.max(1e-6, height) / S.hA, 1 / S.hB);
}
export function heightFor(sp, dbh) {
  const S = SPECIES[sp] || SPECIES.maple;
  return S.hA * Math.pow(Math.max(1e-9, dbh), S.hB);
}
export function crownFor(sp, dbh) {
  const S = SPECIES[sp] || SPECIES.maple;
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
  const S = SPECIES[sp] || SPECIES.maple;
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
  const {
    r = 3, h = 6, clear = Infinity, half = null, lean = 0,
    // THE HABIT'S OWN PROFILE, and the default is a dome. `radiusAt(t)` is the
    // crown radius as a fraction of the maximum, at height t through the crown
    // — so a cone, a column, a vase and a flat pleached box are one line each,
    // and the SAME function draws the elevation silhouette. A tree that is
    // modelled one shape and drawn another is the divergence this whole surface
    // is built to prevent.
    radiusAt = HABITS.domed.radiusAt,
    flat = 0,
  } = o;
  const rz = flat > 0 ? r * flat : r;              // a pleached crown is a slab
  return {
    r, h, clear, lean, radiusAt, flat,
    bounds: { x: [-r, r], y: [0, Math.min(h, clear)], z: [-rz, rz] },
    test: (x, y, z) => {
      if (y < 0 || y > Math.min(h, clear)) return false;
      // half === 'z+' keeps the crown on one side, which is what a tree hard
      // against a facade actually does — it grows toward the light
      if (half === 'z+' && z < -r * 0.15) return false;
      if (half === 'z-' && z > r * 0.15) return false;
      if (half === 'x+' && x < -r * 0.15) return false;
      if (half === 'x-' && x > r * 0.15) return false;
      const t = h > 0 ? y / h : 0;
      const pr = r * Math.max(0, radiusAt(Math.min(1, Math.max(0, t))));
      const pz = flat > 0 ? pr * flat : pr;
      if (pr <= 1e-6 || pz <= 1e-6) return false;
      return (x * x) / (pr * pr) + (z * z) / (pz * pz) <= 1;
    },
  };
}

// THE SILHOUETTE, from the same profile the crown was grown inside. Used by the
// drawing office for elevations and sections — so the outline on the sheet is
// the envelope the model filled, not a shape somebody drew to look like one.
export function crownProfile(sp, height, n = 24) {
  const S = SPECIES[sp] || SPECIES.maple;
  const H = HABITS[S.habit] || HABITS.domed;
  const dbh = dbhFor(sp, height);
  const spread = crownFor(sp, dbh);
  const base = height * H.crownBase;
  const ch = Math.max(0.1, height - base);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ y: r3(base + t * ch), r: r3((spread / 2) * Math.max(0, H.radiusAt(t))) });
  }
  return { base: r2(base), height: r2(height), spread: r2(spread), points: out, habit: S.habit };
}

// Grow one plant. Returns a SKELETON — nodes, segments with radii, and the
// derived quantities the structure needs — and nothing about how to draw it.
export function grow(sp, opts = {}) {
  const S = SPECIES[sp] || SPECIES.maple;
  const rnd = opts.rnd || Rand(opts.seed || 'plant', sp);
  const height = opts.height != null ? opts.height : rnd.range(S.h[0], S.h[1]);
  const dbh = dbhFor(sp, height);
  const spread = opts.spread != null ? opts.spread : crownFor(sp, dbh);

  // THE HABIT decides where the clear stem ends and what shape the crown is.
  const H = HABITS[S.habit] || HABITS.domed;
  const crownBase = height * H.crownBase;
  const env = opts.envelope || envelopeFor({
    r: spread / 2, h: Math.max(0.05, height - crownBase),
    clear: opts.clear != null ? opts.clear - crownBase : Infinity,
    half: opts.half || null, radiusAt: H.radiusAt, flat: H.flat || 0,
  });

  // A PALM DOES NOT BRANCH. Not "branches rarely" — a monocot has no lateral
  // meristem at all, so there is no branching model to parameterise. It gets
  // its own generator, and this is the only exception in the file.
  if (H.radial || S.kind === 'tuft' || S.kind === 'mat' || S.kind === 'cane') {
    return radialForm(sp, S, H, height, dbh, spread, crownBase, rnd, opts);
  }

  // ── the attractors ───────────────────────────────────────────────────────
  // Rejection-sampled inside the envelope, so a clipped crown really is thinner
  // rather than the same crown squashed.
  //
  // AND THE COUNT IS A DENSITY, NOT A CONSTANT. This was the single thing wrong
  // with every crown in the file: one hundred and forty attractors were spent
  // on a 0.2 m³ herb and on a 150 m³ plane alike, so the herb came out a solid
  // lump at three hundred per cent of its own crown volume and the plane came
  // out twenty-six blobs on a hundred and twenty branches. Attractors per cubic
  // metre of crown is the quantity that means something, and the floor and the
  // cap are there because a poplar is nearly all trunk and a big plane would
  // otherwise cost a thousand segments nobody can see.
  const rzB = env.bounds.z[1];
  const crownVol = Math.max(0.02, (2 * env.bounds.x[1]) * (2 * rzB) * (env.bounds.y[1] || 0.1) * 0.45);
  const density = 5 * (opts.detail != null ? opts.detail : 1);
  // The floor is per KIND, not global. Sixty attractors is a sensible minimum
  // for a tree and an absurd one for a 600 mm tuft — it gave a clump of grass
  // five hundred segments, which is more than a mature plane. And the cap is
  // what stops a big conifer costing fourteen hundred: past a few hundred
  // segments the crown is doing no more work, because the FOLIAGE is what the
  // eye reads and the branches are only what holds it up.
  const floorN = S.kind === 'tree' ? 90 : 24;
  const want = Math.max(floorN, Math.min(260, Math.round(crownVol * density)));
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
  // AND THE STEP FOLLOWS THE ATTRACTOR SPACING, which is the parameter the
  // algorithm actually cares about: the kill radius should be about one mean
  // attractor separation, or the first pass eats the whole cloud. With the
  // count now a density, that separation is `(V/N)^(1/3)` and everything else
  // scales off it — which is why one rule now suits a sedum mat and a plane.
  const crownR = Math.max(0.05, env.bounds.x[1]);
  const spacing = Math.cbrt(crownVol / Math.max(1, pts.length || want));
  // AND THE KILL RADIUS IS BOUNDED BY THE CROWN, not only by the spacing. A
  // tall narrow habit has a large volume and a small radius, so the spacing
  // came out wider than the crown itself and one node consumed every attractor
  // in a horizontal slice — which is how a Lombardy poplar came out 320 mm
  // wide. Exactly the same failure as the herb layer, arriving from the other
  // end of the size range.
  const kill = Math.max(0.03, Math.min(spacing * 1.25, crownR * 0.55));
  // AND THE STEP IS BOUNDED BY THE WHOLE CROWN, not only by the kill radius.
  // Binding it to the radius alone couples it to the wrong dimension on a tall
  // narrow habit: a poplar's crown is 600 mm across and 14 m tall, so a step
  // sized off the radius took two and a half THOUSAND segments to climb it.
  // The extent that matters is whichever of the two is larger.
  const crownH = Math.max(0.05, env.bounds.y[1]);
  const extent = Math.max(2 * crownR, crownH);
  const step = Math.min(Math.max(kill / 1.6, extent / 26), extent / 7);
  const influence = Math.max(kill, step) * 7;
  const nodes = [{ x: 0, y: 0, z: 0, parent: -1, depth: 0 }];

  // THE CLEAR STEM — or STEMS. A birch clump is three or five slender trunks
  // from one root plate and an old olive is three that lean away from each
  // other, and neither is a single tree drawn three times: they share a base,
  // they splay, and the pipe model then makes each of them thinner than one
  // trunk would have been, which is exactly right and falls out for free.
  const nStems = Math.max(1, H.stems || 1);
  const wander = H.wander || 0;
  const stemTops = [];
  for (let si = 0; si < nStems; si++) {
    const th = nStems === 1 ? 0 : (si / nStems) * TAU + rnd.range(-0.3, 0.3);
    const lean = nStems === 1 ? 0 : rnd.range(0.10, 0.26);
    let cur = 0;
    let px = 0, pz = 0;
    for (let y = step; y <= crownBase + 1e-9; y += step) {
      px += Math.cos(th) * lean * step + rnd.range(-wander, wander) * step;
      pz += Math.sin(th) * lean * step + rnd.range(-wander, wander) * step;
      nodes.push({ x: r3(px), y: r3(y), z: r3(pz), parent: cur, depth: 0, stem: si });
      cur = nodes.length - 1;
    }
    stemTops.push(cur);
  }

  // only the tops of the stems may be branched from — a tree does not put
  // shoots out of its own trunk foot
  const branchable = new Set(stemTops);
  const stemTop = Math.min(...stemTops);
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
        // that "the trunk" is no longer a single thing to measure. With several
        // stems, only their tops are branchable and everything grown since is.
        if (i <= stemTop && !branchable.has(i)) continue;
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
      // TROPISM. Space colonization on its own makes blobs — every tree the
      // same rounded cloud, because the only thing steering it is where the
      // light happens to be. Real growth carries a standing bias: a poplar's
      // branches turn almost vertical, a willow's give up and pour downward, a
      // spreading magnolia has almost none. One vector per habit, added to
      // every step, and it is the single change that turns nine identical
      // shrubs into nine recognisable trees.
      // BLENDED, not added. Adding it outright and re-normalising lets a strong
      // tropism compound every step until it is the only thing steering: a
      // columnar poplar came out 280 mm wide, which is not a habit, it is a
      // stick. Blending caps how much of any step the bias can own, so the
      // attractors — the light — still decide where the branch actually goes.
      const tw = Math.min(0.55, Math.hypot(H.tropism[0], H.tropism[1], H.tropism[2]));
      if (tw > 1e-6) {
        const tl = Math.hypot(H.tropism[0], H.tropism[1], H.tropism[2]) || 1;
        x = x * (1 - tw) + (H.tropism[0] / tl) * tw;
        y = y * (1 - tw) + (H.tropism[1] / tl) * tw;
        z = z * (1 - tw) + (H.tropism[2] / tl) * tw;
      }
      // a small seeded wobble, so two branches pulled by the same cloud do not
      // grow as one line — and it is seeded, so the tree is still a permalink
      const w2 = 0.12 + wander;
      x += rnd.range(-w2, w2); z += rnd.range(-w2, w2); y += rnd.range(-0.04, 0.09);
      const L2 = Math.hypot(x, y, z) || 1;
      const p = nodes[i];
      added.push({
        x: r3(p.x + (x / L2) * step), y: r3(p.y + (y / L2) * step), z: r3(p.z + (z / L2) * step),
        parent: i, depth: p.depth + 1,
      });
    }
    if (!added.length) break;
    for (const a of added) nodes.push(a);
    // THE BACKSTOP. Everything above is calibrated, and calibration is exactly
    // the kind of thing that goes quietly wrong when a new habit arrives — so
    // there is a hard ceiling as well, for the same reason the manifold has a
    // node budget. Hitting it is not a crash, it is a crown that stopped
    // growing, and the selftest asserts no ordinary species reaches it.
    if (nodes.length > SEGMENT_CAP) break;

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
    version: VERSION, species: sp, label: S.label, kind: S.kind, habit: S.habit,
    height: r2(realH), spread: r2(realR * 2), dbh: r3(dbh),
    designHeight: r2(height), crownBase: r2(crownBase),
    nodes, segments, tips: segments.filter((s) => s.tip).length,
    soil: S.soil, evergreen: S.evergreen,
    ...massAndSail(sp, dbh, realH, realR),
  };
}

/* ───────────────────── the things that do not branch ────────────────────── */
//
// SPACE COLONIZATION IS A MODEL OF BRANCHING, and it is worth being honest about
// which plants branch. Three families here do not, and forcing them through the
// branching model was giving a 600 mm clump of grass four hundred segments —
// more than a mature plane — because the algorithm kept trying to find a
// branching structure in something that is a fan of blades.
//
//   · a PALM is a monocot: no lateral meristem, so no branches ever, and no
//     secondary thickening either — an old palm is a column, not a cone. What
//     it has is a crown of fronds from one apex, each drooping under its weight.
//   · a TUFT or a MAT is a rosette: blades from a crown at the ground, arcing
//     out. There is no trunk and there are no forks.
//   · a CANE is a clump of culms — bamboo is a grass, and every stem comes
//     straight out of the rhizome rather than off the one beside it.
//
// One generator, three cases, and the comment says why rather than pretending
// the branching model is general.

function radialForm(sp, S, H, height, dbh, spread, crownBase, rnd, opts) {
  const form = H.radial ? 'fronds' : S.kind === 'cane' ? 'canes' : 'rosette';
  if (form !== 'fronds') return rosetteOrCanes(form, sp, S, H, height, dbh, spread, rnd);
  const nodes = [{ x: 0, y: 0, z: 0, parent: -1, depth: 0 }];
  const step = Math.max(0.25, crownBase / 12);
  let cur = 0;
  for (let y = step; y <= crownBase + 1e-9; y += step) {
    // a palm trunk leans and does not taper
    const lean = 0.02 * (y / Math.max(0.1, crownBase));
    nodes.push({ x: r3(lean * crownBase * 0.4), y: r3(y), z: 0, parent: cur, depth: 0 });
    cur = nodes.length - 1;
  }
  const apex = cur;
  const segments = [];
  const R0 = dbh / 2;
  for (let i = 1; i < nodes.length; i++) {
    const a2 = nodes[nodes[i].parent], b2 = nodes[i];
    const dx = b2.x - a2.x, dy = b2.y - a2.y, dz = b2.z - a2.z;
    const len = Math.hypot(dx, dy, dz);
    segments.push({
      x0: a2.x, y0: a2.y, z0: a2.z, x1: b2.x, y1: b2.y, z1: b2.z,
      len: r3(len), r: R0, depth: 0, dir: [r3(dx / len), r3(dy / len), r3(dz / len)], tip: false,
    });
  }
  // the fronds: each a short chain of segments arcing out and then down
  const nF = H.radial, fl = spread / 2, per = 4;
  for (let f = 0; f < nF; f++) {
    const th = (f / nF) * TAU + rnd.range(-0.1, 0.1);
    const droop = H.frondDroop * rnd.range(0.7, 1.25);
    let px = nodes[apex].x, py = nodes[apex].y, pz = nodes[apex].z;
    let parent = apex;
    for (let k = 0; k < per; k++) {
      const t = (k + 1) / per;
      const rr = fl * t;
      const nx = nodes[apex].x + Math.cos(th) * rr;
      const nz = nodes[apex].z + Math.sin(th) * rr;
      // rises then falls — the arc a frond actually makes
      const ny = nodes[apex].y + fl * (0.36 * Math.sin(Math.PI * t) - droop * t * t);
      const dx = nx - px, dy = ny - py, dz = nz - pz;
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      nodes.push({ x: r3(nx), y: r3(ny), z: r3(nz), parent, depth: k + 1, frond: f });
      segments.push({
        x0: r3(px), y0: r3(py), z0: r3(pz), x1: r3(nx), y1: r3(ny), z1: r3(nz),
        len: r3(len), r: Math.max(0.012, R0 * 0.22 * (1 - t * 0.7)), depth: k + 1,
        dir: [r3(dx / len), r3(dy / len), r3(dz / len)], tip: k === per - 1, frond: true,
      });
      parent = nodes.length - 1;
      px = nx; py = ny; pz = nz;
    }
  }
  const realH = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const realR = Math.max(dbh / 2, nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.z)), 0));
  return {
    version: VERSION, species: sp, label: S.label, kind: S.kind, habit: S.habit, form,
    height: r2(realH), spread: r2(realR * 2), dbh: r3(dbh),
    designHeight: r2(height), crownBase: r2(crownBase),
    nodes, segments, tips: segments.filter((q) => q.tip).length,
    soil: S.soil, evergreen: S.evergreen, fronds: nF,
    ...massAndSail(sp, dbh, realH, realR),
  };
}

// A ROSETTE (a tuft or a mat) is blades from a crown at the ground; CANES are
// culms from a rhizome with a tuft of side shoots near the top. Neither has a
// trunk and neither forks, so both are a handful of arcs and that is all they
// ever needed to be.
function rosetteOrCanes(form, sp, S, H, height, dbh, spread, rnd) {
  const nodes = [{ x: 0, y: 0, z: 0, parent: -1, depth: 0 }];
  const segments = [];
  const R0 = Math.max(0.004, dbh / 2);
  const link = (parent, x, y, z, r, depth, tip) => {
    const a = nodes[parent];
    const dx = x - a.x, dy = y - a.y, dz = z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    nodes.push({ x: r3(x), y: r3(y), z: r3(z), parent, depth });
    segments.push({
      x0: a.x, y0: a.y, z0: a.z, x1: r3(x), y1: r3(y), z1: r3(z),
      len: r3(len), r, depth, dir: [r3(dx / len), r3(dy / len), r3(dz / len)], tip,
    });
    return nodes.length - 1;
  };

  if (form === 'rosette') {
    // blades from the crown, arcing out and over — the number scales with the
    // clump's own footprint rather than being a constant
    const n = Math.max(5, Math.min(22, Math.round(spread * 22)));
    const per = 3;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + rnd.range(-0.25, 0.25);
      const lean = rnd.range(0.45, 1.0);                 // 1 = flat, 0 = upright
      const L = height * rnd.range(0.7, 1.05);
      let parent = 0;
      for (let k = 0; k < per; k++) {
        const t = (k + 1) / per;
        const rr = (spread / 2) * lean * t;
        link(parent, Math.cos(th) * rr, L * Math.sin((Math.PI / 2) * t) * (1 - 0.35 * lean * t),
          Math.sin(th) * rr, Math.max(0.002, R0 * (1 - 0.6 * t)), k + 1, k === per - 1);
        parent = nodes.length - 1;
      }
    }
  } else {
    // canes: vertical culms from a rhizome, each with a small tuft at the top
    const n = Math.max(3, Math.min(14, Math.round(spread * 7)));
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + rnd.range(-0.4, 0.4);
      const rr = (spread / 2) * rnd.range(0.15, 1.0);
      const L = height * rnd.range(0.6, 1.0);
      const bx = Math.cos(th) * rr, bz = Math.sin(th) * rr;
      const bow = rnd.range(0.1, 0.32);                  // bamboo leans as it grows
      let parent = 0;
      const joints = Math.max(3, Math.round(L / 1.1));
      for (let k = 0; k < joints; k++) {
        const t = (k + 1) / joints;
        link(parent, bx * t + Math.cos(th) * bow * L * t * t, L * t,
          bz * t + Math.sin(th) * bow * L * t * t,
          Math.max(0.006, R0 * (1 - 0.35 * t)), k + 1, false);
        parent = nodes.length - 1;
      }
      // the tuft of side shoots that makes a cane read as bamboo
      for (let f = 0; f < 3; f++) {
        const ft = th + (f / 3) * TAU;
        const top = nodes[parent];
        link(parent, top.x + Math.cos(ft) * spread * 0.22, top.y + L * 0.06,
          top.z + Math.sin(ft) * spread * 0.22, Math.max(0.003, R0 * 0.3), 99, true);
      }
    }
  }

  const realH = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const realR = Math.max(dbh / 2, nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.z)), 0));
  return {
    version: VERSION, species: sp, label: S.label, kind: S.kind, habit: S.habit, form,
    height: r2(realH), spread: r2(realR * 2), dbh: r3(dbh),
    designHeight: r2(height), crownBase: 0,
    nodes, segments, tips: segments.filter((q) => q.tip).length,
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
  const S = SPECIES[sp] || SPECIES.maple;
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
  const S = SPECIES[tree.species] || SPECIES.maple;
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
  for (const f of foliage(tree)) {
    out.push({
      mat: 'leaf', kind: 'foliage', level,
      x: r3(x + f.x), y: r3(y + f.y), z: r3(z + f.z),
      w: r3(f.r * 2), h: r3(f.r * 2), d: r3(f.r * 2), sphere: true,
    });
  }
  return out;
}

// THE CANOPY IS A SURFACE PROBLEM, NOT A TIP PROBLEM. One blob per branch tip
// was the obvious rule and it is the wrong one twice over: a mature plane has
// about thirty tips, so its crown came out as thirty enormous balls, while a
// herb layer's ten tips at the same relative size made a solid lump at three
// hundred per cent of its own crown volume. Neither is a canopy.
//
// What the eye reads is the OUTER SHELL, so that is what gets covered — and how
// densely is not a taste parameter, it is LEAF AREA INDEX, the leaf area a
// species carries per square metre of ground beneath it. LAI is measured, it is
// already in the species table, and it is the difference between a pine you
// cannot see through (5.5) and a birch you can (2.8).
//
//     n ≈ (crown surface / blob silhouette) · (LAI / 4) · overlap
//
// Placed on the segments in the outer `shell` of the crown, so the middle stays
// hollow the way a real crown is — which is what makes branches visible inside
// it rather than a solid ball of green.
export function foliage(tree) {
  const S = SPECIES[tree.species] || SPECIES.maple;
  const H = HABITS[S.habit] || HABITS.domed;
  if (S.kind === 'mat') return [];
  const rnd = Rand(`${tree.species}:${tree.height}:${tree.spread}`, 'foliage');

  const cr = Math.max(0.05, tree.spread / 2);
  const rLeaf = Math.max(0.05, Math.min(0.85, cr * 0.17));

  // THE CROWN IS A SOLID OF REVOLUTION, NOT A BALL. Taking the surface as
  // 4πr² assumes every habit is spherical, and the tall narrow ones are not: a
  // climber is twelve metres of plant in 1.26 m of width, so the sphere said
  // 3 m² of crown where the real lateral surface is nearer 34, and it came out
  // with a tenth of the leaves it needs — a bare whip in the bench and on the
  // sheet. The habit already has its profile; integrating it costs nothing and
  // is right for all eleven.
  const H2 = HABITS[S.habit] || HABITS.domed;
  const ch = Math.max(0.05, tree.height - (tree.crownBase || 0));
  let lateral = 0;
  const STEPS = 24;
  for (let i = 0; i < STEPS; i++) {
    const r = cr * Math.max(0, H2.radiusAt((i + 0.5) / STEPS));
    lateral += 2 * Math.PI * r * (ch / STEPS);
  }
  const surface = (lateral + Math.PI * cr * cr) * 0.6;   // the lit part of a crown
  const want = Math.round((surface / (Math.PI * rLeaf * rLeaf)) * (S.lai / 4) * 1.25);
  const n = Math.max(4, Math.min(320, want));

  // the outer shell: segments whose far end is in the outer part of the crown.
  // A pine holds its foliage tight to the branch (shell 0.30); a plane carries
  // it in a thick skin over a hollow middle (0.45); a pollard is all shell,
  // because one season of shoots is all there is.
  const base = tree.crownBase || 0;
  const shell = H.shell || 0.45;
  const cand = [];
  for (const sg of tree.segments) {
    const rr = Math.hypot(sg.x1, sg.z1);
    const t = tree.height > base ? (sg.y1 - base) / Math.max(0.05, tree.height - base) : 1;
    const local = cr * Math.max(0.05, H.radiusAt(Math.min(1, Math.max(0, t))));
    // how far out it is, as a fraction of the crown's own radius there
    const outness = Math.min(1, rr / Math.max(0.02, local));
    if (sg.y1 < base - 1e-6) continue;                 // nothing on the clear stem
    if (outness >= 1 - shell || sg.tip) cand.push({ sg, w: 0.25 + outness });
  }
  if (!cand.length) return [];

  const total = cand.reduce((a, c) => a + c.w, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    // weighted pick, so the outermost segments carry the most
    let r = ((i + 0.5) / n) * total, pick = cand[cand.length - 1];
    for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break; } }
    const sg = pick.sg;
    // somewhere along the segment, jittered off it by up to a blob radius —
    // overlapping blobs are what make a canopy read as one mass rather than as
    // a string of beads
    const t = rnd.range(0.35, 1.0);
    out.push({
      x: sg.x0 + (sg.x1 - sg.x0) * t + rnd.range(-rLeaf, rLeaf) * 0.9,
      y: sg.y0 + (sg.y1 - sg.y0) * t + rnd.range(-rLeaf, rLeaf) * 0.6,
      z: sg.z0 + (sg.z1 - sg.z0) * t + rnd.range(-rLeaf, rLeaf) * 0.9,
      r: rLeaf * rnd.range(0.72, 1.18),
    });
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

// THE ELEVATION. A tree in plan is a circle and every species gets the same
// circle; a tree in ELEVATION is where the habit becomes visible, and the habit
// is the whole reason there are nineteen species rather than one scaled three
// ways. A poplar and a willow of the same height and the same spread are the
// same plan symbol and completely different drawings.
//
// So this returns TWO outlines and means different things by them:
//
//   · `envelope` — the design silhouette, the habit's own profile at this
//     tree's height and spread. The dashed line. What it WILL be.
//   · `stems` + `foliage` — the tree that actually grew, orthographically
//     projected. Solid. What it IS.
//
// Drawing both is not belt-and-braces, it is the point: a tree grown under a
// soffit or against a facade is clipped by the envelope the architecture handed
// it, and the gap between the dashed line and the mass is exactly that clipping
// made visible on the sheet. A single outline would hide the coupling this
// whole subsystem exists to model.
//
// `axis` picks which WORLD axis is u; the other is v, the depth into the page.
// Everything comes back in world coordinates and ascending in v, so each sheet
// applies its own handedness — an elevation is named for the side you stand on
// and two of the four are mirrored, and that is the sheet's business, not the
// tree's. Painting the list in order (or reversed) is back-to-front.
export function plantElevation(tree, o = {}) {
  const { x = 0, y = 0, z = 0, axis = 'x', n = 28 } = o;
  const S = SPECIES[tree.species] || SPECIES.maple;
  const H = HABITS[tree.habit] || HABITS[S.habit] || HABITS.domed;
  const U = axis === 'z' ? (px, pz) => pz : (px) => px;
  const V = axis === 'z' ? (px) => px : (px, pz) => pz;
  const ou = axis === 'z' ? z : x;

  const cr = Math.max(0.02, tree.spread / 2);
  const base = tree.crownBase || 0;
  const ch = Math.max(0.05, tree.height - base);

  // the design silhouette, from the same radiusAt the crown was grown inside
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = cr * Math.max(0, H.radiusAt(t));
    const yy = r3(y + base + t * ch);
    left.push({ u: r3(ou - rr), y: yy });
    right.push({ u: r3(ou + rr), y: yy });
  }
  const envelope = [...left, ...right.reverse()];

  const stems = tree.segments.map((sg) => ({
    u0: r3(ou + U(sg.x0, sg.z0)), y0: r3(y + sg.y0),
    u1: r3(ou + U(sg.x1, sg.z1)), y1: r3(y + sg.y1),
    r: sg.r, v: r3(V(sg.x1, sg.z1)),
  })).sort((a, b) => a.v - b.v);

  const leaves = foliage(tree).map((f) => ({
    u: r3(ou + U(f.x, f.z)), y: r3(y + f.y), r: r3(f.r), v: r3(V(f.x, f.z)),
  })).sort((a, b) => a.v - b.v);

  return {
    u: r2(ou), y: r2(y), height: r2(tree.height), spread: r2(tree.spread),
    crownBase: r2(base), trunk: r3(tree.dbh / 2), habit: H.label, form: tree.form || null,
    label: tree.label, kind: tree.kind, evergreen: tree.evergreen,
    envelope, stems, foliage: leaves,
  };
}

// THE SECTION adds the half of a planted terrace that a section is FOR: what is
// under the tree. A landscape section is not an elevation with a line under it
// — the substrate depth, the drainage layer and the root plate are the reason
// the drawing exists, because they are what the slab is being asked to carry.
//
// TWO ROOT GEOMETRIES, and using the wrong one is the classic error. Nursery
// stock is sold to ANSI Z60.1, which sizes a BALL off the trunk caliper — ten
// to twelve ball-diameters per trunk diameter, dug about 60 % as deep as wide.
// That is a transplanting dimension and it is what decides whether the tree can
// be INSTALLED. Run it on a mature trunk and it claims a fifteen-metre plane
// arrives on a ball nearly three metres deep, which no plane has ever done.
//
// A MATURE tree's roots are a wide shallow PLATE: something like ninety per
// cent of root mass sits in the top 600 mm, and the plate spreads to around the
// crown radius and beyond rather than downward. That is the geometry that takes
// the overturning moment, and on a planter it is also the geometry that runs
// out of room sideways long before it runs out of room down.
//
// So both come back, each labelled with the question it answers, and the plate
// is clipped to the substrate it was actually given — because a root cannot go
// deeper than the slab, which is the entire reason `check()` has a soil test.
export function plantSection(tree, o = {}) {
  const depth = o.depth || 0;
  const S = SPECIES[tree.species] || SPECIES.maple;
  const el = plantElevation(tree, o);
  const halfW = o.halfWidth || Infinity;

  // as installed: ANSI Z60.1 off the caliper the tree HAD at planting, which
  // for a mature specimen is not the DBH it has now — nursery trees leave the
  // field at 60–90 mm caliper whatever they will become
  const caliper = Math.min(tree.dbh, 0.09);
  const ballR = r2(Math.max(0.12, caliper * 11 * 0.5));

  // as grown: the plate, shallow and wide, and clipped to what it was given
  const plateD = r2(Math.min(depth > 0 ? depth : 0.9, Math.max(0.45, S.soil * 1.2)));
  const wants = Math.max(ballR, tree.spread * 0.55);       // room it would take
  const plateR = r2(Math.min(halfW, wants));

  return {
    ...el,
    substrate: { u: el.u, y: r2(el.y), depth: r2(depth), spread: r2(tree.spread) },
    rootBall: { u: el.u, r: ballR, depth: r2(ballR * 2 * 0.6), note: 'as installed (ANSI Z60.1)' },
    rootPlate: {
      u: el.u, r: plateR, depth: plateD,
      confined: halfW < wants - 1e-9,
      note: 'as grown — 90 % of root mass in the top 600 mm',
    },
    drainage: r3(Math.min(0.05, depth * 0.25)),
    soilOK: depth >= S.soil - 1e-9,
  };
}

/* ═════════════════════════════ the check list ══════════════════════════════
   Same shape as the stair's and the lift's: every check says what it protects.
   These are the ones that decide whether a plant may be where it has been put,
   and all four of them are reasons a real planted facade gets redesigned. */

export function check(tree, o = {}) {
  const S = SPECIES[tree.species] || SPECIES.maple;
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
