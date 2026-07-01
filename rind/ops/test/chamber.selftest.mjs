// chamber.selftest.mjs — certify the chamber/room generator: a real walled footprint, doors as mid-wall gaps
// (never at the structural corners), a stair to the other-layer partner = the white×production facility, and
// NO stair between the two hubs (they stay disconnected). Run: node rind/ops/test/chamber.selftest.mjs

import { buildFoam3D } from '../foam3d.js';
import { buildChamber } from '../chamber.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildFoam3D(3);
const body = m.nuclei.filter((n) => !n.hub);
const sample = [body[0], body[(body.length / 3) | 0], body[(body.length / 2) | 0], body[body.length - 1]].map((n) => buildChamber(m, n.i));

// ── the room has real geometry ──
for (const ch of sample) {
  ok(ch.poly.length >= 3, `chamber ${ch.i} is a real walled room (${ch.poly.length}-gon)`);
  ok(ch.doors.length >= 1, `chamber ${ch.i} has at least one door`);
  // doors sit in the MIDDLE of a wall, never at a corner (a structural column) — distance to nearest vertex > 0
  for (const d of ch.doors) { let dmin = Infinity; for (const v of ch.poly) dmin = Math.min(dmin, Math.hypot(d.mid[0] - v[0], d.mid[1] - v[1])); ok(dmin > 1, `chamber ${ch.i} door is a gap mid-wall, not cutting a corner`); }
}

// ── the stair is the facility: it connects to the OTHER system on the other layer (white ⇄ production) ──
const prodCh = buildChamber(m, body.find((n) => n.owner.kind === 'weft').i);
ok(prodCh.stair, 'a production chamber has a stair to the other layer');
ok(prodCh.stair.facility && prodCh.stair.to.kind === 'white', 'the stair connects production → its white partner = the facility (K(6,8) contact)');
const whiteCh = buildChamber(m, body.find((n) => n.owner.kind === 'warp').i);
ok(whiteCh.stair && whiteCh.stair.to.kind === 'prod', 'a white chamber\'s stair connects to a production partner');

// ── the two hubs are NOT joined by a stair (disconnected except through the weave) ──
const whub = buildChamber(m, m.nuclei.find((n) => n.hub === 'whub').i);
const phub = buildChamber(m, m.nuclei.find((n) => n.hub === 'phub').i);
ok(whub.stair === null && phub.stair === null, 'the white hub and production hub have NO stair between them (stay disconnected)');
ok(whub.fixture.type === 'hub' && phub.fixture.type === 'hub', 'both hubs render as hub fixtures');

// ── fixtures match the owner ──
ok(prodCh.fixture.type === 'process' && prodCh.fixture.label.includes('·'), 'a production chamber shows a process machine (engine · step)');
ok(whiteCh.fixture.type === 'office', 'a white chamber shows an ops console');

// ── every body chamber generates without error, with a door and (non-hub-adjacent) a stair ──
let withStair = 0; for (const n of body) { const ch = buildChamber(m, n.i); if (ch.poly.length >= 3 && ch.doors.length >= 1) {} else { fail++; } if (ch.stair) withStair++; }
ok(withStair > body.length * 0.8, `most chambers carry a facility stair (${withStair}/${body.length})`);

// ── determinism ──
ok(JSON.stringify(buildChamber(m, body[5].i).poly) === JSON.stringify(buildChamber(buildFoam3D(3), body[5].i).poly), 'deterministic from (seed, index)');

console.log(`chamber.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
