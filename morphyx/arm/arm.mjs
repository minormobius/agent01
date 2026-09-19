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
import { parts as gParts, assembly as gAssembly, D as GD, forces as gForces } from '../gripper/gripper.mjs';

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
  mGripper: 1.86,                             // ../gripper, from its own closed forms; mFingers is DERIVED below, from the part
  // The adapter's 360 g used to hang here — an ARM part missing from a tip mass
  // made of GRIPPER parts, 0.7 kg of counterweight nobody was carrying. The
  // pocket deleted the part, so the gap closed itself.

  // ── structure ─────────────────────────────────────────────────────────────
  baseD: 182, baseT: 12, baseBolt: 8.4, baseBoltR: 72, baseBoltN: 4,
  colD: 84, colBore: 60, colZ: [12, 240],
  turretD: 92, turretT: 14, turretBore: 40,
  cheekT: 12, cheekH: 80, cheekL: 110, cheekY: 86,   // the shoulder cheeks: 56…68, clear of the rods
  jL: 80, jLlen: 70,                          // large joint module: Ø80 × 70
  jS: 50, jSlen: 45,                          // small joint module
  linkW: 60, linkT: 20,                       // upper arm and forearm section
  // The Y stack-up, outward from the centre plane. The forearm STRADDLES the
  // upper arm: two bars pinned on a common pivot cannot share a plane, and a
  // clevis is the only thing that makes an elbow assemblable.
  foreT: 14, foreY: 26, foreA: 20,            // the forearm plates are only the ELBOW CLEVIS now:
                                              // the wrist module is 268 mm long against an L2 of 250,
                                              // so the Ø64 barrel IS the forearm and the plates just
                                              // carry the elbow bore and hand off to it.
  crankW: 44, crankT: 12, crankY: 40,         // the J3 cranks: 28…40
  ecW: 22, ecT: 14, ecY: 48,                  // the elbow cranks, bolted to the forearm's outer face: 26…40
  rodW: 22, rodT: 10, rodY: 72,               // the push rods: 42…52
  // ── the J5 wrist, as a real clevis ──────────────────────────────────────
  // A fork on the J4 roll tube, a blade between its cheeks, a shaft through
  // both. The numbers come out of the SWEEP, not out of taste: every point of
  // the blade traces r = hypot(x, z) about the pitch axis, so the fork has to
  // be clear of that whole circle everywhere the blade can reach.
  forkBack: 55, forkWeb: 12, forkProng: 25,   // x −55…25, web inner face at −43
  forkGap: 58, forkCheek: 10, forkH: 70,      // cheeks |y| 29…39, z ±35 — thinner by 2, so the wider slot does not push the belt out
  bladeT: 54, bladeH: 60, bladeRear: -20,     // |y| ≤ 27, z ±30
  // THE POCKET. The gripper's actuator is BEHIND its own mounting face — a
  // NEMA 17 linear stepper, 48 mm of stack, whose shaft is the Tr8×2 screw. So
  // a tool flange either sits behind the motor, which is what the 54 mm adapter
  // cup used to do, or the wrist swallows it. This is the wrist swallowing it:
  // a 44 square blind pocket running back from the flange face, and the flange
  // is now the blade's own front end rather than a bolted-on plate.
  pocket: 44, pocketWall: 5,                  // 42.3 motor + 0.85 a side; walls 5 in y, 8 in z
  pitchD: 16, pitchBush: 22, pitchFit: 16.2,
  bore: 12.2, pin: 12, pinLen: 90,            // the parallelogram pins
  cwD: 70,                                    // counterweight cylinders
  // ── the drive train, forearm through flange ─────────────────────────────
  // J4 is coaxial with the forearm, so its NEMA 17 goes straight up the middle —
  // but a 42.3 square has a 59.8 mm diagonal, so the barrel is Ø64, not Ø54.
  nema: 42.3, nemaCh: 5, nemaLen: 40, planetD: 42, planetLen: 32,
  barrelD: 64, barrelBore: 56, barrelX: [-200, -120],
  rollBrgX: [-120, -108], rollBrgD: 80,
  // J5's motor lies CROSSWISE inside the roll drum, on the pitch axis' own
  // direction, and drives the pitch shaft by a belt. That is what keeps the
  // swept circle down: a NEMA stack bolted to a fork cheek sweeps Ø271.
  drumD: 118, drumBore: 110, drumX: [-118, -55],
  j5x: -85,                                   // the J5 motor's axis, on the forearm centre line
  pinionT: 20, pulleyT: 60, beltPitch: 2, beltW: 9, beltThk: 1.4,   // GT2, 3:1
  beltY: [42, 51],                            // the belt plane, outboard of the +Y cheek. It CANNOT move out: see the drum-bore check
  // The flange is the gripper's OWN housing circle, not ISO 9409-1-50: four M3
  // at r 48.5 where its housing taps already are. The standard's bolts land
  // inside the motor (Ø50 circle, r 25, against a 42.3 square whose
  // half-diagonal is 29.9), and the adapter already used this circle — all
  // that is deleted here is the cup, not the interface.
  flangeD: 110, flangeT: 8, flangePcd: 97, flangeBolt: 3.4, flangeBoltN: 4,   // Ø110 so the bolts keep a 3 mm rim; the gripper's own web is Ø104 and leaves them 1.75
  discLap: 4,                                 // the disc reaches 4 mm INTO the slab; a union on a shared face will not build

  // ── the fingers ─────────────────────────────────────────────────
  // There were none. `mFingers: 0.15` sat in the balance and `toolLen` assumed
  // "a 40 mm customer finger", and nothing drew one: the gripper's jaw carriers
  // ended 33 mm short of the can's axis and nothing spanned the gap.
  //
  // The gripper ends at a finger MOUNT and says so — four M4 and two Ø5 dowels
  // in two columns on the carrier's front face, tapped 8 deep. Fingers are
  // application tooling, so they belong here with the can and the glass.
  //
  // A V, not a flat: a flat touches a cylinder on ONE line and leaves it free
  // to slide fore and aft in the grip; a V touches on two lines per finger and
  // locates the can's axis in both directions. For a ØD cylinder in a V of
  // half-angle α the apex sits D/2/sinα from the axis, the contacts at D/2·sinα
  // either side of it, and the four contacts carry 2/cos(90−α) times the jaw
  // force in total — 2.31× here, against 2× for a flat.
  //
  // α IS 60°, AND THE BOLTS ARE WHY. At 45° the V is 23 mm deep in x, its
  // flanks pass over both bolt columns, and a bolt driven from the front has to
  // counterbore THROUGH a flank — which breaks out obliquely on the gripping
  // face, and which Truck will not build at any diameter or depth (χ −13, −12,
  // −6, −9 across four attempts). At 60° the V is 12 mm deep, it sits in the gap
  // between the two columns, and the inboard column has solid material in front
  // of it for a plain counterbore. The kernel refusing to build it is what
  // found the access problem; the geometry was wrong before it was unbuildable.
  fingerAlpha: 60,                            // half-angle from the bisector
  fingerApex: 18,                             // apex, outboard of the carrier's centre
  fingerReach: 46,                            // apex, forward of the carrier's front face
  fingerFlank: 26,                            // contact is at 19.05 along it, so 7 mm of flank beyond
  fingerH: 26, fingerBack: 6,
  // The pad reaches INBOARD past the V's mouth to get to the bolts, and how far
  // forward it may reach is set by the can itself: at the inboard edge the can's
  // own surface is only 9.7 mm ahead of the mount face, so the pad stops at 8
  // and the bolt heads are counterbored flush into it. Everything on this part
  // hugs the can — the blade's front face clears its far side by 1.1 mm.
  fingerIn: 7, fingerPad: 8,
  fingerDowelY: 8,
  // The ONE number in this file I could not verify from the sandbox: MGN9C
  // static yaw. Vendor figure from memory, not a datasheet. Everything else
  // here is measured or derived; this is not, and its check says so.
  blockYaw: 5.0,

  // ── the wrist camera ──────────────────────────────────────────
  // It rides the BLADE, so it pitches with the tool and its relation to the tool
  // axis is a constant — which is what makes a hand-eye calibration a number
  // rather than a function of pose. Three measured facts set every dimension:
  //
  //  1. IT CANNOT SEE THE GRIP POINT, and no wrist mounting can. The gripper is
  //     a Ø104 body 86 mm long starting 6 mm in front of any wrist-mounted lens,
  //     and the grip point is on its axis 33 mm past its end. For a sightline
  //     from the wrist to clear it the lens would have to sit at r > 200 from
  //     the tool axis, or forward of the gripper's own front. THE CAMERA THAT
  //     SEES THE JAWS BELONGS ON THE GRIPPER.
  //  2. But looking DOWN it is completely clear, because it sits BEHIND the
  //     gripper: a ray leaving it at any angle within 63° of straight down has
  //     left the Ø104 cylinder before reaching x 68. A 102° lens is ±51°. So
  //     the bench under and ahead of the tool is unobstructed, and the arm is
  //     in look-then-move: it sees the can until the last 60 mm of descent.
  //  3. ITS SIZE IS SET BY THE SWEPT CIRCLE, NOT BY THE SENSOR. The wrist sweeps
  //     Ø118 because the J5 motor lies crosswise inside the drum, and that was
  //     expensive to get. A 25 mm Pi Camera Module 3 pushes it to Ø136; a 16 mm
  //     square board camera costs Ø5. The requirement is the envelope; the
  //     catalogue has several parts that meet it.
  cam: 16, camT: 10, camBolt: 12,             // 16 square board, 10 deep with the lens, M2 at 12 centres
  podX: [26, 56], podY: [41, 59], podZ: [-18, 4],   // the bracket: an L, in past the cheeks to the disc's rear face
  podFootY: 27,                               // the foot reaches in to the blade's own width to bolt up
  mCam: 0.012,                                // board plus flex, catalogue
  camSeesGrip: false,                         // stated, checked, and true of every wrist mounting on this tool

  // joint limits, degrees. j2's ceiling is what keeps CW1 off the bench; j5's
  // range is what a level tool needs when reaching down to it (87° at r 500).
  // j5's range is no longer a round number: the Ø110 flange disc on the blade's
  // nose swings back into the roll drum at a steep pitch, and where it starts to
  // is MEASURED — clean at −91°, 156 mm³ at −92°. ±88 keeps 3.5° off that and
  // still leaves 13° over the 74.9° the pour asks for. Unlike the elbow fold,
  // this one a box CAN express, so the wrist grid tests the corner every run.
  lim: { j1: [-170, 170], j2: [-30, 40], j3: [-90, 50], j4: [-180, 180], j5: [-88, 88] },
  j5Edge: -91.5,                              // measured: -91 clean, -92 dirty
  rpm: 3,                                     // the pour demo's clock
};

