#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 9: two pillars, and no flange plate. v8 hung the grip tension on
// two side walls and put an ISO tool flange on the back of the whole thing,
// where it carried nothing and added 14 mm. v9 deletes it and rebuilds the
// frame around the load:
//
//   · the cavity is now exactly what the motor plate and the rail plate
//     imply. Nothing behind the motor plate but the motor;
//   · TWO PILLARS span between those two plates, on the grip plane z = 0 at
//     x ±24. Ø10 bodies with an M8 end each: the threads take the tension,
//     the shoulders set the plate spacing and take the compression. They are
//     the primary structure;
//   · each pillar pierces its pivot arm. The arm slides on it, so the
//     pillars are also the plunger's alignment rail and its anti-rotation —
//     the job the arm tips and the floor skid used to do badly;
//   · the two side walls stay, at 4 mm. They are no longer the load member:
//     they stiffen the frame in torsion and shear;
//   · the tool interface is deliberately absent. It will not be a plate on
//     the back; it belongs on the motor plate, which is the plane the load
//     actually passes through.
//
// Two parts have a second operation: the jaw plate's Ø4 pin hole and the
// arm's Ø10.2 pillar bore both run across their sweep, so both are cuts,
// watertight only when they clear the part's faces by 3 mm.
//
// World frame (mm): X = jaw travel, Y = screw axis (+Y is forward, toward
// the fingers), Z = up. The screw axis is the line x = 0, z = 0. y = 0 is the
// back face of the motor.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const round = (v, n = 2) => Number(v.toFixed(n));

// ── the design numbers ───────────────────────────────────────────────────────
export const D = {
  // v10: the frame turns. A crossed-roller ring in the stator carries a rotor
  // plate, the two pillars root in it, and everything from there forward — the
  // plunger, the linkage, the rail and both jaws — is the rotating group. The
  // module is a Ø104 cylinder because the bearing says so, and the mechanism
  // sweeps Ø96.5 at open, so the two numbers are within 8 mm of each other.
  OD: 104, shroudT: 3, zBot: -22, zTop: 22, frontY: 82, frontT: 6, frontD: 100,
  // motor: NEMA 17 external linear stepper, 48 mm stack, Tr8×2 (StepperOnline 17E19S1684AF2), OUTSIDE the stator, y −26…22
  motor: 42.3, motorChamfer: 5, motorY: -26, motorLen: 48, pilot: 22.5, boltSquare: 31, bolt: 3.4, webT: 8,
  // the roll axis: a crossed-roller ring (THK RB6013 or equivalent), Ø60 bore ×
  // Ø90 × 13. Its bore clears the Ø58 pillar circle, so the pillars root in a
  // plate just ahead of it and nothing passes through the race but air.
  brgBore: 60, brgOD: 90, brgW: 13, housingTap: 2.5, housingTapR: 48.5, housingTapN: 4,
  rotorD: 84, rotorT: 6, rotorBolt: 3.4, rotorPcd: 68, rotorBoltN: 4, rotorClear: 12,   // four, not six: a circular pattern of Ø3.4 leaks at any multiple of three (see the README)
  screw: 8, lead: 2, screwEnd: 88, journal: 6, journalLen: 6, endBore: 6.2, collarD: 14, collarL: 4, collarBore: 0.1, collarY: 32,
  // the pillars: Ø10 bodies on the grip plane, an M8 nutted end into the motor plate and an M8 thread into the rail plate
  pillarX: 24, pillarD: 10, pillarBore: 10.2, pillarThread: 8, pillarCore: 6.8, pillarMinor: 6.65, pillarNut: 6.5, pillarTap: 6, pillarClear: 8.4,
  // nut and carriage: the carriage hangs on the nut and runs on the pillars through its arms
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carT: 14, carBackT: 4, carHalf: 14.5, carZ: 14, notchX: 9,
  // the pivot arms: 22 thick so the links seat on them, keyed into the carriage, bored for the pillar
  armX0: 9.1, armHalf: 39, armT: 22, armZ0: -11, pivotX: 34, pivotY: 4,
  // the linkage: struts in compression during grip; Ø4 dowels in bronze bushings
  link: 40, linkW: 10, linkT: 6, eye: 6, bushOD: 5.96, pin: 4, bushBore: 4.1, pinLen: 36,
  linkZ: [[-17, -11], [11, 17]],
  // stroke: the jaw pin 5.5 mm from its plate's inner edge, so the plates meet on the centre line at closed
  xpClosed: 5.5, xpOpen: 20.5, pivotLine: 104, inset: 10.5,
  // the guide, outside: one MGN9 rail on the OUTER face of the rail plate's strip, over the screw's blind bore
  railW: 9, railH: 6.5, railHalf: 47.5, railTapX: [15, 35], railTap: 2.5,
  blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4,
  // the jaw plate: the pin off its centre line, the finger pattern on the outboard side of the pin
  carrierHalf: 16, carrierZ: 11, carrierT: 8, fingerBolt: 4.3, fingerBoltX: [0, 11], fingerBoltZ: 7, fingerDowel: 5,
  wallSlotZ: [10.6, 17.4], wallSlotX: [8, 40],
  rpm: 5, rollRate: 1.618034, mu: 0.25, muBall: 0.005, thrust: 120, fingerTipY: 163,
  roll: 360,                                                      // the second input: the rotor turns without limit
};
D.zc = 0;
D.travel = D.xpOpen - D.xpClosed;
D.webY = [D.motorY + D.motorLen, D.motorY + D.motorLen + D.webT];  // 22…30: the motor bolts here, and it is the only solid plate on the stator
D.brgY = [D.webY[1], D.webY[1] + D.brgW];                          // 30…43: the ring, in its housing
D.rotorY = [D.brgY[1], D.brgY[1] + D.rotorT];                      // 43…49: the rotor plate, on the inner race
D.cavityY = [D.rotorY[1], D.frontY];                               // 49…82: all of it swept by the plunger
D.shroudY = [D.brgY[1], D.frontY - 1];                             // the guard: bolted to the housing's front face, 1 mm clear of the turning rail plate
D.pinZ0 = -D.pinLen / 2;                                          // ISO 8734 Ø4 m6 × 36: a stock length, centred on the links
D.armY = [-D.carT / 2 + D.carBackT, D.carT / 2];                  // the arm fills the key plate only; its back face bears on the back plate
D.pillarY = [D.rotorY[0], D.frontY + D.pillarTap];                // M8 into the rotor plate behind and the rail plate ahead: both ends on the rotor
D.pillarShoulder = D.rotorY[1];                                   // the shoulder bears on the rotor plate's front face
D.railY = [D.frontY + D.frontT, D.frontY + D.frontT + D.railH];
D.blockY = [D.railY[0] + D.blockH1, D.railY[0] + D.blockH1 + D.blockH];
D.carrierY = [D.blockY[1], D.blockY[1] + D.carrierT];
D.L = D.frontY + D.frontT;
// the slider-crank: x = pivotX − xp (the link's X reach), dy = √(L² − x²), carriage centre yn = pivotLine − pivotY − dy
const dyOf = (xp) => Math.sqrt(D.link ** 2 - (D.pivotX - xp) ** 2);
D.ynClosed = D.pivotLine - D.pivotY - dyOf(D.xpClosed);
D.ynOpen = D.pivotLine - D.pivotY - dyOf(D.xpOpen);
D.xfClosed = D.xpClosed + D.inset;
D.xfOpen = D.xpOpen + D.inset;

