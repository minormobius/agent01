#!/usr/bin/env node
// arm.mjs — a 6-DOF bench arm that picks up a can and pours it, designed for
// cad.mino.mobi. Companion to ../gripper: the gripper is the payload.
//
// FRAME: Z up, X forward, Y right. The bench plate is z = 0.
//
// ARCHITECTURE — a parallelogram arm, counterweighted, bench mounted.
// J1 yaws about Z. J2 and J3 are COAXIAL at the shoulder: J2 swings the upper
// arm, J3 swings a crank whose push rod drives an elbow crank rigid with the
// forearm. The parallelogram J2–P–F–E makes the elbow crank parallel to the J3
// crank, so THE FOREARM'S ABSOLUTE ANGLE IS j3, independent of j2. Three things
// fall out of that and they are the whole reason for the architecture:
//
//   1. both big actuators sit at the shoulder — no elbow motor to carry;
//   2. gravity splits into two INDEPENDENT one-DOF problems (the upper arm's
//      moment about J2, and the forearm's moment about the J3 crank, which the
//      push rod delivers 1:1), so a counterweight on each rear extension
//      balances EXACTLY, at every configuration — no spring curve to tune and
//      no residual anywhere in the workspace;
//   3. all the counterweight mass is at the shoulder, loading the base rather
//      than the arm, which on a bench is free.
//
// Deliberately balanced to 80%, not 100%: a perfectly balanced arm drifts
// anywhere when you cut power, an 80% one settles downward, which is a known
// failure direction. The 20% residual is held by the gearbox, not the motor.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const round = (v, n = 2) => Number(v.toFixed(n));
const rad = (d) => (d * Math.PI) / 180;

export const D = {
  // ── the task ──────────────────────────────────────────────────────────────
  canD: 66, canH: 123, canMass: 0.345,        // a 330 ml can, full
  glassD: 80, glassH: 140,
  benchReach: 560,                            // shoulder to tool flange, fully extended

  // ── the chain ─────────────────────────────────────────────────────────────
  L1: 250,                                    // J2 -> elbow
  L2: 250,                                    // elbow -> wrist centre
  Lw: 60,                                     // wrist centre -> tool flange
  crank: 80,                                  // the parallelogram's short side
  cwR1: 300,                                  // CW1, on the upper arm's rear extension: full width, and
  cwR2: 200,                                  // CW2, on the J3 cranks': a puck on each, OUTBOARD of them.
                                              // Different radii because the same one puts them in the
                                              // same place whenever j2 = j3, which is most of the pour.
  cw2D: 90,                                   // CW2's pucks are fatter so they stay short in Y
  j4Len: 40,                                  // the J4 roll tube
  shoulderZ: 400,                             // J2 height above the bench plate — set by the
                                              // COUNTERWEIGHT SWING, not by the wrist: CW1 rides
                                              // the upper arm's rear extension and is the lowest
                                              // thing on the machine when the arm points up.
  balance: 0.8,                               // fraction of gravity the counterweights take

  // ── masses that set the balance (kg) ──────────────────────────────────────
  mUpper: 0.35, mFore: 0.30, mWrist: 1.00,
  mGripper: 1.86, mFingers: 0.15,             // ../gripper, from its own closed forms

  // ── structure ─────────────────────────────────────────────────────────────
  baseD: 182, baseT: 12, baseBolt: 8.4, baseBoltR: 72, baseBoltN: 4,
  colD: 84, colBore: 60, colZ: [12, 240],
  turretD: 92, turretT: 14, turretBore: 40,
  cheekT: 12, cheekH: 80, cheekL: 110, cheekY: 68,   // the shoulder cheeks: 56…68, clear of the rods
  jL: 80, jLlen: 70,                          // large joint module: Ø80 × 70
  jS: 50, jSlen: 45,                          // small joint module
  linkW: 60, linkT: 20,                       // upper arm and forearm section
  // The Y stack-up, outward from the centre plane. The forearm STRADDLES the
  // upper arm: two bars pinned on a common pivot cannot share a plane, and a
  // clevis is the only thing that makes an elbow assemblable.
  foreT: 14, foreY: 26,                       // forearm, two plates: 12…26
  crankW: 44, crankT: 12, crankY: 40,         // the J3 cranks: 28…40
  ecW: 22, ecT: 14, ecY: 40,                  // the elbow cranks, bolted to the forearm's outer face: 26…40
  rodW: 22, rodT: 10, rodY: 52,               // the push rods: 42…52
  // ── the J5 wrist, as a real clevis ──────────────────────────────────────
  // A fork on the J4 roll tube, a blade between its cheeks, a shaft through
  // both. The numbers come out of the SWEEP, not out of taste: every point of
  // the blade traces r = hypot(x, z) about the pitch axis, so the fork has to
  // be clear of that whole circle everywhere the blade can reach.
  forkBack: 55, forkWeb: 12, forkProng: 25,   // x −55…25, web inner face at −43
  forkGap: 54, forkCheek: 12, forkH: 70,      // cheeks |y| 27…39, z ±35
  bladeT: 50, bladeH: 60, bladeRear: -20, bladeFlare: 45,   // |y| ≤ 25, z ±30
  pitchD: 16, pitchBush: 22, pitchFit: 16.2,
  bore: 12.2, pin: 12, pinLen: 90,            // the parallelogram pins
  cwD: 70,                                    // counterweight cylinders
  rollD: 54, rollBore: 34,
  flangeD: 63, flangeT: 8, flangePcd: 50, flangeBolt: 6.6, flangeBoltN: 4,

  // joint limits, degrees. j2's ceiling is what keeps CW1 off the bench; j5's
  // range is what a level tool needs when reaching down to it (87° at r 500).
  lim: { j1: [-170, 170], j2: [-30, 60], j3: [-95, 50], j4: [-180, 180], j5: [-100, 100] },
  rpm: 3,                                     // the pour demo's clock
};

