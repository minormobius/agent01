// manifest.selftest.mjs — the nave content-slot manifest.
//   node hoop/nave/test/manifest.selftest.mjs
import { naveManifest, slotProfile, contentTypesFor, featureKey } from '../manifest.js';
import { FACTIONS, BIOMES } from '../nave.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// 1) a per-world manifest enumerates every room as a feature with a valid key (no undefined)
const m = naveManifest(7);
ok(m.chunks.length === 7 && m.totalRooms > 200, `manifest of seed 7: ${m.totalRooms} slots over ${m.chunks.length} chunks`);
const allRooms = m.chunks.flatMap((c) => c.rooms);
ok(allRooms.every((r) => /^nave:c\d+:r\d+$/.test(r.key)), 'every slot has a well-formed feature_key (no undefined)');
ok(new Set(allRooms.map((r) => r.key)).size === allRooms.length, 'feature_keys are unique');
ok(featureKey(3, 9) === 'nave:c3:r9', 'featureKey scheme');

// 2) content types: npc always; item/lore by role; plot_beat on the anchor
ok(contentTypesFor('dwell', false).join() === 'npc', 'dwell hosts just an npc');
ok(contentTypesFor('trade', false).includes('item'), 'trade hosts an item');
ok(contentTypesFor('worship', false).includes('lore_fragment'), 'worship hosts a lore_fragment');
ok(contentTypesFor('worship', true).includes('plot_beat'), 'the anchor (exclusive) hosts a plot_beat');
ok(!contentTypesFor('worship', false).includes('plot_beat'), 'a non-anchor worship room is no plot_beat');
ok(m.chunks.every((c) => c.rooms.every((r) => !r.contentTypes.includes('creature'))), 'floor 1 is no-baddies — no creature slots');

// 3) the GUARANTEED structure (role floors) is seed-independent
const p = slotProfile({ seeds: 8 });
ok(p.guaranteed.commons.length === Object.keys(ROLES).length, 'the commons guarantees one of EVERY building type');
for (const [fk, f] of Object.entries(FACTIONS)) {
  const g = p.guaranteed.factions[fk];
  ok(g && g.shared.join() === f.shared.join(), `${fk} shared roles match the faction`);
  ok(g.wards.length === 2 && g.wards.map((w) => w.exclusive).sort().join() === f.exclusives.slice().sort().join(), `${fk} has two wards carrying its two exclusives`);
  for (const w of g.wards) ok(w.floors.includes('dwell') && w.floors.includes(w.exclusive), `${fk}/${w.exclusive} ward floors include housing + its exclusive`);
}

// 4) the six lobe anchors = the six exclusives, each flagged in the pool list
const anchors = p.pools.filter((pl) => pl.anchor).map((pl) => pl.tag).sort();
const exclusives = BIOMES.map((b) => b.exclusive).sort();
ok(anchors.join() === exclusives.join(), `the ${anchors.length} pool anchors are exactly the six exclusives`);

// 5) every role tag appears in the pool list with a tier + the factions that use it
const tags = p.pools.map((pl) => pl.tag).sort();
ok(tags.join() === Object.keys(ROLES).slice().sort().join(), 'the pool list covers every role tag');
ok(p.pools.every((pl) => pl.tier === (ROLES[pl.tag] || {}).tier && pl.factions.length >= 1 && pl.avgSlotsPerWorld > 0), 'each pool row carries the right tier, ≥1 faction, and a positive slot depth');
// dwell is in every lobe + commons; an exclusive is in commons + exactly one faction
ok(p.pools.find((pl) => pl.tag === 'dwell').factions.length === 4, 'dwell (housing) is in the commons + all three lobes');
ok(p.pools.find((pl) => pl.tag === 'worship').factions.sort().join() === 'commons,rindwalker', 'worship lives only in the commons + the rindwalker lobe');

// 6) determinism
const a = JSON.stringify(slotProfile({ seeds: 6 })), b = JSON.stringify(slotProfile({ seeds: 6 }));
ok(a === b, 'slotProfile is deterministic');

console.log(`manifest.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
