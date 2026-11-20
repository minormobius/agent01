// COIN's selftest: the gist's claims, checked. The map is glued (even), one-to-one on RP² (an inverse exists), an
// immersion (never folds flat), the walk comes back mirrored, and a flip has no surprise in it.
import * as C from '../js/coin.js';
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const sph = () => { const g = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return u - 3; }; const v = [g(), g(), g()], l = Math.hypot(...v); return v.map((x) => x / l); };
const N = 20000, pts = Array.from({ length: N }, sph);
// glued: f(−p) = f(p)
ok(pts.every((p) => C.norm(C.add4(C.f(p), C.f(p.map((x) => -x)), -1)) === 0), `f(x, y, z) = (x² − y², xy, xz, yz) takes every one of ${N} random points and its opposite to exactly the same place: the gluing, done by the formula`);
// one-to-one: unglue(f(p)) = ±p, rim included
const rim = Array.from({ length: 2000 }, (_, i) => { const a = (2 * Math.PI * i) / 2000; return [Math.cos(a), Math.sin(a), 0]; });
let worst = 0; for (const p of [...pts, ...rim, [0, 0, 1], [1, 0, 0], [0, 1, 0]]) { const q = C.unglue(C.f(p)), e = Math.min(C.norm(q.map((x, i) => x - p[i])), C.norm(q.map((x, i) => x + p[i]))); worst = Math.max(worst, e); }
ok(worst < 1e-6, `and it is one-to-one on the glued coin: from any image point the pair ±p comes back (worst error ${worst.toExponential(1)}, over ${N} random points, 2,000 on the rim, and the poles). So no two other points collide: in 4D it is RP², embedded, with no self-crossing`);
// immersion: on each tangent plane df has rank 2; its smallest stretch stays well away from 0
let minS = Infinity;
for (const p of [...pts.slice(0, 5000), ...rim]) {
  const a = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], t1 = (() => { const d = C.dot3(a, p), v = a.map((x, i) => x - d * p[i]), l = Math.hypot(...v); return v.map((x) => x / l); })();
  const t2 = [p[1] * t1[2] - p[2] * t1[1], p[2] * t1[0] - p[0] * t1[2], p[0] * t1[1] - p[1] * t1[0]];
  const u = C.df(p, t1), v = C.df(p, t2), g11 = u.reduce((s, x) => s + x * x, 0), g22 = v.reduce((s, x) => s + x * x, 0), g12 = u.reduce((s, x, i) => s + x * v[i], 0);
  const tr = g11 + g22, det = g11 * g22 - g12 * g12, lmin = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  minS = Math.min(minS, Math.sqrt(Math.max(0, lmin)));
}
ok(minS > 0.5 * C.SCALE, `it never folds or pinches: every direction on the sphere is stretched by at least ${(minS / C.SCALE).toFixed(3)}× (times the scale) into 4D, so the surface is smooth everywhere (an immersion; with one-to-one, an embedding)`);
// the derivative is the derivative
let dErr = 0; for (const p of pts.slice(0, 500)) { const v = sph(), h = 1e-6, a = C.f(p.map((x, i) => x + h * v[i])), b = C.f(p.map((x, i) => x - h * v[i])), num = a.map((x, i) => (x - b[i]) / (2 * h)), an = C.df(p, v); dErr = Math.max(dErr, C.norm(num.map((x, i) => x - an[i]))); }
ok(dErr < 1e-6, 'df is the derivative of f (against finite differences)');
// the slide: t = 0 is the coin (w = 0, flat), t = 1 puts every point on its opposite
const p0 = pts[0], m0 = p0.map((x) => -x);
ok(C.glued(p0, 0)[3] === 0 && Math.abs(C.glued(p0, 0)[2] - p0[2] * C.THICK) < 1e-15 && C.norm(C.add4(C.glued(p0, 1), C.glued(m0, 1), -1)) < 1e-12 && C.norm(C.add4(C.glued(p0, 0.5), C.glued(m0, 0.5), -1)) > 0.1,
  'gluing: at 0 it is the flat coin in our space, halfway each point and its opposite are still apart, at 1 they meet');
// the walk: pole to pole is a closed loop on the glued coin, and the frame comes back mirrored
{
  const a = C.walk(0), b = C.walk(1);
  const same = C.norm(C.add4(C.f(a.p), C.f(b.p), -1)) < 1e-12;
  // carried into 4D, at the end the forward arrow matches the start and the left arrow is reversed
  const F0 = C.df(a.p, a.fwd), L0 = C.df(a.p, a.left), F1 = C.df(b.p, b.fwd), L1 = C.df(b.p, b.left);
  ok(same && C.norm(C.add4(F1, F0, -1)) < 1e-12 && C.norm(C.add4(L1, L0, 1)) < 1e-12,
    'walk pole to pole: on the glued coin you are back where you started (the poles are one point), facing the same way, with left and right swapped: mirrored. Once more and you are yourself again');
  const c = C.walk(0.5), mid = C.f(c.p), start = C.f(a.p);
  ok(C.norm(C.add4(mid, start, -1)) > 1, 'and the halfway point really is elsewhere: the loop is a loop, not standing still');
}
// the face: tails shows heads half-turned, and the picture is one function on the glued coin
{
  const u = (x, y) => [x + 2 * y, y * y - x, 0.3];   // any picture
  ok(pts.slice(0, 2000).every((p) => { const a = C.faceAt(p, u), b = C.faceAt(p.map((x) => -x), u); return p[2] === 0 || a.every((x, i) => x === b[i]); }),
    'heads at (x, y) and tails at (−x, −y) show the same colour: the picture is half-turned on the back, and a point and its opposite always agree');
}
// flipping it
{
  const counts = { heads: 0, tails: 0 }; for (let k = 0; k < 1000; k++) counts[C.flip()]++;
  ok(counts.heads === 1000 && C.entropy(counts) === 0, 'flipped 1,000 times: 1,000 heads, 0 tails. Entropy 0 bits');
}
console.log(`${fails ? '✗' : '✓'} coin: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
