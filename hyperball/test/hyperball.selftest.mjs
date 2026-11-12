// HYPERBALL's claims, held: run `node hyperball/test/hyperball.selftest.mjs`.
import { readFileSync } from 'node:fs';
import * as H from '../js/habitat.js';
import { ARENA, OWN, ENEMY, SPOT, gravity, height, along, makeBall, stepBall, makeBike, stepBike, turnRate, bikeBody,
  collide, inGoal, lockSlice, intercept, steerToward, approach, kickoff, up } from '../js/arena.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };
const A = ARENA, R = A.R;
const none = { throttle: 0, steer: [0, 0], jump: false, jumpHeld: false, boost: false };

// --- the copy of ana's habitat maths is byte-identical (edit ana's, then copy it over)
{
  const here = readFileSync(new URL('../js/habitat.js', import.meta.url), 'utf8');
  let theirs = null;
  try { theirs = readFileSync(new URL('../../ana/habitat/js/habitat.js', import.meta.url), 'utf8'); } catch { /* not in a monorepo checkout */ }
  ok(theirs === null || here === theirs, 'js/habitat.js is byte-identical to ana/habitat/js/habitat.js');
}

// --- gravity: arcade is g straight down everywhere; spin is g on the floor too, and at rest it's the same
{
  let worst = 0;
  for (let k = 0; k < 100; k++) {
    const x = H.scale(H.unit([Math.sin(k), Math.cos(3 * k), Math.sin(5 * k + 1), Math.cos(k * 7)]), R);
    worst = Math.max(worst, Math.abs(H.norm(gravity(x, [0, 0, 0, 0], 'arcade')) - A.g), Math.abs(H.norm(gravity(x, [0, 0, 0, 0], 'spin')) - A.g));
  }
  ok(worst < 1e-9, `on the floor, at rest, both gravities are ${A.g.toFixed(2)} m/s² everywhere (${worst.toExponential(1)})`);
  // spin mode's ball flight is the habitat's exact flight
  const w = Math.sqrt(A.g / R), x0 = H.scale([1, 0, 0, 0], R - 5), v0 = [0, 3, 4, -2];
  const fl = H.flight(x0, v0, w, R - A.ball.r);
  const b = { x: x0.slice(), v: v0.slice() }, dt = 1 / 2000;
  const save = A.ball.drag; A.ball.drag = 0;
  for (let t = 0; t < fl.tLand * 0.9; t += dt) stepBall(b, dt, 'spin');
  A.ball.drag = save;
  ok(H.norm(H.add(b.x, fl.at(fl.tLand * 0.9), -1)) < 0.02, `spin mode: a ball's flight is the habitat's exact one (${H.norm(H.add(b.x, fl.at(fl.tLand * 0.9), -1)).toExponential(1)} m)`);
}

// --- the ball: a drop bounces lower each time (restitution), comes to rest on the floor, never sinks through it
{
  const b = makeBall(SPOT, 6);
  let peaks = [], prevH = height(b.x) - A.ball.r, rising = false, minH = Infinity;
  for (let i = 0; i < 120 * 12; i++) {
    stepBall(b, 1 / 120, 'arcade');
    const h = height(b.x) - A.ball.r; minH = Math.min(minH, h);
    if (h > prevH) rising = true; else if (rising) { peaks.push(prevH); rising = false; }
    prevH = h;
  }
  ok(peaks.length >= 2 && peaks[1] < peaks[0] && Math.abs(peaks[0] / 6 - A.ball.restitution ** 2) < 0.08, `bounces fall by e² each time (first peak ${peaks[0]?.toFixed(2)} m from 6 m; e² = ${(A.ball.restitution ** 2).toFixed(2)})`);
  ok(minH > -1e-9 && H.norm(b.v) < 0.5, `it settles on the floor and never sinks through (lowest ${minH.toExponential(1)} m, speed ${H.norm(b.v).toFixed(2)} m/s)`);
}

