/* Proton + proton → deuteron + e⁺ + ν in 4D, computed from the strong force instead of a guessed nuclear size.
   js/nuclear.js ppOverlap gives the overlap of the deuteron with the two-proton scattering state (Coulomb, the singlet
   force, and in 4D the s-wave's own centrifugal term, all exact); the rate is σv(E) = K Ω_d |M(E)|² f(W₀) with K, a rate,
   the same in both worlds and calibrated on our measured S(0) = 4.01 × 10⁻²² keV b, and f the lepton phase space at
   each world's own deuteron binding (our form, declared). Then the radius r_eff at which the burning runs' old formula
   (our S̃ = σ k^(d−1) e^G, the barrier tunnelled from r) gives the same thermal rate, so their results can be read off.
     node four/atom/tools/ppfusion.mjs check     ours: Λ², the S-factor's slope, and the old formula against the new
     node four/atom/tools/ppfusion.mjs table     4D: every force and strength the runs use; r_eff by temperature
     node four/atom/tools/ppfusion.mjs bake      also writes atom/tools/ppfusion.json */
import { writeFileSync } from "node:fs";
import { MN, MT, ppOverlap, deuteron, leptonF, lambda2, OMEGA } from "../js/nuclear.js";
import { gamow, KB_MEV, HBARC } from "../js/stars.js";
// the strengths the burning runs use (tools/nuclei.mjs FORCES: the deuteron binding, binding as ours, the diproton binding)
const FORCES = { MT: { F: MT, s4: [1.2292, 1.2986, 1.4993] }, MN: { F: MN, s4: [1.4002, 1.5152, 1.8909] } };

const B_OURS = 2.224566, S0 = 4.01e-22, MU = 938.272 / 2, C = 2.99792458e23; // keV b; MeV; fm/s
const cmd = process.argv[2] ?? "table";
const vrel = (E) => Math.sqrt((2 * E) / MU); // in c
const keVb = (S) => S * 0.1; // keV b → MeV fm²
/* our measured rate at low E: σv = S e^(−2πη) v / E (fm³ c) */
const sv3 = (E, eta) => (keVb(S0) / E) * Math.exp(-2 * Math.PI * eta) * vrel(E);
/* K f₃: from ours, at a low energy (the S-factor's own slope taken from the computed overlap, so K stays constant) */
const calib = (() => { const F = MN, o = ppOverlap({ d: 3, F, s: 1, E: 0.0005 }); return { Kf3: sv3(0.0005, o.eta) / (OMEGA[3] * o.M ** 2), f3: leptonF(B_OURS) }; })(); // our S(0) is the real deuteron's: its phase space at the measured binding
/* the computed thermal rate in d dimensions, fm^d c: ∫ K Ω |M(E)|² f P_d(E) dE, P_d = E^(d/2−1) e^(−E/kT)/(Γ(d/2)(kT)^(d/2)) */
const GAMMA = { 3: Math.sqrt(Math.PI) / 2, 4: 1 };
function rateNew(d, F, s, T, Es) {
  const kT = KB_MEV * T, dt = deuteron(d, F, s); if (!dt) return null;
  const fr = d === 3 ? 1 : leptonF(dt.B) / calib.f3; // ours is the calibration itself (the measured S belongs to the real deuteron, not the model's 2.20 MeV) if (!fr) return { B: dt.B, rate: 0, fr: 0 };
  let tot = 0;
  for (let i = 0; i < Es.length - 1; i++) { const E = Math.sqrt(Es[i] * Es[i + 1]), dE = Es[i + 1] - Es[i], o = ppOverlap({ d, F, s, E });
    tot += calib.Kf3 * fr * OMEGA[d] * o.M ** 2 * (E ** (d / 2 - 1) * Math.exp(-E / kT)) / (GAMMA[d] * kT ** (d / 2)) * dE; }
  return { B: dt.B, rate: tot, fr };
}
/* the old formula: σ = S̃ e^(−G(E; r)) / k^(d−1), S̃ ours (σ k² e^G at 10 keV with the runs' 3D radius 2.4 fm) */
const op = (d, r) => ({ Z1: 1, Z2: 1, mu: (1 / 2) * 931.494, rn: r, d });
const kOf = (E) => Math.sqrt(2 * MU * E) / HBARC;
const St = (() => { const E = 0.01, o = op(3, 2.4), eta = (1.43996 * Math.sqrt(MU / (2 * E))) / HBARC; return ((keVb(S0) / E) * Math.exp(-2 * Math.PI * eta)) * kOf(E) ** 2 * Math.exp(gamow(E, o)); })();
function rateOld(d, T, r, Es) {
  const kT = KB_MEV * T, o = op(d, r); let tot = 0;
  for (let i = 0; i < Es.length - 1; i++) { const E = Math.sqrt(Es[i] * Es[i + 1]), dE = Es[i + 1] - Es[i];
    tot += (St * Math.exp(-gamow(E, o))) / kOf(E) ** (d - 1) * vrel(E) * (E ** (d / 2 - 1) * Math.exp(-E / kT)) / (GAMMA[d] * kT ** (d / 2)) * dE; }
  return tot;
}
/* the energies that matter: a window round the Gamow peak E₀ (where e^(−E/kT − G) peaks), E₀/5 to 6E₀; the integrand
   at its edges is checked below to be negligible */
