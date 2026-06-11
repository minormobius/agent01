// Seed → semantic puzzle, deterministic over the committed graph. The board is
// fixed data (the kNN graph); seeds choose where on it a puzzle lives. Same
// permalink discipline as every wing: /drift/?n=<n> is one puzzle, for ever
// (modulo regenerating the committed substrate, which is versioned in git).

import { Rand } from './prng.js';
import { genLadder, genFold } from './genera.js';

const NS = 'drift::';
export const GENUS_WEIGHTS = { ladder: 6, fold: 5 };

export function genusForSeed(n) {
  const rand = new Rand(NS + n + '::genus');
  return rand.weighted(Object.entries(GENUS_WEIGHTS).map(([v, w]) => ({ v, w })));
}

export function puzzleForSeed(S, n, opts = {}) {
  for (let salt = 0; salt < 5; salt++) {
    const genus = opts.genus || genusForSeed(n);
    const rand = new Rand(NS + n + (salt ? '::s' + salt : ''));
    let p = null;
    try { p = genus === 'ladder' ? genLadder(S, rand.fork('L')) : genFold(S, rand.fork('F')); } catch (e) { p = null; }
    if (p) return { n, ...p };
  }
  return null;
}

export function rankBand(S, start, count, predicate) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const p = puzzleForSeed(S, n);
    if (!p) continue;
    if (predicate && !predicate(p)) continue;
    out.push(p);
  }
  out.sort((a, b) => b.report.interest - a.report.interest);
  return out;
}

export function hunt(S, start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const p = puzzleForSeed(S, start + i);
    if (!p) continue;
    if (want.genus && p.genus !== want.genus) continue;
    if (want.minDifficulty != null && p.report.difficulty < want.minDifficulty) { best = pick(best, p); continue; }
    if (want.maxDifficulty != null && p.report.difficulty > want.maxDifficulty) continue;
    if (want.minInterest != null && p.report.interest < want.minInterest) { best = pick(best, p); continue; }
    return p;
  }
  return best;
}
function pick(a, b) { return !a || b.report.interest > a.report.interest ? b : a; }
