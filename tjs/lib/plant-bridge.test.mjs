// Node test for the twin plant bridge (CopleyBench amp wire contract over the
// tjs physics engine). Run: node tjs/lib/plant-bridge.test.mjs
import { readFileSync } from 'node:fs';
import { systemToHomunculus } from './homunculus.js';
import { PlantBridge } from './plant-bridge.js';
import { resolve } from './profiles.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };

const sys = JSON.parse(readFileSync(new URL('../systems/mps-1.system.json', import.meta.url), 'utf8'));
const { deck, profiles } = systemToHomunculus(sys);
const bridge = new PlantBridge(deck, profiles);

console.log('Amps + status:');
ok(bridge.amps().length >= 7, `amps enumerated (got ${bridge.amps().length})`);
const pz = resolve(profiles, 'pipettor-z');
ok(bridge.status(pz.node).axis === 'pipettor-z', 'status by node resolves the axis');

console.log('moverel (linear Z):');
// NOTE: the move is PLANNED + given a torque verdict; ok may be false when the
// placeholder limits exceed the motor envelope (that is the twin doing its job —
// 600 mm/s on an 8 mm screw ≈ 4500 rpm stalls a NEMA-17). We assert the verdict
// is returned and the pose advances, not that every demo move is deliverable.
let r = bridge.moveRel(pz.node, { delta_mm: 100 });
ok(r.dt > 0 && typeof r.stall === 'boolean', `pipettor-z moverel 100mm planned with a verdict (${r.dt.toFixed(3)}s, ok=${r.ok})`);
ok(Math.abs(bridge.status(pz.node).position - 100) < 1e-6, 'pose advanced to 100mm');
r = bridge.moveRel('pipettor-z', { delta_mm: 1000 }); // beyond 250 travel -> clamps
ok(bridge.status(pz.node).position <= 250 + 1e-6, 'soft-limit clamp honored');

console.log('coordinated move (hbot logical x/y):');
r = bridge.coordinatedMove([{ axis: 'gantry-x', delta_mm: 120 }, { axis: 'gantry-y', delta_mm: -80 }]);
ok(typeof r.dt === 'number' && r.dt > 0, `coordinated gantry move planned (${r.message})`);
ok(Array.isArray(r.results) && r.results.length === 2, 'per-axis results returned');
ok(Math.abs(bridge.status('gantry-x').position - 520) < 1, 'gantry-x advanced home 400 + 120 = 520');

console.log('hbot motor-level (A/B) -> derived joints:');
const before = { ...bridge.pose().gantry };
r = bridge.coordinatedMove([{ axis: 'gantry-hbot-a', delta_counts: 0, delta_mm: 40 }, { axis: 'gantry-hbot-b', delta_mm: 40 }]);
ok(r.ok, 'motor-level coordinated move accepted');
// A+=40, B+=40 -> x += 40, y += 0
ok(Math.abs(bridge.pose().gantry.x - (before.x + 40)) < 1e-6, 'A+B drives x = (A+B)/2');
ok(Math.abs(bridge.pose().gantry.y - before.y) < 1e-6, 'equal A,B leaves y unchanged');

console.log('rotary axis (no body) accepted:');
r = bridge.moveRel('mixer-seats-rotation', { delta_mm: 360 });
ok(r.ok && r.dt >= 0, 'rotary move accepted with a time estimate, no pose');

console.log('telemetry:');
const tel = bridge.telemetry();
ok(Array.isArray(tel) && tel.length === bridge.amps().length, 'telemetry covers every amp');
ok(tel.every((t) => typeof t.position === 'number'), 'telemetry carries positions');

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
