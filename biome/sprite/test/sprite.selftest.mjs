// biome/sprite/test/sprite.selftest.mjs — the contract for the iNaturalist sprite engine (Phase 1).
//
// Run: node biome/sprite/test/sprite.selftest.mjs
//
// Proves the three things Phase 1 must guarantee: (1) the classifier is TOTAL over the live deck —
// every organism resolves to a known archetype; (2) the quadruped rig is DETERMINISTIC — same
// organism → byte-identical sprite & posed geometry, for ever (the /sprite/?id=… permalink contract);
// (3) the rig is SANE — finite coordinates across the whole walk cycle, topologically valid skeleton,
// and proportions that scale monotonically with body mass.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classify, build, buildable, seedOf } from '../bauplan.mjs';
import { solve, bbox } from '../render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '../../gacha/catalog.json'), 'utf8'));
const ORG = catalog.organisms;
const ALL = Object.values(ORG);
const ANIMALS = ALL.filter((o) => o.kind === 'animal');
const QUADS = ALL.filter(buildable);

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${info ? '  — ' + info : ''}`); }
};
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

const KNOWN = new Set(['quadruped', 'avian', 'serpent', 'finned', 'octopod', 'hexapod', 'radial', 'vermiform', 'rooted']);

console.log('\nsprite.selftest — iNaturalist sprite engine (Phase 1: quadruped)\n');

// 1. classifier is total over the live deck
{
  let allKnown = true, unresolved = '';
  for (const o of ALL) {
    const c = classify(o);
    if (!KNOWN.has(c.archetype)) { allKnown = false; unresolved = `${o.id}→${c.archetype}`; }
  }
  ok('classifier resolves every catalog organism to a known archetype', allKnown, unresolved);
  ok('a meaningful share of the deck classifies as quadruped (≥12)', QUADS.length >= 12, `got ${QUADS.length}`);
  // spot-checks against curated truth
  ok('Horse → quadruped (mammal)', classify(ORG.horse).archetype === 'quadruped');
  ok('Mallard duck → avian (bird)', classify(ORG.duck).archetype === 'avian');
  ok('Grass snake → serpent', classify(ORG.grasssnake).archetype === 'serpent');
  ok('Pike → finned (fish)', classify(ORG.pike).archetype === 'finned');
  ok('Sweet potato (producer) → rooted', classify(ORG.crop).archetype === 'rooted');
}

// 2. determinism — same organism builds byte-identical, and poses identically
{
  let stable = true, drift = '';
  for (const o of QUADS) {
    const a = JSON.stringify(build(o));
    const b = JSON.stringify(build(o));
    if (a !== b) { stable = false; drift = o.id; break; }
  }
  ok('build() is pure — same organism → byte-identical sprite', stable, drift);

  const s1 = build(ORG.horse), s2 = build(ORG.horse);
  let poseStable = true;
  for (let ph = 0; ph < 6.3; ph += 0.37) {
    if (JSON.stringify(solve(s1, ph)) !== JSON.stringify(solve(s2, ph))) { poseStable = false; break; }
  }
  ok('solve() is deterministic across the walk cycle', poseStable);
  ok('seed derives from the stable iNaturalist taxon id', seedOf(ORG.horse) === `inat:${ORG.horse.inat.inatId}`);

  // different organisms generally differ
  const seeds = new Set(QUADS.map((o) => JSON.stringify(build(o).segs)));
  ok('distinct organisms yield distinct rigs (no accidental collisions)', seeds.size >= QUADS.length - 1,
    `${seeds.size}/${QUADS.length} unique`);
}

// 3. sanity — finite geometry, valid topology, mass→size monotonicity
{
  let allFinite = true, badAt = '';
  for (const o of QUADS) {
    const sp = build(o);
    for (let ph = 0; ph < 6.3; ph += 0.21) {
      const W = solve(sp, ph);
      for (const id in W) {
        const w = W[id];
        if (!finite(w.base.x) || !finite(w.base.y) || !finite(w.tip.x) || !finite(w.tip.y) || !finite(w.abs)) {
          allFinite = false; badAt = `${o.id}/${id}@${ph.toFixed(2)}`;
        }
      }
    }
  }
  ok('every joint is finite across the full walk cycle (no NaN/Infinity)', allFinite, badAt);

  // topology: parents are always defined before children (solve relies on it)
  let ordered = true, where = '';
  for (const o of QUADS) {
    const seen = new Set();
    for (const s of build(o).segs) {
      if (s.parent != null && !seen.has(s.parent)) { ordered = false; where = `${o.id}:${s.id}`; }
      seen.add(s.id);
    }
  }
  ok('skeletons are topologically ordered (parent before child)', ordered, where);

  // every quadruped has the four legs the walk clip phases
  let legged = true, missing = '';
  for (const o of QUADS) {
    const ids = new Set(build(o).segs.map((s) => s.id));
    for (const t of ['FN', 'FF', 'BN', 'BF']) {
      if (!ids.has(t + 'U')) { legged = false; missing = `${o.id}:${t}`; }
    }
  }
  ok('every quadruped carries all four rigged legs', legged, missing);

  // proportions scale with mass: the horse (450 kg) is bigger than the weasel (60 g)
  const big = bbox(build(ORG.horse)), small = bbox(build(ORG.weasel));
  ok('body mass drives size — horse bbox larger than weasel bbox', big.w > small.w && big.h > small.h,
    `horse ${big.w.toFixed(0)}×${big.h.toFixed(0)} vs weasel ${small.w.toFixed(0)}×${small.h.toFixed(0)}`);

  // monotonic-ish over a sorted sample (allow jitter): largest 3 average bigger than smallest 3
  const byMass = [...QUADS].sort((a, b) => (a.mass_g || 0) - (b.mass_g || 0));
  const area = (o) => { const b = bbox(build(o)); return b.w * b.h; };
  const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const lo = avg(byMass.slice(0, 3).map(area)), hi = avg(byMass.slice(-3).map(area));
  ok('heaviest organisms render larger than lightest (avg area)', hi > lo, `lo ${lo.toFixed(0)} hi ${hi.toFixed(0)}`);

  ok('non-quadruped archetypes refuse to build (honest Phase-1 boundary)',
    (() => { try { build(ORG.pike); return false; } catch { return true; } })());
}

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
