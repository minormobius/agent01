/* What the charge law does to a 4D star's plasma (papers/p2): on each aged 4D star's zero-age profile (evolve-four-*.json
   or their checkpoints, from the runner's atom4-mainseq cache),
     · the lens vacuum's plasma factor on the Rosseland mean (mainseq.js lensPlasma4: no light below the cutoff, n_r³
       above it) and the cutoff in x = ħω/kT;
     · the plasma's screening under the pinned 1/r (atom/js/screen.js): the electrons in a screening 4-ball,
       (π²/2) n_e λ_D⁴, the boost to p + p and to helium-4 + helium-4 (weak screening, 0.605 Z₁Z₂αħc k_D, or the ion sphere
       where that overshoots; ours' p + p at the Sun's centre gets 5%), and the pressure's Coulomb term over the gas's.
     node four/fusion/tools/lensplasma.mjs <dir of evolve-four-*>   → papers/p2/data/lensplasma.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { lensPlasma4 } from "../../atom/js/mainseq.js";
import { plasma } from "../../atom/js/screen.js";

const dir = process.argv[2], hbar = 1.054571817e-34, c = 2.99792458e8, al = 7.2973525693e-3, kB = 1.380649e-23, mu = 1.66053906660e-27;
const files = readdirSync(dir).filter((x) => /^evolve-four-.*\.json$/.test(x) && !/-to|-lp/.test(x)), seen = new Set(), stars = [];
for (const f of files.sort((a, b) => a.includes("ckpt") - b.includes("ckpt"))) {
  const key = f.replace(".ckpt", ""); if (seen.has(key)) continue; seen.add(key);
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), P = j.profiles?.[0]; if (!P) continue;
  const [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)\.json$/) ?? []; if (!G) continue;
  const rows = [0, 0.1, 0.3, 0.6, 0.9].map((q) => { const w = P.rows.reduce((a, b) => (Math.abs(b.q - q) < Math.abs(a.q - q) ? b : a)), X = w.H ?? 0.75, kT = kB * w.T;
    const nH = (w.rho * X) / mu, nHe = (w.rho * (1 - X)) / (4 * mu), ne = nH + 2 * nHe, p = plasma(4, w.T, [[nH, 1], [nHe, 2]], ne);
    return { q, T: w.T, rho: w.rho, X: +X.toFixed(4), factor: +lensPlasma4(w.rho, w.T, X).toFixed(4), perSphere: +p.perBall.toFixed(2), ppScreen: +p.f(1, 1).toFixed(4), heScreen: +p.f(2, 2).toFixed(4), dPgas: +(p.dP / ((nH + nHe + ne) * kB * w.T)).toFixed(4) }; });
  stars.push({ G: +G, s: +s, m: +m, rows });
}
stars.sort((a, b) => b.G - a.G || a.s - b.s || a.m - b.m);
const byG = {}; for (const st of stars) { const g = (byG[st.G] ??= { factor: [Infinity, 0], perSphere: [Infinity, 0], ppScreen: [Infinity, 0], heScreen: [Infinity, 0], dPgas: [Infinity, -Infinity] }); for (const r of st.rows) for (const k of ["factor", "perSphere", "ppScreen", "heScreen", "dPgas"]) { g[k][0] = Math.min(g[k][0], r[k]); g[k][1] = Math.max(g[k][1], r[k]); } }
writeFileSync(new URL("../../papers/p2/data/lensplasma.json", import.meta.url), JSON.stringify({ about: "fusion/tools/lensplasma.mjs: the lens vacuum's plasma factor on 4D's Rosseland mean, and under the pinned 1/r (atom/js/screen.js) electrons per screening 4-ball, the screening boost to p + p and helium-4 + helium-4, and the Coulomb pressure over the gas's, on each aged 4D star's zero-age profile (runs evolve4-1)", byG, stars }, null, 1));
for (const [g, v] of Object.entries(byG)) console.log(`G ${g}: opacity ×${v.factor[0]}–${v.factor[1]}, electrons per screening ball ${v.perSphere[0]}–${v.perSphere[1]}, p + p ×${v.ppScreen[0]}–${v.ppScreen[1]}, helium-4 pair ×${v.heScreen[0]}–${v.heScreen[1]}, Coulomb pressure ${(100 * v.dPgas[0]).toFixed(1)} to ${(100 * v.dPgas[1]).toFixed(1)}%`);
console.log(`wrote papers/p2/data/lensplasma.json (${stars.length} stars)`);