const peakE = (d, T) => { const kT = KB_MEV * T, o = op(d, 2); let best = 0, bv = -Infinity; for (let E = kT / 20; E < 60 * kT; E *= 1.03) { const v = -E / kT - gamow(E, o); if (v > bv) { bv = v; best = E; } } return best; };
const grid = (T, d = 3, lo = 0.2, hi = 6, n = 40) => { const E0 = peakE(d, T), out = []; for (let i = 0; i <= n; i++) out.push(E0 * lo * Math.pow(hi / lo, i / n)); return out; };
/* r_eff: the radius at which the old formula matches (the old rate rises with r, as r^2 in 4D) */
function rEff(d, F, s, T) {
  const Es = grid(T, d), nw = rateNew(d, F, s, T, Es); if (!nw || !nw.rate) return { ...nw, r: null };
  let a = 0.05, b = 4000; for (let i = 0; i < 60; i++) { const m = Math.sqrt(a * b); if (rateOld(d, T, m, Es) < nw.rate) a = m; else b = m; }
  return { ...nw, r: Math.sqrt(a * b), old1: rateOld(d, T, 1, Es), old4: rateOld(d, T, 4, Es) };
}
const TS = [5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7];

if (cmd === "check") {
  const dt = deuteron(3, MN, 1);
  for (const E of [0.0005, 0.002, 0.01, 0.03]) { const o = ppOverlap({ d: 3, F: MN, s: 1, E }); console.log(`ours, Minnesota, E ${E * 1000} keV: Λ² ${lambda2(o, dt.gamma).toFixed(3)}`); }
  // S(E) ∝ Λ²(E) f(B + E): its slope at low energy against our measured 11.2 MeV⁻¹ (Adelberger et al. 2011)
  const o1 = ppOverlap({ d: 3, F: MN, s: 1, E: 0.001 }), o2 = ppOverlap({ d: 3, F: MN, s: 1, E: 0.011 });
  const S = (o, E) => lambda2(o, dt.gamma) * leptonF(dt.B + E);
  console.log(`S'/S from the overlap and the phase space: ${(Math.log(S(o2, 0.011) / S(o1, 0.001)) / 0.01).toFixed(2)} MeV⁻¹ (measured 11.2)`);
  const T = 1.57e7, Es = grid(T), nw = rateNew(3, MN, 1, T, Es).rate, old = rateOld(3, T, 2.4, Es), wide = rateNew(3, MN, 1, T, grid(T, 3, 0.05, 15, 90)).rate;
  console.log(`the window round the Gamow peak holds ${(100 * nw / wide).toFixed(2)}% of a 20× wider window's rate (3D, 15.7 MK)`);
  { const T4 = 1.5e7, w4 = rateNew(4, MN, 1.5152, T4, grid(T4, 4)).rate, W4 = rateNew(4, MN, 1.5152, T4, grid(T4, 4, 0.05, 15, 90)).rate; console.log(`and in 4D (deuteron as ours, 15 MK): ${(100 * w4 / W4).toFixed(2)}%`); }
  console.log(`ours at the Sun's centre: computed ⟨σv⟩ ${nw.toExponential(3)} fm³c, old formula (2.4 fm) ${old.toExponential(3)}: ratio ${(nw / old).toFixed(3)}`);
} else if (cmd === "sunpace") {
  // a Sun-paced core at the computed radius: read nuclei.mjs's `hburn pp=<r> s=<s>` zones (the temporary cache) and
  // interpolate in temperature to where the pace equals our Sun's centre's, for each draw of the core; kept in ppfusion.json
  const { readFileSync, existsSync } = await import("node:fs"), r = process.argv[3] ?? "3.73", f = `${process.env.TMPDIR ?? "/tmp"}/atom4-nuclei/hburn-pp${r}.json`;
  if (!existsSync(f)) { console.error(`no ${f}: run node four/atom/tools/nuclei.mjs hburn pp=${r} s=1.5152`); process.exit(1); }
  const hb = JSON.parse(readFileSync(f, "utf8")), out = [];
  for (const compact of [false, true]) {
    const rows = hb.rows.filter((q) => q.compact === compact).sort((a, b) => a.T - b.T), pace = rows.map((q) => q.life - hb.sun);
    const i = pace.findIndex((p, k) => k > 0 && pace[k - 1] < 0 && p >= 0), t = -pace[i - 1] / (pace[i] - pace[i - 1]), A = rows[i - 1], B = rows[i];
    const T = A.T + t * (B.T - A.T), mix = {}; for (const z of new Set([...Object.keys(A.mass), ...Object.keys(B.mass)])) { const v = (A.mass[z] ?? 0) * (1 - t) + (B.mass[z] ?? 0) * t; if (v > 0.01) mix[z] = +v.toFixed(3); }
    out.push({ draw: compact ? "close" : "loose", T_MK: +(T / 1e6).toFixed(2), mix });
    console.log(`p–p ${r} fm, ${compact ? "close" : "loose"} draw: a Sun-paced core burns at ${(T / 1e6).toFixed(2)} MK into ${Object.entries(mix).map(([z, v]) => `element ${z} ${(100 * v).toFixed(0)}%`).join(", ")}`);
  }
  const file = new URL("./ppfusion.json", import.meta.url), j = JSON.parse(readFileSync(file, "utf8")); j.sunPace = { pp_fm: +r, s: 1.5152, force: "MN", rows: out }; writeFileSync(file, JSON.stringify(j, null, 1) + "\n"); console.log("added to tools/ppfusion.json");
} else if (cmd === "scan") {
  // across each force's window: the deuteron's binding, whether p + p runs, and r_eff at 15 MK (it barely moves with T)
  const bisect = (F, Bt) => { let a = 1, b = 2.5; for (let i = 0; i < 40; i++) { const m = (a + b) / 2, dt = deuteron(4, F, m); if (dt && dt.B > Bt) b = m; else a = m; } return (a + b) / 2; };
  for (const [name, { F, s4 }] of Object.entries(FORCES)) {
    const sBeta = bisect(F, 1.29333 + 0.510999), sPep = bisect(F, 1.29333 - 0.510999);
    console.log(`${name}: window ${s4[0]}–${s4[2]} (deuteron as ours at ${s4[1]}); p + p → d e⁺ ν opens at s = ${sBeta.toFixed(4)} (B_d 1.804 MeV), p + e⁻ + p → d ν at s = ${sPep.toFixed(4)} (B_d 0.782 MeV)`);
    for (let k = 0; k <= 8; k++) { const s = sBeta + ((s4[2] - sBeta) * k) / 8, r = rEff(4, F, s, 1.5e7); console.log(`  s ${s.toFixed(4)}: B_d ${r.B.toFixed(3)} MeV, phase space ×${r.fr.toPrecision(3)}, r_eff ${r.r == null ? "—" : r.r.toFixed(2)} fm, ÷ old(4 fm) ${r.old4 ? (r.rate / r.old4).toPrecision(3) : "—"}`); }
  }
} else if (cmd === "table" || cmd === "bake") {
  const rows = [];
  for (const [name, { F, s4 }] of Object.entries(FORCES)) for (const s of s4) {
    const per = TS.map((T) => ({ T, ...rEff(4, F, s, T) }));
    const B = per[0].B, row = { force: name, s, B, endpoint_MeV: B == null ? null : +(B - 1.29333 - 0.510999).toFixed(4), phase: per[0].fr, rEff: per.map((p) => (p.r == null ? null : +p.r.toFixed(3))), vsOld1: per.map((p) => (p.rate && p.old1 ? +(p.rate / p.old1).toPrecision(3) : null)), vsOld4: per.map((p) => (p.rate && p.old4 ? +(p.rate / p.old4).toPrecision(3) : null)) };
    rows.push(row);
    console.log(`${name} s=${s}: deuteron ${B == null ? "unbound" : B.toFixed(3) + " MeV"}, positron endpoint ${row.endpoint_MeV} MeV, phase space ×${(per[0].fr ?? 0).toFixed(3)} of ours; r_eff ${row.rEff.map((r) => (r == null ? "—" : r.toFixed(2))).join(" / ")} fm at ${TS.map((t) => t / 1e6).join("/")} MK; computed ÷ old(1 fm) ${row.vsOld1.join(" / ")}`);
  }
  if (cmd === "bake") {
    // ours, the checks: Λ² at 2 keV and the Sun's centre against the old formula; and where, in each force's window, p + p opens
    const dt = deuteron(3, MN, 1), o = ppOverlap({ d: 3, F: MN, s: 1, E: 0.002 }), T = 1.57e7, Es = grid(T);
    const ours = { lambda2: +lambda2(o, dt.gamma).toFixed(3), sunRatio: +(rateNew(3, MN, 1, T, Es).rate / rateOld(3, T, 2.4, Es)).toFixed(4) };
    const bisect = (F, Bt) => { let a = 1, b = 2.5; for (let i = 0; i < 40; i++) { const m = (a + b) / 2, d4 = deuteron(4, F, m); if (d4 && d4.B > Bt) b = m; else a = m; } return (a + b) / 2; };
    const opens = Object.fromEntries(Object.entries(FORCES).map(([n, { F, s4 }]) => { const sb = bisect(F, 1.29333 + 0.510999), sp = bisect(F, 1.29333 - 0.510999); return [n, { window: [s4[0], s4[2]], ours: s4[1], beta: +sb.toFixed(4), pep: +sp.toFixed(4), closedShare: +((sb - s4[0]) / (s4[2] - s4[0])).toFixed(3) }]; }));
    writeFileSync(new URL("./ppfusion.json", import.meta.url), JSON.stringify({ about: "tools/ppfusion.mjs: 4D proton + proton → deuteron from the strong force; r_eff is the radius at which the burning runs' old barrier formula gives the same thermal rate", temperatures_K: TS, ours, opens, rows }, null, 1) + "\n"); console.log("wrote tools/ppfusion.json", JSON.stringify({ ours, opens }));
  }
}
