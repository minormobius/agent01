// chunkgen.js — v8 milestone 1: the off-thread generation boundary.
//
// Wraps the v7 foam kernel into ONE pure function, solveChunk(), that returns a fully SERIALIZABLE
// record (plain objects + typed arrays) — the contract a Web Worker (or, later, a Rust/WASM module)
// posts back. Nothing here touches the DOM, so it runs identically in the worker, on the main thread
// (fallback), and in node (tests).
//
// Streaming-ready determinism: each chunk is generated over JUST its own region, but the foam lives
// on a GLOBAL world-space lattice (v7 buildFoam), so two neighbouring chunks generated completely
// independently still share identical boundary nuclei — they abut seamlessly with distinct cells on
// each side, joined only at the inherited ports. That independence is what lets a world stream chunk
// by chunk without ever rebuilding a union.

import { buildFoam, defineChunk, perfuse, seize, paintRooms, castCharacter } from '../v7/foam.js';

export const DEFAULTS = { cellSize: 16, depth: 2.4, oxygenReach: 3, concourseWidth: 2, roomSize: 16, shape: 'hex', W: 900, H: 600 };

function bbox(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const v of poly) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); } return { x0, y0, x1, y1 }; }

// Solve one chunk → a serializable record. `poly` null = the centred chunk #0 (region = canvas);
// otherwise the chunk is generated over its own bbox and `inherit` carries the shared-edge ports.
export function solveChunk(opts = {}) {
  const o = { ...DEFAULTS, ...opts }, seed = (o.seed ?? 1) >>> 0;
  const region = o.poly ? bbox(o.poly) : { x0: 0, y0: 0, x1: o.W, y1: o.H };
  const foam = buildFoam({ regions: [region], cellSize: o.cellSize, depth: o.depth, seed, W: o.W, H: o.H });
  const def = defineChunk(foam, { seed, poly: o.poly, inherit: o.inherit || [], shape: o.poly ? null : (o.shape === 'auto' ? null : o.shape) });
  const sol = seize(foam, def, { oxygenReach: o.oxygenReach, concourseWidth: o.concourseWidth, seed });
  const rm = paintRooms(foam, def, sol, { roomSize: o.roomSize, seed });
  const cast = castCharacter(rm.rooms, { seed });

  // pack interior cells into a compact LOCAL index space, with poly-edge neighbour labels in LOCAL ids
  const interior = def.interior, local = new Map(); interior.forEach((cid, i) => local.set(cid, i));
  const srcToCell = new Map(); for (const c of foam.cells) srcToCell.set(c.src, c.id);
  const cells = interior.map((cid) => {
    const c = foam.cells[cid];
    const poly = c.poly.map((v) => { const nb = v.s >= 0 ? srcToCell.get(v.s) : -1; const lb = nb != null && local.has(nb) ? local.get(nb) : -1; return [v.x, v.y, lb]; });
    return { x: c.x, y: c.y, gid: c.gid, poly };
  });
  const road = new Uint8Array(interior.length), roomOf = new Int32Array(interior.length).fill(-1);
  interior.forEach((cid, i) => { if (sol.road[cid]) road[i] = 1; roomOf[i] = rm.roomOf[cid]; });
  const adj = cells.map(() => []);
  for (const e of foam.edges) { const a = local.get(e.a), b = local.get(e.b); if (a != null && b != null) { adj[a].push(b); adj[b].push(a); } }
  const rooms = cast.rooms.map((r) => {
    const door = r.door >= 0 ? local.get(r.door) : -1, doorRoad = r.doorRoad >= 0 ? local.get(r.doorRoad) : -1;
    const doorPairs = [];
    if (door >= 0 && doorRoad >= 0) {
      doorPairs.push([door, doorRoad]);
      // widen the doorway to ~two cells: a same-room neighbour of the door cell that also fronts the
      // concourse, nearest the door — opened too, so the opening reads as a doorway not a slit
      let best = -1, bestRoad = -1, bd = Infinity;
      for (const nb of foam.adj[r.door]) { if (rm.roomOf[nb] !== r.id) continue; for (const rd of foam.adj[nb]) if (sol.road[rd]) { const d = (foam.cells[nb].x - foam.cells[r.door].x) ** 2 + (foam.cells[nb].y - foam.cells[r.door].y) ** 2; if (d < bd) { bd = d; best = nb; bestRoad = rd; } break; } }
      if (best >= 0 && local.has(best) && local.has(bestRoad)) doorPairs.push([local.get(best), local.get(bestRoad)]);
    }
    return { cells: r.cells.map((c) => local.get(c)), door, doorRoad, doorPairs, x: r.x, y: r.y, role: r.role, glyph: r.glyph, color: r.color, domain: r.domain, people: r.people };
  });
  const ports = def.ports.map((p) => ({ x: p.x, y: p.y, edge: p.edge, inherited: !!p.inherited, cell: local.get(p.cell) }));
  return { poly: def.poly, shape: def.shape, region, cells, adj, road, roomOf, rooms, ports, served: sol.servedFrac, cellSize: foam.cellSize };
}
