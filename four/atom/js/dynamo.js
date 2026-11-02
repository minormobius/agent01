/* Kinematic dynamos in 3 and 4 dimensions of space (no DOM): does a fixed flow make a magnetic field grow?

   The field is a 2-form F (a bivector at each point). With Ohm's law in the gas, E = J/σ − i_v F (i_v F = −v × B in
   ours), and Faraday's law ∂F/∂t = −dE:
       ∂F/∂t = −d(i_v F) − (resistive decay),
   the decay ηk² for each Fourier mode in ours (J = c∇×B/4π) and η|k|³ in 4D under the lens vacuum (the current a field
   needs grows as |k|³A, not k²A: the stars chapter's c²k³/4π²σ). The flow depends on x and y only (cells periodic in a
   2π × 2π square), so a field mode e^{i(k_z z + k_w w)} keeps its out-of-plane wavenumbers and the problem is a 2D one
   for each: G. O. Roberts's construction (1972), whose helical cellular flow is the textbook dynamo in ours.

   Pseudo-spectral on an N × N grid (2/3 dealiased), the advective term by RK4 with the decay split exactly around it
   (Strang), F = dA at the start so dF = 0 throughout (every update is d of something). The growth rate is the field's
   mean log growth after the transients, renormalized as it goes. */

/* in-place radix-2 FFT of a complex array (re, im) of length n; inverse scales by 1/n */
function fft1(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function fft2(re, im, N, inv) {
  const r = new Float64Array(N), i_ = new Float64Array(N);
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) { r[x] = re[y * N + x]; i_[x] = im[y * N + x]; } fft1(r, i_, inv); for (let x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = i_[x]; } }
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i_[y] = im[y * N + x]; } fft1(r, i_, inv); for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i_[y]; } }
}

/* flows on the (x, y) square: velocity components (d of them) as functions of x, y */
const psi = (x, y) => Math.sin(x) * Math.sin(y), phi = (x, y) => Math.cos(x) * Math.cos(y);
export const FLOWS = {
  // our Roberts flow: the cells' swirl (from ψ = sin x sin y) and a flow along z of √2ψ, which makes it helical (Beltrami)
  roberts: (d) => (x, y) => [Math.sin(x) * Math.cos(y), -Math.cos(x) * Math.sin(y), Math.SQRT2 * psi(x, y), ...(d === 4 ? [0] : [])],
  // the same cells with no flow out of the plane: Zeldovich's theorem forbids a dynamo in ours
  planar: (d) => (x, y) => [Math.sin(x) * Math.cos(y), -Math.cos(x) * Math.sin(y), 0, ...(d === 4 ? [0] : [])],
  // 4D: the cells, and flows along z and w in two different patterns (ψ and φ, each √2 as strong)
  twohelix: () => (x, y) => [Math.sin(x) * Math.cos(y), -Math.cos(x) * Math.sin(y), Math.SQRT2 * psi(x, y), Math.SQRT2 * phi(x, y)],
  // a uniform flow (the check: it only moves the field)
  uniform: (d) => () => [0.7, -0.4, 0.3, ...(d === 4 ? [0.5] : [])],
  none: (d) => () => new Array(d).fill(0),
};

/* the growth rate of the fastest-growing field for a flow, its out-of-plane wavenumbers kz (and kw), the resistivity
   η and the decay law ("k2" ours, "k3" 4D's lens), on an N × N grid, run to time T. Returns the rate, its change over
   the last third (a measure of how settled it is), and the field's energy by component */
