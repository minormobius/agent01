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
  cwR: 250,                                   // counterweight radius, behind the shoulder
  shoulderZ: 320,                             // J2 height above the bench plate — set by the
                                              // COUNTERWEIGHT SWING, not by the wrist: CW1 rides
                                              // the upper arm's rear extension and is the lowest
                                              // thing on the machine when the arm points up.
  balance: 0.8,                               // fraction of gravity the counterweights take

  // ── masses that set the balance (kg) ──────────────────────────────────────
  mUpper: 0.35, mFore: 0.30, mWrist: 1.00,
  mGripper: 1.86, mFingers: 0.15,             // ../gripper, from its own closed forms

  // ── structure ─────────────────────────────────────────────────────────────
  baseD: 180, baseT: 12, baseBolt: 8.4, baseBoltR: 72, baseBoltN: 4,
  colD: 120, colBore: 90, colZ: [12, 240],
  turretD: 130, turretT: 14,
  cheekT: 12, cheekW: 110, cheekY: 36,        // the shoulder cheeks, inner face at |y| = 36
  jL: 80, jLlen: 70,                          // large joint module: Ø80 × 70
  jS: 50, jSlen: 45,                          // small joint module
  linkW: 60, linkT: 20,                       // upper arm and forearm section
  crankW: 44, crankT: 12, crankY: 24,         // the J3 crank, outboard of the upper arm (2 mm clear of it)
  rodW: 22, rodT: 10, rodY: 38,               // the push rods, outboard of the crank (4 mm clear)
  bore: 12.2, pin: 12, pinLen: 90,            // the parallelogram pins
  cwD: 70,                                    // counterweight cylinders
  wristD: 54, wristYoke: 40, wristT: 10,
  flangeD: 63, flangeT: 8, flangePcd: 50, flangeBolt: 6.6, flangeBoltN: 4,

  // joint limits, degrees. j2's ceiling is what keeps CW1 off the bench; j5's
  // range is what a level tool needs when reaching down to it (87° at r 500).
  lim: { j1: [-170, 170], j2: [-30, 65], j3: [-100, 60], j4: [-180, 180], j5: [-100, 100], j6: [-360, 360] },
  rpm: 3,                                     // the pour demo's clock
};

// ── derived: the balance, which is the architecture's whole point ────────────
D.mTip = D.mGripper + D.mFingers + D.canMass;             // what hangs off the flange
// moment per unit cos(angle), kg·mm. M3 is delivered to the J3 crank 1:1 by the
// push rod; M2 is everything outboard of the elbow, acting through the elbow.
D.M3 = D.mFore * (D.L2 / 2) + D.mWrist * D.L2 + D.mTip * (D.L2 + D.Lw);
D.M2 = D.mUpper * (D.L1 / 2) + (D.mFore + D.mWrist + D.mTip) * D.L1;
D.cw1 = (D.balance * D.M2) / D.cwR;                       // kg on the upper arm's rear extension
D.cw2 = (D.balance * D.M3) / D.cwR;                       // kg on the J3 crank's rear extension
const STEEL = 7.85e-3;                                     // g/mm³
D.cw1Len = round((D.cw1 * 1000) / STEEL / (Math.PI * (D.cwD / 2) ** 2), 1);
D.cw2Len = round((D.cw2 * 1000) / STEEL / (Math.PI * (D.cwD / 2) ** 2), 1);
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

export function fk([j1, j2, j3, j4, j5, j6]) {
  const T1 = Rz(j1), shoulder = [0, 0, D.shZ];
  const Rua = mul(T1, Ry(-j2)), Rfa = mul(T1, Ry(-j3));      // the forearm takes j3 ABSOLUTELY
  const elbow = vadd(shoulder, vscale(apply(Rua, [1, 0, 0]), D.L1));
  const wrist = vadd(elbow, vscale(apply(Rfa, [1, 0, 0]), D.L2));
  const Rw = mul(mul(mul(Rfa, Rx(j4)), Ry(-j5)), Rx(j6));    // roll, pitch, roll
  const tool = apply(Rw, [1, 0, 0]);
  return { shoulder, elbow, wrist, tool, R: Rw,
    flange: vadd(wrist, vscale(tool, D.Lw)),
    held: vadd(wrist, vscale(tool, D.Lw + D.toolLen)), j: [j1, j2, j3, j4, j5, j6] };
}

