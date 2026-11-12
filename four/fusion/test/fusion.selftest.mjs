/* How stars burn: the network on REACLIB's rates, checked. node four/fusion/test/fusion.selftest.mjs (~2 s) */
import { STAGES, run, toX, toY, NUC, IDX, RX, constants, fluxes, energy, lambda } from "../js/net.js";
let fails = 0; const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
const rx = (r, p, ec = false) => RX.find((x) => x.r.join() === r && x.p.join() === p && x.ec === ec);
// 1. p + p from REACLIB against the textbook non-resonant formula with S(0) = 4.01 × 10⁻²⁵ MeV b (Adelberger et al. 2011)
{ const T9 = 0.015, mu = 0.5, nr = 7.83e9 * Math.cbrt(1 / (mu * T9 * T9)) * 4.01e-25 * Math.exp(-4.2487 * Math.cbrt(mu / T9)), rl = lambda(rx("p,p", "d"), T9);
  ok(Math.abs(rl / nr - 1) < 0.15, `p + p at 15 MK: REACLIB ${rl.toExponential(3)} against the S(0) formula ${nr.toExponential(3)} cm³/mol/s`); }
// 2. triple-alpha against its Hoyle-resonance term, 2.79 × 10⁻⁸ T9⁻³ e^(−4.4027/T9) (Caughlan & Fowler 1988), at 0.2 GK
{ const T9 = 0.2, cf = 2.79e-8 * T9 ** -3 * Math.exp(-4.4027 / T9), rl = lambda(rx("he4,he4,he4", "c12"), T9);
  ok(Math.abs(rl / cf - 1) < 0.3, `triple-alpha at 0.2 GK: REACLIB ${rl.toExponential(3)} against CF88's resonant term ${cf.toExponential(3)}`); }
// 3. the stages, chained: mass kept, and the textbook ash
const done = {}, YR = 3.156e7; const X = (k, i) => toX(done[k].Y)[IDX[i]];
for (const st of STAGES) { const X0 = st.from ? Object.fromEntries(toX(done[st.from].Y).map((x, i) => [NUC[i].k, x]).filter(([, x]) => x > 1e-12)) : st.X0; done[st.key] = run({ ...st, X0 });
  const m = toX(done[st.key].Y).reduce((a, b) => a + b, 0); ok(Math.abs(m - 1) < 1e-6 * 50, `${st.key}: mass fractions sum to ${m.toFixed(8)} after ${done[st.key].snaps.length} steps`); }
ok(X("pp", "he4") > 0.97 && X("cno", "he4") > 0.97 && X("cno", "n14") > X("cno", "c12") + X("cno", "o16"), "hydrogen ends as helium, and CNO leaves its catalysts as nitrogen-14");
ok(X("he", "o16") > 0.4 && X("he", "c12") > 0.2, `helium ends as carbon and oxygen (C ${X("he", "c12").toFixed(2)}, O ${X("he", "o16").toFixed(2)})`);
ok(X("c", "ne20") > 0.3 && X("c", "o16") > 0.3, "carbon burning makes neon (and leaves the oxygen)");
ok(X("ne", "o16") > 0.5 && X("ne", "mg24") > 0.08, "neon burning leaves oxygen and magnesium");
ok(X("o", "si28") > 0.4 && X("o", "s32") > 0.2, "oxygen burning makes silicon and sulfur");
ok(X("si", "ni56") > 0.6, `silicon burning ends at nickel-56 (${X("si", "ni56").toFixed(2)})`);
// 4. order of the stages' lengths: each later stage is faster (helium excepted against CNO only by its conditions)
const t = Object.fromEntries(STAGES.map((s) => [s.key, done[s.key].t]));
ok(t.pp > t.cno && t.cno > t.he && t.he > t.c && t.c > t.ne && t.c > t.o && t.o > t.si, `stages shorten: ${STAGES.map((s) => `${s.key} ${(t[s.key] / YR).toPrecision(2)} yr`).join(", ")}`);
// 5. energy: the pp chains in steady state release ≈ 26.73 MeV per helium-4 made (Q values summed through the chains)
{ const R = done.pp, s = R.snaps.find((x) => x.Y[IDX.p] < 0.6), fl = fluxes(s.Y, R.k), eps = energy(fl), made = fl.reduce((a, f, i) => a + f * (RX[i].p.filter((x) => x === "he4").length - RX[i].r.filter((x) => x === "he4").length), 0);
  const perHe = eps / (made * 6.02214076e23 * 1.602176634e-6); ok(Math.abs(perHe - 26.73) < 0.5, `pp chains: ${perHe.toFixed(2)} MeV released per helium-4 made (4 protons − helium-4: 26.73)`); }
// 6. the knobs (life.js): carbon + helium → oxygen ×3 leaves less carbon after helium burning, and a rate and its reverse move together
{ const { runLife, defaults, KNOBS, knobReactions } = await import("../js/life.js"); const c = defaults(); c.mult.c12a = 3; const L = runLife(c), C = toX(L[2].Y)[IDX.c12];
  ok(C < 0.5 * X("he", "c12"), `¹²C(α,γ) ×3: helium burning leaves carbon ${C.toFixed(2)} against ${X("he", "c12").toFixed(2)}`);
  const ids = knobReactions(KNOBS.find((k) => k.key === "o16a")); ok(ids.length === 2 && ids.some((i) => RX[i].r.length === 1), "a knob turns a capture and its photodisintegration together"); }
