/* The numbers the search chapter's audit of its force field quotes, as JSON for tools/pages/gensearch.py: the Hartree–Fock
   trimers and crystal shell (js/manybody.js) against both force fields (js/forcefields.js, pairwise; js/polfields.js,
   polarizable), the crowded pairs from crystal probes (js/ffdata.js, k ≥ 10000) against the pairwise field, each 4D
   best pair (js/pairmin.js) on both fields, and our water's hand-built ice on both.
     node four/atom/tools/polnumbers.mjs */
import { MANYBODY } from "../js/manybody.js";
import { FORCEFIELDS } from "../js/forcefields.js";
import { POLFIELDS } from "../js/polfields.js";
import { FFDATA } from "../js/ffdata.js";
import { PAIRMIN } from "../js/pairmin.js";
import { modelEnergy } from "../js/ffmodel.js";
import { clusterEnergy } from "../js/polmodel.js";
import { termsFor } from "./fitpol.mjs";
import { known } from "./ice.mjs";
import { ICE } from "../js/icedata.js";

const KCAL = 627.509, r2 = (x) => +x.toFixed(2);
const pol = (k, ms) => clusterEnergy(termsFor(POLFIELDS[k]), ms).E * KCAL, old = (k, a, b) => modelEnergy(FORCEFIELDS[k].p, a, b) * KCAL;
const trimers = MANYBODY.trimers.map((t) => {
  const X = t.mols, k = t.key, pp = [pol(k, [X[0], X[1]]), pol(k, [X[0], X[2]]), pol(k, [X[1], X[2]])], tot = pol(k, X);
  return { i: t.i, key: k, label: t.label, ring: /cyclic/.test(t.label), crystal: /crystal/.test(t.label), hf: { pairs: t.pairs.map(r2), three: r2(t.three), total: r2(t.total) }, pol: { three: r2(tot - pp[0] - pp[1] - pp[2]), total: r2(tot) }, old: r2(old(k, X[0], X[1]) + old(k, X[0], X[2]) + old(k, X[1], X[2])) };
});
const shells = MANYBODY.shells.map((s) => ({ key: s.key, label: s.label, R: s.R, pairs: s.pairs.length, E: s.E, hf: r2(s.pairs.reduce((t, p) => t + p.E, 0) / s.Z), pol: r2(s.pairs.reduce((t, p) => t + pol(s.key, [p.A, p.B]), 0) / s.Z), old: r2(s.pairs.reduce((t, p) => t + old(s.key, p.A, p.B), 0) / s.Z), contact: r2(s.pairs[0].r) }));
const probes = ["4", "4.9"].map((k) => { const ps = FFDATA[k].points.filter((p) => p.k >= 10000 && p.ok), d = ps.map((p) => old(k, p.A, p.B) - p.E * KCAL); return { key: k, n: ps.length, tooAttractive: d.filter((x) => x < -1).length, worst: r2(-Math.min(...d)) }; });
const bestPair = Object.fromEntries(["3", "4", "4.9"].map((k) => { const b = PAIRMIN[k].best; return [k, { hf: r2(b.E * KCAL), old: r2(old(k, b.A, b.B)), pol: r2(pol(k, [b.A, b.B])) }]; }));
const ice = known();
// our water's blind searches (js/icedata.js): starts, and how many of the lowest are hydrogen-bonded nets with every
// molecule giving two bonds, and whether the lowest is the hand-built ice
const search = ["3_2", "3_4"].filter((id) => ICE[id]).map((id) => { const o = ICE[id], top = o.minima.slice(0, 8); return { Z: o.Z, starts: o.starts, found: o.found, top: top.length, nets: top.filter((m) => m.hbonds === 2).length, best: o.minima[0].E }; });
console.log(JSON.stringify({ search, trimers, shells, probes, bestPair, ice: { built: ice.built, relaxed: { E: ice.relaxed.E, nearest: ice.relaxed.nearest, density: ice.relaxed.density, neighbours: ice.relaxed.neighbours, hbonds: ice.relaxed.hbonds } } }));
