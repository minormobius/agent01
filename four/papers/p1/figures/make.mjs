/* Paper 1's figures, as SVG, computed from the bake (atom/js/table.js), the law calculations (laws.js) and the
   kernel. build.mjs writes them into papers/p1/figures/ with the rest of the data, so selftest 67 fails if one goes
   stale. Each figure's caption lives here beside it (CAPTIONS), so the paper page and the process page read the same
   words. Figure numbers follow OUTLINE.md's plan (L* the law, F* the table, C* the counterfactual). */
import { panel, series, legend, figure, text, CAT, MUTE } from "./plot.js";
import { gaussLaw, shellSplit } from "../laws.js";
import { farPull } from "../far.js";
import { k4 } from "../../../atom/js/kernel.js";
import { TABLE, RPLOT, SHELL_COUNTERFACTUAL } from "../../../atom/js/table.js";
import { SYM, IE_REAL, realConfig, isNoble } from "../../../atom/js/periodic.js";

const EV = 27.211386245988, B = CAT[0], V = CAT[1], G = CAT[2], P = CAT[3], O = CAT[4], K = CAT[6];
const norm = (c) => c.split(" ").sort().join(" ");

/* L1 · Gauss's law has no atom */
function L1() {
  const r0s = [1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 3e-6, 1e-6], alphas = [[0.55, B], [0.7, V], [1.0, G]];
  const a = panel({ w: 380, h: 300, x: [1e-6, 1e-2], y: [1e-2, 1e12], logx: true, logy: true, xl: "grid's inner end r₀ (bohr)", yl: "|ε| of the lowest level (hartree)", tag: "a", yticks: [1e-2, 1e1, 1e4, 1e7, 1e10] });
  let s = "";
  for (const [al, c] of alphas) { const pts = gaussLaw(al, r0s).filter((g) => g.bound).map((g) => [g.r0, -g.e, `α = ${al}, r₀ = ${g.r0}: ε = ${g.e.toExponential(3)} Ha`]); s += series(a, { pts, c, dots: true }); }
  s += legend(a, alphas.map(([al, c]) => ({ label: `α = ${al}`, c })), "tr");
  // b: where the fall begins — the lowest level's ε·r₀² against α (zero below ½)
  const al = Array.from({ length: 31 }, (_, i) => 0.3 + i * 0.02);
  const b = panel({ ox: 390, w: 380, h: 300, x: [0.3, 0.9], y: [0, 0.02], xl: "strength α of the pull −α/r²", yl: "ε · r₀² (scale-free: no Bohr radius)", tag: "b" });
  const pts = al.map((x) => { const g = gaussLaw(x, [1e-4])[0]; return [x, g.bound ? -g.e * 1e-8 : 0, g.bound ? `α = ${x.toFixed(2)}: −ε r₀² = ${(-g.e * 1e-8).toExponential(2)}` : `α = ${x.toFixed(2)}: no bound level`]; });
  s += series(b, { pts, c: K, dots: true, r: 2.6 });
  s += `<line x1="${b.sx(0.5)}" y1="${b.sy(0)}" x2="${b.sx(0.5)}" y2="${b.sy(0.02)}" stroke="${MUTE}" stroke-dasharray="4,3"/>` + text(b.sx(0.5) + 5, b.sy(0.018), "α = ½", { size: 10, fill: MUTE });
  s += text(b.sx(0.32), b.sy(0.0035), "nothing binds", { size: 10, fill: MUTE });
  return figure(780, 300, [a, b, s], "Gauss's law in four dimensions has no atom: the lowest level of −α/r² against the grid's inner end, and against α");
}

/* L2 · only 1/r keeps a shell together */
function L2() {
  const ps = Array.from({ length: 19 }, (_, i) => 0.6 + i * 0.05), sp = ps.map((p) => shellSplit(p));
  const a = panel({ w: 520, h: 300, x: [0.6, 1.5], y: [-20, 80], xl: "exponent p of the pull −1/rᵖ", yl: "splitting within a shell (% of its binding)", zero: true });
  let s = series(a, { pts: sp.map((x) => [x.p, 100 * x.split2, `p = ${x.p.toFixed(2)}: 2p − 2s = ${(100 * x.split2).toFixed(2)} %`]), c: B, dots: true });
  s += series(a, { pts: sp.map((x) => [x.p, 100 * x.split3, `p = ${x.p.toFixed(2)}: 3d − 3s = ${(100 * x.split3).toFixed(2)} %`]), c: V, dots: true });
  s += `<line x1="${a.sx(1)}" y1="${a.sy(-20)}" x2="${a.sx(1)}" y2="${a.sy(80)}" stroke="${MUTE}" stroke-dasharray="4,3"/>` + text(a.sx(1) + 5, a.sy(72), "p = 1: both exactly 0", { size: 10, fill: MUTE });
  s += legend(a, [{ label: "2p − 2s", c: B }, { label: "3d − 3s", c: V }], "tl");
  return figure(520, 300, [a, s], "Only a 1/r pull keeps a shell's levels together: the splittings within the second and third shells against the exponent p");
}

