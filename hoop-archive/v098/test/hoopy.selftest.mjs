// hoopy.selftest.mjs — the deck spine + hoopybot leveling oracle.
//
//   node hoop/v096/test/hoopy.selftest.mjs
//
// Pins: the 5 decks map to the 5 narrative tiers; countsForDeck recognises themed/revelation content;
// hoopybot's assess() counts the RIGHT encounters and flips `ready` at the goal; the level message names
// the deck + guide; guides cycle the opening cast.

import { DECKS, DECK_COUNT, deckForTier, nextDeck, countsForDeck, guideForTier } from '../story/decks.js';
import { assess, learnedForDeck, levelMessage, guideFor } from '../story/hoopy.js';
import { MemoryStore, interact } from '../story/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the deck spine ──
ok(DECK_COUNT === 5, 'five decks');
ok(DECKS.every((d, i) => d.tier === i + 1), 'decks are tier 1..5 in order');
ok(DECKS.every((d) => d.character && d.character.length > 60 && d.hook && d.learn && d.learn.count >= 1), 'every deck is hand-written (character + hook + learn goal)');
ok(deckForTier(1).id === 'nave' && deckForTier(3).id === 'rind' && deckForTier(5).id === 'bay14', 'deckForTier maps tiers to the right decks');
ok(deckForTier(99).tier === 5 && deckForTier(0).tier === 1, 'deckForTier clamps');
ok(nextDeck(1).tier === 2 && nextDeck(5) === null, 'nextDeck walks the climb and ends at the top');

// ── 2. countsForDeck: the "right things" rule ──
const nave = deckForTier(1);
ok(countsForDeck({ id: 'a', tags: ['market', 'nave'] }, nave), 'tag overlap counts');
ok(countsForDeck({ id: 'b', tags: ['x'], revelation_hint: 'Tier 1: The Ordinary' }, nave), 'matching revelation_hint counts');
ok(!countsForDeck({ id: 'c', tags: ['signal', 'rind'] }, nave), 'off-theme content does not count for the Nave');
ok(countsForDeck({ id: 'd', tags: ['signal', 'rind'] }, deckForTier(3)), 'rind/signal counts for the Rind deck');

// ── 3. hoopybot assess: counts distinct right encounters, flips ready at the goal ──
{
  const pool = [];
  // 5 on-theme tier-1 npcs (Nave) + 3 off-theme (rind) — only the on-theme count for the Nave goal.
  for (let i = 0; i < 5; i++) pool.push({ id: 'nv' + i, type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: ['nave', 'maintenance'], content: { name: 'Continuant ' + i, description: 'a nave worker' } });
  for (let i = 0; i < 3; i++) pool.push({ id: 'rd' + i, type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: ['rind', 'signal'], content: { name: 'Diver ' + i, description: 'a rind diver' } });
  const s = new MemoryStore(pool, { features: [] });
  const a0 = assess(s, 'p', nave);
  ok(a0.learned === 0 && !a0.ready && a0.needed === nave.learn.count, 'fresh: nothing learned, not ready');

  // encounter the 3 OFF-theme ones — should NOT move the Nave goal
  for (let i = 0; i < 3; i++) { s.addFeature({ key: 'kr' + i, type: 'npc', content_id: 'rd' + i }); interact(s, 'p', 'kr' + i); }
  ok(assess(s, 'p', nave).learned === 0, 'off-theme encounters do not count toward the Nave');

  // encounter the on-theme ones one at a time until ready
  for (let i = 0; i < 5; i++) { s.addFeature({ key: 'kn' + i, type: 'npc', content_id: 'nv' + i }); interact(s, 'p', 'kn' + i); }
  const a1 = assess(s, 'p', nave);
  ok(a1.learned === 5 && a1.ready, `on-theme encounters count; ready at the goal (${a1.learned}/${a1.needed})`);
  ok(a1.progress === 1, 'progress saturates at 1');
  ok(learnedForDeck(s, 'p', nave).size === 5, 'learnedForDeck returns the distinct counted ids');
}

// ── 4. the customized page + guide cycling ──
const cast = [{ id: 'g1', content: { name: 'Taryn Solis' } }, { id: 'g2', content: { name: 'Corin Vael' } }, { id: 'g3', content: { name: 'Miren Tal' } }];
ok(guideForTier(cast, 1).id === 'g1' && guideForTier(cast, 2).id === 'g2' && guideForTier(cast, 4).id === 'g1', 'guides cycle the opening cast per tier');
const msg = levelMessage(nave, 'Taryn Solis');
ok(/Taryn Solis/.test(msg) && /The Nave/.test(msg) && /The Curve/.test(msg), 'the page names the deck, the guide, and the next rung');
ok(/choice/.test(levelMessage(deckForTier(5), 'X')), 'the final deck has no next rung — only the choice');
ok(guideFor(cast, 3).id === 'g3', 'guideFor re-exports the tier guide');

console.log(`\nhoopy.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
