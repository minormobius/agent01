// The atlas: seed → certified card game. gameForSeed(n) rolls a genome and
// ships it only if the tribunal certifies (terminates · skillful · fair) —
// same permalink discipline as every wing, on the adversarial oracle family.

import { Rand } from './prng.js';
import { sampleGenome, genomeKey, describe } from './genome.js';
import { certify } from './tribunal.js';

const NS = 'deal::';

export function gameForSeed(n) {
  for (let salt = 0; salt < 8; salt++) {
    const rand = new Rand(NS + 'g::' + n + (salt ? '::s' + salt : ''));
    const genome = sampleGenome(rand);
    const report = certify(genome);
    if (report.certified) return { n, genome, key: genomeKey(genome), rules: describe(genome), report };
  }
  return null;
}

export function rankBand(start, count) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const g = gameForSeed(n);
    if (g) out.push(g);
  }
  out.sort((a, b) => b.report.interest - a.report.interest);
  return out;
}

export function hunt(start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const g = gameForSeed(start + i);
    if (!g) continue;
    if (want.form && g.genome.form !== want.form) continue;
    if (want.minInterest != null && g.report.interest < want.minInterest) {
      if (!best || g.report.interest > best.report.interest) best = g;
      continue;
    }
    return g;
  }
  return best;
}