/* L3 · no shell theorem */
function L3() {
  const ts = Array.from({ length: 51 }, (_, i) => i / 50);
  const a = panel({ w: 380, h: 300, x: [0, 1], y: [0.8, 1.02], xl: "t = inner radius / outer radius", yl: "k(t): a shell's pull, over a point charge's", tag: "a" });
  let s = series(a, { pts: ts.map((t) => [t, 1]), c: V, dash: "6,4" }) + series(a, { pts: ts.map((t) => [t, k4(t), `k(${t.toFixed(2)}) = ${k4(t).toFixed(5)}`]), c: B });
  s += text(a.sx(0.98), a.sy(k4(1)) + 14, "k(1) = 8/3π", { size: 10, anchor: "end", fill: MUTE });
  s += legend(a, [{ label: "4D, pinned 1/r", c: B }, { label: "shell theorem (ours)", c: V, dash: "6,4" }], "bl");
  // b: the potential of a unit shell of radius 1, inside and out, against the shell theorem's
  const rs = Array.from({ length: 81 }, (_, i) => 0.025 + i * 0.05);
  const b = panel({ ox: 390, w: 380, h: 300, x: [0, 4], y: [0, 1.25], xl: "distance from the centre r (shell radius 1)", yl: "potential of the shell", tag: "b" });
  const pot4 = (r) => (r < 1 ? k4(r) : k4(1 / r) / r), pot3 = (r) => (r < 1 ? 1 : 1 / r);
  s += series(b, { pts: rs.map((r) => [r, pot3(r)]), c: V, dash: "6,4" }) + series(b, { pts: rs.map((r) => [r, pot4(r), `r = ${r.toFixed(2)}: ${pot4(r).toFixed(4)}`]), c: B });
  s += text(b.sx(0.06), b.sy(1.0) - 8, "centre: 3π/8 of the wall", { size: 10, fill: MUTE });
  return figure(780, 300, [a, b, s], "No shell theorem in four dimensions under the pinned 1/r: a shell's pull and potential against the shell theorem's");
}

/* F3 · first ionization energy against Z, both worlds */
function F3() {
  const t4 = TABLE[4], t3 = TABLE[3];
  const a = panel({ w: 520, h: 300, x: [0, 140], y: [0, 30], xl: "Z", yl: "first ionization energy (eV)", tag: "a  four dimensions", xticks: [0, 20, 40, 60, 80, 100, 120, 140] });
  let s = series(a, { pts: t4.map((e) => [e.Z, e.ion * EV, `${e.Z}: ${(e.ion * EV).toFixed(2)} eV, ${e.config}`]), c: B, w: 1.4 });
  s += series(a, { pts: t4.filter((e) => isNoble(e, 4)).map((e) => [e.Z, e.ion * EV, `noble gas ${e.Z}: ${(e.ion * EV).toFixed(2)} eV`]), c: B, dots: true, lineOn: false });
  for (const e of t4.filter((q) => isNoble(q, 4))) s += text(a.sx(e.Z), a.sy(e.ion * EV) - 8, String(e.Z), { size: 9.5, anchor: "middle", fill: MUTE });
  // the full-d elements with nothing outside (palladium's kind): 128 out-holds its row's noble gas, 68 nearly does
  const fullD = t4.filter((e) => /d18$/.test(e.config) && !e.config.includes(`${+e.config.match(/(\d)d18$/)[1] + 1}s`));
  s += series(a, { pts: fullD.map((e) => [e.Z, e.ion * EV, `${e.Z} (a full d shell, nothing outside): ${(e.ion * EV).toFixed(2)} eV`]), c: V, dots: true, lineOn: false, r: 3.5 });
  for (const e of fullD) s += text(a.sx(e.Z), a.sy(e.ion * EV) - 8, String(e.Z), { size: 9.5, anchor: "middle", fill: V });
  s += legend(a, [{ label: "noble gas", c: B, dot: true }, { label: "full d shell, nothing outside", c: V, dot: true }], "tl");
  const b = panel({ ox: 530, w: 330, h: 300, x: [0, 36], y: [0, 30], xl: "Z", yl: "first ionization energy (eV)", tag: "b  ours", xticks: [0, 10, 20, 30] });
  s += series(b, { pts: t3.map((e) => [e.Z, IE_REAL[e.Z - 1], `${SYM[e.Z - 1]}: measured ${IE_REAL[e.Z - 1]} eV`]), c: V, dots: true, r: 3 , lineOn: false });
  s += series(b, { pts: t3.map((e) => [e.Z, e.ion * EV, `${SYM[e.Z - 1]}: computed ${(e.ion * EV).toFixed(2)} eV`]), c: B, w: 1.4 });
  s += legend(b, [{ label: "this solver", c: B }, { label: "measured (NIST)", c: V, dot: true }], "tr");
  return figure(870, 300, [a, b, s], "First ionization energy against Z: the four-dimensional table, and the same solver in ours against measured values");
}

