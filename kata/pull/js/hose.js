/* PULL's hose, as a material with flaws of its own. No DOM.

   The first bench gave a hose a press and, separately, an axial strength: its hoop stress never entered its failure,
   and nothing it suffered reduced the press (the audit's R04). This closes that, as simply as can be stated.

   The skin is one material. A section of it (one link long, all the way round) has
     an axial strength   Weibull, the fibre's modulus m, with the weakest-link size effect of a piece that large:
                         a section τ thick is 27τ fibre-links of material, so its strength per area is 27τ^(−1/m) of a link's
     a hoop strength     an independent draw of the same kind
   ONE CONVENTION FOR STRESS (the recheck's F01 and F02): every stress here is a fraction of the MEAN strength of a
   fibre link, σ Γ(1 + 1/m), where σ is the bench's Weibull scale. `hoop` is the skin's mean hoop stress in that unit;
   a section's hoop strength is a unit-mean Weibull draw times the size effect, the same unit; and the skin's force on
   a fibre is derived from it: `force(m)` = σ Γ(1 + 1/m) × TAUT per unit of hoop × τ at a fibre-to-fibre contact, three
   times that from skin to fibre. TAUT is what a taut skin lying on twelve fibres presses with, as a share of the thin
   vessel formula's value (0.806: the spring net and the Steiner hull agree, data/press.json `factor`). Before
   2026-11-18 the press used σ where it needed σ Γ and left TAUT out, which pressed 27 to 39% too hard (by modulus).
   Where the skin bends over a fibre its stress is `peak` × the mean (2.3 from the net of springs, js/skin.js).
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
import { rng, SECTIONS } from "./bench.js";
const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y; return -t + Math.log((2.5066282746310005 * ser) / x); };
export const TAUT = 0.806137, SIGMA = 0.02, meanLink = (m) => Math.exp(lg(1 + 1 / m)), force = (m, taut = TAUT) => SIGMA * meanLink(m) * taut;
export const AXIAL = { rankine: () => 1, mises: (h) => (h + Math.sqrt(Math.max(0, 2.25 - 2 * h * h))) / 1.5, linear: (h) => Math.max(0, 1 - h) };
/* the press along the rope: 1, or 0 where the skin has split */
function mask(S, m, demand, size, run, seed) { const r = rng(seed * 104729 + 71), mean = meanLink(m), split = new Uint8Array(S); let any = 0;
  for (let s = 0; s < S; s++) if (((-Math.log(1 - r())) ** (1 / m) / mean) * size < demand) { split[s] = 1; any++; }
  const out = new Float64Array(S).fill(1); if (run === Infinity) { if (any) out.fill(0); } else for (let s = 0; s < S; s++) if (split[s]) for (let k = Math.max(0, s - run); k <= Math.min(S - 1, s + run); k++) out[k] = 0;
  return { at: (s) => out[s], split: any / S }; }
/* thirteen fibres in a hose, or in hoops: bench options, the rope's weight, and the share of the skin that split */
export function hoseRope({ tau, hoop, m = 5, mu = 0.3, S = 96, staple = 0, crit = "rankine", peak = 2.3, run = 0, size = true, member = true }, seed) {
  const M = 27 * tau, sz = size ? M ** (-1 / m) : 1, k = mask(S, m, hoop * peak, sz, run, seed), F = force(m), press = { kind: "hoop", p: F * hoop * tau, at: k.at };
  return member ? { opts: { section: "fcc13s", S, m, mu, staple, press: { ...press, wall: 3 * F * hoop * tau }, ribbon: { k: M, strength: M * sz * AXIAL[crit](hoop) }, seed }, material: 13 + M, split: k.split }
    : { opts: { section: "fcc13", S, m, mu, staple, press, seed }, material: 13 + M, split: k.split }; }

