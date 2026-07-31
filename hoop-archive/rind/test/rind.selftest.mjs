// rind.selftest.mjs — the UPPER RIND floor (floor 2): a bounded star of four of the Seven's domains
// (Mercury hub · Mars · Venus · Jupiter), built on the same v2 engine as the nave.
//   node hoop/rind/test/rind.selftest.mjs

import { buildRind, prepareRind, rindSolveNext, rindLinks, rindBiome, rindRoles, RIND_CHUNKS, SPOKE_DIRS } from '../rind.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const rind = buildRind(7);

// 1) four chunks: the Mercury hub + three domain-stations (Mars · Venus · Jupiter)
ok(rind.world.chunks.length === 4, `the rind is four chunks (got ${rind.world.chunks.length})`);
ok(rind.meta[0].station === 'mercury' && rind.meta.slice(1).map((m) => m.station).sort().join() === 'jupiter,mars,venus', 'Mercury hub + Mars/Venus/Jupiter domains');
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

// 4) THE RIND CHARACTER: the Seven's verbs re-read at scale — Venus's gardens (grow/heal) and Jupiter's
// court (govern/play) live HERE now (the old "no grow/play" was an outdated-doc rule). No worship up here —
// that is Saturn/Sol, the lower rind.
const placed = new Set();
for (const ch of rind.world.chunks) for (const r of ch.rooms) placed.add(r.role);
ok(placed.has('grow'), 'grow rooms ARE on the upper rind (Venus’s gardens)');
ok(placed.has('play'), 'play rooms ARE on the upper rind (Jupiter’s court)');
ok(!placed.has('worship'), 'NO worship on the upper rind (that is Saturn/Sol, the lower rind)');
ok(rindRoles().includes('grow') && rindRoles().includes('play'), 'the declared rind role set now includes grow + play');
ok(placed.has('make') && placed.has('move'), 'the upper rind places its domain verbs (Mars make, Mercury move)');

// 5) role FLOORS hold per station: each station guarantees at least one of its declared floor roles
for (let i = 0; i < 4; i++) {
  const ch = rind.world.chunks[i], floors = RIND_CHUNKS[i].floors, roles = new Set(ch.rooms.map((r) => r.role));
  for (const fr of Object.keys(floors)) ok(roles.has(fr), `${rind.meta[i].label}: floor role '${fr}' present`);
}

// 6) Jupiter's domain (chunk 3) is the court — govern + play, granding govern (the long table). The Signal
// Chamber is NOT here: it is Luna's, in the lower rind (built separately).
const jupiter = rind.world.chunks[3];
ok(rind.meta[3].station === 'jupiter' && new Set(jupiter.rooms.map((r) => r.role)).has('govern'), 'Jupiter places govern (the long table)');
ok(rindBiome(3).grand.join() === 'govern', 'Jupiter grands govern');

// 7) determinism — same seed, identical floor (role sequence per chunk)
const sig = (r) => r.world.chunks.map((c) => c.rooms.map((x) => x.role).join('.')).join('|');
ok(sig(buildRind(7)) === sig(rind), 'buildRind is deterministic for a seed');
ok(sig(buildRind(8)) !== sig(rind), 'a different seed gives a different floor');

// 8) prepareRind / rindSolveNext pace one chunk at a time (what the game streams), hub first
const st = prepareRind(7);
const first = rindSolveNext(st);
ok(first && first.i === 0 && st.meta[0].station === 'mercury', 'rindSolveNext solves the Mercury hub first');
let n = 1; while (rindSolveNext(st)) n++;
ok(n === 4 && rindSolveNext(st) === null, 'rindSolveNext yields exactly four chunks then null');

console.log(`\nrind.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
