/* Paper 1's companion data, generated from the bake (atom/js/table.js) and never edited by hand:
     data/table4.json, data/table4.csv   the 4D table, Z = 1–140
     data/table3.json, data/table3.csv   the same solver in our three dimensions, Z = 1–36, beside the measured values
     data/README.md                      the schema
     figdata/f*.json                     each figure's data, as the figure script will draw it
     figures/*.svg, figures/captions.json the paper's figures (figures/make.mjs), drawn from the bake and laws.js
     draft/*.md                          the paper's text, from text/*.md with every {{token}} filled from the code
     ledger.json                         every claim the paper makes of the bake, its value recomputed now and whether it
                                         holds; the data files' sizes and hashes; the references' tally. The process page
                                         (four/papers/) renders it, and selftest 67 fails if any claim stops holding
   node four/papers/p1/build.mjs           write
   node four/papers/p1/build.mjs --check   exit 1 if anything on disk differs from what the bake gives */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { TABLE, SHELL_COUNTERFACTUAL, RPLOT } from "../../atom/js/table.js";
import { subshells, scf as atomScf, solve as atomSolve, ground as atomGround, N as GRID_N, R0 as GRID_R0, RMAX as GRID_RMAX, H as GRID_H, EXCHANGE } from "../../atom/js/atom.js";
import { readdirSync } from "node:fs";
import { levels as lawLevels } from "./laws.js";
import { element as bakeElement } from "../../atom/tools/bake.mjs";
import { farPull } from "./far.js";
import { gaussLaw, shellSplit } from "./laws.js";
import { figures as drawFigures } from "./figures/make.mjs";
import { k4 } from "../../atom/js/kernel.js";
import * as FIELDS from "../../atom/js/fields.js";
import { SYM, IE_REAL, realConfig, isNoble, layout } from "../../atom/js/periodic.js";
import { names } from "../../atom/js/names.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EV = 27.211386245988; // eV per hartree (CODATA 2018)
const r5 = (x) => +x.toPrecision(6);
const norm = (c) => c.split(" ").sort().join(" "); // configurations compared as sets of subshells

/* the term-corrected table (data/termtable.json, termtable-collect.mjs): the paper's main 4D table. Elements searched
   again carry their corrected configuration, energy and ionization; the rest are the bake's. hundspin: the bake alone
   (supplement S1) */
const TERM = new Map(JSON.parse(readFileSync(join(HERE, "data/termtable.json"), "utf8")).rows.map((r) => [r.Z, r]));
const IONS = JSON.parse(readFileSync(join(HERE, "data/ions.json"), "utf8")).rows; // the ions' own ground states (ions-collect.mjs): electron affinities, and the ionizations folded into termtable.json
function rows(d, { hundspin = false } = {}) {
  const nm = names(TABLE, d), { cells } = layout(TABLE, d), period = new Map(cells.map((c) => [c.el.Z, c.period]));
  return TABLE[d].map((bel) => { const t = d === 4 && !hundspin ? TERM.get(bel.Z) : null;
    const el = t ? { ...bel, config: t.config, E: t.E_hartree, ion: t.ion_hartree, top: t.outermost, orb: t.orbitals ? t.orbitals.map((o) => ({ s: o.subshell, o: o.occ, e: o.e_hartree, r: o.r_mean_bohr, r2: o.r2_mean_bohr2 })) : bel.orb } : bel;
    const n = nm.get(el.Z);
    const row = {
      Z: el.Z,
      name: d === 3 ? n.ours.name : n.name,
      symbol: d === 3 ? SYM[el.Z - 1] : n.sym,
      counterpart: d === 4 && n.ours ? n.ours.name : null,
      period: period.get(el.Z) + 1,
      block: n.block,
      noble: isNoble(el, d),
      config: el.config,
      E_hartree: el.E,
      ion_hartree: el.ion,
      ion_eV: r5(el.ion * EV),
      outermost: el.top,
      orbitals: el.orb.map((o) => ({ subshell: o.s, occ: o.o, e_hartree: o.e, r_mean_bohr: o.r, r2_mean_bohr2: o.r2 })),
    };
    if (d === 4 && !hundspin) row.hund_correction_eV = t ? t.hund_correction_eV : 0;
    { const io = IONS.find((x) => x.D === d && x.Z === bel.Z); row.electron_affinity_eV = io && io.ea_eV != null ? io.ea_eV : null; if (d === 4 && !hundspin && t?.cation) row.cation_rearranged = t.cation; }
    if (d === 3) {
      row.config_measured = realConfig(el.Z);
      row.config_match = norm(el.config) === norm(row.config_measured);
      row.ion_measured_eV = IE_REAL[el.Z - 1];
      row.ion_error_pct = r5((100 * (row.ion_eV - row.ion_measured_eV)) / row.ion_measured_eV);
    }
    return row;
  });
}

