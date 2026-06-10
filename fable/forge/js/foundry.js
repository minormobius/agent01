// The foundry — the level-2 engine. It walks a seeded line of candidate
// genomes and admits a law into the CODEX only if it passes three gates:
//
//   1. ALIVE       — its probe state-space isn't degenerate (the law can act).
//   2. NOVEL       — its behavioral fingerprint sits measurably far from every
//                    hand-written law AND every law already in the codex
//                    (novelty search: distance to the known world).
//   3. PLAYABLE    — the unchanged BFS oracle can certify real puzzles on it
//                    (a law that supports no solvable, non-trivial level is a
//                    curiosity, not a game form).
//
// codexUpTo(n) is deterministic: the first n admitted laws are the same on
// every machine, for ever — the discovered forms get permalinks too.

import { Rand } from './prng.js';
import { sampleLaw, compile, describe, lawKey, KNOWN_LAWS } from './dsl.js';
import { fingerprint, fpDistance, nearestKnown, FP_KEYS } from './fingerprint.js';
import { instantiate } from './atlas.js';

const NS = 'forge::';
const NOVELTY_MIN = 0.22;       // must sit at least this far from everything known
const ALIVE_MIN_STATES = 30;    // probe graph must have some life in it

let _knowns = null;
export function knownFingerprints() {
  if (!_knowns) _knowns = KNOWN_LAWS.map((k) => ({ name: k.name, law: k.law, fp: fingerprint(compile(k.law)) }));
  return _knowns;
}

// Evaluate one candidate genome against an archive. Returns an admission
// record (admitted or rejected, with reasons + evidence).
export function evaluate(law, archive) {
  const stepFn = compile(law);
  const fp = fingerprint(stepFn);
  if (fp._states < ALIVE_MIN_STATES) return { admitted: false, reason: 'inert', fp };

  const pool = [...knownFingerprints(), ...archive];
  const { nearest, dist } = nearestKnown(fp, pool);
  if (dist < NOVELTY_MIN) return { admitted: false, reason: 'derivative', nearest: nearest?.name, dist, fp };

  // playability: the oracle must certify at least one decent puzzle
  let bestPuzzle = null;
  for (let t = 0; t < 8; t++) {
    const p = instantiate(law, stepFn, new Rand(NS + 'probe::' + lawKey(law) + '::' + t));
    if (!p) continue;
    if (!bestPuzzle || p.report.interest > bestPuzzle.report.interest) bestPuzzle = p;
    if (p.report.interest >= 45) break;
  }
  if (!bestPuzzle) return { admitted: false, reason: 'unplayable', dist, fp };

  return { admitted: true, fp, dist, nearest: nearest?.name, bestPuzzle };
}

// Walk the seeded candidate line and return the codex of the first `count`
// admitted laws (deterministic). `budget` caps the scan.
export function buildCodex(count, opts = {}) {
  const budget = opts.budget ?? count * 60;
  const archive = [];
  const codex = [];
  const seenKeys = new Set();
  const usedNames = new Set();
  let scanned = 0, inert = 0, derivative = 0, unplayable = 0;
  for (let i = 1; i <= budget && codex.length < count; i++) {
    scanned++;
    const law = sampleLaw(new Rand(NS + 'cand::' + i));
    const key = lawKey(law);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const ev = evaluate(law, archive);
    if (!ev.admitted) {
      if (ev.reason === 'inert') inert++;
      else if (ev.reason === 'derivative') derivative++;
      else unplayable++;
      continue;
    }
    const entry = {
      id: codex.length + 1,
      candidateIndex: i,
      law, key,
      name: uniqueName(nameLaw(law, ev.fp, codex.length + 1), usedNames),
      text: describe(law),
      fp: ev.fp,
      noveltyDist: ev.dist,
      nearestKnown: ev.nearest,
      samplePar: ev.bestPuzzle.report.par,
      sampleInterest: ev.bestPuzzle.report.interest,
      goal: ev.bestPuzzle.world.goal.type,
    };
    archive.push({ name: entry.name, fp: ev.fp });
    codex.push(entry);
  }
  return { codex, stats: { scanned, inert, derivative, unplayable, admitted: codex.length } };
}

// name a discovered law from its dominant behavioral trait (seeded flourish)
const TRAIT_ADJ = {
  irreversibility: ['Withering', 'One-Way', 'Burning', 'Severing'],
  mutation: ['Inking', 'Staining', 'Scribing', 'Etching'],
  stride: ['Longstride', 'Hurtling', 'Skating', 'Headlong'],
  drift: ['Turning', 'Gyring', 'Veering', 'Wheeling'],
  branching: ['Open', 'Manifold', 'Wandering', 'Loose'],
  volume: ['Deep', 'Endless', 'Vast', 'Unfolding'],
};
const NOUN = ['Law', 'Gait', 'Creed', 'Rite', 'Manner', 'Discipline', 'Custom', 'Walk'];
function uniqueName(base, used) {
  let name = base, k = 2;
  const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII'];
  while (used.has(name) && k < ROMAN.length) name = base + ROMAN[k++];
  used.add(name);
  return name;
}
function nameLaw(law, fp, id) {
  let bestK = 'volume', bestV = -1;
  for (const k of FP_KEYS) if ((fp[k] ?? 0) > bestV) { bestV = fp[k]; bestK = k; }
  const r = new Rand(NS + 'name::' + lawKey(law));
  return `the ${r.pick(TRAIT_ADJ[bestK])} ${r.pick(NOUN)}`;
}

// ---- streaming interface for the UI: advance one candidate per call ----
export function makeFoundry() {
  const archive = [];
  const codex = [];
  const seenKeys = new Set();
  const usedNames = new Set();
  let i = 0;
  return {
    codex,
    stats: { scanned: 0, inert: 0, derivative: 0, unplayable: 0 },
    next() {
      i++;
      this.stats.scanned++;
      const law = sampleLaw(new Rand(NS + 'cand::' + i));
      const key = lawKey(law);
      if (seenKeys.has(key)) return { i, dup: true };
      seenKeys.add(key);
      const ev = evaluate(law, archive);
      if (!ev.admitted) {
        if (ev.reason === 'inert') this.stats.inert++;
        else if (ev.reason === 'derivative') this.stats.derivative++;
        else this.stats.unplayable++;
        return { i, law, key, ...ev };
      }
      const entry = {
        id: codex.length + 1, candidateIndex: i, law, key,
        name: uniqueName(nameLaw(law, ev.fp, codex.length + 1), usedNames),
        text: describe(law), fp: ev.fp,
        noveltyDist: ev.dist, nearestKnown: ev.nearest,
        samplePar: ev.bestPuzzle.report.par, sampleInterest: ev.bestPuzzle.report.interest,
        goal: ev.bestPuzzle.world.goal.type,
      };
      archive.push({ name: entry.name, fp: ev.fp });
      codex.push(entry);
      return { i, law, key, admitted: true, entry };
    },
  };
}
