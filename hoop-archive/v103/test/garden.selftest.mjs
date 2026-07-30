// garden.selftest — the GROW kernel: ark integrity, growth math, one-bed continuum plant/harvest with
// keep-out zones, and deterministic starters.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PLANTS_PER_BED, MIN_SPACING, BED_MARGIN, cropById, emptyGarden, growth, plantAt, plantable, plantNear,
  readyPlants, harvestPlant, bedKeepouts, inKeepout, starterSeeds, makeGarden } from '../garden/garden.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(HERE, '../garden/ark.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. ark integrity (flat crop pool, deduped across biomes)
ok(ark.crops.length >= 10, `ark has distinct crops (${ark.crops.length})`);
ok(ark.cropIndex && Object.keys(ark.cropIndex).length === ark.crops.length, 'cropIndex covers every crop');
for (const c of ark.crops) {
  ok(c.id && c.common && c.sciName, `crop ${c.id} has identity`);
  ok(c.growthDays >= 1 && c.growthDays <= 7, `crop ${c.common} growthDays in range (${c.growthDays})`);
  ok(c.yield >= 1 && c.nourish >= 1, `crop ${c.common} has game stats`);
}
ok(ark.crops.some((c) => c.thumb.startsWith('http')), 'crops carry iNat thumbnails');

// 2. growth math
const crop = ark.crops[0], plot = { seedId: crop.id, day: 10 };
ok(growth(plot, crop, 10).stage === 0 && !growth(plot, crop, 10).ready, 'day-planted = stage 0, not ready');
ok(growth(plot, crop, 10 + crop.growthDays).ready, 'matures exactly at growthDays');
ok(growth(plot, crop, 10 + crop.growthDays + 5).stage === 1, 'stage caps at 1');
ok(growth(plot, crop, 12).daysLeft === crop.growthDays - 2, 'daysLeft counts down');

// 3. keep-out zones — derived from the bed seed, deterministic, and they reject planting
{
  const k1 = bedKeepouts(1234), k2 = bedKeepouts(1234);
  ok(JSON.stringify(k1) === JSON.stringify(k2), 'keep-outs are deterministic from the bed seed');
  ok(k1.path && k1.path.pts.length > 1 && k1.blobs.length >= 1, 'a bed has a path + at least a pond');
  const pond = k1.blobs.find((b) => b.kind === 'pond');
  ok(pond && inKeepout(k1, pond.x, pond.y), 'the pond centre is inside a keep-out');
  ok(JSON.stringify(bedKeepouts(9)) !== JSON.stringify(k1), 'a different bed seed → a different keep-out layout');
}

// 4. one-bed continuum plant + harvest lifecycle
let bed = emptyGarden(5);
ok(bed.plants.length === 0 && bed.seed === 5, 'an empty bed has no plants and remembers its seed');
// find a plantable spot (avoid the keep-outs deterministically)
const ko = bedKeepouts(bed.seed);
let spot = null; for (let gx = 1; gx <= 9 && !spot; gx++) for (let gy = 1; gy <= 9 && !spot; gy++) { const x = gx / 10, y = gy / 10; if (plantable(bed, x, y, ko)) spot = { x, y }; }
ok(spot, 'the bed has plantable ground');
bed = plantAt(bed, spot.x, spot.y, crop.id, 0);
ok(bed.plants.length === 1 && bed.plants[0].seedId === crop.id, 'plantAt places a plant at a free (x,y)');
ok(!plantable(bed, spot.x + MIN_SPACING * 0.3, spot.y, ko), 'you cannot plant crowding an existing plant (spacing)');
ok(plantAt(bed, spot.x + MIN_SPACING * 0.3, spot.y, crop.id, 0).plants.length === 1, 'a crowded plantAt is a no-op copy');
ok(!plantable(bed, 0.001, 0.001, ko), 'you cannot plant in the bed margin');
const pondB = ko.blobs.find((b) => b.kind === 'pond');
ok(!plantable(bed, pondB.x, pondB.y, ko), 'you cannot plant in the pond (a keep-out)');
ok(plantNear(bed, spot.x, spot.y) === 0, 'plantNear finds the plant under the cursor');
ok(readyPlants(bed, ark, 1).length === 0, 'nothing ready before maturity');
ok(readyPlants(bed, ark, crop.growthDays).length === 1, 'one plant ready at maturity');
const h = harvestPlant(bed, 0, ark, crop.growthDays);
ok(h && h.cropId === crop.id && h.yield === crop.yield, 'harvest returns the crop + yield');
ok(h.seeds >= 1 && h.seeds <= 3, `harvest also yields SEED to replant (${h.seeds})`);
ok(h.bed.plants.length === 0, 'the harvested plant is removed from the bed');
ok(harvestPlant(bed, 0, ark, 1) === null, 'cannot harvest before ready');

// 4b. makeGarden — the random NPC-planted first view (one full bed)
{
  const g1 = makeGarden(42, ark, 100), g2 = makeGarden(42, ark, 100);
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'an NPC bed is deterministic from its seed');
  ok(JSON.stringify(makeGarden(7, ark, 100)) !== JSON.stringify(g1), 'a different NPC seeds a different bed');
  ok(g1.plants.length >= 6 && g1.plants.length <= PLANTS_PER_BED, `the bed is planted full (${g1.plants.length} plants)`);
  ok(g1.plants.every((p) => cropById(ark, p.seedId)), 'every plant is a real ark crop');
  const kg = bedKeepouts(g1.seed);
  ok(g1.plants.every((p) => !inKeepout(kg, p.x, p.y) && p.x >= BED_MARGIN && p.x <= 1 - BED_MARGIN), 'no NPC plant lands in a keep-out or the margin');
  // no two plants closer than the spacing
  let crowded = false; for (let i = 0; i < g1.plants.length; i++) for (let j = i + 1; j < g1.plants.length; j++) { const a = g1.plants[i], b = g1.plants[j]; if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (MIN_SPACING * 0.999) ** 2) crowded = true; }
  ok(!crowded, 'NPC plants respect the spacing (no two crammed together)');
  const stages = g1.plants.map((p) => growth(p, cropById(ark, p.seedId), 100).stage);
  ok(new Set(stages.map((s) => Math.round(s * 3))).size >= 2, 'the bed shows a MIX of growth stages (staggered planting)');
}

// 4. deterministic starter bag
const a = starterSeeds(7, ark), b = starterSeeds(7, ark);
ok(JSON.stringify(a) === JSON.stringify(b), 'starter bag is deterministic per world seed');
ok(Object.keys(a).length >= 1 && Object.values(a).every((n) => n > 0), 'starter bag has seeds');
ok(JSON.stringify(starterSeeds(7, ark)) !== JSON.stringify(starterSeeds(99, ark)) || Object.keys(a).length < 2, 'different seeds → (usually) different bag');

console.log(`garden.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
