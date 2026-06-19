// Node test for the IK + interaction verbs. Run: node tjs/lib/verbs.test.mjs
import { Deck } from './deck.js';
import { resolveSite, solveOver } from './ik.js';
import { initWorld, expand } from './verbs.js';
import { checkSequence } from './manifest.js';
import { defaultState } from './deckengine.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };
const codes = (r) => r.diagnostics.map((d) => d.code);

// reachable pipetting cell
function cell() {
  const d = new Deck({ name: 'cell' });
  d.addDevice('hbot', { id: 'h', params: { bedX: 300, bedY: 300, height: 80 }, mount: { position: [0, 0, 0] } });
  d.addDevice('linear', { id: 'z', params: { axis: 'z', drive: 'screw', travel: 90 }, tool: 'pipettor', mount: { parent: 'h', attach: 'carriage', position: [0, 0, 0] } });
  d.addDevice('tiprack', { id: 'tips', mount: { position: [-55, 0, 50] } });
  d.addDevice('wellplate', { id: 'src', mount: { position: [55, 0, 50] } });
  d.addDevice('wellplate', { id: 'dst', mount: { position: [55, 0, -50] } });
  d.addDevice('waste', { id: 'bin', mount: { position: [-55, 0, -50] } });
  return d;
}

// --- IK lands a tool on a named site -----------------------------------------
console.log('IK:');
const d = cell();
const sm = {}; for (const dev of d.devices) sm[dev.id] = { ...defaultState(dev) };
for (const ref of ['src.A1', 'src.H12', 'dst.D6']) {
  const site = resolveSite(d, ref);
  const sol = solveOver(d, 'z', site.world, sm);
  const test = JSON.parse(JSON.stringify(sm));
  for (const [id, j] of Object.entries(sol.joints)) test[id] = { ...test[id], ...j };
  const got = d.carriageWorld('z', test);
  const e = Math.hypot(got[0] - site.world[0], got[2] - site.world[2]);
  ok(sol.reachable && e < 0.5, `IK lands z on ${ref} (err ${e.toFixed(2)}mm)`);
}
ok(!solveOver(d, 'z', resolveSite(d, 'src.A1').world, sm).reachable === false, 'reachable flag true for in-range site');

// --- valid pipetting cycle (no diagnostics) ----------------------------------
console.log('Verbs — valid cycle:');
let r = checkSequence(cell(), [
  { device: 'z', pickTip: 'tips.1' },
  { device: 'z', aspirate: 'src.A1', uL: 50 },
  { device: 'z', dispense: 'dst.A1', uL: 50 },
  { device: 'z', dropTip: true },
]);
ok(r.ok, 'valid cycle passes');
ok(r.diagnostics.length === 0, `valid cycle is clean (got ${r.diagnostics.map((x) => x.code)})`);
ok(r.cycleTime > 0, `cycle time computed (${r.cycleTime}s)`);

// --- state-machine preconditions --------------------------------------------
console.log('Verbs — state machine:');
r = checkSequence(cell(), [{ device: 'z', aspirate: 'src.A1', uL: 50 }]);
ok(codes(r).includes('no_tip'), 'aspirate without a tip -> no_tip');

r = checkSequence(cell(), [
  { device: 'z', pickTip: 'tips.1' },
  { device: 'z', pickTip: 'tips.2' },
]);
ok(codes(r).includes('already_has_tip'), 'second pickTip -> already_has_tip');

r = checkSequence(cell(), [
  { device: 'z', pickTip: 'tips.1' },
  { device: 'z', aspirate: 'src.A1', uL: 50 },
  { device: 'z', dispense: 'dst.A1', uL: 80 },
]);
ok(codes(r).includes('insufficient_volume'), 'over-dispense -> insufficient_volume');

r = checkSequence(cell(), [
  { device: 'z', pickTip: 'tips.1' },
  { device: 'z', aspirate: 'src.A1', uL: 1500 },
]);
ok(codes(r).includes('over_capacity'), 'over-aspirate -> over_capacity');

r = checkSequence(cell(), [{ device: 'z', moveOver: 'ghost.A1' }]);
ok(codes(r).includes('bad_site'), 'unknown site -> bad_site');

r = checkSequence(cell(), [{ device: 'z', grip: 'src.A1' }]);
ok(codes(r).includes('wrong_tool'), 'grip with a pipettor -> wrong_tool');

// tip depletion: a tiprack has finitely many tips
const single = cell();
let steps = [];
ok(initWorld(single).tipsAvailable.size === 96, 'tiprack stocked with 96 tips');

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
