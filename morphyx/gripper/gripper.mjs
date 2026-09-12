#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 5: coaxial. In v4 the linear guide sat 16 mm above the screw axis,
// the carriage rode two rods 8 mm below it, and every grip force made a
// couple between the two. v5 puts everything on one line:
//
//   · the screw axis, the flange centre, the guide rail's centre, the finger
//     slides' mid-plane, the link pivots and the tenon the fingers mount to
//     are all at z = 0 — no skew between the screw and the centre of grip;
//   · the rail lies flat on a bed just beyond the screw's far bearing. The
//     bed is one machined plate: it seats the rail outside the front wall
//     and guides the nut carriage inside it, so the carriage, the screw and
//     the rail are referenced to one surface. The two carriage rods are gone;
//     the housing itself aligns the carriage — its skid on the bed, its arms'
//     tips at the side walls;
//   · each finger slide is ONE part: a 12 mm plate in the mid-plane that
//     bolts to its linear block from above, runs back through a slot in the
//     front wall to carry the link pin between the links, and ends in a
//     16 × 12 mm tenon with a Ø4 cross-pin hole outside. Fingers are the
//     customer's: they carry the female pocket. The tang-to-plate corner has
//     a 3 mm fillet and the plate over the block is the cross member;
//   · every link joint is still a Ø4 dowel in a bronze bushing, one link
//     above and one below the mid-plane, so both pins are in double shear
//     and the block sees zero roll and zero pitch.
//
// Every part is ONE sweep (extrude or revolve) with an even-odd region, so
// the exact kernel names every face and the build is watertight. Joints that
// need holes in two directions are split along real part lines and fixed-
// mated: the pivot arms key into through-slots in the carriage because the
// carriage's bore runs along Y and the pivots along Z. The rail and block are
// stand-ins for purchased parts. No dependencies: node 22.
//
// World frame (mm): X = jaw travel, Y = screw axis (+Y is forward, toward
// the fingers), Z = up. The screw axis is the line x = 0, z = 0. y = 0 is the
// robot flange face.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const round = (v, n = 2) => Number(v.toFixed(n));

// ── the design numbers ───────────────────────────────────────────────────────
export const D = {
  // the case: outer box x ±48, z ±27, y 0..104; walls 4, rear plate 8, front wall 6 thick and 104 wide, standing on the bed
  W: 96, wall: 4, zBot: -27, zTop: 27, rearT: 8, frontY: 98, frontT: 6, frontW: 104, L: 104,
  // robot flange (ISO 9409-1-50-4-M6), centred on the screw axis
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw; thrust collar on the bulkhead's front face (nut forward = close, so gripping pulls the screw back)
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 103, journal: 6, journalLen: 8, endBore: 6.2, collarD: 14, collarL: 4, collarY: 42,
  // the bed: one plate on the floor, from ahead of the bulkhead to beyond the front wall; its top seats the rail and guides the carriage
  bedZ: [-23, -16], bedY: [43, 129], bedHalfIn: 43.8, bedHalfOut: 52, bedWinX: [17, 36], bedWinY: [50, 92], bedBoltX: 40, bedBoltY: [50, 95], bedBolt: 3.4, floorTap: 2.5,
  // nut and carriage: skid on the bed, a waist the arms key into, bosses above and below for the nut flange
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carT: 18, skidHalf: 13, skidZ: [-15.8, -14], bossHalf: 9, bossZ: [-14, 11], midHalf: 14.5, midZ: [-6, 6], slotX: [9, 13], slotZ: 4.1,
  // the pivot arms: one each side in the mid-plane, keyed into the carriage's slots, tips at the walls; the pivots at ±pivotX, pivotY ahead of the carriage centre
  armX0: 9.1, armHalf: 43.8, armT: 8, armZ0: -4, pivotX: 36, pivotY: 4,
  // the linkage: links L long, one above and one below the mid-plane
  link: 27, linkW: 10, linkT: 6, eye: 6, pin: 4, bushBore: 4.1, pinLen: 26, spacerL: 3,
  linkZ: [[-13, -7], [7, 13]],
  // stroke: finger pivot x (xp) closed → open; finger pivot line y_f is fixed
  xpClosed: 12, xpOpen: 30, pivotLine: 92, pinInset: 6,
  // linear guide (MGN9 stand-in) lying on the bed beyond the front wall, rail centre on the screw's plane z = 0
  railW: 9, railH: 6.5, blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4, railTap: 2.5, railTapX: [-40, -20, 0, 20, 40], blockY: [108, 128],
  // the finger slide: one 12 mm plate in the mid-plane. Local x 0 is the block centre xf; the tang (inboard) carries the pin; the tenon is the finger mount
  slideZ: [-6, 6], tangX: [-12, 2], tangY0: 86, plateHalf: 12, plateY: [107.5, 133], tenonHalf: 8, tenonL: 10, tenonHole: 4.1, fillet: 3, tenonFillet: 1.5,
  // an example finger (reference only): a C over the tenon, jaw face 18 inboard of the block centre so the jaws meet at x = 0 when closed
  fingerX: [-18, 10], fingerL: 34, fingerHalfZ: 11, pocketW: 16.2, pocketD: 10.2, fingerTipY: 165,
  wallSlotX: [5.5, 38.5], wallSlotZ: 6.2,
  rpm: 5, mu: 0.25, muBall: 0.005, thrust: 120,
};
D.zc = (D.zBot + D.zTop) / 2;
D.travel = D.xpOpen - D.xpClosed;
D.blockYc = (D.blockY[0] + D.blockY[1]) / 2;
D.railY = [D.blockYc - D.railW / 2, D.blockYc + D.railW / 2];
D.railZ = [D.bedZ[1], D.bedZ[1] + D.railH];                 // lying on the bed
D.blockZ = [D.bedZ[1] + D.blockH1, D.bedZ[1] + D.blockH];    // its top is the slide's underside
D.tenonY = [D.plateY[1], D.plateY[1] + D.tenonL];
D.pinDropArm = D.armZ0 - D.linkZ[0][0];                      // from the arm's sketch plane down to the lower link's bottom
D.pinDropSlide = D.slideZ[0] - D.linkZ[0][0];
// the slider-crank: x = pivotX − xp (the link's X reach), dy = √(L² − x²), carriage centre yn = pivotLine − pivotY − dy
const dyOf = (xp) => Math.sqrt(D.link ** 2 - (D.pivotX - xp) ** 2);
D.ynClosed = D.pivotLine - D.pivotY - dyOf(D.xpClosed);
D.ynOpen = D.pivotLine - D.pivotY - dyOf(D.xpOpen);

