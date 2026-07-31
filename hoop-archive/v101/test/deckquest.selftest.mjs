// deckquest.selftest.mjs — load-bearing NPC deck quests + the deck-stacking guarantee.
//   node hoop/v101/test/deckquest.selftest.mjs
//
// Proves: (1) crystallizing flag-bearing lore SETS the flag (engine.applyProduces); (2) a quest ripens
// only when every required flag is held, and pages once; (3) the deck-stacking algo means a player
// CANNOT draw forever without the required fragments — and front-runs pool exhaustion (vs. the unstacked
// baseline, where the producers come last); (4) the hidden turn-in tree opens only when ripe and its
// finish sets the clear flag → checkAdvance advances narrative_tier; (5) determinism.

import { MemoryStore, interact, dispatch, applyProduces } from '../story/engine.js';
import { talk, choose } from '../story/engine.js';
import { checkAdvance } from '../story/advance.js';
import {
  producedFlags, flagProducers, requiredFlagsForDeck, buildDeckQuest, outstandingFlags, isRipe,
  isFlagQuest, pageOnRipe, stackPriority, crystallizeForQuest, buildLoadBearingDialogue,
  deckClearMilestones, clearFlagFor, questState,
} from '../story/deckquest.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const lore = (id, flags, tags, extra = {}) => ({
  id, type: 'lore_fragment', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1,
  tags: tags || [], produces: flags ? { sets: flags } : undefined, content: { name: id, description: 'a fragment' }, ...extra,
});

// ── 1. flag-on-crystallize ────────────────────────────────────────────────────────────────────────────
{
  const pool = [lore('f-a', ['flag.curve_a'], ['curve'])];
  const s = new MemoryStore(pool, { features: [] });
  s.addFeature({ key: 'k0', type: 'lore_fragment' });
  ok(!s.getFact('p', 'flag.curve_a'), 'flag unset before touch');
  const r = interact(s, 'p', 'k0');
  ok(r.status === 'crystallized' && s.getFact('p', 'flag.curve_a') === true, 'crystallize SETS the lore flag');
  ok(r.leveled && JSON.stringify(r.leveled.flags_set) === '[["flag.curve_a",true]]', 'interact reports flags_set');
  // recall does not double-apply / does not error
  const r2 = interact(s, 'p', 'k0');
  ok(r2.status === 'recalled' && !r2.flags_set, 'recall does not re-fire the flag');
  // produces.set_facts (object form) too
  const s2 = new MemoryStore([{ ...lore('f-b'), produces: { set_facts: { 'flag.x': 'value' } } }], { features: [] });
  applyProduces(s2, 'p', s2.contentById('f-b'));
  ok(s2.getFact('p', 'flag.x') === 'value', 'produces.set_facts applies non-boolean values');
}

// ── 2. producedFlags / flagProducers / requiredFlagsForDeck ─────────────────────────────────────────────
{
  ok(producedFlags(lore('x', ['a', 'b'])).join() === 'a,b', 'producedFlags reads produces.sets');
  const idx = flagProducers([lore('p1', ['a']), lore('p2', ['a']), lore('p3', ['b'])]);
  ok(idx.get('a').join() === 'p1,p2' && idx.get('b').join() === 'p3', 'flagProducers indexes ids per flag, sorted');
  // authored flags win
  const authored = { id: 'curve', tier: 2, name: 'The Curve', learn: { count: 5 }, quest: { flags: ['flag.q1', 'flag.q2'] } };
  ok(requiredFlagsForDeck(authored, []).join() === 'flag.q1,flag.q2', 'authored deck.quest.flags win');
  // derived from themed producers, capped
  const deck = { id: 'curve', tier: 2, name: 'The Curve', rev: 'The Curve', learn: { count: 2, themes: ['curve'] } };
  const content = [lore('c1', ['flag.c1'], ['curve']), lore('c2', ['flag.c2'], ['curve']), lore('c3', ['flag.c3'], ['curve']), lore('n', ['flag.n'], ['nope'])];
  const rf = requiredFlagsForDeck(deck, content);
  ok(rf.length === 2 && rf.every((f) => f.startsWith('flag.c')), 'derived flags come from THEMED lore, capped to learn.count');
}

