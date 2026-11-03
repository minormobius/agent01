/* Ionic crystals of unknown structure (js/ionic.js), for bluminium pxide Bl₂Px₃, 4D's sapphire; our corundum, Al₂O₃,
   the check. Ions from the table's solver as tools/salt.mjs makes them (the cation stripped to the noble-gas core, the
   doubly charged anion held by a Watson shell at radius R, as for magnesia), their meetings by Gordon and Kim's electron
   gas, tabulated and smoothed (cubic Hermite), with an exponential wall inside the tables' start.
     node four/atom/tools/ionic.mjs known Al2O3                corundum from its measured coordinates, relaxed
     node four/atom/tools/ionic.mjs search <Al2O3|Bl2Px3> <Z> <starts> [--shard i/m]   random cells, relaxed (runner)
     node four/atom/tools/ionic.mjs bake                       → js/ionicdata.js
   A start: a cell of random shape (angles 60–120°, edges within 1.5× of each other) with room for Z formula units at
   0.7–1.6 times the magnesia-like volume, ions placed at random no closer than 0.75 of the cation–anion contact. Each
   relaxed (ions and cell together, analytic slopes) to |g| < 1e-5. Cache $TMPDIR/atom4-ionic */
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import path from "node:path";
import os from "node:os";
import { ion, curves, far, shortRange } from "./salt.mjs";
import { Ionic } from "../js/ionic.js";
import { R as GRID, N, subshells } from "../js/atom.js";
import { bfgsG, det } from "../js/crystal.js";
import { kTab } from "../js/kernel.js";
import { coupledAlpha, c6From, OMEGA } from "./response.mjs";
import { tangToennies6 } from "../js/forces.js";

const here = path.dirname(new URL(import.meta.url).pathname), DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-ionic"); mkdirSync(DIR, { recursive: true });
const EV = 27.211386, BOHR = 0.529177210903, U = 1.66053906660e-27;
const ne3 = { "1s": 2, "2s": 2, "2p": 6 }, ne4 = { "1s": 2, "2s": 2, "2p": 8 };
/* each compound: dimension, cation and anion (Z, charge), the formula's counts, the anion's Watson radius (magnesia's and
   nagnesium pxide's, from tools/salt.mjs: the shell where its potential matches the crystal's), masses, and the
   magnesia-like volume per ion (bohr^d) the starts scale from */
export const COMPOUNDS = {
  Al2O3: { d: 3, cat: 13, an: 8, core: ne3, nc: 2, na: 3, watson: 2.26, mc: 26.9815, ma: 15.999, vIon: 3.95 ** 3, measured: { density: 3987, U: 164.96, structure: "corundum: Al 6-coordinated, O 4" } },
  Bl2Px3: { d: 4, cat: 15, an: 10, core: ne4, nc: 2, na: 3, watson: 2.09, mc: 31, ma: 20, vIon: 3.85 ** 4 },
};
const mom = (A) => { let S = 0, T = 0; for (let j = 0; j < N; j++) { S += A.Q[j] * GRID[j] ** 2; T += A.Q[j] * GRID[j] ** 4; } return { S, T }; };
/* cubic Hermite on a uniform table, [u, du/dr]; inside the table's start an exponential wall continuing it */
function hermite(lo, step, v) {
  const n = v.length, m = v.map((_, i) => (i === 0 ? v[1] - v[0] : i === n - 1 ? v[n - 1] - v[n - 2] : (v[i + 1] - v[i - 1]) / 2));
  const kap = v[0] > 0 && m[0] < 0 ? -m[0] / step / v[0] : 3;
  return (r) => { const x = (r - lo) / step; if (x <= 0) { const u = Math.max(v[0], 1e-3) * Math.exp(kap * (lo - r)); return [u, -kap * u]; } if (x >= n - 1) return [0, 0];
    const i = Math.floor(x), t = x - i, t2 = t * t, t3 = t2 * t;
    return [(2 * t3 - 3 * t2 + 1) * v[i] + (t3 - 2 * t2 + t) * m[i] + (-2 * t3 + 3 * t2) * v[i + 1] + (t3 - t2) * m[i + 1], ((6 * t2 - 6 * t) * v[i] + (3 * t2 - 4 * t + 1) * m[i] + (-6 * t2 + 6 * t) * v[i + 1] + (3 * t2 - 2 * t) * m[i + 1]) / step]; };
}
/* dispersion, which the electron gas leaves out (it has no correlation): C₆ by Casimir–Polder from each ion's coupled
   response (tools/response.mjs; the anion inside its Watson shell, so it's the in-crystal ion), damped by Tang–Toennies
   with β the pair's own repulsion's decay (as the forces chapter's noble-gas pairs: forces.js fullPair). Only C₆: C₈ and
   the many-body terms are left out */