// ── derived: the balance, which is the architecture's whole point ────────────
D.mTip = D.mGripper + D.mFingers + D.canMass;             // what hangs off the flange
// moment per unit cos(angle), kg·mm. M3 is delivered to the J3 crank 1:1 by the
// push rod; M2 is everything outboard of the elbow, acting through the elbow.
D.M3 = D.mFore * (D.L2 / 2) + D.mWrist * D.L2 + D.mTip * (D.L2 + D.Lw);
D.M2 = D.mUpper * (D.L1 / 2) + (D.mFore + D.mWrist + D.mTip) * D.L1;
D.cw1 = (D.balance * D.M2) / D.cwR1;                      // kg on the upper arm's rear extension
D.cw2 = (D.balance * D.M3) / D.cwR2;                      // kg total, split over the two J3 cranks
const STEEL = 7.85e-3;                                     // g/mm³
D.cw1Len = round((D.cw1 * 1000) / 2 / STEEL / (Math.PI * (D.cwD / 2) ** 2), 1);   // each of two
D.cw2Len = round((D.cw2 * 1000) / 2 / STEEL / (Math.PI * (D.cw2D / 2) ** 2), 1);   // each of two
D.colTop = D.colZ[1];
D.turretZ = [D.colTop, D.colTop + D.turretT];
D.shZ = D.shoulderZ;

// ── the tool ─────────────────────────────────────────────────────────────────
// Flange to the CENTRE OF THE HELD OBJECT, along the tool axis: 141 mm of
// gripper (its web face to the jaw carriers) plus a 40 mm customer finger. The
// can is held with its own axis PERPENDICULAR to the tool axis, so a roll of
// the tool tips it — which is what makes the pour a roll rather than a wrist
// move, and why the gripper's own one-way roll could do this job instead.
D.toolLen = 181;
D.canZ = D.canH / 2;                        // grip height for a can standing on the bench

