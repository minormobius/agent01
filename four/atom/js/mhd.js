/* Magnetic fields in plasma, in four dimensions of space (no DOM). The field is a 2-form F (a bivector at each point:
   six numbers, in the order xy, xz, xw, yz, yw, zw, as js/orrery.js and js/nebula.js), stored as a 4×4 antisymmetric
   matrix F[i][j].

   Anatomy. Every 4D bivector is two perpendicular planes turning at rates a ≥ |b| (in 3D it is always one plane, which
   is why ours is written as a vector). Its left and right halves, the self-dual and anti-self-dual parts
       l = (F01 + F23, F02 − F13, F03 + F12)/2,   r = (F01 − F23, F02 + F13, F03 − F12)/2,
   give the rates as a = |l| + |r|, b = |l| − |r|, so that a² + b² = Σ F_ij² (i < j) and ab = |l|² − |r|² = Pf F =
   F01 F23 − F02 F13 + F03 F12, the Pfaffian, with F ∧ F = 2 Pf F · (the volume form). The field is simple (one plane,
   field sheets exist) exactly when Pf F = 0, that is when its halves are equal in size; all left (a = b, the isoclinic
   field, every orbit a great circle) when r = 0.

   Frozen in. With ideal Ohm's law (E = −i_v F) and Faraday's law (untouched by the lens vacuum, which changes only how
   currents make fields), ∂F/∂t = −d(i_v F) = −L_v F since dF = 0: F is carried by the flow as a 2-form. Following a
   parcel, with G_ij = ∂_j v_i,
       dF/dt = −(Gᵀ F + F G),   dρ/dt = −ρ tr G,
   so F_t = J⁻ᵀ F₀ J⁻¹ for the flow's Jacobian J, Pf F_t = Pf F₀ / det J and ρ_t = ρ₀ / det J: Pf F / ρ is carried
   unchanged by every parcel. A simple field stays simple, a two-plane field stays two-plane, whatever the flow does to
   the field's size and planes. */

export const PLANES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export function fromSix(c) { const F = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); PLANES.forEach(([i, j], k) => { F[i][j] = c[k]; F[j][i] = -c[k]; }); return F; }
export const toSix = (F) => PLANES.map(([i, j]) => F[i][j]);
export const pf = (F) => F[0][1] * F[2][3] - F[0][2] * F[1][3] + F[0][3] * F[1][2];
export const size2 = (F) => PLANES.reduce((t, [i, j]) => t + F[i][j] ** 2, 0);
export const halves = (F) => ({ l: [(F[0][1] + F[2][3]) / 2, (F[0][2] - F[1][3]) / 2, (F[0][3] + F[1][2]) / 2], r: [(F[0][1] - F[2][3]) / 2, (F[0][2] + F[1][3]) / 2, (F[0][3] - F[1][2]) / 2] });
const norm = (v) => Math.hypot(...v), mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((t, x, k) => t + x * B[k][j], 0))), tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const mv = (A, x) => A.map((row) => row.reduce((t, a, k) => t + a * x[k], 0)), dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
/* the rates a ≥ |b| (b carries Pf's sign) and the two planes, each as an orthonormal pair (u, v) with F u = a v
   (F w = b x for the second): the canonical form F = a (v uᵀ − u vᵀ) + b (x wᵀ − w xᵀ) */
export function canonical(F) {
  const { l, r } = halves(F), L = norm(l), R = norm(r), a = L + R, b = L - R;
  const F2 = mul(F, F), I = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => +(i === j)));
  const gs = (vs) => { const out = []; for (let v of vs) { for (const u of out) { const p = dot(v, u); v = v.map((x, i) => x - p * u[i]); } const n = norm(v); if (n > 1e-9) out.push(v.map((x) => x / n)); } return out; };
  // the first plane: where F² = −a²; if the rates are equal (or both zero) every plane through a vector and its image is one
  let u;
  if (Math.abs(a * a - b * b) > 1e-9 * Math.max(1, a * a)) { const P = F2.map((row, i) => row.map((x, j) => x + b * b * I[i][j])); u = tr(P).reduce((best, c) => (norm(c) > norm(best) ? c : best)); }
  else u = [1, 0, 0, 0];
  [u] = gs([u]); const Fu = mv(F, u); let v = a > 1e-12 ? Fu.map((x) => x / a) : gs([u, [0, 1, 0, 0], [0, 0, 1, 0]])[1];
  [u, v] = gs([u, v]);
  const rest = gs([u, v, ...I]).slice(2); let w = rest[0], x;
  if (Math.abs(b) > 1e-12) { x = mv(F, w).map((y) => y / b); [, , w, x] = gs([u, v, w, x]); } else x = rest[1];
  return { a, b, L, R, u, v, w, x, pf: pf(F), simple: Math.abs(a * b) <= 1e-6 * Math.max(1e-30, a * a) };
}
/* a point turned by the field for time t (exp(F t) p): the double rotation, angle a t in the first plane, b t in the second */
export function turn(cf, p, t) {
  const out = [0, 0, 0, 0];
  for (const [e1, e2, rate] of [[cf.u, cf.v, cf.a], [cf.w, cf.x, cf.b]]) { const c1 = dot(p, e1), c2 = dot(p, e2), C = Math.cos(rate * t), S = Math.sin(rate * t);
    for (let i = 0; i < 4; i++) out[i] += (c1 * C - c2 * S) * e1[i] + (c1 * S + c2 * C) * e2[i]; }
  return out;
}

