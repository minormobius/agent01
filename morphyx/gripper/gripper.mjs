#!/usr/bin/env node
// gripper.mjs — a parallel-jaw gripper for cad.mino.mobi, generated.
//
//   node gripper.mjs                      # writes parts/*.json and gripper.json at the reference pose
//   node gripper.mjs --nut 44             # pose the mechanism with the nut bracket centred at y = 44 (closed)
//   node gripper.mjs --nut 62 --out /tmp  # open, written elsewhere
//   node gripper.mjs --print              # the assembly on stdout, nothing written
//
// A stepper (NEMA 17) turns a T8 lead screw through a coupler. A flange nut
// rides the screw inside a bracket; a saddle keyed over the bracket's neck
// carries two pins. Two links run from those pins to pins on two fingers;
// the fingers sit on sliders that ride two round rails across the screw
// axis. Nut toward the motor: fingers close. Nut toward the rails: open.
//
// Every part is ONE sweep (extrude or revolve) with an even-odd region, so the
// exact kernel (Truck) names every face and the build is watertight — a cross
// boolean in Truck comes back with open edges, so joints that need holes in
// two directions are split along real part lines (saddle on neck, finger on
// slider) and fixed-mated. No dependencies: node 22.
//
// World frame (mm): X = jaw travel, Y = screw axis (+Y away from the motor),
// Z = up. The screw axis is the line x = 0, z = 0. The base top is z = -24.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

// ── the design numbers ───────────────────────────────────────────────────────
export const D = {
  // drive train
  motor: 42.3, motorLen: 40, motorChamfer: 5, shaft: 5, shaftLen: 24, boss: 22, bossLen: 2,
  bracketW: 50, bracketH: 50, bracketT: 5, pilot: 22.5, boltPcd: 31, bolt: 3.4,
  couplerD: 20, couplerLen: 25, couplerAt: 4,
  screw: 8, screwLen: 64, screwAt: 21, lead: 2,
  endBlockY: 76, endBlockT: 8, endBlockW: 30, endBore: 8.2,
  // nut and its carriage
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, flangePcd: 16, flangeBolt: 3.5,
  nbW: 40, nbT: 8, nbBore: 10.2, nbShoulder: 30, nbTop: 36, nbNeck: 30, nbBottom: -23,
  saddleW: 52, saddleH: 16, saddleT: 6, pinSpan: 40, pin: 4, pinClear: 4.2,
  // linkage
  link: 72, linkW: 12, linkT: 6, linkZ: 36, pinLine: 111,
  // rails, sliders, fingers
  railD: 6, railZ: 16, railY: [82, 98], railHalf: 95, railBlockT: 8, railBlockAt: 95, railBlockW: 36,
  sliderY: [76, 104], sliderZ: [10, 22], neckY: [84, 96], neckTop: 28, sliderLen: 24, sliderBore: 6.2,
  fingerZ: [22, 34], fingerHalf: 16, armY: [104, 118],
  // the base
  baseT: 6, baseTop: -24, baseX: 110, baseY: [-48, 125], mountD: 4.5, mountInset: 10,
  // the stroke: nut bracket centre y
  nutClosed: 44, nutOpen: 62, nutRef: 53,
};

// ── kinematics ───────────────────────────────────────────────────────────────
export function pose(yn) {
  const dy = D.pinLine - yn;
  if (dy >= D.link) throw new Error(`nut at ${yn}: link would lock (Δy ${dy} ≥ L ${D.link})`);
  const x = Math.sqrt(D.link ** 2 - dy ** 2);
  const xf = D.pinSpan / 2 + x;                 // finger pin x (right finger)
  const phi = (Math.atan2(dy, x) * 180) / Math.PI; // link angle from +X, right link
  return { yn, dy, x, xf, phi, gap: 2 * (xf - reach()), ratio: x / dy };
}
export const reach = () => round(D.pinSpan / 2 + Math.sqrt(D.link ** 2 - (D.pinLine - D.nutClosed) ** 2)); // pad meets x = 0 when closed
const round = (v, n = 2) => Number(v.toFixed(n));

// ── the parts, each one sweep ────────────────────────────────────────────────
const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const circle = (name, c, r) => ({ name, circle: { c, r } });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });

