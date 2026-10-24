/* ATOM⁴'s periodic table as a table, no DOM: where each element sits, what kind of element it is, and our own
   real table to check the 3D run against. */
import { orbitals } from "./atom.js";

/* our real table, for the 3D check: symbols, measured first ionization energies (eV), and the two configurations
   that break the filling order */
export const SYM = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr".split(" ");
export const IE_REAL = [13.598, 24.587, 5.392, 9.323, 8.298, 11.26, 14.534, 13.618, 17.423, 21.565, 5.139, 7.646, 5.986, 8.152, 10.487, 10.36, 12.968, 15.76, 4.341, 6.113, 6.561, 6.828, 6.746, 6.767, 7.434, 7.902, 7.881, 7.64, 7.726, 9.394, 5.999, 7.899, 9.789, 9.752, 11.814, 13.999];
export function realConfig(Z) { // Madelung's order, with chromium's and copper's 4s electron in 3d
  const order = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1]], occ = new Map(); let left = Z;
  for (const [n, l] of order) { const k = Math.min(left, 2 * (2 * l + 1)); if (k) occ.set(`${n}${"spdf"[l]}`, k); left -= k; }
  if (Z === 24 || Z === 29) { occ.set("4s", 1); occ.set("3d", occ.get("3d") + 1); }
  const key = (s) => +s[0] * 10 + "spdf".indexOf(s[1]);
  return [...occ].sort((a, b) => key(a[0]) - key(b[0])).map(([s, k]) => s + k).join(" ");
}

const full = (el, d) => el.orb.every((o) => o.o === 2 * orbitals("spdf".indexOf(o.s.at(-1)), d));
/* a noble gas: every occupied subshell full, and the electron it gives up most easily is a p (or it's 1s²). That
   leaves out zinc-like atoms (s² over a full d) and palladium-like ones (a full d, nothing over it) */
export function isNoble(el, d) {
  return full(el, d) && (el.config === "1s2" || el.top.endsWith("p"));
}
/* rows end at the noble gases; columns: s on the left, the rest right-aligned, the noble gas last */
export function layout(TABLE, d) {
  const els = TABLE[d], periods = []; let cur = [];
  for (const el of els) { cur.push(el); if (isNoble(el, d)) { periods.push(cur); cur = []; } }
  if (cur.length) periods.push(cur);
  const W = Math.max(...periods.map((p) => p.length)), cells = [];
  periods.forEach((p, row) => p.forEach((el, k) => {
    const v = k + 1, noble = isNoble(el, d), col = noble ? W : v <= 2 ? v : W - (p.length - v);
    const fromRight = W - col; // p-block: the last p-capacity columns
    const pcap = 2 * orbitals(1, d), block = row === 0 || (col <= 2 && !noble) ? "s" : fromRight < pcap ? "p" : "d";
    cells.push({ el, row, col, noble, block });
  }));
  return { W, rows: periods.length, cells, periods };
}
export function role(el, d, cell) {
  const pcap = 2 * orbitals(1, d);
  const outer = el.orb.filter((o) => +o.s.slice(0, -1) === Math.max(...el.orb.map((q) => +q.s.slice(0, -1))) && !o.s.endsWith("d") && !o.s.endsWith("f"));
  const nv = outer.reduce((a, o) => a + o.o, 0), shell = 2 + pcap;
  if (el.Z === 1) return "hydrogen: one electron, half a full shell";
  if (cell.noble) return "a noble gas: every shell full";
  if (cell.block === "d") return "a transition metal: filling an inner d shell";
  if (nv === 1) return "an alkali metal: one electron outside a full shell";
  if (nv === 2 && cell.block === "s") return "an alkaline earth: two electrons outside a full shell";
  if (nv === shell - 1) return "halogen-like: one electron short of a full shell";
  if (nv === shell - 2) return "chalcogen-like: two short of a full shell";
  if (nv === shell / 2) return `carbon-like: its outer shell half full, ${nv} bonds`;
  return `${nv} electrons in its outer shell of ${shell}`;
}
