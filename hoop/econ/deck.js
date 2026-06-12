// deck.js — THE DECK PROJECTION (FOAM.md leg 7, step 2): the first frame where the game's look
// meets the solved city. Take one solved region (record.js solveRegion), slice its mid-shell deck
// band (the gz layer the gates live in), unroll it to the (azimuth-arc × axial) plane, and render
// it in /paint's 8/24 membrane language via buildSceneCustom. The city decides what every
// membrane IS:
//
//   row ↔ row                    → 'open'  — the zero-wall concourse (the street)
//   same building ↔ same building→ 'door' on a per-building spanning tree (+ a few loops) — the
//                                   interior connects like a paint zone, the rest stay walls
//   building ↔ row               → ONE 'door' per building (its street door, hash-picked among
//                                   its road-fronting band membranes) — sequestration
//   anything else                → 'wall'
//
// Missing lattice sites (the foam's thinning) simply have no room — neighbouring rooms swallow
// the space, which reads as solid mass. Deterministic from (lattice, seed, genome, record, key).

import { solveRegion } from './record.js';
import { ROLES } from './econ.js';
import { buildSceneCustom, adjacency, bucketGrid, clipCell, chooseDoors } from '../paint/voronoi.js';

function ehash(seed, a, b) { let x = (seed ^ Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return x >>> 0; }

export function deckScene({
  lattice, seed = 1, grade = 0.4, genome, record, az = 0, ax = 0, axSpan = 14, iters = 5,
  pxPerCell = 64, wallSpacing = 8, roomSpacing = 22, gz, loops = 0.15, solved,
} = {}) {
  const L = lattice, gzDeck = gz ?? Math.floor(L.nz / 2);
  const s = solved || solveRegion({ lattice, seed, grade, genome, record, az, ax, axSpan, iters });
  const { rf, city } = s;

  // the band: this deck's chambers, projected to px (unrolled arc × axial)
  const band = [];
  for (const c of rf.nodes) if (c.gz === gzDeck) band.push(c);
  const rBar = L.Ri + L.T / 2, K = pxPerCell / L.cell;
  let thMin = Infinity, zMin = Infinity;
  for (const c of band) { if (c.thU < thMin) thMin = c.thU; if (c.z < zMin) zMin = c.z; }
  const pad = pxPerCell;
  const seeds = band.map((c) => ({ x: (c.thU - thMin) * rBar * K + pad, y: (c.z - zMin) * K + pad }));
  let W = 0, H = 0; for (const p of seeds) { if (p.x > W) W = p.x; if (p.y > H) H = p.y; }
  W += pad; H += pad;

  // per-room city facts
  const owner = band.map((c) => city.chamberOwner[c.idx]);
  const role = band.map((_, i) => owner[i] >= 0 ? city.places[owner[i]].role : owner[i] === -1 ? 'road' : 'void');
  const isGate = new Set();
  { const gs = new Set(s.gates); band.forEach((c, i) => { if (gs.has(c.gid)) isGate.add(i); }); }

  // classify the membranes: same geometric adjacency buildSceneCustom will recompute
  const roomSeeds = seeds.map((p, i) => ({ x: p.x, y: p.y, id: i }));
  const roomSize = Math.max(roomSpacing * 2, Math.sqrt((W * H) / Math.max(1, roomSeeds.length)));
  const rg = bucketGrid(roomSeeds, roomSize * 1.4);
  const cellsPoly = roomSeeds.map((q) => ({ id: q.id, x: q.x, y: q.y, poly: clipCell(q, rg.near(q.x, q.y), roomSize * 2.2) }));
  const adjE = adjacency(cellsPoly, roomSeeds, rg, wallSpacing * 0.6);
  const eKey = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const kind = new Map();
  // interior doors: a spanning tree (+ loops) per building over its intra-building band edges
  const intra = adjE.filter((e) => owner[e.a] >= 0 && owner[e.a] === owner[e.b]);
  for (const e of chooseDoors(intra, band.length, seed >>> 0, loops)) kind.set(eKey(e.a, e.b), 'door');
  // streets: open every row↔row membrane
  for (const e of adjE) if (owner[e.a] === -1 && owner[e.b] === -1) kind.set(eKey(e.a, e.b), 'open');
  // ONE street door per building: its hash-min road-fronting band membrane
  const best = new Map();
  for (const e of adjE) {
    const bo = owner[e.a] >= 0 && owner[e.b] === -1 ? owner[e.a] : owner[e.b] >= 0 && owner[e.a] === -1 ? owner[e.b] : -1;
    if (bo < 0) continue;
    const h = ehash(seed, e.a, e.b);
    const cur = best.get(bo);
    if (!cur || h < cur.h) best.set(bo, { e, h });
  }
  for (const [, v] of best) kind.set(eKey(v.e.a, v.e.b), 'door');

  const scene = buildSceneCustom({
    W, H, wallSpacing, roomSpacing, seeds,
    seed: (seed ^ Math.imul(((az % L.regionsPerRing) + L.regionsPerRing) % L.regionsPerRing + 1, 0x68bc21) ^ Math.imul((ax + 0x4000) | 0, 0x2c9277)) >>> 0,
    edgeKind: (a, b) => kind.get(eKey(a, b)) || 'wall',
  });

  // building glyph anchors (band centroid per building present on this deck)
  const glyphs = new Map();
  band.forEach((c, i) => {
    const o = owner[i]; if (o < 0) return;
    let g = glyphs.get(o); if (!g) { g = { n: 0, x: 0, y: 0, glyph: city.places[o].glyph, role: city.places[o].role }; glyphs.set(o, g); }
    g.n++; g.x += seeds[i].x; g.y += seeds[i].y;
  });
  const bill = [...glyphs.values()].map((g) => ({ x: g.x / g.n, y: g.y / g.n, n: g.n, glyph: g.glyph, role: g.role }));

  const stats = {
    rooms: band.length, roadRooms: role.filter((r) => r === 'road').length,
    buildings: glyphs.size, streetDoors: best.size, gates: isGate.size,
    closure: city.closure, access: city.access,
  };
  return { scene, band, owner, role, bill, isGate, seeds, stats, solved: s, frame: { W, H } };
}

export const ROLE_COLOR = Object.fromEntries(Object.entries(ROLES).map(([k, R]) => [k, R.color]));
