/* Liquid and vapour side by side, by Gibbs-ensemble Monte Carlo (Panagiotopoulos 1987): two periodic boxes that
   trade volume and atoms but never touch, so there's no surface between them to simulate. At a temperature below
   the critical point one box ends up liquid and the other vapour, and their densities are the coexisting ones.
   Built to run on the compute runner (.github/compute/), one temperature per command, resumable from its file.
     node four/atom/tools/coexist.mjs <system> <T> [--n=N] [--cycles=C] [--minutes=M] [--seed=S]
     node four/atom/tools/coexist.mjs bake      # the finished runs, and each system's critical point, into js/coexist.js
   systems: lj3 (Lennard-Jones in 3D, the known answer: critical point 1.31 ε/k), lj4 (Lennard-Jones in 4D),
            ne, ar, kr (our noble gases, the computed pairs) and ie, oe, bg (4D's elements 2, 12 and 22).
   T is in units of the pair's well depth ε/k (the computed well as computed: divide every kelvin by 1.8 for the
   other end of the forces chapter's range). Lengths are in bohr (σ for lj).
   Each box is cut off at half its side, and the rest of the pull is added as if the fluid were uniform beyond it,
   ½ρ ∫ u dV, which is right where the fluid has no structure left: the 4D pull reaches far, so the boxes are big.
   Output: $TMPDIR/atom4-coexist/<system>_<T>_n<N>.json, the densities of the two boxes every cycle, block-averaged. */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "../js/gas.js";

const KB = 3.166811563e-6;
const arg = (k, def) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? +a.split("=")[1] : def; };
/* bake: every finished run in $TMPDIR/atom4-coexist into js/coexist.js, with each system's critical point fitted.
   Below Tc the gap closes as ρ_l − ρ_v ∝ (Tc − T)^β: β = 0.326 in 3D (Ising), and in 4D mean field's 1/2 — for these
   atoms' long-range −B/r⁵ tail (σ = 1) because the upper critical dimension is 2σ = 2 (Fisher, Ma and Nickel), not
   because 4D is short-range forces' upper critical dimension, as this said before the audit. Both are tried, and the spread is part of the answer.
   Used: points whose boxes clearly split (gap ≥ 0.3 in ρR^d) and whose vapour rises with temperature (a vapour
   denser than at the next warmer point means the "liquid" box froze, and Gibbs swaps into a solid can't be trusted).
   ρ_c from the mean of the two densities, a straight line in T (the rectilinear diameter). */
