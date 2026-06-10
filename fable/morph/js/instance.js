// Instantiate a genome into a concrete level on its substrate, seeded. This is
// the genome's "build" step — the analogue of each wing's bundle.build, but it
// reads the genome's rules/goal/counts instead of being hand-written per game.
// The atlas then has the one oracle vouch for the result.

import { makeSubstrate } from './substrate.js';
import { compile } from './engine.js';

function shuffle(rand, a) { for (let i = a.length - 1; i > 0; i--) { const j = rand.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// connectivity-preserving wall sprinkle: lay walls, then keep only those that
// don't isolate cells (cheap flood check from the agent each add is too slow, so
// we just cap density and re-roll the whole layout if the level is unsolvable —
// the solver is the real gate).
export function buildInstance(genome, rand) {
  const { id, W, H } = genome.substrate;
  const sub = makeSubstrate(id, W, H);
  const N = sub.ncells;
  const wall = new Uint8Array(N);
  const ice = new Uint8Array(N);
  let free = [];
  for (let c = 0; c < N; c++) free.push(c);

  // walls
  const nWall = Math.floor(N * genome.counts.wallFrac);
  shuffle(rand, free);
  for (let i = 0; i < nWall; i++) wall[free[i]] = 1;
  free = free.filter((c) => !wall[c]);
  shuffle(rand, free);

  const has = { ...genome.rules };
  // ice: in a slide world, the whole non-wall board is slick
  if (genome.moveModel === 'slide') for (const c of free) ice[c] = 1;

  const inst = {
    sub, genome, has, moveModel: genome.moveModel, wall, ice,
    portals: [], gems: [], targets: [], boxesStart: [], toggles: [],
    W, H,
  };

  let fi = 0;
  const take = () => free[fi++];

  inst.agentStart = take();
  inst.agentDir = 1;

  // goal cell (for exit / collect-then-exit). Place far-ish: just take a later cell.
  let goalCell = -1;
  if (genome.goal.type === 'exit' || (genome.goal.type === 'collect' && genome.goal.thenExit)) {
    goalCell = free[free.length - 1];
    fi = Math.min(fi, free.length - 1);
  }

  if (genome.rules.push) {
    for (let k = 0; k < genome.counts.boxes; k++) inst.boxesStart.push(take());
    for (let k = 0; k < genome.counts.boxes; k++) inst.targets.push(take());
  }
  if (genome.rules.collect) for (let k = 0; k < genome.counts.gems; k++) inst.gems.push(take());
  if (genome.rules.portal) {
    for (let k = 0; k < genome.counts.portals; k++) { const a = take(), b = take(); if (a != null && b != null) inst.portals.push([a, b]); }
  }
  if (genome.rules.lights) {
    inst.toggles = [];
    for (let c = 0; c < N; c++) if (!wall[c]) inst.toggles.push(c);
    // randomise the starting lit pattern so the goal (all-on) needs work
    let init = 0;
    inst.toggles.forEach((c, i) => { if (rand.float() < 0.5) init |= (1 << i); });
    inst.litInit = init;
  }

  inst.goal = { type: genome.goal.type };
  if (goalCell >= 0) inst.goal.cell = goalCell;
  if (genome.goal.thenExit) inst.goal.thenExit = true;

  return compile(inst);
}
