// PRISM's selftest: the 4D optics against the 3D optics it must reduce to, and every level solvable as the page claims.
import * as O from '../js/optics.js';
let passes = 0, fails = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
const DEG = Math.PI / 180;
let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const rvec = () => O.unit([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
const randRot = () => { let R = O.I4(); for (const pl of ['xy', 'xz', 'xw', 'yz', 'yw', 'zw']) R = O.mul(O.rot(pl, (rnd() - 0.5) * 6), R); return R; };

// Snell, in any direction in 4D: coplanar with d and N, sin law, unit, and total reflection past the critical angle
{
  let worst = 0, plane = 0, unitErr = 0, tirOk = true;
  for (let k = 0; k < 2000; k++) {
    let d = rvec(), N = rvec(); if (O.dot(d, N) > 0) N = O.scale(N, -1);
    const n1 = 1 + rnd(), n2 = 1 + rnd(), r = O.refract(d, N, n1, n2), ci = -O.dot(d, N), si = Math.sqrt(1 - ci * ci);
    if (r.tir) { tirOk = tirOk && n1 * si > n2 - 1e-12; continue; }
    tirOk = tirOk && n1 * si <= n2 + 1e-12;
    const ct = -O.dot(r.d, N), st = Math.sqrt(Math.max(0, 1 - ct * ct));
    worst = Math.max(worst, Math.abs(n1 * si - n2 * st)); unitErr = Math.max(unitErr, Math.abs(O.norm(r.d) - 1));
    // coplanar: r.d minus its parts along d and N is zero
    const G = [[1, O.dot(d, N)], [O.dot(d, N), 1]], b = [O.dot(r.d, d), O.dot(r.d, N)], det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
    const a = (b[0] * G[1][1] - b[1] * G[0][1]) / det, c = (G[0][0] * b[1] - G[1][0] * b[0]) / det;
    plane = Math.max(plane, O.norm(O.add(O.add(r.d, d, -a), N, -c)));
  }
  ok(worst < 1e-12 && plane < 1e-12 && unitErr < 1e-12 && tirOk, `Snell's law in 4D, 2000 random rays and surfaces: n₁ sin θ₁ = n₂ sin θ₂ to ${worst.toExponential(0)}, the refracted ray in the plane of the ray and the normal, total reflection exactly past the critical angle`);
  const crit = Math.asin(1 / 1.5) / DEG, N = [-1, 0, 0, 0], at = (th) => O.refract([Math.cos(th * DEG), 0, 0, Math.sin(th * DEG)], N, 1.5, 1).tir;
  ok(!at(crit - 0.01) && at(crit + 0.01), `the critical angle from glass of index 1.5 into air is ${crit.toFixed(2)}° (asin 1/n), along w as along x`);
}
// a mirror: angle in equals angle out, and reflecting twice in the same mirror gives the ray back
{
  let worst = 0; for (let k = 0; k < 500; k++) { const d = rvec(), n = rvec(), r = O.reflect(d, n); worst = Math.max(worst, Math.abs(O.dot(r, n) + O.dot(d, n)), Math.abs(O.norm(r) - 1), O.norm(O.add(O.reflect(r, n), d, -1))); }
  ok(worst < 1e-12, 'reflection keeps the angle and the length, and undoes itself');
}
// the prism is the 3D prism: a beam in the triangle's plane bends by the textbook deviation, minimum 2 asin(n sin A/2) − A
{
  const n = O.indexAt(O.BANDS.green), A = 60, dmin = (2 * Math.asin(n * Math.sin(A / 2 * DEG)) - A * DEG) / DEG;
  let best = 180;
  for (let t = -30; t <= 30; t += 0.25) {
    const pr = { kind: 'glass', ...O.place(O.prism(A * DEG, 1.3, 0.55), O.rot('xy', (O.MIN_DEV_TILT + t) * DEG), [0, 0, 0, 0]) };
    const r = O.trace({ bodies: [pr] }, [-3, 0, 0, 0], [1, 0, 0, 0], O.BANDS.green);
    if (r.events.length === 2 && r.events[1].kind === 'leave') best = Math.min(best, Math.acos(r.dir[0]) / DEG);
  }
  ok(Math.abs(best - dmin) < 0.01, `a 60° prism of index ${n.toFixed(3)}: least deviation ${best.toFixed(2)}° found by turning it, against 2 asin(n sin 30°) − 60° = ${dmin.toFixed(2)}°`);
  const pr0 = { kind: 'glass', ...O.place(O.prism(A * DEG, 1.3, 0.55), O.rot('xy', O.MIN_DEV_TILT * DEG), [0, 0, 0, 0]) }, r0 = O.trace({ bodies: [pr0] }, [-3, 0, 0, 0], [1, 0, 0, 0], O.BANDS.green);
  ok(Math.abs(Math.acos(r0.dir[0]) / DEG - dmin) < 1e-6 && Math.abs(r0.events[0].angle - r0.events[1].angle - (r0.events[0].angle - 30)) < 1e-9, 'the levels\' prism is set at least deviation for green: the beam inside runs parallel to the base');
  // dispersion: red bends least, blue most
  const dev = (lam) => Math.acos(O.trace({ bodies: [pr0] }, [-3, 0, 0, 0], [1, 0, 0, 0], lam).dir[0]) / DEG;
  ok(dev(O.BANDS.red) < dev(O.BANDS.green) && dev(O.BANDS.green) < dev(O.BANDS.blue), `white light parts: red bent ${dev(O.BANDS.red).toFixed(2)}°, green ${dev(O.BANDS.green).toFixed(2)}°, blue ${dev(O.BANDS.blue).toFixed(2)}°`);
  // turning the prism's triangle into w bends the beam into w by the same angle, and nowhere else
  const prw = { kind: 'glass', ...O.place(O.prism(A * DEG, 1.3, 0.55), O.mul(O.rot('yw', 90 * DEG), O.rot('xy', O.MIN_DEV_TILT * DEG)), [0, 0, 0, 0]) }, rw = O.trace({ bodies: [prw] }, [-3, 0, 0, 0], [1, 0, 0, 0], O.BANDS.green);
  ok(Math.abs(rw.dir[1]) < 1e-12 && Math.abs(rw.dir[2]) < 1e-12 && Math.abs(Math.acos(rw.dir[0]) / DEG - dmin) < 1e-9, `turned 90° in the yw plane, the same prism bends the beam ${dmin.toFixed(2)}° into w and not at all in y or z`);
}
// nothing depends on how the scene sits: turn and move everything at random, the rays turn and move with it
{
  const L = O.LEVELS[3], sc = O.scene(L, L.knobs.map((k) => k.sol)), rays = O.shine(sc);
  let worst = 0, same = true;
  for (let k = 0; k < 20; k++) {
    const R = randRot(), c = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    const mv = (x) => O.add(O.apply(R, x), c);
    const sc2 = { bodies: sc.bodies.map((b) => ({ ...b, faces: b.faces.map((f) => { const n = O.apply(R, f.n); return { n, b: f.b + O.dot(n, c) }; }) })), sources: sc.sources.map((s) => ({ ...s, p: mv(s.p), d: O.apply(R, s.d) })) };
    const rays2 = O.shine(sc2);
    rays.forEach((r, i) => { same = same && r.through.join() === rays2[i].through.join() && r.events.length === rays2[i].events.length; r.path.slice(0, -1).forEach((p, j) => { worst = Math.max(worst, O.norm(O.add(mv(p), rays2[i].path[j], -1))); }); });
  }
  ok(same && worst < 1e-9, `turning and moving a whole level at random in 4D turns and moves its beam with it (to ${worst.toExponential(0)}): nothing prefers an axis`);
}
// light retraces its path: send it back from the end, it comes out where it went in
{
  const L = O.LEVELS[0], sc = O.scene(L, [90]), r = O.trace(sc, [-3.5, 0, 0, 0], [1, 0, 0, 0], O.BANDS.green), end = O.add(r.path[r.path.length - 2], r.dir, 5);   // 5 past the last event (the path's own end is at the tracer's range)
  const back = O.trace(sc, end, O.scale(r.dir, -1), O.BANDS.green), last = back.path[back.path.length - 1], dirBack = back.dir;
  ok(Math.abs(dirBack[0] + 1) < 1e-9 && Math.abs(last[1]) < 1e-9 && Math.abs(last[2]) < 1e-9 && Math.abs(last[3]) < 1e-9, 'light retraces its path: sent back from where it ended, it leaves the prism along the line it came in on');
}
// the levels: solved at the solution, not at the start, and how much slack each knob has
for (const L of O.LEVELS) {
  const sol = L.knobs.map((k) => k.sol), st = L.knobs.map((k) => k.start);
  const s1 = O.score(O.scene(L, sol)), s0 = O.score(O.scene(L, st));
  const slack = L.knobs.map((k, i) => { const okv = []; for (let a = k.min; a <= k.max; a += k.step || 1) { const kk = sol.slice(); kk[i] = a; if (O.score(O.scene(L, kk)).solved) okv.push(a); } return okv; });
  ok(s1.solved && !s0.solved && slack.every((v) => v.length >= 1) && slack.every((v, i) => (L.knobs[i].step || 1) > 1 || v.length >= 3),
    `level "${L.name}": solved at its solution (${sol.join('°, ')}°), not at the start; each knob alone works over ${slack.map((v) => (v.length > 1 ? `${v[0]}..${v[v.length - 1]}°` : `${v[0]}°`)).join(' and ')}`);
}
// the rainbow's three targets each take only their own colour
{
  const L = O.LEVELS[2], sc = O.scene(L, L.knobs.map((k) => k.sol)), rays = O.shine(sc), T = sc.bodies.map((b, i) => i).filter((i) => sc.bodies[i].kind === 'target');
  ok(T.length === 3 && T.every((i) => rays.filter((r) => r.through.includes(i)).map((r) => r.band).join() === sc.bodies[i].want), 'in the rainbow each target is crossed by its own colour and no other');
}
console.log(`${fails ? '✗' : '✓'} optics: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
