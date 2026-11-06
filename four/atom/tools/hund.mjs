/* Hund's first rule across the table: for every open subshell of an atom's ground configuration, the spin of its lowest
   term, from the subshell's own repulsion, against the maximum spin the table's solver assumes (js/atom.js fills open
   shells with Hund spins). In ours Hund's rule is the known answer; in 4D the free d² ion already breaks it (its ground
   term is a spin singlet, tools/multiplets.mjs), so the rule can't be taken for granted.
   How: the subshell's orbitals are degree-l harmonics on S^(D−1) (built here for any l, by orthogonalizing monomials on
   the sphere), their repulsion is the law projected exactly onto degree 0 … 2l (F_n radial over the atom's own orbital,
   A_n angular), and each M_S block of the subshell's determinants gives its lowest energy by Lanczos, matrix-free
   (a 4D d⁹ block is 15 876 determinants, a 4D f⁴ block 14 400). A term of spin S appears in every block with M ≤ S, so
   the ground term's spin is the largest M whose block still reaches the overall lowest energy. Blocks too big to run
   are skipped and said so; the answer is then a bound (the lowest among S ≥ the smallest M run).
     node four/atom/tools/hund.mjs check           ours: the d and f machinery against the known (Racah's d², d³ terms; Pr³⁺ f² ³H; Gd³⁺ f⁷ ⁸S)
     node four/atom/tools/hund.mjs survey [D] [Z/Z/… | all] [limit]   every element of the baked table with an open d or f subshell (D = 4 by default; blocks over limit, default 70 000, skipped)
     node four/atom/tools/hund.mjs one <D> <Z> <config> <shell>
   Prints JSON lines. The other open subshells (an s¹ beside a d shell) are left out: this is the open shell's own term. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPHERE } from "../js/pw.js";
import { R as GR, N as GN } from "../js/atom.js";
import { HA, dopant, sphere, gegen, project, legendre } from "./crystalfield.mjs";
import { eigvals } from "../js/multiplet.js";
import { TABLE } from "../js/table.js";

/* degree-l real harmonics on S^(d−1), orthonormal: monomials of degree l on a quadrature that is exact to degree 2l + 2l,
   with every lower degree (l − 2, l − 4, …) projected out, then Gram–Schmidt. Returns values at the points and the points */
function monomials(d, l) { const out = []; const rec = (i, left, e) => { if (i === d - 1) { out.push([...e, left]); return; } for (let k = left; k >= 0; k--) rec(i + 1, left - k, [...e, k]); }; rec(0, l, []); return out; }
export function harmonicBasis(d, l, pts) {
  const vals = (exps) => Float64Array.from(pts, (p) => exps.reduce((t, e, i) => t * p.u[i] ** e, 1)), dot = (a, b) => { let s = 0; for (let i = 0; i < pts.length; i++) s += pts[i].w * a[i] * b[i]; return s; };
  const lower = []; for (let k = l - 2; k >= 0; k -= 2) lower.push(...harmonicBasis(d, k, pts));
  const basis = [];
  for (const e of monomials(d, l)) { let v = vals(e);
    for (const q of [...lower, ...basis]) { const c = dot(v, q); v = v.map((x, i) => x - c * q[i]); }
    const n = Math.sqrt(dot(v, v)); if (n > 1e-8) basis.push(v.map((x) => x / n)); }
  const want = d === 3 ? 2 * l + 1 : (l + 1) ** 2; if (basis.length !== want) throw new Error(`harmonics d=${d} l=${l}: ${basis.length} not ${want}`);
  return basis;
}
/* the angular tensors A_n(ac, bd) = ∫∫ Y_aY_c(u) C_n^λ(u·w) Y_bY_d(w), n = 0, 2, …, 2l */
export function angularL(d, l) {
  const pts = sphere(d, l + 6), P = pts.length, lam = (d - 2) / 2, Y = harmonicBasis(d, l, pts), m = Y.length, ns = Array.from({ length: l + 1 }, (_, i) => 2 * i);
  const f = []; for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) f.push(Float64Array.from(pts, (_, i) => Y[a][i] * Y[c][i]));
  const A = ns.map((n) => { const K = Array.from({ length: P }, (_, i) => Float64Array.from(pts, (pj) => pts[i].w * pj.w * gegen(lam, n, pts[i].u.reduce((t, x, k) => t + x * pj.u[k], 0))));
    const M = f.map((fb) => { const out = new Float64Array(P); for (let i = 0; i < P; i++) { let s = 0; const row = K[i]; for (let j = 0; j < P; j++) s += row[j] * fb[j]; out[i] = s; } return out; });
    return f.map((fa) => Float64Array.from(M, (mb) => { let s = 0; for (let i = 0; i < P; i++) s += fa[i] * mb[i]; return s; })); });
  let normErr = 0; for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) { let s = 0; pts.forEach((p, i) => (s += p.w * f[a * m + b][i])); normErr = Math.max(normErr, Math.abs(s - +(a === b))); }
  return { m, ns, A, normErr };
}
/* the radial parts F_n over the orbital's probability q on atom.js's grid */
export function slaterL(d, q, ns) {
  const idx = []; let qmax = 0; for (let j = 0; j < GN; j++) qmax = Math.max(qmax, q[j]); for (let j = 0; j < GN; j++) if (q[j] > 1e-13 * qmax) idx.push(j);
  const F = ns.map(() => 0);
  for (let a = 0; a < idx.length; a++) for (let b = a; b < idx.length; b++) { const i = idx[a], j = idx[b], r1 = GR[i], r2 = GR[j], w = (a === b ? 1 : 2) * q[i] * q[j];
    let v; if (d === 3) { const lo = Math.min(r1, r2), hi = Math.max(r1, r2); v = ns.map((n) => lo ** n / hi ** (n + 1)); }
    else v = project(d, (t, omt) => { const s2 = (r1 - r2) ** 2 + 2 * r1 * r2 * omt; return s2 > 0 ? 1 / Math.sqrt(s2) : 0; }, ns);
    for (let k = 0; k < ns.length; k++) F[k] += w * v[k]; }
  return F;
}
/* antisymmetrized integrals over spatial orbitals: g[a,b,c,d] = ⟨ab|cd⟩ = Σ_n F_n A_n(ac, bd) */
function integrals(ang, F) { const { m, A } = ang, g = new Float64Array(m ** 4);
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) for (let c = 0; c < m; c++) for (let dd = 0; dd < m; dd++) { let v = 0; for (let k = 0; k < A.length; k++) v += F[k] * A[k][a * m + c][b * m + dd]; g[((a * m + b) * m + c) * m + dd] = v; }
  return g; }

