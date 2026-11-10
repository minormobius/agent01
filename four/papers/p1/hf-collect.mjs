/* Paper 1's second table: data/hftable.json, from the JSON lines `atom/tools/hftable.mjs rank` prints (runner run
   hf-table-1). Each element of both worlds: the local exchange's ground configuration (Hund-corrected, as the main
   table) and Hartree–Fock's (fully term-corrected), whether they agree, Hartree–Fock's margin to its runner-up, and a
   flag where Hartree–Fock's best sits high in the local exchange's ranking (more than 3 eV of the 4 eV window), where a
   candidate the window left out could have beaten it. Ours carries the measured ground configuration for the check.
   A gapped configuration (an occupied subshell with an empty one of the same l below it: Na 1s2 2s2 2p6 4s1) is left out
   of Hartree–Fock's ranking. js/hf.js projects out only the occupied lower subshells, so its 4s falls to the empty 3s and
   the solve returns the compact configuration's energy under the other name; a single determinant has no excited state
   to give. The local exchange ranks them as solved (atom.js takes the right root), and they never win there.
   Ours past 36 is the lanthanide calibration (runner run hf-lanth-1, Cs–Hf), measured from data/nist-lanthanides.json.
   The 3d promotion energies (one 4s electron into 3d) by both methods against NIST's lowest-term centroids
   (data/nist-promotions.json) go in the summary: the two methods' errors, which are not a bracket.
     node four/papers/p1/hf-collect.mjs hf-table-1.jsonl hf-lanth-1.jsonl wide.jsonl hf-climb-1.jsonl     → data/hftable.json */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { realConfig, SYM } from "../../atom/js/periodic.js";

const HERE = dirname(fileURLToPath(import.meta.url)), rows = new Map();
const FAR = []; // hftable.mjs farcorr lines: the term corrections `rank` skipped for candidates more than 6 eV up
for (const f of process.argv.slice(2)) for (const l of readFileSync(f, "utf8").split("\n")) { if (!l.startsWith("{")) continue; const r = JSON.parse(l); if (r.Z == null) continue; if ("corr_eV" in r || (r.config && !r.rows)) FAR.push(r); else rows.set(`${r.D}:${r.Z}`, r); }
/* fold them in: a far candidate's stored energy is its raw one (relative to the run's corrected best), so its correction
   adds to it; each row keeps its provenance (term: "corrected after" / "partial" where a spin block was too big to finish,
   so the true correction could be more negative still / "uncorrected" where farcorr didn't settle or hasn't run) */
for (const r of rows.values()) for (const x of r.rows ?? []) { if (!x.far) continue; const c = FAR.find((y) => y.D === r.D && y.Z === r.Z && y.config === x.config);
  if (c && c.converged !== false && x.hf_eV != null) { x.hf_eV = +(x.hf_eV + c.corr_eV).toFixed(4); x.farCorr_eV = c.corr_eV; x.term = c.partial ? "partial" : "corrected after"; x.farParts = c.parts; }
  else x.term = "uncorrected"; }
const set = (c) => (c ? c.split(" ").sort().join(" ") : null), out = [];
const LAN = new Map(JSON.parse(readFileSync(join(HERE, "data/nist-lanthanides.json"), "utf8")).rows.map((r) => [r.Z, r.config]));
const measured = (Z) => (Z <= 36 ? realConfig(Z) : LAN.get(Z));
const gapped = (c) => { const by = {}; for (const t of c.split(" ")) { const m = t.match(/^(\d+)([a-z])\d+$/); (by[m[2]] ??= new Set()).add(+m[1]); }
  return Object.entries(by).some(([l, ns]) => { const l0 = "spdfgh".indexOf(l) + 1; for (let n = l0; n < Math.max(...ns); n++) if (!ns.has(n)) return true; return false; }); };
