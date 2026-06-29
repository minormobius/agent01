// hoop/v100/story/deckquest.js — LOAD-BEARING NPC quests + the deck-stacking guarantee. Pure, no DOM/LLM.
//
// hoopy's spec: "one [NPC] per deck. They block advancement to the next deck. They give you an
// informational quest. Each quest is structured as 'you gather lore until the following flags are set.'
// The flags are determined by lore you gather — when you crystallize a content item, the lore may come
// with a flag, set at that time. Once the quest's prerequisite flags are complete, the quest is ripe and
// ready to turn in. You get paged by the NPC. The next time you talk to them, you see a previously hidden
// dialogue tree that lets you finish the quest, gated by the existing flag-gating mechanism."
//
// The pieces, and where each lives:
//   • SET the flag on crystallize           → engine.js#applyProduces (a content item's `produces.sets`)
//   • a quest = required flags + clear/page  → buildDeckQuest (here), one per decks.js deck
//   • RIPE when all required flags held      → isRipe / pageOnRipe (here)
//   • the hidden, flag-gated TURN-IN tree    → buildLoadBearingDialogue (here) — reuses engine.js's
//                                              entries[{when}] state-gated entry + requires.facts choices
//   • turn-in ADVANCES the deck (blocks it)  → deckClearMilestones → advance.js#checkAdvance (narrative_tier)
//   • THE DECK-STACKING GUARANTEE            → stackPriority (here) — hoopy flagged this one as mine:
//     "make sure the player doesn't draw forever without receiving the relevant fragments — start
//      stacking the deck at some point if necessary. Simple algo." It is, and it's below.
//
// Deterministic + inference-free, like the rest of the spine: a given (player-state, pool) always yields
// the same outstanding flags, the same forced producers, the same verdict. No Date.now, no random.

import { loadGateState, meetsState } from './engine.js';
import { DECKS, nextDeck, countsForDeck, guideForTier } from './decks.js';

export const DECK_QUEST_PREFIX = 'flag.deck.';
export const clearFlagFor = (deckId) => DECK_QUEST_PREFIX + deckId + '.cleared';   // turn-in sets this → advances the deck
export const pagedFlagFor = (deckId) => DECK_QUEST_PREFIX + deckId + '.paged';     // one-shot "you've been paged" latch
export const LORE_TYPE = 'lore_fragment';

// the flags a content item FIRES on crystallize (the same `produces` field engine.js applies + gates.js
// reachability-checks): `produces.sets` (names) ∪ keys of `produces.set_facts`.
export function producedFlags(ci) {
  const pr = (ci && ci.produces) || {}, out = [];
  for (const f of (pr.sets || [])) { const k = String(f).split('=')[0].trim(); if (k) out.push(k); }
  for (const k of Object.keys(pr.set_facts || {})) out.push(k);
  return out;
}

// flag → [content ids that produce it], deterministic order. The stacker's index.
export function flagProducers(content) {
  const m = new Map();
  for (const ci of content || []) for (const f of producedFlags(ci)) { if (!m.has(f)) m.set(f, []); const a = m.get(f); if (!a.includes(ci.id)) a.push(ci.id); }
  for (const a of m.values()) a.sort();
  return m;
}

// the prerequisite flags for a deck's quest. AUTHORED wins (hoopy lists `deck.quest.flags`); otherwise
// DERIVED from the pool — the flags that this deck's themed lore actually fires (deterministic by id,
// capped to the deck's learn count) so the quest is always satisfiable from real content and the
// mechanism is testable before the prose lands. A deck whose themed lore fires no flags yields [] — not
// a flag quest (the caller falls back to hoopy.js's count-based clear).
export function requiredFlagsForDeck(deck, content, { cap } = {}) {
  if (!deck) return [];
  if (deck.quest && Array.isArray(deck.quest.flags)) return deck.quest.flags.slice();
  const n = cap || (deck.learn && deck.learn.count) || 4;
  const seen = new Set(), flags = [];
  const themed = (content || []).filter((ci) => countsForDeck(ci, deck)).slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const ci of themed) {
    for (const f of producedFlags(ci)) { if (!seen.has(f)) { seen.add(f); flags.push(f); } if (flags.length >= n) break; }
    if (flags.length >= n) break;
  }
  return flags;
}

// a deck's load-bearing quest object: stable id, the required flags, the clear/page latches.
export function buildDeckQuest(deck, content, opts = {}) {
  if (!deck) return null;
  return {
    id: 'deck:' + deck.id, deckId: deck.id, tier: deck.tier,
    name: deck.name, hint: (deck.learn && deck.learn.hint) || deck.name,
    requiredFlags: requiredFlagsForDeck(deck, content, opts),
    clearFlag: clearFlagFor(deck.id), pagedFlag: pagedFlagFor(deck.id),
  };
}
export function buildDeckQuests(content, decks = DECKS, opts = {}) { return decks.map((d) => buildDeckQuest(d, content, opts)); }

