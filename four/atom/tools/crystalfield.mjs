/* The crystal field on a dopant's d orbitals: the first look at a 4D ruby. A d ion replaces a cation in an ionic host;
   its ligands (the nearest anions, formal charge −2) are point charges, and in 4D each also leaks its cloud's field
   S/8|x−X|³ (the shell theorem fails; S = Σ⟨r²⟩ of the anion as the ionic model holds it in its Watson shell). The
   electron's energy is −V. A d orbital times a d orbital holds sphere harmonics of degree 0, 2 and 4 only, so each
   ligand's potential is projected exactly onto those three: V(r, x̂·R̂) = Σ_n v_n(r, R) C_n^λ(x̂·R̂), λ = (D − 2)/2, with
   v_n found by a one-dimensional integral over the angle, at every radius of the dopant's own 3d orbital (solved as the
   free ion). That keeps the part of the orbital that reaches past the ligand, which the textbook series ⟨r^k⟩/R^(k+1)
   gets wrong (it is printed alongside for ruby). In 3D v_n is r_<^n/r_>^(n+1), and `check` confirms the projection
   reproduces it, and 4D's r_<^n/r_>^(n+2) for Gauss's 1/r². The d block (5 × 5 in ours, 9 × 9 in 4D) is then
   diagonalized. This is the point-charge model, and it is known to fall short of measured splittings, because it leaves
   out covalency and overlap: ours is checked on ruby (Cr³⁺ in corundum) and the shortfall is stated.
     node four/atom/tools/crystalfield.mjs ruby          Cr³⁺ on corundum's Al site (the check)
     node four/atom/tools/crystalfield.mjs bl <cell>     the 4D d³ ion (element 28's 3+) on Bl₂Px₃'s Bl sites
     node four/atom/tools/crystalfield.mjs check         the projection against the two closed forms
   Prints JSON. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scf, subshells, R as GR, N as GN } from "../js/atom.js";
import { harmonics, SPHERE } from "../js/pw.js";
import { ion } from "./salt.mjs";
import { COMPOUNDS } from "./ionic.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url)), HA = 27.211386;

/* the dopant: a free ion's d orbital (its radial probability on atom.js's grid) and its moments ⟨r^k⟩ */
export function dopant(Z, d, config, shell = "3d") {
  const sh = subshells(d), occ = sh.map(() => 0);
  for (const t of config.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); occ[sh.findIndex((s) => s.name === m[1])] = +m[2]; }
  const g = scf(Z, occ, d, { exchange: true, iters: 400 }), i = sh.findIndex((s) => s.name === shell);
  const rk = (k) => { let t = 0; for (let j = 0; j < GN; j++) t += g.qs[i][j] * GR[j] ** k; return t; };
  return { Z, config, converged: g.converged, eps3d: g.es[i], rk, r: rk(1), q: g.qs[i] };
}

/* quadrature on S^(d−1): product Gauss–Legendre in the polar angles, uniform in the last */
export function gaussLegendre(n) { const x = [], w = []; for (let i = 0; i < n; i++) { let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), dp = 0; for (let it = 0; it < 100; it++) { let p0 = 1, p1 = z; for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; } dp = (n * (z * p1 - p0)) / (z * z - 1); const dz = p1 / dp; z -= dz; if (Math.abs(dz) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * dp * dp)); } return { x, w }; }
export function sphere(d, n = 16) {
  const gl = gaussLegendre(n), nphi = 2 * n, pts = [];
  if (d === 3) { for (let a = 0; a < n; a++) for (let b = 0; b < nphi; b++) { const ct = gl.x[a], st = Math.sqrt(1 - ct * ct), ph = (2 * Math.PI * (b + 0.5)) / nphi; pts.push({ u: [st * Math.cos(ph), st * Math.sin(ph), ct], w: (gl.w[a] * 2 * Math.PI) / nphi }); } }
  else { // x = (cos χ, sin χ cos θ, sin χ sin θ cos φ, sin χ sin θ sin φ), dΩ = sin²χ sinθ dχ dθ dφ; cos χ by Gauss–Chebyshev of the second kind (weight √(1 − u²), exact)
    for (let a = 1; a <= n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < nphi; c++) { const al = (a * Math.PI) / (n + 1), cx = Math.cos(al), sx = Math.sin(al), wx = (Math.PI / (n + 1)) * sx * sx, ct = gl.x[b], st = Math.sqrt(1 - ct * ct), ph = (2 * Math.PI * (c + 0.5)) / nphi;
      pts.push({ u: [cx, sx * ct, sx * st * Math.cos(ph), sx * st * Math.sin(ph)], w: (wx * gl.w[b] * 2 * Math.PI) / nphi }); } }
  return pts;
}
export const legendre = (k, t) => { let p0 = 1, p1 = t; if (k === 0) return 1; for (let n = 2; n <= k; n++) { const p2 = ((2 * n - 1) * t * p1 - (n - 1) * p0) / n; p0 = p1; p1 = p2; } return p1; };

