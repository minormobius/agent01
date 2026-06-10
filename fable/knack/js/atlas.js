// The atlas: seed → level pipeline plus interest ranking over bands of seeds.
// Deterministic: page number n yields the identical certified-solvable, graded
// level on every machine, for ever — so /knack/?n=<n> is a permalink.

import { Rand } from './prng.js';
import { BUNDLE_BY_ID, BUNDLE_WEIGHTS } from './bundles.js';
import { generateLevel } from './generate.js';

const NS = 'knack::';

export function bundleForSeed(n) {
  const rand = new Rand(NS + n + '::bundle');
  return rand.weighted(Object.entries(BUNDLE_WEIGHTS).map(([v, w]) => ({ v, w })));
}

// Generate, certify, and grade the level for seed n. Returns {n, ...generated}
// or null. Retried across internal salts (and bundles) so the page line has no
// holes where a single roll produced nothing solvable.
export function levelForSeed(n, opts = {}) {
  for (let salt = 0; salt < 4; salt++) {
    const id = opts.bundle || bundleForSeed(n);
    const bundle = BUNDLE_BY_ID[id];
    if (!bundle) return null;
    const rand = new Rand(NS + n + (salt ? '::s' + salt : ''));
    let res = null;
    try { res = generateLevel(rand, bundle); } catch (e) { res = null; }
    if (res) return { n, ...res };
  }
  return null;
}

export function rankBand(start, count, predicate) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const p = levelForSeed(n);
    if (!p) continue;
    if (predicate && !predicate(p)) continue;
    out.push(p);
  }
  out.sort((a, b) => b.report.interest - a.report.interest);
  return out;
}

// Scan the seed line for a level matching a target (mirrors mappa's hunt).
export function hunt(start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const p = levelForSeed(start + i);
    if (!p) continue;
    if (want.bundle && p.level.bundle !== want.bundle) continue;
    if (want.minDifficulty != null && p.report.difficulty < want.minDifficulty) { best = better(best, p); continue; }
    if (want.maxDifficulty != null && p.report.difficulty > want.maxDifficulty) continue;
    if (want.minInterest != null && p.report.interest < want.minInterest) { best = better(best, p); continue; }
    return p;
  }
  return best;
}
function better(a, b) { return !a || b.report.interest > a.report.interest ? b : a; }
