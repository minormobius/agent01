// hoop/v096/story/hoopy.js — HOOPYBOT, the leveling oracle. Pure, no DOM, no LLM.
//
// hoopy's architecture, in one function: "hoopybot tracks everything you've done and levels you up when
// it thinks you've learned enough of the right things. you are informed when this has happened with a
// customized message and told to return to the NPC, who has just been modified to give your next guidance."
//
// So narrative advancement is NOT raw XP and NOT auto — it is this oracle's judgement. It reads the
// player's ENCOUNTERS (the crystallized placements — everything you've touched) and asks, against the
// CURRENT DECK's learning goal (decks.js): have you met enough of the RIGHT things (themed to this deck /
// its revelation rung) to have earned the next rung? When yes, `ready` flips and `levelMessage` writes the
// customized page. The grant itself happens in the UI when you RETURN TO YOUR GUIDE — the human-in-the-loop
// beat. revelation_tier stays exploration-driven (engine.js); THIS axis is the story spine.
//
// Deterministic + inference-free: the same encounters always yield the same verdict. The "right things"
// rule is decks.countsForDeck (tags ∩ deck themes, or revelation_hint matches the deck's rung).

import { countsForDeck, nextDeck, guideForTier } from './decks.js';

// distinct content ids the player has ENCOUNTERED that count toward this deck's goal.
export function learnedForDeck(store, playerId, deck) {
  const ids = new Set();
  for (const pl of store.listPlacements(playerId)) {
    const ci = store.contentById(pl.content_item_id);
    if (ci && countsForDeck(ci, deck)) ids.add(ci.id);
  }
  return ids;
}

// the verdict for the player's current deck: how much of the right material they've learned, and whether
// hoopybot judges them ready for the next rung.
export function assess(store, playerId, deck) {
  const learned = learnedForDeck(store, playerId, deck).size;
  const needed = (deck.learn && deck.learn.count) || 4;
  return {
    tier: deck.tier, deckId: deck.id,
    learned, needed,
    ready: learned >= needed,
    progress: Math.max(0, Math.min(1, needed ? learned / needed : 1)),
    missing: (deck.learn && deck.learn.hint) || 'the ship',
  };
}

// the customized "you leveled up" page — names what you learned and who to return to.
export function levelMessage(deck, guideName) {
  const nx = nextDeck(deck.tier);
  const who = guideName ? guideName : 'your guide';
  const lead = `You have learned enough of ${deck.name} — ${(deck.learn && deck.learn.hint) || 'its ways'}. ` +
    `hoopybot has cleared you for the next rung of the climb.`;
  const tail = nx
    ? `Return to ${who}. They have been told what you found, and have new guidance — the way toward ${nx.name} (${nx.ladder}).`
    : `Return to ${who}. There is little guidance left to give; what remains is the choice.`;
  return `${lead}\n\n${tail}`;
}

// the guide the page should send the player back to (the NPC who gives this tier's next guidance).
export function guideFor(openingCast, tier) { return guideForTier(openingCast, tier); }
