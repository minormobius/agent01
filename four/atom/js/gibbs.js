/* Liquid and vapour of rigid molecules by Gibbs-ensemble Monte Carlo (Panagiotopoulos 1987), in any number of
   dimensions, no DOM. Two periodic boxes that trade volume and molecules but never touch, so there is no surface to
   simulate: below the critical point one box ends up liquid, the other vapour, at the coexisting densities.

   Charges meet by Ewald's sum for the pinned 1/r in any d (js/md.js), every box its own: the real-space part over
   every site pair in the nearest image within rc = L/2, α = 2.6/rc, the reciprocal part over integer vectors with
   |nᵢ| ≤ 6, kept as each box's structure factor and updated move by move. A truncated sum won't do in 4D: a wave of
   polarization of wavenumber k costs ∝ 1/k (the 1/r kernel's transform goes as k⁻³), so a liquid's long-wavelength
   order, which a cutoff never sees, is strongly suppressed by the full sum (tools/liquid.mjs check). The short-range
   pairs are cut at the same rc, and the rest of the heavy atoms' pull is added as if the fluid were uniform past it,
   (N²/2V)∫u dV, which in 4D, where 1/r⁶ over r³ shells falls off only as 1/rc², is a large term.

   Opposite charges on different molecules also meet crystal.js's hard core, 0.01 (1.5/r)¹² hartree (under 10⁻⁶ of a
   hydrogen bond at its own distance): a force field's finite repulsion would otherwise let a Monte Carlo jump drop a
   hydrogen into another molecule's heavy atom, which molecular dynamics never reaches but a random move can.

   Moves: a molecule displaced or turned (in a random plane), a molecule moved from one box to the other, and a volume
   exchange in ln(V₁/V₂). Every acceptance is Metropolis's with Frenkel and Smit's factors. Atomic units. */
import { Ewald, shortPair, sphereArea, randomRotation } from "./md.js";

const SQPI = Math.sqrt(Math.PI);
/* erfc to a relative 1.2e-7 (Numerical Recipes' Chebyshev fit): md.js's series is exact and too slow for the inner loop.
   Every energy here uses this one, so the chain samples one Hamiltonian exactly. */
