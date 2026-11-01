/* The liquid's range: liquid and vapour of rigid molecules side by side by Gibbs-ensemble Monte Carlo (js/gibbs.js),
   for the critical point (where the two densities meet), and from it boiling and freezing estimates.
     node four/atom/tools/liquid.mjs run <model> <T K> [--cycles=C] [--minutes=M]   one temperature, resumable
     node four/atom/tools/liquid.mjs probe <w3|x4> <round> [n]                       the field against Hartree–Fock in its liquid
     node four/atom/tools/liquid.mjs check <model> [T]                               a truncated charge sum against Ewald's
     node four/atom/tools/liquid.mjs bake                                            → js/liquiddata.js
   models: spce (SPC/E, a standard model of our water whose coexistence curve is published: the method's check),
           w3, x4 (our water and Xater on the book's force fields, fitted to Hartree–Fock pairs),
           w3L, x4L (the same refitted round by round on pairs taken from their own liquid, js/liquidff.js).
   Calibration: the same recipe on our water gives a critical point to set against our water's real 647 K.
   `check` keeps the reason the charges need Ewald's full sum in 4D: a slab run on the damped shifted force (Fennell and
   Gezelter's truncated sum, good in 3D) drifts into order the full sum charges heavily for.
   Cache $TMPDIR/atom4-liquid/<model>_<T>.json */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { System, shortPair, erfc, sphereArea, Ewald } from "../js/md.js";
