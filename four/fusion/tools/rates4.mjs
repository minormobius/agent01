/* The 4D burning network's nuclei and rates at a strong-force strength s, baked for the fusion widget (fusion/data4.js).
   Nuclei from tools/nuc4.mjs (k helium-4s + a small cluster; each with where its binding came from). Rates, as two-body
   rate constants k (s⁻¹ per unit Y, at the density of our Sun's centre, the book's convention for comparing worlds) on a
   grid of temperatures, and decay constants λ (s⁻¹):
     p + p                computed from the strong force (nuclear.js ppOverlap via ppfusion's ppx at s), the clock: our Sun
                          burns half its centre's hydrogen in 4.6 Gyr, so k_pp = (1/0.35 − 1/0.7)/4.6 Gyr × e^(L4(T) − L3)
     ⁴He + ⁴He            computed (nuclei.mjs capture's E2 table)
     p, ⁴He onto 2–4 ⁴He   computed (nuclei.mjs protonflow's tables)
     everything else      OURS CARRIED: the nuclear factor S̃ of our analogue (its REACLIB rate against our p + p at a
                          reference temperature, through our barrier), put through 4D's barrier; for captures with no
                          analogue, our ¹⁴N(p,γ) or ¹²C(α,γ) times the geometric mean of how far 4D's computed captures
                          exceed it (as nuclei.mjs hburn does)
     β⁺ decays            the positron phase space at the decay's own endpoint (nuclear.js's form, as for p + p) with
                          ¹³N's ft (our mirror decay); electron capture where only it is open, ⁷Be's in the Sun scaled by Q²
   A capture whose compound nucleus can throw out a helium-4 (the energy above that threshold > 0) also gets the (p,α)
   channel, with our ¹⁵N(p,α)'s factor carried (¹⁴N + p and ⁷Li + p are ours' analogues of which way that goes).
   Left out: photodisintegration (the stages here are ≤ 0.3 GK, every separation ≥ several MeV), neutron channels.
     node four/fusion/tools/rates4.mjs <s,…>     → four/fusion/data4.js (all the strengths given) */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { logRate, gamow, KB_MEV } from "../../atom/js/stars.js";
import { lambda, RX } from "../js/net.js";
import { table } from "./nuc4.mjs";

