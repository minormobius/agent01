/* OCTOPUS's selftest: where the arms root (a ring 45° apart in 3D; a cube's corners in 4D, 70.5° apart, three nearest
   neighbours each, four of them in w = 0), that eight arms in one solve keep out of the head, the mantle and one
   another, and the stroke: fast close and slow open push the body one way, and the same stroke run backwards pushes
   it the other (it's drag going as speed squared, not the shape of the stroke, that makes it swim).
     node kata/octopus/test/octopus.selftest.mjs   (~40 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), O = await import(path.join(here, "../js/octo.js")), D = await import(path.join(here, "../../tentacle/js/dyn.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* the roots */
for (const d of [3, 4]) {
  const R = O.roots(d); let orth = 0; for (const r of R) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) orth = Math.max(orth, Math.abs(dot(r.F0[i], r.F0[j]) - (i === j ? 1 : 0)));
  const ang = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180) / Math.PI;
  const near = R.map((r, a) => { const as = R.map((q, b) => (a === b ? 999 : ang(r.u, q.u))), m = Math.min(...as); return { m, n: as.filter((x) => Math.abs(x - m) < 1e-6).length }; });
  const want = d === 3 ? 45 : (Math.acos(1 / 3) * 180) / Math.PI, inSlice = d === 4 ? R.filter((r) => Math.abs(r.u[3]) < 1e-12).length : 8;
  ok(orth < 1e-12 && near.every((x) => Math.abs(x.m - want) < 1e-6 && x.n === (d === 3 ? 2 : 3)) && inSlice === (d === 3 ? 8 : 4),
    `${d}D: the roots: every arm's nearest neighbours ${want.toFixed(2)}° away, ${d === 3 ? "two" : "three"} of them (${d === 3 ? "a ring" : "a cube's corners on the 2-sphere round the mouth; four in w = 0"}), frames orthonormal`);
}

/* eight arms, one solve: nobody in the head or mantle, nobody through anybody */
const inside = (o) => { let n = 0; for (let i = 0; i < o.rod.N; i++) { if (i % O.PER < 8) continue; const x = o.rod.x[i]; for (const s of O.SOLIDS) { const a = s.a.slice(0, x.length), b = s.b.slice(0, x.length), ab = b.map((v, c) => v - a[c]), ab2 = dot(ab, ab), h = ab2 ? Math.max(0, Math.min(1, dot(x.map((v, c) => v - a[c]), ab) / ab2)) : 0; if (Math.hypot(...x.map((v, c) => v - a[c] - ab[c] * h)) < s.ra + (s.rb - s.ra) * h - 0.01) n++; } } return n; };
const apart = (o) => { let g = 9; const { x, r } = o.rod; for (let a = 0; a < O.NA; a++) for (let b = a + 1; b < O.NA; b++) for (let i = 8; i < 64; i++) for (let j = 8; j < 64; j++) { const I = a * O.PER + i, J = b * O.PER + j; g = Math.min(g, D.segSeg(x[I], x[I + 1], x[J], x[J + 1]).dist / (r[I] + r[J])); } return g; };
for (const d of [3, 4]) {
  const res = [];
  for (const p of ["sprawl", "writhe", "sweep", "flare", "grab", "reach"]) { const o = O.makeOcto(d, p); let worst = 9, bad = 0; for (let i = 0; i < 240; i++) { O.stepOcto(o, p, i / 60, 1 / 60); if (i % 20 === 19) { worst = Math.min(worst, apart(o)); bad += inside(o); } } res.push({ p, worst, bad }); }
  ok(res.every((r) => r.bad === 0 && r.worst > 0.8), `${d}D: four seconds of every preset: no arm inside the head or mantle, no two arms closer than ${Math.min(...res.map((r) => r.worst)).toFixed(2)} of their summed radii (${res.map((r) => `${r.p} ${r.worst.toFixed(2)}`).join(", ")})`);
}

/* the stroke, and the stroke backwards */
O.OPRESETS.sweepBack = (d, t, k) => O.OPRESETS.sweep(d, 100 * O.SWEEP - t, k);
for (const d of [3, 4]) {
  const strokes = (p) => { const o = O.makeOcto(d, p), per = Math.round(O.SWEEP * 60), out = []; let acc = 0; for (let i = 0; i < per * 5; i++) { O.stepOcto(o, p, i / 60, 1 / 60); acc += o.body[1]; if ((i + 1) % per === 0) { out.push(acc / per); acc = 0; } } return out.slice(1); };
  const fw = strokes("sweep"), bk = strokes("sweepBack");
  ok(fw.every((f) => f > 0) && bk.every((f) => f < 0), `${d}D: close fast, open slow: every stroke pushes the body up (${fw.map((f) => f.toFixed(0)).join(", ")} N); the same stroke backwards pushes it down (${bk.map((f) => f.toFixed(0)).join(", ")} N)`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