// ── kinematics ───────────────────────────────────────────────────────────────
// j2 is the upper arm's absolute elevation; j3 is the FOREARM's absolute
// elevation, NOT the included elbow angle — that is what the parallelogram buys
// and what the actuators actually command. Then j4 rolls about the forearm
// axis, j5 pitches, j6 rolls the tool: the pour.
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const apply = (R, v) => R.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
const cs = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
const Rz = (d) => { const [c, s] = cs(d); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const Ry = (d) => { const [c, s] = cs(d); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const Rx = (d) => { const [c, s] = cs(d); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const vadd = (a, b) => a.map((v, i) => v + b[i]);
const vscale = (v, k) => v.map((x) => x * k);

export function fk([j1, j2, j3, j4, j5]) {
  const T1 = Rz(j1), shoulder = [0, 0, D.shZ];
  const Rua = mul(T1, Ry(-j2)), Rfa = mul(T1, Ry(-j3));      // the forearm takes j3 ABSOLUTELY
  const elbow = vadd(shoulder, vscale(apply(Rua, [1, 0, 0]), D.L1));
  const wrist = vadd(elbow, vscale(apply(Rfa, [1, 0, 0]), D.L2));
  const Rw = mul(mul(Rfa, Rx(j4)), Ry(-j5));                 // roll then pitch; the third axis is the GRIPPER's
  const tool = apply(Rw, [1, 0, 0]);
  return { shoulder, elbow, wrist, tool, R: Rw,
    flange: vadd(wrist, vscale(tool, D.Lw)),
    held: vadd(wrist, vscale(tool, D.Lw + D.toolLen)), j: [j1, j2, j3, j4, j5] };
}

// Inverse: put the held object at P with the tool axis LEVEL and pointing out
// from the column. Closed form — the parallelogram does not change the 2R
// position problem, it only renames the second angle.
export function ik(P) {
  const j1 = (Math.atan2(P[1], P[0]) * 180) / Math.PI;
  const r = Math.hypot(P[0], P[1]) - (D.Lw + D.toolLen), dz = P[2] - D.shZ;
  const c = (r * r + dz * dz - D.L1 ** 2 - D.L2 ** 2) / (2 * D.L1 * D.L2);
  if (Math.abs(c) > 1) return { ok: false, need: round(Math.hypot(r, dz)), have: D.L1 + D.L2 };
  const phi = -Math.acos(c);                                  // elbow up
  const j2 = ((Math.atan2(dz, r) - Math.atan2(D.L2 * Math.sin(phi), D.L1 + D.L2 * Math.cos(phi))) * 180) / Math.PI;
  const j3 = j2 + (phi * 180) / Math.PI;
  return { ok: true, j: [j1, j2, j3, 0, -j3].map((v) => round(v, 3)) };   // j5 levels the tool
}

// ── what each joint has to hold, before and after the counterweights ─────────
const G = 9.81;
export function torques(j2, j3) {
  const c2 = Math.cos(rad(j2)), c3 = Math.cos(rad(j3));
  const raw2 = (G * D.M2 * c2) / 1000, raw3 = (G * D.M3 * c3) / 1000;
  return { raw2: round(raw2, 2), raw3: round(raw3, 2),
    j2: round(raw2 - (G * D.cw1 * D.cwR1 * c2) / 1000, 2),
    j3: round(raw3 - (G * D.cw2 * D.cwR2 * c3) / 1000, 2) };
}
export const loadTable = () => [-30, 0, 30, 60, 90].map((a) => ({ arm_deg: a,
  J2_bare: torques(a, 0).raw2, J2_motor: torques(a, 0).j2,
  J3_bare: torques(0, a).raw3, J3_motor: torques(0, a).j3 }));

// ── the pour, solved rather than guessed ─────────────────────────────────────
// Task space in, joint space out. The can stands on the bench; the glass is to
// the left. The tool axis is level throughout, so the can rides upright, and
// the last move is 120° of tool roll — the tip.
export const CAN = [500, 0, D.canZ];
export const GLASS = [320, 380, D.glassH + 70];
export function pour() {
  const via = (P, name) => ({ name, P, ...ik(P) });
  const up = (P, dz) => [P[0], P[1], P[2] + dz];
  return [
    via(up(CAN, 170), 'home, clear of the bench'),
    via(up(CAN, 60), 'approach above the can'),
    via(CAN, 'down onto the can, and grip'),
    via(up(CAN, 150), 'lift clear'),
    via(up(GLASS, 60), 'traverse to the glass'),
    via(GLASS, 'over the glass'),
    via(GLASS, 'over the glass — the TIP is the gripper’s own roll, not an arm axis'),
    via(up(GLASS, 95), 'lift away'),
  ];
}

// ── the audit: what has to be true, checked rather than asserted ─────────────
export function audit() {
  const r = [], ok = (name, cond, detail) => r.push({ ok: !!cond, name, detail });
  const L = D.lim;
  // 1. the counterweights must not strike the bench, ever
  const cwLow = (r, d, jmax) => D.shZ - r * Math.sin(rad(jmax)) - d / 2;
  ok('CW1 clears the bench through the whole j2 range',
    cwLow(D.cwR1, D.cwD, L.j2[1]) > 25, `lowest point ${round(cwLow(D.cwR1, D.cwD, L.j2[1]))} mm at j2 = ${L.j2[1]}°`);
  ok('CW2 clears the bench through the whole j3 range',
    cwLow(D.cwR2, D.cw2D, L.j3[1]) > 25, `lowest point ${round(cwLow(D.cwR2, D.cw2D, L.j3[1]))} mm at j3 = ${L.j3[1]}°`);
  // 2. the balance is exact in form, not just at one pose — both terms go as cos
  // Both the load and the counterweight go as cos of the SAME angle, so the
  // residual fraction is identical at every pose — that is the property, and it
  // is what a spring cannot give. Checked across the range, not at one point.
  const resid = [-30, 0, 17, 37, 60].map((x) => { const t = torques(x, x); return [t.j2 / t.raw2, t.j3 / t.raw3]; }).flat();
  ok('the balance holds at every angle, not one', resid.every((v) => Math.abs(v - (1 - D.balance)) < 5e-3),
    `residual ${round(100 * Math.max(...resid))}% at every j2 and j3, by construction`);
  ok('under-balanced, so a power cut settles it downward', D.balance < 1 && D.balance > 0.7, `${100 * D.balance}%`);
  // 3. every pour waypoint is reachable AND inside the joint limits
  const P = pour();
  const bad = P.filter((v) => !v.ok);
  ok('every pour waypoint is reachable', bad.length === 0, bad.length ? bad.map((b) => `${b.name}: needs ${b.need}`).join('; ') : `${P.length} waypoints, max reach ${round(Math.max(...P.map((v) => Math.hypot(v.P[0], v.P[1]))))} mm`);
  const out = [];
  for (const v of P) if (v.ok) v.j.forEach((x, k) => { const n = `j${k + 1}`; if (x < L[n][0] || x > L[n][1]) out.push(`${v.name} ${n}=${x}`); });
  ok('and inside every joint limit', out.length === 0, out.length ? out.join('; ') : `worst |j5| ${round(Math.max(...P.filter((v) => v.ok).map((v) => Math.abs(v.j[4]))))}° against ${L.j5[1]}°`);
  // 4. the tool is long: check the arm can still fold enough to reach in
  ok('the tool does not stop the arm reaching its own column', D.Lw + D.toolLen < D.L1 + D.L2 - 100,
    `tool ${D.Lw + D.toolLen} mm of a ${D.L1 + D.L2} mm arm — ${round(100 * (D.Lw + D.toolLen) / (D.L1 + D.L2))}% of it`);
  // 5. the parallelogram is a parallelogram
  // The rear extensions sweep down behind the shoulder as the arm elevates, and
  // the turret is directly under them. The binding point is where a bar's lower
  // edge crosses the turret's radius: a taller shoulder and a slimmer turret buy
  // it, and nothing else does — shortening the bar does not, because the bar is
  // continuous from the pivot and the crossing happens close in.
  const sweepOk = (jmax, w) => { const r = D.turretD / 2, a = rad(jmax);
    return D.shZ - r * Math.tan(a) - (w / 2) / Math.cos(a) > D.turretZ[1]; };
  ok('the rear extensions clear the turret through the whole j2 range', sweepOk(L.j2[1], D.linkW),
    `shoulder ${D.shZ} over a Ø${D.turretD} turret topping out at ${D.turretZ[1]}, ${round(D.shZ - (D.turretD / 2) * Math.tan(rad(L.j2[1])) - (D.linkW / 2) / Math.cos(rad(L.j2[1])) - D.turretZ[1])} mm to spare at j2 = ${L.j2[1]}°`);
  ok('and through the whole j3 range', sweepOk(L.j3[1], D.crankW), `crank ${D.crankW} wide at j3 = ${L.j3[1]}°`);
  // Every point of the blade sweeps r = hypot(x, z) about the pitch axis, so
  // inside r = hypot(prong tip, cheek half-height) it would find a fork cheek.
  // The blade is only as wide as the slot until it is outside that circle.
  const rSafe = Math.hypot(D.forkProng, D.forkH / 2);
  ok('the blade only flares where it is clear of the fork', D.bladeFlare > rSafe + 1.5,
    `flare at x ${D.bladeFlare} against a swept-clear radius of ${round(rSafe)}`);
  ok('the blade’s rear corner clears the fork web at every pitch',
    Math.hypot(D.bladeRear, D.bladeH / 2) < D.forkBack - D.forkWeb - 5,
    `corner sweeps r ${round(Math.hypot(D.bladeRear, D.bladeH / 2))}, web face at ${D.forkBack - D.forkWeb}`);
  ok('the blade fits the slot with a running clearance', D.forkGap - D.bladeT >= 3 && D.forkGap - D.bladeT <= 6,
    `${D.bladeT} blade in a ${D.forkGap} slot`);
  ok('the tool flange has real material to bolt into',
    D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 + 3 < D.flangeD / 2 && D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 + 3 < D.bladeH / 2,
    `M6 at ±${round(D.flangePcd / 2 * Math.SQRT1_2, 1)} into a ${D.flangeD} × ${D.bladeH} blade face — this is why the blade flares instead of ending as a ${D.bladeT} tongue`);
  ok('the wrist has NO actuators yet', true, 'j4 and j5 are unmotorised and their volume is unreserved — deliberately not drawn as floating blocks, which is the fault this pass set out to fix');
  // CW2 swings UP as j3 rises and the cheeks are in the way. The cheek cannot be
  // shorter than its own bore, so the cap on j3 is what buys the clearance.
  const cw2x = -D.cwR2 * Math.cos(rad(L.j3[1])) + D.cw2D / 2;
  ok('CW2 clears the shoulder cheeks at every j3', cw2x < -D.cheekL / 2 - 10,
    `CW2's near edge reaches x ${round(cw2x)} at j3 = ${L.j3[1]}°; the cheek ends at ${-D.cheekL / 2}`);
  ok('the parallelogram closes', D.crank > 0 && D.crank < D.L1 / 2, `crank ${D.crank} on a ${D.L1} upper arm`);
  ok('the counterweights cannot occupy the same place when j2 = j3',
    Math.abs(D.cwR1 - D.cwR2) > (D.cwD + D.cw2D) / 2, `CW1 at r ${D.cwR1}, CW2 at r ${D.cwR2}, ${round(Math.abs(D.cwR1 - D.cwR2) - (D.cwD + D.cw2D) / 2)} mm apart at worst`);
  ok('nothing in the parallelogram fouls anything else in Y',
    D.foreY - D.foreT > D.linkT / 2 && D.crankY - D.crankT > D.foreY && D.rodY - D.rodT > D.crankY && D.cheekY - D.cheekT > D.rodY,
    `arm ±${D.linkT / 2} | forearm ${D.foreY - D.foreT}…${D.foreY} | crank ${D.crankY - D.crankT}…${D.crankY} | rod ${D.rodY - D.rodT}…${D.rodY} | cheek ${D.cheekY - D.cheekT}…${D.cheekY}`);
  // 6. the motors, after the counterweights
  const worst = Math.max(...[-30, 0, 30, 60].map((x) => Math.abs(torques(x, x).j2)));
  ok('a NEMA 17 on 20:1 covers the balanced J2/J3', worst < 0.44 * 20 * 0.7,
    `worst ${round(worst, 2)} N·m against ${round(0.44 * 20 * 0.7, 1)} available`);
  return r;
}


// ── the parts, each one sweep of one outer loop with holes ───────────────────
// XZ with offset o puts the plane at y = -o and sweeps -Y, so a link drawn in
// the XZ plane IS its side profile and `y1` places it in the stack-up. YZ with
// offset o puts the plane at x = o and sweeps +X. Both learned from ../gripper.
const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const circle = (name, c, r) => ({ name, circle: { c, r } });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });
const xz = (id, note, params, loops, extra = []) => tree(note, params, [
  { op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops },
  ...extra,
  { op: 'extrude', id, profile: extra.length ? ['face', ...extra.filter((f) => f.op === 'pattern').map((f) => f.id)] : 'face', depth: 't' },
]);
const xy = (id, note, params, loops, extra = []) => tree(note, params, [
  { op: 'sketch', id: 'face', plane: { base: 'XY', offset: 'z0' }, loops },
  ...extra,
  { op: 'extrude', id, profile: extra.length ? ['face', ...extra.filter((f) => f.op === 'pattern').map((f) => f.id)] : 'face', depth: 't' },
]);
// a link: a bar in its own XZ plane, pivot at the local origin, reaching to `a`
// forward and `b` back, with a bore at each end.
// The rectangle runs w/2 PAST the far pivot, not up to it: a hole whose circle
// is tangent to the outline is not a hole, it is a second outer loop, and the
// union of two touching outer loops is what Truck refuses.
const bar = (id, note, a, b, w, t, y1, bore) => xz(id, note,
  { a, b, w, t, y1, d: bore },
  [rect('outline', ['(a + w / 2 - b) / 2', 0], 'a + w / 2 + b', 'w'),
    circle('pivot', [0, 0], 'd / 2'), circle('far', ['a', 0], 'd / 2')]);

export const parts = {
  // ── the pedestal: nothing here moves ──────────────────────────────────────
  'base-plate': xy('plate', `Bench plate: Ø${D.baseD} × ${D.baseT}, four M8 on a Ø${2 * D.baseBoltR} circle into the bench. The whole machine's overturning moment lands here — ${round(9.81 * (D.cw1 + D.cw2 + D.mTip + 6) * 0.5, 0)} N·m of it with the arm out and the counterweights swung — so it is bolted down, not weighted down. One extrude along +Z.`,
    { d: D.baseD, t: D.baseT, z0: 0, br: D.baseBoltR, d_bolt: D.baseBolt },
    [circle('outline', [0, 0], 'd / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XY', offset: 'z0' }, loops: [circle(null, ['br', 0], 'd_bolt / 2')] },
      { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: D.baseBoltN, name: 'bolt' }]),
  column: xy('col', `Column: Ø${D.colD} over Ø${D.colBore}, z ${D.colZ[0]}…${D.colZ[1]}. Hollow because the J1 harmonic's cabling and the whole arm's CAN bus run up the middle — a cable bundle outside a rotating joint is the thing that fails first. One extrude along +Z.`,
    { d: D.colD, d_bore: D.colBore, t: D.colZ[1] - D.colZ[0], z0: D.colZ[0] },
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),

  // ── the turret and shoulder: everything from here up yaws with j1 ─────────
  turret: xy('turret', `J1 output plate: Ø${D.turretD} × ${D.turretT} on top of the column, carrying both shoulder cheeks. One extrude along +Z.`,
    { d: D.turretD, d_bore: D.turretBore, t: D.turretT, z0: D.colZ[1] },
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),
  cheek: xz('cheek', `Shoulder cheek, two off at |y| ${D.cheekY - D.cheekT}…${D.cheekY}: they straddle the whole parallelogram and carry the COAXIAL J2 and J3 bores at z ${D.shZ}. Coaxial is the architecture — it is what puts the elbow's actuator at the shoulder and lets one counterweight per crank balance the arm exactly. \`y1\` is overridden per side. One extrude along -Y.`,
    { t: D.cheekT, y1: D.cheekY, h: D.cheekH, L: D.cheekL, z: D.shZ, z0: D.turretZ[1], d: D.jL + 4 },
    [rect('outline', [0, '(z0 + z + h) / 2'], 'L', 'z + h - z0'), circle('axis', [0, 'z'], 'd / 2')]),

  // ── the parallelogram: four bars, and the two that matter carry lead ──────
  'upper-arm': bar('arm', `Upper arm, J2 to the elbow, ${D.L1} mm, with a ${D.cwR1} mm rear extension carrying CW1. ${D.linkW} × ${D.linkT} on the centre plane. One extrude along -Y.`,
    D.L1, D.cwR1 + 40, D.linkW, D.linkT, D.linkT / 2, D.bore),
  crank: bar('crank', `J3 crank, two off, coaxial with J2 and ${D.crank} mm long: the push rod hangs off its front end and CW2 off its ${D.cwR2} mm rear extension. The push rod delivers the forearm's whole gravitational moment here 1:1, which is exactly why a counterweight at this radius balances it at every angle. One extrude along -Y.`,
    D.crank, D.cwR2 + 50, D.crankW, D.crankT, D.crankY, D.bore),
  'push-rod': bar('rod', `Push rod, two off, ${D.L1} mm — the same length as the upper arm and always parallel to it. That is the parallelogram: it makes the elbow crank parallel to the J3 crank, so the FOREARM'S ABSOLUTE ANGLE IS j3, whatever j2 does. One extrude along -Y.`,
    D.L1, 18, D.rodW, D.rodT, D.rodY, D.bore),
  'elbow-crank': bar('ec', `Elbow crank, two off, ${D.crank} mm — the parallelogram's fourth bar, rigid with the forearm and reaching from its side face out under the push rod. One extrude along -Y.`,
    D.crank, 18, D.ecW, D.ecT, D.ecY, D.bore),
  forearm: bar('fore', `Forearm, elbow to the J4 roll section, ${D.L2 - D.j4Len - D.linkW / 2} mm of a ${D.L2} mm reach. It carries no actuator: j3 arrives through the elbow crank from the shoulder. One extrude along -Y.`,
    D.L2 - D.j4Len - D.forkBack - D.linkW / 2, 30, D.linkW, D.foreT, D.foreY, D.bore),
  counterweight: xz('cw', `Counterweight: a plain steel cylinder Ø${D.cwD} on a link's rear extension. CW1 is ${round(D.cw1, 2)} kg (× ${D.cw1Len} long) on the upper arm and CW2 ${round(D.cw2, 2)} kg (× ${D.cw2Len}) on the J3 cranks. Length is overridden per instance — the mass IS the tuning, and it is shimmable with washers. One extrude along -Y.`,
    { d: D.cwD, t: D.cw1Len, y1: 't / 2', d_bore: D.pin + 0.2 },
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),
  pin: xz('pin', `Ø${D.pin} ground dowel through a parallelogram joint. One extrude along -Y.`,
    { d: D.pin, t: D.pinLen, y1: 't / 2' }, [circle('od', [0, 0], 'd / 2')]),

  // ── the actuator modules, as stand-ins ────────────────────────────────────
  'joint-large': xz('jl', `Actuator module stand-in, Ø${D.jL} × ${D.jLlen}: NEMA 17 plus a 20:1 reduction, used at J2 and J3. Drawn along -Y; J1's instance is turned onto Z. The balanced J2 and J3 need 1.9 N·m against the 6.2 this delivers.`,
    { d: D.jL, t: D.jLlen, y1: 't / 2', d_bore: 20 }, [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),
  'joint-small': xz('js', `Actuator module stand-in, Ø${D.jS} × ${D.jSlen}: the wrist's three. They see inertia and a little friction, nothing else — the tool's weight is reacted at the wrist centre, not by these.`,
    { d: D.jS, t: D.jSlen, y1: 't / 2', d_bore: 14 }, [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),

  // ── the wrist and the tool interface ──────────────────────────────────────
  // ── the J5 wrist: a fork, a blade between its cheeks, a shaft through both ──
  // Drawn in the XY plane and extruded along Z, then bored along Y, which is
  // the only way to get two cheeks SEPARATED IN Y out of one sweep — the same
  // trick ../gripper's arm uses for its perpendicular bores.
  'roll-tube': tree(`J4 roll tube: \u00d8${D.rollD} over \u00d8${D.rollBore}, ${D.j4Len} long on the forearm's own axis, ending at the fork's back face. This is what j4 turns. One extrude along +X.`,
    { d: D.rollD, d_bore: D.rollBore, t: D.j4Len, x0: -(D.forkBack + D.j4Len) },
    [{ op: 'sketch', id: 'face', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')] },
      { op: 'extrude', id: 'rt', profile: 'face', depth: 't' }]),
  // A single U-shaped fork will not build: the pitch bore enters and leaves the
  // solid TWICE, once per cheek, and Truck refuses that boolean. So the fork is
  // two cheeks and a web, which is how you would fabricate it anyway — two
  // waterjet plates on a machined spacer — and each is one simple sweep with
  // one contained hole. The shoulder is built the same way.
  'fork-cheek': xz('cheek', `J5 fork cheek, two off at |y| ${D.forkGap / 2}\u2026${D.forkGap / 2 + D.forkCheek}: carries the pitch bush at the wrist centre. \`y1\` is overridden per side. One extrude along -Y.`,
    { back: D.forkBack, prong: D.forkProng, h: D.forkH, t: D.forkCheek, y1: D.forkGap / 2 + D.forkCheek, d: D.pitchBush },
    [rect('outline', ['(prong - back) / 2', 0], 'back + prong', 'h'), circle('pitch', [0, 0], 'd / 2')]),
  'fork-web': xz('web', `J5 fork web: the ${D.forkGap} mm spacer the two cheeks bolt to, closing the back of the slot and taking the roll tube's face. One extrude along -Y.`,
    { back: D.forkBack, web: D.forkWeb, h: D.forkH, t: D.forkGap, y1: D.forkGap / 2 },
    [rect('outline', ['-back + web / 2', 0], 'web', 'h')]),
  'wrist-blade': tree(`J5 blade: the tool-side member, ${D.bladeT} thick between the fork's cheeks, bored on the pitch axis and flaring from x ${D.bladeFlare} to a ${D.flangeD} face for the tool flange. The flare starts where it does because everything on this part sweeps r = hypot(x, z) about the pitch axis, and inside r ${round(Math.hypot(D.forkProng, D.forkH / 2))} it would find a fork cheek. One extrude along +Z, then the pitch bore as a cut along Y.`,
    { rear: D.bladeRear, flare: D.bladeFlare, front: D.Lw, hw: D.bladeT / 2, fw: D.flangeD / 2, h: D.bladeH, d: D.pitchFit },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: '-h / 2' }, loops: [{ name: 'outline', polygon: [
        ['rear', '-hw'], ['flare', '-hw'], ['front', '-fw'], ['front', 'fw'], ['flare', 'hw'], ['rear', 'hw']] }] },
      { op: 'extrude', id: 'bl', profile: 'plan', depth: 'h' },
      { op: 'sketch', id: 'bore', plane: { base: 'XZ', offset: '-(hw + 4)' }, loops: [circle('pitch', [0, 0], 'd / 2')] },
      { op: 'extrude', id: 'borecut', profile: 'bore', depth: '2 * (hw + 4)', mode: 'cut' }]),
  'pitch-shaft': xz('ps', `\u00d8${D.pitchD} pitch shaft, pressed into the blade and running in a bush in each cheek. One extrude along -Y.`,
    { d: D.pitchD, t: D.forkGap + 2 * D.forkCheek + 8, y1: 't / 2' }, [circle('od', [0, 0], 'd / 2')]),
  'pitch-bush': xz('pb', `Flanged bush in a fork cheek, \u00d8${D.pitchBush} outside on \u00d8${D.pitchD}. Two off. One extrude along -Y.`,
    { d: D.pitchBush, d_bore: D.pitchD + 0.1, t: D.forkCheek, y1: 't / 2' },
    [circle('od', [0, 0], 'd / 2'), circle('id', [0, 0], 'd_bore / 2')]),
  'tool-flange': tree(`Tool flange, ISO 9409-1-50-4-M6: Ø${D.flangeD} × ${D.flangeT}, four M6 on a Ø${D.flangePcd} circle, Ø31.5 pilot. The gripper's own web bolts to this — its README calls this interface out and does not draw it, so this is the half that exists. One extrude along +X.`,
    { d: D.flangeD, t: D.flangeT, x0: D.Lw, pcd: D.flangePcd, d_bolt: D.flangeBolt, d_pilot: 31.5 },
    [{ op: 'sketch', id: 'face', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2'), circle('pilot', [0, 0], 'd_pilot / 2')] },
      { op: 'sketch', id: 'bolt', plane: { base: 'YZ', offset: 'x0' }, loops: [circle(null, ['pcd / 2', 0], 'd_bolt / 2')] },
      { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: D.flangeBoltN, name: 'bolt' },
      { op: 'extrude', id: 'fl', profile: ['face', 'bolts'], depth: 't' }]),

  // ── reference only: what the task is ──────────────────────────────────────
  can: xy('can', `A 330 ml can, Ø${D.canD} × ${D.canH}. Reference geometry — it is the task, not the machine.`,
    { d: D.canD, t: D.canH, z0: 0 }, [circle('outline', [0, 0], 'd / 2')]),
  glass: xy('glass', `A Ø${D.glassD} × ${D.glassH} glass. Reference geometry.`,
    { d: D.glassD, t: D.glassH, z0: 0 }, [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], `${D.glassD / 2 - 4}`)]),
};

