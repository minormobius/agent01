/* TAILSPIN's selftest: the courses, the ten levels (each one the oracle finishes, scored as stored, getting harder),
   the stick's meaning, the made levels, and the kerbs' direction data.
     node kata/tailspin/test/tailspin.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), J = (f) => import(path.join(here, "../js", f));
const C = await J("course.js"), O = await J("oracle.js"), L = await J("levels.js"), Gn = await J("gen.js"), W = await import(path.join(here, "../../lean/js/world.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/* the courses: the rider's frame carried without twisting, the bend it asks for the bend it has, eased, squared to the grid */
{
  const segs = [{ len: 15 }, { len: 30, r: 12, dir: 60 }, { len: 30, r: 14, dir: 200, twist: 5 }, { len: 10 }], c = C.build(segs, 3);
  let ortho = 0, hand = 0, twist = 0, bend = 0, jump = 0;
  for (let i = 1; i + 1 < c.fr.length; i++) {
    const f = c.fr[i]; ortho = Math.max(ortho, Math.abs(dot(f.T, f.e1)), Math.abs(dot(f.T, f.e2)), Math.abs(dot(f.e1, f.e2)), Math.abs(Math.hypot(...f.e1) - 1));
    hand = Math.max(hand, Math.hypot(...cross(f.e1, f.T).map((x, j) => x - f.e2[j])));
    // no twist: e1's change along the course has nothing along e2
    twist = Math.max(twist, Math.abs(dot(c.fr[i + 1].e1.map((x, j) => (x - c.fr[i - 1].e1[j]) / (2 * C.DS)), f.e2)));
    // the polyline's own curvature vector, against the bend asked for, in the rider's frame
    const p0 = c.pts[i - 1], p1 = c.pts[i], p2 = c.pts[i + 1], k = [0, 1, 2].map((j) => (p2[j] - 2 * p1[j] + p0[j]) / (C.DS * C.DS));
    bend = Math.max(bend, Math.abs(dot(k, f.e1) - c.bend[i][0]), Math.abs(dot(k, f.e2) - c.bend[i][1]));
    jump = Math.max(jump, Math.hypot(c.bend[i][0] - c.bend[i - 1][0], c.bend[i][1] - c.bend[i - 1][1]) / C.DS);
  }
  ok(ortho < 1e-9 && hand < 1e-9, "the rider's frame stays orthonormal, ana = right × forward (the camera's handedness)");
  ok(twist < 2e-3, `the frame is carried without twisting about the track (worst ${twist.toExponential(1)} rad/m)`);
  ok(bend < 2e-3, `the course bends as asked, in the rider's frame (worst ${bend.toExponential(1)} /m)`);
  ok(jump < 0.08, `bends ease in: the curvature asked for changes by at most ${jump.toFixed(3)} /m per metre, never a jump`);
  const f0 = c.fr[0], axis = (v) => v.filter((x) => Math.abs(Math.abs(x) - 1) < 1e-12).length === 1 && v.filter((x) => Math.abs(x) < 1e-12).length === 2;
  ok(axis(f0.T) && axis(f0.e1) && axis(f0.e2), "a course starts squared to the grid (so its centre line and kerbs are crisp)");
}

/* the ten levels: each fits the stadium, the oracle finishes it, its stored score is the oracle's, and they get harder */
{
  const got = [];
  for (const [i, l] of L.LEVELS.entries()) {
    const c = C.build(l.segs, l.R), f = C.fits(c), d = O.difficulty(c);
    ok(f.ok && d.solvable && Math.abs(d.score - l.score) < 0.006, `level ${i + 1}, ${l.name}: fits (${f.inBasin.toFixed(2)} of the basin, ${f.clearance.toFixed(0)} m clear of itself), the oracle rides it, difficulty ${d.score} (stored ${l.score}); τ⋆ ${d.tau.toFixed(3)} s`);
    got.push(d.score);
  }
  ok(got.every((s, i) => i === 0 || s > got[i - 1]), `the levels get harder, every one: ${got.join(" < ")}`);
}