/* flows for the frozen-in demonstration: smooth, swirling and (with c > 0) compressible, so a parcel's field is turned,
   stretched and squeezed. Each returns the velocity and its gradient G_ij = ∂_j v_i at x */
export const FLOWS = {
  // a cellular flow coupling every pair of axes, plus c times a compressing part
  cells: (x, c = 0.3) => {
    const s = x.map(Math.sin), co = x.map(Math.cos), v = [s[1] + 0.5 * s[2], s[2] - 0.7 * s[3], s[3] + 0.4 * s[0], s[0] - 0.6 * s[1]];
    const G = [[0, co[1], 0.5 * co[2], 0], [0, 0, co[2], -0.7 * co[3]], [0.4 * co[0], 0, 0, co[3]], [co[0], -0.6 * co[1], 0, 0]];
    for (let i = 0; i < 4; i++) { v[i] += c * s[i]; G[i][i] += c * co[i]; }
    return { v, G };
  },
  // a double vortex (xy and zw at different rates) with a straining part along x−z and y−w
  swirl: (x, c = 0.3) => {
    const [X, Y, Z, W] = x, e = Math.exp(-(X * X + Y * Y + Z * Z + W * W) / 8);
    const v = [-Y * e + 0.6 * Z, X * e + 0.3 * W, -1.7 * W * e - 0.6 * X, 1.7 * Z * e - 0.3 * Y], G = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    const de = (k) => (-x[k] / 4) * e; // ∂e/∂x_k
    for (let k = 0; k < 4; k++) { G[0][k] = -Y * de(k) + (k === 1 ? -e : 0) + (k === 2 ? 0.6 : 0); G[1][k] = X * de(k) + (k === 0 ? e : 0) + (k === 3 ? 0.3 : 0); G[2][k] = -1.7 * W * de(k) + (k === 3 ? -1.7 * e : 0) + (k === 0 ? -0.6 : 0); G[3][k] = 1.7 * Z * de(k) + (k === 2 ? 1.7 * e : 0) + (k === 1 ? -0.3 : 0); }
    for (let i = 0; i < 4; i++) { v[i] += c * x[i] * e; for (let k = 0; k < 4; k++) G[i][k] += c * ((i === k ? e : 0) + x[i] * de(k)); }
    return { v, G };
  },
};
/* a parcel carried for time T: position, field and density by RK4 on dX/dt = v, dF/dt = −(GᵀF + FG), dρ/dt = −ρ tr G,
   sampled n times; each sample with the field's rates, its Pfaffian and Pf/ρ */
export function carry(flow, c, x0, F0, T, n = 200, sub = 20) {
  const pack = (X, F, r) => [...X, ...toSix(F), r], unpack = (y) => ({ X: y.slice(0, 4), F: fromSix(y.slice(4, 10)), r: y[10] });
  const rhs = (y) => { const { X, F, r } = unpack(y), { v, G } = flow(X, c), dF = mul(tr(G), F).map((row, i) => row.map((z, j) => -(z + mul(F, G)[i][j]))); return pack(v, dF, -r * (G[0][0] + G[1][1] + G[2][2] + G[3][3])); };
  let y = pack(x0, F0, 1); const dt = T / (n * sub), out = [];
  const sample = (t) => { const { X, F, r } = unpack(y), cf = canonical(F); out.push({ t, X, F, rho: r, a: cf.a, b: cf.b, pf: cf.pf, s: cf.pf / r }); };
  sample(0);
  for (let k = 0; k < n; k++) { for (let m = 0; m < sub; m++) { const k1 = rhs(y), k2 = rhs(y.map((q, i) => q + (dt / 2) * k1[i])), k3 = rhs(y.map((q, i) => q + (dt / 2) * k2[i])), k4 = rhs(y.map((q, i) => q + dt * k3[i])); y = y.map((q, i) => q + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); } sample(((k + 1) * T) / n); }
  return out;
}
/* the Lie derivative of a 2-form field by components, (L_v F)_ij = v^k ∂_k F_ij + F_kj ∂_i v^k + F_ik ∂_j v^k, and
   d(i_v F) by finite differences: equal when dF = 0 (Cartan), which is what makes frozen-in follow from Faraday's law */
export function lieAndCartan(Ffield, flow, c, x, h = 1e-4) {
  const at = (y) => Ffield(y), F = at(x), { v, G } = flow(x, c), e = (k, s) => x.map((q, i) => q + (i === k ? s * h : 0));
  const dF = [0, 1, 2, 3].map((k) => { const p = at(e(k, 1)), m = at(e(k, -1)); return p.map((row, i) => row.map((z, j) => (z - m[i][j]) / (2 * h))); });
  const lie = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => { let s = 0; for (let k = 0; k < 4; k++) s += v[k] * dF[k][i][j] + F[k][j] * G[k][i] + F[i][k] * G[k][j]; return s; }));
  const iv = (y) => { const Fy = at(y), vy = flow(y, c).v; return [0, 1, 2, 3].map((j) => vy.reduce((t, vk, k) => t + vk * Fy[k][j], 0)); }; // (i_v F)_j = v^k F_kj
  const dIv = [0, 1, 2, 3].map((k) => { const p = iv(e(k, 1)), m = iv(e(k, -1)); return p.map((z, j) => (z - m[j]) / (2 * h)); }); // ∂_k (i_v F)_j
  const cartan = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => dIv[i][j] - dIv[j][i]));
  return { lie, cartan };
}
