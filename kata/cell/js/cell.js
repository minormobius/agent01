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
/* the nucleus: a stiff ball of radius NUC_A (a 4-ball in 4D). The membrane can't come nearer it than NUC_GAP (the
   cortex and a little cytoplasm between); inside NUC_SOFT more it is pushed back, and pushes the nucleus away */
/* moving. The cortex flows toward where it is tight (myosin pulls it there): v_c = κ ∇σ along the surface. Whatever the
   surface rubs against takes that flow as a push the other way: the water (ζ_f, all over: the cell swims, as a
   squirmer does, U = −⟨v_c⟩) or the floor where it is stuck down (ζ_s, much stiffer: it crawls on its contact). The
   floor: the plane y = 0; the cell's centre stands FLOOR_H above it, the membrane can't go below it, and within ADH_BAND
   of it adhesion pulls the membrane down (ADH_W), so the cell spreads on it; and it is pressed flat (FLATTEN: its weight,
   and its dorsal cortex pulling down, as a pressure falling with height, −FLATTEN·y), so it lies as a splat with a hump
   over the nucleus, not an orb */
export const KAPPA = 0.5, ZETA_F = 1, ZETA_S = 20, FLOOR_H = 0.2, ADH_BAND = 0.3, ADH_W = 3, FLATTEN = 12;
/* smell: food on the floor leaks a chemical; held steady, a point source's concentration falls as 1/r^{d−2} (1/r here,
   1/r² in 4D), smoothed over SMELL_S. The cell reads it at every patch, can follow it only above SMELL_MIN (too few
   molecules below that to tell a direction), turns toward it at TURN a second, and without it wanders (WANDER: the
   heading's rotational diffusion) */
export const SMELL_S = 0.3, SMELL_MIN = 0.1, TURN = 1.5, WANDER = 0.15, FOOD_R = 0.12, FOOD_DIST = 5;
export const NUC_A = 0.34, NUC_GAP = 0.04, NUC_SOFT = 0.12, NUC_K = 40, NUC_MOB = 0.25, NUC_CENTRE = 0.6;

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
  const idx = new Int32Array(count * want), wt = new Float64Array(count * want), wc = new Float64Array(count), gw = new Float64Array(count * want * d);
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
    // and the gradient from the same fit: its linear coefficients, as a vector in the tangent basis (weights on f_k − f_i)
    for (let g = 0; g < m; g++) {
      const e = new Array(q).fill(0); e[g] = 1; const yg = solveSym(M, e);
      list.forEach((_, j) => { const c = sc[j] * rows[j].reduce((s2, x, a) => s2 + x * yg[a], 0); for (let a = 0; a < d; a++) gw[(i * want + j) * d + a] += c * basis[g][a]; });
    }
  }
  return (G.L = { want, idx, wt, wc, gw });
}
function solveSym(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c] || 1e-30; for (let j = c; j <= n; j++) A[c][j] /= v; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]; } }
  return A.map((r) => r[n]);
}
/* the gradient of f over the unit sphere at every node, a tangent d-vector (out: count × d) */
export function surfGrad(G, f, out) {
  const { want, idx, gw } = lapWeights(G), d = G.d;
  for (let i = 0; i < G.count; i++) { for (let a = 0; a < d; a++) out[i * d + a] = 0; for (let j = 0; j < want; j++) { const df = f[idx[i * want + j]] - f[i], o = (i * want + j) * d; for (let a = 0; a < d; a++) out[i * d + a] += gw[o + a] * df; } }
  return out;
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
  cell.fc = new Float64Array(c); cell.hard = new Float64Array(c); cell.pinned = new Uint8Array(c);
  const c0 = new Float64Array(d); c0[0] = -0.12; c0[1] = 0.05; c0[2] = 0.08; if (d === 4) c0[3] = 0.06;
  cell.nuc = [{ c: c0, a: NUC_A }];
  // where it is (its centre, in the world), how fast it goes, the cortex's flow, the floor (none: it floats)
  cell.X = new Float64Array(d); cell.V = new Float64Array(d); cell.gs = new Float64Array(c * d); cell.kappa = KAPPA; cell.floor = null;
  cell.ceil = new Float64Array(c).fill(Infinity); cell.adh = new Float64Array(c); cell.V00 = cell.V0;
  cell.heading = new Float64Array(d); cell.heading[0] = 1; cell.food = null; cell.eaten = 0; cell.seed = 12345; cell.sinceMeal = 0;
  cell.sm = { c: 0, grad: 0, senses: false };
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


/* where the ray from the centre along direction n leaves a ball (centre c, radius a): the far root of |t n − c| = a,
   or −∞ if the ray misses it. The membrane is star-shaped round the centre, so this is how near it may come */
function farHit(n, o, c, a, d) { let b = 0, cc = 0; for (let k = 0; k < d; k++) { b += n[o + k] * c[k]; cc += c[k] * c[k]; } const q = a * a - cc + b * b; return q > 0 ? b + Math.sqrt(q) : -Infinity; }
/* the membrane against the nuclei: cell.fc, an outward push wherever the membrane is within NUC_SOFT of the gap
   (stiff, linear in the overlap); cell.hard, the nearest it may ever come. And the push's reaction on each nucleus */
function contact(cell) {
  const { G, r, d, nuc, fc, hard } = cell, n = G.count;
  fc.fill(0); hard.fill(0);
  const F = nuc.map(() => new Float64Array(d));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < nuc.length; k++) {
      const N = nuc[k], th = farHit(G.n, i * d, N.c, N.a + NUC_GAP, d); if (th === -Infinity) continue;
      if (th > hard[i]) hard[i] = th;
      const ov = th + NUC_SOFT - r[i]; if (ov <= 0) continue;
      const p = NUC_K * ov; fc[i] += p;
      const A = G.w[i] * r[i] ** (d - 1); for (let j = 0; j < d; j++) F[k][j] -= p * A * G.n[i * d + j];
    }
  }
  return F;
}
/* the cell's centre of mass (∫ x dV over the star: Σ w r^{d+1} n/(d+1)), of all of it or of the half with sign(y) = sy */
export function centroid(cell, sy = 0) {
  const { G, r, d } = cell, m = new Float64Array(d); let v = 0;
  for (let i = 0; i < G.count; i++) { const y = G.n[i * d + 1]; if (sy && y * sy <= 0) continue; const q = G.w[i] * r[i] ** (d + 1) / (d + 1); for (let j = 0; j < d; j++) m[j] += q * G.n[i * d + j]; v += G.w[i] * r[i] ** d / d; }
  for (let j = 0; j < d; j++) m[j] /= v; return m;
}
/* the nuclei move: pushed by the membrane where it presses (NUC_MOB: a big body, slow through the cytoplasm), held
   toward the cell's centre of mass by the cytoskeleton (at NUC_CENTRE a second; after a split, each daughter toward its
   own half's), and two daughters kept apart. Then the membrane is held off them: the hard limit, exactly */
