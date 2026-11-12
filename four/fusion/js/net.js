/* A nuclear reaction network for our own stars, on REACLIB's rates (../reaclib.js). No DOM.
   Every rate comes from the library's fits at the stage's temperature; the network is then dY/dt = Σ_r ν_r k_r Π Y^n
   with k_r = λ_r(T9) ρ^(N_r − 1) / Π n! (N_r reactants, n each species' multiplicity; an electron capture also × ρY_e),
   Y per nucleon (mass fraction / A). Backward Euler with Newton and an analytic Jacobian, steps growing while the
   composition changes slowly. Left out, and said so on the page: screening (raises the Sun's rates by 5–20%), the
   reverse rates' partition functions (taken as 1), neutron channels, and the neutrinos' share of Q in weak decays. */
import { REACTIONS, SPECIES, SOURCE } from "../reaclib.js";
export { SOURCE };

const EL = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni"];
const NAME = ["neutron", "hydrogen", "helium", "lithium", "beryllium", "boron", "carbon", "nitrogen", "oxygen", "fluorine", "neon", "sodium", "magnesium", "aluminium", "silicon", "phosphorus", "sulfur", "chlorine", "argon", "potassium", "calcium", "scandium", "titanium", "vanadium", "chromium", "manganese", "iron", "cobalt", "nickel"];
/* each species: its key, Z, A, symbol and name */
export const NUC = SPECIES.map((k) => {
  if (k === "p") return { k, Z: 1, A: 1, sym: "p", name: "proton" };
  if (k === "d") return { k, Z: 1, A: 2, sym: "d", name: "deuteron" };
  const m = k.match(/^([a-z]+)(\d+)$/), Z = EL.findIndex((e, i) => i > 0 && e.toLowerCase() === m[1]), A = +m[2];
  return { k, Z, A, sym: `${EL[Z]}-${A}`, name: `${NAME[Z]}-${A}` };
});
export const IDX = Object.fromEntries(NUC.map((n, i) => [n.k, i]));
const N = NUC.length;

/* λ(T9) summed over the reaction's fitted sets */
export function lambda(r, T9) {
  const t13 = Math.cbrt(T9); let s = 0;
  for (const a of r.sets) s += Math.exp(a[0] + a[1] / T9 + a[2] / t13 + a[3] * t13 + a[4] * T9 + a[5] * T9 * t13 * t13 + a[6] * Math.log(T9));
  return s;
}
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
/* the reactions as index lists, with their multiplicities and net change per species */
export const RX = REACTIONS.map((r, id) => {
  const cnt = {}; for (const x of r.r) cnt[x] = (cnt[x] ?? 0) + 1;
  const net = {}; for (const x of r.r) net[x] = (net[x] ?? 0) - 1; for (const x of r.p) net[x] = (net[x] ?? 0) + 1;
  return { id, ...r, react: Object.entries(cnt).map(([k, n]) => [IDX[k], n]), dY: Object.entries(net).filter(([, v]) => v).map(([k, v]) => [IDX[k], v]), sym: Object.values(cnt).reduce((p, n) => p * fact(n), 1) };
});

/* the rate constants at a stage's conditions: k_r with ρ and the identical-particle factor folded in */
export function constants(T, rho, Ye = 0.5) {
  const T9 = T / 1e9;
  return RX.map((r) => { const nr = r.r.length; let k = lambda(r, T9) * rho ** (nr - 1) / r.sym; if (r.ec) k *= rho * Ye; return Number.isFinite(k) ? k : 0; });
}
/* each reaction's rate (events per nucleon per second) at composition Y */
export function fluxes(Y, k) {
  return RX.map((r, i) => { if (!k[i]) return 0; let f = k[i]; for (const [j, n] of r.react) f *= n === 1 ? Y[j] : Y[j] ** n; return f; });
}
function rhs(Y, k, f, J) {
  f.fill(0); if (J) for (const row of J) row.fill(0);
  for (let i = 0; i < RX.length; i++) { const r = RX[i]; if (!k[i]) continue;
    let w = k[i]; for (const [j, n] of r.react) w *= n === 1 ? Y[j] : Y[j] ** n; for (const [s, v] of r.dY) f[s] += v * w;
    if (J) for (const [j, n] of r.react) { let d = k[i] * n * (n === 1 ? 1 : Y[j] ** (n - 1)); for (const [l, m] of r.react) if (l !== j) d *= m === 1 ? Y[l] : Y[l] ** m; for (const [s, v] of r.dY) J[s][j] += v * d; } }
}
function solve(A, b) {
  const n = b.length; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; const d = A[c][c]; if (!d) continue;
    for (let r = c + 1; r < n; r++) { const q = A[r][c] / d; if (!q) continue; const Ar = A[r], Ac = A[c]; for (let x = c; x < n; x++) Ar[x] -= q * Ac[x]; b[r] -= q * b[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]; x[r] = A[r][r] ? s / A[r][r] : 0; } return x;
}
/* mass fractions ↔ Y */
export const toY = (X) => { const Y = new Float64Array(N); for (const [k, x] of Object.entries(X)) Y[IDX[k]] = x / NUC[IDX[k]].A; return Y; };
export const toX = (Y) => Array.from(Y, (y, i) => y * NUC[i].A);
const MEV_ERG = 1.602176634e-6, NA = 6.02214076e23;
/* energy released, erg per gram per second (Q includes what neutrinos carry off in weak decays) */
export const energy = (fl) => fl.reduce((s, f, i) => s + f * RX[i].Q, 0) * NA * MEV_ERG;

