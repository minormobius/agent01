// foam/test/dungeon.selftest.mjs — pins the dungeon layer's contract.
//
// Everything the /dungeon/ page leans on is asserted here: determinism,
// endpoint rolling, path validity over the certified crossing graph, the
// descent rule, and both discretizations at more than one scale.
//
// Run: node foam/test/dungeon.selftest.mjs

import { generateDungeon, discretizeRoom } from '../dungeon.mjs';
import { dungeonToJSON, dungeonToUVTT, roomOutlines, uniqueDoors, planBounds } from '../dungeon-export.mjs';
import { buildCrawl, crawlReachability, crawlReport, reachableWithin } from '../dungeon-crawl.mjs';
import { pointInPolyXZ } from '../foamworld.js';

let checks = 0, failures = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + label); }
}

const SEEDS = [1, 2, 5];
const t0 = Date.now();

// -- GOLDEN PERMALINK PINS. A published permalink is (DUNGEON_VERSION, seed,
//    endpoints, shape, scale, size) → this exact LAYOUT. The signature hashes
//    the geometry-bearing parts of the canonical export (entrance, endpoints,
//    rooms, doors, paths) — metadata additions to the generator block do not
//    shift it. If a change to generation or discretization moves one of
//    these, that change reshuffles every published permalink — either revert
//    it, or consciously bump DUNGEON_VERSION in dungeon.mjs and re-pin.
//    Never re-pin a moved layout without the bump.
{
  const { DUNGEON_VERSION } = await import('../dungeon.mjs');
  ok(DUNGEON_VERSION === 4, 'golden pins below are for DUNGEON_VERSION 4');
  const GOLDEN = { 1: 0xc6c94931, 2: 0xbf94806e, 5: 0x3dc99152 };
  const sigOf = (s) => {
    const J = dungeonToJSON(generateDungeon({ seed: s, endpoints: 3, tileShape: 'grid', tileScale: 0.35 }));
    const str = JSON.stringify({ e: J.entrance, n: J.endpoints, r: J.rooms, d: J.doors, p: J.paths, t: J.trapdoors });
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

  // -- v2: no flat ground anywhere — no room's floor touches the domain
  //    boundary; every surface a crawler stands on is a voronoi membrane
  ok(rooms.every((r) => pocket.nodes[r.id].faces.every((fi) => !pocket.faces[fi].boundary)),
    'no room stands on the domain box (all floors are membranes)');

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
  const extraCount = rooms.filter((r) => r.secret || r.loop).length;
  ok(rooms.length === unionRooms.size + extraCount,
    'rooms = path union + secret passages + loop detours');
  ok(rooms.every((r) => unionRooms.has(r.id) || r.secret || r.loop),
    'non-path rooms are secret or loop');
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
    const { DUNGEON_VERSION } = await import('../dungeon.mjs');
    const J = dungeonToJSON(dd);
    ok(J.format === 'foam-dungeon' && J.version === DUNGEON_VERSION, `${shape}: canonical format header`);
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

  // -- v3 trapdoor passages: paired records, marked tiles, certified
  //    corkscrews — and the whole dungeon (secret rooms included) reachable
  {
    const J = dungeonToJSON(generateDungeon({ pocket, endpoints: 3, tileShape: 'grid', tileScale: 0.35 }));
    const byId = new Map(J.rooms.map((r) => [r.id, r]));
    const drops = J.trapdoors.filter((t) => t.kind === 'trapdoor');
    const hatches = J.trapdoors.filter((t) => t.kind === 'hatch');
    ok(drops.length === hatches.length, `trapdoors paired with hatches (${drops.length}/${hatches.length})`);
    for (const td of drops) {
      const from = byId.get(td.fromRoom), to = byId.get(td.toRoom);
      ok(from && !from.secret && from.role === 'room', `trapdoor from an ordinary path room (${td.fromRoom})`);
      ok(to && to.secret, `trapdoor lands in a secret room (${td.toRoom})`);
      ok(from.tiles.find((t) => t.key === td.fromTile)?.kind === 'trapdoor', 'trapdoor tile marked');
      ok(to.tiles.some((t) => t.key === td.toTile), 'landing tile exists');
      ok(td.drop > 0, `the drop drops (${td.drop}m)`);
    }
    for (const h of hatches) {
      ok(byId.get(h.fromRoom)?.secret && !byId.get(h.toRoom)?.secret, `hatch climbs out of the secret rooms (${h.fromRoom}→${h.toRoom})`);
      ok(byId.get(h.toRoom).tiles.find((t) => t.key === h.toTile)?.kind === 'hatch', 'hatch exit tile marked');
    }
    const secrets = J.rooms.filter((r) => r.secret);
    if (drops.length) {
      ok(secrets.length >= drops.length * 3, `corkscrews are corkscrews (${secrets.length} secret rooms for ${drops.length} passage(s))`);
      const crawl = buildCrawl(J);
      const reach = crawlReachability(crawl);
      ok(reach.roomsSeen.size === J.rooms.length, 'every room, secret ones included, reachable on foot');
      // the passage is not a typical branch: hatch surfaces in a DIFFERENT room
      for (let i = 0; i < drops.length; i++) {
        ok(hatches[i].toRoom !== drops[i].fromRoom, `passage ${i} re-enters elsewhere (${drops[i].fromRoom} → … → ${hatches[i].toRoom})`);
      }
      // content stays off the passage endpoints
      const { rollContent } = await import('../dungeon-content.mjs');
      const C = rollContent(J, { roll: 1 });
      const reserved = new Set(J.trapdoors.flatMap((t) => [t.fromRoom + ':' + t.fromTile, t.toRoom + ':' + t.toTile]));
      ok(![...C.effects, ...C.agents].some((x) => reserved.has(x.room + ':' + x.tile)), 'content stays off trapdoor endpoints');
    }
  }

  // -- v4 LOOPS: detours through off-dungeon foam giving endpoints multiple
  //    paths — junctions far apart door-wise, loop rooms visible + flagged,
  //    and cutting the primary route's door still leaves the loop's far
  //    junction reachable (the whole point of a loop)
  {
    const J = dungeonToJSON(generateDungeon({ pocket, endpoints: 3, tileShape: 'grid', tileScale: 0.35 }));
    const byId = new Map(J.rooms.map((r) => [r.id, r]));
    for (const L of J.loops) {
      const [a, b] = L.rooms;
      ok(byId.has(a) && byId.has(b) && !byId.get(a).secret && !byId.get(b).secret,
        `loop ${a}↔${b}: junctions are ordinary rooms`);
      ok(L.span >= 3, `loop ${a}↔${b}: span ${L.span} ≥ 3`);
      ok(L.via.every((v) => byId.get(v)?.loop), `loop ${a}↔${b}: detour rooms flagged`);
      ok(byId.get(a).doors.some((d) => d.loop) && byId.get(b).doors.some((d) => d.loop),
        `loop ${a}↔${b}: junction doors tagged`);
      // multiple paths, provably: a→b still connects when THIS loop's
      // detour rooms are deleted from the graph (the other route exists),
      // and connects through the detour when it is present
      const viaSet = new Set(L.via);
      const reach = (skipVia) => {
        const seen = new Set([a]);
        const q = [a];
        for (let h = 0; h < q.length; h++) {
          for (const d of byId.get(q[h]).doors) {
            if (skipVia && viaSet.has(d.to)) continue;
            if (!seen.has(d.to)) { seen.add(d.to); q.push(d.to); }
          }
        }
        return seen.has(b);
      };
      ok(reach(true), `loop ${a}↔${b}: another route exists without this detour`);
      ok(reach(false), `loop ${a}↔${b}: the detour route connects`);
    }
    if (J.loops.length) {
      const crawl = buildCrawl(J);
      ok(crawlReachability(crawl).roomsSeen.size === J.rooms.length,
        'loop rooms crawlable with everything else');
    }
  }

  // -- movement budget: reachableWithin is a metric over the crawl graph —
  //    costs ≤ budget, monotone in budget, and at par with full BFS
  {
    const J = dungeonToJSON(generateDungeon({ pocket, endpoints: 3, tileShape: 'hex', tileScale: 0.35 }));
    const crawl = buildCrawl(J);
    const r5 = reachableWithin(crawl, crawl.startRoom, crawl.startTile, 5);
    const r10 = reachableWithin(crawl, crawl.startRoom, crawl.startTile, 10);
    ok([...r5.values()].every((c) => c <= 5), 'move range 5: all costs within budget');
    ok(r5.get(crawl.startRoom + ':' + crawl.startTile) === 0, 'move range: start costs 0');
    ok(r10.size >= r5.size, 'move range monotone in budget');
    ok([...r5].every(([k, c]) => r10.get(k) === c), 'costs stable as budget grows');
    const reach = crawlReachability(crawl);
    const rBig = reachableWithin(crawl, crawl.startRoom, crawl.startTile, 10000);
    ok(rBig.size === reach.seen.size, 'unbounded move range equals full reachability');
    // neighbours are exactly the budget-1 range minus the start
    const r1 = reachableWithin(crawl, crawl.startRoom, crawl.startTile, 1);
    const nbr = crawl.rooms.get(crawl.startRoom).adj.get(crawl.startTile).length +
      crawl.rooms.get(crawl.startRoom).doors.filter((d) => d.tile === crawl.startTile && d.farTile !== null).length;
    ok(r1.size === 1 + nbr, 'move range 1 = neighbours + start');
  }

  // -- one endpoint / five endpoints both roll
  const d1 = generateDungeon({ pocket, endpoints: 1 });
  ok(d1.endpoints.length === 1 && d1.paths.length === 1, 'a single endpoint rolls');
  const d5 = generateDungeon({ pocket, endpoints: 5 });
  ok(d5.endpoints.length === 5 && new Set(d5.endpoints).size === 5, 'five endpoints roll distinct');

  console.log(`  entrance ${entrance} → endpoints [${endpoints.join(', ')}], ` +
    `${rooms.length} rooms, par ${paths.map((p) => p.doors.length).join('/')}`);
}

// -- CONTENT rolls: a separate deterministic pass on top of a finished map
{
  const { rollContent, contentBlocked, ENEMY_TYPES, CONTENT_VERSION } = await import('../dungeon-content.mjs');
  const { layoutSignature } = await import('../dungeon-export.mjs');
  for (const seed of SEEDS) {
    for (const shape of ['grid', 'hex']) {
      const J = dungeonToJSON(generateDungeon({ seed, endpoints: 3, tileShape: shape, tileScale: 0.35 }));
      const tilesByRoom = new Map(J.rooms.map((r) => [r.id, new Map(r.tiles.map((t) => [t.key, t]))]));
      for (const roll of [1, 2, 7]) {
        const C = rollContent(J, { roll });
        ok(C.format === 'foam-dungeon-content' && C.version === CONTENT_VERSION && C.roll === roll,
          `content ${seed}/${shape}/${roll}: header`);
        ok(C.mapSig === layoutSignature(J), `content ${seed}/${shape}/${roll}: bound to the map`);
        // determinism + rolls actually differ
        ok(JSON.stringify(rollContent(J, { roll })) === JSON.stringify(C), `content ${seed}/${shape}/${roll}: deterministic`);
        // one thing per tile, everything on real tiles, markers reserved
        const spots = new Set();
        let collide = false, offMap = false, onMarker = false;
        for (const x of [...C.effects, ...C.agents]) {
          const k = x.room + ':' + x.tile;
          if (spots.has(k)) collide = true;
          spots.add(k);
          const t = tilesByRoom.get(x.room)?.get(x.tile);
          if (!t) offMap = true;
          else if (t.kind !== 'floor' && !(x.type === 'treasure' && t.kind === 'goal')) onMarker = true;
        }
        ok(!collide, `content ${seed}/${shape}/${roll}: one thing per tile`);
        ok(!offMap, `content ${seed}/${shape}/${roll}: everything on real tiles`);
        ok(!onMarker, `content ${seed}/${shape}/${roll}: markers reserved (treasure-on-goal excepted)`);
        // entrance safe, endpoints furnished
        const entrance = J.rooms.find((r) => r.role === 'entrance');
        const hostileAtEntrance =
          C.agents.some((a) => a.room === entrance.id) ||
          C.effects.some((e) => e.room === entrance.id && (e.type === 'trap' || e.type === 'obstacle'));
        ok(!hostileAtEntrance, `content ${seed}/${shape}/${roll}: entrance room safe`);
        for (const er of J.rooms.filter((r) => r.role === 'endpoint')) {
          ok(C.effects.some((e) => e.room === er.id && e.type === 'treasure'), `content ${seed}/${shape}/${roll}: treasure at endpoint ${er.id}`);
          // guardian in the room — or on its threshold when the room is all markers
          const near = new Set([er.id, ...er.doors.map((d) => d.to)]);
          ok(C.agents.some((a) => near.has(a.room)), `content ${seed}/${shape}/${roll}: guardian at endpoint ${er.id}`);
        }
        // the safety gate held: obstacles never sever the dungeon
        const rep = crawlReport(J, { blocked: contentBlocked(C) });
        ok(rep.complete && rep.allRoomsReachable, `content ${seed}/${shape}/${roll}: obstacles never sever the dungeon`);
        // agent types are known
        ok(C.agents.every((a) => ENEMY_TYPES[a.type] && a.hp === ENEMY_TYPES[a.type].hp), `content ${seed}/${shape}/${roll}: agents typed`);
      }
      const a = JSON.stringify(rollContent(J, { roll: 1 })), b = JSON.stringify(rollContent(J, { roll: 2 }));
      ok(a !== b, `content ${seed}/${shape}: different rolls differ`);
    }
  }
}

// -- CONTENT TUNING (v2 content): dials move the roll the way they claim
{
  const { rollContent, contentBlocked, DEFAULT_TUNING, tuningToParam, tuningFromParam } = await import('../dungeon-content.mjs');
  const J = dungeonToJSON(generateDungeon({ seed: 5, endpoints: 3, tileShape: 'hex', tileScale: 0.35 }));
  const count = (C, t) => C.effects.filter((e) => e.type === t).length;
  const base = rollContent(J, { roll: 1 });
  const { CONTENT_VERSION } = await import('../dungeon-content.mjs');
  ok(base.version === CONTENT_VERSION && JSON.stringify(base.tuning) === JSON.stringify(DEFAULT_TUNING),
    'content records its version + tuning; omitted tuning = defaults');
  ok(JSON.stringify(rollContent(J, { roll: 1, tuning: { ...DEFAULT_TUNING } })) === JSON.stringify(base),
    'explicit default tuning identical to omitted');
  const hot = rollContent(J, { roll: 1, tuning: { traps: 2, enemies: 2 } });
  const cold = rollContent(J, { roll: 1, tuning: { traps: 0.2, enemies: 0.2 } });
  ok(count(hot, 'trap') > count(cold, 'trap'), `traps dial works (${count(hot, 'trap')} > ${count(cold, 'trap')})`);
  ok(hot.agents.length > cold.agents.length, `enemies dial works (${hot.agents.length} > ${cold.agents.length})`);
  const noObst = rollContent(J, { roll: 1, tuning: { obstacles: 0 } });
  ok(count(noObst, 'obstacle') === 0, 'obstacles at 0 = none');
  ok(JSON.stringify(rollContent(J, { roll: 1, tuning: { traps: 2, enemies: 2 } })) === JSON.stringify(hot),
    'tuned rolls deterministic');
  // the DIRECTION: mean depth of enemies shifts with the gradient
  const maxD = Math.max(...J.rooms.map((r) => r.depth));
  const meanDepth = (C) => {
    const byId = new Map(J.rooms.map((r) => [r.id, r]));
    const ds = C.agents.map((a) => byId.get(a.room).depth / maxD);
    return ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length);
  };
  const deep = meanDepth(rollContent(J, { roll: 1, tuning: { gradient: 1 } }));
  const door = meanDepth(rollContent(J, { roll: 1, tuning: { gradient: -1 } }));
  ok(deep > door, `danger direction flips with the gradient (mean depth ${deep.toFixed(2)} vs ${door.toFixed(2)})`);
  // toughness shifts the type bands
  const tough = rollContent(J, { roll: 1, tuning: { toughness: 2 } });
  const soft = rollContent(J, { roll: 1, tuning: { toughness: 0.2 } });
  const wraiths = (C) => C.agents.filter((a) => a.type === 'wraith').length;
  const mites = (C) => C.agents.filter((a) => a.type === 'mite').length;
  ok(wraiths(tough) >= wraiths(soft) && mites(soft) >= mites(tough),
    `toughness shifts the bands (wraiths ${wraiths(tough)}≥${wraiths(soft)}, mites ${mites(soft)}≥${mites(tough)})`);
  // safety gate holds under extreme rubble — and WALLS NEVER PARTITION:
  // every room's free tiles stay one component, bridges are computed from
  // geometry alone (the apex-to-apex wall hop a human crawler found)
  const rubble = rollContent(J, { roll: 1, tuning: { obstacles: 2 } });
  const rep = crawlReport(J, { blocked: contentBlocked(rubble) });
  ok(rep.complete && rep.allRoomsReachable, 'obstacles at 2: safety gate still holds');
  ok(rep.partitionedRoomIds.length === 0, 'obstacles at 2: no room partitioned');
  {
    const cFree = buildCrawl(J);
    const cBlk = buildCrawl(J, { blocked: contentBlocked(rubble) });
    let sameBridges = true, hop = false;
    for (const [rid, rf] of cFree.rooms) {
      const rb = cBlk.rooms.get(rid);
      if (rf.bridges !== rb.bridges || rf.forcedBridges !== rb.forcedBridges) sameBridges = false;
      // no surviving edge may touch a blocked tile
      const blk = contentBlocked(rubble);
      for (const [a, ns] of rb.adj) {
        if (blk.has(rid + ':' + a)) hop = true;
        for (const b of ns) if (blk.has(rid + ':' + b)) hop = true;
      }
    }
    ok(sameBridges, 'bridges are geometry-only — content cannot re-route them');
    ok(!hop, 'no step edge touches a wall tile');
  }
  for (const roll of [2, 5, 9]) {
    const C2 = rollContent(J, { roll, tuning: { obstacles: 2 } });
    const r2 = crawlReport(J, { blocked: contentBlocked(C2) });
    ok(r2.complete && r2.partitionedRoomIds.length === 0, `roll ${roll} heavy rubble: complete, unpartitioned`);
  }
  // v3: LINES MADE OF TILES — every obstacle/trap run is lattice-contiguous
  {
    const byId = new Map(J.rooms.map((r) => [r.id, r]));
    const lines = new Map();
    for (const e of base.effects) {
      if (e.line === undefined) continue;
      if (!lines.has(e.line)) lines.set(e.line, []);
      lines.get(e.line).push(e);
    }
    ok(lines.size > 4, `content lays lines (${lines.size} runs)`);
    let contiguous = true, mixed = false, spans = { full: 0, partial: 0 };
    for (const [, tiles] of lines) {
      spans[tiles[0].span]++;
      if (new Set(tiles.map((e) => e.type)).size > 1) mixed = true;
      if (tiles.length < 2) continue;
      const room = byId.get(tiles[0].room);
      const tl = tiles.map((e) => room.tiles.find((t) => t.key === e.tile));
      // each tile adjacent (lattice distance 1) to at least one other
      for (const a of tl) {
        const near = tl.some((b) => b !== a && (
          J.tile.shape === 'hex'
            ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].some(([dq, dr]) => b.q === a.q + dq && b.r === a.r + dr)
            : Math.abs(b.i - a.i) + Math.abs(b.j - a.j) === 1));
        if (!near) contiguous = false;
      }
    }
    ok(contiguous, 'every multi-tile run is lattice-contiguous');
    ok(!mixed, 'a run is one mechanism (no mixed types)');
    ok(spans.partial > 0, `partial lines rolled (${spans.partial})`);
    ok([...lines.values()].some((t) => t.length >= 3), 'some run reaches 3+ tiles');
  }
  // param round-trip
  ok(tuningToParam(DEFAULT_TUNING) === null, 'default tuning omits the hash param');
  const T = { loot: 0.5, traps: 2, obstacles: 0.3, enemies: 1.4, toughness: 1.8, gradient: -0.5 };
  ok(JSON.stringify(tuningFromParam(tuningToParam(T))) === JSON.stringify(T), 'tuning round-trips through the hash param');
}