const DIR = `${process.env.TMPDIR ?? "/tmp"}/atom4-nuclei`, load = (f) => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) : null);
const AMU = 931.494, HBC = 197.327, YR = 3.15576e7, ME = 0.510999;
const op = (d, Z1, A1, Z2, A2, r0 = d === 3 ? 1.2 : 1.0) => ({ Z1, Z2, mu: ((A1 * A2) / (A1 + A2)) * AMU, rn: r0 * (Math.pow(A1, 1 / d) + Math.pow(A2, 1 / d)), d });
const TGRID = Array.from({ length: 28 }, (_, i) => 1e6 * Math.pow(400, i / 27)); // 1–400 MK
const peak = (T, o) => { const kT = KB_MEV * T; let best = 0, bv = -Infinity; for (let E = kT / 4; E < 80 * kT; E *= 1.02) { const v = -E / kT - gamow(E, o); if (v > bv) { bv = v; best = E; } } return best; };
const interp = (Es, sv, E) => { let i = 0; while (i < Es.length - 2 && Es[i + 1] < E) i++; const f = Math.log(E / Es[i]) / Math.log(Es[i + 1] / Es[i]); return Math.exp(Math.log(Math.max(sv[i], 1e-300)) * (1 - f) + Math.log(Math.max(sv[i + 1], 1e-300)) * f); };
const Stab = (Es, sv, T, o) => { const E = peak(T, o), k = Math.sqrt((2 * o.mu * E) / HBC ** 2), v = (HBC * k) / o.mu; return (interp(Es, sv, E) / v) * k ** (o.d - 1) * Math.exp(gamow(E, o)); };
/* our p + p's S̃ at 10 keV through our 2.4 fm barrier (the book's yardstick), and the ratio law R = (S̃/S̃_pp)(μ_pp/μ)² e^(L − L_pp) */
const St3 = (S, E, o) => { const eta = o.Z1 * o.Z2 * (1 / 137.035999) * Math.sqrt(o.mu / (2 * E)), k2 = (2 * o.mu * E) / HBC ** 2; return ((S / 1000) * 100 / E) * Math.exp(-2 * Math.PI * eta) * k2 * Math.exp(gamow(E, o)); };
const pp3 = op(3, 1, 1, 1, 1), Spp = St3(4.01e-22, 0.01, pp3);
/* our analogue's S̃ from REACLIB: its rate over our p + p's at T_ref, through our barrier (REACLIB's own p + p, so S̃_pp cancels) */
const rxOurs = (r, p) => RX.find((x) => x.r.slice().sort().join() === r.slice().sort().join() && x.p.slice().sort().join() === p.slice().sort().join() && !x.ec);
const A_OF = { p: 1, d: 2, he3: 3, he4: 4, li7: 7, be7: 7, c12: 12, n14: 14, n15: 15, o16: 16 }, Z_OF = { p: 1, d: 1, he3: 2, he4: 2, li7: 3, be7: 4, c12: 6, n14: 7, n15: 7, o16: 8 };
function oursS(r, p, Tref) {
  const x = rxOurs(r, p), xpp = rxOurs(["p", "p"], ["d"]), T9 = Tref / 1e9, sym = r[0] === r[1] ? 2 : 1, o = op(3, Z_OF[r[0]], A_OF[r[0]], Z_OF[r[1]], A_OF[r[1]]);
  const ratio = (lambda(x, T9) / sym) / (lambda(xpp, T9) / 2); // ⟨σv⟩ over p + p's
  return Spp * ratio * (o.mu / pp3.mu) ** 2 * Math.exp(logRate(Tref, pp3) - logRate(Tref, o));
}
/* positron phase space (no Fermi function, as nuclear.js leptonF), endpoint T0 MeV */
const fBeta = (T0) => { if (T0 <= 0) return 0; const W0 = 1 + T0 / ME, n = 400; let f = 0; for (let i = 0; i < n; i++) { const W = 1 + ((i + 0.5) / n) * (W0 - 1); f += Math.sqrt(W * W - 1) * W * (W0 - W) ** 2; } return (f * (W0 - 1)) / n; };
const FT = fBeta(2.2205 - 2 * ME) * 597.9; // ¹³N: Q_EC 2.2205 MeV, t½ 597.9 s

