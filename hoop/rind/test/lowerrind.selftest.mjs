// lowerrind.selftest.mjs — the LOWER RIND (bible Zone 4): the deep domains (Saturn hub · Sol · Luna · the
// Signal Chamber), reusing the upper rind's four-chunk star builder with the lower-rind biome.
//   node hoop/rind/test/lowerrind.selftest.mjs
import { buildLowerRind, prepareLowerRind, rindSolveNext, rindLinks, lowerRindBiome, lowerRindRoles, LOWER_RIND_CHUNKS } from '../rind.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const lr = buildLowerRind(7);

// 1) four chunks: Saturn hub + Sol/Luna/Signal-Chamber
ok(lr.world.chunks.length === 4, `the lower rind is four chunks (got ${lr.world.chunks.length})`);
ok(lr.meta[0].station === 'saturn' && lr.meta.slice(1).map((m) => m.station).sort().join() === 'luna,signal,sol', 'Saturn hub + Sol/Luna/Signal stations');

// 2) STAR topology — Saturn (the shaft foot) links all three; the three don't interlink
const { linked } = rindLinks(lr);
ok(linked.has('0-1') && linked.has('0-2') && linked.has('0-3'), 'Saturn links to all three deep stations');
ok(!linked.has('1-2') && !linked.has('1-3') && !linked.has('2-3'), 'the deep stations do NOT interlink (a clean star)');

// 3) every chunk has rooms + a live seam port
for (let i = 0; i < 4; i++) {
  const ch = lr.world.chunks[i];
  ok(ch.rooms && ch.rooms.length >= 3, `${lr.meta[i].label}: has rooms (${ch.rooms ? ch.rooms.length : 0})`);
  ok(ch.ports && ch.ports.some((p) => p.cell != null && p.cell >= 0), `${lr.meta[i].label}: has a live seam port`);
}

// 4) THE LOWER-RIND CHARACTER: the sacred/archive register — worship (Saturn/Sol) + learn (Luna/Signal),
// NO grow/play/heal (those are the upper rind's Venus/Jupiter) — the deep is not civic.
const placed = new Set();
for (const ch of lr.world.chunks) for (const r of ch.rooms) placed.add(r.role);
ok(placed.has('worship'), 'worship IS on the lower rind (Saturn/Sol — the machine-god register)');
ok(placed.has('learn'), 'learn IS on the lower rind (Luna’s archive + the Signal Chamber)');
ok(!placed.has('grow') && !placed.has('play'), 'no grow/play down here (those are Venus/Jupiter, the upper rind)');
ok(lowerRindRoles().includes('worship') && lowerRindRoles().includes('learn') && !lowerRindRoles().includes('grow'), 'the declared lower-rind role set is the sacred/archive register');

// 5) role floors hold per station
for (let i = 0; i < 4; i++) {
  const ch = lr.world.chunks[i], floors = LOWER_RIND_CHUNKS[i].floors, roles = new Set(ch.rooms.map((r) => r.role));
  for (const fr of Object.keys(floors)) ok(roles.has(fr), `${lr.meta[i].label}: floor role '${fr}' present`);
}

// 6) the Signal Chamber is the payoff — Luna's lost sanctum, granding learn (the contact terminal)
ok(lr.meta[3].station === 'signal' && lowerRindBiome(3).grand.join() === 'learn', 'the Signal Chamber grands learn (the contact terminal)');
ok(new Set(lr.world.chunks[3].rooms.map((r) => r.role)).has('learn'), 'the Signal Chamber places a learn room (Luna’s terminal)');

// 7) determinism + a different seed differs; paced solve yields exactly four (Saturn first)
const sig = (r) => r.world.chunks.map((c) => c.rooms.map((x) => x.role).join('.')).join('|');
ok(sig(buildLowerRind(7)) === sig(lr), 'buildLowerRind is deterministic for a seed');
ok(sig(buildLowerRind(8)) !== sig(lr), 'a different seed gives a different floor');
const st = prepareLowerRind(7); const first = rindSolveNext(st);
ok(first && first.i === 0 && st.meta[0].station === 'saturn', 'paced solve does Saturn (the shaft foot) first');
let n = 1; while (rindSolveNext(st)) n++;
ok(n === 4, 'paced solve yields exactly four deep chunks');

console.log((fail ? '✗ ' : '✓ ') + 'lowerrind.selftest: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
