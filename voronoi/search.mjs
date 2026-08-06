#!/usr/bin/env node
// voronoi/search.mjs — the offline specimen hunt.
//
// The page can hunt in the browser, but a browser hunt is bounded by patience.
// This is the same engine run without one: sweep rule bands × meshes × soups,
// score every trajectory with `emergence`, and print the survivors as records
// ready to paste into `specimens.js`.
//
//   node voronoi/search.mjs                      # default sweep, ~1 min
//   node voronoi/search.mjs --n=700 --gens=800   # deeper
//   node voronoi/search.mjs --emit               # print specimens.js records
//
// Everything here is deterministic. A given invocation prints the same table on
// any machine, which is the only reason it is worth baking the answers into the
// page at all.

import {
  buildMesh, seedSoup, runTrajectory, emergence, encodeSpec, decodeSpec,
  ruleFromCounts,
} from './life.js';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const flag = (k) => process.argv.includes(`--${k}`);

const N = Number(arg('n', 700));
const RELAX = Number(arg('relax', 12));
const GENS = Number(arg('gens', 600));
const TOP = Number(arg('top', 12));
const MESHES = String(arg('meshes', 'orchid,tessera,quill')).split(',');
const SOUPS = Number(arg('soups', 8));

// Rule bands are named by the integer neighbour counts they select on a
// degree-6 cell — the mesh's mean — even though the rule itself is fractional
// and every cell applies it against its own degree. `B34/S123` below really
// means "born on 3/6..4/6 of your neighbours", which on a 5-sided cell is 2 or 3
// live neighbours and on a 7-sided cell is 3, 4 or 5. `ruleFromCounts` lives in
// life.js so the page's rule editor and this sweep cannot drift apart.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).join('');
const label = (bLo, bHi, sLo, sHi) => `B${range(bLo, bHi)}/S${range(sLo, sHi)}`;

const RULES = [];
for (let bLo = 1; bLo <= 4; bLo++) {
  for (let bHi = bLo; bHi <= Math.min(bLo + 2, 5); bHi++) {
    for (let sLo = 0; sLo <= 3; sLo++) {
      for (let sHi = sLo; sHi <= 5; sHi++) RULES.push([bLo, bHi, sLo, sHi]);
    }
  }
}
const DENSITIES = [0.18, 0.28, 0.38, 0.5, 0.62];

console.log(`sweeping ${RULES.length} rules × ${MESHES.length} meshes × ${DENSITIES.length} densities × ${SOUPS} soups`);
console.log(`n=${N} relax=${RELAX} gens=${GENS}\n`);

const t0 = Date.now();
const results = [];
for (const meshSeed of MESHES) {
  const mesh = buildMesh({ seed: meshSeed, n: N, relax: RELAX });
  for (const [bLo, bHi, sLo, sHi] of RULES) {
    const rule = ruleFromCounts(bLo, bHi, sLo, sHi);
    for (const density of DENSITIES) {
      for (let t = 0; t < SOUPS; t++) {
        const soup = `${meshSeed[0]}${t}`;
        const tr = runTrajectory(mesh, seedSoup(mesh.n, soup, density), rule, GENS);
        const score = emergence(tr);
        if (score <= 0) continue;
        results.push({
          score, meshSeed, soup, density, rule,
          name: label(bLo, bHi, sLo, sHi),
          kind: tr.kind, period: tr.period, transient: tr.transient,
          meanAct: tr.meanAct, meanPop: tr.meanPop,
        });
      }
    }
  }
  process.stdout.write(`  mesh "${meshSeed}" done (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
}

results.sort((a, b) => b.score - a.score);
console.log(`\n${results.length} scoring trajectories in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
console.log('score  rule        mesh      soup  dens   kind         per   trans  act     pop');
for (const r of results.slice(0, TOP)) {
  console.log(
    `${r.score.toFixed(3)}  ${r.name.padEnd(11)} ${r.meshSeed.padEnd(9)} ${r.soup.padEnd(5)} ` +
    `${r.density.toFixed(2)}  ${r.kind.padEnd(12)} ${String(r.period).padStart(4)} ` +
    `${String(r.transient).padStart(6)}  ${r.meanAct.toFixed(3)}  ${r.meanPop.toFixed(3)}`);
}

// Diversity matters more than raw score for the hall of fame — five copies of
// the same attractor is not a collection. Keep the best of each (rule, kind).
if (flag('emit')) {
  const seen = new Set();
  const picks = [];
  for (const r of results) {
    const key = `${r.name}/${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(r);
    if (picks.length >= TOP) break;
  }
  console.log('\n// ── specimens.js records ──');
  for (const r of picks) {
    const link = encodeSpec({
      mesh: r.meshSeed, n: N, relax: RELAX, rule: r.rule,
      soup: r.soup, density: r.density,
    });
    // Re-measure through the LINK, not the sweep's in-memory rule. The permalink
    // quantises thresholds to per-mille, and a specimen is a claim about what
    // the URL does — so the numbers printed here have to come from the URL.
    const spec = decodeSpec(link);
    const mesh = buildMesh({ seed: spec.mesh, n: spec.n, relax: spec.relax });
    const tr = runTrajectory(mesh, seedSoup(mesh.n, spec.soup, spec.density), spec.rule, GENS);
    const score = emergence(tr);
    console.log(`  { id: '${r.name.toLowerCase().replace(/\//g, '-')}-${r.soup}', rule: '${r.name}',`);
    console.log(`    link: '${link}',`);
    console.log(`    gens: ${GENS}, kind: '${tr.kind}', period: ${tr.period}, transient: ${tr.transient},`);
    console.log(`    score: ${score.toFixed(4)}, act: ${tr.meanAct.toFixed(4)}, pop: ${tr.meanPop.toFixed(4)} },`);
  }
}
