/* Paper 2's gravity window. Gravity is pinned at 1/r like the charge law, and its strength G is open: nothing in physics
   fixes it. What can be said is what each G makes. Two things decide here:
     · the rock. An Earth-like planet (Earth's surface gravity g and its hold on air, so, since v² = 2gR in any d, Earth's
       radius) of rock with mass per 4-volume ρ₄ needs G ρ₄ = 2g/(π²R²) (atom/js/gscale.js earthLike). The candidate 4D
       rocks: the two salts (atom/js/saltdata.js, tools/salt.mjs: ToG and NgPx, the ionic model) and Bl₂Px₃, 4D's
       sapphire, at its plane-wave-relaxed cell (atom/tools/crystalref-Bl2Px3-relaxed.json, the favoured cell z2-0 at
       ×1.03, near its fitted minimum ×1.034).
     · the stars. Each main sequence burning by the network (mainseq.mjs net; window C's G and run gravity-1's) gives the
       Sun analogue (zero-age core t½ = our zero-age Sun's, fusion/tools/lifetimes4.mjs), what its centre burns to, and
       where a black, airless planet sits at 288 K round it and its year (lifetimes4's planet; ours computed the same way).
   Reads papers/p2/data/gravity-runs.json (lifetimes4 with OUT=gravity-runs.json over every net-*.json, adopted model);
   writes papers/p2/data/gravity.json.
     node four/fusion/tools/gravity4.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { earthLike, planetsAt, SI } from "../../atom/js/gscale.js";
import { SALT } from "../../atom/js/saltdata.js";

const here = (p) => new URL(p, import.meta.url), BOHR = 0.529177210903e-10, AMU = 1.66053906660e-27;
const det = (M) => { const A = M.map((r) => r.slice()), n = A.length; let d = 1;
  for (let i = 0; i < n; i++) { let p = i; for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
    if (p !== i) { [A[i], A[p]] = [A[p], A[i]]; d = -d; } d *= A[i][i]; for (let j = i + 1; j < n; j++) { const f = A[j][i] / A[i][i]; for (let k = i; k < n; k++) A[j][k] -= f * A[i][k]; } }
  return Math.abs(d); };
// Bl₂Px₃'s relaxed cell: the cell in bohr, ions by kind (0 Bl, mass 31; 1 Px, mass 20, as tools/ionic.mjs)
const RX = JSON.parse(readFileSync(here("../../atom/tools/crystalref-Bl2Px3-relaxed.json"), "utf8")), bl = RX["z2-0-x103"];
const blMass = bl.kinds.reduce((t, k) => t + (k === 0 ? 31 : 20), 0) * AMU, blRho = blMass / (det(bl.H) * BOHR ** 4);
const ROCKS = [
  { key: "ToG", name: "ToG (salt)", rho4: SALT.ToG.density, from: "tools/salt.mjs, the ionic model" },
  { key: "NgPx", name: "NgPx (nagnesium pxide)", rho4: SALT.NgPx.density, from: "tools/salt.mjs, the ionic model" },
  { key: "Bl2Px3", name: "Bl₂Px₃ (4D's sapphire)", rho4: blRho, from: "plane-wave DFT, relaxed (z2-0 ×1.03)" },
].map((r) => { const e = earthLike(r.rho4), p = planetsAt(e.G, r.rho4); return { ...r, Grel: e.ratio, planetMassKg: e.planetMass, planetOverMch: e.planetOverStar, airR: p.airR, darkR: p.darkR }; });

const D = JSON.parse(readFileSync(here("../../papers/p2/data/gravity-runs.json"), "utf8"));
const runs = D.runs.filter((r) => r.mass === "ladder").map((r) => ({ G: r.G, s: r.s, fail: r.fail ?? null, mMin: r.mMin ?? null, mMax: r.mMax ?? null,
  sun: r.sun ? { m: r.sun.m, Mkg: r.sun.Mkg, Msun: r.sun.Mkg / SI.Msun, Tc: r.sun.Tc, rhoc: r.sun.rhoc, L: r.sun.L, Teff: r.sun.Teff, R: r.sun.R, a288: r.sun.a288, yearYr: r.sun.yearYr,
    kind: r.sun.burn?.kind ?? null, top: r.sun.burn?.top ?? null } : null }));
const out = { about: "fusion/tools/gravity4.mjs: paper 2's gravity window. rocks: the G (× ours) an Earth-like planet of each candidate 4D rock needs (G rho4 = 2g/(pi^2 R^2)), its mass and the smallest planet of that rock that holds air; runs: per G and s (adopted mass model), the Sun analogue (zero-age core t_half = ours'), its mass (M_Ch, kg, solar masses), centre, surface, what its centre burns to, and the 288 K black planet's distance (m) and year (Earth years). ours: our zero-age Sun computed the same way.",
  rocks: ROCKS, ours: D.ours, runs: runs.sort((a, b) => b.G - a.G || a.s - b.s) };
writeFileSync(here("../../papers/p2/data/gravity.json"), JSON.stringify(out, null, 1));
for (const r of ROCKS) console.log(`${r.name}: ρ₄ ${r.rho4.toExponential(3)} kg/m⁴ → G ${r.Grel.toExponential(3)} × ours; planet ${r.planetMassKg.toExponential(2)} kg (${r.planetOverMch.toExponential(2)} M_Ch); air held from R ${(r.airR / 1e3).toFixed(0)} km`);
console.log(`wrote papers/p2/data/gravity.json (${runs.length} sequences; ours' 288 K planet ${(D.ours.a288 / 1.496e11).toFixed(3)} AU, ${D.ours.yearYr.toFixed(3)} yr)`);
