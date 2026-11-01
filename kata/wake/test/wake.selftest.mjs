/* WAKE's selftest: the hulls' hydrostatics (and which way each boat falls), the boat's steering and heel, Kelvin's cone,
   the lake, the eight courses (the oracle gets round each, par and difficulty as stored, getting harder), the made
   courses, and the shader's water.
     node kata/wake/test/wake.selftest.mjs */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), J = (f) => import(path.join(here, "../js", f));
const Bt = await J("boat.js"), Lk = await J("lake.js"), Wk = await J("wake.js"), O = await J("oracle.js"), L = await J("levels.js"), Gn = await J("gen.js");
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), deep = () => 50;

/* hydrostatics: a half-submerged 4D capsule, checked against a numerical integration; then which way each boat falls */
{
  const h = { o: [0, 0], L: 1.6, r: 0.4 }, H = Bt.hydro({ hulls: [h], zG: 0 });
  // integrate the submerged 4-volume and the waterplane's second moment on a grid (the capsule: within r of the axis
  // segment from (−L/2, 0, 0, 0) to (L/2, 0, 0, 0), along x; y down from the waterline; the waterplane is y = 0)
  const n = 36, R = h.r, X = h.L / 2 + R, dx = (2 * X) / n, dr = (2 * R) / n; let V = 0, I = 0, Wv = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const x = -X + (i + 0.5) * dx, a = -R + (j + 0.5) * dr, b = -R + (k + 0.5) * dr, ax = Math.max(0, Math.abs(x) - h.L / 2), q = ax * ax + a * a + b * b;
    if (q < R * R) { Wv += dx * dr * dr; I += a * a * dx * dr * dr; V += Math.sqrt(R * R - q) * dx * dr * dr; } // depth under (x, a, b)
  }
  ok(Math.abs(V / H.V - 1) < 0.01 && Math.abs(Wv / H.W - 1) < 0.01 && Math.abs(I / H.I[0][0] - 1) < 0.02, `a hull's volume, waterplane and its second moment match a numerical integration (${(V / H.V).toFixed(4)}, ${(Wv / H.W).toFixed(4)}, ${(I / H.I[0][0]).toFixed(4)})`);
  ok(Math.abs(H.BM[0][0] - H.zB) < 0.03 * H.zB, `a round hull floating at its axis has its metacentre at the axis (BM ${H.BM[0][0].toFixed(3)} ≈ the buoyancy's depth ${H.zB.toFixed(3)}): neutral, so the weight must sit below the waterline`);
  const t = Bt.principal(Bt.hydro(Bt.BOATS.triad).GM), c = Bt.hydro(Bt.BOATS.catamaran).GM, s = Bt.hydro(Bt.BOATS.skiff).GM;
  ok(Math.abs(t[0] - t[1]) < 1e-9 && t[1] > 1, `the triad's three hulls make GM the same every way across (${t[1].toFixed(2)} m): steady in y and w alike`);
  ok(c[0][0] > 5 && c[1][1] > 0 && c[1][1] < 0.1, `the catamaran is stiff across (GM ${c[0][0].toFixed(2)} m) and barely steady in w (${c[1][1].toFixed(3)} m)`);
  ok(s[0][0] > 1 && s[1][1] < 0, `the skiff, wide across and flat in w, has negative GM in w (${s[1][1].toFixed(2)} m): it falls kata or ana`);
  const sk = new Bt.Boat("skiff", [0, 0, 0], [1, 0, 0], [0, 1, 0]); for (let i = 0; i < 600 && !sk.capsized; i++) sk.step(1 / 60, [0, 0], 0, deep);
  ok(sk.capsized && Math.abs(sk.h[1]) > 5 * Math.abs(sk.h[0]), `left alone, the skiff capsizes into w within ${sk.t.toFixed(1)} s`);
}