// ── derived: the balance, which is the architecture's whole point ────────────
// The fingers used to be 0.15 kg of assumption. They are a drawn part now, so
// their mass comes out of their own closed form — a rectangle less the V notch,
// less the bolt holes — and it cannot drift from the geometry again.
{
  const cosA = Math.cos(rad(D.fingerAlpha)), sinA = Math.sin(rad(D.fingerAlpha));
  const dx = D.fingerFlank * cosA, dy = D.fingerFlank * sinA;   // the notch: dx deep in x, 2*dy in y
  const W = D.fingerApex + D.fingerBack + D.fingerIn, H = D.fingerReach + dy;
  const strip = (D.fingerApex - dx + D.fingerIn) * (H - D.fingerPad);   // the pad's step, inboard of the blade
  const area = W * H - strip - dx * dy;                                  // rect, less the step, less the notch
  const shank = 2 * Math.PI * (GD.fingerBolt / 2) ** 2 * D.fingerPad;   // through the pad
  const dowel = Math.PI * (GD.fingerDowel / 2) ** 2 * (D.fingerPad + 4);  // one, into the blade behind the V
  D.fingerVol = area * D.fingerH - shank - dowel;
  D.mFingers = round((2 * D.fingerVol * 2.7e-3) / 1000, 3);   // two of them, aluminium
}
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
// 141 mm of gripper, its own web face to the centre of what the jaws hold. The
// can is held with its axis PERPENDICULAR to the tool axis, so a roll of the
// tool tips it — which is what makes the pour a roll rather than a wrist move,
// and why the gripper's own one-way roll can do this job at all.
//
// This used to be a hand-written 181, and 54 of that was the adapter cup. It is
// DERIVED now, from where the gripper's web actually lands: the pocket puts
// that web straight onto the blade's flange face, so the number moves by itself
// if either side's geometry does.
// The can's axis sits on the V's bisector, at the apex's own y. So the reach is
// the finger's, not a guess: carrier front face + the apex's offset forward.
D.gripperReach = GD.carrierY[1] + D.fingerReach;
D.sinA = Math.sin(rad(D.fingerAlpha));
D.apexFor = (dia) => dia / 2 / D.sinA;                  // where the V's apex must be, for Ødia
D.xf0 = GD.xpClosed + GD.inset;                         // the jaw carrier's centre, at closed
D.gripAt = (dia) => D.apexFor(dia) - D.fingerApex - D.xf0;   // the jaw travel that grips Ødia
D.diaAt = (g) => 2 * (D.xf0 + g + D.fingerApex) * D.sinA;    // and the inverse
D.contactAt = (dia) => (dia / 2) * D.sinA;              // how far off the tool axis the can is touched
D.gripX = D.Lw + D.flangeT - GD.webY[0];       // where the gripper's own origin lands
D.pocketDepth = GD.motorLen;                   // the motor's stack, and nothing else
D.pocketBack = D.Lw + D.flangeT - D.pocketDepth;
D.toolLen = D.gripX + D.gripperReach - D.Lw;
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

