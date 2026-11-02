/* SQUID's selftest: the frame stays orthonormal and never rolls, the funnel steers in all three directions across
   (ana and kata as well as right and up), the Munk moment makes a folded squid run away from its course and spread arms
   bring it back, the top speed, and the sea.
     node kata/squid/test/squid.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), S = await import(path.join(here, "../js/squid.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* the frame: orthonormal, and no roll: R, U and N never turn among themselves */
{
  const q = new S.Squid(); let ortho = 0, roll = 0;
  for (let i = 0; i < 1200; i++) {
    const t = i / 60, before = q.across.map((e) => e.slice()), aim = [Math.sin(t), Math.cos(1.3 * t), Math.sin(0.7 * t)];
    q.step(1 / 60, aim, true, 1);
    const B = [q.F, q.R, q.U, q.N]; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) ortho = Math.max(ortho, Math.abs(dot(B[a], B[b]) - (a === b ? 1 : 0)));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) roll = Math.max(roll, Math.abs(dot(q.across[a], before[b]) - dot(q.across[b], before[a])) * 30); // a roll is the antisymmetric part
  }
  ok(ortho < 1e-9, "the frame (heading, right, up, ana) stays orthonormal through 20 s of steering");
  ok(roll < 1e-6, `no roll: the three directions across never turn among themselves (worst ${roll.toExponential(1)} rad/s), only toward and away from the heading`);
}

/* the funnel steers in all three directions across: aimed right, up or ana, the heading turns that way */
{
  const res = [0, 1, 2].map((k) => { const q = new S.Squid(), aim = [0, 0, 0]; aim[k] = 1; const e0 = q.across[k].slice(), F0 = q.F.slice(); for (let i = 0; i < 90; i++) q.step(1 / 60, aim, true, 1); return { toward: dot(q.F, e0), others: [0, 1, 2].filter((j) => j !== k).map((j) => Math.abs(dot(q.F, new S.Squid().across[j]))), F0: dot(q.F, F0) }; });
  ok(res.every((r) => r.toward > 0.3 && r.others.every((o) => o < 1e-9)), `aimed right, up or ana, the jet turns the heading that way alone (${res.map((r) => (Math.asin(Math.min(1, r.toward)) * 180 / Math.PI).toFixed(0) + "°").join(", ")} in 1.5 s): three directions to aim, where our squid has two`);
  // held ana, it loops in the plane of its heading and w (as a held rudder circles), passing through heading straight into w
  const q = new S.Squid(); let most = 0, when = 0; for (let i = 0; i < 600; i++) { q.step(1 / 60, [0, 0, 1], true, 1); const fw = dot(q.F, [0, 0, 0, 1]); if (fw > most) { most = fw; when = q.t; } }
  ok(most > 0.99, `held ana, it loops through heading straight into w (the heading's w part reaches ${most.toFixed(3)} after ${when.toFixed(1)} s)`);
}

/* the Munk moment: knocked a little off its line at speed, a folded squid's heading runs away from its velocity; with
   its arms spread it comes back */
{
  const slipAfter = (arms) => { const q = new S.Squid(); for (let i = 0; i < 360; i++) q.step(1 / 60, [0, 0, 0], true, arms); q.w = [0.25, 0, 0.12]; let mx = 0; for (let i = 0; i < 120; i++) { q.step(1 / 60, [0, 0, 0], true, arms); mx = Math.max(mx, q.slip()); } return { end: q.slip(), mx, u: Math.hypot(...q.v) }; };
  const folded = slipAfter(0), spread = slipAfter(1);
  ok(folded.end > 3 * spread.end && spread.end < 0.05, `knocked off line at ${folded.u.toFixed(1)} m/s: arms folded, the heading runs ${(folded.end * 180 / Math.PI).toFixed(0)}° off the velocity (the Munk moment); arms spread, it settles back to ${(spread.end * 180 / Math.PI).toFixed(1)}°`);
  const speed = (arms) => { const q = new S.Squid(); let s = 0, n = 0; for (let i = 0; i < 1800; i++) { q.step(1 / 60, [0, 0, 0], true, arms); if (i > 1200) { s += Math.hypot(...q.v); n++; } } return s / n; };
  const sf = speed(0), ss = speed(1);
  ok(sf > ss * 1.15 && ss > 2.5 && sf < 12, `folded is faster: ${sf.toFixed(1)} m/s against ${ss.toFixed(1)} spread, jetting straight`);
}

/* the sea: big, apart, clear of the start; a chase of eight, each a fair swim from the last */
{
  const J = S.sea(1), C = S.course(J, 1);
  let close = Infinity; for (let a = 0; a < J.length; a++) for (let b = a + 1; b < J.length; b++) close = Math.min(close, Math.hypot(...J[a].p.map((x, i) => x - J[b].p[i])) - J[a].r - J[b].r);
  // how many cut a slice through the middle (w = 0), and how many more glow just outside it (within 30 m)
  const cut = J.filter((j) => Math.abs(j.p[3]) < j.r).length, halo = J.filter((j) => Math.abs(j.p[3]) >= j.r && Math.abs(j.p[3]) < j.r + 30).length;
  ok(J.length === 208 && J.filter((j) => j.giant).length === 8 && J.every((j) => j.r >= 4 && Math.hypot(...j.p) <= S.ARENA && (j.giant || Math.hypot(...j.p) >= 18)) && close >= 4, `200 jellies, 4 to 14 m across, and 8 giants (18 m) at ±70 m along each axis, at least ${close.toFixed(1)} m apart, none within 18 m of the start`);
  ok(cut >= 20 && halo >= 60, `a slice through the middle cuts ${cut} jellies and has ${halo} more glowing within 30 m of it: a sea you can get your bearings in`);
  ok(C.length === 8 && new Set(C).size === 8 && C.every((n) => !J[n].giant) && Math.abs(J[C[0]].p[3]) < J[C[0]].r, `a chase of eight jellies, the first in your starting slice: ${C.join(", ")}`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
