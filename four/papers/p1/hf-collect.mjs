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
     node four/papers/p1/hf-collect.mjs hf-table-1.jsonl [hf-lanth-1.jsonl]     → data/hftable.json */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { realConfig, SYM } from "../../atom/js/periodic.js";

const HERE = dirname(fileURLToPath(import.meta.url)), rows = new Map();
for (const f of process.argv.slice(2)) for (const l of readFileSync(f, "utf8").split("\n")) { if (!l.startsWith("{")) continue; const r = JSON.parse(l); if (r.Z != null) rows.set(`${r.D}:${r.Z}`, r); }
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
    hfParts: hfRow.config === r.hf.config ? r.hf.parts : null, rows: rs };
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
writeFileSync(join(HERE, "data/hftable.json"), JSON.stringify({ about: "Generated by papers/p1/hf-collect.mjs from atom/tools/hftable.mjs rank (runner runs hf-table-1 and hf-lanth-1); do not edit. lda: the local-exchange ground configuration (Hund-corrected); hf: Hartree–Fock's (js/hf.js, max-spin average plus the full term correction), each over the local-exchange search's settled candidates within 4 eV of its ground.", summary, rows: out }, null, 1) + "\n");
/* the big table's detail panel (table/viewer.js): each 4D element's verdict, compact */
const V = Object.fromEntries(o4.map((r) => [r.Z, r.agree ? [1] : [0, r.hf, r.rows.find((x) => x.config === r.lda)?.hf_eV ?? null]]));
writeFileSync(join(HERE, "../../table/hfverdict.js"), `/* GENERATED by four/papers/p1/hf-collect.mjs from data/hftable.json; do not edit. Each 4D element: [1] where Hartree–Fock agrees with the table's
   configuration (firm), or [0, Hartree–Fock's configuration, how far above it Hartree–Fock puts the table's (eV)] (open). */
export const HF = ${JSON.stringify(V)};
`);
console.log(JSON.stringify(summary, null, 1));
