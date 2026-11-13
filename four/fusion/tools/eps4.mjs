/* The 4D network's burning as an absolute energy law, for the main sequence (paper 2's window C: do 4D stars live long?).
   The network (fusion/data4.js, js/net4.js) knows every rate relative to proton + proton's, at a reference density; the
   star solver (atom/js/mainseq.js) works in SI, kg/m⁴ in 4D. They meet through proton + proton itself: atom/tools/
   mainseq.mjs's absolute 4D rate, ⟨σv⟩ = S̃ c (ħc)³ I(T) / (2 μ² (kT)²), with S̃ our p + p's nuclear factor carried (the
   stated choice), through the same 4 fm barrier the network uses, × the computed nuclear factor ppx and 4D's weak factor
   as the network carries them. The network's k_pp(T) = n_b ⟨σv⟩ at its reference density, so
       ρ_ref(T) = m_u k_pp,net(T) / ⟨σv⟩_abs(T)
   and running the network at rhoX = ρ/ρ_ref(T) is burning at the absolute density ρ. Every 4D two-body rate shares the
   1/(μ²(kT)²) form (the network's ratio law carries the μ²), so one ρ_ref(T) serves them all.
   At each (T, ρ) a fresh primordial core (hydrogen 0.75, helium-4 0.25 by mass) burns at constant T and ρ until half its
   hydrogen is gone: t½, and ε̄ = (energy released by then)/(mass × t½), the mean energy rate over the first half of the
   core's hydrogen, catalysts built up as they are in a real core. The energy is the loss of atomic rest mass,
   M(Z, N) = Z m_H + N m_n − B; the neutrinos' share is not taken off (ours' pp chains lose ~2%). Where half isn't burnt by
   10²² s, t½ is null and ε̄ the run's own mean.
   With ALT=<a copy of four/ baked under the other mass model> it writes that model's table as well.
     node four/fusion/tools/eps4.mjs                    → four/fusion/eps4.json (~15 min a model) */
import { writeFileSync } from "node:fs";
import { logRate, KB_MEV } from "../../atom/js/stars.js";
import { gamow } from "../../atom/js/stars.js";

const AMU = 931.494, HBC = 197.327, MU_KG = 1.66053906660e-27, MEV_J = 1.602176634e-13, C = 2.99792458e8, YR = 3.15576e7;
const MH = 938.783, MN_ = 939.565; // the hydrogen atom and the neutron, MeV
const TS = Array.from({ length: 31 }, (_, i) => 1e6 * 10 ** (i / 15)), RHOS = Array.from({ length: 11 }, (_, i) => 1e13 * 10 ** (i / 2));
const X0 = { "1-1": 0.75, "2-4": 0.25 };
// our p + p's nuclear factor S̃ at 10 keV through our 2.4 fm barrier, the book's yardstick (as rates4 and mainseq)
const op = (d, Z1, A1, Z2, A2, r0) => ({ Z1, Z2, mu: ((A1 * A2) / (A1 + A2)) * AMU, rn: r0 * (Math.pow(A1, 1 / d) + Math.pow(A2, 1 / d)), d });
const pp3 = op(3, 1, 1, 1, 1, 1.2), AL = 1 / 137.035999;
const St3 = (S, E, o) => { const eta = o.Z1 * o.Z2 * AL * Math.sqrt(o.mu / (2 * E)), k2 = (2 * o.mu * E) / HBC ** 2; return ((S / 1000) * 100 / E) * Math.exp(-2 * Math.PI * eta) * k2 * Math.exp(gamow(E, o)); };
const SPP = St3(4.01e-22, 0.01, pp3), opp4 = { ...op(4, 1, 1, 1, 1, 1.0), rn: 4 };
/* the absolute 4D p + p ⟨σv⟩ (m⁴/s) with nuclear factor S̃ × f */
const svpp = (T, f) => { const kT = KB_MEV * T; return ((SPP * f * C * HBC ** 3 * 1e-45) / (2 * opp4.mu ** 2 * kT * kT)) * Math.exp(logRate(T, opp4)); };

async function table(dir, label) {
  const { model, STRENGTHS } = await import(`${dir}/four/fusion/js/net4.js`), { NET4, TGRID } = await import(`${dir}/four/fusion/data4.js`);
  const out = {};
  for (const s of STRENGTHS) {
    const m = model(s), M = NET4[s], ppx = M.ppx, ppR = M.weak?.ppR ?? 1, rx = M.reactions.find((r) => r.r.join() === "1-1,1-1" && r.p.join() === "1-2");
    const kNet = (T) => { const lt = Math.log(T), g = TGRID.map(Math.log); let i = 0; while (i < g.length - 2 && g[i + 1] < lt) i++; const f = (lt - g[i]) / (g[i + 1] - g[i]); return Math.exp(Math.log(rx.k[i]) * (1 - f) + Math.log(rx.k[i + 1]) * f); };
    const rhoRef = (T) => (MU_KG * kNet(T)) / svpp(T, ppx * ppR);
    const Matom = M.species.map((x) => x.Z * MH + x.N * MN_ - x.B), Y0 = m.toY(X0), H = m.idx["1-1"];
    const grid = [];
    for (const T of TS) { const row = [];
      for (const rho of RHOS) { const r = m.run({ T, rhoX: rho / rhoRef(T), X0, fuel: "1-1", until: 0.5, tmax: 1e22 * 1.0, maxSteps: 4000 });
        const half = r.Y[H] <= 0.5 * Y0[H] * 1.0005, dM = Matom.reduce((t, mA, i) => t + (r.Y[i] - Y0[i]) * mA, 0), E = (-dM * MEV_J) / MU_KG; // J/kg
        row.push({ th: half ? +r.t.toPrecision(5) : null, eps: r.t > 0 ? +(E / r.t).toPrecision(5) : 0 }); }
      grid.push(row); }
    out[s] = { mass: M.mass ?? "mixed", ppx, ppR, rhoRef: TS.map((T) => +rhoRef(T).toPrecision(5)), grid };
    const c = grid[TS.findIndex((T) => T >= 1.5e7)][RHOS.findIndex((x) => x >= 1e15)];
    console.log(`${label} s ${s}: ρ_ref ${rhoRef(1e7).toExponential(2)}–${rhoRef(5e7).toExponential(2)} kg/m⁴ (10–50 MK); at 15 MK, 10¹⁵ kg/m⁴: t½ ${c.th ? (c.th / YR / 1e9).toPrecision(3) + " Gyr" : "—"}, ε̄ ${c.eps.toExponential(2)} W/kg`);
  }
  return out;
}

const here = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const out = { about: "fusion/tools/eps4.mjs: the 4D network as an absolute energy law. T (K) × ρ (kg/m⁴); per strength, per mass model: t½ (s, the time a fresh primordial core at fixed T, ρ takes to burn half its hydrogen; null if not by 1e22 s) and ε̄ (W/kg, the energy released by then over t½)", T: TS, rho: RHOS, models: {} };
const main = await table(here, "main"); out.models[Object.values(main)[0].mass] = main;
if (process.env.ALT) { const alt = await table(process.env.ALT, "alt"); out.models[Object.values(alt)[0].mass] = alt; }
writeFileSync(new URL("../eps4.json", import.meta.url), JSON.stringify(out));
console.log(`wrote four/fusion/eps4.json (${Object.keys(out.models).join(", ")})`);