import { termsOf } from "../js/ffmodel.js";
import { Gibbs } from "../js/gibbs.js";
import { FORCEFIELDS } from "../js/forcefields.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-liquid"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, ...args] = process.argv.slice(2);
const amu = 1822.888486, KB = 3.166811563e-6, fs = 41.341374, ANG = 1.8897261, KCAL = 627.5095;
const opt = (k, def) => { const a = args.find((s) => s.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : def; };
const pad = (v, d) => [...v, ...new Array(d - v.length).fill(0)];

/* the models: a molecule (sites, constraints), its pairs between molecules, the liquid's rough spacing (bohr), the
   slab's size (molecules across, layers deep), cutoff, DSF damping, time step, sampling */
let LIQFF = {}; try { LIQFF = (await import("../js/liquidff.js")).LIQUIDFF; } catch { /* not yet fitted */ }
export function model(name, p = null) {
  if (name === "spce") {
    const d = 3, R = 1.0 * ANG, th = (109.47 * Math.PI) / 180, q = 0.4238;
    return { name, d, mass: 18.015, kind: kindOf(d, 15.9994, -2 * q, q, R, th), pairs: { "X|X": { lj: [0.6502 / 2625.4996, 3.166 * ANG] } }, Ng: 300, sp: 3.1 * ANG, side: 7, layers: 8, rc: 18, alpha: 0.12, dt: 2, R0: 2.75 * ANG };
  }
  // w3, x4: the book's force fields; w3L, x4L: the same refitted with the liquid's own pairs (js/liquidff.js)
  const d = name.startsWith("w3") ? 3 : 4, ff = FORCEFIELDS[d], pp = p ?? (name.endsWith("L") ? LIQFF[d].p : ff.p), { q, pairs } = termsOf(pp), th = (ff.param * Math.PI) / 180;
  return d === 3
    ? { name, d, mass: 18.015, kind: kindOf(d, 16, -2 * q, q, ff.R, th), pairs, p: pp, Z: ff.Z, Ng: 300, sp: 3.1 * ANG, side: 7, layers: 8, rc: 18, alpha: 0.12, dt: 2, R0: 2.75 * ANG }
    : { name, d, mass: 22.016, kind: kindOf(d, 20, -2 * q, q, ff.R, th), pairs, p: pp, Z: ff.Z, Ng: 300, sp: 6.3, side: 5, layers: 6, rc: 14, alpha: 0.16, dt: 1.5, R0: 6.5 };
}
function kindOf(d, mX, qX, qH, R, th) {
  return { sites: [{ m: mX * amu, q: qX, t: "X", at: pad([0, 0], d) }, { m: 1.008 * amu, q: qH, t: "H", at: pad([R * Math.cos(th / 2), R * Math.sin(th / 2)], d) }, { m: 1.008 * amu, q: qH, t: "H", at: pad([R * Math.cos(th / 2), -R * Math.sin(th / 2)], d) }], constraints: [[0, 1], [0, 2], [1, 2]] };
}

/* a Gibbs pair of boxes for model m: half the molecules at about the liquid's density (one per sp^d), half at a fifth */
export function gibbsOf(m, seed = 1) {
  const n0 = Math.round(m.Ng / 2), v0 = m.sp ** m.d;
  return new Gibbs({ d: m.d, kind: m.kind, pairs: m.pairs, N: [n0, m.Ng - n0], V: [n0 * v0, 5 * (m.Ng - n0) * v0], seed });
}
/* the slab system (now only for `check`): md.js's System with a long box (Lx along axis 0, L across), every site pair tabulated in r²
   (short-range term plus DSF charges), cell lists, and the heavy atoms' pull past rc from the profile */
export class Slab extends System {
  constructor(m, { seed = 1, x = null, cubic = false } = {}) {
    const { d, sp, side } = m, layers = cubic ? side : m.layers, L = side * sp, Lx = cubic ? L : 3 * layers * sp, N = layers * side ** (d - 1);
    const positions = Array.from({ length: N }, (_, a) => { const c = [cubic ? ((a % layers) + 0.5) * sp : Lx / 2 + ((a % layers) - (layers - 1) / 2) * sp]; let i = Math.floor(a / layers); for (let k = 1; k < d; k++) { c.push(((i % side) + 0.5) * (L / side)); i = Math.floor(i / side); } return c; });
    super({ d, L, kind: m.kind, N, pairs: m.pairs, rc: m.rc, dsf: { alpha: m.alpha }, seed, positions });
    this.box = [Lx, ...new Array(d - 1).fill(L)]; this.skin = m.skin ?? 3; this.Lx = Lx; this.A = L ** (d - 1); this.mdl = m;
    this.tables(); this.cells(); this.tail();
    if (x) this.x.set(x);
    this.ready = true; this.forces();
  }
  sep(i, j, x = this.x) { const { d } = this, B = this.box || new Array(d).fill(this.L), r = new Float64Array(d); for (let a = 0; a < d; a++) { let u = x[i * d + a] - x[j * d + a]; u -= B[a] * Math.round(u / B[a]); r[a] = u; } return r; }
  /* u(r²) and −u′/r for each site-type pair, on a grid in r² to rc², linear in between */
  tables() {
    const { rc } = this, D = this.dsf, sp = 2 / Math.sqrt(Math.PI), n = 1 << 16, r2min = 0.25, h = (rc * rc - r2min) / (n - 1), types = ["X", "H"], qOf = { X: this.q[0], H: this.q[1] };
    this.tab = {}; this.tabN = n; this.tabH = h; this.tabR0 = r2min;
    for (const a of types) for (const b of types) {
      const p = this.pair(a, b), U = new Float64Array(n), F = new Float64Array(n), qq = qOf[a] * qOf[b];
      for (let k = 0; k < n; k++) { const r2 = r2min + k * h, r = Math.sqrt(r2); let u = 0, f = 0; if (p) { const s = shortPair(p, r2); u += s[0]; f += s[1]; }
        const ec = erfc(D.a * r), fr = ec / r2 + (sp * D.a * Math.exp(-D.a * D.a * r2)) / r; u += qq * (ec / r - D.e0 + D.f0 * (r - rc)); f += (qq * (fr - D.f0)) / r; U[k] = u; F[k] = f; }
      this.tab[`${a}|${b}`] = [U, F];
    }
    this.code = Int8Array.from(this.t, (t) => (t === "X" ? 0 : 1));
    this.tabs = [[this.tab["X|X"], this.tab["X|H"]], [this.tab["H|X"], this.tab["H|H"]]];
  }
  cells() {
    const { d, box, rc } = this; this.nc = box.map((B) => Math.max(1, Math.floor(B / (rc + this.skin)))); this.ncell = this.nc.reduce((a, b) => a * b, 1);
    this.nbr = [];
    for (let c = 0; c < this.ncell; c++) { const idx = []; let k = c; for (let a = 0; a < d; a++) { idx.push(k % this.nc[a]); k = Math.floor(k / this.nc[a]); } const set = new Set();
      for (let o = 0; o < 3 ** d; o++) { let oo = o, cc = 0, mul = 1; for (let a = 0; a < d; a++) { const off = (oo % 3) - 1; oo = Math.floor(oo / 3); const v = (idx[a] + off + this.nc[a]) % this.nc[a]; cc += v * mul; mul *= this.nc[a]; } set.add(cc); }
      this.nbr.push(Int32Array.from(set)); }
    this.head = new Int32Array(this.ncell); this.next = new Int32Array(this.n);
  }
  /* the heavy atoms' pull past rc: W(z) for a sheet of unit areal density z away, over its part beyond rc,
     W(z) = S_(d−1) ∫ u(r) s^(d−3) r dr, r from max(rc, |z|), s = √(r² − z²) */
  tail() {
    const { d, rc, Lx } = this, p = this.pair("X", "X"), S = sphereArea(d - 1), nz = Math.ceil(Lx / 2 / 0.25) + 2; this.tz = 0.25;
    this.W = new Float64Array(nz); this.dW = new Float64Array(nz);
    for (let k = 0; k < nz; k++) { const z = k * this.tz, r0 = Math.max(rc, z); let I = 0; const M = 4000, lo = Math.log(r0), hi = Math.log(r0 + 4000), hh = (hi - lo) / M;
      for (let i = 0; i <= M; i++) { const r = Math.exp(lo + i * hh), s = Math.sqrt(Math.max(0, r * r - z * z)), w = i === 0 || i === M ? 0.5 : 1; I += w * shortPair(p, r * r)[0] * s ** (d - 3) * r * r; } // r dr = r² d(ln r)
      this.W[k] = S * I * hh; }
    for (let k = 0; k < nz; k++) this.dW[k] = (this.W[Math.min(nz - 1, k + 1)] - this.W[Math.max(0, k - 1)]) / ((Math.min(nz - 1, k + 1) - Math.max(0, k - 1)) * this.tz);
    this.nb = Math.round(Lx / 0.5); this.hb = Lx / this.nb;
  }
  /* Verlet's list: every site pair within rc + skin, found by cells, rebuilt once any site has moved half the skin */
  build() {
    const { d, n, x, mol, box, head, next, nc } = this, rl = this.rc + this.skin, rl2 = rl * rl, pi = [], pj = [];
    head.fill(-1);
    for (let i = 0; i < n; i++) { let c = 0, mul = 1; for (let a = 0; a < d; a++) { let u = x[i * d + a] / box[a]; u -= Math.floor(u); let k = Math.floor(u * nc[a]); if (k >= nc[a]) k = nc[a] - 1; c += k * mul; mul *= nc[a]; } next[i] = head[c]; head[c] = i; }
    for (let c = 0; c < this.ncell; c++) { const nb = this.nbr[c];
      for (let i = head[c]; i >= 0; i = next[i]) { const mi = mol[i], xi = i * d;
        for (let q = 0; q < nb.length; q++) for (let j = head[nb[q]]; j >= 0; j = next[j]) {
          if (j <= i || mol[j] === mi) continue;
          let r2 = 0; for (let a = 0; a < d; a++) { let v = x[xi + a] - x[j * d + a]; v -= box[a] * Math.round(v / box[a]); r2 += v * v; }
          if (r2 < rl2) { pi.push(i); pj.push(j); }
        } } }
    this.pi = Int32Array.from(pi); this.pj = Int32Array.from(pj); this.pt = Int8Array.from(pi, (i, k) => this.code[i] * 2 + this.code[pj[k]]);
    this.x0 = x.slice(); this.builds = (this.builds || 0) + 1;
  }
  forces() {
    if (!this.ready) { this.F.fill(0); this.Epot = this.Edyn = 0; return {}; }
    const { d, n, x, F, box, tabR0, tabH, tabN } = this, rc2 = this.rc * this.rc;
    let far = 0; if (this.x0) for (let k = 0; k < n * d; k += d) { let s2 = 0; for (let a = 0; a < d; a++) s2 += (x[k + a] - this.x0[k + a]) ** 2; if (s2 > far) far = s2; }
    if (!this.x0 || 4 * far > this.skin * this.skin) this.build();
    F.fill(0);
    const { pi, pj, pt } = this, T4 = [this.tab["X|X"], this.tab["X|H"], this.tab["H|X"], this.tab["H|H"]], dx = new Float64Array(d); let E = 0;
    for (let p = 0; p < pi.length; p++) {
      const i = pi[p], j = pj[p], xi = i * d, xj = j * d; let r2 = 0;
      for (let a = 0; a < d; a++) { let v = x[xi + a] - x[xj + a]; v -= box[a] * Math.round(v / box[a]); dx[a] = v; r2 += v * v; }
      if (r2 >= rc2) continue;
      const tb = T4[pt[p]], U = tb[0], Ft = tb[1], s = (r2 > tabR0 ? r2 - tabR0 : 0) / tabH, k = Math.min(tabN - 2, s | 0), t = s - k;
      E += U[k] + t * (U[k + 1] - U[k]); const f = Ft[k] + t * (Ft[k + 1] - Ft[k]);
      for (let a = 0; a < d; a++) { F[xi + a] += f * dx[a]; F[xj + a] -= f * dx[a]; }
    }
    // the heavy atoms' pull past rc, from the profile across the slab (cloud-in-cell into bins, then each bin's potential)
    const { nb: B, hb, ns, N, A, W, dW, tz, Lx } = this, cnt = new Float64Array(B);
    for (let a = 0; a < N; a++) { let z = x[a * ns * d] / Lx; z = (z - Math.floor(z)) * B - 0.5; const k = Math.floor(z), t = z - k; cnt[(k + B) % B] += 1 - t; cnt[(k + 1) % B] += t; }
    const phi = new Float64Array(B), dphi = new Float64Array(B), look = (arr, z) => { const s = Math.abs(z) / tz, k = Math.min(arr.length - 2, s | 0), t = s - k; return arr[k] + t * (arr[k + 1] - arr[k]); };
    for (let b = 0; b < B; b++) { if (!cnt[b]) continue; for (let c = 0; c < B; c++) { let z = (c - b) * hb; z -= Lx * Math.round(z / Lx); phi[c] += (cnt[b] * look(W, z)) / A; dphi[c] += (cnt[b] * Math.sign(z) * look(dW, z)) / A; } }
    let Et = 0;
    for (let a = 0; a < N; a++) { const i = a * ns; let z = x[i * d] / Lx; z = (z - Math.floor(z)) * B - 0.5; const k = Math.floor(z), t = z - k, k0 = (k + B) % B, k1 = (k + 1) % B; Et += 0.5 * ((1 - t) * phi[k0] + t * phi[k1]); F[i * d] -= (1 - t) * dphi[k0] + t * dphi[k1]; }
    this.Etail = Et; this.Epot = this.Edyn = E + Et;
    return { E: this.Epot, Etail: Et };
  }
  /* the heavy atoms' density across the slab, about its centre (circular mean), folded: counts in bins of |z| */
  profile(nb) {
    const { d, ns, N, x, Lx } = this; let cs = 0, sn = 0;
    for (let a = 0; a < N; a++) { const th = (2 * Math.PI * x[a * ns * d]) / Lx; cs += Math.cos(th); sn += Math.sin(th); }
    const c = (Math.atan2(sn, cs) / (2 * Math.PI)) * Lx, h = Lx / 2 / nb, out = new Array(nb).fill(0);
    for (let a = 0; a < N; a++) { let z = x[a * ns * d] - c; z -= Lx * Math.round(z / Lx); out[Math.min(nb - 1, Math.floor(Math.abs(z) / h))]++; }
    return out;
  }
}

/* a folded profile's liquid and vapour densities: ρ(z) = a − b tanh((z − z0)/w), a ± b the two densities, least squares
   over z0 and w (grid then refine), linear in a and b */
export function fitProfile(counts, h, A) {
  const rho = counts.map((c) => c / (2 * A * h)), z = counts.map((_, k) => (k + 0.5) * h);
  const solve = (z0, w) => { let s11 = 0, s12 = 0, s22 = 0, r1 = 0, r2 = 0, n = rho.length; for (let k = 0; k < n; k++) { const t = -Math.tanh((z[k] - z0) / w); s11 += 1; s12 += t; s22 += t * t; r1 += rho[k]; r2 += rho[k] * t; } const det = s11 * s22 - s12 * s12, a = (r1 * s22 - r2 * s12) / det, b = (s11 * r2 - s12 * r1) / det; let err = 0; for (let k = 0; k < n; k++) err += (rho[k] - a + b * Math.tanh((z[k] - z0) / w)) ** 2; return { a, b, err, z0, w }; };
  let best = null; const zmax = z[z.length - 1];
  for (let z0 = 0.05 * zmax; z0 < 0.95 * zmax; z0 += zmax / 60) for (let w = 0.3; w < zmax / 3; w *= 1.15) { const s = solve(z0, w); if (!best || s.err < best.err) best = s; }
  for (let it = 0, dz = zmax / 60, dw = 0.15; it < 40; it++, dz *= 0.8, dw *= 0.8) for (const [a, b] of [[dz, 0], [-dz, 0], [0, dw], [0, -dw]]) { const w = best.w * (1 + b); if (w <= 0.05) continue; const s = solve(best.z0 + a, w); if (s.err < best.err) best = s; }
  return { l: best.a + best.b, v: best.a - best.b, z0: best.z0, w: best.w };
}

const MAIN = !!process.argv[1] && import.meta.url.endsWith("/" + path.basename(process.argv[1]));
if (!MAIN) {
  // imported (the bench, the selftest): no command
} else if (cmd === "run") {
  /* one temperature: equilibrate (steps tuned) for a fifth of the cycles, then record both boxes' densities and
     energies every cycle, in blocks of 200 cycles */
  const name = args[0], T = +args[1], m = model(name), cycles = opt("cycles", 8000), minutes = opt("minutes", 330), ntr = opt("transfers", Math.round(m.Ng / 5)), block = 200;
  const file = path.join(DIR, `${name}_${T}.json`), kT = T * KB, t0 = Date.now();
  let st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const g = gibbsOf(m, 17 + Math.round(T) + (st ? st.cycle : 0));
  if (st) g.load(st.state); else st = { model: name, d: m.d, T, N: m.Ng, mass: m.mass, cycles, eq: Math.round(cycles / 5), cycle: 0, blocks: [], cur: null };
  console.log(`${name} T=${T} K: ${m.Ng} molecules, from cycle ${st.cycle} to ${cycles}; boxes ${g.box.map((B) => `${B.mols.length} in L ${B.L.toFixed(1)}`).join(", ")}`);
  const save = () => { st.state = g.dump(); writeFileSync(file, JSON.stringify(st)); };
  let lastSave = Date.now();
  while (st.cycle < cycles) {
    g.cycle(kT, ntr); st.cycle++;
    if (st.cycle <= st.eq && st.cycle % 10 === 0) g.tune();
    if (st.cycle % 50 === 0) { const drift = [0, 1].map((b) => g.check(b)); if (drift.some((x) => Math.abs(x) > 1e-6 * (1 + Math.abs(g.box[0].E)))) console.log(`drift ${drift.map((x) => x.toExponential(2)).join(" ")}`); }
    if (st.cycle > st.eq) {
      const r = [0, 1].map((b) => g.density(b)), e = [0, 1].map((b) => (g.box[b].mols.length ? g.box[b].E / g.box[b].mols.length : 0)), li = r[0] >= r[1] ? 0 : 1;
      st.cur ??= { from: st.cycle, n: 0, l: 0, v: 0, el: 0, ev: 0, nl: 0 };
      const c = st.cur; c.n++; c.l += r[li]; c.v += r[1 - li]; c.el += e[li]; c.ev += e[1 - li]; c.nl += g.box[li].mols.length;
      if (c.n === block) { st.blocks.push({ from: c.from, to: st.cycle, l: c.l / c.n, v: c.v / c.n, el: c.el / c.n, ev: c.ev / c.n, nl: c.nl / c.n }); st.cur = null; }
    }
    if (st.cycle % 100 === 0) console.log(`cycle ${st.cycle}: ${g.box.map((B, b) => `${B.mols.length} at ${g.density(b).toExponential(3)}, U ${((B.E / Math.max(1, B.mols.length)) * KCAL).toFixed(2)}`).join(" | ")} kcal/mol; moved ${g.moved || 0}/${g.tries || 0}, steps ${g.step.map((x) => `${x.dx.toFixed(2)}/${x.dth.toFixed(2)}`).join(" ")}, dlnV ${g.dlnV.toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (Date.now() - lastSave > 60000) { save(); lastSave = Date.now(); }
    if (Date.now() - t0 > minutes * 60000) { console.log("deadline: saved, resume with the same command"); break; }
  }
  save();
} else if (cmd === "check") {
  /* the damped shifted force against Ewald's full sum, on frames of a liquid of this model in a cubic box at its
     slab's spacing: the energy per molecule of the charges, each way, and the spread of the difference over frames */
  const m0 = model(args[0]), { d } = m0, side = d === 3 ? 6 : 5, m = { ...m0, side, rc: Math.min(m0.rc, (side * m0.sp) / 2 - 0.01) }, rc = m.rc, T = +(args[1] || (d === 3 ? 300 : 500));
  const sys = new Slab(m, { seed: 5, cubic: true }), L = sys.L, N = sys.N;
  sys.thermalize(T * KB); for (let k = 0; k < 300; k++) sys.step(m.dt * fs, T * KB, 10 * fs);
  const charges = (useEwald) => { const qs = sys.q, n = sys.n; let E = 0; const D = sys.dsf;
    if (useEwald) { const al = 2.6 / rc, ew = new Ewald(d, L, { alpha: al, rc, nmax: d === 3 ? 9 : 7 }), F = new Float64Array(n * d), e = ew.compute(sys.x, qs, F, sys.excl, true); return e.E; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (sys.mol[i] === sys.mol[j]) continue; const r = Math.hypot(...sys.sep(i, j)); if (r >= rc) continue; E += qs[i] * qs[j] * (erfc(D.a * r) / r - D.e0 + D.f0 * (r - rc)); }
    return E; };
  const rows = [];
  for (let f = 0; f < 4; f++) { for (let s = 0; s < 1000; s++) sys.step(m.dt * fs, T * KB, 100 * fs); const a = charges(false), b = charges(true); rows.push([a, b]); console.log(`frame ${f}: charges per molecule DSF ${((a / N) * KCAL).toFixed(3)}, Ewald ${((b / N) * KCAL).toFixed(3)} kcal/mol`); }
  const diff = rows.map(([a, b]) => ((a - b) / N) * KCAL), mean = diff.reduce((s, v) => s + v, 0) / diff.length;
  writeFileSync(path.join(DIR, `check_${args[0]}.json`), JSON.stringify({ model: args[0], N, L, rc, alpha: m.alpha, T, frames: rows.map(([a, b]) => ({ dsf: (a / N) * KCAL, ewald: (b / N) * KCAL })), mean }));
  console.log(`DSF − Ewald: ${mean.toFixed(3)} kcal/mol a molecule (frames ${diff.map((v) => v.toFixed(3)).join(", ")})`);
} else if (cmd === "probe") {
  /* a probe round: the liquid of the current field (round 0 the book's; round r the field refitted on rounds before r),
     run as a small slab at two temperatures, pairs of neighbouring molecules picked from its frames, Hartree–Fock on
     each (tools/forcefield.mjs hpoint, four at a time, cached), the field's error on them printed before any refit sees
     them (the honest test), then the field refitted on every round so far */
  const key = args[0], round = +args[1], n = +(args[2] || 96), d = key === "w3" ? 3 : 4, fieldFile = path.join(DIR, `field_${key}.json`);
  const fields = existsSync(fieldFile) ? JSON.parse(readFileSync(fieldFile, "utf8")) : { rounds: [] };
  const p = round === 0 ? FORCEFIELDS[d].p : fields.rounds.find((r) => r.round === round - 1)?.next;
  if (!p) throw new Error(`no field for round ${round}: run round ${round - 1} first`);
  const pairFile = path.join(DIR, `probe_${key}_${round}.json`), Ts = d === 3 ? [300, 450] : [450, 750];
  if (!existsSync(pairFile)) {
    const picked = [], rnd = (() => { let s = 97 + round; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (const T of Ts) {
      // the field's own liquid: a short Gibbs run, frames of the denser box every 40 cycles after the first 120
      const m = model(key, p), g = gibbsOf(m, 3 + round + T), kT = T * KB, per = Math.ceil(n / (Ts.length * 6)), ns = m.kind.sites.length;
      for (let c = 1; c <= 360; c++) {
        g.cycle(kT, 40); if (c <= 120 && c % 10 === 0) g.tune();
        if (c <= 120 || c % 40) continue;
        const li = g.density(0) >= g.density(1) ? 0 : 1, B = g.box[li], L = B.L;
        console.log(`${key} round ${round}, T ${T}: cycle ${c}, liquid ${B.mols.length} at ${g.density(li).toExponential(3)}, U ${((B.E / B.mols.length) * KCAL).toFixed(2)} kcal/mol a molecule`);
        for (let t = 0; t < per; t++) {
          const A = B.mols[Math.floor(rnd() * B.mols.length)], XA = g.sites(A), img = (v) => v - L * Math.round(v / L), near = [];
          for (const M of B.mols) if (M !== A) near.push([Math.hypot(...M.c.map((v, k) => img(v - A.c[k]))), M]);
          near.sort((u, v) => u[0] - v[0]); const M = near[Math.floor(rnd() ** 1.5 * 10)][1], sh = M.c.map((v, k) => img(v - A.c[k]) - (v - A.c[k])), XB = g.sites(M).map((x) => x.map((v, k) => v + sh[k]));
          const rel = (X) => X.map((x, s) => ({ Z: s ? 1 : m.Z, at: x.map((v, k) => +(v - A.c[k]).toFixed(6)) }));
          picked.push([rel(XA), rel(XB)]);
        }
      }
    }
    writeFileSync(pairFile, JSON.stringify(picked.slice(0, n)));
  }
  const pairs = JSON.parse(readFileSync(pairFile, "utf8")), { spawn } = await import("node:child_process"), ffTool = path.join(here, "forcefield.mjs");
  const one = (i) => { const cf = path.join(DIR, `hf_${key}_${round}_${i}.json`); if (existsSync(cf)) return Promise.resolve(JSON.parse(readFileSync(cf, "utf8")));
    return new Promise((ok, fail) => { const pr = spawn(process.execPath, ["--max-old-space-size=6000", ffTool, "hpoint", pairFile, String(i), String(d)]); let out = ""; pr.stdout.on("data", (b) => (out += b)); pr.stderr.on("data", (b) => process.stderr.write(b)); pr.on("close", (c) => { if (c) return fail(new Error("hpoint " + i)); const r = JSON.parse(out.trim().split("\n").pop()); writeFileSync(cf, JSON.stringify(r)); ok(r); }); }); };
  const pts = new Array(pairs.length); let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < pairs.length) { const i = next++; pts[i] = await one(i); if (i % 8 === 0) console.log(`pair ${i}: HF ${(pts[i].E * KCAL).toFixed(2)} kcal/mol`); } }));
  const { modelEnergy } = await import("../js/ffmodel.js"), { fit, bornMayer, logitB } = await import("./fitff.mjs");
  const rows = pts.map((r, i) => ({ k: 20000 + 1000 * round + i, A: r.A, B: r.B, E: r.E, ok: r.ok })), use = rows.filter((r) => r.ok && r.E < 40 / KCAL);
  const errs = use.map((r) => (modelEnergy(p, r.A, r.B) - r.E) * KCAL), sumHF = use.reduce((t, r) => t + r.E, 0) * KCAL, sumM = use.reduce((t, r) => t + modelEnergy(p, r.A, r.B), 0) * KCAL;
  const test = { round, n: use.length, rms: Math.sqrt(errs.reduce((t, e) => t + e * e, 0) / errs.length), bias: errs.reduce((t, e) => t + e, 0) / errs.length, sumHF, sumModel: sumM, maxHF: Math.max(...use.map((r) => r.E * KCAL)), minHF: Math.min(...use.map((r) => r.E * KCAL)) };
  console.log(`round ${round}, the field before seeing these pairs: rms ${test.rms.toFixed(2)}, bias ${test.bias.toFixed(2)} kcal/mol over ${test.n} pairs; their sum HF ${sumHF.toFixed(1)}, field ${sumM.toFixed(1)} kcal/mol`);
  // refit on every round so far, the exponents held at Born–Mayer's as the book's fit holds them
  const all = []; for (let r = 0; r <= round; r++) for (let i = 0; existsSync(path.join(DIR, `hf_${key}_${r}_${i}.json`)); i++) { const h = JSON.parse(readFileSync(path.join(DIR, `hf_${key}_${r}_${i}.json`), "utf8")); all.push({ ...h, k: 20000 + 1000 * r + i }); }
  const Z = FORCEFIELDS[d].Z, start = [...p]; start[2] = logitB(bornMayer(d, Z, Z)); start[5] = logitB(bornMayer(d, Z, 1)); start[7] = logitB(bornMayer(d, 1, 1));
  const res = fit(String(d), start, [true, true, false, true, true, false, true, false], { extra: all, wExtra: 1 });
  const errAll = all.filter((r) => r.ok && r.E < 40 / KCAL).map((r) => (modelEnergy(res.p, r.A, r.B) - r.E) * KCAL);
  test.next = res.p; test.fitRms = res.rms * KCAL; test.liquidRms = Math.sqrt(errAll.reduce((t, e) => t + e * e, 0) / errAll.length);
  console.log(`refit on rounds 0–${round} (${all.length} liquid pairs): the book's pairs rms ${test.fitRms.toFixed(2)}, the liquid's ${test.liquidRms.toFixed(2)} kcal/mol; field`, res.p.map((v) => +v.toFixed(4)).join(" "));
  fields.rounds = fields.rounds.filter((r) => r.round !== round).concat([test]).sort((a, b) => a.round - b.round);
  writeFileSync(fieldFile, JSON.stringify(fields));
  const out = { ...LIQFF }; out[d] = { d, Z, R: FORCEFIELDS[d].R, param: FORCEFIELDS[d].param, p: res.p.map((v) => +v.toPrecision(10)), rounds: fields.rounds.map(({ next: _n, ...r }) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(3) : v]))) };
  writeFileSync(path.join(here, "../js/liquidff.js"), `/* Generated by tools/liquid.mjs probe; do not edit. Per world, the rigid H₂X force field refitted with pairs taken from
   its own liquid (Hartree–Fock on each), round by round, and each round's test: the field's error on that round's pairs
   before it saw them (rms, bias, the pairs' summed energy by Hartree–Fock and by the field), kcal/mol. */
export const LIQUIDFF = ${JSON.stringify(out)};
`);
} else if (cmd === "bake") {
  /* every run: the blocks' mean liquid and vapour densities (molecules per bohr^d) and their errors (block spread / √n);
     per model, the critical point as the coexist bake fits it (ρ_l − ρ_v ∝ (Tc − T)^β, β 0.326 in 3D, ½ in 4D, the
     other tried too; ρ_c by the rectilinear diameter) from points that clearly split, the vapour's pressure as an ideal
     gas, ln(ρ_v T) against 1/T (Clausius–Clapeyron), and a boiling point by corresponding states: where the vapour
     reaches the share of the critical density our water's has at its boiling point (0.598 / 322 kg/m³) */
  const runs = readdirSync(DIR).filter((f) => /^(spce|w3L?|x4L?)_[\d.]+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")));
  const out = {}, kgm3 = (m, r) => (r * m * 1.66053907e-27) / 5.29177211e-11 ** 3, line = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n, sxy = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((t, x) => t + (x - mx) ** 2, 0); return [sxy / sxx, my - (sxy / sxx) * mx]; };
  const stat = (v) => { const n = v.length, m = v.reduce((a, b) => a + b, 0) / n; return [m, n > 1 ? Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / (n - 1) / n) : NaN]; };
  for (const r of runs) { if (r.blocks.length < 3) continue; const [l, el] = stat(r.blocks.map((b) => b.l)), [v, ev] = stat(r.blocks.map((b) => b.v)), [u] = stat(r.blocks.map((b) => b.el));
    (out[r.model] ??= { d: r.d, mass: r.mass, points: [] }).points.push({ T: r.T, cycles: r.cycle, blocks: r.blocks.length, l, v, el, ev, ul: u * KCAL }); }
  const RATIO = 0.598 / 322;
  for (const [k, M] of Object.entries(out)) {
    M.points.sort((a, b) => a.T - b.T); const used = M.points.filter((p) => (p.l - p.v) / (p.l + p.v) > 0.3);
    M.used = used.map((p) => p.T);
    if (used.length >= 2) {
      const fit = (beta) => { const [a, b] = line(used.map((p) => p.T), used.map((p) => (p.l - p.v) ** (1 / beta))); return -b / a; }, own = M.d === 3 ? 0.326 : 0.5, other = M.d === 3 ? 0.5 : 0.326;
      M.Tc = fit(own); M.TcOther = fit(other); const [ad, bd] = line(used.map((p) => p.T), used.map((p) => (p.l + p.v) / 2)); M.rhoc = ad * M.Tc + bd;
      const vap = used.filter((p) => p.v > 0), [cs, ci] = vap.length >= 2 ? line(vap.map((p) => 1 / p.T), vap.map((p) => Math.log(p.v * p.T))) : [NaN, NaN];
      M.cc = [cs, ci]; // the boiling point: ln(RATIO ρ_c T) = ci + cs/T, by iteration
      let T = 0.6 * M.Tc; for (let it = 0; it < 50; it++) T = cs / (Math.log(RATIO * M.rhoc * T) - ci); M.Tb = T;
      M.hvap = -cs * KB * KCAL; // kcal/mol, from the slope (ideal vapour)
    }
    if (M.d === 3) for (const p of M.points) { p.lkg = kgm3(M.mass, p.l); p.vkg = kgm3(M.mass, p.v); }
    console.log(k, M.points.map((p) => `${p.T} K: ${p.l.toExponential(3)}/${p.v.toExponential(3)}${p.lkg ? ` (${p.lkg.toFixed(0)}/${p.vkg.toFixed(1)} kg/m³)` : ""} U ${p.ul.toFixed(2)}`).join("; "));
    if (M.Tc) console.log(`  Tc ${M.Tc.toFixed(0)} K (other β ${M.TcOther.toFixed(0)}), ρc ${M.rhoc.toExponential(3)}${M.d === 3 ? ` = ${kgm3(M.mass, M.rhoc).toFixed(0)} kg/m³` : ""}, boils (corresponding states) ${M.Tb.toFixed(0)} K, ΔH_vap ${M.hvap.toFixed(1)} kcal/mol; used ${M.used.join(", ")}`);
  }
  // the calibration: our water's real critical point over the recipe's, applied to Xater's
  for (const [x, w] of [["x4", "w3"], ["x4L", "w3L"]]) if (out[x]?.Tc && out[w]?.Tc) { const f = 647.1 / out[w].Tc; out[x].cal = { from: w, f, Tc: out[x].Tc * f, Tb: out[x].Tb * f }; console.log(`${x} calibrated by ${w} (×${f.toFixed(2)}): Tc ${out[x].cal.Tc.toFixed(0)} K, boils ${out[x].cal.Tb.toFixed(0)} K`); }
  const checks = Object.fromEntries(readdirSync(DIR).filter((f) => f.startsWith("check_")).map((f) => { const c = JSON.parse(readFileSync(path.join(DIR, f), "utf8")); return [c.model, c]; }));
  writeFileSync(path.join(here, "../js/liquiddata.js"), `/* Generated by tools/liquid.mjs bake from the Gibbs-ensemble runs; do not edit. Per model: dimension, molecular mass,
   each temperature's liquid and vapour densities (molecules per bohr^d) with errors and the liquid's energy (kcal/mol);
   fitted: Tc (K), with the other exponent, ρc, the Clausius–Clapeyron line [slope, intercept] of ln(ρ_v T) on 1/T,
   the corresponding-states boiling point Tb, ΔH_vap; Xater's calibration by our water's real 647.1 K; and the
   truncated-charge checks (kcal/mol a molecule, damped shifted force against Ewald). */
export const LIQUID = ${JSON.stringify(out)};
export const LIQUIDCHECK = ${JSON.stringify(checks)};
`);
} else {
  console.error("usage: liquid.mjs run <spce|w3|x4|w3L|x4L> <T K> [--steps=S] [--minutes=M] | check <model> [T] | probe <w3|x4> <round> [n] | bake"); process.exit(1);
}
