// nave.selftest.mjs — floor 1's seven-chunk faction arrangement.
//   node hoop/nave/test/nave.selftest.mjs
import { buildNave, naveLinks, FACTIONS, BIOMES, biomeForChunk, UNIVERSAL } from '../nave.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const nave = buildNave(7);

// 1) seven chunks: commons + six faction wards
ok(nave.world.chunks.length === 7, `seven chunks (${nave.world.chunks.length})`);
ok(nave.meta[0].key === 'commons' && nave.meta[0].faction === null, 'chunk 0 is the commons');
ok(nave.meta.slice(1).filter((m) => m.faction === 'rindwalker').length === 2, 'two rindwalker wards');
ok(nave.meta.slice(1).filter((m) => m.faction === 'continuant').length === 2, 'two continuant wards');
ok(nave.meta.slice(1).filter((m) => m.faction === 'drift').length === 2, 'two drift wards');

// 2) THE TOPOLOGY: center links to all six; each faction ward links to center + its sibling ONLY.
const { linked } = naveLinks(nave);
const isLinked = (a, b) => linked.has(Math.min(a, b) + '-' + Math.max(a, b));
let centerOk = true; for (let i = 1; i <= 6; i++) if (!isLinked(0, i)) centerOk = false;
ok(centerOk, 'the commons links to all six faction wards');
ok(isLinked(1, 2) && isLinked(3, 4) && isLinked(5, 6), 'each faction’s two wards link to each other (the lobes)');
// NO cross-faction link: the geometrically-adjacent but different-faction pairs are walled
ok(!isLinked(2, 3) && !isLinked(4, 5) && !isLinked(6, 1), 'cross-faction touching wards are walled apart (no link)');
// every faction ward has exactly degree 2 (center + sibling)
let deg2 = true; for (let i = 1; i <= 6; i++) { let d = 0; for (let j = 0; j <= 6; j++) if (j !== i && isLinked(i, j)) d++; if (d !== 2) deg2 = false; }
ok(deg2, 'every faction ward has degree 2 (center + sibling only)');

// 3) the whole nave is ONE connected world (you can walk commons → any lobe)
const walk = naveLinks(nave).walk, seen = new Uint8Array(walk.N), q = [walk.base[0]]; seen[walk.base[0]] = 1;
for (let h = 0; h < q.length; h++) for (const v of walk.adj[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
let allReached = true; for (const ch of nave.world.chunks) { let any = false; for (let i = 0; i < ch.cells.length; i++) if (seen[walk.base[ch.id] + i]) { any = true; break; } if (!any) allReached = false; }
ok(allReached, 'every chunk is reachable from the commons (one connected floor)');

// 4) the COMMONS has at least one of EVERY building type
const rolesIn = (ci) => new Set(nave.world.chunks[ci].rooms.map((r) => r.role));
const commonsRoles = rolesIn(0);
const missing = Object.keys(ROLES).filter((r) => !commonsRoles.has(r));
ok(missing.length === 0, `the commons has one of every building type (missing: ${missing.join(',') || 'none'})`);

// 5) EXCLUSIVE buildings: worship/mend/govern/grow/learn/play appear in their ONE faction ward + the
// commons, and in NO other faction ward.
const EXCLUSIVES = ['worship', 'mend', 'govern', 'grow', 'learn', 'play'];
for (const ex of EXCLUSIVES) {
  const wards = []; for (let i = 1; i <= 6; i++) if (rolesIn(i).has(ex)) wards.push(i);
  const home = nave.meta.findIndex((m) => m.exclusive === ex);
  ok(wards.length === 1 && wards[0] === home, `${ex} is exclusive to its faction ward (#${home}) — present in [${wards.join(',')}]`);
}

// 6) every faction ward has HOUSING + its exclusive; and never a rival faction's role
for (let i = 1; i <= 6; i++) {
  const rs = rolesIn(i), m = nave.meta[i], f = FACTIONS[m.faction];
  ok(rs.has('dwell'), `ward ${i} (${m.key}) has housing`);
  ok(rs.has(m.exclusive), `ward ${i} (${m.key}) has its exclusive ${m.exclusive}`);
  // every ward carries the universal civic triad (produce · care · exchange) — so the dwell→work→third loop
  // closes in every ward (serve is the third-place that the Rindwalker·mend ward used to lack).
  for (const u of UNIVERSAL) ok(rs.has(u), `ward ${i} (${m.key}) has the universal '${u}'`);
  // no role outside {dwell} ∪ universal ∪ faction.shared ∪ faction.exclusives
  const allowed = new Set(['dwell', ...UNIVERSAL, ...f.shared, ...f.exclusives]);
  const rogue = [...rs].filter((r) => !allowed.has(r));
  ok(rogue.length === 0, `ward ${i} (${m.key}) has only its faction's roles + the civic triad (rogue: ${rogue.join(',') || 'none'})`);
}

// 7) determinism
const a = buildNave(11), b = buildNave(11);
const sig = (n) => JSON.stringify(n.world.chunks.map((ch) => [ch.rooms.length, ch.ports.length, ch.road.reduce((x, v) => x + v, 0)]));
ok(sig(a) === sig(b), 'buildNave is deterministic (same seed ⇒ identical nave)');

console.log(`nave.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