export function growth({ d, flow, kz = 0, kw = 0, eta, law = d === 3 ? "k2" : "k3", N = 32, T = 60, dt = 0.02, seed = 1, field = null }) {
  const P = []; for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) P.push([i, j]);
  const M = N * N, kv = (i) => (i <= N / 2 ? i : i - N), kx = new Float64Array(M), ky = new Float64Array(M), dec = new Float64Array(M), keep = new Uint8Array(M);
  const kOut = d === 4 ? [kz, kw] : [kz];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const m = y * N + x, a = kv(x), b = kv(y), k2 = a * a + b * b + kOut.reduce((t, q) => t + q * q, 0);
    kx[m] = a; ky[m] = b; dec[m] = law === "k2" ? eta * k2 : eta * Math.pow(k2, 1.5); keep[m] = Math.abs(a) < N / 3 && Math.abs(b) < N / 3 ? 1 : 0; }
  const kAt = (m, i) => (i === 0 ? kx[m] : i === 1 ? ky[m] : kOut[i - 2]);
  const V = flow(d), vg = Array.from({ length: d }, () => new Float64Array(M));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = V((2 * Math.PI * x) / N, (2 * Math.PI * y) / N); for (let i = 0; i < d; i++) vg[i][y * N + x] = v[i]; }
  // the start: F = dA for a random A on the low modes (seeded), so dF = 0
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
  const Ar = Array.from({ length: d }, () => new Float64Array(M)), Ai = Array.from({ length: d }, () => new Float64Array(M));
  for (let m = 0; m < M; m++) if (Math.abs(kx[m]) <= 3 && Math.abs(ky[m]) <= 3) for (let i = 0; i < d; i++) { Ar[i][m] = rnd(); Ai[i][m] = rnd(); }
  let Fr = P.map(() => new Float64Array(M)), Fi = P.map(() => new Float64Array(M));
  P.forEach(([i, j], p) => { for (let m = 0; m < M; m++) { const ki = kAt(m, i), kj = kAt(m, j); // (dA)_ij = i(k_i A_j − k_j A_i)
    Fr[p][m] = -(ki * Ai[j][m] - kj * Ai[i][m]); Fi[p][m] = ki * Ar[j][m] - kj * Ar[i][m]; } });
  if (field) { Fr = field.Fr; Fi = field.Fi; }
  const comp = (p, i, j) => P.findIndex(([a, b]) => a === i && b === j);
  // the advective rate of change −d(i_v F), in Fourier
  const rhs = (Fr, Fi) => {
    const fr = Fr.map((a) => a.slice()), fi = Fi.map((a) => a.slice());
    fr.forEach((_, p) => fft2(fr[p], fi[p], N, true)); // to the grid
    const Er = Array.from({ length: d }, () => new Float64Array(M)), Ei = Array.from({ length: d }, () => new Float64Array(M));
    for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) { if (i === j) continue; const p = i < j ? comp(0, i, j) : comp(0, j, i), sg = i < j ? 1 : -1, vi = vg[i];
      for (let m = 0; m < M; m++) { Er[j][m] += vi[m] * sg * fr[p][m]; Ei[j][m] += vi[m] * sg * fi[p][m]; } } // E_j = Σ v_i F_ij
    for (let j = 0; j < d; j++) fft2(Er[j], Ei[j], N, false);
    const outR = P.map(() => new Float64Array(M)), outI = P.map(() => new Float64Array(M));
    P.forEach(([i, j], p) => { for (let m = 0; m < M; m++) { if (!keep[m]) continue; const ki = kAt(m, i), kj = kAt(m, j), dr = ki * Er[j][m] - kj * Er[i][m], di = ki * Ei[j][m] - kj * Ei[i][m];
      outR[p][m] = di; outI[p][m] = -dr; } }); // −i(k_i E_j − k_j E_i)
    return [outR, outI];
  };
  const decay = (h) => { for (let p = 0; p < P.length; p++) for (let m = 0; m < M; m++) { const f = Math.exp(-dec[m] * h) * keep[m]; Fr[p][m] *= f; Fi[p][m] *= f; } };
  const norm = () => { let t = 0; for (let p = 0; p < P.length; p++) for (let m = 0; m < M; m++) t += Fr[p][m] ** 2 + Fi[p][m] ** 2; return Math.sqrt(t); };
  const scale = (c) => { for (let p = 0; p < P.length; p++) for (let m = 0; m < M; m++) { Fr[p][m] *= c; Fi[p][m] *= c; } };
  decay(0); let n0 = norm(); scale(1 / n0);
  const steps = Math.round(T / dt), logs = []; let L = 0;
  for (let k = 1; k <= steps; k++) {
    decay(dt / 2);
    const add = (A, B, c) => [A[0].map((a, p) => a.map((x, m) => x + c * B[0][p][m])), A[1].map((a, p) => a.map((x, m) => x + c * B[1][p][m]))];
    const y0 = [Fr, Fi], k1 = rhs(...y0), k2 = rhs(...add(y0, k1, dt / 2)), k3 = rhs(...add(y0, k2, dt / 2)), k4 = rhs(...add(y0, k3, dt));
    for (let p = 0; p < P.length; p++) for (let m = 0; m < M; m++) { Fr[p][m] += (dt / 6) * (k1[0][p][m] + 2 * k2[0][p][m] + 2 * k3[0][p][m] + k4[0][p][m]); Fi[p][m] += (dt / 6) * (k1[1][p][m] + 2 * k2[1][p][m] + 2 * k3[1][p][m] + k4[1][p][m]); }
    decay(dt / 2);
    if (k % 25 === 0) { const n = norm(); L += Math.log(n); scale(1 / n); logs.push([k * dt, L]); }
  }
  // the rate: the slope of the log over the last half; how settled: the slopes of its two quarters
  const slope = (a, b) => { const pts = logs.filter(([t]) => t >= a && t <= b), n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n; return pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0); };
  const energy = P.map((_, p) => { let t = 0; for (let m = 0; m < M; m++) t += Fr[p][m] ** 2 + Fi[p][m] ** 2; return t; });
  return { rate: slope(T / 2, T), settle: Math.abs(slope(T / 2, (3 * T) / 4) - slope((3 * T) / 4, T)), energy, planes: P.map(([i, j]) => "xyzw"[i] + "xyzw"[j]), logs };
}