/* the stick: up is ana. The camera rides in the bike's non-twisting pair, its ana the course's e2, and on level 3 (a bend
   ana) the lean the oracle asks for points up the stick */
{
  const l = L.LEVELS[2], c = C.build(l.segs, l.R), b = O.startBike(c, 0), to4 = (v) => [v[0], 0, v[1], v[2]];
  const R = to4(b.c), F = to4(b.T); let N = to4(b.d);
  const det = R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]); if (det < 0) N = N.map((v) => -v);
  const Ng = [N[0], N[2], N[3]];
  ok(dot(Ng, c.fr[0].e2) > 0.999999, "the camera's ana is the course's e2, so a segment's direction 90 is stick up");
  const i = Math.round(40 / C.DS), b2 = O.startBike(c, i), want = O.pursuit(b2, b2.pos, b2.T, c.pts[i + Math.round(5 / C.DS)]);
  ok(dot(want, c.fr[i].e2) > 0 && Math.abs(dot(want, c.fr[i].e2)) > 5 * Math.abs(dot(want, c.fr[i].e1)), "in level 3's ana bend the lean to ride it points up the stick, not across");
}

/* made levels: the same seed and tier make the same course; every one fits and the oracle rides it; harder tiers score
   higher on average */
{
  const a = Gn.make(42, 0.5), b = Gn.make(42, 0.5);
  ok(JSON.stringify(a.segs) === JSON.stringify(b.segs) && a.R === b.R, "the same seed and tier make the same course");
  const avg = {};
  for (const [name, t] of Object.entries(Gn.TIERS)) {
    let sum = 0, n = 0, bad = 0;
    for (let s = 1; s <= 6; s++) { const m = Gn.make(1000 + s, t); if (!m || !C.fits(m.C).ok || !O.ride(m.C, 0).done) { bad++; continue; } sum += O.difficulty(m.C, { step: 0.05 }).score; n++; }
    avg[name] = n ? sum / n : NaN; ok(bad === 0, `${name}: six made courses, all fitting and all ridden by the oracle (average difficulty ${avg[name].toFixed(2)})`);
  }
  ok(avg.easy < avg.medium && avg.medium < avg.hard, `harder tiers are harder: ${avg.easy.toFixed(2)} < ${avg.medium.toFixed(2)} < ${avg.hard.toFixed(2)}`);
  ok(Gn.todaySeed(new Date(Date.UTC(2026, 10, 1))) === 20261101, "today's seed is the date");
}

/* the kerbs' direction data, and a level switch leaving the stadium as it was */
{
  const l = L.LEVELS[6], c = C.build(l.segs, l.R), T = W.trackCells(c.poly), A = W.trackBins(T), tab = W.binTangents(c.poly);
  let onTrack = 0, binned = 0; for (let k = 0; k < T.idx.length; k++) if (T.d[k] < T.R) { onTrack++; if (A[T.idx[k]] > 0) binned++; }
  let unitOK = true; for (let b = 1; b <= W.BINS; b++) if (Math.abs(Math.hypot(tab[4 * b], tab[4 * b + 2], tab[4 * b + 3]) - 1) > 1e-6 || tab[4 * b + 1] !== 0) unitOK = false;
  const mid = Math.round(((100.5 / W.BINS) * c.len) / C.DS), tb = [tab[4 * 101], tab[4 * 101 + 2], tab[4 * 101 + 3]];
  ok(binned === onTrack && unitOK && dot(tb, c.fr[mid].T) > 0.999, `every track cell has its place along the course, and each place the course's direction there (${W.BINS} of them)`);
  const H0 = W.rimTerrain(1), H = H0.slice(); W.markTrack(H, T); const marked = H.some((v, i) => v !== H0[i]); W.unmarkTrack(H, T);
  ok(marked && H.every((v, i) => v === H0[i]), "marking a level's track and taking it off leaves the stadium exactly as it was");
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