const csvCell = (v) => (v === null ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
function csv(list) {
  const flat = list.map(({ orbitals, ...r }) => ({ ...r, orbitals: orbitals.map((o) => `${o.subshell}${o.occ}:${o.e_hartree}:${o.r_mean_bohr}`).join(" ") }));
  const keys = Object.keys(flat[0]);
  return [keys.join(","), ...flat.map((r) => keys.map((k) => csvCell(r[k])).join(","))].join("\n") + "\n";
}

const SCHEMA = (t3, t4) => `# Paper 1 data

Generated by \`four/papers/p1/build.mjs\` from \`four/atom/js/table.js\` (baked by \`four/atom/tools/bake.mjs\` from
\`four/atom/js/atom.js\`). Do not edit; rebuild. Atomic units throughout (hartree, bohr) unless a field says eV.

- \`table4.json\` / \`.csv\`: the 4D table, ${t4.length} elements (Z = 1–${t4.at(-1).Z}), with open subshells' terms resolved (section 7): the d- and f-block elements searched again and every candidate's energy corrected where Hund's first rule fails (\`termtable.json\`).
- \`table4-hundspin.json\` / \`.csv\`: supplement S1, the same table with every open subshell given Hund spins (the bake as it stands, \`atom/js/table.js\`).
- \`table3.json\` / \`.csv\`: the same solver in three dimensions, ${t3.length} elements, beside the measured values.

| field | meaning |
|---|---|
| \`Z\` | nuclear charge (a point nucleus, declared stable) |
| \`name\`, \`symbol\` | 4D: our element's name with its first letter moved on, where the element answers to one of ours (\`atom/js/names.js\`); \`null\` for the elements with no counterpart. 3D: ours |
| \`counterpart\` | 4D only: which of our elements it answers to, by its place in the table, or \`null\` |
| \`period\`, \`block\` | its row (rows end at the noble gases) and its block (s, p, d, f) |
| \`noble\` | every occupied subshell full and its outermost electron a p (or 1s²) |
| \`config\` | the ground configuration the solver found (lowest total energy among converged fields) |
| \`E_hartree\` | total energy of the neutral atom |
| \`ion_hartree\`, \`ion_eV\` | first ionization energy, E(Z, Z−1 electrons) − E(Z, Z) |
| \`outermost\` | the subshell the ionized electron leaves |
| \`electron_affinity_eV\` | E(neutral) − E(anion), the anion searched for its own ground state (runner run ions-1); bound if positive, \`null\` if no anion settled. In ours it is trustworthy above about 0.7 eV and fails for H⁻ and the alkalis (section 6) |
| \`cation_rearranged\` | 4D main table: where the ion's own ground state is lower than taking one electron from the atom's configuration, its configuration (the ionization is that ion's) |
| \`hund_correction_eV\` | 4D main table only: the ground configuration's open subshells' term correction (lowest term − lowest maximum-spin term; 0 where Hund's first rule holds) |
| \`orbitals\` | per occupied subshell: occupation, orbital energy, ⟨r⟩, ⟨r²⟩. In the CSV, \`<subshell><occ>:<e>:<⟨r⟩>\`, space-separated |
| \`config_measured\` | 3D only: Madelung's order with chromium's and copper's exceptions |
| \`config_match\` | 3D only: the solver's configuration equals the measured one (as sets of subshells) |
| \`ion_measured_eV\`, \`ion_error_pct\` | 3D only: NIST's first ionization energy, and ours against it |

The model: V = −Z/r with the D-dimensional kinetic operator, spherically averaged Hartree field, local exchange from
the D-dimensional electron gas with an own-share correction, no correlation, non-relativistic. See \`../OUTLINE.md\`.
`;

function figures(t3, t4) {
  const ion = (t, d) => t.map((r) => ({ Z: r.Z, ion_eV: r.ion_eV, noble: r.noble, ...(d === 3 ? { measured_eV: r.ion_measured_eV } : {}) }));
  const peaks = t4.filter((r, i) => r.noble).map((r) => r.Z);
  const misses = t3.filter((r) => !r.config_match).map((r) => ({ Z: r.Z, symbol: r.symbol, ours: r.config, measured: r.config_measured }));
  const errs = t3.map((r) => Math.abs(r.ion_error_pct)), med = [...errs].sort((a, b) => a - b)[errs.length >> 1];
  const sub = (t) => t.map((r) => ({ Z: r.Z, levels: Object.fromEntries(r.orbitals.map((o) => [o.subshell, o.e_hartree])) }));
  const rad = (t) => t.map((r) => { const o = r.orbitals.find((q) => q.subshell === r.outermost); return { Z: r.Z, outer_r_mean_bohr: o.r_mean_bohr, noble: r.noble }; });
  const noble = t4.filter((r) => r.noble);
  return {
    "f3-ionization": { caption: "First ionization energy against Z, both worlds; ours beside measured", d4: ion(t4, 4), d3: ion(t3, 3), noble_gases_4d: peaks },
    "f4-validation3d": {
      caption: "The solver in our three dimensions: ionization against measured, and the configurations it misses",
      points: t3.map((r) => ({ Z: r.Z, symbol: r.symbol, ion_eV: r.ion_eV, measured_eV: r.ion_measured_eV, error_pct: r.ion_error_pct, config_match: r.config_match })),
      config_hits: t3.length - misses.length, config_total: t3.length, misses, ion_median_abs_error_pct: med,
    },
    "f5-subshells": { caption: "Subshell energies against Z (hartree), both worlds", d4: sub(t4), d3: sub(t3) },
    "f6-screening": {
      caption: "Noble-gas ionization, the 4D solve against the shell-theorem counterfactual",
      points: noble.map((r) => ({ Z: r.Z, ion_hartree: r.ion_hartree, shell_theorem_hartree: SHELL_COUNTERFACTUAL.find((c) => c.Z === r.Z)?.ion ?? null })),
    },
    "f8-radii": { caption: "⟨r⟩ of the outermost subshell against Z (bohr), both worlds", d4: rad(t4), d3: rad(t3) },
  };
}

/* refs.json's shape: unique keys, a known status, the fields a citation needs, and a DOI (or a source saying where the
   details came from) on everything marked read or index. citable() is what the page generator may cite */
const STATUS = new Set(["read", "index", "cited", "memory"]);
export function checkRefs(refs = JSON.parse(readFileSync(join(HERE, "refs.json"), "utf8")).refs) {
  const bad = [], seen = new Set();
  for (const r of refs) {
    if (!r.key || seen.has(r.key)) bad.push(`${r.key}: missing or repeated key`); seen.add(r.key);
    if (!STATUS.has(r.status)) bad.push(`${r.key}: status ${r.status}`);
    for (const f of ["authors", "title", "year", "role"]) if (!r[f]) bad.push(`${r.key}: no ${f}`);
    if ((r.status === "read" || r.status === "index") && !r.doi && !r.source) bad.push(`${r.key}: ${r.status} with neither a DOI nor a source`);
  }
  return { bad, refs, citable: new Set(refs.filter((r) => r.status === "read" || r.status === "index").map((r) => r.key)) };
}

/* the references as CSL JSON for pandoc's citeproc (page.mjs): a DOI'd entry is Crossref's record (data/crossref.json,
   fetched by refs-crossref.mjs) under refs.json's own title, with refs.json filling what Crossref lacks and its `csl`
   field overriding; the rest are built from refs.json. Every in-text [@key] must be a key here */
const CSL_TYPE = { "journal-article": "article-journal", "book-chapter": "chapter", "edited-book": "book", "proceedings-article": "paper-conference" };
const cslNames = (s) => s.replace(/\s*\(eds?\.\)\s*$/, "").split(/\s*(?:,|&|\band\b)\s*/).filter(Boolean).map((n) => {
  const m = n.match(/^((?:[A-Z][a-z]?\.\s*|[A-Z][a-z]?\.-[A-Z]\.\s*)+)(.+)$/); return m ? { given: m[1].trim(), family: m[2].trim() } : { literal: n.trim() }; });
export function cslRefs(refs = JSON.parse(readFileSync(join(HERE, "refs.json"), "utf8")).refs) {
  const cr = existsSync(join(HERE, "data/crossref.json")) ? JSON.parse(readFileSync(join(HERE, "data/crossref.json"), "utf8")).records : {};
  return refs.map((r) => {
    const c = r.doi ? cr[r.doi.toLowerCase()] : null;
    if (r.doi && !c) throw new Error(`refs.json ${r.key}: DOI ${r.doi} isn't in data/crossref.json (node four/papers/p1/refs-crossref.mjs)`);
    const e = c ? { ...c, type: CSL_TYPE[c.type] || c.type } : { type: r.csl?.type || (r.venue && /Springer|Kluwer|Pergamon/.test(r.venue) ? "book" : r.url && !r.volume ? "webpage" : "article-journal"),
      "container-title": r.venue, volume: r.volume || undefined, page: r.pages || undefined };
    e.id = r.key; e.title = r.title;
    if (!e.author && !e.editor) e[/\(eds?\.\)/.test(r.authors) ? "editor" : "author"] = cslNames(r.authors);
    if (!e.issued) e.issued = { "date-parts": [[+r.year]] };
    if (!e.page && r.pages) e.page = r.pages;
    if (!e.volume && r.volume) e.volume = r.volume;
    if (r.url && !r.doi) e.URL = r.url;
    if (r.doi) e.DOI = r.doi;
    Object.assign(e, r.csl || {});
    for (const k of Object.keys(e)) if (e[k] == null || e[k] === "") delete e[k];
    return e;
  });
}
const citedKeys = (t) => new Set([...t.replace(/<!--[\s\S]*?-->/g, "").matchAll(/(?<![\w.])-?@([a-z][\w-]*\d{4}[a-z]*|[a-z]+-[a-z-]+)/gi)].map((m) => m[1]));

/* Négadi & Kibler's generalized Madelung rule for D dimensions: subshells fill in order of n + l (then n), each holding
   2 × (the number of D-dimensional harmonics of degree l), and a row closes after each p (and after 1s) */
export function madelungRows(d, upto) {
  const order = subshells(d).sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n), rows = []; let cur = 0, total = 0;
  for (const s of order) { cur += s.cap; total += s.cap; if (s.l === 1 || s.name === "1s") { rows.push(cur); cur = 0; } if (total >= upto) break; }
  return rows;
}

