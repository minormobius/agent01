// node hoop/v100/test/factionquest.selftest.mjs
// The nave campaign: order is the gate, Drift is last, the Drift opens the rind.
import {
  FQ, FQ_ORDER, FQ_OPENS_RIND, fqStatus, fqActive, fqProgress,
  fqSignatureExclusive, fqOpensRind, fqCanWitness,
} from '../story/factionquest.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

// shape
ok(FQ_ORDER.length === 3, 'three factions');
ok(FQ_ORDER[FQ_ORDER.length - 1] === 'drift', 'drift is last in the order');
ok(FQ_OPENS_RIND === 'drift', 'the drift opens the rind');
for (const f of FQ_ORDER) {
  ok(FQ[f] && FQ[f].label && FQ[f].guide, f + ' has label + guide');
  ok(['govern', 'worship', 'learn', 'mend', 'grow', 'play', 'serve', 'heal', 'make', 'store', 'move', 'trade', 'dwell'].includes(FQ[f].signature), f + ' signature is a role');
  ok(FQ[f].seek && FQ[f].witness, f + ' has seek + witness prose');
}
// signature roles map to the nave's high-ward exclusives
ok(fqSignatureExclusive('continuant') === 'govern', 'continuant → govern');
ok(fqSignatureExclusive('rindwalker') === 'worship', 'rindwalker → worship');
ok(fqSignatureExclusive('drift') === 'learn', 'drift → learn');

// fresh game: nothing witnessed, continuant active, rind closed
let facts = {};
ok(fqActive(facts) === 'continuant', 'fresh: continuant active');
ok(fqProgress(facts).done === 0 && !fqProgress(facts).allDone, 'fresh: 0/3, not done');
ok(!fqOpensRind(facts), 'fresh: rind closed');

// the gate: only the active faction can be witnessed
ok(fqCanWitness(facts, 'continuant'), 'can witness the active faction');
ok(!fqCanWitness(facts, 'rindwalker'), 'cannot skip ahead to rindwalker');
ok(!fqCanWitness(facts, 'drift'), 'cannot skip ahead to drift');

// witness continuant → rindwalker becomes active, rind still closed
facts = { ...facts, 'fq.continuant': 'witnessed' };
ok(fqStatus(facts, 'continuant') === 'witnessed', 'continuant witnessed');
ok(fqActive(facts) === 'rindwalker', 'rindwalker now active');
ok(fqProgress(facts).done === 1, '1/3 after continuant');
ok(!fqOpensRind(facts), 'rind still closed after one');
ok(!fqCanWitness(facts, 'drift'), 'drift still gated after one');

// witness rindwalker → drift active, rind still closed
facts = { ...facts, 'fq.rindwalker': 'witnessed' };
ok(fqActive(facts) === 'drift', 'drift now active');
ok(fqCanWitness(facts, 'drift'), 'drift can now be witnessed');
ok(!fqOpensRind(facts), 'rind closed until drift');

// witness drift → all done, rind OPENS
facts = { ...facts, 'fq.drift': 'witnessed' };
ok(fqActive(facts) === null, 'no active faction once all witnessed');
ok(fqProgress(facts).allDone && fqProgress(facts).done === 3, '3/3 done');
ok(fqOpensRind(facts), 'witnessing the drift OPENS the rind');

console.log((bad ? '✗ ' : '✓ ') + 'factionquest.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
