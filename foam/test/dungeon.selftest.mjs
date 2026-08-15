// foam/test/dungeon.selftest.mjs — pins the dungeon layer's contract.
//
// Everything the /dungeon/ page leans on is asserted here: determinism,
// endpoint rolling, path validity over the certified crossing graph, the
// descent rule, and both discretizations at more than one scale.
//
// Run: node foam/test/dungeon.selftest.mjs

import { generateDungeon, discretizeRoom } from '../dungeon.mjs';
import { dungeonToJSON, dungeonToUVTT, roomOutlines, uniqueDoors, planBounds } from '../dungeon-export.mjs';
import { buildCrawl, crawlReachability, crawlReport } from '../dungeon-crawl.mjs';
import { pointInPolyXZ } from '../foamworld.js';

let checks = 0, failures = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + label); }
}

const SEEDS = [1, 2, 5];
const t0 = Date.now();

// -- GOLDEN PERMALINK PINS. A published permalink is (DUNGEON_VERSION, seed,
//    endpoints, shape, scale) → this exact dungeon. These signatures are the
//    canonical JSON of known seeds, hashed; if a change to generation or
//    discretization shifts one, that change breaks every published permalink
//    — either revert it, or consciously bump DUNGEON_VERSION in dungeon.mjs
//    and re-pin. Never re-pin without the bump.
{
  const { DUNGEON_VERSION } = await import('../dungeon.mjs');
  ok(DUNGEON_VERSION === 1, 'golden pins below are for DUNGEON_VERSION 1');
  const GOLDEN = { 1: 0x1e73d61d, 2: 0xccc95c48, 5: 0xd2cdbe57 };
  const sigOf = (s) => {
    const str = JSON.stringify(dungeonToJSON(generateDungeon({ seed: s, endpoints: 3, tileShape: 'grid', tileScale: 0.35 })));
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  for (const [s, want] of Object.entries(GOLDEN)) {
    const got = sigOf(Number(s));
    ok(got === want, `permalink pin seed ${s}: 0x${got.toString(16)} == 0x${want.toString(16)}`);
  }
}

for (const seed of SEEDS) {
  console.log(`seed ${seed}`);
  const d = generateDungeon({ seed, endpoints: 3, tileShape: 'grid', tileScale: 0.35 });
  const { pocket, entrance, endpoints, paths, rooms, roomOf } = d;

  // -- determinism: identical run → identical dungeon skeleton + tiles
  {
    const d2 = generateDungeon({ seed, endpoints: 3, tileShape: 'grid', tileScale: 0.35 });
    const sig = (x) => JSON.stringify({
      e: x.entrance, ends: x.endpoints,
      p: x.paths.map((p) => ({ e: p.endpoint, r: p.rooms, d: p.doors.map((q) => q.face) })),
      t: x.rooms.map((r) => [r.id, r.tiles.map((t) => t.key + ':' + t.kind).join('|')]),
    });
    ok(sig(d) === sig(d2), 'deterministic');
  }

  // -- entrance is the certified top-surface chamber
  const L = pocket.opts.layers + pocket.opts.subLayers;
  ok(pocket.cells[pocket.nodes[entrance].cell].layer === L - 1, 'entrance on the top layer');

  // -- endpoints: as many as asked, distinct, none the entrance, all below it
  ok(endpoints.length === 3, `rolled 3 endpoints (got ${endpoints.length})`);
  ok(new Set(endpoints).size === endpoints.length, 'endpoints distinct');
  ok(!endpoints.includes(entrance), 'no endpoint at the entrance');
  const eY = rooms.find((r) => r.isEntrance).floorY;
  for (const e of endpoints) {
    ok(roomOf.get(e).floorY < eY, `endpoint ${e} lies below the entrance`);
  }

  // -- each path: starts at the entrance, ends at its endpoint, every hop is
  //    a real certified crossing between the recorded rooms, shortest by
  //    door count (strictly one door closer per hop)
  const adj = pocket.nodes.map(() => []);
  for (const e of pocket.edges) { adj[e.a].push(e); adj[e.b].push(e); }
  for (const p of paths) {
    ok(p.rooms[0] === entrance, 'path starts at entrance');
    ok(p.rooms[p.rooms.length - 1] === p.endpoint, 'path ends at its endpoint');
    ok(p.doors.length === p.rooms.length - 1, 'one door per hop');
    let valid = true, shortest = true;
    // distance-to-endpoint for the shortest check
    const dT = new Array(pocket.nodes.length).fill(-1);
    dT[p.endpoint] = 0;
    const q = [p.endpoint];
    for (let h = 0; h < q.length; h++) {
      for (const e of adj[q[h]]) {
        const v = e.a === q[h] ? e.b : e.a;
        if (dT[v] < 0) { dT[v] = dT[q[h]] + 1; q.push(v); }
      }
    }
    for (let i = 0; i < p.doors.length; i++) {
      const door = p.doors[i];
      if (door.from !== p.rooms[i] || door.to !== p.rooms[i + 1]) valid = false;
      const e = adj[door.from].find((x) => x.face === door.face);
      const other = e ? (e.a === door.from ? e.b : e.a) : -1;
      if (other !== door.to) valid = false;
      if (dT[p.rooms[i + 1]] !== dT[p.rooms[i]] - 1) shortest = false;
    }
    ok(valid, 'every door is a certified crossing between its rooms');
    ok(shortest, 'path is shortest in doors');
    // the descent rule: at each hop the chosen next room lies lowest among
    // the equally-short alternatives
    let steepest = true;
    for (let i = 0; i < p.doors.length; i++) {
      const u = p.rooms[i], v = p.rooms[i + 1];
      const yOf = (ni) => roomOf.has(ni) ? roomOf.get(ni).floorY : null;
      for (const e of adj[u]) {
        const w = e.a === u ? e.b : e.a;
        if (w === v || dT[w] !== dT[u] - 1) continue;
        // alternative w exists — v must not lie strictly above it. Only
        // rooms on paths carry floorY here; recompute for w from faces.
        let a = 0, y = 0;
        for (const fi of pocket.nodes[w].faces) { const f = pocket.faces[fi]; a += f.area; y += f.centroid[1] * f.area; }
        const wy = a > 0 ? y / a : Infinity;
        if (yOf(v) !== null && yOf(v) > wy + 1e-9) steepest = false;
      }
    }
    ok(steepest, 'descent rule: no equally-short lower alternative skipped');
  }

  // -- rooms: exactly the union of path rooms; every room has tiles; every
  //    tile centre is truly inside one of the room's floor polygons and its
  //    height matches that face's plane
  const unionRooms = new Set();
  for (const p of paths) for (const r of p.rooms) unionRooms.add(r);
  ok(rooms.length === unionRooms.size, 'rooms = union of path rooms');
  for (const r of rooms) {
    ok(r.tiles.length >= 1, `room ${r.id} has tiles`);
    let inside = true, heights = true;
    for (const t of r.tiles) {
      const f = pocket.faces[t.face];
      if (t.key !== 'c' && !pointInPolyXZ(f.verts, t.x, t.z)) inside = false;
      const nc = f.n[0] * f.centroid[0] + f.n[1] * f.centroid[1] + f.n[2] * f.centroid[2];
      const fy = (nc - f.n[0] * t.x - f.n[2] * t.z) / f.n[1];
      if (Math.abs(fy - t.y) > 1e-6) heights = false;
      if (!pocket.nodes[r.id].faces.includes(t.face)) inside = false;
    }
    ok(inside, `room ${r.id}: tile centres inside its own floor`);
    ok(heights, `room ${r.id}: tile heights on the floor plane`);
    // every door of the room resolved to a tile on the lattice
    ok(r.doors.every((d) => r.tiles.some((t) => t.key === d.tile)), `room ${r.id}: doors snapped to tiles`);
  }
  ok(rooms.some((r) => r.tiles.some((t) => t.kind === 'entrance')), 'entrance tile marked');
  ok(rooms.filter((r) => r.endpointIndex >= 0).length === endpoints.length, 'each endpoint owns a room');

  // -- tile DENSITY: tiles must roughly fill the floor at every scale, in
  //    both shapes — a room several tile-areas big may never collapse to the
  //    single fallback tile (the hex q-band bug starved far-z rooms to 1)
  for (const [shape, scale] of [['grid', 0.35], ['hex', 0.35], ['hex', 0.25]]) {
    const dd = generateDungeon({ pocket, endpoints: 3, tileShape: shape, tileScale: scale });
    const tArea = shape === 'hex'
      ? (Math.sqrt(3) / 2) * dd.tileSize * dd.tileSize
      : dd.tileSize * dd.tileSize;
    let thin = 0, fallback = 0;
    for (const r of dd.rooms) {
      const expect = r.area / tArea;
      if (expect >= 3 && r.tiles.length < expect * 0.4) thin++;
      if (expect >= 3 && r.tiles.some((t) => t.key === 'c')) fallback++;
    }
    ok(fallback === 0, `${shape}@${scale}: no big room on the fallback tile (${fallback})`);
    ok(thin === 0, `${shape}@${scale}: no big room under 40% tile coverage (${thin})`);
  }

  // -- hex + a coarser scale, over the SAME pocket (the retile path the
  //    page's controls use — must not need regeneration)
  for (const [shape, scale] of [['hex', 0.35], ['grid', 0.7], ['hex', 0.2]]) {
    const dd = generateDungeon({ pocket, endpoints: 3, tileShape: shape, tileScale: scale });
    ok(dd.entrance === entrance && JSON.stringify(dd.endpoints) === JSON.stringify(endpoints),
      `retile ${shape}@${scale}: skeleton unchanged`);
    for (const r of dd.rooms) {
      ok(r.tiles.length >= 1, `retile ${shape}@${scale}: room ${r.id} has tiles`);
      ok(r.doors.every((d) => r.tiles.some((t) => t.key === d.tile)),
        `retile ${shape}@${scale}: room ${r.id} doors snapped`);
    }
    if (shape === 'hex') {
      const r0 = dd.rooms[0];
      ok(r0.tiles.every((t) => t.key === 'c' || (Number.isInteger(t.q) && Number.isInteger(t.r))),
        'hex tiles carry axial coords');
    }
  }

  // -- EXPORT layer, both shapes: canonical JSON + UVTT
  for (const shape of ['grid', 'hex']) {
    const dd = generateDungeon({ pocket, endpoints: 3, tileShape: shape, tileScale: 0.35 });

    // outlines: closed loops that enclose every tile centre of their room
    for (const r of dd.rooms) {
      const loops = roomOutlines(dd, r);
      ok(loops.length >= 1, `${shape}: room ${r.id} has an outline`);
      ok(loops.every((L) => L.length >= 4 &&
        L[0][0] === L[L.length - 1][0] && L[0][1] === L[L.length - 1][1]),
        `${shape}: room ${r.id} outlines closed`);
      // point-in-polygon over the loop set: every tile centre inside an odd
      // number of loops (outer boundary, possibly minus holes)
      const inLoop = (L, x, z) => {
        let inside = false;
        for (let i = 0, j = L.length - 2; i < L.length - 1; j = i++) {
          if ((L[i][1] > z) !== (L[j][1] > z) &&
              x < ((L[j][0] - L[i][0]) * (z - L[i][1])) / (L[j][1] - L[i][1]) + L[i][0]) inside = !inside;
        }
        return inside;
      };
      ok(r.tiles.every((tl) => loops.filter((L) => inLoop(L, tl.x, tl.z)).length % 2 === 1),
        `${shape}: room ${r.id} outline encloses its tiles`);
    }

    // canonical JSON: structure, determinism, JSON-round-trip
    const J = dungeonToJSON(dd);
    ok(J.format === 'foam-dungeon' && J.version === 1, `${shape}: canonical format header`);
    ok(J.rooms.length === dd.rooms.length && J.paths.length === 3, `${shape}: canonical rooms/paths`);
    ok(J.rooms.every((r) => r.outline.length >= 1 && r.tiles.length >= 1 &&
      typeof r.tiles[0].y === 'number'), `${shape}: canonical rooms carry outline + tiles with heights`);
    ok(J.doors.length === uniqueDoors(dd).length &&
      J.doors.every((d) => d.rooms.length === 2), `${shape}: canonical doors unique, two-sided`);
    const J2 = dungeonToJSON(generateDungeon({ pocket, endpoints: 3, tileShape: shape, tileScale: 0.35 }));
    ok(JSON.stringify(J) === JSON.stringify(J2), `${shape}: canonical export deterministic`);
    ok(JSON.parse(JSON.stringify(J)).rooms.length === J.rooms.length, `${shape}: canonical survives round-trip`);

    // UVTT: geometry in grid units, everything inside the map window
    const U = dungeonToUVTT(dd);
    ok(U.format === 0.3 && U.resolution.pixels_per_grid === 64, `${shape}: uvtt header`);
    const { x: gw, y: gh } = U.resolution.map_size;
    ok(Number.isInteger(gw) && Number.isInteger(gh) && gw > 4 && gh > 4, `${shape}: uvtt map size sane`);
    const inMap = (p) => p.x >= 0 && p.x <= gw && p.y >= 0 && p.y <= gh;
    ok(U.line_of_sight.length >= dd.rooms.length, `${shape}: uvtt walls cover every room`);
    ok(U.line_of_sight.every((w) => w.every(inMap)), `${shape}: uvtt walls inside the map`);
    ok(U.portals.length === uniqueDoors(dd).length, `${shape}: uvtt one portal per door`);
    ok(U.portals.every((p) => inMap(p.position) && p.bounds.length === 2 && p.bounds.every(inMap)),
      `${shape}: uvtt portals inside the map`);
    const b = planBounds(dd);
    ok(b.x1 > b.x0 && b.z1 > b.z0, `${shape}: plan bounds sane`);
  }

  // -- CRAWL layer: the tile-step graph over the canonical document must
  //    carry a walker from the entrance tile to every endpoint, both shapes,
  //    with the forced (out-of-reach) bridge essentially never needed
  for (const shape of ['grid', 'hex']) {
    const J = dungeonToJSON(generateDungeon({ pocket, endpoints: 3, tileShape: shape, tileScale: 0.35 }));
    const rep = crawlReport(J);
    ok(rep.complete, `crawl ${shape}: entrance reaches all ${rep.endpointsTotal} endpoints on foot`);
    ok(rep.allRoomsReachable, `crawl ${shape}: every room enterable`);
    ok(rep.forcedBridges <= 1, `crawl ${shape}: forced bridges ≤1 (${rep.forcedBridges})`);
    const crawl = buildCrawl(J);
    // every door transit is symmetric and lands on a real tile
    for (const [ri, room] of crawl.rooms) {
      for (const d of room.doors) {
        ok(d.farTile !== null && crawl.rooms.get(d.to).byKey.has(d.farTile),
          `crawl ${shape}: door ${ri}→${d.to} lands on a real tile`);
        const back = crawl.rooms.get(d.to).doors.find((x) => x.face === d.face);
        ok(back && back.farTile === d.tile, `crawl ${shape}: door ${ri}→${d.to} transits back`);
      }
    }
    // steps honour the height gate (bridges exempt, they are the scramble)
    const R0 = crawl.rooms.get(crawl.startRoom);
    let gated = true;
    for (const [k, ns] of R0.adj) {
      for (const nk of ns) {
        const a = R0.byKey.get(k), b = R0.byKey.get(nk);
        // lattice neighbours only — a bridge pair may exceed the gate
        const latticeDist = Math.hypot(a.x - b.x, a.z - b.z);
        if (latticeDist <= J.tile.size * 1.05 && Math.abs(a.y - b.y) > crawl.dyMax + 1e-9) gated = false;
      }
    }
    ok(gated, `crawl ${shape}: lattice steps honour the height gate`);
  }

  // -- one endpoint / five endpoints both roll
  const d1 = generateDungeon({ pocket, endpoints: 1 });
  ok(d1.endpoints.length === 1 && d1.paths.length === 1, 'a single endpoint rolls');
  const d5 = generateDungeon({ pocket, endpoints: 5 });
  ok(d5.endpoints.length === 5 && new Set(d5.endpoints).size === 5, 'five endpoints roll distinct');

  console.log(`  entrance ${entrance} → endpoints [${endpoints.join(', ')}], ` +
    `${rooms.length} rooms, par ${paths.map((p) => p.doors.length).join('/')}`);
}

console.log(`\n${checks} checks, ${failures} failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (failures) process.exit(1);
console.log('DUNGEON SELFTEST PASS');
