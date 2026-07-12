// mappa/civ/qd.js — the outer loop: QUALITY-DIVERSITY search over configs (M9).
//
// Because fitness is endogenous and there's no objective, the outer engine is NOT a
// fitness-max GA toward a target — it's MAP-Elites. Behaviour-descriptor axes
// discretise an archive; we mutate agent/culture/seeding configs, run each headless,
// score with civSignals, and keep the highest-scoring run PER archive cell. The output
// is a diverse shelf of qualitatively distinct interesting civilizations — the
// "properly interesting set of solutions" — not one optimum. Three methods: qd (the
// MAP-Elites loop), grid (systematic axis sweep), random (uniform sampling baseline).

import { stream } from './prng.js';
import { createSim } from './engine.js';
import { loadCivWorld } from './world.js';
import { civSignals } from './signals.js';
import { defaultConfig, normalizeConfig, encodeCivConfig, decodeCivConfig } from './config.js';
import { PKG_ID } from './caps.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// mutable knobs and their ranges — the GA's orthogonal search dimensions.
const RANGES = {
  'agent.b0': [0.25, 0.6], 'agent.d0': [0.015, 0.05],
  'agent.dispersalGain': [0.6, 3.0], 'agent.corridorWeight': [0.2, 1.6],
  'agent.densityWeight': [0.6, 2.2], 'agent.subWeight': [0.6, 2.4], 'agent.habWeight': [0.4, 1.6],
  'culture.mutationRate': [0.02, 0.14], 'culture.innovationBase': [0.002, 0.012],
  'culture.splitThreshold': [400, 1600], 'popScale': [350, 1000],
};
const CLIMATES = ['stable', 'kurgan', 'beringia', '4.2ka'];