// 7. the 4D network (data4.js from tools/rates4.mjs): mass kept through three stages; no ceryllium cycle (the triton-like
// cluster binds to ceryllium-8 more strongly than a helium-4 holds together, so element 5-11 + p can't throw one out:
// plusmore, computed); the pp-II branch's (p,α) open; the computed captures in use; the two-neutron isotopes β⁻ decaying
// in milliseconds; and a Sun-paced core at s = 1.5152 burning past helium, to pxygen-20
{ const { model, STRENGTHS } = await import("../js/net4.js"); const s = STRENGTHS.includes(1.5152) ? 1.5152 : STRENGTHS[0], m = model(s), X0 = { "1-1": 0.75, "2-4": 0.25 };
  const T1 = m.sunPace(X0), r1 = m.run({ T: T1, X0, fuel: "1-1" }), ash = (Y) => Object.fromEntries(m.toX(Y).map((x, i) => [m.species[i].key, x]).filter(([, x]) => x > 1e-9));
  const r2 = m.run({ T: 2.5e7, X0: ash(r1.Y), fuel: "2-4" }), r3 = m.run({ T: 2.71e8, X0: ash(r2.Y), fuel: "4-8", until: 1e-2 }), sum = (Y) => m.toX(Y).reduce((a, b) => a + b, 0);
  ok([r1, r2, r3].every((r) => Math.abs(sum(r.Y) - 1) < 1e-6), `4D (s = ${s}): mass kept through hydrogen, helium and ceryllium (${[r1, r2, r3].map((r) => sum(r.Y).toFixed(8)).join(", ")})`);
  const B = (k) => m.species[m.idx[k]].B, Q = B("4-8") + m.M.Ba - B("5-11"), pa = m.rx.filter((r) => r.alphaOpen != null).map((r) => r.r[1]);
  ok(Q < 0 && !pa.includes("5-11") && pa.includes("3-7"), `4D: 5-11 + p → ceryllium-8 + ⁴He is closed (Q ${Q.toFixed(1)} MeV), so no ceryllium cycle; ⁷X + p → 2 ⁴He (pp-II's) is open`);
  ok(m.rx.filter((r) => /^computed/.test(r.how)).length >= 7, `4D: ${m.rx.filter((r) => /^computed/.test(r.how)).length} reactions from the book's own calculations (p + p, ⁴He + ⁴He, p and ⁴He onto 2–4 ⁴He)`);
  const nr = ["4-10", "6-14", "8-18"].map((k) => m.species[m.idx[k]]?.half); ok(nr.every((h) => h != null && h < 1), `4D: the two-neutron isotopes of 4, 6 and 8 β⁻ decay in ${nr.map((h) => (1e3 * h).toFixed(0)).join(", ")} ms`);
  const X1 = m.toX(r1.Y); ok(X1[m.idx["10-20"]] > 0.5, `4D: a Sun-paced core at ${(T1 / 1e6).toFixed(1)} MK burns hydrogen past helium, to pxygen-20 (${X1[m.idx["10-20"]].toFixed(2)})`); }
// 8. the widget's 4D world (world.js): its names are the book's (atom/js/names.js), switching worlds through the address
// gives that world's standard star, and a 4D life through the widget's own path keeps mass and agrees with net4 directly
{ const W = await import("../js/world.js"), Lf = await import("../js/life.js"), { names } = await import("../../atom/js/names.js"), { TABLE } = await import("../../atom/js/table.js");
  const N = names(TABLE, 4), bad = Object.keys(W.NAME4).filter((Z) => N.get(+Z)?.name !== W.NAME4[Z] || N.get(+Z)?.sym !== W.SYM4[Z]).concat([6, 8, 16].filter((Z) => N.get(Z)?.name));
  ok(!bad.length, `4D names and symbols in world.js match names.js${bad.length ? `: not ${bad}` : ""}`);
  const c = Lf.decode("#" + encodeURIComponent(JSON.stringify({ w: "4d", s: 1.5152 }))), L4 = Lf.runLife(c), mass = (Y) => W.toX(Y).reduce((a, b) => a + b, 0);
  ok(W.WORLD === "4d" && c.he === 0.25 && L4.length === 3 && L4.every((R) => Math.abs(mass(R.Y) - 1) < 1e-6) && W.toX(L4[0].Y)[W.IDX["10-20"]] > 0.5, `the widget's 4D world: three stages, mass kept, the first ending pxygen-20 ${W.toX(L4[0].Y)[W.IDX["10-20"]].toFixed(2)} as net4 alone gives`);
  const c0 = Lf.decode(""); ok(W.WORLD === "ours" && Lf.runLife(c0).length === 7, "an address without a world is ours again: seven stages"); }
console.log(fails ? `\n✗ ${fails} failed` : "\n✓ fusion selftest passed"); process.exit(fails ? 1 : 0);