/* run a stage at fixed T and ρ from mass fractions X0 until `fuel` falls below `until` of its start (or tmax seconds):
   snapshots of t and Y at every step */
export function run({ T, rho, X0, fuel, until = 1e-3, tmax = 1e20, Ye = 0.5, maxSteps = 4000 }) {
  const k = constants(T, rho, Ye), f = new Float64Array(N), J = Array.from({ length: N }, () => new Float64Array(N)), fi = IDX[fuel];
  let Y = toY(X0), t = 0, dt = 1e-12; const Y0f = Y[fi], snaps = [{ t: 0, Y: Float64Array.from(Y) }];
  for (let step = 0; step < maxSteps && Y[fi] > until * Y0f && t < tmax; step++) {
    let X = Float64Array.from(Y), ok = false;
    for (let it = 0; it < 12; it++) { rhs(X, k, f, J); const A = J.map((row, i) => Array.from(row, (v, j) => (i === j ? 1 : 0) - dt * v)), b = Array.from(X, (v, i) => -(v - Y[i] - dt * f[i])), d = solve(A, b);
      let mx = 0; for (let i = 0; i < N; i++) { X[i] = Math.max(0, X[i] + d[i]); mx = Math.max(mx, Math.abs(d[i]) / Math.max(X[i], 1e-12)); } if (mx < 1e-8) { ok = true; break; } }
    let ch = 0; for (let i = 0; i < N; i++) if (X[i] > 1e-6 || Y[i] > 1e-6) ch = Math.max(ch, Math.abs(X[i] - Y[i]) / Math.max(X[i], Y[i]));
    if (!ok || ch > 0.25) { dt /= 3; continue; }
    Y = X; t += dt; snaps.push({ t, Y: Float64Array.from(Y) }); dt *= ch < 0.02 ? 1.6 : ch < 0.08 ? 1.2 : 1;
  }
  return { k, snaps, t, Y };
}

/* the stages of a heavy star's life, each at round conditions typical of the core of a star of about twenty Suns
   (temperature K, density g/cm³), and the Sun's own core for the first; each starts from the last one's ash */
export const SUN_X = { p: 0.70, he4: 0.29, c12: 0.0024, n14: 0.0007, o16: 0.0058, ne20: 0.0011 };
export const STAGES = [
  { key: "pp", title: "Hydrogen, the Sun's way", T: 1.57e7, rho: 150, fuel: "p", X0: SUN_X, until: 1e-3,
    blurb: "Protons fuse into helium through the proton–proton chains. The first step needs the weak force to turn a proton into a neutron while two protons touch, so it almost never happens: that's why the Sun lasts ten billion years." },
  { key: "cno", title: "Hydrogen, a heavy star's way", T: 3.5e7, rho: 6, fuel: "p", X0: SUN_X, until: 1e-3,
    blurb: "Hotter, carbon, nitrogen and oxygen nuclei act as catalysts: a carbon catches four protons one at a time, two of them turn into neutrons along the way, and the loop spits out a helium-4 and the carbon again. Nitrogen-14's capture is the slowest, so the carbon and oxygen pile up as nitrogen." },
  { key: "he", title: "Helium", T: 1.9e8, rho: 1e3, fuel: "he4", from: "cno", until: 1e-3,
    blurb: "Two helium-4s make beryllium-8, which falls apart again within 10⁻¹⁶ s; very rarely a third arrives first, through a resonance in carbon-12 (the Hoyle state), and carbon is made. Carbon catches another helium-4 to make oxygen. The nitrogen left from hydrogen burning becomes neon-22." },
  { key: "c", title: "Carbon", T: 8.5e8, rho: 2.5e5, fuel: "c12", from: "he", until: 1e-3,
    blurb: "Two carbon-12s fuse into an excited magnesium-24, which throws out a helium-4 (making neon-20) or a proton (making sodium-23). The freed protons and helium-4s are caught at once by what's around." },
  { key: "ne", title: "Neon", T: 1.5e9, rho: 4e6, fuel: "ne20", from: "c", until: 1e-3,
    blurb: "Now the light itself is hot enough to break nuclei: a gamma ray knocks a helium-4 out of neon-20, leaving oxygen-16, and that helium-4 is caught by another neon-20 to make magnesium-24. Two neons become an oxygen and a magnesium." },
  { key: "o", title: "Oxygen", T: 2.0e9, rho: 6e6, fuel: "o16", from: "ne", until: 1e-3,
    blurb: "Two oxygen-16s fuse into an excited sulfur-32, which throws out a helium-4 (making silicon-28) or a proton (making phosphorus-31). Silicon and sulfur are what's left." },
  { key: "si", title: "Silicon", T: 3.4e9, rho: 4e7, fuel: "si28", from: "o", until: 0.02, tmax: 1e7,
    blurb: "Nothing fuses silicon with silicon: the barrier is too high. Instead light breaks some silicon apart, and the helium-4s, protons and neutrons it frees climb onto the rest, one capture at a time, each nearly balanced by its own reverse. The flow drifts up the ladder to nickel-56, the most tightly bound nucleus a star can make from equal protons and neutrons, which later decays to iron-56." },
];
