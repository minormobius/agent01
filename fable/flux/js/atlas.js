// The atlas: seed → world pipeline + interest ranking. Deterministic — page n
// yields the identical certified-solvable, graded world (and canonical answer)
// on every machine, so /flux/?n=<n> is a permalink.

import { Rand } from './prng.js';
import { BUNDLE_BY_ID, BUNDLE_WEIGHTS } from './bundles.js';
import { generateWorld } from './generate.js';

const NS = 'flux::';

export function bundleForSeed(n) {
  const rand = new Rand(NS + n + '::bundle');
  return rand.weighted(Object.entries(BUNDLE_WEIGHTS).map(([v, w]) => ({ v, w })));
}

export function worldForSeed(n, opts = {}) {
  for (let salt = 0; salt < 4; salt++) {
    const id = opts.bundle || bundleForSeed(n);
    const bundle = BUNDLE_BY_ID[id];
    if (!bundle) return null;
    const rand = new Rand(NS + n + (salt ? '::s' + salt : ''));
    let res = null;
    try { res = generateWorld(rand, bundle); } catch (e) { res = null; }
    if (res) return { n, ...res };
  }
  return null;
}

export function rankBand(start, count, predicate) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const p = worldForSeed(n);
    if (!p) continue;
    if (predicate && !predicate(p)) continue;
    out.push(p);
  }
  out.sort((a, b) => b.report.interest - a.report.interest);
  return out;
}

export function hunt(start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const p = worldForSeed(start + i);
    if (!p) continue;
    if (want.bundle && p.world.bundle !== want.bundle) continue;
    if (want.minDifficulty != null && p.report.difficulty < want.minDifficulty) { best = pick(best, p); continue; }
    if (want.maxDifficulty != null && p.report.difficulty > want.maxDifficulty) continue;
    if (want.minInterest != null && p.report.interest < want.minInterest) { best = pick(best, p); continue; }
    return p;
  }
  return best;
}
function pick(a, b) { return !a || b.report.interest > a.report.interest ? b : a; }
