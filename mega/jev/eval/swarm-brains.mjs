// swarm-brains.mjs — which brain should the page be running?
//
//   node mega/jev/eval/swarm-brains.mjs --steps 400 --top 12
//   node mega/jev/eval/swarm-brains.mjs --seed-sweep 400      # the 0.5 question
//
// THE PROBLEM THIS SOLVES, in fluoddity's own words. `rule_seed` is the brain
// — it seeds the ten Gaussian centres that are the entire sensor→force map —
// and `defaultConfig()` sets it to `Math.random()`. There is no default brain.
// engine.js says so and says what to do about it:
//
//   "The rule_seed (a 10-term Fourier black box) still dominates whether a
//    given draw is alive, so callers that want a guaranteed-lively organism
//    should reject-sample on fitness on top."
//
// This port ran `evalRule(0.5, …)`: the literal 0.5, chosen by nobody, never
// looked at. So every swarm run so far drove one arbitrary brain out of a
// continuum, and "it still doesn't look right on fluoddity" is exactly what
// that looks like from outside.
//
// Rather than reject-sample blind, this scores the 120 organisms PEOPLE
// PUBLISHED to fluoddity's gallery (`lab/fluoddity-gallery.json`, pulled from
// ATProto). Those are genomes a human looked at and chose to keep, which is a
// far better prior than a uniform draw — and it means the brain this page
// runs is one fluoddity's own users selected, not one we invented.
//
// SCORED ON FLUODDITY'S OWN MEASURES, not ours: `verdict` and `fitness2` from
// `probe.mjs`, which are copied verbatim from `fluoddity/descriptors.js` and
// predate this experiment. The visible measures (dispersal, cohort coherence)
// are reported alongside but do not rank — a brain has to be alive by
// fluoddity's lights first.
//
// No model calls: every arm here is the deterministic rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeSwarm, senseAll, step, probe, orderOf, ruleDecider } from '../swarm/swarm.mjs';
import { DEFAULT_CFG } from '../swarm/rule.mjs';
import { verdict, fitness, fitness2 } from '../swarm/probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STEPS = Number(arg('steps', 400));
const N = Number(arg('n', 256));
const TOP = Number(arg('top', 12));
const OUT = arg('out', null);
const SWEEP = process.argv.includes('--seed-sweep');
const CONF = { n: N, dim: 480 };   // substrate defaults to fluoddity's own matchSubstrate()

/**
 * Run one genome and read it at several horizons.
 *
 * The horizons matter more than they look. A tick here is ONE physics step;
 * fluoddity's playground runs `substeps: 8` per rendered frame, so a second of
 * watching it at 60fps is ~480 steps. The 100-tick gate is therefore about a
 * fifth of a second of fluoddity. Reading at 100 / 200 / 400 says whether a
 * brain is slow or simply dead.
 */
function run(cfg, steps) {
  const sw = makeSwarm({ ...CONF, cfg });
  const marks = {};
  let prev = null;
  for (let t = 1; t <= steps; t++) {
    const s = senseAll(sw);
    step(sw, s, ruleDecider(sw, s));
    if (t === 100 || t === 200 || t === steps) {
      const v = probe(sw), o = orderOf(sw);
      marks[t] = { fill: v.fill, struct: v.struct, motion: v.motion, blowout: v.blowout,
        verdict: verdict(v, false), fitness: fitness(v),
        fitness2: prev ? fitness2(prev, v) : 0,
        dispersal: o.dispersal, coherence: o.coherence, spread: o.spread, nn: o.nnDist };
      prev = v;
    }
  }
  return marks;
}

const rows = [];
if (SWEEP) {
  // The control for the choice itself: is 0.5 unusually bad, or is the whole
  // seed axis this quiet at 256 particles? 64 seeds on the default genome.
  console.log(`seed sweep — ${64} seeds on defaultConfig(), ${STEPS} steps, ${N} particles\n`);
  for (let i = 0; i < 64; i++) {
    const rule_seed = i / 64;
    const m = run({ ...DEFAULT_CFG, rule_seed }, STEPS);
    rows.push({ name: `seed ${rule_seed.toFixed(4)}`, rule_seed, marks: m });
  }
} else {
  const gal = JSON.parse(readFileSync(new URL('../lab/fluoddity-gallery.json', import.meta.url)));
  console.log(`${gal.organisms.length} published organisms, ${STEPS} steps, ${N} particles\n`);
  for (const o of gal.organisms) {
    const cfg = { ...DEFAULT_CFG, ...o.config };
    rows.push({ name: o.name || '(untitled)', rkey: o.rkey, rule_seed: cfg.rule_seed,
      cohorts: cfg.cohorts, ic: cfg.initial_conditions, marks: run(cfg, STEPS) });
  }
  // The incumbent, for comparison, scored the same way.
  rows.push({ name: '** the page\'s current 0.5 **', rule_seed: 0.5,
    cohorts: 16, ic: 0, marks: run({ ...DEFAULT_CFG, rule_seed: 0.5 }, STEPS) });
}

const key = (r) => r.marks[STEPS].fitness2;
rows.sort((a, b) => key(b) - key(a));
const fmt = (r) => {
  const m = r.marks[STEPS], m1 = r.marks[100];
  return `${r.name.slice(0, 26).padEnd(27)} seed ${String(r.rule_seed).slice(0, 7).padEnd(8)}` +
    ` fit2 ${m.fitness2.toFixed(4)}  fill ${m.fill.toFixed(3)}  struct ${m.struct.toFixed(2)}` +
    `  ${m.verdict.padEnd(10)} | @100 ${m1.verdict.padEnd(10)} fill ${m1.fill.toFixed(3)}` +
    ` | disp ${m.dispersal.toFixed(3)} coh ${m.coherence.toFixed(2)}`;
};
for (const r of rows.slice(0, TOP)) console.log(fmt(r));
const incumbent = rows.findIndex((r) => r.name.includes('current 0.5'));
if (incumbent >= 0) {
  console.log(`\n… the page's current brain ranks ${incumbent + 1} of ${rows.length}:`);
  console.log(fmt(rows[incumbent]));
}
const alive = rows.filter((r) => r.marks[STEPS].verdict === 'alive').length;
const nondead = rows.filter((r) => !['dead', 'sparse'].includes(r.marks[STEPS].verdict)).length;
console.log(`\n${alive} of ${rows.length} read 'alive' at ${STEPS} steps; ${nondead} are neither dead nor sparse.`);
if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), steps: STEPS, conf: CONF, rows }, null, 1));
  console.log(`wrote ${OUT}`); }
