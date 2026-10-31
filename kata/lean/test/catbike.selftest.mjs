/* the Cheshire cat on its bicycle: the cat is games/cheshire's, the bike the benchmark scaled to it, the tail its twist.
     node kata/lean/test/catbike.selftest.mjs */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const CB = await import(path.join(here, "../js/catbike.js")), C = await import(path.join(here, "../js/cat.js")), D = await import(path.join(here, "../js/dyn.js")), W = await import(path.join(here, "../js/world.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };

/* js/cat.js is games/cheshire's cat (a static site can't import across surfaces): byte-identical. Edit the cat lab's
   and copy it here, never the other way */
{
  const ours = fs.readFileSync(path.join(here, "../js/cat.js"), "utf8"), theirs = path.join(here, "../../../games/cheshire/js/cat.js");
  ok(!fs.existsSync(theirs) || fs.readFileSync(theirs, "utf8") === ours, "js/cat.js is byte-identical to games/cheshire/js/cat.js (copy the cat lab's over it)");
}

/* the bike, the benchmark scaled to the cat: lengths × s, masses × s³, inertias × s⁵ make time go as √s, so every speed
   scales by √s exactly */
{
  const s = CB.SCALE, rb = D.stableRange(D.matrices(D.BENCH)), m = D.matrices(CB.catBench()), rc = D.stableRange(m);
  ok(Math.abs(rc.weave / rb.weave - Math.sqrt(s)) < 1e-6 && Math.abs(rc.capsize / rb.capsize - Math.sqrt(s)) < 1e-6, `a bike ${s}× ours balances itself between ${rc.weave.toFixed(2)} and ${rc.capsize.toFixed(2)} m/s: ours × √${s}, as the scaling says`);
  const fall = Math.max(...D.eigen(m, 0).map((z) => z[0]));
  ok(Math.abs(fall - 5.530943717653934 / Math.sqrt(s)) < 1e-6, `standing still it falls as e^(${fall.toFixed(2)} t), ${(1 / Math.sqrt(s)).toFixed(2)}× faster than ours: the cat has to be quicker`);
  ok(CB.CAT_V > rc.weave && CB.CAT_V < rc.capsize, `it rides at ${CB.CAT_V} m/s, inside that band`);
  let worst = -Infinity; for (const v of [2, 2.5, 3, 3.5, 4]) worst = Math.max(worst, D.closedLoopMaxRe(m, v, D.lqr(m, v)));
  ok(worst < -0.5, `the LQR rider holds it from 2 to 4 m/s (slowest mode decays at ${(-worst).toFixed(2)}/s)`);
}

/* the cat on it: front paws on the grips across z, hind paws on the pedals across w, through a whole crank turn */
{
  let miss = 0, stretch = 0, gripZ = Infinity, pedalW = Infinity;
  for (let k = 0; k < 36; k++) {
    const ph = (k / 36) * 2 * Math.PI, P = CB.catOnBike(ph, 0), fl = P.caps.filter((c) => c.g === "front legs"), hl = P.caps.filter((c) => c.g === "hind legs"), paws = P.ells.filter((e) => e.foot);
    for (let j = 0; j < 2; j++) { const end = fl[2 * j + 1].b, pw = paws[j].c; miss = Math.max(miss, Math.hypot(end[0] - (pw[0] - 0.012), end[1] - (pw[1] + 0.003), end[2] - pw[2], end[3] - pw[3])); }
    for (let j = 0; j < 2; j++) { const c3 = hl[3 * j + 2]; stretch = Math.max(stretch, Math.abs(Math.hypot(...c3.b.map((x, i) => x - c3.a[i])) - Math.hypot(0.03, 0.041, 0.002))); }
    gripZ = Math.min(gripZ, Math.abs(paws[0].c[2]), Math.abs(paws[1].c[2])); pedalW = Math.min(pedalW, Math.abs(paws[2].c[3]), Math.abs(paws[3].c[3]));
  }
  ok(miss < 1e-9 && stretch < 1e-9, "its front paws reach the grips and its hind legs the pedals all the way round a crank turn (no leg stretched)");
  ok(Math.abs(gripZ - CB.GEO.grip) < 1e-12 && Math.abs(pedalW - CB.GEO.pedalW) < 1e-12 && gripZ > 0.08 && pedalW > 0.1, `front paws ±${(CB.GEO.grip * 100).toFixed(1)} cm across z on the bar, hind paws ±${(CB.GEO.pedalW * 100).toFixed(0)} cm across w on the pedals: where the cat's own stance puts them`);
  let n = 0, R = 0;
  for (let k = 0; k < 24; k++) { const P = CB.catOnBike(k * 0.7, k * 1.3); n = Math.max(n, P.caps.length, P.ells.length > C.LIMITS.ells ? 99 : 0);
    for (const c of P.caps) for (const x of [c.a, c.b]) R = Math.max(R, Math.hypot(...x.map((q, i) => q - CB.CAT_MID[i])) + Math.max(c.ra, c.rb));
    for (const e of P.ells) R = Math.max(R, Math.hypot(...e.c.map((q, i) => q - CB.CAT_MID[i])) + Math.max(...e.r)); }
  ok(n <= C.LIMITS.caps && R + C.K < CB.CAT_BOUND, `the posed cat fits the shader (≤ ${C.LIMITS.caps} capsules) and its bounding ball, its whirling tail too (out to ${(R + C.K).toFixed(2)} of ${CB.CAT_BOUND} m)`);
}

/* the tail: it carries the twist's angular momentum. Its share of Σm(z² + w²) is tiny, so it turns far further */
{
  const I = CB.twistInertias();
  ok(I.ratio > 100 && I.ratio < 300, `the body's twist inertia is ${I.ratio.toFixed(0)}× the tail's: the tail turns ${I.ratio.toFixed(0)}× as far as the frame, the other way`);
  // the tail swept round keeps its own inertia (it's round in z and w): any angle, the same
  const a = CB.twistInertias(CB.catOnBike(0, 0)).tail, b = CB.twistInertias(CB.catOnBike(0, 2.1)).tail;
  ok(Math.abs(a - b) < 1e-12 * Math.max(a, 1e-9) + 1e-15, "the swept tail's twist inertia is the same at every angle round z and w (it's a rotor)");
  // ridden round the track at its speed by the autopilot: it stays on, and the tail spins at most so fast
  const g3 = (v) => [v[0], v[2], v[3]], bike = new D.Bike({ P: CB.catBench(), mech: "one-axis", v: CB.CAT_V }), f0 = W.frenet(0);
  bike.place(W.PTS[0], g3(f0.T), g3(f0.N));
  const near = (pos, hint) => { let best = Infinity, bi = 0; for (let k = -80; k <= 80; k++) { const i = ((hint + k) % W.NS + W.NS) % W.NS, p = W.PTS[i], d = Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]); if (d < best) { best = d; bi = i; } } return { i: bi, d: best }; };
  const ahead = (i, L) => { let s = W.S[i] + L; s = ((s % W.LAP) + W.LAP) % W.LAP; let lo = 0, hi = W.NS; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (W.S[mid] <= s) lo = mid; else hi = mid; } return W.PTS[lo]; };
  bike.settle(D.followLean(bike, ahead(0, D.lookahead(bike.v))));
  let hint = 0, off = 0, tw = 0;
  for (let t = 0; t < W.LAP / CB.CAT_V; t += 1 / 60) { const nr = near(bike.pos, hint); hint = nr.i; bike.step(1 / 60, D.followLean(bike, ahead(nr.i, D.lookahead(bike.v)))); if (t > 2) { off = Math.max(off, nr.d); tw = Math.max(tw, Math.abs(bike.alphaDot)); } if (bike.crashed) break; }
  ok(!bike.crashed && off < W.R_TRACK, `the cat rides a lap at ${CB.CAT_V} m/s, one-axis, within ${off.toFixed(2)} m of the centreline`);
  ok(tw > 0 && (tw * I.ratio) / (2 * Math.PI) < 10, `its frame twists at up to ${tw.toFixed(3)} rad/s, so its tail whirls at up to ${((tw * I.ratio) / (2 * Math.PI)).toFixed(1)} turns a second`);
}

/* the shader draws the cat with cat.js's own formulas: its material thresholds are cat.js's MAT */
{
  const src = fs.readFileSync(path.join(here, "../js/render.js"), "utf8");
  ok(C.MAT.mouth === 5 && C.MAT.grin === 3 && C.MAT.pink === 1 && C.MAT.eye === 2 && src.includes("if (m > 4.5) C = max(C, -d); else if (m >= 3.) cHard(E, N, d, m); else if (m >= 1.) cHard(D, M, d, m); else cBlend(F, d, uCK * (1. - m));") && src.includes("uniform vec4 uCA[48]") && src.includes("uCEc[18]") && C.LIMITS.caps === 48 && C.LIMITS.ells === 18,
    "the shader's cat joins its parts as cat.js does (mouth carved, grin and skin hard, fur smooth within K), with cat.js's array sizes");
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