// -- POLY TILINGS (penrose, ammann–beenker, sevenfold, rhombille, and the
//    Archimedean multi-shape tilings snub/kagome/rhombitri/truncsq): tiles
//    that carry their polygon, adjoin by shared edges, and behave as
//    first-class citizens of the whole stack
{
  const { rollContent, contentBlocked } = await import('../dungeon-content.mjs');
  const { roomOutlines, dungeonToUVTT } = await import('../dungeon-export.mjs');
  // species = distinct tile shapes; edge = edge length in units of tileSize
  // (the Archimedean multi-shape tilings are normalized to MEAN tile area
  // = tileSize², so their edges are shorter or longer than tileSize);
  // ngons = the vertex counts the tiling is allowed to contain
  const s3 = Math.sqrt(3), s2 = Math.SQRT2;
  const POLY = {
    penrose:   { species: 2, edge: 1, ngons: [4] },
    ammann:    { species: 2, edge: 1, ngons: [4] },
    seven:     { species: 3, edge: 1, ngons: [4] },
    rhombille: { species: 1, edge: 1, ngons: [4] },
    snub:      { species: 2, edge: Math.sqrt(6 / (2 * ((1 + s3) / 2) ** 2)), ngons: [3, 4] },
    kagome:    { species: 2, edge: Math.sqrt(3 / (2 * s3)), ngons: [3, 6] },
    rhombitri: { species: 3, edge: Math.sqrt(6 / ((1 + s3) ** 2 * s3 / 2)), ngons: [3, 4, 6] },
    truncsq:   { species: 2, edge: Math.sqrt(2 / (1 + s2) ** 2), ngons: [4, 8] },
  };
  for (const [shapeName, seed] of [['penrose', 1], ['penrose', 5], ['ammann', 5], ['seven', 5], ['rhombille', 5],
    ['snub', 5], ['kagome', 5], ['rhombitri', 5], ['truncsq', 5]]) {
    const d = generateDungeon({ seed, endpoints: 3, tileShape: shapeName, tileScale: 0.35 });
    const J = dungeonToJSON(d);
    const tag = shapeName + ' ' + seed;
    // determinism
    const J2 = dungeonToJSON(generateDungeon({ seed, endpoints: 3, tileShape: shapeName, tileScale: 0.35 }));
    ok(JSON.stringify(J) === JSON.stringify(J2), `${tag}: deterministic`);
    // tile geometry: polys of the allowed n-gon orders, every edge at the
    // shape's edge length, exactly the expected number of species
    const spec = POLY[shapeName];
    const areas = new Map();
    let polyOk = true, edgeOk = true;
    for (const r of J.rooms) {
      for (const t of r.tiles) {
        if (t.key === 'c') continue;
        if (!t.poly || !spec.ngons.includes(t.poly.length)) { polyOk = false; continue; }
        for (let i = 0; i < t.poly.length; i++) {
          const a = t.poly[i], b = t.poly[(i + 1) % t.poly.length];
          if (Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - spec.edge * J.tile.size) > 0.02) edgeOk = false;
        }
        let sh = 0;                                        // shoelace area
        for (let i = 0; i < t.poly.length; i++) {
          const a = t.poly[i], b = t.poly[(i + 1) % t.poly.length];
          sh += a[0] * b[1] - b[0] * a[1];
        }
        const bin = Math.round(Math.abs(sh / 2) / (J.tile.size * J.tile.size) * 8);  // tolerant binning
        areas.set(bin, (areas.get(bin) ?? 0) + 1);
      }
    }
    ok(polyOk, `${tag}: every tile is a ${spec.ngons.join('/')}-gon with its polygon`);
    ok(edgeOk, `${tag}: every tile edge = ${spec.edge.toFixed(3)}·tileSize`);
    ok(areas.size === spec.species, `${tag}: ${spec.species} tile species, got ${areas.size}`);
    // density + full crawlability through shared-edge adjacency
    const tiles = J.rooms.reduce((a, r) => a + r.tiles.length, 0);
    ok(tiles / J.rooms.length > 4, `${tag}: dense (${(tiles / J.rooms.length).toFixed(1)} rhombs/room)`);
    const crawl = buildCrawl(J);
    ok(crawlReachability(crawl).roomsSeen.size === J.rooms.length,
      `${tag}: every room walkable over shared-edge adjacency`);
    for (const r of J.rooms) {
      ok(r.doors.every((dd) => r.tiles.some((t) => t.key === dd.tile)), `${tag}: room ${r.id} doors snapped`);
    }
    // outlines close and enclose (drives plan walls + UVTT)
    let outOk = true;
    for (const r of d.rooms) {
      const loops = roomOutlines(d, r);
      if (!loops.length || !loops.every((L) => L.length >= 4 &&
        L[0][0] === L[L.length - 1][0] && L[0][1] === L[L.length - 1][1])) outOk = false;
    }
    ok(outOk, `${tag}: room outlines close`);
    const U = dungeonToUVTT(d);
    ok(U.line_of_sight.length >= J.rooms.length && U.portals.length > 0, `${tag}: UVTT export sane`);
    // content: angular lines lay, safety gate + never-partition hold
    const C = rollContent(J, { roll: 1 });
    const lineIds = new Set(C.effects.filter((e) => e.line !== undefined).map((e) => e.line));
    ok(lineIds.size > 3, `${tag}: content lines lay by angle (${lineIds.size} runs)`);
    const rep = crawlReport(J, { blocked: contentBlocked(C) });
    ok(rep.complete && rep.allRoomsReachable && rep.partitionedRoomIds.length === 0,
      `${tag}: content-safe, no partitions`);
    // retile over the same pocket: skeleton unchanged
    const dd = generateDungeon({ pocket: d.pocket, endpoints: 3, tileShape: 'grid', tileScale: 0.35 });
    ok(dd.entrance === d.entrance, `${tag}: skeleton survives retiling to grid`);
  }
}

