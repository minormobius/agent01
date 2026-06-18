// Node test for the agent contract: manifest shape + the oracle's diagnostics.
// Run: node tjs/lib/manifest.test.mjs
import { defaultDeck, Deck } from './deck.js';
import { buildManifest, checkSequence } from './manifest.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };
const has = (arr, code) => arr.some((d) => d.code === code);

// --- manifest shape ----------------------------------------------------------
console.log('Manifest:');
const deck = defaultDeck();
deck.addDevice('wellplate', { id: 'plate', mount: { position: [60, 0, 90] } });
const man = buildManifest(deck);
ok(man.schema === 'tjs.deck.manifest/1', 'schema tag present');
ok(man.modules.length === 5, `5 modules (got ${man.modules.length})`);
const bridge = man.modules.find((m) => m.id === 'bridge');
ok(bridge.joints && bridge.joints.x.max === 300, 'bridge joints + ranges');
ok(bridge.carries_kg > 1, `bridge carries mounted mass (${bridge.carries_kg})`);
ok(bridge.reach && bridge.reach.min.length === 3, 'bridge has world reach AABB');
const zgrip = man.modules.find((m) => m.id === 'z_grip');
ok(zgrip.tool === 'gripper', 'z_grip tool surfaced');
ok(man.sites.length === 96, `96 plate sites (got ${man.sites.length})`);
const a1 = man.sites.find((s) => s.ref === 'plate.A1');
ok(a1 && a1.world.length === 3, 'site A1 has world coords');
ok(Array.isArray(a1.reachableBy), 'site lists reachableBy');
ok(man.verbs.map((v) => v.verb).join() === 'move,tool,dwell', 'verb grammar present');

// --- oracle: good ------------------------------------------------------------
console.log('Oracle — valid sequence:');
let r = checkSequence(deck, deck.sequences[0].steps);
ok(r.ok && r.diagnostics.length === 0, 'default sequence passes clean');
ok(r.cycleTime > 0, `cycle time computed (${r.cycleTime}s)`);

// --- oracle: structural faults ----------------------------------------------
console.log('Oracle — faults:');
r = checkSequence(deck, [
  { device: 'bridge', move: { x: 9999, y: 50 } },  // out of range -> warning
  { device: 'z_grip', move: { x: 5 } },            // bad joint -> error
  { device: 'ghost', move: { p: 1 } },             // unknown device -> error
  { device: 'transfer', tool: { open: true } },    // no tool -> warning
]);
ok(r.ok === false, 'faulty sequence rejected');
ok(has(r.diagnostics, 'out_of_range'), 'flags out-of-range joint');
ok(has(r.diagnostics, 'bad_joint'), 'flags bad joint key');
ok(has(r.diagnostics, 'unknown_device'), 'flags unknown device');
ok(has(r.diagnostics, 'no_tool'), 'flags tool actuation on tool-less device');

// --- oracle: stall + collision ----------------------------------------------
console.log('Oracle — physics faults:');
const d2 = new Deck({ name: 'stress' });
d2.addDevice('hbot', { id: 'h', params: { limits: { vmax: 800, amax: 90000, jmax: 5e6 } } });
let rs = checkSequence(d2, [{ device: 'h', move: { x: 280, y: 20 } }]);
ok(rs.anyStall && has(rs.diagnostics, 'stall'), 'flags a motor stall from over-aggressive limits');

const d3 = new Deck({ name: 'collide' });
d3.addDevice('hbot', { id: 'h' });
d3.addDevice('linear', { id: 'zl', params: { axis: 'z', travel: 120 }, mount: { parent: 'h', attach: 'carriage', position: [-8, 0, 0] } });
d3.addDevice('linear', { id: 'zr', params: { axis: 'z', travel: 120 }, mount: { parent: 'h', attach: 'carriage', position: [8, 0, 0] } });
d3.relations.push({ type: 'collision', between: ['zl', 'zr'], minDist: 25 });
let rc = checkSequence(d3, [{ device: 'h', move: { x: 100, y: 100 } }]);
ok(rc.anyCollision && has(rc.diagnostics, 'collision'), 'flags a collision relation violation');

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