export const parts = {
  base: tree('Base plate, lying in XY under everything. Four mounting holes. One extrude.',
    { w: 2 * D.baseX, y0: D.baseY[0], y1: D.baseY[1], t: D.baseT, top: D.baseTop, d_mount: D.mountD, inset: D.mountInset },
    [
      { op: 'sketch', id: 'outline', plane: { base: 'XY', offset: 'top - t' }, loops: [rect('plate', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] },
      { op: 'sketch', id: 'mount', plane: { base: 'XY', offset: 'top - t' }, loops: [circle(null, ['-w/2 + inset', 'y0 + inset'], 'd_mount / 2')] },
      { op: 'pattern', id: 'mountsx', of: 'mount', kind: 'linear', count: 2, step: ['w - 2 * inset', 0], name: 'mount' },
      { op: 'pattern', id: 'mounts', of: 'mountsx', kind: 'linear', count: 2, step: [0, 'y1 - y0 - 2 * inset'], name: 'mount' },
      { op: 'extrude', id: 'base', profile: ['outline', 'mounts'], depth: 't' },
    ]),

  bracket: tree('Motor bracket: a vertical plate (XZ) at y in [-t, 0] with the NEMA 17 pilot bore and four bolt holes on a 31 mm square. Stands on the base. One extrude along -Y.',
    { w: D.bracketW, h: D.bracketH, t: D.bracketT, base_top: D.baseTop, d_pilot: D.pilot, pcd: D.boltPcd, d_bolt: D.bolt },
    [
      { op: 'sketch', id: 'face', plane: 'XZ', loops: [rect('outline', [0, 'base_top + h/2'], 'w', 'h'), circle('pilot', [0, 0], 'd_pilot / 2')] },
      { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2', 'pcd/2'], 'd_bolt / 2')] },
      { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
      { op: 'extrude', id: 'bracket', profile: ['face', 'bolts'], depth: 't' },
    ]),

  motor: tree('NEMA 17 body: a 42.3 mm square with 5 mm corner chamfers, 40 long, behind the bracket (y in [-45, -5]). Stand-in geometry. One extrude along -Y.',
    { s: D.motor, ch: D.motorChamfer, L: D.motorLen, face_y: -D.bracketT },
    [
      { op: 'sketch', id: 'body', plane: { base: 'XZ', offset: '-face_y' }, loops: [{ name: 'body', polygon: [
        ['-(s/2 - ch)', '-s/2'], ['s/2 - ch', '-s/2'], ['s/2', '-(s/2 - ch)'], ['s/2', 's/2 - ch'],
        ['s/2 - ch', 's/2'], ['-(s/2 - ch)', 's/2'], ['-s/2', 's/2 - ch'], ['-s/2', '-(s/2 - ch)'] ] }] },
      { op: 'extrude', id: 'motor', profile: 'body', depth: 'L' },
    ]),

  'motor-shaft': tree('NEMA 17 shaft with its pilot boss: revolved about local Z; placed with its axis along +Y. One revolve.',
    { d: D.shaft, L: D.shaftLen, d_boss: D.boss, l_boss: D.bossLen },
    [
      { op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'shaft', polygon: [[0, 0], ['d_boss/2', 0], ['d_boss/2', 'l_boss'], ['d/2', 'l_boss'], ['d/2', 'L'], [0, 'L']] }] },
      { op: 'revolve', id: 'shaft', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } },
    ]),

  coupler: tree('Rigid shaft coupler: a stepped bore (5 mm for the motor shaft, 8 mm for the screw) in a 20 mm cylinder. Clamp screws not modelled. One revolve about local Z.',
    { D: D.couplerD, L: D.couplerLen, d_a: D.shaft, d_b: D.screw },
    [
      { op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_a/2', 0], ['D/2', 0], ['D/2', 'L'], ['d_b/2', 'L'], ['d_b/2', 'L/2'], ['d_a/2', 'L/2']] }] },
      { op: 'revolve', id: 'coupler', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } },
    ]),

  screw: tree('T8 lead screw stand-in: an 8 mm cylinder; the thread (2 mm lead) is not modelled. One extrude along local Z, placed along +Y.',
    { d: D.screw, L: D.screwLen },
    [
      { op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] },
      { op: 'extrude', id: 'screw', profile: 'section', depth: 'L' },
    ]),

  'end-block': tree('Far screw support: a block on the base with a plain 8.2 mm bearing bore, under the rails. One extrude along -Y.',
    { w: D.endBlockW, t: D.endBlockT, y1: D.endBlockY + D.endBlockT, base_top: D.baseTop, top: 12, d_bore: D.endBore },
    [
      { op: 'sketch', id: 'face', plane: { base: 'XZ', offset: '-y1' }, loops: [rect('outline', [0, '(base_top + top) / 2'], 'w', 'top - base_top'), circle('bore', [0, 0], 'd_bore / 2')] },
      { op: 'extrude', id: 'block', profile: 'face', depth: 't' },
    ]),

  nut: tree('T8 flange nut stand-in: 22 mm flange, 10 mm body, 8.4 mm bore (thread not modelled; the 0.2 mm is the thread clearance). Flange bolt holes are on the bracket, not here. One revolve about local Z.',
    { d_bore: D.nutBore, d_body: D.nutBody, L: D.nutLen, d_flange: D.flange, t_flange: D.flangeT },
    [
      { op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [['d_bore/2', 0], ['d_flange/2', 0], ['d_flange/2', 't_flange'], ['d_body/2', 't_flange'], ['d_body/2', 'L'], ['d_bore/2', 'L']] }] },
      { op: 'revolve', id: 'nut', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } },
    ]),

  'nut-bracket': tree('Nut carriage: a vertical plate (XZ) with the nut bore and the four flange bolt holes, a neck on top for the saddle. Slides 1 mm above the base; the links react its torque. One extrude along -Y.',
    { w: D.nbW, t: D.nbT, bottom: D.nbBottom, shoulder: D.nbShoulder, top: D.nbTop, neck: D.nbNeck, d_bore: D.nbBore, pcd: D.flangePcd, d_bolt: D.flangeBolt },
    [
      { op: 'sketch', id: 'face', plane: 'XZ', loops: [
        { name: 'outline', polygon: [['-w/2', 'bottom'], ['w/2', 'bottom'], ['w/2', 'shoulder'], ['neck/2', 'shoulder'], ['neck/2', 'top'], ['-neck/2', 'top'], ['-neck/2', 'shoulder'], ['-w/2', 'shoulder']] },
        circle('bore', [0, 0], 'd_bore / 2') ] },
      { op: 'sketch', id: 'bolt', plane: 'XZ', loops: [circle(null, ['pcd/2 * cos(deg(45))', 'pcd/2 * sin(deg(45))'], 'd_bolt / 2')] },
      { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' },
      { op: 'extrude', id: 'bracket', profile: ['face', 'bolts'], depth: 't' },
    ]),

  saddle: tree('Pin saddle: a flat plate keyed over the nut bracket neck (the window), carrying the two link pins 40 mm apart. Retained by the neck laterally; a drop of adhesive or one grub screw vertically (not modelled). One extrude along +Z.',
    { w: D.saddleW, h: D.saddleH, t: D.saddleT, z0: D.nbShoulder, win_w: D.nbNeck + 0.2, win_h: D.nbT + 0.2, span: D.pinSpan, d_pin: D.pin },
    [
      { op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, 0], 'w', 'h'), rect('window', [0, 0], 'win_w', 'win_h')] },
      { op: 'sketch', id: 'pin', plane: { base: 'XY', offset: 'z0' }, loops: [circle(null, ['-span/2', 0], 'd_pin / 2')] },
      { op: 'pattern', id: 'pins', of: 'pin', kind: 'linear', count: 2, step: ['span', 0], name: 'pin' },
      { op: 'extrude', id: 'saddle', profile: ['plate', 'pins'], depth: 't' },
    ]),

  link: tree('Link: a 72 mm dog-bone, 6 thick, with two 4.2 mm eyes (running clearance on 4 mm pins). Built along +X from eye 0; the assembly rotates it about Z. One extrude.',
    { L: D.link, r: D.linkW / 2, t: D.linkT, d_eye: D.pinClear },
    [
      { op: 'sketch', id: 'outline', loops: [{ name: 'body', path: { from: [0, '-r'], segs: [
        { to: ['L', '-r'] }, { arc: { via: ['L + r', 0], to: ['L', 'r'] } }, { to: [0, 'r'] }, { arc: { via: ['-r', 0], to: [0, '-r'] } } ] } }] },
      { op: 'sketch', id: 'eye', loops: [circle(null, [0, 0], 'd_eye / 2')] },
      { op: 'pattern', id: 'eyes', of: 'eye', kind: 'linear', count: 2, step: ['L', 0], name: 'eye' },
      { op: 'extrude', id: 'link', profile: ['outline', 'eyes'], depth: 't' },
    ]),

  pin: tree('A 4 mm pin, h long, along +Z. Press fit in the saddle or finger, running fit in the link eye. One extrude.',
    { d: D.pin, h: 14 },
    [
      { op: 'sketch', id: 'section', loops: [circle('od', [0, 0], 'd/2')] },
      { op: 'extrude', id: 'pin', profile: 'section', depth: 'h' },
    ]),

  rail: tree('A 6 mm round rail along X at height 16, at the y this instance is given. One extrude along +X.',
    { d: D.railD, y: D.railY[0], z: D.railZ, half: D.railHalf },
    [
      { op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [circle('od', ['y', 'z'], 'd/2')] },
      { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' },
    ]),

  'rail-block': tree('Rail end block: stands on the base at each end of the rails and holds both (press fit). One extrude along +X.',
    { t: D.railBlockT, w: D.railBlockW, yc: (D.railY[0] + D.railY[1]) / 2, base_top: D.baseTop, top: 24, ya: D.railY[0], yb: D.railY[1], z: D.railZ, d: D.railD },
    [
      { op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['yc', '(base_top + top) / 2'], 'w', 'top - base_top'), circle('railA', ['ya', 'z'], 'd/2'), circle('railB', ['yb', 'z'], 'd/2')] },
      { op: 'extrude', id: 'block', profile: 'face', depth: 't' },
    ]),

  slider: tree('Finger slider: rides both rails on 6.2 mm bores (printed plain bearings), with a neck on top that keys into the finger. One extrude along +X.',
    { L: D.sliderLen, y0: D.sliderY[0], y1: D.sliderY[1], z0: D.sliderZ[0], z1: D.sliderZ[1], n0: D.neckY[0], n1: D.neckY[1], zn: D.neckTop, ya: D.railY[0], yb: D.railY[1], zr: D.railZ, d: D.sliderBore },
    [
      { op: 'sketch', id: 'face', plane: 'YZ', loops: [
        { name: 'outline', polygon: [['y0', 'z0'], ['y1', 'z0'], ['y1', 'z1'], ['n1', 'z1'], ['n1', 'zn'], ['n0', 'zn'], ['n0', 'z1'], ['y0', 'z1']] },
        circle('railA', ['ya', 'zr'], 'd/2'), circle('railB', ['yb', 'zr'], 'd/2') ] },
      { op: 'extrude', id: 'slider', profile: 'face', depth: 'L' },
    ]),

  finger: tree('Finger: an L in plan, 12 thick — a mount that drops over the slider neck (the window) and an arm reaching inward to the pad face at x = 0 when closed. The link pin presses into the arm. side = 1 right, -1 left. One extrude along +Z.',
    { side: 1, half: D.fingerHalf, reach: reach(), y0: D.sliderY[0], y1: D.sliderY[1], y2: D.armY[1], z0: D.fingerZ[0], t: D.fingerZ[1] - D.fingerZ[0], win_w: D.sliderLen + 0.2, win_h: D.neckY[1] - D.neckY[0] + 0.2, yn: (D.neckY[0] + D.neckY[1]) / 2, y_pin: D.pinLine, d_pin: D.pin },
    [
      { op: 'sketch', id: 'plan', plane: { base: 'XY', offset: 'z0' }, loops: [
        { name: 'outline', polygon: [['-side * half', 'y0'], ['side * half', 'y0'], ['side * half', 'y2'], ['-side * reach', 'y2'], ['-side * reach', 'y1'], ['-side * half', 'y1']] },
        rect('window', [0, 'yn'], 'win_w', 'win_h'), circle('pin', [0, 'y_pin'], 'd_pin / 2') ] },
      { op: 'extrude', id: 'finger', profile: 'plan', depth: 't' },
    ]),
};