/* the boat: the frame stays orthonormal and untwisted, a turn goes where the rudder says, and a turn heels it outward */
{
  const b = new Bt.Boat("triad", [0, 0, 0], [1, 0, 0], [0, 1, 0]); let ortho = 0, twist = 0;
  for (let i = 0; i < 600; i++) {
    const e1 = b.e1.slice(), e2 = b.e2.slice(); b.step(1 / 60, [0.6 * Math.cos(i / 90), 0.6 * Math.sin(i / 90)], 1, deep);
    ortho = Math.max(ortho, Math.abs(dot(b.T, b.e1)), Math.abs(dot(b.T, b.e2)), Math.abs(dot(b.e1, b.e2)), Math.abs(Math.hypot(...b.e2) - 1));
    twist = Math.max(twist, Math.abs(dot(b.e1.map((x, k) => x - e1[k]), e2)) * 60);
  }
  ok(ortho < 1e-9 && twist < 1e-3, `the boat's frame stays orthonormal and doesn't twist about its heading (worst ${twist.toExponential(1)} rad/s)`);
  const c = new Bt.Boat("triad", [0, 0, 0], [1, 0, 0], [0, 1, 0]); for (let i = 0; i < 300; i++) c.step(1 / 60, [0, 0], 1, deep);
  const T0 = c.T.slice(), e2 = c.e2.slice(); for (let i = 0; i < 90; i++) c.step(1 / 60, [0, 1], 1, deep);
  ok(dot(c.T, e2) > 0.5 && Math.abs(dot(c.T, c.e1)) < 1e-6, `the rudder at e2 turns the bow into e2 alone (${(Math.acos(dot(c.T, T0)) * 180 / Math.PI).toFixed(0)}° in 1.5 s)`);
  ok(c.h[1] < 0 && Math.abs(c.h[0]) < 1e-9, `turning into e2 heels the boat the other way, outward (heel ${c.h[1].toFixed(3)} rad)`);
  const cam = Bt.camFrame(c.T, c.e1, c.e2);
  ok(Math.abs(Math.abs(dot(cam.ana, c.e2)) - 1) < 1e-9, "the camera's ana is the boat's e2, so the stick's up turns the bow ana");
  const s = Bt.hydro(Bt.BOATS.catamaran), cat = new Bt.Boat("catamaran", [0, 0, 0], [1, 0, 0], [0, 1, 0]); for (let i = 0; i < 360; i++) cat.step(1 / 60, [0, 0], 1, deep);
  const slow = new Bt.Boat("catamaran", [0, 0, 0], [1, 0, 0], [0, 1, 0]); for (let i = 0; i < 360; i++) slow.step(1 / 60, [0, 0], 0.4, deep);
  for (let i = 0; i < 600; i++) { cat.step(1 / 60, [0, 1], 1, deep); slow.step(1 / 60, [0, 1], 0.4, deep); }
  const flat = new Bt.Boat("catamaran", [0, 0, 0], [1, 0, 0], [0, 1, 0]); for (let i = 0; i < 960; i++) flat.step(1 / 60, i < 360 ? [0, 0] : [1, 0], 1, deep);
  ok(cat.capsized && !slow.capsized && !flat.capsized, `the catamaran: a full-speed hard turn into w capsizes it; at 40% throttle it holds (heel ${Math.hypot(...slow.h).toFixed(2)}); a hard turn across never does (GM ${s.GM[0][0].toFixed(1)} m)`);
  const g = new Bt.Boat("triad", [0, 0, 0], [1, 0, 0], [0, 1, 0]); let touched = false, far = 0;
  for (let i = 0; i < 300; i++) { g.step(1 / 60, [0, 0], 1, (q) => (q[0] > 4 ? 0.1 : 5)); touched ||= g.aground; far = Math.max(far, g.pos[0]); }
  ok(touched && far < 4, "the boat won't sail into the shallows: it stops short and backs off");
}

/* Kelvin's cone: every remembered sphere subtends asin(1/3) from the boat, in any direction across, at any speed */
{
  const hist = [], b = { pos: [0, 0, 0], T: [1, 0, 0], u: 4.5 };
  for (let t = 0; t <= 9; t += 0.05) { b.pos = [4.5 * t, 0, 0]; Wk.remember(hist, b, t); }
  const S = Wk.shells(hist, 9); let worst = 0;
  for (const s of S) { const D = Math.hypot(...s.c.map((x, i) => b.pos[i] - x)); if (s.r > 0.5) worst = Math.max(worst, Math.abs(Math.asin(s.r / D) - Wk.ALPHA)); }
  // the envelope: 20 m astern, the outermost point of any sphere (spheres about the track: the same whichever way across)
  let m = 0; for (const s of S) { const x = b.pos[0] - 20 - s.c[0]; if (Math.abs(x) < s.r) m = Math.max(m, Math.sqrt(s.r * s.r - x * x)); }
  ok(worst < 1e-9 && S.length >= 20, `each of the wake's ${S.length} spheres subtends asin(1/3) = ${(Wk.ALPHA * 180 / Math.PI).toFixed(2)}° from the boat`);
  ok(Math.abs(m / 20 - Math.tan(Wk.ALPHA)) < 0.02, `20 m astern the wake reaches ${m.toFixed(2)} m out: tan 19.47° × 20 = ${(20 * Math.tan(Wk.ALPHA)).toFixed(2)} m, the same every way round (a cone, not a wedge)`);
}

