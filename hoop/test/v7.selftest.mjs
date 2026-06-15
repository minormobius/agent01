// v7.selftest.mjs — the chunking kernel: power-diagram slice, chunk, perfuse, hypoxia seize, rooms.
// Run: node hoop/test/v7.selftest.mjs
import { baseFoam, defineChunk, perfuse, seize, paintRooms, castCharacter } from '../v7/foam.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const W = 900, H = 600;

// 1. base foam — a planar cut through a 3D foam, varied cell sizes, valid symmetric adjacency
const foam = baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 7 });
ok(foam.cells.length > 200, `foam has cells (${foam.cells.length})`);
ok(foam.cells.every((c) => c.poly.length >= 3), 'every slice cell is a real polygon');
const areas = foam.cells.map((c) => c.area).sort((a, b) => a - b);
ok(areas[areas.length - 1] / (areas[areas.length >> 1] || 1) > 1.8, 'cell sizes VARY (a foam, not a grid)');
let sym = true; for (let i = 0; i < foam.cells.length; i++) for (const j of foam.adj[i]) if (!foam.adj[j].includes(i)) sym = false;
ok(sym, 'cell adjacency is symmetric');
const foam2 = baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 7 });
ok(foam2.cells.length === foam.cells.length && foam2.cells[10].x === foam.cells[10].x, 'foam is deterministic');
ok(baseFoam({ W, H, cellSize: 26, depth: 2.4, seed: 8 }).cells[10].x !== foam.cells[10].x, 'a different seed differs');

// 2. chunk — square OR equilateral triangle, ghost perimeter, 1–4 ports/edge
const chunk = defineChunk(foam, { seed: 7 });
ok(chunk.shape === 'square' || chunk.shape === 'triangle', `chunk shape is a dice roll (${chunk.shape})`);
ok(chunk.poly.length === (chunk.shape === 'square' ? 4 : 3), 'square=4 verts, triangle=3 verts');
let ghosts = 0; for (const g of chunk.ghost) if (g) ghosts++;
ok(ghosts > 0 && chunk.interior.length + ghosts === foam.cells.length, 'ghost perimeter + interior = all cells');
ok(chunk.ports.length >= chunk.poly.length && chunk.ports.length / chunk.poly.length <= 4.5, `1–4 ports/edge (${chunk.ports.length})`);

// 3. perfuse — ports connected into one skeleton, oxygenation measured, but barely perfused
const per = perfuse(foam, chunk, { oxygenReach: 3 });
ok(per.stats.roadCells > 0, `port skeleton laid (${per.stats.roadCells} cells)`);
ok(per.stats.hypoxic > 0, `the bare skeleton leaves tissue hypoxic (${per.stats.hypoxic}) — motivates the seize`);

// 4. seize — hypoxia growth lifts oxygenation hard while staying a minority of the floor
const sol = seize(foam, chunk, { oxygenReach: 3, seed: 7 });
ok(sol.servedFrac > per.servedFrac + 0.1, `seize raises oxygenation (${(per.servedFrac * 100) | 0}% → ${(sol.servedFrac * 100) | 0}%)`);
ok(sol.servedFrac > 0.9, `well perfused after seize (${(sol.servedFrac * 100) | 0}%)`);
ok(sol.stats.roadFrac < 0.5, `concourse is a minority of the floor (${(sol.stats.roadFrac * 100) | 0}%) — not big blocks`);
ok(sol.sprouts > 3, `capillaries actually branched (${sol.sprouts} sprouts)`);
// the concourse must be a SINGLE connected component (walkable end to end) — a core need
function concourseComponents(foam, chunk, road) { const seen = new Set(); let c = 0; for (const i of chunk.interior) { if (!road[i] || seen.has(i)) continue; c++; const q = [i]; seen.add(i); while (q.length) { const u = q.pop(); for (const v of foam.adj[u]) if (road[v] && !seen.has(v)) { seen.add(v); q.push(v); } } } return c; }
ok(concourseComponents(foam, chunk, sol.road) === 1, `the concourse is ONE connected component (got ${concourseComponents(foam, chunk, sol.road)})`);
// single-headed widening: width 3 is meaningfully thicker than width 1, but not 2× per step
const w1 = seize(foam, chunk, { oxygenReach: 3, concourseWidth: 1, seed: 7 }), w3 = seize(foam, chunk, { oxygenReach: 3, concourseWidth: 3, seed: 7 });
ok(w3.stats.roadCells > w1.stats.roadCells, `wider concourse seizes more cells (w1 ${w1.stats.roadCells} → w3 ${w3.stats.roadCells})`);
ok(concourseComponents(foam, chunk, w3.road) === 1, 'a widened concourse stays one component');
const s2 = seize(foam, chunk, { oxygenReach: 3, seed: 7 });
ok(s2.stats.roadCells === sol.stats.roadCells, 'the seize is deterministic');

// 5. rooms — many bounded pockets (NOT one giant blob), one door each
const rm = paintRooms(foam, chunk, sol, { roomSize: 10, seed: 7 });
ok(rm.rooms.length > 8, `tissue partitioned into many rooms (${rm.rooms.length}) — no single dominant blob`);
const biggest = Math.max(...rm.rooms.map((r) => r.cells.length)), totalTissue = rm.rooms.reduce((s, r) => s + r.cells.length, 0);
ok(biggest / totalTissue < 0.35, `no room dominates (biggest is ${((biggest / totalTissue) * 100) | 0}% of tissue)`);
ok(rm.stats.doored / rm.rooms.length > 0.9, `≥90% of rooms have a door onto the concourse (${rm.stats.doored}/${rm.rooms.length})`);
// every room's door cell really is concourse-adjacent
const doorsValid = rm.rooms.every((r) => r.door < 0 || (sol.road[r.doorRoad] && foam.adj[r.door].includes(r.doorRoad)));
ok(doorsValid, 'each door is a genuine room-cell → concourse-cell pair');

// rooms scale with the knob
const rmBig = paintRooms(foam, chunk, sol, { roomSize: 24, seed: 7 });
ok(rmBig.rooms.length < rm.rooms.length, `bigger room-size ⇒ fewer rooms (${rmBig.rooms.length} vs ${rm.rooms.length})`);

// 6. character
const cast = castCharacter(rm.rooms, { seed: 7 });
ok(cast.rooms.length === rm.rooms.length && cast.rooms.every((r) => r.role && r.glyph), 'every room got a role + glyph');
ok((cast.counts.dwell || 0) > 0 && cast.rooms.some((r) => r.people && r.people.length), 'dwellings exist and hold NPCs');

console.log(`\nv7 kernel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
