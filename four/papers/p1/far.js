/* A neutral 4D atom's far pull, from its baked cloud: an electron's energy at distance s, −(Z/s − ∫ρ(r) k(min/max)/max dr),
   with ρ the radial density table.js samples on RPLOT (electrons per bohr) and k the 3-sphere kernel. The samples start at
   0.02 bohr; the charge inside that (the heavy atoms' 1s) is put at the centre, where it acts as a point charge to far
   below the far form's accuracy. Its far form is −S/8s³, S = Σ occ ⟨r²⟩. No DOM; the widgets page and build.mjs use it. */
import { kTab } from "../../atom/js/kernel.js";

export function farPull(el, RPLOT) {
  const r = RPLOT, q = el.dens, Z = el.Z; let n = 0;
  for (let i = 1; i < r.length; i++) n += 0.5 * (r[i] - r[i - 1]) * (q[i] + q[i - 1]);
  const S = el.orb.reduce((a, o) => a + o.o * o.r2, 0), inner = Z - n;
  const U = (s) => {
    let v = (Z - inner) / s;
    for (let i = 1; i < r.length; i++) { const f = (j) => { const a = Math.min(r[j], s), b = Math.max(r[j], s); return (q[j] * kTab(a / b)) / b; }; v -= 0.5 * (r[i] - r[i - 1]) * (f(i) + f(i - 1)); }
    return -v;
  };
  return { S, U, far: (s) => -S / (8 * s ** 3) };
}