// --- the bike: drives along the floor without leaving it; its turn is limited by the lean; it jumps and lands
{
  const k = makeBike(SPOT, [0, 1, 0, 0]);
  for (let i = 0; i < 600; i++) stepBike(k, { ...none, throttle: 1, steer: [0.6, 0.4] }, 1 / 120, 'arcade');
  ok(Math.abs(H.norm(k.x) - R) < 1e-6 && k.ground, `driving and turning for 5 s, it stays on the floor (|x| − R = ${(H.norm(k.x) - R).toExponential(1)})`);
  ok(Math.abs(k.speed - A.bike.maxSpeed) < 0.5, `throttle takes it to its top speed (${k.speed.toFixed(1)} m/s)`);
  const lean = Math.atan(H.norm(k.lean));
  ok(lean <= A.bike.leanMax + 1e-9 && lean > 0.2, `turning, it leans ${(lean * 180 / Math.PI).toFixed(0)}°, within its ${(A.bike.leanMax * 180 / Math.PI).toFixed(0)}° limit`);
  let err = 0;
  const u = up(k.x);
  for (const [a, b] of [[k.F, k.Rt], [k.F, k.N], [k.Rt, k.N], [k.F, u], [k.Rt, u], [k.N, u]]) err = Math.max(err, Math.abs(H.dot(a, b)));
  ok(err < 1e-9, `its frame stays orthonormal and level (${err.toExponential(1)})`);
  ok(Math.abs(turnRate(20) * 20 - A.g * Math.tan(A.bike.leanMax)) < 1e-9, 'at speed, the turn is the lean limit\'s: v·ω = g tan φ');
  // a moving jump: inside a sphere the floor curves up to meet you, so at speed v a jump feels g + v²/R
  const v0 = k.speed;
  stepBike(k, { ...none, jump: true }, 1 / 120, 'arcade');
  let peakM = 0, landedM = false;
  for (let i = 0; i < 600 && !landedM; i++) { stepBike(k, none, 1 / 120, 'arcade'); peakM = Math.max(peakM, height(k.x)); landedM = k.ground; }
  const wantM = A.bike.jump ** 2 / (2 * (A.g + v0 * v0 / R));
  ok(landedM && Math.abs(peakM - wantM) < 0.12, `a jump at ${v0.toFixed(0)} m/s rises ${peakM.toFixed(2)} m: the floor curves up to meet you, v²/2(g + v²/R) = ${wantM.toFixed(2)}`);
  // standing still: v²/2g
  const ks = makeBike(SPOT, [0, 1, 0, 0]);
  stepBike(ks, { ...none, jump: true }, 1 / 120, 'arcade');
  let peak = 0, landed = false;
  for (let i = 0; i < 600 && !landed; i++) { stepBike(ks, none, 1 / 120, 'arcade'); peak = Math.max(peak, height(ks.x)); landed = ks.ground; }
  const want = A.bike.jump ** 2 / (2 * A.g);
  ok(landed && Math.abs(peak - want) < 0.12, `a standing jump rises ${peak.toFixed(2)} m (v²/2g = ${want.toFixed(2)}) and lands`);
  // a boosted jump with jump held goes higher
  const k2 = makeBike(SPOT, [0, 1, 0, 0]);
  stepBike(k2, { ...none, jump: true }, 1 / 120, 'arcade');
  let peak2 = 0;
  for (let i = 0; i < 400; i++) { stepBike(k2, { ...none, boost: true, jumpHeld: true }, 1 / 120, 'arcade'); peak2 = Math.max(peak2, height(k2.x)); if (k2.ground) break; }
  ok(peak2 > peak * 1.5, `boost with jump held flies higher (${peak2.toFixed(1)} m)`);
}

