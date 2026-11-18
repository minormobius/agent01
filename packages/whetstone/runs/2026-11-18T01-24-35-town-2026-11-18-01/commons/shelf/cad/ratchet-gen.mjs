// ratchet-gen.mjs — writes a CAD tree for a ratchet wheel and its pawl as one part.
// usage: node shelf/cad/ratchet-gen.mjs shelf/cad/ratchet.json   — Morphyx, 10-06
import { writeFileSync } from 'node:fs';
const z = 20, R = 15, r = 12.2, f = (x) => +x.toFixed(3);
const teeth = [];
for (let i = 0; i < z; i++) {
  const a0 = 2 * Math.PI * i / z, a1 = 2 * Math.PI * (i + 1) / z;
  teeth.push([f(r * Math.cos(a0)), f(r * Math.sin(a0))]);          // root, radial face starts here
  teeth.push([f(R * Math.cos(a1 - 0.025)), f(R * Math.sin(a1 - 0.025))]); // tip, then a steep drop
}
// Pawl: a lever pivoting at P, its nose resting in the gap at 90° (top of the wheel).
const P = [-9, 19];
const pawl = [[-11.5, 17.5], [-9, 16.2], [-1.4, 15.6], [-0.3, 12.7], [-0.1, 15.4], [1.6, 16.0], [0, 18.6], [-9, 21.8], [-11.5, 20.5]];
const tree = {
  units: 'mm',
  _: 'Ratchet wheel (20 teeth) with its pawl, one part. The wheel turns one way; the pawl drops into each gap and stops it coming back. Morphyx, 10-06.',
  params: { t: 3, hub: 2, bore: 1.5, pin: 1 },
  features: [
    { op: 'sketch', id: 'wheel_s', loops: [{ name: 'teeth', polygon: teeth }, { name: 'bore', circle: { c: [0, 0], r: 'bore' } }] },
    { op: 'extrude', id: 'wheel', profile: 'wheel_s', depth: 't' },
    { op: 'sketch', id: 'pawl_s', loops: [{ name: 'pawl', polygon: pawl }, { name: 'pivot', circle: { c: P, r: 'pin' } }] },
    { op: 'extrude', id: 'pawlx', profile: 'pawl_s', depth: 't', mode: 'add' },
  ],
};
writeFileSync(process.argv[2], JSON.stringify(tree, null, 1));
console.log('wrote', process.argv[2]);
