// factionchoice.js — THE UPPER-RIND THRESHOLD (bible §"Narrative Tiers" tier 3 + §"Advancement"): in the
// upper rind you "witness each nave faction reflected at scale, three times each, and then — at a threshold
// Sevin leads you to — you CHOOSE a faction." The choice colors the lower-rind descent (and the ending).
//
// Pure + DOM-free + node-tested (test/factionchoice.selftest.mjs). The game (index.html) owns the witnessing
// events (crystallizing faction-tagged content in the upper rind) and the choice card; this owns the count,
// the gate, the prose, and the consequence. Persisted state, all on the player's facts (atproto-save-stable):
//   • fw.<faction>            — times that faction has been witnessed at scale (0..WITNESS_TARGET)
//   • flag.chosen_faction     — the faction chosen at the threshold (colors the descent)

export const CHOICE_FACTIONS = ['continuant', 'rindwalker', 'drift'];
export const WITNESS_TARGET = 3;   // "three times each"

// per-faction display + the creed you weigh at the threshold (bible §"The Three Nave Factions"). `seen` is
// how the upper rind reflects that faction at scale; `colours` is what choosing it does to the descent.
export const FACTION_INFO = {
  continuant: {
    label: 'the Continuants', color: '#33408f', verbs: 'govern · grow · serve · heal',
    creed: 'Continuity. What sustains the generation is sacred; rupture is the heresy. The voyage must continue.',
    seen: 'You have seen the Continuants reflected at scale — life-support as cathedral, the writ enforced across a continent of decks.',
    colours: 'You descend as a Continuant: the deep read as something to be kept stable, handed on, never ruptured.',
  },
  rindwalker: {
    label: 'the Rindwalkers', color: '#9b6b3a', verbs: 'worship · mend · make · store',
    creed: 'Sacred maintenance. The ship is a body and a temple; to keep it running is to keep faith. Maintenance is meaning.',
    seen: 'You have seen the Rindwalkers reflected at scale — the forge-cathedral, repair as rite, the hull read like scripture.',
    colours: 'You descend as a Rindwalker: the deep read as a temple-body, the Signal a fault in the ship confessing itself.',
  },
  drift: {
    label: 'the Drift', color: '#3bb0c9', verbs: 'learn · play · move · trade',
    creed: 'Circulation. Everything moves — ideas, goods, esteem; nothing here is truly yours. Impermanence is the only law.',
    seen: 'You have seen the Drift reflected at scale — the message-arteries humming, the Braid carrying what no one published.',
    colours: 'You descend as the Drift: the deep read as one more current, the Signal a thing passing through, to be carried on.',
  },
};

// how many times faction `f` has been witnessed (capped).
export function witnessCount(facts, f) { return Math.max(0, Math.min(WITNESS_TARGET, (facts && facts['fw.' + f]) | 0)); }
export function witnessDone(facts, f) { return witnessCount(facts, f) >= WITNESS_TARGET; }
// every faction witnessed at scale ×WITNESS_TARGET — the threshold is ready.
export function allWitnessed(facts) { return CHOICE_FACTIONS.every((f) => witnessDone(facts, f)); }
// the faction chosen at the threshold (null until chosen).
export function chosenFaction(facts) { const c = facts && facts['flag.chosen_faction']; return CHOICE_FACTIONS.includes(c) ? c : null; }
// progress for the objective line.
export function witnessProgress(facts) {
  return CHOICE_FACTIONS.map((f) => ({ faction: f, n: witnessCount(facts, f), done: witnessDone(facts, f) }));
}
// is `faction` a choosable nave faction?
export function isChoiceFaction(f) { return CHOICE_FACTIONS.includes(f); }

export default { CHOICE_FACTIONS, WITNESS_TARGET, FACTION_INFO, witnessCount, witnessDone, allWitnessed, chosenFaction, witnessProgress, isChoiceFaction };
