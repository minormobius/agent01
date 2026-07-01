// node hoop/v101/test/threshold-flow.selftest.mjs
// RUNTIME FLOW: drive the exact witness → choose → descend transitions index.html performs at the
// upper-rind threshold, over a real MemoryStore + the live content pool — the integration the browser
// descent harness can't reliably reach. Mirrors noteFactionWitness / chooseFaction / the lower-rind gate.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore } from '../story/engine.js';
import { importWorldExport } from '../story/import.js';
import { factionOf } from '../story/chatter.js';
import { CHOICE_FACTIONS, WITNESS_TARGET, witnessCount, allWitnessed, chosenFaction, isChoiceFaction } from '../story/factionchoice.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

const HERE = dirname(fileURLToPath(import.meta.url));
const content = importWorldExport(JSON.parse(readFileSync(join(HERE, '../story/world_export.json'), 'utf8'))).content;
const store = new MemoryStore(content, { features: [] });
const PID = 'local';

// the engine has ≥WITNESS_TARGET upper-rind faction-tagged content items per faction to witness (supply)
const upper = content.filter((c) => (c.narrative_tier === 3) || (c.tags || []).some((t) => /^(rind|vessel|seven|mars|venus|mercury|jupiter)$/i.test(t)));
for (const f of CHOICE_FACTIONS) {
  const supply = upper.filter((c) => factionOf(c.tags) === f).length;
  ok(supply >= WITNESS_TARGET, `the pool has ≥${WITNESS_TARGET} ${f}-tagged upper-rind items to witness (${supply})`);
}

// mirror noteFactionWitness: crystallizing a faction-tagged item on the upper rind bumps fw.<faction> (capped)
function witness(item) {
  const facts = store.getFacts(PID);
  if (chosenFaction(facts) || allWitnessed(facts)) return;
  const f = factionOf(item.tags || []);
  if (!isChoiceFaction(f) || witnessCount(facts, f) >= WITNESS_TARGET) return;
  store.setFact(PID, 'fw.' + f, witnessCount(facts, f) + 1);
}
// witness three distinct items of each faction, drawn from the real pool
for (const f of CHOICE_FACTIONS) {
  const items = upper.filter((c) => factionOf(c.tags) === f).slice(0, WITNESS_TARGET);
  for (const it of items) witness(it);
  ok(witnessCount(store.getFacts(PID), f) === WITNESS_TARGET, `${f} witnessed ×${WITNESS_TARGET}`);
}
ok(allWitnessed(store.getFacts(PID)), 'all three witnessed → the threshold is ready');
ok(!chosenFaction(store.getFacts(PID)), 'not yet chosen');

// the lower-rind gate (index.html#maybeBuildLowerRind) requires a CHOICE — not open before choosing
ok(!chosenFaction(store.getFacts(PID)), 'lower rind GATED before the choice (chosenFaction null)');
ok((store.getPlayerState(PID).narrative_tier || 1) < 4, 'still tier 3 before the choice');

// mirror chooseFaction: pick the Drift → records the faction + advances to tier 4 (the Lower Rind)
function choose(faction) {
  if (!isChoiceFaction(faction)) return;
  store.setFact(PID, 'flag.chosen_faction', faction);
  if ((store.getPlayerState(PID).narrative_tier || 1) < 4) store.setPlayerTier(PID, 'narrative_tier', 4);
}
choose('drift');
ok(chosenFaction(store.getFacts(PID)) === 'drift', 'the Drift is chosen + recorded');
ok((store.getPlayerState(PID).narrative_tier || 1) === 4, 'choosing advances to tier 4 (the Lower Rind)');
ok(!!chosenFaction(store.getFacts(PID)), 'the lower-rind gate now PASSES (a faction is chosen → the deep opens)');

// witnessing/choosing is idempotent: re-witnessing post-choice does nothing
witness(upper.find((c) => factionOf(c.tags) === 'continuant'));
ok(chosenFaction(store.getFacts(PID)) === 'drift', 'post-choice witnessing does not disturb the choice');

console.log((bad ? '✗ ' : '✓ ') + 'threshold-flow.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
