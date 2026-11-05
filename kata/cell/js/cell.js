/* CELL, no DOM: a cell's membrane in 3D and in 4D, held out by its pressure and in by its cortex.

   THE SHAPE is a radius over every direction from the cell's centre, r(n), n on the unit sphere S^{d−1} (a 2-sphere
   in 3D, a 3-sphere in 4D): a cell with no overhangs, star-shaped round its centre.

   THE GRID over the directions is a cube blown out onto the sphere: each of the cube's 2d faces (6 in 3D, 8 in 4D) is
   an N^{d−1} grid, equi-angular (u = (4/π) atan(t), so the cells are near equal), with no poles anywhere. A node's place
   is (face, u indices), which is also where it sits in the shader's texture; its neighbours along each grid axis are
   found by stepping u across the face's edge onto the next face.

   THE PHYSICS is overdamped and normal: every patch of membrane moves out at
       v = μ (P − σ H + f)
   with P the pressure inside (the same everywhere), σ the cortex's tension there, H the membrane's mean curvature (summed
   over its d − 1 directions: (d − 1)/R for a sphere), and f any other push (a contractile ring or belt). The volume is
   held fixed, which sets P. For a round cell of uniform tension that is Laplace's law, P = σ (d − 1)/R. Where the
   tension drops, the membrane bulges until its curvature is P/σ (a pseudopod); where it rises, it flattens and pushes
   the inside elsewhere (a contraction).
   H for a radius function: H ≈ (d − 1)/r − Δ_S r / r² (the round part, and the sphere's Laplacian of the radius: small
   slopes). The Laplacian part is taken implicitly (a few Jacobi sweeps), so the step can be long. */
export const R0 = 1;

/* ---------------------------------------------------------------- the grid on S^{d−1} */
export function makeGrid(d, N) {
  const F = 2 * d, m = d - 1, per = N ** m, count = F * per, n = new Float64Array(count * d), w = new Float64Array(count);
  const faceAxes = (f) => { const ax = f >> 1, sg = f & 1 ? -1 : 1, others = []; for (let a = 0; a < d; a++) if (a !== ax) others.push(a); return { ax, sg, others }; };
  // a direction from a face and its u (each in [−1, 1]: the face's own coordinates)
  const dir = (f, u) => { const { ax, sg, others } = faceAxes(f), v = new Array(d).fill(0); v[ax] = sg; others.forEach((a, j) => { v[a] = Math.tan((Math.PI / 4) * u[j]); }); const l = Math.hypot(...v); return v.map((x) => x / l); };
  // and back: the face whose axis the direction leans along most, and the u there (continuous)
  const locate = (v) => { let ax = 0; for (let a = 1; a < d; a++) if (Math.abs(v[a]) > Math.abs(v[ax])) ax = a; const f = 2 * ax + (v[ax] < 0 ? 1 : 0), { others } = faceAxes(f); return { f, u: others.map((a) => (4 / Math.PI) * Math.atan(v[a] / Math.abs(v[ax]))) }; };
  const nodeOf = (f, idx) => f * per + idx.reduce((s, k, j) => s + k * N ** j, 0);
  const nearest = (v) => { const { f, u } = locate(v); return nodeOf(f, u.map((x) => Math.min(N - 1, Math.max(0, Math.floor(((x + 1) / 2) * N))))); };
  const du = 2 / N;
  for (let f = 0; f < F; f++) for (let q = 0; q < per; q++) {
    const idx = []; let r = q; for (let j = 0; j < m; j++) { idx.push(r % N); r = Math.floor(r / N); }
    const u = idx.map((k) => -1 + (2 * k + 1) / N), v = dir(f, u), i = f * per + q;
    for (let c = 0; c < d; c++) n[i * d + c] = v[c];
    // its share of the sphere: the solid angle of its grid cell (gnomonic t = tan(π u/4): dΩ = Π dt / |(1, t)|^d)
    let J = 1, t2 = 1; for (const x of u) { const t = Math.tan((Math.PI / 4) * x); J *= (Math.PI / 4) * (1 + t * t) * du; t2 += t * t; }
    w[i] = J / t2 ** (d / 2);
  }
  const area = d === 3 ? 4 * Math.PI : 2 * Math.PI ** 2, sw = w.reduce((a, b) => a + b, 0); for (let i = 0; i < count; i++) w[i] *= area / sw;
  // the neighbours along each grid axis, both ways, stepping across a face's edge onto the next face; and the angle to each
  const K = 2 * m, nb = new Int32Array(count * K), ang = new Float64Array(count * K);
  for (let f = 0; f < F; f++) for (let q = 0; q < per; q++) {
    const idx = []; let r = q; for (let j = 0; j < m; j++) { idx.push(r % N); r = Math.floor(r / N); }
    const i = f * per + q, u = idx.map((k) => -1 + (2 * k + 1) / N);
    for (let j = 0; j < m; j++) for (const s of [1, -1]) {
      const u2 = u.slice(); u2[j] += s * du; let k;
      if (u2[j] > -1 && u2[j] < 1) k = nodeOf(f, idx.map((x, jj) => (jj === j ? x + s : x)));
      else { const { ax, sg, others } = faceAxes(f), v = new Array(d).fill(0); v[ax] = sg; others.forEach((a, jj) => { v[a] = Math.tan((Math.PI / 4) * u2[jj]); }); k = nearest(v); }
      const slot = i * K + 2 * j + (s > 0 ? 0 : 1); nb[slot] = k;
      let c = 0; for (let a = 0; a < d; a++) c += n[i * d + a] * n[k * d + a]; ang[slot] = Math.acos(Math.min(1, c));
    }
  }
  return { d, N, F, per, count, n, w, nb, ang, K, area, locate, nearest };
}

