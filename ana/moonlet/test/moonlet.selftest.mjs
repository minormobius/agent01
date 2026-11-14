// MOONLET, held: run `node ana/moonlet/test/moonlet.selftest.mjs` (V=1 prints each measured claim). The bike's
// physics is forces summed every step; these checks measure them: the normal force against Newton, energy against
// gravity's potential, the tyres against their friction circle, the rocket against Tsiolkovsky, orbits against Kepler.
import * as M from '../js/moonlet.js';
const { dot, add, scale, norm, unit } = M;
const { R, g } = M.WORLD, DT = 1 / 120;
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('✓ ' + msg); } else { fails++; console.error('✗ ' + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const ortho = (k) => { const v = [k.F, k.U, k.Rt, k.N]; let e = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) e = Math.max(e, Math.abs(dot(v[i], v[j]) - (i === j ? 1 : 0))); return e; };
const IN = (o = {}) => ({ throttle: 0, steer: [0, 0], jump: false, boost: false, ...o });
const energy = (k) => dot(k.v, k.v) / 2 - M.GM / norm(k.x);          // per kg
const FLAT = [0, 0, 1, 0];                                               // far from every hill (checked below)
const flatBike = (speed = 0) => { const k = M.makeBike(FLAT, [0, 1, 0, 0]); k.v = scale(k.F, speed); return k; };

// the world
ok(M.height(FLAT) < 1e-3 && M.height(M.START.at) < 1e-3 && norm(M.gradH(FLAT)) / R < 1e-4, `the pad and the test ground are flat (h ${M.height(M.START.at).toExponential(1)}, ${M.height(FLAT).toExponential(1)} m)`);
ok(near(M.vOrbit(), Math.sqrt(g * R), 1e-12) && near(M.vEscape(), Math.SQRT2 * M.vOrbit(), 1e-12), `orbital speed √(gR) = ${M.vOrbit().toFixed(2)} m/s, escape ${M.vEscape().toFixed(2)}`);
ok(near(norm(M.gravity([R, 0, 0, 0])), g, 1e-12) && near(norm(M.gravity([2 * R, 0, 0, 0])), g / 4, 1e-12), 'gravity: g at the surface, falling as 1/r² (four\'s pinned law)');
{
  // the terrain's gradient against finite differences, and its normal against the surface
  let worst = 0;
  for (const H of M.HILLS) for (const off of [0.05, 0.1, 0.2]) {
    const u = unit(add(H.c, unit([0.3, -0.2, 0.5, 0.7]), off)), gr = M.gradH(u);
    for (const d of [[1, 0, 0, 0], [0, 0, 1, 0]]) {
      const t = unit(add(d, u, -dot(d, u))), e = 1e-5;
      const fd = (M.height(unit(add(u, t, e))) - M.height(unit(add(u, t, -e)))) / (2 * e);
      worst = Math.max(worst, Math.abs(fd - dot(gr, t)));
    }
  }
  ok(worst < 1e-4, `the hills' gradient matches finite differences (worst ${worst.toExponential(1)} m/rad)`);
}

// the ground: the normal force, solved from the contact, is Newton's
{
  const k = flatBike(0); M.step(k, IN(), DT);
  ok(near(k.normal, M.mass(k) * g, 0.01), `standing: the ground pushes ${k.normal.toFixed(2)} N = m·g = ${(M.mass(k) * g).toFixed(2)} N`);
  const k2 = flatBike(5); M.step(k2, IN(), DT);
  const want = M.mass(k2) * (g - 25 / R);
  ok(near(k2.normal, want, 0.15), `riding at 5 m/s: ${k2.normal.toFixed(2)} N = m(g − v²/R) = ${want.toFixed(2)} N (the curve takes v²/R of the pull)`);
  const k3 = flatBike(M.vOrbit() * 1.01); M.step(k3, IN(), DT);
  ok(!k3.ground, 'past the orbital speed the solved normal force goes negative and you fly: no rule, the arithmetic');
}
// energy: coasting over a hill with no pedals, brakes or rolling loss, ½v² − GM/r is conserved; gravity on the slope
// is what slows you climbing and speeds you down
{
  const crr = M.BIKE.crr; M.BIKE.crr = 0;
  const H = M.HILLS[0], tc = Math.atan2(H.c[1], H.c[0]);
  const k = M.makeBike([Math.cos(tc - 0.3), Math.sin(tc - 0.3), 0, 0], [-Math.sin(tc - 0.3), Math.cos(tc - 0.3), 0, 0]);
  k.v = scale(k.F, 3.0);
  const E0 = energy(k); let vmin = Infinity, hmax = 0, Emax = 0, airborne = false;
  for (let i = 0; i < 120 * 30; i++) { M.step(k, IN(), DT); vmin = Math.min(vmin, norm(k.v)); hmax = Math.max(hmax, norm(k.x) - R); Emax = Math.max(Emax, Math.abs(energy(k) - E0)); if (!k.ground) airborne = true; }
  const vTop = Math.sqrt(2 * (E0 + M.GM / (R + hmax)));
  ok(Emax < 0.01 && hmax > 2 && near(vmin, vTop, 0.02) && !airborne, `coasting at 3 m/s over a ${H.A} m hill: up to ${hmax.toFixed(2)} m, slowed to ${vmin.toFixed(2)} m/s by gravity on the slope (energy says ${vTop.toFixed(2)}), energy held to ${Emax.toExponential(1)} J/kg`);
  // faster: the crest's curvature asks more than gravity gives, and the ground lets go
  const k2 = M.makeBike([Math.cos(tc - 0.3), Math.sin(tc - 0.3), 0, 0], [-Math.sin(tc - 0.3), Math.cos(tc - 0.3), 0, 0]);
  k2.v = scale(k2.F, 5.5); let off = null;
  for (let i = 0; i < 120 * 20 && off == null; i++) { M.step(k2, IN(), DT); if (!k2.ground) off = norm(k2.x) - R; }
  const kap = M.curvature(M.onSurface(H.c), unit(add([-Math.sin(tc), Math.cos(tc), 0, 0], [0, 0, 0, 0])));
  ok(off != null && off > 1, `at 5.5 m/s the same hill launches you ${off?.toFixed(2)} m up (its crest curves at ${kap.toFixed(3)}/m: you leave when v²κ beats the pull, here above ${Math.sqrt(g / kap).toFixed(1)} m/s)`);
  M.BIKE.crr = crr;
}
// the tyres: pedalling never reaches orbit, and the tyre force never leaves the friction circle
{
  const hills = M.HILLS.splice(0);                       // on a smooth rock (in a valley the ground curves up and holds you faster)
  const k = flatBike(0); let worst = 0, offAt = null, onAt30 = null;
  for (let i = 1; i <= 120 * 120 && offAt == null; i++) {
    M.step(k, IN({ throttle: 1 }), DT); worst = Math.max(worst, norm(k.tyre) - k.grip);
    if (i === 120 * 30) onAt30 = { v: norm(k.v), ground: k.ground, ortho: ortho(k), r: norm(k.x) - M.surfaceR(unit(k.x)) };
    if (!k.ground) offAt = i / 120;
  }
  // the same ride as one scalar equation, integrated finely: dv/dt = min(P/mv, Fmax/m, μ(g − v²/R)) − c_rr(g − v²/R)
  const P = M.BIKE, m = P.dry + P.tank; let v = 0;
  for (let t = 0; t < 30; t += 1e-3) { const n = g - (v * v) / R; v += (Math.min(P.power / (m * Math.max(v, 0.5)), P.pedalMax / m, P.mu * n) - P.crr * n) * 1e-3; }
  ok(worst < 1e-6 && onAt30.ground && near(onAt30.v, v, 0.01 * v), `pedalling flat out: ${onAt30.v.toFixed(3)} m/s at 30 s, as the force balance dv/dt = min(power, legs, μN) − rolling says (${v.toFixed(3)}); the tyre force never over μN`);
  ok(onAt30.ortho < 1e-9 && Math.abs(onAt30.r) < 1e-9, 'on the ground exactly, frame orthonormal');
  ok(offAt != null && offAt > 30, `as the grip fades the speed closes on orbital (time constant R/(2μ·v) ≈ ${(R / (2 * M.vOrbit())).toFixed(0)} s), and at ${offAt.toFixed(0)} s the ground can't hold you: you pedalled into orbit`);
  M.HILLS.push(...hills);
  // full lock at speed without the limiter: the tyres slide (the bike points one way and goes another)
  const k2 = flatBike(5); let skid = false, slipMax = 0;
  for (let i = 0; i < 120; i++) { M.step(k2, IN({ steer: [1, 0], limiter: false }), DT); skid ||= k2.skid; slipMax = Math.max(slipMax, k2.slip); }
  const k3 = flatBike(5); let skid3 = false;
  for (let i = 0; i < 120; i++) { M.step(k3, IN({ steer: [1, 0] }), DT); skid3 ||= k3.skid; }
  ok(skid && slipMax > 0.5 && !skid3, `full lock at 5 m/s: without the limiter the tyres slide (${slipMax.toFixed(2)} m/s sideways); with it they hold`);
  // the turn the grip allows: radius v²/(μ·N/m)
  const k4 = flatBike(4), a0 = k4.x.slice(); let maxD = 0;
  for (let i = 0; i < 120 * 60; i++) { M.step(k4, IN({ steer: [1, 0], throttle: 0 }), DT); k4.v = scale(unit(k4.v), 4); maxD = Math.max(maxD, norm(add(k4.x, a0, -1))); }
  const rr = 16 / (0.95 * (g - 16 / R)), re = 1 / Math.sqrt(1 / (rr * rr) + 1 / (R * R));
  ok(near(maxD / 2, re, 0.5), `the tightest held turn at 4 m/s curves the path at v²/(0.95 μ(g − v²/R)) = ${rr.toFixed(1)} m within the surface; on a 3-sphere of radius ${R} that's a circle ${re.toFixed(1)} m across in space, and the bike traced ${(maxD / 2).toFixed(1)} m`);
}
// the jump: an impulse, Δv = J/m, then free flight
{
  const k = flatBike(0); M.step(k, IN({ jump: true }), DT);
  ok(!k.ground && near(dot(k.v, unit(k.x)), M.BIKE.jump / M.mass(k), 1e-4), `a jump: ${M.BIKE.jump} N·s on ${M.mass(k)} kg = ${(M.BIKE.jump / M.mass(k)).toFixed(2)} m/s up`);
  let t = 0, top = 0; while (!k.ground && t < 60) { M.step(k, IN(), DT); t += DT; top = Math.max(top, norm(k.x) - R); }
  const v = M.BIKE.jump / M.BIKE.dry / (1 + M.BIKE.tank / M.BIKE.dry), el = M.elements([R + 0.01, 0, 0, 0], [v, 0, 0, 0]);
  ok(k.ground && near(top, el.apo - R, 0.05) && k.crashes === 0, `${top.toFixed(2)} m up (Kepler: ${(el.apo - R).toFixed(2)}), ${t.toFixed(1)} s in the air, landed on its wheels`);
}
// the rocket: burn the whole tank far from the rock: Δv = vₑ ln(m₀/m₁)
{
  const k = flatBike(0); k.ground = false; k.x = [1e7, 0, 0, 0]; k.F = [0, 1, 0, 0]; k.U = [1, 0, 0, 0]; k.Rt = [0, 0, 1, 0]; k.N = [0, 0, 0, 1];
  const m0 = M.mass(k), v0 = k.v.slice(); let t = 0;
  while (k.fuel > 0 && t < 100) { M.step(k, IN({ boost: true, sas: false }), DT); t += DT; }
  const dv = norm(add(k.v, v0, -1)), want = M.BIKE.ve * Math.log(m0 / M.BIKE.dry);
  ok(near(dv, want, want * 0.002), `a whole tank in deep space: Δv ${dv.toFixed(3)} m/s, Tsiolkovsky says ${want.toFixed(3)} (burn ${t.toFixed(1)} s at ${M.BIKE.thrust} N)`);
  ok(want > M.vEscape() && want < 2 * M.vEscape(), 'a tank is more than escape speed, less than twice it');
}
// orbits: a skimming circular orbit holds and comes round on time; Kepler and the forecast agree with the flight
{
  const r = R + 15, k = flatBike(0); k.ground = false; k.x = [0, 0, 0, -r]; k.v = [0, 0, M.vOrbit(r), 0]; k.F = [0, 0, 1, 0]; k.U = [0, 0, 0, -1]; k.Rt = [1, 0, 0, 0]; k.N = [0, 1, 0, 0];
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / M.GM); let rmin = Infinity, rmax = 0;
  for (let i = 0; i < Math.round(T / DT); i++) { M.step(k, IN(), DT); rmin = Math.min(rmin, norm(k.x)); rmax = Math.max(rmax, norm(k.x)); }
  ok(rmax - rmin < 0.15 && !k.ground && norm(add(k.x, [0, 0, 0, -r], -1)) < 0.6, `an orbit 15 m up (clearing every hill): radius held to ${(rmax - rmin).toFixed(3)} m, back in ${T.toFixed(0)} s`);
  ok(ortho(k) < 1e-9, 'a whole orbit of SAS keeps the frame orthonormal');
  const x = [0, 0, R + 1, 0], v = [-5, 2, 1.5, -1.5], el = M.elements(x, v), fc = M.predict(x, v, { dt: 0.05, T: 600 });
  const b = flatBike(0); b.ground = false; b.x = x.slice(); b.v = v.slice(); b.F = unit([-5, 2, 0, -1.5]); b.U = [0, 0, 1, 0];
  [b.Rt, b.N] = (() => { const f = (a) => { let r2 = a; for (const u of [b.F, b.U]) r2 = add(r2, u, -dot(r2, u)); return r2; }; const r1 = unit(f([1, 0, 0, 0])); let n = f([0, 0, 0, 1]); n = add(n, r1, -dot(n, r1)); return [r1, unit(n)]; })();
  let rmx = 0, t = 0;
  while (!b.ground && t < 600) { M.step(b, IN(), DT); t += DT; rmx = Math.max(rmx, norm(b.x)); }
  ok(near(rmx, el.apo, 0.15), `apoapsis: Kepler ${(el.apo - R).toFixed(2)} m up, flown ${(rmx - R).toFixed(2)} m`);
  ok(fc.impact && near(fc.impact.t, t, 0.25) && norm(add(fc.impact.x, b.x, -1)) < 1.5, `the forecast lands at t = ${fc.impact?.t.toFixed(2)} s, ${norm(add(fc.impact.x, b.x, -1)).toFixed(2)} m from where the bike did (${t.toFixed(2)} s)`);
  const up = (f) => M.elements([R + 0.1, 0, 0, 0], [f * M.vEscape(R + 0.1), 0, 0, 0]);
  ok(!up(0.99).escaping && up(1.01).escaping, 'straight up at 0.99 of escape speed falls back; at 1.01 it never returns');
}
// landings: wheels down and gentle, you ride on; too fast or not on your wheels, a crash
{
  const k = flatBike(0); k.ground = false; k.x = scale(unit(FLAT), R - 0.01); k.v = add(scale(unit(FLAT), -1), k.F, 4);
  ok(M.touchdown(k) === 'land' && k.ground && near(dot(k.v, k.F), 4, 1e-4), 'down at 1 m/s on your wheels: you ride on at 4 m/s');
  const k2 = flatBike(0); k2.ground = false; k2.x = scale(unit(FLAT), R - 0.01); k2.v = scale(unit(FLAT), -5);
  ok(M.touchdown(k2) === 'crash' && !k2.ground && k2.crashes === 1, 'down at 5 m/s: a crash, bouncing');
  const k3 = flatBike(0); k3.ground = false; k3.x = scale(unit(FLAT), R - 0.01); k3.v = scale(unit(FLAT), -1); [k3.U, k3.Rt] = [k3.Rt, scale(k3.U, -1)];
  ok(M.touchdown(k3) === 'crash' && k3.crashes === 1, 'down gently but on your side: a crash');
}
// in the air: the reaction wheels turn you; SAS turns your wheels to the ground and never moves the nose
{
  const k = flatBike(0); k.ground = false; k.x = scale(unit(FLAT), R + 20); k.v = [0, 0, 0, 0];
  [k.U, k.Rt] = [k.Rt, scale(k.U, -1)];                                   // rolled 90°: wheels sideways
  const F0 = k.F.slice();
  for (let i = 0; i < 240; i++) M.step(k, IN(), DT);
  ok(dot(k.U, unit(k.x)) > 0.999 && dot(k.F, F0) > 0.999, `SAS: wheels back toward the ground in 2 s (${dot(k.U, unit(k.x)).toFixed(4)}), the nose untouched`);
  const k2 = flatBike(0); k2.ground = false; k2.x = scale(unit(FLAT), R + 20); k2.v = [0, 0, 0, 0]; [k2.U, k2.Rt] = [k2.Rt, scale(k2.U, -1)];
  for (let i = 0; i < 240; i++) M.step(k2, IN({ sas: false }), DT);
  ok(Math.abs(dot(k2.U, unit(k2.x))) < 0.01, 'SAS off: nothing turns you (no torque, no rotation)');
  const k3 = flatBike(0); k3.ground = false; k3.x = scale(unit(FLAT), R + 20); k3.holdPitch = false;
  for (let i = 0; i < 60; i++) M.step(k3, IN({ throttle: -1 }), DT);
  ok(near(Math.asin(dot(k3.F, unit(k3.x))), 0.5 * M.BIKE.wheelRate, 0.02), `S pitches the nose up at the wheels' rate: ${(Math.asin(dot(k3.F, unit(k3.x))) * 180 / Math.PI).toFixed(1)}° in 0.5 s`);
  const k4 = flatBike(0); M.step(k4, IN({ jump: true, throttle: 1 }), DT);
  for (let i = 0; i < 60; i++) M.step(k4, IN({ throttle: 1 }), DT);
  ok(Math.abs(dot(k4.F, unit(k4.x))) < 0.05, 'holding W through a jump (still pedalling) doesn\'t pitch you: let go first');
}
// the rocket on the ground pushes along the ground, and the assisted orbit
{
  const k = flatBike(0); let t = 0;
  while (k.ground && t < 30) { M.step(k, IN({ boost: true }), DT); t += DT; }
  const v = norm(k.v);
  ok(!k.ground && near(v, M.vOrbit(norm(k.x)), 0.2), `burning along the ground: off it at ${v.toFixed(2)} m/s after ${t.toFixed(1)} s, as the normal force runs out at orbital speed (${M.vOrbit().toFixed(2)})`);
  const k2 = flatBike(0); M.step(k2, IN({ jump: true }), DT);
  for (let i = 0; i < 120; i++) M.step(k2, IN(), DT);
  let t2 = 0; while (t2 < 120 && !k2.ground) { M.step(k2, IN({ assist: 'circularize' }), DT); t2 += DT; }
  const el = M.elements(k2.x, k2.v);
  ok(!k2.ground && el.e < 0.05, `hop, then CIRCULARIZE: e = ${el.e.toFixed(3)}, ${(el.peri - R).toFixed(1)}–${(el.apo - R).toFixed(1)} m up, ${(M.dvLeft(k2)).toFixed(1)} m/s left`);
}
// the slalom
{
  ok(M.GATES.every((G) => near(norm(add(M.onSurface(G.c), G.c, -1)), 0, 1e-9) && Math.abs(dot(G.F, G.n)) < 1e-9 && Math.abs(dot(G.A, G.B)) < 1e-9), 'every gate stands on the ground, square to it');
  const G = M.GATES[1];                                    // offset ana
  const through = M.gateCross(G, add(G.c, G.F, -1), add(G.c, G.F, 1));
  const wide = M.gateCross(G, add(add(G.c, G.F, -1), G.B, 3), add(add(G.c, G.F, 1), G.B, 3));
  const back = M.gateCross(G, add(G.c, G.F, 1), add(G.c, G.F, -1));
  ok(through === 'pass' && wide === 'miss' && back === null, 'through the middle: pass; 3 m off in w (beside it, unseen): miss; backwards: not counted');
  // the course can be ridden: steer at each gate's centre (right/left and ana/kata alike), hold a cruising speed
  const ride = (vset) => {
    const k = M.makeBike(M.START.at, M.START.facing); let gi = 0, t = 0, miss = 0, air = 0;
    while (gi < M.GATES.length && t < 600) {
      const G = M.GATES[gi], d = add(G.c, k.x, -1), a = dot(d, k.Rt), b = dot(d, k.N), f = dot(d, k.F), m = Math.hypot(a, b);
      const ang = Math.atan2(m, Math.max(f, 0.1)), st = m > 1e-6 ? [(a / m) * Math.min(1, ang * 3), (b / m) * Math.min(1, ang * 3)] : [0, 0];
      const v = norm(k.v), x0 = k.x.slice();
      M.step(k, IN({ throttle: v < vset ? 1 : v > vset + 0.3 ? -0.5 : 0, steer: st }), DT); t += DT; if (!k.ground) air += DT;
      const r = M.gateCross(G, x0, k.x); if (r) { if (r === 'miss') miss++; gi++; }
    }
    return { gi, t, miss, air, crashes: k.crashes };
  };
  const r3 = ride(3), r4 = ride(4);
  ok(r3.gi === 10 && r3.miss === 0 && r3.air === 0, `the slalom rides: at 3 m/s, steering at each gate, all ten clean in ${r3.t.toFixed(0)} s, wheels on the ground`);
  ok(r4.gi === 10 && r4.miss === 0 && r4.air > 3 && r4.crashes === 0, `at 4 m/s the kickers throw you (${r4.air.toFixed(1)} s in the air), and it still goes through all ten in ${r4.t.toFixed(0)} s`);
  const course = M.GATES.map((G) => G.side).join(' ');
  ok(course.startsWith('right ana left kata'), `the gates step round the four ways across: ${course}`);
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
  const k = M.makeBike(unit(add(M.START.at, [0, 0, 0, 1.5 / R])), M.START.facing);   // on ring 1's pad, 1.5 m ana of it
  const edge = unit(add(add(unit(k.x), k.Rt, 1.9 / R), k.N, 0));           // a point of the road's edge in your slice
  ok(M.side('ring1', edge, k.N) > 0.5, `with your slice ana of ring 1, its kerbs in your view are teal (side ${M.side('ring1', edge, k.N).toFixed(2)})`);
  const off = () => M.side('ring1', unit(k.x), k.N) * R * Math.acos(Math.min(1, Math.hypot(unit(k.x)[0], unit(k.x)[1])));
  const before = off();
  k.v = scale(k.F, 2);
  for (let i = 0; i < 120 * 8 && off() > 0.05; i++) M.step(k, { throttle: 0, steer: [0, off() > 0.05 ? -0.6 : 0] }, DT);
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
