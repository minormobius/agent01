// weave3d.js — LAY THE WEAVE onto the prism substrate (prism.js). The 6 white + 8 production threads are
// counter-rotating spiral TUBES; each tube of WIDTH w (in node-diameters) claims the prism nodes within w·a/2 of
// its 3D centreline. Three levers, and the math is NOT softened — every way it breaks is measured and returned:
//
//   • width    — how many nodes wide each path is (tube radius = width·a/2). Too wide ⇒ tubes collide
//                (contested nodes) and, once 2·radius > thickness, white and production merge through the floor.
//   • spacing  — nuclei density (node spacing a). Too sparse ⇒ tubes have gaps (orphans) and crossings miss
//                (K(6,8) < 48, because a contact needs a white node adjacent to a production node).
//   • rings    — chunk variability 0/1/2 ⇒ 1 / 7 / 19 chunks (a bigger cell winds more). Too few chunks +
//                narrow turns ⇒ some white never sweeps past some production ⇒ K(6,8) < 48.
//
// Pure, deterministic, node-tested. Nothing here rounds a failure up to a pass — read the metrics block.

import { buildPrism } from './prism.js';
import { FACTIONS } from './foam3d.js';
import { ENGINE_RING, ENGINES } from './engines.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const angDist = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, TAU - d); };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const WEAVE_DEFAULTS = { rings: 1, spacing: 30, width: 3, jitter: 0.18, layers: 4, seed: 1 };
export const chunkCount = (rings) => 3 * rings * rings + 3 * rings + 1;
const HEXR_AT = (rings) => 320 * (1.5 * rings + 1) / 2.5;   // rings 0/1/2 → hexR 128 / 320 / 512 (7-chunk = the std cell)

