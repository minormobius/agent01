// deck2.selftest.mjs — the two-deck factory structure. node hoop/forge/test/deck2.selftest.mjs
import { twoDeckFactory, rampPoint } from '../deck2.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const d = twoDeckFactory(7, { count: 7 });
ok(d.mat.recs.length === 7, `deck 0 is a 7-tile material factory (${d.mat.recs.length})`);
ok(d.offices.length === d.mat.facilities.length, `an office per facility on deck 1 (${d.offices.length})`);
ok(d.ramps.length === d.mat.facilities.length, `a ramp per facility (${d.ramps.length})`);
ok(d.catwalks.length === d.routes.length, `catwalks follow the material trunks (${d.catwalks.length})`);
ok(d.offices.some((o) => o.navePort) && d.ramps.some((r) => r.navePort), 'the fulfillment office + ramp carry the nave port');

// the ramp is a real helix: t=0 at deck 0, t=1 at deck 1, winding > 1 full turn
const r0 = d.ramps[0];
const a = rampPoint(r0, 0), b = rampPoint(r0, 1), mid = rampPoint(r0, 0.5);
ok(a.z === 0 && b.z === 1, 'ramp spans deck 0 (z=0) → deck 1 (z=1)');
ok(Math.hypot(a.x - r0.x, a.y - r0.y) > 0 && r0.turns >= 1, `ramp corkscrews (${r0.turns} turns, r=${r0.r})`);
// the helix actually moves around (mid not equal to start in x/y)
ok(Math.hypot(mid.x - a.x, mid.y - a.y) > 1, 'ramp winds (mid-point displaced from the start)');

// deterministic
const d2 = twoDeckFactory(7, { count: 7 });
ok(JSON.stringify(d.ramps) === JSON.stringify(d2.ramps) && JSON.stringify(d.offices) === JSON.stringify(d2.offices), 'twoDeckFactory is deterministic');

console.log(`\ndeck2.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
