/* Words for the fusion pages: nucleus labels, times, numbers, and what each reaction is. No DOM. */
import { NUC, IDX } from "./world.js";

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export const sup = (n) => String(n).split("").map((c) => (c === "-" ? "⁻" : SUP[+c])).join("");
export const label = (k) => { const n = NUC[IDX[k]]; return n.Z === 1 && n.A <= 2 ? (n.A === 1 ? "p" : "d") : n.Z === 0 ? "n" : `${sup(n.A)}${n.sym.split("-")[0]}`; };
export const YR = 3.15576e7;
export function human(t) {
  const f = (v) => String(+v.toPrecision(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (t < 1e-3) return `${f(t * 1e6)} µs`; if (t < 1) return `${f(t * 1e3)} ms`; if (t < 120) return `${f(t)} s`;
  if (t < 7200) return `${f(t / 60)} min`; if (t < 2 * 86400) return `${f(t / 3600)} h`; if (t < 2 * YR) return `${f(t / 86400)} days`;
  if (t < 2e3 * YR) return `${f(t / YR)} yr`; if (t < 2e6 * YR) return `${f(t / YR / 1e3)} thousand yr`; if (t < 2e9 * YR) return `${f(t / YR / 1e6)} million yr`;
  return `${f(t / YR / 1e9)} billion yr`;
}
export const sci = (v, d = 1) => { if (!(v > 0)) return "0"; if (v < 1e4 && v >= 0.1) return String(+v.toPrecision(d + 1)); const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(d)} × 10${sup(e)}`; };
export const kelvin = (T) => (T >= 1e9 ? `${+(T / 1e9).toPrecision(3)} billion K` : `${+(T / 1e6).toPrecision(3)} million K`);

export function kind(r) { if (r.ec) return "ec"; if (r.weak) return "beta"; if (r.r.length === 1) return "photo"; if (r.p.length === 1) return "capture"; return "swap"; }
export const eqn = (r) => `${r.r.map(label).join(" + ")}${r.ec ? " + e⁻" : kind(r) === "photo" ? " + γ" : ""} → ${r.p.map(label).join(" + ")}${kind(r) === "beta" ? (r.minus ? " + e⁻ + ν̄" : " + e⁺ + ν") : kind(r) === "ec" ? " + ν" : kind(r) === "capture" ? " + γ" : ""}`;
export const keyOf = (r) => `${r.r.join("+")}>${r.p.join("+")}${r.ec ? "|ec" : r.weak ? "|w" : ""}`;

const NOTE = {
  "p+p>d|w": "Two protons touch, and for once the weak force turns one into a neutron while they do: a deuteron, a positron and a neutrino. Each proton in the Sun waits billions of years for this; it is why the Sun lasts.",
  "p+p>d|ec": "The same with an electron caught in the act (pep): no positron, one neutrino.",
  "p+d>he3": "The deuteron grabs a proton within about a second of being made: helium-3.",
  "he3+he3>p+p+he4": "Two helium-3s make helium-4 and hand two protons back. That ends the main chain, pp-I.",
  "he4+he3>be7": "Or a helium-3 meets a helium-4 first: beryllium-7, the start of the side chains pp-II and pp-III.",
  "be7>li7|ec": "Beryllium-7 swallows an electron: lithium-7 and a neutrino.",
  "p+li7>he4+he4": "Lithium-7 catches a proton and splits into two helium-4s (pp-II).",
  "p+be7>b8": "Rarely a proton reaches beryllium-7 before an electron does: boron-8 (pp-III).",
  "b8>he4+he4|w": "Boron-8 decays and falls apart into two helium-4s. Its energetic neutrinos are the ones solar-neutrino detectors first caught.",
  "p+c12>n13": "Carbon-12 catches a proton: nitrogen-13. The CNO cycle begins; the carbon is only borrowed.",
  "n13>c13|w": "Nitrogen-13 turns a proton into a neutron (half-life 10 minutes): carbon-13.",
  "p+c13>n14": "Carbon-13 catches a proton: nitrogen-14.",
  "p+n14>o15": "Nitrogen-14 catches a proton: oxygen-15. The cycle's slowest step, so its catalysts pile up as nitrogen-14.",
  "o15>n15|w": "Oxygen-15 turns a proton into a neutron (2 minutes): nitrogen-15.",
  "p+n15>he4+c12": "Nitrogen-15 catches a proton and splits: a helium-4 out, and the carbon-12 back. Four protons have become one helium-4.",
  "p+n15>o16": "Once in a thousand times nitrogen-15 keeps the proton instead: oxygen-16, the second CNO loop.",
  "p+o17>he4+n14": "Oxygen-17 plus a proton: helium-4 and nitrogen-14, closing the second loop.",
  "he4+he4+he4>c12": "Three helium-4s make carbon-12. Two meet as beryllium-8, which falls apart within 10⁻¹⁶ s; very rarely a third arrives in time, through a resonance in carbon-12, the Hoyle state.",
  "he4+c12>o16": "Carbon-12 catches a helium-4: oxygen-16. How much carbon survives helium burning hangs on this rate, still one of the least certain in astrophysics.",
  "he4+o16>ne20": "Oxygen-16 catches a helium-4: neon-20.",
  "he4+n14>f18": "The nitrogen left over from hydrogen burning catches a helium-4: fluorine-18, which decays to oxygen-18 and goes on to neon-22.",
  "c12+c12>he4+ne20": "Two carbon-12s fuse into an excited magnesium-24, which throws out a helium-4: neon-20.",
  "c12+c12>p+na23": "Two carbon-12s fuse and throw out a proton: sodium-23.",
  "ne20>he4+o16": "A gamma ray knocks a helium-4 out of neon-20, leaving oxygen-16. In neon burning light starts breaking nuclei.",
  "he4+ne20>mg24": "Neon-20 catches a helium-4: magnesium-24.",
  "o16+o16>he4+si28": "Two oxygen-16s fuse into an excited sulfur-32, which throws out a helium-4: silicon-28.",
  "o16+o16>p+p31": "Two oxygen-16s fuse and throw out a proton: phosphorus-31.",
  // 4D (world.js, data4.js): keys are "Z-A"
  "1-1+1-1>1-2|w": "Two protons touch and the weak force turns one into a neutron while they do: a deuteron, a positron and a neutrino. In 4D the deuteron is computed from the same strong force, and this rate sets the star's pace, as in ours.",
  "1-1+1-2>2-3": "The deuteron grabs a proton almost at once: ielium-3.",
  "2-3+2-3>1-1+1-1+2-4": "Two ielium-3s make ielium-4 and hand two protons back: the end of the main chain, as our pp-I. At the strongest settings this step is too slow and the core strands as ielium-3.",
  "2-3+2-4>4-7": "An ielium-3 meets an ielium-4: ceryllium-7, the start of the side chain, as our beryllium-7.",
  "4-7>3-7|ec": "Ceryllium-7 swallows an electron: mithium-7 and a neutrino.",
  "1-1+3-7>2-4+2-4": "Mithium-7 catches a proton and splits into two ielium-4s, as our lithium-7 does (pp-II).",
  "1-1+3-7>4-8": "Or mithium-7 keeps the proton: ceryllium-8, which in 4D holds together.",
  "2-4+2-4>4-8": "Two ielium-4s make ceryllium-8, and in 4D it holds together: our beryllium-8 falls apart in 10⁻¹⁶ s, which is why our helium burning needs a third helium-4 and the Hoyle state. Here no bottleneck: computed from the strong force (E2 capture).",
  "1-1+4-8>5-9": "Ceryllium-8 catches a proton: coron-9. From here protons and positron decays climb, one capture at a time (computed: E1 capture onto two ielium-4s).",
  "5-9>4-9|w": "Coron-9 turns a proton into a neutron: ceryllium-9.",
  "2-4+4-8>6-12": "Ceryllium-8 catches an ielium-4: element 6, mass 12, one of 4D's new elements (computed: E2 capture).",
  "1-1+5-11>6-12": "Coron-11 catches a proton and keeps it: element 6. In our CNO cycle the like step (nitrogen-15 + p) throws out a helium-4 and hands the catalyst back; here the triton-like piece is bound too tightly for that, so nothing is handed back and the climb goes on.",
  "2-4+8-16>10-20": "Element 8 catches an ielium-4: pxygen-20, five ielium-4s at the corners of a 4-simplex, 4D's closed shell (its oxygen-16).",
  "1-1+9-19>10-20": "Oitrogen-19 catches a proton: pxygen-20.",
  "4-8+4-8>6-12+2-4": "Two ceryllium-8s fuse into an excited element-8 nucleus, which throws out an ielium-4 (taken as the way out here; a nucleon can go too): element 6.",
  "4-10>5-10|w": "Ceryllium-10 has two neutrons to spare: bound, but turning one into a proton gains about 16 MeV, so it decays in milliseconds. In 4D the neutron–proton pull holds light nuclei to equal numbers far harder than ours.",
};
const nm = (k) => NUC[IDX[k]].name;
export function words(r) {
  const n = NOTE[keyOf(r)] ?? NOTE[keyOf(r).replace(/\|.*/, "")]; if (n) return n;
  const big = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A);
  switch (kind(r)) {
    case "photo": { const [h, l] = big(r.p); return `Light knocks a ${nm(l)} out of ${nm(r.r[0])}, leaving ${nm(h)}.`; }
    case "capture": { const [a, b] = big(r.r); return `${nm(a)} catches a ${nm(b)}: ${nm(r.p[0])}, and a gamma ray carries the energy off.`; }
    case "beta": return r.minus ? `${nm(r.r[0])} has neutrons to spare and turns one into a proton: ${nm(r.p[0])}, an electron and an antineutrino.` : `${nm(r.r[0])} turns a proton into a neutron: ${nm(r.p[0])}, a positron and a neutrino.`;
    case "ec": return `${nm(r.r[0])} swallows an electron: ${nm(r.p[0])} and a neutrino.`;
    default: { const [a, b] = big(r.r), [c, d] = big(r.p); return `${nm(a)} meets a ${nm(b)}: ${nm(c)} and a ${nm(d)}.`; }
  }
}
