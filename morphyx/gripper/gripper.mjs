#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 2: packaged for a robot. A NEMA 17 pancake stepper with an
// integrated Tr8×2 lead screw sits behind a bulkhead inside a six-plate
// case whose rear plate is an ISO 9409-1-50-4-M6 tool flange. The flange
// nut rides in a carriage; a yoke keyed over the carriage's neck carries
// two 45° cam slots; a pin pressed into each finger rides its slot, so
// 1 mm of nut is 1 mm of finger. The fingers sit under sliders that ride
// two Ø6 rails held by the side walls, and reach out through a slot in the
// front wall to replaceable pads. Nut forward: open. Nut back: closed.
//
// Every part is ONE sweep (extrude or revolve) with an even-odd region, so
// the exact kernel (Truck) names every face and the build is watertight.
// Joints that need holes in two directions are split along real part lines
// (yoke on the carriage neck, finger under the slider neck) and fixed-mated.
// No dependencies: node 22.
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
  // the case: outer box x ±44, z −27..44, y 0..104; walls 4, rear plate 8, front 6
  W: 88, wall: 4, zBot: -27, zTop: 44, rearT: 8, frontY: 98, frontT: 6, L: 104,
  // robot flange (ISO 9409-1-50-4-M6), centred on the case cross-section
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 103, endBore: 8.2,
  // nut and carriage
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carW: 40, carT: 8, carBot: -13, carShoulder: 12, carTop: 18, neck: 30,
  // yoke: cam slots at 45°
  yokeW: 72, yokeY: [-11, 19], yokeT: 6, slotW: 4.2, pin: 4,
  // stroke: nut carriage centre y; finger pin x
  closed: 54, open: 74, xfClosed: 10, pinLine: 68,
  // fingers, sliders, rails, pads
  fingerZ: [18, 26], tabHalf: 8, tabY: [62, 88], armW: 10, armY: [88, 126], armInset: 8,
  sliderLen: 12, sliderY: [66, 90], sliderZ: [26, 38], neckY: [74, 82], neckBot: 20, railY: [72, 84], railZ: 32, railD: 6, sliderBore: 6.2,
  padY: [108, 126], padZ: [26, 46], padW: 12, padOverhang: 2, padBolt: 3.4, padTap: 2.5,
  slotZ: [17, 27], slotHalf: 33,
  rpm: 5,
};
D.zc = (D.zBot + D.zTop) / 2; // case cross-section centre: the tool centre line
D.travel = D.open - D.closed;

// ── kinematics (45° slots: 1 mm of nut is 1 mm of finger) ────────────────────
export function pose(yn) {
  const xf = D.xfClosed + (yn - D.closed);
  return { yn, xf, gap: 2 * (xf - D.xfClosed), ly: D.pinLine - yn };
}

// ── the parts, each one sweep ────────────────────────────────────────────────
const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const circle = (name, c, r) => ({ name, circle: { c, r } });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });
// a stadium slot from a to b, width w, in sketch coordinates (expressions allowed)
const slot = (name, [ax, ay], [bx, by], w) => ({ name, path: { from: [`(${ax}) - (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${ay}) + (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`], segs: [
  { to: [`(${bx}) - (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${by}) + (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`] },
  { arc: { via: [`(${bx}) + (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${by}) + (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`],
           to: [`(${bx}) + (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${by}) - (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`] } },
  { to: [`(${ax}) + (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${ay}) - (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`] },
  { arc: { via: [`(${ax}) - (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${ay}) - (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`],
           to: [`(${ax}) - (${w})/2 * (${by} - (${ay})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`, `(${ay}) + (${w})/2 * (${bx} - (${ax})) / sqrt((${bx} - (${ax}))^2 + (${by} - (${ay}))^2)`] } },
] } });

const xzPlate = (id, note, params, y1, loops, extra = []) => tree(note, { ...params, y1 }, [
  { op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops },
  ...extra,
  { op: 'extrude', id, profile: extra.length ? ['face', ...extra.filter((f) => f.op === 'pattern').map((f) => f.id)] : 'face', depth: 't' },
]);