/* one M_S block: nu up, nd down electrons in m orbitals; D = upMask | downMask << m (2m ≤ 32 bits) */
const pop = (x) => { x >>>= 0; let c = 0; while (x) { x &= x - 1; c++; } return c; };
const below = (D, p) => pop(D & ((p === 32 ? 0 : 2 ** p) - 1) >>> 0); // electrons below spin-orbital p
function combos(m, k) { const out = []; for (let x = 0; x < 2 ** m; x++) if (pop(x) === k) out.push(x); return out; }
function blockOf(m, nu, nd) {
  const U = combos(m, nu), Dn = combos(m, nd), rU = new Int32Array(2 ** m).fill(-1), rD = new Int32Array(2 ** m).fill(-1);
  U.forEach((x, i) => (rU[x] = i)); Dn.forEach((x, i) => (rD[x] = i));
  return { m, nu, nd, U, Dn, rU, rD, dim: U.length * Dn.length };
}
/* H v for the block: ½ Σ ⟨pq|rs⟩ a†p a†q a_s a_r, written over pairs r < s and p < q with ⟨pq||rs⟩ */
function matvec(B, g, v) {
  const { m, U, Dn, rU, rD } = B, nD = Dn.length, out = new Float64Array(v.length), mask = 2 ** m - 1, sp = (p) => (p < m ? 0 : 1), o = (p) => (p < m ? p : p - m);
  const occ = [], emp = [];
  for (let iu = 0; iu < U.length; iu++) for (let id = 0; id < nD; id++) { const c = v[iu * nD + id]; if (c === 0) continue;
    const D = (U[iu] + Dn[id] * 2 ** m) >>> 0; occ.length = 0; for (let p = 0; p < 2 * m; p++) if (Math.floor(D / 2 ** p) % 2) occ.push(p);
    for (let x = 0; x < occ.length; x++) for (let y = x + 1; y < occ.length; y++) { const r = occ[x], s = occ[y];
      // remove r then s: a_s a_r |D⟩
      const s1 = below(D, r) % 2 ? -1 : 1, D1 = D - 2 ** r, s2 = below(D1, s) % 2 ? -1 : 1, D2 = D1 - 2 ** s, spin = sp(r) + sp(s);
      emp.length = 0; for (let p = 0; p < 2 * m; p++) if (!(Math.floor(D2 / 2 ** p) % 2)) emp.push(p);
      for (let i = 0; i < emp.length; i++) for (let j = i + 1; j < emp.length; j++) { const p = emp[i], q = emp[j]; if (sp(p) + sp(q) !== spin) continue;
        // ⟨pq||rs⟩ = ⟨pq|rs⟩[σp=σr, σq=σs] − ⟨pq|sr⟩[σp=σs, σq=σr]
        let val = 0; if (sp(p) === sp(r) && sp(q) === sp(s)) val += g[((o(p) * m + o(q)) * m + o(r)) * m + o(s)]; if (sp(p) === sp(s) && sp(q) === sp(r)) val -= g[((o(p) * m + o(q)) * m + o(s)) * m + o(r)];
        if (val === 0) continue;
        // add q then p: a†p a†q
        const s3 = below(D2, q) % 2 ? -1 : 1, D3 = D2 + 2 ** q, s4 = below(D3, p) % 2 ? -1 : 1, D4 = D3 + 2 ** p, iu2 = rU[D4 & mask], id2 = rD[Math.floor(D4 / 2 ** m)];
        out[iu2 * nD + id2] += s1 * s2 * s3 * s4 * val * c; } } }
  return out;
}
/* the lowest eigenvalue of the block by Lanczos with full reorthogonalization (dense below 400) */
function lowest(B, g, { tol = 1e-10, maxIt = 160 } = {}) {
  const n = B.dim;
  if (n <= 400) { const H = Array.from({ length: n }, (_, i) => { const e = new Float64Array(n); e[i] = 1; return matvec(B, g, e); }); return { E: eigvals(H.map((r) => Array.from(r)))[0], it: 0, dense: true }; }
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  const V = []; let v = Float64Array.from({ length: n }, rnd), nv = Math.hypot(...v.subarray(0, Math.min(n, 1))) || 1; { let s = 0; for (const x of v) s += x * x; nv = Math.sqrt(s); } v = v.map((x) => x / nv);
  const al = [], be = []; let prev = Infinity, E = null;
  for (let k = 0; k < Math.min(maxIt, n); k++) { V.push(v); let w = matvec(B, g, v); let a = 0; for (let i = 0; i < n; i++) a += w[i] * v[i]; al.push(a);
    for (const u of V) { let c = 0; for (let i = 0; i < n; i++) c += w[i] * u[i]; for (let i = 0; i < n; i++) w[i] -= c * u[i]; }
    for (const u of V) { let c = 0; for (let i = 0; i < n; i++) c += w[i] * u[i]; for (let i = 0; i < n; i++) w[i] -= c * u[i]; }
    let b = 0; for (let i = 0; i < n; i++) b += w[i] * w[i]; b = Math.sqrt(b);
    const T = al.map((x, i) => al.map((_, j) => (i === j ? al[i] : Math.abs(i - j) === 1 ? be[Math.min(i, j)] : 0))); E = eigvals(T)[0];
    if (Math.abs(E - prev) < tol && k > 8) return { E, it: k + 1 }; prev = E; if (b < 1e-12) return { E, it: k + 1 }; be.push(b); v = w.map((x) => x / b); }
  return { E, it: maxIt, unconverged: true };
}
/* the subshell's ground spin: lowest energy in each block from M = S_max down; skip blocks over `limit` */
export function groundSpin(m, n, ang, F, { limit = 70000 } = {}) {
  const g = integrals(ang, F), Smax = Math.min(n, 2 * m - n) / 2, out = [];
  for (let M = Smax; M >= (n % 2) / 2 - 1e-9; M -= 1) { const nu = (n + 2 * M) / 2, nd = n - nu, B = blockOf(m, nu, nd);
    if (B.dim > limit) { out.push({ M, dim: B.dim, skipped: true }); continue; }
    const t = Date.now(), r = lowest(B, g); out.push({ M, dim: B.dim, E: r.E, it: r.it, s: (Date.now() - t) / 1000, ...(r.unconverged ? { unconverged: true } : {}) }); }
  const run = out.filter((b) => !b.skipped), Emin = Math.min(...run.map((b) => b.E)), hi = run.find((b) => Math.abs(b.M - Smax) < 1e-9);
  const ground = run.filter((b) => b.E < Emin + 1e-7).reduce((a, b) => (b.M > a.M ? b : a)); // the largest M reaching the lowest energy
  const complete = !out.some((b) => b.skipped);
  return { Smax, groundS: ground.M, hund: Math.abs(ground.M - Smax) < 1e-9, belowMax_eV: hi ? (Emin - hi.E) * HA : null, complete, blocks: out.map((b) => ({ ...b, E: b.E == null ? undefined : +((b.E - Emin) * HA).toFixed(5) })) };
}

