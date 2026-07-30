// node hoop/v104/test/factionchoice.selftest.mjs
// The upper-rind threshold: witness each faction ×3, then choose — and the choice sticks.
import {
  CHOICE_FACTIONS, WITNESS_TARGET, FACTION_INFO,
  witnessCount, witnessDone, allWitnessed, chosenFaction, witnessProgress, isChoiceFaction,
} from '../story/factionchoice.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

// shape
ok(CHOICE_FACTIONS.length === 3, 'three choosable factions');
ok(WITNESS_TARGET === 3, 'witness each three times');
for (const f of CHOICE_FACTIONS) {
  ok(FACTION_INFO[f] && FACTION_INFO[f].label && FACTION_INFO[f].creed && FACTION_INFO[f].colours, f + ' has label/creed/colours prose');
}
ok(isChoiceFaction('drift') && !isChoiceFaction('saturn'), 'isChoiceFaction distinguishes nave factions from rind domains');

// fresh: nothing witnessed, not ready, not chosen
let facts = {};
ok(witnessCount(facts, 'drift') === 0, 'fresh: 0 witnesses');
ok(!allWitnessed(facts) && !chosenFaction(facts), 'fresh: threshold not ready, no choice');
ok(witnessProgress(facts).every((p) => p.n === 0 && !p.done), 'fresh progress is 0/0/0');

// witnessing accumulates, capped at the target
facts = { 'fw.continuant': 2 };
ok(witnessCount(facts, 'continuant') === 2 && !witnessDone(facts, 'continuant'), 'partial witness counts, not done');
facts = { 'fw.continuant': 5 };
ok(witnessCount(facts, 'continuant') === WITNESS_TARGET, 'witness count caps at the target');
ok(witnessDone(facts, 'continuant'), 'capped count is done');

// all three at target → threshold ready; one short → not
facts = { 'fw.continuant': 3, 'fw.rindwalker': 3, 'fw.drift': 2 };
ok(!allWitnessed(facts), 'two of three witnessed ×3 is NOT ready (drift short)');
facts = { 'fw.continuant': 3, 'fw.rindwalker': 3, 'fw.drift': 3 };
ok(allWitnessed(facts), 'all three witnessed ×3 → the threshold is ready');
ok(witnessProgress(facts).every((p) => p.done), 'progress reports all done');

// choosing sticks; only a real faction counts
facts = { ...facts, 'flag.chosen_faction': 'drift' };
ok(chosenFaction(facts) === 'drift', 'a chosen faction is recorded');
ok(chosenFaction({ 'flag.chosen_faction': 'saturn' }) === null, 'a non-nave-faction is not a valid choice');

console.log((bad ? '✗ ' : '✓ ') + 'factionchoice.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