/* the sphere's Laplacian, by least squares. Across a face's edge the grid's lines bend, so a plain second difference
   goes wrong there (by more than the Laplacian itself, at the corners). Instead, for every node: its nearest neighbours
   (from its grid neighbours and theirs), laid flat in its tangent space by the sphere's exponential map (angle and
   direction), and the weights that give the Laplacian of every quadratic exactly. In those coordinates the metric is
   flat to second order at the node, so that is the sphere's Laplacian there. Weights for the centre make a constant's
   Laplacian zero. Built once */
export function lapWeights(G) {
  if (G.L) return G.L;
  const { d, count, n, nb, K } = G, m = d - 1, want = d === 3 ? 12 : 24, p = 1 + m + (m * (m + 1)) / 2;
  const idx = new Int32Array(count * want), wt = new Float64Array(count * want), wc = new Float64Array(count);
  const v0 = new Array(d), basis = [];
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < d; c++) v0[c] = n[i * d + c];
    // a tangent basis at n_i (Gram–Schmidt from the axes)
    basis.length = 0;
    for (let a = 0; a < d && basis.length < m; a++) { let e = new Array(d).fill(0); e[a] = 1; let pr = e.reduce((s2, x, c) => s2 + x * v0[c], 0); e = e.map((x, c) => x - pr * v0[c]); for (const b of basis) { pr = e.reduce((s2, x, c) => s2 + x * b[c], 0); e = e.map((x, c) => x - pr * b[c]); } const l = Math.hypot(...e); if (l > 0.3) basis.push(e.map((x) => x / l)); }
    // candidates: neighbours and theirs
    const cand = new Set(); for (let j = 0; j < K; j++) { const a = nb[i * K + j]; cand.add(a); for (let k = 0; k < K; k++) cand.add(nb[a * K + k]); } cand.delete(i);
    const list = [...cand].map((k) => { let c = 0; for (let a = 0; a < d; a++) c += v0[a] * n[k * d + a]; return { k, th: Math.acos(Math.min(1, c)) }; }).sort((x, y) => x.th - y.th).slice(0, want);
    // their tangent coordinates (exp-map: angle × unit direction)
    const X = list.map(({ k, th }) => { const v = new Array(d); let c = 0; for (let a = 0; a < d; a++) c += v0[a] * n[k * d + a]; for (let a = 0; a < d; a++) v[a] = n[k * d + a] - c * v0[a]; const l = Math.hypot(...v) || 1; return basis.map((b) => (th * b.reduce((s2, x, a) => s2 + x * v[a], 0)) / l); });
    // design rows [1, x_j, x_j x_l (j ≤ l)] minus the centre's row: fitting f_k − f_i, so the constant drops; L = Δ of each basis
    const rows = X.map((x) => { const r = []; for (let j = 0; j < m; j++) r.push(x[j]); for (let j = 0; j < m; j++) for (let l = j; l < m; l++) r.push(j === l ? x[j] * x[j] / 2 : x[j] * x[l]); return r; });
    const q = p - 1, Lv = []; for (let j = 0; j < m; j++) Lv.push(0); for (let j = 0; j < m; j++) for (let l = j; l < m; l++) Lv.push(j === l ? 1 : 0);
    // weights c = R (RᵀR)⁻¹ L, with each row weighted toward the near (1/θ²), so the fit leans on the closest
    const sc = list.map(({ th }) => 1 / (th * th)), M = Array.from({ length: q }, () => new Array(q).fill(0));
    rows.forEach((r, k) => { for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) M[a][b] += sc[k] * r[a] * r[b]; });
    const y = solveSym(M, Lv); let sum = 0;
    list.forEach(({ k }, j) => { const c = sc[j] * rows[j].reduce((s2, x, a) => s2 + x * y[a], 0); idx[i * want + j] = k; wt[i * want + j] = c; sum += c; });
    wc[i] = -sum;
  }
  return (G.L = { want, idx, wt, wc });
}
function solveSym(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c] || 1e-30; for (let j = c; j <= n; j++) A[c][j] /= v; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]; } }
  return A.map((r) => r[n]);
}
export function laplacian(G, f, out) {
  const { want, idx, wt, wc } = lapWeights(G);
  for (let i = 0; i < G.count; i++) { let s = wc[i] * f[i]; for (let j = 0; j < want; j++) s += wt[i * want + j] * f[idx[i * want + j]]; out[i] = s; }
  return out;
}