function jacobi(A) { const n = A.length, a = A.map((r) => r.slice()); for (let sweep = 0; sweep < 100; sweep++) { let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2; if (off < 1e-24) break;
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(a[p][q]) < 1e-30) continue; const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; } for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; } } }
  return a.map((r, i) => r[i]).sort((x, y) => x - y); }

/* the ligands of cation site `site` in a crystalref-style structure: anions within 1.25 × the nearest distance */
export function ligands(st, site) {
  const H = st.H, d = H.length, X = st.s.map((f) => H[0].map((_, c) => f.reduce((t, v, b) => t + v * H[b][c], 0))), x0 = X[site], out = [];
  const n = 2, m = new Array(d).fill(-n);
  for (;;) { const t = H[0].map((_, c) => m.reduce((s2, v, i) => s2 + v * H[i][c], 0));
    X.forEach((x, j) => { if (st.kinds[j] !== 1) return; const v = x.map((xc, c) => xc + t[c] - x0[c]), r = Math.hypot(...v); if (r > 1e-6) out.push({ v, r }); });
    let i = 0; while (i < d && m[i] === n) { m[i] = -n; i++; } if (i === d) break; m[i]++; }
  out.sort((a, b) => a.r - b.r); const rmin = out[0].r; return out.filter((o) => o.r < 1.25 * rmin);
}

/* Gegenbauer C_n^λ(t), and the projection of a zonal function g(t, 1 − t) on S^(D−1) (1 − t passed exact, for distances near zero) onto it: g_n = ∫ g C_n^λ (1−t²)^(λ−½) dt / h_n.
   t = cos θ; the integrand peaks at θ = 0 when r ≈ R, so θ is cut into intervals halving toward 0, each by Gauss–Legendre. */