const occOf = (d, spec) => { const sh = subshells(d), o = sh.map(() => 0); for (const [n, k] of Object.entries(spec)) o[sh.findIndex((x) => x.name === n)] = k; return o; };
const shellV = (d, R) => Float64Array.from(GRID, (r) => { const a = Math.min(r, R), b = Math.max(r, R); return (-2 * (d === 3 ? 1 : kTab(a / b))) / b; });
export function polar(name, R = null) { // α(iω) on response.mjs's OMEGA: the cation (R null) or the anion in its shell at R
  const C = COMPOUNDS[name]; return R == null ? coupledAlpha(C.cat, C.d, { occ: occOf(C.d, C.core), omegas: OMEGA }) : coupledAlpha(C.an, C.d, { occ: occOf(C.d, C.core), omegas: OMEGA, vext: shellV(C.d, R) });
}
/* β from a short-range table (lo, step): −d ln u/dr fitted over where it's positive within [a, b] */
function decay(v, a, b, lo = 2.6, step = 0.05) { const xs = [], ys = []; v.forEach((u, i) => { const r = lo + i * step; if (r >= a && r <= b && u > 0) { xs.push(r); ys.push(Math.log(u)); } });
  const n = xs.length; if (n < 3) return 2; const mx = xs.reduce((t, x) => t + x, 0) / n, my = ys.reduce((t, y) => t + y, 0) / n; return -xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0); }
const WIN = { ca: [3, 4.5], aa: [4, 6], cc: [4, 6] };
const FACT6 = 720;
export const dispersion = (C6, beta) => (r) => { const x = beta * r, f = tangToennies6(x), df = (beta * Math.exp(-x) * x ** 6) / FACT6, u = (-C6 * f) / r ** 6; return [u, (-C6 * df) / r ** 6 + (6 * C6 * f) / r ** 7]; };
const plus = (f, g) => (r) => { const [a, da] = f(r), [b, db] = g(r); return [a + b, da + db]; };
export function model(name, watson = null, { disp = false, xs = 1 } = {}) {
  const C = COMPOUNDS[name], d = C.d, cat = ion(C.cat, d, C.core), an = ion(C.an, d, C.core, { watson: { q: 2, R: watson ?? C.watson } }), f = curves(cat, an, 2.6, 0.05, xs), ions = [cat, an], lo = 2.6, step = 0.05;
  const tab = {}, al = disp ? [polar(name), polar(name, watson ?? C.watson)] : null; for (const [k, [a, b]] of Object.entries({ pm: [0, 1], pp: [0, 0], mm: [1, 1] })) { const v = f.T[k].map((u, i) => u - far(ions[a], ions[b], lo + i * step)); tab[k] = hermite(lo, step, v);
    if (disp) tab[k] = plus(tab[k], dispersion(c6From(al[a], al[b], d), decay(v, ...WIN[{ pm: "ca", pp: "cc", mm: "aa" }[k]]))); }
  const I = new Ionic({ d, species: ions.map((A) => ({ q: A.q, ...mom(A) })), short: (a, b, r) => tab[a === b ? (a === 0 ? "pp" : "mm") : "pm"](r) });
  return { C, d, I, ions, converged: cat.converged && an.converged };
}
/* the state as one vector: the cell's lower triangle, then every ion's fractional place */
const lowerIdx = (d) => { const L = []; for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) L.push([i, j]); return L; };
function unpack(v, d, n) { const H = Array.from({ length: d }, () => new Array(d).fill(0)), L = lowerIdx(d); L.forEach(([i, j], k) => (H[i][j] = v[k])); const s = []; for (let a = 0; a < n; a++) s.push(v.slice(L.length + a * d, L.length + (a + 1) * d)); return { H, s }; }
const toX = (H, s, d) => Float64Array.from(s.flatMap((sa) => H[0].map((_, c) => sa.reduce((t, v, b) => t + v * H[b][c], 0))));
export function relax(M, H0, s0, kinds, nf, iters = 1500) {
  const d = M.d, n = kinds.length, L = lowerIdx(d);
  const fg = (v) => { const { H, s } = unpack(v, d, n); if (H.some((r, i) => r[i] < 0.5)) return { f: 1e3, g: v.map(() => 0) }; const e = M.I.energy(H, toX(H, s, d), kinds, nf, true); if (!e) return { f: 1e3, g: v.map(() => 0) };
    const g = new Array(v.length).fill(0);
    L.forEach(([b, c], k) => { let t = e.gH[b][c]; for (let a = 0; a < n; a++) t += s[a][b] * e.gx[a * d + c]; g[k] = t; });
    for (let a = 0; a < n; a++) for (let b = 0; b < d; b++) { let t = 0; for (let c = 0; c < d; c++) t += e.gx[a * d + c] * H[b][c]; g[L.length + a * d + b] = t; }
    return { f: e.E, g, e }; };
  let v = [...L.map(([i, j]) => H0[i][j]), ...s0.flat()], last = null;
  for (const st of bfgsG(fg, v, iters, 1e-5)) last = st;
  const { H, s } = unpack(last.x, d, n), e = M.I.energy(H, toX(H, s, d), kinds, nf);
  return { H, s, E: e.E, g: last.g, e };
}
/* what a relaxed crystal is: its energy per formula (eV, from free ions), volume, density, and each ion's coordination
   (neighbours of the other kind within 1.25× the closest cation–anion distance) */