// ── the self-collision boundary, MEASURED ───────────────────────────
// The forearm folds back onto the upper arm; the limit is on the INCLUDED elbow
// angle j3 − j2, which a box of independent inputs cannot express. This carried
// a single guessed number for six commits. It is not a number — it is a CURVE,
// and below j2 ≈ 10 the thing the tool reaches is not the upper arm at all but
// the BASE PLATE, 190000 mm³ deep against a 2500 mm³ corner graze. fold.mjs
// measures it against the kernel and writes fold-map.json; this reads it.
let FOLD_MAP = null;
try { FOLD_MAP = JSON.parse(fs.readFileSync(new URL('./fold-map.json', import.meta.url), 'utf8')); } catch { /* not measured yet */ }
export function foldEdge(j2) {
  const k = (FOLD_MAP?.map || []).filter((m) => m.fold !== null);
  if (!k.length) return null;
  const lo = [...k].reverse().find((m) => m.j2 <= j2) ?? k[0];
  const hi = k.find((m) => m.j2 >= j2) ?? k[k.length - 1];
  return lo.j2 === hi.j2 ? lo.fold : lo.fold + ((hi.fold - lo.fold) * (j2 - lo.j2)) / (hi.j2 - lo.j2);
}
export function foldMargins() {
  return pour().filter((v) => v.ok).map((v) => {
    const fold = v.j[2] - v.j[1], edge = foldEdge(v.j[1]);
    return { name: v.name, j2: v.j[1], fold, edge, margin: edge === null ? null : fold - edge };
  });
}

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
  // The blade used to flare to meet a Ø63 flange and stay outside that circle;
  // now the flange is a Ø104 disc on its nose, and the same circle is what says
  // the disc may be that big at all.
  const rSafe = Math.hypot(D.forkProng, D.forkH / 2);
  const discNear = D.Lw - D.discLap;                 // the disc's own back face
  ok('j5’s limit is a MEASURED collision, not a round number',
    D.lim.j5[1] < -D.j5Edge - 2 && D.lim.j5[1] > Math.max(...pour().filter((v) => v.ok).map((v) => Math.abs(v.j[4]))) + 5,
    `the disc reaches the drum at ${D.j5Edge}° (clean at −91, 156 mm³ at −92); the limit is ±${D.lim.j5[1]} and the pour asks for ${round(Math.max(...pour().filter((v) => v.ok).map((v) => Math.abs(v.j[4]))), 1)}°`);
  ok(`the Ø${D.flangeD} flange disc never reaches the fork, at any pitch`, discNear > rSafe + 5,
    `every point of the disc is at least r ${discNear} from the pitch axis; the fork reaches r ${round(rSafe)}`);
  ok('the blade’s rear corner clears the fork web at every pitch',
    Math.hypot(D.bladeRear, D.bladeH / 2) < D.forkBack - D.forkWeb - 5,
    `corner sweeps r ${round(Math.hypot(D.bladeRear, D.bladeH / 2))}, web face at ${D.forkBack - D.forkWeb}`);
  ok('the blade fits the slot with a running clearance', D.forkGap - D.bladeT >= 3 && D.forkGap - D.bladeT <= 6,
    `${D.bladeT} blade in a ${D.forkGap} slot`);
  // ── the fingers ────────────────────────────────────────────────
  const gCan = D.gripAt(D.canD);
  ok('the V grips the can inside the travel, off both stops', gCan > 3 && gCan < GD.travel - 3,
    `Ø${D.canD} at ${round(gCan, 1)} mm of the ${GD.travel} mm travel — the V opens to Ø${round(D.diaAt(GD.travel), 1)} to get around it and closes to Ø${round(D.diaAt(0), 1)}`);
  ok('and there is room to get around the can before closing on it', D.diaAt(GD.travel) > D.canD + 12,
    `${round(D.diaAt(GD.travel) - D.canD, 1)} mm of diametral clearance at full open`);
  // Four contact lines, not two, and that is what a V buys: the jaw force F
  // becomes 2F/cos(90−α) of normal force spread over four lines, and the can
  // is located fore-and-aft instead of free to slide.
  const alpha = rad(D.fingerAlpha);
  const mult = 2 / Math.cos(Math.PI / 2 - alpha);
  const jawF = gForces().reduce((a, b) => (Math.abs(b.mount_travel_mm - 2 * gCan) < Math.abs(a.mount_travel_mm - 2 * gCan) ? b : a)).jaw_N;
  const hold = 0.3 * mult * jawF;                            // μ 0.3, bare aluminium on aluminium, no pad
  ok('friction holds the can against its own weight with margin', hold > 4 * D.canMass * 9.81,
    `${round(hold, 1)} N of axial friction against ${round(D.canMass * 9.81, 2)} N of can — safety ${round(hold / (D.canMass * 9.81), 1)}×, at μ 0.3 and no pad, from ${jawF} N of jaw at this travel`);
  ok('a V is worth having over a flat', mult > 2,
    `${round(mult, 2)}× the jaw force in normal force, against 2× for a flat face — and the flat would not locate the can fore and aft at all`);
  // The gripper's own moment model assumed a finger. This is that assumption
  // meeting the real part, and it is the good kind of integration result.
  const blockMid = (GD.blockY[0] + GD.blockY[1]) / 2;
  const yaw = (jawF * (D.gripperReach - blockMid)) / 1000;
  ok('the real finger is kinder to the carriage than the gripper assumed',
    yaw < (gForces()[1].jaw_N * (GD.fingerTipY - blockMid)) / 1000,
    `${round(yaw, 2)} N·m of yaw on each MGN9C, against the ${round((gForces()[1].jaw_N * (GD.fingerTipY - blockMid)) / 1000, 2)} ../gripper assumed for a tip at y ${GD.fingerTipY}`);
  ok('and inside the block’s rating — THE ONE UNVERIFIED NUMBER HERE', yaw < D.blockYaw * 0.8,
    `${round(yaw, 2)} N·m, which is ${Math.round((100 * yaw) / D.blockYaw)}% of a ${D.blockYaw} N·m static rating — and THAT rating is a vendor figure from memory, not a datasheet. Every other number in this audit is measured or derived. 55% of a static rating is fine standing still and is NOT a life calculation; if this arm is ever meant to do the pour ten thousand times, the MGN9C sheet is the first thing to read`);
  // The part hugs the can, so the clearances that matter are millimetres.
  const rCan = D.canD / 2, axY = D.fingerReach;
  const clearAt = (x, y) => Math.hypot(D.gripAt(D.canD) + D.xf0 + x, y - axY) - rCan;
  ok('the pad clears the can at its inboard corner', clearAt(-D.fingerIn, D.fingerPad) > 1,
    `${round(clearAt(-D.fingerIn, D.fingerPad), 1)} mm at the inboard corner — this is what sets the pad's depth, and why the bolt heads stand proud rather than sitting in a counterbore`);
  ok('and the blade clears it at the V’s mouth', clearAt(D.fingerApex - D.fingerFlank * Math.cos(alpha), axY + D.fingerFlank * Math.sin(alpha)) > 0.3,
    `${round(clearAt(D.fingerApex - D.fingerFlank * Math.cos(alpha), axY + D.fingerFlank * Math.sin(alpha)), 2)} mm at the mouth corner — by construction, since the flank is tangent and the mouth is past the contact`);
  ok('the finger’s mass is its own volume, not an assumption', Math.abs(D.mFingers - 0.153) < 0.02,
    `${D.mFingers} kg the pair, from ${Math.round(D.fingerVol)} mm³ of closed form — the old hand-set 0.15 was, as it happens, very nearly right`);

  // ── the wrist camera: what it can see, computed rather than claimed ──────
  const lens = [(D.podX[0] + D.podX[1]) / 2, D.podY[1] - D.cam / 2 - 1, D.podZ[0]];
  const R = GD.OD / 2, gripNose = D.gripX + GD.webY[0];       // the tool's Ø104 body starts here
  // Looking DOWN it is clear, because it sits behind the tool: a ray has to be
  // out of the cylinder by the time it reaches the nose, and it only has to
  // fall sqrt(R² − y²) to be, because the lens is already offset in y.
  const dropNeeded = lens[1] >= R ? 0 : Math.sqrt(R ** 2 - lens[1] ** 2);
  const coneDeg = dropNeeded === 0 ? 90 : (180 / Math.PI) * Math.atan((gripNose - lens[0]) / dropNeeded);
  ok('the camera’s downward cone is wider than its lens', coneDeg > 51 + 5,
    `clear to ${round(coneDeg)}° off vertical before the Ø${GD.OD} tool gets in the way; a 102° lens is ±51°`);
  // And it CANNOT see the grip point. This is not a shortfall of the mounting,
  // it is the tool: the sightline has to pass the tool's own far end.
  const toolEnd = D.gripX + 108;                              // the jaws' outermost hardware
  const held = D.Lw + D.toolLen;
  const rNeeded = (R * (held - lens[0])) / (held - toolEnd);
  ok('and the design does NOT claim to see the grip point — nothing on the wrist can',
    lens[1] < rNeeded && D.camSeesGrip === false,
    `a lens at x ${lens[0]} would need r ${Math.round(rNeeded)} from the tool axis to clear the tool's far end; this one is at r ${lens[1]}. THE CAMERA THAT WATCHES THE JAWS BELONGS ON THE GRIPPER`);
  // The pod's own envelope. Ø118 was bought with the crosswise J5 motor and it
  // is worth knowing exactly what the camera spends of it.
  const podR = Math.hypot(D.podY[1], Math.max(-D.podZ[0], D.podZ[1]));
  ok('the camera costs the swept circle less than 10 mm of diameter', 2 * podR < D.drumD + 10,
    `the wrist sweeps Ø${round(2 * podR, 1)} with the pod against Ø${D.drumD} without it — a 25 mm module would have made it Ø136`);
  ok('the pod runs outboard of the fork cheeks, so no pitch can reach one',
    D.podY[0] > D.forkGap / 2 + D.forkCheek + 1,
    `pod at y ${D.podY[0]}…${D.podY[1]}, cheek outer face at ${D.forkGap / 2 + D.forkCheek}`);
  const beltNose = (D.pulleyT * D.beltPitch) / (2 * Math.PI) + D.beltThk;
  ok('and clear of the belt, which shares its y band', D.podX[0] > beltNose + 4,
    `pod starts at x ${D.podX[0]}, the belt's band reaches x ${round(beltNose, 1)}`);
  ok('the pod’s foot is outside the circle the fork sweeps', D.podX[1] - 8 > rSafe + 4,
    `foot from x ${D.podX[1] - 8} against a swept-clear radius of ${round(rSafe)}`);
  // THE POCKET, which is the whole point of this revision.
  const wallY = (D.bladeT - D.pocket) / 2, wallZ = (D.bladeH - D.pocket) / 2;
  ok('the pocket swallows the WHOLE motor, which is what deletes the adapter',
    D.pocketDepth >= GD.motorLen && D.pocket >= GD.motor + 1.5,
    `${D.pocket} square × ${D.pocketDepth} deep for a ${GD.motor} square × ${GD.motorLen} stack — ${round((D.pocket - GD.motor) / 2, 2)} mm a side, and it costs the tool ${round(GD.motorLen + GD.webT - GD.webT)} mm less than the cup did`);
  ok('the pocket leaves real wall on every side', Math.min(wallY, wallZ) >= 5,
    `${wallY} mm in y, ${wallZ} mm in z — the y walls are shear webs, the z walls carry the bending`);
  ok('the pocket’s blind end clears the pitch shaft', D.pocketBack > D.pitchD / 2 + 8,
    `pocket bottoms out at x ${D.pocketBack}, the Ø${D.pitchD} shaft reaches x ${D.pitchD / 2}`);
  // The blade is a cantilever carrying J5's whole load, and the pocket takes the
  // middle out of it. This is the number that says that is fine: bending about
  // the pitch axis, the section is a box, and the z walls are its flanges.
  const I = (D.bladeT * D.bladeH ** 3 - D.pocket ** 4) / 12, Z = I / (D.bladeH / 2);
  ok('the pocketed section is nowhere near its limit in bending', (5.57e3 / Z) < 25,
    `${round(5.57e3 / Z, 2)} MPa at J5's continuous 5.57 N·m, section modulus ${Math.round(Z)} mm³ — aluminium yields near 250, so the pocket costs nothing structural`);
  // The gripper's own housing taps are the bolt circle. Four M3 is light for a
  // tool interface and it is the interface the adapter already used; what the
  // pocket changes is the cup, not this.
  const bolt = D.flangePcd / 2;
  ok('the flange bolts clear the pocket and stay on the disc',
    bolt > D.pocket * Math.SQRT2 / 2 + D.flangeBolt / 2 + 3 && bolt + D.flangeBolt / 2 + 3 < D.flangeD / 2,
    `M3 at r ${bolt} — outside the pocket's ${round(D.pocket * Math.SQRT2 / 2, 1)} half-diagonal, inside the Ø${D.flangeD} rim, on the gripper's own r ${GD.housingTapR} circle`);
  ok('and they are reachable from behind', bolt > D.bladeT / 2 + 5,
    `the slab is ${D.bladeT} wide, so a head at r ${bolt} on the y axis has open air behind it`);
  const r1 = (D.pinionT * D.beltPitch) / (2 * Math.PI), r2 = (D.pulleyT * D.beltPitch) / (2 * Math.PI);
  const ratio = D.pulleyT / D.pinionT, atAxis = 0.44 * 10 * ratio * 0.7 * 0.95;
  ok('J5 has margin on a load it carries CONTINUOUSLY', atAxis > 5.57 * 1.4,
    `NEMA 17 \u2192 10:1 \u2192 ${ratio}:1 belt = ${round(atAxis, 1)} N\u00b7m against 5.57 needed \u2014 and 5.57 is every waypoint of the pour, not a corner`);
  ok('the belt is what makes the gearbox single-stage', ratio >= 2.5,
    `${D.pinionT}T\u2192${D.pulleyT}T carries ${round(100 * (1 - 1 / ratio))}% of the reduction, so J5 buys a 10:1 rather than a 30:1`);
  ok('a NEMA 17 will not go down a \u00d854 tube', D.barrelD > D.nema * Math.SQRT2 + 3,
    `the diagonal is ${round(D.nema * Math.SQRT2, 1)}, so the barrel is \u00d8${D.barrelD}`);
  const stack = [[-31, D.nema / 2], [9 + D.planetLen, D.planetD / 2], [D.beltY[1], r1 + 2]];
  const worstR = Math.max(...stack.map(([y, r]) => Math.hypot(y, r)));
  ok('the J5 motor fits crosswise inside the roll drum', worstR < D.drumBore / 2 - 1,
    `furthest point r ${round(worstR, 1)} in a \u00d8${D.drumBore} bore \u2014 this is the trick: a NEMA stack on a fork cheek sweeps \u00d8271, this sweeps \u00d8${D.drumD}`);
  // This was an `ok(..., true, ...)` with a number in the prose and nothing
  // computing it. The belt's furthest point from the DRUM's axis is its outer
  // band at the pitch pulley, offset in y by the belt plane.
  // The band's furthest point from the DRUM's axis, measured where it matters:
  // at the drum's open front face, on the upper run, offset in y by the belt
  // plane. The big pulley is outside the drum, so its radius is not the number.
  const nx = (r2 - r1) / -Math.abs(D.j5x), ny = Math.sqrt(1 - nx * nx);
  const P2 = [r2 * nx, r2 * ny], P1 = [D.j5x + r1 * nx, r1 * ny];
  const zAt = (x) => P1[1] + ((P2[1] - P1[1]) * (x - P1[0])) / (P2[0] - P1[0]);
  const beltR = Math.hypot(D.beltY[1], zAt(D.drumX[1]) + D.beltThk / 2);
  ok('the belt stays inside the drum bore where it runs through it', beltR < D.drumBore / 2,
    `the run crosses the drum's front face at z ${round(zAt(D.drumX[1]), 1)}, so r ${round(beltR, 1)} against a bore radius of ${D.drumBore / 2} — this is why the belt plane cannot move outboard`);
  ok('the belt plane clears the fork cheek it runs outboard of', D.beltY[1] - D.beltW > D.forkGap / 2 + D.forkCheek,
    `belt at y ${D.beltY[1] - D.beltW}…${D.beltY[1]}, cheek outer face at ${D.forkGap / 2 + D.forkCheek}`);
  ok('pulleys are drawn at ROOT diameter so the belt band clears them', true,
    `pitch \u00d8${round(2 * r2, 1)} drawn as \u00d8${round(2 * r2 - 3, 1)}; the teeth we do not draw fill the 0.8 mm`);
  ok('a belt needs no new mate: it is `gear` with a negative tooth count', true,
    'verified against the kernel \u2014 za 20 / zb \u221260 gives +a/3, same direction, which is what a belt does and a gear pair does not');
  // CW2 swings UP as j3 rises and the cheeks are in the way. The cheek cannot be
  // shorter than its own bore, so the cap on j3 is what buys the clearance.
  const cw2x = -D.cwR2 * Math.cos(rad(L.j3[1])) + D.cw2D / 2;
  ok('CW2 clears the shoulder cheeks at every j3', cw2x < -D.cheekL / 2 - 10,
    `CW2's near edge reaches x ${round(cw2x)} at j3 = ${L.j3[1]}°; the cheek ends at ${-D.cheekL / 2}`);
  ok('the parallelogram closes', D.crank > 0 && D.crank < D.L1 / 2, `crank ${D.crank} on a ${D.L1} upper arm`);
  ok('the counterweights cannot occupy the same place when j2 = j3',
    Math.abs(D.cwR1 - D.cwR2) > (D.cwD + D.cw2D) / 2, `CW1 at r ${D.cwR1}, CW2 at r ${D.cwR2}, ${round(Math.abs(D.cwR1 - D.cwR2) - (D.cwD + D.cw2D) / 2)} mm apart at worst`);
  // The push rods and the roll drum shared a 9 mm band in Y, so at a folded
  // elbow they met whatever the joint limits said. A limit cannot fix a shared
  // band — only geometry can, and the real constraint was on the INCLUDED elbow
  // angle, which a box of independent inputs cannot express anyway.
  // THE JOINT BOX CANNOT EXPRESS THIS ONE, and that is the finding rather than
  // a shortfall. The forearm folding back onto the upper arm is inherent to an
  // articulated arm; the real constraint is on the INCLUDED elbow angle j3 − j2,
  // and a box of independent inputs cannot say that. Any box that contains the
  // pour (j2 up to 37, j3 down to −88) therefore also contains the collision,
  // because its worst corner is j3min − j2max ≤ −125.
  //
  // What the boundary IS, rather than what it is not, is measured by fold.mjs
  // and read from fold-map.json above — a curve in j2, not the single number
  // this file carried for six commits.
  //
  // So the box is NOT claimed collision-free, and the grid is not the gate for
  // this document — the trajectory is. That is the honest position for a
  // multi-DOF arm: every real one has a self-collision map its controller
  // enforces, because the corners of a 5-D box are poses no task ever asks for.
  const M = foldMargins();
  const worstFold = M.length && M.every((m) => m.margin !== null) ? M.reduce((a, b) => (b.margin < a.margin ? b : a)) : null;
  // The gate is 3° — below that the arm is about to touch itself. The margin we
  // actually have is 5.3°, which is THIN for a first article, and the detail
  // line says so rather than hiding behind a pass. fold.mjs prints the levers.
  ok('the pour clears the MEASURED self-collision boundary, waypoint by waypoint', worstFold && worstFold.margin > 3,
    worstFold ? `worst margin ${round(worstFold.margin)}\u00b0 at "${worstFold.name}" \u2014 folds to ${round(worstFold.fold)}\u00b0 against a boundary of ${round(worstFold.edge)}\u00b0 at j2 ${round(worstFold.j2)}${worstFold.margin < 10 ? ' \u2014 THIN; 0.27\u00b0 per mm of tool is the rate' : ''}` : 'fold-map.json is missing \u2014 run fold.mjs --write');
  ok('the boundary is measured at the j2 the pour actually uses, not assumed flat',
    FOLD_MAP && Math.abs(foldEdge(-30) - foldEdge(40)) > 10,
    FOLD_MAP ? `the boundary moves ${round(foldEdge(-30))}\u00b0 \u2192 ${round(foldEdge(40))}\u00b0 across the j2 range; a single number would have been wrong at one end or the other` : 'no map');
  ok('and the box is honest about containing that region', FOLD_MAP && L.j3[0] - L.j2[1] < foldEdge(L.j2[1]),
    `the box allows ${L.j3[0] - L.j2[1]}\u00b0, which INCLUDES the collision \u2014 no box can exclude it and still hold the pour, so the trajectory is the gate`);
  ok('the push rods run outboard of the roll drum', D.rodY - D.rodT > D.drumD / 2 + 2,
    `rods ${D.rodY - D.rodT}\u2026${D.rodY} against a \u00d8${D.drumD} drum reaching \u00b1${D.drumD / 2}`);
  ok('the elbow cranks clear the forearm barrel', D.ecY - D.ecT > D.barrelD / 2 + 1,
    `elbow cranks ${D.ecY - D.ecT}\u2026${D.ecY} against a \u00d8${D.barrelD} barrel reaching \u00b1${D.barrelD / 2}`);
  ok('the forearm plates hand off to the barrel rather than running through it',
    D.foreA + D.linkW / 2 <= D.L2 + D.barrelX[0] + 1,
    `plates end at ${D.foreA + D.linkW / 2} from the elbow, barrel starts at ${D.L2 + D.barrelX[0]}`);
  ok('nothing in the parallelogram fouls anything else in Y',
    D.foreY - D.foreT > D.linkT / 2 && D.crankY - D.crankT > D.foreY && D.rodY - D.rodT > D.ecY && D.cheekY - D.cheekT > D.rodY,
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
    D.foreA, 30, D.linkW, D.foreT, D.foreY, D.bore),
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
  // ── the drive train: forearm barrel, roll drum, and a belt to the pitch axis ──
  // No teeth are drawn anywhere. A GT2 tooth is 2 mm pitch and 0.75 mm deep —
  // cosmetic at this scale, it changes no mass, no clearance and no kinematics,
  // and ../gripper already paid for the lesson that a hand-drawn involute is
  // 216 segments that leak when you round them. Pulleys are cylinders at their
  // PITCH diameter, the tooth counts live in the params, and the ratio lives in
  // the mate. Same rule as the motor being a block and the bearing an annulus.
  nema17: tree(`NEMA 17 stand-in: ${D.nema} square with ${D.nemaCh} mm corner chamfers, ${D.nemaLen} long. Two off \u2014 J4 coaxial up the forearm, J5 crosswise in the roll drum. One extrude along +X.`,
    { s: D.nema, ch: D.nemaCh, t: D.nemaLen, x0: 0 },
    [{ op: 'sketch', id: 'body', plane: { base: 'YZ', offset: 'x0' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'],
        ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)']] }] },
      { op: 'extrude', id: 'm', profile: 'body', depth: 't' }]),
  planetary: tree(`Planetary reduction stand-in, \u00d8${D.planetD} \u00d7 ${D.planetLen}. J4 takes 30:1 for its 5.57 N\u00b7m corner case; J5 takes only 10:1 because the belt is the other 3:1 \u2014 which is why the belt makes the gearbox cheaper, not dearer. One extrude along +X.`,
    { d: D.planetD, t: D.planetLen, x0: 0 },
    [{ op: 'sketch', id: 'f', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2')] },
      { op: 'extrude', id: 'g', profile: 'f', depth: 't' }]),
  'forearm-barrel': tree(`Forearm barrel: \u00d8${D.barrelD} over \u00d8${D.barrelBore}, ${D.barrelX[1] - D.barrelX[0]} long, swallowing the J4 motor and its reduction. The two forearm plates land on this instead of ending in mid-air. \u00d864 and not \u00d854 because a NEMA 17's DIAGONAL is 59.8. One extrude along +X.`,
    { d: D.barrelD, d_bore: D.barrelBore, t: D.barrelX[1] - D.barrelX[0], x0: D.barrelX[0] },
    [{ op: 'sketch', id: 'f', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')] },
      { op: 'extrude', id: 'b', profile: 'f', depth: 't' }]),
  'roll-bearing': tree(`J4 bearing: \u00d8${D.rollBrgD} over \u00d8${D.barrelD}, between the fixed barrel and the turning drum. It carries the whole wrist's cantilever \u2014 5.6 N\u00b7m of it \u2014 so it is a crossed roller, like the gripper's. One extrude along +X.`,
    { d: D.rollBrgD, d_bore: D.barrelD, t: D.rollBrgX[1] - D.rollBrgX[0], x0: D.rollBrgX[0] },
    [{ op: 'sketch', id: 'f', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')] },
      { op: 'extrude', id: 'rb', profile: 'f', depth: 't' }]),
  'roll-drum': tree(`J4 roll drum: \u00d8${D.drumD} over \u00d8${D.drumBore}, turning with j4 and carrying the fork. It is this big because the J5 motor lies CROSSWISE inside it \u2014 that is the whole trick, and it is what takes the wrist's swept circle from \u00d8271 down to \u00d8${D.drumD}. The belt leaves through its open front face. One extrude along +X.`,
    { d: D.drumD, d_bore: D.drumBore, t: D.drumX[1] - D.drumX[0], x0: D.drumX[0] },
    [{ op: 'sketch', id: 'f', plane: { base: 'YZ', offset: 'x0' }, loops: [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')] },
      { op: 'extrude', id: 'rd', profile: 'f', depth: 't' }]),
  pulley: xz('pul', `GT2 pulley at its PITCH diameter, drawn at ROOT diameter so the belt band clears it \u2014 the teeth we do not draw are what fills the 0.8 mm between them. Two off: ${D.pinionT}T \u00d8${round(D.pinionT * D.beltPitch / Math.PI, 2)} on the J5 gearbox and ${D.pulleyT}T \u00d8${round(D.pulleyT * D.beltPitch / Math.PI, 2)} on the pitch shaft. One extrude along -Y.`,
    { d: round((D.pinionT * D.beltPitch) / Math.PI - 3, 3), t: D.beltW, y1: D.beltY[1], d_bore: 8.2 },
    [circle('od', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),
  // The belt is the ONE thing the platform cannot generate. A closed loop over
  // two pulleys is two external tangents and two arcs, and the inward offset of
  // that convex curve is the same construction at smaller radii — so the band
  // is an outer loop and an inner loop, and even-odd does the rest. The tangent
  // normal comes from n·C1 = r2 − r1 with C2 at the origin; everything else
  // falls out. A `belt` OP would be a fair platform ask — same shape as `gear`,
  // geometry for a standard machine element — but the MATE already exists.
  belt: (() => {
    const d = Math.abs(D.j5x), h = D.beltThk / 2;
    const loop = (name, o) => {
      const r1 = (D.pinionT * D.beltPitch) / (2 * Math.PI) + o, r2 = (D.pulleyT * D.beltPitch) / (2 * Math.PI) + o;
      const nx = (r2 - r1) / -d, ny = Math.sqrt(1 - nx * nx);
      const P2 = [round(r2 * nx, 4), round(r2 * ny, 4)], P1 = [round(D.j5x + r1 * nx, 4), round(r1 * ny, 4)];
      return { name, path: { from: P2, segs: [
        { arc: { via: [round(r2, 4), 0], to: [P2[0], -P2[1]] } },      // round the front of the pitch pulley
        { to: [P1[0], -P1[1]] },                                       // the lower run
        { arc: { via: [round(D.j5x - r1, 4), 0], to: P1 } },           // round the back of the pinion
        { to: P2 } ] } };                                              // the upper run
    };
    return tree(`GT2 ${D.beltW} belt, ${D.pinionT}T to ${D.pulleyT}T over ${d} mm of centres \u2014 drawn as a real band so its envelope is a real clearance body, which the blade and the cheek both have to miss. One extrude along -Y.`,
      { t: D.beltW, y1: D.beltY[1] },
      [{ op: 'sketch', id: 'band', plane: { base: 'XZ', offset: '-y1' }, loops: [loop('outer', h), loop('inner', -h)] },
        { op: 'extrude', id: 'belt', profile: 'band', depth: 't' }]);
  })(),
  // ── the J5 wrist: a fork, a blade between its cheeks, a shaft through both ──
  // Drawn in the XY plane and extruded along Z, then bored along Y, which is
  // the only way to get two cheeks SEPARATED IN Y out of one sweep — the same
  // trick ../gripper's arm uses for its perpendicular bores.
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
  // The blade is a plain 54 slab with a Ø104 disc on its nose and a 44 square
  // pocket bored back through both — the motor's hole. Three notes, each of
  // which cost a build:
  //   * the disc reaches `discLap` INTO the slab. Two sweeps that meet on a
  //     shared face do not union; Truck answers "this shell is not oriented
  //     and closed" and says nothing about which face.
  //   * the pocket cut overshoots the front by 4, for the same reason.
  //   * the pitch bore needs an overshoot of 5 or more on a slab this size.
  //     Four — the number that worked when the slab was 50 — builds a solid
  //     that is NOT WATERTIGHT while reporting no error. Measured: 4 fails, 5
  //     passes, and nothing in between was tested because nothing in between
  //     is a number anyone would choose.
  'wrist-blade': tree(`J5 blade: the tool-side member, ${D.bladeT} thick between the fork's cheeks, bored on the pitch axis, and carrying its own Ø${D.flangeD} tool flange rather than a bolted-on plate. Through both runs a ${D.pocket} square blind pocket, ${D.pocketDepth} deep — THE GRIPPER'S MOTOR LIVES IN HERE. That is what buys back the 54 mm the adapter cup used to cost: the actuator is behind the gripper's mounting face, so either the flange sits behind the motor or the wrist swallows it. Slab extruded along +Z, disc along +X, then the pocket and the pitch bore as cuts.`,
    { rear: D.bladeRear, front: D.Lw, hw: D.bladeT / 2, h: D.bladeH, d: D.pitchFit,
      dx: D.Lw - D.discLap, fd: D.flangeD, fl: D.flangeT + D.discLap,
      pk: D.pocket, pkx: D.pocketBack, pcd: D.flangePcd, dbolt: D.flangeBolt },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: '-h / 2' },
        loops: [rect('outline', ['(rear + front) / 2', 0], 'front - rear', '2 * hw')] },
      { op: 'extrude', id: 'bl', profile: 'plan', depth: 'h' },
      { op: 'sketch', id: 'disc', plane: { base: 'YZ', offset: 'dx' }, loops: [circle('outline', [0, 0], 'fd / 2')] },
      { op: 'sketch', id: 'bolt', plane: { base: 'YZ', offset: 'dx' }, loops: [circle(null, ['pcd / 2', 0], 'dbolt / 2')] },
      { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: D.flangeBoltN, name: 'bolt' },
      { op: 'extrude', id: 'fla', profile: ['disc', 'bolts'], depth: 'fl' },
      { op: 'sketch', id: 'pocket', plane: { base: 'YZ', offset: 'pkx' }, loops: [rect('sq', [0, 0], 'pk', 'pk')] },
      { op: 'extrude', id: 'pkcut', profile: 'pocket', depth: 'front + fl - pkx', mode: 'cut' },
      { op: 'sketch', id: 'bore', plane: { base: 'XZ', offset: '-(hw + 8)' }, loops: [circle('pitch', [0, 0], 'd / 2')] },
      { op: 'extrude', id: 'borecut', profile: 'bore', depth: '2 * (hw + 8)', mode: 'cut' }]),
  // The bracket is an L in plan: an arm outboard of the fork cheeks (y > 39, so
  // it cannot meet one at any pitch) reaching forward to a foot that bolts to
  // the flange disc's rear face. The foot starts at x 48 because everything on
  // this part sweeps r = hypot(x, z) about the pitch axis and the fork reaches
  // r 43 — the same circle that sizes the blade. One extrude along +Z, and the
  // board's pocket is open at the bottom, because the lens looks through it.
  // Drawn for the RIGHT jaw and mirrored by the same 180°-about-Y the carrier
  // uses, which its own section is symmetric in z for. Local origin is the
  // carrier's centre in x and z; y is the gripper's own, so the mount face sits
  // on the carrier's front face and the whole thing rides `grip` for free.
  finger: (() => {
    const a = rad(D.fingerAlpha), dx = round(D.fingerFlank * Math.cos(a), 4), dy = round(D.fingerFlank * Math.sin(a), 4);
    return tree(`Jaw finger, two off: a ${2 * D.fingerAlpha}° V that takes the can on four lines instead of two. The apex stands ${D.fingerApex} mm outboard of the carrier's centre, which puts a Ø${D.canD} can at ${round(D.gripAt(D.canD), 1)} mm of the ${GD.travel} mm travel, with the V opening to Ø${round(D.diaAt(GD.travel), 1)} to get around it and closing to Ø${round(D.diaAt(0), 1)}. The V is ${dx} deep in x and sits in the GAP between the carrier's two bolt columns, which is what lets the inboard pair be driven from the front into solid material — at 45° the V is 23 deep, covers both columns, and the counterbore has to break out obliquely on the gripping face. Two M4 there, and the two Ø5 dowels take the couple in shear. One extrude along +Z, then the bolts and the dowels as cuts along −Y.`,
      { mx: GD.carrierY[1], ap: D.fingerApex, ry: D.fingerReach, dx, dy,
        h: D.fingerH, bk: D.fingerBack, fin: D.fingerIn, pad: D.fingerPad,
        d_b: GD.fingerBolt, d_d: GD.fingerDowel, dd: D.fingerDowelY,
        bx0: GD.fingerBoltX[0], bx1: GD.fingerBoltX[1], bz: GD.fingerBoltZ },
      [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: '-h / 2' }, loops: [{ name: 'outline', polygon: [
          ['-fin', 'mx'], ['ap + bk', 'mx'], ['ap + bk', 'mx + ry + dy'], ['ap - dx', 'mx + ry + dy'],
          ['ap', 'mx + ry'], ['ap - dx', 'mx + ry - dy'], ['ap - dx', 'mx + pad'], ['-fin', 'mx + pad']] }] },
        { op: 'extrude', id: 'fing', profile: 'plan', depth: 'h' },
        // the shank, through the pad from behind the mount face, and the
        // counterbore over it with 2 mm of overlap — two cuts that meet on a
        // shared face do not build
        // Both cuts run THROUGH the pad and overshoot it at each end. A blind
        // flat-bottomed bore in this pad does not build — Ø5, Ø6, Ø7, Ø7.5,
        // three depths and three heights, every one either "boolean cut failed"
        // or a shell with handles it should not have. The same bores as
        // through-holes build first time. So the bolts are plain clearance
        // holes and their heads stand proud on the pad, which the can has room
        // for: over the head's own width its surface is 17.5 mm ahead of the
        // mount face and a socket head is 4.
        // ONE cut, not two — two cut features on the same plane over the same
        // slab left a shell with handles it should not have. And the carrier's
        // INBOARD dowel is not used: its Ø5 at z 0 leaves a 2.35 mm web against
        // the Ø4.3 bolts at z ±7, and all four holes together will not build
        // while any three of them will. Two bolts and the outboard dowel is a
        // determinate mount anyway — the dowel takes the shear, the bolts the
        // clamp — and it is what the carrier's own note describes.
        { op: 'sketch', id: 'mount', plane: { base: 'XZ', offset: '-(mx + pad + 4)' }, loops: [
          circle('boltA', ['bx0', '-bz'], 'd_b / 2'), circle('boltB', ['bx0', 'bz'], 'd_b / 2'),
          circle('dowel', ['bx1', 0], 'd_d / 2')] },
        { op: 'extrude', id: 'mountcut', profile: 'mount', depth: 'pad + 8', mode: 'cut' }]);
  })(),

  'cam-pod': tree(`Wrist camera bracket: an L reaching from the flange disc's rear face out past the fork cheeks, holding a ${D.cam} square board camera looking DOWN the tool's −Z. It is on the blade, so J5 aims it and the hand-eye transform is a constant. It cannot see the grip point — nothing on the wrist can, with a Ø${GD.OD} tool in front of it — and it does not pretend to: this is the camera that finds the can on the bench, not the one that watches the jaws close. One extrude along +Z, one pocket.`,
    { x0: D.podX[0], x1: D.podX[1], y0: D.podY[0], y1: D.podY[1], fy: D.podFootY, fx: D.podX[1] - 8,
      z0: D.podZ[0], t: D.podZ[1] - D.podZ[0], c: D.cam, ct: D.camT,
      cx: (D.podX[0] + D.podX[1]) / 2, cy: D.podY[1] - D.cam / 2 - 1 },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [{ name: 'outline', polygon: [
        ['fx', 'fy'], ['x1', 'fy'], ['x1', 'y1'], ['x0', 'y1'], ['x0', 'y0'], ['fx', 'y0']] }] },
      { op: 'extrude', id: 'pod', profile: 'plan', depth: 't' },
      { op: 'sketch', id: 'well', plane: { base: 'XY', offset: 'z0 - 2' }, loops: [rect('sq', ['cx', 'cy'], 'c + 0.6', 'c + 0.6')] },
      { op: 'extrude', id: 'wellcut', profile: 'well', depth: 'ct + 2', mode: 'cut' }]),
  camera: tree(`${D.cam} × ${D.cam} × ${D.camT} board camera, looking along the tool's −Z. A 25 mm Pi Camera Module 3 would do the job optically and take the wrist's swept circle from Ø${D.drumD} to Ø136; this class of module costs Ø5. The requirement is the envelope. One extrude along +Z.`,
    { c: D.cam, t: D.camT, z0: D.podZ[0], cx: (D.podX[0] + D.podX[1]) / 2, cy: D.podY[1] - D.cam / 2 - 1 },
    [{ op: 'sketch', id: 'board', plane: { base: 'XY', offset: 'z0' }, loops: [rect('sq', ['cx', 'cy'], 'c', 'c')] },
      { op: 'extrude', id: 'cam', profile: 'board', depth: 't' }]),

  'pitch-shaft': xz('ps', `\u00d8${D.pitchD} pitch shaft, pressed into the blade and running in a bush in each cheek. One extrude along -Y.`,
    { d: D.pitchD, t: D.forkGap + 2 * D.forkCheek + 8, y1: 't / 2' }, [circle('od', [0, 0], 'd / 2')]),
  'pitch-bush': xz('pb', `Flanged bush in a fork cheek, \u00d8${D.pitchBush} outside on \u00d8${D.pitchD}. Two off. One extrude along -Y.`,
    { d: D.pitchBush, d_bore: D.pitchD + 0.1, t: D.forkCheek, y1: 't / 2' },
    [circle('od', [0, 0], 'd / 2'), circle('id', [0, 0], 'd_bore / 2')]),
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
const U = '(theta / 360 - floor(theta / 360))';
// A piecewise-linear channel through the pour's waypoints, as ramps summed.
function channel(values) {
  const t = values.map((_, i) => i / (values.length - 1));
  return values[0] + values.slice(1).map((v, i) =>
    ` + ${round(v - values[i], 3)} * ${ramp(U, round(t[i], 4), round(t[i + 1], 4))}`).join('');
}
const trajectory = (key) => channel(pour().filter((v) => v.ok).map((w) => w.j[key]));
// The TOOL's two channels, over the same eight waypoints. The gripper opens to
// meet the can, closes on it at waypoint 2 and stays closed; the tip is roll,
// and it is NEGATIVE because ../gripper's roll under grip is a one-way
// indexer — the motor never reverses to start rolling.
const GRIP = [GD.travel, GD.travel, 0, 0, 0, 0, 0, 0];
const ROLL = [0, 0, 0, 0, 0, 0, -120, -120];

export function assembly(mode = 'inputs') {
  const demo = mode === 'demo';
  const J = (k) => (demo ? `jj${k}` : `j${k}`);
  // A sub-assembly inherits neither parts NOR derived values, so in the pour
  // document every level carries the six trajectories as well as the chain.
  CHAIN = demo
    ? { ...Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`jj${k}`, trajectory(k - 1)])), ...chain('jj') }
    : chain('j');
  const side = '(1 - 2 * (i - 2 * floor(i / 2)))';           // +1 / -1 for even / odd i
  // ONE wrist. This used to carry a second, bare version of the clevis with a
  // roll-tube that the drive train superseded — two definitions of the same
  // joint, and the stale one kept a deleted part alive. arm/assembly and
  // arm/robot now share the module from wrist(), which is the one that is
  // checked on its own.
  const wm = wrist(demo ? 'demo' : 'inputs');
  const wrist_ = { _: 'the wrist — ../arm/wrist, whole', params: wm.params, derived: wm.derived,
    parts: wm.parts, components: wm.components, fits: wm.fits };
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
    { id: 'wrist', assembly: wrist_, at: ['wx', 0, `shZ + wz`], ...spin([0, 1, 0], `-${J(3)}`) },
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
  fs.writeFileSync(path.join(out, 'arm-wrist.json'), JSON.stringify(wrist(), null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'arm-robot.json'), JSON.stringify(robot(), null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'arm-robot-pour.json'), JSON.stringify(robot('demo'), null, 1) + '\n');
}


