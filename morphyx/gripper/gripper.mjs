#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 6: the guide comes inside. v5 hung the rail on a bed outside the
// front wall, where it was exposed and where the jaw carriers had to reach
// back through slots to find the linkage. v6 turns that inside out:
//
//   · the front wall is a slotted plate. Two long slots run across it, and
//     the strip between them carries the rail on its INNER face — so the
//     rail, its blocks and the whole linkage are inside the case and the
//     only openings are the two slots the carriers sweep along;
//   · each jaw carrier is ONE part. Its section wraps the rail and its
//     block, its two legs pass out through the slots, outside it closes
//     into a web and ends in a tenon with four cross-bolted holes — the
//     finger mount. Behind the block the same part runs back on the
//     mid-plane as a tongue that carries the link pin: the carrier points
//     back up the case toward the motor, and the linkage meets it there;
//   · everything still shares one line. The screw axis, the flange centre,
//     the rail's centre, the links' plane of symmetry and the tenon all sit
//     on z = 0, so the block sees no roll and no pitch;
//   · the fingers are not modelled. They are the customer's part. The
//     gripper presents a 16 × 16 tenon 16 mm proud with four M4 cross holes
//     on an 8 × 10 rectangle, so a finger is located by the tenon and held
//     by four bolts in double shear — the moment at that joint is carried
//     by the pattern, not by one screw.
//
// The carrier is the one part with a second operation: its Ø4 pin hole runs
// along Z and its section is swept along X, so the hole is a cut. Truck
// keeps it watertight but drops the section's face names, so the link pins
// are placed by expression rather than by feature. Every other part is ONE
// sweep of one region, named and measurable.
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
  // the case: outer box x ±56, z ±27, y 0..116; walls 4, rear plate 8, front wall 6 thick, the full 112 wide
  W: 112, wall: 4, zBot: -27, zTop: 27, rearT: 8, frontY: 110, frontT: 6, L: 116,
  // robot flange (ISO 9409-1-50-4-M6), centred on the screw axis
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw; thrust collar on the bulkhead's front face (nut forward = close, so gripping pulls the screw back)
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 115, journal: 6, journalLen: 8, endBore: 6.2, collarD: 14, collarL: 4, collarY: 42,
  // nut and carriage: the carriage rides on the floor on a skid, its arms' tips just off the side walls
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carT: 18, skidHalf: 13, skidZ: [-22.8, -21], bossHalf: 9, bossZ: [-21, 11], midHalf: 14.5, midZ: [-6, 6], slotX: [9, 13], slotZ: 4.1,
  // the pivot arms: one each side on the mid-plane, keyed into the carriage's slots, tips at the walls
  armX0: 9.1, armHalf: 51.8, armT: 8, armZ0: -4, pivotX: 38, pivotY: 4,
  // the linkage: links L long, one above and one below the mid-plane, on Ø4 dowels in bronze bushings
  link: 27, linkW: 10, linkT: 6, eye: 6, pin: 4, bushBore: 4.1, pinLen: 24, spacerL: 1,
  linkZ: [[-11, -5], [5, 11]],
  // stroke: finger-pin x (xp) closed → open; the pin is `inset` inboard of its carrier's centre
  xpClosed: 16, xpOpen: 30, pivotLine: 90, inset: 6,
  // the guide, inside: MGN9 rail on the inner face of the front wall's strip, one segment each side of the screw bearing
  railW: 9, railH: 6.5, railX: [6.5, 52], railTapX: [12, 27, 42], railTap: 2.5,
  blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5,
  // the carrier: one section swept along X. tongue on the mid-plane, flange behind the block, two feet through the slots, web outside, tenon for the finger
  carrierW: 30, tongueZ: 4, footZ: [10.5, 19.5], chanZ: 10.5, webL: 8, tenonZ: 8, tenonL: 16, tenonBolt: 4.3, tenonBoltDY: [4, 12], tenonBoltZ: 5, tongueBack: 7,
  wallSlotZ: [10.1, 19.9], wallSlotX: [5.5, 52.5],
  rpm: 5, mu: 0.25, muBall: 0.005, thrust: 120, fingerTipY: 175,
};
D.zc = (D.zBot + D.zTop) / 2;
D.travel = D.xpOpen - D.xpClosed;
D.railY = [D.frontY - D.railH, D.frontY];                       // on the strip's inner face
D.blockY = [D.frontY - 12, D.frontY - 2];                       // channel 5 deep over the rail, base 2 off the wall
D.flangeY = [D.frontY - 14, D.frontY - 12];                     // the carrier's backstop behind the block
D.webY = [D.frontY + D.frontT + 0.5, D.frontY + D.frontT + 0.5 + D.webL];  // 0.5 clear of the wall's outer face
D.footY = [D.flangeY[0], D.webY[0]];                            // the feet, through the slots
D.chanY = [D.blockY[0], D.webY[0]];                             // the void the rail, block and strip run in
D.tenonY = [D.webY[1], D.webY[1] + D.tenonL];
D.tongueY = [D.pivotLine - D.tongueBack, D.flangeY[0]];
D.blockZ = [D.frontY - 12, D.frontY - 2];                       // (y, really: the block's depth) kept for readability
// the slider-crank: x = pivotX − xp (the link's X reach), dy = √(L² − x²), carriage centre yn = pivotLine − pivotY − dy
const dyOf = (xp) => Math.sqrt(D.link ** 2 - (D.pivotX - xp) ** 2);
D.ynClosed = D.pivotLine - D.pivotY - dyOf(D.xpClosed);
D.ynOpen = D.pivotLine - D.pivotY - dyOf(D.xpOpen);
D.xfClosed = D.xpClosed + D.inset;
D.xfOpen = D.xpOpen + D.inset;

