// v091rooms.selftest.mjs — item #2 + refinements: traffic-sized rooms, GRAND anchors in big pockets,
// and MICRO-ROOM bulldozing. Pins the directional sizing + determinism + density, that big pockets get
// a civic centrepiece, that runt rooms are gone, and that the shared default (no-opts) path is intact.
// Run: node hoop/test/v091rooms.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { TRAFFIC_FOOTPRINT, HUB_ROLES, QUIET_ROLES, GRAND_ROLES, GRAND_MIN, MIN_ROOM } from '../v091/rooms.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const seeds = [7, 31, 101, 202, 303, 404, 505, 606];
// the full v091 generation: traffic footprints + grand anchors + micro-room bulldozing
const genV = (s) => solveChunk({ seed: s, shape: 'hex', roomSize: 16, footprint: TRAFFIC_FOOTPRINT, grand: GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM });

const chunks = seeds.map(genV);
const rooms = [];
chunks.forEach((rec) => rec.rooms.forEach((r) => rooms.push({ role: r.role, n: r.cells.length })));
const sizesOf = (set) => rooms.filter((r) => set.includes(r.role)).map((r) => r.n);
const hub = sizesOf(HUB_ROLES), quiet = sizesOf(QUIET_ROLES), all = rooms.map((r) => r.n);

// 1. traffic sizing
ok(rooms.length > 100, `sampled ${rooms.length} rooms across ${seeds.length} chunks`);
ok(rooms.every((r) => typeof r.role === 'string' && r.n > 0), 'every room carries a role + has cells');
ok(mean(hub) > mean(all) && mean(quiet) < mean(all), `hubs > avg > quiet (hub ${mean(hub).toFixed(1)}, all ${mean(all).toFixed(1)}, quiet ${mean(quiet).toFixed(1)})`);
ok(mean(hub) > mean(quiet) * 1.2, `hubs clearly out-size quiet rooms (${mean(hub).toFixed(1)} vs ${mean(quiet).toFixed(1)})`);

// 2. GRAND anchors — a big pocket gets a civic centrepiece; govern/worship now actually appear
const grandCount = rooms.filter((r) => GRAND_ROLES.includes(r.role)).length;
const civic = rooms.filter((r) => r.role === 'govern' || r.role === 'worship').length;
ok(grandCount > seeds.length, `grand roles are well represented (${grandCount} across ${seeds.length} chunks)`);
ok(civic > 0, `the rare civic centrepieces (govern/worship) now appear (${civic})`);
ok(chunks.filter((rec) => rec.rooms.some((r) => GRAND_ROLES.includes(r.role))).length >= seeds.length - 1, 'almost every chunk has at least one grand room');

// 3. MICRO-ROOMS bulldozed — nothing under MIN_ROOM cells survives
const runts = rooms.filter((r) => r.n < MIN_ROOM).length;
ok(runts === 0, `no micro-rooms survive (< ${MIN_ROOM} cells): ${runts} runts`);

// 4. determinism
const r1 = genV(7), r2 = genV(7);
ok(r1.rooms.length === r2.rooms.length && r1.rooms.every((r, i) => r.role === r2.rooms[i].role && r.cells.length === r2.rooms[i].cells.length), 'the full v091 sizing is deterministic from the seed');

// 5. density preserved vs the plain path (footprint weighted-mean ≈ 1, bulldoze only trims runts)
let cntV = 0, cntPlain = 0;
for (const s of seeds) { cntV += genV(s).rooms.length; cntPlain += solveChunk({ seed: s, shape: 'hex', roomSize: 16 }).rooms.length; }
ok(Math.abs(cntV - cntPlain) < cntPlain * 0.35, `room count stays in range (v091 ${cntV} vs plain ${cntPlain})`);

// 6. the shared DEFAULT path (no opts) is unaffected — v7/v8/v090 still get equal rooms, any size
const plain = solveChunk({ seed: 7, shape: 'hex', roomSize: 16 });
ok(plain.rooms.length > 5 && plain.rooms.every((r) => typeof r.role === 'string'), 'default (no-opts) path still produces roled rooms');
ok(plain.rooms.some((r) => r.cells.length < MIN_ROOM), 'default path does NOT bulldoze (micro-rooms only gone under the v091 opt-in)');

console.log(`\nv091 rooms: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