function bake(s) {
  const N = table(s, { compact: process.env.COMPACT === "1" }), nuc = N.nuclides.filter((x) => x.bound || x.A <= 4), key = (Z, Nn) => `${Z}-${Z + Nn}`, has = new Map(nuc.map((x) => [key(x.Z, x.N), x]));
  // p + p's factor over the old 4 fm formula at this strength (ppfusion ppx: flat in T within 9%); computed here if missing
  const PPX = { 1.5152: 0.865, 1.55: 61.4, 1.6: 1100, 1.65: 7780, 1.7: 38200, 1.75: 161000, 1.8: 658000, 1.85: 3020000, 1.8909: 14100000 }[s];
  if (!PPX) throw new Error(`no p + p factor for s = ${s}: run ppfusion.mjs ppx MN ${s}`);
  const opp4 = { ...op(4, 1, 1, 1, 1), rn: 4 }, L3 = logRate(1.57e7, pp3), kpp = (T) => ((1 / 0.35 - 1 / 0.7) / (4.6e9 * YR)) * Math.exp(logRate(T, opp4) + Math.log(PPX) - L3);
  const rows = [...(load("MN-protonflow.json")?.rows ?? []), ...(load("MN-protonflow-scan.json")?.rows ?? [])].filter((r) => Math.abs(r.s - s) < 1e-4);
  const cap = [...(load("MN-capture.json")?.rows ?? []), ...(load("MN-capture-scan.json")?.rows ?? [])].find((r) => Math.abs(r.s - s) < 1e-4);
  const Sn14 = oursS(["p", "n14"], ["o15"], 2e7), Sc12a = oursS(["he4", "c12"], ["o16"], 2e8), Sn15pa = oursS(["p", "n15"], ["he4", "c12"], 2e7);
  // how far 4D's computed captures exceed ours' carried (geometric mean over the computed cores, at 15 MK and 0.2 GK)
  const gm = (a) => Math.exp(a.reduce((x, y) => x + Math.log(y), 0) / Math.max(1, a.length));
  const Fp = gm(rows.map((r) => Stab(r.tp.E, r.tp.sv, 1.5e7, op(4, 1, 1, 2 * r.k, 4 * r.k)) / Sn14)), Fa = gm(rows.map((r) => Stab(r.ta.E, r.ta.sv, 2e8, op(4, 2, 4, 2 * r.k, 4 * r.k)) / Sc12a));
  const reactions = [], add = (r, p, how, kOf, extra = {}) => reactions.push({ r, p, how, k: TGRID.map((T) => kOf(T)), ...extra });
  const id = (x) => key(x.Z, x.N), get = (Z, Nn) => has.get(key(Z, Nn));
  const twoBody = (a, b, S) => (T) => { const o = op(4, a.Z, a.A, b.Z, b.A); return kpp(T) * (S / Spp) * (opp4.mu / o.mu) ** 2 * Math.exp(logRate(T, o) - logRate(T, opp4)) / PPX; };
  const P = get(1, 0), D = get(1, 1), H3 = get(2, 1), A4 = { Z: 2, N: 2, A: 4, B: N.Ba };
  // the chains
  add(["1-1", "1-1"], ["1-2"], "computed (p + p from the strong force)", kpp, { kind: "beta" });
  add(["1-1", "1-2"], ["2-3"], "ours carried (d + p)", twoBody(P, D, oursS(["p", "d"], ["he3"], 1.5e7)));
  add(["2-3", "2-3"], ["1-1", "1-1", "2-4"], "ours carried (³He + ³He)", twoBody(H3, H3, oursS(["he3", "he3"], ["p", "p", "he4"], 1.5e7)));
  const be7a = get(4, 3), li7a = get(3, 4);
  if (be7a) add(["2-3", "2-4"], ["4-7"], "ours carried (³He + ⁴He)", twoBody(H3, A4, oursS(["he4", "he3"], ["be7"], 1.5e7)));
  if (be7a && li7a) { const Q = be7a.betaPlus + 2 * ME; if (Q > 0) reactions.push({ r: ["4-7"], p: ["3-7"], how: "ours carried (⁷Be's electron capture in the Sun, × (Q/Q_ours)²)", lam: (1 / (140 * 86400)) * (Q / 0.862) ** 2, kind: "ec" }); }
  // αα: computed
  add(["2-4", "2-4"], ["4-8"], "computed (E2, nuclei.mjs capture)", (T) => (cap ? twoBody(A4, A4, Stab(cap.table.E, cap.table.aa, T, op(4, 2, 4, 2, 4)))(T) : 0));
  // captures onto every nucleus of the table
  for (const x of nuc) { if (x.A < 4 || (x.Z === 2 && x.N === 2)) continue;
    const kcore = x.c === "" ? x.k : null, row = kcore ? rows.find((r) => r.k === kcore) : null;
    // + p
    const y = get(x.Z + 1, x.N);
    if (y && y.bound) { const Est = y.B - x.B, w = get(x.Z - 1, x.N - 2) /* y = (Z + 1, N) less a helium-4 */, Sa = w ? y.B - w.B - N.Ba : -1;
      const S = row ? (T) => Stab(row.tp.E, row.tp.sv, T, op(4, 1, 1, x.Z, x.A)) : () => Fp * Sn14, o = op(4, 1, 1, x.Z, x.A);
      add(["1-1", id(x)], [id(y)], row ? "computed (E1, nuclei.mjs protonflow)" : "ours carried (¹⁴N + p × 4D's computed excess)", (T) => twoBody(P, x, S(T))(T));
      if (w && Sa > 0 && Est > Sa) add(["1-1", id(x)], ["2-4", id(w)], `ours carried (¹⁵N(p,α)): the compound sits ${(Est - Sa).toFixed(1)} MeV above its helium-4 threshold`, twoBody(P, x, Sn15pa), { alphaOpen: Est - Sa }); }
    // + ⁴He
    const z = get(x.Z + 2, x.N + 2);
    if (z && z.bound) { const S = row ? (T) => Stab(row.ta.E, row.ta.sv, T, op(4, 2, 4, x.Z, x.A)) : () => Fa * Sc12a;
      add(["2-4", id(x)], [id(z)], row ? "computed (E2, nuclei.mjs protonflow)" : "ours carried (¹²C + ⁴He × 4D's computed excess)", (T) => twoBody(A4, x, S(T))(T)); }
    // β⁺
    if (x.betaPlus != null && x.betaPlus > 0) { const d = get(x.Z - 1, x.N + 1); if (d) reactions.push({ r: [id(x)], p: [id(d)], how: `β⁺, endpoint ${x.betaPlus.toFixed(2)} MeV, ¹³N's ft`, lam: (Math.LN2 * fBeta(x.betaPlus)) / FT, kind: "beta" }); }
  }
  // ceryllium + ceryllium (heavy's convention: our ¹⁶O + ¹⁶O's factor carried), out as element 6 + ⁴He (the helium-4 channel)
  const ce = get(4, 4), c12a = get(6, 6), oo = oursS(["o16", "o16"], ["he4", "si28"], 2e9) + oursS(["o16", "o16"], ["p", "p31"], 2e9);
  if (ce && c12a) add(["4-8", "4-8"], ["6-12", "2-4"], "ours carried (¹⁶O + ¹⁶O); out as element 6 + ⁴He, the helium-4 channel (the nucleon channel is open too)", twoBody(ce, ce, oo));
  const species = nuc.map((x) => ({ key: id(x), Z: x.Z, N: x.N, A: x.A, B: +x.B.toFixed(3), how: x.how, half: null }));
  for (const r of reactions) if (r.lam != null) { const sp = species.find((q) => q.key === r.r[0]); if (sp) sp.half = Math.LN2 / r.lam; }
  for (const r of reactions) if (r.k) r.k = r.k.map((v) => +v.toPrecision(5));
  return { s, Ba: N.Ba, Fp, Fa, species, reactions, ppx: PPX };
}

const S_LIST = (process.argv[2] ?? "1.5152,1.7").split(",").map(Number), out = {};
for (const s of S_LIST) { const b = bake(s); out[s] = b; console.log(`s ${s}: ${b.species.length} nuclei, ${b.reactions.length} reactions; computed-capture excess Fp ${b.Fp.toFixed(1)}, Fa ${b.Fa.toFixed(1)}`); }
writeFileSync(new URL("../data4.js", import.meta.url), `/* Generated by four/fusion/tools/rates4.mjs; do not edit. The 4D burning network at each strong-force strength s:
   nuclei (k helium-4s + a small cluster, binding in MeV and where it came from) and reactions (two-body k on TGRID at our
   Sun's centre density, or decay λ), each with where its rate came from. */
export const TGRID = ${JSON.stringify(TGRID.map((t) => +t.toPrecision(5)))};
export const NET4 = ${JSON.stringify(out)};\n`);
console.log("wrote four/fusion/data4.js");
