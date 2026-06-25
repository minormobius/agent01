// Instantiation + grading for puzzles ON a minted law — morph's inner loop,
// running on dynamics no one wrote. Given (law, stepFn, rand): lay out a small
// world, pick a goal the law can actually satisfy, have the one oracle certify
// it, grade it. Plus the seeded per-law puzzle line for the play view.

import { Rand } from './prng.js';
import { makeWorld, solve, initialState } from './engine.js';
import { compile } from './dsl.js';

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function goldilocks(x, ideal, w) { const d = (x - ideal) / w; return Math.exp(-d * d); }

// Which goals can this law plausibly pursue? inkAll needs the law to ink.
function goalCandidates(law) {
  const g = [{ type: 'exit', w: 4 }, { type: 'collect', w: 3 }];
  const inks = law.enter === 'mark' || law.enter === 'toggle' || law.leave === 'mark';
  if (inks) g.push({ type: 'inkAll', w: 3 });
  return g;
}

export function instantiate(law, stepFn, rand) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const W = rand.range(5, 6), H = rand.range(5, 6);
    const N = W * H;
    const wrap = rand.float() < 0.3;
    const walls = new Uint8Array(N);
    const pool = [...Array(N).keys()];
    rand.shuffle(pool);
    const nWalls = Math.floor(N * (0.08 + rand.float() * 0.08));
    for (let k = 0; k < nWalls; k++) walls[pool[k]] = 1;
    const free = pool.filter((c) => !walls[c]);
    if (free.length < 8) continue;

    const goalPick = rand.weighted(goalCandidates(law).map((g) => ({ v: g, w: g.w })));
    const agent0 = free[0];
    const exit = free[free.length - 1];
    const tokens = goalPick.type === 'collect' ? free.slice(2, 2 + rand.range(2, 4)) : [];
    const goal = { type: goalPick.type };
    if (goalPick.type === 'collect' && rand.float() < 0.5) goal.thenExit = true;

    const world = makeWorld(W, H, {
      wrap, walls, agent0, exit,
      tokens,
      marks0: rand.float() < 0.3 ? free.slice(3, 3 + rand.range(1, 3)) : [],
      goal,
    });
    const sr = solve(world, stepFn, { cap: 150000 });
    if (!sr.solvable || sr.par < 4) continue;
    const report = grade(world, law, sr);
    return { world, law, solve: sr, report };
  }
  return null;
}

export function grade(world, law, sr) {
  const signals = {
    depth: clamp01(sr.par / 24),
    intricacy: clamp01(Math.log2(sr.nodes + 1) / 16),
    pace: goldilocks(sr.par, 11, 6),
  };
  const interest = Math.round(clamp01(0.42 * signals.depth + 0.34 * signals.intricacy + 0.24 * signals.pace) * 100);
  const difficulty = Math.round(clamp01(0.55 * signals.depth + 0.45 * signals.intricacy) * 100);
  const tiers = ['Gentle', 'Easy', 'Fair', 'Tricky', 'Hard', 'Wicked'];
  return { par: sr.par, nodes: sr.nodes, interest, difficulty, diffTier: tiers[Math.min(5, Math.floor(difficulty / 17))], signals };
}

// Seeded puzzle line for one codex law: puzzle p of law L, deterministic.
export function puzzleFor(entry, p) {
  const stepFn = compile(entry.law);
  for (let salt = 0; salt < 5; salt++) {
    const rand = new Rand('forge::play::' + entry.key + '::' + p + (salt ? '::s' + salt : ''));
    const got = instantiate(entry.law, stepFn, rand);
    if (got) return { ...got, stepFn, p };
  }
  return null;
}