/* BUNDLES OF ANY SIZE, in either world, for the bundle-size study (size.mjs).
   A 4D rope's cross-section is three-dimensional: fibres pack as a cuboctahedral cluster of k shells, 13, 55, 147 …,
   each inner fibre touching twelve. A 3D rope's is two-dimensional: hexagonal rings, 7, 19, 37, 61 …, each touching six.
   Both have radius R = (2k + 1) fibre radii. A skin τ fibre-radii thick round it:
     4D   weighs 3 (R/r)² τ fibres; presses P = 2στ/R × TAUT (measured for thirteen; assumed for larger clusters); its tension peaks at 2.3 × the mean where it bends over a fibre
     3D   weighs 2 (R/r) τ;         presses P = στ/R;  a band's tension is uniform (peak 1)
   and inside a pack under pressure P every contact carries about the same force, π r² P (4D) or (π/2) r P (3D): the
   values that give a third and a half of the skin's force on a fibre for 13 and for 7. That uniform-pressure rule for
   the inner contacts is an assumption. */
export function pack(dim, k) { const P = [];
  if (dim === 4) { for (let x = -2 * k; x <= 2 * k; x++) for (let y = -2 * k; y <= 2 * k; y++) for (let z = -2 * k; z <= 2 * k; z++) if ((x + y + z) % 2 === 0 && Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= k && Math.abs(x) + Math.abs(y) + Math.abs(z) <= 2 * k) P.push([x / Math.SQRT2, y / Math.SQRT2, z / Math.SQRT2, Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === k || Math.abs(x) + Math.abs(y) + Math.abs(z) === 2 * k]); }
  else for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) { const c = -a - b; if (Math.abs(c) > k) continue; P.push([a + b / 2, (b * Math.sqrt(3)) / 2, 0, Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) === k]); }
  P.sort((p, q) => Math.hypot(p[0], p[1], p[2]) - Math.hypot(q[0], q[1], q[2]));
  const nb = P.map((p, i) => P.map((q, j) => (i !== j && Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - 1) < 1e-6 ? j : -1)).filter((j) => j >= 0));
  return { n: P.length, nb, outer: P.map((p, i) => (p[3] ? i : -1)).filter((i) => i >= 0), R: 2 * k + 1 }; }
const PACKS = new Map();
export function bundleRope({ dim = 4, k = 1, tau, hoop, m = 5, mu = 0.3, S = 48, member = true, loose = false }, seed) {
  const key = dim + ":" + k; if (!PACKS.has(key)) PACKS.set(key, pack(dim, k)); const B = PACKS.get(key), name = `pack${dim}_${k}${member && !loose ? "s" : ""}`;
  if (!SECTIONS[name]) SECTIONS[name] = member && !loose ? () => { const n = [[]]; B.nb.forEach((v) => n.push(v.map((j) => j + 1))); for (const i of B.outer) { n[0].push(i + 1); n[i + 1].push(0); } return n; } : () => B.nb.map((v) => [...v]);
  if (loose) return { opts: { section: name, S, m, mu, press: { kind: "none" }, seed }, material: B.n, fibres: B.n, split: 0 };
  const M = dim === 4 ? 3 * B.R * B.R * tau : 2 * B.R * tau, peak = dim === 4 ? 2.3 : 1, sz = M ** (-1 / m), msk = mask(S, m, hoop * peak, sz, 0, seed);
  /* wall: the skin's force on an outer fibre; p: a contact's force inside the pack; both per diameter, in the bench's units */
  const F = force(m, dim === 4 ? TAUT : 1), wall = (dim === 4 ? 3 * F * (B.R / 3) * (12 / B.outer.length) : ((2 * F) / 3) * (6 / B.outer.length)) * hoop * tau, p = (dim === 4 ? F : F / 3) * (3 / B.R) * hoop * tau;
  return { opts: { section: name, S, m, mu, press: { kind: "hoop", p, wall, at: msk.at }, ...(member ? { ribbon: { k: M, strength: M * sz } } : {}), seed }, material: B.n + M, fibres: B.n, split: msk.split }; }
