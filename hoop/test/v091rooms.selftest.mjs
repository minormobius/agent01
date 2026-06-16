// v091rooms.selftest.mjs — item #2: traffic-sized rooms. More heavily trafficked roles (hubs / third
// places) get bigger footprints; quiet roles (dwellings, stores) get smaller ones. Pins the directional
// claim + determinism + density preservation, and that the shared default (no-footprint) path is intact.
// Run: node hoop/test/v091rooms.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { TRAFFIC_FOOTPRINT, HUB_ROLES, QUIET_ROLES } from '../v091/rooms.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const seeds = [7, 31, 101, 202, 303, 404, 505, 606];
const gen = (s, fp) => solveChunk({ seed: s, shape: 'hex', roomSize: 16, footprint: fp });

// gather every room across several chunks (with traffic sizing on)
const rooms = [];
for (const s of seeds) gen(s, TRAFFIC_FOOTPRINT).rooms.forEach((r) => rooms.push({ role: r.role, n: r.cells.length }));
const sizesOf = (set) => rooms.filter((r) => set.includes(r.role)).map((r) => r.n);
const hub = sizesOf(HUB_ROLES), quiet = sizesOf(QUIET_ROLES), all = rooms.map((r) => r.n);

ok(rooms.length > 100, `sampled ${rooms.length} rooms across ${seeds.length} chunks`);
ok(rooms.every((r) => typeof r.role === 'string' && r.n > 0), 'every room carries a role + has cells');
ok(hub.length > 5 && quiet.length > 5, `enough hub (${hub.length}) + quiet (${quiet.length}) rooms to compare`);
ok(mean(hub) > mean(all), `hub rooms are bigger than average (hub ${mean(hub).toFixed(1)} vs all ${mean(all).toFixed(1)} cells)`);
ok(mean(quiet) < mean(all), `quiet rooms are smaller than average (quiet ${mean(quiet).toFixed(1)} vs all ${mean(all).toFixed(1)} cells)`);
ok(mean(hub) > mean(quiet) * 1.2, `hubs clearly out-size quiet rooms (${mean(hub).toFixed(1)} vs ${mean(quiet).toFixed(1)} cells)`);

// determinism: same (seed, footprint) ⇒ identical roles + sizes
const r1 = gen(7, TRAFFIC_FOOTPRINT), r2 = gen(7, TRAFFIC_FOOTPRINT);
ok(r1.rooms.length === r2.rooms.length && r1.rooms.every((r, i) => r.role === r2.rooms[i].role && r.cells.length === r2.rooms[i].cells.length), 'traffic sizing is deterministic from (seed, footprint)');

// density preserved: total room count barely moves vs the plain path (the footprint weighted-mean ≈ 1)
let cntFoot = 0, cntPlain = 0;
for (const s of seeds) { cntFoot += gen(s, TRAFFIC_FOOTPRINT).rooms.length; cntPlain += solveChunk({ seed: s, shape: 'hex', roomSize: 16 }).rooms.length; }
ok(Math.abs(cntFoot - cntPlain) < cntPlain * 0.25, `room count barely moves (footprint ${cntFoot} vs plain ${cntPlain})`);

// the shared DEFAULT path (no footprint) still produces roled rooms — v7/v8/v090 are unaffected
const plain = solveChunk({ seed: 7, shape: 'hex', roomSize: 16 });
ok(plain.rooms.length > 5 && plain.rooms.every((r) => typeof r.role === 'string'), 'default (no-footprint) path still produces roled rooms');

console.log(`\nv091 rooms: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
