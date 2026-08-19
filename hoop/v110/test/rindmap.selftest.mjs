// rindmap.selftest.mjs — the upper rind read off a foam confluence document.
//
//   node hoop/v110/test/rindmap.selftest.mjs
//
// Pins what the zone depends on: three routes, one per nave faction, PROVABLY disjoint (a leak
// would let a player fill another faction's witness counter without walking its descent, which
// silently breaks the choice at the threshold); the party→faction assignment is seeded but total;
// authored bundles are only ever seated on their own faction's route; and every failure degrades
// to { ok:false } rather than throwing, because the rind going missing must leave the player in
// the nave rather than break the surface.
//
// The fixture is a REAL document from foam.mino.mobi/api/dungeon (seed 11, starts=3, hex, size l).
// No network is touched here — fetchRindFloor takes an injected fetch.

import { readFileSync } from 'node:fs';
import {
  RIND_FACTIONS, WITNESS_TARGET, FLOOR_PARAMS,
  floorQuery, floorSignature, readRindFloor, seatBundles, witnessSites, thresholdState, fetchRindFloor,
} from '../story/rindmap.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const doc = JSON.parse(readFileSync(new URL('./fixtures/rind-confluence-s11.json', import.meta.url), 'utf8'));

// ── the document is what we think it is ──────────────────────────────────────────────────────
eq(doc.format, 'foam-dungeon', 'fixture is a foam-dungeon document');
eq(doc.generator.starts, 3, 'fixture was generated with starts=3');
eq(doc.confluence.entrances.length, 3, 'fixture has three entrances');
ok(doc.rooms.length > 20, `fixture is not a thin floor (${doc.rooms.length} rooms)`);

// ── the read ─────────────────────────────────────────────────────────────────────────────────
const floor = readRindFloor(doc, { worldSeed: 7 });
ok(floor.ok, 'readRindFloor accepts a real confluence document');
eq(floor.parties.length, 3, 'three parties');
eq(floor.version, 4, 'the generator version is carried (drift is detectable)');
ok(floor.threshold && floor.threshold.id === doc.confluence.chamber, 'the threshold is the confluence chamber');

// THE CERTIFICATE. This is the one that matters.
ok(floor.disjoint, `the three descents are disjoint (${floor.leaks.length} leaks)`);
eq(floor.leaks.length, 0, 'no route touches another faction\'s territory');

// every faction appears exactly once, whatever the seed
for (let s = 0; s < 12; s++) {
  const f = readRindFloor(doc, { worldSeed: s });
  const facs = f.parties.map((p) => p.faction);
  eq(new Set(facs).size, 3, `seed ${s}: all three factions are represented`);
  ok(RIND_FACTIONS.every((x) => facs.includes(x)), `seed ${s}: no faction is dropped`);
  ok(f.disjoint, `seed ${s}: still disjoint`);
}
// …and the assignment is seeded (it should not be the same rotation for every world)
{
  const rots = new Set();
  for (let s = 0; s < 24; s++) rots.add(readRindFloor(doc, { worldSeed: s }).parties.map((p) => p.faction).join(','));
  ok(rots.size > 1, `which shaft belongs to which faction varies by world (${rots.size} arrangements)`);
}
// determinism: same (doc, worldSeed) → same floor
eq(JSON.stringify(readRindFloor(doc, { worldSeed: 7 }).parties.map((p) => [p.faction, p.entrance])),
   JSON.stringify(floor.parties.map((p) => [p.faction, p.entrance])), 'the read is deterministic');

// ── witness sites ────────────────────────────────────────────────────────────────────────────
for (const p of floor.parties) {
  eq(p.witnessSites.length, WITNESS_TARGET, `${p.faction} has ${WITNESS_TARGET} witness sites`);
  const areas = p.witnessSites.map((r) => r.area);
  ok(areas.every((a, i) => i === 0 || areas[i - 1] >= a), `${p.faction}: witness sites are biggest-first`);
  ok(p.witnessSites.every((w) => p.rooms.some((r) => r.id === w.id)), `${p.faction}: every witness site is in its own territory`);
  ok(!p.witnessSites.some((w) => w.id === floor.threshold.id), `${p.faction}: the threshold is not a witness site`);
}
eq(floor.thin.length, 0, 'no faction route is too thin to carry three witnessings');
{
  const w = witnessSites(floor);
  eq(Object.keys(w).length, 3, 'witnessSites reports all three factions');
  const all = Object.values(w).flatMap((xs) => xs.map((x) => x.roomId));
  eq(new Set(all).size, all.length, 'no room counts as a witness site for two factions');
}

// ── seating authored bundles ─────────────────────────────────────────────────────────────────
{
  const bundle = (id, nf) => ({ id, type: 'npc', content: { name: id, nave_faction: nf } });
  const bundles = [
    bundle('a', 'continuant'), bundle('b', 'continuant'), bundle('c', 'continuant'),
    bundle('d', 'rindwalker'), bundle('e', 'drift'), bundle('f', 'drift'),
    bundle('z', 'venus'),      // a Seven's-domain tag with no nave projection — must not be seated
  ];
  const { seats, unseated } = seatBundles(floor, bundles);
  eq(seats.length, 6, 'every bundle with a nave faction is seated');
  ok(unseated.includes('z'), 'a bundle with no nave faction is reported unseated, not mis-seated');
  for (const s of seats) {
    const b = bundles.find((x) => x.id === s.bundleId);
    eq(s.faction, b.content.nave_faction, `${s.bundleId} is seated on its OWN faction's route`);
    const p = floor.parties.find((x) => x.party === s.party);
    ok(p.rooms.some((r) => r.id === s.roomId) || p.route.some((r) => r.id === s.roomId),
       `${s.bundleId} is seated in a room of that route`);
  }
  eq(new Set(seats.map((s) => s.roomId)).size, seats.length, 'no two bundles share a chamber');
  ok(seats.filter((s) => s.witness).length >= 3, 'the first bundles land on witness sites');
  // determinism + degradation
  eq(JSON.stringify(seatBundles(floor, bundles)), JSON.stringify({ seats, unseated }), 'seating is deterministic');
  eq(seatBundles({ ok: false }, bundles).seats.length, 0, 'seating a broken floor seats nothing');
  eq(seatBundles(floor, []).seats.length, 0, 'no bundles → no seats, no throw');
}