export function buildWeave3D(seed = WEAVE_DEFAULTS.seed, opts = {}) {
  const o = { ...WEAVE_DEFAULTS, ...opts, seed: (seed >>> 0) };
  const rings = o.rings, a = o.spacing, hexR = HEXR_AT(rings);
  const NW = FACTIONS.flatMap((f) => f.roleIds).length, NF = ENGINE_RING.length;   // 6, 8
  const rng = mulberry32((o.seed ^ 0x77a3) >>> 0);

  const prism = buildPrism(o.seed, { hexR, spacing: a, layers: o.layers, jitter: o.jitter });
  const { nodes, thickness: T } = prism;
  const R = hexR, zMid = T / 2, ampZ = 0.46 * T, radius = o.width * a / 2;

  // seeded family: counter-rotating spiral turns (more chunks ⇒ more windings), phases, spin
  const baseTurns = 1.0 + 0.9 * rings;
  const turnsW = baseTurns * (0.85 + 0.3 * rng()), turnsP = baseTurns * (0.85 + 0.3 * rng());
  const phaseW = rng() * TAU, phaseP = rng() * TAU, spin = rng() < 0.5 ? 1 : -1, Sxz = turnsW + turnsP;

  // thread centrelines (in-plane spiral + interlacing height): white +cos, production −cos ⇒ where one is high the
  // other is low (a real over/under weave), at the crossing frequency Sxz so the swap lands on the crossings.
  const aW = (w, rf) => wrap((w + 0.5) * TAU / NW + phaseW - spin * turnsW * TAU * rf);
  const aP = (f, rf) => wrap((f + 0.5) * TAU / NF + phaseP + spin * turnsP * TAU * rf);
  const zW = (w, rf) => zMid + ampZ * Math.cos(TAU * Sxz * rf + w * TAU / NW);
  const zP = (f, rf) => zMid - ampZ * Math.cos(TAU * Sxz * rf + f * TAU / NF);

  const warps = FACTIONS.flatMap((fac) => fac.roleIds.map((rid) => ({ id: rid, faction: fac.id, factionLabel: fac.label, color: fac.color }))).map((wc, w) => ({ ...wc, w, kind: 'white' }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, kind: 'prod', ...ENGINES[id] }));

  // ── assign: a node is claimed by EVERY thread whose tube it falls inside (so collisions surface as contested) ──
  for (const n of nodes) {
    const rf = Math.hypot(n.x, n.y) / R, th = Math.atan2(n.y, n.x);
    n.rf = rf; const owners = [];
    for (let w = 0; w < NW; w++) { const arc = angDist(th, aW(w, rf)) * rf * R, dz = n.z - zW(w, rf), d = Math.hypot(arc, dz); if (d <= radius) owners.push({ kind: 'white', idx: w, d }); }
    for (let f = 0; f < NF; f++) { const arc = angDist(th, aP(f, rf)) * rf * R, dz = n.z - zP(f, rf), d = Math.hypot(arc, dz); if (d <= radius) owners.push({ kind: 'prod', idx: f, d }); }
    owners.sort((p, q) => p.d - q.d);
    n.owners = owners; n.nearest = owners[0] || null; n.contested = owners.length > 1;
  }

  // ── metrics (raw — nothing clamped) ──
  const N = nodes.length;
  const orphans = nodes.filter((n) => n.owners.length === 0).length;
  const contested = nodes.filter((n) => n.contested).length;
  const whiteCounts = Array.from({ length: NW }, (_, w) => nodes.filter((n) => n.nearest && n.nearest.kind === 'white' && n.nearest.idx === w).length);
  const prodCounts = Array.from({ length: NF }, (_, f) => nodes.filter((n) => n.nearest && n.nearest.kind === 'prod' && n.nearest.idx === f).length);
  const deadThreads = whiteCounts.filter((c) => c === 0).length + prodCounts.filter((c) => c === 0).length;

  // K(6,8): a contact (w,f) is REALISED iff some node nearest-owned by white w sits within 1.4a (3D) of some node
  // nearest-owned by production f. Grid-bucket the coloured nodes; scan 27-neighbourhoods. Missing pairs are real
  // breakage (a crossing with no nodes to register it), not hidden.
  const cell = 1.4 * a, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map();
  for (const n of nodes) if (n.nearest) { const k = key(n.x, n.y, n.z); (grid.get(k) || grid.set(k, []).get(k)).push(n); }
  const contacts = new Set();
  for (const n of nodes) { if (!n.nearest) continue; const bx = Math.floor(n.x / cell), by = Math.floor(n.y / cell), bz = Math.floor(n.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const bucket = grid.get(`${bx + dx},${by + dy},${bz + dz}`); if (!bucket) continue;
      for (const m of bucket) { if (m === n || !m.nearest) continue; if ((m.x - n.x) ** 2 + (m.y - n.y) ** 2 + (m.z - n.z) ** 2 > cell * cell) continue;
        if (n.nearest.kind === 'white' && m.nearest.kind === 'prod') contacts.add(n.nearest.idx + ':' + m.nearest.idx);
        else if (n.nearest.kind === 'prod' && m.nearest.kind === 'white') contacts.add(m.nearest.idx + ':' + n.nearest.idx);
      } } }

  // explicit failure flags — the ways the weave is BROKEN. Orphans are NOT here: un-claimed nodes are the
  // interstitial matrix between threads (the future walls/corridors), reported but not a structural failure.
  const tubeVsThickness = 2 * radius / T, contestedPct = contested / N;
  const breaks = [];
  if (contacts.size !== NW * NF) breaks.push(`K(6,8) incomplete: ${contacts.size}/${NW * NF} crossings registered`);
  if (deadThreads > 0) breaks.push(`${deadThreads} thread(s) claim no nodes (invisible)`);
  if (tubeVsThickness > 1) breaks.push(`tube ${tubeVsThickness.toFixed(1)}× the thickness — white & production merge through the floor`);
  if (contestedPct > 0.5) breaks.push(`${(contestedPct * 100) | 0}% of nodes contested — threads have dissolved into each other`);

  const metrics = {
    nodes: N, radius, thickness: T, tubeVsThickness,
    coverage: (N - orphans) / N, orphans, orphanPct: orphans / N,    // orphanPct = interstitial matrix fraction
    contested, contestedPct, deadThreads,
    contacts: contacts.size, k68: contacts.size === NW * NF, k68Pairs: `${contacts.size}/${NW * NF}`,
    whiteCounts, prodCounts, breaks, clean: breaks.length === 0,
  };

  return {
    seed: o.seed, rings, chunkCount: chunkCount(rings), spacing: a, width: o.width, hexR, R, thickness: T, layers: o.layers,
    NW, NF, prism, nodes, warps, wefts, footprint: prism.footprint,
    family: { turnsW, turnsP, phaseW, phaseP, spin }, aW, aP, zW, zP, radius, metrics,
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindWeave3D = { buildWeave3D };
