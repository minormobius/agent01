// factionquest.js — THE NAVE CAMPAIGN (v100). The headline floor-1 progression: introduce the player to
// each of the three nave factions, in order, by sending them to that faction's ward to WITNESS its work.
// Completing all three — the Drift last — opens the way down into the rind.
//
// Pure + DOM-free + node-tested (test/factionquest.selftest.mjs). The game (index.html) owns the world,
// the waypoint and the cards; this module owns the ORDER, the gate, and the prose. The only persisted
// state is a single fact per faction: `fq.<faction>` === 'witnessed'. Everything else is derived, so the
// quest is deterministic and atproto-save-stable like the rest of the engine.
//
// WHY arrival, not a dialogue tree: floor 1 is bounded and baddie-free; the campaign is "walk the wards
// and see who lives there". Entering a faction's ward (detected off the nave's per-chunk faction meta) is
// the witness event. The card is voiced by that faction's guide, so the ward IS the introduction.

// The order IS the gate. Continuant (the institution that wakes you into the city) → Rindwalker (the
// sacred maintainers, deeper) → Drift (the brokers who, prizing circulation, know the way down). Drift
// last, because witnessing the Drift opens the rind.
export const FQ_ORDER = ['continuant', 'rindwalker', 'drift'];
export const FQ_OPENS_RIND = 'drift';   // witnessing this faction opens the descent

// Per-faction display + prose. `signature` is the faction's HIGH-ward exclusive role (nave.js BIOMES),
// which is also where the waypoint points and which fixture the ward is built around:
//   continuant→govern (the long table / inkblot), rindwalker→worship (the oracle), drift→learn (the terminal).
export const FQ = {
  continuant: {
    label: 'Continuants', color: '#33408f', signature: 'govern', guide: 'Factor Merid Solen',
    seek: 'Seek the Continuant ward — the halls of govern and grow, where the ship’s long memory is kept and life-support is tended like an heirloom.',
    witness:
      'Factor Merid Solen, pale blue and iron grey, folds her hands as you enter.\n\n' +
      '“The Continuants hold the line. We keep the air sweet, the decks green, the records unbroken — not because the ship is ours, but because it must be handed on, exactly, to whoever comes after.\n\n' +
      'Succession is our only theology. Now you have seen one face of the Nave. There are two more.”',
  },
  rindwalker: {
    label: 'Rindwalkers', color: '#9b6b3a', signature: 'worship', guide: 'Sevin',
    seek: 'Seek the Rindwalker ward — copper and rust, where mending is prayer and the ship’s skin is read like scripture.',
    witness:
      'Sevin, more arms than you expected, sets down a censer that smells of hot metal.\n\n' +
      '“To us the hull is a body, and the body is a temple. Every seam we weld is a verse; every fault we find, a confession the ship makes to those who listen.\n\n' +
      'The Continuants keep the ship. We keep faith WITH it. One face remains — the restless one.”',
  },
  drift: {
    label: 'Drift', color: '#3bb0c9', signature: 'learn', guide: 'Olo Vashti',
    seek: 'Seek the Drift ward — teal and quick, the Braid of traders and brokers who deal in news and never stay still.',
    witness:
      'Olo Vashti turns a knotted cord through their fingers, grinning.\n\n' +
      '“The Continuants hoard the past, the Rindwalkers pray to it. We move. Everything circulates — bread, regard, secrets — and the Drift are the current.\n\n' +
      'You have walked all three faces of the Nave now, traveller. Which means you are ready for the thing none of them will say aloud: the Nave has a floor, and the floor has a way down. I know where it opens. Go to the commons concourse — the shaft is yours.”',
  },
};

// status of one faction: 'witnessed' once seen, else 'locked'. `facts` is the player's flat fact map.
export function fqStatus(facts, faction) {
  return (facts && facts['fq.' + faction]) === 'witnessed' ? 'witnessed' : 'locked';
}
// the ACTIVE faction = the first in order not yet witnessed (null when all three are done).
export function fqActive(facts) {
  for (const f of FQ_ORDER) if (fqStatus(facts, f) !== 'witnessed') return f;
  return null;
}
// progress summary for the objective line.
export function fqProgress(facts) {
  const done = FQ_ORDER.filter((f) => fqStatus(facts, f) === 'witnessed').length;
  return { done, total: FQ_ORDER.length, active: fqActive(facts), allDone: done === FQ_ORDER.length };
}
// the high-ward exclusive role a faction's ward is built around (= the waypoint target role).
export function fqSignatureExclusive(faction) { return (FQ[faction] || {}).signature || null; }
// has the descent been earned? (the Drift witnessed). The game opens the rind on this.
export function fqOpensRind(facts) { return fqStatus(facts, FQ_OPENS_RIND) === 'witnessed'; }

// Can `faction` be witnessed right now? Only the active one — that's the progression gate (out-of-order
// ward entries are no-ops, nudged back to the active faction by the waypoint).
export function fqCanWitness(facts, faction) { return !!FQ[faction] && fqActive(facts) === faction; }

export default { FQ, FQ_ORDER, FQ_OPENS_RIND, fqStatus, fqActive, fqProgress, fqSignatureExclusive, fqOpensRind, fqCanWitness };
