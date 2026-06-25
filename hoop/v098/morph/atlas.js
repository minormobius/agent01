// The meta-atlas. Two seeds, two knobs:
//   • metaSeed  → a GENOME (a whole game: topology, law, goal, look)
//   • instSeed  → an INSTANCE of that game (a concrete, solver-verified puzzle)
// gameForSeed(metaSeed) rolls the genome, then searches instSeeds for the first
// instance the oracle vouches for. "surprise" advances metaSeed (new planet);
// "new puzzle" advances instSeed within the same genome (same game, fresh level).
// Both are deterministic ⇒ /morph/?n=<meta>&p=<inst> is a permalink.

import { Rand } from './prng.js';
import { sampleGenome } from './genome.js';
import { buildInstance } from './instance.js';
import { solve, analyzePath } from './solver.js';
import { gradeInstance, headlineUsed } from './difficulty.js';

const NS = 'morph::';
const GEN_CAP = 200000;
const INST_TRIES = 40;     // instSeeds to try before giving up on a genome
const MIN_PAR = 4;

export function genomeForSeed(metaSeed) {
  return sampleGenome(new Rand(NS + 'g::' + metaSeed));
}

// Build + certify one instance for (metaSeed, instSeed). Returns the graded
// instance or null if that particular instSeed didn't yield a good puzzle.
export function instanceFor(genome, metaSeed, instSeed) {
  const rand = new Rand(NS + metaSeed + '::i' + instSeed);
  let inst;
  try { inst = buildInstance(genome, rand); } catch (e) { return null; }
  const sr = solve(inst, { cap: GEN_CAP });
  if (!sr.solvable || sr.par < MIN_PAR) return null;
  const pa = analyzePath(inst, sr.path);
  if (!headlineUsed(inst, pa)) return null;
  const report = gradeInstance(inst, sr, pa);
  return { inst, solve: sr, analysis: pa, report };
}

// Roll the genome for metaSeed, then find a good instance starting at instSeed.
// Returns { metaSeed, instSeed, genome, ... } or null if the genome is a dud
// (no good instance within INST_TRIES — a genome-level rejection).
export function gameForSeed(metaSeed, instSeed = 0) {
  const genome = genomeForSeed(metaSeed);
  let best = null;
  for (let k = 0; k < INST_TRIES; k++) {
    const got = instanceFor(genome, metaSeed, instSeed + k);
    if (!got) continue;
    if (!best || got.report.interest > best.report.interest) best = { ...got, instSeed: instSeed + k };
    if (got.report.interest >= 48) return { metaSeed, genome, instSeed: instSeed + k, ...got };
  }
  return best ? { metaSeed, genome, ...best } : null;
}

// A specific instance permalink target (no search — exact instSeed), falling
// back to the search if that exact one isn't good.
export function exactGame(metaSeed, instSeed) {
  const genome = genomeForSeed(metaSeed);
  const got = instanceFor(genome, metaSeed, instSeed);
  if (got) return { metaSeed, genome, instSeed, ...got };
  return gameForSeed(metaSeed, instSeed);
}

// Rank a band of META seeds (whole games) by genome richness × best-instance
// interest — i.e. which *planets* are most worth visiting.
export function rankGames(start, count) {
  const out = [];
  for (let n = start; n < start + count; n++) {
    const g = gameForSeed(n);
    if (!g) continue;
    out.push(g);
  }
  out.sort((a, b) => (b.genome.richness * 0.5 + b.report.interest / 100 * 0.5) - (a.genome.richness * 0.5 + a.report.interest / 100 * 0.5));
  return out;
}

// Hunt the meta-seed line for a game matching wants (a substrate, a primary, a
// minimum richness). This is the "surprise me, but weirder" engine.
export function huntGame(start, budget, want = {}) {
  let best = null;
  for (let i = 0; i < budget; i++) {
    const metaSeed = start + i;
    const genome = genomeForSeed(metaSeed);
    if (want.substrate && genome.substrate.id !== want.substrate) continue;
    if (want.primary && genome.primary !== want.primary) continue;
    if (want.minRichness != null && genome.richness < want.minRichness) continue;
    const g = gameForSeed(metaSeed);
    if (!g) continue;
    if (want.minInterest != null && g.report.interest < want.minInterest) { if (!best || g.report.interest > best.report.interest) best = g; continue; }
    return g;
  }
  return best;
}