export function describe(M, r, kinds, nf) {
  const { C, d } = M, x = toX(r.H, r.s, d), n = kinds.length, V = Math.abs(det(r.H)), dist = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (kinds[i] === kinds[j]) continue; let best = Infinity; const m = new Array(d).fill(-1);
    for (let t = 0; t < 3 ** d; t++) { let q = t; const sh = m.map(() => { const v = (q % 3) - 1; q = Math.floor(q / 3); return v; }); const rr = Math.hypot(...x.slice(j * d, j * d + d).map((v, c) => v - x[i * d + c] + sh.reduce((s2, k, b) => s2 + k * r.H[b][c], 0))); dist.push([i, j, rr]); } }
  const dmin = Math.min(...dist.map((p) => p[2])), cn = kinds.map((_, i) => dist.filter(([a, , rr]) => a === i && rr < 1.25 * dmin).length);
  const mass = (C.nc * C.mc + C.na * C.ma) * nf * U, density = mass / (V * (BOHR * 1e-10) ** d);
  return { U: -r.E * EV, Vf: V / nf, density, contact: dmin, cnCat: kinds.map((k, i) => (k === 0 ? cn[i] : null)).filter((v) => v != null), cnAn: kinds.map((k, i) => (k === 1 ? cn[i] : null)).filter((v) => v != null) };
}
/* corundum, R-3c in hexagonal axes: a 4.7589 Å, c 12.991 Å, Al at (0, 0, z) z 0.35216, O at (x, 0, ¼) x 0.30624;
   six formula units in the hexagonal cell */
export function corundum() {
  const a = 4.7589 / BOHR, c = 12.991 / BOHR, z = 0.35216, xo = 0.30624, cen = [[0, 0, 0], [2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 2 / 3]];
  const al = [[0, 0, z], [0, 0, 0.5 - z], [0, 0, -z], [0, 0, z + 0.5]], o = [[xo, 0, 0.25], [0, xo, 0.25], [-xo, -xo, 0.25], [-xo, 0, 0.75], [0, -xo, 0.75], [xo, xo, 0.75]];
  const wrap = (p) => p.map((v) => v - Math.floor(v)), s = [], kinds = [];
  for (const t of cen) { for (const p of al) { s.push(wrap(p.map((v, i) => v + t[i]))); kinds.push(0); } } for (const t of cen) for (const p of o) { s.push(wrap(p.map((v, i) => v + t[i]))); kinds.push(1); }
  return { H: [[a, 0, 0], [-a / 2, (a * Math.sqrt(3)) / 2, 0], [0, 0, c]], s, kinds, nf: 6 };
}
/* θ-alumina, C2/m (Zhou and Snyder 1991: a 11.854, b 2.904, c 5.622 Å, β 103.83°), half its Al tetrahedral: a real
   polymorph that hybrid DFT puts above corundum (Peintinger, Kratz and Bredow 2014), so a model must rank it above too */
