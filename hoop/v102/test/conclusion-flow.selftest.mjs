// node hoop/v102/test/conclusion-flow.selftest.mjs
// RUNTIME FLOW: drive the chapter close the way index.html does — gather chamber-lore in the lower rind →
// locate the chamber → Luna's contact → the decision → an ending weighed against the real seen-set. The
// browser can't reach the lower rind reliably (blind canvas descent), so prove the transitions in node.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore } from '../story/engine.js';
import { importWorldExport } from '../story/import.js';
import {
  CHAMBER_LORE_TARGET, chamberLore, signalLocated, chapterComplete, finalChoice,
  FINAL_CHOICES, weighJourney, concludeEnding,
} from '../story/conclusion.js';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error('  ✗ ' + m); } };

const HERE = dirname(fileURLToPath(import.meta.url));
const content = importWorldExport(JSON.parse(readFileSync(join(HERE, '../story/world_export.json'), 'utf8'))).content;
const store = new MemoryStore(content, { features: [] });
const PID = 'local';

// the journey so far: a Drift player who witnessed all three at the upper-rind threshold
store.setFact(PID, 'flag.chosen_faction', 'drift');
for (const f of ['continuant', 'rindwalker', 'drift']) store.setFact(PID, 'fw.' + f, 3);

// mirror index.html#loreSeenTotal off the engine's seen-set
const loreSeenTotal = () => {
  const all = [...store.content.values()].filter((c) => c.type === 'lore_fragment');
  const seen = new Set(store.getPlayerState(PID).seen_ids || []);
  return { loreSeen: all.filter((c) => seen.has(c.id)).length, loreTotal: all.length };
};
ok(loreSeenTotal().loreTotal > 0, 'the pool has lore_fragments to weigh');

// mirror noteChamberLore: crystallizing content in the lower rind gathers chamber-lore (capped)
function gatherChamberLore() {
  const facts = store.getFacts(PID);
  if (signalLocated(facts) || chapterComplete(facts)) return;
  store.setFact(PID, 'cl.gathered', chamberLore(facts) + 1);
}
ok(!signalLocated(store.getFacts(PID)), 'fresh lower rind: chamber not located');
gatherChamberLore(); gatherChamberLore();
ok(chamberLore(store.getFacts(PID)) === 2 && !signalLocated(store.getFacts(PID)), 'two fragments: still not located');
gatherChamberLore();
ok(signalLocated(store.getFacts(PID)), `three fragments (target ${CHAMBER_LORE_TARGET}) → the chamber is located`);

// also mark some lore seen (the engine's markSeen happens on crystallize) so the weigh-up has substance
const lore = [...store.content.values()].filter((c) => c.type === 'lore_fragment').slice(0, 7);
for (const c of lore) store.markSeen(PID, c.id);
ok(loreSeenTotal().loreSeen === 7, 'seen-set tracks crystallized lore for the weigh-up');

// mirror concludeChapter: record the decision + complete the chapter, weigh the journey, fit the ending
function concludeChapter(choiceId) {
  if (!FINAL_CHOICES.some((c) => c.id === choiceId)) return null;
  store.setFact(PID, 'flag.final_choice', choiceId);
  store.setFact(PID, 'flag.chapter_complete', true);
  return concludeEnding(choiceId, weighJourney(store.getFacts(PID), loreSeenTotal()));
}
const ending = concludeChapter('carry');   // the Drift's resonant choice
ok(finalChoice(store.getFacts(PID)) === 'carry', 'the decision is recorded');
ok(chapterComplete(store.getFacts(PID)), 'the chapter is complete');
ok(ending && /Chapter One/.test(ending.title) && ending.review && ending.close, 'an ending is produced (title + review + close)');
ok(/did not waver/.test(ending.close), 'the Drift choosing "carry" reads as conviction (aligned)');

// the differences are the player's: a different decision yields a different close
const other = concludeEnding('withhold', weighJourney(store.getFacts(PID), loreSeenTotal()));
ok(other.close !== ending.close, 'a different decision → a different ending');

console.log((bad ? '✗ ' : '✓ ') + 'conclusion-flow.selftest — ' + (n - bad) + '/' + n + ' checks');
process.exit(bad ? 1 : 0);
