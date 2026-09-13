#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 7: the links go through the wall. v6 kept the slotted plate but
// mounted the rail on its INNER face, so each jaw carrier had to wrap the
// rail and its block and reach back out through the slots — a 57 mm long
// C-section 39 mm tall. v7 turns the plate around:
//
//   · the rail is on the OUTER face of the strip between the two slots, one
//     piece across the whole width, over the screw's blind journal bore;
//   · the blocks ride it outside, and the coupling links themselves pass
//     through the slots, over and under the rail and its blocks, to pin
//     straight onto the outside of each block. Nothing wraps anything;
//   · so the jaw carrier is a plate: 44 × 22 × 10, bolted to the block's
//     outer face, carrying the link pin through its middle and presenting
//     four M4 and two Ø6 dowels for the customer's finger;
//   · the stroke ends when the two jaw plates meet on the centre line — the
//     plates are wider than their blocks, so they touch first, with the
//     blocks 7 mm apart. That is what sets the closed position;
//   · the links are at z ±11…17, clear of the Ø20 blocks, and the pivot arms
//     and the carrier plates are 22 thick so the links seat straight on
//     them — no spacers anywhere.
//
// What that costs: the link pin now sits 17 mm beyond the front wall, so the
// linkage is longer and flatter and the force ratio at closed falls from
// 1.41 to 0.97. The case is 4 mm wider to keep the arms' reach.
//
// The carrier is the one part with a second operation: its Ø4 pin hole runs
// along Z and its section is swept along Y, so the hole is a cut. It is
// watertight only when the cut clears the part's faces — 3 mm, not 1 — and
// the cut drops the section's face names, so the link pins are placed by
// expression rather than by feature.
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
  // the case: outer box x ±58, z ±26, y 0..116; walls 4, rear plate 8, front wall 6 thick, the full 116 wide
  W: 116, wall: 4, zBot: -26, zTop: 26, rearT: 8, frontY: 110, frontT: 6, L: 116,
  // robot flange (ISO 9409-1-50-4-M6), centred on the screw axis
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw; thrust collar on the bulkhead's front face (nut forward = close, so gripping pulls the screw back)
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 114, journal: 6, journalLen: 8, endBore: 6.2, collarD: 14, collarL: 4, collarY: 42,
  // nut and carriage: the carriage rides on the floor on a skid, its arms' tips just off the side walls
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carT: 18, skidHalf: 13, skidZ: [-21.8, -20], carHalf: 14.5, carTop: 15, slotX: [9, 13],
  // the pivot arms: one each side, 22 thick so the links seat on them, keyed into the carriage's slots, tips at the walls
  armX0: 9.1, armHalf: 53.8, armT: 22, armZ0: -11, pivotX: 47, pivotY: 4,
  // the linkage: links L long, one above and one below, clear of the blocks; Ø4 dowels in bronze bushings
  link: 43, linkW: 10, linkT: 6, eye: 6, pin: 4, bushBore: 4.1, pinLen: 34,
  linkZ: [[-17, -11], [11, 17]],
  // stroke: the jaw pin's x, closed → open. The pin is on its carrier's centre line, so the blocks touch at closed
  xpClosed: 18, xpOpen: 33, pivotLine: 133, inset: 0,
  // the guide, outside: one MGN9 rail on the OUTER face of the front wall's strip, over the screw's blind bore
  railW: 9, railH: 6.5, railHalf: 52, railTapX: [10, 30, 50], railTap: 2.5,
  blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4,
  // the jaw carrier: a plate on the block's outer face. The pin through its middle; the finger on its front face
  carrierHalf: 18, carrierZ: 11, carrierT: 10, fingerBolt: 4.3, fingerBoltX: 13, fingerBoltZ: 7, fingerDowel: 6, fingerDowelX: 13,
  wallSlotZ: [10.6, 17.4], wallSlotX: [5, 52],
  rpm: 5, mu: 0.25, muBall: 0.005, thrust: 120, fingerTipY: 200,
};
D.zc = (D.zBot + D.zTop) / 2;
D.travel = D.xpOpen - D.xpClosed;
D.railY = [D.frontY + D.frontT, D.frontY + D.frontT + D.railH];   // on the OUTER face
D.blockY = [D.railY[0] + D.blockH1, D.railY[0] + D.blockH1 + D.blockH];
D.carrierY = [D.blockY[1], D.blockY[1] + D.carrierT];
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
  'rear-flange': xzPlate('plate', 'Rear plate: the ISO 9409-1-50-4-M6 tool flange, centred on the screw axis. Four Ø6.6 on a 50 PCD at 45°, a Ø6 dowel at 0°, a Ø32 hole for the robot flange boss (no recess: the boss enters the case). One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.rearT, zc: D.zc, pcd: D.flangePcd, d_bolt: D.flangeBolt, d_dowel: D.dowel, d_boss: D.boss }, D.rearT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('boss', [0, 'zc'], 'd_boss / 2'), circle('dowel', ['pcd / 2', 'zc'], 'd_dowel / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['pcd/2 * cos(deg(45))', 'zc + pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', center: [0, 'zc'], count: 4, name: 'bolt' }]),

  bulkhead: xzPlate('plate', 'Motor bulkhead: fits inside the case, takes the NEMA 17 pilot and its four M3 on a 31 square. The screw passes through the pilot; the thrust collar bears on this plate’s front face. One extrude along -Y.',
    { w: D.W - 2 * D.wall - 1, zb: D.zBot + D.wall + 0.5, zt: D.zTop - D.wall - 0.5, t: D.bulkheadT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt }, D.motorY + D.motorLen + D.bulkheadT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('pilot', [0, 0], 'd_pilot / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Front wall — the slotted plate, turned around from v6. The strip across its middle carries the MGN9 rail on its OUTER face, tapped M3 at 20 pitch, and the screw’s Ø6.2 journal runs in a blind bore at its centre, closed by the rail itself. Either side of the strip a long slot lets a coupling link pass through, over and under the rail. Stands on the floor. One extrude along -Y.',
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

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face, turned down to a Ø6 journal for the last 8 mm, which runs in the front wall’s blind bore; the thread is not modelled. One revolve about local Z, placed along +Y.',
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

  carriage: tree('Nut carriage, 18 long: the nut bore with its four flange bolt holes, a 26 mm skid that runs on the floor, and a through-slot each side (4 × 22.2) that the pivot arms key into. The housing aligns it — skid on the floor, arm tips at the walls — and the nut sees thrust only. One extrude along -Y.',
    { t: D.carT, sh: D.skidHalf, sz0: D.skidZ[0], sz1: D.skidZ[1], ch: D.carHalf, ct: D.carTop, slx0: D.slotX[0], slx1: D.slotX[1], slz: D.armT / 2 + 0.1, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-sh', 'sz0'], ['sh', 'sz0'], ['sh', 'sz1'], ['ch', 'sz1'], ['ch', 'ct'], ['-ch', 'ct'], ['-ch', 'sz1'], ['-sh', 'sz1']] },
        circle('bore', [0, 0], 'd_bore / 2'),
        rect('slotR', ['(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz'), rect('slotL', ['-(slx0 + slx1) / 2', 0], 'slx1 - slx0', '2 * slz') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  arm: tree('Pivot arm: a 22 mm block on the mid-plane, keyed into the carriage’s through-slot (4 mm of it), reaching to 0.2 mm from the side wall, carrying the link pivot pin at x 45, 4 mm ahead of the carriage centre. Its two faces are what the links seat on, so there are no spacers. Two per gripper (side = 1 right, -1 left); a set screw holds it in the slot (not modelled). Local origin at the carriage centre. One extrude along +Z.',
    { side: 1, x0: D.armX0, x1: D.armHalf, t: D.armT, z0: D.armZ0, y0: -D.carT / 2, y1: D.carT / 2, px: D.pivotX, py: D.pivotY, d_pin: D.pin },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', ['side * (x0 + x1) / 2', '(y0 + y1) / 2'], 'x1 - x0', 'y1 - y0'), circle('pivot', ['side * px', 'py'], 'd_pin / 2')] },
     { op: 'extrude', id: 'arm', profile: 'plate', depth: 't' }]),

  link: tree('Link: a 43 mm dog-bone, 6 thick, with two Ø6 eyes for pressed bronze bushings. Four per gripper: one above and one below, at z ±11…17, clear of the blocks. From the arm pin, through a slot in the front wall, to the jaw carrier’s pin outside. Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
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

  pin: tree('A 4 mm hardened dowel, 34 long, along +Z: pressed through a pivot arm or a jaw carrier, carrying a link above and a link below in bronze bushings (retaining clips not modelled). Four per gripper. One extrude.',
    { d: D.pin, h: D.pinLen },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  carrier: tree('Jaw carrier: a 44 × 22 × 10 plate bolted to the outer face of its MGN9C block (four M3 on the block’s 10 × 15 pattern). The Ø4 link pin passes through its middle along Z with 22 mm of bearing, and a link seats on each face outside it. Its front face is the finger mount: four M4 and two Ø6 dowels, clear of the block behind. The pin hole is a cut along Z, the only boolean in this design. One extrude along +Y.',
    { half: D.carrierHalf, hz: D.carrierZ, t: D.carrierT, y1: D.carrierY[1], px: D.blockPattern[0], pz: D.blockPattern[1], d_bolt: D.blockBolt,
      fx: D.fingerBoltX, fz: D.fingerBoltZ, d_finger: D.fingerBolt, dx: D.fingerDowelX, d_dowel: D.fingerDowel, inset: D.inset, d_pin: D.pin, y_pin: (D.carrierY[0] + D.carrierY[1]) / 2 },
    [{ op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops: [
        rect('outline', [0, 0], '2 * half', '2 * hz'),
        circle('blockA', ['-px/2', '-pz/2'], 'd_bolt / 2'), circle('blockB', ['px/2', '-pz/2'], 'd_bolt / 2'), circle('blockC', ['-px/2', 'pz/2'], 'd_bolt / 2'), circle('blockD', ['px/2', 'pz/2'], 'd_bolt / 2'),
        circle('fingerA', ['-fx', '-fz'], 'd_finger / 2'), circle('fingerB', ['fx', '-fz'], 'd_finger / 2'), circle('fingerC', ['-fx', 'fz'], 'd_finger / 2'), circle('fingerD', ['fx', 'fz'], 'd_finger / 2'),
        circle('dowelA', ['-dx', 0], 'd_dowel / 2'), circle('dowelB', ['dx', 0], 'd_dowel / 2') ] },
     { op: 'extrude', id: 'carrier', profile: 'face', depth: 't' },
     { op: 'sketch', id: 'pinhole', plane: { base: 'XY', offset: '-(hz + 3)' }, loops: [circle('pin', ['-inset', 'y_pin'], 'd_pin / 2')] },
     { op: 'extrude', id: 'pincut', profile: 'pinhole', depth: '2 * hz + 6', mode: 'cut' }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9, wrapping the rail with a 10 × 5 channel, its base 2 mm off the wall. Its four M3 face +Y, into the jaw carrier. One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], w: D.blockW, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y1', '-w/2'], ['y0', '-w/2'], ['y0', '-cw/2'], ['y0 + ch', '-cw/2'], ['y0 + ch', 'cw/2'], ['y0', 'cw/2'], ['y0', 'w/2'], ['y1', 'w/2']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section, 104 long, on the OUTER face of the front wall’s strip, centred on z = 0, closing the screw’s journal bore behind it (its own counterbores are not modelled; the wall’s tapped holes are). One extrude along +X.',
    { w: D.railW, h: D.railH, y0: D.railY[0], half: D.railHalf },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [rect('outline', ['y0 + h/2', 0], 'h', 'w')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

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
// its angle. `assembly('stroke')` is the physical stroke: the screw is driven
// at rpm, a `screw` mate carries the carriage by the lead, `fixed` mates carry
// the nut and the arms. Bushings sit on their link eyes by feature; the
// carrier's own faces are unnamed (its pin hole is a cut), so its pins are
// placed by expression.
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((ynClosed - ynOpen) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly(mode = 'cycle') {
  const stroke = mode === 'stroke';
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.inset, flangeT: D.flangeT, carT: D.carT,
    lo: D.linkZ[0][0], hi: D.linkZ[1][0], armZ: D.armZ0, blockL: D.blockL };
  const derived = {
    ...(stroke ? { turns: 'theta / 360' } : { spin: SPIN }),
    yn: stroke ? 'ynOpen + lead * turns' : 'ynOpen + lead * spin / 360',   // the nut moves forward to close
    dy: 'yf - py - yn',
    x: 'sqrt(L^2 - dy^2)',
    xp: 'px - x',                                         // the jaw pin, inboard of the arm pivot
    xf: 'xp + inset',                                     // the carrier and its block
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
    c('rail', 'rail', [0, 0, 0]),
    c('block', 'block', [`${side} * xf - blockL / 2`, 0, 0], { repeat: 2 }),
    c('carrier', 'carrier', [`${side} * xf`, 0, 0], { repeat: 2 }),
    // the arm pins: on the arms' own pivot holes; the links seat straight on the arm's faces
    { id: 'arm-pin', part: 'pin', repeat: 2, at: '@arm[i].pivot[0]', rotate: { align: '@arm[i].pivot[0]' }, offset: [0, 0, `${D.linkZ[0][0] - D.armZ0}`] },
    // the jaw pins: the carrier's faces are unnamed (its hole is a cut), so these are placed by expression
    { id: 'jaw-pin', part: 'pin', repeat: 2, at: [`${side} * xp`, 'yf', D.linkZ[0][0]] },
    // four links: i = 0 right-lower, 1 left-lower, 2 right-upper, 3 left-upper; from the arm pivot toward the jaw pin
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
    fixed('carrier[0]', 'block[0]'), fixed('carrier[1]', 'block[1]'),   // 4 × M3 into the block's face
    fixed('rail', 'front-wall'),                                        // M3 at 20 pitch into the strip
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
    _: `Parallel-jaw robot gripper, v7, links through the wall: ISO 9409-1-50-4-M6 flange → NEMA 17 pancake stepper with an integrated Tr8×${D.lead} screw → flange nut in a carriage on the floor → two 22 mm pivot arms keyed into it → four ${D.link} mm links on bronze bushings that pass through the front wall’s two slots, over and under the MGN9 rail on its OUTER face, and pin onto the outside of each block → a 44 × 22 × 10 jaw carrier plate per side, four M4 and two Ø6 dowels for the customer’s finger. The stroke closes until the two jaw plates meet on the centre line. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, the mechanism outside it ${2 * D.linkZ[1][1]} mm tall and reaching y = ${D.carrierY[1]}; mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm apart. ` + (stroke
      ? `The physical stroke: the screw is driven at ${D.rpm} rpm, a screw mate moves the carriage ${D.lead} mm per turn (y = ${round(o.yn, 2)} open → ${round(cl.yn, 2)} closed in ${turns} turns, ${round(turns * 60 / D.rpm, 1)} s), fixed mates carry the nut and the arms, and the links draw the jaws in by ${D.travel} mm each. Sweep with period ${round(turns * 60 / D.rpm, 1)} s; beyond it the nut runs on, as it would.`
      : `Demo cycle: the drive turns a reference clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 → ${turns} turns → 0, the nut moves forward by the lead to close (y = ${round(o.yn, 2)} open … ${round(cl.yn, 2)} closed), and the links draw the jaws in by ${D.travel} mm each.`),
    params, derived,
    parts: partsMap,
    components, mates,
    drive: stroke ? { component: 'drivetrain/screw', rpm: D.rpm } : { component: 'clock', rpm: D.rpm },
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
  const inner = D.W / 2 - D.wall, r = D.linkW / 2, bh = D.blockL / 2;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut flange clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: carriage 2 mm behind the front wall`, p.carFront + 2 <= D.frontY, `${round(p.carFront)} + 2 ≤ ${D.frontY}`);
    ok(`xp ${xp}: link eyes and arms inside the walls`, D.pivotX + r < inner && D.armHalf < inner, `${D.pivotX + r}, ${D.armHalf} < ${inner}`);
    ok(`xp ${xp}: blocks on the rail`, p.xf - bh >= -D.railHalf && p.xf + bh <= D.railHalf, `${round(p.xf - bh)} … ${round(p.xf + bh)} on ±${D.railHalf}`);
    ok(`xp ${xp}: blocks do not cross`, p.xf - bh >= 0, `inner edge ${round(p.xf - bh)} ≥ 0`);
    ok(`xp ${xp}: carriers do not cross`, p.xf - D.carrierHalf >= 0, `inner edge ${round(p.xf - D.carrierHalf)} ≥ 0`);
    ok(`xp ${xp}: link crosses the wall inside its slot`, (() => { const f = (y) => xp + (D.pivotLine - y) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp);
      return Math.min(f(D.frontY), f(D.frontY + D.frontT)) - 8 > D.wallSlotX[0] && Math.max(f(D.frontY), f(D.frontY + D.frontT)) + 8 < D.wallSlotX[1]; })(),
      `x ${round(xp + (D.pivotLine - D.frontY - D.frontT) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp))} … ${round(xp + (D.pivotLine - D.frontY) / (D.pivotLine - p.yn - D.pivotY) * (D.pivotX - xp))} in ${D.wallSlotX}`);
    ok(`xp ${xp}: link not near lock`, p.x / D.link < 0.95, `x/L = ${round(p.x / D.link, 3)}`);
  }
  ok('the jaw plates meet at closed, which is the stop', D.xfClosed - D.carrierHalf >= 0 && D.xfClosed - D.carrierHalf <= 0.6, `plates at ±${round(D.xfClosed - D.carrierHalf)}, their blocks ${round(2 * (D.xfClosed - bh))} apart`);
  ok('coaxial: flange centre, rail centre, links and carriers symmetric about z = 0', D.zc === 0 && (D.linkZ[0][0] + D.linkZ[1][1]) === 0 && (D.armZ0 + D.armT / 2) === 0, `links ${D.linkZ}, arm ${D.armZ0}..${D.armZ0 + D.armT}`);
  ok('the rail is on the OUTER face, over the blind bore', D.railY[0] === D.frontY + D.frontT && D.screwEnd < D.railY[0], `rail from ${D.railY[0]}; screw ends ${D.screwEnd}`);
  ok('the strip between the slots carries the rail', D.wallSlotZ[0] > D.railW / 2 + 4 && D.railTapX[2] + D.railTap / 2 < D.railHalf, `strip ±${D.wallSlotZ[0]}, rail ±${D.railW / 2}, taps to ${D.railTapX[2]}`);
  ok('links clear the blocks and pass the slots', D.linkZ[1][0] >= D.blockW / 2 + 1 && D.linkZ[1][0] > D.wallSlotZ[0] && D.linkZ[1][1] < D.wallSlotZ[1], `links ${D.linkZ[1]}, block ±${D.blockW / 2}, slot ${D.wallSlotZ}`);
  ok('links seat on the arms and the carriers, no spacers', D.armZ0 + D.armT === D.linkZ[1][0] && D.carrierZ === D.linkZ[1][0], `arm to ${D.armZ0 + D.armT}, carrier ±${D.carrierZ}, links from ${D.linkZ[1][0]}`);
  ok('pins span both links', D.linkZ[0][0] + D.pinLen >= D.linkZ[1][1], `${D.pinLen} ≥ ${D.linkZ[1][1] - D.linkZ[0][0]}`);
  ok('the jaw pin is gripped over the carrier and overhangs to the links', D.carrierZ * 2 >= 20 && D.linkZ[1][1] - D.carrierZ === D.linkT, `grip ${2 * D.carrierZ}, overhang ${D.linkZ[1][1] - D.carrierZ}`);
  ok('the finger pattern fits the plate', D.fingerBoltX + D.fingerBolt / 2 + 1.5 <= D.carrierHalf && D.fingerDowelX + D.fingerDowel / 2 + 1.5 <= D.carrierHalf && D.fingerBoltZ + D.fingerBolt / 2 + 1.5 <= D.carrierZ, `bolts ±${D.fingerBoltX} × ±${D.fingerBoltZ}, dowels ±${D.fingerDowelX}, plate ±${D.carrierHalf} × ±${D.carrierZ}`);
  ok('the finger pattern clears the pin and the block bolts', D.fingerBoltX - D.fingerBolt / 2 > D.pin / 2 + 2 && Math.hypot(D.fingerBoltX - D.blockPattern[0] / 2, D.fingerBoltZ - D.blockPattern[1] / 2) > (D.fingerBolt + D.blockBolt) / 2 + 1 && D.fingerBoltZ - D.fingerBolt / 2 > D.fingerDowel / 2, `bolt to bolt ${round(Math.hypot(D.fingerBoltX - D.blockPattern[0] / 2, D.fingerBoltZ - D.blockPattern[1] / 2), 1)}`);
  ok('more than one hole at the finger mount', D.fingerBoltZ > 0 && D.fingerBoltX > 0, `4 × M4 on ${2 * D.fingerBoltX} × ${2 * D.fingerBoltZ}, 2 dowels`);
  ok('the pin hole clears the block bolts', D.pin / 2 + 1.5 < D.blockPattern[0] / 2, `Ø${D.pin} at x 0, bolts at ±${D.blockPattern[0] / 2}`);
  ok('carrier taller than its block, clear of the links', D.carrierZ >= D.blockW / 2 && D.carrierZ <= D.linkZ[1][0], `±${D.carrierZ} vs block ±${D.blockW / 2}`);
  ok('block wraps the rail', D.blockChannelH >= D.railH - D.blockH1 && D.blockChannelW > D.railW, `channel ${D.blockChannelW} × ${D.blockChannelH} over ${D.railW} × ${D.railH - D.blockH1}`);
  ok('arm keys into the carriage slot', D.armX0 > D.slotX[0] && D.armHalf > D.slotX[1] && D.armT / 2 + 0.1 < D.carTop, `arm x ${D.armX0}.., z ±${D.armT / 2} in slot ${D.slotX}`);
  ok('carriage slots clear the nut bolts and stay inside it', D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2) >= 1.5 && D.slotX[1] + 1.5 <= D.carHalf, `${round(D.slotX[0] - (D.nutPcd / 2 * Math.SQRT1_2 + D.nutBolt / 2))} ≥ 1.5; ${D.slotX[1]} ≤ ${D.carHalf}`);
  ok('carriage rides on the floor, nut flange inside it', D.skidZ[0] > D.zBot + D.wall && D.skidZ[0] - (D.zBot + D.wall) <= 0.3 && D.carTop >= D.flange / 2, `${D.skidZ[0]} over ${D.zBot + D.wall}; top ${D.carTop} ≥ ${D.flange / 2}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('collar ahead of the bulkhead', D.collarY >= D.motorY + D.motorLen + D.bulkheadT, `${D.collarY}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ±${round(D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('the screw reaches the nut at both ends', D.screwEnd > D.ynClosed - D.carT / 2 && D.screwEnd - D.journalLen <= D.frontY, `${D.screwEnd} > ${round(D.ynClosed - D.carT / 2)}`);
  ok('slots clear the strip and the case', D.wallSlotZ[1] < D.zTop - D.wall && D.wallSlotX[1] <= D.W / 2 - 2, `slots to z ${D.wallSlotZ[1]}, x ${D.wallSlotX[1]}`);
  ok('no fingers in the assembly', !('finger' in parts), 'the finger is the customer’s part');
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
export const expected = {
  _: 'Closed-form volumes of every part; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  bulkhead: { volume: ((D.W - 2 * D.wall - 1) * (D.zTop - D.zBot - 2 * D.wall - 1) - A * D.pilot ** 2 - 4 * A * D.bolt ** 2) * D.bulkheadT, tol: 0.002 },
  'front-wall': { volume: (D.W * (D.zTop - D.zBot - D.wall) - A * D.endBore ** 2 - 4 * (D.wallSlotX[1] - D.wallSlotX[0]) * (D.wallSlotZ[1] - D.wallSlotZ[0]) - 6 * A * D.railTap ** 2) * D.frontT, tol: 0.002 },
  carriage: { volume: (2 * D.skidHalf * (D.skidZ[1] - D.skidZ[0]) + 2 * D.carHalf * (D.carTop - D.skidZ[1]) - 2 * (D.slotX[1] - D.slotX[0]) * (D.armT + 0.2) - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * D.carT, tol: 0.002 },
  arm: { volume: ((D.armHalf - D.armX0) * D.carT - A * D.pin ** 2) * D.armT, tol: 0.002 },
  carrier: { volume: (4 * D.carrierHalf * D.carrierZ - 4 * A * D.blockBolt ** 2 - 4 * A * D.fingerBolt ** 2 - 2 * A * D.fingerDowel ** 2) * D.carrierT - A * D.pin ** 2 * 2 * D.carrierZ, tol: 0.003 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.004 },
  pin: { volume: A * D.pin ** 2 * D.pinLen, tol: 0.004 },
  rail: { volume: D.railW * D.railH * 2 * D.railHalf, tol: 0.002 },
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
  console.table([D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen].map((xp) => { const p = pose(xp); return { jaw_pin_x: xp, block_x: p.xf, nut_y: round(p.yn), link_deg: round(p.angle, 1), mount_centres: 2 * p.xf, carriage_front_y: round(p.carFront) }; }));
  console.table(forces());
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm; outside it the mechanism is ${2 * D.linkZ[1][1]} mm tall and reaches y = ${D.carrierY[1]}; mount centres ${2 * D.xfClosed} → ${2 * D.xfOpen} mm; nut stroke ${round(D.ynClosed - D.ynOpen)} mm = ${round((D.ynClosed - D.ynOpen) / D.lead, 1)} turns of Tr8×${D.lead} for ${D.travel} mm of jaw; the physical stroke ${D.strokeSeconds} s.`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
