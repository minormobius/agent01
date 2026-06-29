// hoop/story/decks.js — THE DECK SPINE. Hand-authored, pure data, no DOM/LLM.
//
// REALIGNED to hoopy's CURRENT bible (the source of truth). The bible's "Four Zones — the shape of the
// descent" ARE the narrative tiers, descended in order: 1 The Commons · 2 The Wards · 3 The Upper Rind ·
// 4 The Lower Rind, plus a 5th deck for the Signal-Chamber conclusion (the lower rind's deepest seat, where
// the content tags `signal_chamber`/`purpose` and the tier-5 records live). The deck is keyed by
// `narrative_tier`, so `name` is the ZONE.
//
// TWO LADDERS, kept distinct (the old decks.js conflated them — it named the zones after the revelation
// rungs, e.g. tier-2 "The Curve"): `name` is the bible's narrative ZONE; `rev` is the separate REVELATION
// ladder (The Ordinary → Curve → Vessel → Approach → Purpose) that hoopy's content still carries verbatim
// in `revelation_hint`, so countsForDeck keeps matching on it. `ladder` is the bible's register line.
//
// Each deck carries:
//   • name / ladder / rev      — the ZONE (narrative tier) · its register · its revelation rung
//   • character                — the hand-written voice of the deck (shown on arrival)
//   • hook                     — the guide's task for the zone ("gather … then the way down opens")
//   • learn  {count, themes,   — what hoopybot watches: encounter `count` distinct things tagged with
//             hint}              `themes` (or whose revelation_hint names this deck's `rev`) = "learned enough"
//   • gen    {tint, roleBias,  — prefab seed-stats a chunk generator can read so a deck's chunks feel like it
//             density}
//
// Themes are drawn from the live export's real tag distribution per zone, so each goal is satisfiable from
// the content actually on the deck. The whole climb is deterministic + atproto-stable.

export const DECKS = [
  {
    tier: 1, id: 'nave', name: 'The Commons', ladder: 'ordinary · grounded · legible', rev: 'The Ordinary',
    character:
      'You wake in Bay 14 and step out into the Commons — the public, shared face of the Nave, where all three ' +
      'factions show their civic skin and at least one room of every verb appears. Sun-strip glare, water-carts, ' +
      'copper stalls furred with oxidation-moths. It is loud, ordinary, and a lie of scale: the floor is a ring.',
    hook: 'Get your bearings. Walk the Commons, meet its people, learn the three factions’ public faces — ' +
      'then come back to me and tell me what you saw.',
    learn: { count: 4, themes: ['nave', 'drift', 'continuant', 'continuants', 'trade', 'maintenance', 'infrastructure', 'market', 'ordinary_life'], hint: 'the three factions’ public faces' },
    gen: { tint: null, roleBias: { trade: 1.5, serve: 1.3, dwell: 1.1 }, density: 1.0 },
  },
  {
    tier: 2, id: 'curve', name: 'The Wards', ladder: 'intimate · partisan · lived-in', rev: 'The Curve',
    character:
      'Past the public face into the six faction wards — two per faction — and into the societies ' +
      'themselves: the Continuants’ institutions, the Drift’s Braid, the Rindwalkers’ sacred ' +
      'maintenance. Here you learn each creed, each economy, each grievance — whom they trust, what they hide.',
    hook: 'Go past the squares into the wards. Learn each society from the inside — its creed, its economy, ' +
      'what it fears — and what it is hiding. When you know all three from within, report back.',
    learn: { count: 5, themes: ['continuant', 'continuants', 'drift', 'rind-walker', 'rind-walkers', 'faction', 'curve', 'nave', 'circulation'], hint: 'each faction’s creed, economy, and grievances' },
    gen: { tint: 'rgba(40,80,70,0.14)', roleBias: { govern: 1.4, worship: 1.3, learn: 1.2 }, density: 1.05 },
  },
  {
    tier: 3, id: 'rind', name: 'The Upper Rind', ladder: 'vast · liminal · uncanny-familiar', rev: 'The Vessel',
    character:
      'Down through the hull-skin into the Upper Rind — the structural skin of the ship, where the verbs ' +
      'are re-read at impossible scale and the Seven’s domains begin: Mars’ hull-welding cathedral, ' +
      'Venus’ vast strange gardens, Mercury’s humming arteries, Jupiter’s abandoned court. ' +
      'Strange, but still familiar. You witness each nave faction reflected at scale — three times each.',
    hook: 'Descend into the Upper Rind. Witness each faction reflected at the ship’s true scale, three ' +
      'times over — then come to the threshold I will lead you to, and choose the faction whose descent you walk.',
    learn: { count: 5, themes: ['rind', 'vessel', 'seven', 'mars', 'mercury', 'venus', 'jupiter', 'anomaly', 'structural', 'infrastructure'], hint: 'each faction witnessed at scale, in the Seven’s domains' },
    gen: { tint: 'rgba(30,70,90,0.22)', roleBias: { make: 1.5, mend: 1.3, grow: 1.2 }, density: 0.95 },
  },
  {
    tier: 4, id: 'approach', name: 'The Lower Rind', ladder: 'cosmic · machine-sacred · stasis-without-witness', rev: 'The Approach',
    character:
      'The Lower Rind — the deep stasis machinery that predates civilization aboard, holding the Nave ' +
      'stable in the cylinder’s middle. Not biological, but it reads as alive: coherent, self-referent, ' +
      'persisting untended. Saturn’s oldest layer, Sol’s burning center, Luna’s deep archive. ' +
      'The Signal is now directly perceptible — something your translation apparatus answers, not a gauge.',
    hook: 'Go down into the Lower Rind, the descent your chosen faction colours. Gather chamber-lore until you ' +
      'can locate the Signal Chamber, lost to the sands of time — then reach it. Luna is waiting there.',
    learn: { count: 5, themes: ['lower_rind', 'approach', 'signal', 'saturn', 'sol', 'luna', 'stasis', 'translation', 'anomaly'], hint: 'the deep stasis, the Seven’s oldest domains, and the Signal' },
    gen: { tint: 'rgba(60,50,90,0.20)', roleBias: { worship: 1.6, store: 1.3, dwell: 1.2 }, density: 0.9 },
  },
  {
    tier: 5, id: 'bay14', name: 'The Signal Chamber', ladder: 'contact · purpose · the choice', rev: 'The Purpose',
    character:
      'The Signal Chamber — older than the Nave, its position lost to the sands of time, now found. Luna ' +
      'makes contact through the terminal that uses the name she knows and you don’t. The translation ' +
      'apparatus and the decision architecture you were rebuilt with were built for this: the choice the whole ' +
      'ship has carried and could never make for itself. The nature of Bay 14 is clear. Only you can answer it.',
    hook: 'Reach the Signal Chamber and Luna’s contact. Understand what you were built to do — then ' +
      'make the choice the Purpose lays before you. There is no guidance left to give; only the decision.',
    learn: { count: 5, themes: ['signal_chamber', 'purpose', 'bay_14', 'bay-14', 'decision_architecture', 'decision-architecture', 'luna', 'signal', 'translation'], hint: 'the Signal Chamber, Luna’s contact, and the choice' },
    gen: { tint: 'rgba(80,40,40,0.20)', roleBias: { worship: 1.8, learn: 1.4, govern: 1.3 }, density: 0.85 },
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