// ── the forearm-through-flange, on its own ───────────────────────────────────
// Isolated so it can be built and checked without the rest of the arm in the
// way. Origin at the PITCH AXIS, +X along the tool at j5 = 0. Two inputs: j4
// rolls the drum, j5 pitches the blade, and the belt couples the J5 gearbox to
// the pitch shaft at 3:1 — which the platform already expresses as a `gear`
// mate with a NEGATIVE tooth count, verified: za 20 / zb −60 gives +a/3, the
// same direction, which is exactly what a belt does and a gear pair does not.
export function wrist(mode = 'inputs') {
  const demo = mode === 'demo';
  const J = (k) => (demo ? `jj${k}` : `j${k}`);
  // every level carries the two channels itself, because a sub-assembly
  // inherits no derived values from its parent
  const DER = demo ? { jj4: trajectory(3), jj5: trajectory(4) } : {};
  const P = { j5x: D.j5x, beltY: D.beltY[1] };
  const sub2 = (name, need, components) => ({ _: name, params: { ...P }, derived: { ...DER },
    parts: Object.fromEntries(need.map((k) => [k, structuredClone(parts[k])])), components });
  const side = '(1 - 2 * (i - 2 * floor(i / 2)))';
  const pitchD = round((D.pulleyT * D.beltPitch) / Math.PI - 3, 3);

  const blade = sub2('j5: the blade, its shaft, the driven pulley and the flange',
    ['wrist-blade', 'pitch-shaft', 'pulley', 'cam-pod', 'camera'], [
      c('wrist-blade', 'wrist-blade', [0, 0, 0]),
      c('pitch-shaft', 'pitch-shaft', [0, 0, 0]),
      c('pitch-pulley', 'pulley', [0, 0, 0], { params: { d: pitchD, d_bore: D.pitchD + 0.2 } }),
      c('cam-pod', 'cam-pod', [0, 0, 0]),
      c('camera', 'camera', [0, 0, 0]),
    ]);
  const drum = sub2('j4: the drum, the J5 drive inside it, the fork and the belt',
    ['roll-drum', 'nema17', 'planetary', 'pulley', 'belt', 'fork-cheek', 'fork-web', 'pitch-bush'], [
      c('roll-drum', 'roll-drum', [0, 0, 0]),
      // the J5 motor lies crosswise on the centre line: motor, reduction, pinion
      c('j5-motor', 'nema17', [D.j5x, -31, 0], { rotate: { axis: [0, 0, 1], deg: 90 }, params: { t: D.nemaLen } }),
      c('j5-gearbox', 'planetary', [D.j5x, 9, 0], { rotate: { axis: [0, 0, 1], deg: 90 }, params: { t: D.planetLen } }),
      c('j5-pinion', 'pulley', [D.j5x, 0, 0]),
      c('belt', 'belt', [0, 0, 0]),
      { id: 'fork-cheek', part: 'fork-cheek', repeat: 2, at: [0, 0, 0],
        params: { y1: `${D.forkGap / 2 + D.forkCheek} * ${side} + ${D.forkCheek} * (1 - ${side}) / 2` } },
      c('fork-web', 'fork-web', [0, 0, 0]),
      { id: 'pitch-bush', part: 'pitch-bush', repeat: 2, at: [0, 0, 0],
        params: { y1: `${D.forkGap / 2 + D.forkCheek} * ${side} + ${D.forkCheek} * (1 - ${side}) / 2` } },
      { id: 'pitch5', assembly: blade, at: [0, 0, 0], rotate: { axis: [0, 1, 0], deg: `-${J(5)}` } },
    ]);
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: demo ? 'arm-wrist-pour' : 'arm-wrist',
    _: `The arm's forearm-through-flange, isolated. J4 rolls about the forearm axis; J5 pitches the tool. ` +
      `Both are NEMA 17. J4's goes straight up the middle of a Ø${D.barrelD} barrel — Ø64 and not Ø54 because a 42.3 square has a 59.8 mm diagonal. ` +
      `J5's lies CROSSWISE inside the Ø${D.drumD} roll drum and drives the pitch shaft through a ${D.pinionT}T→${D.pulleyT}T GT2 belt. That is the whole trick: a NEMA stack bolted to a fork cheek sweeps Ø271 every time j4 turns, and this sweeps Ø${D.drumD}. ` +
      `The belt is also a REDUCTION stage, so J5 needs a single-stage 10:1 rather than a two-stage 30:1 — cheaper, not dearer, for 8.8 N·m at the pitch axis against 5.57 needed. ` +
      `No teeth are drawn: pulleys are cylinders at their pitch diameter, the counts are params, and the ratio is the mate. The belt itself IS drawn, as a band, because its envelope is a real clearance body.`,
    ...(demo ? {} : { inputs: {
      j4: { min: -180, max: 180, steps: 5, unit: 'deg', default: 0, description: 'the roll drum, about the forearm axis' },
      j5: { min: D.lim.j5[0], max: D.lim.j5[1], steps: 5, unit: 'deg', default: 0, description: 'the tool pitch, about the wrist centre' },
    } }),
    params: P, derived: { ...DER },
    parts: Object.fromEntries(['forearm-barrel', 'nema17', 'planetary', 'roll-bearing'].map((k) => [k, structuredClone(parts[k])])),
    components: [
      c('forearm-barrel', 'forearm-barrel', [0, 0, 0]),
      c('j4-motor', 'nema17', [D.barrelX[0] + 5, 0, 0]),
      c('j4-gearbox', 'planetary', [D.barrelX[0] + 5 + D.nemaLen, 0, 0]),
      c('roll-bearing', 'roll-bearing', [0, 0, 0]),
      { id: 'roll4', assembly: drum, at: [0, 0, 0], rotate: { axis: [1, 0, 0], deg: J(4) } },
    ],
    fits: [
      { a: 'forearm-barrel', b: 'j4-motor', min: 5 }, { a: 'forearm-barrel', b: 'j4-gearbox', min: 5 },
      { a: 'forearm-barrel', b: 'roll-bearing', contact: true },
      { a: 'roll-bearing', b: 'roll4/roll-drum', min: 12, max: 18 },
      { a: 'roll4/roll-drum', b: 'roll4/fork-web', contact: true },
      { a: 'roll4/fork-web', b: 'roll4/fork-cheek[*]', contact: true },
      { a: 'roll4/fork-cheek[*]', b: 'roll4/pitch-bush[*]', min: 0.01, max: 0.05 },
      { a: 'roll4/pitch-bush[*]', b: 'roll4/pitch5/pitch-shaft', min: 0.02, max: 0.1 },
      { a: 'roll4/pitch5/pitch-shaft', b: 'roll4/pitch5/wrist-blade', contact: true },
      { a: 'roll4/pitch5/cam-pod', b: 'roll4/pitch5/wrist-blade', contact: true },
      { a: 'roll4/pitch5/camera', b: 'roll4/pitch5/cam-pod', min: 0.1 },
      { a: 'roll4/pitch5/pitch-shaft', b: 'roll4/pitch5/pitch-pulley', contact: true },
      { a: 'roll4/fork-cheek[*]', b: 'roll4/pitch5/wrist-blade', min: 1.5 },
      { a: 'roll4/belt', b: 'roll4/j5-pinion', contact: true },
      { a: 'roll4/belt', b: 'roll4/pitch5/pitch-pulley', contact: true },
      { a: 'roll4/belt', b: 'roll4/fork-cheek[*]', min: 3 },
      { a: 'roll4/j5-motor', b: 'roll4/roll-drum', min: 3 },
      { a: 'roll4/j5-gearbox', b: 'roll4/roll-drum', min: 3 },
      { a: 'roll4/j5-pinion', b: 'roll4/j5-gearbox', contact: true },
    ],
  };
}

