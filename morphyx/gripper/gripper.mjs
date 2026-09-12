#!/usr/bin/env node
// gripper.mjs — a parallel-jaw robot gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json, gripper.json (kinematic), expected.json
//   node gripper.mjs --out /tmp/g         # written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// Version 4: pivots, doubled. The v3 cam (a Ø4 pin sliding in a printed 45°
// slot) was a line contact carrying the whole grip load with sliding
// friction, wearing into backlash. v4 replaces it with a slider-crank per
// finger, one link above and one below the finger tab, so:
//
//   · every joint is a pivot: hardened Ø4 dowels in bronze bushings, each
//     finger pin and each carriage pin in double shear;
//   · the two links are symmetric about the guide plane (z = 16), so the
//     linear block sees zero roll and zero pitch, and the finger tab is the
//     clevis tang;
//   · the carriage pins sit outboard of the carriage body (x ±36), ahead of
//     it on a crossbar keyed to its neck, so the links never sweep the body;
//     that forces the crossed geometry — finger pivots inboard, nut forward
//     to close — and moves the thrust collar to the bulkhead's front face;
//   · the nut still sees thrust only (two Ø6 rods), the fingers still ride
//     one MGN9 guide on the front wall's outer face.
//
// The price of pivots: the force ratio varies with the link angle — high at
// closed, low at open. `forces()` prints the curve; the audit prints it.
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
  // the case: outer box x ±48, z −27..34, y 0..104; walls 4, rear plate 8, front wall 6 and 104 wide
  W: 96, wall: 4, zBot: -27, zTop: 34, rearT: 8, frontY: 98, frontT: 6, frontW: 104, L: 104,
  // robot flange (ISO 9409-1-50-4-M6), centred on the case cross-section
  flangePcd: 50, flangeBolt: 6.6, dowel: 6, boss: 32,
  // motor: NEMA 17 pancake, integrated Tr8×2 screw; thrust collar on the bulkhead's front face (nut forward = close, so gripping pulls the screw back)
  motor: 42.3, motorChamfer: 5, motorY: 14, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 104, endBore: 8.2, collarD: 14, collarL: 4, collarY: 42,
  // carriage guide: two rods along Y through 20 mm bushings
  rodD: 6, rodX: 19, rodY: [38, 102], rodBore: 6.2,
  // nut and carriage
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carW: 52, carT: 20, carBot: -13, carShoulder: 12, carTop: 20, neck: 30,
  // the linkage: crossbar on the carriage neck, pivots at ±pivotX ahead of the carriage; links L long, one above and one below the tab
  barHalf: 42, barBack: -12, barFront: 12, barT: 8, pivotX: 36, pivotY: 8, link: 27, linkW: 10, linkT: 6, eye: 6, pin: 4, bushBore: 4.1, pinLen: 20,
  linkZ: [[6, 12], [20, 26]],
  // stroke: finger pivot x (xp) closed → open; finger pivot line y_f is fixed
  xpClosed: 12, xpOpen: 30, pivotLine: 95, pinInset: 6,
  // linear guide (MGN9 stand-in) on the front wall's outer face, rail centre at z = railZ = the linkage's plane of symmetry
  railW: 9, railH: 6.5, blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4, railZ: 16,
  // fingers: tab (the clevis tang, at the guide height), carrier (on the block), pad (outside)
  tabZ: [12, 20], tabW: 12, tabY: [89, 122], carrierX: [-15, 12], carrierZ: [-2, 34], carrierT: 6, padW: 12, padY0: 120, padL: 20, padH: 20, padBolt: 3.4, padTap: 2.5,
  wallSlotX: 37, wallSlotZ: [11.8, 20.2],
  rpm: 5, mu: 0.25, muBall: 0.005, thrust: 120,
};
D.zc = (D.zBot + D.zTop) / 2;
D.travel = D.xpOpen - D.xpClosed;
D.carrierY = D.frontY + D.frontT + D.blockH;          // the block's mounting face
D.blockY = [D.frontY + D.frontT + D.blockH1, D.carrierY];
// the slider-crank: x = pivotX − xp (the link's X reach), dy = √(L² − x²), carriage centre yn = pivotLine − pivotY − dy
const dyOf = (xp) => Math.sqrt(D.link ** 2 - (D.pivotX - xp) ** 2);
D.ynClosed = D.pivotLine - D.pivotY - dyOf(D.xpClosed);
D.ynOpen = D.pivotLine - D.pivotY - dyOf(D.xpOpen);