// ── 3. ripeness + paging ────────────────────────────────────────────────────────────────────────────────
{
  const deck = { id: 'curve', tier: 2, name: 'The Curve', quest: { flags: ['flag.a', 'flag.b'] } };
  const q = buildDeckQuest(deck, []);
  ok(isFlagQuest(q) && q.clearFlag === clearFlagFor('curve'), 'quest carries clearFlag');
  const s = new MemoryStore([], { features: [] });
  ok(outstandingFlags(s, 'p', q).length === 2 && !isRipe(s, 'p', q), 'starts with both flags outstanding, not ripe');
  s.setFact('p', 'flag.a', true);
  ok(outstandingFlags(s, 'p', q).length === 1 && !isRipe(s, 'p', q), 'one flag still outstanding → not ripe');
  ok(pageOnRipe(s, 'p', q) === null, 'no page before ripe');
  s.setFact('p', 'flag.b', true);
  ok(isRipe(s, 'p', q), 'both flags → ripe');
  const page = pageOnRipe(s, 'p', q);
  ok(page && page.deckId === 'curve', 'pages on first ripeness');
  ok(pageOnRipe(s, 'p', q) === null, 'paging is one-shot');
}

// ── 4. THE DECK-STACKING GUARANTEE ──────────────────────────────────────────────────────────────────────
// 20 distractor lores with unique tags (variety-preferred), inserted FIRST; 3 flag-producers sharing a
// dull tag, inserted LAST. Without stacking, the variety/order draw saves the producers for the end —
// the player draws ~20 distractors before any flag. With stacking, producers are forced as the pool
// tightens, so all flags land WELL before exhaustion. Each "explore step" crystallizes a fresh feature.
function makeWorld() {
  const pool = [];
  for (let i = 0; i < 20; i++) pool.push(lore('d' + i, null, ['uniq' + i]));   // distractors, no flags, unique tags
  pool.push(lore('pa', ['flag.a'], ['echo']));
  pool.push(lore('pb', ['flag.b'], ['echo']));
  pool.push(lore('pc', ['flag.c'], ['echo']));
  return pool;
}
const QUEST = buildDeckQuest({ id: 'curve', tier: 2, name: 'The Curve', quest: { flags: ['flag.a', 'flag.b', 'flag.c'] } }, []);
function explore({ stacked }) {
  const pool = makeWorld(), s = new MemoryStore(pool, { features: [] });
  let ripeAt = -1;
  const total = pool.length;
  for (let step = 0; step < total; step++) {
    const key = 'lk' + step; s.addFeature({ key, type: 'lore_fragment' });
    if (stacked) crystallizeForQuest(interact, s, 'p', key, QUEST, pool);
    else interact(s, 'p', key);   // no priorityIds → pure variety/order draw
    if (ripeAt < 0 && isRipe(s, 'p', QUEST)) ripeAt = step;
  }
  return { ripeAt, total };
}
const base = explore({ stacked: false });
const stk = explore({ stacked: true });
ok(base.ripeAt >= 0, `baseline eventually ripens (drawing the whole pool) — at step ${base.ripeAt}`);
ok(base.ripeAt >= 18, `baseline saves producers for the END (variety disfavours them) — ripe only at step ${base.ripeAt}`);
ok(stk.ripeAt >= 0 && stk.ripeAt < stk.total - 1, `stacked ripens BEFORE exhaustion — step ${stk.ripeAt} of ${stk.total}`);
ok(stk.ripeAt < base.ripeAt, `stacking front-runs the baseline (${stk.ripeAt} < ${base.ripeAt})`);

// the HARD guarantee, isolated: even with patience disabled, SAFETY forces the last producer so the flag
// can never be the never-drawn straggler. Drain the pool with patience=0 (only safety active).
{
  const pool = makeWorld(), s = new MemoryStore(pool, { features: [] });
  let ripe = false;
  for (let step = 0; step < pool.length; step++) {
    const key = 'sk' + step; s.addFeature({ key, type: 'lore_fragment' });
    crystallizeForQuest(interact, s, 'p', key, QUEST, pool, { patience: 0 });
    if (isRipe(s, 'p', QUEST)) { ripe = true; break; }
  }
  ok(ripe, 'safety-only stacking still guarantees the flags are obtained (cannot draw forever)');
}

// stackPriority only forces VALID draws — a producer locked behind a higher tier is not surfaced early.
{
  const pool = [lore('hi', ['flag.a'], ['echo'], { revelation_tier: 5 }), lore('d0', null, ['u'])];
  const s = new MemoryStore(pool, { features: [] });   // player rev_tier 1 → 'hi' illegal
  const pr = stackPriority(s, 'p', QUEST, pool, { patience: 99 });
  ok(!pr.includes('hi'), 'a tier-locked producer is never force-surfaced (only legal draws)');
}

