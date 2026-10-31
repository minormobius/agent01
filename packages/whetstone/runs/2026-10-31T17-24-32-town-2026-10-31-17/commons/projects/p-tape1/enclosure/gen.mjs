// node enclosure/gen.mjs — writes the enclosure's CAD trees from one set of numbers.
// Printed parts go in enclosure/*.json (the lab builds each). Reference solids that are not
// printed (the air behind the driver, the driver's bounding cylinder) go in enclosure/ref/.
// Every number that matters is here; the trees carry them as params so the engine can be asked.
// Layout (lid seen from above, x right, y up, origin at the lid's centre):
//   nest (card pocket) on the left, grille over the speaker on the right, two arcade buttons
//   bottom-left, the volume pot bottom-right. The speaker pod hangs under the grille, away from
//   the nest, so no metal (the driver's magnet) sits over the PN532 antenna.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const P = {
  // box
  L: 190, W: 130, H: 75, wall: 2.5, floor: 2.5, post: 8, pilot: 2.5, pilotDepth: 15,
  // lid
  lidT: 4, nestFloor: 2,            // nestFloor is the plastic between card and antenna: PROVISIONAL until the hour of polls
  card: [88, 63], nestClear: 1.0,   // per side; TAPE-ENC-NEST wants 0.5..1.5
  nestC: [-42, 12], screw: 3.4,
  button: 30, buttons: [[-65, -43], [-20, -43]], pot: 7, potC: [75, -48],
  // speaker
  spkC: [44, 9], grilleR: 33, hole: 3.5, pitch: 4.8,
  podL: 78, podW: 84, podH: 55, podWall: 2.5, podFloor: 2.5,
  baffleT: 3, collar: 6, driverHole: 36,
  // the driver, bounded: 40 mm frame, a generous Ø41 × 25 mm cylinder from the baffle top down
  drvR: 20.5, drvDepth: 25,
  // USB-C to the DevKit through the left wall
  usb: [13, 7], usbZ: 15,
};

const tree = (note, params, features) => ({ $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: note, params, features });
const rect = (name, c, w, h) => ({ name, rect: { c, w, h } });
const circ = (name, c, r) => ({ name, circle: { c, r } });

// Hex grid of grille holes whose whole hole lies inside grilleR of the speaker centre.
export function grilleHoles(p = P) {
  const out = [], r = p.hole / 2, dy = p.pitch * Math.sqrt(3) / 2, n = Math.ceil(p.grilleR / dy) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = (i + (j & 1) / 2) * p.pitch, y = j * dy;
    if (Math.hypot(x, y) + r <= p.grilleR + 1e-9) out.push([+(p.spkC[0] + x).toFixed(4), +(p.spkC[1] + y).toFixed(4)]);
  }
  return out;
}
const postCentres = (p) => { const x = p.L / 2 - p.wall - p.post / 2, y = p.W / 2 - p.wall - p.post / 2; return [[x, y], [-x, y], [-x, -y], [x, -y]]; };

