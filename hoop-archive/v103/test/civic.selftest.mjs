// civic.selftest.mjs — the v103 UNIFIED NAVE CIVIC WEB (hoop's side of tide/goss's UNIFIED.md move).
//
//   node hoop/v103/test/civic.selftest.mjs
//
// Pins: the nave read as ONE civ web (profileFromNave 'floor') aggregates every ward, so a ward missing a
// parish BORROWS the neighbour's third-places (the study's headline: closure/thirds rise when unified); the
// 'sealed' mode reproduces the engine-truth per-chunk read; cross-ward reach exists only in the floor read;
// and the reading is REVEALED not re-rolled — appending a streaming ward only grows the profile, monotone.

import { profileFromChunk, profileFromNave } from '../story/genquest.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// a synthetic nave: a commons rich in third-places + two wards, one of them a bare dwelling ward (no parish).
const room = (role, domain) => ({ role, domain: domain || null });
const c0 = { id: 0, rooms: [room('dwell'), room('dwell'), room('worship'), room('serve'), room('make'), room('trade')] };   // commons
const c1 = { id: 1, rooms: [room('dwell'), room('dwell'), room('dwell'), room('make')] };                                    // a ward SHORT a third place
const c2 = { id: 2, rooms: [room('dwell'), room('learn'), room('make')] };                                                   // a ward with its own third place
// the commute web (already nearest-based across wards in npc.js#buildSociety): one edge crosses a ward wall.
const edges = [
  { kind: 'third', a: { ch: 1 }, b: { ch: 0 } },   // a soul in the bare ward worships in the commons — CROSS-WARD
  { kind: 'work',  a: { ch: 1 }, b: { ch: 1 } },   // …and works in its own ward
  { kind: 'third', a: { ch: 2 }, b: { ch: 2 } },
  { kind: 'third', a: { ch: 0 }, b: { ch: 0 } },
];

// ── 1. sealed mode = the engine-truth per-chunk read (the "seven fragments") ──
const sealedWard1 = profileFromNave({ chunks: [c1, c0, c2], edges, mode: 'sealed' });
ok(sealedWard1.unified === false && sealedWard1.wards === 1, 'sealed mode reports a single ward');
ok(sealedWard1.thirdPlaces === 0, 'the bare ward has ZERO third-places when read sealed (a fragment)');
ok(sealedWard1.crossWardEdges === 0, 'sealed mode sees no cross-ward reach');
// it agrees with profileFromChunk on that one chunk's rooms + its own edges
const direct = profileFromChunk({ rooms: c1.rooms, edges: edges.filter((e) => e.a.ch === 1 || e.b.ch === 1) });
ok(sealedWard1.thirdPlaces === direct.thirdPlaces && JSON.stringify(sealedWard1.roles) === JSON.stringify(direct.roles), 'sealed mode == profileFromChunk on the focal ward');

// ── 2. floor mode = ONE civ web — the bare ward borrows the neighbour's parish ──
const floor = profileFromNave({ chunks: [c0, c1, c2], edges, mode: 'floor' });
ok(floor.unified === true && floor.wards === 3, 'floor mode reports the whole nave (3 wards)');
ok(floor.thirdPlaces === 3, 'the floor pools every ward\'s third-places (worship+serve+learn = 3)');
ok(floor.thirdPlaces > sealedWard1.thirdPlaces, 'unified > sealed: a ward short a parish is no longer a dead third-place desert');
ok(floor.crossWardEdges === 1, 'the floor read surfaces the cross-ward tie the sealed read hid');
// the roles histogram is the union of every ward's programme
ok(floor.roles.worship >= 1 && floor.roles.learn >= 1 && floor.roles.trade >= 1, 'the unified programme unions all wards\' roles');

// ── 3. REVEALED, NOT RE-ROLLED (UNIFIED.md §C2): a streaming ward only APPENDS — the profile grows monotone ──
const prefix0 = profileFromNave({ chunks: [c0], edges, mode: 'floor' });
const prefix1 = profileFromNave({ chunks: [c0, c1], edges, mode: 'floor' });
const prefix2 = profileFromNave({ chunks: [c0, c1, c2], edges, mode: 'floor' });
ok(prefix0.thirdPlaces <= prefix1.thirdPlaces && prefix1.thirdPlaces <= prefix2.thirdPlaces, 'thirdPlaces is monotone non-decreasing as wards stream in');
const subset = (a, b) => Object.keys(a.roles).every((k) => b.roles[k] != null);
ok(subset(prefix0, prefix1) && subset(prefix1, prefix2), 'each prefix\'s roles are a subset of the fuller floor — appending never drops a role (no re-roll)');
ok(prefix2.crossWardEdges >= prefix1.crossWardEdges, 'cross-ward reach only grows as the wards unseal');

console.log(`\ncivic.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