const ZS = { 3: [...Array(36).keys()].map((i) => i + 1).concat([...LAN.keys()].filter((Z) => rows.has(`3:${Z}`))), 4: [...Array(140).keys()].map((i) => i + 1) };
for (const D of [3, 4]) for (const Z of ZS[D]) {
  const r = rows.get(`${D}:${Z}`); if (!r) { out.push({ D, Z, missing: true }); continue; }
  if (r.unsettled || !r.hf) { out.push({ D, Z, unsettled: true }); continue; }
  const rk = r.rows.filter((x) => x.hf_eV != null && !gapped(x.config)).sort((a, b) => a.hf_eV - b.hf_eV);
  if (!rk.length) { out.push({ D, Z, unsettled: true }); continue; }
  const hfRow = rk[0], z0 = hfRow.hf_eV, rs = r.rows.map((x) => ({ ...x, gapped: gapped(x.config) || undefined, hf_eV: x.hf_eV == null || gapped(x.config) ? null : +(x.hf_eV - z0).toFixed(4) }));
  const row = { D, Z, lda: r.lda.config, hf: hfRow.config, agree: r.lda.config === hfRow.config, hfMargin_eV: rk[1] ? +(rk[1].hf_eV - z0).toFixed(4) : null, hfSecond: rk[1]?.config ?? null,
    hfLdaRank_eV: hfRow.lda_eV, nearWindowEdge: hfRow.lda_eV > 3, candidates: r.candidates, solved: r.solved, unconverged: r.unconverged, gappedDropped: rs.filter((x) => x.gapped).length,
    hfParts: hfRow.config === r.hf.config ? r.hf.parts : hfRow.farParts ?? null, rows: rs };
  if (D === 3) { const m = measured(Z); row.measured = m; row.ldaRight = set(m) === set(r.lda.config); row.hfRight = set(m) === set(row.hf); }
  out.push(row);
}
const o3 = out.filter((r) => r.D === 3 && r.Z <= 36 && !r.missing && !r.unsettled), oL = out.filter((r) => r.D === 3 && r.Z > 36 && !r.missing && !r.unsettled), o4 = out.filter((r) => r.D === 4 && !r.missing && !r.unsettled);
const summary = {
  ours: { n: o3.length, ldaRight: o3.filter((r) => r.ldaRight).length, hfRight: o3.filter((r) => r.hfRight).length, agree: o3.filter((r) => r.agree).length, agreeRight: o3.filter((r) => r.agree && r.hfRight).length, differ: o3.filter((r) => !r.agree).map((r) => ({ Z: r.Z, measured: r.measured, lda: r.lda, hf: r.hf, hfRight: r.hfRight, ldaRight: r.ldaRight })) },
  fourD: { n: o4.length, agree: o4.filter((r) => r.agree).length, differ: o4.filter((r) => !r.agree).map((r) => r.Z), nearEdge: o4.filter((r) => r.nearWindowEdge).map((r) => r.Z), unconverged: o4.filter((r) => r.unconverged).map((r) => r.Z) },
  lanthanides: oL.length ? { n: oL.length, ldaRight: oL.filter((r) => r.ldaRight).length, hfRight: oL.filter((r) => r.hfRight).length, agree: oL.filter((r) => r.agree).length, agreeRight: oL.filter((r) => r.agree && r.hfRight).length, differ: oL.filter((r) => !r.agree).map((r) => ({ Z: r.Z, measured: r.measured, lda: r.lda, hf: r.hf, hfRight: r.hfRight, ldaRight: r.ldaRight })) } : null,
  promotion3: promotions(),
  missing: out.filter((r) => r.missing).map((r) => `${r.D}:${r.Z}`), unsettled: out.filter((r) => r.unsettled).map((r) => `${r.D}:${r.Z}`),
};
/* E(3d^(n+1) 4s) − E(3d^n 4s²) by each method (both Hund- or term-corrected, as ranked) against measured */
function promotions() {
  const NP = JSON.parse(readFileSync(join(HERE, "data/nist-promotions.json"), "utf8")).records, core = "1s2 2s2 2p6 3s2 3p6";
  return NP.map((m) => { const Z = SYM.indexOf(m.element) + 1, n = Z - 20, r = out.find((x) => x.D === 3 && x.Z === Z); if (!r?.rows) return { Z, symbol: m.element, missing: true };
    const a = r.rows.find((x) => x.config === `${core} 3d${n} 4s2`), b = r.rows.find((x) => x.config === `${core} 3d${n + 1} 4s1`); if (!a || !b || a.hf_eV == null || b.hf_eV == null) return { Z, symbol: m.element, missing: true };
    const meas = m.delta_lowest_term_centroid_eV, lda = b.lda_eV - a.lda_eV, hf = b.hf_eV - a.hf_eV;
    return { Z, symbol: m.element, measured_eV: +meas.toFixed(4), measuredLowest_eV: +m.delta_lowest_eV.toFixed(4), lda_eV: +lda.toFixed(4), hf_eV: +hf.toFixed(4), ldaError_eV: +(lda - meas).toFixed(4), hfError_eV: +(hf - meas).toFixed(4) }; });
}
/* the f row (4D 81–112). Our lanthanides calibrate Hartree–Fock's lean: against NIST's levels it makes f too stable
   against d by B at most (each state that changes the f count: an extra f electron comes out too low, one fewer too
   high). So a configuration with fewer f electrons than Hartree–Fock's ground could truly lie below it if Hartree–Fock
   puts it less than B up, while one with more f only moves further up. Hence: agreed and every fewer-f competitor more
   than B up (or none possible, no f in the ground): firm; agreed but one within B: open; local exchange's choice holds
   more f than Hartree–Fock's: leaning Hartree–Fock (local exchange overprices d by more still); agreed with no fewer-f
   competitor solved (cut, or a full f shell the climb didn't empty): untested. */