// ── kinematics: a crossed slider-crank per finger ───────────────────────────
export function pose(xp) {
  const x = D.pivotX - xp, dy = dyOf(xp), yn = D.pivotLine - D.pivotY - dy;
  return { xp, xf: xp + D.pinInset, x, dy, yn, gap: 2 * (xp - D.xpClosed), ratio: x / dy, angle: (Math.atan2(x, dy) * 180) / Math.PI, carFront: yn + D.carT / 2 };
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
// a concave (inside) corner fillet for a path traced with the material on the left: arriving along `a`, leaving along `b`, radius r; sketch coordinates
const K = 1 - Math.SQRT1_2;

export const parts = {
  'rear-flange': xzPlate('plate', 'Rear plate: the ISO 9409-1-50-4-M6 tool flange, centred on the screw axis (the tool centre line and the screw axis coincide). Four Ø6.6 on a 50 PCD at 45°, a Ø6 dowel at 0°, a Ø32 hole for the robot flange boss (no recess: the boss enters the case). One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.rearT, zc: D.zc, pcd: D.flangePcd, d_bolt: D.flangeBolt, d_dowel: D.dowel, d_boss: D.boss }, D.rearT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('boss', [0, 'zc'], 'd_boss / 2'), circle('dowel', ['pcd / 2', 'zc'], 'd_dowel / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['pcd/2 * cos(deg(45))', 'zc + pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', center: [0, 'zc'], count: 4, name: 'bolt' }]),

  bulkhead: xzPlate('plate', 'Motor bulkhead: fits inside the case, takes the NEMA 17 pilot and its four M3 on a 31 square. The screw passes through the pilot; the thrust collar bears on this plate’s front face. One extrude along -Y.',
    { w: D.W - 2 * D.wall - 1, zb: D.zBot + D.wall + 0.5, zt: D.zTop - D.wall - 0.5, t: D.bulkheadT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt }, D.motorY + D.motorLen + D.bulkheadT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('pilot', [0, 0], 'd_pilot / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Front wall, 104 wide, standing on the bed: the screw journal’s bearing (Ø6.2) on the mid-plane, and either side of it the slot a finger slide passes through (z ±6.2, x 5.5..38.5). The rail no longer hangs on this wall; it lies on the bed in front of it. One extrude along -Y.',
    { w: D.frontW, zb: D.bedZ[1], zt: D.zTop, t: D.frontT, d_bore: D.endBore, sx0: D.wallSlotX[0], sx1: D.wallSlotX[1], sz: D.wallSlotZ }, D.frontY + D.frontT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('bore', [0, 0], 'd_bore / 2'),
     rect('slotR', ['(sx0 + sx1) / 2', 0], 'sx1 - sx0', '2 * sz'), rect('slotL', ['-(sx0 + sx1) / 2', 0], 'sx1 - sx0', '2 * sz')]),

  bed: tree('The bed: one 7 mm plate bolted to the floor (four M3), from ahead of the bulkhead to 25 mm beyond the front wall, 87.6 wide inside the case and 104 wide outside it. Its top face is the datum: inside, the nut carriage’s skid runs on it; outside, the MGN9 rail is tapped into it (five M3 at 20 pitch, 12 mm from the rail ends), so the screw, the carriage and the rail are referenced to one machined surface. Two windows lighten it beside the carriage. One extrude along +Z.',
    { z0: D.bedZ[0], t: D.bedZ[1] - D.bedZ[0], y0: D.bedY[0], yw: D.frontY, y1: D.bedY[1], hi: D.bedHalfIn, ho: D.bedHalfOut, wx0: D.bedWinX[0], wx1: D.bedWinX[1], wy0: D.bedWinY[0], wy1: D.bedWinY[1], bx: D.bedBoltX, by0: D.bedBoltY[0], by1: D.bedBoltY[1], d_bolt: D.bedBolt, y_rail: D.blockYc, d_tap: D.railTap, tp: 20, tx0: D.railTapX[0] },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [
        { name: 'outline', polygon: [['-hi', 'y0'], ['hi', 'y0'], ['hi', 'yw'], ['ho', 'yw'], ['ho', 'y1'], ['-ho', 'y1'], ['-ho', 'yw'], ['-hi', 'yw']] },
        rect('windowR', ['(wx0 + wx1) / 2', '(wy0 + wy1) / 2'], 'wx1 - wx0', 'wy1 - wy0'), rect('windowL', ['-(wx0 + wx1) / 2', '(wy0 + wy1) / 2'], 'wx1 - wx0', 'wy1 - wy0'),
        circle('boltA', ['-bx', 'by0'], 'd_bolt / 2'), circle('boltB', ['bx', 'by0'], 'd_bolt / 2'), circle('boltC', ['-bx', 'by1'], 'd_bolt / 2'), circle('boltD', ['bx', 'by1'], 'd_bolt / 2'),
        ] },
     { op: 'sketch', id: 'tap', plane: { base: 'XY', offset: 'z0' }, loops: [circle(null, ['tx0', 'y_rail'], 'd_tap / 2')] },
     { op: 'pattern', id: 'taps', of: 'tap', kind: 'linear', count: 5, step: ['tp', 0], name: 'tap' },
     { op: 'extrude', id: 'bed', profile: ['plate', 'taps'], depth: 't' }]),

  motor: tree('NEMA 17 pancake stepper body (42.3 square, 5 mm corner chamfers, 22 long) with an integrated Tr8×2 lead screw as its shaft (the screw is its own tree). Sits behind the bulkhead. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, y1: D.motorY + D.motorLen },
    [{ op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-y1' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'], ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
     { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' }]),

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face, turned down to a Ø6 journal for the last 8 mm, ending 1 mm inside the front wall’s outer face so nothing touches the rail bed; the thread is not modelled. One revolve about local Z, placed along +Y.',
    { d: D.screw, dj: D.journal, lj: D.journalLen, L: D.screwEnd - (D.motorY + D.motorLen) },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'shaft', polygon: [[0, 0], ['d/2', 0], ['d/2', 'L - lj'], ['dj/2', 'L - lj'], ['dj/2', 'L'], [0, 'L']] }] },
     { op: 'revolve', id: 'screw', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  collar: tree('Thrust collar: clamped on the screw just ahead of the bulkhead. Gripping drives the nut forward and so pulls the screw back, and the collar bears on the bulkhead’s front face (thrust washer and set screw not modelled). One revolve about local Z.',
    { D: D.collarD, L: D.collarL, d: D.screw },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'collar', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  nut: tree('Tr8 flange nut stand-in: 22 mm flange, 10 mm body, 8.4 mm bore (thread not modelled; the 0.2 mm is the thread clearance). The flange sits behind the carriage, so gripping loads it in compression. One revolve about local Z.',
    { d_bore: D.nutBore, d_body: D.nutBody, L: D.nutLen, d_flange: D.flange, t_flange: D.flangeT },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_bore/2', 0], ['d_flange/2', 0], ['d_flange/2', 't_flange'], ['d_body/2', 't_flange'], ['d_body/2', 'L'], ['d_bore/2', 'L']] }] },
     { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  carriage: tree('Nut carriage, 18 long: the nut bore with its four flange bolt holes; a 26 mm skid that runs on the bed; a 29 mm waist on the mid-plane with a through-slot each side (4 × 8.2) that the pivot arms key into; 18 mm bosses above and below the waist for the nut flange, narrow so the link eyes pass them. The housing aligns it — skid on the bed, arm tips at the walls — and the nut sees thrust only. One extrude along -Y.',
    { t: D.carT, sh: D.skidHalf, sz0: D.skidZ[0], sz1: D.skidZ[1], bh: D.bossHalf, bz0: D.bossZ[0], bz1: D.bossZ[1], mh: D.midHalf, mz: D.midZ[1], slx0: D.slotX[0], slx1: D.slotX[1], slz: D.slotZ, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-sh', 'sz0'], ['sh', 'sz0'], ['sh', 'sz1'], ['bh', 'sz1'], ['bh', '-mz'], ['mh', '-mz'], ['mh', 'mz'], ['bh', 'mz'], ['bh', 'bz1'], ['-bh', 'bz1'], ['-bh', 'mz'], ['-mh', 'mz'], ['-mh', '-mz'], ['-bh', '-mz'], ['-bh', 'sz1'], ['-sh', 'sz1']] },
        circle('bore', [0, 0], 'd_bore / 2'),
        rect('slotR', ['(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz'), rect('slotL', ['-(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  arm: tree('Pivot arm: an 8 mm plate on the mid-plane, keyed into the carriage’s through-slot (4 mm of it), reaching to 0.2 mm from the side wall, carrying the link pivot pin at x 36, 4 mm ahead of the carriage centre. Two per gripper (side = 1 right, -1 left); a set screw holds it in the slot (not modelled). Local origin at the carriage centre. One extrude along +Z.',
    { side: 1, x0: D.armX0, x1: D.armHalf, t: D.armT, z0: D.armZ0, y0: -D.carT / 2, y1: D.carT / 2, px: D.pivotX, py: D.pivotY, d_pin: D.pin },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', ['side * (x0 + x1) / 2', '(y0 + y1) / 2'], 'x1 - x0', 'y1 - y0'), circle('pivot', ['side * px', 'py'], 'd_pin / 2')] },
     { op: 'extrude', id: 'arm', profile: 'plate', depth: 't' }]),

  link: tree('Link: a 27 mm dog-bone, 6 thick, with two Ø6 eyes for pressed bronze bushings. Four per gripper: one above and one below the mid-plane, from the arm pin to the slide pin. Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
    { L: D.link, r: D.linkW / 2, t: D.linkT, d_eye: D.eye },
    [{ op: 'sketch', id: 'outline', loops: [{ name: 'body', path: { from: [0, '-r'], segs: [
        { to: ['L', '-r'] }, { arc: { via: ['L + r', 0], to: ['L', 'r'] } }, { to: [0, 'r'] }, { arc: { via: ['-r', 0], to: [0, '-r'] } } ] } }] },
     { op: 'sketch', id: 'eye', loops: [circle(null, [0, 0], 'd_eye / 2')] },
     { op: 'pattern', id: 'eyes', of: 'eye', kind: 'linear', count: 2, step: ['L', 0], name: 'eye' },
     { op: 'extrude', id: 'link', profile: ['outline', 'eyes'], depth: 't' }]),

  bushing: tree('Bronze bushing: Ø6 × 6 with a Ø4.1 bore, pressed into a link eye, running on a Ø4 dowel. Eight per gripper. One revolve about local Z.',
    { D: D.eye, L: D.linkT, d: D.bushBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'bushing', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  spacer: tree('Spacer sleeve: Ø6 × 3 with a Ø4.1 bore, between an arm face and a link on each arm pin (the slide is thick enough to reach its links itself). Four per gripper. One revolve about local Z.',
    { D: D.eye, L: D.spacerL, d: D.bushBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'spacer', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  pin: tree('A 4 mm hardened dowel, h long, along +Z: pressed into a slide or an arm, carrying a link above and a link below in bronze bushings (retaining clips not modelled). One extrude.',
    { d: D.pin, h: D.pinLen },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  slide: tree('Finger slide, one part: a 12 mm plate on the mid-plane. Its tang (14 wide, inboard) runs from inside the case through the front-wall slot, carrying the link pin (Ø4 press) 6 mm inboard of the block centre; over the linear block it widens to 24 and takes the block’s four M3 from above (Ø3.4, 10 × 15); ahead of the block it ends in a 16 × 12 tenon, 10 long, with a Ø4.1 cross-pin hole — the finger mount: a finger carries the female pocket and the cross pin. The tang-to-plate corner has a 3 mm fillet, the tenon roots 1.5. Local x 0 is the block centre; built for the right side, the left one is turned 180° about Y. One extrude along +Z.',
    { z0: D.slideZ[0], t: D.slideZ[1] - D.slideZ[0], tx0: D.tangX[0], tx1: D.tangX[1], ty0: D.tangY0, ph: D.plateHalf, py0: D.plateY[0], py1: D.plateY[1], th: D.tenonHalf, ty1: D.tenonY[1], r: D.fillet, r1: D.tenonFillet, k: K,
      inset: D.pinInset, y_pin: D.pivotLine, d_pin: D.pin, d_x: D.tenonHole, y_x: (D.tenonY[0] + D.tenonY[1]) / 2, bx: D.blockPattern[0] / 2, by: D.blockPattern[1] / 2, yb: D.blockYc, d_bolt: D.blockBolt },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [
        { name: 'outline', path: { from: ['tx0', 'ty0'], segs: [
          { to: ['tx1', 'ty0'] }, { to: ['tx1', 'py0 - r'] }, { arc: { via: ['tx1 + r * k', 'py0 - r * k'], to: ['tx1 + r', 'py0'] } },
          { to: ['ph', 'py0'] }, { to: ['ph', 'py1'] }, { to: ['th + r1', 'py1'] }, { arc: { via: ['th + r1 * k', 'py1 + r1 * k'], to: ['th', 'py1 + r1'] } },
          { to: ['th', 'ty1'] }, { to: ['-th', 'ty1'] }, { to: ['-th', 'py1 + r1'] }, { arc: { via: ['-(th + r1 * k)', 'py1 + r1 * k'], to: ['-(th + r1)', 'py1'] } },
          { to: ['-ph', 'py1'] }, { to: ['-ph', 'ty0'] }, { to: ['tx0', 'ty0'] } ] } },
        circle('pin', ['-inset', 'y_pin'], 'd_pin / 2'), circle('cross', [0, 'y_x'], 'd_x / 2'),
        circle('boltA', ['-bx', 'yb - by'], 'd_bolt / 2'), circle('boltB', ['bx', 'yb - by'], 'd_bolt / 2'), circle('boltC', ['-bx', 'yb + by'], 'd_bolt / 2'), circle('boltD', ['bx', 'yb + by'], 'd_bolt / 2') ] },
     { op: 'extrude', id: 'slide', profile: 'plan', depth: 't' }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9 lying on the rail, with a channel over the rail, 2 mm above the rail’s mounting surface. Its four M3 on top face +Z here (in the slide). One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], z0: D.blockZ[0], z1: D.blockZ[1], yc: D.blockYc, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y0', 'z0'], ['yc - cw/2', 'z0'], ['yc - cw/2', 'z0 + ch'], ['yc + cw/2', 'z0 + ch'], ['yc + cw/2', 'z0'], ['y1', 'z0'], ['y1', 'z1'], ['y0', 'z1']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section, 104 long, lying on the bed with its centre line on the screw’s plane (its Ø3.5 mounting holes at 20 pitch are not modelled; the bed’s tapped holes are). One extrude along +X.',
    { w: D.railW, h: D.railH, yc: D.blockYc, z0: D.railZ[0], half: D.frontW / 2 },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [rect('outline', ['yc', 'z0 + h/2'], 'w', 'h')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

  finger: tree('An example finger, reference only: a C that slips over the slide’s tenon, 22 tall, its jaw face 18 mm inboard of the block centre so the two jaws meet at x = 0 when closed. A real finger closes the pocket above and below the tenon and takes the Ø4 cross pin; it is the customer’s part. Local x 0 is the block centre, local y 0 the slide’s front face. One extrude along +Z.',
    { x0: D.fingerX[0], x1: D.fingerX[1], L: D.fingerL, hz: D.fingerHalfZ, pw: D.pocketW, pd: D.pocketD, y0: D.tenonY[0] },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: '-hz' }, loops: [{ name: 'jaw', path: { from: ['x0', 'y0'], segs: [
        { to: ['-pw / 2', 'y0'] }, { to: ['-pw / 2', 'y0 + pd'] }, { to: ['pw / 2', 'y0 + pd'] }, { to: ['pw / 2', 'y0'] }, { to: ['x1', 'y0'] }, { to: ['x1', 'y0 + L'] }, { to: ['x0', 'y0 + L'] }, { to: ['x0', 'y0'] } ] } }] },
     { op: 'extrude', id: 'finger', profile: 'plan', depth: '2 * hz' }]),

  'side-wall': tree('Side wall, plain. Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.rearT, y1: D.frontY, z0: D.zBot + D.wall, z1: D.zTop - D.wall },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0')] }, { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor plate, from the rear plate to the front wall’s outer face (the bed sits on it and passes under the wall), tapped M3 for the bed’s four bolts. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY + D.frontT, t: D.wall, z0: D.zBot, bx: D.bedBoltX, by0: D.bedBoltY[0], by1: D.bedBoltY[1], d_tap: D.floorTap },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'),
        circle('tapA', ['-bx', 'by0'], 'd_tap / 2'), circle('tapB', ['bx', 'by0'], 'd_tap / 2'), circle('tapC', ['-bx', 'by1'], 'd_tap / 2'), circle('tapD', ['bx', 'by1'], 'd_tap / 2')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid, with an access window over the linkage. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zTop - D.wall, win_w: D.W - 2 * D.wall - 16, win_y0: D.ynOpen - 6, win_y1: D.frontY - 8 },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, '(win_y0 + win_y1) / 2'], 'win_w', 'win_y1 - win_y0')] }, { op: 'extrude', id: 'lid', profile: 'plate', depth: 't' }]),
};

