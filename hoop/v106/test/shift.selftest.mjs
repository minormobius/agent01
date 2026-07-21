// shift.selftest.mjs — v106 PRODUCTION SHIFTS: the factory quests from Sevin's keepers.
//
//   node hoop/v106/test/shift.selftest.mjs
//
// Pins the whole contract:
//   • the SELECTION: a keeper's white thread's role picks the generator (dispatch/gate→haul ·
//     perfusion/telemetry→fix · schedule/inventory→audit), deterministic from (world seed, keeper,
//     thread) — same inputs, same quest, forever; a different seed re-deals the board;
//   • the ORACLE: over a sweep (seeds × all six threads × several keepers) EVERY offered shift
//     proves solvable (steps exist, every leg routes on the analytic weave, hauls ride real
//     supply-chain edges, fix lenses are two distinct OTHER whites, audits stay on their ring);
//   • the WAGE IS ROUTER-PRICED: pay ∝ crossings (a longer weave-walk pays strictly more);
//   • the PROGRESS MACHINE: ordered arrivals advance, out-of-order arrivals don't, the repair act
//     counts only from the fault-reached baseline, ready ⇒ turn-in;
//   • the GUARDS: ambient / load-bearing / retired / opted-out keepers and non-white threads never
//     offer.

import { prepareWeaveDeck } from '../rindweave/pocketdeck.js';
import { buildWeaveNav } from '../rindweave/weavenav.js';
import { shiftFor, proveShift, shiftProgress, shiftArrive, KIND_BY_ROLE, haulEdges, fixSites } from '../story/shift.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const npc = (id) => ({ id, type: 'npc', status: 'active', content: { name: id } });

// ── 0. the raw pools are big enough to be a "huge set of possible combinations" ──
ok(haulEdges().length >= 8, `haul pool: ${haulEdges().length} supply-chain edges walkable as pockets`);
ok(fixSites().length === 20, `fix pool: 20 fault sites (6 halls + 2 rings + 12 antechambers)`);

// ── 1. THE SWEEP: every generated shift proves solvable, across seeds × threads × keepers ──
const SEEDS = Array.from({ length: 30 }, (_, i) => (i * 2654435761 + 7) >>> 0);
let generated = 0, kinds = { haul: 0, fix: 0, audit: 0 };
const seenTitles = new Set();
for (const seed of SEEDS) {
  const st = prepareWeaveDeck(seed, { cx: 24450, cy: 300 });
  const nav = buildWeaveNav(st);
  for (let w = 0; w < 6; w++) {
    const tk = 'W' + w, role = st.geo.warps[w].id;
    for (const id of ['npc:aldous', 'npc:brakhet', 'npc:corvane']) {
      const q = shiftFor(st, nav, npc(id), tk);
      if (!q) { fail++; console.error(`  ✗ no shift for ${id} on ${tk} @ seed ${seed}`); continue; }
      generated++; kinds[q.kind]++;
      seenTitles.add(q.kind + '|' + q.title + '|' + q.steps.map((s) => s.key).join(','));
      const pv = proveShift(st, nav, q);
      if (!pv.ok) { fail++; console.error(`  ✗ unprovable shift (${q.kind}) for ${id}/${tk}@${seed}: ${pv.errors.join(', ')}`); }
      else pass++;
      if (q.kind !== KIND_BY_ROLE[role]) { fail++; console.error(`  ✗ kind ${q.kind} ≠ role map for ${role}`); } else pass++;
    }
  }
}
ok(generated === SEEDS.length * 6 * 3, `every keeper on every thread got a shift (${generated}/${SEEDS.length * 6 * 3})`);
ok(kinds.haul > 0 && kinds.fix > 0 && kinds.audit > 0, `all three generators fired (haul ${kinds.haul} · fix ${kinds.fix} · audit ${kinds.audit})`);
ok(seenTitles.size >= 60, `the combination space is real: ${seenTitles.size} distinct quests over the sweep`);

// ── 2. determinism + per-seed re-deal ──
{
  const stA = prepareWeaveDeck(7, { cx: 24450, cy: 300 }), navA = buildWeaveNav(stA);
  const stB = prepareWeaveDeck(7, { cx: 24450, cy: 300 }), navB = buildWeaveNav(stB);
  const qa = shiftFor(stA, navA, npc('npc:aldous'), 'W4'), qb = shiftFor(stB, navB, npc('npc:aldous'), 'W4');
  ok(JSON.stringify(qa) === JSON.stringify(qb), 'same (seed, keeper, thread) → the identical shift');
  const stC = prepareWeaveDeck(99, { cx: 24450, cy: 300 }), navC = buildWeaveNav(stC);
  const qc = shiftFor(stC, navC, npc('npc:aldous'), 'W4');
  ok(qc && JSON.stringify(qc.steps) !== JSON.stringify(qa.steps) || (qc && qc.title !== qa.title), 'a new world seed re-deals the keeper\'s shift');
}