/* ---------------------------------------------------------------- the cell */
export function makeCell(d, N = d === 3 ? 24 : 12) {
  const G = makeGrid(d, N), c = G.count;
  const cell = { d, G, r: new Float64Array(c).fill(R0), sigma: new Float64Array(c).fill(1), f: new Float64Array(c), mu: 1, P: 0, t: 0, H: new Float64Array(c), lap: new Float64Array(c), tmp: new Float64Array(c) };
  cell.V0 = volume(cell); cell.P = (d - 1) / R0;
  return cell;
}
export function volume(cell) { const { G, r, d } = cell; let v = 0; for (let i = 0; i < G.count; i++) v += (G.w[i] * r[i] ** d) / d; return v; }
/* the membrane's area: each patch's share of the sphere times r^{d−1}, tilted by its slope (√(1 + |∇r|²/r²)) */
export function area(cell) {
  const { G, r, d } = cell; let a = 0;
  for (let i = 0; i < G.count; i++) { let g2 = 0; for (let j = 0; j < G.K; j += 2) { const s = (r[G.nb[i * G.K + j]] - r[G.nb[i * G.K + j + 1]]) / (G.ang[i * G.K + j] + G.ang[i * G.K + j + 1]); g2 += s * s; } a += G.w[i] * r[i] ** (d - 1) * Math.sqrt(1 + g2 / (r[i] * r[i])); }
  return a;
}
/* mean curvature everywhere: (d − 1)/r − Δ_S r / r² */
export function curvature(cell) { const { G, r, d, H, lap } = cell; laplacian(G, r, lap); for (let i = 0; i < G.count; i++) H[i] = (d - 1) / r[i] - lap[i] / (r[i] * r[i]); return H; }

/* one step of dt: the pressure that keeps the volume (from the forces as they are), then every patch moved, the
   Laplacian part implicitly; then the volume restored exactly by a uniform shift (a rounding's worth) */
export function step(cell, dt, sweeps = 6) {
  const { G, r, sigma, f, d, mu, tmp, lap } = cell, n = G.count, rMin = 0.04 * R0;
  curvature(cell);
  // P: the volume's rate of change Σ w r^{d−1} v must be zero
  let num = 0, den = 0; for (let i = 0; i < n; i++) { const a = G.w[i] * r[i] ** (d - 1); num += a * (-sigma[i] * cell.H[i] + f[i]); den += a; }
  cell.P = -num / den;
  // r' − dt μ σ Δr'/r² = r + dt μ (P − σ (d − 1)/r + f), by Jacobi sweeps on the least-squares Laplacian
  const { want, idx, wt, wc } = lapWeights(G), rhs = cell.rhs || (cell.rhs = new Float64Array(n)), kk = cell.kk || (cell.kk = new Float64Array(n));
  for (let i = 0; i < n; i++) { rhs[i] = r[i] + dt * mu * (cell.P - (sigma[i] * (d - 1)) / r[i] + f[i]); kk[i] = (dt * mu * sigma[i]) / (r[i] * r[i]); }
  tmp.set(r);
  for (let s = 0; s < sweeps; s++) {
    for (let i = 0; i < n; i++) { let o = rhs[i]; for (let j = 0; j < want; j++) o += kk[i] * wt[i * want + j] * tmp[idx[i * want + j]]; lap[i] = o / (1 - kk[i] * wc[i]); }
    tmp.set(lap);
  }
  for (let i = 0; i < n; i++) r[i] = Math.max(rMin, tmp[i]);
  // the volume, exactly: a uniform shift δ with Σ w r^{d−1} δ = V0 − V (Newton, twice)
  for (let k = 0; k < 2; k++) { let v = 0, a = 0; for (let i = 0; i < n; i++) { v += (G.w[i] * r[i] ** d) / d; a += G.w[i] * r[i] ** (d - 1); } const dl = (cell.V0 - v) / a; for (let i = 0; i < n; i++) r[i] = Math.max(rMin, r[i] + dl); }
  cell.t += dt;
}

/* ---------------------------------------------------------------- what the cortex does: presets
   each sets σ (the tension, 1 at rest) and f (any other push, outward positive) over the directions n, at time t.
   "front" is +x. In 4D the ring is a great circle (the x–z plane's), a 1D loop on the 3-sphere; the belt is the
   equatorial 2-sphere y = 0. In 3D they are the same thing: the equator of a 2-sphere is a circle */
