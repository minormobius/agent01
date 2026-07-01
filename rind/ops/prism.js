// prism.js — THE SUBSTRATE: a HEXAGONAL PRISM of HOMOGENEOUSLY SPACED nodes that will Voronoi into chambers.
//
// The one hard requirement this kernel exists to satisfy:
//   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
//   │  NO Voronoi polyhedron that touches the CEILING also touches the FLOOR.                                │
//   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
// i.e. the prism is thick enough that the cells against the top face and the cells against the bottom face are
// DISJOINT sets — there is a genuine top stratum and bottom stratum, never a single room spanning both. That is
// the rigorous form of "two real floors".
//
// Homogeneous spacing = HCP (hexagonal close packing): triangular layers (spacing `a`) stacked ABAB with vertical
// pitch c = a·√(2/3), so every interior node has 12 neighbours at the SAME distance `a`. HCP's Voronoi cell is a
// (trapezo-)rhombic dodecahedron — bounded and isotropic, so with ≥ a couple of layers the floor/ceiling cells
// separate cleanly (proven, not assumed: see `floorCeilingReport` + prism.selftest.mjs).
//
// A cell "touches a face" iff its node is the nearest node to some point ON that face — so the test samples the
// two faces and checks the nearest-node sets are disjoint. Pure, deterministic, node-tested. No 3D-Voronoi lib
// needed for the guarantee (the nearest-node membership IS the Voronoi membership).

const TAU = Math.PI * 2, SQRT3 = Math.sqrt(3), VPITCH = Math.sqrt(2 / 3);   // c = a·√(2/3) ⇒ NN distance = a
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// layers: 4 by default — the PROVEN minimum for separation at this jitter is 3 (1 always fails; 2 fails on some
// seeds when jitter pushes a top cell to the floor), so 4 gives a comfortable margin and a genuine middle stratum
// (the eventual top = white, middle = the weave, bottom = production). See prism.selftest.mjs.
export const PRISM_DEFAULTS = { hexR: 320, spacing: 46, layers: 4, jitter: 0.18, seed: 1 };

// flat-top hexagon (circumradius R): vertices at 0°,60°…; the footprint, and the inside test (6 half-planes).
export const hexFootprint = (R) => { const v = []; for (let k = 0; k < 6; k++) { const ang = TAU / 6 * k; v.push([R * Math.cos(ang), R * Math.sin(ang)]); } return v; };
const inHex = (x, y, R, eps = 0) => { const r = R * SQRT3 / 2; for (let k = 0; k < 6; k++) { const ang = Math.PI / 6 + Math.PI / 3 * k; if (x * Math.cos(ang) + y * Math.sin(ang) > r + eps) return false; } return true; };