const fN = (c) => c.split(" ").reduce((t, x) => { const m = x.match(/^\d+f(\d+)$/); return t + (m ? +m[1] : 0); }, 0);
const LANL = new Map(JSON.parse(readFileSync(join(HERE, "data/nist-lanthanides.json"), "utf8")).rows.map((r) => [r.Z, new Map(r.levels.map((x) => [set(x.config), x.eV]))]));
const fBias = oL.flatMap((r) => { const lev = LANL.get(r.Z), g = r.rows.find((x) => set(x.config) === set(r.measured)); if (!lev || !g || g.hf_eV == null) return [];
  return r.rows.filter((x) => x.hf_eV != null && lev.has(set(x.config)) && set(x.config) !== set(r.measured) && fN(x.config) !== fN(r.measured))
    .map((x) => { const err = x.hf_eV - g.hf_eV - lev.get(set(x.config)); return { Z: r.Z, config: x.config, df: fN(x.config) - fN(r.measured), error_eV: +err.toFixed(3), lean_eV: +(fN(x.config) < fN(r.measured) ? err : -err).toFixed(3) }; }); });
const B = fBias.length ? Math.max(...fBias.map((x) => x.lean_eV)) : null;
const fRow = o4.filter((r) => r.Z >= 81 && r.Z <= 112).map((r) => { const fh = fN(r.hf), fewer = r.rows.filter((x) => x.hf_eV != null && !x.gapped && fN(x.config) < fh), gap = fewer.length ? Math.min(...fewer.map((x) => x.hf_eV)) : null;
  const nearRow = gap != null ? fewer.find((x) => x.hf_eV === gap) : null, near = nearRow?.config ?? null, nearTerm = nearRow?.term ?? (nearRow ? "full" : null);
  const verdict = !r.agree ? (fN(r.lda) > fh ? "lean" : "open") : fh === 0 || (gap != null && gap > B) ? "firm" : gap != null ? "openAgree" : "untested";
  return { Z: r.Z, verdict, fewerGap_eV: gap, fewerConfig: near, fewerTerm: nearTerm, groundPartial: (r.hfParts ?? []).some((p) => p.complete === false) }; });