// ── kinematics: a crossed slider-crank per jaw ──────────────────────────────
export function pose(xp) {
  const x = D.pivotX - xp, dy = dyOf(xp), yn = D.pivotLine - D.pivotY - dy;
  return { xp, xf: xp + D.inset, x, dy, yn, gap: 2 * (xp - D.xpClosed), ratio: x / dy, angle: (Math.atan2(x, dy) * 180) / Math.PI, carFront: yn + D.carT / 2 };
}

// ── the parts, each one sweep ────────────────────────────────────────────────
const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const circle = (name, c, r) => ({ name, circle: { c, r } });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });
const xzPlate = (id, note, params, y1, loops, extra = []) => tree(note, { ...params, y1 }, [
  { op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops },
  ...extra,
  { op: 'extrude', id, profile: extra.length ? ['face', ...extra.filter((f) => f.op === 'pattern').map((f) => f.id)] : 'face', depth: 't' },
]);

export const parts = {
  // (v8's rear flange plate is gone: it carried nothing, and the tool interface belongs on the motor plate.)
  // ── the stator: two plates and a guard, and not one of them turns ──────────
  'motor-web': xzPlate('plate', 'Motor web \u2014 the only solid plate on the stator and the whole of its structure. The NEMA 17 hangs on its outside on the pilot and four M3; the screw passes through the middle; four M3 on a \u00d897 circle carry the bearing housing. It takes no grip load at all now: the grip runs pillar to rotor plate to bearing, and the bearing hands it to this plate as a moment. The tool interface belongs here; it is not drawn yet. One extrude along -Y.',
    { d: D.OD, t: D.webT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt, tr: D.housingTapR, d_tap: D.housingTap }, D.webY[1],
    [circle('outline', [0, 0], 'd / 2'), circle('pilot', [0, 0], 'd_pilot / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'sketch', id: 'tap', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['tr', 0], 'd_tap / 2')] },
     { op: 'pattern', id: 'taps', of: 'tap', kind: 'circular', count: D.housingTapN, name: 'tap' }]),

  'bearing-housing': xzPlate('ring', 'Bearing housing: a \u00d8104 ring, 13 deep, bored \u00d890 for the crossed-roller ring\u2019s outer race and tapped four M3 for the guard. The race is a press fit and a retaining plate is not drawn. This ring and the web are the stator; everything ahead of the race turns. One extrude along -Y.',
    { d: D.OD, t: D.brgW, d_bore: D.brgOD, tr: D.housingTapR, d_tap: D.housingTap }, D.brgY[1],
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')],
    [{ op: 'sketch', id: 'tap', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['tr', 0], 'd_tap / 2')] },
     { op: 'pattern', id: 'taps', of: 'tap', kind: 'circular', count: D.housingTapN, name: 'tap' }]),

  bearing: xzPlate('ring', 'Crossed-roller ring stand-in (THK RB6013 or equivalent): \u00d860 bore \u00d7 \u00d890 \u00d7 13, drawn as one annulus because the races and the rollers are the vendor\u2019s problem. It IS the roll axis, and it is chosen for MOMENT: the grip puts 61 N at a fingertip 114 mm ahead of it, 7.0 N\u00b7m, and a crossed roller takes that alone where a deep-groove pair would want 30 mm of spacing this module has nowhere to put. One extrude along -Y.',
    { d: D.brgOD, d_bore: D.brgBore, t: D.brgW }, D.brgY[1],
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2')]),

  shroud: xzPlate('tube', 'Guard: a \u00d8104 \u00d7 3 tube from the bearing housing to 1 mm short of the turning rail plate. It carries nothing \u2014 the pillars carry the grip and the bearing carries the moment \u2014 so it is printed, and its bore clears the arms\u2019 \u00d881 sweep by 11 mm a side. One extrude along -Y.',
    { d: D.OD, w: D.shroudT, t: D.shroudY[1] - D.shroudY[0] }, D.shroudY[1],
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd / 2 - w')]),

  // ── the rotor: this plate and everything ahead of it turns with `roll` ─────
  'rotor-plate': xzPlate('plate', 'Rotor plate: a \u00d884 disc on the bearing\u2019s inner race, four M3 on a \u00d868 circle. Both pillars thread M8 into it and their \u00d810 shoulders bear on its front face, so the grip tension arrives here and goes straight into the race. \u00d812 in the middle clears the screw; the nut never comes back this far. This is the root of the rotating group. One extrude along -Y.',
    { d: D.rotorD, t: D.rotorT, d_clear: D.rotorClear, ppx: D.pillarX, d_pillar: D.pillarCore, pcd: D.rotorPcd, d_bolt: D.rotorBolt }, D.rotorY[1],
    [circle('outline', [0, 0], 'd / 2'), circle('clear', [0, 0], 'd_clear / 2'),
     circle('pillarR', ['ppx', 0], 'd_pillar / 2'), circle('pillarL', ['-ppx', 0], 'd_pillar / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['pcd/2', 0], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: D.rotorBoltN, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Rail plate \u2014 the front of the rotating group. A \u00d8100 disc: the strip across its middle carries the MGN9 rail on its OUTER face, tapped M3 at the rail\u2019s own 20 mm pitch, and the screw\u2019s \u00d86.2 journal runs in a blind bore at its centre, closed by the rail itself. Either side of the strip a long slot lets a coupling link pass through, over and under the rail. Two M8 tapped holes at x \u00b124 take the pillars, drawn at the tap drill and blind because the rail closes them off. Nothing bolts to a case any more: the case does not turn and this does. One extrude along -Y.',
    { d: D.frontD, t: D.frontT, d_bore: D.endBore, sz0: D.wallSlotZ[0], sz1: D.wallSlotZ[1], sx0: D.wallSlotX[0], sx1: D.wallSlotX[1], d_tap: D.railTap, tx0: D.railTapX[0], tx1: D.railTapX[1], ppx: D.pillarX, d_pillar: D.pillarCore }, D.frontY + D.frontT,
    [circle('outline', [0, 0], 'd / 2'), circle('bore', [0, 0], 'd_bore / 2'),
     circle('pillarR', ['ppx', 0], 'd_pillar / 2'), circle('pillarL', ['-ppx', 0], 'd_pillar / 2'),
     rect('slotRlo', ['(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotRhi', ['(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     rect('slotLlo', ['-(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotLhi', ['-(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     circle('tapA', ['-tx1', 0], 'd_tap / 2'), circle('tapB', ['-tx0', 0], 'd_tap / 2'),
     circle('tapC', ['tx0', 0], 'd_tap / 2'), circle('tapD', ['tx1', 0], 'd_tap / 2')]),

  motor: tree('NEMA 17 external linear stepper body (42.3 square, 5 mm corner chamfers, 48 mm stack) with an integrated Tr8×2 lead screw as its shaft — the shortest catalogue stack that carries a 2 mm lead (the screw is its own tree). Sits behind the bulkhead. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, y1: D.motorY + D.motorLen },
    [{ op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-y1' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'], ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
     { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' }]),

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face, turned down to a Ø6 journal for the last 8 mm, which runs in the front wall’s blind bore; the thread is not modelled. One revolve about local Z, placed along +Y.',
    { d: D.screw, dj: D.journal, lj: D.journalLen, L: D.screwEnd - (D.motorY + D.motorLen) },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'shaft', polygon: [[0, 0], ['d/2', 0], ['d/2', 'L - lj'], ['dj/2', 'L - lj'], ['dj/2', 'L'], [0, 'L']] }] },
     { op: 'revolve', id: 'screw', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  collar: tree('Thrust collar: clamped on the screw just ahead of the bulkhead. Gripping drives the nut forward and so pulls the screw back, and the collar bears on the bulkhead’s front face (thrust washer and set screw not modelled). One revolve about local Z.',
    { D: D.collarD, L: D.collarL, d: D.screw + D.collarBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'collar', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  nut: tree('Tr8 flange nut stand-in: 22 mm flange, 10 mm body, 8.4 mm bore (thread not modelled; the 0.2 mm is the thread clearance). The flange sits behind the carriage, so gripping loads it in compression. One revolve about local Z.',
    { d_bore: D.nutBore, d_body: D.nutBody, L: D.nutLen, d_flange: D.flange, t_flange: D.flangeT },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_bore/2', 0], ['d_flange/2', 0], ['d_flange/2', 't_flange'], ['d_body/2', 't_flange'], ['d_body/2', 'L'], ['d_bore/2', 'L']] }] },
     { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  'carriage-back': tree('Carriage back plate, 4 thick: the thrust plate. The nut\u2019s flange bolts to its rear face and the pivot arms bottom on its front face, so gripping runs nut \u2192 plate \u2192 arm as pure compression through one Y-normal joint \u2014 no bolt sees the thrust. One extrude along -Y.',
    { t: D.carBackT, ch: D.carHalf, cz: D.carZ, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [rect('outline', [0, 0], '2 * ch', '2 * cz'), circle('bore', [0, 0], 'd_bore / 2')] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'plate', profile: ['face', 'bolts'], depth: 't' }]),

  carriage: tree('Nut carriage, 10 thick: the key plate. Its outline is notched open to each side (from x \u00b19 to the edge, 22.2 tall) and a pivot arm drops into each notch from outside, so the arm is located in X and Z and held square, while its thrust goes straight back into the back plate. Open notches, not closed slots \u2014 a closed slot cannot be assembled around an arm that reaches past it. The four bolts through the nut flange carry on through both plates. One extrude along -Y.',
    { t: D.carT - D.carBackT, ch: D.carHalf, cz: D.carZ, nx: D.notchX, slz: D.armT / 2 + 0.1, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['ch', '-cz'], ['-ch', '-cz'], ['-ch', '-slz'], ['-nx', '-slz'], ['-nx', 'slz'], ['-ch', 'slz'],
                                     ['-ch', 'cz'], ['ch', 'cz'], ['ch', 'slz'], ['nx', 'slz'], ['nx', '-slz'], ['ch', '-slz']] },
        circle('bore', [0, 0], 'd_bore / 2') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  arm: tree('Pivot arm: a 22 mm block on the grip plane, dropped into the carriage key plate\u2019s open notch and bottomed on the back plate, carrying the link pivot pin at x 34 with a link seated on each of its faces. Bored \u00d810.2 at x 24 for its pillar: the arm slides on it, and that is what holds the plunger square and stops it turning. Two per gripper (side = 1 right, -1 left); a set screw holds it in the carriage (not modelled). Local origin at the carriage centre. One extrude along +Z, then the pillar bore as a cut along Y.',
    { side: 1, x0: D.armX0, x1: D.armHalf, t: D.armT, z0: D.armZ0, y0: D.armY[0], y1: D.armY[1], px: D.pivotX, py: D.pivotY, d_pin: D.pin, ppx: D.pillarX, d_pillar: D.pillarBore },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', ['side * (x0 + x1) / 2', '(y0 + y1) / 2'], 'x1 - x0', 'y1 - y0'), circle('pivot', ['side * px', 'py'], 'd_pin / 2')] },
     { op: 'extrude', id: 'arm', profile: 'plate', depth: 't' },
     // The overhang is 4 by trial: at 3 and at 6 this same boolean returns the same volume to four decimals and leaks (χ −6), at 4 and 10 it does not. `through: true` fixes that in Truck, but Manifold ignores it and builds the arm SOLID (6303 mm³ against 5487), so the interference sweep would see no bore — measured 2026-09-14.
     { op: 'sketch', id: 'bore', plane: { base: 'XZ', offset: '-(y1 + 4)' }, loops: [circle('pillar', ['side * ppx', 0], 'd_pillar / 2')] },
     { op: 'extrude', id: 'borecut', profile: 'bore', depth: 'y1 - y0 + 8', mode: 'cut' }]),

  link: tree('Link: a 43 mm dog-bone, 6 thick, with two Ø6 eyes for pressed bronze bushings. Four per gripper: one above and one below, at z ±11…17, clear of the blocks. From the arm pin, through a slot in the front wall, to the jaw carrier’s pin outside. Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
    { L: D.link, r: D.linkW / 2, t: D.linkT, d_eye: D.eye },
    [{ op: 'sketch', id: 'outline', loops: [{ name: 'body', path: { from: [0, '-r'], segs: [
        { to: ['L', '-r'] }, { arc: { via: ['L + r', 0], to: ['L', 'r'] } }, { to: [0, 'r'] }, { arc: { via: ['-r', 0], to: [0, '-r'] } } ] } }] },
     { op: 'sketch', id: 'eye', loops: [circle(null, [0, 0], 'd_eye / 2')] },
     { op: 'pattern', id: 'eyes', of: 'eye', kind: 'linear', count: 2, step: ['L', 0], name: 'eye' },
     { op: 'extrude', id: 'link', profile: ['outline', 'eyes'], depth: 't' }]),

  bushing: tree('Bronze bushing: Ø6 × 6 with a Ø4.1 bore, pressed into a link eye, running on a Ø4 dowel. Eight per gripper. One revolve about local Z.',
    { D: D.bushOD, L: D.linkT, d: D.bushBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'bushing', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  pin: tree('A 4 mm hardened dowel, 34 long, along +Z: pressed through a pivot arm or a jaw carrier, carrying a link above and a link below in bronze bushings (retaining clips not modelled). Four per gripper. One extrude.',
    { d: D.pin, h: D.pinLen },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  carrier: tree('Jaw plate: 32 \u00d7 22 \u00d7 8, bolted to the outer face of its MGN9C block (four M3 on the block\u2019s 10 \u00d7 15 pattern). The \u00d84 link pin passes through it along Z with 22 mm of bearing, 10.5 mm inboard of its centre and 5.5 from its inner edge, so the pin sits close to the grip line and the two plates meet on the centre line at closed \u2014 that meeting is the stop. Outboard of the pin, the finger mount: four M4 and two \u00d85 dowels in two columns, tapped through and closed off by the block behind, so a finger bolt is 8 mm at most. The pin hole is a cut along Z, the only boolean in this design. One extrude along +Y.',
    { half: D.carrierHalf, hz: D.carrierZ, t: D.carrierT, y1: D.carrierY[1], px: D.blockPattern[0], pz: D.blockPattern[1], d_bolt: D.blockBolt,
      fx0: D.fingerBoltX[0], fx1: D.fingerBoltX[1], fz: D.fingerBoltZ, d_finger: D.fingerBolt, d_dowel: D.fingerDowel, inset: D.inset, d_pin: D.pin, y_pin: (D.carrierY[0] + D.carrierY[1]) / 2 },
    [{ op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops: [
        rect('outline', [0, 0], '2 * half', '2 * hz'),
        circle('blockA', ['-px/2', '-pz/2'], 'd_bolt / 2'), circle('blockB', ['px/2', '-pz/2'], 'd_bolt / 2'), circle('blockC', ['-px/2', 'pz/2'], 'd_bolt / 2'), circle('blockD', ['px/2', 'pz/2'], 'd_bolt / 2'),
        circle('fingerA', ['fx0', '-fz'], 'd_finger / 2'), circle('fingerB', ['fx1', '-fz'], 'd_finger / 2'), circle('fingerC', ['fx0', 'fz'], 'd_finger / 2'), circle('fingerD', ['fx1', 'fz'], 'd_finger / 2'),
        circle('dowelA', ['fx0', 0], 'd_dowel / 2'), circle('dowelB', ['fx1', 0], 'd_dowel / 2') ] },
     { op: 'extrude', id: 'carrier', profile: 'face', depth: 't' },
     { op: 'sketch', id: 'pinhole', plane: { base: 'XY', offset: '-(hz + 3)' }, loops: [circle('pin', ['-inset', 'y_pin'], 'd_pin / 2')] },
     { op: 'extrude', id: 'pincut', profile: 'pinhole', depth: '2 * hz + 6', mode: 'cut' }]),

  pillar: tree('Pillar: the frame\u2019s primary member. A \u00d810 body between the two plates of the ROTOR, with an M8 end at each: into the rotor plate behind and the rail plate ahead. Grip pulls the rail plate forward and the rotor plate back, so both threads are in tension and the \u00d810 shoulders take the compression \u2014 and the whole of it, tension and moment, arrives at the crossed-roller ring, which is the only joint to the stator. It also pierces its pivot arm, so it is the plunger\u2019s alignment rail and its anti-rotation. Two per gripper, on the grip plane at x \u00b124. Threads are modelled at their minor diameter (\u00d86.65 for M8), which is a real 0.075 mm clear of the \u00d86.8 tap drill \u2014 drawing both at the tap drill made two coincident cylinders and 0.72 mm\u00b3 of mesh flank. One revolve about local Z, placed along +Y.',
    { d: D.pillarD, dc: D.pillarMinor, root: D.rotorT, tap: D.pillarTap, body: D.frontY - D.pillarShoulder },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [[0, 0], ['dc/2', 0], ['dc/2', 'root'], ['d/2', 'root'], ['d/2', 'root + body'], ['dc/2', 'root + body'], ['dc/2', 'root + body + tap'], [0, 'root + body + tap']] }] },
     { op: 'revolve', id: 'pillar', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9, wrapping the rail with a 10 × 5 channel, its base 2 mm off the wall. Its four M3 face +Y, into the jaw carrier. One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], w: D.blockW, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y1', '-w/2'], ['y0', '-w/2'], ['y0', '-cw/2'], ['y0 + ch', '-cw/2'], ['y0 + ch', 'cw/2'], ['y0', 'cw/2'], ['y0', 'w/2'], ['y1', 'w/2']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section, 104 long, on the OUTER face of the front wall’s strip, centred on z = 0, closing the screw’s journal bore behind it (its own counterbores are not modelled; the wall’s tapped holes are). One extrude along +X.',
    { w: D.railW, h: D.railH, y0: D.railY[0], half: D.railHalf },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [rect('outline', ['y0 + h/2', 0], 'h', 'w')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

};
// ── the assembly, kinematic ──────────────────────────────────────────────────
// v10: TWO inputs. `grip` is each jaw's travel from closed; `roll` turns the
// whole forward half of the machine about the screw axis. The question over two
// inputs is a GRID, not a period — a path through grip × roll proves nothing
// about the corners it misses — so the gate is `--grid`.
//
// The document is a stator and a rotor. The stator is the motor, the web it
// bolts to, the bearing housing and the guard, and it is all of four parts. The
// rotor is everything else, and it hangs off ONE `revolute` joint on the rotor
// plate: its local origin is the world origin, so a joint about [0, 1, 0] turns
// it about the roll axis itself. Every other rotating part is then anchored on
// that plate with `rigid: true`, which takes the plate's whole pose rather than
// only its point, so an offset and a joint's travel turn with it.
//
// `offset` is applied AFTER `rotate`, in the rotated frame, so a part that
// carries a rotation needs its offset expressed there: R⁻¹·(P − A) for a part
// whose world place is P and whose anchor sits at A. For `alongY` that is
// (Px, −Pz, Py − A), and for the left jaw plate's 180° about Y it comes out the
// same as the right one's, which is also why both its joints take scale +1.
const alongY = { axis: [1, 0, 0], deg: -90 };            // local +Z → world +Y
const DERIVED = {
  x: 'px - xp0 - grip',                                  // the link's X reach, from the arm pivot
  dy: 'sqrt(L^2 - x^2)',                                 // and its Y reach
  yn: 'yf - py - dy',                                    // the carriage: forward closes
  xp: 'xp0 + grip',                                      // the jaw pin
  phi: 'rad2deg(atan2(dy, -x))',                         // the right link, pointing inward and forward
};
// The demo is the same machine with its two axes driven by TIME instead of set
// by hand. `drive` names a component and spins it, so it cannot run an input —
// the one thing still missing for this. What it can do is turn a reference
// clock, and `theta` is then in scope everywhere: the grip swings on a cosine
// of it and the roll advances at φ times its rate. φ is irrational, so the pair
// never repeats — the pass through grip × roll is a Lissajous that keeps
// filling in. It is for the eye. The GATE is the grid on the real document,
// because a path proves nothing about the corners it misses.
export function assembly(mode = 'inputs') {
  const demo = mode === 'demo';
  const A = D.rotorY[1];                                 // the rotor plate's front face: the datum everything turning hangs from
  const on = (offset, extra = {}) => ({ at: '@rotor-plate.start', rigid: true, offset, ...extra });
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const r = (id, part, offset, extra = {}) => ({ id, part, ...on(offset, extra) });
  const derived = demo
    ? { grip: `${D.travel} * (1 - cos(deg(theta))) / 2`, roll: `theta * ${D.rollRate}`, ...DERIVED }
    : { ...DERIVED };
  const params = { xp0: D.xpClosed, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.inset,
    lead: D.lead, flangeT: D.flangeT, carT: D.carT, carFrontT: D.carT - D.carBackT, A,
    lo: D.linkZ[0][0], hi: D.linkZ[1][0], blockL: D.blockL, ynClosed: round(D.ynClosed, 4), pinZ0: D.pinZ0 };
  const drivetrain = {
    _: 'The lead screw and its thrust collar — on the STATOR, because the screw is axisymmetric and rolling it changes no geometry. What rolling does change is the grip, by the lead, and that is the differential’s job: the screw has to turn with the rotor or the nut walks along it at 3.13 mm of jaw per revolution. The planetary that does it is not drawn yet.',
    params: { ...params }, derived: { ...derived },
    parts: { screw: structuredClone(parts.screw), collar: structuredClone(parts.collar) },
    components: [
      c('screw', 'screw', [0, 0, 0], { rotate: { axis: [0, 0, 1], deg: '360 * (ynClosed - yn) / lead' } }),
      c('collar', 'collar', [0, 0, D.collarY - (D.motorY + D.motorLen)]),
    ],
  };
  const side = '(1 - 2 * (i - 2 * floor(i / 2)))', level = 'floor(i / 2)'; // +1 right / −1 left for even / odd i; 0 lower / 1 upper — `i` is in scope only in a repeated component's own fields
  const xf0 = round(D.xpClosed + D.inset, 4);            // the carrier and its block, at closed
  const components = [
    // ── the stator: four parts, and the drivetrain hanging off the web ───────
    c('motor', 'motor', [0, 0, 0]),
    c('motor-web', 'motor-web', [0, 0, 0]),
    c('bearing-housing', 'bearing-housing', [0, 0, 0]),
    c('bearing', 'bearing', [0, 0, 0]),
    c('shroud', 'shroud', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    // ── the rotor: one joint, and everything else anchored on this plate ─────
    c('rotor-plate', 'rotor-plate', [0, 0, 0], demo ? { rotate: { axis: [0, 1, 0], deg: 'roll' } } : {}),
    ...(demo ? [c('clock', 'pin', [0, -20, D.zc], { params: { h: 1 }, reference: true })] : []),
    r('front-wall', 'front-wall', [0, -A, 0]),
    r('rail', 'rail', [0, -A, 0]),
    { id: 'pillar', part: 'pillar', repeat: 2, ...on([`${side} * ${D.pillarX}`, 0, D.pillarY[0] - A], { rotate: alongY }) },
    // the plunger: it travels by the slider-crank's own y, so it is written, not jointed
    { id: 'nut', part: 'nut', ...on([0, 0, `yn - carT / 2 - flangeT - A`], { rotate: alongY }) },
    r('carriage', 'carriage', [0, `yn + carT / 2 - A`, 0]),
    r('carriage-back', 'carriage-back', [0, `yn + carT / 2 - carFrontT - A`, 0]),
    { id: 'arm', part: 'arm', repeat: 2, ...on([0, 'yn - A', 0], { params: { side } }) },
    { id: 'arm-pin', part: 'pin', repeat: 2, ...on([`${side} * px`, 'yn + py - A', D.pinZ0]) },
    // four links, each hung on its own arm pin: the pin carries no rotation, so
    // the link's φ and then its z offset apply cleanly in the pin's frame.
    { id: 'link', part: 'link', repeat: 4, at: `@arm-pin[${side === '' ? 0 : `i - 2 * floor(i / 2)`}].start`, rigid: true,
      rotate: { axis: [0, 0, 1], deg: `phi + (180 - 2 * phi) * (1 - ${side}) / 2` },
      offset: [0, 0, `lo + (hi - lo) * ${level} - pinZ0`] },
    { id: 'bush', part: 'bushing', repeat: 8, at: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]', rotate: { align: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]' } },
    // the jaw side is linear in `grip`, so it is jointed. Placed at CLOSED; the joints open it.
    { id: 'block', part: 'block', repeat: 2, ...on([demo ? `${side} * (${xf0} + grip) - blockL / 2` : `${side} * ${xf0} - blockL / 2`, -A, 0]) },
    // the jaw plates: the pin is off the plate's centre line, so the left one is the right one turned 180° about Y (its section is symmetric about z = 0)
    { id: 'carrier', part: 'carrier', repeat: 2, ...on([demo ? `${xf0} + grip` : xf0, -A, 0], { rotate: { axis: [0, 1, 0], deg: `90 * (1 - ${side})` } }) },
    { id: 'jaw-pin', part: 'pin', repeat: 2, ...on([`${side} * ${demo ? 'xp' : 'xp0'}`, `yf - A`, D.pinZ0]) },
  ];
  // One revolute carries the whole rotor; six prismatics carry the jaw side
  // along it. `a` is the member each travels against, which is the rotor plate
  // itself now rather than the rail plate — same relative motion, but it says
  // what is actually true: these ride the rotor.
  const slide = (b, scale) => ({ kind: 'prismatic', a: 'rotor-plate', b, input: 'grip', axis: [1, 0, 0], scale });
  const mates = demo ? [] : [
    { kind: 'revolute', a: 'motor-web', b: 'rotor-plate', input: 'roll', axis: [0, 1, 0] },
    slide('carrier[0]', 1), slide('carrier[1]', 1),
    slide('block[0]', 1), slide('block[1]', -1),
    slide('jaw-pin[0]', 1), slide('jaw-pin[1]', -1),
  ];
  // What this design intends at each interface, so the clearance table judges
  // it on its own numbers. `[*]` on both sides pairs by index and `over` walks
  // an index through an expression, so a repeat is stated once; the language
  // has no `%`, hence `k - 2 * floor(k / 2)`. k: 0 right-lower, 1 left-lower,
  // 2 right-upper, 3 left-upper. A fit naming a component that does not exist
  // is an error, so this list cannot rot quietly when a repeat count changes.
  const odd = 'k - 2 * floor(k / 2)', even = `1 - (${odd})`, over = { k: 4 };
  const fits = [
    // running fits
    { a: 'arm[*]', b: 'pillar[*]', min: 0.05, max: 0.2 },              // the plunger's alignment rail
    { a: 'drivetrain/screw', b: 'nut', min: 0.1, max: 0.3 },           // thread clearance, thread not modelled
    { a: 'rotor-plate', b: 'pillar[*]', contact: true },              // M8 into it, and the Ø10 shoulder bears on its front face
    { a: 'carriage', b: 'arm[*]', min: 0.05, max: 0.2 },               // the arm in its notch: 22 in 22.2
    { a: 'nut', b: 'carriage', min: 0.05, max: 0.2 },                  // the nut body through the key plate's bore, Ø10 in Ø10.2
    { a: 'rail', b: 'block[*]', min: 0.3, max: 0.7 },
    { a: 'front-wall', b: 'link[*]', min: 0.25, max: 0.6 },
    { a: 'carrier[0]', b: 'carrier[1]', min: 0, max: 40 },             // they meet on the centre line at closed and part by the travel
    // the drivetrain (its own `fixed screw ↔ collar` reaches up here on its own)
    { a: 'front-wall', b: 'drivetrain/screw', contact: true }, { a: 'rail', b: 'drivetrain/screw', contact: true },
    { a: 'motor', b: 'drivetrain/screw', contact: true },
    { a: 'drivetrain/screw', b: 'drivetrain/collar', min: 0.03, max: 0.1 },   // a set-screw collar is a clearance bore, not a coincident surface
    // the plunger
    { a: 'carriage', b: 'carriage-back', contact: true },              // the two plates, bolted face to face
    { a: 'carriage-back', b: 'arm[*]', contact: true },                // the thrust joint: the arm bears on this face
    { a: 'nut', b: 'carriage-back', contact: true },
    { a: 'arm[*]', b: 'arm-pin[*]', contact: true }, { a: 'carrier[*]', b: 'jaw-pin[*]', contact: true },   // Ø4 press fits
    { a: 'carrier[*]', b: 'block[*]', contact: true },                 // 4 × M3 into the block's face
    // the frame
    { a: 'rail', b: 'pillar[*]', contact: true },
    { a: 'front-wall', b: 'pillar[*]', contact: true },                // the Ø10 shoulder bears on the plate's inner face; the stud's Ø6.65 minor diameter runs 0.075 clear inside the Ø6.8 tap drill
    { a: 'motor-web', b: 'motor', contact: true }, { a: 'front-wall', b: 'rail', contact: true },
    // the stator, and its one joint to the rotor
    { a: 'motor-web', b: 'bearing-housing', contact: true }, { a: 'bearing-housing', b: 'shroud', contact: true },
    { a: 'bearing-housing', b: 'bearing', contact: true },             // the outer race, pressed in
    { a: 'bearing', b: 'rotor-plate', contact: true },                 // the inner race, bolted to
    // each link k: its two bushings are pressed in, its arm-end bushing runs on
    // arm-pin[k mod 2] and its jaw-end one on jaw-pin[k mod 2], and the pin
    // stands 1 mm off the link's own eye wall through the bushing
    { a: 'link[k]', b: 'bush[2*k]', over, min: 0.01, max: 0.04 },      // pressed in for real; drawn clear, so the check sees a fit rather than a forgiven overlap
    { a: 'link[k]', b: 'bush[2*k + 1]', over, min: 0.01, max: 0.04 },
    { a: `arm-pin[${odd}]`, b: 'bush[2*k]', over, min: 0.02, max: 0.1 }, { a: `jaw-pin[${odd}]`, b: 'bush[2*k + 1]', over, min: 0.02, max: 0.1 },
    { a: `arm-pin[${odd}]`, b: 'link[k]', over, min: 0.9, max: 1.1 }, { a: `jaw-pin[${odd}]`, b: 'link[k]', over, min: 0.9, max: 1.1 },
    { a: `arm[${odd}]`, b: 'link[k]', over, contact: true }, { a: `carrier[${odd}]`, b: 'link[k]', over, contact: true },
    { a: `arm[${odd}]`, b: 'bush[2*k]', over, contact: true }, { a: `carrier[${odd}]`, b: 'bush[2*k + 1]', over, contact: true },
    { a: `arm[${even}]`, b: 'link[k]', over, min: 0.4 }, { a: `carrier[${even}]`, b: 'link[k]', over, min: 0.4 },
  ];
  const partsMap = Object.fromEntries(Object.entries(parts).filter(([k]) => !(k in drivetrain.parts)).map(([k, v]) => [k, structuredClone(v)]));
  const o = pose(D.xpOpen), cl = pose(D.xpClosed);
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: demo ? 'gripper-demo' : 'gripper',
    _: `Parallel-jaw robot gripper, v10 — it grips AND rolls: ISO 9409-1-50-4-M6 flange → NEMA 17 external linear stepper, 48 mm stack, with an integrated Tr8×${D.lead} screw → flange nut in a two-plate carriage → two ${D.armT} mm pivot arms dropped into its notches and running on the pillars → four ${D.link} mm links on bronze bushings that pass through the rail plate’s two slots, over and under the MGN9 rail on its OUTER face, and pin onto the outside of each block → a ${2 * D.carrierHalf} × ${2 * D.carrierZ} × ${D.carrierT} jaw carrier plate per side, four M4 and two Ø${D.fingerDowel} dowels for the customer’s finger. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, the mechanism outside it ${2 * D.linkZ[1][1]} mm tall and reaching y = ${D.carrierY[1]}. ` +
      `ONE input: \`grip\` is each jaw’s travel from closed, 0…${D.travel} mm, and mount centres go ${2 * D.xfClosed} → ${2 * D.xfOpen} mm with it. The carriers, their blocks and their pins are prismatic joints on it; the nut, the carriage, the arms and the links travel by the slider-crank’s own y (${round(cl.yn, 2)} closed … ${round(o.yn, 2)} open, ${round((D.ynClosed - D.ynOpen) / D.lead, 2)} turns of the screw), written into their placements because it is not linear in the input. Check it with \`--grid\`, not \`--sweep\`: a period is the wrong question for a document whose motion is an axis.`,
    ...(demo ? { drive: { component: 'clock', rpm: D.rpm } } : {}),
    ...(demo ? {} : { inputs: {
      grip: { min: 0, max: D.travel, steps: 7, unit: 'mm', default: 0,
        description: `each jaw’s travel from closed; mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm` },
      roll: { min: 0, max: D.roll, steps: 5, unit: 'deg', default: 0,
        description: 'the rotor, about the screw axis; unlimited, and it costs the grip 3.13 mm of jaw a turn unless the screw turns with it' },
    } }),
    params, derived,
    parts: partsMap,
    components, mates, fits,
  };
}
D.strokeSeconds = round(((D.ynClosed - D.ynOpen) / D.lead) * 60 / D.rpm, 2);
// ── the force curve: what the longer, flatter linkage costs ─────────────────
export function forces() {
  return [0, 7.5, 15, 22.5, 2 * D.travel].map((w) => { const p = pose(D.xpClosed + w / 2); return { mount_travel_mm: w, link_deg: round(p.angle, 1), ratio: round(p.ratio, 2), jaw_N: round((D.thrust / 2) * p.ratio, 0) }; });
}

// ── moments and friction ─────────────────────────────────────────────────────
export function moments() {
  const F = forces()[1].jaw_N;
  const out = [];
  const blockY = (D.blockY[0] + D.blockY[1]) / 2;
  const yaw = F * (D.fingerTipY - blockY);
  out.push({ where: 'jaw block (MGN9C)', kind: 'ball guide', roll_Nm: 0, pitch_Nm: 0, yaw_Nm: round(yaw / 1000, 2), note: `jaw at y = ${D.fingerTipY} assumed; roll and pitch are zero because the pins, the links, the rail and the mount are symmetric about z = 0` });
  out.push({ where: 'finger on the carrier', kind: '4 × M4 + 2 dowels', couple_Nm: round(yaw / 1000, 2), per_bolt_N: round(yaw / (2 * D.fingerBoltZ) / 2, 0), note: `the couple is reacted by the ${2 * D.fingerBoltZ} mm bolt pitch; the dowels take the shear` });
  const eta = Math.tan(Math.atan(D.lead / (Math.PI * D.screw))) / Math.tan(Math.atan(D.lead / (Math.PI * D.screw)) + Math.atan(D.mu));
  const torque = (D.thrust * D.lead) / (2 * Math.PI * eta);
  out.push({ where: 'carriage in the housing', kind: 'skid + arm tips', lateral_N: 0, couple_Nm: round(torque / 1000, 3), tip_N: round(torque / (2 * D.armHalf), 1), note: 'the links are symmetric about z = 0 and about x = 0, so the carriage sees thrust and the screw’s friction torque only' });
  out.push({ where: 'jaw pin', kind: 'supported in the middle, loaded at both ends', per_link_N: round((D.thrust / 2) / Math.cos(Math.atan2(pose(D.xpClosed).x, pose(D.xpClosed).dy)), 0), overhang_mm: D.linkZ[1][1] - D.carrierZ, note: 'the carrier grips the pin over 22 mm; each link sits on a face outside that, so the pin sees bending over the overhang, not shear across a gap' });
  return out;
}

// ── analytic clearances ──────────────────────────────────────────────────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.inner, r = D.linkW / 2, bh = D.blockL / 2;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: carriage 2 mm behind the front wall`, p.carFront + 2 <= D.frontY, `${round(p.carFront)} + 2 ≤ ${D.frontY}`);
    ok(`xp ${xp}: arms and link eyes inside the guard`, D.pivotX + r < D.OD / 2 - D.shroudT && D.armHalf < D.OD / 2 - D.shroudT, `${D.pivotX + r}, ${D.armHalf} < ${D.OD / 2 - D.shroudT}`);
    ok(`xp ${xp}: blocks on the rail`, p.xf - bh >= -D.railHalf && p.xf + bh <= D.railHalf, `${round(p.xf - bh)} … ${round(p.xf + bh)} on ±${D.railHalf}`);
    ok(`xp ${xp}: jaw plates do not cross`, p.xf - D.carrierHalf >= 0, `inner edge ${round(p.xf - D.carrierHalf)} ≥ 0`);
    ok(`xp ${xp}: link eyes do not cross, and clear the screw`, xp - r >= 0.5 && xp - r > D.screw / 2 - 4.5, `eye to ${round(xp - r)}`);
    ok(`xp ${xp}: link crosses the wall inside its slot`, (() => { const f = (y) => xp + (D.pivotLine - y) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp);
      return Math.min(f(D.frontY), f(D.frontY + D.frontT)) - 8 > D.wallSlotX[0] && Math.max(f(D.frontY), f(D.frontY + D.frontT)) + 8 < D.wallSlotX[1]; })(),
      `x ${round(xp + (D.pivotLine - D.frontY - D.frontT) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp))} … ${round(xp + (D.pivotLine - D.frontY) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp))} in ${D.wallSlotX}`);
    ok(`xp ${xp}: link not near lock`, p.x / D.link < 0.95, `x/L = ${round(p.x / D.link, 3)}`);
  }
  ok('the jaw plates meet at closed, which is the stop', D.xfClosed - D.carrierHalf >= 0 && D.xfClosed - D.carrierHalf <= 0.6, `plates at ±${round(D.xfClosed - D.carrierHalf)}, their blocks ${round(2 * (D.xfClosed - bh))} apart`);
  ok('the pin is inboard on its plate, with material around it', D.inset > 0 && D.carrierHalf - D.inset >= D.pin / 2 + 3 && D.carrierHalf - D.inset === D.xpClosed, `pin ${D.carrierHalf - D.inset} from the inner edge`);
  ok('the ratio at closed beats v7', pose(D.xpClosed).ratio > 0.91, `${round(pose(D.xpClosed).ratio, 2)} > 0.91`);
  ok('coaxial: flange centre, rail centre, links and plates symmetric about z = 0', D.zc === 0 && (D.linkZ[0][0] + D.linkZ[1][1]) === 0 && (D.armZ0 + D.armT / 2) === 0, `links ${D.linkZ}, arm ${D.armZ0}..${D.armZ0 + D.armT}`);
  // the box
  // ── the roll axis, new in v10 ───────────────────────────────────────────────
  ok('the stator is the web, the housing and the guard, and nothing else', D.webY[1] === D.brgY[0] && D.brgY[1] === D.rotorY[0] && D.shroudY[0] === D.brgY[1] && D.shroudY[1] < D.frontY, `web ${D.webY}, ring ${D.brgY}, rotor from ${D.rotorY[0]}, guard ${D.shroudY}`);
  ok('nothing passes through the race but air', D.rotorY[0] >= D.brgY[1] && D.brgBore >= D.rotorClear + 2 && D.brgBore >= 2 * D.pillarX + D.pillarD, `\u00d8${D.brgBore} bore; the rotor plate starts at ${D.rotorY[0]}, the race ends at ${D.brgY[1]}, and the \u00d8${2 * D.pillarX + D.pillarD} pillar circle is ahead of both`);
  ok('the guard clears the widest thing that turns inside it', D.OD - 2 * D.shroudT > 2 * Math.hypot(D.armHalf, D.armT / 2) + 6, `\u00d8${D.OD - 2 * D.shroudT} bore over a \u00d8${round(2 * Math.hypot(D.armHalf, D.armT / 2), 1)} arm sweep`);
  ok('the jaws sweep no wider than the module', 2 * Math.hypot(D.xfOpen + D.carrierHalf, D.carrierZ) <= D.OD, `jaws \u00d8${round(2 * Math.hypot(D.xfOpen + D.carrierHalf, D.carrierZ), 1)} in a \u00d8${D.OD} module`);
  ok('the rail plate turns inside nothing', D.frontD <= D.OD && D.frontD / 2 >= D.railHalf, `\u00d8${D.frontD} plate, rail to \u00b1${D.railHalf}, module \u00d8${D.OD}`);
  ok('the rotor plate is clear of the nut at its rearmost', D.ynOpen - D.carT / 2 - D.flangeT - D.rotorY[1] >= 2, `nut back ${round(D.ynOpen - D.carT / 2 - D.flangeT, 2)} vs plate front ${D.rotorY[1]}`);
  ok('the cavity takes the whole plunger sweep', D.cavityY[1] - D.cavityY[0] >= D.ynClosed - D.ynOpen + D.carT + D.flangeT + 2, `${D.cavityY[1] - D.cavityY[0]} mm of cavity for ${round(D.ynClosed - D.ynOpen + D.carT + D.flangeT, 1)} mm of sweep`);
  ok('both pillar threads are on the rotor, so the grip never crosses the bearing as tension', D.pillarY[0] === D.rotorY[0] && D.pillarShoulder === D.rotorY[1] && D.pillarY[1] === D.frontY + D.pillarTap, `pillar ${D.pillarY}, shoulder at ${D.pillarShoulder}`);
  ok('the motor is outside, and the web is the only solid plate on the stator', D.motorY + D.motorLen === D.webY[0] && D.webT >= 6, `motor ${D.motorY}\u2026${D.motorY + D.motorLen}, web ${D.webY}`);
  ok('every circular pattern is a count the kernel can close', [D.rotorBoltN, D.housingTapN, 4].every((n) => n === 4 || n === 8), `rotor ${D.rotorBoltN}, housing ${D.housingTapN}, motor 4 \u2014 3, 6, 9 and 12 leak at \u00d83.4`);
  ok('the pillars pierce their arms and clear the pivot pins and the carriage', D.pillarX + D.pillarD / 2 < D.armHalf && D.pillarX - D.pillarD / 2 > D.carHalf + 3 && D.pivotX - D.pillarX > (D.pin + D.pillarD) / 2 + 2, `pillar x ${D.pillarX} ±${D.pillarD / 2}, pivot at ${D.pivotX}, carriage to ${D.carHalf}`);
  // the guide and the linkage
  ok('the rail is on the OUTER face, over the blind bore', D.railY[0] === D.frontY + D.frontT && D.screwEnd <= D.railY[0], `rail from ${D.railY[0]}; screw ends ${D.screwEnd}`);
  ok('the rail is a catalogue MGN9: 95 long, holes at the 20 mm pitch, none over the screw', 2 * D.railHalf === 95 && D.railTapX[1] - D.railTapX[0] === 20 && D.railTapX[0] > D.railTap, `rail ${2 * D.railHalf} long, holes at ±${D.railTapX.join(', ±')} (E = ${D.railHalf - D.railTapX[1]})`);
  ok('the strip carries the rail, and the rail closes the pillar taps and the bore', D.wallSlotZ[0] > D.railW / 2 + 4 && D.railTapX[D.railTapX.length - 1] + D.railTap / 2 < D.railHalf && D.railTapX.every((x) => Math.abs(x - D.pillarX) > (D.railTap + D.pillarCore) / 2 + 2) && D.pillarX + D.pillarCore / 2 < D.railHalf, `strip ±${D.wallSlotZ[0]}, taps ${D.railTapX}, pillars ±${D.pillarX}`);
  ok('the slots stay inside the rail plate', D.wallSlotX[1] + 2 <= D.frontD / 2 && Math.hypot(D.wallSlotX[1], D.wallSlotZ[1]) + 2 <= D.frontD / 2, `slot corner ${round(Math.hypot(D.wallSlotX[1], D.wallSlotZ[1]), 1)} in Ø${D.frontD}`);
  ok('links clear the blocks and pass the slots', D.linkZ[1][0] >= D.blockW / 2 + 1 && D.linkZ[1][0] > D.wallSlotZ[0] && D.linkZ[1][1] < D.wallSlotZ[1], `links ${D.linkZ[1]}, block ±${D.blockW / 2}, slot ${D.wallSlotZ}`);
  ok('links seat on the arms and the plates, no spacers', D.armZ0 + D.armT === D.linkZ[1][0] && D.carrierZ === D.linkZ[1][0], `arm to ${D.armZ0 + D.armT}, plate ±${D.carrierZ}`);
  ok('pins span both links', D.linkZ[0][0] + D.pinLen >= D.linkZ[1][1], `${D.pinLen} ≥ ${D.linkZ[1][1] - D.linkZ[0][0]}`);
  ok('the finger pattern clears the pin, the block bolts and the edge', D.fingerBoltX.every((x) => Math.abs(x + D.inset) > D.pin / 2 + D.fingerBolt / 2 + 1 && Math.hypot(x - D.blockPattern[0] / 2, D.fingerBoltZ - D.blockPattern[1] / 2) > (D.fingerBolt + D.blockBolt) / 2 + 1 && x + D.fingerBolt / 2 + 1.5 <= D.carrierHalf) && D.fingerBoltZ + D.fingerBolt / 2 + 1.5 <= D.carrierZ,
    `columns at x ${D.fingerBoltX}, pin at ${-D.inset}, plate ±${D.carrierHalf} × ±${D.carrierZ}`);
  ok('the dowels sit between the bolt pairs', D.fingerBoltZ - D.fingerBolt / 2 > D.fingerDowel / 2 && D.fingerDowel < D.fingerBoltZ, `Ø${D.fingerDowel} at z 0 between bolts at ±${D.fingerBoltZ}`);
  ok('block wraps the rail', D.blockChannelH >= D.railH - D.blockH1 && D.blockChannelW > D.railW, `channel ${D.blockChannelW} × ${D.blockChannelH}`);
  ok('the arm drops into an open notch and reaches past the key plate', D.armX0 > D.notchX && D.armHalf > D.carHalf && D.armT / 2 + 0.1 < D.carZ, `arm x ${D.armX0}…${D.armHalf}, notch root ${D.notchX}, plate to ${D.carHalf}`);
  ok('the arm bottoms on the back plate, not on a bolt', D.armY[0] === -D.carT / 2 + D.carBackT && D.carBackT >= 3 && (D.armHalf - D.armX0) * 0 === 0, `arm back face at ${D.armY[0]} on a ${D.carBackT} mm plate`);
  ok('the notches clear the nut bolts and leave a strap top and bottom', D.notchX - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2) >= 1.5 && D.carZ - (D.armT / 2 + 0.1) >= 2.5 && D.carZ >= D.flange / 2, `${round(D.notchX - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2))} ≥ 1.5, strap ${round(D.carZ - (D.armT / 2 + 0.1), 1)} mm`);
  ok('the screw reaches the nut and stops at the plate', D.screwEnd - D.journalLen >= D.ynClosed - D.carT / 2 + D.nutLen - D.flangeT && D.screwEnd <= D.frontY + D.frontT, `journal from ${D.screwEnd - D.journalLen}, nut front ${round(D.ynClosed - D.carT / 2 - D.flangeT + D.nutLen)}`);
  ok('no fingers in the assembly', !('finger' in parts), 'the finger is the customer\u2019s part');
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
export const expected = {
  _: 'Closed-form volumes of every part; mm³. The kernel must land within tol (relative).',
  'motor-web': { volume: A * (D.OD ** 2 - D.pilot ** 2 - 4 * D.bolt ** 2 - D.housingTapN * D.housingTap ** 2) * D.webT, tol: 0.002 },
  'bearing-housing': { volume: A * (D.OD ** 2 - D.brgOD ** 2 - D.housingTapN * D.housingTap ** 2) * D.brgW, tol: 0.002 },
  bearing: { volume: A * (D.brgOD ** 2 - D.brgBore ** 2) * D.brgW, tol: 0.002 },
  shroud: { volume: A * (D.OD ** 2 - (D.OD - 2 * D.shroudT) ** 2) * (D.shroudY[1] - D.shroudY[0]), tol: 0.002 },
  'rotor-plate': { volume: A * (D.rotorD ** 2 - D.rotorClear ** 2 - 2 * D.pillarCore ** 2 - D.rotorBoltN * D.rotorBolt ** 2) * D.rotorT, tol: 0.002 },
  'front-wall': { volume: (A * (D.frontD ** 2 - D.endBore ** 2 - 2 * D.pillarCore ** 2 - 2 * D.railTapX.length * D.railTap ** 2) - 4 * (D.wallSlotX[1] - D.wallSlotX[0]) * (D.wallSlotZ[1] - D.wallSlotZ[0])) * D.frontT, tol: 0.002 },
  carriage: { volume: (4 * D.carHalf * D.carZ - 2 * (D.carHalf - D.notchX) * (D.armT + 0.2) - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * (D.carT - D.carBackT), tol: 0.002 },
  'carriage-back': { volume: (4 * D.carHalf * D.carZ - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * D.carBackT, tol: 0.002 },
  arm: { volume: ((D.armHalf - D.armX0) * (D.armY[1] - D.armY[0]) - A * D.pin ** 2) * D.armT - A * D.pillarBore ** 2 * (D.armY[1] - D.armY[0]), tol: 0.004 },
  pillar: { volume: A * (D.pillarMinor ** 2 * (D.rotorT + D.pillarTap) + D.pillarD ** 2 * (D.frontY - D.pillarShoulder)), tol: 0.004 },
  carrier: { volume: (4 * D.carrierHalf * D.carrierZ - 4 * A * D.blockBolt ** 2 - 4 * A * D.fingerBolt ** 2 - 2 * A * D.fingerDowel ** 2) * D.carrierT - A * D.pin ** 2 * 2 * D.carrierZ, tol: 0.004 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.bushOD ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.003 },
  pin: { volume: A * D.pin ** 2 * D.pinLen, tol: 0.004 },
  rail: { volume: D.railW * D.railH * 2 * D.railHalf, tol: 0.002 },
  block: { volume: (D.blockW * (D.blockY[1] - D.blockY[0]) - D.blockChannelW * D.blockChannelH) * D.blockL, tol: 0.002 },
  collar: { volume: A * (D.collarD ** 2 - (D.screw + D.collarBore) ** 2) * D.collarL, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen - D.journalLen) + A * D.journal ** 2 * D.journalLen, tol: 0.004 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  motor: { volume: (D.motor ** 2 - 2 * D.motorChamfer ** 2) * D.motorLen, tol: 0.002 },
};

// ── main ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const out = opt('--out', path.dirname(new URL(import.meta.url).pathname));
  const asm = assembly();
  if (has('--print')) { process.stdout.write(JSON.stringify(asm, null, 1) + '\n'); process.exit(0); }
  fs.mkdirSync(path.join(out, 'parts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(out, 'parts'))) if (!(f.replace(/\.json$/, '') in parts)) fs.unlinkSync(path.join(out, 'parts', f));
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(out, 'parts', `${k}.json`), JSON.stringify(v, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'gripper.json'), JSON.stringify(asm, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'gripper-demo.json'), JSON.stringify(assembly('demo'), null, 1) + '\n');
  fs.rmSync(path.join(out, 'gripper-stroke.json'), { force: true });   // v9's second document; the demo replaces it
  fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
  console.table([D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen].map((xp) => { const p = pose(xp); return { jaw_pin_x: xp, block_x: p.xf, nut_y: round(p.yn), link_deg: round(p.angle, 1), mount_centres: 2 * p.xf, carriage_front_y: round(p.carFront) }; }));
  console.table(forces());
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`module Ø${D.OD} × ${D.L - D.motorY} mm with the motor; the rotor sweeps Ø${round(2 * Math.hypot(D.xfOpen + D.carrierHalf, D.carrierZ), 1)} at open and reaches y = ${D.carrierY[1]}; mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm; nut stroke ${round(D.ynClosed - D.ynOpen)} mm = ${round((D.ynClosed - D.ynOpen) / D.lead, 1)} turns of Tr8×${D.lead} for ${D.travel} mm of jaw; the physical stroke ${D.strokeSeconds} s.`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
