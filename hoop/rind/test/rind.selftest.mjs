// rind.selftest.mjs — the RIND floor (floor 2 / deck 3): a bounded star of four stations with an
// infrastructure character, built on the same v2 engine as the nave.
//   node hoop/rind/test/rind.selftest.mjs

import { buildRind, prepareRind, rindSolveNext, rindLinks, rindBiome, rindRoles, RIND_CHUNKS, SPOKE_DIRS } from '../rind.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const rind = buildRind(7);

// 1) four chunks: a hub + three stations
ok(rind.world.chunks.length === 4, `the rind is four chunks (got ${rind.world.chunks.length})`);
ok(rind.meta[0].station === 'hub' && rind.meta.slice(1).map((m) => m.station).sort().join() === 'drum,nav,signal', 'hub + nav/drum/signal stations');
ok(SPOKE_DIRS.length === 3 && new Set(SPOKE_DIRS).size === 3, 'three distinct spoke directions');

// 2) ONE connected floor with STAR topology — hub links all three; stations never interlink
const { linked } = rindLinks(rind);
ok(linked.has('0-1') && linked.has('0-2') && linked.has('0-3'), 'the hub links to all three stations');
ok(!linked.has('1-2') && !linked.has('1-3') && !linked.has('2-3'), 'the stations do NOT link to each other (a clean star)');

// 3) every chunk actually has rooms + a concourse, and the seams carry ports
for (let i = 0; i < 4; i++) {
  const ch = rind.world.chunks[i];
  ok(ch.rooms && ch.rooms.length >= 3, `${rind.meta[i].label}: has rooms (${ch.rooms ? ch.rooms.length : 0})`);
  ok(ch.ports && ch.ports.some((p) => p.cell != null && p.cell >= 0), `${rind.meta[i].label}: has a live seam port`);
}

// 4) THE RIND CHARACTER: infrastructure only — NO grow (farms) and NO play (arcades) anywhere on the floor
const placed = new Set();
for (const ch of rind.world.chunks) for (const r of ch.rooms) placed.add(r.role);
ok(!placed.has('grow'), 'no grow rooms on the rind (no farms in the cold hull)');
ok(!placed.has('play'), 'no play rooms on the rind (no arcades down here)');
ok(rindRoles().every((r) => !['grow', 'play'].includes(r)), 'the declared rind role set excludes grow + play');
ok(placed.has('make') || placed.has('mend') || placed.has('move'), 'the rind places its infrastructure verbs');

// 5) role FLOORS hold per station: each station guarantees at least one of its declared floor roles
for (let i = 0; i < 4; i++) {
  const ch = rind.world.chunks[i], floors = RIND_CHUNKS[i].floors, roles = new Set(ch.rooms.map((r) => r.role));
  for (const fr of Object.keys(floors)) ok(roles.has(fr), `${rind.meta[i].label}: floor role '${fr}' present`);
}

// 6) the Signal chamber is the descent's payoff — its principal verb is worship (the tier-2 lore/devotion seat)
const signal = rind.world.chunks[3];
ok(rind.meta[3].station === 'signal' && new Set(signal.rooms.map((r) => r.role)).has('worship'), 'the Signal Chamber places worship (the descent payoff seat)');
ok(rindBiome(3).grand.join() === 'worship', 'the Signal Chamber grands worship');

// 7) determinism — same seed, identical floor (role sequence per chunk)
const sig = (r) => r.world.chunks.map((c) => c.rooms.map((x) => x.role).join('.')).join('|');
ok(sig(buildRind(7)) === sig(rind), 'buildRind is deterministic for a seed');
ok(sig(buildRind(8)) !== sig(rind), 'a different seed gives a different floor');

// 8) prepareRind / rindSolveNext pace one chunk at a time (what the game streams), hub first
const st = prepareRind(7);
const first = rindSolveNext(st);
ok(first && first.i === 0 && st.meta[0].station === 'hub', 'rindSolveNext solves the hub first');
let n = 1; while (rindSolveNext(st)) n++;
ok(n === 4 && rindSolveNext(st) === null, 'rindSolveNext yields exactly four chunks then null');

console.log(`\nrind.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
