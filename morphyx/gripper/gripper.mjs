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
  // the frame: a motor plate and a rail plate, two pillars between them, two 4 mm side walls at x ±40…44
  W: 88, wall: 4, zBot: -22, zTop: 22, frontY: 64, frontT: 6, frontW: 98, caseBolt: 3.4, caseBoltZ: 16,
  // motor: NEMA 17 pancake, on the OUTSIDE of the motor plate, y 0…22
  motor: 42.3, motorChamfer: 5, motorY: 0, motorLen: 22, pilot: 22.5, boltSquare: 31, bolt: 3.4, bulkheadT: 6,
  screw: 8, lead: 2, screwEnd: 70, journal: 6, journalLen: 6, endBore: 6.2, collarD: 14, collarL: 4, collarY: 28,
  // the pillars: Ø10 bodies on the grip plane, an M8 nutted end into the motor plate and an M8 thread into the rail plate
  pillarX: 24, pillarD: 10, pillarBore: 10.2, pillarThread: 8, pillarCore: 6.8, pillarNut: 6.5, pillarTap: 6, pillarClear: 8.4,
  // nut and carriage: the carriage hangs on the nut and runs on the pillars through its arms
  nutBore: 8.4, nutBody: 10, nutLen: 15, flange: 22, flangeT: 3.5, nutPcd: 16, nutBolt: 3.5,
  carT: 14, carBackT: 4, carHalf: 14.5, carZ: 14, notchX: 9,
  // the pivot arms: 22 thick so the links seat on them, keyed into the carriage, bored for the pillar
  armX0: 9.1, armHalf: 39, armT: 22, armZ0: -11, pivotX: 34, pivotY: 4,
  // the linkage: struts in compression during grip; Ø4 dowels in bronze bushings
  link: 40, linkW: 10, linkT: 6, eye: 6, pin: 4, bushBore: 4.1, pinLen: 34,
  linkZ: [[-17, -11], [11, 17]],
  // stroke: the jaw pin 5.5 mm from its plate's inner edge, so the plates meet on the centre line at closed
  xpClosed: 5.5, xpOpen: 20.5, pivotLine: 86, inset: 10.5,
  // the guide, outside: one MGN9 rail on the OUTER face of the rail plate's strip, over the screw's blind bore
  railW: 9, railH: 6.5, railHalf: 46.5, railTapX: [10, 36], railTap: 2.5,
  blockL: 28.9, blockW: 20, blockH: 10, blockH1: 2, blockChannelW: 10, blockChannelH: 5, blockPattern: [10, 15], blockBolt: 3.4,
  // the jaw plate: the pin off its centre line, the finger pattern on the outboard side of the pin
  carrierHalf: 16, carrierZ: 11, carrierT: 8, fingerBolt: 4.3, fingerBoltX: [0, 11], fingerBoltZ: 7, fingerDowel: 5,
  wallSlotZ: [10.6, 17.4], wallSlotX: [8, 40],
  rpm: 5, mu: 0.25, muBall: 0.005, thrust: 120, fingerTipY: 145,
};
D.zc = 0;
D.travel = D.xpOpen - D.xpClosed;
D.inner = D.W / 2 - D.wall;
D.bulkheadY = [D.motorY + D.motorLen, D.motorY + D.motorLen + D.bulkheadT];
D.cavityY = [D.bulkheadY[1], D.frontY];                           // motor plate to rail plate: all of it swept
D.armY = [-D.carT / 2 + D.carBackT, D.carT / 2];                  // the arm fills the key plate only; its back face bears on the back plate
D.pillarY = [D.bulkheadY[0], D.frontY + D.pillarTap];            // flush with the motor plate's back face: nothing protrudes behind it
D.pillarShoulder = D.bulkheadY[1] + D.pillarNut;                  // the nut sits on the plate's INNER face, inside the cavity
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
  bulkhead: xzPlate('plate', 'Motor plate \u2014 the back of the cavity and the plane the grip load passes through. The NEMA 17 hangs on its outside on the pilot and four M3; the thrust collar bears on its inside. Two \u00d88.4 clearance holes at x \u00b124 take the pillars\u2019 M8 ends, nutted behind it, clear of the motor\u2019s square. Four \u00d83.4 at the corners into the side walls. The tool interface belongs here; it is not drawn yet. One extrude along -Y.',
    { w: D.W, zb: D.zBot, zt: D.zTop, t: D.bulkheadT, d_pilot: D.pilot, sq: D.boltSquare, d_bolt: D.bolt, ppx: D.pillarX, d_pillar: D.pillarClear, cx: (D.inner + D.W / 2) / 2, cz: D.caseBoltZ, d_case: D.caseBolt }, D.bulkheadY[1],
    [rect('outline', [0, 0], 'w', 'zt - zb'), circle('pilot', [0, 0], 'd_pilot / 2'),
     circle('pillarR', ['ppx', 0], 'd_pillar / 2'), circle('pillarL', ['-ppx', 0], 'd_pillar / 2'),
     circle('caseA', ['-cx', '-cz'], 'd_case / 2'), circle('caseB', ['cx', '-cz'], 'd_case / 2'), circle('caseC', ['-cx', 'cz'], 'd_case / 2'), circle('caseD', ['cx', 'cz'], 'd_case / 2')],
    [{ op: 'sketch', id: 'bolt', plane: { base: 'XZ', offset: '-y1' }, loops: [circle(null, ['sq/2', 'sq/2'], 'd_bolt / 2')] },
     { op: 'pattern', id: 'bolts', of: 'bolt', kind: 'circular', count: 4, name: 'bolt' }]),

  'front-wall': xzPlate('plate', 'Front wall — the slotted plate, turned around from v6. The strip across its middle carries the MGN9 rail on its OUTER face, tapped M3 at 20 pitch, and the screw’s Ø6.2 journal runs in a blind bore at its centre, closed by the rail itself. Either side of the strip a long slot lets a coupling link pass through, over and under the rail. Two M8 tapped holes at x \u00b124 take the pillars \u2014 drawn at the tap drill, blind because the rail closes them off. Four \u00d83.4 at the corners into the side walls. One extrude along -Y.',
    { w: D.frontW, zb: D.zBot, zt: D.zTop, t: D.frontT, d_bore: D.endBore, sz0: D.wallSlotZ[0], sz1: D.wallSlotZ[1], sx0: D.wallSlotX[0], sx1: D.wallSlotX[1], d_tap: D.railTap, tx0: D.railTapX[0], tx1: D.railTapX[1], cx: (D.inner + D.W / 2) / 2, cz: D.caseBoltZ, d_case: D.caseBolt, ppx: D.pillarX, d_pillar: D.pillarCore }, D.frontY + D.frontT,
    [rect('outline', [0, '(zb + zt) / 2'], 'w', 'zt - zb'), circle('bore', [0, 0], 'd_bore / 2'),
     circle('caseA', ['-cx', '-cz'], 'd_case / 2'), circle('caseB', ['cx', '-cz'], 'd_case / 2'), circle('caseC', ['-cx', 'cz'], 'd_case / 2'), circle('caseD', ['cx', 'cz'], 'd_case / 2'),
     circle('pillarR', ['ppx', 0], 'd_pillar / 2'), circle('pillarL', ['-ppx', 0], 'd_pillar / 2'),
     rect('slotRlo', ['(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotRhi', ['(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     rect('slotLlo', ['-(sx0 + sx1) / 2', '-(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'), rect('slotLhi', ['-(sx0 + sx1) / 2', '(sz0 + sz1) / 2'], 'sx1 - sx0', 'sz1 - sz0'),
     circle('tapA', ['-tx1', 0], 'd_tap / 2'), circle('tapB', ['-tx0', 0], 'd_tap / 2'),
     circle('tapC', ['tx0', 0], 'd_tap / 2'), circle('tapD', ['tx1', 0], 'd_tap / 2')]),

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
     // the cut clears both faces by 4: at 3 and at 6 this same boolean returns the same volume to four decimals but leaks (\u03c7 \u22126, four open edges), and `build` still says ok \u2014 the overhang is tuned by trial
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
    { D: D.eye, L: D.linkT, d: D.bushBore },
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

  pillar: tree('Pillar: the frame\u2019s primary member. A \u00d810 body between the two plates, with an M8 end at each. It threads into the rail plate ahead and passes through the motor plate behind, where a nut on the plate\u2019s INNER face takes the tension \u2014 grip pulls the pillar forward and the plate back, so that nut is exactly the load path, and nothing protrudes behind the plate to foul the motor. The shoulder takes the compression. It also pierces its pivot arm, so it is the plunger\u2019s alignment rail and its anti-rotation. Two per gripper, on the grip plane at x \u00b124. Threads are modelled at their minor diameter. One revolve about local Z, placed along +Y.',
    { d: D.pillarD, dt: D.pillarThread, dc: D.pillarCore, nut: D.bulkheadT + D.pillarNut, tap: D.pillarTap, body: D.frontY - D.pillarShoulder },
    [{ op: 'sketch', id: 'profile', plane: 'XZ', loops: [{ name: 'body', polygon: [[0, 0], ['dt/2', 0], ['dt/2', 'nut'], ['d/2', 'nut'], ['d/2', 'nut + body'], ['dc/2', 'nut + body'], ['dc/2', 'nut + body + tap'], [0, 'nut + body + tap']] }] },
     { op: 'revolve', id: 'pillar', profile: 'profile', axis: { p: [0, 0], d: [0, 1] } }]),

  block: tree('MGN9C linear block stand-in: 20 × 10 × 28.9, wrapping the rail with a 10 × 5 channel, its base 2 mm off the wall. Its four M3 face +Y, into the jaw carrier. One extrude along +X.',
    { L: D.blockL, y0: D.blockY[0], y1: D.blockY[1], w: D.blockW, cw: D.blockChannelW, ch: D.blockChannelH },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [{ name: 'outline', polygon: [['y1', '-w/2'], ['y0', '-w/2'], ['y0', '-cw/2'], ['y0 + ch', '-cw/2'], ['y0 + ch', 'cw/2'], ['y0', 'cw/2'], ['y0', 'w/2'], ['y1', 'w/2']] }] },
     { op: 'extrude', id: 'block', profile: 'face', depth: 'L' }]),

  rail: tree('MGN9 rail stand-in: 9 × 6.5 section, 104 long, on the OUTER face of the front wall’s strip, centred on z = 0, closing the screw’s journal bore behind it (its own counterbores are not modelled; the wall’s tapped holes are). One extrude along +X.',
    { w: D.railW, h: D.railH, y0: D.railY[0], half: D.railHalf },
    [{ op: 'sketch', id: 'section', plane: { base: 'YZ', offset: '-half' }, loops: [rect('outline', ['y0 + h/2', 0], 'h', 'w')] }, { op: 'extrude', id: 'rail', profile: 'section', depth: '2 * half' }]),

  'side-wall': tree('Side wall: 4 mm, spanning the cavity from the motor plate to the rail plate, bolted to both. It is no longer the load member \u2014 the pillars carry the grip \u2014 so its job is torsion and shear. Built at local x 0..4; the assembly places one at each side. One extrude along +X.',
    { t: D.wall, y0: D.cavityY[0], y1: D.cavityY[1], z0: D.zBot, z1: D.zTop },
    [{ op: 'sketch', id: 'face', plane: 'YZ', loops: [rect('outline', ['(y0 + y1) / 2', '(z0 + z1) / 2'], 'y1 - y0', 'z1 - z0')] },
     { op: 'extrude', id: 'wall', profile: 'face', depth: 't' }]),

  floor: tree('Floor cover over the plunger cavity, inset between the side walls. It carries no load. One extrude along +Z.',
    { w: 2 * D.inner, y0: D.cavityY[0], y1: D.cavityY[1], t: D.wall - 2, z0: D.zBot },
    [{ op: 'sketch', id: 'plate', plane: { base: 'XY', offset: 'z0' }, loops: [rect('outline', [0, '(y0 + y1) / 2'], 'w', 'y1 - y0')] }, { op: 'extrude', id: 'floor', profile: 'plate', depth: 't' }]),

  lid: tree('Lid over the plunger cavity, inset between the side walls, with an access window over the linkage. It carries no load. One extrude along +Z.',
    { w: 2 * D.inner, y0: D.cavityY[0], y1: D.cavityY[1], t: D.wall - 2, z0: D.zTop - D.wall + 2, win_w: 2 * D.inner - 20, win_y0: D.ynOpen - 4, win_y1: D.frontY - 4 },
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
  const params = { ynOpen: round(D.ynOpen, 4), ynClosed: round(D.ynClosed, 4), lead: D.lead, L: D.link, px: D.pivotX, py: D.pivotY, yf: D.pivotLine, inset: D.inset, flangeT: D.flangeT, carT: D.carT, carFrontT: D.carT - D.carBackT,
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
  const backAt = stroke ? [0, 'ynOpen + carT / 2 - carFrontT', 0] : [0, 'yn + carT / 2 - carFrontT', 0];
  const nutAt = stroke ? [0, 'ynOpen - carT / 2 - flangeT', 0] : [0, 'yn - carT / 2 - flangeT', 0];
  const armAt = stroke ? [0, 'ynOpen', 0] : [0, 'yn', 0];
  const components = [
    ...(stroke ? [] : [c('clock', 'pin', [0, -20, D.zc], { params: { h: 1 }, reference: true })]),
    c('floor', 'floor', [0, 0, 0]),
    c('lid', 'lid', [0, 0, 0]),
    c('wall', 'side-wall', [`${side} * ${D.W / 2 - D.wall} - (1 - ${side}) / 2 * ${D.wall}`, 0, 0], { repeat: 2 }),
    c('bulkhead', 'bulkhead', [0, 0, 0]),
    c('front-wall', 'front-wall', [0, 0, 0]),
    c('motor', 'motor', [0, 0, 0]),
    { id: 'drivetrain', assembly: drivetrain, at: [0, D.motorY + D.motorLen, 0], rotate: alongY },
    c('nut', 'nut', nutAt, { rotate: alongY }),
    c('carriage', 'carriage', carriageAt),
    c('carriage-back', 'carriage-back', backAt),
    c('arm', 'arm', armAt, { repeat: 2, params: { side } }),
    c('rail', 'rail', [0, 0, 0]),
    c('pillar', 'pillar', [`${side} * ${D.pillarX}`, D.pillarY[0], 0], { repeat: 2, rotate: alongY }),
    c('block', 'block', [`${side} * xf - blockL / 2`, 0, 0], { repeat: 2 }),
    // the jaw plates: the pin is off the plate's centre line, so the left one is the right one turned 180° about Y (its section is symmetric about z = 0)
    c('carrier', 'carrier', [`${side} * xf`, 0, 0], { repeat: 2, rotate: { axis: [0, 1, 0], deg: `90 * (1 - ${side})` } }),
    // the arm pins and the jaw pins are both placed by expression: the arm's pillar bore and the jaw plate's pin hole are cuts, so neither part's faces are named
    { id: 'arm-pin', part: 'pin', repeat: 2, at: [`${side} * px`, 'yn + py', D.linkZ[0][0]] },
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
    ] : [fixed('nut', 'carriage-back')]),                               // the flange on the back plate's rear face: an expected touch
    fixed('carriage', 'carriage-back'),                                 // the two plates of the carriage, on the same four bolts
    fixed('carriage', 'arm[0]'), fixed('carriage', 'arm[1]'),           // keyed into the slots; in the stroke document this carries the mate's travel
    fixed('jaw-pin[0]', 'carrier[0]'), fixed('jaw-pin[1]', 'carrier[1]'),   // press fits
    // the arm pins are placed by expression on `yn`, and the arms travel by the screw mate through the carriage, so a fixed mate here would carry that travel a second time
    ...(stroke ? [] : [fixed('arm-pin[0]', 'arm[0]'), fixed('arm-pin[1]', 'arm[1]')]),
    ...[0, 1, 2, 3].flatMap((k) => [fixed(`bush[${2 * k}]`, `link[${k}]`), fixed(`bush[${2 * k + 1}]`, `link[${k}]`)]),
    fixed('carrier[0]', 'block[0]'), fixed('carrier[1]', 'block[1]'),   // 4 × M3 into the block's face
    fixed('rail', 'front-wall'),                                        // M3 at 20 pitch into the strip
    // the box: the side walls are the tension member. The flange plate and the front wall bolt into their end faces along Y; the back wall keys into a mortise in each and bears on it
    fixed('front-wall', 'wall[0]'), fixed('front-wall', 'wall[1]'), fixed('bulkhead', 'wall[0]'), fixed('bulkhead', 'wall[1]'), fixed('bulkhead', 'motor'),
    fixed('pillar[0]', 'bulkhead'), fixed('pillar[1]', 'bulkhead'), fixed('pillar[0]', 'front-wall'), fixed('pillar[1]', 'front-wall'),   // M8 each end: the frame's tension member
    fixed('floor', 'wall[0]'), fixed('floor', 'wall[1]'), fixed('floor', 'front-wall'), fixed('floor', 'bulkhead'),
    fixed('lid', 'wall[0]'), fixed('lid', 'wall[1]'), fixed('lid', 'front-wall'), fixed('lid', 'bulkhead'),
  ];
  // What this design intends at each interface, so the clearance table judges it on its own numbers.
  // `[*]` is a cross product — it would match arm-pin[0] against every bushing, not the two it carries —
  // so every pair a repeat makes is enumerated. k: 0 right-lower, 1 left-lower, 2 right-upper, 3 left-upper.
  const fits = [
    { a: 'arm[0]', b: 'pillar[0]', min: 0.05, max: 0.2 }, { a: 'arm[1]', b: 'pillar[1]', min: 0.05, max: 0.2 },   // the plunger's alignment rail
    { a: 'drivetrain/screw', b: 'nut', min: 0.1, max: 0.3 },           // thread clearance, thread not modelled
    { a: 'bulkhead', b: 'pillar[0]', min: 0.1, max: 0.3 }, { a: 'bulkhead', b: 'pillar[1]', min: 0.1, max: 0.3 },
    { a: 'carriage', b: 'arm[0]', contact: true }, { a: 'carriage', b: 'arm[1]', contact: true },
    { a: 'carriage', b: 'carriage-back', contact: true },              // the two plates, bolted face to face
    { a: 'carriage-back', b: 'arm[0]', contact: true }, { a: 'carriage-back', b: 'arm[1]', contact: true },   // the thrust joint: the arm bears on this face
    { a: 'nut', b: 'carriage-back', contact: true },
    { a: 'carrier[0]', b: 'block[0]', contact: true }, { a: 'carrier[1]', b: 'block[1]', contact: true },
    { a: 'carrier[0]', b: 'carrier[1]', min: 0, max: 40 },             // they meet on the centre line at closed and part by the travel
    { a: 'motor', b: 'pillar[0]', contact: true }, { a: 'motor', b: 'pillar[1]', contact: true },
    { a: 'rail', b: 'pillar[0]', contact: true }, { a: 'rail', b: 'pillar[1]', contact: true },
    { a: 'front-wall', b: 'pillar[0]', contact: true }, { a: 'front-wall', b: 'pillar[1]', contact: true },
    { a: 'front-wall', b: 'drivetrain/screw', contact: true }, { a: 'rail', b: 'drivetrain/screw', contact: true },
    { a: 'motor', b: 'drivetrain/screw', contact: true }, { a: 'drivetrain/screw', b: 'drivetrain/collar', contact: true },
    ...[0, 1].flatMap((i) => [{ a: 'rail', b: `block[${i}]`, min: 0.3, max: 0.7 }, ...[0, 1, 2, 3].map((k) => ({ a: 'front-wall', b: `link[${k}]`, min: 0.25, max: 0.6 }))]),
    // each link k: its two bushings are pressed in, its arm-end bushing runs on arm-pin[k % 2] and its jaw-end one on jaw-pin[k % 2],
    // and the pin stands 1 mm off the link's own eye wall through the bushing
    ...[0, 1, 2, 3].flatMap((k) => [
      { a: `link[${k}]`, b: `bush[${2 * k}]`, contact: true }, { a: `link[${k}]`, b: `bush[${2 * k + 1}]`, contact: true },
      { a: `arm-pin[${k % 2}]`, b: `bush[${2 * k}]`, min: 0.02, max: 0.1 }, { a: `jaw-pin[${k % 2}]`, b: `bush[${2 * k + 1}]`, min: 0.02, max: 0.1 },
      { a: `arm-pin[${k % 2}]`, b: `link[${k}]`, min: 0.9, max: 1.1 }, { a: `jaw-pin[${k % 2}]`, b: `link[${k}]`, min: 0.9, max: 1.1 },
      { a: `arm[${k % 2}]`, b: `link[${k}]`, contact: true }, { a: `carrier[${k % 2}]`, b: `link[${k}]`, contact: true },
      { a: `arm[${k % 2}]`, b: `bush[${2 * k}]`, contact: true }, { a: `carrier[${k % 2}]`, b: `bush[${2 * k + 1}]`, contact: true },
      { a: `arm[${1 - k % 2}]`, b: `link[${k}]`, min: 0.4 }, { a: `carrier[${1 - k % 2}]`, b: `link[${k}]`, min: 0.4 },
    ]),
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
    components, mates, fits,
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
  const inner = D.inner, r = D.linkW / 2, bh = D.blockL / 2;
  for (const xp of [D.xpClosed, (D.xpClosed + D.xpOpen) / 2, D.xpOpen]) {
    const p = pose(xp);
    ok(`xp ${xp}: nut clear of the collar`, p.yn - D.carT / 2 - D.flangeT > D.collarY + D.collarL, `${round(p.yn - D.carT / 2 - D.flangeT)} > ${D.collarY + D.collarL}`);
    ok(`xp ${xp}: carriage 2 mm behind the front wall`, p.carFront + 2 <= D.frontY, `${round(p.carFront)} + 2 ≤ ${D.frontY}`);
    ok(`xp ${xp}: arms and link eyes inside the side walls`, D.pivotX + r < inner && D.armHalf < inner, `${D.pivotX + r}, ${D.armHalf} < ${inner}`);
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
  ok('the motor is outside, and nothing of the frame reaches into its square', D.motorY + D.motorLen === D.cavityY[0] - D.bulkheadT && D.pillarY[0] >= D.motorY + D.motorLen, `motor to y ${D.motorY + D.motorLen}, pillars from ${D.pillarY[0]}`);
  ok('the cavity is cut to the plunger sweep', D.cavityY[1] - D.cavityY[0] <= 40 && D.ynOpen - D.carT / 2 - D.flangeT - D.nutLen + D.nutLen > D.cavityY[0], `${round(D.cavityY[1] - D.cavityY[0])} mm of cavity for ${round(D.ynClosed - D.ynOpen + D.carT + D.flangeT)} mm of sweep`);
  ok('nothing behind the motor plate but the motor', D.motorY === 0 && D.pillarY[0] >= D.bulkheadY[0], `motor ${D.motorY}…${D.motorY + D.motorLen}; the pillars stop flush at ${D.pillarY[0]}`);
  ok('the pillars pierce their arms and clear the pivot pins and the carriage', D.pillarX + D.pillarD / 2 < D.armHalf && D.pillarX - D.pillarD / 2 > D.carHalf + 3 && D.pivotX - D.pillarX > (D.pin + D.pillarD) / 2 + 2, `pillar x ${D.pillarX} ±${D.pillarD / 2}, pivot at ${D.pivotX}, carriage to ${D.carHalf}`);
  ok('the side walls span the cavity only', D.cavityY[0] === D.bulkheadY[1] && D.cavityY[1] === D.frontY, `walls y ${D.cavityY}`);
  ok('the pillars take the grip, the side walls take torsion', D.caseBoltZ + D.caseBolt / 2 + 2 <= D.zTop && D.pillarD >= 8 && D.pillarThread >= 8, `two Ø${D.pillarD} pillars with M${D.pillarThread} ends; ${D.wall} mm walls`);
  ok('the case bolts land on the side walls', Math.abs((D.inner + D.W / 2) / 2 - (D.inner + D.wall / 2)) < 0.01, `bolt x ±${(D.inner + D.W / 2) / 2}, wall ${D.inner}…${D.W / 2}`);
  ok('the covers clear the links and carry nothing', D.wall - 2 > 0 && D.zTop - D.wall + 2 >= D.linkZ[1][1] + 1 && D.zBot + (D.wall - 2) <= D.linkZ[0][0] - 1, `covers at z ${D.zBot}…${D.zBot + D.wall - 2} and ${D.zTop - D.wall + 2}…${D.zTop}, links ±${D.linkZ[1][1]}`);
  ok('the pillars are flush behind and tapped ahead, and their nuts clear the arms', D.pillarY[0] === D.bulkheadY[0] && D.pillarY[1] === D.frontY + D.pillarTap && D.pillarClear > D.pillarThread && D.ynOpen - D.carT / 2 >= D.pillarShoulder + 2, `nut face ${D.pillarShoulder}, arm back to ${round(D.ynOpen - D.carT / 2, 1)}`);
  // the guide and the linkage
  ok('the rail is on the OUTER face, over the blind bore', D.railY[0] === D.frontY + D.frontT && D.screwEnd <= D.railY[0], `rail from ${D.railY[0]}; screw ends ${D.screwEnd}`);
  ok('the strip carries the rail, and the rail closes the pillar taps and the bore', D.wallSlotZ[0] > D.railW / 2 + 4 && D.railTapX[D.railTapX.length - 1] + D.railTap / 2 < D.railHalf && D.railTapX.every((x) => Math.abs(x - D.pillarX) > (D.railTap + D.pillarCore) / 2 + 2) && D.pillarX + D.pillarCore / 2 < D.railHalf, `strip ±${D.wallSlotZ[0]}, taps ${D.railTapX}, pillars ±${D.pillarX}`);
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
  ok('the screw reaches the nut and stops at the wall', D.screwEnd - D.journalLen >= D.ynClosed - D.carT / 2 + D.nutLen - D.flangeT && D.screwEnd <= D.frontY + D.frontT, `journal from ${D.screwEnd - D.journalLen}, nut front ${round(D.ynClosed - D.carT / 2 - D.flangeT + D.nutLen)}`);
  ok('no fingers in the assembly', !('finger' in parts), 'the finger is the customer\u2019s part');
  return out;
}

// ── closed forms, for the report ─────────────────────────────────────────────
const A = Math.PI / 4;
export const expected = {
  _: 'Closed-form volumes of every part; mm³. The kernel must land within tol (relative).',
  bulkhead: { volume: (D.W * (D.zTop - D.zBot) - A * D.pilot ** 2 - 4 * A * D.bolt ** 2 - 2 * A * D.pillarClear ** 2 - 4 * A * D.caseBolt ** 2) * D.bulkheadT, tol: 0.002 },
  'front-wall': { volume: (D.frontW * (D.zTop - D.zBot) - A * D.endBore ** 2 - 4 * A * D.caseBolt ** 2 - 2 * A * D.pillarCore ** 2 - 4 * (D.wallSlotX[1] - D.wallSlotX[0]) * (D.wallSlotZ[1] - D.wallSlotZ[0]) - 2 * D.railTapX.length * A * D.railTap ** 2) * D.frontT, tol: 0.002 },
  carriage: { volume: (4 * D.carHalf * D.carZ - 2 * (D.carHalf - D.notchX) * (D.armT + 0.2) - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * (D.carT - D.carBackT), tol: 0.002 },
  'carriage-back': { volume: (4 * D.carHalf * D.carZ - A * (D.nutBore + 1.8) ** 2 - 4 * A * D.nutBolt ** 2) * D.carBackT, tol: 0.002 },
  arm: { volume: ((D.armHalf - D.armX0) * (D.armY[1] - D.armY[0]) - A * D.pin ** 2) * D.armT - A * D.pillarBore ** 2 * (D.armY[1] - D.armY[0]), tol: 0.004 },
  pillar: { volume: A * (D.pillarThread ** 2 * (D.bulkheadT + D.pillarNut) + D.pillarD ** 2 * (D.frontY - D.pillarShoulder) + D.pillarCore ** 2 * D.pillarTap), tol: 0.004 },
  carrier: { volume: (4 * D.carrierHalf * D.carrierZ - 4 * A * D.blockBolt ** 2 - 4 * A * D.fingerBolt ** 2 - 2 * A * D.fingerDowel ** 2) * D.carrierT - A * D.pin ** 2 * 2 * D.carrierZ, tol: 0.004 },
  link: { volume: (D.link * D.linkW + A * D.linkW ** 2 - 2 * A * D.eye ** 2) * D.linkT, tol: 0.002 },
  bushing: { volume: A * (D.eye ** 2 - D.bushBore ** 2) * D.linkT, tol: 0.004 },
  pin: { volume: A * D.pin ** 2 * D.pinLen, tol: 0.004 },
  rail: { volume: D.railW * D.railH * 2 * D.railHalf, tol: 0.002 },
  block: { volume: (D.blockW * (D.blockY[1] - D.blockY[0]) - D.blockChannelW * D.blockChannelH) * D.blockL, tol: 0.002 },
  collar: { volume: A * (D.collarD ** 2 - D.screw ** 2) * D.collarL, tol: 0.002 },
  screw: { volume: A * D.screw ** 2 * (D.screwEnd - D.motorY - D.motorLen - D.journalLen) + A * D.journal ** 2 * D.journalLen, tol: 0.004 },
  nut: { volume: Math.PI * ((D.flange / 2) ** 2 * D.flangeT + (D.nutBody / 2) ** 2 * (D.nutLen - D.flangeT) - (D.nutBore / 2) ** 2 * D.nutLen), tol: 0.002 },
  floor: { volume: 2 * D.inner * (D.cavityY[1] - D.cavityY[0]) * (D.wall - 2), tol: 0.002 },
  'side-wall': { volume: (D.cavityY[1] - D.cavityY[0]) * (D.zTop - D.zBot) * D.wall, tol: 0.002 },
  lid: { volume: (2 * D.inner * (D.cavityY[1] - D.cavityY[0]) - (2 * D.inner - 20) * (D.frontY - 4 - (D.ynOpen - 4))) * (D.wall - 2), tol: 0.002 },
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
