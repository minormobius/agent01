/* Hydrogen burning in one shell of our own star, on REACLIB (net.js's rates), for the evolution driver
   (atom/tools/evolve.mjs). No DOM.
   The sub-network: every REACLIB reaction among p, d, ³He, ⁴He, ⁷Li, ⁷Be, ⁸B and the CNO isotopes ¹²C … ¹⁸O (the pp
   chains, the CN and NO cycles). Three things net.js leaves out are put in here, because a star's clock needs them:
     · screening, weak (Salpeter's Debye–Hückel; Pols's notes §6.2.3, eq. 6.31): ⟨σv⟩ × exp(Z₁Z₂e²/(4πε₀ r_D kT)),
       1/r_D² = (e²/ε₀kT) Σ nᵢ(Zᵢ² + Zᵢ), the electrons taken as non-degenerate (θ_e = 1);
     · the neutrinos' share of each weak reaction's Q, taken off what the gas gets (pp 0.265, ⁷Be 0.814, ⁸B 6.71 MeV:
       Pols §6.4.1; the CNO β decays 0.707, 0.997, 0.999 MeV for ¹³N, ¹⁵O, ¹⁷F, which Pols gives as "between 0.71 and
       1.00"; pep's neutrino takes all of its 1.442 MeV, hep's an average of 9.628 MeV, ¹⁸F's 0.382 MeV: these six are
       the standard tabulated averages, written from memory and not checked against a source here; together they move
       the Sun's energy by well under 1%);
     · the short-lived species (d, ⁷Li, ⁷Be, ⁸B, ¹³N, ¹⁵O, ¹⁷F, ¹⁸F) at their steady state for the structure's energy,
       so a shell's ε(ρ, T) follows from its slow species (p, ³He, ⁴He, ¹²C, ¹³C, ¹⁴N, ¹⁵N, ¹⁶O, ¹⁷O, ¹⁸O) alone.
   ³He is slow on purpose: outside the Sun's centre it never reaches its steady state, and the burning there stops at it.
   Abundances are Y = X/A per nucleon (mol/g), as net.js; energies in W/kg. */
import { RX, NUC, IDX, lambda } from "./net.js";

const SUB = ["p", "d", "he3", "he4", "li7", "be7", "b8", "c12", "c13", "n13", "n14", "n15", "o15", "o16", "o17", "f17", "f18", "o18"];
export const SPEC = SUB, NS = SUB.length, I = Object.fromEntries(SUB.map((k, i) => [k, i]));
export const FAST = ["d", "li7", "be7", "b8", "n13", "o15", "f17", "f18"].map((k) => I[k]), SLOW = SUB.map((_, i) => i).filter((i) => !FAST.includes(i));
export const ZS = SUB.map((k) => NUC[IDX[k]].Z), AS = SUB.map((k) => NUC[IDX[k]].A);
const QNU = { "p+p>d": 0.265, "p+p>d:ec": 1.442, "be7>li7": 0.814, "b8>he4+he4": 6.71, "n13>c13": 0.707, "o15>n15": 0.997, "f17>o17": 0.999, "f18>o18": 0.382, "p+he3>he4": 9.628 };
const keyOf = (r) => `${r.r.join("+")}>${r.p.join("+")}${r.ec && r.r.length > 1 ? ":ec" : ""}`;
/* the reactions kept: reactants and products all in the sub-network, a rate that isn't zero at 5–100 MK */
export const RS = RX.filter((r) => [...r.r, ...r.p].every((k) => k in I)).filter((r) => [0.005, 0.02, 0.1].some((T9) => lambda(r, T9) > 1e-60)).map((r) => {
  const cnt = {}; for (const x of r.r) cnt[x] = (cnt[x] ?? 0) + 1; const net = {}; for (const x of r.r) net[x] = (net[x] ?? 0) - 1; for (const x of r.p) net[x] = (net[x] ?? 0) + 1;
  const zz = r.r.length === 2 ? ZS[I[r.r[0]]] * ZS[I[r.r[1]]] : 0, qnu = QNU[keyOf(r)] ?? 0;
  if (r.weak && !(keyOf(r) in QNU)) throw new Error(`shell.js: a weak reaction with no neutrino share: ${keyOf(r)}`);
  return { key: keyOf(r), id: r.id, n: r.r.length, sym: r.sym, ec: !!r.ec, react: Object.entries(cnt).map(([k, n]) => [I[k], n]), dY: Object.entries(net).filter(([, v]) => v).map(([k, v]) => [I[k], v]), zz, Q: r.Q, Qgas: r.Q - qnu, qnu, r };
});
/* λ(T) tabulated in ln T over 1–200 MK (log-linear between 600 points; REACLIB's fits are smooth there) */
const TLO = Math.log(1e6), THI = Math.log(2e8), NT = 600, DT = (THI - TLO) / NT;
const TAB = RS.map((x) => Float64Array.from({ length: NT + 1 }, (_, i) => { const l = lambda(x.r, Math.exp(TLO + i * DT) / 1e9); return l > 0 ? Math.log(l) : -1e30; }));
function lambdas(T) { const u = Math.min(NT - 1e-9, Math.max(0, (Math.log(T) - TLO) / DT)), i = Math.floor(u), f = u - i; return TAB.map((t) => (t[i] < -1e29 ? 0 : Math.exp(t[i] * (1 - f) + t[i + 1] * f))); }

