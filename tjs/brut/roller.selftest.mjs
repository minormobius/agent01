// tjs/brut/roller.selftest.mjs — node selftest for the solver-coupled roller.
// Run: node tjs/brut/roller.selftest.mjs
//
// A search that returns something is not the same as a search that returns
// something WORKABLE, and the failure mode of a repair ladder is that it
// quietly returns the last thing it tried. So the checks here are mostly about
// honesty rather than about success:
//
//   · a roll that says PASS must survive an INDEPENDENT re-verification — the
//     roller does not get to mark its own homework;
//   · a roll that fails must say so, and still hand back the closest thing it
//     found with the governing check attached;
//   · the result must still be a permalink, because that is the contract the
//     whole surface rests on and a search that breaks it is worse than no
//     search at all;
//   · and every rung of the ladder must be keyed on a check the solver can
//     ACTUALLY emit. A repair table keyed on a typo never fires, never errors,
//     and silently degrades the roller to rejection sampling — which is exactly
//     the kind of rot that survives for years.

import { readFileSync } from 'node:fs';
import { generate, resolveParams, paramsToQuery, deriveParams, TYPOLOGY_IDS, FLOOR_IDS, LATERAL_IDS } from './arch.js';
import { verify } from './struct.js';
import { rollWorkable, census, scoreOf, applyMove, editsOf, REPAIRS } from './roller.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const HZ = { seismicScenario: 'high', windScenario: 'cat3' };
const MILD = { seismicScenario: 'low', windScenario: 'calm' };

/* 1. THE LADDER IS KEYED ON REAL CHECKS. Collect every check id the solver can
      emit across a real sweep, and require every rung to be one of them. This
      is the check that catches a rung that never fires. */
{
  // AGAINST THE SOLVER'S VOCABULARY, NOT A SAMPLE OF ITS BEHAVIOUR. Sampling
  // was the obvious way to do this and it is wrong: `uplift` only fires when
  // the resultant leaves the middle third, so a hundred and forty-four solves
  // never saw it and the test accused a real rung of being a typo. Reading the
  // ids out of the source is exact, and it cannot be defeated by a rare branch.
  // A check is written two ways in the solver — as an object literal with an
  // `id:` field, and through the `check('id', …)` helper — so both forms have
  // to be read or the helper-built ones look like typos.
  const src = ['./struct.js', './lift.js', './arch.js']
    .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const ids = new Set([
    ...[...src.matchAll(/\bid:\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bcheck\(\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/\badd\(\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]),
  ]);
  ok(ids.size > 12, `the solver's vocabulary of check ids is a real one (${ids.size})`);

  // and the sample agrees with the source as far as it goes, so the regex is
  // reading the thing it claims to read rather than something that looks like it
  let seen = 0, unknown = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['k1', 'k2', 'k3']) {
      for (const c of verify(generate(resolveParams({ s, t })), HZ).checks) {
        if (!c.id) continue;
        seen++;
        if (!ids.has(c.id)) unknown++;
      }
    }
  }
  ok(seen > 100, `the cross-check saw a real number of live checks (${seen})`);
  ok(unknown === 0, `and every id a live solve emits is in the vocabulary (${unknown} missing)`);
  for (const key of Object.keys(REPAIRS)) {
    ok(ids.has(key), `the "${key}" rung is keyed on a check the solver actually emits`);
  }
  // and every rung is reachable in the other direction too: a check that governs
  // and has no rung is a roll that cannot be repaired, which is worth knowing
  const covered = Object.keys(REPAIRS);
  ok(covered.length >= 10, `the ladder covers a real spread of failure modes (${covered.length} rungs)`);

  // every move is well formed and names something legal
  for (const [id, rec] of Object.entries(REPAIRS)) {
    ok(rec.what && rec.what.length > 20, `${id}: the rung says what is actually wrong`);
    ok(rec.moves.length > 0, `${id}: has at least one move`);
    for (const mv of rec.moves) {
      ok(mv.why && mv.why.length > 20, `${id}/${mv.p}: every move says what it does structurally`);
      ok(mv.to != null || typeof mv.by === 'number', `${id}/${mv.p}: a move sets a value or shifts one`);
      if (mv.p === 'floor') ok(FLOOR_IDS.includes(mv.to), `${id}: "${mv.to}" is a real floor system`);
      if (mv.p === 'lateral') ok(LATERAL_IDS.includes(mv.to), `${id}: "${mv.to}" is a real lateral system`);
    }
  }
}