// ── 3. the wage is router-priced ──
{
  const st = prepareWeaveDeck(7, { cx: 24450, cy: 300 }), nav = buildWeaveNav(st);
  const wages = [];
  for (const id of ['npc:a', 'npc:b', 'npc:c', 'npc:d', 'npc:e', 'npc:f', 'npc:g', 'npc:h']) {
    const q = shiftFor(st, nav, npc(id), 'W2');   // W2 = a haul thread? role depends on warp order — use whatever fires
    if (q) wages.push([q.crossings, q.wage]);
  }
  ok(wages.every(([c, w]) => w >= 4 + 2 * c), 'wage grows with the route (pay ∝ crossings, floor respected)');
  const sorted = [...wages].sort((a, b) => a[0] - b[0]);
  ok(sorted.length < 2 || sorted[sorted.length - 1][1] >= sorted[0][1], 'more crossings never pays less');
}

// ── 4. the progress machine ──
{
  const st = prepareWeaveDeck(7, { cx: 24450, cy: 300 }), nav = buildWeaveNav(st);
  // find a FIX shift (rindwalker threads: perfusion/telemetry)
  let q = null;
  for (let w = 0; w < 6 && !q; w++) if (KIND_BY_ROLE[st.geo.warps[w].id] === 'fix') q = shiftFor(st, nav, npc('npc:fixer'), 'W' + w);
  ok(!!q, 'a fix shift generates');
  const entry = { kind: q.kind, title: q.title, wage: q.wage, ordered: q.ordered, act: q.act, actBase: null, steps: q.steps.map((s) => ({ ...s, done: false })) };
  const facts = { ['act.' + q.act.kind]: 3 };
  // out-of-order arrival (the SITE before the lenses) does nothing on an ordered quest
  ok(shiftArrive(entry, q.steps[2].key, facts) === null, 'ordered quest: the fault site does not count before the lenses');
  ok(shiftArrive(entry, q.steps[0].key, facts) !== null, 'lens A arrival counts');
  ok(shiftArrive(entry, q.steps[0].key, facts) === null, 'a repeat arrival is a no-op');
  ok(shiftArrive(entry, q.steps[1].key, facts) !== null, 'lens B arrival counts');
  const res = shiftArrive(entry, q.steps[2].key, facts);
  ok(res && res.reachedSite === true && entry.actBase === 3, 'reaching the fault snapshots the act baseline');
  let pr = shiftProgress(entry, facts);
  ok(pr.allSteps && !pr.ready && pr.actCount === 0, 'steps done, repair still owed — not ready');
  pr = shiftProgress(entry, { ['act.' + q.act.kind]: 4 });
  ok(pr.ready && pr.actCount === 1, 'one repair act after the baseline → ready to report');
  // an AUDIT is order-free
  let qa = null;
  for (let w = 0; w < 6 && !qa; w++) if (KIND_BY_ROLE[st.geo.warps[w].id] === 'audit') qa = shiftFor(st, nav, npc('npc:auditor'), 'W' + w);
  const ea = { kind: qa.kind, title: qa.title, wage: qa.wage, ordered: qa.ordered, act: null, actBase: null, steps: qa.steps.map((s) => ({ ...s, done: false })) };
  ok(shiftArrive(ea, qa.steps[2].key, {}) !== null, 'audit: the last antechamber counts first (any order — it\'s a loop)');
  shiftArrive(ea, qa.steps[0].key, {}); shiftArrive(ea, qa.steps[1].key, {});
  ok(shiftProgress(ea, {}).ready, 'audit ready after all three antechambers, no act owed');
}

// ── 5. the guards ──
{
  const st = prepareWeaveDeck(7, { cx: 24450, cy: 300 }), nav = buildWeaveNav(st);
  ok(shiftFor(st, nav, { ...npc('npc:x'), content: { ambient: true } }, 'W0') === null, 'ambient wanderers never offer');
  ok(shiftFor(st, nav, { ...npc('npc:x'), content: { load_bearing: true } }, 'W0') === null, 'anchors guide — no shifts');
  ok(shiftFor(st, nav, { ...npc('npc:x'), status: 'retired' }, 'W0') === null, 'the retired set no shifts');
  ok(shiftFor(st, nav, { ...npc('npc:x'), content: { shift: false } }, 'W0') === null, 'the per-bundle kill switch holds');
  ok(shiftFor(st, nav, npc('npc:x'), 'P3') === null, 'a production thread is not a giver seat');
  ok(shiftFor(st, nav, npc('npc:x'), null) === null, 'no thread, no shift');
}

console.log(`shift.selftest: ${pass} passed, ${fail} failed (${generated} shifts generated, ${seenTitles.size} distinct)`);
if (fail) process.exit(1);
