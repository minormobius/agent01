/* Our world's side of the abundance comparison (four.mino.mobi/abundance/): the solar mixture of Asplund, Grevesse,
   Sauval & Scott 2009 (ARA&A 47, 481; arXiv:0909.0948), their table 1, as mass fractions by element.
     · A(X) = log₁₀ N_X/N_H + 12: the present-day photosphere where the table gives it (bracketed entries, the noble gases'
       indirect estimates, included), else the CI-chondrite (meteoritic) value, as the paper recommends for elements the
       photosphere doesn't give (its meteoritic values are on the same scale: Si 7.51 in both);
     · each element's number weighted by its standard atomic weight (NIST, Atomic Weights and Isotopic Compositions; an
       interval's midpoint; an element with none (Tc, Pm, Po … ) is left out: none has an A(X) in the table anyway);
     · checked against the paper's own bulk composition (its table 4, present-day photosphere: X 0.7381, Y 0.2485,
       Z 0.0134): the run stops if X or Z is off by more than 0.5%.
   Inputs are the paper's LaTeX source (sun.tex, from arxiv.org/e-print/0909.0948) and NIST's ascii listing
   (physics.nist.gov/cgi-bin/Compositions/stand_alone.pl?ele=&all=all&ascii=ascii2&isotype=some).
     node four/fusion/tools/solar.mjs <sun.tex> <nist ascii>   → papers/p2/data/solar.json */
import { readFileSync, writeFileSync } from "node:fs";
const [tex, nist] = process.argv.slice(2).map((f) => readFileSync(f, "utf8"));

// table 1: rows "Z & Sym & photosphere & meteorites & Z & Sym & photosphere & meteorites \\"
const body = tex.slice(tex.indexOf("\\label{t:sun}"), tex.indexOf("\\end{table}", tex.indexOf("\\label{t:sun}")));
const num = (c) => { const m = c.replace(/\$/g, "").match(/-?\d+\.\d+/); return m ? +m[0] : null; }, rows = {};
for (const line of body.split("\n")) { if (!/^\s*\d+\s*&/.test(line)) continue; const c = line.replace(/\\\\.*$/, "").split("&").map((x) => x.trim());
  for (let k = 0; k + 3 < c.length; k += 4) { const Z = +c[k], sym = c[k + 1]; if (!Z || !sym) continue; const ph = num(c[k + 2]), me = num(c[k + 3]);
    rows[Z] = { Z, sym, photosphere: ph, meteorites: me, bracketed: /\[/.test(c[k + 2]) }; } }
if (Object.keys(rows).length < 83) throw new Error(`solar: read only ${Object.keys(rows).length} elements from table 1`);

// NIST: "Atomic Number = Z" … "Standard Atomic Weight = 4.002602(2)" or "[1.00784,1.00811]"
const W = {}; for (const blk of nist.split(/\n\s*\n/)) { const z = blk.match(/Atomic Number = (\d+)/), w = blk.match(/Standard Atomic Weight = (\S*)/); if (!z || !w || W[+z[1]]) continue;
  const v = w[1]; let x = null; if (/^\[[\d.]+,[\d.]+\]$/.test(v)) { const [a, b] = v.slice(1, -1).split(",").map(Number); x = (a + b) / 2; } else if (/^[\d.]+\(/.test(v) || /^[\d.]+$/.test(v)) x = parseFloat(v);
  if (x) W[+z[1]] = x; }
if (Math.abs(W[26] - 55.845) > 0.01 || Math.abs(W[8] - 15.9994) > 0.002) throw new Error("solar: NIST weights misread");

const els = Object.values(rows).sort((a, b) => a.Z - b.Z).map((r) => { const A = r.photosphere ?? r.meteorites, from = r.photosphere != null ? "photosphere" : r.meteorites != null ? "meteorites" : null; return { ...r, A, from, weight: W[r.Z] ?? null }; })
  .filter((r) => r.A != null && r.weight != null);
// Asplund's meteoritic H and He (8.22, 1.29) are on the meteoritic scale only, never used: both have photospheric values
const mass = (r) => 10 ** (r.A - 12) * r.weight, tot = els.reduce((t, r) => t + mass(r), 0);
for (const r of els) r.x = mass(r) / tot;
const X = els.find((r) => r.Z === 1).x, Y = els.find((r) => r.Z === 2).x, Z = 1 - X - Y;
const ref = { X: 0.7381, Y: 0.2485, Z: 0.0134 };
if (Math.abs(X / ref.X - 1) > 0.005 || Math.abs(Z / ref.Z - 1) > 0.005) throw new Error(`solar: X ${X.toFixed(4)}, Z ${Z.toFixed(4)} against the paper's ${ref.X}, ${ref.Z}`);
const metals = els.filter((r) => r.Z >= 3), zt = metals.reduce((t, r) => t + r.x, 0);
const out = { about: "fusion/tools/solar.mjs: Asplund et al. 2009's solar mixture (table 1: present-day photosphere, else CI chondrites) as mass fractions, by NIST's standard atomic weights. metals: share of Z (elements past helium) by element.",
  source: { key: "asplund2009", table: 1, weights: "NIST Atomic Weights and Isotopic Compositions" }, bulk: { X: +X.toFixed(4), Y: +Y.toFixed(4), Z: +Z.toFixed(4), paper: ref, protosolar: { X: 0.7154, Y: 0.2703, Z: 0.0142 } },
  elements: els.map((r) => ({ Z: r.Z, sym: r.sym, A: r.A, from: r.from, weight: +r.weight.toPrecision(6), x: +r.x.toExponential(4), ofZ: r.Z >= 3 ? +(r.x / zt).toExponential(4) : null })) };
writeFileSync(new URL("../../papers/p2/data/solar.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const top = metals.slice().sort((a, b) => b.x - a.x).slice(0, 8).map((r) => `${r.sym} ${(100 * r.x / zt).toFixed(1)}%`);
console.log(`${els.length} elements; X ${X.toFixed(4)}, Y ${Y.toFixed(4)}, Z ${Z.toFixed(4)} (paper ${ref.X}, ${ref.Y}, ${ref.Z}); Z by mass: ${top.join(", ")}`);
