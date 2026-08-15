// foam/dungeon.mjs — the foam engine as a DUNGEON GENERATOR.
//
// A dungeon here is a re-reading of a certified pocket: the ENTRANCE is a
// chamber on the top surface of the foam, the ENDPOINTS are n chambers rolled
// deep in the foam below it, and each path between them is wayfound over the
// kernel's certified crossing graph — every door in the dungeon is a membrane
// crossing the walk certificate proved a standing body can pass. Where the
// puzzle's oracle climbs from the dais UP to the beacon, the dungeon runs the
// same machinery in reverse: paths descend, and among equally short
// continuations the wayfinder always takes the MAXIMAL GRADIENT DOWN (the
// steepest-descending next chamber), so a dungeon path reads as a wind
// downward rather than a random shortest walk.
//
// Once the foam and the paths are set, each room's floor is DISCRETIZED into
// tiles — square grid or hexes — at a caller-chosen scale relative to the
// chamber scale (`tileScale` × the seed spacing `cell`). Tiles are sampled on
// a single global lattice, so tiles line up across rooms; each carries the
// exact height of the floor plane under its centre, so a map view can be flat
// (ignore y) or true 3D (use it).
//
// Pure consumer of foamworld.js: no kernel change, same determinism contract —
// (seed, options) → identical dungeon on every machine. Runs in node (the
// selftest) and the browser (the /dungeon/ page). No dependencies.

import { generatePocket, fnv, mulberry, pointInPolyXZ } from './foamworld.js';

// ------------------------------------------------------------ geometry ------
function planeYAt(f, x, z) {
  // height of face f's plane at column (x,z); caller guarantees |n.y| sane
  const nc = f.n[0] * f.centroid[0] + f.n[1] * f.centroid[1] + f.n[2] * f.centroid[2];
  return (nc - f.n[0] * x - f.n[2] * z) / f.n[1];
}

// area-weighted floor centroid + total floor area of a basin
function basinFloor(pocket, node) {
  let a = 0, x = 0, y = 0, z = 0;
  for (const fi of node.faces) {
    const f = pocket.faces[fi];
    a += f.area;
    x += f.centroid[0] * f.area; y += f.centroid[1] * f.area; z += f.centroid[2] * f.area;
  }
  return a > 0 ? { area: a, centroid: [x / a, y / a, z / a] } : { area: 0, centroid: [0, 0, 0] };
}

// ------------------------------------------------------- discretization -----
// Tiles are sampled on a GLOBAL lattice anchored at the domain origin, so two
// rooms cut from the same foam share tile seams. A tile belongs to a room when
// its centre lies inside one of the room's floor-face polygons (in plan); its
// height is the highest such plane. `key` is unique within the room.
//
//   grid: axis-aligned squares of edge `tileSize`   → { i, j }
//   hex:  pointy-top axial hexes, width  `tileSize` → { q, r }
export function discretizeRoom(pocket, node, shape, tileSize) {
  const faces = node.faces.map((fi) => pocket.faces[fi]);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const f of faces) for (const p of f.verts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const tiles = [];
  const probe = (x, z) => {
    let y = -Infinity, hit = -1;
    for (let k = 0; k < faces.length; k++) {
      const f = faces[k];
      if (Math.abs(f.n[1]) < 1e-9) continue;
      if (!pointInPolyXZ(f.verts, x, z)) continue;
      const fy = planeYAt(f, x, z);
      if (fy > y) { y = fy; hit = node.faces[k]; }
    }
    return hit >= 0 ? { y, face: hit } : null;
  };
  if (shape === 'hex') {
    // pointy-top axial; flat-to-flat width = tileSize ⇒ circumradius R.
    // x = √3·R·(q + r/2), so the q-band covering [minX,maxX] SHIFTS by −r/2
    // per row — it must be computed per row, not once (a fixed band walks
    // off the room as |r| grows, which starved far-z rooms down to the
    // fallback tile).
    const R = tileSize / Math.sqrt(3);
    const r0 = Math.floor(minZ / (1.5 * R)) - 2, r1 = Math.ceil(maxZ / (1.5 * R)) + 2;
    for (let r = r0; r <= r1; r++) {
      const q0 = Math.floor(minX / (Math.sqrt(3) * R) - r / 2) - 2;
      const q1 = Math.ceil(maxX / (Math.sqrt(3) * R) - r / 2) + 2;
      for (let q = q0; q <= q1; q++) {
        const x = Math.sqrt(3) * R * (q + r / 2);
        const z = 1.5 * R * r;
        if (x < minX - R || x > maxX + R || z < minZ - R || z > maxZ + R) continue;
        const s = probe(x, z);
        if (s) tiles.push({ key: q + ',' + r, q, r, x, z, y: s.y, face: s.face, kind: 'floor' });
      }
    }
  } else {
    const t = tileSize;
    const i0 = Math.floor(minX / t), i1 = Math.ceil(maxX / t);
    const j0 = Math.floor(minZ / t), j1 = Math.ceil(maxZ / t);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * t, z = (j + 0.5) * t;
        const s = probe(x, z);
        if (s) tiles.push({ key: i + ',' + j, i, j, x, z, y: s.y, face: s.face, kind: 'floor' });
      }
    }
  }
  // a sliver room can miss every lattice centre at coarse scales — it still
  // needs at least one tile to stand on (doors and markers snap to tiles)
  if (!tiles.length) {
    let best = faces[0], bi = node.faces[0];
    for (let k = 1; k < faces.length; k++) if (faces[k].area > best.area) { best = faces[k]; bi = node.faces[k]; }
    const c = best.centroid;
    tiles.push({ key: 'c', x: c[0], z: c[2], y: c[1], face: bi, kind: 'floor' });
  }
  return tiles;
}