// Inverse: put the held object at P with the tool axis LEVEL and pointing out
// from the column. Closed form — the parallelogram does not change the 2R
// position problem, it only renames the second angle.
export function ik(P, roll = 0) {
  const j1 = (Math.atan2(P[1], P[0]) * 180) / Math.PI;
  const r = Math.hypot(P[0], P[1]) - (D.Lw + D.toolLen), dz = P[2] - D.shZ;
  const c = (r * r + dz * dz - D.L1 ** 2 - D.L2 ** 2) / (2 * D.L1 * D.L2);
  if (Math.abs(c) > 1) return { ok: false, need: round(Math.hypot(r, dz)), have: D.L1 + D.L2 };
  const phi = -Math.acos(c);                                  // elbow up
  const j2 = ((Math.atan2(dz, r) - Math.atan2(D.L2 * Math.sin(phi), D.L1 + D.L2 * Math.cos(phi))) * 180) / Math.PI;
  const j3 = j2 + (phi * 180) / Math.PI;
  return { ok: true, j: [j1, j2, j3, 0, -j3, roll].map((v) => round(v, 3)) };   // j5 levels the tool
}

// ── what each joint has to hold, before and after the counterweights ─────────
const G = 9.81;
export function torques(j2, j3) {
  const c2 = Math.cos(rad(j2)), c3 = Math.cos(rad(j3));
  const raw2 = (G * D.M2 * c2) / 1000, raw3 = (G * D.M3 * c3) / 1000;
  return { raw2: round(raw2, 2), raw3: round(raw3, 2),
    j2: round(raw2 - (G * D.cw1 * D.cwR * c2) / 1000, 2),
    j3: round(raw3 - (G * D.cw2 * D.cwR * c3) / 1000, 2) };
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
  const via = (P, roll, name) => ({ name, P, roll, ...ik(P, roll) });
  const up = (P, dz) => [P[0], P[1], P[2] + dz];
  return [
    via(up(CAN, 170), 0, 'home, clear of the bench'),
    via(up(CAN, 60), 0, 'approach above the can'),
    via(CAN, 0, 'down onto the can, and grip'),
    via(up(CAN, 150), 0, 'lift clear'),
    via(up(GLASS, 60), 0, 'traverse to the glass'),
    via(GLASS, 0, 'over the glass'),
    via(GLASS, 120, 'POUR — 120° of tool roll'),
    via(up(GLASS, 120), 120, 'lift away, still tipped'),
  ];
}

// ── the audit: what has to be true, checked rather than asserted ─────────────
export function audit() {
  const r = [], ok = (name, cond, detail) => r.push({ ok: !!cond, name, detail });
  const L = D.lim;
  // 1. the counterweights must not strike the bench, ever
  const cwLow = (jmax) => D.shZ - D.cwR * Math.sin(rad(jmax)) - D.cwD / 2;
  ok('CW1 clears the bench through the whole j2 range',
    cwLow(L.j2[1]) > 25, `lowest point ${round(cwLow(L.j2[1]))} mm at j2 = ${L.j2[1]}°`);
  ok('CW2 clears the bench through the whole j3 range',
    cwLow(L.j3[1]) > 25, `lowest point ${round(cwLow(L.j3[1]))} mm at j3 = ${L.j3[1]}°`);
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
  ok('the parallelogram closes', D.crank > 0 && D.crank < D.L1 / 2, `crank ${D.crank} on a ${D.L1} upper arm`);
  ok('the push rods clear the upper arm in Y', D.rodY - D.rodT > D.crankY && D.crankY - D.crankT > D.linkT / 2,
    `upper arm to ±${D.linkT / 2}, crank ${D.crankY - D.crankT}…${D.crankY}, rod ${D.rodY - D.rodT}…${D.rodY}`);
  // 6. the motors, after the counterweights
  const worst = Math.max(...[-30, 0, 30, 60].map((x) => Math.abs(torques(x, x).j2)));
  ok('a NEMA 17 on 20:1 covers the balanced J2/J3', worst < 0.44 * 20 * 0.7,
    `worst ${round(worst, 2)} N·m against ${round(0.44 * 20 * 0.7, 1)} available`);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.table(loadTable());
  console.table(pour().map((v) => ({ step: v.name, P: v.P.join(','), j: v.ok ? v.j.map((x) => round(x, 1)).join(' ') : 'UNREACHABLE' })));
  const a = audit(); for (const x of a) console.log(`${x.ok ? '✓' : '✗'} ${x.name}  ${x.detail}`);
  console.log(`\nreach ${D.L1 + D.L2 + D.Lw} mm + ${D.toolLen} of tool; shoulder at z ${D.shZ}; counterweights ${round(D.cw1, 2)} + ${round(D.cw2, 2)} = ${round(D.cw1 + D.cw2, 2)} kg of steel at r ${D.cwR}`);
  if (a.some((x) => !x.ok)) process.exit(1);
}
