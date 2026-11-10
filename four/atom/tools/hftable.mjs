/* Paper 1's second table: each element's candidate configurations ranked by Hartree–Fock (js/hf.js) as well as by the
   local-exchange solver (js/atom.js), so that every configuration carries a verdict: the two methods agree, or they
   don't. In our world (tools/../papers/p1/hf-scope.py) Hartree–Fock gets 8 of 9 3d configurations against the local
   exchange's 5, the two are right where they agree, and Hartree–Fock is right where they differ.
     node four/atom/tools/hftable.mjs check                          the solver against known answers (seconds to a minute)
     node four/atom/tools/hftable.mjs rank <Z/Z/…> [D] [window_eV] [climb]   one JSON line per element (D = 4, window 4 eV);
       climb adds Hartree–Fock's own one-electron neighbourhood (below)
     node four/atom/tools/hftable.mjs farcorr <Z/Z/…> [D]           the term corrections `rank` skipped: every candidate of
       Z that papers/p1/data/hftable.json marks `far` (ranked on its raw energy, more than 6 eV above the best), solved
       by Hartree–Fock again and corrected; one JSON line per candidate, `partial` where a spin block was too big to finish
       (papers/p1/hf-collect.mjs folds them in, keeping which energies were raw, corrected or partial)
   The candidates are termtable.mjs's: ground() with the neighbours' configurations as seeds, every settled one kept,
   those within the window of the local-exchange ground solved by Hartree–Fock. Each energy carries its open subshells'
   term correction: for the local exchange, Hund's first rule only (lowest term − lowest max-spin term, as the main table
   does); for Hartree–Fock, whose energy is exactly the average over the max-spin determinants, the whole of it (lowest
   term − that average). Both from tools/hund.mjs on the candidate's own orbitals. */
import { ground, scf, subshells, configString, R as AR, N as AN, H as AH } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { SOLVER } from "./bake.mjs";
import { angularL, slaterL, groundSpin } from "./hund.mjs";
import { hfAtom } from "../js/hf.js";
import { readFileSync } from "node:fs";

const HA = 27.211386245988, Lof = { s: 0, p: 1, d: 2, f: 3 };
const [mode, zs, dS = "4", wS = "4"] = process.argv.slice(2), D = +dS, WIN = +wS / HA, CLIMB = process.argv.includes("climb");

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
    const eV = full ? r.full_eV : (r.belowMax_eV ?? 0); delta += eV / HA; parts.push({ shell: s.name, n, groundS: r.groundS, eV: +eV.toFixed(4), complete: r.complete, blocks: r.blocks?.map((b) => ({ M: b.M, E: b.E })) }); });
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

/* past the baked table (ours stops at 36), the element and its neighbours are taken from the measured configurations
   of papers/p1/data/nist-lanthanides.json (Cs–Hf): the lanthanide calibration. They only seed the search, which ranks
   whatever settles, so the measured answer gets no say in either method's ranking. */
const MEASURED = new Map(D === 3 ? JSON.parse(readFileSync(new URL("../../papers/p1/data/nist-lanthanides.json", import.meta.url), "utf8")).rows.map((r) => [r.Z, { Z: r.Z, config: r.config }]) : []);
const entry = (Z) => TABLE[D].find((e) => e.Z === Z) ?? MEASURED.get(Z);

/* map: an element's valence states. From its ground configuration in the table (js/tablec.js), every one-electron move
   from any occupied subshell within one of the outermost n + l (full ones too) to a subshell within one of it, compact
   only, each solved by both methods: local exchange (its own SCF, Hund-corrected) and Hartree–Fock (term-corrected), energies from each
   method's own ground; and each open subshell's spin ladder on the ground (the lowest energy of each M_S block, which
   holds every spin S ≥ M_S), by Hartree–Fock's orbitals.
     node four/atom/tools/hftable.mjs map <Z/Z/…> [D] */