// ── the assembly at a pose ───────────────────────────────────────────────────
const alongY = { axis: [1, 0, 0], deg: -90 }; // local +Z → world +Y
export function assembly(yn = D.nutRef) {
  const p = pose(yn);
  const xf = round(p.xf, 3), phi = round(p.phi, 3);
  const c = (id, part, at, extra = {}) => ({ id, part, at: at.map((v) => round(v, 3)), ...extra });
  const components = [
    c('base', 'base', [0, 0, 0]),
    c('bracket', 'bracket', [0, 0, 0]),
    c('motor', 'motor', [0, 0, 0]),
    c('motor-shaft', 'motor-shaft', [0, -D.bracketT, 0], { rotate: alongY }),
    c('coupler', 'coupler', [0, D.couplerAt, 0], { rotate: alongY }),
    c('screw', 'screw', [0, D.screwAt, 0], { rotate: alongY }),
    c('end-block', 'end-block', [0, 0, 0]),
    c('nut', 'nut', [0, yn - D.nutLen / 2, 0], { rotate: alongY }),
    c('nut-bracket', 'nut-bracket', [0, yn + D.nbT / 2, 0]),
    c('saddle', 'saddle', [0, yn, 0]),
    c('pin-r', 'pin', [D.pinSpan / 2, yn, D.nbShoulder]),
    c('pin-l', 'pin', [-D.pinSpan / 2, yn, D.nbShoulder]),
    c('link-r', 'link', [D.pinSpan / 2, yn, D.linkZ], { rotate: { axis: [0, 0, 1], deg: phi } }),
    c('link-l', 'link', [-D.pinSpan / 2, yn, D.linkZ], { rotate: { axis: [0, 0, 1], deg: round(180 - phi, 3) } }),
    c('rail-a', 'rail', [0, 0, 0]),
    c('rail-b', 'rail', [0, 0, 0], { params: { y: D.railY[1] } }),
    c('rail-block-r', 'rail-block', [D.railBlockAt, 0, 0]),
    c('rail-block-l', 'rail-block', [-D.railBlockAt - D.railBlockT, 0, 0]),
    c('slider-r', 'slider', [xf - D.sliderLen / 2, 0, 0]),
    c('slider-l', 'slider', [-xf - D.sliderLen / 2, 0, 0]),
    c('finger-r', 'finger', [xf, 0, 0]),
    c('finger-l', 'finger', [-xf, 0, 0], { params: { side: -1 } }),
    c('finger-pin-r', 'pin', [xf, D.pinLine, D.fingerZ[0]], { params: { h: D.linkZ + D.linkT + 2 - D.fingerZ[0] } }),
    c('finger-pin-l', 'pin', [-xf, D.pinLine, D.fingerZ[0]], { params: { h: D.linkZ + D.linkT + 2 - D.fingerZ[0] } }),
  ];
  const fixed = (a, b) => ({ kind: 'fixed', a, b });
  const mates = [
    fixed('motor-shaft', 'coupler'), fixed('coupler', 'screw'),           // the spinning chain, from the drive
    fixed('pin-r', 'saddle'), fixed('pin-l', 'saddle'),                   // press fits
    fixed('finger-pin-r', 'finger-r'), fixed('finger-pin-l', 'finger-l'),
    fixed('rail-a', 'rail-block-r'), fixed('rail-a', 'rail-block-l'), fixed('rail-b', 'rail-block-r'), fixed('rail-b', 'rail-block-l'),
  ];
  return {
    $schema: 'com.minomobi.cad.assembly#v1',
    name: 'gripper',
    _: `Parallel-jaw gripper: NEMA 17 → coupler → T8 lead screw → flange nut in a bracket → saddle with two pins → two 72 mm links → two fingers on sliders riding two 6 mm rails. Posed with the nut bracket at y = ${yn} (closed ${D.nutClosed}, open ${D.nutOpen}): finger pins at x = ±${xf}, pad gap ${round(p.gap, 1)} mm, link angle ${phi}°. Linear motion is not a mate kind, so the pose is baked in: regenerate with \`node gripper.mjs --nut <y>\`. The drive spins the motor shaft, coupler and screw for the record.`,
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, structuredClone(v)])),
    components, mates,
    drive: { component: 'motor-shaft', rpm: 60 },
  };
}