export function buildPrism(seed = PRISM_DEFAULTS.seed, opts = {}) {
  const o = { ...PRISM_DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { hexR, spacing: a, layers, jitter } = o;
  const rng = mulberry32((o.seed ^ 0x9e37) >>> 0);
  // Vertical layer pitch. Default a·√(2/3) ⇒ isotropic HCP (NN distance = a). Pass an explicit `vpitch` to PIN the
  // thickness (T = layers·vpitch) independent of the in-plane spacing, so the in-plane `spacing` becomes a pure
  // AREAL-DENSITY lever (more/fewer nodes per unit area) at constant height. Cells stay floor/ceiling-separated
  // either way (a cell's vertical extent is ~vpitch, set by the layers, not by `a`).
  const c = (o.vpitch != null) ? o.vpitch : a * VPITCH;
  const T = layers * c;                 // prism thickness: floor at z=0, ceiling at z=T
  const dy = a * SQRT3 / 2;             // triangular row pitch
  const offB = [a / 2, a * SQRT3 / 6];  // the B-layer in-plane shift (triangle centroid) → ABAB stacking
  const jx = jitter * a, jz = jitter * c;   // jitter scales in-plane with `a`, vertically with the layer pitch `c`

  // tile a triangular lattice across the hex bounding box, per layer, ABAB-offset, jittered, clipped to the hex
  const nodes = [];
  const iMax = Math.ceil(hexR / a) + 2, jMax = Math.ceil(hexR / dy) + 2;
  for (let k = 0; k < layers; k++) {
    const z0 = (k + 0.5) * c, ox = (k & 1) ? offB[0] : 0, oy = (k & 1) ? offB[1] : 0;
    for (let j = -jMax; j <= jMax; j++) for (let i = -iMax; i <= iMax; i++) {
      const bx = a * (i + (((j % 2) + 2) % 2) * 0.5) + ox, by = dy * j + oy;       // triangular layer
      if (!inHex(bx, by, hexR)) continue;
      const x = bx + (rng() - 0.5) * 2 * jx, y = by + (rng() - 0.5) * 2 * jx;
      const z = Math.max(0.06 * c, Math.min(T - 0.06 * c, z0 + (rng() - 0.5) * 2 * jz));   // jitter z, stay inside
      if (!inHex(x, y, hexR, a * 0.6)) continue;                                  // keep jittered node near footprint
      nodes.push({ i: nodes.length, x, y, z, layer: k });
    }
  }

  return {
    seed: o.seed, hexR, spacing: a, vpitch: c, layers, thickness: T, jitter,
    footprint: hexFootprint(hexR), nodes,
    inHex: (x, y, eps = 0) => inHex(x, y, hexR, eps),
  };
}

// nearest node index to a query point (brute force — the node count is small)
function nearest(nodes, x, y, z) { let bi = -1, bd = Infinity; for (const n of nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; bi = n.i; } } return bi; }

// THE GUARANTEE, measured. Sample the ceiling face (z=T) and the floor face (z=0) on a fine grid inside the hex;
// a cell touches a face iff its node is the nearest node to some sampled point on it. Separation holds iff the
// two nearest-node sets are DISJOINT. Also reports the worst single-cell vertical span (must be < T).
export function floorCeilingReport(prism, { res, span = true } = {}) {
  const { nodes, hexR, spacing, thickness: T } = prism;
  const step = res || spacing / 6;
  const ceil = new Set(), floor = new Set();
  for (let y = -hexR; y <= hexR; y += step) for (let x = -hexR; x <= hexR; x += step) {
    if (!prism.inHex(x, y)) continue;
    ceil.add(nearest(nodes, x, y, T));
    floor.add(nearest(nodes, x, y, 0));
  }
  const both = [...ceil].filter((i) => floor.has(i));
  let maxSpan = null;
  if (span) {   // worst cell z-span: sample the interior volume, track per-owner min/max z of owned points
    const lo = new Map(), hi = new Map(); const zstep = prism.vpitch / 4;
    for (let z = 0; z <= T + 1e-6; z += zstep) for (let y = -hexR; y <= hexR; y += step * 1.5) for (let x = -hexR; x <= hexR; x += step * 1.5) {
      if (!prism.inHex(x, y)) continue; const i = nearest(nodes, x, y, z);
      if (z < (lo.get(i) ?? Infinity)) lo.set(i, z); if (z > (hi.get(i) ?? -Infinity)) hi.set(i, z);
    }
    maxSpan = 0; for (const i of lo.keys()) maxSpan = Math.max(maxSpan, hi.get(i) - lo.get(i));
  }
  return { separated: both.length === 0, both, ceilingCells: ceil.size, floorCells: floor.size, maxSpan, thickness: T };
}

// the thinnest prism (fewest HCP layers) that still satisfies the floor/ceiling guarantee, for given spacing/jitter
export function minLayersForSeparation(seed = PRISM_DEFAULTS.seed, opts = {}, maxLayers = 10) {
  for (let layers = 1; layers <= maxLayers; layers++) { const p = buildPrism(seed, { ...opts, layers }); if (floorCeilingReport(p, { span: false }).separated) return layers; }
  return -1;
}

if (typeof globalThis !== 'undefined') globalThis.RindPrism = { buildPrism, floorCeilingReport, minLayersForSeparation };
