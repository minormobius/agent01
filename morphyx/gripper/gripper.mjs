#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 3: the moment loads are designed for. v2 drove each finger from a
// pin 17 mm below its 12 mm bushings, so the friction the drive induced in
// its own guide came to about 2× the drive — self-locking. v3:
//
//   · the fingers ride one MGN9 miniature ball guide on the front wall's
//     outer face, one block per finger (μ ≈ 0.005, moment-rated), so the
//     cantilevers are catalogue moments, not a jam;
//   · the nut carriage rides two Ø6 rods on 20 mm bushings, so the nut sees
//     thrust only and the screw torque reacts into the rods;
//   · a thrust collar behind the front wall takes the cam thrust — gripping
//     pulls the screw forward — instead of the pancake motor's bearing;
//   · the yoke is a tapered tongue that passes through the front wall at full
//     open, so the cam stays close to the guide.
//
// Every part is ONE sweep (extrude or revolve) with an even-odd region, so
// the exact kernel names every face and the build is watertight. Joints that
// need holes in two directions are split along real part lines and fixed-
// mated. The rail and block are stand-ins for purchased parts. No
// dependencies: node 22.
//
// World frame (mm): X = jaw travel, Y = screw axis (+Y is forward, toward
// the pads), Z = up. The screw axis is the line x = 0, z = 0. y = 0 is the
// robot flange face.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const round = (v, n = 2) => Number(v.toFixed(n));

// ── the design numbers ───────────────────────────────────────────────────────
export const D = {
  // the case: outer box x ±42, z −27..34, y 0..104; walls 4, rear plate 8, front wall 6 and 104 wide
  W: 84, wall: 4, zBot: -27, zTop: 34, rearT: 8, frontY: 98, frontT: 6, frontW: 104, L: 104,
  // robot flange (ISO 9409-1-50-4-M6), centred on the case cross-section
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 104, endBore: 8.2, collarD: 14, collarL: 6, collarY: 92,
  // carriage guide: two rods along Y through 20 mm bushings
  rodD: 6, rodX: 19, rodY: [38, 102], rodBore: 6.2,
  // nut and carriage
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carW: 52, carT: 20, carBot: -13, carShoulder: 12, carTop: 18, neck: 30,
  // yoke: a tongue with two 45° cam slots
  yokeHalf: 36, yokeBack: -14, yokeTaperFrom: 11, tipHalf: 19, tipFrom: 28, tipTo: 37, yokeT: 6, slotW: 4.2, pin: 4,
  // stroke: carriage centre y; cam pin x = xf − pinInset
  closed: 57, open: 77, xfClosed: 16, pinLine: 88, pinInset: 6,
  // linear guide (MGN9 stand-in) on the front wall's outer face, rail centre at z = railZ
  railW: 9, railH: 6.5, blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4, railZ: -14,
  // fingers: tab (cam side), carrier (on the block), pad (outside)
  tabZ: [19, 27], tabW: 12, tabY: [82, 122], carrierX: [-15, 12], carrierZ: [-26, 30], carrierT: 6, padW: 12, padY0: 120, padL: 20, padH: 20, padBolt: 3.4, padTap: 2.5,
  wallSlotX: 37, wallSlotZ: [11.8, 27.2],
  rpm: 5, mu: 0.25, muBall: 0.005, gripForce: 60,
};
D.zc = (D.zBot + D.zTop) / 2;
D.travel = D.open - D.closed;
D.carrierY = D.frontY + D.frontT + D.blockH;          // the block's mounting face
D.blockY = [D.frontY + D.frontT + D.blockH1, D.carrierY];

// ── kinematics (45° slots: 1 mm of nut is 1 mm of finger) ────────────────────
export function pose(yn) {
  const xf = D.xfClosed + (yn - D.closed);
  return { yn, xf, gap: 2 * (xf - D.xfClosed), ly: D.pinLine - yn, tipY: yn + D.tipTo };
}