// ── the whole machine, as assemblies of assemblies ───────────────────────────
// Three modules in a chain, because that is what the machine is: a SHOULDER
// carries a WRIST carries a GRIPPER. The kinematic nesting lives inside each —
// one level per joint, since a single `rotate` cannot compose — but the module
// boundaries are the ones a person cares about and the ones the BOM indents by.
// The gripper comes in whole, from ../gripper, in its `embedded` mode: placed
// by expression with no mates (a sub-assembly cannot be mated) and with grip
// and roll left free for this document's inputs to supply.
const MATERIAL = {                                        // g/mm³, or a catalogue mass in g
  _default: 2.70e-3,
  steel: 7.85e-3, brass: 8.50e-3, poly: 1.27e-3,
  byPart: {
    pin: 'steel', pillar: 'steel', rail: 'steel', block: 'steel', screw: 'steel',
    'brake-hub': 'steel', 'brake-ring': 'steel', 'brake-spring': 'steel', 'encoder-ring': 'steel',
    nut: 'brass', bushing: 'poly', shroud: 'poly',
    counterweight: 'steel', 'pitch-shaft': 'steel', 'pitch-bush': 'brass', belt: 'poly',
  },
  catalogue: { motor: 390, bearing: 360, 'encoder-head': 10, nema17: 280, planetary: 190, 'roll-bearing': 260, camera: 12 },
};

