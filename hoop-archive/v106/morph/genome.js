// THE GENOME — the thing the meta-generator samples. A genome is a point in the
// space of *game grammars*: a substrate (topology), an interaction/move model, a
// set of micro-rules, a goal, entity budgets, and an aesthetic. Instantiating a
// genome with an instance seed yields a concrete, solver-verified puzzle.
//
// Pressing "surprise" rolls a fresh genome → a different topology, a different
// law, a different goal, a different look: a game that feels born on another
// planet. Rolling a new *instance* of the SAME genome is a fresh puzzle in the
// same game. Those are the two knobs the player's insight asked for, made
// explicit.
//
// Sampling is ordered so the result is always coherent: a "primary" mechanic
// fixes the goal and the must-have rules, then optional add-ons and a substrate
// are layered on under a compatibility matrix (e.g. slide-worlds never push;
// lights-worlds stay small).

import { SUBSTRATE_IDS, makeSubstrate } from './substrate.js';
import { AESTHETICS, pickAesthetic } from './aesthetic.js';

const SUBSTRATE_W = { grid: 5, cylinder: 5, torus: 4, mobius: 4, klein: 3, hex: 4 };

// substrate exoticness — feeds the genome richness / "alienness" score
const EXOTIC = { grid: 0.0, cylinder: 0.45, hex: 0.55, torus: 0.7, mobius: 0.9, klein: 1.0 };

// primary mechanics: each fixes a goal and the rules it needs
const PRIMARIES = [
  { v: 'traverse', w: 5 },   // reach the exit
  { v: 'sokoban', w: 4 },    // push crates onto targets
  { v: 'collect', w: 4 },    // gather all tokens
  { v: 'lights', w: 3 },     // flip every tile on (Lights-Out as traversal)
];

function sizeFor(subId, rand) {
  const base = SUBSTRATE_W[subId] ?? 5;
  const w = base + rand.int(3);          // base..base+2
  const h = base + rand.int(3);
  return { W: Math.max(4, w), H: Math.max(4, h) };
}

export function sampleGenome(rand) {
  const subId = rand.weighted(SUBSTRATE_IDS.map((id) => ({ v: id, w: id === 'grid' ? 3 : 2 })));
  const primary = rand.weighted(PRIMARIES);

  // lights blows up the search space; keep those boards small and square-ish
  let { W, H } = sizeFor(subId, rand);
  if (primary === 'lights') { W = Math.min(W, 4); H = Math.min(H, 4); }

  const rules = { push: false, ice: false, collect: false, lights: false, portal: false };
  let moveModel = 'walk';
  let goal = { type: 'exit' };
  const counts = { boxes: 0, gems: 0, toggles: 0, portals: 0, wallFrac: 0.08 };

  if (primary === 'traverse') {
    goal = { type: 'exit' };
    // a traverse world is defined by HOW you move + what bends the path
    if (rand.float() < 0.45) { moveModel = 'slide'; rules.ice = true; counts.wallFrac = 0.16; } // slick world
    if (rand.float() < 0.45) { rules.portal = true; counts.portals = rand.range(1, 2); }
    if (!rules.ice && !rules.portal) counts.wallFrac = 0.18;                                     // a maze, then
  } else if (primary === 'sokoban') {
    rules.push = true; goal = { type: 'cover' };
    counts.boxes = rand.range(1, 2); counts.wallFrac = 0.10;
    if (rand.float() < 0.3) { rules.portal = true; counts.portals = 1; }
  } else if (primary === 'collect') {
    rules.collect = true; counts.gems = rand.range(3, 5);
    goal = { type: 'collect', thenExit: rand.float() < 0.6 };
    if (rand.float() < 0.4) { moveModel = 'slide'; rules.ice = true; counts.wallFrac = 0.14; }
    if (rand.float() < 0.35) { rules.portal = true; counts.portals = 1; }
  } else { // lights
    rules.lights = true; goal = { type: 'lights' };
    counts.toggles = W * H;        // whole board participates
    counts.wallFrac = 0;
  }

  const aesthetic = pickAesthetic(rand, primary);
  const g = { substrate: { id: subId, W, H }, primary, moveModel, rules, goal, counts, aesthetic };
  g.label = labelOf(g);
  g.richness = richnessOf(g);
  return g;
}

function activeRules(g) {
  return Object.entries(g.rules).filter(([, on]) => on).map(([k]) => k);
}

function labelOf(g) {
  const subName = makeSubstrate(g.substrate.id, 1, 1).name;
  const law = [];
  if (g.moveModel === 'slide') law.push('slide');
  for (const r of activeRules(g)) if (!(r === 'ice' && g.moveModel === 'slide')) law.push(r);
  const goalTxt = { exit: 'reach the gate', cover: 'fill every marker', collect: 'gather it all', lights: 'light every tile' }[g.goal.type];
  return `${g.aesthetic.name} · ${subName} ${g.substrate.W}×${g.substrate.H} · ${law.length ? law.join('+') : 'pure traversal'} · ${goalTxt}`;
}

// Static richness/alienness of the GENOME itself (0..1). Rewards exotic
// topology, layered rules, and goals beyond plain exit — the things that make a
// roll feel like a different planet. The dynamic quality (is it actually a good
// game?) is settled later by generating + solving instances.
export function richnessOf(g) {
  const exo = EXOTIC[g.substrate.id] ?? 0;
  const ruleCount = activeRules(g).length + (g.moveModel === 'slide' ? 0.5 : 0);
  const goalBonus = { exit: 0.0, collect: 0.4, cover: 0.5, lights: 0.7 }[g.goal.type] ?? 0;
  return Math.min(1, 0.42 * exo + 0.22 * Math.min(ruleCount, 3) / 3 + 0.36 * goalBonus);
}

export { activeRules };
