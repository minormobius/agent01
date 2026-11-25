// FLY's selftest: the planet (a 3-sphere), its grids, its cities, the curved renderer, flight round it, beacons.
import * as Y from '../js/fly.js';
import { readFileSync } from 'node:fs';
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const g = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return u - 3; };
const unit = () => { const v = [g(), g(), g(), g()], l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const t0 = Date.now(), wd = Y.buildWorld(1), tb = Date.now() - t0;
// the vendored city engine is packages/morph's, byte for byte
{
  const same = ['geom.js', 'morph.js', 'rand.js'].every((f) => readFileSync(new URL(`../vendor/morph/${f}`, import.meta.url), 'utf8') === readFileSync(new URL(`../../../packages/morph/${f}`, import.meta.url), 'utf8'));
  ok(same, 'vendor/morph is packages/morph byte for byte (geom, morph, rand; kept so by scripts/sync-dataviz.mjs)');
}
// the tesseract map
{
  let rt = 0; for (let k = 0; k < 2000; k++) { const P = unit(), { c, g: q } = Y.locate(P), Q = Y.nodeDir(c, ...q); rt = Math.max(rt, Math.hypot(...P.map((x, i) => x - Q[i]))); }
  ok(rt < 1e-12, `the tesseract map: every point of the sphere lands in one cell's grid, and the grid point takes it back (to ${rt.toExponential(0)})`);
  // continuity across cells: two points 1 cm apart either side of a cell boundary have nearly the same ground
  let jump = 0; for (let k = 0; k < 2000; k++) { const P = unit(), ax = [0, 1, 2, 3].sort((a, b) => Math.abs(P[b]) - Math.abs(P[a])); const Q = P.slice(); Q[ax[1]] = Math.sign(P[ax[1]] || 1) * Math.abs(P[ax[0]]); const l = Math.hypot(...Q), B = Q.map((x) => x / l), d = 0.01 / Y.R0; const B2 = B.map((x, i) => x + (i === ax[1] ? d : 0)), l2 = Math.hypot(...B2); jump = Math.max(jump, Math.abs(Y.ground(wd, B, false).land - Y.ground(wd, B2.map((x) => x / l2), false).land)); }
  ok(jump < 0.5, `the ground is continuous across the eight cells' faces (1 cm across a face moves it at most ${jump.toFixed(3)} m)`);
  let ge = 0; for (let k = 0; k < 3000; k++) { const c = Math.floor(rnd() * 8), i = Math.floor(rnd() * Y.M), j = Math.floor(rnd() * Y.M), kk = Math.floor(rnd() * Y.M), P = Y.nodeDir(c, i, j, kk), inCity = wd.cities.some((t) => dot(P, t.C) > Math.cos(560 / Y.R0)); if (inCity) continue; ge = Math.max(ge, Math.abs(wd.h[c * Y.M ** 3 + (kk * Y.M + j) * Y.M + i] - Y.rawHeight(P, 1))); }
  const water = wd.h.filter((e) => e < wd.sea).length / wd.h.length;
  ok(ge < 1e-3 && Math.abs(water - 0.14) < 0.01, `the grids hold the 4D noise at every node checked (to ${ge.toExponential(0)} m; built in ${tb} ms), sea where 14% of them lie (${(water * 100).toFixed(1)}%)`);
}
// the cities
{
  const nat = wd.cities.find((t) => t.kind === 'native'), mor = wd.cities.find((t) => t.kind === 'morph'), far = wd.cities.length < 2 || dot(wd.cities[0].C, wd.cities[1].C) < Math.cos(1.4);
  const at = (t, u, v, w) => { const q = t.C.map((x, i) => x + (u * t.e[0][i] + v * t.e[1][i] + w * t.e[2][i]) / Y.R0), l = Math.hypot(...q); return q.map((x) => x / l); };
  let flat = 0; for (const t of wd.cities) for (let k = 0; k < 300; k++) { const d = [g(), g(), g()], l = Math.hypot(...d), r = 320 * Math.cbrt(rnd()); flat = Math.max(flat, Math.abs(Y.ground(wd, at(t, ...d.map((x) => (x / l) * r)), false).land - t.base)); }
  ok(nat && mor && nat.count > 2000 && mor.count > 300 && far && flat < 1e-3, `two cities, far apart: a native 4D one (${nat.count} plots) and a studio plan laid in layers (${mor.count} buildings); the land within 320 m of each is level (to ${flat.toExponential(0)} m)`);
  // a 2D plane through the centre, at random orientation in the 3D ground: how much of it is built on
  const share = (t, A, B, R = 300, n = 1500) => { let f = 0; for (let k = 0; k < n; k++) { const a = (rnd() - 0.5) * R, b = (rnd() - 0.5) * R; if (Y.buildingAt(wd, at(t, a * A[0] + b * B[0], a * A[1] + b * B[1], a * A[2] + b * B[2]))) f++; } return f / n; };
  const plane = () => { const a = [g(), g(), g()], la = Math.hypot(...a), A = a.map((x) => x / la); let b = [g(), g(), g()]; const d = b[0] * A[0] + b[1] * A[1] + b[2] * A[2]; b = b.map((x, i) => x - d * A[i]); const lb = Math.hypot(...b); return [A, b.map((x) => x / lb)]; };
  const ns = [share(nat, [1, 0, 0], [0, 1, 0]), share(nat, [1, 0, 0], [0, 0, 1]), share(nat, [0, 1, 0], [0, 0, 1]), ...[0, 1, 2].map(() => share(nat, ...plane()))];
  const mPlan = share(mor, [1, 0, 0], [0, 1, 0]), mAcross = share(mor, [1, 0, 0], [0, 0, 1]);
  ok(Math.min(...ns) > 0.15 && Math.max(...ns) < 1.6 * Math.min(...ns) && mPlan > 0.15, `thick in every direction: the native city's built share on six planes through its core (three axis planes, three random) is ${ns.map((x) => Math.round(100 * x) + '%').join(', ')}; the layered city's is ${Math.round(100 * mPlan)}% in its plan's plane and ${Math.round(100 * mAcross)}% across it`);
  // streets are sheets: in the core district, a whole plane at mid-street is empty, a plane mid-block is built on
  const D0 = nat.D[0], st = Y.CITY4.street, sheetAt = (x0) => { let built = 0, n = 0; for (let k = 0; k < 1500; k++) { const q = [x0, (rnd() - 0.5) * 120, (rnd() - 0.5) * 120]; const p = [0, 1, 2].map((j) => D0.s[j] + D0.R[0][j] * q[0] + D0.R[1][j] * q[1] + D0.R[2][j] * q[2]); if (Math.hypot(...p) < Y.CITY4.plaza + 2) continue; n++; if (Y.buildingAt(wd, at(nat, ...p))) built++; } return built / n; };
  const inStreet = sheetAt(D0.pitch + st / 2), inBlock = sheetAt(D0.pitch + st + 4);
  ok(inStreet === 0 && inBlock > 0.3, `streets are sheets (codimension one): a 120 m square of plane down the middle of a street is empty (${inStreet}), a parallel one inside the blocks ${Math.round(100 * inBlock)}% built`);
  // bid-rent: towers in the middle, low and sparse at the edge
  const band = (r0, r1) => { let n = 0, h = 0, tried = 0; for (let k = 0; k < 40000 && n < 400; k++) { const d = [g(), g(), g()], l = Math.hypot(...d), r = r0 + rnd() * (r1 - r0), p = d.map((x) => (x / l) * r), b = Y.buildingAt(wd, at(nat, ...p)); tried++; if (b) { n++; h += b.top - b.base; } } return { h: h / n, fill: n / tried }; };
  const inner = band(30, 110), mid = band(140, 210), outer = band(240, 310), st4 = nat.stats;
  ok(inner.h > mid.h && mid.h > outer.h && inner.fill > outer.fill && st4.maxH <= Y.CITY4.maxStoreys * Y.CITY4.storey + 1e-9, `bid-rent: mean height ${inner.h.toFixed(0)} m within 110 m of the core, ${mid.h.toFixed(0)} m at 140–210, ${outer.h.toFixed(0)} m past 240; built share ${Math.round(100 * inner.fill)}% → ${Math.round(100 * outer.fill)}%; tallest ${st4.maxH.toFixed(1)} m (BRUT⁴'s cap, ${Y.CITY4.maxStoreys} storeys of ${Y.CITY4.storey} m)`);
  ok(st4.mean < 0.8 * Y.CITY4.radius && st4.mean < 0.5 * st4.flatMean, `the planner's prize: ${st4.plots} plots in a ball ${Y.CITY4.radius} m round, mean ${st4.mean.toFixed(0)} m to the core; the same plots laid flat fill a disc ${st4.flatR.toFixed(0)} m round, mean ${st4.flatMean.toFixed(0)} m (a ball grows as N^⅓, a disc as N^½)`);
  // the layered city: its layers
  const t = mor, P = (u, v, w) => at(t, u, v, w);
  let sameAcross = 0, tried = 0; for (let k = 0; k < 2000 && tried < 200; k++) { const u = (rnd() - 0.5) * 400, v = (rnd() - 0.5) * 400, b0 = Y.buildingAt(wd, P(u, v, 0)); if (!b0) continue; tried++; if (Y.buildingAt(wd, P(u, v, 64 * 2 + 1)) && !Y.buildingAt(wd, P(u, v, 32))) sameAcross++; }
  ok(tried > 50 && sameAcross > tried * 0.3, `the layered city: where a building stands in the plan's own layer, ${sameAcross} of ${tried} also stand two layers (128 m) across, with the avenue between them (32 m across) open`);
}
// the renderer, curved
{
  const c = Y.aircraft(wd), px = new Uint32Array(Y.W * Y.H), fr = Y.render(wd, c, px), rc = Y.R0 + c.alt;
  let worst = 0, drawn = 0;
  for (const x of [0, 80, 160, 240, 320, 400, 479]) {
    const s = (x - Y.W / 2) / Y.FOCAL, k = Math.hypot(1, s), U = [0, 1, 2, 3].map((i) => (c.F[i] + c.R[i] * s) / k); let top = Y.H;
    for (let d = 2; d < Y.FAR && d / Y.R0 < Math.PI / 2; d += 1) { const ph = d / Y.R0, P = c.X.map((x0, i) => x0 * Math.cos(ph) + U[i] * Math.sin(ph)), r = Y.R0 + Y.heightAt(wd, P); top = Math.min(top, fr.horizon - ((r * Math.cos(ph) - rc) * Y.FOCAL) / ((r * Math.sin(ph)) / k)); }
    worst = Math.max(worst, Math.abs(Math.max(0, Math.ceil(top)) - fr.top[x])); if (fr.top[x] < Y.H) drawn++;
  }
  ok(worst <= 3 && drawn === 7, `Voxel Space on the curved planet: in 7 columns the land's top row is within ${worst} px of a ray marched every metre along its great circle`);
  const g0 = Y.skyline(wd, c, 0, 1).out; let gd = 0; for (let x = 0; x < Y.W; x += 7) gd = Math.max(gd, Math.abs(Math.max(0, Math.ceil(g0[x])) - fr.top[x]));
  ok(gd <= 4, `the ghost skyline at 0 m ana is the view's own (within ${gd} px)`);
  // the horizon really is below level: the camera tilt is the dip, which grows with height
  const lo = { ...c, alt: wd.sea + 20 }, hi = { ...c, alt: wd.sea + 800 };
  ok(Y.tilt(hi) > Y.tilt(lo) && Math.abs(Y.tilt(hi) - 0.8 * Math.acos(Y.R0 / (Y.R0 + hi.alt))) < 1e-12, `the camera looks down by 0.8 of the horizon's dip: ${((Y.tilt(lo) * 180) / Math.PI).toFixed(1)}° at ${Math.round(lo.alt)} m, ${((Y.tilt(hi) * 180) / Math.PI).toFixed(1)}° at ${Math.round(hi.alt)} m`);
}
// flying round the planet
{
  const c = Y.aircraft(wd), X0 = c.X.slice(); c.alt = 900; let d = 0; const step = 1 / 20;
  while (d < Y.L * ((Y.R0 + 900) / Y.R0) - 1e-6) { const v = Math.min(c.speed * step, Y.L * ((Y.R0 + 900) / Y.R0) - d); const sp = c.speed; c.speed = v / step; const k = {}; Y.fly({ ...wd, h: new Float32Array(wd.h.length).fill(-1e9), cities: [] }, c, k, step); c.speed = sp; d += v; c.alt = 900; }
  ok(Math.hypot(...c.X.map((x, i) => x - X0[i])) < 1e-6, `fly straight and level and you are home after one great circle: 8.19 km of ground passed under you (${((Y.L * (Y.R0 + 900)) / Y.R0 / 1000).toFixed(1)} km flown, at 900 m up)`);
  const c2 = Y.aircraft(wd); let sq = 0, under = 0;
  for (let k = 0; k < 20000; k++) {
    Y.fly(wd, c2, { yaw: rnd() * 2 - 1, pitch: rnd() * 2 - 1.1, ana: rnd() * 2 - 1, roll: rnd() * 2 - 1, throttle: rnd() * 2 - 1 }, 1 / 30);
    const v = [c2.X, c2.F, c2.R, c2.A]; for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) sq = Math.max(sq, Math.abs(dot(v[a], v[b]) - (a === b ? 1 : 0)));
    if (c2.alt < Y.heightAt(wd, c2.X) + 9.99) under++;
  }
  ok(sq < 1e-12 && under === 0, `20,000 steps of random flying: X, F, R, A stay orthonormal (to ${sq.toExponential(0)}) and never once under the ground or a roof`);
}
// beacons
{
  const c = Y.aircraft(wd), bs = Y.course(wd, c.X, 8, 5); let e = 0;
  for (const b of bs) { const r = Y.relative(c, b), back = [0, 1, 2, 3].map((i) => (Y.R0 + c.alt) * c.X[i] + c.F[i] * r.ahead + c.R[i] * r.right + c.A[i] * r.ana + c.X[i] * r.up); e = Math.max(e, Math.hypot(...back.map((x, i) => x - (Y.R0 + b.alt) * b.X[i]))); }
  ok(e < 1e-6 && bs.every((b) => b.alt - Y.heightAt(wd, b.X) >= 40), `beacons are where ahead, right, ana and up put them (to ${e.toExponential(0)} m), each at least 40 m above the ground`);
  const b = { X: c.X.map((x, i) => Math.cos(30 / (Y.R0 + c.alt)) * x + Math.sin(30 / (Y.R0 + c.alt)) * c.A[i]), alt: c.alt, r: 40 };
  ok(Y.inside(c, b) && Math.abs(Y.relative(c, b).ana - 30) < 0.01, 'a beacon 30 m ana of you is 30 m ana on the gauge, and you are inside it');
}
// the predicted flight path
{
  const open = { ...wd, h: new Float32Array(wd.h.length).fill(-1e9), cities: [] };   // no ground in the way
  const fresh = () => { const c = Y.aircraft(wd); c.alt = 600; c.pitch = 0; c.speed = 60; return c; };
  // it is the flight itself: predict, then fly for real with the same controls
  const c = fresh(), k = { yaw: 0.4, ana: -0.3, pitch: 0.2, roll: 0.1 }, before = JSON.stringify([c.X, c.F, c.alt]), path = Y.predict(wd, c, k, { seconds: 6, dt: 0.1 });
  const unchanged = JSON.stringify([c.X, c.F, c.alt]) === before; let dev = 0;
  for (let i = 1; i < path.pts.length; i++) { Y.fly(wd, c, k, 0.1); dev = Math.max(dev, Math.hypot(...c.X.map((x, j) => (x - path.pts[i].X[j]) * Y.R0)), Math.abs(c.alt - path.pts[i].alt)); }
  ok(unchanged && dev < 1e-9, `the predicted path is the flight: predict leaves the aircraft alone, and flying the same controls follows it to ${dev.toExponential(0)} m over 6 s`);
  // a held turn closes: at 60 m/s and 0.9 rad/s, a circle of 2π/0.9 = 6.98 s, 133 m across
  const c2 = fresh(), T = (2 * Math.PI) / 0.9, p2 = Y.predict(open, c2, { yaw: 1 }, { seconds: 7.2, dt: T / 70 });
  const back = Math.hypot(...p2.pts[70].X.map((x, j) => (x - c2.X[j]) * (Y.R0 + 600))), across = Math.max(...p2.pts.map((p) => Math.hypot(...p.X.map((x, j) => (x - c2.X[j]) * (Y.R0 + 600)))));
  ok(back < 1 && Math.abs(across - 133.3) < 2, `hold the stick over and the path is a closed circle: back within ${back.toFixed(2)} m after ${T.toFixed(2)} s, ${across.toFixed(1)} m across (v/ω = 66.7 m radius)`);
  // a held ana turn leaves your slice: nothing right or left, all of it ana
  const c3 = fresh(), p3 = Y.predict(open, c3, { ana: 1 }, { seconds: 3 }), r3 = Y.relative(c3, p3.pts[p3.pts.length - 1]);
  ok(Math.abs(r3.right) < 1e-6 && r3.ana > 50, `hold the lever and the path bends out of your slice: after 3 s it is ${r3.ana.toFixed(0)} m ana, ${Math.abs(r3.right).toExponential(0)} m right`);
  // a dive: impact predicted, and flying for real touches down then
  const c4 = Y.aircraft(wd); c4.pitch = -0.7; c4.speed = 80; const p4 = Y.predict(wd, c4, {}, { seconds: 20 }); let tHit = null; for (let t = 0.1; t < 20.05; t += 0.1) if (Y.fly(wd, c4, {}, 0.1)) { tHit = t; break; }
  ok(p4.impact != null && tHit != null && Math.abs(p4.impact - tHit) < 1e-9, `a dive: the path ends at the ground ${p4.impact?.toFixed(1)} s out, and flying it touches down at ${tHit?.toFixed(1)} s`);
  // closest approach: a beacon on the path is flown through; one 30 m ana of the path is missed by 30 m ana
  const c5 = fresh(), p5 = Y.predict(open, c5, { yaw: 0.2 }, { seconds: 10 }), at5 = p5.pts[50];
  const on = Y.closest(p5, { X: at5.X, alt: at5.alt, r: 40 });
  const offX = at5.X.map((x, i) => Math.cos(30 / (Y.R0 + at5.alt)) * x + Math.sin(30 / (Y.R0 + at5.alt)) * at5.A[i]), off = Y.closest(p5, { X: offX, alt: at5.alt, r: 20 });
  ok(on.through && Math.abs(on.t - 5) < 1e-9 && on.dist < 1e-6 && !off.through && Math.abs(off.ana - 30) < 0.5 && Math.abs(off.t - 5) < 0.15, `closest approach: a beacon on the path at 5 s is flown through then; one 30 m ana of it is missed by ${off.ana.toFixed(1)} m ana (right ${off.right.toFixed(1)}, up ${off.up.toFixed(1)})`);
}
console.log(`${fails ? '✗' : '✓'} fly: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