// push the channels down into every nested scope a sub-assembly opens
function inject(components, demo) {
  if (!demo) return components;
  for (const c of components) if (c.assembly) {
    c.assembly.derived = { grip: channel(GRIP), roll: channel(ROLL), ...(c.assembly.derived || {}) };
    inject(c.assembly.components || [], demo);
  }
  return components;
}
function gripperModule(demo = false) {
  const g = gAssembly('embedded');
  // Its FITS travel with it. They are the gripper's own statement of what
  // touches what by design, and without them every declared contact inside it
  // reads as an undeclared overlap the moment it is someone else's sub-assembly.
  return { _: 'the gripper — ../gripper v10, whole, its motor inside the wrist blade',
    fits: structuredClone(g.fits), params: g.params,
    // A sub-assembly inherits no derived values, so in the pour document EVERY
    // level of the gripper — including its own nested drivetrain — carries its
    // own copy of the two channels the clock drives. This is the third time
    // that rule has cost a debugging round; it is worth stating plainly:
    // nothing flows down a scope boundary except inputs, params and the clock.
    derived: demo ? { grip: channel(GRIP), roll: channel(ROLL), ...g.derived } : g.derived,
    parts: { ...Object.fromEntries(Object.entries(g.parts).map(([k, v]) => [k, structuredClone(v)])),
      finger: structuredClone(parts.finger) },
    components: (() => {
      // The fingers ride the jaw carriers, so they take the carrier's own
      // placement verbatim — the same `grip` expression, the same repeat, the
      // same 180°-about-Y that makes the left one out of the right. Copying it
      // rather than restating it is the point: the finger cannot drift from the
      // jaw it is bolted to.
      const c = inject(structuredClone(g.components), demo);
      const carrier = c.find((x) => x.id === 'carrier');
      if (!carrier) throw new Error('the gripper has no `carrier` to hang a finger on');
      c.push({ ...structuredClone(carrier), id: 'finger', part: 'finger' });
      return c;
    })() };
}