function ledger(t3, t4, files, refs) {
  const { periods } = layout(TABLE, 4), rows = periods.map((p) => p.length), whole = rows.slice(0, -1), predicted = madelungRows(4, 140).slice(0, whole.length);
  const nobles = t4.filter((r) => r.noble), nobleZ = nobles.map((r) => r.Z);
  const peaks = nobles.every((r) => (r.Z === 1 || t4[r.Z - 2].ion_hartree < r.ion_hartree) && (r.Z === t4.length || t4[r.Z].ion_hartree < r.ion_hartree));
  const hits = t3.filter((r) => r.config_match).length, misses = t3.filter((r) => !r.config_match).map((r) => r.symbol);
  const errs = t3.map((r) => Math.abs(r.ion_error_pct)).sort((a, b) => a - b), med = errs[errs.length >> 1];
  const ratios = nobles.map((r) => ({ Z: r.Z, ratio: +(r.ion_hartree / SHELL_COUNTERFACTUAL.find((c) => c.Z === r.Z).ion).toFixed(3) }));
  const far = nobles.map((r) => { const f = farPull(TABLE[4][r.Z - 1], RPLOT); return { Z: r.Z, S: +f.S.toFixed(3), ratio30: +(f.U(30) / f.far(30)).toFixed(4) }; });
  const h = t4[0].E_hartree, hExact = -1 / (2 * 1.5 ** 2);
  // the law: Gauss's 1/r² in 4D, power laws, harmonicity, the shell theorem
  const weak = gaussLaw(0.45), strong = gaussLaw(0.7), ratioR0 = strong[2].e / strong[0].e;
  const splits = [0.8, 1, 1.2].map((p) => shellSplit(p));
  const lap = (r, hh = 1e-3) => { const f = (x) => 1 / x; return (f(r + hh) - 2 * f(r) + f(r - hh)) / hh ** 2 + (3 / r) * (f(r + hh) - f(r - hh)) / (2 * hh); }; // ∇² of a radial function in 4D: f'' + 3f'/r
  const k1 = k4(1);
  const claims = [
    { id: "gauss", part: "law", claim: "Gauss's law in 4D (a 1/r² potential) has no atom: below a critical strength nothing binds, above it the ground state falls to the centre, its energy set by wherever the calculation stops (no Bohr radius either way)",
      value: `α = 0.45: bound on no grid; α = 0.7: ε = ${strong.map((g) => g.e.toExponential(3)).join(", ")} hartree for r₀ = 10⁻³, 10⁻⁴, 10⁻⁵ (×${ratioR0.toExponential(2)} over 10⁻² in r₀: ε ∝ 1/r₀²); the critical strength is ½ (Hardy's inequality in 4D)`,
      holds: weak.every((g) => !g.bound) && strong.every((g) => g.bound) && Math.abs(ratioR0 / 1e4 - 1) < 0.01, section: "2", gate: [67] },
    { id: "uniqueness", part: "law", claim: "Among power laws 1/r^η only η = 1 keeps a shell's levels together (2s with 2p, 3s with 3d), the degeneracy that makes shells of 2(l + 1)² and rows of 2, 10, 10, 28 …",
      value: splits.map((s) => `η = ${s.p}: 2p − 2s ${(100 * s.split2).toFixed(s.p === 1 ? 9 : 1)} %, 3d − 3s ${(100 * s.split3).toFixed(s.p === 1 ? 9 : 1)} %`).join("; "),
      holds: Math.abs(splits[1].split2) < 1e-8 && Math.abs(splits[1].split3) < 1e-8 && splits[0].split2 < -0.01 && splits[2].split2 > 0.01, section: "2", gate: [67] },
    { id: "harmonic", part: "law", claim: "Pinned in 4D, 1/r isn't harmonic: ∇²(1/r) = −1/r³ in empty space, so there is no Gauss's law for it",
      value: `∇²(1/r) at r = 1, 2: ${lap(1).toFixed(5)}, ${lap(2).toFixed(5)} (−1/r³: −1, −0.125)`, holds: Math.abs(lap(1) + 1) < 1e-4 && Math.abs(lap(2) + 0.125) < 1e-4, section: "2", gate: [3, 33] },
    { id: "shell", part: "law", claim: "… and no shell theorem: a shell of charge is felt at its own radius at k(1) = 8/3π of a point charge's pull, and a hollow conductor's centre sits at 3π/8 of its wall's potential (no Faraday cage)",
      value: `k(1) = ${k1.toFixed(6)} (8/3π = ${(8 / (3 * Math.PI)).toFixed(6)}); centre over wall ${(1 / k1).toFixed(6)} (3π/8 = ${((3 * Math.PI) / 8).toFixed(6)})`, holds: Math.abs(k1 - 8 / (3 * Math.PI)) < 1e-6, section: "2", gate: [3] },
    (() => { const fit = (rows) => { const x = rows.map((e) => Math.log(e.Z)), y = rows.map((e) => Math.log(-e.E)), n = x.length, mx = x.reduce((p, q) => p + q) / n, my = y.reduce((p, q) => p + q) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } return sxy / sxx; };
      const e4 = fit(TABLE[4].filter((e) => e.Z >= 10)), e3 = fit(TABLE[3].filter((e) => e.Z >= 10));
      return { id: "tf", part: "law", claim: "Atoms don't collapse: total energies follow each world's Thomas–Fermi law, Z^(3−2/D) (Z^(5/2) in four dimensions, Z^(7/3) in ours), as the shell theorem's absence would have to break if matter were unstable",
        value: `fitted exponent ${e4.toFixed(3)} over Z = 10–140 in 4D (5/2 = 2.5); ${e3.toFixed(3)} over Z = 10–36 in ours (7/3 = 2.333); both a little above, as finite-Z corrections make them`,
        holds: e4 > 2.5 && e4 < 2.56 && e3 > 7 / 3 && e3 < 2.42 && e4 - 2.5 < e3 - 7 / 3 + 0.03, section: "4.5", gate: [67] }; })(),
    { id: "rows", part: "table", claim: "The 4D table's rows hold 2, 10, 10, 28, 28, 60 elements: the rows Négadi and Kibler's generalized Madelung rule predicts for D = 4",
      value: `solved ${whole.join(", ")} (and ${rows.at(-1)} of the next by Z = 140); the rule ${predicted.join(", ")}`, holds: whole.join() === predicted.join() && whole.join() === "2,10,10,28,28,60", section: "5", gate: [7, 27, 67] },
    { id: "nobles", part: "table", claim: "Its noble gases are elements 2, 12, 22, 50, 78 and 138, each a peak of the first ionization energy",
      value: `noble gases ${nobleZ.join(", ")}; each above both neighbours: ${peaks ? "yes" : "no"}`, holds: nobleZ.join() === "2,12,22,50,78,138" && peaks, section: "5", gate: [7, 27, 67] },
    { id: "fulld", part: "table", claim: "The hardest-held electron in the table isn't a noble gas's: element 128, whose 18-electron d shell is full with nothing outside it (our palladium's kind), out-holds its row's noble gas 138, and element 68, the same kind a row up, comes within a volt of its row's noble gas 78 (in ours palladium holds far less hard than xenon, 8.3 against 12.1 eV)",
      value: `128: ${t4[127].ion_eV.toFixed(2)} eV (${t4[127].config.split(" ").slice(-2).join(" ")}) against 138: ${t4[137].ion_eV.toFixed(2)}; 68: ${t4[67].ion_eV.toFixed(2)} eV (${t4[67].config.split(" ").slice(-2).join(" ")}) against 78: ${t4[77].ion_eV.toFixed(2)}; the table's highest is element ${[...t4].sort((x, y) => y.ion_hartree - x.ion_hartree)[0].Z}`,
      holds: t4[127].ion_hartree > t4[137].ion_hartree && [...t4].sort((x, y) => y.ion_hartree - x.ion_hartree)[0].Z === 128 && /5d18$/.test(t4[127].config) && /4d18$/.test(t4[67].config) && t4[77].ion_eV - t4[67].ion_eV < 1 && t4[77].ion_eV > t4[67].ion_eV, section: "8", gate: [67] },
    (() => { const AU = JSON.parse(readFileSync(join(HERE, "data/audit-scf.json"), "utf8")), m = AU.summary; return { id: "converged", part: "table", claim: "The table's numbers are converged in the solver's stop: tightening it a hundred-thousandfold moves no total or ionization energy by a microhartree, nor Σ⟨r²⟩ by 10⁻⁴ of itself",
      value: `${AU.rows.length} atoms, both worlds: |ΔE| ≤ ${m.maxAbs_dE.toExponential(1)}, |Δion| ≤ ${m.maxAbs_dIon.toExponential(1)} hartree; Σ⟨r²⟩ ≤ ${m.maxSRel.toExponential(1)} relative, the bake's against the tight ${m.maxBakeSRel.toExponential(1)}`,
      holds: m.allTight && m.maxAbs_dE < 1e-6 && m.maxAbs_dIon < 1e-6 && m.maxSRel < 1e-4 && m.maxBakeSRel < 1e-4 && AU.rows.every((r) => Math.abs(r.bakeE - r.tightE) < 1e-5), section: "6, C", gate: [67] }; })(),
    (() => { const CV = JSON.parse(readFileSync(join(HERE, "data/convergence.json"), "utf8")), m = CV.summary; return { id: "grid", part: "table", claim: "The table's ionization energies don't depend on the radial grid: halving or doubling its points, or moving either end by a factor of ten in or out, moves none by a millihartree",
      value: `${CV.base.atoms.length} atoms, both worlds, six grids: |Δion| ≤ ${m.maxAbs_dIon.toExponential(1)} hartree; total energies ≤ ${m.maxAbs_dE.toExponential(1)}`,
      holds: m.allConverged && m.maxAbs_dIon < 1e-3, section: "6, C", gate: [67] }; })(),
    { id: "hydrogen", part: "table", claim: "4D hydrogen comes out exact: −Z²/2(n + ½)² hartree, so −2/9 for the ground state",
      value: `${h} hartree against ${hExact.toFixed(5)}`, holds: Math.abs(h - hExact) < 1e-5, section: "4", gate: [1] },
    { id: "configs3", part: "table", claim: "The same solver in our three dimensions gets 32 of our 36 ground configurations",
      value: `${hits} of ${t3.length}; missed ${misses.join(", ")} (one d electron too many against 4s: local exchange leans to d)`, holds: hits === 32, section: "4", gate: [6, 67] },
    { id: "ion3", part: "table", claim: "… and our first ionization energies to a few percent",
      value: `median error ${med.toFixed(1)} %, largest ${errs.at(-1).toFixed(1)} %`, holds: med < 6, section: "4", gate: [6] },
    ...(() => { // the counterfactual table (data/shelltable.json, lawtable.mjs): only settled atoms count
      // unsettled: no field converged (E null), or a "ground state" an electron would rather leave (negative ionization:
      // the search missed a lower configuration); neither counts as a result
      const settledRow = (r) => r.E !== null && !(r.ion !== null && r.ion < 0);
      const ST = JSON.parse(readFileSync(join(HERE, "data/shelltable.json"), "utf8")).rows, ok = ST.filter(settledRow), uns = ST.filter((r) => !settledRow(r)).map((r) => r.Z);
      const diff = ok.filter((r) => !r.sameConfig), nobles = [2, 12, 22, 50, 78, 138], z128 = ST[127];
      const both = ok.filter((r) => r.ion !== null && r.Z > 2).map((r) => t4[r.Z - 1].ion_hartree / r.ion).sort((x, y) => x - y);
      return [
        { id: "geometry", part: "consequence", claim: "The rows are the geometry's, not the law's: solved with the shell theorem forced on, the first 24 elements keep every configuration, and the noble gases close the same rows at 2, 12, 22, 50, 78 and 138",
          value: `with the shell theorem: 1–24 unchanged (${ST.slice(0, 24).every((r) => settledRow(r) && r.sameConfig) ? "all settled, all the same" : "not all"}); every atom to 88 settled; noble gases ${nobles.map((z) => `${z} ${settledRow(ST[z - 1]) && ST[z - 1].sameConfig ? "same" : "changed"}`).join(", ")}. ${uns.length} atoms of row 6's f block don't settle under the shell theorem (${uns.length ? `${uns[0]}–${uns.at(-1)}` : ""}), so whether row 6 splits is open`,
          holds: ST.slice(0, 24).every((r) => settledRow(r) && r.sameConfig) && nobles.every((z) => settledRow(ST[z - 1]) && ST[z - 1].sameConfig) && ST.slice(0, 88).every(settledRow), section: "9", gate: [67] },
        { id: "reorders", part: "consequence", claim: "The law decides what fills inside the rows: of the atoms settled under both, every change of configuration begins at the first d element, and under the shell theorem p beats d (element 25 takes 4s² 4p¹ where the law gives 3d¹ 4s²)",
          value: `${ok.length} settled under the shell theorem; ${diff.length} differ, the first at ${Math.min(...diff.map((r) => r.Z))}; in every one the law's own configuration stays lower under the law (${ok.every((r) => r.tableStillLower) ? "checked" : "NOT"})`,
          holds: Math.min(...diff.map((r) => r.Z)) === 25 && ok.every((r) => r.tableStillLower) && /4p1$/.test(ST[24].config), section: "9", gate: [67] },
        { id: "law128", part: "consequence", claim: "Element 128's hold on its outermost electron is the law's: with the shell theorem forced on it falls from the table's highest to a few volts, and the noble gases hold hardest, as ours do",
          value: `128: ${(z128.ion * 27.211386).toFixed(2)} eV with the shell theorem against ${t4[127].ion_eV.toFixed(2)} under the law; the shell theorem's five highest are ${[...ok].filter((r) => r.ion !== null).sort((x, y) => y.ion - x.ion).slice(0, 5).map((r) => r.Z).join(", ")}`,
          holds: z128.E !== null && z128.ion * 27.211386 < 10 && [...ok].filter((r) => r.ion !== null).sort((x, y) => y.ion - x.ion).slice(0, 5).map((r) => r.Z).sort((x, y) => x - y).join() === "12,22,50,78,138", section: "9", gate: [67] },
        { id: "holdratio", part: "consequence", claim: "Across the table the law holds outer electrons about two and a half times harder than the shell theorem would, and up to ten times",
          value: `first ionization, the law over the shell theorem, ${both.length} atoms past helium settled under both: median ${both[both.length >> 1].toFixed(2)}, from ${both[0].toFixed(2)} to ${both.at(-1).toFixed(2)}`,
          holds: both[both.length >> 1] > 2 && both[both.length >> 1] < 3 && both.at(-1) > 9 && both[0] > 1, section: "10", gate: [67] },
      ];
    })(),
    ...(() => { const { HU, HL } = hundData(), r4 = HU.filter((r) => r.d === 4), r3 = HU.filter((r) => r.d === 3), fails = r4.filter((r) => !r.hund);
      const gauss = HL.find((x) => x.id === "gauss"), law = HL.find((x) => x.id === "law"), single = (c) => c.terms[0].mult === 1 && c.terms[0].g === 10;
      return [
        { id: "hund3", part: "table", claim: "In ours every open subshell of the table has its maximum spin lowest (Hund's first rule), from the subshell's own repulsion",
          value: `${r3.length} subshells (p and d) of our 36 atoms: ${r3.every((r) => r.hund && r.complete) ? "all hold" : "NOT all"}`, holds: r3.length > 20 && r3.every((r) => r.hund && r.complete), section: "7", gate: [67] },
        { id: "hund4", part: "table", claim: "In four dimensions Hund's first rule fails for d² and d¹⁶ in every d row, and holds for every other p and d filling of the table",
          value: `${r4.filter((r) => r.l <= 2).length} p and d subshells; fails: ${fails.filter((r) => r.l === 2).map((r) => `${r.Z} ${r.shell}${r.n} by ${Math.abs(r.belowMax_eV).toFixed(3)} eV`).join(", ")}`,
          holds: r4.filter((r) => r.l <= 2 && !r.hund).every((r) => r.l === 2 && (r.n === 2 || r.n === 16) && r.groundS === 0) && [2, 16].every((n) => r4.filter((r) => r.l === 2 && r.n === n).length === 3 && r4.filter((r) => r.l === 2 && r.n === n).every((r) => !r.hund)) && r4.filter((r) => r.l === 1).every((r) => r.hund), section: "7", gate: [67] },
        { id: "hund4f29", part: "table", claim: "… and so does its mirror 4f²⁹, three short of a full f shell: spin ½ again",
          value: (() => { const r = r4.find((x) => x.l === 3 && x.n === 29); return r ? `108 4f29: S ${r.groundS} of ${r.Smax}, ${Math.abs(r.belowMax_eV).toFixed(3)} eV below${r.complete ? "" : " (bound)"}` : "not run"; })(),
          holds: r4.some((r) => r.l === 3 && r.n === 29 && !r.hund && r.groundS === 0.5 && r.complete), section: "7", gate: [67] },
        { id: "hund4f3", part: "table", claim: "In four dimensions 4f³ breaks it too: its ground term has spin ½",
          value: r4.filter((r) => r.l === 3).map((r) => `${r.Z} ${r.shell}${r.n}: S ${r.groundS} of ${r.Smax}${r.complete ? "" : " (bound)"}`).join("; "), holds: r4.some((r) => r.l === 3 && r.n === 3 && !r.hund && r.groundS === 0.5), section: "7", gate: [67] },
        (() => { const W = hundWeights(); return { id: "hundcrit", part: "table", claim: "Why: two d electrons' terms have energies F⁰ + a₂F² + a₄F⁴ exactly; in 4D the ten-state singlet keeps the electrons nearer right angles than any triplet (⟨cos²γ⟩ 1/8, half of random) and lies lowest whenever F⁴/F² < 5/3, which every real orbital meets; in ours ³F is lowest for every F⁴/F²",
          value: `4D: singlet ⟨cos²γ⟩ ${W.s4.cos2}, best triplet ${W.t4.cos2} (random 0.25); singlet lowest for F⁴/F² < ${W.crit.toFixed(4)}; element 26's F⁴/F² ${W.rLaw.toFixed(3)} (1/r), ${W.rGauss.toFixed(3)} (Gauss). Ours: ³F ${W.f3.cos2}, ¹D ${W.d3.cos2} (random 1/3); ³F lowest for all F⁴/F² ≥ 0: ${W.ours3}`,
          holds: Math.abs(W.crit - 5 / 3) < 1e-4 && W.rLaw < W.crit && W.rGauss < W.crit && W.s4.cos2 < W.t4.cos2 && Math.abs(W.s4.cos2 - 0.125) < 1e-4 && W.ours3, section: "7", gate: [67] }; })(),
        { id: "hundlaw", part: "table", claim: "The failure is the 4D shell's, not the law's: Gauss's 1/r² gives d² the same singlet ground term, further below its triplet",
          value: `element 26's orbital: triplet above the singlet by ${law.terms.find((t) => t.mult === 3 && t.g === 30).eV} eV under 1/r, ${gauss.terms.find((t) => t.mult === 3 && t.g === 30).eV} eV under 1/r²`, holds: single(law) && single(gauss), section: "7", gate: [67] },
      ]; })(),
    (() => { const T = [...TERM.values()], byS = T.filter((r) => r.configChangedBySearch), byT = T.filter((r) => r.configChangedByTerms), moved = T.filter((r) => r.ion_eV != null && Math.abs((r.ion_byRemoval_eV ?? r.ion_eV) - r.bake.ion_eV) > 0.02 && !r.configChangedBySearch).map((r) => ({ ...r, ion_eV: r.ion_byRemoval_eV ?? r.ion_eV }));
      return { id: "termtable", part: "table", claim: "Resolving the terms changes no ground configuration: it lowers the eight Hund-breaking atoms' energies and moves eight first ionizations by 0.3–0.7 eV; the wider search behind it finds one configuration the bake missed (element 82: 4f¹ 5d¹ 6s², our cerium's kind)",
        value: `${T.length} elements searched again; configurations changed by the terms: ${byT.map((r) => r.Z).join(", ") || "none"}; by the wider search: ${byS.map((r) => `${r.Z} (${r.bake.config.split(" ").slice(-3).join(" ")} → ${r.config.split(" ").slice(-4).join(" ")}, ${((r.uncorrected.E_hartree - r.bake.E) * EV).toFixed(3)} eV)`).join(", ")}; ionizations moved: ${moved.map((r) => `${r.Z} ${r.bake.ion_eV.toFixed(2)}→${r.ion_eV.toFixed(2)}`).join(", ")}`,
        holds: byT.length === 0 && byS.map((r) => r.Z).join() === "82" && moved.length === 8 && moved.every((r) => Math.abs(r.ion_eV - r.bake.ion_eV) < 0.7), section: "7", gate: [67] }; })(),
    (() => { const P = JSON.parse(readFileSync(join(HERE, "data/promotion3.json"), "utf8")), ok = P.promotion.filter((x) => !x.missing);
      return { id: "promotion", part: "table", claim: "In ours the solver's misses have one cause, a bias toward d: moving a 4s electron into 3d comes out too cheap in every 3d atom measured, by about a volt; resolving the open subshells' whole term structure doesn't remove it, and gets fewer configurations right",
        value: `4s→3d, solver against measured (eV): ${ok.map((x) => `${x.symbol} ${x.solver_eV} vs ${x.measured_eV}`).join(", ")}; mean error ${P.solverMeanError_eV}, with the full term correction ${P.fullMeanError_eV}; configurations right ${P.configs.bake} (bake) and ${P.configs.fullCorrection} (full correction) of ${P.configs.elements}`,
        holds: ok.length >= 5 && ok.every((x) => x.solverError_eV < 0) && P.fullMeanAbs_eV >= P.solverMeanAbs_eV - 0.05 && P.configs.fullCorrection < P.configs.bake, section: "6", gate: [67] }; })(),
    (() => { const ts = [0.1, 0.3, 0.5, 0.7, 0.9], err = Math.max(...ts.map((t) => Math.abs(kClosed(t) / k4(t) - 1)));
      return { id: "kernelclosed", part: "law", claim: "The 4D shell kernel has a closed form, κ(t) = 4[(1 + t²)E(t) − (1 − t²)K(t)]/3πt² in complete elliptic integrals, with κ(1) = 8/3π and κ = 1 − t²/8 − t⁴/64 − …",
        value: `closed form against the solver's quadrature at t = 0.1 … 0.9: largest relative difference ${err.toExponential(1)}; at t = 1: ${kClosed(1 - 1e-12).toFixed(6)} against 8/3π = ${(8 / (3 * Math.PI)).toFixed(6)}`,
        holds: err < 1e-8 && Math.abs(kClosed(1 - 1e-12) - 8 / (3 * Math.PI)) < 1e-5, section: "A", gate: [67] }; })(),
    ...(() => { const I = IONS, o3 = I.filter((r) => r.D === 3), i4 = I.filter((r) => r.D === 4), pblock = [5, 6, 8, 9, 13, 14, 16, 17, 31, 32, 34, 35], unb = o3.filter((r) => r.ea_measured_eV === "unbound"), meas = o3.filter((r) => typeof r.ea_measured_eV === "number");
      const camp = o3.filter((r) => r.ion_full_eV != null).map((r) => Math.abs(r.ion_full_eV - r.ion_main_eV)), re4 = [...TERM.values()].filter((r) => r.cation), hal = [11, 21, 49, 77, 137].map((z) => i4.find((r) => r.Z === z)), ourHal = [9, 17, 35].map((z) => o3.find((r) => r.Z === z));
      return [
        { id: "ions3", part: "table", claim: "In ours, searching each ion for its own ground state changes no ionization; the anion search gets every unbound anion unbound and every p-block acceptor bound, and fails only where correlation does the binding (H⁻, the alkalis, P and As)",
          value: `cations: largest change ${Math.max(...camp).toFixed(3)} eV over ${camp.length}; anions: ${unb.filter((r) => r.ea_eV < 0).length} of ${unb.length} unbound right; p-block ${pblock.map((z) => { const r = o3.find((x) => x.Z === z); return `${r.symbol} ${r.ea_eV.toFixed(2)}/${r.ea_measured_eV}`; }).join(", ")}; failing ${["H", "Li", "Na", "K", "P", "As"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)}/${r.ea_measured_eV}`; }).join(", ")}`,
          holds: Math.max(...camp) < 0.02 && unb.every((r) => r.ea_eV < 0) && pblock.every((z) => o3.find((x) => x.Z === z).ea_eV > 0), section: "6", gate: [67] },
        { id: "ions4", part: "table", claim: "In 4D, seven ions rearrange when searched for their own ground states, lowering those ionizations by up to 1.3 eV; element 128's is unchanged",
          value: `${re4.map((r) => `${r.Z} ${r.ion_byRemoval_eV.toFixed(2)}→${r.ion_eV.toFixed(2)}`).join(", ")}; 128: ${i4.find((r) => r.Z === 128).ion_full_eV.toFixed(2)} against ${i4.find((r) => r.Z === 128).ion_main_eV.toFixed(2)}`,
          holds: re4.length === 7 && Math.abs(i4.find((r) => r.Z === 128).ion_full_eV - i4.find((r) => r.Z === 128).ion_main_eV) < 0.01 && re4.every((r) => r.ion_byRemoval_eV - r.ion_eV < 1.5), section: "8", gate: [67] },
        { id: "halogens4", part: "consequence", claim: "One electron short of a full 4D p shell, atoms hold an extra electron harder and harder down the group, where ours hold it about equally: partial screening again",
          value: `p⁷ electron affinities (eV): ${hal.map((r) => `${r.Z}: ${r.ea_eV.toFixed(2)}`).join(", ")}; ours (2p⁵, 3p⁵, 4p⁵): ${ourHal.map((r) => `${r.symbol} ${r.ea_eV.toFixed(2)} (measured ${r.ea_measured_eV})`).join(", ")}`,
          holds: hal.every((r, i) => i === 0 || r.ea_eV > hal[i - 1].ea_eV) && hal.at(-1).ea_eV > 3 * hal[0].ea_eV && Math.max(...ourHal.map((r) => r.ea_measured_eV)) - Math.min(...ourHal.map((r) => r.ea_measured_eV)) < 0.3, section: "10", gate: [67] },
      ]; })(),
    { id: "screening", part: "consequence", claim: "Without a shell theorem outer electrons are held much harder than shell-theorem screening allows",
      value: ratios.map((r) => `${r.Z}: ${r.ratio}×`).join(", "), holds: ratios.filter((r) => r.Z > 2).every((r) => r.ratio > 1.5), section: "6", gate: [8] },
    { id: "farpull", part: "consequence", claim: "A neutral atom pulls on a distant electron as −Σ⟨r²⟩/8s³",
      value: `the full cloud over the far form at 30 bohr: ${far.map((f) => `${f.Z}: ${f.ratio30}`).join(", ")}`, holds: far.every((f) => Math.abs(f.ratio30 - 1) < 0.01), section: "6", gate: [8, 67] },
  ];
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const data = [...files].map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: sha(text) }));
  const tally = {}; for (const r of refs) tally[r.status] = (tally[r.status] ?? 0) + 1;
  return { about: "Generated by papers/p1/build.mjs from atom/js/table.js; do not edit. Each claim's value is recomputed from the bake on every build.", claims, data, refs: tally };
}

/* the 4D shell kernel in closed form: k(t) = 4[(1 + t²)E(t) − (1 − t²)K(t)] / 3πt² (complete elliptic integrals of
   modulus t, by the AGM), against the code's quadrature k4 */
function ellKE(k) { let a = 1, b = Math.sqrt(1 - k * k), c = k, s = (c * c) / 2, p = 1; while (Math.abs(c) > 1e-16) { const an = (a + b) / 2, bn = Math.sqrt(a * b); c = (a - b) / 2; p *= 2; s += (p * c * c) / 2; a = an; b = bn; } const K = Math.PI / (2 * a); return { K, E: K * (1 - s) }; }
const kClosed = (t) => { if (t === 0) return 1; const { K, E } = ellKE(t); return (4 * ((1 + t * t) * E - (1 - t * t) * K)) / (3 * Math.PI * t * t); };
/* Hund's first rule, from data/hund.json (hund-collect.mjs) and data/hund-law.json (hundlaw.mjs) */
const SUPD = "⁰¹²³⁴⁵⁶⁷⁸⁹", supN = (n) => String(n).replace(/\d/g, (c) => SUPD[c]), shellN = (r) => `${r.shell}${supN(r.n)}`;
function hundData() { return { HU: JSON.parse(readFileSync(join(HERE, "data/hund.json"), "utf8")).rows, HL: JSON.parse(readFileSync(join(HERE, "data/hund-law.json"), "utf8")).cases }; }
/* the d² terms' weights (E = F⁰ + a₂F² + a₄F⁴): the 4D ten-state singlet against the best triplet, and ours' ³F against ¹D */
function hundWeights() { const H = JSON.parse(readFileSync(join(HERE, "data/hund-law.json"), "utf8")), w3 = H.weights3, w4 = H.weights4, r = (id) => { const c = H.cases.find((x) => x.id === id); return c.F_eV[2] / c.F_eV[1]; };
  const s4 = w4.find((t) => t.mult === 1 && t.g === 10), trip4 = w4.filter((t) => t.mult === 3), t4 = trip4.reduce((a, b) => (b.a2 < a.a2 ? b : a)), f3 = w3.find((t) => t.mult === 3 && t.g === 7), d3 = w3.find((t) => t.mult === 1 && t.g === 5);
  // the singlet lies below triplet t for F⁴/F² < (a₂ᵗ − a₂ˢ)/(a₄ˢ − a₄ᵗ) when a₄ˢ > a₄ᵗ; the binding one is the smallest
  const crit = Math.min(...trip4.map((t) => (s4.a4 > t.a4 ? (t.a2 - s4.a2) / (s4.a4 - t.a4) : Infinity)));
  // ours: ³F below every singlet at F⁴/F² = 0 and as it grows without bound
  const ours3 = w3.filter((t) => t.mult === 1).every((t) => t.a2 > f3.a2 && t.a4 >= f3.a4 - 1e-9 || (t.a2 > f3.a2 && t.a2 - f3.a2 + 1e3 * (t.a4 - f3.a4) > 0));
  return { s4, t4, f3, d3, crit, ours3, rLaw: r("law"), rGauss: r("gauss"), rOurs: r("ours") }; }
function hundTokens() {
  const { HU, HL } = hundData(), r4 = HU.filter((r) => r.d === 4), r3 = HU.filter((r) => r.d === 3), fails = r4.filter((r) => !r.hund), dF = fails.filter((r) => r.l === 2), fF = fails.filter((r) => r.l === 3);
  const gap = (id) => { const c = HL.find((x) => x.id === id), t = c.terms.find((x) => x.mult === 3 && x.g === 30); return t.eV.toFixed(2); };
  const dHold = [...new Set(r4.filter((r) => r.l === 2 && r.hund).map((r) => r.n))].sort((a, b) => a - b), fHold = r4.filter((r) => r.l === 3 && r.hund), fDone = r4.filter((r) => r.l === 3);
  const span = (ns) => { const out = []; let i = 0; while (i < ns.length) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; out.push(j > i + 1 ? `d${supN(ns[i])}–d${supN(ns[j])}` : j === i + 1 ? `d${supN(ns[i])}, d${supN(ns[j])}` : `d${supN(ns[i])}`); i = j + 1; } return out.join(", "); };
  const tiS = HL.find((x) => x.id === "ours").terms.find((x) => x.mult === 1);
  return {
    "hund.n3": String(r3.length), "hund.p4": String(r4.filter((r) => r.l === 1).length), "hund.d4": String(r4.filter((r) => r.l === 2).length),
    "hund.dhold": span(dHold),
    "hund.fails4d": dF.map((r) => `element ${r.Z} (${shellN(r)}, ${Math.abs(r.belowMax_eV).toFixed(2)} eV)`).join(", "),
    "hund.range": `${Math.min(...dF.map((r) => Math.abs(r.belowMax_eV))).toFixed(2)}–${Math.max(...dF.map((r) => Math.abs(r.belowMax_eV))).toFixed(2)}`,
    "hund.f3": fF.length ? Math.abs(fF.find((r) => r.n === 3)?.belowMax_eV ?? NaN).toFixed(2) : "—",
    "hund.f29": (() => { const r = fF.find((x) => x.n === 29); return r ? Math.abs(r.belowMax_eV).toFixed(2) : "—"; })(),
    "hund.fhold": fHold.map((r) => `${shellN(r)} (${r.Z})`).join(", ") || "none yet",
    "hund.fcomplete": fHold.filter((r) => r.complete && r.n > 1).map((r) => `f${supN(r.n)}`).join(", "),
    "hund.fbound": (() => { const b = fHold.filter((r) => !r.complete).map((r) => r.n).sort((x, y) => x - y); return b.length ? `f${supN(b[0])}–f${supN(b.at(-1))}` : "none"; })(),
    "hund.fmissing": (() => { const have = new Set(fDone.map((r) => r.Z)), miss = []; for (let Z = 82; Z <= 110; Z++) if (!have.has(Z)) miss.push(Z); return miss.length ? miss.join(" and ") : "none"; })(),
    "hund.fdone": `${fDone.length} of the 29 open f fillings (4f² to 4f³¹, elements 82–110)`,
    ...(() => { const T = [...TERM.values()], moved = T.filter((r) => r.ion_eV != null && Math.abs((r.ion_byRemoval_eV ?? r.ion_eV) - r.bake.ion_eV) > 0.02 && !r.configChangedBySearch).map((r) => ({ ...r, ion_eV: r.ion_byRemoval_eV ?? r.ion_eV })), up = moved.filter((r) => r.ion_eV > r.bake.ion_eV), dn = moved.filter((r) => r.ion_eV < r.bake.ion_eV), z82 = TERM.get(82), f = (r) => `${r.Z} (${r.bake.ion_eV.toFixed(2)} → ${r.ion_eV.toFixed(2)})`;
      return { "tt.n": String(T.length), "tt.up": up.map(f).join(", "), "tt.down": dn.map(f).join(", "), "tt.range": `${Math.min(...moved.map((r) => Math.abs(r.ion_eV - r.bake.ion_eV))).toFixed(2)}–${Math.max(...moved.map((r) => Math.abs(r.ion_eV - r.bake.ion_eV))).toFixed(2)}`,
        "tt.82": Math.abs((z82.uncorrected.E_hartree - z82.bake.E) * EV).toFixed(2), "tt.82ion": `${z82.bake.ion_eV.toFixed(2)} → ${z82.ion_eV.toFixed(2)}`, "tt.cands": `${Math.min(...T.map((r) => r.candidates))}–${Math.max(...T.map((r) => r.candidates))}` }; })(),
    ...(() => { const P = JSON.parse(readFileSync(join(HERE, "data/promotion3.json"), "utf8")), ok = P.promotion.filter((x) => !x.missing), sgn = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
      const dc = (cfg) => [...cfg.matchAll(/\d[df](\d+)/g)].reduce((t, m) => t + +m[1], 0), sup = (c) => c.split(" ").slice(-2).map((t) => t.replace(/(\d[spdf])(\d+)/, (_, a, n) => a + supN(n))).join(" ");
      const sens = [...TERM.values()].map((r) => { const comp = (r.within1eV || []).filter((c) => c.dEc_eV > 0 && dc(c.config) < dc(r.config)).sort((x, y) => x.dEc_eV - y.dEc_eV)[0]; return comp ? { Z: r.Z, g: r.config, c: comp.config, e: comp.dEc_eV } : null; }).filter(Boolean);
      return { "prom.list": ok.map((x) => `${x.symbol} ${sgn(x.solver_eV)} against ${x.measured_eV.toFixed(2)}`).join(", "), "prom.bias": Math.abs(P.solverMeanError_eV).toFixed(2), "prom.fullbias": Math.abs(P.fullMeanError_eV).toFixed(2),
        "prom.bake": `${P.configs.bake} of ${P.configs.elements}`, "prom.full": `${P.configs.fullCorrection} of ${P.configs.elements}`, "prom.min": Math.min(...ok.map((x) => Math.abs(x.solverError_eV))).toFixed(2), "prom.max": Math.max(...ok.map((x) => Math.abs(x.solverError_eV))).toFixed(2),
        "tt.sensN": String(sens.length), "tt.sens": sens.map((x) => `${x.Z} (${sup(x.c)}, ${x.e.toFixed(2)} eV up)`).join(", ") }; })(),
    ...(() => { const I = IONS, o3 = I.filter((r) => r.D === 3), i4 = I.filter((r) => r.D === 4), f = (z, D = 4) => I.find((r) => r.D === D && r.Z === z), re4 = [...TERM.values()].filter((r) => r.cation);
      return { "ea.hal4": [11, 21, 49, 77, 137].map((z) => `${f(z).ea_eV.toFixed(1)}`).join(", "), "ea.halOurs": [9, 17, 35].map((z) => `${f(z, 3).symbol} ${f(z, 3).ea_measured_eV}`).join(", "),
        "ea.nob4": [50, 78, 138].map((z) => `${z}: ${f(z).ea_eV.toFixed(2)}`).join(", "), "ea.nobUn": [2, 12, 22].map((z) => `${Math.abs(f(z).ea_eV).toFixed(0)}`).join(", "),
        "ea.bound4": String(i4.filter((r) => r.ea_eV != null && r.ea_eV > 0.7).length), "ea.max4": (() => { const m = [...i4].filter((r) => r.ea_eV != null).sort((a, b) => b.ea_eV - a.ea_eV)[0]; return `${m.ea_eV.toFixed(1)} eV (element ${m.Z})`; })(),
        "ea.pOurs": ["C", "Si", "Ge", "Al", "F", "Cl", "O"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)} against ${r.ea_measured_eV}`; }).join(", "),
        "ea.fail": ["H", "Li", "Na", "P"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)} against ${r.ea_measured_eV}`; }).join(", "),
        "ion.re4": re4.map((r) => `${r.Z} (${r.ion_byRemoval_eV.toFixed(2)} → ${r.ion_eV.toFixed(2)})`).join(", ") }; })(),
    "hl.law": gap("law"), "hl.gauss": gap("gauss"), "hl.f2": gap("f2only"), "hl.ours": tiS.eV.toFixed(2),
    ...(() => { const W = hundWeights(); return { "hl.cosS4": W.s4.cos2.toFixed(3), "hl.cosT4": W.t4.cos2.toFixed(3), "hl.cosF3": W.f3.cos2.toFixed(3), "hl.cosD3": W.d3.cos2.toFixed(3), "hl.crit": Math.abs(W.crit - 5 / 3) < 1e-4 ? "5/3" : W.crit.toFixed(3), "hl.rLaw": W.rLaw.toFixed(2), "hl.rGauss": W.rGauss.toFixed(2), "hl.rOurs": W.rOurs.toFixed(2) }; })(),
  };
}
/* the table's and the counterfactual's numbers the prose quotes */
function tableTokens(t3, t4, CF, cfOk) {
  const { periods } = layout(TABLE, 4), rws = periods.map((p) => p.length).slice(0, -1), nob = t4.filter((r) => r.noble).map((r) => r.Z);
  const errs = t3.map((r) => Math.abs(r.ion_error_pct)).sort((a, b) => a - b), diff = cfOk.filter((r) => !r.sameConfig);
  const both = cfOk.filter((r) => r.ion !== null && r.Z > 2).map((r) => t4[r.Z - 1].ion_hartree / r.ion).sort((x, y) => x - y);
  const scr = t4.filter((r) => r.noble).map((r) => ({ Z: r.Z, x: r.ion_hartree / SHELL_COUNTERFACTUAL.find((c) => c.Z === r.Z).ion }));
  const far = t4.filter((r) => r.noble).map((r) => { const f = farPull(TABLE[4][r.Z - 1], RPLOT); return Math.abs(f.U(30) / f.far(30) - 1); });
  const sup = (c) => c.split(" ").slice(-2).map((t) => t.replace(/(\d[spdf])(\d+)/, (_, a, n) => a + supN(n))).join(" ");
  return {
    "table.rows": rws.join(", "), "table.nobles": nob.join(", "), "table.lastRow": String(periods.at(-1).length),
    "ion.128": t4[127].ion_eV.toFixed(2), "ion.138": t4[137].ion_eV.toFixed(2), "ion.68": t4[67].ion_eV.toFixed(2), "ion.78": t4[77].ion_eV.toFixed(2),
    "ion3.max": `${errs.at(-1).toFixed(1)} %`, "misses3": t3.filter((r) => !r.config_match).map((r) => r.name).join(", ").replace(/, ([^,]+)$/, " and $1"),
    "cf.changed": String(diff.length), "cf.first": String(Math.min(...diff.map((r) => r.Z))), "cf.25": sup(CF[24].config), "cf.128": (CF[127].ion * EV).toFixed(1),
    "cf.holdMedian": both[both.length >> 1].toFixed(2), "cf.holdMin": both[0].toFixed(2), "cf.holdMax": both.at(-1).toFixed(2), "cf.holdN": String(both.length),
    "screen.he": scr[0].x.toFixed(2), "screen.top": scr.at(-1).x.toFixed(2), "far.dev": `${(100 * Math.max(...far)).toFixed(2)} %`,
  };
}

/* the drafts: text/*.md with {{tokens}} filled from the code and the ledger. A token the build doesn't know stops it,
   so a number in the prose can't drift from what the solver does or what the bake holds */
function numbers(t3, t4, L) {
  const src = (f) => f.toString(), grab = (f, re) => { const m = src(f).match(re); if (!m) throw new Error(`build.mjs: can't read ${re} from the solver`); return m[1]; };
  const kSrc = readFileSync(join(HERE, "../../atom/js/kernel.js"), "utf8");
  const claim = (id) => L.claims.find((c) => c.id === id), SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", tenTo = (x) => `10${String(Math.round(Math.log10(x))).replace("-", "⁻").replace(/\d/g, (c) => SUP[c])}`, minus = (v) => v.replace("-", "−");
  const repaired = [88, 101, 102, 103, 105, 106, 107];
  const CV = JSON.parse(readFileSync(join(HERE, "data/convergence.json"), "utf8")), CF = JSON.parse(readFileSync(join(HERE, "data/shelltable.json"), "utf8")).rows;
  const cfOk = CF.filter((r) => r.E !== null && !(r.ion !== null && r.ion < 0)), cvBase = new Map(CV.base.atoms.map((x) => [`${x.d}-${x.Z}`, x.E]));
  const cvRel = Math.max(...CV.rows.flatMap((g) => g.atoms.map((x) => Math.abs(x.dE / cvBase.get(`${x.d}-${x.Z}`)))));
  const lawtable = readFileSync(join(HERE, "../../atom/tools/lawtable.mjs"), "utf8"), rep = lawtable.match(/REPAIR = \{ mix: ([\d.]+), iters: (\d+) \}/);
  const AU = JSON.parse(readFileSync(join(HERE, "data/audit-scf.json"), "utf8")), e1 = (v) => minus(Math.abs(v).toExponential(1).replace(/e([+-])(\d+)/, (_, sg, n) => ` × 10${sg === "-" ? "⁻" : ""}${n.replace(/\d/g, (c) => SUP[c])}`));
  const g7 = gaussLaw(0.7, [1e-3, 1e-4, 1e-5]), spl = Object.fromEntries([0.8, 1, 1.2, 1.5].map((p) => [p, shellSplit(p)]));
  const lapAt = (r, hh = 1e-3) => { const f = (x) => 1 / x; return (f(r + hh) - 2 * f(r) + f(r - hh)) / hh ** 2 + (3 / r) * (f(r + hh) - f(r - hh)) / (2 * hh); };
  const tfFit = (rows) => { const x = rows.map((e) => Math.log(e.Z)), y = rows.map((e) => Math.log(-e.E)), n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } return sxy / sxx; };
  const pct = (v) => `${v < 0 ? "−" : "+"}${Math.abs(100 * v).toFixed(1)} %`, a3 = FIELDS.propagatorPower(1, 4);
  return {
    "gauss.e3": minus(g7[0].e.toExponential(2)).replace(/e\+?(-?)(\d+)/, (_, sg, n) => ` × 10${sg ? "⁻" : ""}${n.replace(/\d/g, (c) => SUP[c])}`), "gauss.e4": minus(g7[1].e.toExponential(2)).replace(/e\+?(-?)(\d+)/, (_, sg, n) => ` × 10${sg ? "⁻" : ""}${n.replace(/\d/g, (c) => SUP[c])}`), "gauss.e5": minus(g7[2].e.toExponential(2)).replace(/e\+?(-?)(\d+)/, (_, sg, n) => ` × 10${sg ? "⁻" : ""}${n.replace(/\d/g, (c) => SUP[c])}`),
    "gauss.c3": minus((g7[0].e * 1e-6).toFixed(5)), "gauss.c5": minus((g7[2].e * 1e-10).toFixed(5)),
    "split.p08": pct(spl[0.8].split2), "split.p1": `${Math.abs(100 * spl[1].split2).toExponential(0).replace(/e-?(\d+)/, (_, n) => ` × 10⁻${n.replace(/\d/g, (c) => SUP[c])}`)} %`, "split.p12": pct(spl[1.2].split2), "split.p15": pct(spl[1.5].split2), "split3.p15": pct(spl[1.5].split3),
    "lap.r1": minus(lapAt(1).toFixed(5)), "lap.r2": minus(lapAt(2).toFixed(5)), "cage.ratio": (1 / k4(1)).toFixed(6),
    "fields.delta": String(FIELDS.scalingDim(a3, 4)), "fields.floor": String(FIELDS.unitarityFloor(4)), "fields.m": String(FIELDS.nonlinearExponent(4)),
    "tf.exp4": tfFit(TABLE[4].filter((e) => e.Z >= 10)).toFixed(3), "tf.exp3": tfFit(TABLE[3].filter((e) => e.Z >= 10)).toFixed(3),
    "conv.n": String(CV.base.atoms.length), "conv.dIon": e1(CV.summary.maxAbs_dIon), "conv.dE": e1(CV.summary.maxAbs_dE), "conv.dErel": e1(cvRel),
    "repair.mix": rep[1], "repair.iters": rep[2], "cf.settled": String(cfOk.length), "cf.n": String(CF.length), "cf.through": String(CF.findIndex((r) => !cfOk.includes(r))), "cf.unsettled": (() => { const u = CF.filter((r) => !cfOk.includes(r)).map((r) => r.Z); return `${u[0]}–${u.at(-1)}`; })(),
    "audit.n": String(AU.rows.length), "audit.tightTol": tenTo(AU.tight.tol), "audit.dE": e1(AU.summary.maxAbs_dE), "audit.dIon": e1(AU.summary.maxAbs_dIon), "audit.dEps": e1(AU.summary.maxAbs_dEps), "audit.dS": e1(AU.summary.maxSRel), "audit.bakeS": e1(AU.summary.maxBakeSRel),
    "h4.E": minus(t4[0].E_hartree.toFixed(5)),
    "kernel.k1": k4(1).toFixed(6), "kernel.M": kSrc.match(/const M = (\d+)/)[1], "kernel.table": String(+kSrc.match(/new Float64Array\((\d+)\)/)[1]),
    "exchange.c3": EXCHANGE[3].toFixed(6), "exchange.c4": EXCHANGE[4].toFixed(6),
    "grid.N": String(GRID_N), "grid.r0": tenTo(GRID_R0), "grid.rmax": String(GRID_RMAX), "grid.h": GRID_H.toFixed(5),
    "solve.bisect": grab(atomSolve, /it < (\d+); it\+\+\) \{ \/\/ nodes/),
    "scf.mix": grab(atomScf, /mix = ([\d.]+)/), "scf.iters": grab(atomScf, /iters = (\d+)/), "scf.tol": tenTo(+grab(atomScf, /tol = ([\de.-]+)/)),
    "ground.rounds": grab(atomGround, /round < (\d+)/),
    "ion.candidates": grab(bakeElement, /\.slice\(0, (\d+)\)/),
    "table.n4": String(t4.length), "table.n3": String(t3.length), "table.repairedCount": String(repaired.length), "table.repaired": "88, 101–103 and 105–107",
    "laws.h4": minus(lawLevels((r) => -1 / r, 0, 0, 4).toFixed(8)),
    "configs3": `${t3.filter((r) => r.config_match).length} of ${t3.length}`, "ion3.median": claim("ion3").value.match(/median error ([\d.]+ %)/)[1],
    ...hundTokens(t3, t4), ...tableTokens(t3, t4, CF, cfOk), "ledger.n": String(L.claims.length),
    ...(() => { const ts = [0.1, 0.3, 0.5, 0.7, 0.9], kErr = Math.max(...ts.map((t) => Math.abs(kClosed(t) / k4(t) - 1))), eSci = (v) => (v === 0 ? "0" : v.toExponential(1).replace(/e([+-])(\d+)/, (_, sg, n) => ` × 10${sg === "-" ? "⁻" : ""}${n.replace(/\d/g, (c) => SUPD[c])}`));
      const grids = CV.summary.byGrid.map((g) => `| ${g.label} | ${eSci(g.maxAbs_dE)} | ${eSci(g.maxAbs_dIon)} |`).join("\n");
      const s3 = Object.fromEntries([0.8, 1, 1.2].map((p) => [p, shellSplit(p)]));
      return { "kernel.closedErr": eSci(kErr), "conv.table": `| change from the baked grid | largest \\|ΔE\\| (hartree) | largest \\|Δ ionization\\| (hartree) |\n|---|---|---|\n${grids}`,
        "audit.n2": String(AU.rows.length), "audit.atoms": [...new Set(AU.rows.map((r) => `${r.d === 3 ? "ours" : "4D"} ${r.Z}`))].join(", "),
        "split3.p08": pct(s3[0.8].split3), "split3.p12": pct(s3[1.2].split3), "law.gridN": "6000", "conv.atoms": CV.base.atoms.map((x) => `${x.d === 3 ? "ours" : "4D"} ${x.Z}`).join(", ") }; })(),
  };
}
function drafts(t3, t4, L) {
  const dir = join(HERE, "text"), out = new Map(), nums = numbers(t3, t4, L);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const raw = readFileSync(join(dir, f), "utf8"), known = new Set(JSON.parse(readFileSync(join(HERE, "refs.json"), "utf8")).refs.map((r) => r.key));
    for (const k of citedKeys(raw)) if (!known.has(k)) throw new Error(`text/${f}: cites @${k}, which isn't in refs.json`);
    const body = raw.replace(/<!--[\s\S]*?-->\n?/g, "").replace(/\{\{([a-z0-9.]+)\}\}/gi, (_, k) => { if (!(k in nums)) throw new Error(`text/${f}: unknown token {{${k}}}`); return nums[k]; });
    out.set(`draft/${f}`, `<!-- Generated by papers/p1/build.mjs from text/${f}; edit the source. -->\n${body}`);
  }
  if (out.size) out.set("draft/paper.md", assemble(out, L));
  return out;
}
/* the whole paper in one draft: the parts in reading order (the methods open Part II as section 5), then the figures
   with their captions, the references, and what is still to write. paper.html is rendered from it like every section */
