/* The table with its open shells' terms resolved: js/atom.js fills every open subshell with Hund spins, and
   tools/hund.mjs found that in 4D Hund's first rule fails for some fillings (d², d¹⁶, 4f³, …): there the lowest term
   has a lower spin, and the configuration's true energy is lower than the solver's by the gap between that term and the
   lowest maximum-spin one. This tool searches an element's configurations as the bake does (js/atom.js ground(), the
   same solver), with the neighbours' configurations as extra seeds the way the bake's repair pass makes them, keeps
   every settled candidate, adds each candidate's term correction (zero wherever the rule holds), and re-ranks. It
   reports the ranking without the correction too, so a change that comes from the wider search is told apart from one
   that comes from the terms. Then the first ionization the bake's way (the electron from one of the three least-bound
   subshells, the ion relaxed), each side corrected.
     node four/atom/tools/termtable.mjs <Z/Z/…> [D]     one JSON line per element (D = 4 by default)
   The correction for a subshell: tools/hund.mjs's groundSpin() on that candidate's own orbital (its F_n), when every
   M_S block of the filling has at most LIMIT determinants. Fillings above it take the survey's verdict (Hund holds,
   correction 0) and are flagged `assumed`; the survey's own results say which. */
import { ground, scf, subshells, configString } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { SOLVER } from "./bake.mjs";
import { angularL, slaterL, groundSpin } from "./hund.mjs";

const HA = 27.211386, L = { s: 0, p: 1, d: 2, f: 3 }, LIMIT = +(process.env.TERM_LIMIT || 3000), FULL = process.env.TERM_MODE === "full", LIMIT_MAX = +(process.env.TERM_LIMIT_MAX || 20000);
/* TERM_MODE=full: the whole term correction, lowest term − the average of the maximum-spin determinants (what the
   spherically averaged, Hund-polarized field approximates), for every open p, d and f subshell; the default corrects
   only Hund's first rule (lowest term − lowest maximum-spin term) */
const [zs, dS = "4"] = process.argv.slice(2), D = +dS, sh = subshells(D), byName = Object.fromEntries(sh.map((s, i) => [s.name, i]));
const angs = new Map(), ang = (l) => { if (!angs.has(l)) angs.set(l, angularL(D, l)); return angs.get(l); };
const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1); return r; };
/* the biggest M_S block of n electrons in m orbitals */
const biggest = (m, n) => { const nu = Math.ceil(n / 2); return C(m, nu) * C(m, n - nu); };
const memo = new Map();
/* the term correction of one occupation with its orbitals: Σ over open d and f subshells of (lowest term − lowest max-spin term) */
function correction(occ, qs) {
  let delta = 0; const parts = [];
  sh.forEach((s, i) => { const n = occ[i], l = L[s.name[1]]; if (l < (FULL ? 1 : 2) || n < 2 || n > s.cap - 2) return; // one electron or one hole: a single term
    const a = ang(l), m = a.m;
    if (!FULL && biggest(m, n) > LIMIT) { parts.push({ shell: s.name, n, assumed: true }); return; }
    const key = `${s.name}${n}:${qs[i].length}:${qs[i][Math.floor(qs[i].length / 2)]}`;
    let r = memo.get(key); if (!r) { const F = slaterL(D, qs[i], a.ns); r = groundSpin(m, n, a, F, FULL ? { limit: LIMIT, limitMax: LIMIT_MAX } : {}); memo.set(key, r); }
    const eV = FULL ? r.full_eV : r.belowMax_eV; delta += eV / HA; parts.push({ shell: s.name, n, groundS: r.groundS, Smax: r.Smax, eV: +eV.toFixed(4), ...(FULL ? { hund_eV: +(r.belowMax_eV ?? 0).toFixed(4), complete: r.complete } : {}) }); });
  return { delta, parts };
}
const occOf = (cfg) => { const o = sh.map(() => 0); for (const t of cfg.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[byName[m[1]]] = +m[2]; } return o; };
const same = (a, b) => a.every((v, i) => v === b[i]);

for (const Z of zs.split("/").map(Number)) {
  const t0 = Date.now(), baked = TABLE[D].find((e) => e.Z === Z), seeds = [], add = (o) => { if (o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= sh[i].cap) && !seeds.some((x) => same(x, o))) seeds.push(o); };
  // the bake's repair seeds: each neighbour's configuration with one or two electrons added or taken, wherever they fit
  for (const [Zn, k] of [[Z - 1, 1], [Z + 1, -1], [Z - 2, 2], [Z + 2, -2]]) { const e = TABLE[D].find((x) => x.Z === Zn); if (!e) continue; const base = occOf(e.config);
    for (let i = 0; i < sh.length; i++) { const o = base.slice(); o[i] += k; add(o); } }
  add(occOf(baked.config));
  const collect = [], g = ground(Z, D, { ...SOLVER, seeds, collect });
  // every distinct settled candidate, its raw and corrected energies
  const cands = []; for (const c of collect) { if (cands.some((x) => same(x.occ, c.occ) && Math.abs(x.E - c.E) < 1e-6)) continue; const k = cands.findIndex((x) => same(x.occ, c.occ)); if (k >= 0) { if (c.E < cands[k].E) cands[k] = c; continue; } cands.push(c); }
  for (const c of cands) { const r = correction(c.occ, c.qs); c.delta = r.delta; c.parts = r.parts; c.Ec = c.E + r.delta; }
  const raw = cands.reduce((a, b) => (b.E < a.E ? b : a)), cor = cands.reduce((a, b) => (b.Ec < a.Ec ? b : a));
  // the first ionization of a ground state, the bake's way, each side corrected when `corr`
  const ionOf = (gs, corr) => { const live = sh.map((s, i) => i).filter((i) => gs.occ[i] > 0), pick = live.slice().sort((a, b) => gs.es[b] - gs.es[a]).slice(0, 3); let best = null;
    for (const i of pick) { const o = gs.occ.slice(); o[i]--; const r = scf(Z, o, D, { iters: 160, start: gs.qs, ...SOLVER }); if (!r.converged) continue; const dI = corr ? correction(o, r.qs).delta : 0, e = r.E + dI - (gs.E + (corr ? gs.delta : 0));
      if (!best || e < best.e) best = { e, top: sh[i].name, ionDelta: dI }; }
    return best; };
  const iRaw = ionOf(raw, false), iCor = ionOf(cor, true), near = cands.filter((c) => c.Ec < cor.Ec + 1 / HA).sort((a, b) => a.Ec - b.Ec);
  console.log(JSON.stringify({ Z, D, baked: { config: baked.config, E: baked.E, ion_eV: +(baked.ion * HA).toFixed(4) },
    raw: { config: configString(raw.occ, D), E: +raw.E.toFixed(5), ion_eV: iRaw && +(iRaw.e * HA).toFixed(4), sameAsBaked: configString(raw.occ, D) === baked.config },
    corrected: { config: configString(cor.occ, D), E: +cor.Ec.toFixed(5), delta_eV: +(cor.delta * HA).toFixed(4), parts: cor.parts, ion_eV: iCor && +(iCor.e * HA).toFixed(4), top: iCor?.top, ionDelta_eV: iCor && +(iCor.ionDelta * HA).toFixed(4), changed: configString(cor.occ, D) !== configString(raw.occ, D) },
    within1eV: near.map((c) => ({ config: configString(c.occ, D), dEc_eV: +((c.Ec - cor.Ec) * HA).toFixed(4), delta_eV: +(c.delta * HA).toFixed(4) })), candidates: cands.length, s: (Date.now() - t0) / 1000 }));
}
