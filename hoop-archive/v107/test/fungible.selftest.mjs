// fungible.selftest.mjs — the v105 FUNGIBLE-KEEPER kernel: a gate satisfiable by ANY of several keepers.
//
//   node hoop/v107/test/fungible.selftest.mjs
//
// Pins: gateSettersMulti lists EVERY setter of a gate (deduped, id-sorted); gateSetters still returns one (for
// the oracle); nextKeeper returns the satisfier LIST + filters it to the reachable ones; requiredGateSetters
// gives the active tier's unmet gates each with their full setter-id list; and nextKeeper is back-compatible
// with the first-only map.

import { anchorChain, gateSetters, gateSettersMulti, nextKeeper, advanceState } from '../story/anchors.js';
import { requiredGateSetters } from '../story/solvable.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const anchor = (id, name, tier, gates, cleared) => ({
  id, type: 'npc', status: 'active', tags: ['wards', 'load_bearing'],
  content: { name: 'Room of ' + name, zone: 'wards', load_bearing: { tier, gates },
    npc: { name, dialogue: { start: 'greet', nodes: {
      greet: { says: 'hm', choices: [
        { id: 'ack', text: 'later', effects: { end: true } },
        { id: 'turnin', goto: 'turnin', text: 'ready', requires: { facts: Object.fromEntries(gates.map((g) => [g, true])) } },
      ] },
      turnin: { says: 'go', choices: [{ id: 'fin', text: 'done', effects: { end: true, set_facts: { [cleared]: true } } }] },
    } } } },
});
const keeper = (id, name, zone, navefac, flag) => ({
  id, type: 'npc', status: 'active', tags: [zone, navefac],
  content: { name: 'Room ' + id, zone, verb: 'mend', nave_faction: navefac,
    npc: { name, dialogue: { start: 'g', nodes: { g: { says: 'hi', choices: [
      { id: 'done', goto: 'g', text: 'ok', effects: { end: true, set_facts: { [flag]: true } } },
    ] } } } } },
});

// one gate, THREE satisfiers (the diversity case) + a second gate with one.
const GATE = 'flag.ward.rindwalker_known';
const content = [
  anchor('a-solen', 'Solen', 2, [GATE, 'flag.ward.drift_known'], 'flag.deck.wards.cleared'),
  keeper('kc', 'Kaelen Voss', 'wards', 'rindwalker', GATE),   // ids chosen so sort order is kc < kv < kz
  keeper('kv', 'Vasa Reld', 'wards', 'rindwalker', GATE),
  keeper('kz', 'Zeph Orin', 'wards', 'rindwalker', GATE),
  keeper('kd', 'Corin Vell', 'wards', 'drift', 'flag.ward.drift_known'),
];
const chain = anchorChain(content);

// ── 1. gateSettersMulti lists every satisfier; gateSetters keeps one ──
const multi = gateSettersMulti(content);
ok(multi[GATE].length === 3, 'gateSettersMulti lists all three satisfiers of the gate');
ok(multi[GATE].map((s) => s.contentId).join() === 'kc,kv,kz', 'satisfiers deduped + id-sorted (deterministic)');
ok(gateSetters(content)[GATE].contentId === 'kc', 'gateSetters (first-only) still returns one, for the oracle');
ok(multi['flag.ward.drift_known'].length === 1, 'a single-setter gate lists one');

// ── 2. duplicate set_facts on one keeper collapses (no double-count) ──
const dupKeeper = { id: 'kdup', type: 'npc', status: 'active', tags: ['wards', 'rindwalker'],
  content: { name: 'Room dup', zone: 'wards', nave_faction: 'rindwalker', npc: { name: 'Dup', dialogue: { start: 'g', nodes: { g: { choices: [
    { id: 'a', text: 'x', effects: { set_facts: { [GATE]: true } } },
    { id: 'b', text: 'y', effects: { set_facts: { [GATE]: true } } },
  ] } } } } } };
ok(gateSettersMulti([dupKeeper])[GATE].length === 1, 'a keeper that sets a gate on two choices counts once');

// ── 3. nextKeeper returns the satisfier LIST + the first at top level (back-compat fields) ──
const facts = {};
const nk = nextKeeper(chain, multi, facts, 2);
ok(nk && nk.flag === GATE, 'nextKeeper picks the first unmet gate');
ok(Array.isArray(nk.setters) && nk.setters.length === 3, 'nextKeeper carries the full satisfier list');
ok(nk.contentId === 'kc' && nk.name === 'Kaelen Voss', 'nextKeeper still exposes the first satisfier at top level');

// ── 4. reachability filters the satisfier list (only reachable ones survive) ──
const reachOnlyKv = (s) => s.contentId === 'kv';
const nk2 = nextKeeper(chain, multi, facts, 2, { reachable: reachOnlyKv });
ok(nk2.setters.length === 1 && nk2.contentId === 'kv', 'reachable predicate filters the list to reachable satisfiers');
const nkNone = nextKeeper(chain, multi, facts, 2, { reachable: () => false });
ok(nkNone.flag === GATE && nkNone.contentId === 'kc', 'when none reachable, falls back to the first unmet gate (never null while open)');

// ── 5. back-compat: nextKeeper still works on the first-only map ──
const nkSingle = nextKeeper(chain, gateSetters(content), facts, 2);
ok(nkSingle.contentId === 'kc' && nkSingle.setters.length === 1, 'nextKeeper wraps a first-only map as a 1-element list');

// ── 6. requiredGateSetters lists each unmet gate with ALL its setter ids ──
const req = requiredGateSetters(chain, multi, facts, 2);
ok(req.length === 2, 'both unmet gates reported');
const rk = req.find((r) => r.gate === GATE);
ok(rk && rk.setterIds.join() === 'kc,kv,kz', 'the fungible gate reports all three setter ids to place from');
// once the gate is met, it drops out
const met = requiredGateSetters(chain, multi, { [GATE]: true }, 2);
ok(met.length === 1 && met[0].gate === 'flag.ward.drift_known', 'a satisfied gate is no longer required');

console.log(`\nfungible.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
