// nave.js — the NAVE: floor 1 as seven chunks in the faction arrangement.
//
// THE LAYOUT. A central COMMONS chunk (≥1 of every building type) with six FACTION chunks arrayed
// compactly around it (the six neighbours of a hex). The six map to THREE factions, two biomes each:
//
//        ┌─ continuant ─┐                      center connects to ALL six.
//   drift │   commons   │ continuant           a faction chunk connects ONLY to the center and its
//        └──   (★)    ──┘                       SIBLING (the other chunk of its faction) — so the three
//   drift │  rindwalker │ rindwalker            factions stick out as three two-chunk LOBES. Every other
//        └──────────────┘                       (cross-faction) adjacency is a portless WALL.
//
// Each faction over-biases four roles (two of them EXCLUSIVE buildings that appear in no other faction
// chunk, only here + the commons). The two biomes of a faction carry the faction's two exclusives, at
// two relative intensity LEVELS. All chunks have housing.
//
// Built by composing the v2 engine: solveChunk per chunk with explicit closedSides (the walls) + inherited
// seam ports (the open links). All seven share ONE foam seed, so neighbouring Voronoi cells abut cleanly.
// Pure (no DOM); node-tested in test/nave.selftest.mjs.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { createWorld, addChunk, midKey, buildWalk } from '../v099/v8/manager.js';
import { ROLES } from '../v099/econ/econ.js';
import { ROLE_MIX } from '../v099/econ/econ.js';
import { TRAFFIC_FOOTPRINT, GRAND_MIN, MIN_ROOM } from '../v099/rooms.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../chunkroller/shapes.js';
import { latticeVectors } from '../chunkroller/builder.js';

// ── the three factions ────────────────────────────────────────────────────────────────────────────
// Each faction owns 4 roles: 2 EXCLUSIVE buildings (one per biome) + 2 SHARED over-biased roles. Housing
// (dwell) is universal. Roles not owned by a faction never appear in its chunks (weight 0).
export const FACTIONS = {
  rindwalker: { label: 'Rindwalker', color: '#9b6b3a', exclusives: ['worship', 'mend'], shared: ['make', 'store'] },
  continuant: { label: 'Continuant', color: '#33408f', exclusives: ['govern', 'grow'], shared: ['serve', 'heal'] },
  drift: { label: 'Drift', color: '#3bb0c9', exclusives: ['learn', 'play'], shared: ['move', 'trade'] },
};

// the six faction biomes, in NEIGHBOUR ORDER (dir 0..5). Adjacent pairs (0,1)(2,3)(4,5) are siblings, so
// each faction's two biomes sit side by side and form one lobe. `level` is the relative intensity.
export const BIOMES = [
  { dir: 0, key: 'rind-worship', faction: 'rindwalker', exclusive: 'worship', level: 'high' },
  { dir: 1, key: 'rind-mend', faction: 'rindwalker', exclusive: 'mend', level: 'mild' },
  { dir: 2, key: 'cont-govern', faction: 'continuant', exclusive: 'govern', level: 'high' },
  { dir: 3, key: 'cont-grow', faction: 'continuant', exclusive: 'grow', level: 'mild' },
  { dir: 4, key: 'drift-learn', faction: 'drift', exclusive: 'learn', level: 'high' },
  { dir: 5, key: 'drift-play', faction: 'drift', exclusive: 'play', level: 'mild' },
];
const BIOME_OF_DIR = Object.fromEntries(BIOMES.map((b) => [b.dir, b]));

// a faction biome's roleMix: ONLY housing + the faction's two shared roles + this biome's one exclusive.
// `high` cranks the faction bias; `mild` keeps more housing and a lighter hand (the two relative levels).
function biomeMix(b) {
  const f = FACTIONS[b.faction];
  const w = b.level === 'high' ? { dwell: 2.4, shared: 2.4, excl: 3.0 } : { dwell: 4.0, shared: 1.5, excl: 2.0 };
  const mix = [['dwell', w.dwell], [b.exclusive, w.excl]];
  for (const r of f.shared) mix.push([r, w.shared]);
  return mix;
}
// the role FLOORS for a faction biome: at least one of housing + the shared roles + the exclusive.
function biomeFloors(b) { const f = FACTIONS[b.faction], fl = { dwell: 1, [b.exclusive]: 1 }; for (const r of f.shared) fl[r] = 1; return fl; }

// the COMMONS: at least one of EVERY building type (so every exclusive still appears here), wild-type mix.
const COMMONS_FLOORS = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 1]));
export const COMMONS = { key: 'commons', label: 'The Commons', color: '#c9b07a', roleMix: ROLE_MIX, roleFloors: COMMONS_FLOORS, grand: ['serve', 'govern', 'learn'] };

