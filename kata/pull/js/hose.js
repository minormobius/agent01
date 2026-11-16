/* PULL's hose, as a material with flaws of its own. No DOM.

   The first bench gave a hose a press and, separately, an axial strength: its hoop stress never entered its failure,
   and nothing it suffered reduced the press (the audit's R04). This closes that, as simply as can be stated.

   The skin is one material. A section of it (one link long, all the way round) has
     an axial strength   Weibull, the fibre's modulus m, with the weakest-link size effect of a piece that large:
                         a section τ thick is 27τ fibre-links of material, so its strength per area is 27τ^(−1/m) of a link's
     a hoop strength     an independent draw of the same kind
   It is made tight: its mean hoop stress is `hoop` × the mean strength of a link, and where it bends over a fibre the
   stress is `peak` × that (2.3 from the net of springs, js/skin.js).
     splitting    a section whose hoop strength is under hoop × peak splits lengthwise and stops pressing, there and
                  for `run` sections either side (how far a split runs is not known: 0 and the whole rope bracket it)
     axial        what a section carries along the rope while stressed in hoop, by criterion:
                    rankine   the largest principal stress alone: unaffected (a brittle skin)
                    mises     the distortion energy, in four dimensions, of the stress (a, h, h, 0): a² ¾ − a h + h² = ¾
                              (hoop tension HELPS here: 1.21 at h = ½. Our derivation, not a cited result)
                    linear    a + h = 1: a pessimistic interaction, for flaws that see both stresses
   A section that breaks along the rope (a crack round it) keeps pressing: a crack round the skin cuts no hoop path.
   So how tight to make the hose is no longer free: tighter presses harder and splits more, and the study optimises it.

   Hoops are the same material as separate rings: they split the same way (a split ring presses nothing, and its
   neighbours are untouched) and carry nothing along the rope. */
import { rng } from "./bench.js";
const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y; return -t + Math.log((2.5066282746310005 * ser) / x); };
export const AXIAL = { rankine: () => 1, mises: (h) => (h + Math.sqrt(Math.max(0, 2.25 - 2 * h * h))) / 1.5, linear: (h) => Math.max(0, 1 - h) };
/* the press along the rope: 1, or 0 where the skin has split */
function mask(S, m, demand, size, run, seed) { const r = rng(seed * 104729 + 71), mean = Math.exp(lg(1 + 1 / m)), split = new Uint8Array(S); let any = 0;
  for (let s = 0; s < S; s++) if (((-Math.log(1 - r())) ** (1 / m) / mean) * size < demand) { split[s] = 1; any++; }
  const out = new Float64Array(S).fill(1); if (run === Infinity) { if (any) out.fill(0); } else for (let s = 0; s < S; s++) if (split[s]) for (let k = Math.max(0, s - run); k <= Math.min(S - 1, s + run); k++) out[k] = 0;
  return { at: (s) => out[s], split: any / S }; }
/* thirteen fibres in a hose, or in hoops: bench options, the rope's weight, and the share of the skin that split */
export function hoseRope({ tau, hoop, m = 5, mu = 0.3, S = 96, staple = 0, crit = "rankine", peak = 2.3, run = 0, size = true, member = true }, seed) {
  const M = 27 * tau, sz = size ? M ** (-1 / m) : 1, k = mask(S, m, hoop * peak, sz, run, seed), press = { kind: "hoop", p: 0.02 * hoop * tau, at: k.at };
  return member ? { opts: { section: "fcc13s", S, m, mu, staple, press: { ...press, wall: 0.06 * hoop * tau }, ribbon: { k: M, strength: M * sz * AXIAL[crit](hoop) }, seed }, material: 13 + M, split: k.split }
    : { opts: { section: "fcc13", S, m, mu, staple, press, seed }, material: 13 + M, split: k.split }; }
