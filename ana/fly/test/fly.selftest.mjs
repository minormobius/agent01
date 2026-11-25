// FLY's selftest: the land tiles and the fast grid is the noise; the renderer's skyline is the land's; the flight frame
// stays square and never goes under the ground; beacons are where the HUD says.
import * as Y from '../js/fly.js';
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const t0 = Date.now(), wd = Y.buildWorld(1), tb = Date.now() - t0;
// the land
{
  let te = 0; for (let k = 0; k < 300; k++) { const x = rnd() * Y.L, y = rnd() * Y.L, z = rnd() * Y.L; te = Math.max(te, Math.abs(Y.rawHeight(x, y, z) - Y.rawHeight(x + Y.L, y - 2 * Y.L, z + Y.L))); }
  let ge = 0; for (let t = 0; t < 3000; t++) { const i = Math.floor(rnd() * Y.G), j = Math.floor(rnd() * Y.G), k = Math.floor(rnd() * Y.G); ge = Math.max(ge, Math.abs(wd.h[(k * Y.G + j) * Y.G + i] - Y.rawHeight(i * Y.CELL, j * Y.CELL, k * Y.CELL, 1))); }
  ok(te < 1e-9 && ge < 1e-3, `the land wraps every ${Y.L} m in all three floor directions (to ${te.toExponential(0)} m), and the fast grid (built in ${tb} ms) is the noise at every node checked (to ${ge.toExponential(0)} m)`);
  let ce = 0; for (let t = 0; t < 500; t++) { const p = [rnd() * Y.L, rnd() * Y.L, rnd() * Y.L], q = p.map((x) => x + 0.01); ce = Math.max(ce, Math.abs(Math.max(Y.heightAt(wd, ...p), 0) - Y.heightAt(wd, ...q))); }
  const water = wd.h.filter((e) => e < wd.sea).length / wd.h.length;
  ok(ce < 1 && Math.abs(water - 0.14) < 0.01, `the ground is continuous between nodes (1 cm moves it at most ${ce.toFixed(2)} m), and the sea sits where 14% of the land is under it (${(water * 100).toFixed(1)}%)`);
  // the shading's slope against the slope of the noise itself (the land the grid samples), at random points: the grid
  // is 64 m, so slopes vary inside a cell that it can't see; on average it should still follow them
  let gs = 0, gm = 0; const NT = 300; for (let t = 0; t < NT; t++) { const p = [rnd() * Y.L, rnd() * Y.L, rnd() * Y.L], g = Y.ground(wd, ...p), h = 2, num = [0, 1, 2].map((a) => { const u = p.slice(), v = p.slice(); u[a] += h; v[a] -= h; return (Y.rawHeight(...u, 1) - Y.rawHeight(...v, 1)) / (2 * h); }); gs += Math.hypot(num[0] - g.gx, num[1] - g.gy, num[2] - g.gz); gm += Math.hypot(...num); }
  ok(gs / gm < 0.6, `the shading's slope follows the true slope of the land on average (mean difference ${((100 * gs) / gm).toFixed(0)}% of the mean slope; the 64 m grid can't see what varies inside a cell)`);
}
// the renderer
{
  const c = Y.aircraft(wd), px = new Uint32Array(Y.W * Y.H), fr = Y.render(wd, c, px);
  // brute force: for a column, march finely and take the highest point's screen row
  let worst = 0;
  for (const x of [0, 60, 150, 240, 333, 420, 479]) {
    const s = (x - Y.W / 2) / Y.FOCAL; let top = Y.H;
    for (let z = 2; z < Y.FAR; z += 1) { const e = Y.heightAt(wd, c.p[0] + (c.F[0] + c.R[0] * s) * z, c.p[1] + (c.F[1] + c.R[1] * s) * z, c.p[2] + (c.F[2] + c.R[2] * s) * z); top = Math.min(top, fr.horizon - ((e - c.alt) * Y.FOCAL) / z); }
    worst = Math.max(worst, Math.abs(Math.max(0, Math.ceil(top)) - fr.top[x]));
  }
  ok(worst <= 3, `Voxel Space draws the land's true skyline: in 7 columns its top row is within ${worst} px of a ray marched every metre`);
  const g0 = Y.skyline(wd, c, 0, 1).out; let gd = 0; for (let x = 0; x < Y.W; x += 7) gd = Math.max(gd, Math.abs(Math.max(0, Math.ceil(g0[x])) - fr.top[x]));
  ok(gd <= 4, `the ghost skyline at 0 m ana is the view's own skyline (within ${gd} px), so at ±150 m it is the land beside you`);
}
// flying
{
  const c = Y.aircraft(wd); let sq = 0, under = 0, hits = 0;
  for (let k = 0; k < 20000; k++) {
    const kk = { yaw: rnd() * 2 - 1, pitch: rnd() * 2 - 1.1, ana: rnd() * 2 - 1, roll: rnd() * 2 - 1, throttle: rnd() * 2 - 1 };
    if (Y.fly(wd, c, kk, 1 / 30)) hits++;
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    sq = Math.max(sq, Math.abs(d(c.F, c.F) - 1), Math.abs(d(c.R, c.R) - 1), Math.abs(d(c.A, c.A) - 1), Math.abs(d(c.F, c.R)), Math.abs(d(c.F, c.A)), Math.abs(d(c.R, c.A)));
    if (c.alt < Y.heightAt(wd, ...c.p) + 11.99) under++;
  }
  ok(sq < 1e-12 && under === 0, `20,000 steps of random flying: the frame (forward, right, ana) stays orthonormal to ${sq.toExponential(0)}, and never once below the ground (touched it ${hits} times, pushed back up each time)`);
  // turning ana then kata by the same amount comes back; yaw, ana and roll are three independent turns
  const c2 = Y.aircraft(wd), F0 = c2.F.slice(); Y.turn(c2, 'F', 'A', 0.7); const moved = Math.hypot(...c2.F.map((x, i) => x - F0[i])); Y.turn(c2, 'F', 'A', -0.7);
  ok(moved > 0.5 && Math.hypot(...c2.F.map((x, i) => x - F0[i])) < 1e-12, 'turning ana and back again returns your heading exactly');
}
// beacons
{
  const c = Y.aircraft(wd), bs = Y.course(wd, c.p, 8, 5); let e = 0, ab = 0;
  for (const b of bs) {
    const r = Y.relative(c, b), back = [0, 1, 2].map((i) => c.p[i] + c.F[i] * r.ahead + c.R[i] * r.right + c.A[i] * r.ana), d = back.map((x, i) => { let v = x - b.p[i]; v -= Math.round(v / Y.L) * Y.L; return v; });
    e = Math.max(e, Math.hypot(...d)); ab = Math.max(ab, b.alt - Y.heightAt(wd, ...b.p));
  }
  ok(e < 1e-6 && bs.every((b) => b.alt - Y.heightAt(wd, ...b.p) >= 150), `each beacon is exactly where the HUD's ahead, right and ana put it (to ${e.toExponential(0)} m, the short way round the wrapping floor), and at least 150 m above the ground`);
  const b = { p: c.p.map((x, i) => x + c.A[i] * 40), alt: c.alt, r: 70 };
  ok(Y.inside(c, b) && Math.abs(Y.relative(c, b).ana - 40) < 1e-9 && !Y.inside(c, { ...b, p: c.p.map((x, i) => x + c.A[i] * 80) }), 'a beacon 40 m ana of you is 40 m ana on the gauge and you are inside it; 80 m ana you have missed it');
}
console.log(`${fails ? '✗' : '✓'} fly: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