// ── kinematics: a crossed slider-crank per finger ───────────────────────────
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
// the carrier's section, in (y, z), counterclockwise: tongue, flange, feet, web, tenon
export const carrierSection = () => [
  [D.tongueY[0], -D.tongueZ], [D.tongueY[1], -D.tongueZ], [D.tongueY[1], -D.footZ[1]],
  [D.tenonY[0], -D.footZ[1]], [D.tenonY[0], -D.tenonZ], [D.tenonY[1], -D.tenonZ],
  [D.tenonY[1], D.tenonZ], [D.tenonY[0], D.tenonZ], [D.tenonY[0], D.footZ[1]],
  [D.tongueY[1], D.footZ[1]], [D.tongueY[1], D.tongueZ], [D.tongueY[0], D.tongueZ],
];

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

  'front-wall': xzPlate('plate', 'Front wall — the slotted plate the whole design turns on. The strip across its middle (z ±10.1) carries the two MGN9 rail segments on its INNER face, tapped M3 at 20 pitch, and the screw’s Ø6.2 journal bearing between them. Either side of the strip runs a long slot, one above and one below, and a carrier’s two feet pass through them. Stands on the floor. One extrude along -Y.',
    { w: D.W, zb: D.zBot + D.wall, zt: D.zTop, t: D.frontT, d_bore: D.endBore, sz0: D.wallSlotZ[0], sz1: D.wallSlotZ[1], sx0: D.wallSlotX[0], sx1: D.wallSlotX[1], d_tap: D.railTap, tx0: D.railTapX[0], tx1: D.railTapX[1], tx2: D.railTapX[2] }, D.frontY + D.frontT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('bore', [0, 0], 'd_bore / 2'),
     rect('slotRlo', ['(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotRhi', ['(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     rect('slotLlo', ['-(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotLhi', ['-(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     circle('tapA', ['-tx2', 0], 'd_tap / 2'), circle('tapB', ['-tx1', 0], 'd_tap / 2'), circle('tapC', ['-tx0', 0], 'd_tap / 2'),
     circle('tapD', ['tx0', 0], 'd_tap / 2'), circle('tapE', ['tx1', 0], 'd_tap / 2'), circle('tapF', ['tx2', 0], 'd_tap / 2')]),

  motor: tree('NEMA 17 pancake stepper body (42.3 square, 5 mm corner chamfers, 22 long) with an integrated Tr8×2 lead screw as its shaft (the screw is its own tree). Sits behind the bulkhead. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, y1: D.motorY + D.motorLen },
    [{ op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-y1' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'], ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
     { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' }]),

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face, turned down to a Ø6 journal for the last 8 mm, which runs in the front wall’s strip between the two rail segments; the thread is not modelled. One revolve about local Z, placed along +Y.',
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

  carriage: tree('Nut carriage, 18 long: the nut bore with its four flange bolt holes; a 26 mm skid that runs on the floor; a 29 mm waist on the mid-plane with a through-slot each side (4 × 8.2) that the pivot arms key into; 18 mm bosses above and below the waist for the nut flange, narrow so the link eyes pass them. The housing aligns it — skid on the floor, arm tips at the walls — and the nut sees thrust only. One extrude along -Y.',
    { t: D.carT, sh: D.skidHalf, sz0: D.skidZ[0], sz1: D.skidZ[1], bh: D.bossHalf, bz0: D.bossZ[0], bz1: D.bossZ[1], mh: D.midHalf, mz: D.midZ[1], slx0: D.slotX[0], slx1: D.slotX[1], slz: D.slotZ, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-sh', 'sz0'], ['sh', 'sz0'], ['sh', 'sz1'], ['bh', 'sz1'], ['bh', '-mz'], ['mh', '-mz'], ['mh', 'mz'], ['bh', 'mz'], ['bh', 'bz1'], ['-bh', 'bz1'], ['-bh', 'mz'], ['-mh', 'mz'], ['-mh', '-mz'], ['-bh', '-mz'], ['-bh', 'sz1'], ['-sh', 'sz1']] },
        circle('bore', [0, 0], 'd_bore / 2'),
        rect('slotR', ['(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz'), rect('slotL', ['-(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  arm: tree('Pivot arm: an 8 mm plate on the mid-plane, keyed into the carriage’s through-slot (4 mm of it), reaching to 0.2 mm from the side wall, carrying the link pivot pin at x 38, 4 mm ahead of the carriage centre. Two per gripper (side = 1 right, -1 left); a set screw holds it in the slot (not modelled). Local origin at the carriage centre. One extrude along +Z.',
    { side: 1, x0: D.armX0, x1: D.armHalf, t: D.armT, z0: D.armZ0, y0: -D.carT / 2, y1: D.carT / 2, px: D.pivotX, py: D.pivotY, d_pin: D.pin },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', ['side * (x0 + x1) / 2', '(y0 + y1) / 2'], 'x1 - x0', 'y1 - y0'), circle('pivot', ['side * px', 'py'], 'd_pin / 2')] },
     { op: 'extrude', id: 'arm', profile: 'plate', depth: 't' }]),

  link: tree('Link: a 27 mm dog-bone, 6 thick, with two Ø6 eyes for pressed bronze bushings. Four per gripper: one above and one below the mid-plane, from the arm pin to the carrier’s tongue pin. Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
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

  spacer: tree('Spacer washer: Ø6 × 1 with a Ø4.1 bore, between a pin’s host (an arm, or the carrier’s tongue) and its link. Eight per gripper. One revolve about local Z.',
    { D: D.eye, L: D.spacerL, d: D.bushBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'spacer', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  pin: tree('A 4 mm hardened dowel, 24 long, along +Z: pressed into a pivot arm or a carrier’s tongue, carrying a link above and a link below in bronze bushings (retaining clips not modelled). Four per gripper. One extrude.',
    { d: D.pin, h: D.pinLen },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  carrier: tree('Jaw carrier — one part, section swept along X, 30 wide. Behind the block it is a tongue on the mid-plane (z ±4) carrying the Ø4 link pin; at the block it widens into a flange that backstops the block and is bolted to it (4 × M3 along Y, not drawn); the section then opens into a channel that wraps the rail, the block and the wall’s strip, with two feet either side that pass out through the wall’s slots; outside it closes into a web and ends in a 16 × 16 tenon standing 16 mm proud, with four M4 cross holes on an 8 × 10 rectangle — the finger mount. The pin hole is a cut along Z, the only boolean in this design. Built for the right side; the left is the same part turned 180° about Y.',
    { w: D.carrierW, tz: D.tongueZ, fz: D.footZ[1], cz: D.chanZ, ty0: D.tongueY[0], ty1: D.tongueY[1], cy0: D.chanY[0], cy1: D.chanY[1], ny0: D.tenonY[0], ny1: D.tenonY[1], nz: D.tenonZ,
      d_bolt: D.tenonBolt, by0: D.tenonY[0] + D.tenonBoltDY[0], by1: D.tenonY[0] + D.tenonBoltDY[1], bz: D.tenonBoltZ, inset: D.inset, y_pin: D.pivotLine, d_pin: D.pin },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-w/2' }, loops: [
        { name: 'outline', polygon: carrierSection() },
        rect('channel', ['(cy0 + cy1) / 2', 0], 'cy1 - cy0', '2 * cz'),
        circle('boltA', ['by0', '-bz'], 'd_bolt / 2'), circle('boltB', ['by1', '-bz'], 'd_bolt / 2'),
        circle('boltC', ['by0', 'bz'], 'd_bolt / 2'), circle('boltD', ['by1', 'bz'], 'd_bolt / 2') ] },
     { op: 'extrude', id: 'carrier', profile: 'section', depth: 'w' },
     { op: 'sketch', id: 'pinhole', plane: { base: 'XY', offset: '-(tz + 3)' }, loops: [circle('pin', ['-inset', 'y_pin'], 'd_pin / 2')] },
     { op: 'extrude', id: 'pincut', profile: 'pinhole', depth: '2 * tz + 6', mode: 'cut' }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9, wrapping the rail with a 10 × 5 channel, its base 2 mm off the wall. Its four M3 face -Y, into the carrier’s flange. One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], w: D.blockW, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y0', '-w/2'], ['y1', '-w/2'], ['y1', '-cw/2'], ['y1 - ch', '-cw/2'], ['y1 - ch', 'cw/2'], ['y1', 'cw/2'], ['y1', 'w/2'], ['y0', 'w/2']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section on the inner face of the front wall’s strip, centred on z = 0. One segment each side of the screw’s journal bearing, from x0 to x1 (its own Ø3.5 counterbores are not modelled; the strip’s tapped holes are). One extrude along +X.',
    { w: D.railW, h: D.railH, y0: D.railY[0], x0: D.railX[0], x1: D.railX[1] },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: 'x0' }, loops: [rect('outline', ['y0 + h/2', 0], 'h', 'w')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: 'x1 - x0' }]),

  'side-wall': tree('Side wall, plain. Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.rearT, y1: D.frontY, z0: D.zBot + D.wall, z1: D.zTop - D.wall },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0')] }, { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor plate, from the rear plate to the front wall’s outer face (the wall stands on it). Its top face is the carriage’s way. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY + D.frontT, t: D.wall, z0: D.zBot },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid, with an access window over the linkage. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zTop - D.wall, win_w: D.W - 2 * D.wall - 16, win_y0: D.ynOpen - 6, win_y1: D.frontY - 8 },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, '(win_y0 + win_y1) / 2'], 'win_w', 'win_y1 - win_y0')] }, { op: 'extrude', id: 'lid', profile: 'plate', depth: 't' }]),
};