// -- SIZES: every named size generates, stays crawlable, and reports itself
{
  const { SIZES } = await import('../dungeon.mjs');
  for (const name of Object.keys(SIZES)) {
    const d = generateDungeon({ seed: 9, endpoints: 3, tileShape: 'hex', tileScale: 0.35, size: name });
    ok(d.size === name, `size ${name}: reported on the dungeon`);
    const J = dungeonToJSON(d);
    ok(J.generator.size === name && J.generator.dims.nx === SIZES[name].nx,
      `size ${name}: canonical export carries size + dims`);
    const rep = crawlReport(J);
    ok(rep.complete && rep.allRoomsReachable, `size ${name}: fully crawlable (${rep.rooms} rooms)`);
    // retile with the pocket given: size inferred, not trusted from opts
    const d2 = generateDungeon({ pocket: d.pocket, endpoints: 3, tileShape: 'grid', tileScale: 0.5 });
    ok(d2.size === name, `size ${name}: inferred from a given pocket on retile`);
  }
  // finer tile scales: the new low end still tiles and crawls
  const d = generateDungeon({ seed: 9, endpoints: 3, tileShape: 'grid', tileScale: 0.1 });
  const rep = crawlReport(dungeonToJSON(d));
  ok(rep.complete, `tileScale 0.1: crawlable (${d.rooms.reduce((a, r) => a + r.tiles.length, 0)} tiles)`);
}