// ── kinematics: a crossed slider-crank per finger ───────────────────────────
export function pose(xp) {
  const x = D.pivotX - xp, dy = dyOf(xp), yn = D.pivotLine - D.pivotY - dy;
  return { xp, xf: xp + D.pinInset, x, dy, yn, gap: 2 * (xp - D.xpClosed), ratio: x / dy, angle: (Math.atan2(x, dy) * 180) / Math.PI, barFront: yn + D.barFront };
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

  carriage: tree('Nut carriage, 20 thick: the nut bore with its four flange bolt holes, two Ø6.2 bushing bores for the guide rods (bronze bushings not modelled), and a neck on top that keys into the crossbar. The rods take the moment and the torque; the nut sees thrust only. One extrude along -Y.',
    { w: D.carW, t: D.carT, bottom: D.carBot, shoulder: D.carShoulder, top: D.carTop, neck: D.neck, d_bore: D.nutBore + 1.8, pcd: D.nutPcd, d_bolt: D.nutBolt, x_rod: D.rodX, d_rod: D.rodBore },
    [{ op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-w/2', 'bottom'], ['w/2', 'bottom'], ['w/2', 'shoulder'], ['neck/2', 'shoulder'], ['neck/2', 'top'], ['-neck/2', 'top'], ['-neck/2', 'shoulder'], ['-w/2', 'shoulder']] },
        circle('bore', [0, 0], 'd_bore / 2'), circle('rodR', ['x_rod', 0], 'd_rod / 2'), circle('rodL', ['-x_rod', 0], 'd_rod / 2') ] },
     { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
     { op: 'extrude', id: 'carriage', profile: ['face', 'bolts'], depth: 't' }]),

  crossbar: tree('Crossbar: keyed over the carriage neck (the window) at the guide height, reaching ahead of the carriage body to carry the two link pivot pins at x \u00b136, so the links never sweep the carriage. Local origin at the carriage centre; +y forward. One extrude along +Z.',
    { half: D.barHalf, back: D.barBack, front: D.barFront, t: D.barT, z0: D.carShoulder, win_w: D.neck + 0.2, win_h: D.carT + 0.2, px: D.pivotX, py: D.pivotY, d_pin: D.pin },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [
        rect('outline', [0, '(back + front) / 2'], '2 * half', 'front - back'), rect('window', [0, 0], 'win_w', 'win_h'),
        circle('pivotR', ['px', 'py'], 'd_pin / 2'), circle('pivotL', ['-px', 'py'], 'd_pin / 2') ] },
     { op: 'extrude', id: 'crossbar', profile: 'plate', depth: 't' }]),

  link: tree('Link: a 27 mm dog-bone, 6 thick, with two \u00d86 eyes for pressed bronze bushings. Four per gripper: one above and one below each finger tab, from the crossbar pin to the finger pin. Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
    { L: D.link, r: D.linkW / 2, t: D.linkT, d_eye: D.eye },
    [{ op: 'sketch', id: 'outline', loops: [{ name: 'body', path: { from: [0, '-r'], segs: [
        { to: ['L', '-r'] }, { arc: { via: ['L + r', 0], to: ['L', 'r'] } }, { to: [0, 'r'] }, { arc: { via: ['-r', 0], to: [0, '-r'] } } ] } }] },
     { op: 'sketch', id: 'eye', loops: [circle(null, [0, 0], 'd_eye / 2')] },
     { op: 'pattern', id: 'eyes', of: 'eye', kind: 'linear', count: 2, step: ['L', 0], name: 'eye' },
     { op: 'extrude', id: 'link', profile: ['outline', 'eyes'], depth: 't' }]),

  bushing: tree('Bronze bushing: \u00d86 \u00d7 6 with a \u00d84.1 bore, pressed into a link eye, running on a \u00d84 dowel. Eight per gripper. One revolve about local Z.',
    { D: D.eye, L: D.linkT, d: D.bushBore },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d/2', 0], ['D/2', 0], ['D/2', 'L'], ['d/2', 'L']] }] },
     { op: 'revolve', id: 'bushing', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  pin: tree('A 4 mm hardened dowel, h long, along +Z: pressed into a finger tab or the crossbar, carrying a link above and a link below in bronze bushings (retaining clips not modelled). One extrude.',
    { d: D.pin, h: D.pinLen },
    [{ op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] }, { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' }]),

  tab: tree('Finger tab: an 8 mm plate that carries the cam pin inside the case and runs forward through the front-wall slot and the carrier’s window to be fixed to the carrier (a cross pin, not modelled). Local x 0 is the finger pin line xf; side = 1 right, -1 left. One extrude along +Z.',
    { side: 1, w: D.tabW, inset: D.pinInset, y0: D.tabY[0], y1: D.tabY[1], z0: D.tabZ[0], t: D.tabZ[1] - D.tabZ[0], y_pin: D.pivotLine, d_pin: D.pin },
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

  'side-wall': tree('Side wall, plain. Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.rearT, y1: D.frontY, z0: D.zBot + D.wall, z1: D.zTop - D.wall },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0')] }, { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor plate, between the rear plate and the front wall. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zBot },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid, with an access window over the linkage. One extrude along +Z.',
    { w: D.W, y0: D.rearT, y1: D.frontY, t: D.wall, z0: D.zTop - D.wall, win_w: D.W - 2 * D.wall - 16, win_y0: D.ynOpen - 6, win_y1: D.frontY - 8 },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0'), rect('window', [0, '(win_y0 + win_y1) / 2'], 'win_w', 'win_y1 - win_y0')] }, { op: 'extrude', id: 'lid', profile: 'plate', depth: 't' }]),
};

// ── the assembly, kinematic ──────────────────────────────────────────────────
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
const SPIN = '360 * ((ynClosed - ynOpen) / lead) * (1 - cos(deg(theta))) / 2';
export function assembly() {
  const c = (id, part, at, extra = {}) => ({ id, part, at, ...extra });
  const params = { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.pinInset, nutLen: D.nutLen, flangeT: D.flangeT, carT: D.carT, barZ: D.carShoulder, blockL: D.blockL, pinZ: D.linkZ[0][0], lo: D.linkZ[0][0], hi: D.linkZ[1][0] };
  const derived = {
    spin: SPIN,
    yn: 'ynOpen + lead * spin / 360',                     // the nut moves forward to close
    dy: 'yf - py - yn',
    x: 'sqrt(L^2 - dy^2)',
    xp: 'px - x',                                         // finger pivot, inboard of the carriage pivot
    xf: 'xp + inset',                                     // block centre
    phi: 'rad2deg(atan2(dy, -x))',                        // the right link, from its carriage eye, points inward and forward
  };
  const drivetrain = {
    _: 'The lead screw and its thrust collar, built along Z, tilted onto the +Y axis by this sub-assembly\u2019s placement, spinning by `spin`.',
    params: { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead },
    derived: { spin: SPIN },
    parts: { screw: structuredClone(parts.screw), collar: structuredClone(parts.collar) },
    components: [
      c('screw', 'screw', [0, 0, 0], { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
      c('collar', 'collar', [0, 0, D.collarY - (D.motorY + D.motorLen)], { rotate: { axis: [0, 0, 1], deg: 'spin' } }),
    ],
  };
  const linkR = (id, z) => c(id, 'link', ['px', 'yn + py', z], { rotate: { axis: [0, 0, 1], deg: 'phi' } });
  const linkL = (id, z) => c(id, 'link', ['-px', 'yn + py', z], { rotate: { axis: [0, 0, 1], deg: '180 - phi' } });
  const bush = (id, x, y, z) => c(id, 'bushing', [x, y, z]);
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
    c('crossbar', 'crossbar', [0, 'yn', 0]),
    c('bar-pin-r', 'pin', ['px', 'yn + py', 'pinZ']),
    c('bar-pin-l', 'pin', ['-px', 'yn + py', 'pinZ']),
    linkR('link-r-lo', 'lo'), linkR('link-r-hi', 'hi'), linkL('link-l-lo', 'lo'), linkL('link-l-hi', 'hi'),
    bush('bush-r-lo-a', 'px', 'yn + py', 'lo'), bush('bush-r-lo-b', 'xp', 'yf', 'lo'), bush('bush-r-hi-a', 'px', 'yn + py', 'hi'), bush('bush-r-hi-b', 'xp', 'yf', 'hi'),
    bush('bush-l-lo-a', '-px', 'yn + py', 'lo'), bush('bush-l-lo-b', '-xp', 'yf', 'lo'), bush('bush-l-hi-a', '-px', 'yn + py', 'hi'), bush('bush-l-hi-b', '-xp', 'yf', 'hi'),
    c('rail', 'rail', [0, 0, 0]),
    c('block-r', 'block', ['xf - blockL / 2', 0, 0]),
    c('block-l', 'block', ['-xf - blockL / 2', 0, 0]),
    c('carrier-r', 'carrier', ['xf', 0, 0]),
    c('carrier-l', 'carrier', ['-xf', 0, 0], { params: { side: -1 } }),
    c('tab-r', 'tab', ['xf', 0, 0]),
    c('tab-l', 'tab', ['-xf', 0, 0], { params: { side: -1 } }),
    c('finger-pin-r', 'pin', ['xp', 'yf', 'pinZ']),
    c('finger-pin-l', 'pin', ['-xp', 'yf', 'pinZ']),
    c('pad-r', 'pad', ['xf', 0, 0]),
    c('pad-l', 'pad', ['-xf', 0, 0], { params: { side: -1 } }),
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    fixed('finger-pin-r', 'tab-r'), fixed('finger-pin-l', 'tab-l'), fixed('bar-pin-r', 'crossbar'), fixed('bar-pin-l', 'crossbar'),   // press fits
    fixed('bush-r-lo-a', 'link-r-lo'), fixed('bush-r-lo-b', 'link-r-lo'), fixed('bush-r-hi-a', 'link-r-hi'), fixed('bush-r-hi-b', 'link-r-hi'),
    fixed('bush-l-lo-a', 'link-l-lo'), fixed('bush-l-lo-b', 'link-l-lo'), fixed('bush-l-hi-a', 'link-l-hi'), fixed('bush-l-hi-b', 'link-l-hi'),
    fixed('tab-r', 'carrier-r'), fixed('tab-l', 'carrier-l'),             // through the window, cross-pinned
    fixed('carrier-r', 'block-r'), fixed('carrier-l', 'block-l'),         // 4 × M3
    fixed('pad-r', 'carrier-r'), fixed('pad-l', 'carrier-l'),             // 2 × M3
    fixed('rail', 'front-wall'),                                          // M3 at 20 pitch
    fixed('rod-r', 'bulkhead'), fixed('rod-l', 'bulkhead'), fixed('rod-r', 'front-wall'), fixed('rod-l', 'front-wall'),
  ];
  const partsMap = Object.fromEntries(Object.entries(parts).filter(([k]) => !(k in drivetrain.parts)).map(([k, v]) => [k, structuredClone(v)]));
  const o = pose(D.xpOpen), cl = pose(D.xpClosed);
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: 'gripper',
    _: `Parallel-jaw robot gripper, v4: ISO 9409-1-50-4-M6 flange \u2192 NEMA 17 pancake stepper with an integrated Tr8\u00d7${D.lead} screw \u2192 flange nut in a carriage on two \u00d86 rods \u2192 crossbar with two pivot pins \u2192 four ${D.link} mm links on bronze bushings, one above and one below each finger tab \u2192 MGN9 blocks on one rail across the front wall \u2192 carriers and pads outside. Thrust collar on the bulkhead. ${D.W} \u00d7 ${D.zTop - D.zBot} \u00d7 ${D.L} mm case, pads to y = ${D.padY0 + D.padL}. Kinematic: the drive turns a hidden clock (one turn = one grip cycle); the screw angle \\\`spin\\\` swings 0 \u2192 ${round((D.ynClosed - D.ynOpen) / D.lead, 2)} turns \u2192 0, the nut moves forward by the lead to close (y = ${round(o.yn, 2)} open \u2026 ${round(cl.yn, 2)} closed), and the links swing the fingers in: opening ${2 * D.travel} \u2192 0 mm. Press spin.`,
    params, derived,
    parts: partsMap,
    components, mates,
    drive: { component: 'clock', rpm: D.rpm },
  };
}

// ── the force curve: what pivots cost ───────────────────────────────────────
export function forces() {
  return [0, 10, 20, 30, 2 * D.travel].map((w) => { const p = pose(D.xpClosed + w / 2); return { object_mm: w, link_deg: round(p.angle, 1), ratio: round(p.ratio, 2), finger_N: round((D.thrust / 2) * p.ratio, 0) }; });
}

// ── moments and friction: the audit v2 lacked ───────────────────────────────
// A plain slider on a guide binds when the friction its own drive induces
// exceeds the drive. For a force F applied at offsets (dy, dz) from a
// bearing of length L with two rails d apart, each offset makes a couple the
// guide reacts at its ends; the friction that costs is μ × Σ|reactions|.
export function moments() {
  const F = forces()[1].finger_N; // the finger force gripping a 10 mm object
  const out = [];
  const bc = { y: (D.blockY[0] + D.blockY[1]) / 2, z: D.railZ };
  const pad = { y: D.padY0 + D.padL / 2, z: D.railZ };
  const pinPt = { y: D.pivotLine, z: (D.linkZ[0][0] + D.linkZ[1][1]) / 2 };
  const yaw = F * (pad.y - bc.y) - F * (pinPt.y - bc.y);       // the pad ahead, the pin behind: a couple
  const pitch = F * (pinPt.z - bc.z), roll = F * (pinPt.z - bc.z); // zero by construction: the links straddle the guide plane
  out.push({ where: 'finger block (MGN9C)', kind: 'ball guide', roll_Nm: round(roll / 1000, 2), pitch_Nm: round(pitch / 1000, 2), yaw_Nm: round(yaw / 1000, 2), note: 'check against the block\u2019s catalogue moment ratings' });
  const T = D.thrust, dz = D.railZ;                              // both links' Y-components enter the crossbar at the guide height
  const reactions = 4 * ((T * dz) / 2 / D.carT);
  out.push({ where: 'carriage rods', kind: 'plain bushing', couple_Nm: round(T * dz / 1000, 2), friction_ratio: round((D.mu * reactions) / T, 3), rule_2to1: `${dz} < ${D.carT / (2 * D.mu)}` });
  out.push({ where: 'link pins', kind: 'double shear', per_pin_N: round(2 * (D.thrust / 2) / Math.cos(Math.atan2(pose(D.xpClosed).x, pose(D.xpClosed).dy)), 0), note: 'each pin carries two links; \u00d84 dowel, 6 mm bushings' });
  out.push({ where: 'v2 finger (for the record)', kind: 'plain bushing', friction_ratio: 2.08, note: 'self-locking' });
  return out;
}

// ── analytic clearances ──────────────────────────────────────────────────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const inner = D.W / 2 - D.wall;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut flange clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: crossbar inside the front wall`, p.barFront < D.frontY, `${round(p.barFront)} < ${D.frontY}`);
    ok(`xp ${xp}: crossbar clear of the tabs`, p.barFront < D.tabY[0], `${round(p.barFront)} < ${D.tabY[0]}`);
    ok(`xp ${xp}: link eyes clear of the carriage body`, D.pivotX - D.linkW / 2 > D.carW / 2, `${D.pivotX - D.linkW / 2} > ${D.carW / 2}`);
    ok(`xp ${xp}: links clear of the nut body`, xp - D.linkW / 2 > D.nutBody / 2, `${xp - D.linkW / 2} > ${D.nutBody / 2}`);
    ok(`xp ${xp}: tab inside the walls`, p.xf < inner, `${p.xf} < ${inner}`);
    ok(`xp ${xp}: tabs do not cross`, p.xf - D.tabW > 0, `${p.xf - D.tabW} > 0`);
    ok(`xp ${xp}: tab inside the wall slot`, p.xf < D.wallSlotX, `${p.xf} < ${D.wallSlotX}`);
    ok(`xp ${xp}: blocks on the rail`, p.xf + D.blockL / 2 <= D.frontW / 2, `${round(p.xf + D.blockL / 2)} ≤ ${D.frontW / 2}`);
    ok(`xp ${xp}: blocks do not collide`, p.xf - D.blockL / 2 > 0, `${round(p.xf - D.blockL / 2)} > 0`);
    ok(`xp ${xp}: carriers do not collide`, p.xf + D.carrierX[0] >= 0, `${p.xf + D.carrierX[0]} ≥ 0`);
    ok(`xp ${xp}: pads do not cross`, xp - D.padW >= -1e-9, `gap ${round(p.gap)}`);
    ok(`xp ${xp}: link not near lock`, p.x / D.link < 0.95, `x/L = ${round(p.x / D.link, 3)}`);
  }
  ok('crossbar and link eyes inside the walls', D.barHalf < inner && D.pivotX + D.linkW / 2 < inner, `${D.barHalf}, ${D.pivotX + D.linkW / 2} < ${inner}`);
  ok('lower links above the rods and the nut', D.linkZ[0][0] > D.rodD / 2 && D.linkZ[0][0] >= D.nutBody / 2 - 1, `${D.linkZ[0][0]}`);
  ok('links straddle the guide plane', (D.linkZ[0][0] + D.linkZ[1][1]) / 2 === D.railZ && D.tabZ[0] === D.linkZ[0][1] && D.tabZ[1] === D.linkZ[1][0], `${D.linkZ} about ${D.railZ}`);
  ok('crossbar between the links', D.carShoulder === D.linkZ[0][1] && D.carShoulder + D.barT === D.linkZ[1][0], `${D.carShoulder}..${D.carShoulder + D.barT}`);
  ok('pins span both links', D.linkZ[0][0] + D.pinLen === D.linkZ[1][1], `${D.pinLen}`);
  ok('finger pin behind the front wall', D.pivotLine + D.pin / 2 < D.frontY, `${D.pivotLine + D.pin / 2} < ${D.frontY}`);
  ok('motor inside the case', D.motor / 2 < inner && -D.motor / 2 > D.zBot + D.wall && D.motor / 2 < D.zTop - D.wall, `±${D.motor / 2}`);
  ok('nut flange under the crossbar', D.flange / 2 < D.carShoulder + 1 && D.flange / 2 <= D.tabZ[0] + 1, `${D.flange / 2}`);
  ok('rods clear the nut flange', D.rodX - D.rodD / 2 > D.flange / 2, `${D.rodX - D.rodD / 2} > ${D.flange / 2}`);
  ok('rods inside the carriage', D.rodX + D.rodBore / 2 + 3 <= D.carW / 2, `${D.rodX + D.rodBore / 2 + 3} ≤ ${D.carW / 2}`);
  ok('carriage above the floor', D.carBot > D.zBot + D.wall, `${D.carBot} > ${D.zBot + D.wall}`);
  ok('collar ahead of the bulkhead, inside the rods', D.collarY >= D.motorY + D.motorLen + D.bulkheadT && D.collarD / 2 < D.rodX - D.rodD / 2, `${D.collarY}`);
  ok('flange bolts inside the rear plate', D.zc + D.flangePcd / 2 * Math.SQRT1_2 + D.flangeBolt / 2 < D.zTop && D.zc - D.flangePcd / 2 * Math.SQRT1_2 - D.flangeBolt / 2 > D.zBot, `z ${round(D.zc - 17.68 - 3.3)} … ${round(D.zc + 17.68 + 3.3)}`);
  ok('robot boss clears the motor', D.rearT + 6 <= D.motorY, `${D.rearT + 6} ≤ ${D.motorY}`);
  ok('upper links under the lid', D.linkZ[1][1] < D.zTop - D.wall, `${D.linkZ[1][1]} < ${D.zTop - D.wall}`);
  ok('tabs through the wall slot', D.tabZ[0] > D.wallSlotZ[0] && D.tabZ[1] < D.wallSlotZ[1], `${D.tabZ} in ${D.wallSlotZ}`);
  ok('block centred on the linkage plane', D.railZ === (D.tabZ[0] + D.tabZ[1]) / 2, `${D.railZ}`);
  ok('blocks inside the front wall height', D.railZ + D.blockW / 2 < D.zTop && D.railZ - D.blockW / 2 > D.zBot, `${D.railZ - D.blockW / 2} … ${D.railZ + D.blockW / 2}`);
  ok('carrier bolts inside the carrier', D.railZ - D.blockPattern[1] / 2 - D.blockBolt / 2 > D.carrierZ[0] && D.railZ + D.blockPattern[1] / 2 + D.blockBolt / 2 < D.carrierZ[1], `${D.carrierZ}`);
  ok('pads meet at x = 0 when closed', D.xpClosed - D.padW === 0, `${D.xpClosed - D.padW}`);
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
export const expected = {
  _: 'Closed-form volumes of the parts that have one; mm³. The kernel must land within tol (relative).',
  'rear-flange': { volume: (D.W * (D.zTop - D.zBot) - A * D.boss ** 2 - A * D.dowel ** 2 - 4 * A * D.flangeBolt ** 2) * D.rearT, tol: 0.002 },
  'front-wall': { volume: (D.frontW * (D.zTop - D.zBot) - A * D.endBore ** 2 - 2 * A * D.rodD ** 2 - 2 * D.wallSlotX * (D.wallSlotZ[1] - D.wallSlotZ[0])) * D.frontT, tol: 0.002 },
  crossbar: { volume: (2 * D.barHalf * (D.barFront - D.barBack) - (D.neck + 0.2) * (D.carT + 0.2) - 2 * A * D.pin ** 2) * D.barT, tol: 0.002 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.004 },
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
  console.table([D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen].map((xp) => { const p = pose(xp); return { finger_pivot_x: xp, block_x: p.xf, nut_y: round(p.yn), link_deg: round(p.angle, 1), opening: p.gap, crossbar_front_y: round(p.barFront) }; }));
  console.table(forces());
  console.table(moments());
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`case ${D.W} × ${D.zTop - D.zBot} × ${D.L} mm, front wall ${D.frontW} wide, pads to y = ${D.padY0 + D.padL}; nut stroke ${round(D.ynClosed - D.ynOpen)} mm = ${round((D.ynClosed - D.ynOpen) / D.lead, 1)} turns of Tr8×${D.lead} for ${D.travel} mm of finger; one grip cycle per clock turn (${60 / D.rpm} s at rpm ${D.rpm}); wrote ${Object.keys(parts).length} parts + gripper.json to ${out}`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
