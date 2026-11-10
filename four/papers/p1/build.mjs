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
import { figures as drawFigures, CAPTIONS } from "./figures/make.mjs";
import { k4 } from "../../atom/js/kernel.js";
import * as FIELDS from "../../atom/js/fields.js";
import { SYM, IE_REAL, realConfig, isNoble, layout } from "../../atom/js/periodic.js";
import { names } from "../../atom/js/names.js";
import { peaks as etaPeaks, settled as etaSettled } from "./eta.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EV = 27.211386245988; // eV per hartree (CODATA 2018)
const r5 = (x) => +x.toPrecision(6);
const norm = (c) => c.split(" ").sort().join(" "); // configurations compared as sets of subshells

/* the term-corrected table (data/termtable.json, termtable-collect.mjs): the paper's main 4D table. Elements searched
   again carry their corrected configuration, energy and ionization; the rest are the bake's. hundspin: the bake alone
   (supplement S1) */
const TERM = new Map(JSON.parse(readFileSync(join(HERE, "data/termtable.json"), "utf8")).rows.map((r) => [r.Z, r]));
const HFT = JSON.parse(readFileSync(join(HERE, "data/hftable.json"), "utf8")); // the Hartree–Fock cross-check (hf-collect.mjs)
const IONS = JSON.parse(readFileSync(join(HERE, "data/ions.json"), "utf8")).rows; // the ions' own ground states (ions-collect.mjs): electron affinities, and the ionizations folded into termtable.json
const NIST_IE = JSON.parse(readFileSync(join(HERE, "data/nist-ie.json"), "utf8")).rows; // NIST ASD ionization energies, H–Kr (retrieved 2026-11-08)
/* the ions' ladder (runner runs ions-1, ions-23): ours' second and third ionizations against NIST, and in 4D which
   removals take a d or f electron while the valence s (the highest occupied s) is still held */
export function ionLadder(t4 = TABLE[4].map((el) => ({ ...el, config: TERM.get(el.Z)?.config ?? el.config }))) {
  const occ = (c) => Object.fromEntries([...c.matchAll(/(\d+[spdf])(\d+)/g)].map((m) => [m[1], +m[2]])), nist = (Z, q) => NIST_IE.find((r) => r.Z === Z && r.q === q)?.eV;
  const cmp = (k, q) => IONS.filter((r) => r.D === 3 && r[k] != null && nist(r.Z, q)).map((r) => ({ Z: r.Z, pct: (100 * (r[k] - nist(r.Z, q))) / nist(r.Z, q) }));
  const med = (a) => { const v = a.map((x) => Math.abs(x.pct)).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }, worst = (a) => a.reduce((x, y) => (Math.abs(y.pct) > Math.abs(x.pct) ? y : x));
  const dFirst = [], sFirst = [];
  for (const r of IONS.filter((x) => x.D === 4)) {
    const seq = [t4[r.Z - 1].config, ...[1, 2, 3].map((q) => r.ions?.[q]?.config)]; if (seq.includes(undefined)) continue;
    for (let i = 0; i < 3; i++) {
      const a = occ(seq[i]), b = occ(seq[i + 1]), vs = Object.keys(a).filter((k) => k.endsWith("s")).sort((x, y) => parseInt(y) - parseInt(x))[0], n = parseInt(vs);
      const inner = [`${n - 1}d`, `${n - 2}f`].filter((k) => k in a && a[k] > 0 && a[k] < (k.endsWith("d") ? 18 : 32)); if (!inner.length) continue; // an open d or f shell under the valence s
      const lost = Object.keys({ ...a, ...b }).filter((k) => (a[k] ?? 0) > (b[k] ?? 0));
      if (lost.some((k) => inner.includes(k)) && (b[vs] ?? 0) > 0) dFirst.push({ Z: r.Z, q: i + 1 }); else if (lost.includes(vs)) sFirst.push({ Z: r.Z, q: i + 1 });
    }
  }
  return { c1: cmp("ion_full_eV", 0), c2: cmp("ion2_eV", 1), c3: cmp("ion3_eV", 2), med, worst, dFirst, sFirst };
}
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

