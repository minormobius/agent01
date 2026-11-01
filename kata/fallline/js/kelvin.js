/* Kelvin's foam, the grain painted on the hill: the A₄* lattice (Foam⁴'s, ./foam.js, a byte-identical copy the selftest
   holds to games/foam4/js/foam.js), scaled so a cell is CELL across, as the shader's nearestS wants it: basis B (rows,
   metres), Binv, and the relevant vectors. Its cells are permutohedra, the most even way to fill four dimensions with
   one shape, so a hill grained with it shows no favoured direction, where the tesseract grid shows the axes. */
import { SPECIES } from "./foam.js";
export const CELL = 1.3;
function inv4(m) {
  const a = m.map((r, i) => [...r, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; for (let j = 0; j < 8; j++) a[c][j] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 8; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(4));
}
export function kelvin(cell = CELL) {
  const sp = SPECIES.a4, B = sp.B.map((b) => b.map((x) => x * cell)), rel = sp.rel.map((v) => v.map((x) => x * cell));
  return { B, Binv: inv4([0, 1, 2, 3].map((j) => B.map((b) => b[j]))), rel };
}
