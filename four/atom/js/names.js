/* The 4D elements' names, no DOM. An element that does what one of ours does takes our element's English name with
   its first letter moved one on (hydrogen → iydrogen, carbon → darbon, oxygen → pxygen, zinc → ainc). Which of ours
   it answers to is read off its place in the table (js/periodic.js's layout), block by block, the way our groups
   are:
     - the s block: column 1 is the alkali metals, column 2 the alkaline earths;
     - in the p and d blocks, the elements before the half-full one count from the block's left edge (our boron is the
       first p element; scandium, titanium, vanadium and chromium the first four d), the half-full one answers to
       ours (carbon: half of the 8-electron s + p shell, so darbon, half of 10; manganese: half of a d shell), and the
       ones after it count back from the full shell (nitrogen is three short of a noble gas, oxygen two, fluorine one;
       iron is four short of a full d shell … zinc none).
   Our carbon is both fourth from the start and four short of the end. In 4D's longer blocks those are different
   elements, and neither answers to anything of ours: they're new, and so are the middle of 4D's d block, where
   it holds 18 electrons to our 10. 24 of the 78 have no counterpart.
   Symbols follow the chapters where they already use one (H₂Px, DH₅, Mi⁺H⁻); otherwise our symbol with its first
   letter moved on, or else the new name's first letter and one of its others (or, failing that, any), never one of
   our 118. */
import { layout } from "./periodic.js";

// our elements 1–54: English names (as the shifted names are spelt) and symbols
export const OURS = ("hydrogen H,helium He,lithium Li,beryllium Be,boron B,carbon C,nitrogen N,oxygen O,fluorine F,neon Ne," +
  "sodium Na,magnesium Mg,aluminium Al,silicon Si,phosphorus P,sulfur S,chlorine Cl,argon Ar,potassium K,calcium Ca," +
  "scandium Sc,titanium Ti,vanadium V,chromium Cr,manganese Mn,iron Fe,cobalt Co,nickel Ni,copper Cu,zinc Zn,gallium Ga," +
  "germanium Ge,arsenic As,selenium Se,bromine Br,krypton Kr,rubidium Rb,strontium Sr,yttrium Y,zirconium Zr,niobium Nb," +
  "molybdenum Mo,technetium Tc,ruthenium Ru,rhodium Rh,palladium Pd,silver Ag,cadmium Cd,indium In,tin Sn,antimony Sb," +
  "tellurium Te,iodine I,xenon Xe").split(",").map((s, i) => { const [name, sym] = s.split(" "); return { Z: i + 1, name, sym }; });

// every symbol of ours, all 118: a 4D symbol shouldn't read as one of them
const REAL = new Set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo " +
  "Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn " +
  "Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og").split(" "));
const shift = (c) => (c === "z" ? "a" : String.fromCharCode(c.charCodeAt(0) + 1));
export const shiftName = (name) => shift(name[0]) + name.slice(1);
// the chapters' own symbols, kept: iydrogen stays H in every formula, as darbon is D, pxygen Px, mithium Mi
const KEEP = { hydrogen: "H", carbon: "D", oxygen: "Px", lithium: "Mi" };

/* which of ours sits at (row, column) of a table whose rows hold `s`, `d` and `p` (the s + p valence shell) electrons
   in each block: the Z of our element, or null where there is none */
function ourAt(row, block, k, len) {
  // ours, by row: s block, d block (rows 4–5), p block (counting the valence shell s + p, 3 to 8)
  const S = [[1], [3, 4], [11, 12], [19, 20], [37, 38]], D = { 3: [21, 30], 4: [39, 48] }, P = { 1: [5, 10], 2: [13, 18], 3: [31, 36], 4: [49, 54] };
  if (row === 0) return k === 0 ? 1 : 2;
  if (block === "s") return S[row][k];
  // a block of `len` places; ours has `ourLen`. Before the half-full place, count from the left; at it, the half-full
  // one of ours; after it, count back from the full end
  const [z0, z1] = block === "d" ? D[row] : P[row];
  if (block === "d") { const ourLen = 10, half = len / 2, i = k + 1; // i: electrons in the d shell
    if (i < half) return i < ourLen / 2 ? z0 + i - 1 : null;
    if (i === half) return z0 + ourLen / 2 - 1;
    const short = len - i; return short < ourLen / 2 ? z1 - short : null; }
  // p block: k counts places from the first p element; v = valence electrons (s² + p), shell = 2 + len
  const shell = 2 + len, v = k + 3, ourShell = 8;
  if (v < shell / 2) return v < ourShell / 2 ? z0 + v - 3 : null;
  if (v === shell / 2) return z0 + ourShell / 2 - 3;
  const short = shell - v; return short < ourShell / 2 ? z1 - short : null;
}

