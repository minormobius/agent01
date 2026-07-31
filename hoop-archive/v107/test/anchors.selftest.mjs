// anchors.selftest.mjs — the anchor-turn-in advancement derivation (hoopy's load-bearing model).
//   node hoop/v107/test/anchors.selftest.mjs
//
// Pins that the chain DERIVES correctly from his content shape, that gate→keeper mapping is honest, that
// cleared-flags drive the tier, and that the ending matrix resolves — using synthetic content shaped
// exactly like his live room_bundle anchors + keepers + conclusion plot_beats.

import {
  anchorChain, anchorForTier, gateSetters, advanceState, nextKeeper,
  tierFromClears, clearedFlagForTier, endingBeat, chosenDisposition, chosenFactionFlag,
} from '../story/anchors.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── synthetic content shaped like his live export (served form: npc nested under content.npc) ──
const anchor = (id, name, tier, zone, navefac, gates, turninChoice) => ({
  id, type: 'npc', status: 'active', tags: [zone, navefac, 'load_bearing'],
  content: {
    name: 'Room of ' + name, zone, nave_faction: navefac, verb: 'mend',
    load_bearing: { tier, gates },
    npc: { name, dialogue: { start: 'greet', nodes: {
      greet: { says: 'hm', choices: [
        { id: 'ack', text: 'later', effects: { end: true } },
        { id: 'turnin', goto: 'turnin', text: 'I am ready.', requires: { facts: Object.fromEntries(gates.map((g) => [g, true])) } },
      ] },
      turnin: { says: 'go on', choices: [turninChoice] },
    } } },
  },
});
const keeper = (id, name, zone, verb, navefac, flag) => ({
  id, type: 'npc', status: 'active', tags: [zone, navefac, verb],
  content: { name: 'Room ' + id, zone, verb, nave_faction: navefac,
    npc: { name, dialogue: { start: 'g', nodes: { g: { says: 'hi', choices: [
      { id: 'done', goto: 'g', text: 'I see.', effects: { end: true, set_facts: { [flag]: true } } },
    ] } } } } },
});
const conclusion = (id, name, faction, disp) => ({ id, type: 'plot_beat', status: 'active',
  tags: ['conclusion', faction, disp], content: { name } });

const content = [
  anchor('a-olo', 'Olo', 1, 'commons', 'drift',
    ['flag.commons.drift_face', 'flag.commons.continuant_face'],
    { id: 'finish', text: 'done', effects: { end: true, set_facts: { 'flag.deck.commons.cleared': true } } }),
  anchor('a-sevin', 'Sevin', 3, 'upper_rind', 'rindwalker',
    ['flag.rind.drift_scale_a'],
    { id: 'drift', text: 'drift', effects: { end: true, set_facts: { 'flag.chose.drift': true, 'flag.deck.upper_rind.cleared': true } } }),
  anchor('a-luna', 'Luna', 4, 'lower_rind', 'luna',
    ['flag.signal.it_responds'],
    { id: 'answer', text: 'answer', effects: { end: true, set_facts: { 'flag.signal.disposition': 'answer', 'flag.deck.lower_rind.cleared': true } } }),
  keeper('k1', 'Joren Vael', 'commons', 'govern', 'continuant', 'flag.commons.continuant_face'),
  keeper('k2', 'Miren Tallow', 'commons', 'learn', 'drift', 'flag.commons.drift_face'),
  keeper('k3', 'Miren Voss', 'upper_rind', 'learn', 'drift', 'flag.rind.drift_scale_a'),
  keeper('k4', 'Silas Vane', 'lower_rind', 'worship', 'rindwalker', 'flag.signal.it_responds'),
  conclusion('pb1', 'The Current’s Reply', 'drift', 'answer'),
  conclusion('pb2', 'The Closed Channel', 'continuant', 'refuse'),
];

// ── 1. the chain derives, ordered by tier, with cleared-flags read off the turn-in node ──
const chain = anchorChain(content);
ok(chain.length === 3, 'three load_bearing anchors found');
ok(chain.map((a) => a.tier).join() === '1,3,4', 'anchors ordered by tier');
ok(chain[0].name === 'Olo' && chain[0].clearedFlag === 'flag.deck.commons.cleared', 'Olo: cleared flag from turn-in set_facts');
ok(chain[0].clearedDeck === 'commons', 'Olo: cleared deck parsed');
ok(chain[0].next && chain[0].next.name === 'Sevin', 'Olo chains to the next anchor');
ok(chain[2].next === null, 'last anchor has no next');
ok(chain[1].choiceFlags.includes('flag.chose.drift'), 'Sevin captures its faction-choice flag');
ok(chain[2].choiceFlags.includes('flag.signal.disposition'), 'Luna captures the disposition flag');

// ── 2. anchorForTier indexes by the active tier ──
ok(anchorForTier(chain, 1).name === 'Olo' && anchorForTier(chain, 3).name === 'Sevin', 'anchorForTier picks the active anchor');
ok(anchorForTier(chain, 2) === null, 'a tier with no anchor returns null (the climb runs through it)');