// ── the assembly, kinematic ──────────────────────────────────────────────────
// Two documents from the same parts. `assembly()` is the demo cycle: a
// reference clock is the driven component, the screw angle is a cosine of
// its angle, so the gripper closes and opens once per clock turn and the
// viewer's spin never runs it into a stop. `assembly('stroke')` is the
// physical stroke: the screw is driven at rpm, a `screw` mate carries the
// carriage by the lead, `fixed` mates carry the nut and the arms, and the
// links and slides follow the screw's angle; one stroke is ynClosed − ynOpen
// over the lead, and the sweep's period is that stroke. Both use `repeat`
// and placement by feature: bushings sit on their link eyes, pins and
// spacers on their holes, and follow them through the motion.
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((ynClosed - ynOpen) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly(mode = 'cycle') {
  const stroke = mode === 'stroke';
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.pinInset, flangeT: D.flangeT, carT: D.carT, blockL: D.blockL,
    lo: D.linkZ[0][0], hi: D.linkZ[1][0], armT: D.armT, spacerL: D.spacerL, pinDropArm: D.pinDropArm, pinDropSlide: D.pinDropSlide };
  const derived = {
    ...(stroke ? { turns: 'theta / 360' } : { spin: SPIN }),
    yn: stroke ? 'ynOpen + lead * turns' : 'ynOpen + lead * spin / 360',   // the nut moves forward to close
    dy: 'yf - py - yn',
    x: 'sqrt(L^2 - dy^2)',
    xp: 'px - x',                                         // finger pivot, inboard of the arm pivot
    xf: 'xp + inset',                                     // block centre
    phi: 'rad2deg(atan2(dy, -x))',                        // the right link, from its arm eye, points inward and forward
  };
  const drivetrain = {
    _: 'The lead screw and its thrust collar, built along Z, tilted onto the +Y axis by this sub-assembly’s placement.' + (stroke ? ' The screw is the driven component; the collar is fixed to it.' : ' Both spin by `spin`.'),
    params: { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead },
    ...(stroke ? {} : { derived: { spin: SPIN } }),
    parts: { screw: structuredClone(parts.screw), collar: structuredClone(parts.collar) },
    components: [
      c('screw', 'screw', [0, 0, 0], stroke ? {} : { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
      c('collar', 'collar', [0, 0, D.collarY - (D.motorY + D.motorLen)], stroke ? {} : { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
    ],
    ...(stroke ? { mates: [{ kind: 'fixed', a: 'screw', b: 'collar' }] } : {}),
  };
  // the carriage: posed by expression in the cycle document; carried by the screw mate in the stroke document, where its
  // placement is the open position and the mate adds lead × turns along +Y
  const side = '(1 - 2 * (i - 2 * floor(i / 2)))', level = 'floor(i / 2)'; // +1 right / −1 left for even / odd i; 0 lower / 1 upper — `i` is in scope only in a repeated component's own fields
  const carriageAt = stroke ? [0, 'ynOpen + carT / 2', 0] : [0, 'yn + carT / 2', 0];
  const nutAt = stroke ? [0, 'ynOpen - carT / 2 - flangeT', 0] : [0, 'yn - carT / 2 - flangeT', 0];
  const armAt = stroke ? [0, 'ynOpen', 0] : [0, 'yn', 0];
  const components = [
    ...(stroke ? [] : [c('clock', 'pin', [0, -20, D.zc], { params: { h: 1 }, reference: true })]),
    c('rear-flange', 'rear-flange', [0, 0, 0]),
    c('floor', 'floor', [0, 0, 0]),
    c('lid', 'lid', [0, 0, 0]),
    c('wall', 'side-wall', [`${side} * ${D.W / 2 - D.wall} - (1 - ${side}) / 2 * ${D.wall}`, 0, 0], { repeat: 2 }),
    c('bulkhead', 'bulkhead', [0, 0, 0]),
    c('front-wall', 'front-wall', [0, 0, 0]),
    c('bed', 'bed', [0, 0, 0]),
    c('motor', 'motor', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    c('nut', 'nut', nutAt, { rotate: alongY }),
    c('carriage', 'carriage', carriageAt),
    c('arm', 'arm', armAt, { repeat: 2, params: { side } }),
    // the arm pins: on the arms' own pivot holes, dropped to the lower link's bottom; they follow the arms
    { id: 'arm-pin', part: 'pin', repeat: 2, at: '@arm[i].pivot[0]', rotate: { align: '@arm[i].pivot[0]' }, offset: [0, 0, '-pinDropArm'] },
    // four spacers: i = 0 right-below, 1 right-above, 2 left-below, 3 left-above, between the arm faces and the links
    { id: 'spacer', part: 'spacer', repeat: 4, at: '@arm[floor(i / 2)].pivot[0]', rotate: { align: '@arm[floor(i / 2)].pivot[0]' }, offset: [0, 0, `-spacerL + (armT + spacerL) * (i - 2 * floor(i / 2))`] },
    // four links: i = 0 right-lower, 1 left-lower, 2 right-upper, 3 left-upper; from the arm pivot toward the slide pivot
    { id: 'link', part: 'link', repeat: 4, at: [`${side} * px`, 'yn + py', `lo + (hi - lo) * ${level}`], rotate: { axis: [0, 0, 1], deg: `phi + (180 - 2 * phi) * (1 - ${side}) / 2` } },
    // eight bushings: one per link eye, placed on the eye itself
    { id: 'bush', part: 'bushing', repeat: 8, at: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]', rotate: { align: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]' } },
    c('rail', 'rail', [0, 0, 0]),
    c('block', 'block', [`${side} * xf - blockL / 2`, 0, 0], { repeat: 2 }),
    // the slides: built for the right side; the left one is the same part turned 180° about Y (it is symmetric about z = 0)
    c('slide', 'slide', [`${side} * xf`, 0, 0], { repeat: 2, rotate: { axis: [0, 1, 0], deg: `90 * (1 - ${side})` } }),
    // the slide pins: on the slides' pin holes, dropped to the lower link's bottom
    { id: 'slide-pin', part: 'pin', repeat: 2, at: '@slide[i].pin[0]', rotate: { align: '@slide[i].pin[0]' }, offset: [0, 0, '-pinDropSlide'] },
    c('finger', 'finger', [`${side} * xf`, 0, 0], { repeat: 2, rotate: { axis: [0, 1, 0], deg: `90 * (1 - ${side})` }, reference: true }),
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    ...(stroke ? [
      { kind: 'screw', a: 'drivetrain/screw', b: 'carriage', lead: 'lead', axis: [0, 1, 0] },   // the physical joint
      // the nut is placed tilted (local +z = world +Y), and a fixed mate copies travel in the follower's own frame, so it gets its own screw mate along its local z
      { kind: 'screw', a: 'drivetrain/screw', b: 'nut', lead: 'lead', axis: [0, 0, 1] },
    ] : [fixed('nut', 'carriage')]),                                    // the flange on the carriage's rear face: an expected touch
    fixed('carriage', 'arm[0]'), fixed('carriage', 'arm[1]'),           // keyed into the slots; in the stroke document this carries the mate's travel
    fixed('slide-pin[0]', 'slide[0]'), fixed('slide-pin[1]', 'slide[1]'),   // press fits
    // the arm pins and spacers are placed by reference on the arms' holes and follow them; a fixed mate as well would carry the mate's travel twice
    ...(stroke ? [] : [fixed('arm-pin[0]', 'arm[0]'), fixed('arm-pin[1]', 'arm[1]'), fixed('spacer[0]', 'arm[0]'), fixed('spacer[1]', 'arm[0]'), fixed('spacer[2]', 'arm[1]'), fixed('spacer[3]', 'arm[1]')]),
    ...[0, 1, 2, 3].flatMap((k) => [fixed(`bush[${2 * k}]`, `link[${k}]`), fixed(`bush[${2 * k + 1}]`, `link[${k}]`)]),
    fixed('slide[0]', 'block[0]'), fixed('slide[1]', 'block[1]'),       // 4 × M3 from above
    fixed('finger[0]', 'slide[0]'), fixed('finger[1]', 'slide[1]'),     // the example fingers, on the tenons
    fixed('rail', 'bed'),                                               // 6 × M3 into the bed
    fixed('bed', 'floor'), fixed('bed', 'wall[0]'), fixed('bed', 'wall[1]'), fixed('bed', 'front-wall'), fixed('bed', 'bulkhead'),   // 4 × M3 into the floor; the wall stands on it
    fixed('rear-flange', 'floor'), fixed('rear-flange', 'lid'), fixed('rear-flange', 'wall[0]'), fixed('rear-flange', 'wall[1]'),   // the case: M3 countersunk, not drawn
    fixed('floor', 'wall[0]'), fixed('floor', 'wall[1]'), fixed('floor', 'front-wall'), fixed('lid', 'wall[0]'), fixed('lid', 'wall[1]'), fixed('lid', 'front-wall'),
    fixed('bulkhead', 'motor'), fixed('bulkhead', 'floor'),
  ];
  const partsMap = Object.fromEntries(Object.entries(parts).filter(([k]) => !(k in drivetrain.parts)).map(([k, v]) => [k, structuredClone(v)]));
  const o = pose(D.xpOpen), cl = pose(D.xpClosed);
  const turns = round((D.ynClosed - D.ynOpen) / D.lead, 3);
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: stroke ? 'gripper-stroke' : 'gripper',
    _: `Parallel-jaw robot gripper, v5, coaxial: ISO 9409-1-50-4-M6 flange → NEMA 17 pancake stepper with an integrated Tr8×${D.lead} screw → flange nut in a carriage that the housing aligns (skid on the bed, arm tips at the walls) → two pivot arms keyed into the carriage → four ${D.link} mm links on bronze bushings, one above and one below the mid-plane → two one-piece finger slides in the mid-plane, each on an MGN9 block on one rail lying on the bed beyond the front wall, each ending in a 16 × 12 tenon for the customer’s finger. The screw axis, the flange centre, the rail, the links’ plane of symmetry and the tenons share the line x = 0, z = 0. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, tenons to y = ${D.tenonY[1]}. ` + (stroke
      ? `The physical stroke: the screw is driven at ${D.rpm} rpm, a screw mate moves the carriage ${D.lead} mm per turn (y = ${round(o.yn, 2)} open → ${round(cl.yn, 2)} closed in ${turns} turns, ${round(turns * 60 / D.rpm, 1)} s), fixed mates carry the nut and the arms, and the links swing the slides in: the example jaws from ${2 * D.travel} mm apart to touching. Sweep with period ${round(turns * 60 / D.rpm, 1)} s; beyond it the nut runs on, as it would.`
      : `Demo cycle: the drive turns a reference clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 → ${turns} turns → 0, the nut moves forward by the lead to close (y = ${round(o.yn, 2)} open … ${round(cl.yn, 2)} closed), and the links swing the slides in: the example jaws from ${2 * D.travel} mm apart to touching. The example fingers are reference components.`),
    params, derived,
    parts: partsMap,
    components, mates,
    drive: stroke ? { component: 'drivetrain/screw', rpm: D.rpm } : { component: 'clock', rpm: D.rpm },
  };
}
D.strokeSeconds = round(((D.ynClosed - D.ynOpen) / D.lead) * 60 / D.rpm, 2);

// ── the force curve: what pivots cost ───────────────────────────────────────
export function forces() {
  return [0, 10, 20, 30, 2 * D.travel].map((w) => { const p = pose(D.xpClosed + w / 2); return { object_mm: w, link_deg: round(p.angle, 1), ratio: round(p.ratio, 2), finger_N: round((D.thrust / 2) * p.ratio, 0) }; });
}

// ── moments and friction ─────────────────────────────────────────────────────
// What the coaxial layout buys: every force in the mechanism acts in the
// plane z = 0 or in a pair symmetric about it, so the guide and the carriage
// see couples about Z only. The block's yaw couple is the one the customer's
// finger length sets; it is reported for a nominal tip at y = fingerTipY.
export function moments() {
  const F = forces()[1].finger_N; // the finger force gripping a 10 mm object
  const out = [];
  const yaw = F * (D.fingerTipY - D.pivotLine);                   // the tip ahead, the pin behind: a couple about Z, through the block
  out.push({ where: 'finger block (MGN9C)', kind: 'ball guide', roll_Nm: 0, pitch_Nm: 0, yaw_Nm: round(yaw / 1000, 2), note: `tip at y = ${D.fingerTipY} assumed; roll and pitch are zero because the pin, the links, the rail and the tenon are all on z = 0` });
  const eta = Math.tan(Math.atan(D.lead / (Math.PI * D.screw))) / Math.tan(Math.atan(D.lead / (Math.PI * D.screw)) + Math.atan(D.mu)); // screw efficiency, Tr8×2, μ 0.25
  const torque = (D.thrust * D.lead) / (2 * Math.PI * eta);       // N·mm to raise the thrust
  out.push({ where: 'carriage in the housing', kind: 'skid + arm tips', lateral_N: 0, couple_Nm: round(torque / 1000, 3), tip_N: round(torque / (2 * D.armHalf), 1), note: 'the links are symmetric about z = 0 and about x = 0, so the carriage sees thrust and the screw’s friction torque only; the torque is reacted at the arm tips on the side walls' });
  out.push({ where: 'link pins', kind: 'double shear', per_pin_N: round(2 * (D.thrust / 2) / Math.cos(Math.atan2(pose(D.xpClosed).x, pose(D.xpClosed).dy)), 0), note: 'each pin carries two links; Ø4 dowel, 6 mm bushings' });
  out.push({ where: 'v4 (for the record)', kind: 'rods + rail 16 above the axis', couple_Nm: round(D.thrust * 16 / 1000, 2), note: 'the couple the offset guide put on the carriage rods; zero in v5' });
  return out;
}

// ── analytic clearances ──────────────────────────────────────────────────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.W / 2 - D.wall;
  const r = D.linkW / 2;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut flange clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: carriage and arms 1 mm behind the slide tangs`, p.carFront + 1 <= D.tangY0, `${round(p.carFront)} + 1 ≤ ${D.tangY0}`);
    // the link's slide eye passes the carriage bosses (|x| ≤ bossHalf, sharing the links' z): the eye rim's lowest y over x ≤ bossHalf, 1 mm ahead of the carriage front
    const rim = xp - D.bossHalf < r ? D.pivotLine - Math.sqrt(r ** 2 - (xp - D.bossHalf) ** 2) : Infinity;
    ok(`xp ${xp}: link eye 1 mm ahead of the carriage bosses`, rim >= p.carFront + 1, `rim y ${round(rim)} ≥ ${round(p.carFront + 1)} at x ${D.bossHalf}`);
    ok(`xp ${xp}: link eyes inside the walls`, D.pivotX + r < inner, `${D.pivotX + r} < ${inner}`);
    ok(`xp ${xp}: slide tang inside the wall slot`, p.xf + D.tangX[0] >= D.wallSlotX[0] && p.xf + D.tangX[1] <= D.wallSlotX[1], `${p.xf + D.tangX[0]}..${p.xf + D.tangX[1]} in ${D.wallSlotX[0]}..${D.wallSlotX[1]}`);
    ok(`xp ${xp}: slide tang inside the walls`, p.xf + D.tangX[1] < inner, `${p.xf + D.tangX[1]} < ${inner}`);
    ok(`xp ${xp}: slides do not cross`, p.xf + D.tangX[0] > 0, `${p.xf + D.tangX[0]} > 0`);
    ok(`xp ${xp}: blocks on the rail`, p.xf + D.blockL / 2 <= D.frontW / 2, `${round(p.xf + D.blockL / 2)} ≤ ${D.frontW / 2}`);
    ok(`xp ${xp}: blocks do not collide`, p.xf - D.blockL / 2 > 0, `${round(p.xf - D.blockL / 2)} > 0`);
    ok(`xp ${xp}: example jaws do not cross`, p.xf + D.fingerX[0] >= -1e-9, `jaw at ${round(p.xf + D.fingerX[0])}`);
    ok(`xp ${xp}: link not near lock`, p.x / D.link < 0.95, `x/L = ${round(p.x / D.link, 3)}`);
  }
  ok('coaxial: flange centre, rail centre, slide mid-plane and links symmetric about z = 0', D.zc === 0 && (D.slideZ[0] + D.slideZ[1]) === 0 && (D.linkZ[0][0] + D.linkZ[1][1]) === 0 && (D.armZ0 + D.armT / 2) === 0, `zc ${D.zc}, slide ${D.slideZ}, links ${D.linkZ}, arm ${D.armZ0}..${D.armZ0 + D.armT}`);
  ok('the rail stack lands the block top on the slide underside', D.blockZ[1] === D.slideZ[0] && D.railZ[0] === D.bedZ[1], `block top ${D.blockZ[1]} = slide ${D.slideZ[0]}; rail on the bed at ${D.bedZ[1]}`);
  ok('links 1 mm clear of the arms, the slides and the carriage waist', D.linkZ[1][0] - D.slideZ[1] >= 1 && D.linkZ[1][0] - D.midZ[1] >= 1 && D.linkZ[1][0] - (D.armZ0 + D.armT) === D.spacerL, `${D.linkZ[1][0]} vs slide ${D.slideZ[1]}, waist ${D.midZ[1]}, arm ${D.armZ0 + D.armT} + spacer ${D.spacerL}`);
  ok('pins span both links', D.linkZ[0][0] + D.pinLen === D.linkZ[1][1], `${D.pinLen}`);
  ok('arm keys into the carriage slot', D.armX0 > D.slotX[0] && D.armHalf > D.slotX[1] && D.armT / 2 < D.slotZ && D.slotZ < D.midZ[1] - 1.5, `arm x ${D.armX0}.., z ±${D.armT / 2} in slot ${D.slotX} × ±${D.slotZ}; waist wall ${round(D.midZ[1] - D.slotZ)}`);
  ok('arm tips and bed inside the walls', D.armHalf < inner && D.bedHalfIn < inner, `${D.armHalf}, ${D.bedHalfIn} < ${inner}`);
  ok('carriage skid on the bed, its bosses clear of the bed', D.skidZ[0] > D.bedZ[1] && D.skidZ[0] - D.bedZ[1] <= 0.3, `${D.skidZ[0]} over ${D.bedZ[1]}`);
  ok('skid between the bed windows', D.skidHalf + 2 <= D.bedWinX[0], `${D.skidHalf} + 2 ≤ ${D.bedWinX[0]}`);
  ok('bed ahead of the bulkhead, on the floor', D.bedY[0] > D.motorY + D.motorLen + D.bulkheadT && D.bedZ[0] === D.zBot + D.wall, `${D.bedY[0]} > ${D.motorY + D.motorLen + D.bulkheadT}; z ${D.bedZ[0]}`);
  ok('bed bolts inside the bed and the floor, clear of the windows', D.bedBoltX + D.bedBolt / 2 + 1.5 <= D.bedHalfIn && D.bedBoltX - D.bedBolt / 2 - 1.5 >= D.bedWinX[1] && D.bedBoltY[1] + D.bedBolt / 2 < D.frontY, `x ${D.bedBoltX}, y ${D.bedBoltY}`);
  ok('nut flange and collar clear of the bed', -D.flange / 2 > D.bedZ[1] && -D.collarD / 2 > D.bedZ[1], `${-D.flange / 2}, ${-D.collarD / 2} > ${D.bedZ[1]}`);
  ok('nut flange seated: bosses reach it, bolts inside them', D.bossZ[1] >= D.flange / 2 && D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2 < D.bossHalf, `boss to ${D.bossZ[1]} ≥ ${D.flange / 2}; bolt to ${round(D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2)} < ${D.bossHalf}`);
  ok('carriage slots clear the nut bolts', D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2) >= 1.5, `${round(D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2))} ≥ 1.5`);
  ok('front wall stands on the bed, under the lid', D.bedZ[1] < 0 && D.zTop - D.wall > D.linkZ[1][1] + 1, `wall from ${D.bedZ[1]}; links to ${D.linkZ[1][1]} under the lid at ${D.zTop - D.wall}`);
  ok('slide passes the wall slot, its fillet outside the wall', D.slideZ[1] < D.wallSlotZ && D.tangY0 < D.frontY && D.plateY[0] - D.fillet >= D.frontY + D.frontT + 0.5, `±${D.slideZ[1]} in ±${D.wallSlotZ}; tang from ${D.tangY0}, fillet from ${D.plateY[0] - D.fillet} ≥ ${D.frontY + D.frontT + 0.5}`);
  ok('wall slots clear the screw bearing', D.wallSlotX[0] - D.endBore / 2 >= 2, `wall ${round(D.wallSlotX[0] - D.endBore / 2)} ≥ 2`);
  ok('journal spans the front wall, screw ends inside it', D.screwEnd - D.journalLen <= D.frontY && D.screwEnd < D.frontY + D.frontT, `${D.screwEnd - D.journalLen} ≤ ${D.frontY}; end ${D.screwEnd} < ${D.frontY + D.frontT}`);
  ok('block beyond the wall, under the plate', D.blockY[0] > D.frontY + D.frontT && D.plateY[0] <= D.blockY[0] && D.plateY[1] >= D.blockY[1], `block y ${D.blockY}, plate y ${D.plateY}`);
  ok('block bolts inside the plate', D.blockYc - D.blockPattern[1] / 2 - D.blockBolt / 2 - D.plateY[0] >= 1 && D.plateY[1] - D.blockYc - D.blockPattern[1] / 2 - D.blockBolt / 2 >= 1 && D.plateHalf - D.blockPattern[0] / 2 - D.blockBolt / 2 >= 1, `y ${D.blockYc - D.blockPattern[1] / 2}, ${D.blockYc + D.blockPattern[1] / 2} in ${D.plateY}; x ±${D.blockPattern[0] / 2} in ±${D.plateHalf}`);
  ok('slide pin inside the tang', -D.pinInset - D.pin / 2 - D.tangX[0] >= D.pin && D.tangX[1] + D.pinInset - D.pin / 2 >= D.pin && D.pivotLine - D.pin / 2 - D.tangY0 >= D.pin, `edges ${-D.pinInset - D.pin / 2 - D.tangX[0]}, ${D.tangX[1] + D.pinInset - D.pin / 2}, ${D.pivotLine - D.pin / 2 - D.tangY0} ≥ ${D.pin}`);
  ok('slide-side link eyes behind the front wall', D.pivotLine + r < D.frontY, `${D.pivotLine + r} < ${D.frontY}`);
  ok('tenon cross hole inside the tenon', (D.tenonY[1] - D.tenonY[0]) / 2 - D.tenonHole / 2 >= 2 && D.tenonHalf - D.tenonHole / 2 >= 2, `${(D.tenonY[1] - D.tenonY[0]) / 2 - D.tenonHole / 2}, ${D.tenonHalf - D.tenonHole / 2} ≥ 2`);
  ok('fillets fit their corners', D.fillet <= D.plateHalf - D.tangX[1] && D.tenonFillet <= D.plateHalf - D.tenonHalf, `${D.fillet} ≤ ${D.plateHalf - D.tangX[1]}; ${D.tenonFillet} ≤ ${D.plateHalf - D.tenonHalf}`);
  ok('example pocket fits the tenon', D.pocketW > 2 * D.tenonHalf && D.pocketD > D.tenonL && D.fingerHalfZ > D.slideZ[1], `${D.pocketW} × ${D.pocketD} over ${2 * D.tenonHalf} × ${D.tenonL}`);
  ok('example jaws meet at x = 0 when closed', D.xpClosed + D.pinInset + D.fingerX[0] === 0, `${D.xpClosed + D.pinInset + D.fingerX[0]}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('collar ahead of the bulkhead', D.collarY >= D.motorY + D.motorLen + D.bulkheadT, `${D.collarY}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ${round(D.zc - 17.68 - 3.3)} … ${round(D.zc + 17.68 + 3.3)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('rail taps inside the bed, beyond the wall', D.railTapX[4] + D.railTap / 2 + 1 < D.bedHalfOut && D.blockYc - D.railTap / 2 > D.frontY + D.frontT, `x to ${D.railTapX[4]}, y ${D.blockYc}`);
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
const filletAdd = (rr) => rr ** 2 * (1 - Math.PI / 4); // material a concave fillet adds inside a square corner
export const expected = {
  _: 'Closed-form volumes of the parts that have one; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  bulkhead: { volume: ((D.W - 2 * D.wall - 1) * (D.zTop - D.zBot - 2 * D.wall - 1) - A * D.pilot ** 2 - 4 * A * D.bolt ** 2) * D.bulkheadT, tol: 0.002 },
  'front-wall': { volume: (D.frontW * (D.zTop - D.bedZ[1]) - A * D.endBore ** 2 - 2 * (D.wallSlotX[1] - D.wallSlotX[0]) * 2 * D.wallSlotZ) * D.frontT, tol: 0.002 },
  bed: { volume: (2 * D.bedHalfIn * (D.frontY - D.bedY[0]) + 2 * D.bedHalfOut * (D.bedY[1] - D.frontY) - 2 * (D.bedWinX[1] - D.bedWinX[0]) * (D.bedWinY[1] - D.bedWinY[0]) - 4 * A * D.bedBolt ** 2 - 5 * A * D.railTap ** 2) * (D.bedZ[1] - D.bedZ[0]), tol: 0.002 },
  carriage: { volume: (2 * D.skidHalf * (D.skidZ[1] - D.skidZ[0]) + 2 * D.bossHalf * (D.bossZ[1] - D.bossZ[0]) + 2 * (D.midHalf - D.bossHalf) * 2 * D.midZ[1] - 2 * (D.slotX[1] - D.slotX[0]) * 2 * D.slotZ - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * D.carT, tol: 0.002 },
  arm: { volume: ((D.armHalf - D.armX0) * D.carT - A * D.pin ** 2) * D.armT, tol: 0.002 },
  spacer: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.spacerL, tol: 0.004 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.004 },
  pin: { volume: A * D.pin ** 2 * D.pinLen, tol: 0.004 },
  slide: { volume: ((D.tangX[1] - D.tangX[0]) * (D.plateY[0] - D.tangY0) + 2 * D.plateHalf * (D.plateY[1] - D.plateY[0]) + 2 * D.tenonHalf * D.tenonL + filletAdd(D.fillet) + 2 * filletAdd(D.tenonFillet) - A * D.pin ** 2 - A * D.tenonHole ** 2 - 4 * A * D.blockBolt ** 2) * (D.slideZ[1] - D.slideZ[0]), tol: 0.002 },
  finger: { volume: ((D.fingerX[1] - D.fingerX[0]) * D.fingerL - D.pocketW * D.pocketD) * 2 * D.fingerHalfZ, tol: 0.002 },
  rail: { volume: D.railW * D.railH * D.frontW, tol: 0.002 },
  block: { volume: (D.blockW * (D.blockZ[1] - D.blockZ[0]) - D.blockChannelW * D.blockChannelH) * D.blockL, tol: 0.002 },
  collar: { volume: A * (D.collarD ** 2 - D.screw ** 2) * D.collarL, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen - D.journalLen) + A * D.journal ** 2 * D.journalLen, tol: 0.004 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  floor: { volume: (D.W * (D.frontY + D.frontT - D.rearT) - 4 * A * D.floorTap ** 2) * D.wall, tol: 0.002 },
  'side-wall': { volume: (D.frontY - D.rearT) * (D.zTop - D.zBot - 2 * D.wall) * D.wall, tol: 0.002 },
  lid: { volume: (D.W * (D.frontY - D.rearT) - (D.W - 2 * D.wall - 16) * (D.frontY - 8 - (D.ynOpen - 6))) * D.wall, tol: 0.002 },
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
  fs.writeFileSync(path.join(out, 'gripper-stroke.json'), JSON.stringify(assembly('stroke'), null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
  console.table([D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen].map((xp) => { const p = pose(xp); return { finger_pivot_x: xp, block_x: p.xf, nut_y: round(p.yn), link_deg: round(p.angle, 1), jaw_gap: p.gap, carriage_front_y: round(p.carFront) }; }));
  console.table(forces());
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm, bed to y = ${D.bedY[1]}, tenons to y = ${D.tenonY[1]}; nut stroke ${round(D.ynClosed - D.ynOpen)} mm = ${round((D.ynClosed - D.ynOpen) / D.lead, 1)} turns of Tr8×${D.lead} for ${D.travel} mm of finger; one grip cycle per clock turn (${60 / D.rpm} s at rpm ${D.rpm}); the physical stroke ${D.strokeSeconds} s.`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
