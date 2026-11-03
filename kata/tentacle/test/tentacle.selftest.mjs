/* TENTACLE's selftest: the rod's geometry (a steady bend is a circle, bend and twist a helix, frames orthonormal), the
   muscles (a one-sided contraction bends toward its side alone, volume kept, squeezing lengthens), the hairy ball (a 3D
   twist muscle covers its ring, a 4D one has two bald poles per plane), and the 4D arm in pieces in a slice.
     node kata/tentacle/test/tentacle.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), T = await import(path.join(here, "../js/rod.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), sub = (a, b) => a.map((x, i) => x - b[i]);
const steady = (d, bend, twist = null) => Array.from({ length: T.SEG }, () => ({ bend, twist: twist || T.planes(d).map(() => 0), stretch: 1 }));

/* geometry */
for (const d of [3, 4]) {
  const k = 2.2, b = new Array(d - 1).fill(0); b[d - 2] = k; const nodes = T.build(d, steady(d, b));
  // the centre: from the base, 1/k toward the bend's direction (e_{d−1} at the base)
  const ds = T.LEN / T.SEG, Rc = ds / (2 * Math.sin((k * ds) / 2)), e = nodes[0].F[d - 1], c = e.map((v) => v * Rc), rs = nodes.map((n) => Math.hypot(...sub(n.x, c)));
  let orth = 0; for (const n of nodes) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) orth = Math.max(orth, Math.abs(dot(n.F[i], n.F[j]) - (i === j ? 1 : 0)));
  ok(Math.max(...rs.map((r) => Math.abs(r - Rc))) < 1e-9 && Math.abs(Rc * k - 1) < 1e-3 && orth < 1e-12, `${d}D: a steady bend is a circle of radius 1/κ (every node ${Rc.toFixed(5)} from its centre, 1/κ = ${(1 / k).toFixed(5)}: the chords' small shortfall), frames orthonormal (${orth.toExponential(1)})`);
}
{ // 3D: bend and twist together make a helix: its points all the same distance from one axis
  const nodes = T.build(3, steady(3, [3, 0], [2])), P = nodes.map((n) => n.x), kap = [], tau = [];
  for (let i = 1; i + 2 < P.length; i++) { const a = sub(P[i], P[i - 1]), b = sub(P[i + 1], P[i]), c = sub(P[i + 2], P[i + 1]), cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    kap.push(Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))); const n1 = cr(a, b), n2 = cr(b, c); tau.push(Math.acos(Math.min(1, dot(n1, n2) / Math.hypot(...n1) / Math.hypot(...n2)))); }
  const sd = (x) => { const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length) / m; };
  ok(sd(kap) < 1e-9 && sd(tau) < 1e-9, `3D: a steady bend and twist is a helix: its turning and its winding are the same all along (spread ${sd(kap).toExponential(1)}, ${sd(tau).toExponential(1)})`);
}

/* the muscles */
for (const d of [3, 4]) {
  const side = d - 2, st = T.strainsOf(d, () => ({ long: (n) => (n[side] > 0.3 ? 1 : 0) })), nodes = T.build(d, st);
  // how far the arm reaches toward that side, and how far any other way (it curls right round, so not just the tip)
  const toward = Math.max(...nodes.map((n) => dot(n.x, nodes[0].F[side + 1]))), others = nodes[0].F.slice(1).filter((_, i) => i !== side).map((e) => Math.max(...nodes.map((n) => Math.abs(dot(n.x, e)))));
  ok(toward > 0.2 && others.every((o) => o < 1e-9) && st.every((s) => s.stretch < 1), `${d}D: contracting the fibres on one side curls the arm that way alone (out to ${toward.toFixed(2)} m that side, ${Math.max(...others).toExponential(1)} any other way), and shortens it`);
  const sq = T.strainsOf(d, () => ({ trans: 0.8 })), relaxed = T.build(d, T.strainsOf(d, () => ({}))), squeezed = T.build(d, sq);
  const vol = (nodes) => nodes.slice(1).map((n, i) => n.r ** (d - 1) * Math.hypot(...sub(n.x, nodes[i].x))), v0 = vol(relaxed), v1 = vol(squeezed);
  ok(v1.every((v, i) => Math.abs(v / v0[i] - 1) < 1e-9) && squeezed[squeezed.length - 1].x[1] > relaxed[relaxed.length - 1].x[1] * 1.5, `${d}D: squeezed thin it shoots out to ${(squeezed[squeezed.length - 1].x[1]).toFixed(2)} m (from ${relaxed[relaxed.length - 1].x[1].toFixed(2)}), every segment's volume (r^${d - 1} × length) kept`);
}

/* the hairy ball: a twist muscle's fibre field never vanishes round a 3D arm's ring of skin; on a 4D arm's 2-sphere of
   skin, each plane's field vanishes at exactly two opposite poles */
{
  const ring = Array.from({ length: 3600 }, (_, i) => [Math.cos((2 * Math.PI * i) / 3600), Math.sin((2 * Math.PI * i) / 3600)]), m3 = Math.min(...ring.map((n) => Math.hypot(...T.twistField(n, 0, 1))));
  const bald = T.planes(4).map(([i, j]) => { const a = i - 1, b = j - 1, third = [0, 1, 2].find((q) => q !== a && q !== b); const zeros = [];
    for (let p = 0; p <= 180; p++) for (let q = 0; q < 360; q++) { const th = (p * Math.PI) / 180, ph = (q * Math.PI) / 180, n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)], m = Math.hypot(...T.twistField(n, a, b)); if (m < 1e-9) zeros.push(n[third]); }
    return { count: new Set(zeros.map((z) => Math.sign(z))).size, all: zeros.every((z) => Math.abs(Math.abs(z) - 1) < 1e-9) }; });
  ok(m3 > 0.999 && bald.every((b) => b.count === 2 && b.all), "3D: the twist muscle's fibres move every point of the arm's ring of skin (it can be combed); 4D: each of the three twist muscles leaves two bald poles on the 2-sphere of skin, along the third direction across: the hairy ball theorem");
}

/* in your slice, a 4D arm writhing comes apart: a slice through its base cuts it in several pieces as it moves */
{
  let most = 1; for (let t = 0; t < 12; t += 0.25) { const nodes = T.build(4, T.strainsOf(4, T.PRESETS.writhe(4, t))); most = Math.max(most, T.pieces(nodes, [0, 0, 0, 0], [0, 0, 0, 1])); }
  ok(most >= 3, `writhing in 4D, the arm is cut by a slice through its base into as many as ${most} separate pieces, though it's one arm`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