export const gegen = (lam, n, t) => { if (lam === 0.5) return legendre(n, t); let c0 = 1, c1 = 2 * lam * t; if (n === 0) return 1; for (let m = 2; m <= n; m++) { const c2 = (2 * t * (m + lam - 1) * c1 - (m + 2 * lam - 2) * c0) / m; c0 = c1; c1 = c2; } return c1; };
const GLT = gaussLegendre(20), THETA = (() => { const pts = []; let hi = Math.PI; for (let j = 0; j < 48; j++) { const lo = j === 47 ? 0 : hi / 2; for (let i = 0; i < 20; i++) pts.push({ th: lo + ((GLT.x[i] + 1) / 2) * (hi - lo), w: (GLT.w[i] * (hi - lo)) / 2 }); hi = lo; } return pts; })();
export function project(d, g, ns) {
  const lam = (d - 2) / 2, out = ns.map(() => 0), h = ns.map(() => 0);
  for (const { th, w } of THETA) { const t = Math.cos(th), wt = w * Math.sin(th) ** (2 * lam), gv = g(t, 2 * Math.sin(th / 2) ** 2); ns.forEach((n, i) => { const c = gegen(lam, n, t); out[i] += wt * gv * c; h[i] += wt * c * c; }); }
  return out.map((v, i) => v / h[i]);
}
/* the d block in the ligands' field: H_ij = −Σ_L Σ_(n = 0, 2, 4) ⟨v_n(r, R_L)⟩_3d ⟨Y_i|C_n^λ(x̂·R̂_L)|Y_j⟩, with V = q/|x−X| + c/|x−X|³ */
export function dBlock(d, ligs, q, c, dq) {
  const Y = harmonics(d, 2), pts = sphere(d), n = Y.length, Yv = pts.map((p) => Y.map((f) => f(p.u))), lam = (d - 2) / 2, NS = [0, 2, 4];
  const H = Array.from({ length: n }, () => new Float64Array(n)), radial = new Map();
  const vbar = (Rl) => { const key = Rl.toFixed(9); if (radial.has(key)) return radial.get(key); const acc = NS.map(() => 0);
    for (let j = 0; j < GN; j++) { if (dq[j] < 1e-14) continue; const r = GR[j], vn = project(d, (t, omt) => { const s2 = (r - Rl) ** 2 + 2 * r * Rl * omt; return q / Math.sqrt(s2) + (c ? c / s2 ** 1.5 : 0); }, NS); NS.forEach((_, i) => (acc[i] += dq[j] * vn[i])); }
    radial.set(key, acc); return acc; };
  for (const L of ligs) { const Rh = L.v.map((x) => x / L.r), vb = vbar(L.r);
    pts.forEach((p, s) => { const ct = p.u.reduce((t, x, i) => t + x * Rh[i], 0); let f = 0; NS.forEach((m, i) => (f += vb[i] * gegen(lam, m, ct))); f *= -p.w; for (let i = 0; i < n; i++) for (let j = i; j < n; j++) H[i][j] += f * Yv[s][i] * Yv[s][j]; }); }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) H[i][j] = H[j][i];
  const lv = jacobi(H.map((r) => Array.from(r))), mean = lv.reduce((t, v) => t + v, 0) / n;
  const norm = (() => { let e = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s2 = 0; pts.forEach((p, t) => (s2 += p.w * Yv[t][i] * Yv[t][j])); e = Math.max(e, Math.abs(s2 - +(i === j))); } return e; })();
  let past = 0; for (let j = 0; j < GN; j++) if (GR[j] > ligs[0].r) past += dq[j];
  return { H, levels_eV: lv.map((v) => +((v - mean) * HA).toFixed(4)), spread_eV: +((lv.at(-1) - lv[0]) * HA).toFixed(4), quadratureError: norm, orbitalPastNearest: +past.toExponential(2) };
}
/* the textbook series for ours: −q ⟨r^k⟩/R^(k+1) P_k, k ≤ 4, which treats the whole orbital as inside the ligand */
function textbook3(ligs, q, rk) {
  const Y = harmonics(3, 2), pts = sphere(3), n = Y.length, Yv = pts.map((p) => Y.map((f) => f(p.u))), H = Array.from({ length: n }, () => new Float64Array(n));
  for (const L of ligs) { const Rh = L.v.map((x) => x / L.r);
    pts.forEach((p, s) => { const ct = p.u.reduce((t, x, i) => t + x * Rh[i], 0); let f = 0; for (const k of [0, 2, 4]) f += ((q * rk(k)) / L.r ** (k + 1)) * legendre(k, ct); f *= -p.w; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += f * Yv[s][i] * Yv[s][j]; }); }
  return jacobi(H.map((r) => Array.from(r))).map((v) => v * HA);
}
/* group levels that lie within tol of each other: the splitting's pattern */
export const groups = (lv, tol = 0.02) => { const g = []; for (const v of lv) { const last = g.at(-1); if (last && v - last.top < tol) { last.n++; last.top = v; last.sum += v; } else g.push({ n: 1, top: v, sum: v }); } return g.map((x) => ({ n: x.n, e_eV: +(x.sum / x.n).toFixed(3) })); };