/* F4 · the 3D validation */
function F4() {
  const t3 = TABLE[3], rows = t3.map((e) => ({ Z: e.Z, s: SYM[e.Z - 1], c: e.ion * EV, m: IE_REAL[e.Z - 1], hit: norm(e.config) === norm(realConfig(e.Z)) }));
  const a = panel({ w: 400, h: 320, x: [0, 26], y: [0, 26], xl: "measured (eV)", yl: "computed (eV)", tag: "a" });
  let s = series(a, { pts: [[0, 0], [26, 26]], c: MUTE, dash: "4,3", w: 1 });
  s += series(a, { pts: rows.filter((r) => r.hit).map((r) => [r.m, r.c, `${r.s}: ${r.c.toFixed(2)} against ${r.m} eV; configuration right`]), c: B, dots: true, lineOn: false });
  s += series(a, { pts: rows.filter((r) => !r.hit).map((r) => [r.m, r.c, `${r.s}: ${r.c.toFixed(2)} against ${r.m} eV; configuration missed`]), c: V, dots: true, lineOn: false, r: 4.5 });
  rows.filter((q) => !q.hit).sort((p, q) => p.m - q.m).forEach((r, i) => { const lx = a.sx(14) + i * 0, ly = a.sy(4.5) + i * 13; s += `<line x1="${a.sx(r.m) + 4}" y1="${a.sy(r.c)}" x2="${lx - 3}" y2="${ly - 4}" stroke="${V}" stroke-width="0.6"/>` + text(lx, ly, `${r.s} ${r.c.toFixed(2)} / ${r.m}`, { size: 9.5, fill: V }); });
  s += legend(a, [{ label: "configuration right (32)", c: B, dot: true }, { label: "missed (Ti, V, Co, Ni)", c: V, dot: true }], "tl");
  const b = panel({ ox: 410, w: 400, h: 320, x: [0, 36], y: [-20, 20], xl: "Z", yl: "computed − measured (%)", tag: "b", zero: true, xticks: [0, 10, 20, 30] });
  s += series(b, { pts: rows.map((r) => [r.Z, (100 * (r.c - r.m)) / r.m, `${r.s}: ${((100 * (r.c - r.m)) / r.m).toFixed(1)} %`]), c: B, dots: true, w: 1 });
  return figure(810, 320, [a, b, s], "The solver in our three dimensions: first ionization against measured, and its error, with the four missed configurations marked");
}

/* F6 · partial screening */
function F6() {
  const no = TABLE[4].filter((e) => isNoble(e, 4));
  const a = panel({ w: 520, h: 300, x: [0, 140], y: [0, 30], xl: "Z of the noble gas", yl: "first ionization energy (eV)", xticks: [0, 20, 40, 60, 80, 100, 120, 140] });
  let s = series(a, { pts: SHELL_COUNTERFACTUAL.map((c) => [c.Z, c.ion * EV, `${c.Z}, shell theorem forced on: ${(c.ion * EV).toFixed(2)} eV`]), c: V, dots: true, dash: "5,4" });
  s += series(a, { pts: no.map((e) => [e.Z, e.ion * EV, `${e.Z}, the pinned 1/r: ${(e.ion * EV).toFixed(2)} eV`]), c: B, dots: true });
  for (const e of no) { const c = SHELL_COUNTERFACTUAL.find((q) => q.Z === e.Z); s += text(a.sx(e.Z) + (e.Z === 2 ? 8 : 0), a.sy(e.ion * EV) - 9, `×${(e.ion / c.ion).toFixed(2)}`, { size: 9.5, anchor: e.Z === 2 ? "start" : "middle", fill: MUTE }); }
  s += legend(a, [{ label: "4D, no shell theorem", c: B }, { label: "shell theorem forced on", c: V, dash: "5,4" }], "br");
  return figure(520, 300, [a, s], "Partial screening: the noble gases' first ionization under the pinned 1/r and with the shell theorem forced on");
}