// ── the parts, each one sweep ────────────────────────────────────────────────
const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const circle = (name, c, r) => ({ name, circle: { c, r } });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });
// a stadium slot from a to b, width w, in sketch coordinates (expressions allowed)
const slot = (name, [ax, ay], [bx, by], w) => {
  const len = `sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`;
  const ux = `(${bx} - (${ax})) / ${len}`, uy = `(${by} - (${ay})) / ${len}`; // unit along
  const nx = `(-(${uy}))`, ny = `(${ux})`;                                       // unit normal
  const P = (px, py, s, t) => [`(${px}) + (${w})/2 * ((${s}) * ${ux} + (${t}) * ${nx})`, `(${py}) + (${w})/2 * ((${s}) * ${uy} + (${t}) * ${ny})`];
  return { name, path: { from: P(ax, ay, 0, 1), segs: [
    { to: P(bx, by, 0, 1) }, { arc: { via: P(bx, by, 1, 0), to: P(bx, by, 0, -1) } },
    { to: P(ax, ay, 0, -1) }, { arc: { via: P(ax, ay, -1, 0), to: P(ax, ay, 0, 1) } } ] } };
};
const xzPlate = (id, note, params, y1, loops, extra = []) => tree(note, { ...params, y1 }, [
  { op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops },
  ...extra,
  { op: 'extrude', id, profile: extra.length ? ['face', ...extra.filter((f) => f.op === 'pattern').map((f) => f.id)] : 'face', depth: 't' },
]);

