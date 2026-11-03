/* TENTACLE's dynamics selftest: the solver's pieces (the d-dimensional best-fit rotation, the least turn), the knot
   (an overhand knot pulled tight jams in 3D, never passing through itself; the same knot slips out in 4D; and in 4D
   held exactly in a 3-space, with nothing to push it out, it jams as in 3D: it's the fourth direction that unties it),
   and the arm (tone holds it up against gravity, limp it falls, the whip's tip outruns the muscles).
     node kata/tentacle/test/dyn.selftest.mjs   (~15 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), D = await import(path.join(here, "../js/dyn.js")), A = await import(path.join(here, "../js/arm.js")), R = await import(path.join(here, "../js/rod.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* the best-fit rotation: a rod shaped like its target but turned by R0 (in 4D, in two planes at once). Held still, every
   full window (5 nodes; the end ones have 3, which leave some planes free) finds R0, iterating from the identity; let go, a rod already in its shape doesn't move */
{
  const d = 4, R0 = R.expm([[0, 0.7, 0.4, 0], [-0.7, 0, 0, 0], [-0.4, 0, 0, -1.1], [0, 0, 1.1, 0]]);
  const q = Array.from({ length: 11 }, (_, i) => [0.1 * i, 0.06 * Math.sin(1.7 * i), 0.06 * Math.cos(1.3 * i), 0.06 * Math.sin(0.9 * i + 1)]), x = q.map((p) => R0.map((r) => dot(r, p)));
  const rod = D.makeRod(d, x, new Array(11).fill(0.02), { pinned: q.map((_, i) => i) });
  for (let k = 0; k < 200; k++) D.step(rod, 1 / 60, { q, tone: 1, aMax: 0.3, sub: 4, iters: 2 });
  let eR = 0; for (const Rw of rod.R.slice(2, -2)) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) eR = Math.max(eR, Math.abs(Rw[i * d + j] - R0[i][j]));
  rod.pinned.clear(); for (let k = 0; k < 120; k++) D.step(rod, 1 / 60, { q, tone: 1, aMax: 0.3, sub: 4, iters: 2 });
  let eX = 0; rod.x.forEach((p, i) => { eX = Math.max(eX, Math.hypot(...p.map((v, c) => v - x[i][c]))); });
  ok(eR < 1e-5 && eX < 1e-4, `4D shape matching: every window finds the rotation (|R − R₀| ${eR.toExponential(1)}), and a rod already in its shape doesn't move (${eX.toExponential(1)} m)`);
}
/* the least turn taking a to b: lands a on b, leaves what's perpendicular to both alone, keeps lengths and angles */
{
  const a = [1, 0, 0, 0], b = [0.6, 0, 0, 0.8], u = [0, 1, 0, 0], v = [0, 0.3, 0.4, 0.5];
  const ta = D.turn(a, b, a), tu = D.turn(a, b, u), tv = D.turn(a, b, v);
  ok(Math.hypot(...ta.map((x, i) => x - b[i])) < 1e-12 && Math.hypot(...tu.map((x, i) => x - u[i])) < 1e-12 && Math.abs(dot(tv, tv) - dot(v, v)) < 1e-12 && Math.abs(dot(tv, ta) - dot(v, a)) < 1e-12, "the least turn: a onto b, the rest of 4D untouched, lengths and angles kept");
}

/* THE KNOT, as the page runs it (D.KNOT): 12 s, pulled from 1.2 s */
function runKnot(k, sec) { let gap = Infinity; const trace = []; for (let i = 0; i < sec * 60; i++) { D.stepKnot(k, 1 / 60); if (i % 10 === 9) gap = Math.min(gap, D.minGap(k.rod)); if (i % 60 === 59) trace.push(D.span(k.rod).toFixed(2)); } return { gap, span: D.span(k.rod), trace }; }
{
  const k = D.newKnot(3), g0 = D.minGap(k.rod), r = runKnot(k, 12);
  ok(g0 > 1 && r.span > 0.6 && r.span < 0.85 && r.gap > 0.97, `3D: tied clear of itself (strands ${g0.toFixed(2)} × their thickness apart), pulled, it JAMS: its ends ${(r.span * 100).toFixed(0)}% of its length apart (the knot eats the rest), never passing through itself (closest ${r.gap.toFixed(3)} × thickness) [${r.trace.join(" ")}]`);
}
{
  const k = D.newKnot(4), r = runKnot(k, 12);
  ok(r.span > 0.97, `4D: the same knot, the same pull, SLIPS OUT: ends ${(r.span * 100).toFixed(0)}% of its length apart [${r.trace.join(" ")}]`);
}
{
  // the control: in 4D but exactly in the 3-space w = 0, no wobble. Every push is in that 3-space, so nothing ever moves
  // it out, and it jams exactly as in 3D
  const k = D.newKnot(4), xs = D.knotRope(4, D.KNOT.N, D.KNOT.r, 1.3, 0); k.rod.x = xs.map((p) => p.slice());
  const r = runKnot(k, 12), wmax = Math.max(...k.rod.x.map((p) => Math.abs(p[3])));
  ok(r.span < 0.85 && wmax === 0, `4D, held exactly in a 3-space: jams like 3D (${(r.span * 100).toFixed(0)}%, w never leaves 0): the fourth direction is what unties it`);
}

/* THE ARM */
for (const d of [3, 4]) {
  const arm = A.makeArm(d, "rest"); for (let i = 0; i < 180; i++) A.stepArm(arm, "rest", i / 60, 1 / 60);
  const off = Math.max(...arm.nodes.map((n, i) => Math.hypot(...n.x.map((v, c) => v - arm.target[i].x[c]))));
  const limp = A.makeArm(d, "rest"); for (let i = 0; i < 360; i++) A.stepArm(limp, "limp", i / 60, 1 / 60);
  ok(off < 0.03 && limp.nodes[R.SEG].x[1] < 0.6, `${d}D: tone holds the arm up against what's left of gravity (no node ${(off * 100).toFixed(1)} cm off its shape); limp, it falls (tip from 2 m to ${limp.nodes[R.SEG].x[1].toFixed(2)} m in 6 s)`);
}
{
  const arm = A.makeArm(3, "whip"); let vDyn = 0, vShape = 0, prev = null;
  for (let i = 0; i < 160; i++) { A.stepArm(arm, "whip", i / 60, 1 / 60); vDyn = Math.max(vDyn, A.tipSpeed(arm)); const tp = arm.target[R.SEG].x; if (prev) vShape = Math.max(vShape, Math.hypot(...tp.map((v, c) => v - prev[c])) * 60); prev = tp; }
  ok(vDyn > 1.3 * vShape, `the whip: the slack arm's tip reaches ${vDyn.toFixed(1)} m/s, where the muscles alone move it ${vShape.toFixed(1)} m/s: momentum carries the bend out and speeds it up`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