const sm = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export const PRESETS = {
  // at rest: the tension wanders a little, slowly, over the whole surface (a living cortex is never quite still)
  rest: (d, n, t) => ({ s: 1 + 0.08 * Math.sin(3 * n[0] + 1.3 * t) * Math.cos(2 * n[1] - 0.9 * t) + 0.06 * Math.sin(2.5 * n[2] + 0.7 * t), f: 0 }),
  // a pseudopod: the cortex weakens in a cap at the front; the pressure pushes the membrane out there until its
  // curvature is P/σ
  // (a 7 s cycle: weaken for ~3 s, then the tension comes back and the pseudopod is pulled in; held weak, a patch like
  // this balloons until it has drained the cell: an aneurysm, which is how a bleb runs away)
  reach: (d, n, t) => { const c = n[0], p = t % 7, on = p < 3.5 ? sm(p / 1.2) : 1 - sm((p - 3.5) / 1.5); return { s: 1 - 0.5 * on * sm((c - 0.82) / 0.12), f: 0 }; },
  // a contraction: the rear cap's cortex tightens (three times its rest); the rear flattens and the inside goes forward
  contract: (d, n, t) => { const k = 0.5 + 0.5 * Math.sin(0.9 * t - 1.5); return { s: 1 + 2.5 * k * sm((-n[0] - 0.3) / 0.4), f: 0 }; },
  // a contraction wave: a band of tight cortex travelling front to back, again and again (peristaltic)
  wave: (d, n, t) => { const ph = ((0.35 * t) % 1.4) - 0.2, x = (1 - n[0]) / 2; return { s: 1 + 2 * Math.exp(-(((x - ph) / 0.08) ** 2)), f: 0 }; },
  // a bleb: the cortex lets go of a small patch all at once, the membrane balloons out, the cortex re-forms under it
  // and pulls it back (a 4 s cycle)
  bleb: (d, n, t) => { const p = t % 4, near = sm((n[0] * 0.7 + n[1] * 0.71 - 0.9) / 0.06), s = p < 1.2 ? 0.15 : p < 2.2 ? 0.15 + 2.6 * (p - 1.2) : 2.75 - 1.75 * sm((p - 2.2) / 1.5); return { s: 1 + (s - 1) * near, f: 0 }; },
  // division by a contractile BELT round the whole equator (y = 0): in 3D a ring, in 4D a 2-sphere's worth; its tension
  // pulls in at (number of directions it curves in)/r, ramping up
  belt: (d, n, t) => { const T = 8 * sm(t / 8), band = Math.exp(-((n[1] / 0.3) ** 2)); return { s: 1, f: -T * band * (d - 2), band }; },
  // a contractile RING: a 1D loop (in 4D the x–z great circle, y = w = 0): in 3D it IS the belt; in 4D it only dents
  ring: (d, n, t) => { const T = 8 * sm(t / 8), off = d === 3 ? Math.abs(n[1]) : Math.hypot(n[1], n[3]), band = Math.exp(-((off / 0.3) ** 2)); return { s: 1, f: -T * band, band }; },
};
/* the ring's and the belt's pull grows as the waist narrows (a loop of tension T round a waist of radius ρ pulls in at
   T/ρ per unit of its length): applied as f/r at the patch. Everything else as the preset says */
export function applyPreset(cell, name, t) {
  const { G, d, r, sigma, f } = cell, P = PRESETS[name], v = new Array(d), band = cell.band || (cell.band = new Float64Array(G.count));
  for (let i = 0; i < G.count; i++) {
    for (let c = 0; c < d; c++) v[c] = G.n[i * d + c];
    const o = P(d, v, t); sigma[i] = o.s; band[i] = o.band || 0;
    f[i] = name === "belt" || name === "ring" ? o.f / Math.max(0.2, r[i]) : o.f;
  }
}
/* the waist: the radius at the equator (directions with |y| small), its least and its mean; and in 4D the radius along
   the ring (y = w = 0) against the equator away from it (y = 0, |w| large) */
export function waist(cell) {
  const { G, d, r } = cell; let mn = Infinity, sum = 0, cnt = 0, ring = 0, rn = 0, off = 0, on = 0;
  for (let i = 0; i < G.count; i++) {
    const y = G.n[i * d + 1]; if (Math.abs(y) > 0.1) continue;
    mn = Math.min(mn, r[i]); sum += r[i]; cnt++;
    if (d === 4) { const wv = Math.abs(G.n[i * d + 3]); if (wv < 0.1) { ring += r[i]; rn++; } else if (wv > 0.7) { off += r[i]; on++; } }
  }
  return { min: mn, mean: sum / cnt, ring: rn ? ring / rn : null, away: on ? off / on : null };
}
