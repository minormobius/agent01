/* Which world the fusion pages show: ours (net.js, REACLIB's rates through a heavy star's seven stages) or 4D at one
   strong-force strength s (net4.js on data4.js, the book's own network; its three stages' temperatures from
   stages4.js). Every page module imports the world from here, as live bindings, and setWorld swaps them all. No DOM.
   A world: its stages, nuclei (key, Z, A, sym "X-A", name), reactions (r, p, Q MeV, weak / ec / minus), the network's
   run, fluxes and energy, the reactions worth a knob, the start mix, element symbols and colours, half-lives, and the
   barrier pane's pairs and nuclear radius. */
import * as O from "./net.js";
import { model, STRENGTHS } from "./net4.js";
import { STAGE_T } from "../stages4.js";
export { STRENGTHS };

const MEV_ERG = 1.602176634e-6, NA = 6.02214076e23, DM = 0.782333; // m_n − m_p − m_e, MeV

/* ---------- ours ---------- */
const OURS_KNOBS = [
  { key: "pp", label: "p + p → d (the weak step)", r: ["p", "p"], p: ["d"] },
  { key: "33", label: "³He + ³He → ⁴He + 2p", r: ["he3", "he3"], p: ["p", "p", "he4"] },
  { key: "34", label: "³He + ⁴He → ⁷Be", r: ["he4", "he3"], p: ["be7"] },
  { key: "n14", label: "¹⁴N + p → ¹⁵O (CNO's slowest)", r: ["p", "n14"], p: ["o15"] },
  { key: "3a", label: "3 ⁴He → ¹²C (triple-alpha)", r: ["he4", "he4", "he4"], p: ["c12"] },
  { key: "c12a", label: "¹²C + ⁴He → ¹⁶O", r: ["he4", "c12"], p: ["o16"] },
  { key: "o16a", label: "¹⁶O + ⁴He → ²⁰Ne", r: ["he4", "o16"], p: ["ne20"] },
  { key: "cc", label: "¹²C + ¹²C (both ways out)", r: ["c12", "c12"], p: null },
  { key: "ne20a", label: "²⁰Ne + ⁴He → ²⁴Mg", r: ["he4", "ne20"], p: ["mg24"] },
  { key: "oo", label: "¹⁶O + ¹⁶O (both ways out)", r: ["o16", "o16"], p: null },
  { key: "si28a", label: "²⁸Si + ⁴He → ³²S", r: ["he4", "si28"], p: ["s32"] },
];
const OURS_EL = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni"];
/* half-lives of our network's unstable nuclei (all decay by positron emission or electron capture), seconds, as in the
   standard tables; every other nucleus here is stable */
const OURS_HALF = { be7: 53.22 * 86400, b8: 0.770, n13: 597.9, o15: 122.24, f17: 64.49, f18: 6586, sc43: 3.891 * 3600, ti44: 59.1 * 3.156e7, v47: 32.6 * 60, cr48: 21.56 * 3600, mn51: 46.2 * 60, fe52: 8.275 * 3600, co55: 17.53 * 3600, ni56: 6.075 * 86400 };
const OURS_COL = { 1: "#ff6f61", 2: "#6fe0ff", 6: "#9a958c", 7: "#5f8fe0", 8: "#7fd88a", 10: "#ffb46b", 11: "#e58fb8", 12: "#e3cf7f", 13: "#c9a68c", 14: "#b48cff", 15: "#d77fd8", 16: "#d8d26b", 18: "#7fc4d8", 20: "#f0f0f0", 26: "#ff9e5e", 27: "#d88f7f", 28: "#ffd27f" };

/* ---------- 4D ---------- */
/* names and symbols from atom/js/names.js (elements 6, 8 and 16 answer to none of ours: "element 6"); the selftest
   holds these to it */
