/* BRUT⁴'s engineer. No DOM.

   A much smaller thing than tjs/brut's (no spectra, no time histories, no foundation): the four checks that say whether
   a frame of this shape stands, done in four dimensions honestly, which changes every one of them.

   UNITS. Lengths in metres, forces in newtons. A floor is a 3-volume, so a floor load is N per m³ of floor; a column's
   cross-section is a 3-volume too, so stress is N/m³; density is kg/m⁴. The material is concrete's numbers carried
   over by analogy (a consistent fiction): what is real is how the checks SCALE.

   1 GRAVITY. Each column takes the floor in its tributary VOLUME (a bay cube, an eighth of one at a corner), every
     floor above it. In our world doubling the bay quadruples the load; here it is eightfold, and a column the
     proportions of ours fails within three storeys. So the column is sized, not assumed: the smallest cube that
     carries the worst stack.
   2 SWAY. A shear building: storey stiffness is the columns' (12EI/h³, with I = c⁵/12 for a cube section), storey mass
     its floor's. The frame is the same in all three ground directions, so every mode comes three times over.
   3 WIND. Pressure on a face that is 3D (a storey's height times two widths), storey shears, drift against h/400.
   4 OVERTURNING. The wind's moment about the base against the weight's, at half the base's least width. */
import { M, H, SLAB } from "./dims.js";
export const MAT = { rho: 2400, g: 9.81, fc: 40e6, E: 30e9, phi: 0.65 * 0.8 * 0.85 }, SDL = 1.5e3, LIVE = 3.0e3, WIND = 1.2e3;
const floorLoad = MAT.rho * MAT.g * SLAB + SDL + LIVE;                         // N per m³ of floor
/* how many of the building's floors are carried at lattice point (i, j, k), and the tributary volume there on each */
function stack(mass, i, j, k) { let N = 0, floors = 0; for (const t of mass.tiers) { const p = [i, j, k]; if (!p.every((v, ax) => v >= t.range[ax][0] && v <= t.range[ax][1])) continue; let trib = 1; p.forEach((v, ax) => { trib *= (v === t.range[ax][0] || v === t.range[ax][1] ? 0.5 : 1) * M; }); N += trib * floorLoad * t.storeys; floors += t.storeys; } return { N, floors }; }
export function takedown(mass) {
  const base = mass.tiers[0].range; let worst = { N: 0 };
  for (let i = base[0][0]; i <= base[0][1]; i++) for (let j = base[1][0]; j <= base[1][1]; j++) for (let k = base[2][0]; k <= base[2][1]; k++) { const s = stack(mass, i, j, k); if (s.N > worst.N) worst = { ...s, at: [i, j, k] }; }
  /* size: the cube whose section carries the worst stack and its own weight (which depends on the size: iterate) */
  let col = 0.3; for (let it = 0; it < 30; it++) { const self = MAT.rho * MAT.g * col ** 3 * worst.floors * H, need = Math.cbrt((worst.N + self) / (MAT.phi * MAT.fc)); col = Math.max(0.3, Math.ceil(need * 20 - 1e-9) / 20); if (MAT.phi * MAT.fc * col ** 3 >= worst.N + MAT.rho * MAT.g * col ** 3 * worst.floors * H) break; col += 0.05; }
  const cap = (c) => MAT.phi * MAT.fc * c ** 3, ours = 0.5;
  return { col, worst, floorLoad, capacity: cap(col), use: (worst.N + MAT.rho * MAT.g * col ** 3 * worst.floors * H) / cap(col), ours: { col: ours, use: worst.N / cap(ours), storeys: Math.floor(cap(ours) / (M ** 3 * floorLoad)) } };
}
/* the n lowest eigenvalues' worth of a symmetric tridiagonal-ish matrix: Jacobi, the matrices here are tiny */
function eig(A) { const n = A.length; A = A.map((r) => r.slice()); for (let sweep = 0; sweep < 80; sweep++) { let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2; if (off < 1e-22) break; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c; for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; } for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; } } } return A.map((r, i) => r[i]).sort((a, b) => a - b); }
export function engineer(b) {
  const g = takedown(b), col = b.col ?? g.col, storeys = [];
  for (const t of b.tiers) { const n = t.range.map(([a, c]) => c - a), ncol = (n[0] + 1) * (n[1] + 1) * (n[2] + 1), vol = n[0] * n[1] * n[2] * M ** 3, ext = n.map((v) => v * M);
    for (let s = 0; s < t.storeys; s++) storeys.push({ k: (ncol * 12 * MAT.E * (col ** 5 / 12)) / H ** 3, m: (vol * (floorLoad - LIVE * 0.75)) / MAT.g + (ncol * MAT.rho * col ** 3 * H), ext, ncol }); }
  const n = storeys.length, K = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) { K[i][i] += storeys[i].k; if (i + 1 < n) { K[i][i] += storeys[i + 1].k; K[i][i + 1] -= storeys[i + 1].k; K[i + 1][i] -= storeys[i + 1].k; } }
  /* M^(−1/2) K M^(−1/2), symmetric */
  const w2 = eig(K.map((r, i) => r.map((v, j) => v / Math.sqrt(storeys[i].m * storeys[j].m)))), periods = w2.slice(0, 3).map((v) => (2 * Math.PI) / Math.sqrt(v));
  /* wind along each ground direction: the face it meets is the storey's height times the other two widths */
  const dirs = [0, 1, 2].map((ax) => { const o = [0, 1, 2].filter((v) => v !== ax), F = storeys.map((s) => WIND * H * s.ext[o[0]] * s.ext[o[1]]); let V = 0, drift = 0, worstStorey = 0; const shear = Array(n); for (let i = n - 1; i >= 0; i--) { V += F[i]; shear[i] = V; } for (let i = 0; i < n; i++) { const d = shear[i] / storeys[i].k; drift += d; worstStorey = Math.max(worstStorey, d / H); }
    const Mo = F.reduce((a, f, i) => a + f * (i + 0.5) * H, 0), Wt = storeys.reduce((a, s) => a + s.m, 0) * MAT.g, Mr = (Wt * storeys[0].ext[ax]) / 2;
    return { axis: "xzw"[ax], baseShear: shear[0], drift, driftRatio: drift / (n * H), storeyDrift: worstStorey, overturning: Mo / Mr }; });
  const useCol = (g.worst.N + MAT.rho * MAT.g * col ** 3 * g.worst.floors * H) / (MAT.phi * MAT.fc * col ** 3);
  const checks = [{ name: "columns (gravity)", use: useCol }, { name: "storey drift (wind)", use: Math.max(...dirs.map((d) => d.storeyDrift)) / (1 / 400) }, { name: "overturning (wind)", use: Math.max(...dirs.map((d) => d.overturning)) / (1 / 1.5) }];
  return { gravity: g, col, storeys: n, height: n * H, mass: storeys.reduce((a, s) => a + s.m, 0), columns: storeys.reduce((a, s) => a + s.ncol, 0), periods, triple: true, wind: dirs, checks, stands: checks.every((c) => c.use <= 1) };
}
