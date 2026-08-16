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

// The PERMALINK contract: (DUNGEON_VERSION, seed, endpoints, tileShape,
// tileScale, size) → an identical dungeon, forever. The selftest pins golden
// signatures of known seeds; any change to generation or discretization that
// shifts them must bump this version — published permalinks carry it, so a
// layout from an older generator is detectable rather than silently
// different.
//
// v1 → v2: the dungeon never stands on the domain box. Basins whose floor
// touches the boundary (the box bottom shows as an unnaturally flat field)
// are no longer rooms and paths cannot route through them — every floor in
// a v2 dungeon is a voronoi membrane. That exclusion removes the flat
// bottom as a routing hub, so v2 pockets are also RAMPIER than the walker's
// (rampFrac 0.5, jitterY 0.4): descent happens on tilted membranes, the
// way the user wants the whole world to read. Every size gained a
// sub-layer of foam below, and the entrance is the roomiest top-layer
// chamber of the LARGEST connected region (a merely-roomy chamber can sit
// in an isolated pocket).
//
// v2 → v3: TRAPDOOR PASSAGES. A trapdoor is a floor tile whose membrane
// opens: you drop into the chamber directly beneath it (the floor face's
// other cell — geometrically real). The landing is off-dungeon foam, and a
// certified corkscrew of SECRET rooms climbs from there until it surfaces
// through a HATCH in the floor of a different path room. One-way down,
// two-way hatch, provably navigable — a tunnel through foam the main
// dungeon never uses, not a branch.
//
// v3 → v4: LOOPS. The kernel's oracle was always loop-agnostic (a BFS
// distance field tolerates any number of shortest paths); it was this
// layer that flattened the dungeon to a tree by keeping one wayfound path
// per endpoint — and the tree is TIGHT: the union of shortest paths uses
// essentially every certified edge among its rooms, so loops cannot come
// from unlocking existing membranes. v4 rolls DETOURS instead: alternate
// routes through off-dungeon foam connecting rooms whose door-graph
// distance is ≥3, added as ordinary visible rooms (`loop: true`), every
// door on the detour tagged — endpoints gain genuinely multiple paths.
export const DUNGEON_VERSION = 4;