export const NAME4 = { 1: "iydrogen", 2: "ielium", 3: "mithium", 4: "ceryllium", 5: "coron", 7: "darbon", 9: "oitrogen", 10: "pxygen", 11: "gluorine", 12: "oeon", 13: "todium", 14: "nagnesium", 15: "bluminium" };
export const SYM4 = { 1: "H", 2: "Ie", 3: "Mi", 4: "Cy", 5: "Cb", 7: "D", 9: "Oi", 10: "Px", 11: "G", 12: "Oe", 13: "To", 14: "Ng", 15: "Bl" };
const COL4 = { 1: "#ff6f61", 2: "#6fe0ff", 3: "#c9a68c", 4: "#5f7d8c", 5: "#8fb9a8", 6: "#d9d2c3", 7: "#7fd88a", 8: "#9a958c", 9: "#ffb46b", 10: "#b48cff", 11: "#e58fb8", 12: "#e3cf7f", 13: "#ff8b8b" };
const KNOBS4 = [
  { key: "pp", label: "p + p → d (the weak step)", r: ["1-1", "1-1"], p: ["1-2"] },
  { key: "33", label: "³Ie + ³Ie → ⁴Ie + 2p", r: ["2-3", "2-3"], p: ["1-1", "1-1", "2-4"] },
  { key: "34", label: "³Ie + ⁴Ie → ⁷Cy", r: ["2-3", "2-4"], p: ["4-7"] },
  { key: "aa", label: "⁴Ie + ⁴Ie → ⁸Cy (bound in 4D)", r: ["2-4", "2-4"], p: ["4-8"] },
  { key: "p8", label: "⁸Cy + p → ⁹Cb", r: ["1-1", "4-8"], p: ["5-9"] },
  { key: "a8", label: "⁸Cy + ⁴Ie → element 6", r: ["2-4", "4-8"], p: ["6-12"] },
  { key: "cc", label: "⁸Cy + ⁸Cy → element 6 + ⁴Ie", r: ["4-8", "4-8"], p: null },
];
const BLURB4 = {
  h: (s) => `Iydrogen burns at the pace that halves our Sun's central hydrogen in 4.6 billion years (${(STAGE_T[s].h / 1e6).toFixed(1)} million K at this strength). Two protons still need the weak force to make a deuteron, and the proton–proton chains make ielium-4 as ours do. But in 4D two ielium-4s hold together as ceryllium-8, and protons climb on from there, one capture at a time with positron decays between. Unlike ours, nothing hands the catalyst back: a triton-like piece binds to ceryllium-8 more tightly than an ielium-4 holds itself together, so element 5-11 + p can't split off an ielium-4, and hot enough cores climb all the way to pxygen-20, 4D's oxygen-16.`,
  he: (s) => `Whatever ielium-4 hydrogen burning left burns at its capture's rate-matched ignition (${(STAGE_T[s].he / 1e6).toFixed(1)} million K). Two ielium-4s make ceryllium-8, which, unlike our beryllium-8, is bound: no Hoyle state needed, no three-body bottleneck. Ielium + ielium beats ielium + ceryllium by far, so the core becomes ceryllium-8.${s < 1.55 ? " At this strength, though, hydrogen burning has already carried nearly everything on to pxygen and oitrogen, so there is almost nothing left to burn here." : ""}`,
  ce: (s) => `Ceryllium-8 fuses with itself (barrier only, carried at our oxygen + oxygen's pace, 0.27 billion K). Taken here as giving element 6 and an ielium-4 (the nucleon channel is open too, and not followed). Element 6, mass 12, is where the ash ends.${s < 1.55 ? " At this strength there is next to no ceryllium to burn: hydrogen burning went straight past it." : ""}`,
};

/* ---------- the live world ---------- */
export let WORLD = "ours", STRENGTH = null, STAGES, NUC, IDX, RX, fluxes, energy, toX, toY, run, SOURCE, KNOBS, START_HE, startMix, symOf, colorZ, decayOf, SHORT, PAIRS, STAGE_PAIR, radius, rhoText, metals;