if (mode === "map") {
  const { TABLE: TC } = await import("../js/tablec.js"), { SOLVER: SV } = await import("./bake.mjs"), sh = subshells(D);
  const nOf = (s) => +s.name.match(/^\d+/)[0], nl = (s) => nOf(s) + s.l, same = (a, b) => a.every((v, i) => v === b[i]);
  const gappedOcc = (o) => sh.some((s, i) => o[i] > 0 && sh.some((t, j) => t.l === s.l && nOf(t) < nOf(s) && o[j] === 0));
  for (const Z of zs.split("/").map(Number)) {
    const t0 = Date.now(), g = occOf(sh, TC[D][Z - 1].config), list = [{ occ: g, ground: true }], top = Math.max(...sh.map((s, i) => (g[i] > 0 ? nl(s) : -1)));
    const donors = sh.map((_, i) => i).filter((i) => g[i] > 0 && nl(sh[i]) >= top - 1); // every occupied subshell near the top, full ones too (Cu's 3d, a noble gas's p)
    const accept = sh.map((_, i) => i).filter((i) => g[i] < sh[i].cap && sh[i].l <= 3 && Math.abs(nl(sh[i]) - top) <= 1);
    for (const a of donors) for (const b of accept) { if (a === b) continue; const m = g.slice(); m[a]--; m[b]++; if (!gappedOcc(m) && !list.some((x) => same(x.occ, m))) list.push({ occ: m }); }
    for (const c of list) {
      const s0 = scf(Z, c.occ, D, { ...SV, iters: 400 }); c.ldaConv = s0.converged;
      if (s0.converged) { const lc = correction(c.occ, s0.qs, false, sh); c.lda = s0.E + lc.delta; }
      const h = hfAtom(D, Z, hfOcc(sh, c.occ), { grid: { h: 0.02 } }); c.hfConv = h.converged;
      if (h.converged) { const qs = sh.map((s, i) => { const k = h.subshells.find((x) => x.name === s.name); return k ? toAtomGrid(h.S, k.z) : null; }); const hc = correction(c.occ, qs, true, sh); c.hf = h.E + hc.delta; c.parts = hc.parts; }
    }
    const G = list[0], cs = (c) => configString(c.occ, D);
    console.log(JSON.stringify({ Z, D, ground: cs(G), groundParts: G.parts ?? null,
      states: list.map((c) => ({ config: cs(c), lda_eV: c.lda != null && G.lda != null ? +((c.lda - G.lda) * HA).toFixed(4) : null, hf_eV: c.hf != null && G.hf != null ? +((c.hf - G.hf) * HA).toFixed(4) : null, ldaConv: c.ldaConv, hfConv: c.hfConv })),
      s: (Date.now() - t0) / 1000 }));
  }
}

if (mode === "farcorr") {
  const sh = subshells(D), HFT = JSON.parse(readFileSync(new URL("../../papers/p1/data/hftable.json", import.meta.url), "utf8"));
  for (const Z of zs.split("/").map(Number)) {
    const r = HFT.rows.find((x) => x.D === D && x.Z === Z); if (!r?.rows) continue;
    for (const c of r.rows.filter((x) => x.far)) {
      const t0 = Date.now(), occ = occOf(sh, c.config), h = hfAtom(D, Z, hfOcc(sh, occ), { grid: { h: 0.02 } });
      if (!h.converged) { console.log(JSON.stringify({ Z, D, config: c.config, converged: false, s: (Date.now() - t0) / 1000 })); continue; }
      const qs = sh.map((s, i) => { const k = h.subshells.find((x) => x.name === s.name); return k ? toAtomGrid(h.S, k.z) : null; }), hc = correction(occ, qs, true, sh);
      console.log(JSON.stringify({ Z, D, config: c.config, hfRaw: +h.E.toFixed(6), storedRaw: c.hfRaw, corr_eV: +(hc.delta * HA).toFixed(4), parts: hc.parts.map(({ blocks, ...p }) => p),
        partial: hc.parts.some((p) => p.complete === false), converged: true, s: (Date.now() - t0) / 1000 }));
    }
  }
}