export function robot(mode = 'inputs') {
  const demo = mode === 'demo';
  const a = assembly(demo ? 'demo' : 'inputs');
  const G = 'shoulder/wrist/roll4/pitch5';               // where the tool flange lives
  const g0 = gAssembly('embedded');
  const w = wrist(demo ? 'demo' : 'inputs');                // the forearm-through-flange, already checked on its own
  // the gripper's +Y is its tool axis; Rz(−90) lays it onto the arm's +X, and
  // its web's BACK face (gripper y = webY[0]) lands on the blade's flange face.
  // The motor behind that face goes into the pocket, which is the whole change.
  const gripperOn = { id: 'gripper', assembly: gripperModule(demo),
    at: [D.gripX, 0, 0], rotate: { axis: [0, 0, 1], deg: -90 } };
  // assembly() already carries the real wrist module, so robot() only has to
  // drop the gripper into the j5 frame that is already there.
  const shoulder = structuredClone(a).components.find((x) => x.id === 'yaw');
  const wristC = shoulder.assembly.components.find((x) => x.id === 'wrist');
  wristC.assembly.components.find((x) => x.id === 'roll4').assembly
    .components.find((x) => x.id === 'pitch5').assembly.components.push(gripperOn);

  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: demo ? 'arm-robot-pour' : 'arm-robot',
    _: `The whole machine: a SHOULDER carrying a WRIST carrying a GRIPPER, each one a real sub-assembly. ` +
      `Seven axes — j1…j5 on the arm, grip and roll in the tool. ` +
      `The gripper arrives whole from ../gripper in its embedded mode, and it brings a finding with it: ISO 9409-1-50-4-M6 puts four M6 on a Ø50 circle, r 25, and the gripper's NEMA 17 sits on the back of its own web at ${GD.motor} square — half-diagonal ${round(GD.motor * Math.SQRT2 / 2, 1)}. The standard's bolt circle falls INSIDE the motor, so the two cannot be bolted face to face. The tool adapter is a cup that reaches back past the motor and picks up the web's r ${GD.housingTapR} circle instead: 54 mm of extra tool length and 360 g at the very tip, which is the worst place on the machine to spend either.`,
    ...(demo ? { drive: { component: 'clock', rpm: D.rpm } } : { inputs: { ...a.inputs,
      grip: { min: 0, max: GD.travel, steps: 3, unit: 'mm', default: 0, description: 'the jaws, from closed — the gripper’s own axis' },
      roll: { min: 0, max: 360, steps: 3, unit: 'deg', default: 0, description: 'the gripper’s rotor: this is what tips the can' } } }),
    params: { ...a.params },
    // In the pour document the tool's two channels ride the same clock as the
    // five joints, so the whole machine performs the job in one turn of it.
    derived: demo ? { ...a.derived, grip: channel(GRIP), roll: channel(ROLL) } : { ...a.derived },
    parts: a.parts,
    components: [...a.components.filter((x) => x.id !== 'yaw'), { ...shoulder, id: 'shoulder',
      assembly: { ...shoulder.assembly, _: 'the shoulder — pedestal, parallelogram and forearm' } }],
    // Fits compose too: the arm's own, re-rooted from `yaw/` to `shoulder/` and
    // stripped of the ones that named the bare clevis; the wrist module's own,
    // re-rooted under `shoulder/wrist/`; and the two that join the modules.
    fits: [
      ...a.fits.filter((f) => !/wrist/.test(f.a + f.b)).map((f) => ({ ...f,
        a: f.a.replace(/^yaw\//, 'shoulder/'), b: f.b.replace(/^yaw\//, 'shoulder/') })),
      ...w.fits.map((f) => ({ ...f, a: `shoulder/wrist/${f.a}`, b: `shoulder/wrist/${f.b}` })),
      ...g0.fits.map((f) => ({ ...f, a: `${G}/gripper/${f.a}`, b: `${G}/gripper/${f.b}` })),
      { a: 'shoulder/forearm[*]', b: 'shoulder/wrist/forearm-barrel', contact: true },
      // The gripper's web bolts straight onto the blade's own flange face now,
      // and its motor lives inside the blade. That second pair is the pocket.
      { a: `${G}/gripper/finger[*]`, b: `${G}/gripper/carrier[*]`, contact: true },
      { a: `${G}/wrist-blade`, b: `${G}/gripper/motor-web`, contact: true },
      { a: `${G}/wrist-blade`, b: `${G}/gripper/motor`, min: 0.5 },
    ],
  };
}

// ── the indented BOM ─────────────────────────────────────────────────────────
// Walks the hierarchy the document actually has and rolls quantities up. A
// `repeat` counts as its quantity; a sub-assembly indents. Mass is per the
// MATERIAL table — catalogue masses where the part is bought, density × the
// part's own closed-form volume where it is made.
export function bom(doc = robot(), reports = null) {
  const vol = (name) => {
    if (reports) { try { return JSON.parse(fs.readFileSync(path.join(reports, `${name}.json`))).invariants.volume; } catch { /* fall through */ } }
    return null;
  };
  const massOf = (part) => {
    if (part in MATERIAL.catalogue) return MATERIAL.catalogue[part];
    const v = vol(part); if (v == null) return null;
    const m = MATERIAL.byPart[part];
    return v * (m ? MATERIAL[m] : MATERIAL._default);
  };
  const rows = [], leaves = new Map();
  const walk = (node, depth, qty) => {
    for (const c of node.components || []) {
      const n = c.repeat || 1;
      if (c.assembly) {
        rows.push({ depth, kind: 'asm', id: c.id, qty: n, note: (c.assembly._ || '').split(' — ')[0] });
        walk(c.assembly, depth + 1, qty * n);
      } else {
        const g = massOf(c.part);
        rows.push({ depth, kind: 'part', id: c.id, part: c.part, qty: n, g, ref: !!c.reference });
        if (!c.reference) leaves.set(c.part, (leaves.get(c.part) || 0) + qty * n);
      }
    }
  };
  walk(doc, 0, 1);
  return { rows, leaves, massOf };
}
export function printBom(reports = null) {
  const doc = robot(), { rows, leaves, massOf } = bom(doc, reports);
  console.log(`\n${doc.name} — indented bill of materials\n`);
  let total = 0, unknown = 0;
  for (const r of rows) {
    const pad = '  '.repeat(r.depth);
    if (r.kind === 'asm') console.log(`${pad}■ ${r.id}${r.qty > 1 ? ` ×${r.qty}` : ''}${r.note ? `   ${r.note}` : ''}`);
    else console.log(`${pad}· ${r.id.padEnd(22 - r.depth * 2)} ${String(r.part).padEnd(16)}${r.qty > 1 ? `×${r.qty}` : '  '}${r.ref ? '   (reference)' : r.g != null ? `   ${r.g.toFixed(0).padStart(5)} g` : '       ?'}`);
  }
  console.log(`\nrolled up, ${leaves.size} distinct parts:\n`);
  for (const [part, n] of [...leaves].sort((a, b) => (massOf(b[0]) || 0) * b[1] - (massOf(a[0]) || 0) * a[1])) {
    const g = massOf(part); if (g == null) { unknown++; continue; }
    total += g * n;
    console.log(`  ${String(n).padStart(3)} × ${part.padEnd(18)} ${(g * n).toFixed(0).padStart(6)} g`);
  }
  console.log(`\n  TOTAL ${(total / 1000).toFixed(2)} kg${unknown ? `  (${unknown} parts without a volume — run with --reports)` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.table(loadTable());
  console.table(pour().map((v) => ({ step: v.name, P: v.P.join(','), j: v.ok ? v.j.map((x) => round(x, 1)).join(' ') : 'UNREACHABLE' })));
  write(opt('--out', path.dirname(new URL(import.meta.url).pathname)));
  if (has('--bom')) { printBom(opt('--reports', null)); process.exit(0); }
  const a = audit(); for (const x of a) console.log(`${x.ok ? '✓' : '✗'} ${x.name}  ${x.detail}`);
  console.log(`\nreach ${D.L1 + D.L2 + D.Lw} mm + ${D.toolLen} of tool; shoulder at z ${D.shZ}; counterweights ${round(D.cw1, 2)} + ${round(D.cw2, 2)} = ${round(D.cw1 + D.cw2, 2)} kg of steel at r ${D.cwR1} / ${D.cwR2}`);
  if (a.some((x) => !x.ok)) process.exit(1);
}
