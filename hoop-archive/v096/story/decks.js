// hoop/v096/story/decks.js — THE DECK SPINE. Hand-authored, pure data, no DOM/LLM.
//
// The architecture hoopy sketched: "each deck is distinct and the character of each deck is hand
// written and corresponds to narrative tiers." There are five narrative tiers (the bible's ladder
// Arrival → Orientation → Investigation → Convergence → Resolution), so there are FIVE DECKS, and the
// player climbs them one tier at a time. Unlimited chunks per deck; the chunks are seeds (a `gen`
// profile of stats that feed the RNG), and the deck's CHARACTER is the hand-written frame around them.
//
// Each deck carries:
//   • name / ladder / rev      — the place + its narrative & revelation ladder rungs (from his export)
//   • character                — the hand-written voice of the deck (shown on arrival)
//   • hook                     — the awakening guidance the deck's guide gives ("learn about… find me…")
//   • learn  {count, themes,   — what hoopybot watches: encounter `count` distinct things tagged with
//             hint}              `themes` (or matching this deck's revelation) and you've "learned enough"
//   • gen    {tint, roleBias,  — the prefab seed-stats a chunk generator can read so a deck's chunks
//             density}           feel like the deck (carried now; the per-deck generator is the next leg)
//
// Themes are drawn from his export's real tag distribution per narrative tier, so the goal is satisfiable
// from the content actually on the deck. The whole climb is deterministic + atproto-stable.

export const DECKS = [
  {
    tier: 1, id: 'nave', name: 'The Nave', ladder: 'Arrival', rev: 'The Ordinary',
    character:
      'You wake in the Nave — the long market-deck where the ship pretends to be a city. Sun-strip glare, ' +
      'the grind of water-carts, copper stalls furred with oxidation-moths. Everyone here is a Continuant or ' +
      'a Drifter and nobody looks up. It is loud, ordinary, and entirely a lie of scale: the floor is a ring.',
    hook: 'Get your bearings. Walk the Nave, meet its people, learn how the ship feeds and forgets itself — ' +
      'then come back to me and tell me what you saw.',
    learn: { count: 4, themes: ['nave', 'drift', 'maintenance', 'continuant', 'continuants', 'trade', 'infrastructure', 'market', 'ordinary_life'], hint: 'the people and machinery of the Nave' },
    gen: { tint: null, roleBias: { trade: 1.5, serve: 1.3, dwell: 1.1 }, density: 1.0 },
  },
  {
    tier: 2, id: 'curve', name: 'The Curve', ladder: 'Orientation', rev: 'The Curve',
    character:
      'Once you have seen it you cannot unsee it: the horizon does not end, it climbs. The Curve is the same ' +
      'decks read with new eyes — circulation corridors, the water that runs uphill to fall, the curvature ' +
      'that means you are inside something. Orientation is the vertigo of understanding where you stand.',
    hook: 'You have felt the floor bend. Follow the circulation — the carts, the canals, the way everything ' +
      'returns — until the shape of the vessel is undeniable. Then report what the Curve told you.',
    learn: { count: 5, themes: ['curve', 'curvature', 'circulation', 'infrastructure', 'orientation', 'spatial_awareness', 'nave'], hint: 'the curvature and circulation of the ship' },
    gen: { tint: 'rgba(40,80,70,0.14)', roleBias: { move: 1.6, grow: 1.3, make: 1.2 }, density: 1.05 },
  },
  {
    tier: 3, id: 'rind', name: 'The Rind', ladder: 'Investigation', rev: 'The Vessel',
    character:
      'Down through the hull-skin to the Rind — the cold structural foam between the world and the void. No ' +
      'sun-strip here, only the navigation runs, the propulsion drum, and the first whisper of the Signal. ' +
      'The Vessel stops being your city and becomes a machine with a heading and a secret it is keeping.',
    hook: 'Go down into the Rind. Read the navigation, the propulsion, the anomalies the Seven do not explain — ' +
      'find where the Signal leaks through. Bring me what the Vessel is hiding.',
    learn: { count: 5, themes: ['rind', 'vessel', 'signal', 'anomaly', 'navigation', 'propulsion', 'seven', 'infrastructure'], hint: 'the Rind, the Signal, and what the Vessel hides' },
    gen: { tint: 'rgba(30,70,90,0.22)', roleBias: { make: 1.6, govern: 1.3, heal: 1.1 }, density: 0.95 },
  },
  {
    tier: 4, id: 'approach', name: 'The Approach', ladder: 'Convergence', rev: 'The Approach',
    character:
      'The Signal is not noise. The Approach is the deck where translation begins — Luna\'s chambers, the ' +
      'contact apparatus, the slow convergence of every thread toward a thing outside the hull that is ' +
      'answering. Purpose arrives like weather. Everyone who understands is afraid, and will not say of what.',
    hook: 'Reach the Signal Chamber. Help Luna translate the contact, gather the purpose the Approach is ' +
      'converging on. When you can read what is answering us — come to me before you decide anything.',
    learn: { count: 5, themes: ['signal', 'approach', 'translation', 'luna', 'contact', 'purpose', 'signal_chamber', 'anomaly'], hint: 'the Signal, Luna\'s translation, and the Approach' },
    gen: { tint: 'rgba(60,50,90,0.20)', roleBias: { learn: 1.7, worship: 1.4, heal: 1.2 }, density: 0.9 },
  },
  {
    tier: 5, id: 'bay14', name: 'Bay 14', ladder: 'Resolution', rev: 'The Purpose',
    character:
      'Bay 14 — where you were rebuilt, where the decision architecture waits. The Purpose is whole now and ' +
      'it asks one thing of you. This is the deck of resolution: the translation apparatus, the terminal, the ' +
      'choice the whole ship was built to carry and could never make for itself. Only you can answer it.',
    hook: 'Return to Bay 14 and the Signal Chamber terminal. Accept the choice the Purpose lays before you — ' +
      'the ship has carried it long enough. There is no guidance left to give; only the decision.',
    learn: { count: 5, themes: ['purpose', 'bay_14', 'bay-14', 'decision_architecture', 'decision-architecture', 'luna', 'resolution'], hint: 'the Purpose and the choice at Bay 14' },
    gen: { tint: 'rgba(80,40,40,0.20)', roleBias: { govern: 1.8, worship: 1.4, learn: 1.3 }, density: 0.85 },
  },
];