function moveNuclei(cell, F, dt) {
  const { d, nuc } = cell, two = nuc.length === 2;
  const tg = two ? [centroid(cell, 1), centroid(cell, -1)] : [centroid(cell)];
  for (let k = 0; k < nuc.length; k++) {
    const N = nuc[k], T = two ? (N.c[1] >= 0 ? tg[0] : tg[1]) : tg[0];
    for (let j = 0; j < d; j++) N.c[j] += dt * (NUC_MOB * F[k][j] + NUC_CENTRE * (T[j] - N.c[j]));
    if (cell.floor) N.c[1] = Math.max(N.c[1], -cell.floor.h + N.a + NUC_GAP + 0.03);
  }
  if (two) { const [A, B] = nuc; let dd = 0; for (let j = 0; j < d; j++) dd += (A.c[j] - B.c[j]) ** 2; dd = Math.sqrt(dd); const m = A.a + B.a + 0.04; if (dd < m) { const s = (m - dd) / 2 / Math.max(dd, 1e-6); for (let j = 0; j < d; j++) { const e = (A.c[j] - B.c[j]) * s; A.c[j] += e; B.c[j] -= e; } } }
}
/* mitosis: the nucleus splits in two, each with half its volume (radius × 2^{−1/d}), one either side of y = 0 */
export function splitNucleus(cell) {
  if (cell.nuc.length !== 1) return; const { d } = cell, N = cell.nuc[0], a = N.a * 2 ** (-1 / d);
  cell.nuc = [1, -1].map((s) => { const c = Float64Array.from(N.c); c[1] += s * 0.06; return { c, a }; });
}
/* how near the membrane is to any nucleus anywhere (radially, the gap not counted): > 0 means none is cut */
export function nucClearance(cell) {
  const { G, r, d, nuc } = cell; let m = Infinity;
  for (let i = 0; i < G.count; i++) for (const N of nuc) { const th = farHit(G.n, i * d, N.c, N.a, d); if (th !== -Infinity) m = Math.min(m, r[i] - th); }
  return m;
}