/* a host and its ligand field, for reuse (multiplets.mjs): ruby's corundum site, or Bl₂Px₃'s cation sites with the leak S/8 */
export function host(which, cell = "z2-0") {
  if (which === "ruby") { const st = JSON.parse(readFileSync(path.join(here, "crystalref-Al2O3.json"), "utf8")).corundum; return { d: 3, q: -2, c: 0, sites: [{ site: 0, L: ligands(st, 0) }] }; }
  const st = JSON.parse(readFileSync(path.join(here, "crystalref-Bl2Px3.json"), "utf8"))[cell], C = COMPOUNDS.Bl2Px3;
  const an = ion(C.an, 4, C.core, { watson: { q: 2, R: C.watson } }); let S = 0; for (let j = 0; j < GN; j++) S += an.Q[j] * GR[j] ** 2;
  const sites = [], seen = new Set(); st.kinds.forEach((k, site) => { if (k !== 0) return; const L = ligands(st, site), key = L.map((l) => l.r.toFixed(3)).join(","); if (seen.has(key)) return; seen.add(key); sites.push({ site, L }); });
  return { d: 4, q: -2, c: S / 8, S, sites };
}
const tenDq = (lv) => lv.slice(3).reduce((t, v) => t + v, 0) / 2 - lv.slice(0, 3).reduce((t, v) => t + v, 0) / 3;
const [cmd, cell = "z2-0"] = process.argv.slice(2), main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!main) {} else if (cmd === "check") { // the projection against the closed forms: ours 1/|x−X| → r_<^n/r_>^(n+1); 4D 1/|x−X|² → r_<^n/r_>^(n+2)
  let worst = 0; const rows = [];
  for (const [d, p] of [[3, 1], [4, 2]]) for (const [r, R] of [[0.5, 3.6], [3.0, 3.6], [3.55, 3.6], [3.6, 3.65], [6, 3.6]]) {
    const v = project(d, (t, omt) => ((r - R) ** 2 + 2 * r * R * omt) ** (-p / 2), [0, 2, 4]), lo = Math.min(r, R), hi = Math.max(r, R);
    v.forEach((x, i) => { const n = [0, 2, 4][i], ex = lo ** n / hi ** (n + p), e = Math.abs(x / ex - 1); worst = Math.max(worst, e); rows.push({ d, r, R, n, rel: +e.toExponential(1) }); }); }
  console.log(JSON.stringify({ check: "projection vs closed forms", worstRelative: +worst.toExponential(2), ok: worst < 1e-6, rows }));
} else if (cmd === "ruby") {
  const st = JSON.parse(readFileSync(path.join(here, "crystalref-Al2O3.json"), "utf8")).corundum, ion0 = dopant(24, 3, "1s2 2s2 2p6 3s2 3p6 3d3");
  const L = ligands(st, 0), blk = dBlock(3, L, -2, 0, ion0.q), tb = textbook3(L, -2, ion0.rk);
  console.log(JSON.stringify({ case: "ruby: Cr³⁺ on corundum's Al site, point-charge ligands", dopant: { Z: 24, config: ion0.config, converged: ion0.converged, r_mean: +ion0.r.toFixed(4), r4: +ion0.rk(4).toFixed(4) }, ligands: L.map((l) => +l.r.toFixed(3)), ...blk, groups: groups(blk.levels_eV),
    tenDq_eV: +tenDq(blk.levels_eV).toFixed(4), textbook_tenDq_eV: +tenDq(tb).toFixed(4), measured_tenDq_eV: 2.23, measuredNote: "ruby's ⁴A₂ → ⁴T₂ band, ≈ 18 000 cm⁻¹, which equals 10Dq for d³ in an octahedron (from memory: to verify against a source)" }, null, 1));
} else if (cmd === "bl") {
  const st = JSON.parse(readFileSync(path.join(here, "crystalref-Bl2Px3.json"), "utf8"))[cell], C = COMPOUNDS.Bl2Px3;
  const an = ion(C.an, 4, C.core, { watson: { q: 2, R: C.watson } }); let S = 0; for (let j = 0; j < GN; j++) S += an.Q[j] * GR[j] ** 2;
  const ion0 = dopant(28, 4, "1s2 2s2 2p8 3s2 3p8 3d3"), out = [], seen = new Map();
  for (let site = 0; site < st.kinds.length; site++) { if (st.kinds[site] !== 0) continue; const L = ligands(st, site), key = L.map((l) => l.r.toFixed(3)).join(",");
    if (seen.has(key)) { out.push({ site, sameAs: seen.get(key) }); continue; } seen.set(key, site);
    for (const leak of [false, true]) { const blk = dBlock(4, L, -2, leak ? S / 8 : 0, ion0.q); out.push({ site, leak, ligands: L.map((l) => +l.r.toFixed(3)), ...blk, groups: groups(blk.levels_eV) }); } }
  console.log(JSON.stringify({ case: `4D: element 28's 3+ (3d³) on Bl₂Px₃ ${cell}'s Bl sites, point-charge ligands, with and without the clouds' leak`, dopant: { Z: 28, config: ion0.config, converged: ion0.converged, eps3d_eV: +(ion0.eps3d * HA).toFixed(2), r_mean: +ion0.r.toFixed(4) }, anionS: +S.toFixed(3), sites: out }, null, 1));
} else console.log("usage: crystalfield.mjs ruby | bl [cell] | check");