export const DECK_COUNT = DECKS.length;
export const deckForTier = (tier) => DECKS[Math.max(1, Math.min(DECK_COUNT, tier | 0)) - 1];
export const nextDeck = (tier) => (tier < DECK_COUNT ? deckForTier(tier + 1) : null);

// normalise a tag/hint set for matching (lowercased)
const norm = (s) => String(s || '').toLowerCase().trim();

// Does a content item count toward THIS deck's learning goal? It's "one of the right things" when its
// tags overlap the deck's themes, or its revelation_hint names the deck's revelation rung. (Tolerant of
// his "Tier N: The X" hint prefixes.) Pure — hoopy.js calls this over the player's encounters.
export function countsForDeck(ci, deck) {
  if (!ci || !deck) return false;
  const themes = new Set(deck.themes ? deck.themes : (deck.learn && deck.learn.themes) || []);
  for (const t of (ci.tags || [])) if (themes.has(norm(t))) return true;
  const hint = norm(ci.revelation_hint || (ci.content && ci.content.revelation_hint));
  if (hint && deck.rev && hint.includes(norm(deck.rev))) return true;
  return false;
}

// The guide for a tier: a stable NPC the player reports back to. Picks from the opening cast (his
// lowest-tier NPCs), one per tier, cycling — so each level-up sends you to "a new npc" for the infodump.
export function guideForTier(openingCast, tier) {
  if (!openingCast || !openingCast.length) return null;
  return openingCast[(Math.max(1, tier) - 1) % openingCast.length];
}