export const parts = {
  'rear-flange': xzPlate('plate', 'Rear plate: the ISO 9409-1-50-4-M6 tool flange, centred on the case cross-section (the tool centre line, 3.5 above the screw axis). Four Ø6.6 on a 50 PCD at 45°, a Ø6 dowel at 0°, a Ø32 hole for the robot flange boss (no recess: the boss enters the case). One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.rearT, zc: D.zc, pcd: D.flangePcd, d_bolt: D.flangeBolt, d_dowel: D.dowel, d_boss: D.boss }, D.rearT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('boss', [0, 'zc'], 'd_boss / 2'), circle('dowel', ['pcd / 2', 'zc'], 'd_dowel / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['pcd/2 * cos(deg(45))', 'zc + pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', center: [0, 'zc'], count: 4, name: 'bolt' }]),

  bulkhead: xzPlate('plate', 'Motor bulkhead: fits inside the case, takes the NEMA 17 pilot, its four M3 on a 31 square, and the two Ø6 carriage rods (press fit). The screw passes through the pilot. One extrude along -Y.',
    { w: D.W - 2 * D.wall - 1, zb: D.zBot + D.wall + 0.5, zt: D.zTop - D.wall - 0.5, t: D.bulkheadT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt, x_rod: D.rodX, d_rod: D.rodD }, D.motorY + D.motorLen + D.bulkheadT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('pilot', [0, 0], 'd_pilot / 2'), circle('rodR', ['x_rod', 0], 'd_rod / 2'), circle('rodL', ['-x_rod', 0], 'd_rod / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Front wall, 104 wide: the screw’s end bearing (Ø8.2), the two carriage rod seats (Ø6 press), and one slot the yoke tongue (below) and the two finger tabs (above) pass through. Its outer face carries the linear rail. One extrude along -Y.',
    { w: D.frontW, zb: D.zBot, zt: D.zTop, t: D.frontT, d_bore: D.endBore, x_rod: D.rodX, d_rod: D.rodD, sx: D.wallSlotX, sz0: D.wallSlotZ[0], sz1: D.wallSlotZ[1] }, D.frontY + D.frontT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('bore', [0, 0], 'd_bore / 2'), circle('rodR', ['x_rod', 0], 'd_rod / 2'), circle('rodL', ['-x_rod', 0], 'd_rod / 2'), rect('slot', [0, '(sz0 + sz1) / 2'], '2 * sx', 'sz1 - sz0')]),

  motor: tree('NEMA 17 pancake stepper body (42.3 square, 5 mm corner chamfers, 22 long) with an integrated Tr8×2 lead screw as its shaft (the screw is its own tree). Sits behind the bulkhead. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, y1: D.motorY + D.motorLen },
    [{ op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-y1' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'], ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
     { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' }]),

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face to the front-wall bearing, flush with its outer face; the thread is not modelled. One extrude along local Z, placed along +Y.',
    { d: D.screw, L: D.screwEnd - (D.motorY + D.motorLen) },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'screw', profile: 'section', depth: 'L' }]),

  collar: tree('Thrust collar: clamped on the screw just behind the front wall. Gripping pulls the screw forward, so the collar bears on the wall’s inner face (thrust washer and set screw not modelled). One revolve about local Z.',
    { D: D.collarD, L: D.collarL, d: D.screw },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'collar', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  rod: tree('A Ø6 carriage guide rod along Y, pressed into the bulkhead and the front wall, at the x this instance is given. One extrude along -Y.',
    { d: D.rodD, x: D.rodX, y0: D.rodY[0], y1: D.rodY[1] },
    [{ op: 'sketch', id: 'section', plane: { base: 'XZ', offset: '-y1' }, loops: [circle('od', ['x', 0], 'd/2')] }, { op: 'extrude', id: 'rod', profile: 'section', depth: 'y1 - y0' }]),

  nut: tree('Tr8 flange nut stand-in: 22 mm flange, 10 mm body, 8.4 mm bore (thread not modelled; the 0.2 mm is the thread clearance). The flange sits behind the carriage, so gripping loads it in compression. One revolve about local Z.',
    { d_bore: D.nutBore, d_body: D.nutBody, L: D.nutLen, d_flange: D.flange, t_flange: D.flangeT },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_bore/2', 0], ['d_flange/2', 0], ['d_flange/2', 't_flange'], ['d_body/2', 't_flange'], ['d_body/2', 'L'], ['d_bore/2', 'L']] }] },
     { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  carriage: tree('Nut carriage, 20 thick: the nut bore with its four flange bolt holes, two Ø6.2 bushing bores for the guide rods (bronze bushings not modelled), and a neck on top that keys into the yoke. The rods take the moment and the torque; the nut sees thrust only. One extrude along -Y.',
    { w: D.carW, t: D.carT, bottom: D.carBot, shoulder: D.carShoulder, top: D.carTop, neck: D.neck, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt, x_rod: D.rodX, d_rod: D.rodBore },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-w/2', 'bottom'], ['w/2', 'bottom'], ['w/2', 'shoulder'], ['neck/2', 'shoulder'], ['neck/2', 'top'], ['-neck/2', 'top'], ['-neck/2', 'shoulder'], ['-w/2', 'shoulder']] },
        circle('bore', [0, 0], 'd_bore / 2'), circle('rodR', ['x_rod', 0], 'd_rod / 2'), circle('rodL', ['-x_rod', 0], 'd_rod / 2') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  yoke: tree('Cam yoke: a tongue keyed over the carriage neck (the window), 72 wide at the back, tapered at 45° to a 38 mm tip so it passes through the front wall at full open. Two 45° slots; a pin on each finger tab rides its slot, so the nut’s travel along Y becomes the fingers’ travel along X, one to one. Local origin at the carriage centre; +y forward. One extrude along +Z.',
    { half: D.yokeHalf, back: D.yokeBack, taper0: D.yokeTaperFrom, tip: D.tipHalf, tip0: D.tipFrom, tip1: D.tipTo, t: D.yokeT, z0: D.carShoulder, win_w: D.neck + 0.2, win_h: D.carT + 0.2, sw: D.slotW,
      xc: D.xfClosed - D.pinInset, lc: D.pinLine - D.closed, xo: D.xfClosed - D.pinInset + D.travel, lo: D.pinLine - D.open },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [
        { name: 'outline', polygon: [['-half', 'back'], ['half', 'back'], ['half', 'taper0'], ['tip', 'tip0'], ['tip', 'tip1'], ['-tip', 'tip1'], ['-tip', 'tip0'], ['-half', 'taper0']] },
        rect('window', [0, 0], 'win_w', 'win_h'),
        slot('slotR', ['xc', 'lc'], ['xo', 'lo'], 'sw'), slot('slotL', ['-xc', 'lc'], ['-xo', 'lo'], 'sw') ] },
     { op: 'extrude', id: 'yoke', profile: 'plate', depth: 't' }]),

  pin: tree('A 4 mm dowel, h long, along +Z: pressed into a finger tab, riding a yoke slot. One extrude.',
    { d: D.pin, h: D.tabZ[1] - D.carShoulder },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  tab: tree('Finger tab: an 8 mm plate that carries the cam pin inside the case and runs forward through the front-wall slot and the carrier’s window to be fixed to the carrier (a cross pin, not modelled). Local x 0 is the finger pin line xf; side = 1 right, -1 left. One extrude along +Z.',
    { side: 1, w: D.tabW, inset: D.pinInset, y0: D.tabY[0], y1: D.tabY[1], z0: D.tabZ[0], t: D.tabZ[1] - D.tabZ[0], y_pin: D.pinLine, d_pin: D.pin },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', ['-side * w / 2', '(y0 + y1) / 2'], 'w', 'y1 - y0'), circle('pin', ['-side * inset', 'y_pin'], 'd_pin / 2')] },
     { op: 'extrude', id: 'tab', profile: 'plan', depth: 't' }]),

  carrier: tree('Finger carrier: a vertical plate bolted to the linear block’s face (four Ø3.4 on the MGN9C 10 × 15 pattern), with a window the tab passes through and two Ø3.4 for the pad. side = 1 right, -1 left. One extrude along -Y.',
    { side: 1, x0: D.carrierX[0], x1: D.carrierX[1], z0: D.carrierZ[0], z1: D.carrierZ[1], t: D.carrierT, y1: D.carrierY + D.carrierT, zr: D.railZ, px: D.blockPattern[0], pz: D.blockPattern[1], d_bolt: D.blockBolt,
      win_w: D.tabW + 0.2, win_h: D.tabZ[1] - D.tabZ[0] + 0.2, wx: -D.tabW / 2, wz: (D.tabZ[0] + D.tabZ[1]) / 2, padx: -(D.pinInset + D.padW / 2 - 2), padz: D.padH / 2 - 4, d_pad: D.padBolt },
    [{ op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops: [
        rect('outline', ['side * (x0 + x1) / 2', '(z0 + z1) / 2'], 'x1 - x0', 'z1 - z0'), rect('window', ['side * wx', 'wz'], 'win_w', 'win_h'),
        circle('blockA', ['-px/2', 'zr - pz/2'], 'd_bolt / 2'), circle('blockB', ['px/2', 'zr - pz/2'], 'd_bolt / 2'), circle('blockC', ['-px/2', 'zr + pz/2'], 'd_bolt / 2'), circle('blockD', ['px/2', 'zr + pz/2'], 'd_bolt / 2'),
        circle('padA', ['side * padx', 'zr - padz'], 'd_pad / 2'), circle('padB', ['side * padx', 'zr + padz'], 'd_pad / 2') ] },
     { op: 'extrude', id: 'carrier', profile: 'face', depth: 't' }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9 with a channel over the rail, 2 mm above the rail’s mounting surface. Its four M3 on top face +Y here (in the carrier). One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], zr: D.railZ, w: D.blockW, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y0', 'zr - w/2'], ['y0', 'zr - cw/2'], ['y0 + ch', 'zr - cw/2'], ['y0 + ch', 'zr + cw/2'], ['y0', 'zr + cw/2'], ['y0', 'zr + w/2'], ['y1', 'zr + w/2'], ['y1', 'zr - w/2']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section, 104 long, on the front wall’s outer face (its Ø3.5 mounting holes at 20 pitch are not modelled). One extrude along +X.',
    { w: D.railW, h: D.railH, y0: D.frontY + D.frontT, zr: D.railZ, half: D.frontW / 2 },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [rect('outline', ['y0 + h/2', 'zr'], 'h', 'w')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

  pad: tree('Fingertip pad: 12 × 20 × 20, bolted to the carrier from behind (two M3 into heat-set inserts, Ø2.5 tap holes here). Its inner X face is the gripping surface, centred on the linear block; the pads meet at x = 0 when closed. side = 1 right, -1 left. One extrude along -Y.',
    { side: 1, w: D.padW, inset: D.pinInset, y1: D.padY0 + D.padL, t: D.padL, zr: D.railZ, h: D.padH, d_tap: D.padTap, padz: D.padH / 2 - 4, xc: -(D.pinInset + D.padW / 2 - 2) },
    [{ op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops: [rect('outline', ['side * xc', 'zr'], 'w', 'h'), circle('tapA', ['side * xc', 'zr - padz'], 'd_tap / 2'), circle('tapB', ['side * xc', 'zr + padz'], 'd_tap / 2')] },
     { op: 'extrude', id: 'pad', profile: 'face', depth: 't' }]),

  'side-wall': tree('Side wall, plain: the guide no longer lives here. Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.rearT, y1: D.frontY, z0: D.zBot + D.wall, z1: D.zTop - D.wall },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0')] }, { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor plate, between the rear plate and the front wall. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zBot },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid, with an access window over the yoke. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zTop - D.wall, win_w: D.W - 2 * D.wall - 16, win_y0: D.closed - 6, win_y1: D.frontY - 8 },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, '(win_y0 + win_y1) / 2'], 'win_w', 'win_y1 - win_y0')] }, { op: 'extrude', id: 'lid', profile: 'plate', depth: 't' }]),
};