- \`table4.json\` / \`.csv\`: the 4D table, ${t4.length} elements (Z = 1–${t4.at(-1).Z}), with open subshells' terms resolved (section 6): the d- and f-block elements searched again and every candidate's energy corrected where Hund's first rule fails (\`termtable.json\`).
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
/* appendix E.6: Hartree–Fock against local exchange. A 4D disagreement is a d-row one when local exchange has one more d
   electron and one fewer s, f-row likewise with f, else it opens a block; a d-row one is early when local exchange's
   d count is at most half the shell (18 in 4D), where ours' Hartree–Fock erred little (Sc–Cr) */
export function hfTokens(H = HFT) {
  const S = H.summary, occ = (c) => Object.fromEntries(c.split(" ").map((t) => { const m = t.match(/^(\d+[a-z])(\d+)$/); return [m[1], +m[2]]; }));
  const kind = (r) => { const a = occ(r.lda), b = occ(r.hf), d = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const v = (a[k] || 0) - (b[k] || 0); if (v) d[k] = v; }
    const up = Object.entries(d).filter(([, v]) => v > 0), dn = Object.entries(d).filter(([, v]) => v < 0);
    if (up.length === 1 && dn.length === 1 && up[0][1] === 1 && dn[0][0].endsWith("s")) { const l = up[0][0].slice(-1); if (l === "d" || l === "f") return { l, shell: up[0][0], n: a[up[0][0]] }; }
    return { l: "o" }; };
  const rows4 = H.rows.filter((r) => r.D === 4 && !r.missing && !r.unsettled), diff = rows4.filter((r) => !r.agree).map((r) => ({ ...r, k: kind(r) }));
  const dR = diff.filter((r) => r.k.l === "d"), fR = diff.filter((r) => r.k.l === "f"), oR = diff.filter((r) => r.k.l === "o");
  const early = dR.filter((r) => r.k.n <= 9), late = dR.filter((r) => r.k.n > 9), rng = (v) => `${Math.min(...v).toFixed(2)} to ${Math.max(...v).toFixed(2)}`.replace(/-/g, "−");
  const sgn = (v) => (v < 0 ? "−" : "+") + Math.abs(v).toFixed(2), P = S.promotion3.filter((x) => !x.missing), list = (a) => a.map((r) => r.Z).join(", ");
  const SYMS = S.ours.differ.map((d) => SYM[d.Z - 1]);
  return {
    "hf.window": "4", "hf.oursHf": `${S.ours.hfRight} of ${S.ours.n}`, "hf.oursLda": String(S.ours.ldaRight), "hf.oursAgree": String(S.ours.agree),
    "hf.oursDiffer": SYMS.length > 1 ? `${SYMS.slice(0, -1).join(", ")} and ${SYMS.at(-1)}` : SYMS.join(""),
    "hf.promList": P.map((x) => `${x.symbol} ${sgn(x.ldaError_eV)}/${sgn(x.hfError_eV)}`).join(", "),
    "hf.hfEarly": rng(P.filter((x) => x.Z <= 24).map((x) => x.hfError_eV)), "hf.hfLate": rng(P.filter((x) => x.Z >= 25).map((x) => x.hfError_eV)),
    "hf.4agree": String(S.fourD.agree), "hf.4n": String(diff.length), "hf.4dN": String(dR.length), "hf.4fN": String(fR.length), "hf.4oN": String(oR.length),
    "hf.4d": list(dR), "hf.4f": list(fR), "hf.4o": list(oR), "hf.4dEarly": list(early), "hf.4dLate": list(late),
    "hf.4dLateM": rng(late.map((r) => r.hfMargin_eV)), ...fRowTokens(H),
  };
}
/* appendix E.6's f row: the lanthanide calibration B and each 4D f-row element's verdict (hf-collect.mjs summary.fRow);
   the cheapest move of one f electron out of Hartree–Fock's ground, in 4D and in our terbium */
function fRowTokens(H) {
  const F = H.summary.fRow, L = H.summary.lanthanides, fN = (c) => c.split(" ").reduce((t, x) => { const m = x.match(/^\d+f(\d+)$/); return t + (m ? +m[1] : 0); }, 0);
  const runs = (zs) => { const out = []; for (const z of zs) { const l = out.at(-1); if (l && z === l[1] + 1) l[1] = z; else out.push([z, z]); } return out.map(([a, b]) => (a === b ? String(a) : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`)); };
  const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a.join(""));
  const out = (D, Z) => { const r = H.rows.find((x) => x.D === D && x.Z === Z), f = fN(r.hf); return Math.min(...r.rows.filter((x) => x.hf_eV != null && !x.gapped && fN(x.config) === f - 1).map((x) => x.hf_eV)); };
  const tb = F.calibration.find((c) => c.Z === 65 && c.df === -1), tbHf = out(3, 65);
  return { "hf.fB": F.B_eV.toFixed(1), "hf.fCalN": String(F.calibration.length), "hf.fCalMin": Math.min(...F.calibration.map((c) => c.lean_eV)).toFixed(2),
    "hf.lanN": String(L.n), "hf.lanHf": String(L.hfRight), "hf.lanLda": String(L.ldaRight), "hf.lanAgree": String(L.agree), "hf.lanAgreeRight": String(L.agreeRight), "hf.lanAgreeWrong": String(L.agree - L.agreeRight),
    "hf.fFirm": and(runs(F.firm)), "hf.fFirmN": String(F.firm.length), "hf.fOpenAgree": and(F.openAgree.map((x, i) => `${x.Z} (${x.gap.toFixed(2)}${i ? "" : " eV"})`)),
    "hf.fLean": and(runs(F.lean)), "hf.fUntested": and(runs(F.untested)), "hf.fOut90": out(4, 90).toFixed(1), "hf.fOut100": out(4, 100).toFixed(1), "hf.fOut109": out(4, 109).toFixed(1),
    "hf.fOutTb": tbHf.toFixed(1), "hf.fOutTbM": (tbHf - tb.error_eV).toFixed(2),
    "hf.fOpenAgreeN": String(F.openAgree.length), "hf.fUntestedN": String(F.untested.length), "hf.fLeanN": String(F.lean.length),
    "hf.farAll": String(F.farCandidates.all), "hf.farCorr": String(F.farCandidates.corrected), "hf.farPartial": String(F.farCandidates.partial), "hf.farUncorr": String(F.farCandidates.uncorrected),
    "hf.fDecidedPartial": F.decidedBy.partial.length ? and(runs(F.decidedBy.partial)) : "none", "hf.fDecidedUncorr": F.decidedBy.uncorrected.length ? and(runs(F.decidedBy.uncorrected)) : "none",
    "hf.fDecidedUncorrN": String(F.decidedBy.uncorrected.length), "hf.fDecidedPartialN": String(F.decidedBy.partial.length),
    "hf.fPartialMinGap": (() => { const g = F.decidedBy.partial.map((z) => { const r = H.rows.find((x) => x.D === 4 && x.Z === z), fh = fN(r.hf); return Math.min(...r.rows.filter((x) => x.hf_eV != null && !x.gapped && fN(x.config) < fh).map((x) => x.hf_eV)); }); return g.length ? Math.min(...g).toFixed(1) : "—"; })(),
    "hf.fPartialMinZ": (() => { let best = null; for (const z of F.decidedBy.partial) { const r = H.rows.find((x) => x.D === 4 && x.Z === z), fh = fN(r.hf), g = Math.min(...r.rows.filter((x) => x.hf_eV != null && !x.gapped && fN(x.config) < fh).map((x) => x.hf_eV)); if (!best || g < best.g) best = { z, g }; } return best ? String(best.z) : "—"; })(), "hf.fGroundPartialN": String(F.groundPartial.length),
    "hf.corrMax": (() => { const v = H.rows.flatMap((r) => [(r.hfParts ?? []).reduce((t, p) => t + (p.eV ?? 0), 0), ...(r.rows ?? []).map((x) => x.farCorr_eV ?? 0)]); return Math.min(...v).toFixed(1).replace("-", "−"); })() };
}
/* section 10.1: the atoms' response (response-table.mjs → data/response.json; ours against derevianko2010) */
export function respTokens() {
  const R = JSON.parse(readFileSync(join(HERE, "data/response.json"), "utf8")).rows, REF = new Map(JSON.parse(readFileSync(join(HERE, "data/response-ref.json"), "utf8")).rows.map((r) => [r.Z, r]));
  const f = (v, p = 3) => (v >= 1000 ? String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, " ") : String(+v.toPrecision(p))), pct = (v) => `${v < 0 ? "−" : "+"}${Math.abs(100 * v).toFixed(0)} %`;
  const ours = R.filter((r) => r.D === 3 && REF.has(r.Z)).map((r) => ({ ...r, ea: r.alpha0 / REF.get(r.Z).alpha0 - 1, ec: r.C6 / REF.get(r.Z).C6 - 1 }));
  const nob = ours.filter((r) => [2, 10, 18, 36].includes(r.Z)), sAt = ours.filter((r) => [3, 4, 11, 12, 19, 20].includes(r.Z));
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
  const r4 = R.filter((r) => r.D === 4), sZ = [3, 4, 13, 14, 23, 24, 51, 52], closed = r4.filter((r) => r.Z >= 12 && !sZ.includes(r.Z)), sLike = r4.filter((r) => sZ.includes(r.Z));
  const rng = (a, k) => `${f(Math.min(...a.map((x) => x[k])), 2)}–${f(Math.max(...a.map((x) => x[k])), 2)}`;
  const sup = (c, d = 4) => abbrConfig(c, d);
  const head = "| world | element | open and outermost subshells | $\\alpha_\\mathrm p(0)$ | ref. | $C_6$ | ref. | $Q$ | $C_5$ | $R^*$ |\n|:--|--:|:--|--:|--:|--:|--:|--:|--:|--:|";
  const ref = (r, k) => (r.D === 3 && REF.has(r.Z) ? f(REF.get(r.Z)[k]) : "");
  const line = (r) => `| ${r.D === 3 ? "ours" : "4D"} | ${r.Z} | ${sup(r.config, r.D)} | ${f(r.alpha0)} | ${ref(r, "alpha0")} | ${f(r.C6)} | ${ref(r, "C6")} | ${f(r.Q)} | ${r.D === 4 ? f(r.C5) : "0"} | ${r.Rstar != null ? f(r.Rstar) : ""} |`;
  return { "resp.table": [head, ...R.filter((r) => r.D === 3).map(line), ...r4.map(line)].join("\n"),
    "resp.n": String(R.length), "resp.quad": Math.max(...R.map((r) => r.quadrature)).toExponential(0).replace(/e-(\d+)/, (_, e) => ` × 10⁻${supN(e)}`), "resp.grid": `${(100 * Math.max(...R.map((r) => Math.max(r.grid.alpha0, r.grid.C6)))).toFixed(1)} %`,
    "resp.sumMin": Math.min(...R.map((r) => r.sumRule)).toFixed(2), "resp.nobA": `${pct(Math.min(...nob.map((r) => r.ea)))} to ${pct(Math.max(...nob.map((r) => r.ea)))}`,
    "resp.sA": `${pct(Math.min(...sAt.map((r) => r.ea)))} to ${pct(Math.max(...sAt.map((r) => r.ea)))}`, "resp.sC": `${pct(Math.min(...sAt.map((r) => r.ec)))} to ${pct(Math.max(...sAt.map((r) => r.ec)))}`,
    "resp.medA": `${(100 * med(ours.filter((r) => r.Z > 1).map((r) => Math.abs(r.ea)))).toFixed(0)} %`, "resp.medC": `${(100 * med(ours.filter((r) => r.Z > 1).map((r) => Math.abs(r.ec)))).toFixed(0)} %`,
    "resp.rClosed": rng(closed, "Rstar"), "resp.n4": String(r4.length), "resp.nClosed4": String(closed.length), "resp.rS": rng(sLike, "Rstar"), "resp.rH": `${f(r4.find((r) => r.Z === 1).Rstar)} and ${f(r4.find((r) => r.Z === 2).Rstar)}` };
}
/* section 6.5: d² in a ligand field (atom/tools/ligandd2.mjs → data/ligandd2.json) */
export function ligandTokens() {
  const L = JSON.parse(readFileSync(join(HERE, "data/ligandd2.json"), "utf8")).rows, g = (D, k) => L.find((r) => r.D === D && r.ligands === k), one = (r) => r.oneElectron.map((x) => x.n).join(" + ");
  const ax = g(4, "axes"), co = g(4, "corners"), c24 = g(4, "24-cell"), last = (r) => r.scan.at(-1), trip = (r) => r.scan.at(-1).low.find((x) => x.mult === 3);
  const before = co.scan.filter((x) => x.s < co.groundChangesAt.s).at(-1);
  return { "lf.axSplit": one(ax), "lf.coSplit": one(co), "lf.oursAx": one(g(3, "axes")), "lf.oursCo": one(g(3, "corners")), "lf.axGround": String(last(ax).ground.g), "lf.axTrip": trip(ax).eV.toFixed(2),
    "lf.coCross": `${before.delta_eV.toFixed(1)}–${co.groundChangesAt.delta_eV.toFixed(1)}`, "lf.coGap": Math.abs(last(co).low[1].eV).toFixed(2), "lf.coDmax": last(co).delta_eV.toFixed(1), "lf.R": String(ax.R),
    "lf.c24": c24.oneElectronSpread_eV < 1e-6 ? "none" : `${c24.oneElectronSpread_eV} eV`, "lf.free": ax.scan[0].low[1].eV.toFixed(2) };
}
/* section 10.2: joining and separating atoms (separate-collect.mjs → data/separate.json) */
export function sepTokens() {
  const S = JSON.parse(readFileSync(join(HERE, "data/separate.json"), "utf8")), A = S.atoms, P = S.pairs, f2 = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
  const closed = A.filter((a) => a.twoS === 0), open = A.filter((a) => a.twoS > 0), r4 = (zs) => P.filter((p) => p.D === 4 && zs.includes(p.Z)).map((p) => p.at16.ratio);
  const worst = Math.max(...P.flatMap((p) => p.points.map((q) => q.worstStart_mHa))) / 1000, sym = (p) => (p.D === 3 ? ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne"][p.Z - 1] : String(p.Z));
  return { "sep.nA": String(A.length), "sep.closed": `${f2(Math.min(...closed.map((a) => a.basisError_mHa)))} to ${f2(Math.max(...closed.map((a) => a.basisError_mHa)))}`,
    "sep.open": `${f2(Math.min(...open.map((a) => a.basisError_mHa)))} to ${f2(Math.max(...open.map((a) => a.basisError_mHa)))}`,
    "sep.pairs3": P.filter((p) => p.D === 3).map((p) => `${sym(p)}₂`).join(", "), "sep.pairs4": P.filter((p) => p.D === 4).map((p) => p.Z).join(", "),
    "sep.maxQ": Math.max(...P.map((p) => p.maxCharge)) === 0 ? "below 10⁻⁵" : Math.max(...P.map((p) => p.maxCharge)).toExponential(0), "sep.worst": worst.toFixed(0),
    "sep.ours16": Math.max(...P.filter((p) => p.D === 3).map((p) => Math.abs(p.at16.hf))).toFixed(3),
    "sep.rClosed": `${Math.min(...r4([2, 12])).toFixed(2)}–${Math.max(...r4([2, 12])).toFixed(2)}`, "sep.rH": r4([1])[0].toFixed(2), "sep.rOpen": `${Math.min(...r4([7, 10, 11])).toFixed(1)}–${Math.max(...r4([7, 10, 11])).toFixed(1)}`,
    "sep.e12": (() => { const p = P.find((x) => x.D === 4 && x.Z === 12), q = p.points.at(-1); return `${q.int_hf_mHa.toFixed(4).replace("-", "−")} against ${q.far_mHa.toFixed(4).replace("-", "−")}`; })() };
}
/* section 7.4: valence states (valence-collect.mjs → data/valence.json) */
/* section 7.5: darbon's hydride DH₅ against its balanced alternatives, and its curvature matrix (valencetest-collect.mjs) */
export function vtTokens() {
  const V = JSON.parse(readFileSync(join(HERE, "data/valencetest.json"), "utf8")), R = V.reactions, H = V.hessian, f = (x) => x.toFixed(2);
  const groups = []; for (const x of H.vibrational) { const g = groups.at(-1); if (g && Math.abs(x - g.v) < 1e-4) g.n++; else groups.push({ v: x, n: 1 }); }
  const xh = (b) => R.fragments.filter((x) => x.formula === `XH${b}`).sort((a, c) => a.mp2 - c.mp2);
  return { "vt.R": R.fragments.find((x) => x.formula === "XH5").R.toFixed(2), "vt.rH2": R.H2.R.toFixed(2), "vt.n": String(H.coordinates), "vt.rigid": String(H.rigidModes.length), "vt.nVib": String(H.vibrational.length),
    "vt.groups": groups.map((g) => g.n).join(" + "), "vt.low": H.lowest.toFixed(3), "vt.grad": H.gradientMax.toExponential(0).replace(/e-(\d+)/, (_, e) => ` × 10⁻${supN(e)}`), "vt.neg": String(H.negative),
    "vt.h1": `${f(R.toXHn1_H.hf)} eV by Hartree–Fock and ${f(R.toXHn1_H.mp2)} eV with MP2`, "vt.h2": `${f(R.toXHn2_H2.hf)} and ${f(R.toXHn2_H2.mp2)} eV`,
    "vt.s4": String(xh(4)[0].twoS / 2 === 0.5 ? "a doublet" : `spin ${xh(4)[0].twoS / 2}`), "vt.s3": xh(3)[0].twoS === 2 ? "a triplet" : xh(3)[0].twoS === 0 ? "a singlet" : `spin ${xh(3)[0].twoS / 2}`,
    "vt.gap3": `${f(R.spinGap_XHn2_eV.hf)} (Hartree–Fock) and ${f(R.spinGap_XHn2_eV.mp2)} eV (MP2)`, "vt.ang": String(xh(3)[0].param) };
}
/* section 6.5 and appendix F.8: the table under 1/r^η, η = 0.5 and 1.5 (atom/tools/etatable.mjs → data/etatable.json),
   its noble gases by eta.js's rule, and 1/r's own by the same rule for comparison */
export const ETA = JSON.parse(readFileSync(join(HERE, "data/etatable.json"), "utf8")).rows;
export function etaTokens() {
  const of = (eta) => ETA.filter((r) => r.eta === eta), list = (rs) => rs.map((r) => r.Z).join(", ").replace(/, ([^,]*)$/, " and $1");
  const t1 = JSON.parse(readFileSync(join(HERE, "data/table4.json"), "utf8")).filter((r) => r.Z <= 100).map((r) => ({ Z: r.Z, config: r.config, E: r.E_hartree, ion: r.ion_hartree }));
  const uns = (eta) => of(eta).filter((r) => !etaSettled(r)).map((r) => r.Z), runs = (zs) => { const o = []; for (const z of zs) { const l = o.at(-1); if (l && z === l[1] + 1) l[1] = z; else o.push([z, z]); } return o.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", "); };
  const p15 = etaPeaks(of(1.5)), cfg = (eta, Z) => of(eta).find((r) => r.Z === Z).config;
  return { "eta.n05": list(etaPeaks(of(0.5))), "eta.n15": list(p15), "eta.n1": list(etaPeaks(t1)), "eta.settled05": String(of(0.5).filter(etaSettled).length), "eta.settled15": String(of(1.5).filter(etaSettled).length),
    "eta.uns15": runs(uns(1.5)), "eta.gIntrude": String(ETA.filter((r) => r.g?.gIntrudes).length), "eta.c4": cfg(0.5, 4).replace(/(\d)([spdf])(\d+)/g, (_, n, l, q) => `${n}${l}${supN(q)}`), "eta.c5": cfg(1.5, 5).replace(/(\d)([spdf])(\d+)/g, (_, n, l, q) => `${n}${l}${supN(q)}`),
    "eta.c14": cfg(1.5, 14).replace(/(\d)([spdf])(\d+)/g, (_, n, l, q) => `${n}${l}${supN(q)}`), "eta.zmax": String(Math.max(...ETA.map((r) => r.Z))) };
}
export function valTokens() {
  const V = JSON.parse(readFileSync(join(HERE, "data/valence.json"), "utf8")), C = V.calibration, f2 = (v) => (v == null ? "—" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(1));
  const sup = (c) => abbrConfig(c), mv = (m) => m.replace(/(\d[spdf])/g, "$1");
  const sp = C.filter((c) => c.kind === "s→p"), early = sp.filter((c) => ![7, 15, 16].includes(c.Z)), late = sp.filter((c) => [7, 15, 16].includes(c.Z)), ryd = C.filter((c) => c.kind === "Rydberg");
  const rng = (a, k) => `${f2(Math.min(...a.map((x) => x[k])))} to ${f2(Math.max(...a.map((x) => x[k])))}`, med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const rows = V.rows.filter((r) => r.D === 4), head = "| element | ground | lowest states by Hartree–Fock: move, local exchange / Hartree–Fock (eV) |\n|--:|:--|:--|";
  const line = (r) => { const st = r.states.filter((s) => s.hf_eV != null).sort((a, b) => a.hf_eV - b.hf_eV).slice(0, 3); return `| ${r.Z} | ${sup(r.ground)} | ${st.map((s) => `${mv(s.move)} ${f2(s.lda_eV)} / ${f2(s.hf_eV)}`).join("; ")} |`; };
  const z = (Z, move) => V.rows.find((r) => r.D === 4 && r.Z === Z)?.states.find((s) => s.move === move);
  const below = rows.filter((r) => r.states.some((s) => s.hf_eV != null && s.hf_eV < 0)).map((r) => r.Z);
  return { "val.table": [head, ...rows.map(line)].join("\n"), "val.n4": String(rows.length), "val.nCal": String(C.length),
    "val.spEarly": `${rng(early, "ldaError_eV")} (local exchange) and ${rng(early, "hfError_eV")} (Hartree–Fock)`, "val.spEarlyEl": early.map((c) => c.symbol).join(", "),
    "val.spLate": `${rng(late, "ldaError_eV")} and ${rng(late, "hfError_eV")}`, "val.spLateEl": late.map((c) => c.symbol).join(", "),
    "val.ryd": `${f2(med(ryd.map((c) => Math.abs(c.ldaError_eV))))} and ${f2(med(ryd.map((c) => Math.abs(c.hfError_eV))))}`, "val.nRyd": String(ryd.length),
    "val.d7": (() => { const s = z(7, "2s→2p"); return `${f2(s.lda_eV)} and ${f2(s.hf_eV)}`; })(), "val.d4": (() => { const s = z(4, "2s→2p"); return `${f2(s.lda_eV)} and ${f2(s.hf_eV)}`; })(),
    "val.d14": (() => { const s = z(14, "3s→3p"); return `${f2(s.lda_eV)} and ${f2(s.hf_eV)}`; })(), "val.below": below.join(", ") || "none" };
}
const citedKeys = (t) => new Set([...t.replace(/<!--[\s\S]*?-->/g, "").matchAll(/(?<![\w.])-?@([a-z][\w-]*\d{4}[a-z]*|[a-z]+-[a-z-]+)/gi)].map((m) => m[1]));