/* the lake and the courses: every course sound, the oracle gets round each, par and difficulty as stored, rising */
{
  const got = [];
  for (const [i, l] of L.LEVELS.entries()) {
    const P = Lk.place(l), c = Lk.check(P), s = O.solve(P);
    ok(c.ok && s.solvable && Math.abs(s.par - l.par) < 0.06 && Math.abs(s.score - l.score) < 0.006, `course ${i + 1}, ${l.name} (${l.boat}): ${c.ok ? "sound" : c.probs.join("; ")}, the oracle round in ${s.par} s (stored ${l.par}), difficulty ${s.score} (stored ${l.score}); τ⋆ ${s.tau?.toFixed(1)} s`);
    got.push(s.score);
  }
  ok(got.every((s, i) => i === 0 || s > got[i - 1]), `the courses get harder, every one: ${got.join(" < ")}`);
  const P = Lk.place(L.LEVELS[1]), isl = P.islands[0];
  ok(Lk.heightAt(P, isl.c) > 2 && Lk.depthAt(P, Lk.MID.map((x, i) => x + [-60, 0, 0][i])) > 2.5 && Lk.heightAt(P, [5, 80, 48]) > 5, "the lake: an island stands out of the water, open water is deep, the shore climbs to walls");
  const B = Lk.bake(P), [NX, NZ] = Lk.HN, g = [37, 61, 29];
  ok(Math.abs(B.H[g[0] + NX * (g[1] + NZ * g[2])] - Lk.heightAt(P, g)) < 1e-4 && B.L > 0.4 && B.L <= 3, `the baked heights are the lake's own; the march's slope bound ${B.L.toFixed(2)}`);
}

/* made courses: the same seed and tier make the same course; every one sound and got round; harder tiers harder */
{
  const a = Gn.make(11, 0.5), b = Gn.make(11, 0.5);
  ok(a && b && JSON.stringify(a.buoys) === JSON.stringify(b.buoys) && a.sol.par === b.sol.par, "the same seed and tier make the same course");
  const avg = {};
  for (const [name, t] of Object.entries(Gn.TIERS)) {
    let sum = 0, n = 0, bad = 0;
    for (let s = 1; s <= 8; s++) { const m = Gn.make(300 + s, t); if (!m || !Lk.check(Lk.place(m)).ok || !O.ride(m).done) { bad++; continue; } sum += m.sol.score; n++; }
    avg[name] = n ? sum / n : NaN; ok(bad === 0, `${name}: eight made courses, all sound and got round (average difficulty ${avg[name].toFixed(2)})`);
  }
  ok(avg.easy < avg.medium && avg.medium < avg.hard, `harder tiers are harder: ${avg.easy.toFixed(2)} < ${avg.medium.toFixed(2)} < ${avg.hard.toFixed(2)}`);
}

/* the shader: the water's arrays hold what the page sends, and the boat fits the bike's capsule array */
{
  const src = fs.readFileSync(path.join(here, "../../lean/js/render.js"), "utf8"), n = (re) => +(src.match(re) || [])[1];
  ok(n(/uWk\[(\d+)\]/) >= Wk.N_SHELLS && n(/uWkT\[(\d+)\]/) >= Wk.N_SHELLS && n(/uBuoy\[(\d+)\]/) >= Math.max(...L.LEVELS.map((l) => l.buoys.length)), `the shader holds ${Wk.N_SHELLS} wake spheres and every course's buoys`);
  const most = Math.max(...Object.keys(Bt.BOATS).map((k) => new Bt.Boat(k, [0, 0, 0], [1, 0, 0], [0, 1, 0]).parts().caps.length));
  ok(most <= 24, `every boat is at most 24 capsules (the most: ${most})`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
