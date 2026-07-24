// v093.selftest.mjs — THE SYNTHESIS. Proves v091's environmental half and v092's player-systems half
// coexist over one generated chunk: the upgraded engine grows traffic-sized rooms + voronoi wall
// fixtures + impassable nodes (v091), residents build/step/separate on that blocked walk graph (v091),
// AND the player-systems modules (stats / crew / pack — v092) load and stat the very same souls.
// Run: node mega/v093/test/v093.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, buildWalk, pathFind, nearestNode } from '../v8/manager.js';
import { paintChunk } from '../skin.js';
import { TRAFFIC_FOOTPRINT, HUB_ROLES, QUIET_ROLES, GRAND_ROLES, GRAND_MIN, MIN_ROOM, MAX_FIXTURE_AREA } from '../rooms.js';
import { buildSociety, buildResidents, stepResidents } from '../npc.js';
import { deriveCombat, TRIAD_ORDER } from '../stats.js';
import { crewStats } from '../crew.js';
import { startingPack } from '../pack.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const GEN = (s) => ({ seed: s, shape: 'hex', roomSize: 16, footprint: TRAFFIC_FOOTPRINT, grand: GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM });

// ── the v091 world, generated through v093's vendored (upgraded) engine ──────────────────────────────
const seeds = [7, 31, 101, 202, 303, 404];
const chunks = seeds.map((s) => { const r = solveChunk(GEN(s)); r.seed = s; r.painted = paintChunk(r, { fixtureArea: MAX_FIXTURE_AREA }); return r; });
const rooms = []; chunks.forEach((rec) => rec.rooms.forEach((r) => rooms.push({ role: r.role, n: r.cells.length })));

// 1. traffic-sized rooms — every room carries a role; hubs out-size quiet rooms; runts bulldozed
ok(rooms.length > 80, `sampled ${rooms.length} rooms across ${seeds.length} chunks`);
ok(rooms.every((r) => typeof r.role === 'string' && r.n > 0), 'every room carries a role + has cells (traffic sizing wired into v093 engine)');
const sizesOf = (set) => rooms.filter((r) => set.includes(r.role)).map((r) => r.n);
ok(mean(sizesOf(HUB_ROLES)) > mean(sizesOf(QUIET_ROLES)) * 1.2, `hubs out-size quiet rooms (${mean(sizesOf(HUB_ROLES)).toFixed(1)} vs ${mean(sizesOf(QUIET_ROLES)).toFixed(1)})`);
ok(rooms.filter((r) => r.n < MIN_ROOM).length === 0, `no micro-rooms survive (< ${MIN_ROOM} cells)`);

// 2. voronoi wall fixtures grow + stay within the area cap
const P0 = chunks[0].painted;
ok(Array.isArray(P0.fixtures) && P0.fixtures.length > 0, `v091 skin grows voronoi wall fixtures (${P0.fixtures && P0.fixtures.length})`);
ok(P0.fixtures.every((F) => F.roomArea > 0 && F.claimArea / F.roomArea <= MAX_FIXTURE_AREA + 0.15), 'fixtures stay within the area cap');

// 3. the central component EMITS — v091 carries emit/hue for the bloom the page paints
ok(P0.comps.length > 0 && P0.comps.every((c) => typeof c.emit === 'number' && typeof c.hue === 'number'), 'deco components carry emit/hue (self-emitting bloom)');

// ── impassable fixtures on the streamed world (v091 manager hook), exactly as index.html computes them ─
const world = createWorld(); for (const rec of chunks) addChunk(world, rec);
const computeBlocked = (ch) => {
  const set = new Set(), Pn = ch.painted, bones = ch.cells; if (!Pn) return set;
  const doorSet = new Set(); for (const r of ch.rooms) { if (r.door >= 0) doorSet.add(r.door); if (r.doorRoad >= 0) doorSet.add(r.doorRoad); }
  const pts = []; for (const F of (Pn.fixtures || [])) for (const cl of F.cells) { if (cl.base) continue; const c = Pn.paintCells[cl.idx]; if (c) pts.push(c); } for (const cp of (Pn.comps || [])) pts.push({ x: cp.cx, y: cp.cy });
  const thr2 = ((ch.cellSize || 16) * 0.55) ** 2;
  for (let i = 0; i < bones.length; i++) { if (doorSet.has(i) || ch.road[i]) continue; const bx = bones[i].x, by = bones[i].y; for (const p of pts) if ((p.x - bx) ** 2 + (p.y - by) ** 2 < thr2) { set.add(i); break; } }
  return set;
};
const blockedOf = (chunkId, local) => { const ch = world.chunks[chunkId]; if (!ch._blk) ch._blk = computeBlocked(ch); return ch._blk.has(local); };
const walk = buildWalk(world, blockedOf);
ok(walk.blocked && walk.blocked.size > 0, `impassable fixture tiles exist (${walk.blocked.size})`);
ok([...walk.blocked].every((g) => { const ch = world.chunks[walk.nodeChunk[g]]; return !ch.road[walk.nodeLocal[g]]; }), 'no concourse cell is ever blocked');
const free = []; for (let i = 0; i < walk.N && free.length < 2; i++) if (!walk.blocked.has(i) && walk.adj[i].length) free.push(i);
const pth = pathFind(walk, free[0], free[1]);
ok(!pth || pth.every((g) => !walk.blocked.has(g)), 'a movement path never traverses an impassable tile');
ok(!walk.blocked.has(nearestNode(walk, P0.fixtures[0].tip.x, P0.fixtures[0].tip.y, true)), 'targeting a fixture routes to the nearest navigable tile');

// ── v091 residents live + separate on the blocked graph ──────────────────────────────────────────────
const society = buildSociety(world, walk);
const residents = buildResidents(world, walk, society);
ok(residents.length > 0, `residents populate the synthesis world (${residents.length})`);
for (let t = 0; t < 40; t++) stepResidents(residents, walk, 16, { cx: residents[0].x, cy: residents[0].y, radius: 1e9, sep: 5, sepMax: 3 });
ok(residents.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && a.genome && a.role), 'residents step + separate without NaN; keep genome/role');
ok(residents.every((a) => !walk.blocked.has(nearestNode(walk, a.x, a.y, true))), 'no resident is ever parked on an impassable fixture tile');

// ── v092 player systems stat the SAME souls — the bridge between the two halves (index.html npcStatLine) ─
const a = residents[0];
const sb = crewStats((a.genome && a.genome.seed) || a.id, a.role);
ok(sb && sb.triad && TRIAD_ORDER.every((d) => sb.triad[d] >= 0 && sb.triad[d] <= 1), 'crewStats mints a FLESH·CHASSIS·ANIMA block for a world resident');
const cm = deriveCombat(sb);
ok(cm.hp > 0 && cm.atk > 0 && cm.def >= 0, `deriveCombat turns that block into combat stats (hp ${cm.hp} atk ${cm.atk} def ${cm.def})`);

// ── v092 pack still rolls items (inventory feedstock) ────────────────────────────────────────────────
const kit = startingPack(7, 9);
ok(Array.isArray(kit) && kit.length > 0 && kit.every((it) => it && it.name), `startingPack rolls a genomed kit (${kit.length} items)`);

// ── determinism across the whole synthesis ───────────────────────────────────────────────────────────
const again = solveChunk(GEN(7)); again.seed = 7; const Pa = paintChunk(again, { fixtureArea: MAX_FIXTURE_AREA });
ok(Pa.fixtures.length === P0.fixtures.length && again.rooms.length === chunks[0].rooms.length, 'the synthesis chunk is deterministic from its seed');

console.log(`\nv093 synthesis: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