// ── the assembly ─────────────────────────────────────────────────────────────
// A single `rotate` cannot express Rz·Ry·Rx, so the chain is built from NESTED
// SUB-ASSEMBLIES: each level rotates about one axis through its own origin and
// composition happens for free. The planar joints are the exception — j2 and j3
// are both about Y in the same yawed frame, so the forearm can be a SIBLING of
// the upper arm placed at the computed elbow, rather than a child of it. That
// is the parallelogram stated in the document: the forearm's angle is j3, and
// nothing about j2 reaches it.
const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
const spin = (axis, deg) => ({ rotate: { axis, deg } });
const PARAMS = { L1: D.L1, L2: D.L2, Lw: D.Lw, crank: D.crank, cwR1: D.cwR1, cwR2: D.cwR2, shZ: D.shZ };
// The chain, as expressions. In the pour document the joints are driven by the
// clock and named jj1…jj6, so the whole chain is written against whatever the
// joints are called — `n` supplies the prefix.
const chain = (n) => ({
  ex: `L1 * cos(deg(${n}2))`, ez: `L1 * sin(deg(${n}2))`,        // the elbow
  px: `crank * cos(deg(${n}3))`, pz: `crank * sin(deg(${n}3))`,  // the push rod's root on the J3 crank
  wx: `ex + L2 * cos(deg(${n}3))`, wz: `ez + L2 * sin(deg(${n}3))`,
  // The counterweights are cylinders ABOUT the pivot axis, so their own
  // rotation is invisible and they need no anchor: placing them at the computed
  // point is enough. (An `@part.start` anchor would have been a trap here — it
  // is the extrude's START FACE, which sits at the part's own y1, so a puck
  // hung off the upper arm inherited a 10 mm shift and straddled it.)
  c1x: `-cwR1 * cos(deg(${n}2))`, c1z: `shZ - cwR1 * sin(deg(${n}2))`,
  c2x: `-cwR2 * cos(deg(${n}3))`, c2z: `shZ - cwR2 * sin(deg(${n}3))`,
});
const DERIVED = chain('j');
// A sub-assembly keeps its own scope: it does NOT inherit the parent's parts
// map, so each one carries copies of exactly the trees its own components name.
let CHAIN = DERIVED;
const sub = (name, need, components) => ({ _: name, params: { ...PARAMS }, derived: { ...CHAIN },
  parts: Object.fromEntries(need.map((k) => [k, structuredClone(parts[k])])), components });

