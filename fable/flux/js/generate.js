// Generation: build a candidate world for a bundle, sweep it with the solver,
// and keep it only if the solver vouches — solvable, a robust-enough best basin
// (so the canonical answer survives engine-to-engine float drift), difficulty in
// band, and interest above threshold. Seeded ⇒ deterministic.

import { solve } from './solver.js';
import { grade } from './difficulty.js';

const ATTEMPTS = 36;
const ACCEPT = 50;
const MIN_ROBUST = 1.6;   // best basin must inscribe ≥ this many cells
const MAX_WINFRAC = 0.42; // reject "almost any launch wins" trivialities

export function generateWorld(rand, bundle) {
  let best = null;
  for (let salt = 0; salt < ATTEMPTS; salt++) {
    const w = bundle.build(rand.fork('w' + salt));
    w.bundle = bundle.id; w.bundleName = bundle.name;
    const sr = solve(w, { na: 96, np: 18 });
    if (!sr.solvable) continue;
    if (sr.robustness < MIN_ROBUST) continue;       // too precise → also fragile across engines
    if (sr.fineRobust < 0.8) continue;              // the stored answer must be solidly inside a winning region
    if (sr.winFrac > MAX_WINFRAC) { if (!best) best = pack(w, sr); continue; } // too easy
    const report = grade(w, sr);
    const out = { world: w, solve: sr, report };
    if (report.interest >= ACCEPT) return out;
    if (!best || report.interest > best.report.interest) best = out;
  }
  return best;
}

function pack(w, sr) { return { world: w, solve: sr, report: grade(w, sr) }; }
