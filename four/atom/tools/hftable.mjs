/* Paper 1's second table: each element's candidate configurations ranked by Hartree–Fock (js/hf.js) as well as by the
   local-exchange solver (js/atom.js), so that every configuration carries a verdict: the two methods agree, or they
   don't. In our world (tools/../papers/p1/hf-scope.py) Hartree–Fock gets 8 of 9 3d configurations against the local
   exchange's 5, the two are right where they agree, and Hartree–Fock is right where they differ.
     node four/atom/tools/hftable.mjs check                          the solver against known answers (seconds to a minute)
     node four/atom/tools/hftable.mjs rank <Z/Z/…> [D] [window_eV]   one JSON line per element (D = 4, window 4 eV)
   The candidates are termtable.mjs's: ground() with the neighbours' configurations as seeds, every settled one kept,
   those within the window of the local-exchange ground solved by Hartree–Fock. Each energy carries its open subshells'
   term correction: for the local exchange, Hund's first rule only (lowest term − lowest max-spin term, as the main table
   does); for Hartree–Fock, whose energy is exactly the average over the max-spin determinants, the whole of it (lowest
   term − that average). Both from tools/hund.mjs on the candidate's own orbitals. */
import { ground, subshells, configString, R as AR, N as AN, H as AH } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { SOLVER } from "./bake.mjs";
import { angularL, slaterL, groundSpin } from "./hund.mjs";
import { hfAtom } from "../js/hf.js";

const HA = 27.211386245988, Lof = { s: 0, p: 1, d: 2, f: 3 };
const [mode, zs, dS = "4", wS = "4"] = process.argv.slice(2), D = +dS, WIN = +wS / HA;

/* the Hartree–Fock orbital as atom.js's radial charge per grid point (q_j = u(r_j)² r_j h_atom = z(x_j)² h_atom) */
function toAtomGrid(S, z) {
  const q = new Float64Array(AN), x0 = Math.log(S.r[0]);
  for (let j = 0; j < AN; j++) { const x = (Math.log(AR[j]) - x0) / S.h, i = Math.floor(x); if (i < 0 || i >= S.N - 1) continue; const f = x - i, v = z[i] * (1 - f) + z[i + 1] * f; q[j] = v * v * AH; }
  const s = q.reduce((a, b) => a + b, 0); for (let j = 0; j < AN; j++) q[j] /= s; return q;
}
const angs = new Map(), ang = (l) => { if (!angs.has(l)) angs.set(l, angularL(D, l)); return angs.get(l); };
/* Σ over open p, d, f subshells of the term correction: `full` lowest term − the max-spin average, else Hund's first rule only */
function correction(occ, qs, full, sh) {
  let delta = 0; const parts = [];
  sh.forEach((s, i) => { const n = occ[i], l = Lof[s.name[1]]; if (l < (full ? 1 : 2) || n < 2 || n > s.cap - 2) return;
    const a = ang(l), F = slaterL(D, qs[i], a.ns), r = groundSpin(a.m, n, a, F, full ? { limit: 3000, limitMax: 20000 } : {});
    const eV = full ? r.full_eV : (r.belowMax_eV ?? 0); delta += eV / HA; parts.push({ shell: s.name, n, groundS: r.groundS, eV: +eV.toFixed(4), complete: r.complete }); });
  return { delta, parts };
}
const occOf = (sh, cfg) => { const by = Object.fromEntries(sh.map((s, i) => [s.name, i])), o = sh.map(() => 0); for (const t of cfg.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[by[m[1]]] = +m[2]; } return o; };
const hfOcc = (sh, occ) => sh.map((s, i) => ({ n: +s.name.match(/^\d+/)[0], l: s.l, q: occ[i] })).filter((o) => o.q > 0);

