#!/usr/bin/env node
// csaszar/census.mjs — how many different Császár polyhedra are there?
//
// Not part of the page and nothing imports it. It exists so the numbers the
// page quotes can be reproduced instead of taken on trust.
//
//   node csaszar/census.mjs                  # 2 million rolls, ~30 s
//   node csaszar/census.mjs --rolls=20000000 # the number quoted on the page
//   node csaszar/census.mjs --seed=7
//
// Method: roll seven points uniformly in a cube, lay the Möbius triangulation
// on them, and ask whether the result is a solid. It usually is not. When it
// is, record its oriented matroid in canonical form — the label that says
// which of the realizations of the Möbius torus this one is.
//
// This is rejection sampling, so the HISTOGRAM is biased (a class occupying a
// larger slice of configuration space turns up more often) but the SET of
// classes found is not: any class with positive volume turns up eventually.

import * as P from './poly.js';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? Number(hit.slice(n.length + 3)) : d;
};
const rolls = arg('rolls', 2_000_000);
const report = arg('report', 0) || Math.max(1, Math.floor(rolls / 10));
let rng = (arg('seed', 1) * 2654435761) >>> 0;
const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

const known = new Map(P.TYPE_SIGNATURES.map((s, i) => [s, P.PRESETS[i].name]));
const seen = new Map();
let solids = 0;
const started = Date.now();

const V = Array.from({ length: 7 }, () => [0, 0, 0]);
for (let n = 1; n <= rolls; n++) {
  for (let i = 0; i < 7; i++) {
    V[i][0] = rnd() * 2 - 1; V[i][1] = rnd() * 2 - 1; V[i][2] = rnd() * 2 - 1;
  }
  if (!P.acoptic(V).ok) continue;
  solids++;
  const form = P.canonicalForm(V);
  const rec = seen.get(form);
  if (rec) rec.n++;
  else seen.set(form, { n: 1, first: n, rep: V.map((p) => p.map((x) => +x.toFixed(4))) });
  if (n % report === 0) {
    console.log(`  ${(n / 1e6).toFixed(2)}M rolls · ${solids} solids · ${seen.size} distinct types`);
  }
}

const secs = (Date.now() - started) / 1000;
console.log(`\n${rolls.toLocaleString()} rolls in ${secs.toFixed(0)}s`);
console.log(`solids: ${solids}  (about 1 in ${Math.round(rolls / Math.max(1, solids)).toLocaleString()})`);
console.log(`distinct realization types: ${seen.size}`);
const hits = [...seen.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`the four published ones, found: ${P.TYPE_SIGNATURES.filter((s) => seen.has(s)).length} of 4`);
for (const [form, rec] of hits.slice(0, 12)) {
  console.log(`  ${String(rec.n).padStart(5)}×  ${known.get(form) || 'unnamed'}  first at roll ${rec.first.toLocaleString()}`);
}
if (hits.length > 12) console.log(`  … and ${hits.length - 12} more`);