if (process.argv[2] === "bake") {
  /* (after the independent audit, F04) each run is re-summarized from its stored densities: the second half in ten
     blocks, the liquid being the denser box of each block's means (sorting every cycle opened a gap from fluctuations
     alone near the critical point); runs of one system, temperature and size with different seeds are pooled, the
     error then the seeds' spread; Tc's error is a bootstrap over the seeds (each temperature's run drawn at random) */
  const { readdirSync } = await import("node:fs"), dir = path.join(tmpdir(), "atom4-coexist"), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, sem = (v) => (v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean(v)) ** 2, 0) / (v.length - 1) / v.length) : 0);
  const summ = (r) => { const n = r.rho[0].length, from = Math.floor(n / 2), k = 10, m = Math.floor((n - from) / k), L = [], V = [], Rd = r.R ** r.d;
    for (let j = 0; j < k; j++) { const a = mean(r.rho[0].slice(from + j * m, from + (j + 1) * m)), b = mean(r.rho[1].slice(from + j * m, from + (j + 1) * m)); L.push(Math.max(a, b) * Rd); V.push(Math.min(a, b) * Rd); }
    return { l: mean(L), el: sem(L), v: mean(V), ev: sem(V) }; };
  const all = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => { const r = JSON.parse(readFileSync(path.join(dir, f), "utf8")); return { ...r, s: summ(r), seedIx: +(f.match(/_s(\d+)\.json$/)?.[1] ?? 0) }; });
  const out = {}, groups = {};
  for (const r of all) (groups[`${r.sys}@${r.T}@${r.N}`] ??= []).push(r);
  const pool = (rs) => rs.length > 1 ? { l: mean(rs.map((r) => r.s.l)), el: Math.max(sem(rs.map((r) => r.s.l)), mean(rs.map((r) => r.s.el)) / Math.sqrt(rs.length)), v: mean(rs.map((r) => r.s.v)), ev: Math.max(sem(rs.map((r) => r.s.v)), mean(rs.map((r) => r.s.ev)) / Math.sqrt(rs.length)) } : { ...rs[0].s };
  const byT = {}; for (const [k, rs] of Object.entries(groups)) { const [sys, T] = k.split("@"), key = `${sys}@${T}`; if (!byT[key] || byT[key].length < rs.length || (byT[key].length === rs.length && byT[key][0].N < rs[0].N)) byT[key] = rs; } // the size with the most seeds (the other sizes are the size check)
  for (const rs of Object.values(byT)) { const r = rs[0], P = pool(rs); (out[r.sys] ??= { d: r.d, epsK: r.epsK, R: r.R, points: [] }).points.push({ T: r.T, N: r.N, seeds: rs.length, cycles: Math.min(...rs.map((q) => q.rho[0].length)), l: +P.l.toFixed(4), v: +P.v.toFixed(4), el: +P.el.toFixed(4), ev: +P.ev.toFixed(4), runs: rs }); }
  // the box-size checks: one temperature at two sizes
  for (const [key, rs] of Object.entries(byT)) { const [sys, T] = key.split("@"), sizes = Object.entries(groups).filter(([k]) => k.startsWith(key + "@")); if (sizes.length > 1) (out[sys].sizes ??= []).push({ T: +T, runs: sizes.map(([, q]) => { const P = pool(q); return { N: q[0].N, seeds: q.length, l: +P.l.toFixed(4), v: +P.v.toFixed(4) }; }) }); }
  const line = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n, sxy = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((t, x) => t + (x - mx) ** 2, 0); const a = sxy / sxx; return [a, my - a * mx]; };
  let sd = 12345; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (const s of Object.values(out)) {
    s.points.sort((a, b) => a.T - b.T);
    const used = s.points.filter((p, i) => p.l - p.v >= 0.3 && !(s.points[i + 1] && p.v > s.points[i + 1].v + 3 * (p.ev + s.points[i + 1].ev)));
    s.used = used.map((p) => p.T);
    const own = s.d === 3 ? 0.326 : 0.5, other = s.d === 3 ? 0.5 : 0.326, fit = (pts, beta) => { const [a, b] = line(pts.map((p) => p.T), pts.map((p) => Math.max(0, p.l - p.v) ** (1 / beta))); return -b / a; };
    s.Tc = +fit(used, own).toFixed(3); s.TcOther = +fit(used, other).toFixed(3); s.beta = own; const [ad, bd] = line(used.map((p) => p.T), used.map((p) => (p.l + p.v) / 2)); s.rhoc = +(ad * s.Tc + bd).toFixed(3);
    s.dof = used.length - 2; s.seedsMin = Math.min(...used.map((p) => p.seeds));
    if (s.seedsMin > 1) { const tcs = []; for (let b = 0; b < 400; b++) { const pts = used.map((p) => { const q = p.runs[Math.floor(rnd() * p.runs.length)].s; return { T: p.T, l: q.l, v: q.v }; }); tcs.push(fit(pts, own)); } s.TcErr = +Math.sqrt(tcs.reduce((a, x) => a + (x - mean(tcs)) ** 2, 0) / (tcs.length - 1)).toFixed(3); }
    s.lastSplit = Math.max(...used.map((p) => p.T)); s.firstUnsplit = s.points.find((p) => p.T > s.lastSplit && p.l - p.v < 0.3)?.T ?? null;
    for (const p of s.points) delete p.runs;
  }
  writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/coexist.js"), `/* Generated by tools/coexist.mjs bake from the Gibbs-ensemble runs on the compute runner; do not edit. Per system:
   dimension, the pair's well depth in kelvin (for the computed pairs, as computed: ÷1.8 for the other end of the range),
   its distance R (bohr; σ·2^(1/6) for Lennard-Jones), and the runs: temperature T in ε/k, atoms N, seeds pooled, cycles,
   and the two boxes' densities × R^d with their errors (liquid the denser box of each block's means; with several seeds
   the error is their spread). Fitted: Tc (ε/k) with the dimension's own exponent β and with the other one, its
   bootstrap error over seeds where every point has several (TcErr), the fit's residual degrees of freedom (dof), ρ_c ×
   R^d, the points used, and the warmest that split and the coolest after it that didn't. */