export function theta() {
  const a = 11.854 / BOHR, b = 2.904 / BOHR, c = 5.622 / BOHR, be = (103.83 * Math.PI) / 180, s = [], kinds = [];
  const sites = [[0, 0.9166, 0.2073], [0, 0.6595, 0.3165], [1, 0.8272, 0.4339], [1, 0.495, 0.2568], [1, 0.1611, 0.0989]];
  for (const [k, x, z] of sites) for (const [px, pz] of [[x, z], [-x, -z]]) for (const t of [[0, 0], [0.5, 0.5]]) { s.push([px + t[0], t[1], pz].map((v) => v - Math.floor(v))); kinds.push(k); }
  return { H: [[a, 0, 0], [0, b, 0], [c * Math.cos(be), 0, c * Math.sin(be)]], s, kinds, nf: 4 };
}
/* a random start (seeded by k) */
function start(M, Z, k) {
  let sd = (k + 1) * 2654435761 >>> 0; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { C, d } = M, kinds = [...Array(C.nc * Z).fill(0), ...Array(C.na * Z).fill(1)], n = kinds.length, V = C.vIon * n * (0.7 + 0.9 * rnd());
  for (;;) {
    const H = Array.from({ length: d }, () => new Array(d).fill(0)); for (let i = 0; i < d; i++) { H[i][i] = 0.75 + 0.75 * rnd(); for (let j = 0; j < i; j++) H[i][j] = (rnd() - 0.5) * H[i][i]; }
    const sc = Math.pow(V / Math.abs(det(H)), 1 / d); for (const r of H) for (let j = 0; j < d; j++) r[j] *= sc;
    const s = [], xs = []; let ok = true;
    for (let a = 0; a < n && ok; a++) { let tries = 0, placed = false;
      while (tries++ < 200 && !placed) { const sa = Array.from({ length: d }, rnd), xa = H[0].map((_, c) => sa.reduce((t, v, b) => t + v * H[b][c], 0));
        if (xs.every((xb) => { let best = Infinity; for (let t = 0; t < 3 ** d; t++) { let q = t; const sh = []; for (let i = 0; i < d; i++) { sh.push((q % 3) - 1); q = Math.floor(q / 3); } best = Math.min(best, Math.hypot(...xa.map((v, c) => v - xb[c] + sh.reduce((s2, kk, b) => s2 + kk * H[b][c], 0)))); } return best > 0.75 * 3.4; })) { s.push(sa); xs.push(xa); placed = true; } }
      ok = placed; }
    if (ok) return { H, s, kinds };
  }
}
/* re-rank a crystal with its own anion size: the Watson shell set from its anion sites' mean potential (R = 2/φ, as
   for magnesia), relaxed, and again until R settles (potential-induced breathing, averaged over the anions) */
/* the anion's own energy held at Watson radius R (its energy in the shell's field, less the shell's pull on it): shrinking
   it costs this, which energies at different R must carry to be compared (1.1 eV per oxide from magnesia's R to
   corundum's) */
const kernelAt = (d, a, b) => (d === 3 ? 1 : kTab(a / b));
export function anionOwn(name, R) { const C = COMPOUNDS[name], A = ion(C.an, C.d, C.core, { watson: { q: 2, R } }); let V = 0; for (let j = 0; j < N; j++) { const a = Math.min(GRID[j], R), b = Math.max(GRID[j], R); V += A.Q[j] * ((-2 * kernelAt(C.d, a, b)) / b); } return A.E - V; }
export function selfConsistent(name, H, s, kinds, nf, { tol = 0.004, log = () => {} } = {}) {
  let R = COMPOUNDS[name].watson, r = { H, s }, M;
  for (let it = 0; it < 6; it++) {
    M = model(name, R); r = relax(M, r.H, r.s, kinds, nf);
    const x = toX(r.H, r.s, M.d), phi = M.I.sitePotentials(r.H, x, kinds), an = kinds.map((k, i) => (k === 1 ? phi[i] : null)).filter((v) => v != null), Rn = 2 / (an.reduce((t, v) => t + v, 0) / an.length);
    log(`  R ${R.toFixed(4)} → ${Rn.toFixed(4)}: U ${(-r.E * EV).toFixed(3)} eV`);
    if (Math.abs(Rn - R) < tol) { R = Rn; break; } R = Rn;
  }
  M = model(name, R); r = relax(M, r.H, r.s, kinds, nf);
  const D = describe(M, r, kinds, nf), own = (COMPOUNDS[name].na * (anionOwn(name, R) - anionOwn(name, COMPOUNDS[name].watson))) * EV;
  return { R, r, D: { ...D, Uraw: D.U, U: D.U - own, own }, M }; // U from free ions, the anions' shrinking paid for
}
/* ------------------------------------------------------------------ per-site breathing (potential-induced breathing)
   Each anion takes its own Watson radius from its own site's potential, R_i = 2/φ_i, so an oxide with one neighbour
   (a low potential) swells and pays for it in its meetings, where the averaged radius couldn't tell it apart. The anion's
   cloud, its own energy and its meetings are tabulated on a grid of radii (tools/pib-<name>.json, built once by
   `tables`), and interpolated: linearly in R for cation–anion, bilinearly for anion–anion. The energy carries each anion's
   own cost of being squeezed to its R. Relaxed with the radii held, then the radii reset from the new potentials, until
   they settle. */
