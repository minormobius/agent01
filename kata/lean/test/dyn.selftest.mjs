/* the bicycle's dynamics: the published benchmark, its 4D lift, the controller, both mechanisms on the track.
     node kata/lean/test/dyn.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const D = await import(path.join(here, "../js/dyn.js")), W = await import(path.join(here, "../js/world.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const { BENCH, PUBLISHED } = D, m = D.matrices(BENCH);

/* our world: the benchmark, from its parameters, against the paper's numbers */
{
  let worst = 0; for (const k of ["M", "C1", "K0", "K2"]) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) worst = Math.max(worst, Math.abs(m[k][i][j] - PUBLISHED[k][i][j]) / Math.max(1, Math.abs(PUBLISHED[k][i][j])));
  ok(worst < 1e-12, `M, C1, K0 and K2 built from the benchmark's parameters match Meijaard et al.'s published values (worst ${worst.toExponential(1)})`);
  const e0 = D.eigen(m, 0).map((z) => z[0]).sort((a, b) => a - b);
  ok([-5.530943717653934, -3.1316432479065557, 3.1316432479065557, 5.530943717653934].every((x, i) => Math.abs(e0[i] - x) < 1e-8), `standing still it falls: eigenvalues ±${e0[3].toFixed(4)}, ±${e0[2].toFixed(4)} (the paper's ±5.5309, ±3.1316)`);
  const r = D.stableRange(m);
  ok(Math.abs(r.weave - PUBLISHED.weave) < 1e-3 && Math.abs(r.capsize - PUBLISHED.capsize) < 1e-3, `it balances itself from ${r.weave.toFixed(4)} to ${r.capsize.toFixed(4)} m/s (the paper's weave and capsize speeds, ${PUBLISHED.weave} and ${PUBLISHED.capsize})`);
}

/* four dimensions: the y copy is the benchmark; the w copy of a bike built round is too; a bike built flat differs only
   by the rider's and fork's spread in y */
{
  const my = D.matrices(D.copyParams(BENCH, "y")), mr = D.matrices(D.copyParams(BENCH, "w", "round")), mf = D.matrices(D.copyParams(BENCH, "w", "flat"));
  const same = (A, B) => ["M", "C1", "K0", "K2"].every((k) => A[k].every((r, i) => r.every((x, j) => x === B[k][i][j])));
  ok(same(my, m) && same(mr, m), "the y copy is our bicycle, and so is the w copy of a bike built round (as wide in w as in y)");
  const rf = D.stableRange(mf), dM = mf.M[0][0] - m.M[0][0];
  ok(dM < 0 && Math.abs(dM + D.spreadY(BENCH.IBxx, BENCH.IByy, BENCH.IBzz) + D.spreadY(BENCH.IHxx, BENCH.IHyy, BENCH.IHzz)) < 1e-12 && rf.weave > PUBLISHED.weave,
    `a bike built flat (ours, in 4D) is lighter to roll into w by Σmy² = ${(-dM).toFixed(3)} kg m², so it falls faster that way; it balances itself into w from ${rf.weave.toFixed(3)} to ${rf.capsize.toFixed(3)} m/s`);
  // one-axis steering: with the steer locked, the lean into the frame's w is an inverted pendulum at every speed
  const rate = Math.sqrt(-(BENCH.g * mf.K0[0][0]) / mf.M[0][0]);
  ok([0, 3, 5, 8, 12].every((v) => rate > 3), `with the steer locked, a fall into the frame's w grows as e^(${rate.toFixed(2)} t) at every speed: one-axis steering can't catch it without twisting the frame`);
}

/* the steady turn: the dynamics' own lean for a curvature is our calibration tan φ = v²κ/g (to first order), corrected by
   two small terms the equations name: the spinning wheels (S_T, gyroscopic) and the front assembly's weight off the
   steering axis (S_A, trail and offset). Exactly: φ = (v²κ/g)(1 + S_T/(−m_T z_T)) + (S_A/(m_T z_T)) δ */
{
  const v = 5, kappa = 0.05, s = D.steady(m, BENCH, v, kappa), want = (v * v * kappa) / BENCH.g;
  const gyro = m.ST / (-m.mT * m.zT), offset = (m.SA / (m.mT * m.zT)) * s.delta, parts = want * (1 + gyro) + offset;
  ok(Math.abs(s.phi - parts) < 1e-12, `the steady lean decomposes exactly: v²κ/g, plus ${(gyro * 100).toFixed(2)}% for the wheels' spin, minus ${(-offset / want * 100).toFixed(2)}% for the front's weight off the steering axis`);
  ok(Math.abs(s.phi / want - 1) < 0.01, `so at ${v} m/s the dynamics lean ${((s.phi / want - 1) * 100).toFixed(2)}% off the calibration: the two corrections nearly cancel on the benchmark bike`);
}

