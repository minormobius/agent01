// node bees/hazard.selftest.mjs — the authoritative hazard model. Pure, no DOM.
import { SwarmHazard } from './hazard.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const world = { w: 320, h: 220 };

// determinism: identical (seed, player path) → identical damage sequence
function run(seed, path) {
  const hz = new SwarmHazard({ seed, world, cx: 160, cy: 110 });
  return path.map(p => hz.stepTo(p[0], p[1]).damage);
}
const path = Array.from({ length: 40 }, (_, i) => [160 + Math.sin(i) * 30, 110 + i]); // deterministic path
const a = run('hive:A', path), b = run('hive:A', path);
ok(JSON.stringify(a) === JSON.stringify(b), 'same seed + path → identical damage sequence');
const c = run('hive:B', path);
ok(JSON.stringify(a) !== JSON.stringify(c), 'different seed → different sequence (seeded wander)');

// density falls off with distance, monotonically
const hz = new SwarmHazard({ seed: 'd', world, cx: 160, cy: 110 });
ok(hz.density(160, 110) > hz.density(180, 110), 'density higher at centre than 20u out');
ok(hz.density(180, 110) > hz.density(220, 110), 'density keeps falling further out');
ok(hz.density(160, 110) <= hz.o.maxIntensity, 'centre density bounded by intensity');

// aggro: standing in the swarm rouses it (intensity climbs); fleeing lets it lapse
const h2 = new SwarmHazard({ seed: 'ag', world, cx: 160, cy: 110 });
const i0 = h2.intensity;
for (let k = 0; k < 8; k++) h2.stepTo(160, 110);     // sit on top of it
ok(h2.intensity > i0 && h2.aggro > 0, `roused: intensity ${i0.toFixed(2)}→${h2.intensity.toFixed(2)}`);
const iHot = h2.intensity;
for (let k = 0; k < 30; k++) h2.stepTo(10, 10);       // run to the far corner
ok(h2.intensity < iHot && h2.aggro === 0, `calmed after fleeing: →${h2.intensity.toFixed(2)}`);

// damage is higher when standing in the cloud than when far away
const h3 = new SwarmHazard({ seed: 'dm', world, cx: 160, cy: 110 });
for (let k = 0; k < 6; k++) h3.stepTo(160, 110);
const near = h3.stepTo(160, 110).damage;
const far = h3.stepTo(300, 200).damage;
ok(near > far, `damage near (${near}) > far (${far})`);
ok(far === 0 || far < near, 'far damage negligible');

// pursuit: roused centroid moves toward the player
const h4 = new SwarmHazard({ seed: 'pu', world, cx: 160, cy: 110 });
for (let k = 0; k < 4; k++) h4.stepTo(150, 110); // rouse near, player just left of centre
const cxBefore = h4.cx;
for (let k = 0; k < 6; k++) h4.stepTo(60, 110);  // player runs left; swarm should chase left
ok(h4.cx < cxBefore, `roused centroid pursues player left (${cxBefore.toFixed(0)}→${h4.cx.toFixed(0)})`);

// repulse: a swat pushes the centroid away and thins the cloud
const h5 = new SwarmHazard({ seed: 'rp', world, cx: 160, cy: 110 });
for (let k = 0; k < 8; k++) h5.stepTo(160, 110);
const iPre = h5.intensity, distPre = Math.hypot(h5.cx - 160, h5.cy - 110);
h5.repulse(160, 110);
const distPost = Math.hypot(h5.cx - 160, h5.cy - 110);
ok(h5.intensity < iPre, `swat thins cloud (${iPre.toFixed(2)}→${h5.intensity.toFixed(2)})`);
ok(distPost > distPre, 'swat pushes centroid away from the swat point');

// centroid stays in-world
const h6 = new SwarmHazard({ seed: 'bd', world, cx: 5, cy: 5 });
for (let k = 0; k < 100; k++) h6.stepTo(-50, -50);
ok(h6.cx >= 0 && h6.cy >= 0 && h6.cx <= world.w && h6.cy <= world.h, 'centroid clamped in-world');

console.log(`\nbees/hazard.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
