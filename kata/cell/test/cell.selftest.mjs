/* CELL's selftest: the cube-sphere grid (its weights integrate the sphere's volume exactly, and the least-squares
   Laplacian takes n_x to −(d − 1) n_x across the face seams); the page's claims: at rest the pressure is Laplace's,
   σ(d − 1)/R; every preset keeps the volume; the pseudopod bulges; a contractile ring pinches a 3D cell's waist and a
   belt pinches a 4D cell's, but a ring round a 4D cell only dents it (the equator away from the ring stays out).
     node kata/cell/test/cell.selftest.mjs   (~30 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), C = await import(path.join(here, "../js/cell.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const DT = 0.02;
const run = (d, name, T, N) => { const c = C.makeCell(d, N); c.dtLast = DT; let dv = 0, cl = Infinity; while (c.t < T - 1e-9) { C.applyPreset(c, name, c.t); C.step(c, DT); dv = Math.max(dv, Math.abs(C.volume(c) / c.V0 - 1)); cl = Math.min(cl, C.nucClearance(c)); } return { c, dv, cl }; };

for (const d of [3, 4]) {
  const c = C.makeCell(d), want = d === 3 ? (4 * Math.PI) / 3 : Math.PI ** 2 / 2;
  ok(Math.abs(C.volume(c) / want - 1) < 1e-9, `${d}D: the grid's weights give the unit ball's volume (${C.volume(c).toFixed(6)} vs ${want.toFixed(6)})`);
  const A = C.area(c), wantA = d === 3 ? 4 * Math.PI : 2 * Math.PI ** 2;
  ok(Math.abs(A / wantA - 1) < 1e-9, `${d}D: and its membrane's area (${A.toFixed(5)})`);
  const G = c.G, fx = new Float64Array(G.count), out = new Float64Array(G.count);
  for (let i = 0; i < G.count; i++) fx[i] = G.n[i * d] + 0.5 * G.n[i * d + 1];
  C.laplacian(G, fx, out); let e = 0; for (let i = 0; i < G.count; i++) e = Math.max(e, Math.abs(out[i] + (d - 1) * fx[i]));
  ok(e < 0.02, `${d}D: the Laplacian of a linear function is −(d − 1) times it, seams and corners included (worst ${e.toFixed(4)})`);
}
for (const d of [3, 4]) {
  const c = C.makeCell(d); c.sigma.fill(1.5); for (let k = 0; k < 20; k++) C.step(c, DT);
  ok(Math.abs(c.P / (1.5 * (d - 1)) - 1) < 0.01, `${d}D: at rest P = σ(d − 1)/R (${c.P.toFixed(4)} vs ${(1.5 * (d - 1)).toFixed(1)})`);
}
// (4D on the 8-a-side grid here, for time; the claims below use the page's)
for (const name of ["rest", "reach", "contract", "wave", "bleb"]) for (const d of [3, 4]) {
  const { c, dv, cl } = run(d, name, 6, d === 4 ? 8 : 24);
  let mn = Infinity, mx = 0; for (const v of c.r) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  ok(dv < 1e-4 && mn > 0.15 && mx < 2.5, `${d}D ${name}: the volume holds (${dv.toExponential(1)}) and the cell stays whole (r ${mn.toFixed(2)}–${mx.toFixed(2)})`);
  ok(cl > C.NUC_GAP * 0.9, `${d}D ${name}: the membrane never cuts the nucleus (nearest ${cl.toFixed(3)}, the gap ${C.NUC_GAP})`);
}
for (const d of [3, 4]) {
  const { c } = run(d, "reach", 3.4);
  ok(c.nuc[0].c[0] > 0.2, `${d}D reach: the nucleus is carried forward into it (x ${c.nuc[0].c[0].toFixed(2)})`);
  let front = 0, back = 0, nf = 0, nb = 0;
  for (let i = 0; i < c.G.count; i++) { const x = c.G.n[i * d]; if (x > 0.95) { front += c.r[i]; nf++; } else if (x < -0.95) { back += c.r[i]; nb++; } }
  ok(front / nf > 1.15 * (back / nb), `${d}D reach: the pseudopod bulges (front ${(front / nf).toFixed(2)} vs back ${(back / nb).toFixed(2)})`);
}
{
  const { c, dv, cl } = run(3, "ring", 14), w = C.waist(c), [A, B] = c.nuc;
  ok(w.min < 0.5 && dv < 1e-4, `3D: a contractile ring pinches the waist (${w.min.toFixed(2)})`);
  ok(c.nuc.length === 2 && A.c[1] * B.c[1] < 0 && Math.min(Math.abs(A.c[1]), Math.abs(B.c[1])) > A.a + 0.1 && cl > 0, `3D: the nucleus divided and a daughter sits in each lobe, clear of the furrow (y ${A.c[1].toFixed(2)}, ${B.c[1].toFixed(2)}; radius ${A.a.toFixed(3)} = 0.34/∛2)`);
}
{
  const { c, dv } = run(4, "belt", 14), w = C.waist(c);
  ok(Math.abs(c.nuc[0].a * 2 ** 0.25 - C.NUC_A) < 1e-12 && c.nuc[0].c[1] * c.nuc[1].c[1] < 0, `4D: the daughters have half the 4-volume each (radius 0.34/2^¼) and part, one to each lobe`);
  ok(w.mean < 0.3 && dv < 1e-4, `4D: a contractile belt pinches the waist all round (mean ${w.mean.toFixed(2)})`);
}
{
  const { c, dv } = run(4, "ring", 14), w = C.waist(c);
  ok(w.ring > 0.45 && w.away > 0.95 && dv < 1e-4, `4D: a ring only dents it (at the ring ${w.ring.toFixed(2)}, the equator away from it ${w.away.toFixed(2)})`);
}
/* moving: crawling on the floor, swimming in open water, and the hunt (4D on the coarse 8-a-side grid, for time) */
for (const d of [3, 4]) {
  const N = d === 3 ? 24 : 8, c = C.makeCell(d, N); c.dtLast = DT; let gap = Infinity, cl = Infinity, dv = 0;
  while (c.t < 6 - 1e-9) { C.applyPreset(c, "crawl", c.t); C.step(c, DT); dv = Math.max(dv, Math.abs(C.volume(c) / c.V0 - 1)); cl = Math.min(cl, C.nucClearance(c)); for (let i = 0; i < c.G.count; i++) gap = Math.min(gap, c.ceil[i] - c.r[i]); }
  const side = Math.max(...[...c.X].filter((_, a) => a > 1).map(Math.abs));
  ok(c.X[0] > 0.6 && side < 0.02 && Math.abs(c.X[1] - c.floor.h) < 1e-12, `${d}D: it crawls along its heading (${c.X[0].toFixed(2)} radii in 6 s, ${side.toExponential(1)} sideways), on the floor`);
  ok(gap > -1e-9 && dv < 1e-4 && cl > C.NUC_GAP * 0.9, `${d}D: crawling, it never goes through the floor (${gap.toExponential(1)}), keeps its volume (${dv.toExponential(1)}) and never cuts its nucleus (${cl.toFixed(2)})`);
  const m = C.makeCell(d, N); m.dtLast = DT; m.heading[0] = -1; while (m.t < 6 - 1e-9) { C.applyPreset(m, "crawl", m.t); C.step(m, DT); }
  ok(Math.abs(m.X[0] + c.X[0]) < 0.01 * c.X[0], `${d}D: turned round, it crawls back as far (${m.X[0].toFixed(3)} against ${c.X[0].toFixed(3)})`);
  const w = run(d, "contract", 6, N).c;
  ok(w.X[0] > 0.2 && !w.floor, `${d}D: in open water a rear contraction swims it forward (${w.X[0].toFixed(2)} radii in 6 s): the cortex's rearward flow against the water`);
  for (const dist of [3, 6]) {
    const h = C.makeCell(d, N); h.dtLast = DT; C.spawnFood(h, dist); const sm = C.sense(h), want = (d - 2) / dist;
    ok(Math.abs(sm.grad / want - 1) < 0.03 && Math.abs(sm.c * dist ** (d - 2) - 1) < 0.05, `${d}D: food ${dist} away smells ${sm.c.toFixed(3)} (1/r^${d - 2}) and its relative gradient across the cell is ${sm.grad.toFixed(3)}/r (${d - 2}/r = ${want.toFixed(3)})`);
  }
}
{
  const hunt = (d, N, dist, T) => { const h = C.makeCell(d, N); h.dtLast = DT; h.seed = 7919; C.spawnFood(h, dist); const s0 = C.sense(h).senses; while (h.t < T && !h.eaten) { C.applyPreset(h, "hunt", h.t); C.step(h, DT); } return { h, s0 }; };
  const a = hunt(3, 24, 6, 40); ok(a.s0 && a.h.eaten === 1, `3D: food 6 away is inside the horizon (1/r: c = 0.17 > 0.1); the cell follows the scent and engulfs it (${a.h.t.toFixed(1)} s)`);
  const b = hunt(4, 8, 3, 20); ok(b.s0 && b.h.eaten === 1, `4D: food 3 away is inside the horizon too (1/r²: c = 0.11), and is caught (${b.h.t.toFixed(1)} s)`);
  const e = hunt(4, 8, 6, 30); ok(!e.s0 && e.h.eaten === 0, `4D: food 6 away is beyond it (c = ${(1 / 36).toFixed(3)}): the cell can only wander, and in 30 s hasn't found it`);
  ok(a.h.V0 > a.h.V00 * 1.04, `eating grows the cell (volume ×${(a.h.V0 / a.h.V00).toFixed(2)})`);
}
console.log(`${checks - fails}/${checks} checks`); process.exit(fails ? 1 : 0);
