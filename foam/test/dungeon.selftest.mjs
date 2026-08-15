// foam/test/dungeon.selftest.mjs — pins the dungeon layer's contract.
//
// Everything the /dungeon/ page leans on is asserted here: determinism,
// endpoint rolling, path validity over the certified crossing graph, the
// descent rule, and both discretizations at more than one scale.
//
// Run: node foam/test/dungeon.selftest.mjs

import { generateDungeon, discretizeRoom } from '../dungeon.mjs';
import { pointInPolyXZ } from '../foamworld.js';

let checks = 0, failures = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + label); }
}

const SEEDS = [1, 2, 5];
const t0 = Date.now();

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
