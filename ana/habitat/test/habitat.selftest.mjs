// The Hopf habitat's claims, held: run `node ana/habitat/test/habitat.selftest.mjs`.
import { dot, add, scale, norm, unit, J, spin, turn, accel, flight, integrate, floorFrame, decompose, weight,
  hoopStress, maxRadius, floorGravity, hopf, walk, towers, roads, orthonormalTo, makeTrack, trackAt, ride, tracksAt,
  isWater, mapOf, fromMap, wetness, layTrack, LANDMARKS, HOME } from '../js/habitat.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };
let seed = 99;
const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randUnit = () => { const g = () => { const u = rand() + 1e-12, v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; return unit([g(), g(), g(), g()]); };

// --- J: a rotation with J² = −1; the equal double rotation's acceleration is −ω²x at every point (centrifugal ω²x).
{
  let worst = 0;
  for (let k = 0; k < 100; k++) {
    const x = randUnit(), Jx = J(x);
    worst = Math.max(worst, Math.abs(norm(Jx) - 1), Math.abs(dot(x, Jx)), norm(add(J(Jx), x)));
  }
  ok(worst < 1e-12, `J is a rotation, Jx ⊥ x, J² = −1 (${worst.toExponential(1)})`);
  // numerically differentiate x(t) = e^{ωtJ}x twice
  const w = 0.3, h = 1e-3;
  let err = 0;
  for (let k = 0; k < 50; k++) {
    const x = scale(randUnit(), 1 + 100 * rand());
    const a = scale(add(add(turn(x, w * h), x, -2), turn(x, -w * h)), 1 / (h * h));
    err = Math.max(err, norm(add(a, x, w * w)) / (w * w * norm(x)));
  }
  ok(err < 1e-5, `every point of the turning body accelerates at −ω²x, straight at the centre (rel. err ${err.toExponential(1)})`);
}

// --- so the floor's gravity is ω²R everywhere on the 3-sphere; a 2-sphere spun in one plane gets ω²R cos(latitude).
{
  const R = 500, w = 0.14;
  let spread = 0;
  for (let k = 0; k < 500; k++) { const x = scale(randUnit(), R); spread = Math.max(spread, Math.abs(norm(accel(x, [0, 0, 0, 0], w)) - w * w * R)); }
  ok(spread < 1e-9, `the hull's spin gravity is the same at 500 random points (spread ${spread.toExponential(1)} m/s²)`);
  // a 3D sphere spun about one axis: centrifugal ω² × distance from the axis
  const g3 = (lat) => w * w * R * Math.cos(lat);
  ok(Math.abs(g3(Math.PI / 2)) < 1e-12 && Math.abs(floorGravity.sphere3(Math.PI / 3) - 0.5) < 1e-12, 'a 3D sphere spun about an axis: none at the poles, half at 60°');
  // and an unequal double rotation is not uniform: ω₁²r₁ in one plane plus ω₂²r₂ in the other
  const g2 = (x, w1, w2) => Math.hypot(w1 * w1 * x[0], w1 * w1 * x[1], w2 * w2 * x[2], w2 * w2 * x[3]);
  const a = g2([R, 0, 0, 0], 0.14, 0.1), b = g2([0, 0, R, 0], 0.14, 0.1);
  ok(Math.abs(a - b) / a > 0.4, `unequal rates (0.14, 0.10): gravity varies across the floor by ${(100 * (a - b) / a).toFixed(0)}%; only equal rates make it even`);
}

// --- flights: the exact (inertial straight line, turned back) and RK4 in the turning frame agree.
{
  const R = 300, { omega: w } = spin(R, 9.81);
  let worstT = 0, worstX = 0;
  for (let k = 0; k < 12; k++) {
    const xh = randUnit(), F = floorFrame(xh), x0 = scale(xh, R - 1.7);
    const v0 = add(add(scale(F.e, (rand() - 0.5) * 30), F.f, (rand() - 0.5) * 30), scale(F.down, -rand() * 15));
    const ex = flight(x0, v0, w, R), nu = integrate(x0, v0, w, R, 2e-4);
    worstT = Math.max(worstT, Math.abs(ex.tLand - nu.tLand));
    worstX = Math.max(worstX, norm(add(ex.land, nu.land, -1)));
  }
  ok(worstT < 2e-3 && worstX < 0.02, `exact flights match RK4 in the turning frame (Δt ${worstT.toExponential(1)} s, Δx ${worstX.toExponential(1)} m)`);
}

// --- a drop lands antispinward by the same amount everywhere, and exactly as in a cylinder of the same radius: a drop's
//     motion stays in the plane of x and Jx, which is the cylinder's problem.
{
  const R = 300, g = 9.81, { omega: w } = spin(R, g), h = 20;
  // the 2D cylinder, done independently
  const r0 = R - h, tc = Math.sqrt(R * R - r0 * r0) / (w * r0), arc = R * (Math.atan2(w * r0 * tc, r0) - w * tc);
  let worst = 0, across = 0;
  for (let k = 0; k < 200; k++) {
    const xh = randUnit(), fl = flight(scale(xh, R - h), [0, 0, 0, 0], w, R), F = floorFrame(xh);
    const d = decompose(xh, add(fl.land, scale(xh, R), -1));
    const arc4 = R * Math.atan2(dot(fl.land, F.f), dot(fl.land, xh));       // the arc along the spin circle
    worst = Math.max(worst, Math.abs(arc4 - arc)); across = Math.max(across, Math.hypot(...d.across));
  }
  ok(arc < 0 && worst < 1e-6 && across < 1e-9, `a 20 m drop lands ${(-arc).toFixed(3)} m antispinward at every one of 200 points, as in a cylinder (spread ${worst.toExponential(1)})`);
}

// --- throws: along the spin, no sideways swerve (only lighter or heavier); across the spin, the swerve is the same
//     size whichever way you throw, always turned the same way (J turns the across-plane by 90°). In a cylinder, a
//     throw along the axis goes straight; here no horizontal throw does.
{
  const R = 300, { omega: w } = spin(R, 9.81), u = 15;
  const xh = randUnit(), F = floorFrame(xh), x0 = scale(xh, R - 1.7);
  const side = (dir) => {
    const v0 = add(scale(dir, u), F.down, -u * 0.5);   // up and out
    const fl = flight(x0, v0, w, R), d = decompose(xh, add(fl.land, scale(xh, R), -1));
    const h = unit(add(dir, F.down, -dot(dir, F.down)));
    const disp = add(fl.land, scale(xh, R), -1), horiz = add(disp, F.down, -dot(disp, F.down));
    const sideways = add(horiz, h, -dot(horiz, h));
    const acrossPart = add(sideways, F.f, -dot(sideways, F.f));               // what's left after the spinward drift
    return { sideways: norm(sideways), across: acrossPart, d, sw: sideways };
  };
  const along = side(F.f);
  ok(along.sideways < 1e-9, `a throw spinward stays in its vertical plane (sideways ${along.sideways.toExponential(1)} m)`);
  const mags = [], dirs = [];
  for (let k = 0; k < 8; k++) {
    const a = (2 * Math.PI * k) / 8, dir = add(scale(F.e, Math.cos(a)), F.Je, Math.sin(a));
    const s = side(dir); mags.push(norm(s.across));
    // the across part of the swerve points along J of the throw's direction, the same turn every time
    dirs.push(dot(unit(s.across), J(dir)));
  }
  const spreadM = Math.max(...mags) - Math.min(...mags);
  ok(mags[0] > 0.5 && spreadM < 1e-6 * mags[0] + 1e-9, `a throw across the spin swerves ${mags[0].toFixed(2)} m across it, the same in all 8 directions (spread ${spreadM.toExponential(1)} m)`);
  ok(dirs.every((c) => Math.abs(Math.abs(c) - 1) < 1e-6) && dirs.every((c) => Math.sign(c) === Math.sign(dirs[0])), `and always toward the same turn of the throw, ${dirs[0] > 0 ? '+' : '−'}J·dir (${dirs.map((c) => c.toFixed(3)).join(' ')})`);
}

// --- weight: walking spinward at u you weigh (ωR + u)²/R, against the spin (ωR − u)²/R, across it (ω²R² + u²)/R.
{
  const R = 300, g = 9.81, { omega: w } = spin(R, g), u = 5, xh = randUnit(), F = floorFrame(xh), x = scale(xh, R);
  const sp = weight(x, scale(F.f, u), w), an = weight(x, scale(F.f, -u), w), ac = weight(x, scale(F.e, u), w);
  ok(Math.abs(sp - (w * R + u) ** 2 / R) < 1e-9 && Math.abs(an - (w * R - u) ** 2 / R) < 1e-9 && Math.abs(ac - (w * w * R * R + u * u) / R) < 1e-9,
    `walking at 5 m/s: spinward ${(sp / g).toFixed(3)} g, against ${(an / g).toFixed(3)} g, across ${(ac / g).toFixed(3)} g`);
  ok(Math.abs(weight(x, [0, 0, 0, 0], w) - g) < 1e-12, 'standing still: exactly 1 g');
}

// --- the hull: a thin 3-sphere under even load carries σ = pR/3t. Check the force balance by sampling: the load on a
//     half-shell, along its axis, is p times the 3-ball the cut leaves (4πR³/3), spread over the rim (a 2-sphere, 4πR²).
{
  let s = 0; const N = 400000;
  for (let k = 0; k < N; k++) s += Math.max(0, randUnit()[3]);
  const area = 2 * Math.PI * Math.PI, projected = (s / N) * area;        // ∫ max(0, n·e₄) dA on the unit 3-sphere
  ok(Math.abs(projected - (4 * Math.PI) / 3) < 0.02, `half a 3-sphere's load, projected, is the 3-ball the cut leaves (${projected.toFixed(3)} vs ${(4 * Math.PI / 3).toFixed(3)})`);
  const sigmaOverPRt = ((4 * Math.PI) / 3) / (4 * Math.PI);
  ok(Math.abs(sigmaOverPRt - 1 / 3) < 1e-12, 'so σ = pR/3t: a third of a cylinder\'s pR/t');
  ok(Math.abs(maxRadius.hopf(1e5, 9.81) / maxRadius.cylinder(1e5, 9.81) - 3) < 1e-12 && Math.abs(hoopStress.hopf(9.81, 1000) * 3 - hoopStress.cylinder(9.81, 1000)) < 1e-9,
    'for the same material and gravity, the Hopf hull can be 3× the radius');
}

// --- Hopf circles: the spin carries every point round a great circle; the Hopf map is constant along it; two of them
//     never meet and stay the same distance apart all the way round (Clifford parallels).
{
  let flat = 0, parallel = 0;
  for (let k = 0; k < 100; k++) {
    const x = randUnit(), y = randUnit(), h0 = hopf(x);
    const d0 = norm(add(x, y, -1));
    for (let j = 1; j < 12; j++) {
      const a = (2 * Math.PI * j) / 12;
      const h1 = hopf(turn(x, a)); flat = Math.max(flat, Math.hypot(h1[0] - h0[0], h1[1] - h0[1], h1[2] - h0[2]));
      // distance from turn(x, a) to the nearest point of y's circle: constant
      let best = Infinity;
      for (let i = 0; i < 720; i++) best = Math.min(best, norm(add(turn(x, a), turn(y, (2 * Math.PI * i) / 720), -1)));
      let best0 = Infinity;
      for (let i = 0; i < 720; i++) best0 = Math.min(best0, norm(add(x, turn(y, (2 * Math.PI * i) / 720), -1)));
      parallel = Math.max(parallel, Math.abs(best - best0));
    }
    void d0;
  }
  ok(flat < 1e-12, 'the Hopf map is the same all along a spin circle');
  ok(parallel < 1e-4, `two spin circles stay the same distance apart all the way round (spread ${parallel.toExponential(1)})`);
}

// --- walking: the walked frame stays on the floor and orthonormal over a long walk; towers and roads are unit.
{
  let xh = [1, 0, 0, 0], vs = [[0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]];
  const R = 300;
  for (let k = 0; k < 5000; k++) {
    const m = unit(add(scale(vs[0], Math.cos(k * 0.01)), vs[1], Math.sin(k * 0.01)));
    const r = walk(xh, m, 1.3, R, vs); xh = r.xhat; vs = r.vectors;
  }
  let err = Math.abs(norm(xh) - 1);
  for (let i = 0; i < 3; i++) { err = Math.max(err, Math.abs(dot(vs[i], xh)), Math.abs(norm(vs[i]) - 1)); for (let j = 0; j < i; j++) err = Math.max(err, Math.abs(dot(vs[i], vs[j]))); }
  // a frame whose third vector lies in the span of the first two still comes out whole (the bike's mount does this)
  const fx = [1, 0, 0, 0], fr = orthonormalTo(fx, [[0, 1, 0, 0], [0, 0, 1, 0], [0, 1, 1, 0]]);
  ok(fr.every((v) => Math.abs(norm(v) - 1) < 1e-12) && Math.abs(dot(fr[2], fr[0])) < 1e-12 && Math.abs(dot(fr[2], fr[1])) < 1e-12 && Math.abs(dot(fr[2], fx)) < 1e-12,
    'orthonormalTo fills in a direction that was in the span of the others');
  ok(err < 1e-9, `6.5 km of wandering: the frame is still on the floor and orthonormal (${err.toExponential(1)})`);
  const T = towers(), Rd = roads();
  ok(T.length === 24 && T.every((t) => Math.abs(norm(t) - 1) < 1e-12) && Rd.length === 12 && Rd.every((r) => Math.abs(Math.hypot(...r) - 1) < 1e-12), '24 towers at the 24-cell\'s corners, 12 roads');
  // the 24-cell's nearest neighbours are 60° apart
  let minAng = Infinity;
  for (let i = 0; i < 24; i++) for (let j = 0; j < i; j++) minAng = Math.min(minAng, Math.acos(Math.max(-1, Math.min(1, dot(T[i], T[j])))));
  ok(Math.abs(minAng - Math.PI / 3) < 1e-9, `towers 60° apart: a sixth of the way round (${(minAng * 180 / Math.PI).toFixed(6)}°)`);
}

// --- riding. Every great circle keeps the same angle to the spin all the way round (its spinward share is constant),
//     so a straight road rides the same everywhere along it.
{
  let worst = 0;
  for (let k = 0; k < 40; k++) {
    const xh = randUnit(), F = floorFrame(xh), al = rand() * 2 * Math.PI, b = unit(add(scale(F.f, Math.cos(al)), add(scale(F.e, Math.sin(al) * Math.cos(k)), F.Je, Math.sin(al) * Math.sin(k))));
    const share0 = dot(b, F.f);
    for (let j = 0; j < 24; j++) {
      const th = (2 * Math.PI * j) / 24, x = add(scale(xh, Math.cos(th)), b, Math.sin(th)), t = add(scale(xh, -Math.sin(th)), b, Math.cos(th));
      worst = Math.max(worst, Math.abs(dot(t, J(x)) - share0));
    }
  }
  ok(worst < 1e-12, `a great circle's share of the spin is the same all the way round (40 circles, ${worst.toExponential(1)})`);
}
{
  const R = 300, g = 9.81, { omega: w } = spin(R, g), xh = randUnit(), T = tracksAt(xh), v = 15;
  const sample = (tr, n = 64) => Array.from({ length: n }, (_, i) => trackAt(tr, (tr.len * i) / n));
  // the spin never pushes along the track, on any track
  let along = 0;
  for (const kind of ['spin', 'across', 'diagonal']) for (const q of sample(makeTrack(T[kind]))) along = Math.max(along, Math.abs(ride(q.x, q.t, q.k, v, R, w).along));
  const sl = makeTrack({ ...T.slalom, A: 15 / R, B: 10 / R });
  for (const q of sample(sl, 200)) along = Math.max(along, Math.abs(ride(q.x, q.t, q.k, v, R, w).along));
  ok(along < 2e-3, `the spin never speeds you up or slows you down, on any track (along-track push ≤ ${along.toExponential(1)} m/s²)`);
  // spinward: no lean, heavier, (ωR + v)²/R; against at the floor's own speed: weightless
  const sp = sample(makeTrack(T.spin)).map((q) => ride(q.x, q.t, q.k, v, R, w));
  ok(sp.every((r) => r.angle < 1e-3 && Math.abs(r.normal - (w * R + v) ** 2 / R) < 1e-3), `the spin road at 15 m/s: no lean, ${(sp[0].normal / g).toFixed(3)} g = (ωR + v)²/R`);
  const fl = sample(makeTrack(T.spin)).map((q) => ride(q.x, q.t, q.k, -w * R, R, w));
  ok(fl.every((r) => Math.abs(r.normal) < 1e-3), `against the spin at the floor's speed (${(w * R).toFixed(1)} m/s): weightless (${Math.abs(fl[0].normal).toExponential(1)} m/s²)`);
  // across: a constant lean on a straight road, tan φ = 2ωv/(ω²R + v²/R), toward ±J of your heading, the same all round
  const ac = sample(makeTrack(T.across)).map((q) => ({ r: ride(q.x, q.t, q.k, v, R, w), q }));
  const want = Math.atan((2 * w * v) / (w * w * R + (v * v) / R));
  const dirOK = ac.every(({ r, q }) => Math.abs(Math.abs(dot(unit(r.lean), J(q.t))) - 1) < 1e-3);
  ok(ac.every(({ r }) => Math.abs(r.angle - want) < 1e-3) && dirOK,
    `straight across the spin at 15 m/s: you lean ${(want * 180 / Math.PI).toFixed(1)}° all the way round, toward J of your heading`);
  // diagonal: between, constant
  const dg = sample(makeTrack(T.diagonal)).map((q) => ride(q.x, q.t, q.k, v, R, w));
  ok(dg.every((r) => Math.abs(r.angle - dg[0].angle) < 1e-3 && Math.abs(r.normal - dg[0].normal) < 1e-3) && dg[0].angle > 1e-3 && dg[0].angle < want,
    `at 45° to the spin: a smaller lean (${(dg[0].angle * 180 / Math.PI).toFixed(1)}°), constant all round`);
  // the slalom closes, stays on the floor, and its lean swings both ways, partly through J's direction
  const ss = sample(sl, 400).map((q) => ({ r: ride(q.x, q.t, q.k, v, R, w), q }));
  const leans = ss.map(({ r }) => r.angle);
  ok(Math.max(...leans) - Math.min(...leans) > 0.1 && Math.abs(norm(trackAt(sl, sl.len).x) - 1) < 1e-12 && norm(add(trackAt(sl, sl.len).x, trackAt(sl, 0).x, -1)) < 1e-9,
    `the slalom closes on itself and its lean swings from ${(Math.min(...leans) * 180 / Math.PI).toFixed(0)}° to ${(Math.max(...leans) * 180 / Math.PI).toFixed(0)}°`);
  // the track's samples: arc length of a great circle is 2π
  ok(Math.abs(makeTrack(T.across).len - 2 * Math.PI) < 1e-5, 'a great-circle track is 2πR round');
}

// --- the map: the 3-sphere's logarithm at you. Back and forth is the identity; distances from you are walking
//     distances; the whole habitat sits inside radius πR.
{
  const R = 300;
  let rt = 0, dist = 0, inside = true;
  for (let k = 0; k < 300; k++) {
    const xh = randUnit(), F = floorFrame(xh), fr3 = [F.f, F.e, F.Je], u = randUnit();
    const m = mapOf(xh, fr3, u, R);
    rt = Math.max(rt, norm(add(fromMap(xh, fr3, m, R), u, -1)));
    dist = Math.max(dist, Math.abs(Math.hypot(...m) - R * Math.acos(Math.max(-1, Math.min(1, dot(u, xh))))));
    if (Math.hypot(...m) > Math.PI * R + 1e-9) inside = false;
  }
  ok(rt < 1e-9 && dist < 1e-9 && inside, `the map: back and forth is exact (${rt.toExponential(1)}), distance from you is walking distance, all within πR`);
  // your forward is the map's +y, your right +x, your w +z
  const xh = randUnit(), F = floorFrame(xh), fr3 = [F.f, F.e, F.Je];
  const ahead = mapOf(xh, fr3, walk(xh, F.f, 10, R, []).xhat, R), ana = mapOf(xh, fr3, walk(xh, F.Je, 10, R, []).xhat, R);
  ok(Math.abs(ahead[1] - 10) < 1e-9 && Math.abs(ahead[0]) < 1e-9 && Math.abs(ana[2] - 10) < 1e-9, '10 m ahead maps to (0, 10, 0); 10 m ana to (0, 0, 10)');
}
// --- the land: lakes cover some of it, not all; home is dry; tracks are laid on their driest line, never wetter than
//     the first line they could have taken.
{
  let wet = 0; const N = 4000;
  for (let k = 0; k < N; k++) if (isWater(randUnit())) wet++;
  ok(wet / N > 0.05 && wet / N < 0.6, `lakes cover ${(100 * wet / N).toFixed(0)}% of the floor`);
  ok(!isWater(HOME), 'home is on dry land');
  const R = 300;
  for (const kind of ['across', 'diagonal', 'slalom']) {
    const laid = layTrack(kind, HOME, R), first = layTrack(kind, HOME, R, 1);
    ok(laid.wet <= first.wet, `the ${kind} track from home: ${(100 * laid.wet).toFixed(1)}% over water on its driest line (the first line tried: ${(100 * first.wet).toFixed(1)}%)`);
  }
  ok(LANDMARKS.length === 24 && new Set(LANDMARKS.map((l) => l.name)).size === 24, '24 landmarks, A to X');
}

console.log(`${fails ? '✗' : '✓'} habitat: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