const PIB_R = { Al2O3: [1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.75], Bl2Px3: [1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.65] };
const LO = 2.6, STEP = 0.05, RMX = 14, NR = Math.round((RMX - LO) / STEP) + 1;
const pibFile = (name, xs = 1) => path.join(here, `pib-${name}${xs === 1 ? "" : `-x${Math.round(xs * 100)}`}.json`);
function pibTables(name, xs = 1) {
  const f = pibFile(name, xs); if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  throw new Error(`no ${f}: run tools/ionic.mjs tables ${name}`);
}
export function pibModel(name, opts = {}) {
  const xs = opts.xs ?? 1, T = pibTables(name, xs), C = COMPOUNDS[name], d = C.d, Rs = T.Rs, cat = ion(C.cat, d, C.core), cm = mom(cat);
  // scaleCA: the cation–anion overlap scaled (a diagnostic: is the electron gas's repulsion too soft?)
  const sc = opts.scaleCA ?? 1, H = (v) => hermite(LO, STEP, v), ca = T.ca.map((v) => H(v.map((x) => x * sc))), cc = H(T.cc), aa = T.aa.map((row) => row.map((v) => (v ? H(v) : null)));
  // dispersion (opts.disp): each anion's α(iω) interpolated at its radius, β from the tables, as model() does
  let D = null; if (opts.disp) { if (!T.aw) { T.aw = Rs.map((R) => polar(name, R)); T.cw = polar(name); writeFileSync(pibFile(name, xs), JSON.stringify(T, (k, v) => (typeof v === "number" ? +v.toPrecision(7) : v)) + "\n"); }
    D = { bca: T.ca.map((v) => decay(v, ...WIN.ca)), baa: T.aa.map((row) => row.map((v) => (v ? decay(v, ...WIN.aa) : null))), ccd: dispersion(c6From(T.cw, T.cw, d), decay(T.cc, ...WIN.cc)) }; }
  const at = (R) => { const x = Math.max(0, Math.min(Rs.length - 1 - 1e-9, (() => { let i = 0; while (i < Rs.length - 2 && Rs[i + 1] < R) i++; return i + (R - Rs[i]) / (Rs[i + 1] - Rs[i]); })())); const i = Math.floor(x); return [i, x - i]; };
  const lin = (arr, R) => { const [i, u] = at(R); return arr[i] * (1 - u) + arr[i + 1] * u; };
  const aaAt = (i, j) => (i <= j ? aa[i][j] : aa[j][i]);
  const blend = (fs) => (r) => fs.reduce((acc, [f, w]) => { const [u, du] = f(r); return [acc[0] + w * u, acc[1] + w * du]; }, [0, 0]);
  /* an Ionic for these kinds and anion radii (R per ion; ignored for cations) */
  const awAt = (R) => { const [i, u] = at(R); return T.aw[i].map((v, k) => v * (1 - u) + T.aw[i + 1][k] * u); };
  const make = (kinds, Rsite) => {
    const species = kinds.map((k, i) => (k === 0 ? { q: cat.q, ...cm } : { q: -2, S: lin(T.S, Rsite[i]), T: lin(T.T, Rsite[i]) }));
    const shorts = new Map(), key = (a, b) => a * 100000 + b;
    const sh0 = (a, b) => { if (kinds[a] === 0 && kinds[b] === 0) return D ? plus(cc, D.ccd) : cc;
      if (kinds[a] !== kinds[b]) { const R = Rsite[kinds[a] === 1 ? a : b], [i, u] = at(R), f = blend([[ca[i], 1 - u], [ca[i + 1], u]]);
        return D ? plus(f, dispersion(c6From(T.cw, awAt(R), d), D.bca[i] * (1 - u) + D.bca[i + 1] * u)) : f; }
      const [i, u] = at(Rsite[a]), [j, v] = at(Rsite[b]), w = [[i, j, (1 - u) * (1 - v)], [i + 1, j, u * (1 - v)], [i, j + 1, (1 - u) * v], [i + 1, j + 1, u * v]], f = blend(w.map(([p, q, x]) => [aaAt(p, q), x]));
      if (!D) return f; const bAt = (p, q) => (p <= q ? D.baa[p][q] : D.baa[q][p]);
      return plus(f, dispersion(c6From(awAt(Rsite[a]), awAt(Rsite[b]), d), w.reduce((t, [p, q, x]) => t + x * bAt(p, q), 0))); };
    const sh = sh0;
    return new Ionic({ d, species, short: (a, b, r) => { const k = key(Math.min(a, b), Math.max(a, b)); if (!shorts.has(k)) shorts.set(k, sh(a, b)); return shorts.get(k)(r); } });
  };
  return { C, d, T, make, own: (R) => lin(T.own, R), Rmin: Rs[0], Rmax: Rs.at(-1) };
}
/* relax with each anion's radius from its own site, until the radii settle; U per formula from free ions, every anion's
   squeezing paid for (relative to the compound's reference radius) */
