// MOONLET, held: run `node ana/moonlet/test/moonlet.selftest.mjs`. Every claim the page makes, measured.
import * as M from '../js/moonlet.js';
const { dot, add, scale, norm, unit } = M;
const { R, g } = M.WORLD, DT = 1 / 120;
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('✓ ' + msg); } else { fails++; console.error('✗ ' + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const ortho = (k) => { const v = [k.F, k.U, k.Rt, k.N]; let e = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) e = Math.max(e, Math.abs(dot(v[i], v[j]) - (i === j ? 1 : 0))); return e; };
const IN = (o = {}) => ({ throttle: 0, steer: [0, 0], jump: false, jumpHeld: false, boost: false, ...o });

// the numbers
ok(near(M.vOrbit(), Math.sqrt(g * R), 1e-12) && near(M.vEscape(), Math.SQRT2 * M.vOrbit(), 1e-12), `orbital speed √(gR) = ${M.vOrbit().toFixed(2)} m/s, escape √2 times it = ${M.vEscape().toFixed(2)}`);
ok(near(norm(M.gravity([R, 0, 0, 0])), g, 1e-12) && near(norm(M.gravity([2 * R, 0, 0, 0])), g / 4, 1e-12), 'the pull is g at the surface and falls as 1/r² (four\'s pinned law)');
ok(near(M.weight(0), g, 1e-12) && near(M.weight(M.vOrbit()), 0, 1e-12), 'riding at the orbital speed you weigh nothing');

// pedalling can't get you to orbit: the grip runs out first
{
  const k = M.makeBike();
  let maxA = 0, maxV = 0, lastV = 0, off = false;
  for (let i = 0; i < 120 * 300; i++) { M.step(k, IN({ throttle: 1 }), DT); maxA = Math.max(maxA, (k.speed - lastV) / DT - M.BIKE.mu * M.weight(lastV)); lastV = k.speed; maxV = Math.max(maxV, k.speed); if (!k.ground) off = true; }
  ok(!off && maxV < M.vOrbit() && maxA < 1e-9, `5 minutes flat out on the pedals: ${maxV.toFixed(2)} m/s, under orbital (${M.vOrbit().toFixed(2)}), never off the ground, never pushing harder than the grip`);
  ok(Math.abs(norm(k.x) - R) < 1e-9 && ortho(k) < 1e-9, `after ${(k.speed * 300 / 1000).toFixed(1)}-ish km round the rock: still on the surface, frame still orthonormal`);
  // and the way round: riding straight is a great circle, back where you started after 2πR
  const k2 = M.makeBike(); k2.speed = 5; const x0 = k2.x.slice(); let closest = Infinity, t = 0;
  for (let i = 0; i < 120 * 200; i++) { M.step(k2, IN({ throttle: 0.0 }), DT); k2.speed = 5; t += DT; if (t > 100) closest = Math.min(closest, norm(add(k2.x, x0, -1))); }
  ok(closest < 0.05, `ride straight at 5 m/s: back at the start after 2πR (${(2 * Math.PI * R).toFixed(0)} m), within ${closest.toFixed(3)} m`);
}
// a turn at speed is wide: the rate is grip over speed
{
  const k = M.makeBike(); k.speed = 5;
  const Rt0 = k.Rt.slice();
  M.step(k, IN({ steer: [1, 0] }), 0.1);
  const rate = Math.asin(dot(k.F, Rt0)) / 0.1;          // the turn toward your right (riding on also tips F down the curve)
  const want = (M.BIKE.mu * M.weight(5)) / 5;
  ok(near(rate, want, 0.002), `at 5 m/s the hardest turn is μ·weight/v = ${want.toFixed(3)} rad/s (got ${rate.toFixed(3)}): a ${(5 / want).toFixed(0)} m circle`);
}
// faster than orbital: you're flying
{
  const k = M.makeBike(); k.speed = M.vOrbit() * 1.02;
  M.step(k, IN(), DT);
  ok(!k.ground, 'pushed past the orbital speed (by the rocket), the bike leaves the ground by itself');
}
// a jump: up 2.2 m/s, down again ~2v/g later, near the same spot (it's slow)
{
  const k = M.makeBike(); let t = 0, top = 0;
  M.step(k, IN({ jump: true }), DT);
  ok(!k.ground, 'a jump leaves the ground');
  while (!k.ground && t < 60) { M.step(k, IN(), DT); t += DT; top = Math.max(top, norm(k.x) - R); }
  const v = M.BIKE.jump, flat = (2 * v) / g, x0 = [R + 0.01, 0, 0, 0], el = M.elements(x0, [v, 0, 0, 0]), fc = M.predict(x0, [v, 0, 0, 0], { dt: 0.01 });
  ok(k.ground && near(t, fc.impact.t, 0.05) && near(top, el.apo - R, 0.05), `a jump: ${top.toFixed(2)} m up and ${t.toFixed(1)} s in the air, as Kepler says (${(el.apo - R).toFixed(2)} m, ${fc.impact.t.toFixed(1)} s); flat ground would say ${((v * v) / (2 * g)).toFixed(2)} m, ${flat.toFixed(1)} s: the rock curves away and the pull weakens as you rise`);
}
// orbits: a circular one stays circular and comes round on time (the stepper is symplectic)
{
  const r = R + 2, k = M.makeBike(); k.ground = false; k.x = [r, 0, 0, 0]; k.v = [0, M.vOrbit(r), 0, 0]; k.F = [0, 1, 0, 0]; k.U = [1, 0, 0, 0];
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / M.GM); let rmin = Infinity, rmax = 0;
  for (let i = 0; i < Math.round(T / DT); i++) { M.step(k, IN(), DT); rmin = Math.min(rmin, norm(k.x)); rmax = Math.max(rmax, norm(k.x)); }
  ok(rmax - rmin < 0.1 && norm(add(k.x, [r, 0, 0, 0], -1)) < 0.5 && !k.ground, `a skimming orbit 2 m up: radius held to ${(rmax - rmin).toFixed(4)} m, back in ${T.toFixed(0)} s to within ${norm(add(k.x, [r, 0, 0, 0], -1)).toFixed(2)} m`);
  ok(ortho(k) < 1e-9, 'a whole orbit of nose-levelling keeps the frame orthonormal');
}
// Kepler's elements match a flown orbit; the forecast's touchdown matches the real one
{
  const x = [R + 1, 0, 0, 0], v = [1.5, 5, 2, -1.5];
  const el = M.elements(x, v), k = M.makeBike(); k.ground = false; k.x = x.slice(); k.v = v.slice(); k.F = unit([0, 5, 2, -1.5]); k.U = [1, 0, 0, 0];
  [k.Rt, k.N] = [unit([0, 2, -5, 0]), unit([0, 1.5 * 29 / 29, 0, 0])];
  // a clean frame for k: from F and U
  const f = (a) => { let r = a; for (const u of [k.F, k.U]) r = add(r, u, -dot(r, u)); return r; };
  k.Rt = unit(f([0, 0, 1, 0])); let n = f([0, 0, 0, 1]); n = add(n, k.Rt, -dot(n, k.Rt)); k.N = unit(n);
  const fc = M.predict(x, v, { dt: 0.05, T: 600 });
  let rmax = 0, t = 0;
  while (!k.ground && t < 600) { M.step(k, IN(), DT); t += DT; rmax = Math.max(rmax, norm(k.x)); }
  ok(near(rmax, el.apo, 0.15), `apoapsis: Kepler says ${(el.apo - R).toFixed(2)} m up, flown ${(rmax - R).toFixed(2)} m`);
  ok(fc.impact && near(fc.impact.t, t, 0.2) && norm(add(fc.impact.x, k.x, -1)) < 1, `the forecast lands at t = ${fc.impact?.t.toFixed(2)} s, ${norm(add(fc.impact.x, k.x, -1)).toFixed(2)} m from where the bike did (${t.toFixed(2)} s)`);
}
// escape: just under escape speed comes back, just over doesn't
{
  const up = (f) => { const x = [R + 0.1, 0, 0, 0], v = [f * M.vEscape(R + 0.1), 0, 0, 0]; return M.elements(x, v); };
  ok(!up(0.99).escaping && up(1.01).escaping && up(0.99).apo > 20 * R, `straight up at 0.99 of escape speed rises to ${(up(0.99).apo / R).toFixed(0)}R and falls back; at 1.01 it never returns`);
}
// in the air the nose levels itself (whatever it was doing), the frame stays orthonormal, and jump + rocket climbs
{
  const k = M.makeBike(); k.ground = false; k.x = [R + 5, 0, 0, 0]; k.v = [0, 3, 0, 0];
  k.F = unit([0.6, 0.8, 0, 0]); k.U = unit([0.8, -0.6, 0, 0]);     // nose 37° up
  for (let i = 0; i < 120; i++) M.step(k, IN(), DT);
  ok(Math.abs(dot(k.F, unit(k.x))) < 1e-3 && ortho(k) < 1e-9, `a nose pitched 37° up is level again within a second (${(Math.asin(dot(k.F, unit(k.x))) * 180 / Math.PI).toFixed(2)}°)`);
  const k2 = M.makeBike(); M.step(k2, IN({ jump: true }), DT); const r0 = norm(k2.x);
  for (let i = 0; i < 120; i++) M.step(k2, IN({ boost: true, jumpHeld: true }), DT);
  const k3 = M.makeBike(); M.step(k3, IN({ jump: true }), DT);
  for (let i = 0; i < 120; i++) M.step(k3, IN({ boost: true }), DT);
  ok(norm(k2.x) - r0 > norm(k3.x) - r0 + 0.5, `one second of rocket with jump held climbs ${(norm(k2.x) - r0).toFixed(2)} m, level ${(norm(k3.x) - r0).toFixed(2)} m`);
}
// landing: soft keeps your speed along the heading; hard bounces
{
  const k = M.makeBike(); k.ground = false; k.x = [R - 0.01, 0, 0, 0]; k.v = [-1, 4, 0, 0];
  ok(M.touchdown(k) === 'land' && k.ground && near(k.speed, 4, 1e-9), 'coming down at 1 m/s: you land and ride on at 4 m/s');
  const k2 = M.makeBike(); k2.ground = false; k2.x = [R - 0.01, 0, 0, 0]; k2.v = [-5, 1, 0, 0];
  ok(M.touchdown(k2) === 'bounce' && !k2.ground && near(dot(k2.v, [1, 0, 0, 0]), 1.5, 1e-9), 'at 5 m/s you bounce, at 30% of it');
}
// the rocket: a full tank is more than escape speed; the circularizer makes an orbit out of a hop
{
  const dv = (100 / M.BIKE.burn) * M.BIKE.thrust;
  ok(dv > M.vEscape(), `a full tank is ${dv.toFixed(1)} m/s of rocket, more than escape (${M.vEscape().toFixed(1)})`);
  const k = M.makeBike(); let t = 0;
  M.step(k, IN({ jump: true }), DT);
  for (let i = 0; i < 120 * 1; i++) { M.step(k, IN(), DT); t += DT; }
  while (t < 120) { M.step(k, IN({ assist: 'circularize' }), DT); t += DT; if (k.ground) break; }
  const el = M.elements(k.x, k.v);
  ok(!k.ground && el.e < 0.05 && el.peri > R, `hop, then hold CIRCULARIZE: an orbit of eccentricity ${el.e.toFixed(3)}, ${(el.peri - R).toFixed(1)}–${(el.apo - R).toFixed(1)} m up, ${k.fuel.toFixed(0)}% fuel left`);
}
// the roads: on the 3-sphere, linked and knotted (Gauss's linking integral after stereographic projection)
{
  const L12 = M.linking(M.ROADS.ring1, M.ROADS.ring2), L1t = M.linking(M.ROADS.ring1, M.ROADS.trefoil), L2t = M.linking(M.ROADS.ring2, M.ROADS.trefoil);
  ok(near(Math.abs(L12), 1, 0.02), `the two rings are linked once (linking number ${L12.toFixed(3)})`);
  ok(near(Math.abs(L1t), 3, 0.05) && near(Math.abs(L2t), 2, 0.05), `the trefoil winds 3 times round ring 1 and twice round ring 2 (${L1t.toFixed(3)}, ${L2t.toFixed(3)})`);
  const far = M.linking(M.ROADS.ring1, (t) => unit([0.3 * Math.cos(t), 0.3 * Math.sin(t), 1, 0.2]));
  ok(Math.abs(far) < 0.02, `a small circle off to one side isn't linked to ring 1 (${far.toFixed(3)}): the integral doesn't just say ±1`);
  // roadDist (the shader's formula) against brute force
  let worst = 0, ringErr = 0, seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < 300; i++) {
    const u = unit([rnd(), rnd(), rnd(), rnd()]), d = M.roadDist(u);
    let b = Infinity; for (let j = 0; j < 4000; j++) b = Math.min(b, Math.acos(Math.max(-1, Math.min(1, dot(u, M.ROADS.trefoil((2 * Math.PI * j) / 4000))))));
    if (b < 0.15) worst = Math.max(worst, Math.abs(d.trefoil - b) / b);
    const b1 = Math.acos(Math.min(1, Math.hypot(u[0], u[1])));
    ringErr = Math.max(ringErr, Math.abs(d.ring1 - b1));
  }
  ok(ringErr < 1e-9, 'the distance to ring 1 is exact');
  ok(worst < 0.1, `near the trefoil (within 0.15 rad) the road's width formula is within ${(worst * 100).toFixed(1)}% of the true distance`);
  ok(M.BEACONS.every((b) => near(norm(b.p), 1, 1e-12)), 'every beacon is on the rock');
}
// the roads as tubes: the nearest point is on the road and as near as brute force; the kerb colours steer you right
{
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  let worst = 0, onKnot = 0;
  for (let i = 0; i < 200; i++) {
    const u = unit([rnd(), rnd(), rnd(), rnd()]), q = M.roadPt('trefoil', u);
    const al = Math.atan2(q[1], q[0]), be = Math.atan2(q[3], q[2]), c = 3 * al - 2 * be;
    onKnot = Math.max(onKnot, Math.abs(c - 2 * Math.PI * Math.round(c / (2 * Math.PI))), Math.abs(Math.hypot(q[0], q[1]) - Math.SQRT1_2));
    const d = Math.acos(Math.max(-1, Math.min(1, dot(u, q))));
    if (d < 0.1) {
      let b = Infinity; for (let j = 0; j < 6000; j++) b = Math.min(b, Math.acos(Math.max(-1, Math.min(1, dot(u, M.ROADS.trefoil((2 * Math.PI * j) / 6000))))));
      worst = Math.max(worst, d / b - 1);
    }
  }
  ok(onKnot < 1e-9, 'the trefoil\'s nearest point is always on the knot');
  ok(worst < 0.05, `near the trefoil, the nearest point is within ${(worst * 100).toFixed(1)}% of the true nearest distance`);
  // riding ring 1 with your slice shifted 1.5 m ana of the road: the kerbs you see are teal; lean kata and you're back on it
  const k = M.makeBike(M.START.at, M.START.facing);       // on ring 1, facing along it; Rt = e₃, N = e₄ (hidden)
  const shift = 1.5 / R;
  k.x = scale(unit(add(unit(k.x), k.N, shift)), R); [k.F, k.Rt, k.N] = M.orthonormalTo(unit(k.x), [k.F, k.Rt, k.N]); k.U = unit(k.x);
  const edge = unit(add(add(unit(k.x), k.Rt, 1.9 / R), k.N, 0));           // a point of the road's edge in your slice
  ok(M.side('ring1', edge, k.N) > 0.5, `with your slice ana of ring 1, its kerbs in your view are teal (side ${M.side('ring1', edge, k.N).toFixed(2)})`);
  const off = () => M.side('ring1', unit(k.x), k.N) * R * Math.acos(Math.min(1, Math.hypot(unit(k.x)[0], unit(k.x)[1])));
  const before = off();
  k.speed = 2;
  for (let i = 0; i < 120 * 6 && off() > 0.05; i++) M.step(k, { throttle: 0, steer: [0, off() > 0.05 ? -0.6 : 0] }, DT);
  ok(before > 1.4 && off() < 0.3, `leaning kata, away from the teal, steers you back: ${before.toFixed(2)} m ana → ${off().toFixed(2)} m`);
  ok(Math.abs(M.side('ring1', unit(add(unit([1, 0, 0, 0]), [0, 0, 1, 0], 0.02)), [0, 0, 0, 1])) < 1e-9, 'a kerb in the same slice as the road\'s centre is white');
}
// the pebble moons: orthogonal planes, one radius: they never meet
{
  let dmin = Infinity;
  for (let t = 0; t < 3000; t += 0.5) { const [a, b] = M.pebbles(t); dmin = Math.min(dmin, norm(add(a, b, -1))); }
  ok(near(dmin, Math.SQRT2 * M.PEBBLE.r, 1e-9), `the two moons stay exactly √2·r = ${(Math.SQRT2 * M.PEBBLE.r).toFixed(0)} m apart, always`);
  const [a] = M.pebbles(0), [a2] = M.pebbles(1);
  ok(near(norm(add(a2, a, -1)), 2 * M.PEBBLE.r * Math.sin(M.vOrbit(M.PEBBLE.r) / M.PEBBLE.r / 2), 1e-9), 'they move at their orbital speed');
}
console.log(`${fails ? '✗' : '✓'} moonlet: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