/* F7 · a neutral atom's far pull */
function F7() {
  const ss = Array.from({ length: 50 }, (_, i) => 2 * 50 ** (i / 49)), no = TABLE[4].filter((e) => isNoble(e, 4)), cols = [B, V, G, P, O, K];
  const a = panel({ w: 520, h: 300, x: [2, 100], y: [0.95, 1.25], logx: true, xl: "distance s from the atom (bohr)", yl: "U(s) / (−S/8s³)", xticks: [1e1, 1e2] });
  let s = series(a, { pts: [[2, 1], [100, 1]], c: MUTE, dash: "4,3", w: 1 });
  no.forEach((e, i) => { const f = farPull(e, RPLOT); s += series(a, { pts: ss.map((x) => [x, f.U(x) / f.far(x), `${e.Z} at ${x.toFixed(1)} bohr: ${(f.U(x) / f.far(x)).toFixed(4)}`]), c: cols[i] }); });
  s += legend(a, no.map((e, i) => ({ label: `element ${e.Z}`, c: cols[i] })), "tr");
  return figure(520, 300, [a, s], "A neutral four-dimensional atom's pull on a distant electron, computed from its whole cloud, over the far form −S/8s³");
}

export const CAPTIONS = {
  L1: "Gauss's law in four dimensions has no atom. One electron in V = −α/r². (a) The lowest level against the inner end r₀ of the grid it is solved on: for every α above ½ it scales as 1/r₀², so the level is set by where the calculation stops, not by the electron. (b) ε·r₀² against α: zero (no bound level on any grid) up to α = ½, the critical strength Hardy's inequality gives in four dimensions; past it nonzero and the same on every grid, rising from zero at first exponentially slowly. Either way there is no Bohr radius.",
  L2: "Only a 1/r pull keeps a shell's levels together. One electron in V = −1/rᵖ in four dimensions: the splitting between 2p and 2s (and between 3d and 3s) as a percentage of the shell's binding. It vanishes only at p = 1, to 10⁻¹¹; below 1 the more-turning electron is the more bound, above 1 the less. Shells of 2(l + 1)² electrons, and the table's rows, need exactly 1/r.",
  L3: "No shell theorem under the pinned 1/r in four dimensions. (a) The pull of a thin shell on a point at another radius, over a point charge's at the shell's centre, as k(t) of the ratio t of the two radii (the shell theorem makes it 1). (b) The potential of a unit shell of radius 1: inside it isn't flat, so a hollow conductor doesn't shield (its centre sits at 3π/8 of the wall's potential); outside it isn't a point charge's.",
  F3: "First ionization energy against Z. (a) The four-dimensional table to Z = 140, the noble gases marked, and the two elements whose 18-electron d shell is full with nothing outside it (68 and 128, the kind our palladium is). Element 128 holds its outermost electron harder than its row's noble gas, the hardest in the table; 68 comes within a volt of its row's. (b) The same solver in our three dimensions against measured values.",
  F4: "The solver in our three dimensions. (a) Computed against measured first ionization energies (NIST), with the four elements whose ground configuration it misses (Ti, V, Co, Ni: one d electron too many against 4s, the known lean of local exchange). (b) The percentage error against Z.",
  F6: "Partial screening. The noble gases' first ionization energy in four dimensions under the pinned 1/r, against the same atoms solved with the shell theorem forced on (the clouds' pull as if each sat at the centre). Without a shell theorem the inner clouds cover the nucleus only partly, and the outermost electron is held up to 2.9 times harder.",
  F7: "A neutral atom is felt from outside. The energy of an electron at distance s from each four-dimensional noble gas, computed from the atom's whole baked cloud under the 3-sphere kernel, over the far form −S/8s³ (S = Σ⟨r²⟩). Past the cloud the two agree to a few parts in a thousand.",
};

export function figures() {
  const out = new Map();
  for (const [k, f] of Object.entries({ L1, L2, L3, F3, F4, F6, F7 })) out.set(`figures/${k}.svg`, f());
  out.set("figures/captions.json", JSON.stringify(CAPTIONS, null, 1) + "\n");
  return out;
}