export const parts = {
  'rear-flange': xzPlate('plate', 'Rear plate: the ISO 9409-1-50-4-M6 tool flange, centred on the case cross-section (the tool centre line, 8.5 above the screw axis). Four Ø6.6 bolt holes on a 50 PCD at 45°, a Ø6 dowel at 0°, and a Ø32 hole for the robot flange boss (no recess: the boss enters the case). Bolts to the case plates not modelled. One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.rearT, zc: D.zc, pcd: D.flangePcd, d_bolt: D.flangeBolt, d_dowel: D.dowel, d_boss: D.boss }, D.rearT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('boss', [0, 'zc'], 'd_boss / 2'), circle('dowel', ['pcd / 2', 'zc'], 'd_dowel / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['pcd/2 * cos(deg(45))', 'zc + pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', center: [0, 'zc'], count: 4, name: 'bolt' }]),

  bulkhead: xzPlate('plate', 'Motor bulkhead: fits inside the case, takes the NEMA 17 pilot and its four M3 on a 31 square (bolts run back through the motor face). The screw passes through the pilot. One extrude along -Y.',
    { w: D.W - 2 * D.wall - 1, zb: D.zBot + D.wall + 0.5, zt: D.zTop - D.wall - 0.5, t: D.bulkheadT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt }, D.motorY + D.motorLen + D.bulkheadT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('pilot', [0, 0], 'd_pilot / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Front wall: the screw’s end bearing (Ø8.2 plain bore) and the slot the two finger arms pass through. One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.frontT, d_bore: D.endBore, slot_half: D.slotHalf, sz0: D.slotZ[0], sz1: D.slotZ[1] }, D.L,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('bore', [0, 0], 'd_bore / 2'), rect('slot', [0, '(sz0 + sz1) / 2'], '2 * slot_half', 'sz1 - sz0')]),

  motor: tree('NEMA 17 pancake stepper body (42.3 square, 5 mm corner chamfers, 22 long) with an integrated Tr8×2 lead screw as its shaft (the screw is its own tree). Sits behind the bulkhead. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, y1: D.motorY + D.motorLen },
    [{ op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-y1' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'], ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
     { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' }]),

  screw: tree('Tr8×2 lead screw, the stepper’s own shaft: an 8 mm cylinder from the motor face to the front-wall bearing; the thread is not modelled. One extrude along local Z, placed along +Y.',
    { d: D.screw, L: D.screwEnd - (D.motorY + D.motorLen) },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'screw', profile: 'section', depth: 'L' }]),

  nut: tree('Tr8 flange nut stand-in: 22 mm flange, 10 mm body, 8.4 mm bore (thread not modelled; the 0.2 mm is the thread clearance). One revolve about local Z.',
    { d_bore: D.nutBore, d_body: D.nutBody, L: D.nutLen, d_flange: D.flange, t_flange: D.flangeT },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_bore/2', 0], ['d_flange/2', 0], ['d_flange/2', 't_flange'], ['d_body/2', 't_flange'], ['d_body/2', 'L'], ['d_bore/2', 'L']] }] },
     { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  carriage: tree('Nut carriage: a vertical plate with the nut bore and the four flange bolt holes, a neck on top that keys into the yoke. Rides 2 mm above the floor; the yoke’s pins react its torque. One extrude along -Y.',
    { w: D.carW, t: D.carT, bottom: D.carBot, shoulder: D.carShoulder, top: D.carTop, neck: D.neck, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-w/2', 'bottom'], ['w/2', 'bottom'], ['w/2', 'shoulder'], ['neck/2', 'shoulder'], ['neck/2', 'top'], ['-neck/2', 'top'], ['-neck/2', 'shoulder'], ['-w/2', 'shoulder']] },
        circle('bore', [0, 0], 'd_bore / 2') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  yoke: tree('Cam yoke: a flat plate keyed over the carriage neck (the window) with two 45° slots. A pin on each finger rides its slot, so the nut’s travel along Y becomes the fingers’ travel along X, one to one. Local origin at the carriage centre; +y forward. One extrude along +Z.',
    { w: D.yokeW, y0: D.yokeY[0], y1: D.yokeY[1], t: D.yokeT, z0: D.carShoulder, win_w: D.neck + 0.2, win_h: D.carT + 0.2, sw: D.slotW,
      xc: D.xfClosed, lc: D.pinLine - D.closed, xo: D.xfClosed + D.travel, lo: D.pinLine - D.open },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [
        rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, 0], 'win_w', 'win_h'),
        slot('slotR', ['xc', 'lc'], ['xo', 'lo'], 'sw'), slot('slotL', ['-xc', 'lc'], ['-xo', 'lo'], 'sw') ] },
     { op: 'extrude', id: 'yoke', profile: 'plate', depth: 't' }]),

  pin: tree('A 4 mm pin, h long, along +Z: pressed into a finger, riding a yoke slot. One extrude.',
    { d: D.pin, h: D.fingerZ[1] - D.carShoulder },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  finger: tree('Finger: an 8 mm plate in plan — a tab inside the case with the cam pin (pressed) and a window that takes the slider neck from above, and an arm that runs forward through the front-wall slot to carry a pad (two Ø3.4 bolt holes). side = 1 right, -1 left. One extrude along +Z.',
    { side: 1, half: D.tabHalf, y0: D.tabY[0], y1: D.tabY[1], y2: D.armY[1], arm: D.armW, inset: D.armInset, z0: D.fingerZ[0], t: D.fingerZ[1] - D.fingerZ[0],
      win_w: D.sliderLen + 0.2, win_h: D.neckY[1] - D.neckY[0] + 0.2, yw: (D.neckY[0] + D.neckY[1]) / 2, y_pin: D.pinLine, d_pin: D.pin, d_bolt: D.padBolt, yb0: D.padY[0] + 4, yb1: D.padY[1] - 4 },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [
        { name: 'outline', polygon: [['-side * half', 'y0'], ['side * half', 'y0'], ['side * half', 'y1'], ['side * (arm - inset)', 'y1'], ['side * (arm - inset)', 'y2'], ['-side * inset', 'y2'], ['-side * inset', 'y1'], ['-side * half', 'y1']] },
        rect('window', [0, 'yw'], 'win_w', 'win_h'), circle('pin', [0, 'y_pin'], 'd_pin / 2'),
        circle('boltA', ['-side * (inset - arm / 2)', 'yb0'], 'd_bolt / 2'), circle('boltB', ['-side * (inset - arm / 2)', 'yb1'], 'd_bolt / 2') ] },
     { op: 'extrude', id: 'finger', profile: 'plan', depth: 't' }]),

  pad: tree('Fingertip pad: 20 tall, bolted to the finger arm from below (two M3 into heat-set inserts, Ø2.5 tap holes here). Its inner face is the gripping surface; the pads meet at x = 0 when closed. side = 1 right, -1 left. One extrude along +Z.',
    { side: 1, w: D.padW, over: D.padOverhang, inset: D.armInset, y0: D.padY[0], y1: D.padY[1], z0: D.padZ[0], t: D.padZ[1] - D.padZ[0], d_tap: D.padTap, arm: D.armW },
    [{ op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [
        rect('outline', ['side * (w / 2 - inset - over)', '(y0 + y1) / 2'], 'w', 'y1 - y0'),
        circle('tapA', ['-side * (inset - arm / 2)', 'y0 + 4'], 'd_tap / 2'), circle('tapB', ['-side * (inset - arm / 2)', 'y1 - 4'], 'd_tap / 2') ] },
     { op: 'extrude', id: 'pad', profile: 'plan', depth: 't' }]),

  slider: tree('Finger slider: rides both rails on Ø6.2 bores (printed plain bearings) and hangs a neck down into the finger’s window. One extrude along +X.',
    { L: D.sliderLen, y0: D.sliderY[0], y1: D.sliderY[1], z0: D.sliderZ[0], z1: D.sliderZ[1], n0: D.neckY[0], n1: D.neckY[1], zn: D.neckBot, ya: D.railY[0], yb: D.railY[1], zr: D.railZ, d: D.sliderBore },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [
        { name: 'outline', polygon: [['y0', 'z0'], ['n0', 'z0'], ['n0', 'zn'], ['n1', 'zn'], ['n1', 'z0'], ['y1', 'z0'], ['y1', 'z1'], ['y0', 'z1']] },
        circle('railA', ['ya', 'zr'], 'd/2'), circle('railB', ['yb', 'zr'], 'd/2') ] },
     { op: 'extrude', id: 'slider', profile: 'face', depth: 'L' }]),

  rail: tree('A Ø6 rail along X, wall to wall, at the y this instance is given. One extrude along +X.',
    { d: D.railD, y: D.railY[0], z: D.railZ, half: D.W / 2 },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [circle('od', ['y', 'z'], 'd/2')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

  'side-wall': tree('Side wall: holds both rails (press fit). Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.rearT, y1: D.frontY, z0: D.zBot + D.wall, z1: D.zTop - D.wall, ya: D.railY[0], yb: D.railY[1], zr: D.railZ, d: D.railD },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0'), circle('railA', ['ya', 'zr'], 'd/2'), circle('railB', ['yb', 'zr'], 'd/2')] },
     { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor plate, between the rear plate and the front wall. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zBot },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid, with an access window over the yoke and sliders. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zTop - D.wall, win_w: D.W - 2 * D.wall - 16, win_y0: D.closed - 6, win_y1: D.frontY - 8 },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, '(win_y0 + win_y1) / 2'], 'win_w', 'win_y1 - win_y0')] }, { op: 'extrude', id: 'lid', profile: 'plate', depth: 't' }]),
};