export const COEXIST = ${JSON.stringify(out)};
`);
  for (const [k, s] of Object.entries(out)) console.log(k, "Tc", s.Tc, s.TcErr ? `± ${s.TcErr}` : "", "(other β", s.TcOther + ")", "ρc", s.rhoc, "used", s.used.join(","), `dof ${s.dof}, seeds ≥ ${s.seedsMin}`, s.epsK ? `→ ${(s.Tc * s.epsK / 1.8).toFixed(0)}–${(s.Tc * s.epsK).toFixed(0)} K` : "");
  process.exit(0);
}
const sys = process.argv[2], Tred = +process.argv[3];
if (!sys || !(Tred > 0)) { console.error("usage: coexist.mjs <lj3|lj4|ne|ar|kr|ie|oe|bg> <T in ε/k> [--n=N] [--cycles=C]"); process.exit(1); }

/* the pair: u(r) in units of ε, a hard core inside rcore, and its tail −Σ a/rⁿ past rmax (also in ε) */
async function pair(sys) {
  if (sys === "lj3" || sys === "lj4") {
    const d = sys === "lj3" ? 3 : 4;
    return { d, u: (r) => 4 * (r ** -12 - r ** -6), rcore: 0.75, rmax: 3, tail: [{ a: 4, n: 6 }, { a: -4, n: 12 }], R: 2 ** (1 / 6) };
  }
  const which = { ne: [3, 10], ar: [3, 18], kr: [3, 36], ie: [4, 2], oe: [4, 12], bg: [4, 22] }[sys];
  if (!which) throw new Error(`unknown system ${sys}`);
  const FF = await import("../js/forces.js"), { PAIRS, RS } = await import("../js/pairs.js"), { TABLE } = await import("../js/table.js"), { RESPONSE } = await import("../js/response.js");
  const P = G.noblePotential(which[0], which[1], { FF, PAIRS, RS, TABLE, RESPONSE }), eps = -P.well.E;
  return { d: which[0], u: (r) => P.u(r) / eps, rcore: P.opt.rmin, rmax: P.opt.rmax, tail: P.opt.tail.map((t) => ({ a: t.a / eps, n: t.n })), R: P.well.R, epsK: eps / KB };
}
const PR = await pair(sys), d = PR.d, S = G.sphereArea(d), beta = 1 / Tred;
const U = (r) => (r <= PR.rmax ? PR.u(r) : -PR.tail.reduce((s, { a, n }) => s + a / r ** n, 0));
/* u on a grid in r², for the inner loop; ∫_rc^∞ u r^(d−1) dr for the tail, numerically to rmax and exactly past it */
const R2MAX = 4e4, NG = 400000, DG = R2MAX / NG, UG = new Float64Array(NG + 2);
for (let i = 0; i <= NG + 1; i++) { const r = Math.sqrt(i * DG); UG[i] = r < PR.rcore ? Infinity : U(r); }
const ug = (r2) => { const x = r2 / DG, i = x | 0; if (i >= NG) return U(Math.sqrt(r2)); const f = x - i; return UG[i] * (1 - f) + UG[i + 1] * f; };
function tailIntegral(rc) {
  let s = 0; const h = 0.002;
  for (let r = rc + h / 2; r < PR.rmax; r += h) s += U(r) * r ** (d - 1) * h;
  const from = Math.max(rc, PR.rmax);
  return s - PR.tail.reduce((t, { a, n }) => t + (a * from ** (d - n)) / (n - d), 0);
}
const tailE = (N, V) => { const L = V ** (1 / d); return ((N * N) / (2 * V)) * S * tailIntegral(L / 2); };

/* the state: two boxes, each N atoms in a cube of side L, coordinates in [0, L) */
const OUT = path.join(tmpdir(), "atom4-coexist"); mkdirSync(OUT, { recursive: true });

const SEED = arg("seed", 0); // independent repeats (after the audit): each its own file, _s<seed>
let seed = (Math.round(Tred * 1000) * 7919 + sys.length * 104729 + SEED * 15485863) | 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const Ntot = arg("n", d === 3 ? 500 : 800), CYCLES = arg("cycles", 20000);
const file = path.join(OUT, `${sys}_${Tred}_n${Ntot}${SEED ? `_s${SEED}` : ""}.json`);
let st;
if (existsSync(file)) { st = JSON.parse(readFileSync(file, "utf8")); seed = st.seed; }
else {
  // start both boxes at the same density, near the critical point's: 0.3 of the densest crystal's at the pair's
  // spacing (D_d: one point per 2s^d), where a uniform fluid is unstable and splits by itself
  const s = PR.R / Math.SQRT2, rho = 0.3 / (2 * s ** d), V = Ntot / 2 / rho, L = V ** (1 / d), boxes = [];
  for (let b = 0; b < 2; b++) {
    const x = [];
    while (x.length < Ntot / 2) { const p = Array.from({ length: d }, () => rnd() * L); if (x.every((q) => dist2(p, q, L) > (0.85 * PR.R) ** 2)) x.push(p); }
    boxes.push({ L, x });
  }
  st = { sys, d, T: Tred, epsK: PR.epsK ?? null, R: PR.R, N: Ntot, boxes, cycle: 0, rho: [[], []], acc: { move: [0, 0], vol: [0, 0], swap: [0, 0] }, seed };
}
function dist2(p, q, L) { let s = 0; for (let k = 0; k < d; k++) { let t = p[k] - q[k]; t -= L * Math.round(t / L); s += t * t; } return s; }
/* one atom's energy with the rest of its box, inside the cutoff */
function atomE(box, p, skip) {
  const L = box.L, rc2 = (L / 2) ** 2; let e = 0;
  for (let j = 0; j < box.x.length; j++) { if (j === skip) continue; const r2 = dist2(p, box.x[j], L); if (r2 < rc2) { const v = ug(r2); if (v === Infinity) return Infinity; e += v; } }
  return e;
}
function boxE(box) { let e = 0; for (let i = 0; i < box.x.length; i++) { const a = atomE(box, box.x[i], i); if (a === Infinity) return Infinity; e += a / 2; } return e + tailE(box.x.length, box.L ** d); }
let E = st.boxes.map(boxE);

const t0 = Date.now(), DEADLINE = arg("minutes", 320) * 60e3;
let step = st.boxes.map((b) => 0.15 * PR.R), dlnV = 0.05;
for (; st.cycle < CYCLES; st.cycle++) {
  const n = st.boxes[0].x.length + st.boxes[1].x.length;
  for (let m = 0; m < n; m++) {
    const r = rnd();
    if (r < 0.7) { // move an atom
      const b = st.boxes[0].x.length > rnd() * n ? 0 : 1, box = st.boxes[b]; if (!box.x.length) continue;
      const i = (rnd() * box.x.length) | 0, p = box.x[i], q = p.map((v) => { let w = v + (rnd() - 0.5) * 2 * step[b]; w -= box.L * Math.floor(w / box.L); return w; });
      const dE = atomE(box, q, i) - atomE(box, p, i); st.acc.move[1]++;
      if (dE < Infinity && (dE <= 0 || rnd() < Math.exp(-beta * dE))) { box.x[i] = q; E[b] += dE; st.acc.move[0]++; }
    } else { // trade an atom: take one from box a, put it at random in box b
      const a = rnd() < 0.5 ? 0 : 1, b = 1 - a, A = st.boxes[a], B = st.boxes[b]; if (!A.x.length) continue;
      const i = (rnd() * A.x.length) | 0, q = Array.from({ length: d }, () => rnd() * B.L), ins = atomE(B, q, -1); st.acc.swap[1]++;
      if (ins === Infinity) continue;
      const Va = A.L ** d, Vb = B.L ** d, Na = A.x.length, Nb = B.x.length;
      const dEa = -atomE(A, A.x[i], i) + tailE(Na - 1, Va) - tailE(Na, Va), dEb = ins + tailE(Nb + 1, Vb) - tailE(Nb, Vb);
      const accp = ((Na * Vb) / ((Nb + 1) * Va)) * Math.exp(-beta * (dEa + dEb));
      if (rnd() < accp) { A.x.splice(i, 1); B.x.push(q); E[a] += dEa; E[b] += dEb; st.acc.swap[0]++; }
    }
  }
  { // trade volume, once a cycle: a random walk in ln(V1/V2) at fixed total volume
    const [b1, b2] = st.boxes, V1 = b1.L ** d, V2 = b2.L ** d, Vt = V1 + V2, lr = Math.log(V1 / V2) + (rnd() - 0.5) * 2 * dlnV, V1n = (Vt * Math.exp(lr)) / (1 + Math.exp(lr)), V2n = Vt - V1n;
    const trial = [[b1, V1n], [b2, V2n]].map(([b, V]) => { const L = V ** (1 / d), f = L / b.L; return { L, x: b.x.map((p) => p.map((v) => v * f)) }; }), En = trial.map(boxE);
    const arg = -beta * (En[0] + En[1] - E[0] - E[1]) + (b1.x.length + 1) * Math.log(V1n / V1) + (b2.x.length + 1) * Math.log(V2n / V2); st.acc.vol[1]++;
    if (En.every((e) => e < Infinity) && Math.log(rnd()) < arg) { st.boxes = trial; E = En; st.acc.vol[0]++; }
  }
  if (st.cycle % 50 === 0) E = st.boxes.map(boxE); // drift
  // tune the steps toward 40% acceptance during the first fifth
  if (st.cycle < CYCLES / 5 && st.cycle % 20 === 19) { const f = st.acc.move[0] / Math.max(1, st.acc.move[1]), g = st.acc.vol[0] / Math.max(1, st.acc.vol[1]); step = step.map((s, b) => Math.min(st.boxes[b].L / 2, s * (f > 0.4 ? 1.1 : 0.9))); dlnV = Math.min(1, dlnV * (g > 0.4 ? 1.1 : 0.9)); }
  st.rho[0].push(+(st.boxes[0].x.length / st.boxes[0].L ** d).toExponential(5)); st.rho[1].push(+(st.boxes[1].x.length / st.boxes[1].L ** d).toExponential(5));
  if (st.cycle % 200 === 199 || Date.now() - t0 > DEADLINE) {
    st.seed = seed; summarize(); writeFileSync(file, JSON.stringify(st));
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${sys} T=${Tred} cycle ${st.cycle + 1}: N ${st.boxes.map((b) => b.x.length).join("/")}, ρ ${st.summary.rhoL.toExponential(3)} / ${st.summary.rhoV.toExponential(3)} (ρR^d: ${(st.summary.rhoL * PR.R ** d).toFixed(3)} / ${(st.summary.rhoV * PR.R ** d).toFixed(3)}), acc move ${(st.acc.move[0] / st.acc.move[1]).toFixed(2)} swap ${(st.acc.swap[0] / Math.max(1, st.acc.swap[1])).toFixed(4)} vol ${(st.acc.vol[0] / st.acc.vol[1]).toFixed(2)}`);
    if (Date.now() - t0 > DEADLINE) { st.cycle++; break; }
  }
}
/* the second half, in ten blocks: the denser box each cycle is the liquid (the boxes can trade roles) */
function summarize() {
  const n = st.rho[0].length, from = Math.floor(n / 2), hi = [], lo = [];
  for (let c = from; c < n; c++) { const a = st.rho[0][c], b = st.rho[1][c]; hi.push(Math.max(a, b)); lo.push(Math.min(a, b)); }
  const blocks = (v) => { const k = 10, m = Math.floor(v.length / k), means = Array.from({ length: k }, (_, j) => v.slice(j * m, (j + 1) * m).reduce((s, x) => s + x, 0) / Math.max(1, m)), mu = means.reduce((s, x) => s + x, 0) / k; return [mu, Math.sqrt(means.reduce((s, x) => s + (x - mu) ** 2, 0) / (k * (k - 1)))]; };
  const [rhoL, eL] = blocks(hi), [rhoV, eV] = blocks(lo);
  st.summary = { cycles: n, rhoL, eL, rhoV, eV, Rd: PR.R ** d };
}
st.seed = seed; summarize(); writeFileSync(file, JSON.stringify(st));
console.log("done:", JSON.stringify(st.summary));