/* the controller: stable at every speed, both copies, and it gets the lean asked for */
{
  let worst = -Infinity; const mf = D.matrices(D.copyParams(BENCH, "w", "flat"));
  for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9]) for (const mm of [m, mf]) worst = Math.max(worst, D.closedLoopMaxRe(mm, v, D.lqr(mm, v)));
  ok(worst < -0.5, `the LQR rider is stable from 1 to 9 m/s in both copies (slowest mode decays at ${(-worst).toFixed(2)}/s)`);
  const b = new D.Bike({ v: 5 }); b.place([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  // ask for a lean that turns with the bike (it's across the heading, so it stays the same lean as the bike turns)
  for (let i = 0; i < 300; i++) b.step(1 / 60, D.followLean ? [0, 0, 0].map((_, j) => b.c[j] * 0.15 + b.d[j] * 0.1) : null);
  const L = b.lean, e = Math.hypot(L[0] - (b.c[0] * 0.15 + b.d[0] * 0.1), L[1] - (b.c[1] * 0.15 + b.d[1] * 0.1), L[2] - (b.c[2] * 0.15 + b.d[2] * 0.1));
  ok(e < 0.005 && !b.crashed, `asked for a lean of 0.15 rad into y and 0.10 into w, it gets there (off by ${e.toFixed(4)} rad after 5 s)`);
}

/* both mechanisms ride the track: the autopilot (pure pursuit, leaning for the curvature it wants) */
{
  const g3 = (v) => [v[0], v[2], v[3]];
  const near = (pos, hint) => { let best = Infinity, bi = 0; for (let k = -60; k <= 60; k++) { const i = ((hint + k) % W.NS + W.NS) % W.NS, p = W.PTS[i], d = Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]); if (d < best) { best = d; bi = i; } } return { i: bi, d: best }; };
  const ahead = (i, L) => { let s = W.S[i] + L; s = ((s % W.LAP) + W.LAP) % W.LAP; let lo = 0, hi = W.NS; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (W.S[mid] <= s) lo = mid; else hi = mid; } return W.PTS[lo]; };
  for (const mech of ["two-axis", "one-axis"]) {
    const res = [];
    for (const v of [3, 5, 7]) {
      const b = new D.Bike({ mech, v }), f0 = W.frenet(0); b.place(W.PTS[0], g3(f0.T), g3(f0.N)); b.settle(D.followLean(b, ahead(0, D.lookahead(v))));
      let hint = 0, off = 0, cal = 0, ref = 0, n = 0, tw = 0;
      for (let t = 0; t < (2 * W.LAP) / v; t += 1 / 60) {
        const nr = near(b.pos, hint); hint = nr.i; b.step(1 / 60, D.followLean(b, ahead(nr.i, D.lookahead(v))));
        if (t > 2) { off = Math.max(off, nr.d); const k = Math.hypot(...b.curvature), phi = Math.hypot(...b.lean); cal += Math.abs(phi - (v * v * k) / 9.81); ref += (v * v * k) / 9.81; n++; tw = Math.max(tw, Math.abs(b.alphaDot)); }
        if (b.crashed) break;
      }
      res.push({ v, off, cal: cal / ref, tw, crashed: b.crashed, laps: b.dist / W.LAP });
    }
    ok(res.every((r) => !r.crashed && r.laps > 1.9 && r.off < W.R_TRACK), `${mech}: rides two laps at 3, 5 and 7 m/s without falling or leaving the track (furthest off the centreline ${res.map((r) => r.off.toFixed(2)).join(", ")} m)`);
    ok(res.every((r) => r.cal < 0.1), `${mech}: riding, its lean keeps to its own path's calibration v²κ/g, on average within ${res.map((r) => (r.cal * 100).toFixed(1) + "%").join(", ")} (the lean leads the turn it makes)`);
    if (mech === "one-axis") ok(res.every((r) => r.tw > 0.05 && r.tw < D.TWIST_MAX), `one-axis: the frame twists to keep its steering axis along the steer, at up to ${res.map((r) => r.tw.toFixed(2)).join(", ")} rad/s (it falls past ${D.TWIST_MAX})`);
  }
}
/* one-axis, asked to swap its lean from one side to the other across the frame in an instant: the steer swings round
   through a new direction, the frame can't twist that fast, and it falls; two-axis steering just does it */
{
  const swap = (mech) => { const b = new D.Bike({ mech, v: 5 }); b.place([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    for (let i = 0; i < 180; i++) b.step(1 / 60, b.c.map((x) => x * 0.25));
    for (let i = 0; i < 240 && !b.crashed; i++) b.step(1 / 60, b.d.map((x) => x * -0.3));
    return b; };
  const one = swap("one-axis"), two = swap("two-axis");
  ok(one.crashed && one.why === "twist" && !two.crashed, `swap a lean in y for one in w at once: one-axis falls (the frame can't twist fast enough), two-axis rides it out`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
