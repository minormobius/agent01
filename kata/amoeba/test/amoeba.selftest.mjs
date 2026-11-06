/* AMOEBA's selftest (3D; the 4D mesh only at rest, since its remeshing isn't built). The mesh: a sphere's measure and
   volume; Laplace's law with the implicit tension, P = σ(d − 1)/R, in 3D and 4D. Then a cell exploring on its floor for
   30 s, remeshed as it goes: its volume holds; the mesh stays a closed surface (every edge in exactly two triangles,
   Euler characteristic 2) with its edges within the remesher's bounds; it never goes through the floor or cuts its
   nucleus; it is not round (more membrane than a ball's, reaching well out); it moves. The inside test (a ray's
   crossings). And a hunt: it eats.
     node kata/amoeba/test/amoeba.selftest.mjs   (~80 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), Am = await import(path.join(here, "../js/amoeba.js")), Me = await import(path.join(here, "../js/mesh.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };

for (const [d, L] of [[3, 4], [4, 2]]) {
  const M = Me.sphereMesh(d, L), V = Me.volumeOf(M), A = Me.areaOf(M), Vw = d === 3 ? (4 * Math.PI) / 3 : Math.PI ** 2 / 2, Aw = d === 3 ? 4 * Math.PI : 2 * Math.PI ** 2;
  ok(Math.abs(V / Vw - 1) < 0.02 && Math.abs(A / Aw - 1) < 0.02, `${d}D: the refined ${d === 3 ? "icosahedron" : "600-cell"} (${M.nv} points, ${M.nf} facets) has the ball's volume and the sphere's measure to 2% (${(V / Vw).toFixed(4)}, ${(A / Aw).toFixed(4)})`);
}
for (const d of [3, 4]) {
  const A = Am.makeAmoeba(d, undefined, { vp: 0, soften: 0, tighten: 0, noise: 0, remeshEvery: 0 }); A.floor = false;
  for (let k = 0; k < 25; k++) Am.step(A);
  ok(Math.abs(A.Pr / (d - 1) - 1) < 0.005 && Math.abs(A.V / A.V0 - 1) < 1e-6, `${d}D: at rest, Laplace's law P = σ(d − 1)/R (${A.Pr.toFixed(4)} vs ${d - 1}), the volume held`);
}
{
  const A = Am.makeAmoeba(3); A.seed = 4242; const c0 = Am.centre(A); let dv = 0, below = 0, cut = Infinity, mxArea = 0, reach = 0;
  const ball = (V) => 4 * Math.PI * (V / ((4 / 3) * Math.PI)) ** (2 / 3);
  while (A.t < 30) { Am.step(A); dv = Math.max(dv, Math.abs(A.V / A.V0 - 1));
    for (let i = 0; i < A.nv; i++) { below = Math.min(below, A.P[i * 3 + 1]); let q = 0; for (let k = 0; k < 3; k++) q += (A.P[i * 3 + k] - A.nuc.c[k]) ** 2; cut = Math.min(cut, Math.sqrt(q) - A.nuc.a); }
    mxArea = Math.max(mxArea, A.Area / ball(A.V));
    const c = Am.centre(A); for (let i = 0; i < A.nv; i++) reach = Math.max(reach, Math.hypot(A.P[i * 3] - c[0], A.P[i * 3 + 2] - c[2])); }
  ok(dv < 0.005, `exploring 30 s, remeshed every ${A.par.remeshEvery} steps, the volume holds (${(dv * 100).toFixed(2)}%)`);
  const ec = new Map(); for (let k = 0; k < A.nf; k++) for (let j = 0; j < 3; j++) { const a = A.M.F[k * 3 + j], b = A.M.F[k * 3 + ((j + 1) % 3)], key = a < b ? `${a},${b}` : `${b},${a}`; ec.set(key, (ec.get(key) || 0) + 1); }
  const bad = [...ec.values()].filter((n) => n !== 2).length, chi = A.nv - ec.size + A.nf;
  let mn = Infinity, mx = 0; for (const key of ec.keys()) { const [a, b] = key.split(",").map(Number); const l = Math.hypot(A.P[a * 3] - A.P[b * 3], A.P[a * 3 + 1] - A.P[b * 3 + 1], A.P[a * 3 + 2] - A.P[b * 3 + 2]); mn = Math.min(mn, l); mx = Math.max(mx, l); }
  ok(bad === 0 && chi === 2, `the remeshed membrane is still a closed surface: every edge in two triangles (${bad} not), Euler characteristic ${chi} (${A.nv} points, ${A.nf} triangles)`);
  ok(mx < 2.5 * A.L && mn > 0.02 * A.L, `its edges stay in bounds: ${(mn / A.L).toFixed(2)}–${(mx / A.L).toFixed(2)} × the target ${A.L.toFixed(3)}`);
  ok(below >= -1e-9 && cut > Am.NUC_GAP * 0.5, `it never goes through the floor (${below.toExponential(1)}) or cuts its nucleus (nearest ${cut.toFixed(3)})`);
  ok(mxArea > 1.3 && reach > 1.8, `it isn't round: up to ${mxArea.toFixed(2)}× a ball's membrane, reaching ${reach.toFixed(2)} radii`);
  const c = Am.centre(A), moved = Math.hypot(c[0] - c0[0], c[2] - c0[2]);
  ok(moved > 2, `it crawls: ${moved.toFixed(1)} radii in 30 s`);
  const X = Float64Array.from(c); X[1] = 0.1; const far = Float64Array.from(c); far[0] += 20; far[1] = 0.1;
  ok(Am.inside(A, X) && !Am.inside(A, far), `the inside test (an upward ray's crossings): its middle is in, a point 20 radii off is out`);
}
{
  const A = Am.makeAmoeba(3); A.seed = 77; A.V00 = A.V0; A.keepFood = Am.FOOD[3].count; while (A.foods.length < A.keepFood) Am.spawnFood(A);
  while (A.t < 45 && A.eaten < 1) Am.step(A);
  ok(A.eaten >= 1 && A.V0 > A.V00, `hunting, it finds food by smell and engulfs it (first in ${A.t.toFixed(1)} s), and grows`);
}
console.log(`${checks - fails}/${checks} checks`); process.exit(fails ? 1 : 0);
