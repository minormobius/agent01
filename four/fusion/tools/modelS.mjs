/* Model S (Christensen-Dalsgaard et al. 1996), the present Sun, sampled for the evolution check (papers/p2): its FGONG
   file fgong.l5bi.d.15c from users-phys.au.dk/jcd/solar_models/ (format: that page's file-format.pdf; var 1 r, 2 ln q,
   3 T, 4 P, 5 ρ, 6 X, 7 L(r), 8 κ, 9 ε, 17 Z, 21 ³He, 22 ¹²C, 23 ¹³C, 24 ¹⁴N, 25 ¹⁶O; cgs). Writes papers/p2/data/modelS.json: the centre
   and 41 points evenly in q^(1/1.5), so the core is sampled finely.
     node four/fusion/tools/modelS.mjs <fgong.l5bi.d.15c> */
import { readFileSync, writeFileSync } from "node:fs";
const L = readFileSync(process.argv[2], "utf8").split("\n"), [nn, ic, iv] = L[4].trim().split(/\s+/).map(Number);
const nums = []; for (const l of L.slice(5)) for (let i = 0; i + 16 <= l.length; i += 16) nums.push(+l.slice(i, i + 16));
const glob = nums.slice(0, ic), v = []; for (let n = 0; n < nn; n++) v.push(nums.slice(ic + n * iv, ic + (n + 1) * iv));
const [M, R, Ls] = glob, pts = v.map((x) => ({ q: Math.exp(x[1]), x: x[0] / R, T: x[2], P: x[3], rho: x[4], X: x[5], l: x[6] / Ls, kappa: x[7], eps: x[8], Z: x[16], he3: x[20], c12: x[21], c13: x[22], n14: x[23], o16: x[24] })).sort((a, b) => a.q - b.q);
const at = (q) => { let i = 1; while (i < pts.length - 1 && pts[i].q < q) i++; const a = pts[i - 1], b = pts[i], t = (q - a.q) / (b.q - a.q || 1); return Object.fromEntries(Object.keys(a).map((k) => [k, +(a[k] + (b[k] - a[k]) * t).toPrecision(6)])); };
const prof = Array.from({ length: 41 }, (_, i) => at((i / 40) ** 1.5)), lq = (f) => { for (let i = 1; i < pts.length; i++) if (pts[i].l >= f) return +pts[i].q.toFixed(4); };
const out = { about: "Model S (Christensen-Dalsgaard et al. 1996, Science 272, 1286), the present Sun at 4.6 Gyr, from its FGONG file fgong.l5bi.d.15c (users-phys.au.dk/jcd/solar_models/; OPAL opacities, helium and heavy-element diffusion), sampled by four/fusion/tools/modelS.mjs; cgs units (T K, ρ g/cm³, κ cm²/g, ε erg/g/s)",
  M_g: M, R_cm: R, L_ergs: Ls, Z: glob[3], X0: glob[4], ageGyr: 4.6, centre: pts[0], q50: lq(0.5), q90: lq(0.9), prof };
writeFileSync(new URL("../../papers/p2/data/modelS.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`Model S: Tc ${(pts[0].T / 1e6).toFixed(3)} MK, ρc ${pts[0].rho.toFixed(1)}, Xc ${pts[0].X.toFixed(4)}, half the light inside q ${out.q50}, 90% inside ${out.q90}`);