export function biomeForChunk(i) {
  if (i === 0) return { ...COMMONS, faction: null };
  const b = BIOME_OF_DIR[i - 1];
  return { key: b.key, label: `${FACTIONS[b.faction].label} · ${b.exclusive}`, faction: b.faction, exclusive: b.exclusive, color: FACTIONS[b.faction].color, roleMix: biomeMix(b), roleFloors: biomeFloors(b), grand: [b.exclusive] };
}

// which CONNECTIONS exist (chunk index pairs). center = 0; faction chunks = dir+1 (1..6).
// center↔every faction chunk, and each sibling pair. Everything else (cross-faction touching) is a wall.
const CONNECTIONS = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [3, 4], [5, 6]];

// the side of polygon A (by direction) that abuts polygon B — matched on shared segment midpoints.
function sharedSide(polyA, sideOf, polyB) {
  const bKeys = new Set(); for (let e = 0; e < polyB.length; e++) bKeys.add(midKey(polyB, e));
  for (let k = 0; k < 6; k++) { const ks = []; for (let e = 0; e < polyA.length; e++) if (sideOf[e] === k) ks.push(midKey(polyA, e)); if (ks.length && ks.every((x) => bKeys.has(x))) return k; }
  return -1;
}

// build the whole nave. Returns the world (7 records), per-chunk meta (biome/faction), the connection
// graph, and the bbox. Deterministic from `seed` (one shared foam seed → seamless seams).
export function buildNave(seed, { shape = SAMPLE_SHAPE, W = 900, H = 600, commonsRoomSize = 11, factionRoomSize = 13 } = {}) {
  seed = (seed | 0) >>> 0;
  const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
  const poly0 = shapePoly(shape, cx, cy, R), sideOf = shapeSideOf(shape);
  const T = latticeVectors(poly0, sideOf);
  const polys = [poly0]; for (let k = 0; k < 6; k++) polys.push(poly0.map((p) => ({ x: p.x + T[k].x, y: p.y + T[k].y })));

  // for each chunk, the set of sides that should be OPEN (a connected seam); the rest become walls.
  const activeSides = polys.map(() => new Set());
  for (const [a, b] of CONNECTIONS) {
    const sa = sharedSide(polys[a], sideOf, polys[b]), sb = sharedSide(polys[b], sideOf, polys[a]);
    if (sa >= 0) activeSides[a].add(sa);
    if (sb >= 0) activeSides[b].add(sb);
  }

  const world = createWorld(), meta = [], recs = [];
  for (let i = 0; i < polys.length; i++) {
    const closed = []; for (let k = 0; k < 6; k++) if (!activeSides[i].has(k)) closed.push(k);
    // inherit ports from already-solved connected neighbours (on the side that faces this chunk)
    const inherit = [];
    for (const [a, b] of CONNECTIONS) {
      const j = a === i ? b : b === i ? a : -1; if (j < 0 || !recs[j]) continue;
      const sj = sharedSide(polys[j], sideOf, polys[i]);
      for (const p of recs[j].ports) if (sideOf[p.edge] === sj) inherit.push({ x: p.x, y: p.y });
    }
    const bi = biomeForChunk(i);
    const rec = solveChunk({
      poly: polys[i], sideOf, inherit, closedSides: closed,
      seed: (seed ^ (i * 0x9e37 + 0x51)) >>> 0, foamSeed: seed, W, H,
      roomSize: i === 0 ? commonsRoomSize : factionRoomSize, footprint: TRAFFIC_FOOTPRINT,
      grand: bi.grand, grandMin: GRAND_MIN, minRoom: MIN_ROOM, roleMix: bi.roleMix, roleFloors: bi.roleFloors,
      v2: true, tension: 0.6, portRange: [1, 1],
    });
    recs[i] = rec; addChunk(world, rec);
    meta[i] = { key: bi.key, label: bi.label, faction: bi.faction, exclusive: bi.exclusive || null, color: bi.color, dir: i === 0 ? -1 : i - 1 };
  }

  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of world.chunks) for (const p of ch.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { world, meta, connections: CONNECTIONS, sideOf, bbox: { x0, y0, x1, y1 }, seed };
}

// the connectivity check used by the page + tests: build the cross-chunk walk graph and confirm which
// chunk pairs are actually linked (a seam crossing exists) — should match CONNECTIONS exactly.
export function naveLinks(nave) {
  const walk = buildWalk(nave.world);
  const base = walk.base, linked = new Set();
  // two chunks are linked if any node of one reaches a node of the other WITHOUT passing through a third.
  // simpler + sufficient here: they share a port location (the seam crossing buildWalk links).
  const portLoc = nave.world.chunks.map((ch) => new Set(ch.ports.filter((p) => p.cell != null && p.cell >= 0).map((p) => Math.round(p.x) + ',' + Math.round(p.y))));
  for (let a = 0; a < portLoc.length; a++) for (let b = a + 1; b < portLoc.length; b++) { for (const k of portLoc[a]) if (portLoc[b].has(k)) { linked.add(a + '-' + b); break; } }
  return { walk, linked };
}
