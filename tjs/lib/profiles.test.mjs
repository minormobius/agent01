// Node test for the device-profile contract. Run: node tjs/lib/profiles.test.mjs
import { buildProfile, resolve, byNode, byAxis, motorPresetFor, limitsToTjs, isRotary, countsToMm, mmToCounts, PROFILE_SCHEMA } from './profiles.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };

console.log('Profile build + fields:');
const ax = { id: 'gantry-x', kind: 'linear', limits: { stroke_mm: 800, v_max_mm_s: 1000, a_max_mm_s2: 8000, j_max_mm_s3: 80000 } };
const p = buildProfile(ax, { deviceId: 'gantry', joint: 'x', role: 'hbot-x', node: 3, countsPerMm: 100, motorProfile: 'nema11_2.1A' });
ok(p.schema === PROFILE_SCHEMA, 'schema tag');
ok(p.axis === 'gantry-x' && p.deviceId === 'gantry' && p.joint === 'x', 'binds axis -> device joint');
ok(p.limitsMm.vmax === 1000 && p.limitsMm.amax === 8000 && p.limitsMm.jmax === 80000, 'limits mapped to tjs vmax/amax/jmax');
ok(p.strokeMm === 800, 'stroke carried');
ok(p.rendered === true, 'rendered when deviceId+joint set');

const rotAxis = { id: 'mixer-seats-rotation', kind: 'rotary', limits: { v_max_deg_s: 3600, stroke_deg: 0 } };
ok(isRotary(rotAxis), 'rotary detected from deg limits');
const rp = buildProfile(rotAxis, { role: 'rotary', node: 9 });
ok(rp.rendered === false, 'rotary profile not rendered');

console.log('Lookups (bridge addressing):');
const profiles = [p, rp, buildProfile({ id: 'pipettor-z', kind: 'linear', limits: { stroke_mm: 250 } }, { deviceId: 'pipettor-z', joint: 'p', role: 'linear', node: 5 })];
ok(byNode(profiles, 5).axis === 'pipettor-z', 'resolve by node');
ok(byAxis(profiles, 'gantry-x') === p, 'resolve by axis name');
ok(resolve(profiles, '5').axis === 'pipettor-z', 'resolve() numeric string -> node');
ok(resolve(profiles, 'gantry-x') === p, 'resolve() name -> axis');

console.log('Units + preset mapping:');
ok(countsToMm(p, 1000) === 10, 'countsToMm uses countsPerMm');
ok(mmToCounts(p, 10) === 1000, 'mmToCounts uses countsPerMm');
ok(countsToMm({ countsPerMm: null }, 42) === 42, 'null countsPerMm -> 1:1 (twin works in mm)');
ok(motorPresetFor('bldc').includes('NEMA 23'), 'bldc -> NEMA 23 preset');
ok(motorPresetFor('stepper').includes('NEMA 17'), 'stepper -> NEMA 17 preset');
ok(limitsToTjs({}).vmax > 0, 'empty limits -> sane defaults');

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