// Dungeon sizes: pocket dimensions by name. Part of the permalink (the
// `size` hash param; absent = 'm'). xl generation can take a few seconds
// when the certificate rerolls salts.
export const SIZES = {
  s:  { nx: 5,  nz: 5,  layers: 3, subLayers: 2 },
  m:  { nx: 7,  nz: 7,  layers: 4, subLayers: 3 },
  l:  { nx: 9,  nz: 9,  layers: 5, subLayers: 3 },
  xl: { nx: 11, nz: 11, layers: 6, subLayers: 3 },
};

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
    size = 'm',
    pocket: given = null,
    ...pocketOpts
  } = opts;
  // Dungeon pockets are rampier than the walker's (rampFrac 0.5 — descent
  // must happen on tilted membranes once the flat bottom is excluded), and
  // the kernel's PUZZLE band is relaxed with deep salt retries: the dungeon
  // proves its own reachability below, so the puzzle only needs to exist,
  // not to be a good puzzle. Worst observed generation ~12s at xl.
  const pocket = given ?? generatePocket({
    seed: 1, rampFrac: 0.5, parMin: 1, parTarget: 5, maxSalt: 96,
    ...(SIZES[size] ?? SIZES.m), ...pocketOpts,
  });
  // the size a given pocket actually has wins over the size argument
  const sizeName = Object.entries(SIZES).find(([, v]) =>
    v.nx === pocket.opts.nx && v.nz === pocket.opts.nz &&
    v.layers === pocket.opts.layers && v.subLayers === pocket.opts.subLayers)?.[0] ?? 'custom';
  const { nodes, edges, cells } = pocket;

  // Flat-floored basins — any floor face on the domain boundary — are not
  // dungeon rooms: the box bottom reads as an artificial plane in a world
  // that is otherwise all membranes. Drop them and every edge through them;
  // the sub-foam below the dungeon absorbs them.
  const isFlat = nodes.map((n) => n.faces.some((fi) => pocket.faces[fi].boundary));
  const adj = nodes.map(() => []);
  for (const e of edges) {
    if (isFlat[e.a] || isFlat[e.b]) continue;
    adj[e.a].push(e); adj[e.b].push(e);
  }

  const floor = nodes.map((n) => basinFloor(pocket, n));
  const floorY = (ni) => floor[ni].centroid[1];

  // the entrance: the roomiest top-surface chamber of the LARGEST connected
  // region of the (flat-excluded) crossing graph. Roominess alone can pick
  // a chamber in an isolated pocket; component size first, floor area
  // second. (v1 used the puzzle's certified target basin, which could open
  // the dungeon in a one-tile closet; every door is a certified crossing
  // either way, and the dungeon's own BFS below proves connectivity.)
  const L = pocket.opts.layers + pocket.opts.subLayers;
  let entrance = pocket.nav.target;
  {
    const comp = new Array(nodes.length).fill(-1);
    let nc = 0;
    for (let s = 0; s < nodes.length; s++) {
      if (comp[s] >= 0 || !adj[s].length) continue;
      const q = [s]; comp[s] = nc;
      for (let h = 0; h < q.length; h++) {
        for (const e of adj[q[h]]) {
          const v = e.a === q[h] ? e.b : e.a;
          if (comp[v] < 0) { comp[v] = nc; q.push(v); }
        }
      }
      nc++;
    }
    const compSize = new Array(nc).fill(0);
    for (const c of comp) if (c >= 0) compSize[c]++;
    let bestC = -1, bestA = -1;
    for (let ni = 0; ni < nodes.length; ni++) {
      if (cells[nodes[ni].cell].layer !== L - 1 || comp[ni] < 0) continue;
      const cs = compSize[comp[ni]];
      if (cs > bestC || (cs === bestC && floor[ni].area > bestA)) {
        bestC = cs; bestA = floor[ni].area; entrance = ni;
      }
    }
  }

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
  // -- v4: LOOPS. The union of shortest paths from one entrance uses
  //    essentially every certified edge among its rooms — a tree with no
  //    slack. Real loops need NEW rooms: an alternate route through
  //    off-dungeon foam connecting two rooms whose door-graph distance is
  //    ≥4, giving endpoints genuinely multiple paths. Loop rooms are
  //    ordinary visible rooms (`loop: true`); every door on the detour is
  //    tagged `loop: true`.
  const loops = [];
  {
    const rngL = mulberry(fnv(0x100950, pocket.seed >>> 0, rooms.length));
    const doorAdj = new Map(rooms.map((r) => [r.id, r.doors.map((d) => d.to)]));
    const doorDist = (src, dst) => {
      const dist = new Map([[src, 0]]);
      const q = [src];
      for (let h = 0; h < q.length; h++) {
        if (q[h] === dst) return dist.get(dst);
        for (const v of doorAdj.get(q[h]) ?? []) {
          if (!dist.has(v)) { dist.set(v, dist.get(q[h]) + 1); q.push(v); }
        }
      }
      return Infinity;
    };
    const want = 1 + (rngL() < 0.6 ? 1 : 0);
    const starts = rooms.filter((r) => !r.isEntrance && r.endpointIndex < 0);
    for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(rngL() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
    for (const R1 of starts) {
      if (loops.length >= want) break;
      // BFS from R1 through OFF-dungeon basins only; dungeon rooms are
      // terminals — the first far-enough one ends the detour
      const prevE = new Map([[R1.id, null]]);
      const depthB = new Map([[R1.id, 0]]);
      const q = [R1.id];
      let hit = null;
      for (let h = 0; h < q.length && !hit; h++) {
        const u = q[h];
        if (depthB.get(u) > 9) continue;
        for (const e of adj[u]) {
          const v = e.a === u ? e.b : e.a;
          if (prevE.has(v)) continue;
          if (roomOf.has(v)) {
            if (v !== R1.id && depthB.get(u) >= 1 && !roomOf.get(v).secret && doorDist(R1.id, v) >= 3) {
              prevE.set(v, { from: u, e });
              hit = v;
              break;
            }
            continue;
          }
          prevE.set(v, { from: u, e });
          depthB.set(v, depthB.get(u) + 1);
          q.push(v);
        }
      }
      if (hit === null) continue;
      const chain = [];
      for (let u = hit; u !== R1.id; u = prevE.get(u).from) chain.push(u);
      chain.push(R1.id); chain.reverse();            // R1 … hit
      const span = doorDist(R1.id, hit);
      for (let ci = 1; ci + 1 < chain.length; ci++) {
        const ni = chain[ci];
        const r = touch(ni);
        r.loop = true;
        if (r.depth < 0) r.depth = roomOf.get(R1.id).depth + ci;
        r.tiles = discretizeRoom(pocket, nodes[ni], tileShape, tileSize);
        doorAdj.set(ni, []);
      }
      for (let ci = 1; ci < chain.length; ci++) {
        const { e } = prevE.get(chain[ci]);
        for (const [me, other] of [[chain[ci - 1], chain[ci]], [chain[ci], chain[ci - 1]]]) {
          const r = roomOf.get(me);
          if (r.doors.some((x) => x.face === e.face)) continue;
          const dt = nearestTile(r.tiles, e.at[0], e.at[2]);
          if (dt.kind === 'floor') dt.kind = 'door';
          r.doors.push({ face: e.face, to: other, at: e.at.slice(), tile: dt.key, loop: true });
          doorAdj.get(me).push(other);
        }
      }
      loops.push({ rooms: [R1.id, hit], via: chain.slice(1, -1), span, detour: chain.length - 1 });
    }
  }

  // -- v3: trapdoor passages. For up to two rolled path rooms, find a floor
  //    tile whose underside chamber holds a non-dungeon basin, then a
  //    certified corkscrew from that landing through OFF-DUNGEON basins that
  //    surfaces under the floor of a DIFFERENT path room (the hatch). The
  //    whole passage becomes secret rooms with real certified doors; the
  //    drop is one-way, the hatch two-way. Deterministic; a map with no
  //    viable passage simply has none.
  const trapdoors = [];
  {
    const rngT = mulberry(fnv(0x7DA9D0, pocket.seed >>> 0, nodes.length));
    const want = 1 + (rngT() < 0.5 ? 1 : 0);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rngT() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const basinsOfCell = new Map();
    nodes.forEach((n, i) => {
      if (!basinsOfCell.has(n.cell)) basinsOfCell.set(n.cell, []);
      basinsOfCell.get(n.cell).push(i);
    });
    // a dungeon-room floor tile directly above cell `c` (the hatch exit)
    const hatchInto = (c, excludeRoom) => {
      for (const r of rooms) {
        if (r.id === excludeRoom || r.secret) continue;
        for (const ty of r.tiles) {
          const fy = pocket.faces[ty.face];
          if (fy.b < 0 || ty.kind !== 'floor') continue;
          if ((fy.a === nodes[r.id].cell ? fy.b : fy.a) === c) return { room: r, tile: ty };
        }
      }
      return null;
    };
    const candRooms = shuffle(rooms.filter((r) => !r.isEntrance && r.endpointIndex < 0 && r.depth >= 2));
    for (const R of candRooms) {
      if (trapdoors.length >= want * 2) break;   // 2 records (drop + hatch) per passage
      const tiles = shuffle(R.tiles.filter((t) => t.kind === 'floor'));
      let made = false;
      for (const t of tiles) {
        if (made) break;
        const f = pocket.faces[t.face];
        if (f.b < 0) continue;
        const below = f.a === nodes[R.id].cell ? f.b : f.a;
        const Ls = (basinsOfCell.get(below) ?? []).filter((ni) => !isFlat[ni] && !roomOf.has(ni) && floor[ni].area >= 3);
        if (!Ls.length) continue;
        let L = Ls[0];
        for (const ni of Ls) if (floor[ni].area > floor[L].area) L = ni;
        // corkscrew BFS from the landing through off-dungeon basins only
        const prevE = new Map([[L, null]]);
        const depth = new Map([[L, 0]]);
        const q = [L];
        let exit = null;
        for (let h = 0; h < q.length && !exit; h++) {
          const S = q[h];
          if (depth.get(S) >= 2 && depth.get(S) <= 14) {
            const hx = hatchInto(nodes[S].cell, R.id);
            if (hx) { exit = { S, ...hx }; break; }
          }
          for (const e of adj[S]) {
            const v = e.a === S ? e.b : e.a;
            if (!prevE.has(v) && !roomOf.has(v)) { prevE.set(v, { from: S, e }); depth.set(v, depth.get(S) + 1); q.push(v); }
          }
        }
        if (!exit) continue;
        // materialize the passage: chain L → … → exit.S as secret rooms
        const chain = [];
        for (let u = exit.S; u !== null; u = prevE.get(u)?.from ?? null) chain.push(u);
        chain.reverse();                          // L first
        for (let i = 0; i < chain.length; i++) {
          const r = touch(chain[i]);
          r.secret = true;
          r.depth = R.depth + 1 + i;
          r.tiles = discretizeRoom(pocket, nodes[chain[i]], tileShape, tileSize);
        }
        // certified doors along the chain
        for (let i = 1; i < chain.length; i++) {
          const { e } = prevE.get(chain[i]);
          for (const [me, other] of [[chain[i - 1], chain[i]], [chain[i], chain[i - 1]]]) {
            const r = roomOf.get(me);
            if (!r.doors.some((x) => x.face === e.face)) r.doors.push({ face: e.face, to: other, at: e.at.slice() });
          }
        }
        for (const ni of chain) {
          const r = roomOf.get(ni);
          for (const d of r.doors) {
            const dt = nearestTile(r.tiles, d.at[0], d.at[2]);
            if (dt.kind === 'floor') dt.kind = 'door';
            d.tile = dt.key;
          }
        }
        // the drop and the hatch
        const Lr = roomOf.get(L);
        const land = nearestTile(Lr.tiles, t.x, t.z);
        t.kind = 'trapdoor';
        trapdoors.push({ kind: 'trapdoor', fromRoom: R.id, fromTile: t.key, toRoom: L, toTile: land.key,
          drop: Math.round((t.y - land.y) * 10) / 10 });
        const Sr = roomOf.get(exit.S);
        const bottom = nearestTile(Sr.tiles, exit.tile.x, exit.tile.z);
        if (bottom.kind === 'floor') bottom.kind = 'hatch';
        exit.tile.kind = 'hatch';
        trapdoors.push({ kind: 'hatch', fromRoom: exit.S, fromTile: bottom.key, toRoom: exit.room.id, toTile: exit.tile.key,
          drop: Math.round((exit.tile.y - bottom.y) * 10) / 10 });
        made = true;
      }
    }
  }
  rooms.sort((a, b) => a.depth - b.depth || a.id - b.id);

  return {
    pocket, entrance, endpoints: picked, paths, rooms, roomOf, trapdoors, loops,
    tileShape, tileScale, tileSize, size: sizeName,
    requestedEndpoints: wantEndpoints,
  };
}