// determinism
{
  const a = JSON.stringify(explore({ stacked: true })), b = JSON.stringify(explore({ stacked: true }));
  ok(a === b, 'stacked exploration is deterministic');
}

// ── 5. priorityIds in dispatch actually wins ────────────────────────────────────────────────────────────
{
  const pool = [lore('rich', null, ['t1', 't2', 't3']), lore('want', ['flag.a'], ['dull'])];
  const s = new MemoryStore(pool, { features: [] });
  const got = dispatch(s, 'p', 'lore_fragment', 1, { priorityIds: ['want'] });
  ok(got.length === 1 && got[0].id === 'want', 'priorityIds forces the chosen item over a higher-variety rival');
  // priority bypasses the tag filter (a forced flag matters regardless of room role)
  const s2 = new MemoryStore(pool, { features: [] });
  const got2 = dispatch(s2, 'p', 'lore_fragment', 1, { tag: 't1', priorityIds: ['want'] });
  ok(got2[0].id === 'want', 'priority bypasses the tag bias');
  // with no priorityIds, behaviour is unchanged (tag bias still applies)
  const s3 = new MemoryStore(pool, { features: [] });
  ok(dispatch(s3, 'p', 'lore_fragment', 1, { tag: 't1' })[0].id === 'rich', 'no priority → tag-biased variety pick (unchanged)');
}

// ── 6. the hidden turn-in tree + advancement ────────────────────────────────────────────────────────────
{
  const q = buildDeckQuest({ id: 'curve', tier: 2, name: 'The Curve', quest: { flags: ['flag.a', 'flag.b'] } }, []);
  const tree = buildLoadBearingDialogue(q, { greet: 'Go learn the Curve.', turnInSays: 'You saw it.', finishText: 'The floor is a ring.' });
  const npc = { id: 'guide', type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1, tags: [], content: { name: 'Sevin', dialogue: tree } };
  const s = new MemoryStore([npc], { features: [] });
  // before ripe → greet node, no finish choice
  const before = talk(s, 'p', 'guide');
  ok(before.node === 'greet' && !before.choices.some((c) => c.id === 'finish'), 'before ripe: greet node, turn-in hidden');
  // set the flags → ripe → talk opens at turnin with the finish choice
  s.setFact('p', 'flag.a', true); s.setFact('p', 'flag.b', true);
  const ripe = talk(s, 'p', 'guide');
  ok(ripe.node === 'turnin' && ripe.choices.some((c) => c.id === 'finish'), 'ripe: turn-in node reveals the finish choice');
  // finishing sets the clear flag → checkAdvance bumps narrative_tier to the next deck's tier
  s.setPlayerTier('p', 'narrative_tier', 2);   // player is on deck 2 (the Curve)
  choose(s, 'p', 'guide', 'finish');
  ok(s.getFact('p', clearFlagFor('curve')) === true, 'turn-in sets the deck clear flag');
  const adv = checkAdvance(s, 'p', deckClearMilestones());
  ok(s.getPlayerState('p').narrative_tier === 3, `clearing the load-bearing quest advances narrative_tier (now ${s.getPlayerState('p').narrative_tier})`);
  ok(adv.some((a) => a.axis === 'narrative_tier' && a.to === 3), 'checkAdvance reports the deck advance');
}

// ── 7. questState HUD shape ─────────────────────────────────────────────────────────────────────────────
{
  const q = buildDeckQuest({ id: 'curve', tier: 2, name: 'The Curve', hint: 'the curvature', quest: { flags: ['flag.a', 'flag.b'] } }, []);
  const s = new MemoryStore([lore('pa', ['flag.a'], ['echo']), lore('pb', ['flag.b'], ['echo'])], { features: [] });
  s.setFact('p', 'flag.a', true);
  const qs = questState(s, 'p', q, [s.contentById('pa'), s.contentById('pb')]);
  ok(qs.have === 1 && qs.need === 2 && qs.isFlagQuest && !qs.ripe, 'questState reports have/need + flags');
  ok(qs.outstanding.join() === 'flag.b', 'questState lists the outstanding flag');
}

console.log(`\ndeckquest.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