// the load-bearing NPC for a quest = the deck's guide (the NPC you report back to — decks.js#guideForTier).
export function loadBearingFor(openingCast, quest) { return quest ? guideForTier(openingCast, quest.tier) : null; }

// is this a flag quest at all? (an empty required-flag set means fall back to the count-based clear)
export const isFlagQuest = (quest) => !!(quest && (quest.requiredFlags || []).length > 0);

// required flags the player has NOT yet set.
export function outstandingFlags(store, playerId, quest) {
  if (!quest) return [];
  const facts = store.getFacts(playerId);
  return (quest.requiredFlags || []).filter((f) => !facts[f]);
}
// RIPE: a flag quest whose every prerequisite is held — ready to turn in.
export function isRipe(store, playerId, quest) {
  return isFlagQuest(quest) && outstandingFlags(store, playerId, quest).length === 0;
}
export const alreadyCleared = (store, playerId, quest) => !!(quest && store.getFact(playerId, quest.clearFlag));

// one-shot PAGING: the instant the quest ripens, latch pagedFlag and return the page event; null after
// (and null until ripe). The surface shows "⚑ <NPC> is asking for you" off a non-null return.
export function pageOnRipe(store, playerId, quest) {
  if (!isRipe(store, playerId, quest)) return null;
  if (store.getFact(playerId, quest.pagedFlag)) return null;
  store.setFact(playerId, quest.pagedFlag, true);
  return { quest: quest.id, deckId: quest.deckId, tier: quest.tier, name: quest.name };
}

// ── the deck-stacking algo (hoopy flagged this as mine) ───────────────────────────────────────────────
export const DEFAULT_PATIENCE = 4;   // start surfacing producers once the unseen lore pool is within
                                     // patience × (#flags still needed) — help BEFORE the pool runs dry.
export const DEFAULT_SAFETY = 1;     // never let an outstanding flag's unseen producers fall to ≤ safety
                                     // without forcing them — the HARD guarantee (the last card never slips).

function loreCensus(store, playerId, type, p, seen, gstate) {
  return store.queryContent({ type, revTier: p.revelation_tier, narTier: p.narrative_tier, powTier: p.power_tier })
    .filter((c) => !seen.has(c.id) && meetsState(gstate, c.requires || {}));
}

// THE DECK-STACKING ALGO. A required flag is set by crystallizing ANY lore that produces it; left to
// chance, dispatch's variety draw might never surface a producer before the pool depletes — so the
// player could "draw forever" without the flag. This returns the producer content-ids to FORCE next
// (engine.dispatch honours them via opts.priorityIds), under two rules, BOTH read purely from live
// state — no counters, fully deterministic:
//
//   • SAFETY (hard guarantee): if an outstanding flag's UNSEEN producers have dwindled to ≤ safety,
//     force them NOW while still drawable. Every ordinary draw shrinks the unseen pool, so this fires
//     before the producers are exhausted — the flag CANNOT be drawn around forever. This alone makes
//     the quest closeable; patience just makes it close sooner / feel earned.
//   • PATIENCE (comfort): also begin forcing once the whole unseen lore pool is within
//     patience × (#outstanding flags) — surface the fragment with enough pool left that finding it
//     still reads as discovery, not being handed the last card.
//
// Producers are only ever forced among VALID draws (legal, unseen, gate-passing, of the lore type), so
// stacking never surfaces out-of-tier / already-seen content; a flag whose producers are all still
// locked behind tier/gate is simply not forced until one becomes legal.
export function stackPriority(store, playerId, quest, content, opts = {}) {
  if (!quest) return [];
  const patience = opts.patience == null ? DEFAULT_PATIENCE : opts.patience;
  const safety = opts.safety == null ? DEFAULT_SAFETY : opts.safety;
  const loreType = opts.loreType || LORE_TYPE;
  const out = outstandingFlags(store, playerId, quest);
  if (!out.length) return [];
  const producers = opts.producers || flagProducers(content);
  const p = store.getPlayerState(playerId), seen = new Set(p.seen_ids || []), gstate = loadGateState(store, playerId);
  const unseenLore = loreCensus(store, playerId, loreType, p, seen, gstate).length;
  const poolTight = unseenLore <= out.length * patience;
  const priority = [];
  for (const flag of out) {
    const ids = producers.get(flag) || [];
    const drawable = ids.map((id) => store.contentById(id)).filter((ci) => ci && ci.type === loreType &&
      ci.approved && ci.status === 'active' &&
      (ci.revelation_tier || 1) <= p.revelation_tier && (ci.narrative_tier || 1) <= p.narrative_tier && (ci.power_tier || 1) <= p.power_tier &&
      !seen.has(ci.id) && meetsState(gstate, ci.requires || {}));
    if (!drawable.length) continue;                               // nothing drawable yet → can't force it now
    if (poolTight || drawable.length <= safety) for (const ci of drawable) priority.push(ci.id);
  }
  return [...new Set(priority)].sort();
}