if (mode === "check") {
  const cfg = (s) => s.split(" ").map((t) => { const m = t.match(/^(\d)([spdf])(\d+)$/); return { n: +m[1], l: "spdf".indexOf(m[2]), q: +m[3] }; });
  const ar = "1s2 2s2 2p6 3s2 3p6", out = [];
  // numerical Hartree–Fock limits of ours (Froese Fischer; Bunge et al.), the energy extrapolated from h = 0.02 and 0.01
  for (const [nm, Z, c, ref] of [["He", 2, "1s2", -2.861679996], ["Ne", 10, "1s2 2s2 2p6", -128.547098109], ["N 4S", 7, "1s2 2s2 2p3", -54.400934], ["C 3P", 6, "1s2 2s2 2p2", -37.688619], ["Fe 5D", 26, ar + " 3d6 4s2", -1262.443665]]) {
    const a = hfAtom(3, Z, cfg(c), { grid: { h: 0.02 } }), b = hfAtom(3, Z, cfg(c), { grid: { h: 0.01 } }), x = (4 * b.E - a.E) / 3;
    out.push({ what: nm, E: +x.toFixed(6), ref, diff: +(x - ref).toExponential(2), ok: Math.abs(x - ref) < 2e-5 });
  }
  for (const o of out) console.log(JSON.stringify(o));
  console.log(out.every((o) => o.ok) ? "hf check passed" : "hf check FAILED"); process.exit(out.every((o) => o.ok) ? 0 : 1);
}

if (mode === "rank") {
  const sh = subshells(D);
  for (const Z of zs.split("/").map(Number)) {
    const t0 = Date.now(), baked = TABLE[D].find((e) => e.Z === Z), seeds = [], same = (a, b) => a.every((v, i) => v === b[i]);
    const add = (o) => { if (o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= sh[i].cap) && !seeds.some((x) => same(x, o))) seeds.push(o); };
    for (let Zn = Z - 2; Zn <= Z + 2; Zn++) { const e = TABLE[D].find((x) => x.Z === Zn); if (!e) continue; const base = occOf(sh, e.config), k = Z - Zn; for (let i = 0; i < sh.length; i++) { const o = base.slice(); o[i] += k; add(o); } }
    add(occOf(sh, baked.config));
    const collect = []; ground(Z, D, { ...SOLVER, seeds, collect });
    const cands = []; for (const c of collect) { const k = cands.findIndex((x) => same(x.occ, c.occ)); if (k >= 0) { if (c.E < cands[k].E) cands[k] = c; } else cands.push(c); }
    if (!cands.length) { console.log(JSON.stringify({ Z, D, unsettled: true })); continue; }
    const best = Math.min(...cands.map((c) => c.E)), near = cands.filter((c) => c.E < best + WIN);
    for (const c of near) {
      const lc = correction(c.occ, c.qs, false, sh); c.lda = c.E + lc.delta; c.ldaParts = lc.parts;
      const h = hfAtom(D, Z, hfOcc(sh, c.occ), { grid: { h: 0.02 } }); c.hfRaw = h.E; c.hfConv = h.converged;
      if (h.converged) { const qs = sh.map((s, i) => { const k = h.subshells.find((x) => x.name === s.name); return k ? toAtomGrid(h.S, k.z) : null; }); const hc = correction(c.occ, qs, true, sh); c.hf = h.E + hc.delta; c.hfParts = hc.parts; c.hfEps = Object.fromEntries(h.subshells.map((x) => [x.name, +x.eps.toFixed(5)])); }
    }
    const ok = near.filter((c) => c.hfConv), byL = near.slice().sort((a, b) => a.lda - b.lda), byH = ok.slice().sort((a, b) => a.hf - b.hf);
    const cs = (c) => configString(c.occ, D), lg = byL[0], hg = byH[0];
    console.log(JSON.stringify({ Z, D, baked: baked.config, lda: { config: cs(lg), E: +lg.lda.toFixed(5) }, hf: hg ? { config: cs(hg), E: +hg.hf.toFixed(5), raw: +hg.hfRaw.toFixed(5), parts: hg.hfParts } : null,
      agree: !!hg && cs(lg) === cs(hg), candidates: cands.length, solved: near.length, unconverged: near.length - ok.length,
      hfSecond: byH[1] ? { config: cs(byH[1]), dE_eV: +((byH[1].hf - hg.hf) * HA).toFixed(4) } : null,
      rows: near.map((c) => ({ config: cs(c), lda_eV: +((c.lda - lg.lda) * HA).toFixed(4), hf_eV: c.hfConv && hg ? +((c.hf - hg.hf) * HA).toFixed(4) : null, hfRaw: c.hfConv ? +c.hfRaw.toFixed(6) : null })),
      s: (Date.now() - t0) / 1000 }));
  }
}
