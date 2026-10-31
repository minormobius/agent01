/* The full search for two molecules' best arrangement. Chapter 10's census optimized each hydrogen-bonded pair over
   two numbers (distance and one tilt) in one family of arrangements; a liquid run found Xater pairs bound more
   strongly than that "optimum". Here every relative pose is open: the second molecule turned by exp(Ω) (Ω
   antisymmetric: 3 numbers in 3D, 6 in 4D) and moved by t (d numbers).
     node four/atom/tools/pairsearch.mjs <key> [rounds]   # key as in tools/forcefield.mjs: 3, 4, 4.9; relaxing steps = 8 × rounds (3)
   1. Thousands of random starts minimized on the fitted force field (js/forcefields.js), which is cheap; the
      distinct minima kept.
   2. The best few, and the census's own pair and the strongest pair a liquid run produced, scored by Hartree–Fock
      (the census's pair energy, counterpoise-corrected).
   3. The best two relaxed under Hartree–Fock, every pose number at once (hfDescend: quasi-Newton, off saddles).
   Hartree–Fock energies are cached in the temp dir, so a run cut short resumes. */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms, dimerAtoms, pairEnergy } from "./census.mjs";
import { modelEnergy } from "../js/ffmodel.js";
import { randomRotation } from "../js/md.js";
import { planes, posed, descend, rng } from "../js/landscape.js";
export { posed };

const KCAL = 627.509;
/* step 1: the model's distinct minima, best first */
export function modelMinima(key, p, starts = 1500) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), A = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), rnd = rng(77 + d * 10 + m.Z), found = [];
  for (let s = 0; s < starts; s++) {
    const R0 = randomRotation(d, rnd), dir = Array.from({ length: d }, () => rnd() - 0.5), n = Math.hypot(...dir), D = m.dimer.RXX * (0.8 + 0.4 * rnd());
    const x0 = [...new Array(planes(d).length).fill(0), ...dir.map((v) => (v / n) * D)];
    const r = descend((B) => modelEnergy(p, A, B), A, R0, x0, d);
    const B = posed(A, r.R0, r.x, d), dXX = Math.hypot(...A[0].map((v, i) => v - B[0][i]));
    // one per basin: within 0.3 kcal/mol and 0.15 bohr is the same structure. A descent that ran out of steps with the
    // slope not gone isn't a minimum: counted as one, such stalls once passed for extra basins
    if (r.g < 2e-5 && r.f < -0.1 / KCAL && !found.some((q) => Math.abs(q.E - r.f) < 0.3 / KCAL && Math.abs(q.dXX - dXX) < 0.15)) found.push({ E: r.f, dXX, B, R0: r.R0, x: r.x });
  }
  return { A, minima: found.sort((a, b) => a.E - b.E) };
}

/* Hartree–Fock for a list of placements, four processes at a time, cached by a hash of the geometry */
const CACHE = path.join(tmpdir(), "atom4-pairsearch");
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
export function hfMany(key, pairs) {
  mkdirSync(CACHE, { recursive: true });
  const w = WORLDS[key], tasks = pairs.map(([A, B]) => () => {
    const geo = JSON.stringify([A, B].map((M) => M.map((p) => p.map((v) => +v.toFixed(5))))), file = path.join(CACHE, `${key}_${hash(geo)}.json`);
    if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, "utf8")).E);
    return new Promise((ok, fail) => { const p = spawn(process.execPath, ["--max-old-space-size=6000", fileURLToPath(import.meta.url), "hf", key, geo]); let out = ""; p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b)); p.on("close", (c) => { if (c) return fail(new Error("hf exited " + c)); const r = JSON.parse(out.trim().split("\n").pop()); writeFileSync(file, JSON.stringify(r)); ok(r.E); }); });
  });
  const out = new Array(tasks.length); let next = 0;
  return Promise.all(Array.from({ length: 4 }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } })).then(() => out);
}
/* step 3: relax under Hartree–Fock. Each iteration takes central differences along every pose number (all at once, in
   parallel), which give the slope and the curvature along each; then a quasi-Newton (BFGS) step, tried at several
   lengths in parallel. The rotation is re-anchored after each step, so the turn is always measured from where the
   pair is. Steps are capped (0.35 rad, 0.5 bohr) but can add up to any turn. A point where the slope is gone but the
   curvature along some direction is negative is a saddle, not a minimum, and the descent steps off it downhill: a
   symmetric arrangement (a straight chain, say) can be exactly such a point. Near flat points the whole Hessian is
   taken (the mixed differences too), because the way down can be a combination of numbers, none downhill alone:
   on the hydrogen fluoride pair, swinging the partner round while turning it. (The relaxation before this one took
   three rounds of steps starting at 0.06 rad and halving, so it could turn a pair at most about 0.1 rad, and
   couldn't leave a saddle: on our hydrogen fluoride pair it stayed on a straight chain the real pair bends away from.) */