// ── analytic clearances: the things an interference check would find ────────
export function audit() {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: cond, detail });
  const r = reach();
  for (const yn of [D.nutClosed, D.nutRef, D.nutOpen]) {
    const p = pose(yn);
    ok(`nut ${yn}: nut clear of coupler`, yn - D.nutLen / 2 > D.couplerAt + D.couplerLen, `${yn - D.nutLen / 2} > ${D.couplerAt + D.couplerLen}`);
    ok(`nut ${yn}: nut clear of end block`, yn + D.nutLen / 2 < D.endBlockY, `${yn + D.nutLen / 2} < ${D.endBlockY}`);
    ok(`nut ${yn}: saddle clear of fingers`, yn + D.saddleH / 2 < D.sliderY[0], `${yn + D.saddleH / 2} < ${D.sliderY[0]}`);
    ok(`nut ${yn}: finger mount inside the rail blocks`, p.xf + D.fingerHalf < D.railBlockAt, `${round(p.xf + D.fingerHalf)} < ${D.railBlockAt}`);
    ok(`nut ${yn}: pads do not cross`, p.xf - r >= -1e-9, `gap ${round(p.gap)}`);
    ok(`nut ${yn}: link not near lock`, p.dy / D.link < 0.97, `Δy/L = ${round(p.dy / D.link, 3)}`);
  }
  ok('motor body above the base', -D.motor / 2 > D.baseTop, `${-D.motor / 2} > ${D.baseTop}`);
  ok('shaft ends inside the coupler 8 mm bore', -D.bracketT + D.shaftLen > D.couplerAt + D.couplerLen / 2 && -D.bracketT + D.shaftLen < D.screwAt, `${-D.bracketT + D.shaftLen}`);
  ok('screw starts inside the coupler 8 mm bore', D.screwAt > D.couplerAt + D.couplerLen / 2 && D.screwAt < D.couplerAt + D.couplerLen, `${D.screwAt}`);
  ok('screw passes the end block', D.screwAt + D.screwLen > D.endBlockY + D.endBlockT, `${D.screwAt + D.screwLen} > ${D.endBlockY + D.endBlockT}`);
  ok('rails clear the end block', D.railZ - D.railD / 2 > 12, `${D.railZ - D.railD / 2} > 12`);
  ok('links above the fingers', D.linkZ >= D.fingerZ[1], `${D.linkZ} ≥ ${D.fingerZ[1]}`);
  ok('links start on the bracket top', D.linkZ === D.nbTop && D.nbShoulder + D.saddleT === D.nbTop, `${D.linkZ}`);
  ok('finger sits on the slider shoulders', D.fingerZ[0] === D.sliderZ[1] && D.neckTop < D.fingerZ[1], `${D.fingerZ[0]} = ${D.sliderZ[1]}`);
  ok('closed pads meet at x = 0', Math.abs(pose(D.nutClosed).xf - r) < 0.01, `x_f ${round(pose(D.nutClosed).xf, 3)} vs reach ${r}`);
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
export const expected = {
  _: 'Closed-form volumes of the parts the mechanism is measured against; mm³. The kernel must land within tol (relative).',
  base: { volume: 2 * D.baseX * (D.baseY[1] - D.baseY[0]) * D.baseT - 4 * Math.PI * (D.mountD / 2) ** 2 * D.baseT, tol: 0.002 },
  bracket: { volume: D.bracketW * D.bracketH * D.bracketT - Math.PI * (D.pilot / 2) ** 2 * D.bracketT - 4 * Math.PI * (D.bolt / 2) ** 2 * D.bracketT, tol: 0.002 },
  rail: { volume: Math.PI * (D.railD / 2) ** 2 * 2 * D.railHalf, tol: 0.002 },
  screw: { volume: Math.PI * (D.screw / 2) ** 2 * D.screwLen, tol: 0.002 },
  saddle: { volume: (D.saddleW * D.saddleH - (D.nbNeck + 0.2) * (D.nbT + 0.2) - 2 * Math.PI * (D.pin / 2) ** 2) * D.saddleT, tol: 0.002 },
  link: { volume: (D.link * D.linkW + Math.PI * (D.linkW / 2) ** 2 - 2 * Math.PI * (D.pinClear / 2) ** 2) * D.linkT, tol: 0.002 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
};

// ── main ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const yn = Number(opt('--nut', D.nutRef));
  const out = opt('--out', path.dirname(new URL(import.meta.url).pathname));
  const asm = assembly(yn);
  if (has('--print')) { process.stdout.write(JSON.stringify(asm, null, 1) + '\n'); process.exit(0); }
  fs.mkdirSync(path.join(out, 'parts'), { recursive: true });
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(out, 'parts', `${k}.json`), JSON.stringify(v, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'gripper.json'), JSON.stringify(asm, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
  const rows = [D.nutClosed, D.nutRef, D.nutOpen].map((y) => { const p = pose(y); return { nut_y: y, finger_x: round(p.xf), pad_gap: round(p.gap, 1), link_deg: round(p.phi, 1), finger_per_nut: round(1 / p.ratio, 2) }; });
  console.table(rows);
  const a = audit(); for (const r of a) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.detail}`);
  console.log(`stroke ${D.nutOpen - D.nutClosed} mm of nut = ${(D.nutOpen - D.nutClosed) / D.lead} turns of a T8×${D.lead}; wrote ${Object.keys(parts).length} parts + gripper.json (nut at ${yn}) to ${out}`);
  if (a.some((r) => !r.ok)) process.exit(1);
}