/* 2. MOVES GO THROUGH THE CODEC, and respect the bounds the sliders respect.
      Patching a parameter straight onto the object is how a floor system ends
      up with the previous system's storey height. */
{
  const p = resolveParams({ s: 'moves', t: 'office' });

  // a categorical move lands exactly where it was told to
  const lat = applyMove(p, { p: 'lateral', to: 'diagrid' });
  ok(lat && lat.lateral === 'diagrid', 'a lateral move sets the lateral system');
  ok(applyMove(lat, { p: 'lateral', to: 'diagrid' }) === null, 'and setting it to what it already is is a no-op');

  // CHANGING THE FLOOR RE-DERIVES THE STOREY HEIGHT, because the structural
  // depth changed. This is the one that would rot silently.
  const deep = applyMove({ ...p, floor: 'pt-flat' }, { p: 'floor', to: 'one-way' });
  ok(deep && deep.floor === 'one-way', 'a floor move sets the floor system');
  ok(deep && deep.floorH !== undefined, 'and the storey height comes back through the codec rather than being carried over');

  // a proportional move actually moves, and snaps the way its control snaps
  const fewer = applyMove(p, { p: 'levels', by: -0.15 });
  ok(fewer && fewer.levels < p.levels, `a −15 % levels move reduces the storeys (${p.levels} → ${fewer && fewer.levels})`);
  ok(Number.isInteger(fewer.levels), 'and leaves an integer number of them');
  const bay = applyMove(p, { p: 'bay', by: -0.12 });
  ok(bay && bay.bay < p.bay && Math.abs(bay.bay * 10 - Math.round(bay.bay * 10)) < 1e-9,
    'a bay move snaps to the 100 mm the slider uses');

  // BOUNDS. The ladder must not be able to grind a building down to nothing.
  let low = resolveParams({ s: 'floor-test', t: 'office' });
  for (let i = 0; i < 60; i++) {
    const nx = applyMove(low, { p: 'levels', by: -0.2 });
    if (!nx) break;
    low = nx;
  }
  ok(low.levels >= 1, `repeated reduction stops at a real building (${low.levels} storeys)`);
  let big = resolveParams({ s: 'floor-test', t: 'office' });
  for (let i = 0; i < 60; i++) {
    const nx = applyMove(big, { p: 'bx', by: 0.25 });
    if (!nx) break;
    big = nx;
  }
  ok(big.bx <= 20, `and repeated widening stops at the slider's own limit (${big.bx} bays)`);
}

/* 3. THE ROLL IS DETERMINISTIC. A roll that wobbles cannot be quoted, replayed
      or tested — and this is the property that lets the one unseeded thing on
      the surface stay the only one. */
{
  const a = rollWorkable({ rollKey: 'same', hazard: HZ, typology: 'office', budget: 12, repairs: 4 });
  const b = rollWorkable({ rollKey: 'same', hazard: HZ, typology: 'office', budget: 12, repairs: 4 });
  ok(a.query === b.query, 'the same roll key gives the same building');
  ok(a.tried === b.tried && a.repaired === b.repaired, 'and takes exactly the same path to it');
  const c = rollWorkable({ rollKey: 'other', hazard: HZ, typology: 'office', budget: 12, repairs: 4 });
  ok(c.query !== a.query, 'a different roll key gives a different building');

  // no bare randomness anywhere in the search
  const real = Math.random;
  Math.random = () => { throw new Error('unseeded randomness in the roller'); };
  try {
    rollWorkable({ rollKey: 'norandom', hazard: HZ, typology: 'housing', budget: 6, repairs: 3 });
    ok(true, 'the whole search runs with Math.random disabled');
  } catch (e) {
    ok(false, `the roller reached for Math.random — ${e.message}`);
  } finally { Math.random = real; }
}

/* 4. THE ROLLER DOES NOT MARK ITS OWN HOMEWORK. Every PASS is re-verified from
      scratch, from the permalink, by a fresh solve. */
{
  let rolled = 0, passed = 0, lied = 0, linkBroken = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const k of ['a', 'b', 'c', 'd']) {
      const r = rollWorkable({ rollKey: `${k}-${t}`, hazard: HZ, typology: t, budget: 16, repairs: 5 });
      rolled++;

      // THE PERMALINK SURVIVES. Re-open the link, regenerate, and it must be
      // the identical building — a search that produces something unlinkable
      // has broken the contract the whole surface rests on.
      const again = generate(resolveParams(r.query));
      if (JSON.stringify(again) !== JSON.stringify(r.building)) linkBroken++;

      if (!r.pass) continue;
      passed++;
      // and an INDEPENDENT verification agrees
      const s = scoreOf(again, verify(again, HZ));
      if (!s.pass) lied++;
    }
  }
  ok(rolled === TYPOLOGY_IDS.length * 4, `the sweep rolled every typology (${rolled})`);
  ok(linkBroken === 0, `every rolled building survives its own permalink (${linkBroken} broken)`);
  ok(lied === 0, `every PASS survives an independent re-solve (${lied} that did not)`);
  ok(passed >= rolled * 0.9, `and the roller finds a workable building nearly every time (${passed}/${rolled})`);
}