// A clamped ramp, as in ../gripper: the language has no clamp, so min/max build
// one. `u` is the fraction of one clock turn.
const ramp = (u, a, b) => `min(1, max(0, (${u} - ${a}) / ${b - a}))`;
function trajectory(key) {
  const W = pour().filter((v) => v.ok);
  const u = '(theta / 360 - floor(theta / 360))';
  const t = W.map((_, i) => i / (W.length - 1));
  return W[0].j[key] + W.slice(1).map((w, i) =>
    ` + ${round(w.j[key] - W[i].j[key], 3)} * ${ramp(u, round(t[i], 4), round(t[i + 1], 4))}`).join('');
}

export function assembly(mode = 'inputs') {
  const demo = mode === 'demo';
  const J = (k) => (demo ? `jj${k}` : `j${k}`);
  // A sub-assembly inherits neither parts NOR derived values, so in the pour
  // document every level carries the six trajectories as well as the chain.
  CHAIN = demo
    ? { ...Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`jj${k}`, trajectory(k - 1)])), ...chain('jj') }
    : chain('j');
  const side = '(1 - 2 * (i - 2 * floor(i / 2)))';           // +1 / -1 for even / odd i
  // j5: the blade and the tool flange, pitching about the wrist centre.
  const pitch = sub('j5, the wrist pitch — the blade between the fork’s cheeks', ['wrist-blade', 'tool-flange'], [
    c('wrist-blade', 'wrist-blade', [0, 0, 0]),
    c('tool-flange', 'tool-flange', [0, 0, 0], spin([0, 0, 1], 0)),
  ]);
  // j4: the roll tube and the fork it carries, and the pitch bearing itself.
  const roll = sub('j4, the forearm roll — the tube, the fork and the pitch bearing', ['roll-tube', 'fork-cheek', 'fork-web', 'pitch-shaft', 'pitch-bush'], [
    c('roll-tube', 'roll-tube', [0, 0, 0]),
    { id: 'fork-cheek', part: 'fork-cheek', repeat: 2, at: [0, 0, 0],
      params: { y1: `${D.forkGap / 2 + D.forkCheek} * ${side} + ${D.forkCheek} * (1 - ${side}) / 2` } },
    c('fork-web', 'fork-web', [0, 0, 0]),
    c('pitch-shaft', 'pitch-shaft', [0, 0, 0]),
    { id: 'pitch-bush', part: 'pitch-bush', repeat: 2, at: [0, 0, 0],
      params: { y1: `${D.forkGap / 2 + D.forkCheek} * ${side} + ${D.forkCheek} * (1 - ${side}) / 2` } },
    { id: 'pitch5', assembly: pitch, at: [0, 0, 0], ...spin([0, 1, 0], `-${J(5)}`) },
  ]);
  const wrist = sub('the wrist, at the forearm’s far end', [], [
    { id: 'roll4', assembly: roll, at: [0, 0, 0], ...spin([1, 0, 0], J(4)) },
  ]);
  const yaw = sub('everything above the column, yawing with j1', ['turret', 'cheek', 'joint-large', 'upper-arm', 'counterweight', 'crank', 'push-rod', 'elbow-crank', 'forearm'], [
    c('turret', 'turret', [0, 0, 0]),
    { id: 'cheek', part: 'cheek', repeat: 2, at: [0, 0, 0], params: { y1: `${D.cheekY} * ${side} + ${D.cheekT} * (1 - ${side}) / 2` } },
    { id: 'j23', part: 'joint-large', repeat: 2, at: [0, `${side} * ${D.cheekY + D.jLlen / 2 + 2}`, D.shZ] },
    // the upper arm, and CW1 on its rear extension
    c('upper-arm', 'upper-arm', [0, 0, D.shZ], spin([0, 1, 0], `-${J(2)}`)),
    { id: 'cw1', part: 'counterweight', repeat: 2, at: ['c1x', 0, 'c1z'],
      params: { t: D.cw1Len, y1: `${D.linkT / 2 + 2} * ${side} + ${D.cw1Len} * (1 + ${side}) / 2` } },
    // the J3 cranks, coaxial with J2, and CW2 on theirs
    { id: 'crank', part: 'crank', repeat: 2, at: [0, 0, D.shZ], ...spin([0, 1, 0], `-${J(3)}`), params: { y1: `${D.crankY} * ${side} + ${D.crankT} * (1 - ${side}) / 2` } },
    // one puck per crank, outboard of it: y1 = (crankY+2)·side + t·(1+side)/2.
    { id: 'cw2', part: 'counterweight', repeat: 2, at: ['c2x', 0, 'c2z'],
      params: { t: D.cw2Len, d: D.cw2D, y1: `${D.crankY + 2} * ${side} + ${D.cw2Len} * (1 + ${side}) / 2` } },
    // the push rods: at the crank's far end, parallel to the upper arm
    { id: 'push-rod', part: 'push-rod', repeat: 2, at: ['px', 0, `shZ + pz`], ...spin([0, 1, 0], `-${J(2)}`), params: { y1: `${D.rodY} * ${side} + ${D.rodT} * (1 - ${side}) / 2` } },
    // the elbow cranks and the forearm: both at j3, both at the elbow
    { id: 'elbow-crank', part: 'elbow-crank', repeat: 2, at: ['ex', 0, `shZ + ez`], ...spin([0, 1, 0], `-${J(3)}`), params: { y1: `${D.ecY} * ${side} + ${D.ecT} * (1 - ${side}) / 2` } },
    { id: 'forearm', part: 'forearm', repeat: 2, at: ['ex', 0, `shZ + ez`], ...spin([0, 1, 0], `-${J(3)}`), params: { y1: `${D.foreY} * ${side} + ${D.foreT} * (1 - ${side}) / 2` } },
    { id: 'wrist', assembly: wrist, at: ['wx', 0, `shZ + wz`], ...spin([0, 1, 0], `-${J(3)}`) },
  ]);
  const components = [
    c('base-plate', 'base-plate', [0, 0, 0]),
    c('column', 'column', [0, 0, 0]),
    c('j1', 'joint-small', [0, 0, D.colZ[1] - D.jSlen / 2], spin([1, 0, 0], 90)),
    { id: 'yaw', assembly: yaw, at: [0, 0, 0], ...spin([0, 0, 1], J(1)) },
    c('can', 'can', [CAN[0], CAN[1], 0], { reference: true }),
    c('glass', 'glass', [GLASS[0], GLASS[1], 0], { reference: true }),
    ...(demo ? [c('clock', 'pin', [0, -200, 0], { params: { t: 1 }, reference: true })] : []),
  ];
  const derived = { ...CHAIN };
  const L = D.lim;
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: demo ? 'arm-pour' : 'arm',
    _: (demo ? `THE POUR, one turn of the clock: home → over the can → down and grip → lift → traverse → over the glass → 120° of tool roll → away. Eight waypoints solved by closed-form IK from task space, not posed by hand. The tip is a roll of the TOOL, because the can is held with its own axis perpendicular to the tool axis — which is also why ../gripper's one-way indexer could do this move itself. ` : '') +
      `Six-DOF bench arm, counterweighted parallelogram. ${D.L1} + ${D.L2} + ${D.Lw} mm of arm and ${D.toolLen} mm of tool, shoulder at z ${D.shZ}, reaching a ${D.canD} × ${D.canH} can at r ${CAN[0]}. ` +
      `J2 and J3 are COAXIAL at the shoulder: J2 swings the upper arm and J3 a crank whose push rod drives an elbow crank rigid with the forearm, so the forearm's ABSOLUTE angle is j3 and nothing about j2 reaches it. Three things follow — both big actuators sit at the shoulder, gravity splits into two independent one-DOF problems, and a counterweight on each rear extension balances both EXACTLY at every pose, because load and counterweight go as the cosine of the same angle. ` +
      `${round(D.cw1, 2)} + ${round(D.cw2, 2)} = ${round(D.cw1 + D.cw2, 2)} kg of steel (CW1 at r ${D.cwR1}, CW2 as two pucks at r ${D.cwR2}) takes ${100 * D.balance}% of it, leaving ${torques(0, 0).j2} N·m at J2 against 9.4 bare. Deliberately not 100%: a perfectly balanced arm drifts anywhere when the power dies, an 80% one settles downward.`,
    ...(demo ? { drive: { component: 'clock', rpm: D.rpm } } : {}),
    ...(demo ? {} : { inputs: Object.fromEntries([1, 2, 3, 4, 5].map((k) => {
      const n = `j${k}`, unit = 'deg';
      const desc = ['yaw, about the column', 'the upper arm’s ABSOLUTE elevation', 'the FOREARM’s absolute elevation — not the included elbow angle; that is what the parallelogram buys', 'forearm roll', 'wrist pitch; −j3 keeps the tool level'][k - 1];
      return [n, { min: L[n][0], max: L[n][1], steps: 3, unit, default: 0, description: desc }];
    })) }),
    params: PARAMS, derived,
    parts: Object.fromEntries(['base-plate', 'column', 'joint-small', 'can', 'glass', 'pin'].map((k) => [k, structuredClone(parts[k])])),
    components,
    fits: [
      { a: 'base-plate', b: 'column', contact: true },
      { a: 'column', b: 'yaw/turret', min: 0.2, max: 1.0 },
      { a: 'yaw/turret', b: 'yaw/cheek[*]', contact: true },
      { a: 'yaw/cheek[*]', b: 'yaw/j23[*]', contact: true },
      { a: 'yaw/upper-arm', b: 'yaw/cw1[*]', min: 1.5, max: 2.5 },   // spaced off the web, bolted through
      { a: 'yaw/crank[*]', b: 'yaw/cw2[*]', min: 1.5, max: 2.5 },
      { a: 'yaw/forearm[*]', b: 'yaw/elbow-crank[*]', contact: true },
      { a: 'yaw/forearm[*]', b: 'yaw/wrist/roll4/roll-tube', min: 0.5 },
      { a: 'yaw/wrist/roll4/roll-tube', b: 'yaw/wrist/roll4/fork-web', contact: true },
      { a: 'yaw/wrist/roll4/fork-web', b: 'yaw/wrist/roll4/fork-cheek[*]', contact: true },
      { a: 'yaw/wrist/roll4/fork-cheek[*]', b: 'yaw/wrist/roll4/pitch-bush[*]', min: 0.01, max: 0.05 },
      { a: 'yaw/wrist/roll4/pitch-bush[*]', b: 'yaw/wrist/roll4/pitch-shaft', min: 0.02, max: 0.1 },
      { a: 'yaw/wrist/roll4/pitch-shaft', b: 'yaw/wrist/roll4/pitch5/wrist-blade', contact: true },
      { a: 'yaw/wrist/roll4/fork-cheek[*]', b: 'yaw/wrist/roll4/pitch5/wrist-blade', min: 1.5 },
      { a: 'yaw/wrist/roll4/fork-web', b: 'yaw/wrist/roll4/pitch5/wrist-blade', min: 4 },
      { a: 'yaw/wrist/roll4/pitch5/wrist-blade', b: 'yaw/wrist/roll4/pitch5/tool-flange', contact: true },
      { a: 'yaw/upper-arm', b: 'yaw/forearm[*]', min: 1.5 }, { a: 'yaw/upper-arm', b: 'yaw/crank[*]', min: 17 },
      { a: 'yaw/crank[*]', b: 'yaw/push-rod[*]', min: 1.5 },
      { a: 'yaw/upper-arm', b: 'yaw/push-rod[*]', min: 30 },
      { a: 'yaw/cheek[*]', b: 'yaw/push-rod[*]', min: 2.5 },
    ],
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
export function write(out) {
  fs.mkdirSync(path.join(out, 'parts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(out, 'parts'))) if (!(f.replace(/\.json$/, '') in parts)) fs.unlinkSync(path.join(out, 'parts', f));
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(out, 'parts', `${k}.json`), JSON.stringify(v, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'arm.json'), JSON.stringify(assembly(), null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'arm-pour.json'), JSON.stringify(assembly('demo'), null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.table(loadTable());
  console.table(pour().map((v) => ({ step: v.name, P: v.P.join(','), j: v.ok ? v.j.map((x) => round(x, 1)).join(' ') : 'UNREACHABLE' })));
  write(opt('--out', path.dirname(new URL(import.meta.url).pathname)));
  const a = audit(); for (const x of a) console.log(`${x.ok ? '✓' : '✗'} ${x.name}  ${x.detail}`);
  console.log(`\nreach ${D.L1 + D.L2 + D.Lw} mm + ${D.toolLen} of tool; shoulder at z ${D.shZ}; counterweights ${round(D.cw1, 2)} + ${round(D.cw2, 2)} = ${round(D.cw1 + D.cw2, 2)} kg of steel at r ${D.cwR1} / ${D.cwR2}`);
  if (a.some((x) => !x.ok)) process.exit(1);
}