// ── the assembly, kinematic ──────────────────────────────────────────────────
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((open - closed) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly() {
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { closed: D.closed, open: D.open, lead: D.lead, xfClosed: D.xfClosed, pinLine: D.pinLine, pinInset: D.pinInset, nutLen: D.nutLen, flangeT: D.flangeT, carT: D.carT, yokeZ: D.carShoulder, blockL: D.blockL };
  const derived = { spin: SPIN, yn: 'closed + lead * spin / 360', xf: 'xfClosed + yn - closed', xp: 'xf - pinInset' };
  const drivetrain = {
    _: 'The lead screw and its thrust collar, built along Z, tilted onto the +Y axis by this sub-assembly’s placement, spinning by `spin`.',
    params: { closed: D.closed, open: D.open, lead: D.lead },
    derived: { spin: SPIN },
    parts: { screw: structuredClone(parts.screw), collar: structuredClone(parts.collar) },
    components: [
      c('screw', 'screw', [0, 0, 0], { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
      c('collar', 'collar', [0, 0, D.collarY - (D.motorY + D.motorLen)], { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
    ],
  };
  const components = [
    c('clock', 'pin', [0, -20, D.zc], { params: { h: 1 }, hidden: true }),
    c('rear-flange', 'rear-flange', [0, 0, 0]),
    c('floor', 'floor', [0, 0, 0]),
    c('lid', 'lid', [0, 0, 0]),
    c('wall-r', 'side-wall', [D.W / 2 - D.wall, 0, 0]),
    c('wall-l', 'side-wall', [-D.W / 2, 0, 0]),
    c('bulkhead', 'bulkhead', [0, 0, 0]),
    c('front-wall', 'front-wall', [0, 0, 0]),
    c('motor', 'motor', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    c('rod-r', 'rod', [0, 0, 0]),
    c('rod-l', 'rod', [0, 0, 0], { params: { x: -D.rodX } }),
    c('nut', 'nut', [0, 'yn - carT / 2 - flangeT', 0], { rotate: alongY }),
    c('carriage', 'carriage', [0, 'yn + carT / 2', 0]),
    c('yoke', 'yoke', [0, 'yn', 0]),
    c('rail', 'rail', [0, 0, 0]),
    c('block-r', 'block', ['xf - blockL / 2', 0, 0]),
    c('block-l', 'block', ['-xf - blockL / 2', 0, 0]),
    c('carrier-r', 'carrier', ['xf', 0, 0]),
    c('carrier-l', 'carrier', ['-xf', 0, 0], { params: { side: -1 } }),
    c('tab-r', 'tab', ['xf', 0, 0]),
    c('tab-l', 'tab', ['-xf', 0, 0], { params: { side: -1 } }),
    c('pin-r', 'pin', ['xp', 'pinLine', 'yokeZ']),
    c('pin-l', 'pin', ['-xp', 'pinLine', 'yokeZ']),
    c('pad-r', 'pad', ['xf', 0, 0]),
    c('pad-l', 'pad', ['-xf', 0, 0], { params: { side: -1 } }),
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    fixed('pin-r', 'tab-r'), fixed('pin-l', 'tab-l'),                     // press fits
    fixed('tab-r', 'carrier-r'), fixed('tab-l', 'carrier-l'),             // through the window, cross-pinned
    fixed('carrier-r', 'block-r'), fixed('carrier-l', 'block-l'),         // 4 × M3
    fixed('pad-r', 'carrier-r'), fixed('pad-l', 'carrier-l'),             // 2 × M3
    fixed('rail', 'front-wall'),                                          // M3 at 20 pitch
    fixed('rod-r', 'bulkhead'), fixed('rod-l', 'bulkhead'), fixed('rod-r', 'front-wall'), fixed('rod-l', 'front-wall'),
  ];
  const partsMap = Object.fromEntries(Object.entries(parts).filter(([k]) => !(k in drivetrain.parts)).map(([k, v]) => [k, structuredClone(v)]));
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: 'gripper',
    _: `Parallel-jaw robot gripper, v3: ISO 9409-1-50-4-M6 flange → NEMA 17 pancake stepper with an integrated Tr8×${D.lead} screw → flange nut in a carriage on two Ø6 rods → tapered cam yoke with two 45° slots → pins on two finger tabs → MGN9 blocks on one rail across the front wall → carriers and pads outside. Thrust collar behind the front wall. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, pads to y = ${D.padY0 + D.padL}. Kinematic: the drive turns a hidden clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 → ${D.travel / D.lead} turns → 0, the nut follows by the lead (y = ${D.closed} closed … ${D.open} open), the fingers follow one to one: opening 0 → ${2 * D.travel} mm. Press spin.`,
    params, derived,
    parts: partsMap,
    components, mates,
    drive: { component: 'clock', rpm: D.rpm },
  };
}

// ── moments and friction: the audit v2 lacked ───────────────────────────────
// A plain slider on a guide binds when the friction its own drive induces
// exceeds the drive. For a force F applied at offsets (dy, dz) from a
// bearing of length L with two rails d apart, each offset makes a couple the
// guide reacts at its ends; the friction that costs is μ × Σ|reactions|.
export function moments() {
  const F = D.gripForce;
  const out = [];
  // fingers: ball block, centre (xf, blockY mid, railZ). Loads: pad grip F along X; pin drive F along X and pin thrust F along Y at (xp, pinLine, 15).
  const bc = { y: (D.blockY[0] + D.blockY[1]) / 2, z: D.railZ };
  const pad = { y: D.padY0 + D.padL / 2, z: D.railZ };
  const pinPt = { y: D.pinLine, z: D.carShoulder + D.yokeT / 2, dx: -D.pinInset };
  const yaw = F * (pad.y - bc.y) - F * (pinPt.y - bc.y);          // the pad ahead, the pin behind: they oppose
  const pitch = F * (pinPt.z - bc.z);                              // drive force above the block
  const roll = F * (pinPt.z - bc.z);                               // thrust above the block
  out.push({ where: 'finger block (MGN9C)', kind: 'ball guide', roll_Nm: round(roll / 1000, 2), pitch_Nm: round(pitch / 1000, 2), yaw_Nm: round(yaw / 1000, 2), friction_ratio: round(D.muBall * 2 * (Math.abs(pinPt.z - bc.z) / (D.blockL / 2)) , 3), note: 'check against the block’s catalogue moment ratings' });
  // carriage: plain bushings length carT on two rods rodX apart; cam thrust 2F at z 15 above the rod axis.
  const T = 2 * F, dz = D.carShoulder + D.yokeT / 2;
  const reactions = 4 * ((T * dz) / 2 / D.carT);                   // two bores, a couple over the bore length each
  const ratio = (D.mu * reactions + D.mu * T) / T;                 // plus the thrust as a plain radial load? no — thrust is along the rods; only the couple rubs
  out.push({ where: 'carriage rods', kind: 'plain bushing', couple_Nm: round(T * dz / 1000, 2), friction_ratio: round((D.mu * reactions) / T, 3), rule_2to1: `${dz} < ${D.carT / (2 * D.mu)}` });
  // v2, for the record: finger on 12 mm bushings 12 apart, pin 17 below, 10 behind.
  const v2 = D.mu * (4 * (17 / 12) / 2 + 4 * (10 / 12) / 2 + 2 * (17 / 12) + 1);
  out.push({ where: 'v2 finger (for the record)', kind: 'plain bushing', friction_ratio: round(v2, 2), note: 'self-locking' });
  return out;
}

// ── analytic clearances ──────────────────────────────────────────────────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.W / 2 - D.wall;
  for (const yn of [D.closed, (D.closed + D.open) / 2, D.open, D.open - 1, D.open - 2]) {
    const p = pose(yn);
    ok(`nut ${yn}: carriage clear of bulkhead`, yn - D.carT / 2 - D.flangeT > D.motorY + D.motorLen + D.bulkheadT, `${yn - D.carT / 2 - D.flangeT} > ${D.motorY + D.motorLen + D.bulkheadT}`);
    ok(`nut ${yn}: carriage clear of collar`, yn + D.carT / 2 < D.collarY, `${yn + D.carT / 2} < ${D.collarY}`);
    ok(`nut ${yn}: yoke back inside the case`, yn + D.yokeBack > D.motorY + D.motorLen + D.bulkheadT, `${yn + D.yokeBack}`);
    ok(`nut ${yn}: yoke tip clear of the carriers`, p.tipY < D.carrierY || p.xf + D.carrierX[0] > D.tipHalf, `tip y ${p.tipY}, carrier inner x ${p.xf + D.carrierX[0]}`);
    ok(`nut ${yn}: tab inside the walls`, p.xf < inner, `${p.xf} < ${inner}`);
    ok(`nut ${yn}: tabs do not cross`, p.xf - D.tabW > 0, `${p.xf - D.tabW} > 0`);
    ok(`nut ${yn}: tab inside the wall slot`, p.xf < D.wallSlotX, `${p.xf} < ${D.wallSlotX}`);
    ok(`nut ${yn}: blocks on the rail`, p.xf + D.blockL / 2 <= D.frontW / 2, `${round(p.xf + D.blockL / 2)} ≤ ${D.frontW / 2}`);
    ok(`nut ${yn}: blocks do not collide`, p.xf - D.blockL / 2 > 0, `${round(p.xf - D.blockL / 2)} > 0`);
    ok(`nut ${yn}: carriers do not collide`, p.xf + D.carrierX[0] >= 0, `${p.xf + D.carrierX[0]} ≥ 0`);
    ok(`nut ${yn}: pads do not cross`, p.xf - D.pinInset - D.padW + 2 >= -1e-9, `gap ${round(p.gap)}`);
    ok(`nut ${yn}: pin on its slot line`, Math.abs((p.xf - D.pinInset - (D.xfClosed - D.pinInset)) - ((D.pinLine - D.closed) - p.ly)) < 1e-9, `x ${p.xf - D.pinInset}, local y ${p.ly}`);
  }
  ok('yoke inside the walls', D.yokeHalf < inner, `${D.yokeHalf} < ${inner}`);
  ok('yoke taper clears the slot', D.yokeHalf + D.yokeTaperFrom - (D.xfClosed - D.pinInset + D.pinLine - D.closed) >= D.slotW / 2 + 2.5, 'wall ≥ 2.5');
  ok('yoke tip clears the closed slot end', D.tipHalf - (D.xfClosed - D.pinInset + D.slotW / 2) >= 2 && D.tipTo - (D.pinLine - D.closed + D.slotW / 2) >= 2, `${D.tipHalf}, ${D.tipTo}`);
  ok('tongue passes the wall slot at open', 47 - (D.frontY - D.open) <= D.wallSlotX, `${47 - (D.frontY - D.open)} ≤ ${D.wallSlotX}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('nut flange under the yoke', D.flange / 2 < D.carShoulder, `${D.flange / 2} < ${D.carShoulder}`);
  ok('rods clear the nut flange', D.rodX - D.rodD / 2 > D.flange / 2, `${D.rodX - D.rodD / 2} > ${D.flange / 2}`);
  ok('rods inside the carriage', D.rodX + D.rodBore / 2 + 3 <= D.carW / 2, `${D.rodX + D.rodBore / 2 + 3} ≤ ${D.carW / 2}`);
  ok('carriage above the floor', D.carBot > D.zBot + D.wall, `${D.carBot} > ${D.zBot + D.wall}`);
  ok('collar under the yoke and inside the rods', D.collarD / 2 < D.carShoulder && D.collarD / 2 < D.rodX - D.rodD / 2, `${D.collarD / 2}`);
  ok('collar behind the front wall', D.collarY + D.collarL <= D.frontY, `${D.collarY + D.collarL} ≤ ${D.frontY}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ${round(D.zc - 17.68 - 3.3)} … ${round(D.zc + 17.68 + 3.3)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('tabs above the yoke, under the lid', D.tabZ[0] >= D.carShoulder + D.yokeT && D.tabZ[1] < D.zTop - D.wall, `${D.tabZ}`);
  ok('tabs through the wall slot', D.tabZ[0] > D.wallSlotZ[0] && D.tabZ[1] < D.wallSlotZ[1] && D.carShoulder >= D.wallSlotZ[0], `${D.tabZ} in ${D.wallSlotZ}`);
  ok('rail and blocks clear the screw nose and the slot', (D.screwEnd <= D.blockY[0] || D.railZ + D.blockW / 2 < -D.screw / 2) && D.railZ + D.blockW / 2 < D.wallSlotZ[0], `block top ${D.railZ + D.blockW / 2}, screw ends ${D.screwEnd} before the blocks at ${D.blockY[0]}`);
  ok('blocks inside the front wall height', D.railZ - D.blockW / 2 > D.zBot, `${D.railZ - D.blockW / 2} > ${D.zBot}`);
  ok('carrier bolts inside the carrier', D.railZ - D.blockPattern[1] / 2 - D.blockBolt / 2 > D.carrierZ[0], `${D.railZ - D.blockPattern[1] / 2 - D.blockBolt / 2} > ${D.carrierZ[0]}`);
  ok('pads meet at x = 0 when closed', D.xfClosed - D.pinInset - D.padW + 2 === 0, `${D.xfClosed - D.pinInset - D.padW + 2}`);
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
const slotArea = D.slotW * Math.SQRT2 * D.travel + A * D.slotW ** 2;
const yokeArea = 2 * D.yokeHalf * (D.yokeTaperFrom - D.yokeBack) + (D.yokeHalf + D.tipHalf) * (D.tipFrom - D.yokeTaperFrom) + 2 * D.tipHalf * (D.tipTo - D.tipFrom);
export const expected = {
  _: 'Closed-form volumes of the parts that have one; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  'front-wall': { volume: (D.frontW * (D.zTop - D.zBot) - A * D.endBore ** 2 - 2 * A * D.rodD ** 2 - 2 * D.wallSlotX * (D.wallSlotZ[1] - D.wallSlotZ[0])) * D.frontT, tol: 0.002 },
  yoke: { volume: (yokeArea - (D.neck + 0.2) * (D.carT + 0.2) - 2 * slotArea) * D.yokeT, tol: 0.002 },
  rail: { volume: D.railW * D.railH * D.frontW, tol: 0.002 },
  block: { volume: (D.blockW * (D.blockY[1] - D.blockY[0]) - D.blockChannelW * D.blockChannelH) * D.blockL, tol: 0.002 },
  rod: { volume: A * D.rodD ** 2 * (D.rodY[1] - D.rodY[0]), tol: 0.002 },
  collar: { volume: A * (D.collarD ** 2 - D.screw ** 2) * D.collarL, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen), tol: 0.002 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  floor: { volume: D.W * (D.frontY - D.rearT) * D.wall, tol: 0.002 },
  'side-wall': { volume: (D.frontY - D.rearT) * (D.zTop - D.zBot - 2 * D.wall) * D.wall, tol: 0.002 },
  tab: { volume: (D.tabW * (D.tabY[1] - D.tabY[0]) - A * D.pin ** 2) * (D.tabZ[1] - D.tabZ[0]), tol: 0.002 },
  pad: { volume: (D.padW * D.padH - 2 * A * D.padTap ** 2) * D.padL, tol: 0.002 },
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
  fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
  console.table([D.closed, (D.closed + D.open) / 2, D.open].map((y) => { const p = pose(y); return { nut_y: y, finger_x: p.xf, pin_x: p.xf - D.pinInset, opening: p.gap, tongue_tip_y: p.tipY }; }));
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm, front wall ${D.frontW} wide, pads to y = ${D.padY0 + D.padL}; stroke ${D.travel} mm = ${D.travel / D.lead} turns of Tr8×${D.lead}; one grip cycle per clock turn (${60 / D.rpm} s at rpm ${D.rpm}); wrote ${Object.keys(parts).length} parts + gripper.json to ${out}`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
