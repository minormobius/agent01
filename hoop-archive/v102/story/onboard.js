// onboard.js — THE ONBOARDING ENGINE (the little gimmes). The ship carries four deep systems —
// the garden (grow/gacha/kitchen), the alchemy bench (correspondence crafting), the smithy (the
// commodity economy), and the trainer (the roguelike combat gauntlet) — and unloading them all at
// once buries the player. This module paces the reveal: ONE small, guaranteed-win "gimme" at a
// time, each gated to hoopy's narrative progression (the anchor-tier ladder — that was the deal):
//
//   tier 1 (the Commons)    ❀ the garden  — plant your first seed (you're GIVEN the seeds)
//   tier 2 (the wards)      ⚗ the bench   — brew your first draught (given two live reagents)
//   tier 3 (the Upper Rind) ⚒ the smithy  — forge your first piece (the starter wallet affords it)
//   tier 3 (the Upper Rind) ⚔ the trainer — survive stage one of the gauntlet
//
// The engine only DERIVES; it never mutates. The surface owns the grants (seeds/reagents into the
// player's stores), the completion hooks (the natural verbs: plant / brew / forge / win a stage),
// and the rendering (journal card + unlock toast + the ✧ marker). Doing the verb ORGANICALLY —
// before the gimme even unlocks — still completes it (the hooks fire regardless of pacing), so a
// player who found the smithy on their own is credited, never re-tutorialised.
//
// Facts (all on the player, save-persisted):
//   ob.given.<id> — the starter grant + unlock toast fired (once)
//   ob.done.<id>  — the verb happened (once; pays the reward)
//
// Pure, DOM-free, node-tested (test/onboard.selftest.mjs).

export const GIMMES = [
  {
    id: 'garden', tier: 1, role: 'grow', icon: '❀',
    name: 'the garden', title: 'plant something',
    blurb: 'Every grow-room keeps a real bed: seeds go in, days pass (rest in a bed to pass one), plants ripen, harvests fill your pantry — and every harvest returns its seed.',
    task: 'Find a grow-room, pick one of the seeds you’ve been given, and click a clear patch of bed.',
    where: 'a grow-room (the ❀ bed against the wall)',
    reward: 10,
  },
  {
    id: 'alchemy', tier: 2, role: 'make', icon: '⚗',
    name: 'the bench', title: 'brew something',
    blurb: 'The alchemy bench turns pantry herbs into preparations — draughts, salves, smokes, oils — by planetary correspondence. What you grow is what you brew.',
    task: 'Find a make-room’s ⚗ bench, pick the two reagents you’ve been given, choose a vessel, and brew.',
    where: 'a make-room (the ⚗ bench)',
    reward: 15,
  },
  {
    id: 'smith', tier: 3, role: 'make', icon: '⚒',
    name: 'the smithy', title: 'forge something',
    blurb: 'The smithy forges equipment from the ship’s seven conserved commodities — metal, polymer, silicate and the rest. Your starting stock already covers a first piece; dismantle anything to get material back.',
    task: 'Find a make-room’s ⚒ smithy wall, pick a phylum and material, and forge.',
    where: 'a make-room (the ⚒ smithy on the wall)',
    reward: 20,
  },
  {
    id: 'trainer', tier: 3, role: 'play', icon: '⚔',
    name: 'the gauntlet', title: 'survive stage one',
    blurb: 'The training platform runs a roguelike ladder: solver-tuned fights, a skill point and a loot drop per stage, a per-faction tech tree between rounds. A loss ends the run — the loot is yours to keep.',
    task: 'Roll a character (⛨ equip) if you haven’t, find a play-room’s ⚔ platform, begin a run, and clear stage one.',
    where: 'a play-room (the ⚔ platform on the wall)',
    reward: 25,
  },
];

export const givenFlag = (id) => 'ob.given.' + id;
export const doneFlag = (id) => 'ob.done.' + id;

// the ONE gimme to surface right now: the first track whose tier has been reached and whose verb
// hasn't happened. Strictly ordered — a tier-3 player who never planted still gets the garden
// first (it feeds the bench, which feeds the fights). null when every unlocked track is done.
export function activeGimme(facts, tier) {
  const f = facts || {};
  for (const g of GIMMES) {
    if ((tier | 0) < g.tier) continue;
    if (f[doneFlag(g.id)] === true) continue;
    return g;
  }
  return null;
}

// { done, total, unlocked } — for the journal header ("little gimmes · 2/4").
export function gimmeProgress(facts, tier) {
  const f = facts || {};
  let done = 0, unlocked = 0;
  for (const g of GIMMES) {
    if (f[doneFlag(g.id)] === true) done++;
    if ((tier | 0) >= g.tier) unlocked++;
  }
  return { done, unlocked, total: GIMMES.length };
}

// the deterministic starter picks for the garden/bench grants: the fastest-growing alchemically
// live crops in the ark (stable sort by growthDays then id, so every world grants the same herbs).
export function starterCrops(ark, n = 2) {
  const crops = (ark && ark.crops) || [];
  return crops.filter((c) => c && c.reagent && c.id)
    .sort((a, b) => (a.growthDays || 99) - (b.growthDays || 99) || (a.id < b.id ? -1 : 1))
    .slice(0, n);
}

export default { GIMMES, activeGimme, gimmeProgress, starterCrops, givenFlag, doneFlag };
