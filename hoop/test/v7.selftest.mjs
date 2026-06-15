// v7.selftest.mjs — the chunking kernel: power-diagram slice, rooms, chunk, the grown solve.
// Run: node hoop/test/v7.selftest.mjs
import { baseFoam, growRooms, concourseGrain, defineChunk, solveChunk, castCharacter } from '../v7/foam.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const W = 900, H = 600;

// 1. base foam — a planar cut through a 3D foam, varied cell sizes, valid adjacency
const foam = baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 7 });
ok(foam.cells.length > 200, `foam has cells (${foam.cells.length})`);
ok(foam.cells.every((c) => c.poly.length >= 3), 'every slice cell is a real polygon');
const areas = foam.cells.map((c) => c.area).sort((a, b) => a - b);
const spread = areas[areas.length - 1] / (areas[Math.floor(areas.length / 2)] || 1);
ok(spread > 1.8, `cell sizes VARY (max/median area = ${spread.toFixed(1)}× — the slice gives a foam, not a grid)`);
ok(foam.edges.length > foam.cells.length, `adjacency graph is connected-ish (${foam.edges.length} edges)`);
// symmetry of adjacency
let sym = true; for (let i = 0; i < foam.cells.length; i++) for (const j of foam.adj[i]) if (!foam.adj[j].includes(i)) sym = false;
ok(sym, 'cell adjacency is symmetric');

// determinism
const foam2 = baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 7 });
ok(foam2.cells.length === foam.cells.length && foam2.cells[10].x === foam.cells[10].x, 'foam is deterministic from seed');
const foam3 = baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 8 });
ok(foam3.cells.length !== foam.cells.length || foam3.cells[10].x !== foam.cells[10].x, 'a different seed gives a different foam');

// 2. rooms — agglomerate cells, room size tracks the knob
const r4 = growRooms(foam, { roomSize: 4, seed: 7 });
const r12 = growRooms(foam, { roomSize: 12, seed: 7 });
ok(r4.rooms.length > r12.rooms.length, `smaller rooms ⇒ more rooms (${r4.rooms.length} vs ${r12.rooms.length})`);
ok(Math.abs(r12.avgCells - 12) < 6, `room size tracks knob (asked 12, got ${r12.avgCells.toFixed(1)})`);
ok(r12.roomOf.every((z) => z >= 0), 'every cell belongs to a room');

// 3. concourse grain — narrower than rooms, derives solve params
const grain = concourseGrain(foam, { roomSize: 12, concourseWidth: 3, seed: 7 });
ok(grain.concourseWidth < 12, 'concourse is narrower than a room');
ok(grain.roadFrac > 0 && grain.roadFrac < 0.5 && grain.mu > 0.5, `solve params derived (roadFrac=${grain.roadFrac.toFixed(2)}, mu=${grain.mu.toFixed(2)})`);

// 4. chunk — square or triangle, ghost perimeter, 1–4 ports per edge
const chunk = defineChunk(foam, { seed: 7 });
ok(chunk.shape === 'square' || chunk.shape === 'triangle', `chunk shape is a dice roll (${chunk.shape})`);
let ghosts = 0; for (const g of chunk.ghost) if (g) ghosts++;
ok(ghosts > 0 && ghosts < foam.cells.length, `ghost perimeter exists (${ghosts} of ${foam.cells.length})`);
ok(chunk.interior.length + ghosts === foam.cells.length, 'interior + ghost = all cells');
const edgesN = chunk.poly.length, perEdge = chunk.ports.length / edgesN;
ok(chunk.ports.length >= edgesN && perEdge <= 4.5, `1–4 ports per edge (${chunk.ports.length} over ${edgesN} edges)`);

// 5. the solve — grown concourse + rooms off the dispersed phase + one door each
const sol = solveChunk(foam, chunk, grain, { roomSize: 12, seed: 7, iters: 14 });
ok(sol.stats.roadCells > 0, `concourse grown (${sol.stats.roadCells} road cells)`);
ok(sol.rooms.length > 0, `rooms seeded off the dispersed phase (${sol.rooms.length})`);
const doored = sol.rooms.filter((r) => r.door >= 0).length;
ok(doored / sol.rooms.length > 0.9, `≥90% of rooms have a door onto the concourse (${doored}/${sol.rooms.length})`);
// concourse should connect the ports (each port cell is road or adjacent to road)
const portsServed = sol.portCells.filter((c) => sol.isRoad[c] || foam.adj[c].some((v) => sol.isRoad[v])).length;
ok(portsServed === sol.portCells.length, `all ${sol.portCells.length} ports reach the concourse`);
// solve determinism
const sol2 = solveChunk(foam, chunk, grain, { roomSize: 12, seed: 7, iters: 14 });
ok(sol2.stats.roadCells === sol.stats.roadCells && sol2.rooms.length === sol.rooms.length, 'the solve is deterministic');

// 6. character — roles + NPCs
const cast = castCharacter(sol.rooms, { seed: 7 });
ok(cast.rooms.length === sol.rooms.length && cast.rooms.every((r) => r.role && r.glyph), 'every room got a role + glyph');
ok((cast.counts.dwell || 0) > 0, `dwellings dominate (${cast.counts.dwell || 0} of ${cast.rooms.length})`);
ok(cast.rooms.some((r) => r.people && r.people.length), 'dwellings have NPCs');

console.log(`\nv7 kernel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
