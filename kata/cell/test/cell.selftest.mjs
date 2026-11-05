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
const run = (d, name, T) => { const c = C.makeCell(d); let dv = 0; while (c.t < T - 1e-9) { C.applyPreset(c, name, c.t); C.step(c, DT); dv = Math.max(dv, Math.abs(C.volume(c) / c.V0 - 1)); } return { c, dv }; };

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
for (const name of ["rest", "reach", "contract", "wave", "bleb"]) for (const d of [3, 4]) {
  const { c, dv } = run(d, name, 6);
  let mn = Infinity, mx = 0; for (const v of c.r) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  ok(dv < 1e-4 && mn > 0.15 && mx < 2.5, `${d}D ${name}: the volume holds (${dv.toExponential(1)}) and the cell stays whole (r ${mn.toFixed(2)}–${mx.toFixed(2)})`);
}
for (const d of [3, 4]) {
  const { c } = run(d, "reach", 3.4); let front = 0, back = 0, nf = 0, nb = 0;
  for (let i = 0; i < c.G.count; i++) { const x = c.G.n[i * d]; if (x > 0.95) { front += c.r[i]; nf++; } else if (x < -0.95) { back += c.r[i]; nb++; } }
  ok(front / nf > 1.15 * (back / nb), `${d}D reach: the pseudopod bulges (front ${(front / nf).toFixed(2)} vs back ${(back / nb).toFixed(2)})`);
}
{
  const { c, dv } = run(3, "ring", 14), w = C.waist(c);
  ok(w.min < 0.5 && dv < 1e-4, `3D: a contractile ring pinches the waist (${w.min.toFixed(2)})`);
}
{
  const { c, dv } = run(4, "belt", 14), w = C.waist(c);
  ok(w.mean < 0.3 && dv < 1e-4, `4D: a contractile belt pinches the waist all round (mean ${w.mean.toFixed(2)})`);
}
{
  const { c, dv } = run(4, "ring", 14), w = C.waist(c);
  ok(w.ring > 0.45 && w.away > 0.95 && dv < 1e-4, `4D: a ring only dents it (at the ring ${w.ring.toFixed(2)}, the equator away from it ${w.away.toFixed(2)})`);
}
console.log(`${checks - fails}/${checks} checks`); process.exit(fails ? 1 : 0);