export function parts(p = P) {
  const nestW = p.card[0] + 2 * p.nestClear, nestH = p.card[1] + 2 * p.nestClear;
  const holes = grilleHoles(p);
  const lid = tree('Lid: the card nest (a pocket, nestFloor of plastic over the antenna), the grille over the speaker, two 30 mm arcade buttons, the volume pot, four screw holes into the body posts.',
    { L: p.L, W: p.W, lidT: p.lidT, nestFloor: p.nestFloor, nestW, nestH, hole: p.hole, button: p.button, pot: p.pot, screw: p.screw },
    [
      { op: 'sketch', id: 'top', loops: [
        rect('rim', [0, 0], 'L', 'W'),
        ...holes.map((c, k) => circ(`grille${k}`, c, 'hole/2')),
        ...p.buttons.map((c, k) => circ(`button${k}`, c, 'button/2')),
        circ('pot', p.potC, 'pot/2'),
        ...postCentres(p).map((c, k) => circ(`screw${k}`, c, 'screw/2')),
      ] },
      { op: 'extrude', id: 'lid', profile: 'top', depth: 'lidT' },
      { op: 'sketch', id: 'nestS', plane: { base: 'XY', offset: 'nestFloor' }, loops: [rect('nest', p.nestC, 'nestW', 'nestH')] },
      { op: 'extrude', id: 'nest', profile: 'nestS', mode: 'cut', from: 0, to: 'lidT' },
    ]);

  const pc = postCentres(p), hx = p.L / 2 - p.wall, hy = p.W / 2 - p.wall, s = p.post;
  // cavity outline: the inner rectangle with a square notch left standing in each corner (the posts)
  const cav = [
    [hx - s, -hy], [hx - s, -hy + s], [hx, -hy + s], [hx, hy - s], [hx - s, hy - s], [hx - s, hy],
    [-hx + s, hy], [-hx + s, hy - s], [-hx, hy - s], [-hx, -hy + s], [-hx + s, -hy + s], [-hx + s, -hy],
  ];
  const body = tree('Body: an open tray, corner posts left standing by the cavity outline, pilot holes for the lid screws, a USB-C slot in the left wall for the DevKit (wave 1 runs on USB).',
    { L: p.L, W: p.W, H: p.H, floor: p.floor, pilot: p.pilot, pilotDepth: p.pilotDepth, usbW: p.usb[0], usbH: p.usb[1], usbZ: p.usbZ, wall: p.wall },
    [
      { op: 'sketch', id: 'outer', loops: [rect('outside', [0, 0], 'L', 'W')] },
      { op: 'extrude', id: 'body', profile: 'outer', depth: 'H' },
      { op: 'sketch', id: 'cavS', plane: { base: 'XY', offset: 'floor' }, loops: [{ name: 'cavity', polygon: cav }] },
      { op: 'extrude', id: 'cavity', profile: 'cavS', mode: 'cut', from: 0, to: 'H' },
      { op: 'sketch', id: 'pilotS', plane: { base: 'XY', offset: 'H - pilotDepth' }, loops: pc.map((c, k) => circ(`pilot${k}`, c, 'pilot/2')) },
      { op: 'extrude', id: 'pilots', profile: 'pilotS', mode: 'cut', from: 0, to: 'pilotDepth' },
      { op: 'sketch', id: 'usbS', plane: { base: 'YZ', offset: -p.L / 2 - 1 }, loops: [rect('usb', [0, 'usbZ'], 'usbW', 'usbH')] },
      { op: 'extrude', id: 'usbSlot', profile: 'usbS', mode: 'cut', from: 0, to: 'wall + 2' },
    ]);

  // Truck could not cut the collar's pocket into a plate that already had the driver hole
  // ("shell is not oriented and closed"), so baffle and collar are two parts, both pure even-odd extrudes.
  const baffle = tree('Baffle: a plate that closes the top of the pod. The driver sits on it face-up over the hole, sealed with a bead of silicone round its frame.',
    { podL: p.podL, podW: p.podW, baffleT: p.baffleT, driverHole: p.driverHole },
    [
      { op: 'sketch', id: 'base', loops: [rect('outline', p.spkC, 'podL', 'podW'), circ('driver', p.spkC, 'driverHole/2')] },
      { op: 'extrude', id: 'baffle', profile: 'base', depth: 'baffleT' },
    ]);
  const collar = tree('Collar: a rectangular ring glued between baffle and lid. Its inside is the front chamber, open to the room only through the grille; it keeps the cone from talking into the box.',
    { podL: p.podL, podW: p.podW, wall: p.podWall, collar: p.collar },
    [
      { op: 'sketch', id: 'ring', loops: [rect('outline', p.spkC, 'podL', 'podW'), rect('front', p.spkC, 'podL - 2*wall', 'podW - 2*wall')] },
      { op: 'extrude', id: 'collar', profile: 'ring', depth: 'collar' },
    ]);

  const pod = tree('Pod: the sealed back chamber. An open cup glued (silicone) to the underside of the baffle; nothing else opens into it.',
    { podL: p.podL, podW: p.podW, podH: p.podH, wall: p.podWall, floor: p.podFloor },
    [
      { op: 'sketch', id: 'base', loops: [rect('outline', p.spkC, 'podL', 'podW')] },
      { op: 'extrude', id: 'pod', profile: 'base', depth: 'podH' },
      { op: 'sketch', id: 'airS', plane: { base: 'XY', offset: 'floor' }, loops: [rect('air', p.spkC, 'podL - 2*wall', 'podW - 2*wall')] },
      { op: 'extrude', id: 'air', profile: 'airS', mode: 'cut', from: 0, to: 'podH' },
    ]);

  // Reference solids, not printed. backAir is the pod's cavity as a solid; driverBound is what the driver may occupy.
  const backAir = tree('Reference, not printed: the air inside the pod, as a solid.',
    { a: p.podL - 2 * p.podWall, b: p.podW - 2 * p.podWall, h: p.podH - p.podFloor },
    [{ op: 'sketch', id: 's', loops: [rect('air', p.spkC, 'a', 'b')] }, { op: 'extrude', id: 'air', profile: 's', depth: 'h' }]);
  const driverBound = tree('Reference, not printed: a cylinder the 40 mm driver fits inside (Ø41 × 25 from the baffle top down). Its volume is subtracted from the back air whole, which over-counts the intrusion: the safe side.',
    { r: p.drvR, d: p.drvDepth },
    [{ op: 'sketch', id: 's', loops: [circ('driver', p.spkC, 'r')] }, { op: 'extrude', id: 'driver', profile: 's', depth: 'd' }]);

  return { printed: { lid, body, baffle, collar, pod }, ref: { 'back-air': backAir, 'driver-bound': driverBound }, derived: { nestW, nestH, holes } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { printed, ref, derived } = parts();
  mkdirSync(join(here, 'ref'), { recursive: true });
  for (const [k, t] of Object.entries(printed)) writeFileSync(join(here, `${k}.json`), JSON.stringify(t, null, 1) + '\n');
  for (const [k, t] of Object.entries(ref)) writeFileSync(join(here, 'ref', `${k}.json`), JSON.stringify(t, null, 1) + '\n');
  // The stack, for check.mjs: body on the floor, lid on the walls, collar/baffle/pod hanging under the lid.
  const p = P, zl = p.H, zc = zl - p.collar, zb = zc - p.baffleT, zp = zb - p.podH;
  const asm = { $schema: 'com.minomobi.cad.tree#v1', units: 'mm', _: 'Reference: the printed parts stacked as built. Glued joints are declared contact.',
    parts: printed,
    components: [
      { id: 'body', part: 'body', at: [0, 0, 0] }, { id: 'lid', part: 'lid', at: [0, 0, zl] },
      { id: 'collar', part: 'collar', at: [0, 0, zc] }, { id: 'baffle', part: 'baffle', at: [0, 0, zb] }, { id: 'pod', part: 'pod', at: [0, 0, zp] },
    ],
    fits: [['lid', 'body'], ['collar', 'lid'], ['baffle', 'collar'], ['pod', 'baffle']].map(([a, b]) => ({ a, b, contact: true })) };
  writeFileSync(join(here, 'ref', 'stack.json'), JSON.stringify(asm, null, 1) + '\n');
  console.log(`wrote ${Object.keys(printed).length} parts, ${Object.keys(ref).length} reference solids; ${derived.holes.length} grille holes`);
}