/* every element of the d-dimensional table (3 or 4): its name, symbol, our counterpart (or none) and why */
export function names(TABLE, d) {
  const { cells, W } = layout(TABLE, d), out = new Map(), used = new Set();
  const why = (o, block, k, len, row) => {
    if (row === 0) return o === 1 ? "one electron, as hydrogen has" : "its one shell full, as helium's is";
    if (block === "s") return k === 0 ? "one electron outside a full shell, an alkali metal" : "two outside a full shell, an alkaline earth";
    if (block === "d") { const i = k + 1, half = len / 2; return i < half ? `the ${["first", "second", "third", "fourth"][i - 1]} element of its d block` : i === half ? "its d shell half full" : `${len - i} short of a full d shell`; }
    const v = k + 3, shell = 2 + len; return v < shell / 2 ? "the first element of its p block" : v === shell / 2 ? `its outer shell half full: ${v} electrons of ${shell}, so ${v} bonds` : v === shell ? "every shell full, a noble gas" : `${shell - v} short of a full shell, so ${shell - v} bond${shell - v > 1 ? "s" : ""}`;
  };
  // the blocks of each row: their places in order
  const rows = new Map(); for (const c of cells) { const key = `${c.row}:${c.block}`; (rows.get(key) ?? rows.set(key, []).get(key)).push(c); }
  for (const list of rows.values()) list.sort((a, b) => a.col - b.col);
  for (const c of cells) {
    const list = rows.get(`${c.row}:${c.block}`), k = list.indexOf(c), len = c.block === "s" ? 2 : list.length;
    let oz = null, reason;
    if (d === 3) oz = c.el.Z; // our own table: every element is ours
    else oz = ourAt(c.row, c.block, k, len);
    const o = oz ? OURS[oz - 1] : null;
    reason = o ? (d === 3 ? null : why(oz, c.block, k, len, c.row)) : c.block === "p" ? `${k + 3 < (2 + len) / 2 ? `${k + 3} electrons in a shell of ${2 + len}: more than our boron, fewer than half` : `${2 + len - (k + 3)} short of a full shell of ${2 + len}`}, which nothing of ours is but carbon, and carbon's place is darbon's` : `${k + 1} electrons in a d shell of ${len}: ours holds only 10`;
    const name = o ? (d === 3 ? o.name : shiftName(o.name)) : null;
    out.set(c.el.Z, { Z: c.el.Z, row: c.row, col: c.col, block: c.block, noble: c.noble, ours: o, name, why: reason, isNew: !o, W });
  }
  // symbols: kept ones first, then our symbol with its first letter moved on, else the name's first letters
  const all = [...out.values()].sort((a, b) => a.Z - b.Z);
  for (const e of all) {
    if (!e.ours) { e.sym = null; continue; }
    if (d === 3) { e.sym = e.ours.sym; continue; }
    const o = e.ours, cap = (a, b = "") => a.toUpperCase() + b;
    const cands = [
      // our symbol with its first letter moved on, where our symbol starts like our name (not natrium's Na, kalium's K)
      o.sym[0].toLowerCase() === o.name[0] ? cap(shift(o.name[0]), o.sym.slice(1)) : null,
      cap(e.name[0], e.name[1]), ...[...e.name.slice(2)].map((ch) => cap(e.name[0], ch)),
      ...[..."abcdefghijklmnopqrstuvwxyz"].map((ch) => cap(e.name[0], ch)), // and if every one of its own letters is taken
    ].filter(Boolean);
    // a symbol that's already one of ours (shifted germanium would be "He", shifted vanadium tungsten's "W") would
    // confuse every comparison: skip those, unless the chapters already use it
    e.sym = KEEP[o.name] ?? cands.find((c) => !used.has(c) && !REAL.has(c)) ?? cands.find((c) => !used.has(c));
    used.add(e.sym);
  }
  return out;
}