export function pibRelax(name, H, s, kinds, nf, { log = () => {}, tol = 0.004, iters = 8, scaleCA = 1, disp = false, xs = 1 } = {}) {
  const P = pibModel(name, { scaleCA, disp, xs }), d = P.d, n = kinds.length, ids = kinds.map((_, i) => i);
  let R = kinds.map(() => COMPOUNDS[name].watson), r = { H, s };
  for (let it = 0; it < iters; it++) {
    const I = P.make(kinds, R), M = { d, I }; r = relax(M, r.H, r.s, ids, nf);
    const phi = I.sitePotentials(r.H, toX(r.H, r.s, d), ids), Rn = kinds.map((k, i) => (k === 1 ? Math.max(P.Rmin, Math.min(P.Rmax, 2 / phi[i])) : 0));
    const dR = Math.max(...kinds.map((k, i) => (k === 1 ? Math.abs(Rn[i] - R[i]) : 0))), own = kinds.reduce((t, k, i) => t + (k === 1 ? P.own(R[i]) - P.own(COMPOUNDS[name].watson) : 0), 0);
    log(`  pass ${it}: U ${((-r.E - own / nf) * EV).toFixed(3)} eV, radii ${Math.min(...R.filter(Boolean)).toFixed(3)}–${Math.max(...R.filter(Boolean)).toFixed(3)}, change ${dR.toFixed(4)}`);
    R = R.map((v, i) => (kinds[i] === 1 ? 0.5 * v + 0.5 * Rn[i] : 0)); // half steps: the radii and the geometry settle together
    if (dR < tol) break;
  }
  const I = P.make(kinds, R), M = { d, I, C: COMPOUNDS[name] }; r = relax(M, r.H, r.s, ids, nf);
  const own = kinds.reduce((t, k, i) => t + (k === 1 ? P.own(R[i]) - P.own(COMPOUNDS[name].watson) : 0), 0), D = describe({ ...M, d }, { ...r }, kinds, nf);
  return { R, r, D: { ...D, Uraw: D.U, U: D.U - (own / nf) * EV } };
}
const XS = +(process.argv.find((a) => a.startsWith("--xs="))?.slice(5) ?? 1);
const [cmd, name, zArg, nArg] = process.argv.slice(2).filter((a) => !a.startsWith("--xs=")), MAIN = !!process.argv[1] && import.meta.url.endsWith("/" + path.basename(process.argv[1]));
if (!isMainThread && workerData?.name) {
  const C = COMPOUNDS[workerData.name], d = C.d, Rs = PIB_R[workerData.name], cat = ion(C.cat, d, C.core), an = new Map(), anion = (i) => { if (!an.has(i)) an.set(i, ion(C.an, d, C.core, { watson: { q: 2, R: Rs[i] } })); return an.get(i); };
  const curve = (A, B) => Array.from({ length: NR }, (_, k) => { const r = LO + k * STEP; return shortRange(A, B, r, workerData.xs) - far(A, B, r); });
  parentPort.on("message", (j) => parentPort.postMessage({ j, v: j.kind === "cc" ? curve(cat, cat) : j.kind === "ca" ? curve(cat, anion(j.i)) : curve(anion(j.i), anion(j.j)) }));
} else if (!MAIN) { /* imported */ } else if (cmd === "known") {
  const M = model(name), K = corundum(), t0 = Date.now(), x0 = M.I.energy(K.H, toX(K.H, K.s, 3), K.kinds, K.nf), r = relax(M, K.H, K.s, K.kinds, K.nf);
  const D0 = describe(M, { ...K, E: x0.E }, K.kinds, K.nf), D = describe(M, r, K.kinds, K.nf);
  const out = { name, measuredGeometry: D0, relaxed: D, g: r.g, s: (Date.now() - t0) / 1000 };
  writeFileSync(path.join(DIR, `known-${name}.json`), JSON.stringify(out)); console.log(JSON.stringify(out));
} else if (cmd === "search") {
  const M = model(name), Z = +zArg, starts = +nArg, sh = process.argv.indexOf("--shard"), [si, sm] = sh > 0 ? process.argv[sh + 1].split("/").map(Number) : [0, 1];
  const file = path.join(DIR, `${name}_${Z}${sm > 1 ? `_s${si}of${sm}` : ""}.json`), st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { name, Z, done: 0, minima: [] }, t0 = Date.now();
  for (let k = si + sm * st.done; k < starts; k = si + sm * st.done) {
    const S0 = start(M, Z, k), r = relax(M, S0.H, S0.s, S0.kinds, Z), D = describe(M, r, S0.kinds, Z);
    if (r.g < 1e-4 && D.contact > 2.5) { const same = st.minima.find((m) => Math.abs(m.U - D.U) < 0.005 && Math.abs(m.Vf / D.Vf - 1) < 0.01); if (same) same.hits++; else st.minima.push({ ...D, hits: 1, H: r.H, s: r.s, kinds: S0.kinds, first: k }); }
    st.done++; st.minima.sort((a, b) => b.U - a.U); writeFileSync(file, JSON.stringify(st));
    if (st.done % 5 === 0) console.log(`${name} Z ${Z}: ${st.done} starts, best ${st.minima[0]?.U.toFixed(3)} eV (density ${st.minima[0]?.density.toExponential(3)}), ${st.minima.length} minima, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} else if (cmd === "rerank") {
  // the known structure and the search's best few, each made self-consistent: does the ranking hold?
  const Z = +zArg, top = +(nArg || 4), out = { name, Z, items: [] }, f = path.join(DIR, `${name}_${Z}.json`);
  const cands = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).minima.slice(0, top).map((m) => ({ label: `search #${m.first}`, H: m.H, s: m.s, kinds: m.kinds, nf: Z, U0: m.U })) : [];
  if (name === "Al2O3") { const K = corundum(); cands.unshift({ label: "corundum", ...K, U0: null }); }
  for (const c of cands) { console.log(c.label); const r = selfConsistent(name, c.H, c.s, c.kinds, c.nf, { log: console.log }); out.items.push({ label: c.label, U0: c.U0, R: r.R, ...r.D }); }
  writeFileSync(path.join(DIR, `rerank-${name}-${Z}.json`), JSON.stringify(out));
  for (const it of out.items) console.log(`${it.label}: U ${it.U.toFixed(3)} eV (fixed R ${it.U0?.toFixed(3) ?? "—"}), R ${it.R.toFixed(3)}, density ${it.density.toFixed(0)}, CN ${[...new Set(it.cnCat)]} / ${[...new Set(it.cnAn)]}`);
} else if (cmd === "tables") {
  // the anion on PIB_R's radii, its meetings with the cation and with itself at every pair of radii: curves in parallel
  const C = COMPOUNDS[name], d = C.d, Rs = PIB_R[name], t0 = Date.now(), jobs = [{ kind: "cc" }];
  Rs.forEach((_, i) => { jobs.push({ kind: "ca", i }); for (let j = i; j < Rs.length; j++) jobs.push({ kind: "aa", i, j }); });
  const own = Rs.map((R) => anionOwn(name, R)), mo = Rs.map((R) => mom(ion(C.an, d, C.core, { watson: { q: 2, R } })));
  const out = { name, Rs, lo: LO, step: STEP, own, S: mo.map((m) => m.S), T: mo.map((m) => m.T), ca: [], aa: Rs.map(() => Rs.map(() => null)), cc: null };
  const nw = Math.max(1, availableParallelism()); let done = 0;
  await Promise.all(Array.from({ length: nw }, () => new Promise((ok) => { const w = new Worker(new URL(import.meta.url), { workerData: { name, xs: XS } });
    const next = () => { const j = jobs.shift(); if (!j) { w.terminate(); ok(); } else w.postMessage(j); };
    w.on("message", ({ j, v }) => { if (j.kind === "cc") out.cc = v; else if (j.kind === "ca") out.ca[j.i] = v; else out.aa[j.i][j.j] = v; if (++done % 10 === 0) process.stderr.write(`${done} curves, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`); next(); });
    next(); })));
  writeFileSync(pibFile(name, XS), JSON.stringify(out, (k, v) => (typeof v === "number" ? +v.toPrecision(7) : v)) + "\n");
  console.log(`${path.basename(pibFile(name, XS))}: ${done} curves in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else if (cmd === "pib") {
  // the known structure and the search's best few, each with per-site breathing: does corundum come first now?
  const Z = +zArg, top = +(nArg || 3), out = { name, Z, items: [] }, f = path.join(DIR, `${name}_${Z}.json`);
  const cands = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).minima.slice(0, top).map((m) => ({ label: `search #${m.first}`, H: m.H, s: m.s, kinds: m.kinds, nf: Z })) : [];
  if (name === "Al2O3") cands.unshift({ label: "corundum", ...corundum() });
  for (const c of cands) { console.log(c.label); const r = pibRelax(name, c.H, c.s, c.kinds, c.nf, { log: console.log }); out.items.push({ label: c.label, R: r.R.filter(Boolean), ...r.D }); }
  writeFileSync(path.join(DIR, `pib-${name}-${Z}.json`), JSON.stringify(out));
  for (const it of out.items) console.log(`${it.label}: U ${it.U.toFixed(3)} eV, radii ${Math.min(...it.R).toFixed(3)}–${Math.max(...it.R).toFixed(3)}, density ${it.density.toFixed(0)}, CN ${[...new Set(it.cnCat)]} / ${[...new Set(it.cnAn)]}`);
} else if (cmd === "ladder") {
  // the calibration ladder: corundum, θ-alumina and the blind search's best, under one variant of the model
  // (flags: --pib per-site breathing, --disp dispersion, --xs=0.85 the overlap's exchange scaled); corundum must come first
  const pib = process.argv.includes("--pib"), disp = process.argv.includes("--disp"), Z = +(zArg || 2), out = { name, pib, disp, xs: XS, items: [] };
  const f = path.join(DIR, `${name}_${Z}.json`), cands = [{ label: "corundum", ...corundum() }, { label: "theta", ...theta() }];
  if (existsSync(f)) { const m = JSON.parse(readFileSync(f, "utf8")).minima[0]; cands.push({ label: `search #${m.first}`, H: m.H, s: m.s, kinds: m.kinds, nf: Z }); }
  const M = pib ? null : model(name, null, { disp, xs: XS });
  for (const c of cands) { const D = pib ? pibRelax(name, c.H, c.s, c.kinds, c.nf, { disp, xs: XS }).D : describe(M, relax(M, c.H, c.s, c.kinds, c.nf), c.kinds, c.nf); out.items.push({ label: c.label, U: D.U, density: D.density, cnCat: [...new Set(D.cnCat)], cnAn: [...new Set(D.cnAn)] }); }
  for (const it of out.items) console.log(`${it.label.padEnd(12)} U ${it.U.toFixed(3)} eV (${(it.U - out.items[0].U >= 0 ? "+" : "") + (it.U - out.items[0].U).toFixed(3)}), density ${it.density.toFixed(0)}, CN ${it.cnCat} / ${it.cnAn}`);
  writeFileSync(path.join(DIR, `ladder-${name}${pib ? "-pib" : ""}${disp ? "-disp" : ""}${XS !== 1 ? `-x${Math.round(XS * 100)}` : ""}.json`), JSON.stringify(out));
} else if (cmd === "bake") {
  const out = {};
  for (const f of readdirSync(DIR)) { const r = JSON.parse(readFileSync(path.join(DIR, f), "utf8"));
    if (f.startsWith("known-")) (out[r.name] ??= {}).known = r;
    else { const o = ((out[r.name] ??= {}).search ??= {})[r.Z] ??= { starts: 0, minima: [] }; o.starts += r.done;
      for (const m of r.minima) { const same = o.minima.find((q) => Math.abs(q.U - m.U) < 0.005 && Math.abs(q.Vf / m.Vf - 1) < 0.01); if (same) same.hits += m.hits; else o.minima.push({ ...m }); } } }
  for (const v of Object.values(out)) for (const o of Object.values(v.search || {})) { o.minima.sort((a, b) => b.U - a.U); o.found = o.minima.length; o.minima = o.minima.slice(0, 8); }
  for (const [k, C] of Object.entries(COMPOUNDS)) if (out[k]) out[k].measured = C.measured ?? null;
  writeFileSync(path.join(here, "../js/ionicdata.js"), `/* Generated by tools/ionic.mjs bake; do not edit. Ionic crystals of unknown structure: per compound, the known
   structure relaxed (ours only) and the random search's lowest minima per formula units in the cell (U: eV per formula
   from free ions; Vf: volume per formula, bohr^d; density, kg/m^d; contact: closest cation–anion distance, bohr;
   coordination numbers of each cation and anion; hits: how many starts found it). */
export const IONIC = ${JSON.stringify(out)};
`); console.log("wrote js/ionicdata.js");
} else console.error("usage: ionic.mjs known Al2O3 | search <Al2O3|Bl2Px3> <Z> <starts> [--shard i/m] | tables <name> [--xs=] | pib <name> <Z> | ladder Al2O3 [Z] [--pib] [--disp] [--xs=] | bake");