const E2 = (1.602176634e-19) ** 2, EPS0 = 8.8541878128e-12, KB = 1.380649e-23, NA = 6.02214076e23, MEVJ = 1.602176634e-13;
/* weak screening's Λ = e²/(4πε₀ r_D kT) at ρ (kg/m³), T, for abundances Y (mol/g), plus the metals the network lacks
   (Zrest by mass, taken as fully ionized at Z/A = ½ with Z ≈ 8, close enough for a Debye length) */
export function screenL(rho, T, Y, Zrest = 0) { let s = 0; for (let i = 0; i < NS; i++) s += Y[i] * (ZS[i] * ZS[i] + ZS[i]); s += (Zrest / 16) * (64 + 8);
  const n = rho * 1000 * s; // per m³ (Y is mol/g, so ρ[g/m³] × Y × N_A)
  const rD = Math.sqrt((EPS0 * KB * T) / (E2 * n * NA)); return E2 / (4 * Math.PI * EPS0 * rD * KB * T); }
/* rate constants k_r (net.js's convention: λ ρ^(N−1)/Π n!, electron captures × ρY_e), with screening (screen: 1 on, 0 off) */
export function constants(T, rho, Y, { screen = 1, Zrest = 0 } = {}) {
  const lam = lambdas(T), rc = rho / 1000, Ye = Y.reduce((s, y, i) => s + y * ZS[i], 0) + Zrest / 2, L = screen ? screenL(rho, T, Y, Zrest) : 0;
  return RS.map((x, i) => { let k = (lam[i] * rc ** (x.n - 1)) / x.sym; if (x.ec) k *= rc * Ye; if (x.zz && L) k *= Math.exp(x.zz * L); return k; });
}
function flux(x, k, Y) { let f = k; for (const [j, n] of x.react) f *= n === 1 ? Y[j] : Y[j] ** n; return f; }
/* dY/dt and its Jacobian over the given index set (null: all) */
function rhsJ(Y, K, J) { const f = new Float64Array(NS); if (J) for (const row of J) row.fill(0);
  for (let i = 0; i < RS.length; i++) { const x = RS[i], k = K[i]; if (!k) continue; const w = flux(x, k, Y); for (const [s, v] of x.dY) f[s] += v * w;
    if (J) for (const [j, n] of x.react) { let d = k * n * (n === 1 ? 1 : Y[j] ** (n - 1)); for (const [l, m] of x.react) if (l !== j) d *= m === 1 ? Y[l] : Y[l] ** m; for (const [s, v] of x.dY) J[s][j] += v * d; } }
  return f; }
function lin(A, b) { const n = b.length; A = A.map((r) => Float64Array.from(r)); b = Float64Array.from(b);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; const d = A[c][c]; if (!d) continue;
    for (let r = c + 1; r < n; r++) { const q = A[r][c] / d; if (!q) continue; for (let x = c; x < n; x++) A[r][x] -= q * A[c][x]; b[r] -= q * b[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]; x[r] = A[r][r] ? s / A[r][r] : 0; } return x; }
/* the short-lived species at their steady state, the slow ones held: Newton on the fast block */
// fast: the species put at steady state (default FAST); a stirred core passes the subset that outlives its turnover not
// (evolve.mjs zoneModel: ⁷Be lives months, mixed through a convective core, not local)
const JS = Array.from({ length: NS }, () => new Float64Array(NS)); // reused by steady and fastAbove (rhsJ zeroes it)
export function steady(Y, K, fast = FAST) { const Z = Float64Array.from(Y), J = JS; if (!fast.length) return Z;
  for (let it = 0; it < 8; it++) { const f = rhsJ(Z, K, J), A = fast.map((a) => fast.map((b) => J[a][b])), d = lin(A, fast.map((a) => -f[a]));
    let mx = 0; fast.forEach((a, i) => { const nz = Math.max(0, Z[a] + d[i]); mx = Math.max(mx, Math.abs(nz - Z[a]) / Math.max(nz, 1e-300)); Z[a] = nz; }); if (mx < 1e-10) break; }
  return Z; }