// ── 3. gate→keeper setter map is honest ──
const setters = gateSetters(content);
ok(setters['flag.commons.continuant_face'].name === 'Joren Vael', 'gate setter: continuant_face ← Joren Vael');
ok(setters['flag.commons.drift_face'].zone === 'commons' && setters['flag.commons.drift_face'].verb === 'learn', 'gate setter carries zone + verb for the waypoint');
ok(!setters['flag.deck.commons.cleared'], 'a deck-clear flag is NOT a gate setter');
ok(!setters['flag.chose.drift'], 'a choice flag is NOT a gate setter');

// ── 4. advanceState: gates met / turn-in availability / turned-in ──
let facts = {};
let st = advanceState(chain, facts, 1);
ok(st.gatesTotal === 2 && st.gatesSet === 0 && !st.allGatesSet, 'tier 1: no gates met yet');
ok(nextKeeper(chain, setters, facts, 1).name && st.unmetGates.length === 2, 'nextKeeper points at an unmet gate setter');
facts['flag.commons.drift_face'] = true;
st = advanceState(chain, facts, 1);
ok(st.gatesSet === 1 && nextKeeper(chain, setters, facts, 1).flag === 'flag.commons.continuant_face', 'nextKeeper advances to the remaining gate');
facts['flag.commons.continuant_face'] = true;
st = advanceState(chain, facts, 1);
ok(st.allGatesSet && !st.turnedIn, 'all gates met → turn-in available, not yet turned in');
ok(nextKeeper(chain, setters, facts, 1) === null, 'no keeper to find once all gates are met');

// ── 4b. nextKeeper reachability (the Factor Solen bug): prefer a keeper whose ward is open ──
let f2 = {};
const first = nextKeeper(chain, setters, f2, 1);                                    // no opts → first unmet
const other = ['flag.commons.drift_face', 'flag.commons.continuant_face'].find((g) => g !== first.flag);
// v105: the reachable predicate is called on a SETTER (contentId/navefac/zone), not a {flag,...} keeper —
// matching the surface's keeperReachable. Only the OTHER gate's setter is "reachable" here.
const otherSetterId = setters[other].contentId;
const reach = (s) => s.contentId === otherSetterId;
ok(nextKeeper(chain, setters, f2, 1, { reachable: reach }).flag === other, 'nextKeeper skips the unreachable first gate for a reachable later one');
ok(nextKeeper(chain, setters, f2, 1, { reachable: () => false }).flag === first.flag, 'when NO gate is reachable, nextKeeper falls back to the first unmet (never null while a gate is open)');
ok(nextKeeper(chain, setters, f2, 1, { reachable: () => true }).flag === first.flag, 'when all are reachable, nextKeeper keeps the first unmet (back-compat order)');
ok(nextKeeper(chain, setters, f2, 1).flag === first.flag, 'no reachable predicate → identical to before (back-compat)');

// ── 5. the level-up: cleared flag → tier+1 (capped) ──
ok(tierFromClears(chain, facts, 1) === 1, 'gates met but NOT turned in → tier unchanged');
facts['flag.deck.commons.cleared'] = true;
ok(tierFromClears(chain, facts, 1) === 2, 'Olo turn-in (tier 1) advances to narrative 2');
ok(advanceState(chain, facts, 1).turnedIn, 'advanceState reports turnedIn after the clear flag');
facts['flag.deck.upper_rind.cleared'] = true;
ok(tierFromClears(chain, facts, 1) === 4, 'Sevin turn-in (tier 3) advances to narrative 4 (highest clear wins)');
ok(tierFromClears(chain, facts, 1, 4) === 4 && tierFromClears(chain, { 'flag.deck.lower_rind.cleared': true }, 1, 5) === 5, 'cap clamps the tier');
ok(clearedFlagForTier(chain, 3) === 'flag.deck.upper_rind.cleared', 'clearedFlagForTier maps tier→its anchor clear flag');

// ── 6. choice readers ──
ok(chosenFactionFlag({ 'flag.chose.drift': true }) === 'drift', 'chosenFactionFlag reads flag.chose.<faction>');
ok(chosenFactionFlag({ 'flag.chose.drift': false }) === null, 'a false choice flag does not count');
ok(chosenDisposition({ 'flag.signal.disposition': 'answer' }) === 'answer', 'chosenDisposition reads the disposition');
ok(chosenDisposition({ 'flag.signal.disposition': 'nonsense' }) === null, 'an unknown disposition is rejected');

// ── 7. the ending matrix: (faction, disposition) → the conclusion plot_beat ──
ok(endingBeat(content, 'drift', 'answer').id === 'pb1', 'ending: drift+answer → The Current’s Reply');
ok(endingBeat(content, 'continuant', 'refuse').id === 'pb2', 'ending: continuant+refuse → The Closed Channel');
ok(endingBeat(content, 'drift', 'suppress').id === 'pb1', 'ending falls back to faction-only when no exact disposition match');
ok(endingBeat([], 'drift', 'answer') === null, 'no conclusion beats → null (procedural fallback)');

console.log(`\nanchors.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