// ── the assembly, kinematic ──────────────────────────────────────────────────
// A constant-rpm drive turns a hidden clock: one turn is one grip cycle. The
// screw angle `spin` swings 0 → stroke → 0 turns over that cycle, the nut
// follows the screw by the lead, and the yoke's 45° slots move the fingers.
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((open - closed) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly() {
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { closed: D.closed, open: D.open, lead: D.lead, xfClosed: D.xfClosed, pinLine: D.pinLine, nutLen: D.nutLen, carT: D.carT, yokeZ: D.carShoulder, fingerZ: D.fingerZ[0], sliderLen: D.sliderLen, wallX: D.W / 2 - D.wall };
  const derived = { spin: SPIN, yn: 'closed + lead * spin / 360', xf: 'xfClosed + yn - closed' };
  const drivetrain = {
    _: 'The lead screw, built along Z, tilted onto the +Y axis by this sub-assembly’s placement, spinning by `spin`.',
    params: { closed: D.closed, open: D.open, lead: D.lead },
    derived: { spin: SPIN },
    parts: { screw: structuredClone(parts.screw) },
    components: [c('screw', 'screw', [0, 0, 0], { rotate: { axis: [0, 0, 1], deg: 'spin' } })],
  };
  const components = [
    c('clock', 'pin', [0, -20, D.zc], { params: { h: 1 }, hidden: true }),
    c('rear-flange', 'rear-flange', [0, 0, 0]),
    c('floor', 'floor', [0, 0, 0]),
    c('lid', 'lid', [0, 0, 0]),
    c('wall-r', 'side-wall', ['wallX', 0, 0]),
    c('wall-l', 'side-wall', ['-wallX - 4', 0, 0]),
    c('bulkhead', 'bulkhead', [0, 0, 0]),
    c('front-wall', 'front-wall', [0, 0, 0]),
    c('motor', 'motor', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    c('nut', 'nut', [0, 'yn - nutLen / 2', 0], { rotate: alongY }),
    c('carriage', 'carriage', [0, 'yn + carT / 2', 0]),
    c('yoke', 'yoke', [0, 'yn', 0]),
    c('rail-a', 'rail', [0, 0, 0]),
    c('rail-b', 'rail', [0, 0, 0], { params: { y: D.railY[1] } }),
    c('slider-r', 'slider', ['xf - sliderLen / 2', 0, 0]),
    c('slider-l', 'slider', ['-xf - sliderLen / 2', 0, 0]),
    c('finger-r', 'finger', ['xf', 0, 0]),
    c('finger-l', 'finger', ['-xf', 0, 0], { params: { side: -1 } }),
    c('pin-r', 'pin', ['xf', 'pinLine', 'yokeZ']),
    c('pin-l', 'pin', ['-xf', 'pinLine', 'yokeZ']),
    c('pad-r', 'pad', ['xf', 0, 0]),
    c('pad-l', 'pad', ['-xf', 0, 0], { params: { side: -1 } }),
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    fixed('pin-r', 'finger-r'), fixed('pin-l', 'finger-l'),           // press fits
    fixed('rail-a', 'wall-r'), fixed('rail-a', 'wall-l'), fixed('rail-b', 'wall-r'), fixed('rail-b', 'wall-l'),
    fixed('pad-r', 'finger-r'), fixed('pad-l', 'finger-l'),           // bolted
    fixed('finger-r', 'slider-r'), fixed('finger-l', 'slider-l'),     // keyed on the neck
  ];
  const partsMap = Object.fromEntries(Object.entries(parts).filter(([k]) => k !== 'screw').map(([k, v]) => [k, structuredClone(v)]));
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: 'gripper',
    _: `Parallel-jaw robot gripper, v2: ISO 9409-1-50-4-M6 flange → NEMA 17 pancake stepper with an integrated Tr8×${D.lead} screw → flange nut in a carriage → cam yoke with two 45° slots → pins on two fingers under sliders on two Ø6 rails → replaceable pads outside the case. ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm case, pads to ${D.padY[1]}. Kinematic: the drive turns a hidden clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 → ${D.travel / D.lead} turns → 0, the nut follows by the lead (y = ${D.closed} closed … ${D.open} open), and the fingers follow one to one: opening 0 → ${2 * D.travel} mm. Press spin.`,
    params, derived,
    parts: partsMap,
    components, mates,
    drive: { component: 'clock', rpm: D.rpm },
  };
}

// ── analytic clearances: the things an interference check would find ────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.W / 2 - D.wall;
  for (const yn of [D.closed, (D.closed + D.open) / 2, D.open]) {
    const p = pose(yn);
    ok(`nut ${yn}: nut clear of bulkhead`, yn - D.nutLen / 2 > D.motorY + D.motorLen + D.bulkheadT, `${yn - D.nutLen / 2} > ${D.motorY + D.motorLen + D.bulkheadT}`);
    ok(`nut ${yn}: yoke inside the case`, yn + D.yokeY[0] > D.motorY + D.motorLen + D.bulkheadT && yn + D.yokeY[1] < D.frontY, `${yn + D.yokeY[0]} … ${yn + D.yokeY[1]}`);
    ok(`nut ${yn}: finger tab inside the walls`, p.xf + D.tabHalf < inner, `${p.xf + D.tabHalf} < ${inner}`);
    ok(`nut ${yn}: slider inside the walls`, p.xf + D.sliderLen / 2 < inner, `${p.xf + D.sliderLen / 2} < ${inner}`);
    ok(`nut ${yn}: tabs do not cross`, p.xf - D.tabHalf > 0, `${p.xf - D.tabHalf} > 0`);
    ok(`nut ${yn}: arm inside the front slot`, p.xf + D.armW - D.armInset < D.slotHalf, `${p.xf + D.armW - D.armInset} < ${D.slotHalf}`);
    ok(`nut ${yn}: pads do not cross`, p.xf - D.armInset - D.padOverhang >= -1e-9, `gap ${round(p.gap)}`);
    ok(`nut ${yn}: pin on its slot line`, Math.abs((p.xf - D.xfClosed) - ((D.pinLine - D.closed) - p.ly)) < 1e-9, `x ${p.xf}, local y ${p.ly}`);
  }
  ok('yoke inside the walls', D.yokeW / 2 < inner, `${D.yokeW / 2} < ${inner}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('nut flange under the yoke', D.flange / 2 < D.carShoulder, `${D.flange / 2} < ${D.carShoulder}`);
  ok('carriage above the floor', D.carBot > D.zBot + D.wall, `${D.carBot} > ${D.zBot + D.wall}`);
  ok('screw reaches into the front wall', D.screwEnd > D.frontY && D.screwEnd < D.frontY + D.frontT, `${D.screwEnd}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ${round(D.zc - 17.68 - 3.3)} … ${round(D.zc + 17.68 + 3.3)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('slider neck reaches into the finger, above the yoke', D.neckBot >= D.fingerZ[0] && D.neckBot < D.fingerZ[1] && D.fingerZ[0] >= D.carShoulder + D.yokeT, `${D.neckBot}`);
  ok('sliders under the lid', D.sliderZ[1] < D.zTop - D.wall, `${D.sliderZ[1]} < ${D.zTop - D.wall}`);
  ok('finger arm through the front slot', D.fingerZ[0] > D.slotZ[0] && D.fingerZ[1] < D.slotZ[1], `${D.fingerZ} in ${D.slotZ}`);
  ok('slider clear of the front wall', D.sliderY[1] < D.frontY, `${D.sliderY[1]} < ${D.frontY}`);
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
export const expected = {
  _: 'Closed-form volumes of the parts that have one; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  'front-wall': { volume: (D.W * (D.zTop - D.zBot) - A * D.endBore ** 2 - 2 * D.slotHalf * (D.slotZ[1] - D.slotZ[0])) * D.frontT, tol: 0.002 },
  yoke: { volume: (D.yokeW * (D.yokeY[1] - D.yokeY[0]) - (D.neck + 0.2) * (D.carT + 0.2) - 2 * (D.slotW * Math.SQRT2 * D.travel + A * D.slotW ** 2)) * D.yokeT, tol: 0.002 },
  rail: { volume: A * D.railD ** 2 * D.W, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen), tol: 0.002 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  floor: { volume: D.W * (D.frontY - D.rearT) * D.wall, tol: 0.002 },
  'side-wall': { volume: ((D.frontY - D.rearT) * (D.zTop - D.zBot - 2 * D.wall) - 2 * A * D.railD ** 2) * D.wall, tol: 0.002 },
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
  const rows = [D.closed, (D.closed + D.open) / 2, D.open].map((y) => { const p = pose(y); return { nut_y: y, finger_x: p.xf, opening: p.gap }; });
  console.table(rows);
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm, pads to y = ${D.padY[1]}; stroke ${D.travel} mm of nut = ${D.travel / D.lead} turns of Tr8×${D.lead}; one grip cycle per clock turn (${60 / D.rpm} s at rpm ${D.rpm}); wrote ${Object.keys(parts).length} parts + gripper.json to ${out}`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
