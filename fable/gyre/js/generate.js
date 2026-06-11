// Generation: build a candidate torus world, sweep it with the solver, keep it
// only if the solver vouches — solvable, fine-robust answer, not trivial,
// interesting. Seeded ⇒ deterministic.

import { solve } from './solver.js';
import { grade } from './difficulty.js';

const ATTEMPTS = 36;
const ACCEPT = 50;
const MIN_ROBUST = 1.6;
const MAX_WINFRAC = 0.45;

export function generateWorld(rand, bundle) {
  let best = null;
  for (let salt = 0; salt < ATTEMPTS; salt++) {
    const w = bundle.build(rand.fork('w' + salt));
    w.bundle = bundle.id; w.bundleName = bundle.name;
    const sr = solve(w, { na: 96, np: 16 });
    if (!sr.solvable) continue;
    if (sr.robustness < MIN_ROBUST) continue;
    if (sr.fineRobust < 0.8) continue;
    if (sr.winFrac > MAX_WINFRAC) { if (!best) best = pack(w, sr); continue; }
    const report = grade(w, sr);
    const out = { world: w, solve: sr, report };
    if (report.interest >= ACCEPT) return out;
    if (!best || report.interest > best.report.interest) best = out;
  }
  return best;
}

function pack(w, sr) { return { world: w, solve: sr, report: grade(w, sr) }; }
