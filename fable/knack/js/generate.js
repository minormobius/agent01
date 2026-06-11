// Generation: build a candidate level for a bundle, hand it to the solver, and
// keep it only if the solver vouches — solvable, par above the bundle's floor,
// and interesting enough. Generation is seeded, so the whole search for a good
// level is deterministic and puzzleForSeed(n) is stable.

import { compile } from './engine.js';
import { solve, solveAStar, analyzePath } from './solver.js';
import { grade } from './difficulty.js';

const GEN_CAP = 140000;   // node cap during generation (kept modest for speed)
const ATTEMPTS = 70;      // seeded layout attempts per call
const ACCEPT = 52;        // interest threshold to accept early

export function generateLevel(rand, bundle) {
  let best = null;
  for (let salt = 0; salt < ATTEMPTS; salt++) {
    const spec = bundle.build(rand.fork('lay' + salt));
    if (!spec) continue;
    spec.bundle = bundle.id;
    spec.bundleName = bundle.name;
    spec.theme = bundle.theme;
    const level = compile(spec);
    // deep bundles (NP-hard box-pushing) get the A* oracle; the rest BFS
    const sr = bundle.deep ? solveAStar(level, { cap: 650000 }) : solve(level, { cap: GEN_CAP });
    if (!sr.solvable) continue;
    if (sr.par < bundle.minPar) continue;
    const pa = analyzePath(level, sr.path);
    // require the solution to genuinely use the bundle's headline mechanics
    if (!usesHeadline(level, pa)) { if (!best) best = pack(level, sr, pa); continue; }
    const report = grade(level, sr, pa);
    const out = { level, solve: sr, analysis: pa, report };
    if (report.interest >= ACCEPT) return out;
    if (!best || report.interest > best.report.interest) best = out;
  }
  return best;
}

// Reject levels where the headline mechanic is decorative (e.g. a vault whose
// optimal path never touches a door). Keeps the genre honest.
function usesHeadline(level, pa) {
  const used = new Set(pa.used);
  switch (level.bundle) {
    case 'depot': return used.has('box');
    case 'warehouse': return used.has('box');
    case 'frost': return used.has('ice');
    case 'vault': return used.has('key') || used.has('door');
    case 'relay': return used.has('box') && (used.has('gate') || used.has('button'));
    case 'forage': return used.has('coin');
    default: return true; // tangle: any mix is fine
  }
}

function pack(level, sr, pa) { return { level, solve: sr, analysis: pa, report: grade(level, sr, pa) }; }