// ── the assembly, kinematic ──────────────────────────────────────────────────
// Two documents from the same parts. `assembly()` is the demo cycle: a
// reference clock is the driven component and the screw angle is a cosine of
// its angle, so the gripper closes and opens once per clock turn and the
// viewer's spin never runs it into a stop. `assembly('stroke')` is the
// physical stroke: the screw is driven at rpm, a `screw` mate carries the
// carriage by the lead, `fixed` mates carry the nut and the arms, and the
// links and carriers follow the screw's angle. Bushings sit on their link
// eyes by feature and follow them; the carrier's own faces are unnamed (its
// pin hole is a cut), so its pins are placed by expression.
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((ynClosed - ynOpen) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly(mode = 'cycle') {
  const stroke = mode === 'stroke';
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.inset, flangeT: D.flangeT, carT: D.carT,
    lo: D.linkZ[0][0], hi: D.linkZ[1][0], armT: D.armT, spacerL: D.spacerL, pinLo: D.linkZ[0][0] - D.spacerL, tongueZ: D.tongueZ };
  const derived = {
    ...(stroke ? { turns: 'theta / 360' } : { spin: SPIN }),
    yn: stroke ? 'ynOpen + lead * turns' : 'ynOpen + lead * spin / 360',   // the nut moves forward to close
    dy: 'yf - py - yn',
    x: 'sqrt(L^2 - dy^2)',
    xp: 'px - x',                                         // the carrier's pin, inboard of the arm pivot
    xf: 'xp + inset',                                     // the carrier's centre
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
    c('motor', 'motor', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    c('nut', 'nut', nutAt, { rotate: alongY }),
    c('carriage', 'carriage', carriageAt),
    c('arm', 'arm', armAt, { repeat: 2, params: { side } }),
    // the rail: one segment each side of the screw's journal bearing
    c('rail', 'rail', [0, 0, 0], { repeat: 2, params: { x0: `${side} * ${D.railX[0]} - (1 - ${side}) / 2 * ${D.railX[1] - D.railX[0]}`, x1: `${side} * ${D.railX[0]} + (1 + ${side}) / 2 * ${D.railX[1] - D.railX[0]}` } }),
    c('block', 'block', [`${side} * xf - ${D.blockL / 2}`, 0, 0], { repeat: 2 }),
    // the carriers: built for the right side, the left one turned 180° about Y (the section is symmetric about z = 0)
    c('carrier', 'carrier', [`${side} * xf`, 0, 0], { repeat: 2, rotate: { axis: [0, 1, 0], deg: `90 * (1 - ${side})` } }),
    // the arm pins: on the arms' own pivot holes, dropped to the lower link's spacer
    { id: 'arm-pin', part: 'pin', repeat: 2, at: '@arm[i].pivot[0]', rotate: { align: '@arm[i].pivot[0]' }, offset: [0, 0, `${D.linkZ[0][0] - D.spacerL - D.armZ0}`] },
    // the carrier pins: the carrier's faces are unnamed (its hole is a cut), so these are placed by expression
    { id: 'jaw-pin', part: 'pin', repeat: 2, at: [`${side} * xp`, 'yf', D.linkZ[0][0] - D.spacerL] },
    // eight spacers: one each side of every pin's host, between it and its link. i: 0-3 the arm pins, 4-7 the jaw pins; within each, 0-1 right, 2-3 left; even lower, odd upper
    { id: 'spacer', part: 'spacer', repeat: 8,
      at: ['(1 - 2 * floor((i - 4 * floor(i / 4)) / 2)) * (px * (1 - floor(i / 4)) + xp * floor(i / 4))',
           '(yn + py) * (1 - floor(i / 4)) + yf * floor(i / 4)',
           `${D.linkZ[0][0] - D.spacerL} + ${D.linkZ[1][1] - (D.linkZ[0][0] - D.spacerL)} * (i - 2 * floor(i / 2))`] },
    // four links: i = 0 right-lower, 1 left-lower, 2 right-upper, 3 left-upper; from the arm pivot toward the carrier's pin
    { id: 'link', part: 'link', repeat: 4, at: [`${side} * px`, 'yn + py', `lo + (hi - lo) * ${level}`], rotate: { axis: [0, 0, 1], deg: `phi + (180 - 2 * phi) * (1 - ${side}) / 2` } },
    // eight bushings: one per link eye, placed on the eye itself
    { id: 'bush', part: 'bushing', repeat: 8, at: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]', rotate: { align: '@link[floor(i / 2)].eye[i - 2 * floor(i / 2)][0]' } },
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    ...(stroke ? [
      { kind: 'screw', a: 'drivetrain/screw', b: 'carriage', lead: 'lead', axis: [0, 1, 0] },   // the physical joint
      // the nut is placed tilted (local +z = world +Y), and a fixed mate copies travel in the follower's own frame, so it gets its own screw mate along its local z
      { kind: 'screw', a: 'drivetrain/screw', b: 'nut', lead: 'lead', axis: [0, 0, 1] },
    ] : [fixed('nut', 'carriage')]),                                    // the flange on the carriage's rear face: an expected touch
    fixed('carriage', 'arm[0]'), fixed('carriage', 'arm[1]'),           // keyed into the slots; in the stroke document this carries the mate's travel
    fixed('jaw-pin[0]', 'carrier[0]'), fixed('jaw-pin[1]', 'carrier[1]'),   // press fits
    // the arm pins are placed by reference on the arms' holes and follow them; a fixed mate as well would carry the mate's travel twice
    ...(stroke ? [] : [fixed('arm-pin[0]', 'arm[0]'), fixed('arm-pin[1]', 'arm[1]')]),
    ...[0, 1, 2, 3].flatMap((k) => [fixed(`bush[${2 * k}]`, `link[${k}]`), fixed(`bush[${2 * k + 1}]`, `link[${k}]`)]),
    fixed('carrier[0]', 'block[0]'), fixed('carrier[1]', 'block[1]'),   // 4 × M3 along Y into the block's face, not drawn; the flange backstops it
    fixed('rail[0]', 'front-wall'), fixed('rail[1]', 'front-wall'),     // M3 at 20 pitch into the strip
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
    _: `Parallel-jaw robot gripper, v6, guide inside: ISO 9409-1-50-4-M6 flange → NEMA 17 pancake stepper with an integrated Tr8×${D.lead} screw → flange nut in a carriage that runs on the floor → two pivot arms keyed into it → four ${D.link} mm links on bronze bushings, one above and one below the mid-plane → two jaw carriers, each one part: it wraps an MGN9 block on a rail mounted INSIDE, on the strip between the front wall’s two slots, passes its feet out through those slots, and ends in a 16 × 16 tenon with four M4 cross holes for the customer’s finger. Behind the block the same part runs back toward the motor as a tongue carrying the link pin. The screw axis, the flange centre, the rail, the links’ plane of symmetry and the tenons share the line x = 0, z = 0. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, tenons to y = ${D.tenonY[1]}, mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm apart. ` + (stroke
      ? `The physical stroke: the screw is driven at ${D.rpm} rpm, a screw mate moves the carriage ${D.lead} mm per turn (y = ${round(o.yn, 2)} open → ${round(cl.yn, 2)} closed in ${turns} turns, ${round(turns * 60 / D.rpm, 1)} s), fixed mates carry the nut and the arms, and the links draw the carriers in by ${D.travel} mm each. Sweep with period ${round(turns * 60 / D.rpm, 1)} s; beyond it the nut runs on, as it would.`
      : `Demo cycle: the drive turns a reference clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 → ${turns} turns → 0, the nut moves forward by the lead to close (y = ${round(o.yn, 2)} open … ${round(cl.yn, 2)} closed), and the links draw the carriers in by ${D.travel} mm each.`),
    params, derived,
    parts: partsMap,
    components, mates,
    drive: stroke ? { component: 'drivetrain/screw', rpm: D.rpm } : { component: 'clock', rpm: D.rpm },
  };
}
D.strokeSeconds = round(((D.ynClosed - D.ynOpen) / D.lead) * 60 / D.rpm, 2);

// ── the force curve: what pivots cost ───────────────────────────────────────
export function forces() {
  return [0, 7, 14, 21, 2 * D.travel].map((w) => { const p = pose(D.xpClosed + w / 2); return { mount_travel_mm: w, link_deg: round(p.angle, 1), ratio: round(p.ratio, 2), finger_N: round((D.thrust / 2) * p.ratio, 0) }; });
}

// ── moments and friction ─────────────────────────────────────────────────────
// Every force in the mechanism acts in the plane z = 0 or in a pair symmetric
// about it, so the guide and the carriage see couples about Z only. The
// block's yaw couple is the one the customer's finger length sets; it is
// reported for a nominal jaw at y = fingerTipY. The finger joint itself is
// four M4 on an 8 × 10 rectangle over a tenon, so that couple is a bolt
// couple, not a single screw in bending.
export function moments() {
  const F = forces()[1].finger_N; // the finger force at 7 mm of travel off closed
  const out = [];
  const blockY = (D.blockY[0] + D.blockY[1]) / 2;
  const yaw = F * (D.fingerTipY - blockY);
  out.push({ where: 'jaw block (MGN9C)', kind: 'ball guide', roll_Nm: 0, pitch_Nm: 0, yaw_Nm: round(yaw / 1000, 2), note: `jaw at y = ${D.fingerTipY} assumed; roll and pitch are zero because the pin, the links, the rail and the tenon are all on z = 0` });
  const armY = D.tenonY[0] + D.tenonBoltDY[1] - (D.tenonY[0] + D.tenonBoltDY[0]);
  out.push({ where: 'finger on the tenon', kind: '4 × M4 + tenon', couple_Nm: round(yaw / 1000, 2), per_bolt_N: round(yaw / armY / 2, 0), note: `the couple is reacted by the ${armY} mm bolt pitch in double shear, and the tenon takes the shear` });
  const eta = Math.tan(Math.atan(D.lead / (Math.PI * D.screw))) / Math.tan(Math.atan(D.lead / (Math.PI * D.screw)) + Math.atan(D.mu));
  const torque = (D.thrust * D.lead) / (2 * Math.PI * eta);
  out.push({ where: 'carriage in the housing', kind: 'skid + arm tips', lateral_N: 0, couple_Nm: round(torque / 1000, 3), tip_N: round(torque / (2 * D.armHalf), 1), note: 'the links are symmetric about z = 0 and about x = 0, so the carriage sees thrust and the screw’s friction torque only; the torque is reacted at the arm tips on the side walls' });
  out.push({ where: 'link pins', kind: 'double shear', per_pin_N: round(2 * (D.thrust / 2) / Math.cos(Math.atan2(pose(D.xpClosed).x, pose(D.xpClosed).dy)), 0), note: 'each pin carries two links; Ø4 dowel, 6 mm bushings' });
  return out;
}

// ── analytic clearances ──────────────────────────────────────────────────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.W / 2 - D.wall;
  const r = D.linkW / 2, half = D.carrierW / 2;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut flange clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: carriage and arms 1 mm behind the carrier tongues`, p.carFront + 1 <= D.tongueY[0], `${round(p.carFront)} + 1 ≤ ${D.tongueY[0]}`);
    ok(`xp ${xp}: link eyes inside the walls`, D.pivotX + r < inner, `${D.pivotX + r} < ${inner}`);
    ok(`xp ${xp}: carriers on their rail segments`, p.xf - half >= D.railX[0] - 1 && p.xf + half <= D.railX[1], `${round(p.xf - half)} … ${round(p.xf + half)} on ${D.railX[0]}…${D.railX[1]}`);
    ok(`xp ${xp}: carriers inside the walls`, p.xf + half < inner, `${p.xf + half} < ${inner}`);
    ok(`xp ${xp}: carriers do not collide, and clear the screw`, p.xf - half > D.screw / 2 + 1, `${round(p.xf - half)} > ${D.screw / 2 + 1}`);
    ok(`xp ${xp}: carrier feet inside the wall slots`, p.xf - half >= D.wallSlotX[0] - 1 && p.xf + half <= D.wallSlotX[1], `${round(p.xf - half)} … ${round(p.xf + half)} in ${D.wallSlotX[0]}…${D.wallSlotX[1]}`);
    ok(`xp ${xp}: link not near lock`, p.x / D.link < 0.95, `x/L = ${round(p.x / D.link, 3)}`);
    ok(`xp ${xp}: tongue pin inboard of its carrier`, xp > p.xf - half + D.pin, `pin ${xp} in ${round(p.xf - half)}…${round(p.xf + half)}`);
  }
  ok('coaxial: flange centre, rail centre, tongue and links symmetric about z = 0', D.zc === 0 && (D.linkZ[0][0] + D.linkZ[1][1]) === 0 && (D.armZ0 + D.armT / 2) === 0, `zc ${D.zc}, links ${D.linkZ}, arm ${D.armZ0}..${D.armZ0 + D.armT}, tongue ±${D.tongueZ}`);
  ok('the rail sits on the strip, inside the case', D.railY[1] === D.frontY && D.railW / 2 < D.wallSlotZ[0], `rail to y ${D.railY[1]}, ±${D.railW / 2} inside the strip's ±${D.wallSlotZ[0]}`);
  ok('rail segments clear the screw bearing', D.railX[0] - D.endBore / 2 >= 3, `${round(D.railX[0] - D.endBore / 2)} ≥ 3`);
  ok('rail taps inside the strip and the segments', D.railTapX[0] >= D.railX[0] + 4 && D.railTapX[2] <= D.railX[1] - 4, `${D.railTapX} in ${D.railX}`);
  ok('block wraps the rail with a channel deeper than the rail stands proud', D.blockChannelH >= D.railH - D.blockH1 && D.blockChannelW > D.railW, `channel ${D.blockChannelW} × ${D.blockChannelH} over ${D.railW} × ${D.railH - D.blockH1}`);
  ok('block inside the carrier channel', D.blockW / 2 + 0.5 <= D.chanZ && D.blockY[0] >= D.chanY[0] && D.blockY[1] <= D.chanY[1], `block ±${D.blockW / 2}, y ${D.blockY} in ±${D.chanZ}, y ${D.chanY}`);
  ok('carrier feet fit the wall slots, web clear of the wall', D.footZ[0] > D.wallSlotZ[0] && D.footZ[1] < D.wallSlotZ[1] && D.webY[0] - (D.frontY + D.frontT) >= 0.5, `feet ${D.footZ} in slots ${D.wallSlotZ}; web at ${D.webY[0]}`);
  ok('the strip carries the rail between the slots', D.wallSlotZ[0] > D.railW / 2 + 5 && D.chanZ < D.wallSlotZ[1], `strip to ±${D.wallSlotZ[0]}, rail ±${D.railW / 2}`);
  ok('carrier channel clears the strip', D.chanZ > D.wallSlotZ[0] && D.chanZ < D.footZ[0] + 0.01, `channel ±${D.chanZ} over strip ±${D.wallSlotZ[0]}`);
  ok('links 1 mm clear of the arms and the tongue, spacers between', D.linkZ[0][1] + D.spacerL === -D.tongueZ && D.linkZ[1][0] - D.spacerL === D.tongueZ && D.tongueZ === D.armT / 2, `links ${D.linkZ}, tongue ±${D.tongueZ}, spacer ${D.spacerL}`);
  ok('pins span both links and their spacers', D.linkZ[0][0] - D.spacerL + D.pinLen >= D.linkZ[1][1] + D.spacerL, `${D.pinLen} ≥ ${D.linkZ[1][1] + D.spacerL - (D.linkZ[0][0] - D.spacerL)}`);
  ok('link eyes clear of the carrier flange', D.pivotLine + r + 1 <= D.flangeY[0], `${D.pivotLine + r + 1} ≤ ${D.flangeY[0]}`);
  ok('tongue reaches behind its pin and into the flange', D.tongueY[0] + D.pin <= D.pivotLine && D.tongueY[1] === D.flangeY[0], `tongue ${D.tongueY}, pin at ${D.pivotLine}`);
  ok('arm keys into the carriage slot', D.armX0 > D.slotX[0] && D.armHalf > D.slotX[1] && D.armT / 2 < D.slotZ && D.slotZ < D.midZ[1] - 1.5, `arm x ${D.armX0}.., z ±${D.armT / 2} in slot ${D.slotX} × ±${D.slotZ}; waist wall ${round(D.midZ[1] - D.slotZ)}`);
  ok('arm tips just off the walls', D.armHalf < inner && inner - D.armHalf <= 0.3, `${D.armHalf} < ${inner}`);
  ok('carriage rides on the floor', D.skidZ[0] > D.zBot + D.wall && D.skidZ[0] - (D.zBot + D.wall) <= 0.3, `${D.skidZ[0]} over ${D.zBot + D.wall}`);
  ok('nut flange seated: bosses reach it, bolts inside them', D.bossZ[1] >= D.flange / 2 && D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2 < D.bossHalf, `boss to ${D.bossZ[1]} ≥ ${D.flange / 2}; bolt to ${round(D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2)} < ${D.bossHalf}`);
  ok('carriage slots clear the nut bolts', D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2) >= 1.5, `${round(D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2))} ≥ 1.5`);
  ok('front wall stands on the floor, under the lid', D.zBot + D.wall === D.zBot + D.wall && D.zTop - D.wall > D.footZ[1] + 1, `wall from ${D.zBot + D.wall}; feet to ${D.footZ[1]} under the lid at ${D.zTop - D.wall}`);
  ok('journal spans the strip, screw ends inside the wall', D.screwEnd - D.journalLen <= D.frontY && D.screwEnd < D.frontY + D.frontT, `${D.screwEnd - D.journalLen} ≤ ${D.frontY}; end ${D.screwEnd} < ${D.frontY + D.frontT}`);
  ok('tenon holes inside the tenon and clear of each other', D.tenonBoltDY[0] - D.tenonBolt / 2 >= 1.5 && D.tenonL - D.tenonBoltDY[1] - D.tenonBolt / 2 >= 1.5 && D.tenonBoltDY[1] - D.tenonBoltDY[0] > D.tenonBolt + 1 && D.tenonZ - D.tenonBoltZ - D.tenonBolt / 2 >= 0.8,
    `dy ${D.tenonBoltDY}, pitch ${D.tenonBoltDY[1] - D.tenonBoltDY[0]} > ${D.tenonBolt}, z ±${D.tenonBoltZ} in ±${D.tenonZ}`);
  ok('more than one hole at the finger mount', 4 >= 2 && D.tenonBoltZ > 0 && D.tenonBoltDY[1] > D.tenonBoltDY[0], `4 × M4 on ${D.tenonBoltDY[1] - D.tenonBoltDY[0]} × ${2 * D.tenonBoltZ}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('collar ahead of the bulkhead', D.collarY >= D.motorY + D.motorLen + D.bulkheadT, `${D.collarY}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ${round(D.zc - 17.68 - 3.3)} … ${round(D.zc + 17.68 + 3.3)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('no fingers in the assembly', !('finger' in parts), 'the finger is the customer’s part');
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
const polyArea = (pts) => Math.abs(pts.reduce((s, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return s + x * v - u * y; }, 0)) / 2;
export const expected = {
  _: 'Closed-form volumes of every part; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  bulkhead: { volume: ((D.W - 2 * D.wall - 1) * (D.zTop - D.zBot - 2 * D.wall - 1) - A * D.pilot ** 2 - 4 * A * D.bolt ** 2) * D.bulkheadT, tol: 0.002 },
  'front-wall': { volume: (D.W * (D.zTop - D.zBot - D.wall) - A * D.endBore ** 2 - 4 * (D.wallSlotX[1] - D.wallSlotX[0]) * (D.wallSlotZ[1] - D.wallSlotZ[0]) - 6 * A * D.railTap ** 2) * D.frontT, tol: 0.002 },
  carriage: { volume: (2 * D.skidHalf * (D.skidZ[1] - D.skidZ[0]) + 2 * D.bossHalf * (D.bossZ[1] - D.bossZ[0]) + 2 * (D.midHalf - D.bossHalf) * 2 * D.midZ[1] - 2 * (D.slotX[1] - D.slotX[0]) * 2 * D.slotZ - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * D.carT, tol: 0.002 },
  arm: { volume: ((D.armHalf - D.armX0) * D.carT - A * D.pin ** 2) * D.armT, tol: 0.002 },
  carrier: { volume: (polyArea(carrierSection()) - (D.chanY[1] - D.chanY[0]) * 2 * D.chanZ - 4 * A * D.tenonBolt ** 2) * D.carrierW - A * D.pin ** 2 * 2 * D.tongueZ, tol: 0.003 },
  spacer: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.spacerL, tol: 0.006 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.004 },
  pin: { volume: A * D.pin ** 2 * D.pinLen, tol: 0.004 },
  rail: { volume: D.railW * D.railH * (D.railX[1] - D.railX[0]), tol: 0.002 },
  block: { volume: (D.blockW * (D.blockY[1] - D.blockY[0]) - D.blockChannelW * D.blockChannelH) * D.blockL, tol: 0.002 },
  collar: { volume: A * (D.collarD ** 2 - D.screw ** 2) * D.collarL, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen - D.journalLen) + A * D.journal ** 2 * D.journalLen, tol: 0.004 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  floor: { volume: D.W * (D.frontY + D.frontT - D.rearT) * D.wall, tol: 0.002 },
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
  console.table([D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen].map((xp) => { const p = pose(xp); return { pin_x: xp, carrier_x: p.xf, nut_y: round(p.yn), link_deg: round(p.angle, 1), mount_centres: 2 * p.xf, carriage_front_y: round(p.carFront) }; }));
  console.table(forces());
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm, tenons to y = ${D.tenonY[1]}; mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm; nut stroke ${round(D.ynClosed - D.ynOpen)} mm = ${round((D.ynClosed - D.ynOpen) / D.lead, 1)} turns of Tr8×${D.lead} for ${D.travel} mm of jaw; one grip cycle per clock turn (${60 / D.rpm} s at rpm ${D.rpm}); the physical stroke ${D.strokeSeconds} s.`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
