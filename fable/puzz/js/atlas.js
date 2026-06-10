// The atlas: the seed → puzzle pipeline, and the interestingness ranking over
// bands of seeds. This is the layer that turns a deterministic generator into a
// *navigable space* — the same role mappa's worldSignals and games/gen's critic
// play for their domains. Here the oracle underneath is the real solver.
//
// puzzleForSeed(n) is deterministic: page number n yields the identical,
// certified-unique, graded puzzle on any machine, for ever. That is what makes
// the permalink /puzz/?n=<n> meaningful.

import { Rand } from './prng.js';
import { GENERA_BY_ID, GENUS_WEIGHTS } from './genera/index.js';
import { grade } from './difficulty.js';

const NS = 'puzz::';

// Which genus does seed n draw? Weighted, deterministic.
export function genusForSeed(n) {
  const rand = new Rand(NS + n + '::genus');
  const items = Object.entries(GENUS_WEIGHTS).map(([id, w]) => ({ v: id, w }));
  return rand.weighted(items);
}

// Generate, certify, and grade the puzzle for seed n. Returns
// { n, inst, report } or null if generation failed (rare; caller can skip).
// Generation is retried across a couple of internal salts so a single unlucky
// roll doesn't leave a hole in the page-number line.
export function puzzleForSeed(n, opts = {}) {
  const forceGenus = opts.genus || null;
  for (let salt = 0; salt < 6; salt++) {
    const id = forceGenus || genusForSeed(n);
    const g = GENERA_BY_ID[id];
    if (!g) return null;
    const rand = new Rand(NS + n + (salt ? '::r' + salt : ''));
    const params = g.pickParams(rand.fork('params'));
    let inst = null;
    try { inst = g.generate(rand.fork('gen'), params); } catch (e) { inst = null; }
    if (!inst) continue;
    const report = grade(inst);
    return { n, inst, report };
  }
  return null;
}

// Score a band of seeds for the gallery, return them sorted by interest (desc).
// Generation is real work, so callers should band modestly (a page at a time)
// and cache. `predicate` can filter (e.g. by genus or min difficulty).
export function rankBand(start, count, predicate) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const p = puzzleForSeed(n);
    if (!p) continue;
    if (predicate && !predicate(p)) continue;
    out.push(p);
  }
  out.sort((a, b) => b.report.interest - a.report.interest);
  return out;
}

// Hunt the seed line for a puzzle matching a target (e.g. high interest, or a
// specific genus + difficulty tier). Returns the first/best match found within
// `budget` seeds from `start`. Mirrors mappa's "find a Great Oxidation" scan.
export function hunt(start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const n = start + i;
    const p = puzzleForSeed(n);
    if (!p) continue;
    if (want.genus && p.inst.genus !== want.genus) continue;
    if (want.minDifficulty != null && p.report.difficulty < want.minDifficulty) continue;
    if (want.maxDifficulty != null && p.report.difficulty > want.maxDifficulty) continue;
    if (want.minInterest != null && p.report.interest < want.minInterest) {
      if (!best || p.report.interest > best.report.interest) best = p;
      continue;
    }
    return p; // satisfies all hard constraints
  }
  return best;
}