function assemble(parts, L) {
  const get = (f) => (parts.get(`draft/${f}`) || "").replace(/<!--[\s\S]*?-->\n?/g, "").trim(), strip = (t) => t.replace(/^# .*\n+/, ""), undraft = (t) => t.replace(/ \(draft\)/g, "");
  const methods = strip(get("methods.md")).replace(/^## /gm, "### ");
  const table = get("table.md").replace(/^# .*\n+/, "");
  const caps = JSON.parse(readFileSync(join(HERE, "figures/captions.json"), "utf8"));
  const figs = Object.entries(caps).map(([k, c]) => `![**Figure ${k}.** ${c.replace(/\^η/g, "^η^")}](../figures/${k}.svg)`).join("\n\n");
  return `<!-- Generated by papers/p1/build.mjs from text/*.md: the whole paper in one draft. -->
# Paper 1 · the whole draft

*The title, the abstract and the authors' credit are left to the end. This is the current state of everything else,
regenerated from the code and its data on every change; the making is public at four.mino.mobi/papers.*

## Abstract

*To be written last.*

${undraft(strip(get("intro.md")))}

${undraft(strip(get("notation.md")))}

${undraft(get("law.md"))}

# Part II · The table

## 5 · Methods

${methods}

${undraft(table)}

${undraft(get("consequences.md"))}

${undraft(get("appendix.md"))}

## Figures

${figs}

## Supplement and data

Supplement S1 is the table with every open subshell given Hund spins (\`data/table4-hundspin.csv\`). The
${L.claims.length} claims this text rests on, and the data behind them, are in \`ledger.json\` and \`data/\`.

## References

::: {#refs}
:::
`;
}

export function build() {
  const t3 = rows(3), t4 = rows(4), out = new Map();
  out.set("data/table4.json", JSON.stringify(t4, null, 1) + "\n");
  out.set("data/table4.csv", csv(t4));
  const t4h = rows(4, { hundspin: true }); // supplement S1: every open subshell given Hund spins, the bake as it stands
  out.set("data/table4-hundspin.json", JSON.stringify(t4h, null, 1) + "\n");
  out.set("data/table4-hundspin.csv", csv(t4h));
  out.set("data/table3.json", JSON.stringify(t3, null, 1) + "\n");
  out.set("data/table3.csv", csv(t3));
  out.set("data/README.md", SCHEMA(t3, t4));
  for (const [k, v] of Object.entries(figures(t3, t4))) out.set(`figdata/${k}.json`, JSON.stringify(v, null, 1) + "\n");
  // the profiles (data/profiles.json, profiles.mjs) must be the bake's atoms: same configuration, same energy
  const prof = JSON.parse(readFileSync(join(HERE, "data/profiles.json"), "utf8"));
  for (const at of prof.atoms) { const el = TABLE[4][at.Z - 1]; if (at.config !== el.config || Math.abs(at.E - el.E) > 1e-4) throw new Error(`data/profiles.json: element ${at.Z} isn't the bake's (run node four/papers/p1/profiles.mjs)`); }
  for (const [k, v] of drawFigures()) out.set(k, v);
  const L = ledger(t3, t4, out, checkRefs().refs);
  out.set("ledger.json", JSON.stringify(L, null, 1) + "\n");
  for (const [k, v] of drafts(t3, t4, L)) out.set(k, v);
  out.set("draft/references.json", JSON.stringify(cslRefs(), null, 1) + "\n"); // CSL JSON for page.mjs's citeproc
  return { files: out, t3, t4, ledger: L };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files } = build(), check = process.argv.includes("--check"), stale = [];
  for (const [rel, text] of files) {
    const p = join(HERE, rel);
    if (check) { if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(rel); continue; }
    mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text);
  }
  const { bad, refs, citable } = checkRefs();
  if (bad.length) { console.error(`papers/p1/refs.json: ${bad.join("; ")}`); process.exit(1); }
  const open = refs.filter((r) => !citable.has(r.key)).map((r) => r.key);
  console.log(`papers/p1: ${citable.size} of ${refs.length} references citable${open.length ? `; still to verify: ${open.join(", ")}` : ""}`);
  if (check) { if (stale.length) { console.error(`papers/p1: stale, run build.mjs: ${stale.join(", ")}`); process.exit(1); } console.log(`papers/p1: ${files.size} files current`); }
  else console.log(`papers/p1: wrote ${files.size} files`);
}
