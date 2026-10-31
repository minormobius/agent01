/* ATOM⁴'s live cluster search, no DOM: n rigid molecules on the force field fitted to Hartree–Fock pairs
   (js/forcefields.js), from random starts, each descending to its nearest minimum. Start s is built exactly as
   tools/clusters.mjs builds it (same molecule, same seed, same ball), so a page running start s follows the runner's
   start s, and a minimum it finds can be named by the runner's list (js/clusters.js). */
import { modelEnergy } from "./ffmodel.js";
import { FORCEFIELDS } from "./forcefields.js";
import { CENSUS } from "./census.js";
import { CLUSTERS } from "./clusters.js";
import { randomRotation } from "./md.js";
import { planes, posed, clusterSteps, rng } from "./landscape.js";

export const KCAL = 627.509;
const MOLS = { 3: { d: 3, Z: 8 }, 4: { d: 4, Z: 10 } }; // our water, Xater (keys as in tools/forcefield.mjs)

export function clusterSearch(key, n) {
  const { d, Z } = MOLS[key], m = CENSUS[d].find((x) => x.Z === Z), th = (m.param * Math.PI) / 180, pad = (v) => [...v, ...new Array(d - v.length).fill(0)];
  const A = [pad([0, 0]), pad([m.R * Math.cos(th / 2), m.R * Math.sin(th / 2)]), pad([m.R * Math.cos(th / 2), -m.R * Math.sin(th / 2)])];
  const p = FORCEFIELDS[key].p, np = planes(d).length + d, Rball = m.dimer.RXX * (0.6 + 0.5 * Math.cbrt(n));
  const E = (Bs) => { const Ms = [A, ...Bs]; let e = 0; for (let i = 0; i < Ms.length; i++) for (let j = i + 1; j < Ms.length; j++) e += modelEnergy(p, Ms[i], Ms[j]); return e; };
  /* start s: each molecule but the first turned at random, its heavy atom uniform in a ball (tools/clusters.mjs) */
  const start = (s) => {
    const R0s = [], x0 = [], rnd = rng(1e6 * n + 1e4 * d + 100 * Z + s);
    for (let i = 1; i < n; i++) {
      R0s.push(randomRotation(d, rnd));
      let v; do { v = Array.from({ length: d }, () => 2 * rnd() - 1); } while (Math.hypot(...v) > 1);
      x0.push(...new Array(planes(d).length).fill(0), ...v.map((c) => c * Rball));
    }
    return { R0s, x0 };
  };
  const atoms = (R0s, x) => [A, ...R0s.map((R0, i) => posed(A, R0, x.slice(i * np, (i + 1) * np), d))];
  const steps = (s) => { const { R0s, x0 } = start(s); return clusterSteps(E, A, R0s, x0, d, 1500 + 300 * n); };
  /* the runner's minima for this size, best first: a finished descent is named by the nearest in energy, within 0.1
     kcal/mol (two can sit closer than that; the runner told them apart by shape too) */
  const ref = CLUSTERS[key]?.[n] ?? null;
  const name = (e) => { if (!ref) return null; let k = -1; ref.best.forEach((q, i) => { if (Math.abs(q.E - e) < 0.1 / KCAL && (k < 0 || Math.abs(q.E - e) < Math.abs(ref.best[k].E - e))) k = i; }); return k < 0 ? null : { rank: k + 1, hits: ref.best[k].hits, of: ref.starts }; };
  return { key, d, n, A, E, Rball, np, start, atoms, steps, ref, name };
}