/* ---------------------------------------------------------------- the floor, moving, smelling */
export function setFloor(cell, on) {
  if (!on) { cell.floor = null; cell.ceil.fill(Infinity); cell.adh.fill(0); return; }
  cell.floor = { h: FLOOR_H * (cell.V0 / cell.V00) ** (1 / cell.d) }; cell.X[1] = cell.floor.h;
}
/* the floor's limit on each patch (the membrane may not go below y = −h, so along n with n_y < 0, r ≤ h/(−n_y)), and
   how stuck down each is (1 touching, falling to 0 at ADH_BAND off it) */
function floorBounds(cell) {
  const { G, d, r, ceil, adh, floor } = cell; ceil.fill(Infinity); adh.fill(0); if (!floor) return;
  for (let i = 0; i < G.count; i++) { const ny = G.n[i * d + 1]; if (ny > -1e-6) continue; ceil[i] = floor.h / -ny; const gap = Math.max(0, ceil[i] - r[i]); if (gap < ADH_BAND) adh[i] = 1 - gap / ADH_BAND; }
}
/* the cell's velocity: the cortex flows at v_c = κ ∇σ / r; each patch's friction (water everywhere, the floor where it
   touches) pushes the cell against that flow, and with no outside force the pushes balance:
   V = −Σ ζ A v_c / Σ ζ A. On the floor the cell keeps to it (no vertical part) */