// crystallize a LORE feature WITH deck-stacking: compute the forced producers for the active quest and
// pass them as priorityIds so a needed flag-bearing fragment surfaces before the pool runs dry. Drop-in
// for engine.interact at a lore feature when a flag quest is active. `interactFn` is injected (pass
// engine.interact) so this module needs no hard dependency on the verb.
export function crystallizeForQuest(interactFn, store, playerId, featureKey, quest, content, opts = {}) {
  const priorityIds = isFlagQuest(quest) ? stackPriority(store, playerId, quest, content, opts) : [];
  return interactFn(store, playerId, featureKey, opts.context || '', { ...(opts.interact || {}), priorityIds });
}

// ── the hidden, flag-gated turn-in dialogue ───────────────────────────────────────────────────────────
// Generate the load-bearing NPC's TURN-IN tree from the quest's flag set, so the hidden branch is wired
// to the SAME gating the engine already enforces — entries[{when}] (talk() opens at the turn-in node
// only once the flags are held) + a requires.facts on the finish choice (belt + suspenders). hoopy
// supplies the PROSE (greet / turnInSays / finishText / extra reward effects); this guarantees the gate
// matches requiredFlags exactly, with no hand-wiring drift. The result drops straight into an npc
// record's `content.dialogue`. Finishing sets the deck's clearFlag → deckClearMilestones advances it.
export function buildLoadBearingDialogue(quest, prose = {}) {
  const when = { facts: Object.fromEntries((quest.requiredFlags || []).map((f) => [f, true])) };
  const finishEffects = { set_facts: { [quest.clearFlag]: true, ...(prose.set_facts || {}) } };
  if (prose.give_items) finishEffects.give_items = prose.give_items;
  if (prose.adjust_rep) finishEffects.adjust_rep = prose.adjust_rep;
  return {
    start: 'greet',
    entries: [{ when, node: 'turnin' }],                         // ripe → talk() greets at the turn-in node
    nodes: {
      greet: {
        says: prose.greet || `Learn ${quest.name}. Come back when you understand it.`,
        choices: [{ id: 'ack', text: prose.ackText || 'I will.', effects: { end: true } }],
      },
      turnin: {
        says: prose.turnInSays || `You have seen enough of ${quest.name}. Tell me what you found.`,
        choices: [{
          id: 'finish', text: prose.finishText || 'Here is what I learned.',
          requires: when,                                         // double-gate: the choice itself needs the flags
          effects: finishEffects,
        }, ...(prose.extraChoices || [])],
      },
    },
  };
}

// deck-clear → narrative_tier milestones for advance.js#checkAdvance. The load-bearing turn-in sets deck
// N's clearFlag; this floors narrative_tier at N+1 once it's held — so clearing the NPC's quest IS what
// advances the deck, and the deck is BLOCKED until then. Additive: concat onto the derived milestones.
export function deckClearMilestones(decks = DECKS) {
  const out = [];
  for (const d of decks) {
    const nx = nextDeck(d.tier); if (!nx) continue;
    out.push({ id: 'deckclear-' + d.id, axis: 'narrative_tier', to: nx.tier, requires: { facts: { [clearFlagFor(d.id)]: true } } });
  }
  return out;
}

// a compact HUD/debug view of a quest's state for the surface.
export function questState(store, playerId, quest, content, opts = {}) {
  const req = (quest && quest.requiredFlags) || [], out = outstandingFlags(store, playerId, quest);
  return {
    id: quest && quest.id, deckId: quest && quest.deckId, tier: quest && quest.tier, hint: quest && quest.hint,
    required: req, outstanding: out, have: req.length - out.length, need: req.length,
    isFlagQuest: isFlagQuest(quest), ripe: isRipe(store, playerId, quest),
    paged: !!(quest && store.getFact(playerId, quest.pagedFlag)),
    cleared: alreadyCleared(store, playerId, quest),
    priority: stackPriority(store, playerId, quest, content, opts),
  };
}