export function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/* kind: { sites: [{ q, t, at }] } (site 0 the heavy atom, the turning centre); pairs: { "a|b": term } */
export class Gibbs {
  constructor({ d, kind, pairs, N, V, seed = 1, A = 2.6, nmax = 6, core = [0.01, 1.5] }) {
    let s = seed >>> 0; this.rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.normal = () => Math.sqrt(-2 * Math.log(this.rnd() + 1e-300)) * Math.cos(2 * Math.PI * this.rnd());
    Object.assign(this, { d, kind, A, nmax, core, ns: kind.sites.length });
    this.q = kind.sites.map((x) => x.q); this.t = kind.sites.map((x) => x.t);
    this.pair = (a, b) => pairs[`${a}|${b}`] || pairs[`${b}|${a}`] || null;
    this.pp = this.t.map((a) => this.t.map((b) => this.pair(a, b)));
    this.tails = [...new Set(this.t)].flatMap((a, i, ts) => ts.slice(i).map((b) => ({ p: this.pair(a, b), n: this.t.filter((x) => x === a).length * this.t.filter((x) => x === b).length * (a === b ? 1 : 2) }))).filter((x) => x.p);
    // the molecule's own geometry: intramolecular distances for Ewald's exclusions
    this.intra = []; for (let i = 0; i < this.ns; i++) for (let j = i + 1; j < this.ns; j++) this.intra.push([i, j, Math.hypot(...kind.sites[i].at.map((x, k) => x - kind.sites[j].at[k]))]);
    // N molecules into the boxes: V[b] each, molecules on a lattice, turned at random
    this.box = V.map((v, b) => ({ L: Math.pow(v, 1 / d), mols: [] }));
    for (let b = 0; b < 2; b++) { const n = N[b], side = Math.ceil(Math.pow(n, 1 / d)), L = this.box[b].L;
      for (let a = 0; a < n; a++) { const c = []; let i = a; for (let k = 0; k < d; k++) { c.push(((i % side) + 0.5) * (L / side)); i = Math.floor(i / side); } this.box[b].mols.push(this.newMol(c)); } }
    this.step = [{ dx: 0.5, dth: 0.3 }, { dx: 2, dth: 0.6 }]; this.dlnV = 0.02;
    for (let b = 0; b < 2; b++) this.setup(b);
  }
  newMol(c) { const R = randomRotation(this.d, this.rnd); return { c: Float64Array.from(c), off: this.kind.sites.map((st) => Float64Array.from(R.map((row) => row.reduce((t, v, k) => t + v * st.at[k], 0)))) }; }
  sites(m) { return m.off.map((o) => o.map((v, k) => v + m.c[k])); }
  /* a box's Ewald parameters, k-vectors and structure factor, and its full energy */
  setup(b) {
    const B = this.box[b], { d } = this; B.rc = (B.L / 2) * 0.9999; B.al = this.A / B.rc; B.V = B.L ** d;
    B.ks = new Ewald(d, B.L, { alpha: B.al, rc: B.rc, nmax: this.nmax }).ks;
    const nk = B.ks.length; B.kx = new Float64Array(nk * d); B.w = new Float64Array(nk); B.ks.forEach((k, i) => { B.w[i] = k.w; for (let a = 0; a < d; a++) B.kx[i * d + a] = k.kv[a]; });
    B.Sr = new Float64Array(nk); B.Si = new Float64Array(nk);
    for (const m of B.mols) this.addS(B, this.sites(m), 1);
    // each molecule's own Ewald constant: its charges' meetings with themselves and within the molecule, taken out
    B.u0 = -(B.al / SQPI) * this.q.reduce((t, x) => t + x * x, 0) - this.intra.reduce((t, [i, j, r]) => t + (this.q[i] * this.q[j] * (1 - erfc(B.al * r))) / r, 0);
    B.tail = this.tailPerN2(B);
    B.E = this.full(b);
  }
  /* the uniform tail of the short-range pairs past rc, per N²/V: ½ Σ n_ab ∫_rc^∞ u S_d r^(d−1) dr */
  tailPerN2(B) { const { d } = this, S = sphereArea(d); let t = 0;
    for (const { p, n } of this.tails) { const M = 400, lo = Math.log(B.rc), hi = Math.log(B.rc * 200), h = (hi - lo) / M; let I = 0; for (let i = 0; i <= M; i++) { const r = Math.exp(lo + i * h); I += (i === 0 || i === M ? 0.5 : 1) * shortPair(p, r * r)[0] * r ** d; } t += 0.5 * n * S * I * h; }
    return t; }
  addS(B, X, sign) { const { d } = this, nk = B.w.length; for (let s = 0; s < X.length; s++) { const qs = sign * this.q[s]; if (!qs) continue; const x = X[s]; for (let k = 0; k < nk; k++) { let ph = 0; for (let a = 0; a < d; a++) ph += B.kx[k * d + a] * x[a]; B.Sr[k] += qs * Math.cos(ph); B.Si[k] += qs * Math.sin(ph); } } }
  /* the reciprocal energy's change if sites Xold leave and Xnew arrive (either may be null), and the change to S */
  dRec(B, Xold, Xnew) {
    const { d } = this, nk = B.w.length, dr = new Float64Array(nk), di = new Float64Array(nk); let dE = 0;
    for (const [X, sg] of [[Xold, -1], [Xnew, 1]]) { if (!X) continue; for (let s = 0; s < X.length; s++) { const qs = sg * this.q[s]; if (!qs) continue; const x = X[s]; for (let k = 0; k < nk; k++) { let ph = 0; for (let a = 0; a < d; a++) ph += B.kx[k * d + a] * x[a]; dr[k] += qs * Math.cos(ph); di[k] += qs * Math.sin(ph); } } }
    for (let k = 0; k < nk; k++) { const sr = B.Sr[k] + dr[k], si = B.Si[k] + di[k]; dE += B.w[k] * (sr * sr + si * si - B.Sr[k] * B.Sr[k] - B.Si[k] * B.Si[k]); }
    return { dE, dr, di };
  }
  /* one molecule's real-space energy (sites X) with every other molecule of the box but skip */
  realOne(B, X, skip) {
    const { d, ns, q, core } = this, rc2 = B.rc * B.rc, L = B.L, al = B.al; let E = 0;
    for (const m of B.mols) { if (m === skip) continue; const Y = this.sites(m);
      for (let i = 0; i < ns; i++) for (let j = 0; j < ns; j++) { let r2 = 0; for (let a = 0; a < d; a++) { let v = X[i][a] - Y[j][a]; v -= L * Math.round(v / L); r2 += v * v; } if (r2 >= rc2) continue;
        const p = this.pp[i][j]; if (p) E += shortPair(p, r2)[0]; if (q[i] && q[j]) { const r = Math.sqrt(r2); E += (q[i] * q[j] * erfc(al * r)) / r; if (core && q[i] * q[j] < 0) E += core[0] * (core[1] * core[1] / r2) ** 6; } } }
    return E;
  }
  rec(B) { let E = 0; for (let k = 0; k < B.w.length; k++) E += B.w[k] * (B.Sr[k] * B.Sr[k] + B.Si[k] * B.Si[k]); return E; }
  full(b) { const B = this.box[b], n = B.mols.length; let Er = 0; B.mols.forEach((m, i) => { Er += 0.5 * this.realOne(B, this.sites(m), m); }); return Er + this.rec(B) + n * B.u0 + (B.tail * n * n) / B.V; }
  /* moves */
  displace(b) {
    const B = this.box[b], n = B.mols.length; if (!n) return false; const m = B.mols[Math.floor(this.rnd() * n)], { d } = this, st = this.step[b], turn = this.rnd() < 0.5;
    const old = this.sites(m), nm = { c: m.c.slice(), off: m.off.map((o) => o.slice()) };
    if (!turn) for (let a = 0; a < d; a++) nm.c[a] += (2 * this.rnd() - 1) * st.dx;
    else { // a turn by up to dth in a random plane through the heavy atom
      const u = Array.from({ length: d }, this.normal), nu = Math.hypot(...u); for (let a = 0; a < d; a++) u[a] /= nu;
      let v = Array.from({ length: d }, this.normal); const uv = v.reduce((t, x, a) => t + x * u[a], 0); v = v.map((x, a) => x - uv * u[a]); const nv = Math.hypot(...v); v = v.map((x) => x / nv);
      const th = (2 * this.rnd() - 1) * st.dth, c = Math.cos(th) - 1, s = Math.sin(th);
      nm.off = m.off.map((o) => { const pu = o.reduce((t, x, a) => t + x * u[a], 0), pv = o.reduce((t, x, a) => t + x * v[a], 0); return Float64Array.from(o, (x, a) => x + c * (pu * u[a] + pv * v[a]) + s * (pu * v[a] - pv * u[a])); });
    }
    const nw = this.sites(nm), dReal = this.realOne(B, nw, m) - this.realOne(B, old, m), R = this.dRec(B, old, nw), dE = dReal + R.dE;
    const key = turn ? "nt" : "nx"; st[key] = (st[key] || 0) + 1;
    if (dE <= 0 || this.rnd() < Math.exp(-dE / this.kT)) { m.c = nm.c; m.off = nm.off; for (let k = 0; k < R.dr.length; k++) { B.Sr[k] += R.dr[k]; B.Si[k] += R.di[k]; } B.E += dE; st[turn ? "at" : "ax"] = (st[turn ? "at" : "ax"] || 0) + 1; return true; }
    return false;
  }
  transfer() {
    const from = this.rnd() < 0.5 ? 0 : 1, to = 1 - from, A = this.box[from], B = this.box[to], nA = A.mols.length, nB = B.mols.length; if (!nA) return false;
    const m = A.mols[Math.floor(this.rnd() * nA)], old = this.sites(m), c = Array.from({ length: this.d }, () => this.rnd() * B.L), nm = this.newMol(c), nw = this.sites(nm);
    const RA = this.dRec(A, old, null), RB = this.dRec(B, null, nw);
    const dA = -this.realOne(A, old, m) + RA.dE - A.u0 + (A.tail * ((nA - 1) ** 2 - nA * nA)) / A.V;
    const dB = this.realOne(B, nw, null) + RB.dE + B.u0 + (B.tail * ((nB + 1) ** 2 - nB * nB)) / B.V;
    this.tries = (this.tries || 0) + 1;
    const acc = ((nA * B.V) / ((nB + 1) * A.V)) * Math.exp(-(dA + dB) / this.kT);
    if (this.rnd() < acc) { A.mols.splice(A.mols.indexOf(m), 1); B.mols.push(nm); for (let k = 0; k < RA.dr.length; k++) { A.Sr[k] += RA.dr[k]; A.Si[k] += RA.di[k]; } for (let k = 0; k < RB.dr.length; k++) { B.Sr[k] += RB.dr[k]; B.Si[k] += RB.di[k]; } A.E += dA; B.E += dB; this.moved = (this.moved || 0) + 1; return true; }
    return false;
  }
  volume() {
    const [A, B] = this.box, Vt = A.V + B.V, lr = Math.log(A.V / B.V) + (2 * this.rnd() - 1) * this.dlnV, VA = (Vt * Math.exp(lr)) / (1 + Math.exp(lr)), VB = Vt - VA;
    const save = this.box.map((X) => ({ L: X.L, cs: X.mols.map((m) => m.c.slice()), E: X.E, state: { rc: X.rc, al: X.al, V: X.V, ks: X.ks, kx: X.kx, w: X.w, Sr: X.Sr, Si: X.Si, u0: X.u0, tail: X.tail } }));
    const E0 = A.E + B.E, nA = A.mols.length, nB = B.mols.length;
    [VA, VB].forEach((V, b) => { const X = this.box[b], f = Math.pow(V / X.V, 1 / this.d); X.L *= f; for (const m of X.mols) for (let a = 0; a < this.d; a++) m.c[a] *= f; this.setup(b); });
    const dE = A.E + B.E - E0, arg = -dE / this.kT + (nA + 1) * Math.log(VA / save[0].state.V) + (nB + 1) * Math.log(VB / save[1].state.V);
    this.vtries = (this.vtries || 0) + 1;
    if (arg >= 0 || this.rnd() < Math.exp(arg)) { this.vacc = (this.vacc || 0) + 1; return true; }
    save.forEach((sv, b) => { const X = this.box[b]; X.L = sv.L; X.mols.forEach((m, i) => (m.c = sv.cs[i])); Object.assign(X, sv.state); X.E = sv.E; });
    return false;
  }
  /* a cycle: as many displacements and turns as molecules, ntr transfer attempts, one volume move (none with
     volume: false and ntr 0, which melts each box as it stands) */
  cycle(kT, ntr, { volume = true } = {}) {
    this.kT = kT; const N = this.box[0].mols.length + this.box[1].mols.length, nv = volume ? 1 : 0, moves = N + ntr + nv;
    for (let k = 0; k < moves; k++) { const r = this.rnd() * moves; if (r < nv) this.volume(); else if (r < nv + ntr) this.transfer(); else this.displace(this.rnd() * N < this.box[0].mols.length ? 0 : 1); }
  }
  /* steps towards 40% acceptance for each box's displacements and turns (use in equilibration only) */
  tune() {
    for (const st of this.step) { for (const [n, a, k, lo, hi] of [["nx", "ax", "dx", 0.05, 8], ["nt", "at", "dth", 0.05, Math.PI]]) { if (!st[n] || st[n] < 50) continue; const r = st[a] / st[n]; st[k] = Math.min(hi, Math.max(lo, st[k] * (r > 0.4 ? 1.1 : 0.9))); st[n] = st[a] = 0; } }
    if (this.vtries >= 20) { const r = this.vacc / this.vtries; this.dlnV = Math.min(0.5, Math.max(0.002, this.dlnV * (r > 0.4 ? 1.1 : 0.9))); this.vtries = this.vacc = 0; }
  }
  check(b) { const B = this.box[b], E = B.E; this.setup(b); return E - B.E; }
  density(b) { return this.box[b].mols.length / this.box[b].V; }
  /* the state, to save and resume */
  dump() { return { box: this.box.map((B) => ({ L: B.L, mols: B.mols.map((m) => ({ c: Array.from(m.c), off: m.off.map((o) => Array.from(o)) })) })), step: this.step, dlnV: this.dlnV }; }
  load(st) { st.box.forEach((sb, b) => { const B = this.box[b]; B.L = sb.L; B.mols = sb.mols.map((m) => ({ c: Float64Array.from(m.c), off: m.off.map((o) => Float64Array.from(o)) })); this.setup(b); }); this.step = st.step; this.dlnV = st.dlnV; }
}
