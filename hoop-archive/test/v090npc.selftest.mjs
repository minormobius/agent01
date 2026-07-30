// v090npc.selftest.mjs — the living residents: the social web turned into commuting sprite agents.
// Run: node hoop/test/v090npc.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, buildWalk } from '../v8/manager.js';
import { paintChunk } from '../v090/skin.js';
import { buildSociety, buildResidents, stepResidents, dirKey } from '../v090/npc.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const DIRS = new Set(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

// a two-chunk world so commutes can cross rooms (and, in principle, chunks)
const world = createWorld();
const A = solveChunk({ seed: 7, shape: 'hex' }); A.seed = 7; A.painted = paintChunk(A); addChunk(world, A);
const spec = neighbourSpec(world, 0, 0); const B = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit }); B.seed = 31; B.painted = paintChunk(B); addChunk(world, B);
const walk = buildWalk(world);

// 1. the social web: dwellings link to a workplace + (some) a third place, nodes carry a stable gid
const soc = buildSociety(world, walk);
ok(soc.rooms.length > 10 && soc.rooms.every((r) => typeof r.gid === 'string' && r.doorG >= 0), `society has ${soc.rooms.length} rooms, each with a stable gid + door node`);
ok(soc.edges.some((e) => e.kind === 'work') && soc.edges.some((e) => e.kind === 'third'), 'dwellings link to work and third places');
ok(soc.routes.length > 0 && soc.routes.every((rt) => rt.cells.length > 1), `${soc.routes.length} ambient commute routes are real graph paths`);

// 2. residents: one agent per named person, roled to their JOB, with a commute loop + a sprite genome
const agents = buildResidents(world, walk, soc);
ok(agents.length > 0, `${agents.length} residents were cast from the dwellings`);
ok(agents.every((a) => a.route.length >= 2 && a.genome && Array.isArray(a.genome.cells)), 'each resident has a ≥2-stop route and a seed-stable sprite genome');
const jobbed = agents.filter((a) => a.workKey).every((a) => a.genome.role === a.workKey.role);
ok(jobbed, 'a working resident\'s sprite is roled to their workplace (the resident-role override)');
const A2 = buildResidents(world, walk, buildSociety(world, walk));
ok(A2.length === agents.length && A2[0].genome.glyph === agents[0].genome.glyph && A2[0].id === agents[0].id, 'residents are deterministic from the world');

// 3. they MOVE: stepping advances positions along the walk graph; dwell makes them pause
const start = agents.map((a) => ({ x: a.x, y: a.y }));
let moved = 0;
for (let t = 0; t < 400; t++) stepResidents(agents, walk, 16, { cx: A.region.x0 + 200, cy: A.region.y0 + 200, radius: 1e9 });
for (let i = 0; i < agents.length; i++) if (Math.hypot(agents[i].x - start[i].x, agents[i].y - start[i].y) > 1) moved++;
ok(moved > agents.length * 0.3, `residents commute (${moved}/${agents.length} moved over ~6s of sim)`);
ok(agents.every((a) => DIRS.has(a.dir)), 'each resident faces a valid 8-way direction');
ok(dirKey(1, 0) === 'E' && dirKey(0, 1) === 'S' && dirKey(0, -1) === 'N' && dirKey(-1, 0) === 'W', 'dirKey maps vectors to compass dirs');

// 4. the radius cull freezes far residents (cheap when off-screen)
const far = buildResidents(world, walk, soc); const fStart = far.map((a) => ({ x: a.x, y: a.y }));
for (let t = 0; t < 200; t++) stepResidents(far, walk, 16, { cx: 1e7, cy: 1e7, radius: 100 });
ok(far.every((a, i) => a.x === fStart[i].x && a.y === fStart[i].y), 'residents outside the sim radius stay frozen');

console.log(`\nv090 residents: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