summary.fRow = { B_eV: B, calibration: fBias, firm: fRow.filter((x) => x.verdict === "firm").map((x) => x.Z), openAgree: fRow.filter((x) => x.verdict === "openAgree").map((x) => ({ Z: x.Z, gap: x.fewerGap_eV })),
  lean: fRow.filter((x) => x.verdict === "lean").map((x) => x.Z), open: fRow.filter((x) => x.verdict === "open").map((x) => x.Z), untested: fRow.filter((x) => x.verdict === "untested").map((x) => x.Z),
  /* provenance of what decides each verdict: the nearest fewer-f competitor's term correction (full, corrected after,
     partial, uncorrected) and whether the ground's own correction finished every spin block */
  decidedBy: Object.fromEntries(["full", "corrected after", "partial", "uncorrected"].map((t) => [t, fRow.filter((x) => x.fewerTerm === t).map((x) => x.Z)])), groundPartial: fRow.filter((x) => x.groundPartial).map((x) => x.Z),
  farCandidates: { all: out.flatMap((r) => r.rows ?? []).filter((x) => x.far).length, corrected: out.flatMap((r) => r.rows ?? []).filter((x) => x.term === "corrected after").length, partial: out.flatMap((r) => r.rows ?? []).filter((x) => x.term === "partial").length, uncorrected: out.flatMap((r) => r.rows ?? []).filter((x) => x.term === "uncorrected").length } };
writeFileSync(join(HERE, "data/hftable.json"), JSON.stringify({ about: "Generated by papers/p1/hf-collect.mjs from atom/tools/hftable.mjs rank (runner runs hf-table-1, hf-lanth-1, hf-wide-1, hf-climb-1; later runs override earlier ones element by element); do not edit. lda: the local-exchange ground configuration (Hund-corrected); hf: Hartree–Fock's (js/hf.js, max-spin average plus the full term correction) over the local-exchange search's settled candidates within its window and, where climbed, Hartree–Fock's own one-electron neighbourhood. summary.fRow: the f row's verdicts against the lanthanide calibration B.", summary, rows: out }, null, 1) + "\n");
/* the big table's detail panel (table/viewer.js): each 4D element's verdict, compact: [1] firm; [0, Hartree–Fock's
   configuration, how far above it Hartree–Fock puts the table's] open; [2, the fewer-f competitor, its gap] open though
   the methods agree; [3, Hartree–Fock's configuration, gap] leaning Hartree–Fock; [4] untested */
const FV = new Map(fRow.map((x) => [x.Z, x]));
const V = Object.fromEntries(o4.map((r) => { const f = FV.get(r.Z), g = r.rows.find((x) => x.config === r.lda)?.hf_eV ?? null;
  if (!f) return [r.Z, r.agree ? [1] : [0, r.hf, g]];
  return [r.Z, f.verdict === "firm" ? [1] : f.verdict === "openAgree" ? [2, f.fewerConfig, f.fewerGap_eV] : f.verdict === "lean" ? [3, r.hf, g] : f.verdict === "untested" ? [4] : [0, r.hf, g]]; }));
writeFileSync(join(HERE, "../../table/hfverdict.js"), `/* GENERATED by four/papers/p1/hf-collect.mjs from data/hftable.json; do not edit. Each 4D element: [1] firm (the methods agree; in the f row also no
   fewer-f competitor within the lanthanide calibration B); [0, Hartree–Fock's configuration, how far above it Hartree–Fock puts
   the table's (eV)] open; [2, the fewer-f competitor, its gap (eV)] open though the methods agree; [3, Hartree–Fock's
   configuration, gap] open, leaning Hartree–Fock; [4] untested (no fewer-f configuration solved). */
export const HF = ${JSON.stringify(V)};
`);
console.log(JSON.stringify(summary, null, 1));