export function velocity(cell) {
  const { G, d, r, sigma, floor, adh, V } = cell; V.fill(0);
  // (a uniform cortex doesn't flow: skip the gradient)
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < G.count; i++) { if (sigma[i] < lo) lo = sigma[i]; if (sigma[i] > hi) hi = sigma[i]; } if (hi - lo < 1e-12) return V;
  const g = surfGrad(G, sigma, cell.gs); let den = 0;
  for (let i = 0; i < G.count; i++) {
    const A = G.w[i] * r[i] ** (d - 1), z = A * (ZETA_F + (floor && adh[i] > 0.9 ? ZETA_S : 0)), k = (cell.kappa * z) / r[i];
    for (let a = 0; a < d; a++) V[a] -= k * g[i * d + a]; den += z;
  }
  for (let a = 0; a < d; a++) V[a] /= den; if (floor) V[1] = 0;
  return V;
}
function rand(cell) { let t = (cell.seed = (cell.seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const gauss = (cell) => Math.sqrt(-2 * Math.log(rand(cell) + 1e-12)) * Math.cos(2 * Math.PI * rand(cell));
export const smell = (d, x, F) => { let q = SMELL_S * SMELL_S; for (let a = 0; a < d; a++) q += (x[a] - F[a]) ** 2; return 1 / q ** ((d - 2) / 2); };
/* what the membrane smells: the mean concentration over it, and the gradient across it, fitted (least squares over
   every patch, weighted by its area: c ≈ c̄ + g·(x − x̄), whatever the cell's shape); its size relative to c̄ (per
   radius), and its direction along the floor */
export function sense(cell) {
  const { G, d, r, X, food } = cell, x = new Array(d), p = new Float64Array(d); let S = 0, cs = 0;
  if (!food) return (cell.sm = { c: 0, grad: 0, senses: false, dir: p });
  const cv = cell.cv || (cell.cv = new Float64Array(G.count));
  for (let i = 0; i < G.count; i++) { for (let a = 0; a < d; a++) x[a] = X[a] + r[i] * G.n[i * d + a]; cv[i] = smell(d, x, food); const A = G.w[i] * r[i] ** (d - 1); S += A; cs += A * cv[i]; }
  const cb = cs / S, xb = new Float64Array(d), M = Array.from({ length: d }, () => new Array(d).fill(0)), b = new Array(d).fill(0);
  for (let i = 0; i < G.count; i++) { const A = G.w[i] * r[i] ** (d - 1); for (let a = 0; a < d; a++) xb[a] += (A * (X[a] + r[i] * G.n[i * d + a])) / S; }
  for (let i = 0; i < G.count; i++) { const A = G.w[i] * r[i] ** (d - 1); for (let a = 0; a < d; a++) x[a] = X[a] + r[i] * G.n[i * d + a] - xb[a]; for (let a = 0; a < d; a++) { b[a] += A * x[a] * (cv[i] - cb); for (let c = 0; c < d; c++) M[a][c] += A * x[a] * x[c]; } }
  const g = solveSym(M, b); for (let a = 0; a < d; a++) if (a !== 1) p[a] = g[a];
  const m = Math.hypot(...p);
  return (cell.sm = { c: cb, grad: Math.hypot(...g) / cb, senses: cb > SMELL_MIN && m > 0, dir: m > 0 ? p.map((v) => v / m) : p });
}
/* food: a morsel on the floor at distance dist from the cell, in a random direction along the floor */
export function spawnFood(cell, dist = FOOD_DIST) {
  const d = cell.d, h = new Float64Array(d); for (let a = 0; a < d; a++) if (a !== 1) h[a] = gauss(cell); const m = Math.hypot(...h);
  cell.food = new Float64Array(d); for (let a = 0; a < d; a++) cell.food[a] = a === 1 ? FOOD_R : cell.X[a] + (dist * h[a]) / m; cell.sinceMeal = 0;
}
/* the hunt, each step: smell, turn the heading toward the scent if there is one (else let it wander), eat what is
   inside the membrane (engulfed: the cell grows 5%, up to 1.6×), and put out the next morsel */
function hunt(cell, dt) {
  const { d, heading: h } = cell, sm = sense(cell);
  if (sm.senses) { for (let a = 0; a < d; a++) h[a] += dt * TURN * (sm.dir[a] - h[a]); }
  else { const k = Math.sqrt(2 * WANDER * dt); for (let a = 0; a < d; a++) if (a !== 1) h[a] += k * gauss(cell); }
  h[1] = 0; const m = Math.hypot(...h); for (let a = 0; a < d; a++) h[a] /= m;
  cell.sinceMeal += dt;
  if (!cell.food) { spawnFood(cell); return; }
  const u = cell.food.map((v, a) => v - cell.X[a]), L = Math.hypot(...u), i = cell.G.nearest(u.map((v) => v / (L || 1)));
  if (L < cell.r[i] - FOOD_R * 0.5) { cell.eaten++; cell.V0 = Math.min(cell.V00 * 1.6, cell.V0 * 1.05); setFloor(cell, true); spawnFood(cell); }
  else if (cell.sinceMeal > 90) spawnFood(cell);
}

/* one step of dt: the pressure that keeps the volume (from the forces as they are), then every patch moved, the
   Laplacian part implicitly; then the volume restored exactly by a uniform shift (a rounding's worth) */
export function step(cell, dt, sweeps = 6) {
  const { G, r, sigma, f, d, mu, tmp, lap } = cell, n = G.count, rMin = 0.04 * R0;
  curvature(cell);
  const Fn = contact(cell), fc = cell.fc, hard = cell.hard, ceil = cell.ceil, adh = cell.adh; floorBounds(cell);
  if (cell.floor) for (let i = 0; i < n; i++) fc[i] += ADH_W * adh[i] - FLATTEN * r[i] * G.n[i * d + 1];
  // P: the volume's rate of change Σ w r^{d−1} v must be zero
  // (over the free membrane: a patch the floor holds can't move out, so it takes no part)
  let num = 0, den = 0; for (let i = 0; i < n; i++) { if (r[i] >= ceil[i] - 1e-9) continue; const a = G.w[i] * r[i] ** (d - 1); num += a * (-sigma[i] * cell.H[i] + f[i] + fc[i]); den += a; }
  cell.P = -num / den;
  // r' − dt μ σ Δr'/r² = r + dt μ (P − σ (d − 1)/r + f), by Jacobi sweeps on the least-squares Laplacian
  const { want, idx, wt, wc } = lapWeights(G), rhs = cell.rhs || (cell.rhs = new Float64Array(n)), kk = cell.kk || (cell.kk = new Float64Array(n));
  for (let i = 0; i < n; i++) { rhs[i] = r[i] + dt * mu * (cell.P - (sigma[i] * (d - 1)) / r[i] + f[i] + fc[i]); kk[i] = (dt * mu * sigma[i]) / (r[i] * r[i]); }
  tmp.set(r);
  for (let s = 0; s < sweeps; s++) {
    for (let i = 0; i < n; i++) { let o = rhs[i]; for (let j = 0; j < want; j++) o += kk[i] * wt[i * want + j] * tmp[idx[i * want + j]]; lap[i] = o / (1 - kk[i] * wc[i]); }
    tmp.set(lap);
  }
  for (let i = 0; i < n; i++) r[i] = Math.max(rMin, tmp[i]);
  moveNuclei(cell, Fn, dt);
  // the membrane held off the nuclei where they've moved (never through one), then the volume, exactly: a uniform
  // shift δ of the patches not held, Σ w r^{d−1} δ = V0 − V (Newton, three times, re-holding each time)
  contact(cell); const pin = cell.pinned;
  // (and below the floor's limit: held against the floor, a patch can't move out, only in)
  for (let k = 0; k < 4; k++) {
    let v = 0; for (let i = 0; i < n; i++) { r[i] = Math.min(ceil[i], Math.max(hard[i], r[i])); v += (G.w[i] * r[i] ** d) / d; }
    const up = cell.V0 > v; let a = 0;
    for (let i = 0; i < n; i++) { pin[i] = up ? r[i] >= ceil[i] - 1e-9 : r[i] <= hard[i] + 1e-9; if (!pin[i]) a += G.w[i] * r[i] ** (d - 1); }
    const dl = (cell.V0 - v) / Math.max(a, 1e-9); for (let i = 0; i < n; i++) if (!pin[i]) r[i] = Math.min(ceil[i], Math.max(rMin, hard[i], r[i] + dl));
  }
  // and the whole cell moves, carried by its cortex's flow against the water and the floor
  velocity(cell); for (let a = 0; a < d; a++) cell.X[a] += cell.V[a] * dt;
  cell.t += dt;
}

/* ---------------------------------------------------------------- what the cortex does: presets
   each sets σ (the tension, 1 at rest) and f (any other push, outward positive) over the directions n, at time t.
   "front" is +x. In 4D the ring is a great circle (the x–z plane's), a 1D loop on the 3-sphere; the belt is the
   equatorial 2-sphere y = 0. In 3D they are the same thing: the equator of a 2-sphere is a circle */
export const SPLIT_T = 1.5;
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
  if (name === "crawl" || name === "hunt") return polarise(cell, name, t);
  if (cell.floor) setFloor(cell, false);
  if ((name === "belt" || name === "ring") && t >= SPLIT_T) splitNucleus(cell);
  const { G, d, r, sigma, f } = cell, P = PRESETS[name], v = new Array(d), band = cell.band || (cell.band = new Float64Array(G.count));
  for (let i = 0; i < G.count; i++) {
    for (let c = 0; c < d; c++) v[c] = G.n[i * d + c];
    const o = P(d, v, t); sigma[i] = o.s; band[i] = o.band || 0;
    f[i] = name === "belt" || name === "ring" ? o.f / Math.max(0.2, r[i]) : o.f;
  }
}
/* crawling (PROTEUS's amoeba, in d dimensions): on the floor, polarised along a heading h. The cortex lets go at the
   front, so pressure pushes a broad pseudopod out there, in pulses; it tightens at the back (the uropod, where myosin
   gathers). Tension rising front to back makes the cortex flow rearward; stuck to the floor, that flow pushes the cell
   forward. "hunt" steers h by smell first */
function polarise(cell, name, t) {
  if (!cell.floor) setFloor(cell, true);
  const { G, d, sigma, f, heading: h } = cell;
  if (name === "hunt") hunt(cell, cell.dtLast || 0.02);
  const pulse = 0.85 + 0.15 * Math.sin(2.2 * t), band = cell.band || (cell.band = new Float64Array(G.count));
  // the front isn't one smooth bulge: a few pseudopods at once, coming and going (lobes across the front, along the
  // sideways directions of the floor: one in 3D, two in 4D)
  const side = []; for (let a = 0; a < d && side.length < d - 2; a++) { if (a === 1) continue; const e = new Float64Array(d); e[a] = 1; let pr = e[a] * h[a]; for (let c = 0; c < d; c++) e[c] -= pr * h[c]; for (const q of side) { pr = 0; for (let c = 0; c < d; c++) pr += e[c] * q[c]; for (let c = 0; c < d; c++) e[c] -= pr * q[c]; } const l = Math.hypot(...e); if (l > 0.3) side.push(e.map((v) => v / l)); }
  for (let i = 0; i < G.count; i++) {
    let nh = 0; for (let a = 0; a < d; a++) nh += G.n[i * d + a] * h[a];
    let lobe = 1; side.forEach((e, k) => { let ne = 0; for (let a = 0; a < d; a++) ne += G.n[i * d + a] * e[a]; lobe *= 0.55 + 0.45 * Math.sin(5.5 * ne + (1.3 + 0.4 * k) * t + 2 * k); });
    sigma[i] = 1 - 0.55 * pulse * (0.45 + 0.55 * lobe) * sm((nh - 0.4) / 0.4) + 1.3 * sm((-nh - 0.15) / 0.55); f[i] = 0; band[i] = 0;
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
