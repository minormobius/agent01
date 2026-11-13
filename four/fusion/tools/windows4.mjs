/* The windows (paper 2's spine): the plane of the two nuclear choices, the strong force's strength s and the weak
   force's G₄ (log₁₀ over G_F/M_W), at each clock of the first minutes (gravity's; scanned), with every constraint the
   book has so far drawn on it, each from its own calculation:
     the deuteron binds            s > 1.400        (nuclear.js window; Minnesota)
     the diproton doesn't          s < 1.891        (the same; else two protons fuse by the strong force alone)
     p + p makes a deuteron        B_d > 1.804 MeV  (the positron's endpoint; nuclear.js deuteron)
     the first minutes leave       Y ≤ ½            (weak.js neutronFraction → bbn.js firstMinutes at B_d(s); one clock
       half the hydrogen                              for freeze-out and the bottleneck, declared)
   and, where the network has been baked (data4.js's eight strengths), what a Sun-paced core's hydrogen burning makes at
   each G₄ (net4.js; the weak reactions × (G₄/G₄,baked)²): helium, stranded as helium-3, or climbing past helium.
   With ALT=<a directory holding a copy of four/ whose data4.js was baked under the other mass model (nuc4.mjs MASS=…)>
   the same burning under it too (burnAlt), so the figure shows where the mass model decides the outcome.
   Writes papers/p2/data/windows.json and prints how much of the plane each constraint leaves.
     node four/fusion/tools/windows4.mjs                (~10 min; ×1.5 with ALT) */
import { writeFileSync, mkdirSync } from "node:fs";
import { deuteron, MN } from "../../atom/js/nuclear.js";
import * as W from "../../atom/js/weak.js";
import { firstMinutes } from "../../atom/js/bbn.js";
import { model, STRENGTHS } from "../js/net4.js";
import { NET4 } from "../data4.js";

const S = Array.from({ length: 50 }, (_, i) => +(1.40 + (i * (1.891 - 1.40)) / 49).toFixed(4)), GX = Array.from({ length: 17 }, (_, i) => 3 + i * 0.25);
const CLOCKS = [0.01, 0.1, 1, 10, 100], S_DEUT = 1.4002, S_DIPROTON = 1.8909, PP_MIN = W.Q_NP + W.ME;
const Bd = Object.fromEntries(S.map((s) => [s, deuteron(4, MN, s)?.B ?? 0]));
// the first minutes: the frozen neutrons depend only on G₄ and the clock; the bottleneck on B_d(s)
const bbn = {};
for (const t1 of CLOCKS) for (const gx of GX) { const G = W.G4_REF * 10 ** gx, n = W.neutronFraction(4, G, { t1 }), tau = W.neutronLife(4, G);
  for (const s of S) bbn[`${t1}|${gx}|${s}`] = firstMinutes({ d: 4, B: Bd[s], t1, Tf: n.Tf, tau }).Y; }
const box = S.length * GX.length, rows = [];
console.log(`the plane: s ${S[0]}–${S.at(-1)} (the deuteron bound), log₁₀ G₄/(G_F/M_W) ${GX[0]}–${GX.at(-1)}`);
for (const t1 of CLOCKS) {
  let pp = 0, h = 0; const grid = S.map((s) => GX.map((gx) => { const okPP = Bd[s] > PP_MIN && s < S_DIPROTON, Y = bbn[`${t1}|${gx}|${s}`], okH = Y <= 0.5; if (okPP) pp++; if (okPP && okH) h++; return { Y: +Y.toFixed(3), okPP, okH }; }));
  rows.push({ t1, grid }); console.log(`clock ${t1} s: p + p opens and no diproton: ${((100 * pp) / box).toFixed(0)}% of the plane; and half the hydrogen survives the first minutes: ${((100 * h) / box).toFixed(0)}%`);
}
// hydrogen burning at the baked strengths, across G₄
const X0 = { "1-1": 0.75, "2-4": 0.25 };
function burnAll(model, STRENGTHS, tag) { const burn = [];
  for (const s of STRENGTHS) { const m = model(s), gx0 = m.M.weak?.G4X ?? 5.2, weak = m.rx.filter((r) => r.kind === "beta" || r.kind === "ec").map((r) => r.id);
    for (const gx of GX.filter((g) => g >= 4 && g <= 7 && Number.isInteger(g * 2))) { const f = 10 ** (2 * (gx - gx0)), mult = Object.fromEntries(weak.map((id) => [id, f]));
      const T = m.sunPace(X0, { mult }), X = m.toX(m.run({ T, X0, fuel: "1-1", mult }).Y), he4 = X[m.idx["2-4"]], he3 = X[m.idx["2-3"]], past = m.species.reduce((t, x, i) => t + (x.A >= 8 ? X[i] : 0), 0);
      const kind = he3 > 0.5 ? "helium-3" : he4 > 0.5 ? "helium" : past > 0.5 ? "past helium" : "mixed"; burn.push({ s, gx, T, he4, he3, past, kind });
      process.stdout.write(`  ${tag} s ${s} G₄ 10^${gx}: ${(T / 1e6).toFixed(1)} MK, ${kind}\n`); } }
  return burn; }
const MASS = Object.values(NET4)[0]?.mass ?? "mixed", burn = burnAll(model, STRENGTHS, MASS);
let burnAlt = null, MASS_ALT = null;
if (process.env.ALT) { const alt = await import(`${process.env.ALT}/four/fusion/js/net4.js`), D4 = await import(`${process.env.ALT}/four/fusion/data4.js`);
  MASS_ALT = Object.values(D4.NET4)[0]?.mass ?? "mixed"; burnAlt = burnAll(alt.model, alt.STRENGTHS, MASS_ALT); }
mkdirSync(new URL("../../papers/p2/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../papers/p2/data/windows.json", import.meta.url), JSON.stringify({ about: "tools/windows4.mjs: the strong and weak windows on one plane, per clock; Y the first minutes' helium; burn the Sun-paced core's hydrogen burning at the baked strengths under the mass model mass (burnAlt under massAlt)", S, GX, CLOCKS, S_DEUT, S_DIPROTON, PP_MIN, Bd, rows, mass: MASS, burn, massAlt: MASS_ALT, burnAlt }));
console.log("wrote papers/p2/data/windows.json");
