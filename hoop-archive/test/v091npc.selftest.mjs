// v091npc.selftest.mjs — v091 residents: half-size, no-trample. Distinct in-room anchors + boids
// separation so commuters spread across a shared room instead of stacking on its doorway, and never
// pile on top of one another on the concourse.
// Run: node hoop/test/v091npc.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, buildWalk } from '../v8/manager.js';
import { paintChunk } from '../v091/skin.js';
import { buildSociety, buildResidents, stepResidents, dirKey } from '../v091/npc.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const DIRS = new Set(['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']);

const world = createWorld();
const A = solveChunk({ seed: 7, shape: 'hex' }); A.seed = 7; A.painted = paintChunk(A); addChunk(world, A);
const spec = neighbourSpec(world, 0, 0); const B = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit }); B.seed = 31; B.painted = paintChunk(B); addChunk(world, B);
const walk = buildWalk(world);
const soc = buildSociety(world, walk);

// 1. residents cast from the dwellings, roled to their job, with a sprite genome (carried from v090)
const agents = buildResidents(world, walk, soc);
ok(agents.length > 0, `${agents.length} residents were cast from the dwellings`);
ok(agents.every((a) => a.route.length >= 2 && a.genome && Array.isArray(a.genome.cells)), 'each resident has a ≥2-stop route + a seed-stable sprite genome');
ok(agents.filter((a) => a.workKey).every((a) => a.genome.role === a.workKey.role), 'a working resident is roled to their workplace');
const A2 = buildResidents(world, walk, buildSociety(world, walk));
ok(A2.length === agents.length && A2[0].id === agents[0].id && A2[0].route[0] === agents[0].route[0], 'residents (and their anchors) are deterministic from the world');

// 2. DISTINCT IN-ROOM ANCHORS — residents target an interior cell of each stop room, not its door
ok(agents.some((a) => a.route[0] !== a.homeKey.doorG), 'home anchors are interior cells, not the shared doorway (residents spread inside a room)');
ok(agents.every((a) => a.route.every((g) => g >= 0 && g < walk.N)), 'every anchor is a real walk node');
// a dwelling with several residents should NOT collapse them all onto one node
const byHome = new Map();
for (const a of agents) { let g = byHome.get(a.homeKey); if (!g) byHome.set(a.homeKey, g = []); g.push(a); }
const shared = [...byHome.values()].filter((g) => g.length > 1);
ok(shared.length === 0 || shared.some((g) => new Set(g.map((a) => a.route[0])).size > 1), 'co-resident commuters do not all share one home anchor');

// 3. they still MOVE, and they still face valid directions (separation is on by default)
const start = agents.map((a) => ({ x: a.x, y: a.y })); let moved = 0;
for (let t = 0; t < 400; t++) stepResidents(agents, walk, 16, { cx: A.region.x0 + 200, cy: A.region.y0 + 200, radius: 1e9, sep: 6, sepMax: 3.5 });
for (let i = 0; i < agents.length; i++) if (Math.hypot(agents[i].x - start[i].x, agents[i].y - start[i].y) > 1) moved++;
ok(moved > agents.length * 0.3, `residents commute (${moved}/${agents.length} moved over ~6s of sim)`);
ok(agents.every((a) => DIRS.has(a.dir)), 'each resident faces a valid 8-way direction');
ok(agents.every((a) => Math.hypot(a.sepx, a.sepy) <= 3.5 + 1e-6), 'the separation displacement is clamped to sepMax (can never shove a resident far through a wall)');
ok(dirKey(1, 0) === 'E' && dirKey(0, 1) === 'S' && dirKey(0, -1) === 'N' && dirKey(-1, 0) === 'W', 'dirKey maps vectors to compass dirs');

// 4. SEPARATION KERNEL — two residents stacked on the same point are pushed apart
const two = buildResidents(world, walk, soc).slice(0, 2);
ok(two.length === 2, 'have two residents to stack-test');
two.forEach((a) => { a.dwellLeft = 1e6; a.bx = 1000; a.by = 1000; a.x = 1000; a.y = 1000; });   // dwelling, perfectly coincident
stepResidents(two, walk, 16, { cx: 1000, cy: 1000, radius: 1e9, sep: 6, sepMax: 4 });
const apart = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y);
ok(apart > 0.5, `two stacked residents separate (now ${apart.toFixed(2)} units apart, not 0)`);

// 5. the radius cull still freezes far residents untouched (cheap when off-screen)
const far = buildResidents(world, walk, soc); const fStart = far.map((a) => ({ x: a.x, y: a.y }));
for (let t = 0; t < 200; t++) stepResidents(far, walk, 16, { cx: 1e7, cy: 1e7, radius: 100 });
ok(far.every((a, i) => a.x === fStart[i].x && a.y === fStart[i].y), 'residents outside the sim radius stay frozen');

console.log(`\nv091 residents: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