function getPath(o, p) { return p.split('.').reduce((a, k) => a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

// ---- behaviour descriptor: discretise a run into archive coordinates ------------
// axes = # surviving cultures × max era × separated homelands × independent industry.
const AXES = [
  { key: 'cultures', label: 'cultures', bins: [1, 2, 4, 9, 21] },     // → 6 buckets
  { key: 'maxTier', label: 'era', bins: [1, 2, 3, 4, 5] },            // → 6 buckets (tier 0..5)
  { key: 'homelands', label: 'homelands', bins: [2, 3, 4] },          // → 4 buckets
  { key: 'industrialOrigins', label: 'industry', bins: [1, 2] },     // → 3 buckets
];
function binOf(v, bins) { let b = 0; for (const t of bins) { if (v >= t) b++; else break; } return b; }
export function behaviorCoords(facts) { return AXES.map(a => binOf(facts[a.key] ?? 0, a.bins)); }

// ---- config generators ----------------------------------------------------------
export function randomConfig(rng) {
  const c = defaultConfig();
  for (const p in RANGES) { const [lo, hi] = RANGES[p]; setPath(c, p, +(lo + rng() * (hi - lo)).toFixed(4)); }
  c.culture.splitThreshold = Math.round(c.culture.splitThreshold);
  c.popScale = Math.round(c.popScale);
  c.seeding.nucleusCount = 1 + Math.floor(rng() * 4);
  c.seeding.founders = c.seeding.nucleusCount * (40 + Math.floor(rng() * 60));
  c.culture.subsistence = PKG_ID.forager;
  c.culture.seedTech = rng() < 0.5 ? ['fire'] : ['fire', 'herding'];
  c.climate = { preset: CLIMATES[Math.floor(rng() * CLIMATES.length)] };
  return c;
}
// mutate a parent config: perturb a few knobs (gene-trick orthogonality — one knob at
// a time leaves the others' character intact). ~3 fields + occasional structural flip.
export function mutateConfig(parent, rng) {
  const c = normalizeConfig(parent);
  c.agent = { ...c.agent, driveWeights: c.agent.driveWeights.slice() };
  c.culture = { ...c.culture, normWeights: c.culture.normWeights.slice(), seedTech: c.culture.seedTech.slice() };
  c.seeding = { ...c.seeding };
  const keys = Object.keys(RANGES);
  const nMut = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nMut; i++) {
    const p = keys[Math.floor(rng() * keys.length)], [lo, hi] = RANGES[p];
    const cur = getPath(c, p), span = hi - lo;
    let v = cur + (rng() - 0.5) * span * 0.4;
    v = clamp(v, lo, hi);
    if (p === 'culture.splitThreshold' || p === 'popScale') v = Math.round(v); else v = +v.toFixed(4);
    setPath(c, p, v);
  }
  // structural mutations (rarer)
  if (rng() < 0.3) c.seeding.nucleusCount = clamp(c.seeding.nucleusCount + (rng() < 0.5 ? -1 : 1), 1, 4);
  if (rng() < 0.25) c.climate = { preset: CLIMATES[Math.floor(rng() * CLIMATES.length)] };
  if (rng() < 0.2) c.culture.normWeights = c.culture.normWeights.map(x => clamp(x + (rng() - 0.5) * 0.3, 0, 1));
  c.seeding.founders = c.seeding.nucleusCount * (40 + Math.floor(rng() * 60));
  return c;
}

// ---- one evaluation --------------------------------------------------------------
function evaluate(w, cfg, ticks, civSeed) {
  const ch = createSim(w, cfg, civSeed).run(ticks);
  const sig = civSignals(ch);
  return { score: sig.score, flags: sig.flags, descriptor: sig.descriptor, facts: sig.facts, signals: sig.signals };
}

// ---- the sweep -------------------------------------------------------------------
// opts: { method:'qd'|'grid'|'random', budget, ticks, civSeed, log }
export function sweep(worldInput, opts = {}) {
  const w = worldInput.nbrOff ? worldInput : loadCivWorld(worldInput);
  const method = opts.method || 'qd';
  const budget = Math.max(1, opts.budget || 60);
  const ticks = opts.ticks || 1000;
  const civSeed = (opts.civSeed >>> 0) || 1;
  const log = opts.log || (() => {});
  const rng = stream(civSeed, 'qd-search-' + method);

  const archive = new Map(); // coordKey → { config, score, descriptor, coords, facts, flags }
  let evals = 0, improvements = 0;
  const place = (cfg, res) => {
    const coords = behaviorCoords(res.facts), key = coords.join(',');
    const prev = archive.get(key);
    if (!prev || res.score > prev.score) {
      archive.set(key, { config: encodeCivConfig(cfg), score: res.score, descriptor: res.descriptor, coords, facts: res.facts, flags: res.flags, signals: res.signals });
      return true;
    }
    return false;
  };
  const runOne = (cfg) => {
    const res = evaluate(w, cfg, ticks, civSeed); evals++;
    if (place(cfg, res)) improvements++;
    if (evals % 10 === 0 || evals === budget) log(`eval ${evals}/${budget} — archive ${archive.size} cells, best ${bestScore(archive)}`);
    return res;
  };

  if (method === 'random') {
    for (let i = 0; i < budget && evals < budget; i++) runOne(randomConfig(rng));
  } else if (method === 'grid') {
    // systematic sweep over the most expressive structural axes: nucleusCount × climate,
    // with a couple of continuous knobs stepped; fill the rest of the budget randomly.
    const grid = [];
    for (let nc = 1; nc <= 4; nc++) for (const cl of CLIMATES) for (const ps of [450, 700]) {
      const c = defaultConfig(); c.seeding.nucleusCount = nc; c.seeding.founders = nc * 60; c.climate = { preset: cl }; c.popScale = ps; grid.push(c);
    }
    for (const c of grid) { if (evals >= budget) break; runOne(c); }
    while (evals < budget) runOne(randomConfig(rng));
  } else { // qd (MAP-Elites)
    // seed the archive with the default + a few random configs, then iterate: pick a
    // random elite, mutate, evaluate, place. Diversity emerges as cells fill.
    runOne(defaultConfig());
    for (let i = 0; i < Math.min(8, budget - 1) && evals < budget; i++) runOne(randomConfig(rng));
    while (evals < budget) {
      const elites = [...archive.values()];
      const parent = decodeCivConfig(elites[Math.floor(rng() * elites.length)].config);
      runOne(mutateConfig(parent, rng));
    }
  }

  const entries = [...archive.values()].sort((a, b) => b.score - a.score);
  return {
    archive: entries,
    meta: {
      method, budget, ticks, evals, cells: archive.size, improvements,
      best: entries[0] ? entries[0].score : 0,
      axes: AXES.map(a => ({ label: a.label, bins: a.bins })),
      N: w.N, civSeed,
    },
  };
}
function bestScore(archive) { let b = 0; for (const v of archive.values()) if (v.score > b) b = v.score; return b; }