/* Négadi & Kibler's generalized Madelung rule for D dimensions: subshells fill in order of n + l (then n), each holding
   2 × (the number of D-dimensional harmonics of degree l), and a row closes after each p (and after 1s) */
export function madelungRows(d, upto) {
  const order = subshells(d).sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n), rows = []; let cur = 0, total = 0;
  for (const s of order) { cur += s.cap; total += s.cap; if (s.l === 1 || s.name === "1s") { rows.push(cur); cur = 0; } if (total >= upto) break; }
  return rows;
}

/* the strict rule's configuration for Z in D dimensions (fill in order of n + l, then n), and each solved atom against
   it: which subshells gain or lose electrons. The rule is a filling order; like Madelung's in ours it has exceptions */
export function madelungFill(Z, d) {
  const order = subshells(d).sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n), m = new Map(); let left = Z;
  for (const s of order) { if (!left) break; const k = Math.min(left, s.cap); m.set(s.name, k); left -= k; }
  return m;
}
export function madelungDiff(rowsOf, d, config = (r) => r.config) {
  const parse = (c) => new Map(c.split(" ").map((t) => { const x = t.match(/^(\d+[a-z])(\d+)$/); return [x[1], +x[2]]; }));
  return rowsOf.map((r) => { const m = madelungFill(r.Z, d), o = parse(config(r)), keys = [...new Set([...m.keys(), ...o.keys()])];
    return { Z: r.Z, moves: keys.map((k) => [k, (o.get(k) ?? 0) - (m.get(k) ?? 0)]).filter(([, v]) => v) }; }).filter((x) => x.moves.length);
}
const moveText = (mv) => { const from = mv.find(([, v]) => v < 0), to = mv.find(([, v]) => v > 0); return `${from[0]} → ${to[0]}${to[1] > 1 ? ` ×${to[1]}` : ""}`; };

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
      holds: weak.every((g) => !g.bound) && strong.every((g) => g.bound) && Math.abs(ratioR0 / 1e4 - 1) < 0.01, section: "2.1", gate: [67] },
    { id: "uniqueness", part: "law", claim: "Among power laws 1/r^η only η = 1 keeps a shell's levels together (2s with 2p, 3s with 3d), the degeneracy that makes shells of 2(l + 1)² and rows of 2, 10, 10, 28 …",
      value: splits.map((s) => `η = ${s.p}: 2p − 2s ${(100 * s.split2).toFixed(s.p === 1 ? 9 : 1)} %, 3d − 3s ${(100 * s.split3).toFixed(s.p === 1 ? 9 : 1)} %`).join("; "),
      holds: Math.abs(splits[1].split2) < 1e-8 && Math.abs(splits[1].split3) < 1e-8 && splits[0].split2 < -0.01 && splits[2].split2 > 0.01, section: "2.3", gate: [67] },
    { id: "harmonic", part: "law", claim: "Pinned in 4D, 1/r isn't harmonic: ∇²(1/r) = −1/r³ in empty space, so there is no Gauss's law for it",
      value: `∇²(1/r) at r = 1, 2: ${lap(1).toFixed(5)}, ${lap(2).toFixed(5)} (−1/r³: −1, −0.125)`, holds: Math.abs(lap(1) + 1) < 1e-4 && Math.abs(lap(2) + 0.125) < 1e-4, section: "2.4", gate: [3, 33] },
    { id: "shell", part: "law", claim: "… and no shell theorem: a shell of charge is felt at its own radius at k(1) = 8/(3π) of a point charge's pull, and a hollow conductor's centre sits at 3π/8 of its wall's potential (no Faraday cage)",
      value: `k(1) = ${k1.toFixed(6)} (8/(3π) = ${(8 / (3 * Math.PI)).toFixed(6)}); centre over wall ${(1 / k1).toFixed(6)} (3π/8 = ${((3 * Math.PI) / 8).toFixed(6)})`, holds: Math.abs(k1 - 8 / (3 * Math.PI)) < 1e-6, section: "2.4", gate: [3] },
    (() => { const fit = (rows) => { const x = rows.map((e) => Math.log(e.Z)), y = rows.map((e) => Math.log(-e.E)), n = x.length, mx = x.reduce((p, q) => p + q) / n, my = y.reduce((p, q) => p + q) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } return sxy / sxx; };
      const e4 = fit(TABLE[4].filter((e) => e.Z >= 10)), e3 = fit(TABLE[3].filter((e) => e.Z >= 10));
      return { id: "tf", part: "law", claim: "Atoms don't collapse: total energies follow each world's Thomas–Fermi law, Z^(3−2/D) (Z^(5/2) in four dimensions, Z^(7/3) in ours), as the shell theorem's absence would have to break if matter were unstable",
        value: `fitted exponent ${e4.toFixed(3)} over Z = 10–140 in 4D (5/2 = 2.5); ${e3.toFixed(3)} over Z = 10–36 in ours (7/3 = 2.333); both a little above, as finite-Z corrections make them`,
        holds: e4 > 2.5 && e4 < 2.56 && e3 > 7 / 3 && e3 < 2.42 && e4 - 2.5 < e3 - 7 / 3 + 0.03, section: "2.5", gate: [67] }; })(),
    { id: "rows", part: "table", claim: "The 4D table's rows hold 2, 10, 10, 28, 28, 60 elements: the rows Négadi and Kibler's generalized Madelung rule (stated for any D, worked out by them for D = 2) gives when applied to D = 4",
      value: `solved ${whole.join(", ")} (and ${rows.at(-1)} of the next by Z = 140); the rule ${predicted.join(", ")}`, holds: whole.join() === predicted.join() && whole.join() === "2,10,10,28,28,60", section: "4.1", gate: [7, 27, 67] },
    (() => { const dv = madelungDiff(t4, 4), pair = dv.every((x) => x.moves.length === 2 && x.moves.reduce((t, [, v]) => t + v, 0) === 0 && Math.abs(x.moves[0][1]) <= 2);
      const ours = madelungDiff(t3.filter((r) => r.Z <= 36), 3), real = madelungDiff(t3.filter((r) => r.Z <= 36), 3, (r) => r.config_measured);
      return { id: "madelungfill", part: "table", claim: "Inside the rows, read as a ground-configuration rule (which, like Madelung's in ours, it isn't meant to be exactly): most 4D atoms fill exactly in its order, and every other moves one or two electrons between two subshells, nearly always from an outer s into the d or f below it, as our chromium and copper do",
        value: `${t4.length - dv.length} of ${t4.length} exactly the rule's; the rest: ${dv.map((x) => `${x.Z} ${moveText(x.moves)}`).join(", ")}. Ours 1–36: the solver departs at ${ours.map((x) => x.Z).join(", ")}, measured at ${real.map((x) => x.Z).join(", ")}`,
        holds: pair && dv.length < 45 && t4.length - dv.length > 95, section: "4.1", gate: [67] }; })(),
    (() => { const L = ionLadder(t4), zs = [...new Set(L.dFirst.map((x) => x.Z))];
      return { id: "ions23", part: "table", claim: "The +2 and +3 ions, each searched for its own ground state: ours' second and third ionizations agree with NIST more closely than the first; in 4D the 3d row's ions lose their outer s electrons first, as ours do, while the first elements of the 4d and 5d blocks give up a d electron first at +1 or +2, as our yttrium and lutetium do",
        value: `ours vs NIST, median |err|: 1st ${L.med(L.c1).toFixed(1)} % (n ${L.c1.length}), 2nd ${L.med(L.c2).toFixed(1)} % (n ${L.c2.length}), 3rd ${L.med(L.c3).toFixed(1)} % (n ${L.c3.length}); 4D removals taking d/f with the valence s held: ${L.dFirst.map((x) => `${x.Z}(${x.q}+)`).join(", ")}; s first: ${L.sFirst.length}`,
        holds: L.med(L.c2) < L.med(L.c1) && L.med(L.c3) < L.med(L.c1) && !zs.some((z) => z >= 23 && z <= 42), section: "E.4", gate: [67] }; })(),
    { id: "nobles", part: "table", claim: "Its noble gases are elements 2, 12, 22, 50, 78 and 138, each a peak of the first ionization energy",
      value: `noble gases ${nobleZ.join(", ")}; each above both neighbours: ${peaks ? "yes" : "no"}`, holds: nobleZ.join() === "2,12,22,50,78,138" && peaks, section: "4.1", gate: [7, 27, 67] },
    { id: "fulld", part: "table", claim: "The hardest-held electron in the table isn't a noble gas's: element 128, whose 18-electron d shell is full with nothing outside it (our palladium's kind), out-holds its row's noble gas 138, and element 68, the same kind a row up, comes within a volt of its row's noble gas 78 (in ours palladium holds far less hard than xenon, 8.3 against 12.1 eV)",
      value: `128: ${t4[127].ion_eV.toFixed(2)} eV (${t4[127].config.split(" ").slice(-2).join(" ")}) against 138: ${t4[137].ion_eV.toFixed(2)}; 68: ${t4[67].ion_eV.toFixed(2)} eV (${t4[67].config.split(" ").slice(-2).join(" ")}) against 78: ${t4[77].ion_eV.toFixed(2)}; the table's highest is element ${[...t4].sort((x, y) => y.ion_hartree - x.ion_hartree)[0].Z}`,
      holds: t4[127].ion_hartree > t4[137].ion_hartree && [...t4].sort((x, y) => y.ion_hartree - x.ion_hartree)[0].Z === 128 && /5d18$/.test(t4[127].config) && /4d18$/.test(t4[67].config) && t4[77].ion_eV - t4[67].ion_eV < 1 && t4[77].ion_eV > t4[67].ion_eV, section: "4.2", gate: [67] },
    (() => { const AU = JSON.parse(readFileSync(join(HERE, "data/audit-scf.json"), "utf8")), m = AU.summary; return { id: "converged", part: "table", claim: "The table's numbers are converged in the solver's stop: tightening it a hundred-thousandfold moves no total or ionization energy by a microhartree, nor Σ⟨r²⟩ by 10⁻⁴ of itself",
      value: `${AU.rows.length} atoms, both worlds: |ΔE| ≤ ${m.maxAbs_dE.toExponential(1)}, |Δion| ≤ ${m.maxAbs_dIon.toExponential(1)} hartree; Σ⟨r²⟩ ≤ ${m.maxSRel.toExponential(1)} relative, the bake's against the tight ${m.maxBakeSRel.toExponential(1)}`,
      holds: m.allTight && m.maxAbs_dE < 1e-6 && m.maxAbs_dIon < 1e-6 && m.maxSRel < 1e-4 && m.maxBakeSRel < 1e-4 && AU.rows.every((r) => Math.abs(r.bakeE - r.tightE) < 1e-5), section: "C, G.6", gate: [67] }; })(),
    (() => { const CV = JSON.parse(readFileSync(join(HERE, "data/convergence.json"), "utf8")), m = CV.summary; return { id: "grid", part: "table", claim: "The table's ionization energies don't depend on the radial grid: halving or doubling its points, or moving either end by a factor of ten in or out, moves none by a millihartree",
      value: `${CV.base.atoms.length} atoms, both worlds, six grids: |Δion| ≤ ${m.maxAbs_dIon.toExponential(1)} hartree; total energies ≤ ${m.maxAbs_dE.toExponential(1)}`,
      holds: m.allConverged && m.maxAbs_dIon < 1e-3, section: "C, G.7", gate: [67] }; })(),
    { id: "hydrogen", part: "table", claim: "4D hydrogen comes out exact: −Z²/[2(n + ½)²] hartree, so −2/9 for the ground state",
      value: `${h} hartree against ${hExact.toFixed(5)}`, holds: Math.abs(h - hExact) < 1e-5, section: "3, E.1", gate: [1] },
    { id: "configs3", part: "table", claim: "The same solver in our three dimensions gets 32 of our 36 ground configurations",
      value: `${hits} of ${t3.length}; missed ${misses.join(", ")} (one d electron too many against 4s: local exchange leans to d)`, holds: hits === 32, section: "E.3", gate: [6, 67] },
    { id: "ion3", part: "table", claim: "… and our first ionization energies to a few percent",
      value: `median error ${med.toFixed(1)} %, largest ${errs.at(-1).toFixed(1)} %`, holds: med < 6, section: "E.3", gate: [6] },
    ...(() => { // the counterfactual table (data/shelltable.json, lawtable.mjs): only settled atoms count
      // unsettled: no field converged (E null), or a "ground state" an electron would rather leave (negative ionization:
      // the search missed a lower configuration); neither counts as a result
      const settledRow = (r) => r.E !== null && !(r.ion !== null && r.ion < 0);
      const ST = JSON.parse(readFileSync(join(HERE, "data/shelltable.json"), "utf8")).rows, ok = ST.filter(settledRow), uns = ST.filter((r) => !settledRow(r)).map((r) => r.Z);
      const diff = ok.filter((r) => !r.sameConfig), nobles = [2, 12, 22, 50, 78, 138], z128 = ST[127];
      const both = ok.filter((r) => r.ion !== null && r.Z > 2).map((r) => t4[r.Z - 1].ion_hartree / r.ion).sort((x, y) => x - y);
      return [
        { id: "geometry", part: "consequence", claim: "The rows survive the shell theorem: solved with it forced on, the first 24 elements keep every configuration, and the noble gases close the same rows at 2, 12, 22, 50, 78 and 138",
          value: `with the shell theorem: 1–24 unchanged (${ST.slice(0, 24).every((r) => settledRow(r) && r.sameConfig) ? "all settled, all the same" : "not all"}); every atom to 88 settled; noble gases ${nobles.map((z) => `${z} ${settledRow(ST[z - 1]) && ST[z - 1].sameConfig ? "same" : "changed"}`).join(", ")}. ${uns.length} atoms of row 6's f block don't settle under the shell theorem (${uns.length ? `${uns[0]}–${uns.at(-1)}` : ""}), so whether row 6 splits is open`,
          holds: ST.slice(0, 24).every((r) => settledRow(r) && r.sameConfig) && nobles.every((z) => settledRow(ST[z - 1]) && ST[z - 1].sameConfig) && ST.slice(0, 88).every(settledRow), section: "6.1", gate: [67] },
        { id: "reorders", part: "consequence", claim: "The law decides what fills inside the rows: of the atoms settled under both, every change of configuration begins at the first d element, and under the shell theorem p beats d (element 25 takes 4s² 4p¹ where the law gives 3d¹ 4s²)",
          value: `${ok.length} settled under the shell theorem; ${diff.length} differ, the first at ${Math.min(...diff.map((r) => r.Z))}; in every one the law's own configuration stays lower under the law (${ok.every((r) => r.tableStillLower) ? "checked" : "NOT"})`,
          holds: Math.min(...diff.map((r) => r.Z)) === 25 && ok.every((r) => r.tableStillLower) && /4p1$/.test(ST[24].config), section: "6.2", gate: [67] },
        { id: "law128", part: "consequence", claim: "Element 128's hold on its outermost electron is the law's: with the shell theorem forced on it falls from the table's highest to a few volts, and the noble gases hold hardest, as ours do",
          value: `128: ${(z128.ion * 27.211386).toFixed(2)} eV with the shell theorem against ${t4[127].ion_eV.toFixed(2)} under the law; the shell theorem's five highest are ${[...ok].filter((r) => r.ion !== null).sort((x, y) => y.ion - x.ion).slice(0, 5).map((r) => r.Z).join(", ")}`,
          holds: z128.E !== null && z128.ion * 27.211386 < 10 && [...ok].filter((r) => r.ion !== null).sort((x, y) => y.ion - x.ion).slice(0, 5).map((r) => r.Z).sort((x, y) => x - y).join() === "12,22,50,78,138", section: "6.3", gate: [67] },
        { id: "holdratio", part: "consequence", claim: "Across the table the law holds outer electrons about two and a half times harder than the shell theorem would, and up to ten times",
          value: `first ionization, the law over the shell theorem, ${both.length} atoms past helium settled under both: median ${both[both.length >> 1].toFixed(2)}, from ${both[0].toFixed(2)} to ${both.at(-1).toFixed(2)}`,
          holds: both[both.length >> 1] > 2 && both[both.length >> 1] < 3 && both.at(-1) > 9 && both[0] > 1, section: "6.3", gate: [67] },
      ];
    })(),
    ...(() => { const { HU, HL } = hundData(), r4 = HU.filter((r) => r.d === 4), r3 = HU.filter((r) => r.d === 3), fails = r4.filter((r) => !r.hund);
      const gauss = HL.find((x) => x.id === "gauss"), law = HL.find((x) => x.id === "law"), single = (c) => c.terms[0].mult === 1 && c.terms[0].g === 10;
      return [
        { id: "hund3", part: "table", claim: "In ours every open subshell of the table has its maximum spin lowest (Hund's first rule), from the subshell's own repulsion",
          value: `${r3.length} subshells (p and d) of our 36 atoms: ${r3.every((r) => r.hund && r.complete) ? "all hold" : "NOT all"}`, holds: r3.length > 20 && r3.every((r) => r.hund && r.complete), section: "5", gate: [67] },
        { id: "hund4", part: "table", claim: "In four dimensions Hund's first rule fails for d² and d¹⁶ in every d row, and holds for every other p and d filling of the table",
          value: `${r4.filter((r) => r.l <= 2).length} p and d subshells; fails: ${fails.filter((r) => r.l === 2).map((r) => `${r.Z} ${r.shell}${r.n} by ${Math.abs(r.belowMax_eV).toFixed(3)} eV`).join(", ")}`,
          holds: r4.filter((r) => r.l <= 2 && !r.hund).every((r) => r.l === 2 && (r.n === 2 || r.n === 16) && r.groundS === 0) && [2, 16].every((n) => r4.filter((r) => r.l === 2 && r.n === n).length === 3 && r4.filter((r) => r.l === 2 && r.n === n).every((r) => !r.hund)) && r4.filter((r) => r.l === 1).every((r) => r.hund), section: "5.1", gate: [67] },
        { id: "hund4f29", part: "table", claim: "… and so does its mirror 4f²⁹, three short of a full f shell: spin ½ again",
          value: (() => { const r = r4.find((x) => x.l === 3 && x.n === 29); return r ? `108 4f29: S ${r.groundS} of ${r.Smax}, ${Math.abs(r.belowMax_eV).toFixed(3)} eV below${r.complete ? "" : " (bound)"}` : "not run"; })(),
          holds: r4.some((r) => r.l === 3 && r.n === 29 && !r.hund && r.groundS === 0.5 && r.complete), section: "5.1", gate: [67] },
        { id: "hund4f3", part: "table", claim: "In four dimensions 4f³ breaks it too: its ground term has spin ½",
          value: r4.filter((r) => r.l === 3).map((r) => `${r.Z} ${r.shell}${r.n}: S ${r.groundS} of ${r.Smax}${r.complete ? "" : " (bound)"}`).join("; "), holds: r4.some((r) => r.l === 3 && r.n === 3 && !r.hund && r.groundS === 0.5), section: "5.1", gate: [67] },
        (() => { const W = hundWeights(); return { id: "hundcrit", part: "table", claim: "Why: two d electrons' terms have energies F⁰ + a₂F² + a₄F⁴ exactly; in 4D the ten-state singlet keeps the electrons nearer right angles than any triplet (⟨cos²γ⟩ 1/8, half of random) and lies lowest whenever F⁴/F² < 5/3, which every real orbital meets; in ours ³F is lowest for every F⁴/F²",
          value: `4D: singlet ⟨cos²γ⟩ ${W.s4.cos2}, best triplet ${W.t4.cos2} (random 0.25); singlet lowest for F⁴/F² < ${W.crit.toFixed(4)}; element 26's F⁴/F² ${W.rLaw.toFixed(3)} (1/r), ${W.rGauss.toFixed(3)} (Gauss). Ours: ³F ${W.f3.cos2}, ¹D ${W.d3.cos2} (random 1/3); ³F lowest for all F⁴/F² ≥ 0: ${W.ours3}`,
          holds: Math.abs(W.crit - 5 / 3) < 1e-4 && W.rLaw < W.crit && W.rGauss < W.crit && W.s4.cos2 < W.t4.cos2 && Math.abs(W.s4.cos2 - 0.125) < 1e-4 && W.ours3, section: "5.2", gate: [67] }; })(),
        { id: "hundlaw", part: "table", claim: "The failure is the 4D shell's, not the law's: Gauss's 1/r² gives d² the same singlet ground term, further below its triplet",
          value: `element 26's orbital: triplet above the singlet by ${law.terms.find((t) => t.mult === 3 && t.g === 30).eV} eV under 1/r, ${gauss.terms.find((t) => t.mult === 3 && t.g === 30).eV} eV under 1/r²`, holds: single(law) && single(gauss), section: "5.2", gate: [67] },
      ]; })(),
    (() => { const T = [...TERM.values()], byS = T.filter((r) => r.configChangedBySearch), byT = T.filter((r) => r.configChangedByTerms), moved = T.filter((r) => r.ion_eV != null && Math.abs((r.ion_byRemoval_eV ?? r.ion_eV) - r.bake.ion_eV) > 0.02 && !r.configChangedBySearch).map((r) => ({ ...r, ion_eV: r.ion_byRemoval_eV ?? r.ion_eV }));
      return { id: "termtable", part: "table", claim: "Resolving the terms changes no ground configuration: it lowers the eight Hund-breaking atoms' energies and moves eight first ionizations by 0.3–0.7 eV; the wider search behind it finds one configuration the bake missed (element 82: 4f¹ 5d¹ 6s², our cerium's kind)",
        value: `${T.length} elements searched again; configurations changed by the terms: ${byT.map((r) => r.Z).join(", ") || "none"}; by the wider search: ${byS.map((r) => `${r.Z} (${r.bake.config.split(" ").slice(-3).join(" ")} → ${r.config.split(" ").slice(-4).join(" ")}, ${((r.uncorrected.E_hartree - r.bake.E) * EV).toFixed(3)} eV)`).join(", ")}; ionizations moved: ${moved.map((r) => `${r.Z} ${r.bake.ion_eV.toFixed(2)}→${r.ion_eV.toFixed(2)}`).join(", ")}`,
        holds: byT.length === 0 && byS.map((r) => r.Z).join() === "82" && moved.length === 8 && moved.every((r) => Math.abs(r.ion_eV - r.bake.ion_eV) < 0.7), section: "5.3", gate: [67] }; })(),
    (() => { const P = JSON.parse(readFileSync(join(HERE, "data/promotion3.json"), "utf8")), ok = P.promotion.filter((x) => !x.missing);
      return { id: "promotion", part: "table", claim: "In ours the solver's misses have one cause, a bias toward d: moving a 4s electron into 3d comes out too cheap in every 3d atom measured, by about a volt; resolving the open subshells' whole term structure doesn't remove it, and gets fewer configurations right",
        value: `4s→3d, solver against measured (eV): ${ok.map((x) => `${x.symbol} ${x.solver_eV} vs ${x.measured_eV}`).join(", ")}; mean error ${P.solverMeanError_eV}, with the full term correction ${P.fullMeanError_eV}; configurations right ${P.configs.bake} (bake) and ${P.configs.fullCorrection} (full correction) of ${P.configs.elements}`,
        holds: ok.length >= 5 && ok.every((x) => x.solverError_eV < 0) && P.fullMeanAbs_eV >= P.solverMeanAbs_eV - 0.05 && P.configs.fullCorrection < P.configs.bake, section: "E.3", gate: [67] }; })(),
    (() => { const R = JSON.parse(readFileSync(join(HERE, "data/response.json"), "utf8")).rows, T = respTokens(), r4 = R.filter((r) => r.D === 4);
      return { id: "response", part: "consequence", claim: "Atomic response, converged: the coupled response gives hydrogen exactly and our closed-shell atoms within about 10 % of reference values (alkalis and alkaline earths too polarizable); in four dimensions the permanent pull C5 = 3Q²/64 outranges dispersion everywhere outside the atom except for hydrogen, helium and the alkali-like atoms",
        value: `${R.length} atoms; quadrature ${T["resp.quad"]}, grid ${T["resp.grid"]}, sum rule ≥ ${T["resp.sumMin"]}; ours' median error α ${T["resp.medA"]}, C6 ${T["resp.medC"]}; R* (bohr): H, He ${T["resp.rH"]}, s-like ${T["resp.rS"]}, the rest ${T["resp.rClosed"]}`,
        holds: R.every((r) => r.quadrature < 1e-4 && r.grid.alpha0 < 0.01 && r.grid.C6 < 0.01 && r.sumRule > 0.88) && Math.abs(R.find((r) => r.D === 3 && r.Z === 1).alpha0 - 4.5) < 1e-3 && r4.filter((r) => r.Z >= 12 && ![13, 14, 23, 24, 51, 52].includes(r.Z)).every((r) => r.Rstar < 2),
        section: "7, J.1", gate: [67] }; })(),
    (() => { const L = JSON.parse(readFileSync(join(HERE, "data/ligandd2.json"), "utf8")).rows, g = (D, k) => L.find((r) => r.D === D && r.ligands === k), ax = g(4, "axes"), co = g(4, "corners");
      return { id: "ligandd2", part: "table", claim: "4D's d² singlet survives a ligand field on the axes at every strength, gives way to a triplet only narrowly at the tesseract's corners, and the 24-cell doesn't split d at all; ours' d² keeps its triplet",
        value: `axes: ground singlet at every s (last ${ax.scan.at(-1).ground.mult}×${ax.scan.at(-1).ground.g}); corners: triplet from Δ ${co.groundChangesAt?.delta_eV} eV; 24-cell spread ${g(4, "24-cell").oneElectronSpread_eV}; ours' grounds ${g(3, "axes").scan.every((x) => x.ground.mult === 3)}, ${g(3, "corners").scan.every((x) => x.ground.mult === 3)}`,
        holds: ax.scan.every((x) => x.ground.mult === 1) && co.groundChangesAt?.to.mult === 3 && g(4, "24-cell").oneElectronSpread_eV < 1e-6 && g(3, "axes").scan.every((x) => x.ground.mult === 3) && g(3, "corners").scan.every((x) => x.ground.mult === 3),
        section: "H.5", gate: [67] }; })(),
    (() => { const S = JSON.parse(readFileSync(join(HERE, "data/separate.json"), "utf8")), T = sepTokens(), p4 = (z) => S.pairs.find((p) => p.D === 4 && p.Z === z);
      return { id: "separate", part: "consequence", claim: "Stretched pairs of light atoms come apart into neutral atoms with their own spins in both worlds; in 4D the separated limit of closed-shell atoms is the permanent pull −3Q²/(64R⁵), which Hartree–Fock reproduces",
        value: `pairs ours ${T["sep.pairs3"]}, 4D ${T["sep.pairs4"]}: charges ${T["sep.maxQ"]}, ours' interaction at 16 bohr ≤ ${T["sep.ours16"]} mHa; 4D at 16 bohr, Hartree–Fock over the far form: closed ${T["sep.rClosed"]}, H ${T["sep.rH"]}, open p ${T["sep.rOpen"]}; basis error closed ${T["sep.closed"]} mHa`,
        holds: S.pairs.every((p) => p.maxCharge < 1e-4 && p.spinsRight) && [2, 12].every((z) => Math.abs(p4(z).at16.ratio - 1) < 0.1) && S.pairs.filter((p) => p.D === 3).every((p) => Math.abs(p.at16.hf) < 0.01),
        section: "7, J.2", gate: [67] }; })(),
    (() => { const V = JSON.parse(readFileSync(join(HERE, "data/valence.json"), "utf8")), C = V.calibration, T = valTokens(), sp = C.filter((c) => c.kind === "s→p" && ![7, 15, 16].includes(c.Z)), ryd = C.filter((c) => c.kind === "Rydberg");
      return { id: "valence", part: "table", claim: "Valence states: one-electron moves from the ground by both methods; on ours the Rydberg moves hold to a few tenths of an eV, and the s→p promotion of an atom with its p shell under half full is too cheap in both methods",
        value: `${T["val.nCal"]} calibration states; Rydberg medians ${T["val.ryd"]} eV; s→p (${T["val.spEarlyEl"]}) ${T["val.spEarly"]}; 4D 2s→2p of element 4 ${T["val.d4"]}, darbon ${T["val.d7"]} eV`,
        holds: sp.length >= 5 && sp.every((c) => c.ldaError_eV < 0 && c.hfError_eV < 0) && ryd.length >= 10 && ryd.map((c) => Math.abs(c.hfError_eV)).sort((a, b) => a - b)[Math.floor(ryd.length / 2)] < 0.5,
        section: "I.1", gate: [67] }; })(),
    (() => { const V = JSON.parse(readFileSync(join(HERE, "data/valencetest.json"), "utf8")), R = V.reactions, H = V.hessian, T = vtTokens();
      return { id: "valencetest", part: "table", claim: "The valence rule tested on one hydride: darbon's DH₅, with the five bonds the rule counts, is a true minimum (every curvature in four dimensions positive) and lies below both balanced alternatives, DH₄ + H and DH₃ + H₂, each fragment in its lowest spin",
        value: `${H.coordinates} coordinates, ${H.rigidModes.length} rigid, ${H.vibrational.length} curvatures in groups ${T["vt.groups"]}, lowest ${T["vt.low"]} Ha/bohr², none negative, gradient ${H.gradientMax}; DH₅ → DH₄ + H ${R.toXHn1_H.hf}/${R.toXHn1_H.mp2} eV, → DH₃ + H₂ ${R.toXHn2_H2.hf}/${R.toXHn2_H2.mp2} eV (Hartree–Fock/MP2)`,
        holds: R.Z === 7 && R.n === 5 && H.missing === 0 && H.negative === 0 && H.lowest > 0.01 && H.gradientMax < 1e-4 && H.rigidModes.every((x) => Math.abs(x) < 1e-4) && R.toXHn1_H.hf > 0 && R.toXHn1_H.mp2 > 0 && R.toXHn2_H2.hf > 0 && R.toXHn2_H2.mp2 > 0 && R.fragments.every((x) => x.converged),
        section: "I.2", gate: [67] }; })(),
    (() => { const S = HFT.summary, T = hfTokens(), P = S.promotion3.filter((x) => !x.missing);
      return { id: "hfcheck", part: "table", claim: "A second method, numerical Hartree–Fock, on the same candidates: in ours it gets more ground configurations than local exchange, and where the two agree they are right; its 4s→3d promotion errors change sign at half filling, so the two methods don't bracket the measured value. In 4D the two agree on most of the table, and the rest are open",
        value: `ours: Hartree–Fock ${S.ours.hfRight}, local exchange ${S.ours.ldaRight} of ${S.ours.n}; agree ${S.ours.agree}, right ${S.ours.agreeRight}; 4s→3d errors (local exchange/Hartree–Fock) ${T["hf.promList"]}; 4D: agree ${S.fourD.agree} of ${S.fourD.n}, open ${T["hf.4d"]} (d), ${T["hf.4f"]} (f), ${T["hf.4o"]}`,
        holds: S.ours.n === 36 && S.fourD.n === 140 && S.ours.agree === S.ours.agreeRight && S.ours.hfRight >= S.ours.ldaRight && P.length === 9 && P.every((x) => x.ldaError_eV < 0) && P.filter((x) => x.Z <= 24).every((x) => x.hfError_eV < 0) && P.filter((x) => x.Z >= 25).every((x) => x.hfError_eV > 0) && !S.missing.length,
        section: "4.3, E.6", gate: [67, 71] }; })(),
    (() => { const F = HFT.summary.fRow, L = HFT.summary.lanthanides, T = hfTokens();
      return { id: "frow", part: "table", claim: "Our lanthanides calibrate Hartree–Fock on the f row: it makes f too stable in every measured state that changes the f count, by up to B ≈ 4 eV, which the paper takes as a sensitivity scale for 4D, not a bound. Under that scale, over half of row 6's f block has no competitor with fewer f within B, because 4D f electrons are bound far more deeply; the rest sit at the block's two ends. Verdicts whose deciding competitor's term correction is missing or partial are provisional",
        value: `lanthanides: Hartree–Fock ${L.hfRight}, local exchange ${L.ldaRight} of ${L.n}; f too stable in ${F.calibration.filter((c) => c.lean_eV > 0).length} of ${F.calibration.length}, by ${T["hf.fCalMin"]}–${T["hf.fB"]} eV; f out of the ground: 90 ${T["hf.fOut90"]}, 100 ${T["hf.fOut100"]}, 109 ${T["hf.fOut109"]} eV, Tb ${T["hf.fOutTb"]} (measured ${T["hf.fOutTbM"]}); firm ${T["hf.fFirm"]}; open though agreed ${T["hf.fOpenAgree"]}; leaning Hartree–Fock ${T["hf.fLean"]}; untested ${T["hf.fUntested"]}; deciding competitor uncorrected: ${T["hf.fDecidedUncorr"]}`,
        holds: L.n === 18 && L.hfRight > L.ldaRight && F.calibration.length >= 10 && F.calibration.every((c) => c.lean_eV > 0) && F.firm.length > 16 && F.firm.length + F.openAgree.length + F.lean.length + F.open.length + F.untested.length === 32 && F.openAgree.every((x) => x.gap <= F.B_eV),
        section: "4.3, E.6", gate: [67, 71] }; })(),
    (() => { const T = etaTokens(), o5 = ETA.filter((r) => r.eta === 0.5), o15 = ETA.filter((r) => r.eta === 1.5);
      return { id: "etarows", part: "consequence", claim: "The rows need the exponent 1/r: the table solved again under 1/r^0.5 and 1/r^1.5 (every pair of charges alike, elements 1–100) puts its noble gases elsewhere, at hydrogen's shells (2, 12, 40, 100) under η = 0.5 and at 2, 14, 24, 34, 72 under η = 1.5, where only 1/r gives the generalized Madelung rule's",
        value: `noble gases by one rule: η = 0.5 ${T["eta.n05"]}; η = 1 ${T["eta.n1"]}; η = 1.5 ${T["eta.n15"]}; settled ${T["eta.settled05"]} and ${T["eta.settled15"]} of ${T["eta.zmax"]}; 5g below the outermost level in ${T["eta.gIntrude"]} atoms`,
        holds: T["eta.n05"] === "2, 12, 40 and 100" && T["eta.n15"] === "2, 14, 24, 34 and 72" && T["eta.n1"].startsWith("2, 12, 22") && o5.length === 100 && o15.length === 100 && T["eta.gIntrude"] === "0" && +T["eta.settled05"] === 100 && +T["eta.settled15"] >= 80,
        section: "6.5, F.8", gate: [67, 72] }; })(),
    (() => { const ts = [0.1, 0.3, 0.5, 0.7, 0.9], err = Math.max(...ts.map((t) => Math.abs(kClosed(t) / k4(t) - 1)));
      return { id: "kernelclosed", part: "law", claim: "The 4D shell kernel has a closed form, κ(t) = 4[(1 + t²)E(t) − (1 − t²)K(t)]/3πt² in complete elliptic integrals, with κ(1) = 8/(3π) and κ = 1 − t²/8 − t⁴/64 − …",
        value: `closed form against the solver's quadrature at t = 0.1 … 0.9: largest relative difference ${err.toExponential(1)}; at t = 1: ${kClosed(1 - 1e-12).toFixed(6)} against 8/(3π) = ${(8 / (3 * Math.PI)).toFixed(6)}`,
        holds: err < 1e-8 && Math.abs(kClosed(1 - 1e-12) - 8 / (3 * Math.PI)) < 1e-5, section: "A", gate: [67] }; })(),
    ...(() => { const I = IONS, o3 = I.filter((r) => r.D === 3), i4 = I.filter((r) => r.D === 4), pblock = [5, 6, 8, 9, 13, 14, 16, 17, 31, 32, 34, 35], unb = o3.filter((r) => r.ea_measured_eV === "unbound"), meas = o3.filter((r) => typeof r.ea_measured_eV === "number");
      const camp = o3.filter((r) => r.ion_full_eV != null).map((r) => Math.abs(r.ion_full_eV - r.ion_main_eV)), re4 = [...TERM.values()].filter((r) => r.cation), hal = [11, 21, 49, 77, 137].map((z) => i4.find((r) => r.Z === z)), ourHal = [9, 17, 35].map((z) => o3.find((r) => r.Z === z));
      return [
        { id: "ions3", part: "table", claim: "In ours, searching each ion for its own ground state changes no ionization; the anion search gets every unbound anion unbound and every p-block acceptor bound, and fails only where correlation does the binding (H⁻, the alkalis, P and As)",
          value: `cations: largest change ${Math.max(...camp).toFixed(3)} eV over ${camp.length}; anions: ${unb.filter((r) => r.ea_eV < 0).length} of ${unb.length} unbound right; p-block ${pblock.map((z) => { const r = o3.find((x) => x.Z === z); return `${r.symbol} ${r.ea_eV.toFixed(2)}/${r.ea_measured_eV}`; }).join(", ")}; failing ${["H", "Li", "Na", "K", "P", "As"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)}/${r.ea_measured_eV}`; }).join(", ")}`,
          holds: Math.max(...camp) < 0.02 && unb.every((r) => r.ea_eV < 0) && pblock.every((z) => o3.find((x) => x.Z === z).ea_eV > 0), section: "E.4", gate: [67] },
        { id: "ions4", part: "table", claim: "In 4D, seven ions rearrange when searched for their own ground states, lowering those ionizations by up to 1.3 eV; element 128's is unchanged",
          value: `${re4.map((r) => `${r.Z} ${r.ion_byRemoval_eV.toFixed(2)}→${r.ion_eV.toFixed(2)}`).join(", ")}; 128: ${i4.find((r) => r.Z === 128).ion_full_eV.toFixed(2)} against ${i4.find((r) => r.Z === 128).ion_main_eV.toFixed(2)}`,
          holds: re4.length === 7 && Math.abs(i4.find((r) => r.Z === 128).ion_full_eV - i4.find((r) => r.Z === 128).ion_main_eV) < 0.01 && re4.every((r) => r.ion_byRemoval_eV - r.ion_eV < 1.5), section: "4.2", gate: [67] },
        { id: "halogens4", part: "consequence", claim: "One electron short of a full 4D p shell, atoms hold an extra electron harder and harder down the group, where ours hold it about equally: partial screening again",
          value: `p⁷ electron affinities (eV): ${hal.map((r) => `${r.Z}: ${r.ea_eV.toFixed(2)}`).join(", ")}; ours (2p⁵, 3p⁵, 4p⁵): ${ourHal.map((r) => `${r.symbol} ${r.ea_eV.toFixed(2)} (measured ${r.ea_measured_eV})`).join(", ")}`,
          holds: hal.every((r, i) => i === 0 || r.ea_eV > hal[i - 1].ea_eV) && hal.at(-1).ea_eV > 3 * hal[0].ea_eV && Math.max(...ourHal.map((r) => r.ea_measured_eV)) - Math.min(...ourHal.map((r) => r.ea_measured_eV)) < 0.3, section: "6.4", gate: [67] },
      ]; })(),
    { id: "screening", part: "consequence", claim: "Without a shell theorem outer electrons are held much harder than shell-theorem screening allows",
      value: ratios.map((r) => `${r.Z}: ${r.ratio}×`).join(", "), holds: ratios.filter((r) => r.Z > 2).every((r) => r.ratio > 1.5), section: "6.3", gate: [8] },
    { id: "farpull", part: "consequence", claim: "A neutral atom pulls on a distant electron as −Σ⟨r²⟩/(8s³)",
      value: `the full cloud over the far form at 30 bohr: ${far.map((f) => `${f.Z}: ${f.ratio30}`).join(", ")}`, holds: far.every((f) => Math.abs(f.ratio30 - 1) < 0.01), section: "7", gate: [8, 67] },
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
/* a configuration abbreviated for a table: every open subshell kept (so element 82's 4f¹ isn't hidden), and the outermost
   shell's subshells, full or not; superscript counts */
const CAPL = { 4: { s: 2, p: 8, d: 18, f: 32 }, 3: { s: 2, p: 6, d: 10, f: 14 } };
export function abbrConfig(c, d = 4) {
  const ts = c.split(" ").map((t) => { const m = t.match(/^(\d+)([spdf])(\d+)$/); return { n: +m[1], l: m[2], q: +m[3] }; }), top = Math.max(...ts.map((x) => x.n));
  return ts.filter((x) => x.q < CAPL[d][x.l] || x.n === top).map((x) => `${x.n}${x.l}${supN(x.q)}`).join(" ");
}
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
    ...hfTokens(),
    ...respTokens(),
    ...ligandTokens(),
    ...sepTokens(),
    ...valTokens(),
    ...vtTokens(),
    ...etaTokens(),
    ...(() => { const R = JSON.parse(readFileSync(join(HERE, "data/he4check.json"), "utf8")).rows, g = R.map((r) => r.gap); return { "he4.gap": `${Math.min(...g).toFixed(3)}–${Math.max(...g).toFixed(3)}` }; })(),
    ...(() => { const P = JSON.parse(readFileSync(join(HERE, "data/promotion3.json"), "utf8")), ok = P.promotion.filter((x) => !x.missing), sgn = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
      const dc = (cfg) => [...cfg.matchAll(/\d[df](\d+)/g)].reduce((t, m) => t + +m[1], 0), sup = (c) => c.split(" ").slice(-2).map((t) => t.replace(/(\d[spdf])(\d+)/, (_, a, n) => a + supN(n))).join(" ");
      const sens = [...TERM.values()].map((r) => { const comp = (r.within1eV || []).filter((c) => c.dEc_eV > 0 && dc(c.config) < dc(r.config)).sort((x, y) => x.dEc_eV - y.dEc_eV)[0]; return comp ? { Z: r.Z, g: r.config, c: comp.config, e: comp.dEc_eV } : null; }).filter(Boolean);
      return { "prom.list": ok.map((x) => `${x.symbol} ${sgn(x.solver_eV)} against ${sgn(x.measured_eV)}`).join(", "), "prom.bias": Math.abs(P.solverMeanError_eV).toFixed(2), "prom.fullbias": Math.abs(P.fullMeanError_eV).toFixed(2),
        "prom.bake": `${P.configs.bake} of ${P.configs.elements}`, "prom.full": `${P.configs.fullCorrection} of ${P.configs.elements}`, "prom.min": Math.min(...ok.map((x) => Math.abs(x.solverError_eV))).toFixed(2), "prom.max": Math.max(...ok.map((x) => Math.abs(x.solverError_eV))).toFixed(2),
        "prom.levelShift": Math.max(...ok.map((x) => Math.abs(x.measuredLowest_eV - x.measured_eV))).toFixed(2), "prom.ni": sgn(P.promotion.find((x) => x.Z === 28).measured_eV).replace(/^(?!−)/, "+"), "prom.niLow": sgn(P.promotion.find((x) => x.Z === 28).measuredLowest_eV).replace(/^(?!−)/, "+"),
        "tt.sensN": String(sens.length), "tt.sens": sens.map((x) => `${x.Z} (${sup(x.c)}, ${x.e.toFixed(2)} eV up)`).join(", ") }; })(),
    ...(() => { const I = IONS, o3 = I.filter((r) => r.D === 3), i4 = I.filter((r) => r.D === 4), f = (z, D = 4) => I.find((r) => r.D === D && r.Z === z), re4 = [...TERM.values()].filter((r) => r.cation);
      return { "ea.hal4": [11, 21, 49, 77, 137].map((z) => `${f(z).ea_eV.toFixed(1)}`).join(", "), "ea.halOurs": [9, 17, 35].map((z) => `${f(z, 3).symbol} ${f(z, 3).ea_measured_eV}`).join(", "),
        "ea.nob4": [50, 78, 138].map((z) => `${z}: ${f(z).ea_eV.toFixed(2)}`).join(", "), "ea.nobUn": [2, 12, 22].map((z) => `${Math.abs(f(z).ea_eV).toFixed(0)}`).join(", "),
        "ea.bound4": String(i4.filter((r) => r.ea_eV != null && r.ea_eV > 0.7).length), "ea.max4": (() => { const m = [...i4].filter((r) => r.ea_eV != null).sort((a, b) => b.ea_eV - a.ea_eV)[0]; return `${m.ea_eV.toFixed(1)} eV (element ${m.Z})`; })(),
        "ea.pOurs": ["C", "Si", "Ge", "Al", "F", "Cl", "O"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)} against ${r.ea_measured_eV}`; }).join(", "),
        "ea.fail": ["H", "Li", "Na", "P"].map((sy) => { const r = o3.find((x) => x.symbol === sy); return `${sy} ${r.ea_eV.toFixed(2)} against ${r.ea_measured_eV}`; }).join(", "),
        "ion.re4": re4.map((r) => `${r.Z} (${r.ion_byRemoval_eV.toFixed(2)} → ${r.ion_eV.toFixed(2)})`).join(", ") }; })(),
    ...(() => { const L = ionLadder(), SY = (z) => SYM[z - 1], zs = [...new Set(L.dFirst.map((x) => x.Z))], row = (lo, hi) => zs.filter((z) => z >= lo && z <= hi);
      const ranges = (a) => { const out = []; for (const z of a) { const last = out.at(-1); if (last && z === last[1] + 1) last[1] = z; else out.push([z, z]); } return out.map(([x, y]) => (x === y ? `${x}` : `${x}–${y}`)).join(", "); };
      return { "ion23.m1": `${L.med(L.c1).toFixed(1)} %`, "ion23.m2": `${L.med(L.c2).toFixed(1)} %`, "ion23.m3": `${L.med(L.c3).toFixed(1)} %`, "ion23.n2": String(L.c2.length), "ion23.n3": String(L.c3.length),
        "ion23.w2": `${SY(L.worst(L.c2).Z)}, ${Math.abs(L.worst(L.c2).pct).toFixed(0)} %`, "ion23.w3": `${SY(L.worst(L.c3).Z)}, ${Math.abs(L.worst(L.c3).pct).toFixed(0)} %`,
        "ion23.nd": String(L.dFirst.length), "ion23.dZ": ranges(zs), "ion23.d3": String(row(23, 42).length) }; })(),
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
  const sup = (c, d = 4) => abbrConfig(c, d);
  return {
    ...(() => { const dv = madelungDiff(t4, 4), sd = dv.filter((x) => /s$/.test(x.moves.find(([, v]) => v < 0)[0])), other = dv.filter((x) => !sd.includes(x));
      const ours = madelungDiff(t3.filter((r) => r.Z <= 36), 3), real = madelungDiff(t3.filter((r) => r.Z <= 36), 3, (r) => r.config_measured), SY = (z) => SYM[z - 1];
      return { "nk.match": String(t4.length - dv.length), "nk.n": String(dv.length), "nk.sd": String(sd.length), "nk.sd2": String(sd.filter((x) => x.moves.some(([, v]) => v === 2)).length),
        "nk.otherN": String(other.length), "nk.other": other.map((x) => `${x.Z} (${moveText(x.moves)})`).join(", ").replace(/, ([^,]*)$/, " and $1"), "nk.ours": String(ours.length), "nk.oursList": ours.map((x) => SY(x.Z)).join(", "),
        "nk.real": String(real.length), "nk.realList": real.map((x) => SY(x.Z)).join(" and ") }; })(),
    "table.rows": rws.join(", "), "table.newN": String(t4.filter((r) => r.counterpart === null).length), "nk.rows": madelungRows(4, 140).join(", "), "table.nobles": nob.join(", "), "table.lastRow": String(periods.at(-1).length),
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
    "fields.delta": String(FIELDS.scalingDim(a3, 4)), "fields.floor": String(FIELDS.unitarityFloor(4)), "fields.fdim": String(FIELDS.fieldStrengthDim(a3, 4)), "fields.ffloor": String(FIELDS.fieldStrengthFloor(4)), "fields.m": String(FIELDS.nonlinearExponent(4)),
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
/* each figure goes in after the paragraph that first cites it ("figure 2a", "figures 1 and 4", "Figure A1"); an
   appendix figure (A…) after its first citation in the appendices, if the text has them. A figure nothing cites is
   left out of a section page and put before the supplement in the whole draft */
const FIG_REF = /\b[Ff]igures?\s+((?:[A-Z]?\d+[a-z]?)(?:(?:,\s*|,?\s+and\s+)[A-Z]?\d+[a-z]?)*)/g;
const figKeys = (block) => [...block.replace(/\s+/g, " ").matchAll(FIG_REF)].flatMap((m) => m[1].split(/,\s*|,?\s+and\s+/)).map((k) => k.replace(/^(\d+)[a-z]$/, "$1"));
function placeFigures(md, { orphansBefore = null, only = null, allAppendix = false } = {}) {
  const caps = only ? Object.fromEntries(Object.entries(CAPTIONS).filter(([k]) => only(k))) : CAPTIONS; // from make.mjs itself: figures/captions.json is this build's output, not its input
  const fig = (k) => `![**Figure ${k}.** ${caps[k].replace(/\^η/g, "^η^")}](../figures/${k}.svg){#fig-${k}}`;
  const blocks = md.split(/\n{2,}/), app = blocks.findIndex((b) => /^# Appendices/.test(b)), at = new Map();
  blocks.forEach((b, i) => { if (/^(#|\||!\[)/.test(b)) return; for (const k of figKeys(b)) {
    if (!(k in caps)) continue;
    if (!at.has(k) || (k.startsWith("A") && !allAppendix && app >= 0 && at.get(k) < app && i > app)) at.set(k, i); } });
  const after = new Map(); for (const [k, i] of at) after.set(i, [...(after.get(i) || []), k]);
  const out = blocks.flatMap((b, i) => [b, ...(after.get(i) || []).map(fig)]);
  const orphans = Object.keys(caps).filter((k) => !at.has(k));
  if (orphansBefore && orphans.length) { const j = out.findIndex((b) => b.startsWith(orphansBefore)); out.splice(j < 0 ? out.length : j, 0, ...orphans.map(fig)); }
  return out.join("\n\n");
}
function drafts(t3, t4, L) {
  const dir = join(HERE, "text"), out = new Map(), plain = new Map(), nums = numbers(t3, t4, L);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const raw = readFileSync(join(dir, f), "utf8"), known = new Set(JSON.parse(readFileSync(join(HERE, "refs.json"), "utf8")).refs.map((r) => r.key));
    for (const k of citedKeys(raw)) if (!known.has(k)) throw new Error(`text/${f}: cites @${k}, which isn't in refs.json`);
    const body = raw.replace(/<!--[\s\S]*?-->\n?/g, "").replace(/\{\{([a-z0-9.]+)\}\}/gi, (_, k) => { if (!(k in nums)) throw new Error(`text/${f}: unknown token {{${k}}}`); return nums[k]; });
    plain.set(`draft/${f}`, body);
    out.set(`draft/${f}`, `<!-- Generated by papers/p1/build.mjs from text/${f}; edit the source. -->\n${placeFigures(body.trimEnd())}\n`);
  }
  if (out.size) { out.set("draft/paper.md", assemble(plain, L)); out.set("draft/supplement.md", assembleSupplement(plain)); }
  return out;
}
/* The paper in two pages: draft/paper.md (the abstract to the conclusion, figures 1–6) and draft/supplement.md (the
   notation and appendices A–K, figures A1–A2, tables 1 and 2), each with its own references. Every section, appendix
   subsection, figure and table gets an anchor, and every "section 2.4", "appendix F.8", "figure 1c" or "table 2" in either
   page links to it, across pages where it lives on the other one; bare mentions of the site, the orbital viewer and the
   repository become links too. */
const SUPP = "supplement.html", MAIN = "paper.html";
function anchorHeads(md, where) {
  return md.split("\n").map((l) => {
    let m = l.match(/^## (\d+) · (.*)$/); if (m) return `## ${m[1]} · ${m[2]} {#sec-${m[1]}}`;
    m = l.match(/^## ([A-K]) · (.*)$/); if (m) return `## ${m[1]} · ${m[2]} {#app-${m[1].toLowerCase()}}`;
    if (/^## Notation$/.test(l)) return "## Notation {#notation}";
    m = l.match(/^\*\*(\d+)\.(\d+) /); if (m) return `[]{#sec-${m[1]}-${m[2]}}${l}`;
    m = l.match(/^\*\*([A-K])\.(\d+) /); if (m) return `[]{#app-${m[1].toLowerCase()}-${m[2]}}${l}`;
    m = l.match(/^Table: \*\*Table (\d+)\.\*\*/); if (m) return l.replace("Table: ", `Table: []{#tab-${m[1]}}`);
    return l; }).join("\n");
}
export function linkRefs(md, where) {
  const keep = [], hold = (t) => `\u0000${keep.push(t) - 1}\u0000`;
  // what must not be touched: code, maths, citations, link targets, attributes, comments
  let t = md.replace(/`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\[@[^\]]*\]|\]\([^)]*\)|\{#[^}]*\}|<!--[\s\S]*?-->|^Table: .*$|\*\*Figure A?\d+\.\*\*/gm, hold);
  const on = (page) => (page === where ? "" : page === "main" ? MAIN : SUPP);
  const list = (items, f) => items.replace(/[A-K](?:\.\d+)?|\d+(?:\.\d+)?[a-z]?|A\d/g, f);
  t = t.replace(/\b([Aa]ppendix|[Aa]ppendices)(\s+)([A-K](?:\.\d+)?(?:(?:,\s*|,?\s+and\s+)[A-K](?:\.\d+)?)*)\b/g, (_, w, sp, items) =>
    `${w}${sp}${items.replace(/[A-K](?:\.\d+)?/g, (x) => `[${x}](${on("supp")}#app-${x.toLowerCase().replace(".", "-")})`)}`);
  t = t.replace(/(\b[Ss]ections?\s+|§)(\d+(?:\.\d+)?(?:(?:,\s*|,?\s+and\s+)\d+(?:\.\d+)?)*)/g, (_, w, items) =>
    `${w}${items.replace(/\d+(?:\.\d+)?/g, (x) => `[${x}](${on("main")}#sec-${x.replace(".", "-")})`)}`);
  t = t.replace(/\b([Ff]igures?)(\s+)((?:A?\d+[a-z]?)(?:(?:,\s*|,?\s+and\s+)A?\d+[a-z]?)*)/g, (_, w, sp, items) =>
    `${w}${sp}${items.replace(/A?\d+[a-z]?/g, (x) => { const k = x.replace(/^(\d+)[a-z]$/, "$1"); return `[${x}](${on(k.startsWith("A") ? "supp" : "main")}#fig-${k})`; })}`);
  t = t.replace(/\b([Tt]ables?)(\s+)(\d+(?:(?:,\s*|,?\s+and\s+)\d+)*)\b/g, (_, w, sp, items) => `${w}${sp}${items.replace(/\d+/g, (x) => `[${x}](${on("supp")}#tab-${x})`)}`);
  // bare mentions of our sites and the repository
  t = t.replace(/(?<![\[(\/\w.])((?:four|kata)\.mino\.mobi(?:\/[^\s)\]>,;"\u0000]*[^\s)\]>,;".\u0000])?|tangled\.org\/[^\s)\]>,;"\u0000]*[^\s)\]>,;".\u0000])/g, (u) => `[${u}](https://${u.replace(/^four\.mino\.mobi\/table\/?#Z$/, "four.mino.mobi/table/")})`);
  return t.replace(/\u0000(\d+)\u0000/g, (_, k) => keep[+k]);
}
function assemble(parts, L) {
  const get = (f) => (parts.get(`draft/${f}`) || "").replace(/<!--[\s\S]*?-->\n?/g, "").trim(), strip = (t) => t.replace(/^# .*\n+/, ""), undraft = (t) => t.replace(/ \(draft\)/g, "");
  const methods = strip(get("methods.md")); // carries its own "## 3 · Methods"
  const table = get("table.md").replace(/^# .*\n+/, "");
  const main = anchorHeads(`<!-- Generated by papers/p1/build.mjs from text/*.md: the paper, abstract to conclusion. The appendices are draft/supplement.md. -->
# Paper 1 · the whole draft

*The title and the authors' credit are left to the end. This is the current state of everything else, regenerated
from the code and its data on every change; the making is public at four.mino.mobi/papers. The appendices are on a
page of their own, the [supplement](${SUPP}), and every reference to them links there.*

${undraft(strip(get("abstract.md")))}

${undraft(strip(get("intro.md")))}

${undraft(get("law.md"))}

# Part II · The table

${methods}

${undraft(table)}

${undraft(get("consequences.md"))}

## Supplementary material

The [supplement](${SUPP}) holds the [notation](${SUPP}#notation) and [appendices A–K](${SUPP}#app-a): the arguments and
methods in full, every check against our own world, the starting data for chemistry, the atoms' response, and how to
reproduce every number. Supplement S1 is the table with every open subshell given Hund spins
([\`data/table4-hundspin.csv\`](../data/table4-hundspin.csv)). The ${L.claims.length} claims this text rests on, each
recomputed from the data behind it, are in [\`ledger.json\`](../ledger.json) and on the paper's
[process page](../../); the solvers, MIT-licensed, are at tangled.org/morphyxmino.bsky.social/four-atom, the
interactive table at four.mino.mobi/table, and figure 5's hydrogen twin at kata.mino.mobi/orbital.

## References

::: {#refs}
:::
`, "main");
  return linkRefs(placeFigures(main, { only: (k) => !k.startsWith("A"), orphansBefore: "## Supplementary material" }), "main");
}
function assembleSupplement(parts) {
  const get = (f) => (parts.get(`draft/${f}`) || "").replace(/<!--[\s\S]*?-->\n?/g, "").trim(), strip = (t) => t.replace(/^# .*\n+/, ""), undraft = (t) => t.replace(/ \(draft\)/g, "");
  const supp = anchorHeads(`<!-- Generated by papers/p1/build.mjs from text/notation.md and text/appendix.md: paper 1's supplement. -->
# Paper 1 · supplement

*The notation and appendices of paper 1, on a page of their own. References to the main text link back to the
[paper](${MAIN}).*

${undraft(strip(get("notation.md")))}

${strip(undraft(get("appendix.md")))}

## References

::: {#refs}
:::
`, "supp");
  return linkRefs(placeFigures(supp, { only: (k) => k.startsWith("A"), allAppendix: true }), "supp");
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