/* the members of FAST destroyed faster than `rate` (per nucleus) at these constants and abundances */
export function fastAbove(Y, K, rate) { const J = JS; rhsJ(Y, K, J); return FAST.filter((a) => -J[a][a] > rate); }
/* the energy release at these constants and these abundances as given (no steady state taken), W/kg */
export function epsK(K, Z) { let e = 0; for (let i = 0; i < RS.length; i++) if (K[i]) e += flux(RS[i], K[i], Z) * RS[i].Qgas; return e * NA * MEVJ * 1000; }
export { flux };
/* the energy the gas gets (W/kg) and its split, at the steady state of the fast species */
export function eps(rho, T, Y, opts) { const K = constants(T, rho, Y, opts), Z = steady(Y, K); let e = 0, pp = 0, cno = 0;
  for (let i = 0; i < RS.length; i++) { const x = RS[i]; if (!K[i]) continue; const w = flux(x, K[i], Z) * x.Qgas; e += w; if (x.zz === 6 || x.zz === 7 || x.zz === 8 || ["n13>c13", "o15>n15", "f17>o17", "f18>o18"].includes(x.key)) cno += w; else pp += w; }
  const c = NA * MEVJ * 1000; return { eps: e * c, pp: pp * c, cno: cno * c }; }
/* burn a shell at fixed ρ, T for dt seconds: backward Euler, sub-stepped so no species above 10⁻⁹ moves by more than a
   quarter of itself in one sub-step; returns the new Y and the energy the gas got (J/kg) */
const AB = Array.from({ length: NS }, () => new Float64Array(NS)), BB = new Float64Array(NS), XB = new Float64Array(NS);
/* Gaussian elimination in place on A, b (both overwritten); the solution in a shared buffer */
function linIn(A, b) { const n = NS; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { const t = A[c]; A[c] = A[p]; A[p] = t; const u = b[c]; b[c] = b[p]; b[p] = u; } const d = A[c][c]; if (!d) continue;
    const Ac = A[c]; for (let r = c + 1; r < n; r++) { const Ar = A[r], q = Ar[c] / d; if (!q) continue; for (let x = c; x < n; x++) Ar[x] -= q * Ac[x]; b[r] -= q * b[c]; } }
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; const Ar = A[r]; for (let c = r + 1; c < n; c++) s -= Ar[c] * XB[c]; XB[r] = Ar[r] ? s / Ar[r] : 0; } return XB; }
export function burn(rho, T, Y0, dt, opts) { return burnK(constants(T, rho, Y0, opts), Y0, dt, opts); }
/* the same with given rate constants: a stirred zone burns as one, on its shells' mass-weighted mean constants (each
   flux is linear in its k, so that is exact while the zone stays mixed) */
export function burnK(K, Y0, dt, opts) { const J = Array.from({ length: NS }, () => new Float64Array(NS));
  let Y = Float64Array.from(Y0), t = 0, h = opts?.h0 ?? dt / 32, Eg = 0;
  for (let guard = 0; t < dt * (1 - 1e-12) && guard < 5000; guard++) { if (t + h > dt) h = dt - t; let X = Float64Array.from(Y), ok = false;
    for (let it = 0; it < 15; it++) { const f = rhsJ(X, K, J); for (let i = 0; i < NS; i++) { const Ai = AB[i], Ji = J[i]; for (let j = 0; j < NS; j++) Ai[j] = (i === j ? 1 : 0) - h * Ji[j]; BB[i] = -(X[i] - Y[i] - h * f[i]); } const d = linIn(AB, BB);
      let mx = 0; for (let i = 0; i < NS; i++) { const nz = Math.max(0, X[i] + d[i]); if (nz > 1e-12 || X[i] > 1e-12) mx = Math.max(mx, Math.abs(nz - X[i]) / Math.max(nz, X[i], 1e-12)); X[i] = nz; } if (mx < 1e-9) { ok = true; break; } }
    let ch = 0; for (let i = 0; i < NS; i++) if (Y[i] > 1e-9) ch = Math.max(ch, Math.abs(X[i] - Y[i]) / Y[i]); // a species appearing from nothing doesn't limit the step
    if (!ok || ch > 0.25) { h /= 3; continue; }
    // energy over the sub-step by the implicit end state's fluxes (consistent with backward Euler)
    for (let i = 0; i < RS.length; i++) if (K[i]) Eg += flux(RS[i], K[i], X) * RS[i].Qgas * h;
    Y = X; t += h; h *= ch < 0.03 ? 2 : ch < 0.1 ? 1.3 : 1; }
  if (t < dt * (1 - 1e-9)) throw new Error(`shell.js burn: stalled at ${t.toExponential(2)} of ${dt.toExponential(2)} s`);
  return { Y, E: Eg * NA * MEVJ * 1000 }; }
/* mass fractions ↔ Y */
export const fromX = (Xm) => Float64Array.from(SUB, (k, i) => (Xm[k] ?? 0) / AS[i]);
export const massX = (Y) => Object.fromEntries(SUB.map((k, i) => [k, Y[i] * AS[i]]));
/* dY/dt at the steady state of the fast species (for choosing a time step) */
export function dYdt(rho, T, Y, opts) { const K = constants(T, rho, Y, opts), Z = steady(Y, K); return rhsJ(Z, K, null); }
