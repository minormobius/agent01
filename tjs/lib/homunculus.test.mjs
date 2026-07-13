// Node test for the homunculus generator: FLTD system description -> a valid tjs
// deck + device profiles. Run: node tjs/lib/homunculus.test.mjs
import { readFileSync } from 'node:fs';
import { systemToHomunculus } from './homunculus.js';
import { buildManifest, checkSequence } from './manifest.js';
import { resolve, byNode } from './profiles.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  FAIL:', m); fails++; } };

const sys = JSON.parse(readFileSync(new URL('../systems/mps-1.system.json', import.meta.url), 'utf8'));
const { deck, profiles, notes } = systemToHomunculus(sys);

// --- deck validity ----------------------------------------------------------
console.log('Homunculus deck:');
const v = deck.validate();
ok(v.ok, `deck validates (errors: ${v.errors.join('; ')})`);
ok(deck.name.includes('Magnetophoretic'), 'carries the system name');

// gantry hbot resolved from the kinematics block
const gantry = deck.getDevice('gantry');
ok(gantry && gantry.type === 'hbot', 'gantry-hbot kinematics -> one hbot device "gantry"');
ok(gantry && gantry.params.bedX === 800 && gantry.params.bedY === 500, `hbot bed from gantry-x/y strokes (got ${gantry && gantry.params.bedX}x${gantry && gantry.params.bedY})`);

// the two gantry Z tools ride the hbot carriage and carry tools
const pip = deck.getDevice('pipettor-z'), grip = deck.getDevice('gripper-z');
ok(pip && pip.mount.parent === 'gantry' && pip.mount.attach === 'carriage', 'pipettor-z rides the gantry carriage');
ok(grip && grip.mount.parent === 'gantry' && grip.mount.attach === 'carriage', 'gripper-z rides the gantry carriage');
ok(pip && pip.tool === 'pipettor', 'pipettor active-element -> tool on pipettor-z');
ok(grip && grip.tool === 'gripper', 'gripper active-element -> tool on gripper-z');
ok(pip.mount.position[0] !== grip.mount.position[0], 'co-mounted Z tools are spread apart on the carriage');

// mixer chain: mixer-seats-z rides mixer-y
const msz = deck.getDevice('mixer-seats-z');
ok(msz && msz.mount.parent === 'mixer-y' && msz.mount.attach === 'carriage', 'mixer-seats-z rides mixer-y');

// root linear axes exist
ok(deck.getDevice('dispenser-x') && deck.getDevice('dispenser-x').params.axis === 'x', 'dispenser-x is an x linear');
ok(deck.getDevice('aspirator-z') && deck.getDevice('aspirator-z').params.axis === 'z', 'aspirator-z is a z linear');

// keep-apart relation between the two co-mounted gantry tools
ok(deck.relations.some((r) => r.type === 'collision' && r.between.includes('pipettor-z') && r.between.includes('gripper-z')), 'keep-apart relation for the two gantry Z tools');

// --- labware ----------------------------------------------------------------
console.log('Homunculus labware:');
ok(deck.getDevice('sample-rack') && deck.getDevice('sample-rack').type === 'tuberack', 'sample tube rack -> tuberack');
ok(deck.getDevice('tips-1000') && deck.getDevice('tips-1000').type === 'tiprack', '1000ul tip box -> tiprack');
ok(deck.getDevice('trash') && deck.getDevice('trash').type === 'waste', 'trash-bin (no def) -> waste placeholder');

// --- manifest + oracle ------------------------------------------------------
console.log('Manifest + oracle:');
const man = buildManifest(deck);
ok(man.schema === 'tjs.deck.manifest/1', 'manifest builds');
ok(man.sites.length > 90, `labware sites surfaced (got ${man.sites.length})`);
const r = checkSequence(deck, deck.sequences[0].steps);
ok(typeof r.cycleTime === 'number' && r.cycleTime > 0, `demo sequence has a cycle time (${r.cycleTime}s)`);
ok(Array.isArray(r.diagnostics), 'oracle returns diagnostics array');

// --- profiles ---------------------------------------------------------------
console.log('Device profiles:');
ok(profiles.length >= 8, `profiles emitted for the axes (got ${profiles.length})`);
const px = resolve(profiles, 'gantry-x');
ok(px && px.deviceId === 'gantry' && px.joint === 'x', 'gantry-x profile binds to hbot joint x');
const pa = resolve(profiles, 'gantry-hbot-a');
ok(pa && pa.role === 'hbot-a' && pa.node != null, 'gantry-hbot-a is a real amp profile with a node');
const pz = resolve(profiles, 'pipettor-z');
ok(pz && pz.joint === 'p' && pz.node != null && pz.deviceId === 'pipettor-z', 'pipettor-z profile binds to linear joint p with a node');
ok(byNode(profiles, pz.node) === pz, 'profile is resolvable by node (bridge addressing)');
const rot = profiles.find((p) => p.role === 'rotary');
ok(rot && rot.axis === 'mixer-seats-rotation' && !rot.rendered, 'rotary axis -> profile only, not rendered');

console.log(`notes: ${notes.length}`);
console.log(fails === 0 ? '\nALL PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails === 0 ? 0 : 1);
