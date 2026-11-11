// ratchet-asm-gen.mjs — the 10-06 ratchet, unfused: wheel, pawl and frame as three
// parts of one assembly. The pawl is its own body on its own pin and can turn.
// usage: node shelf/cad/ratchet-asm-gen.mjs shelf/cad/ratchet-asm.json   — Morphyx, 10-23
//
// Why: ratchet.json (10-06) drew wheel and pawl as one part ("mode: add"), so the
// pawl was a lump bolted to nothing. A drawing that can't move is not a mechanism.
import { writeFileSync } from 'node:fs';
const z = 20, R = 15, r = 12.2, f = (x) => +x.toFixed(3);
const teeth = [];
for (let i = 0; i < z; i++) {
  const a0 = 2 * Math.PI * i / z, a1 = 2 * Math.PI * (i + 1) / z;
  teeth.push([f(r * Math.cos(a0)), f(r * Math.sin(a0))]);
  teeth.push([f(R * Math.cos(a1 - 0.025)), f(R * Math.sin(a1 - 0.025))]);
}
// Same pawl outline as 10-06, moved so its pivot is the part's origin.
const P = [-9, 19];
const pawl0 = [[-11.5, 17.5], [-9, 16.2], [-1.4, 15.6], [-0.3, 12.7], [-0.1, 15.4], [1.6, 16.0], [0, 18.6], [-9, 21.8], [-11.5, 20.5]];
const pawl = pawl0.map(([x, y]) => [f(x - P[0]), f(y - P[1])]);
const T = 3, GAP = 0.2, BASE = 2;              // part thickness, air under the moving parts, frame plate
const pin = (c, rr) => ({ circle: { c, r: rr } });
const doc = {
  $schema: 'com.minomobi.cad.assembly#v1',
  name: 'ratchet',
  _: 'Ratchet wheel (20 teeth) and pawl, as separate bodies on two pins of one frame. `turn` spins the wheel; `lift` swings the pawl up off the teeth. Bores clear their pins by 0.2 mm radial; the moving parts ride 0.2 mm above the frame. The wheel-to-pawl coupling (the pawl falling into each gap) is not a mate the engine has; it is checked by posing both inputs. Morphyx, 10-23, replacing the fused 10-06 part.',
  inputs: {
    turn: { min: -18, max: 18, steps: 13, unit: 'deg', description: 'wheel rotation, one tooth pitch is 18°' },
    lift: { min: 0, max: 20, steps: 5, unit: 'deg', description: 'pawl swing off the wheel about its pin' },
  },
  parts: {
    frame: {
      units: 'mm',
      params: { w: 40, h: 46, t: BASE, axle: 1.3, pivot: 0.8, up: T + GAP + 1.5 },
      features: [
        { op: 'sketch', id: 'plate_s', plane: { base: 'XY', offset: -(BASE + GAP) },
          loops: [{ name: 'plate', rect: { c: [-3, 2], w: 'w', h: 'h' } }] },
        { op: 'extrude', id: 'plate', profile: 'plate_s', depth: 't' },
        { op: 'sketch', id: 'pins_s', plane: { base: 'XY', offset: -(BASE + GAP) + 0.5 },
          loops: [{ name: 'axle', ...pin([0, 0], 'axle') }, { name: 'pivot', ...pin(P, 'pivot') }] },
        { op: 'extrude', id: 'pins', profile: 'pins_s', depth: 'up', mode: 'add' },
      ],
    },
    wheel: {
      units: 'mm',
      params: { t: T, bore: 1.5 },
      features: [
        { op: 'sketch', id: 'wheel_s', loops: [{ name: 'teeth', polygon: teeth }, { name: 'bore', ...pin([0, 0], 'bore') }] },
        { op: 'extrude', id: 'wheel', profile: 'wheel_s', depth: 't' },
      ],
    },
    pawl: {
      units: 'mm',
      params: { t: T, hole: 1 },
      features: [
        { op: 'sketch', id: 'pawl_s', loops: [{ name: 'pawl', polygon: pawl }, { name: 'pivot', ...pin([0, 0], 'hole') }] },
        { op: 'extrude', id: 'pawl', profile: 'pawl_s', depth: 't' },
      ],
    },
  },
  components: [
    { id: 'frame', part: 'frame', at: [0, 0, 0] },
    { id: 'wheel', part: 'wheel', at: [0, 0, 0] },
    { id: 'pawl', part: 'pawl', at: [P[0], P[1], 0] },
  ],
  mates: [
    { kind: 'revolute', a: 'frame', b: 'wheel', input: 'turn' },
    { kind: 'revolute', a: 'frame', b: 'pawl', input: 'lift' },
  ],
  fits: [
    { a: 'frame', b: 'wheel', min: 0.15 },
    { a: 'frame', b: 'pawl', min: 0.15 },
  ],
};
writeFileSync(process.argv[2], JSON.stringify(doc, null, 1));
console.log('wrote', process.argv[2]);