const compose = (R0, x, d) => { // the rotation x's turn applied after R0, as one matrix; x's translation kept
  const nw = planes(d).length, eye = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => +(i === j)));
  const cols = posed(eye, R0, [...x.slice(0, nw), ...new Array(d).fill(0)], d); // the images of the unit vectors
  return eye.map((_, i) => eye.map((_, j) => cols[j][i]));
};
/* eigenvalues and vectors of a small symmetric matrix, by Jacobi's rotations */
function eigh(S) {
  const n = S.length, a = S.map((r) => r.slice()), v = S.map((_, i) => S.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2; if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - sn * y; a[k][q] = sn * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - sn * y; a[q][k] = sn * x + c * y; }
      for (let k = 0; k < n; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - sn * y; v[k][q] = sn * x + c * y; }
    }
  }
  return a.map((_, i) => ({ val: a[i][i], vec: v.map((r) => r[i]) })).sort((x, y) => x.val - y.val);
}
/* the rigid move taking template A onto B (B = C·a + t for every atom): Kabsch's rotation, by the eigenvectors of MᵀM.
   A planar or linear molecule leaves some of C free (turns about directions it doesn't extend in): any proper choice */
export function kabsch(A, B) {
  const d = A[0].length, n = A.length, ca = A[0].map((_, i) => A.reduce((s, p) => s + p[i], 0) / n), cb = B[0].map((_, i) => B.reduce((s, p) => s + p[i], 0) / n);
  const M = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => A.reduce((s, p, k) => s + (B[k][i] - cb[i]) * (p[j] - ca[j]), 0)));
  const MtM = M[0].map((_, i) => M[0].map((_, j) => M.reduce((s, r) => s + r[i] * r[j], 0))), eig = eigh(MtM).reverse(); // largest first
  const U = [], V = eig.map((e) => e.vec);
  for (let k = 0; k < d; k++) {
    let u = eig[k].val > 1e-10 ? M.map((r) => r.reduce((s, v, j) => s + v * V[k][j], 0)) : Array.from({ length: d }, (_, i) => +(i === k));
    for (const w of U) { const pr = u.reduce((s, v, i) => s + v * w[i], 0); u = u.map((v, i) => v - pr * w[i]); }
    let nu = Math.hypot(...u); if (nu < 1e-8) { for (let e = 0; e < d && nu < 1e-8; e++) { u = Array.from({ length: d }, (_, i) => +(i === e)); for (const w of U) { const pr = u.reduce((s, v, i) => s + v * w[i], 0); u = u.map((v, i) => v - pr * w[i]); } nu = Math.hypot(...u); } }
    U.push(u.map((v) => v / nu));
  }
  let C = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => U.reduce((s, u, k) => s + u[i] * V[k][j], 0)));
  const det = (Mx) => { const m = Mx.map((r) => r.slice()); let D = 1; for (let c = 0; c < d; c++) { let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; if (Math.abs(m[p][c]) < 1e-14) return 0; if (p !== c) { [m[c], m[p]] = [m[p], m[c]]; D = -D; } D *= m[c][c]; for (let r = c + 1; r < d; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k < d; k++) m[r][k] -= f * m[c][k]; } } return D; };
  if (det(C) < 0) { U[d - 1] = U[d - 1].map((v) => -v); C = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => U.reduce((s, u, k) => s + u[i] * V[k][j], 0))); }
  const t = cb.map((v, i) => v - C[i].reduce((s, c, j) => s + c * ca[j], 0));
  return { C, t };
}
export async function hfDescend(key, A, R0, x0, { iters = 25, log = () => {}, gtol = 2e-5 } = {}) {
  // difference steps big enough that the curvatures they give stand clear of the Hartree–Fock energy's own noise (~1e-8)
  const d = WORLDS[key].d, nw = planes(d).length, n = nw + d, h = Array.from({ length: n }, (_, k) => (k < nw ? 0.03 : 0.05)), NOISE = 1e-4;
  const cap = (p, rot = 0.35, tr = 0.5) => { const r = Math.max(1e-12, ...p.slice(0, nw).map(Math.abs)) / rot, t = Math.max(1e-12, ...p.slice(nw).map(Math.abs)) / tr, f = Math.max(1, r, t); return p.map((v) => v / f); };
  let R = compose(R0, x0, d), t = x0.slice(nw); const anchor = () => [...new Array(nw).fill(0), ...t];
  let x = anchor(), [E] = await hfMany(key, [[A, posed(A, R, x, d)]]), H = null, prev = null;
  const take = (y, Ey, note) => { const dE = (Ey - E) * KCAL; R = compose(R, y, d); t = y.slice(nw); x = anchor(); E = Ey; log(`  ${note}: ${(E * KCAL).toFixed(3)} kcal/mol (${dE.toFixed(3)})`); };
  for (let it = 0; it < iters; it++) {
    const trial = []; for (let k = 0; k < n; k++) for (const sg of [1, -1]) { const y = x.slice(); y[k] += sg * h[k]; trial.push(y); }
    const Es = await hfMany(key, trial.map((y) => [A, posed(A, R, y, d)]));
    const g = h.map((hk, k) => (Es[2 * k] - Es[2 * k + 1]) / (2 * hk)), gn = Math.hypot(...g);
    if (prev && H) { // BFGS update of the inverse Hessian from the last step
      const s = prev.s, y = g.map((v, k) => v - prev.g[k]), sy = s.reduce((a, v, k) => a + v * y[k], 0);
      if (sy > 1e-12) { const Hy = H.map((row) => row.reduce((a, v, j) => a + v * y[j], 0)), yHy = y.reduce((a, v, k) => a + v * Hy[k], 0); H = H.map((row, i) => row.map((v, j) => v + ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy)); }
      else H = null;
    }
    prev = null;
    // near a flat point, the whole Hessian: the curvature along every combination, not only along each number
    let hess = null;
    if (gn < 50 * gtol || !H) {
      const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const y = x.slice(); y[i] += h[i]; y[j] += h[j]; pairs.push([i, j, y]); }
      const Ep = await hfMany(key, pairs.map(([, , y]) => [A, posed(A, R, y, d)]));
      hess = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? (Es[2 * i] + Es[2 * i + 1] - 2 * E) / (h[i] * h[i]) : 0)));
      pairs.forEach(([i, j], k) => { hess[i][j] = hess[j][i] = (Ep[k] - Es[2 * i] - Es[2 * j] + E) / (h[i] * h[j]); });
      const eig = eigh(hess);
      if (eig[0].val < -NOISE) { // a saddle (or a ridge): step off it along the downhill curvature, both ways, a few lengths
        const v = eig[0].vec, cands = []; for (const L of [0.15, 0.3, 0.6]) for (const sg of [1, -1]) cands.push(x.map((xv, k) => xv + cap(v.map((u) => sg * L * u), L, 1.4 * L)[k]));
        const Ec = await hfMany(key, cands.map((y) => [A, posed(A, R, y, d)])); let bi = 0; Ec.forEach((e, i) => { if (e < Ec[bi]) bi = i; });
        if (Ec[bi] < E) { take(cands[bi], Ec[bi], `step ${it + 1}, off a saddle (curvature ${eig[0].val.toExponential(1)})`); H = null; continue; }
      } else if (gn < gtol) {
        // flat and curving up, as far as differences can tell. A very soft bend (hydrogen fluoride's) curves down too
        // faintly for that, so probe: finite moves along every principal direction, both ways, up to 1.5 rad (the swing
        // from a straight chain to a bent pair is about a radian, and the energy barely changes over its first tenth)
        const cands = []; for (const { vec } of eig) for (const L of [0.3, 0.6, 1, 1.5]) for (const sg of [1, -1]) cands.push(x.map((xv, k) => xv + cap(vec.map((u) => sg * L * u), L, 1.4 * L)[k]));
        const Ec = await hfMany(key, cands.map((y) => [A, posed(A, R, y, d)])); let bi = 0; Ec.forEach((e, i) => { if (e < Ec[bi]) bi = i; });
        if (Ec[bi] < E - 0.01 / KCAL) { take(cands[bi], Ec[bi], `step ${it + 1}, a finite probe found lower ground`); H = null; continue; }
        log(`  converged: |g| ${gn.toExponential(1)}, no curvature below −${NOISE}, no probe lower: ${(E * KCAL).toFixed(3)} kcal/mol`); break;
      }
      // a Newton step on the curvature as measured, flat or noisy directions (a linear molecule's spin about itself) held still
      H = (() => { const inv = Array.from({ length: n }, () => new Array(n).fill(0)); for (const { val, vec } of eig) { if (Math.abs(val) < NOISE) continue; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inv[i][j] += (vec[i] * vec[j]) / Math.abs(val); } return inv; })();
    }
    const p = cap(H.map((row) => -row.reduce((a, v, j) => a + v * g[j], 0)));
    const alphas = [1, 0.5, 0.25, 1.6], cands = alphas.map((al) => x.map((v, k) => v + al * p[k])), Ec = await hfMany(key, cands.map((y) => [A, posed(A, R, y, d)]));
    let bi = 0; Ec.forEach((e, i) => { if (e < Ec[bi]) bi = i; });
    if (Ec[bi] >= E) { if (hess) { log(`  no lower point: stopping at ${(E * KCAL).toFixed(3)} kcal/mol, |g| ${gn.toExponential(1)}`); break; } H = null; continue; } // retry with the whole Hessian
    prev = { s: p.map((v) => alphas[bi] * v), g };
    take(cands[bi], Ec[bi], `step ${it + 1}, |g| ${gn.toExponential(1)}`);
  }
  return { E, B: posed(A, R, x, d), R0: R, x };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "bake") { // gather the searches' results into js/pairmin.js
    const out = {};
    for (const key of Object.keys(WORLDS)) { const f = path.join(CACHE, `best_${key}.json`); if (!existsSync(f)) { console.log(`${key}: no search yet`); continue; } const r = JSON.parse(readFileSync(f, "utf8")), rd = (M) => M.map((p) => p.map((v) => +v.toFixed(5))); out[key] = { d: WORLDS[key].d, Z: WORLDS[key].Z, best: { E: +r.best.E.toFixed(7), dXX: +r.best.dXX.toFixed(3), from: r.best.from, A: rd(r.best.A), B: rd(r.best.B) }, search: +r.search.E.toFixed(7), census: +r.census.E.toFixed(7), censusPair: { A: rd(r.census.A), B: rd(r.census.B) }, modelMinima: r.model.map((q) => ({ model: +q.E.toFixed(7), hf: +q.hf.toFixed(7), dXX: +q.dXX.toFixed(3) })) }; }
    writeFileSync(new URL("../js/pairmin.js", import.meta.url), `/* Generated by tools/pairsearch.mjs (bake) from its searches; do not edit. Per molecule (keys as in
   tools/forcefield.mjs): the best pair found over every relative pose (Hartree–Fock, counterpoise-corrected; hartree),
   whether it came from the search or the census's own pair, the heavy atoms' distance, both molecules' atoms, the
   search's own best and the census pair's energy, and the force field's minima with their Hartree–Fock scores. */
export const PAIRMIN = ${JSON.stringify(out)};
`);
    console.log("wrote js/pairmin.js");
  }
  else if (argv[0] === "hf") { const w = WORLDS[argv[1]], [A, B] = JSON.parse(argv[2]), at = (M) => M.map((p, i) => ({ Z: i ? 1 : w.Z, at: p })), e = pairEnergy(at(A), at(B), w.d); console.log(JSON.stringify({ E: e.E, ok: e.ok })); }
  else {
    const key = argv[0], rounds = +(argv[1] ?? 3), w = WORLDS[key], d = w.d, m = monoOf(key), { FORCEFIELDS } = await import("../js/forcefields.js"), p = FORCEFIELDS[key].p, t0 = Date.now();
    const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
    const { A, minima } = modelMinima(key, p); log(`${minima.length} distinct model minima; best ${minima.slice(0, 6).map((q) => `${(q.E * KCAL).toFixed(2)} (X–X ${q.dXX.toFixed(2)})`).join(", ")}`);
    const top = minima.slice(0, 6), Es = await hfMany(key, top.map((q) => [A, q.B]));
    top.forEach((q, i) => { q.hf = Es[i]; });
    // the census's own pair, for comparison
    const [cA, cB] = dimerAtoms(m, d, m.dimer.RXX, m.dimer.beta), [cE] = await hfMany(key, [[cA.map((a) => a.at), cB.map((a) => a.at)]]);
    log(`HF at the model minima: ${top.map((q) => `${(q.hf * KCAL).toFixed(2)}`).join(", ")}; the census pair ${(cE * KCAL).toFixed(2)} kcal/mol`);
    const cands = top.slice().sort((a, b) => a.hf - b.hf).slice(0, 2).filter((q, i, arr) => i === 0 || q.hf < arr[0].hf + 3 / KCAL), relaxed = []; // the second only if it's within 3 kcal/mol
    for (const q of cands) { log(`relaxing the pair at HF ${(q.hf * KCAL).toFixed(2)}`); relaxed.push(await hfDescend(key, A, q.R0, q.x, { iters: 8 * rounds, log })); }
    // and the census's own pair, relaxed in every pose number: a start from a different family than the force field's
    { const cAt = cA.map((a) => a.at), same = cAt.every((p, i) => p.every((v, j) => Math.abs(v - A[i][j]) < 1e-6));
      if (same) { const { C, t } = kabsch(A, cB.map((a) => a.at)), nw = planes(d).length; log(`relaxing the census's pair at HF ${(cE * KCAL).toFixed(2)}`); relaxed.push(await hfDescend(key, A, C, [...new Array(nw).fill(0), ...t], { iters: 8 * rounds, log })); }
      else log("the census's first molecule isn't the search's template; its pair is scored, not relaxed"); }
    const win = relaxed.sort((a, b) => a.E - b.E)[0], dXX = Math.hypot(...A[0].map((v, i) => v - win.B[0][i]));
    const hx = Math.min(...win.B.slice(1).map((h) => Math.hypot(...A[0].map((v, i) => v - h[i]))), ...A.slice(1).map((h) => Math.hypot(...win.B[0].map((v, i) => v - h[i]))));
    // the relaxation stops at a step budget or a flat, positively curved point (good to ~0.01–0.05 kcal/mol), so the
    // census's own carefully optimized pair stands if it's lower
    const census = { E: cE, dXX: m.dimer.RXX, A: cA.map((a) => a.at), B: cB.map((a) => a.at) }, found = { E: win.E, dXX, A, B: win.B }, best = found.E < census.E ? { ...found, from: "search" } : { ...census, from: "census" };
    log(`best: ${(best.E * KCAL).toFixed(2)} kcal/mol from the ${best.from}, X–X ${best.dXX.toFixed(2)} bohr (search ${(win.E * KCAL).toFixed(2)}, nearest H···X ${hx.toFixed(2)}; census ${(cE * KCAL).toFixed(2)})`);
    mkdirSync(CACHE, { recursive: true }); writeFileSync(path.join(CACHE, `best_${key}.json`), JSON.stringify({ key, best, search: found, census, model: top.map((q) => ({ E: q.E, hf: q.hf, dXX: q.dXX })) }));
  }
}
