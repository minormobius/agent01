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

import { solveRegion, gatesFor, seamKey } from './record.js';
import { ROLES } from './econ.js';
import { buildSceneCustom, adjacency, bucketGrid, clipCell, chooseDoors } from '../paint/voronoi.js';

function ehash(seed, a, b) { let x = (seed ^ Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return x >>> 0; }

export function deckScene({
  lattice, seed = 1, grade = 0.4, genome, record, az = 0, ax = 0, axSpan = 14, iters = 5,
  pxPerCell = 64, wallSpacing, roomSpacing, gz, loops = 0.15, solved, solveOpts = {},
} = {}) {
  const L = lattice, gzDeck = gz ?? Math.floor(L.nz / 2);
  // 8/24 proportions scale with the room size so the paint density per room stays constant
  if (wallSpacing == null) wallSpacing = pxPerCell * 0.125;
  if (roomSpacing == null) roomSpacing = pxPerCell * 0.345;
  const s = solved || solveRegion({ lattice, seed, grade, genome, record, az, ax, axSpan, iters, ...solveOpts });
  const { rf, city } = s;

  // the band: this deck's chambers — REAL first, then the GHOST RIM (the neighbours' first two
  // lattice columns, bit-identical by the seam contract). Ghosts join the Voronoi so boundary
  // rooms compute the SAME polygons from both sides: regions tile a continuous world with no
  // seam, mathematically. Coordinates are LATTICE-ANCHORED (region origin = its gy0/gx0 corner),
  // so a region's px frame drops into the world at offset (dAz·frameW, dAx·frameH), exactly.
  const band = [], ghostBand = [];
  for (const c of rf.nodes) if (c.gz === gzDeck) band.push(c);
  for (const c of rf.ghosts) if (c.gz === gzDeck) ghostBand.push(c);
  const nReal = band.length;
  const rBar = L.Ri + L.T / 2, K = pxPerCell / L.cell;
  const ox = rf.gy0 * L.dTheta, oz = rf.gx0 * L.cell;
  const toPx = (c) => ({ x: (c.thU - ox) * rBar * K, y: (c.z - oz) * K });
  const seeds = band.concat(ghostBand).map(toPx);
  const W = L.nyR * L.dTheta * rBar * K, H = axSpan * L.cell * K;

  // per-room city facts (REAL rooms only; ghosts belong to the neighbour's solve)
  const owner = band.map((c) => city.chamberOwner[c.idx]);
  const role = band.map((_, i) => owner[i] >= 0 ? city.places[owner[i]].role : owner[i] === -1 ? 'road' : 'void');
  const isGate = new Set();
  { const gs = new Set(s.gates); band.forEach((c, i) => { if (gs.has(c.gid)) isGate.add(i); }); }
  // gate membranes into the ghost rim open (the street continues through the seam, visibly)
  const ghostIdx = new Map(); ghostBand.forEach((c, i) => ghostIdx.set(c.gid, nReal + i));
  const openGhost = new Set();
  {
    const R = L.regionsPerRing, azN = ((az % R) + R) % R;
    const bandGid = new Map(); band.forEach((c, i) => bandGid.set(c.gid, i));
    for (const nb of [{ az: azN + 1, ax }, { az: azN - 1, ax }, { az: azN, ax: ax + 1 }, { az: azN, ax: ax - 1 }]) {
      const rec = record && record.seams.get(seamKey({ az: azN, ax }, nb, R));
      const K = Math.max(1, rec ? rec.tier : 0);            // floor: open every seam's deck gate
      for (const pair of gatesFor(L, seed, grade, { az: azN, ax }, nb, axSpan, K)) {
        const mine = bandGid.has(pair.a) ? pair.a : bandGid.has(pair.b) ? pair.b : null;
        if (!mine) continue;
        const other = mine === pair.a ? pair.b : pair.a;
        if (ghostIdx.has(other)) openGhost.add(bandGid.get(mine) + '|' + ghostIdx.get(other));
      }
    }
  }

  // classify the membranes: same geometric adjacency buildSceneCustom will recompute
  const roomSeeds = seeds.map((p, i) => ({ x: p.x, y: p.y, id: i }));
  const roomSize = Math.max(roomSpacing * 2, Math.sqrt((W * H) / Math.max(1, roomSeeds.length)));   // EXACTLY buildSceneCustom's law, so the classified adjacency is the painted adjacency
  const rg = bucketGrid(roomSeeds, roomSize * 1.4);
  const cellsPoly = roomSeeds.map((q) => ({ id: q.id, x: q.x, y: q.y, poly: clipCell(q, rg.near(q.x, q.y), roomSize * 2.2) }));
  const adjE0 = adjacency(cellsPoly, roomSeeds, rg, wallSpacing * 0.6);
  const adjE = adjE0.filter((e) => e.a < nReal && e.b < nReal);    // real-real: the city's own fabric
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
  const streetDoorKeys = new Set([...best.values()].map((v) => eKey(v.e.a, v.e.b)));

  // ── UNIVERSAL NAVIGABILITY (the hard requirement): every room reaches every room, torturous
  //    paths allowed. The deck slice fragments the 3D right-of-way and seals landlocked buildings;
  //    restore the foam's navigability invariant with SERVICE DOORS — the fewest extra doors (a
  //    spanning set over the walk components), class-weighted so easements run through concourse
  //    and workshops before they ever run through a home, and kept categorically distinct from the
  //    ONE street door (the civic fact stands; these are the back passages every habitat needs). ──
  const par = Array.from({ length: band.length }, (_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const e of adjE) { const k = kind.get(eKey(e.a, e.b)); if (k === 'door' || k === 'open') par[find(e.a)] = find(e.b); }
  const cls = (i) => owner[i] === -1 ? 0 : role[i] === 'dwell' ? 2 : 1;   // concourse 0 · work/void 1 · home 2
  const cand = adjE
    .filter((e) => !kind.has(eKey(e.a, e.b)))
    .map((e) => ({ e, w: cls(e.a) + cls(e.b), h: ehash((seed ^ 0x51515151) >>> 0, e.a, e.b) }))
    .sort((p, q) => p.w - q.w || p.h - q.h);
  const serviceEdges = [];
  for (const c of cand) {
    const a = find(c.e.a), b = find(c.e.b);
    if (a === b) continue;
    par[a] = b;
    kind.set(eKey(c.e.a, c.e.b), 'door');
    serviceEdges.push({ a: c.e.a, b: c.e.b });
  }
  // SEALED border pockets: rooms outside the giant walkable component — islands whose whole
  // perimeter is the ghost rim, so no in-region door can ever reach them without breaching the
  // seam. Honestly sealed on this deck; their connectivity is the 3D foam (the stairs leg). Rare.
  const compSize = new Map();
  for (let i = 0; i < nReal; i++) { const r = find(i); compSize.set(r, (compSize.get(r) || 0) + 1); }
  let mainRoot = -1, mainN = -1;
  for (const [r, n] of compSize) if (n > mainN) { mainN = n; mainRoot = r; }
  const sealed = new Set();
  for (let i = 0; i < nReal; i++) if (find(i) !== mainRoot) sealed.add(i);

  const scene = buildSceneCustom({
    W, H, wallSpacing, roomSpacing, seeds,
    seed: (seed ^ Math.imul(((az % L.regionsPerRing) + L.regionsPerRing) % L.regionsPerRing + 1, 0x68bc21) ^ Math.imul((ax + 0x4000) | 0, 0x2c9277)) >>> 0,
    edgeKind: (a, b) => {
      const ga = a >= nReal, gb = b >= nReal;
      if (ga && gb) return 'wall';                          // the neighbour's own fabric — not ours to cut
      if (ga || gb) return openGhost.has((ga ? b : a) + '|' + (ga ? a : b)) ? 'open' : 'wall';
      return kind.get(eKey(a, b)) || 'wall';
    },
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
    buildings: glyphs.size, streetDoors: best.size, serviceDoors: serviceEdges.length, gates: isGate.size,
    closure: city.closure, access: city.access,
  };
  stats.sealed = sealed.size;
  return { scene, band, ghostBand, nReal, owner, role, bill, isGate, seeds, stats, solved: s,
    frame: { W, H }, K, streetDoorKeys, serviceEdges, sealed };
}

export const ROLE_COLOR = Object.fromEntries(Object.entries(ROLES).map(([k, R]) => [k, R.color]));
export const M_PER_CELL = 15;     // the declared room scale: one lattice cell = a spacious ~15 m room

// ── WAYFINDING on the deck: the walkable graph IS the membrane classification — you can cross a
//    door or an open concourse membrane, never a wall. Routes thread room-centre → door midpoint →
//    room-centre, so a journey out of a building visibly funnels through its ONE street door. ──
export function buildWalk(d) {
  const nR = d.nReal ?? d.seeds.length;
  const walk = Array.from({ length: d.seeds.length }, () => []);
  const addE = (e) => {
    if (e.a >= nR || e.b >= nR) return;                     // ghost crossings are the page's portals, not walks
    const a = d.seeds[e.a], b = d.seeds[e.b], m = e.m;
    const w = Math.hypot(a.x - m[0], a.y - m[1]) + Math.hypot(b.x - m[0], b.y - m[1]);
    walk[e.a].push({ to: e.b, w, m }); walk[e.b].push({ to: e.a, w, m });
  };
  for (const e of d.scene.doors) addE(e);
  for (const e of d.scene.opens) addE(e);
  return walk;
}

// ── GATE LINKS: which deck rooms are border crossings, and where they lead. A gate pair shares
//    its gz, so a deck-band gate's partner is always a deck-band room of the neighbour — walking
//    onto the gate room and stepping through lands you on the partner room, both provably in each
//    region's right-of-way (the seam-continuity guarantee made playable). Pure function of
//    (lattice, seed, grade, record, key); both regions derive the same crossings. ──
export function gateLinks(d, { lattice, seed = 1, grade = 0.4, record, az, ax, axSpan = 14 } = {}) {
  const L = lattice, R = L.regionsPerRing;
  const azN = ((az % R) + R) % R;
  const byGid = new Map(); d.band.forEach((c, i) => byGid.set(c.gid, i));
  const links = [];
  for (const nb of [{ az: azN + 1, ax }, { az: azN - 1, ax }, { az: azN, ax: ax + 1 }, { az: azN, ax: ax - 1 }]) {
    const rec = record && record.seams.get(seamKey({ az: azN, ax }, nb, R));
    const K = Math.max(1, rec ? rec.tier : 0);              // floor: every neighbour has a deck crossing
    const nbN = { az: ((nb.az % R) + R) % R, ax: nb.ax };
    for (const pair of gatesFor(L, seed, grade, { az: azN, ax }, nb, axSpan, K)) {
      const mine = byGid.has(pair.a) ? pair.a : byGid.has(pair.b) ? pair.b : null;
      if (!mine) continue;                                  // this gate lives off-deck (gz ±1)
      links.push({ room: byGid.get(mine), gid: mine, to: nbN, partner: mine === pair.a ? pair.b : pair.a });
    }
  }
  return links;
}

export function walkRoute(d, a, b) {
  const walk = d._walk || (d._walk = buildWalk(d));
  const n = d.seeds.length;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const prevM = new Array(n).fill(null);
  dist[a] = 0;
  for (;;) {                                               // O(n²) scan — a deck is a few hundred rooms
    let u = -1, du = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const e of walk[u]) { const nd = du + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; prevM[e.to] = e.m; } }
  }
  if (!isFinite(dist[b])) return null;
  const rooms = [], pts = [[d.seeds[b].x, d.seeds[b].y]];
  for (let u = b; u !== a; u = prev[u]) { rooms.push(u); pts.push(prevM[u]); pts.push([d.seeds[prev[u]].x, d.seeds[prev[u]].y]); }
  rooms.push(a); rooms.reverse(); pts.reverse();
  return { rooms, pts, length: dist[b] };
}