if (mode === "rank") {
  const sh = subshells(D);
  for (const Z of zs.split("/").map(Number)) {
    const t0 = Date.now(), baked = entry(Z), seeds = [], same = (a, b) => a.every((v, i) => v === b[i]);
    const add = (o) => { if (o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= sh[i].cap) && !seeds.some((x) => same(x, o))) seeds.push(o); };
    for (let Zn = Z - 2; Zn <= Z + 2; Zn++) { const e = entry(Zn); if (!e) continue; const base = occOf(sh, e.config), k = Z - Zn; for (let i = 0; i < sh.length; i++) { const o = base.slice(); o[i] += k; add(o); } }
    add(occOf(sh, baked.config));
    const collect = []; ground(Z, D, { ...SOLVER, seeds, collect });
    const cands = []; for (const c of collect) { const k = cands.findIndex((x) => same(x.occ, c.occ)); if (k >= 0) { if (c.E < cands[k].E) cands[k] = c; } else cands.push(c); }
    if (!cands.length) { console.log(JSON.stringify({ Z, D, unsettled: true })); continue; }
    const best = Math.min(...cands.map((c) => c.E)), near = cands.filter((c) => c.E < best + WIN);
    /* `above`: skip the term correction when the raw energy is more than 6 eV above it, to save time. That is NOT safe on
       its own: the correction is never positive and reaches −7.7 eV in the 4D f row, so a skipped configuration's raw
       energy overstates its place by its own correction. The skipped ones are marked `far` and corrected afterwards by
       `farcorr` (Astra's audit, 2026-11-10) */
    const hfSolve = (c, above) => { const h = hfAtom(D, Z, hfOcc(sh, c.occ), { grid: { h: 0.02 } }); c.hfRaw = h.E; c.hfConv = h.converged;
      if (h.converged && above != null && h.E - above > 6 / HA) { c.hf = h.E; c.hfParts = null; c.far = true; return; }
      if (h.converged) { const qs = sh.map((s, i) => { const k = h.subshells.find((x) => x.name === s.name); return k ? toAtomGrid(h.S, k.z) : null; }); const hc = correction(c.occ, qs, true, sh); c.hf = h.E + hc.delta; c.hfParts = hc.parts; c.hfEps = Object.fromEntries(h.subshells.map((x) => [x.name, +x.eps.toFixed(5)])); } };
    for (const c of near) { const lc = correction(c.occ, c.qs, false, sh); c.lda = c.E + lc.delta; c.ldaParts = lc.parts; hfSolve(c); }
    /* climb: Hartree–Fock's own neighbourhood, so that its candidates aren't chosen by the local exchange alone (which
       misprices f by volts, and so leaves Hartree–Fock's competitors out of any window set in its energy). From
       Hartree–Fock's best, every one-electron move from an open subshell (or the outermost s) to a subshell within one of
       the outermost n + l, compact configurations only, each solved by Hartree–Fock; move to the best and repeat. A
       configuration found this way has no local-exchange energy unless the search also settled it. */
    if (CLIMB) {
      const nOf = (s) => +s.name.match(/^\d+/)[0], nl = (s) => nOf(s) + s.l, tried = new Set(near.map((c) => c.occ.join()));
      const gappedOcc = (o) => sh.some((s, i) => o[i] > 0 && sh.some((t, j) => t.l === s.l && nOf(t) < nOf(s) && o[j] === 0));
      let cur = near.filter((c) => c.hfConv).sort((a, b) => a.hf - b.hf)[0];
      for (let round = 0; round < 4 && cur; round++) {
        const o = cur.occ, top = Math.max(...sh.map((s, i) => (o[i] > 0 ? nl(s) : -1)));
        const donors = sh.map((_, i) => i).filter((i) => o[i] > 0 && (o[i] < sh[i].cap || (sh[i].l === 0 && nl(sh[i]) >= top - 1)));
        const accept = sh.map((_, i) => i).filter((i) => o[i] < sh[i].cap && sh[i].l <= 3 && Math.abs(nl(sh[i]) - top) <= 1);
        for (const a of donors) for (const b of accept) { if (a === b) continue; const m = o.slice(); m[a]--; m[b]++;
          if (gappedOcc(m) || tried.has(m.join())) continue; tried.add(m.join());
          const c = cands.find((x) => same(x.occ, m)) ?? { occ: m, E: null }; if (c.E != null && c.lda == null) { const lc = correction(c.occ, c.qs, false, sh); c.lda = c.E + lc.delta; }
          hfSolve(c, cur.hf); c.climbed = true; near.push(c); }
        const nb = near.filter((c) => c.hfConv).sort((a, b) => a.hf - b.hf)[0]; if (nb === cur) break; cur = nb;
      }
    }
    const ok = near.filter((c) => c.hfConv), byL = near.filter((c) => c.lda != null).sort((a, b) => a.lda - b.lda), byH = ok.slice().sort((a, b) => a.hf - b.hf);
    const cs = (c) => configString(c.occ, D), lg = byL[0], hg = byH[0];
    console.log(JSON.stringify({ Z, D, baked: baked.config, lda: { config: cs(lg), E: +lg.lda.toFixed(5) }, hf: hg ? { config: cs(hg), E: +hg.hf.toFixed(5), raw: +hg.hfRaw.toFixed(5), parts: hg.hfParts } : null,
      agree: !!hg && cs(lg) === cs(hg), candidates: cands.length, solved: near.length, unconverged: near.length - ok.length,
      hfSecond: byH[1] ? { config: cs(byH[1]), dE_eV: +((byH[1].hf - hg.hf) * HA).toFixed(4) } : null,
      climb: CLIMB || undefined, climbed: CLIMB ? near.filter((c) => c.climbed).length : undefined,
      rows: near.map((c) => ({ config: cs(c), lda_eV: c.lda != null ? +((c.lda - lg.lda) * HA).toFixed(4) : null, climbed: c.climbed || undefined, far: c.far || undefined, hf_eV: c.hfConv && hg ? +((c.hf - hg.hf) * HA).toFixed(4) : null, hfRaw: c.hfConv ? +c.hfRaw.toFixed(6) : null })),
      s: (Date.now() - t0) / 1000 }));
  }
}