// ── the threshold gate ───────────────────────────────────────────────────────────────────────
{
  eq(thresholdState(floor, {}).open, false, 'the threshold is shut on a fresh world');
  eq(thresholdState(floor, {}).need, 9, 'nine witnessings in total (three factions × three)');
  const partial = { 'fw.continuant': 3, 'fw.drift': 3, 'fw.rindwalker': 2 };
  eq(thresholdState(floor, partial).open, false, 'two-and-a-bit descents do not open it');
  eq(thresholdState(floor, partial).total, 8, 'progress counts across factions');
  const done = { 'fw.continuant': 3, 'fw.drift': 3, 'fw.rindwalker': 3 };
  eq(thresholdState(floor, done).open, true, 'all three descents open the threshold');
  eq(thresholdState(floor, { 'fw.continuant': 99 }).per.continuant, 3, 'a counter cannot overshoot its target');
  eq(thresholdState(floor, { 'fw.drift': -5 }).per.drift, 0, 'a negative counter floors at zero');
  eq(thresholdState(floor, { ...done, 'flag.chosen_faction': 'drift' }).chosen, 'drift', 'the choice is reported once made');
}

// ── the signature (version drift) ────────────────────────────────────────────────────────────
{
  const sig = floorSignature(doc);
  ok(/^foam-dungeon:v4:seed11:/.test(sig), `the signature names format, version and seed — ${sig}`);
  eq(sig, floorSignature(doc), 'the signature is stable');
  ok(floorSignature({ ...doc, version: 5 }) !== sig, 'a generator version bump changes the signature');
  ok(floorSignature({ ...doc, generator: { ...doc.generator, seed: 12 } }) !== sig, 'a different seed changes the signature');
  eq(floorSignature(null), null, 'no document → no signature');
}

// ── the request ──────────────────────────────────────────────────────────────────────────────
{
  const q = floorQuery(11);
  ok(q.includes('starts=3'), 'the request always asks for three starts');
  ok(q.includes('seed=11'), 'the request carries the world seed');
  ok(q.includes('shape=hex'), 'the request asks for hex (grid routes are too short to hold three witnessings)');
  eq(FLOOR_PARAMS.starts, 3, 'starts=3 is not overridable by accident');
  ok(floorQuery(11, { size: 'xl' }).includes('size=xl'), 'params can be overridden explicitly');
  ok(floorQuery(-1).includes('seed=4294967295'), 'a negative seed is coerced to uint32, not sent raw');
}

// ── everything degrades; nothing throws ──────────────────────────────────────────────────────
for (const bad of [null, undefined, {}, { format: 'foam-dungeon' }, { format: 'nope', confluence: {} },
                   { format: 'foam-dungeon', confluence: { entrances: [1, 2], chamber: 1 }, rooms: [] }]) {
  const f = readRindFloor(bad, { worldSeed: 1 });
  eq(f.ok, false, `a malformed document is refused cleanly: ${String(JSON.stringify(bad)).slice(0, 42)}`);
  ok(typeof f.reason === 'string' && f.reason.length > 0, 'the refusal says why');
}
{
  // a two-entrance (twin) document is not an upper rind
  const twin = { ...doc, confluence: { ...doc.confluence, entrances: doc.confluence.entrances.slice(0, 2) } };
  eq(readRindFloor(twin, { worldSeed: 1 }).ok, false, 'a two-start document is refused (the rind needs three)');
}
eq(witnessSites({ ok: false }).continuant, undefined, 'witnessSites of a broken floor is empty, not a throw');
eq(thresholdState(null, {}).open, false, 'thresholdState of nothing is shut, not a throw');

// ── fetch, with an injected transport (no network) ───────────────────────────────────────────
{
  const okFetch = async () => ({ ok: true, status: 200, json: async () => doc });
  const r = await fetchRindFloor(11, { fetchImpl: okFetch });
  ok(r.ok, 'fetchRindFloor reads a served document');
  ok(r.url.includes('starts=3') && r.url.includes('seed=11'), 'the fetched url carries the right params');
  ok(!!r.doc, 'the raw document rides along for the renderer');

  const r404 = await fetchRindFloor(11, { fetchImpl: async () => ({ ok: false, status: 404 }) });
  eq(r404.ok, false, 'a 404 degrades to ok:false');
  ok(/404/.test(r404.reason), 'the status is reported');

  const rThrow = await fetchRindFloor(11, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  eq(rThrow.ok, false, 'an unreachable foam degrades rather than throwing');
  ok(/unreachable/.test(rThrow.reason), 'the reason names the outage');

  const rJunk = await fetchRindFloor(11, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }) });
  eq(rJunk.ok, false, 'a 200 carrying junk still degrades cleanly');

  const rNoFetch = await fetchRindFloor(11, { fetchImpl: null, ...(typeof fetch === 'function' ? {} : {}) });
  ok(typeof rNoFetch === 'object', 'no-fetch path returns an object either way');
}

console.log(fail === 0 ? `✓ rindmap.selftest — ${pass} checks passed` : `✗ rindmap.selftest — ${fail}/${pass + fail} FAILED`);
process.exit(fail ? 1 : 0);