const L = { s: 0, p: 1, d: 2, f: 3 }, CAP3 = { s: 2, p: 6, d: 10, f: 14 }, CAP4 = { s: 2, p: 8, d: 18, f: 32 };
const angCache = new Map(), ang = (d, l) => { const k = `${d}:${l}`; if (!angCache.has(k)) angCache.set(k, angularL(d, l)); return angCache.get(k); };
export function oneShell(d, Z, config, shell, opts) {
  const l = L[shell[1]], n = +config.match(new RegExp(`${shell}(\\d+)`))[1], a = ang(d, l), io = dopant(Z, d, config, shell), F = slaterL(d, io.q, a.ns);
  return { d, Z, shell, n, converged: io.converged, F_eV: F.map((x) => +(x * HA).toFixed(4)), ...groundSpin(a.m, n, a, F, opts) };
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url), [cmd, ...args] = process.argv.slice(2);
if (main && cmd === "check") {
  const t0 = Date.now(), res = [];
  // ours, d: Hund holds for Cr³⁺ d³ and Mn²⁺ d⁵; the d² gaps against Racah's formula come from multiplets.mjs's check
  res.push({ what: "Cr³⁺ 3d³ (⁴F)", ...oneShell(3, 24, "1s2 2s2 2p6 3s2 3p6 3d3", "3d"), want: 1.5 });
  res.push({ what: "Mn²⁺ 3d⁵ (⁶S)", ...oneShell(3, 25, "1s2 2s2 2p6 3s2 3p6 3d5", "3d"), want: 2.5 });
  // ours, f: Pr³⁺ 4f² ³H and Gd³⁺ 4f⁷ ⁸S
  const xe = "1s2 2s2 2p6 3s2 3p6 3d10 4s2 4p6 4d10 5s2 5p6";
  res.push({ what: "Pr³⁺ 4f² (³H)", ...oneShell(3, 59, `${xe} 4f2`, "4f"), want: 1 });
  res.push({ what: "Gd³⁺ 4f⁷ (⁸S)", ...oneShell(3, 64, `${xe} 4f7`, "4f"), want: 3.5 });
  // 4D: the Lanczos blocks against the dense d² and d³ answers (singlet, 0.396 eV for element 26; quartet for 28³⁺)
  res.push({ what: "4D element 26 3d² (singlet, 0.396 eV)", ...oneShell(4, 26, "1s2 2s2 2p8 3s2 3p8 3d2 4s2", "3d"), want: 0 });
  res.push({ what: "4D element 28³⁺ 3d³ (quartet)", ...oneShell(4, 28, "1s2 2s2 2p8 3s2 3p8 3d3", "3d"), want: 1.5 });
  const ok = res.every((r) => Math.abs(r.groundS - r.want) < 1e-9 && r.complete) && Math.abs(res[4].belowMax_eV + 0.396) < 0.002;
  for (const r of res) console.log(JSON.stringify({ what: r.what, groundS: r.groundS, want: r.want, belowMax_eV: r.belowMax_eV && +r.belowMax_eV.toFixed(4), blocks: r.blocks.map((b) => `${b.M}:${b.dim}${b.skipped ? " skipped" : `@${b.E}`}`).join(" ") }));
  console.log(JSON.stringify({ check: "hund", ok, seconds: (Date.now() - t0) / 1000 }));
} else if (main && cmd === "one") {
  const [D, Z, config, shell] = [+args[0], +args[1], args[2].replaceAll(",", " "), args[3]]; console.log(JSON.stringify(oneShell(D, Z, config, shell)));
} else if (main && cmd === "survey") {
  const D = +(args[0] || 4), CAP = D === 3 ? CAP3 : CAP4, only = args[1] && args[1] !== "all" ? new Set(args[1].split("/").map(Number)) : null, limit = +(args[2] || 70000);
  for (const e of TABLE[D]) { if (only && !only.has(e.Z)) continue;
    const open = [...e.config.matchAll(/(\d[spdf])(\d+)/g)].filter(([, s, k]) => +k < CAP[s[1]] && +k > 0 && L[s[1]] >= 2);
    for (const [, s] of open) { const t = Date.now(); const r = oneShell(D, e.Z, e.config, s, { limit }); const { blocks, ...rest } = r;
      console.log(JSON.stringify({ ...rest, belowMax_eV: rest.belowMax_eV && +rest.belowMax_eV.toFixed(4), others: [...e.config.matchAll(/(\d[spdf])(\d+)/g)].filter(([, s2, k]) => s2 !== s && +k < CAP[s2[1]]).map(([t2]) => t2), blocks: blocks.map((b) => `${b.M}:${b.dim}${b.skipped ? " skipped" : `@${b.E}`}`).join(" "), s: (Date.now() - t) / 1000 })); } }
} else if (main) console.log("usage: hund.mjs check | survey [D] [Z/Z/…] | one <D> <Z> <config,with,commas> <shell>");