/* 5. IT IS WORTH DOING — the census, which is the whole argument. If a bare
      roll already worked most of the time this file would be dead weight, so
      the test asserts the problem it exists to solve is real. */
{
  const bare = census({ n: 36, hazard: HZ, key: 'worth' });
  ok(bare.rate < 0.7, `a bare roll fails often enough to be worth fixing (${Math.round(bare.rate * 100)} % pass)`);
  ok(Object.keys(bare.byGoverning).length > 0, 'and the failures name what governs them');
  // every failure mode the census turns up should have a rung, or the roller
  // cannot act on the most common thing it will actually meet
  for (const id of Object.keys(bare.byGoverning)) {
    ok(REPAIRS[id], `the ladder has a rung for "${id}", which the census actually produced`);
  }

  // and the repaired rate really is better than the bare rate
  let got = 0;
  for (let i = 0; i < 12; i++) {
    if (rollWorkable({ rollKey: 'beat-' + i, hazard: HZ, budget: 14, repairs: 5 }).pass) got++;
  }
  ok(got / 12 > bare.rate, `the coupled roller beats the bare rate (${Math.round(got / 12 * 100)} % vs ${Math.round(bare.rate * 100)} %)`);
}

/* 6. FAILURE IS HONEST. Starve the search and it must return the best it found,
      marked failing, with the governing check still attached — never a silent
      pass and never nothing. */
{
  // one candidate, no repairs, at a hazard that mostly fails
  let sawFail = false;
  for (let i = 0; i < 20 && !sawFail; i++) {
    const r = rollWorkable({ rollKey: 'starve-' + i, hazard: HZ, typology: 'office', budget: 1, repairs: 0 });
    if (!r.pass) {
      sawFail = true;
      ok(r.building && r.params, 'a failed roll still returns a building rather than nothing');
      ok(r.governing && r.governing.id, `and names what governs it (${r.governing.id})`);
      ok(r.worst > 1, `and the worst utilisation is honestly above one (${r.worst})`);
      ok(r.query && resolveParams(r.query).seed === r.params.seed, 'and it is still a permalink');
      const s = scoreOf(r.building, verify(r.building, HZ));
      ok(!s.pass, 'and an independent solve agrees it fails');
    }
  }
  ok(sawFail, 'starving the search really does produce a failure to inspect');
}

/* 7. WORKABILITY IS NOT A PROPERTY OF THE BUILDING. It is a property of the
      building AND the hazard, which is why the hazard has always been kept out
      of the seed's permalink. The roll records what it was judged against, and
      the same building is allowed to fail somewhere worse. */
{
  const r = rollWorkable({ rollKey: 'hz', hazard: MILD, typology: 'office', budget: 14, repairs: 4 });
  ok(r.hazard === MILD || JSON.stringify(r.hazard) === JSON.stringify(MILD),
    'the roll records the hazard it was judged against');
  ok(r.pass, 'and finds something workable in a mild place');

  // now judge that same building somewhere much worse. It is ALLOWED to fail —
  // what would be wrong is claiming it could not.
  const harsh = scoreOf(r.building, verify(r.building, HZ));
  ok(typeof harsh.pass === 'boolean', 'the same building can be re-judged against a worse hazard');
  ok(harsh.worst >= 0, 'and gets a real score there');
  // the permalink carries the building and NOT the hazard, which is the whole
  // reason this separation is worth keeping
  ok(!/seismic|wind|cat3|high/.test(r.query), 'and the hazard is not in the permalink');
}

/* 8. THE EDITS ARE LEGIBLE. A repaired building is not the seed's own building
      any more, and saying which knobs moved is the difference between a search
      and a black box. */
{
  const p = resolveParams({ s: 'edits', t: 'office' });
  ok(editsOf(p).length === 0, 'an untouched seed reports no edits');
  const other = LATERAL_IDS.find((q) => q !== p.lateral);
  const moved = applyMove(applyMove(p, { p: 'lateral', to: other }), { p: 'levels', by: -0.15 });
  const e = editsOf(moved);
  ok(e.length === 2, `two moves report two edits (${e.length})`);
  ok(e.every((q) => q.from !== q.to), 'and each names what it moved from and to');
  // and the edits are exactly what the permalink carries, which is what makes
  // them trustworthy rather than a parallel account
  const q = paramsToQuery(moved);
  ok(q.includes('lat=' + other) && /n=/.test(q), 'the same edits appear in the link');
}

console.log(`\nbrut/roller: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