// --- hitting the ball: it moves away from the bike, faster than the bike was closing
{
  const k = makeBike(SPOT, [0, 1, 0, 0]);
  k.speed = 12; k.v = H.scale(k.F, 12);
  const b = { x: H.add(bikeBody(k), k.F, A.ball.r + A.bike.r - 0.2), v: [0, 0, 0, 0] };
  ok(collide(k, b) && H.dot(b.v, k.F) > 12, `a hit at 12 m/s sends the ball off at ${H.dot(b.v, k.F).toFixed(1)} m/s along your heading`);
}

// --- goals: inside the spherinder counts; outside it, too far or too high, doesn't; the goals are opposite poles
{
  const at = (dist, h) => H.scale(H.walk(OWN, [0, 1, 0, 0], dist, R, []).xhat, R - h);
  ok(inGoal(at(3, 2), OWN) && !inGoal(at(A.goal.r + 0.5, 2), OWN) && !inGoal(at(3, A.goal.h + 0.5), OWN) && !inGoal(at(3, 2), ENEMY), 'the goal is the spherinder: within r along the floor, below h');
  ok(Math.abs(along(OWN, ENEMY) - Math.PI * R) < 1e-9, `the goals are πR = ${(Math.PI * R).toFixed(0)} m apart, as far as the floor allows`);
  const ko = kickoff();
  ok(Math.abs(along(ko.ball.x, OWN) - along(ko.ball.x, ENEMY)) < 1e-6 && Math.abs(along(ko.bike.x, ko.ball.x) - 26) < 1e-6, 'kickoff: the ball midway between the goals, you 26 m from it');
}

// --- ball lock: after locking, the ball lies exactly in your slice, wherever it is
{
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const k = makeBike(H.unit([Math.cos(i), Math.sin(i), Math.cos(2 * i), Math.sin(3 * i)]), [Math.sin(i), 1, 0.3, Math.cos(i)]);
    const target = H.scale(H.unit([Math.sin(7 * i), Math.cos(5 * i), Math.sin(i + 2), Math.cos(i * 11)]), R - 4);
    lockSlice(k, target);
    const d = H.add(target, k.x, -1);
    if (H.norm(H.add(H.add(d, k.F, -H.dot(d, k.F)), up(k.x), -H.dot(d, up(k.x)))) > 0.3) worst = Math.max(worst, Math.abs(H.dot(d, k.N)));
  }
  ok(worst < 1e-9, `ball lock puts the ball in your slice: its offset into w is ${worst.toExponential(1)} m after locking, over 200 cases`);
}

// --- aiming: the intercept is somewhere you can reach in time; steering toward a point turns you to face it
{
  const ko = kickoff();
  const it = intercept(ko.bike, ko.ball, 'arcade', A.bike.maxSpeed);
  ok(it && it.t > 0 && along(ko.bike.x, it.x) - A.ball.r - A.bike.r <= A.bike.maxSpeed * it.t + 1e-6, `from kickoff you meet the ball in ${it.t.toFixed(2)} s`);
  const k = makeBike(SPOT, [0, 1, 0, 0]);
  const target = H.scale(H.walk(H.unit(SPOT), H.unit([0, 0, 0, 1]), 30, R, []).xhat, R);   // 30 m off to the side, ana
  let closest = Infinity, when = 0;
  for (let i = 0; i < 600; i++) { const s = steerToward(k, target); stepBike(k, { ...none, throttle: 1, steer: s.steer }, 1 / 120, 'arcade'); const d = along(k.x, target); if (d < closest) { closest = d; when = i / 120; } }
  ok(closest < 1.5, `steering toward a point 30 m ana, from a standstill facing across it, passes within ${closest.toFixed(2)} m of it at ${when.toFixed(1)} s`);
  const ap = approach(H.scale(H.unit(SPOT), R));
  ok(along(ap.point, ENEMY) > along(SPOT, ENEMY) && Math.abs(along(ap.point, SPOT) - 2.4) < 1e-6, 'the approach point is behind the ball, away from their goal');
}

console.log(`${fails ? '✗' : '✓'} hyperball: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