function nearestTile(tiles, x, z) {
  let best = null, bd = Infinity;
  for (const t of tiles) {
    const d = (t.x - x) ** 2 + (t.z - z) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// ------------------------------------------------------------ the dungeon ---
// generateDungeon(opts) → {
//   pocket, entrance, endpoints[], paths[], rooms[], roomOf, tileShape,
//   tileScale, tileSize, requestedEndpoints
// }
//   paths[i] = { endpoint, rooms: [roomId…], doors: [{face, from, to, at}] }
//   rooms[]  = every room on ≥1 path: { id, cell, layer, depth, floorY,
//              centroid, area, isEntrance, endpointIndex, onPaths, doors, tiles }
//
// Pass `pocket` to re-derive endpoints/paths/tiles over an existing foam
// (retiling on a slider must not regenerate the world); anything else in opts
// is forwarded to generatePocket.
export function generateDungeon(opts = {}) {
  const {
    endpoints: wantEndpoints = 3,
    tileShape = 'grid',
    tileScale = 0.35,
    minDepth = 4,
    pocket: given = null,
    ...pocketOpts
  } = opts;
  const pocket = given ?? generatePocket({ seed: 1, ...pocketOpts });
  const { nodes, edges, cells } = pocket;

  const adj = nodes.map(() => []);
  for (const e of edges) { adj[e.a].push(e); adj[e.b].push(e); }

  const floor = nodes.map((n) => basinFloor(pocket, n));
  const floorY = (ni) => floor[ni].centroid[1];

  // the entrance: the pocket's certified TARGET basin — a top-layer chamber
  // the kernel already proved connected down to the dais. The puzzle climbs
  // to it; the dungeon walks in through it and winds down.
  const entrance = pocket.nav.target;

  // reachability from the entrance over certified crossings
  const distE = new Array(nodes.length).fill(-1);
  distE[entrance] = 0;
  {
    const q = [entrance];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const e of adj[u]) {
        const v = e.a === u ? e.b : e.a;
        if (distE[v] < 0) { distE[v] = distE[u] + 1; q.push(v); }
      }
    }
  }

  // -- roll n endpoints: deep, far, and spread out. Candidates are reachable
  //    basins at least minDepth doors in; the pool is the deepest-lying slice
  //    (lowest floor centroid). The first endpoint is rolled from the pool,
  //    the rest greedily maximise plan-distance to those already picked —
  //    deterministic under the dungeon rng.
  const rng = mulberry(fnv(0xD07E0, pocket.seed >>> 0, wantEndpoints, nodes.length));
  let cands = [];
  for (let ni = 0; ni < nodes.length; ni++) {
    if (ni === entrance || distE[ni] < minDepth) continue;
    cands.push(ni);
  }
  if (cands.length < wantEndpoints) {
    // shallow pocket — relax to anything reachable at depth ≥2
    cands = [];
    for (let ni = 0; ni < nodes.length; ni++) {
      if (ni !== entrance && distE[ni] >= 2) cands.push(ni);
    }
  }
  cands.sort((a, b) => floorY(a) - floorY(b) || a - b);   // deepest-lying first
  const pool = cands.slice(0, Math.max(wantEndpoints * 4, 12));
  const picked = [];
  if (pool.length) {
    picked.push(pool[Math.floor(rng() * Math.min(pool.length, wantEndpoints * 2))]);
    while (picked.length < wantEndpoints && picked.length < pool.length) {
      let best = -1, bd = -1;
      for (const c of pool) {
        if (picked.includes(c)) continue;
        let dmin = Infinity;
        for (const p of picked) {
          const A = floor[c].centroid, B = floor[p].centroid;
          dmin = Math.min(dmin, (A[0] - B[0]) ** 2 + (A[2] - B[2]) ** 2);
        }
        const jit = dmin * (0.9 + 0.2 * rng());           // seeded tie-jitter
        if (jit > bd) { bd = jit; best = c; }
      }
      if (best < 0) break;
      picked.push(best);
    }
  }

  // -- wayfind one path per endpoint: shortest by door count, and among
  //    equally short continuations take the maximal gradient down. BFS from
  //    the endpoint gives distance-to-go; the walk from the entrance then
  //    always steps to a next chamber one door closer, choosing the one whose
  //    floor lies lowest.
  const paths = picked.map((end) => {
    const dT = new Array(nodes.length).fill(-1);
    dT[end] = 0;
    const q = [end];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const e of adj[u]) {
        const v = e.a === u ? e.b : e.a;
        if (dT[v] < 0) { dT[v] = dT[u] + 1; q.push(v); }
      }
    }
    const rooms = [entrance], doors = [];
    let u = entrance;
    while (u !== end) {
      let bestE = null, bestV = -1;
      for (const e of adj[u]) {
        const v = e.a === u ? e.b : e.a;
        if (dT[v] !== dT[u] - 1) continue;
        if (!bestE || floorY(v) < floorY(bestV) - 1e-9 ||
            (Math.abs(floorY(v) - floorY(bestV)) <= 1e-9 && v < bestV)) { bestE = e; bestV = v; }
      }
      doors.push({ face: bestE.face, from: u, to: bestV, at: bestE.at.slice() });
      rooms.push(bestV);
      u = bestV;
    }
    return { endpoint: end, rooms, doors };
  });

  // -- assemble the room set (union of all paths) and discretize each floor
  const tileSize = pocket.opts.cell * tileScale;
  const roomOf = new Map();   // node id -> room record
  const rooms = [];
  const touch = (ni) => {
    if (roomOf.has(ni)) return roomOf.get(ni);
    const r = {
      id: ni, cell: nodes[ni].cell, layer: cells[nodes[ni].cell].layer,
      depth: distE[ni], floorY: floorY(ni),
      centroid: floor[ni].centroid.slice(), area: floor[ni].area,
      isEntrance: ni === entrance, endpointIndex: -1,
      onPaths: [], doors: [], tiles: null,
    };
    roomOf.set(ni, r); rooms.push(r);
    return r;
  };
  paths.forEach((p, pi) => {
    for (const ni of p.rooms) {
      const r = touch(ni);
      if (!r.onPaths.includes(pi)) r.onPaths.push(pi);
    }
    const ei = picked.indexOf(p.endpoint);
    touch(p.endpoint).endpointIndex = ei;
  });
  // doors per room (dedup by membrane face across overlapping paths)
  for (const p of paths) {
    for (const d of p.doors) {
      for (const [me, other] of [[d.from, d.to], [d.to, d.from]]) {
        const r = roomOf.get(me);
        if (!r.doors.some((x) => x.face === d.face)) {
          r.doors.push({ face: d.face, to: other, at: d.at.slice() });
        }
      }
    }
  }
  for (const r of rooms) {
    r.tiles = discretizeRoom(pocket, nodes[r.id], tileShape, tileSize);
    // snap markers onto the lattice: doors, then the entrance / endpoint tiles
    for (const d of r.doors) {
      const t = nearestTile(r.tiles, d.at[0], d.at[2]);
      if (t.kind === 'floor') t.kind = 'door';
      d.tile = t.key;
    }
    const mark = (kind, x, z) => {
      const t = nearestTile(r.tiles, x, z);
      t.kind = kind;
    };
    if (r.isEntrance) mark('entrance', r.centroid[0], r.centroid[2]);
    if (r.endpointIndex >= 0) mark('goal', r.centroid[0], r.centroid[2]);
  }
  rooms.sort((a, b) => a.depth - b.depth || a.id - b.id);

  return {
    pocket, entrance, endpoints: picked, paths, rooms, roomOf,
    tileShape, tileScale, tileSize,
    requestedEndpoints: wantEndpoints,
  };
}
