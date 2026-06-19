// Node test for the deck model: mount-tree world transforms (a child rides its
// parent's carriage), collision relations, validation, and lossless object
// round-trip. Run: node tjs/lib/deck.test.mjs
import { Deck, defaultDeck } from './deck.js';
import { deckToObject, objectToDeck } from './deckio.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const vnear = (p, q, e = 1e-4) => near(p[0], q[0], e) && near(p[1], q[1], e) && near(p[2], q[2], e);

// --- mount tree: a Z axis rides an HBot carriage that rides a linear rail -----
const d = new Deck({ name: 't' });
const rail = d.addDevice('linear', { id: 'rail', params: { axis: 'x', drive: 'belt', travel: 600 }, mount: { position: [0, 40, 0] } });
const bridge = d.addDevice('hbot', { id: 'bridge', params: { bedX: 300, bedY: 300, height: 160 }, mount: { parent: 'rail', attach: 'carriage', position: [0, 30, 0] } });
const z = d.addDevice('linear', { id: 'z', params: { axis: 'z', drive: 'screw', travel: 120 }, mount: { parent: 'bridge', attach: 'carriage', position: [-30, 0, 0] } });

console.log('Mount-tree world transforms:');
// All joints at zero/centre. rail.p=0; bridge centre = bed centre.
let state = { rail: { p: 0 }, bridge: { x: 150, y: 150 }, z: { p: 0 } };
// bridge carriage at centre -> local carriage offset [0, height, 0] = [0,160,0]
// rail origin world = [0,40,0]; rail carriage (p=0) offset [0,0,0]; bridge origin = [0,40,0]+[0,30,0]=[0,70,0]
// bridge carriage world = [0,70,0] + [0,160,0] = [0,230,0]; z origin = +[-30,0,0] = [-30,230,0]
ok(vnear(d.originWorld('bridge', state), [0, 70, 0]), 'bridge origin world');
ok(vnear(d.carriageWorld('bridge', state), [0, 230, 0]), 'bridge carriage world (centre)');
ok(vnear(d.originWorld('z', state), [-30, 230, 0]), 'z origin rides bridge carriage');
ok(vnear(d.carriageWorld('z', state), [-30, 230, 0]), 'z carriage at p=0');

// Plunge z by 50mm (downward) and slide the rail +100mm in X.
state = { rail: { p: 100 }, bridge: { x: 150, y: 150 }, z: { p: 50 } };
// rail carriage offset (x axis) = [100,0,0] -> bridge origin = [0,40,0]+[100,0,0]+[0,30,0] = [100,70,0]
// bridge carriage = [100,230,0]; z origin = [70,230,0]; z carriage (z axis, down 50) = [70,180,0]
ok(vnear(d.carriageWorld('z', state), [70, 180, 0]), 'z carriage rides rail-shift + plunges down');

// Move the HBot carriage to a corner and confirm the Z follows in X and Z(depth).
state = { rail: { p: 0 }, bridge: { x: 300, y: 0 }, z: { p: 0 } };
// bridge carriage offset = [300-150, 160, 0-150] = [150,160,-150]; origin [0,70,0]
// z origin = [0,70,0]+[150,160,-150]+[-30,0,0] = [120,230,-150]
ok(vnear(d.carriageWorld('z', state), [120, 230, -150]), 'z tracks HBot carriage into far corner');

// --- collision relation ------------------------------------------------------
console.log('Collision relations:');
const d2 = new Deck({ name: 'c' });
const br = d2.addDevice('hbot', { id: 'b' });
d2.addDevice('linear', { id: 'zl', params: { axis: 'z', travel: 120 }, mount: { parent: 'b', attach: 'carriage', position: [-10, 0, 0] } });
d2.addDevice('linear', { id: 'zr', params: { axis: 'z', travel: 120 }, mount: { parent: 'b', attach: 'carriage', position: [10, 0, 0] } });
d2.relations.push({ type: 'collision', between: ['zl', 'zr'], minDist: 25 });
const st = { b: { x: 150, y: 150 }, zl: { p: 0 }, zr: { p: 0 } };
const col = d2.collisions(st);
ok(col.length === 1 && near(col[0].dist, 20), `collision distance 20 (got ${col[0]?.dist})`);
ok(col[0].violated === true, 'collision flagged (20 < 25)');

// --- validation: cycle + missing parent --------------------------------------
console.log('Validation:');
const bad = new Deck({});
bad.addDevice('linear', { id: 'a', mount: { parent: 'b', attach: 'frame' } });
bad.addDevice('linear', { id: 'b', mount: { parent: 'a', attach: 'frame' } });
ok(bad.validate().ok === false, 'cycle detected as invalid');

// --- removeDevice re-parents orphans ----------------------------------------
const d3 = new Deck({});
d3.addDevice('linear', { id: 'base', mount: {} });
d3.addDevice('hbot', { id: 'mid', mount: { parent: 'base', attach: 'carriage' } });
d3.addDevice('linear', { id: 'leaf', mount: { parent: 'mid', attach: 'carriage' } });
d3.removeDevice('mid');
ok(d3.getDevice('leaf').mount.parent === 'base', 'orphan re-parented to grandparent on delete');

// --- lossless object round-trip ---------------------------------------------
console.log('Round-trip:');
const deck = defaultDeck();
const obj = deckToObject(deck);
const back = objectToDeck(obj);
ok(JSON.stringify(deckToObject(back)) === JSON.stringify(obj), 'object round-trip is lossless');
ok(back.devices.length === 4 && back.relations.length === 1 && back.sequences.length === 1, 'default deck shape preserved');

console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