function useOurs() {
  WORLD = "ours"; STRENGTH = null; STAGES = O.STAGES; NUC = O.NUC; IDX = O.IDX; RX = O.RX; fluxes = O.fluxes; energy = O.energy; toX = O.toX; toY = O.toY; run = O.run; SOURCE = O.SOURCE;
  KNOBS = OURS_KNOBS; START_HE = O.SUN_X.he4; metals = true;
  startMix = (c) => { const m = {}; let mt = 0; for (const [k, x] of Object.entries(O.SUN_X)) if (k !== "p" && k !== "he4") { m[k] = x * c.z; mt += m[k]; } return { ...m, he4: c.he, p: Math.max(0, 1 - c.he - mt) }; };
  symOf = (Z) => OURS_EL[Z]; colorZ = (Z) => OURS_COL[Z] ?? `hsl(${(Z * 47) % 360} 55% 62%)`;
  decayOf = (k) => (OURS_HALF[k] ? { mode: "β⁺", half: OURS_HALF[k] } : null);
  SHORT = ["H · pp", "H · CNO", "He", "C", "Ne", "O", "Si"];
  PAIRS = [["p", "p"], ["p", "n14"], ["he4", "he4"], ["he4", "c12"], ["c12", "c12"], ["he4", "ne20"], ["o16", "o16"], ["he4", "si28"]]; STAGE_PAIR = [0, 1, 3, 4, 5, 6, 7];
  radius = (A) => 1.2 * Math.cbrt(A); rhoText = (rho) => `${sciT(rho)} g/cm³`;
}
function use4D(s) {
  const m = model(s), B = (k) => m.species[m.idx[k]].B;
  WORLD = "4d"; STRENGTH = s; IDX = m.idx; toX = m.toX; toY = m.toY; fluxes = m.fluxes; KNOBS = KNOBS4; START_HE = 0.25; metals = false;
  NUC = m.species.map((x) => { const nm = NAME4[x.Z] ?? `element ${x.Z}`, sy = SYM4[x.Z] ?? `[${x.Z}]`;
    const special = x.Z === 1 && x.A === 1 ? ["p", "proton"] : x.Z === 1 && x.A === 2 ? ["d", "deuteron"] : x.Z === 0 ? ["n", "neutron"] : null;
    return { k: x.key, Z: x.Z, A: x.A, B: x.B, how: x.how, sym: special ? special[0] : `${sy}-${x.A}`, name: special ? special[1] : `${nm}-${x.A}` }; });
  // Q from the table's bindings; a weak decay's Q counts the positron's annihilation (as REACLIB's do): the atomic mass difference
  RX = m.rx.map((r) => { const weak = r.kind === "beta", ec = r.kind === "ec", minus = /β⁻/.test(r.how), sb = (xs) => xs.reduce((t, k) => t + B(k), 0);
    const Q = sb(r.p) - sb(r.r) + (weak || ec ? (minus ? DM : -DM) : 0); return { ...r, weak: weak && !minus ? true : weak, ec, minus, Q }; });
  energy = (fl) => fl.reduce((t, f, i) => t + f * RX[i].Q, 0) * NA * MEV_ERG;
  // stages: rates baked at our Sun's centre density, so a stage's "density" is a factor on that
  STAGES = [
    { key: "h", title: "Iydrogen, at the Sun's pace", T: STAGE_T[s].h, rho: 1, fuel: "1-1", until: 1e-3, blurb: BLURB4.h(s) },
    { key: "he", title: "Ielium", T: STAGE_T[s].he, rho: 1, fuel: "2-4", until: 1e-3, blurb: BLURB4.he(s) },
    { key: "ce", title: "Ceryllium", T: STAGE_T[s].ce, rho: 1, fuel: "4-8", until: 1e-2, blurb: BLURB4.ce(s) },
  ];
  run = (o) => { const R = m.run({ T: o.T, rhoX: o.rho, X0: o.X0, fuel: o.fuel, until: o.until, tmax: o.tmax, mult: o.mult });
    if (R.snaps.length < 2) R.snaps.push({ t: 0, Y: Float64Array.from(R.snaps[0].Y) }); // nothing to burn: the stage is a still frame
    return R; };
  SOURCE = `the book's 4D network at s = ${s} (data4.js)`;
  startMix = (c) => ({ "1-1": 1 - c.he, "2-4": c.he });
  symOf = (Z) => SYM4[Z] ?? (Z === 0 ? "n" : `[${Z}]`); colorZ = (Z) => COL4[Z] ?? `hsl(${(Z * 47) % 360} 55% 62%)`;
  decayOf = (k) => { const rx = RX.find((r) => r.r.length === 1 && r.r[0] === k), sp = m.species[m.idx[k]]; return rx && sp?.half ? { mode: rx.minus ? "β⁻" : rx.ec ? "EC" : "β⁺", half: sp.half } : null; };
  SHORT = ["iydrogen", "ielium", "ceryllium"];
  PAIRS = [["1-1", "1-1"], ["1-1", "4-8"], ["2-4", "2-4"], ["2-4", "4-8"], ["4-8", "4-8"]]; STAGE_PAIR = [0, 2, 4];
  radius = (A) => 1.0 * Math.pow(A, 1 / 4); rhoText = (rho) => `ρ ×${+rho.toPrecision(2)} our Sun's centre`;
}
const sciT = (v) => { if (v < 1e4 && v >= 0.1) return String(+v.toPrecision(2)); const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(1)} × 10${String(e).split("").map((c) => (c === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c])).join("")}`; };

export function setWorld(w, s) { if (w === "4d") use4D(STRENGTHS.includes(+s) ? +s : STRENGTHS[0]); else useOurs(); }
useOurs();
