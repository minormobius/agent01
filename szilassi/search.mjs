#!/usr/bin/env node
// szilassi/search.mjs — the offline hunt that produced PRESETS in poly.js.
//
// It is not part of the page and nothing imports it; it is here so the shipped
// presets can be reproduced instead of taken on trust. The selftest re-measures
// whatever ends up in PRESETS, so this script only has to find candidates.
//
//   node szilassi/search.mjs                 # every objective
//   node szilassi/search.mjs --only=blunt    # one of them
//   node szilassi/search.mjs --restarts=8
//
// Hill-climbing, not annealing: the acoptic region is small and connected
// around the published solid, and a rejected step costs one build.

import * as P from './poly.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const only = arg('only', null);
const restarts = Number(arg('restarts', 6));
const iters = Number(arg('iters', 60000));

const solid = (knobs) => {
  const v = P.build(knobs);
  if (!v) return null;
  const r = P.inspect(v);
  return r.ok ? r : null;
};

/**
 * The things worth looking for. Each returns a number to maximise, or -1 for
 * "not a candidate". They are deliberately different in kind: one wants room,
 * one wants room under a symmetry constraint, one wants blunt creases.
 */
const OBJECTIVES = {
  roomy: { symmetric: false, score: (kn, r) => r.clearance },
  'roomy-symmetric': { symmetric: true, score: (kn, r) => r.clearance },
  // blunt keeps a floor under the clearance, or it walks off to a shape that is
  // technically a solid and visibly about to stop being one
  blunt: { symmetric: false, score: (kn, r) => (r.clearance > 0.02 ? r.minDihedral : -1) },
};

function climb(seed, { symmetric, score }) {
  let rng = seed >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  let knobs = symmetric ? P.symmetrize(P.ZERO_KNOBS()) : P.ZERO_KNOBS();
  let best = score(knobs, solid(knobs));
  let step = 0.15;
  for (let i = 0; i < iters; i++) {
    let cand = knobs.map((r) => r.slice());
    const f = Math.floor(rnd() * 7), k = Math.floor(rnd() * 3);
    cand[f][k] += (rnd() * 2 - 1) * step;
    if (symmetric) cand = P.symmetrize(cand, f);
    const r = solid(cand);
    if (!r) continue;
    const s = score(cand, r);
    if (s > best) { best = s; knobs = cand; }
    if (i % Math.floor(iters / 10) === Math.floor(iters / 10) - 1) step *= 0.8;
  }
  return { best, knobs };
}

for (const [id, obj] of Object.entries(OBJECTIVES)) {
  if (only && only !== id) continue;
  let top = null;
  for (let s = 1; s <= restarts; s++) {
    const r = climb(s * 104729, obj);
    if (!top || r.best > top.best) top = r;
  }
  const r = P.inspect(P.build(top.knobs));
  const fmt = (n) => (Object.is(n, -0) ? 0 : Number(n.toFixed(5)));
  console.log(`\n// ${id} — clearance ${r.clearance.toFixed(4)}, sharpest crease ${r.minDihedral.toFixed(1)}°`);
  console.log(`    clearance: ${+r.clearance.toFixed(4)}, minDihedral: ${+r.minDihedral.toFixed(1)}, symmetric: ${P.isSymmetric(top.knobs)},`);
  console.log(`    knobs: [${top.knobs.map((row) => `[${row.map(fmt).join(', ')}]`).join(', ')}],`);
}