// -- TWIN DUNGEONS (the intertwined pair): two entrances whose dungeons
//    share one foam but provably never connect. Territories partition the
//    certified graph; every door, loop, trapdoor and corkscrew stays on
//    its own side; seams are the sealed membranes where the two touch
//    (galleries guarantee at least one certified-crossing seam); and the
//    crawl certificate proves each side complete from its own entrance
//    with zero leakage. `twin` absent = single mode, pinned above.
{
  const { rollContent, contentBlocked } = await import('../dungeon-content.mjs');
  const TWIN_GOLDEN = { 2: 0x7912e963, 5: 0x1f501ee4 };
  const twinSig = (J) => {
    const str = JSON.stringify({ e: J.entrance, n: J.endpoints, r: J.rooms, d: J.doors, p: J.paths, t: J.trapdoors, w: J.twin });
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  for (const seed of [2, 5]) {
    const d = generateDungeon({ seed, endpoints: 3, tileShape: 'grid', tileScale: 0.35, twin: true });
    const tag = `twin ${seed}`;
    ok(!!d.twin, `${tag}: twin planned`);
    const [eA, eB] = d.twin.entrances;
    ok(eA !== eB && eA === d.entrance, `${tag}: two distinct entrances, side 0 is json.entrance`);
    const L = d.pocket.opts.layers + d.pocket.opts.subLayers;
    ok([eA, eB].every((e) => d.pocket.cells[d.pocket.nodes[e].cell].layer === L - 1),
      `${tag}: both entrances on the top surface`);
    ok(d.rooms.every((r) => r.side === 0 || r.side === 1), `${tag}: every room takes a side`);
    ok(d.roomOf.get(eA).side === 0 && d.roomOf.get(eB).side === 1 &&
      d.roomOf.get(eA).isEntrance && d.roomOf.get(eB).isEntrance, `${tag}: entrance rooms marked`);
    // hard disjointness: nothing traversable crosses the frontier
    ok(d.rooms.every((r) => r.doors.every((dd) => d.roomOf.get(dd.to)?.side === r.side)),
      `${tag}: no door crosses sides`);
    ok(d.trapdoors.every((td) => d.roomOf.get(td.fromRoom).side === d.roomOf.get(td.toRoom).side),
      `${tag}: trapdoor passages stay on their side`);
    ok(d.loops.every((l) => [...l.rooms, ...l.via].every((ni) => d.roomOf.get(ni).side === d.roomOf.get(l.rooms[0]).side)),
      `${tag}: loop detours stay on their side`);
    // both sides fully provisioned
    for (const s of [0, 1]) {
      const ends = d.rooms.filter((r) => r.endpointIndex >= 0 && r.side === s);
      ok(ends.length === 3, `${tag}: side ${s} has 3 endpoints (got ${ends.length})`);
    }
    // seams: cross-side, sealed (never doors), and the galleries guarantee
    // at least one certified-crossing seam — a wall a body could walk
    // through, if only it opened
    ok(d.twin.seams.length >= 1 && d.twin.seams.some((s) => s.passable), `${tag}: ≥1 passable seam`);
    ok(d.twin.seams.every((s) => d.roomOf.get(s.rooms[0]).side === 0 && d.roomOf.get(s.rooms[1]).side === 1),
      `${tag}: seams connect side 0 to side 1`);
    const doorFaces = new Set(d.rooms.flatMap((r) => r.doors.map((dd) => dd.face)));
    ok(d.twin.seams.every((s) => !doorFaces.has(s.face)), `${tag}: no seam is a door`);
    // determinism + the crawl certificate
    const J = dungeonToJSON(d);
    const J2 = dungeonToJSON(generateDungeon({ seed, endpoints: 3, tileShape: 'grid', tileScale: 0.35, twin: true }));
    ok(JSON.stringify(J) === JSON.stringify(J2), `${tag}: deterministic`);
    ok(twinSig(J) === TWIN_GOLDEN[seed],
      `${tag}: twin golden signature (got 0x${twinSig(J).toString(16)}, pinned 0x${TWIN_GOLDEN[seed].toString(16)})`);
    const rep = crawlReport(J);
    ok(rep.complete && rep.allRoomsReachable && !rep.twin.leak,
      `${tag}: both sides complete from their own entrance, zero leakage`);
    ok(rep.twin.sides.every((s) => s.covered && s.leaked === 0 && s.endpointsReachable === 3),
      `${tag}: per-side certificate (${JSON.stringify(rep.twin.sides.map((s) => s.rooms))} rooms)`);
    // content rolls stay safe on twin documents
    const C = rollContent(J, { roll: 1 });
    const rep2 = crawlReport(J, { blocked: contentBlocked(C) });
    ok(rep2.complete && rep2.allRoomsReachable && rep2.partitionedRoomIds.length === 0,
      `${tag}: content-safe, no partitions`);
  }
  // a shape with poly tiles twins too
  const dp = generateDungeon({ seed: 5, endpoints: 2, tileShape: 'kagome', tileScale: 0.35, twin: true });
  const repP = crawlReport(dungeonToJSON(dp));
  ok(!!dp.twin && repP.complete && !repP.twin.leak, 'twin kagome: generates and certifies');
}

console.log(`\n${checks} checks, ${failures} failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (failures) process.exit(1);
console.log('DUNGEON SELFTEST PASS');
