// garden.selftest — the GROW kernel: ark integrity, growth math, plant/harvest, deterministic starters.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PLOTS_PER_GARDEN, cropById, emptyGarden, growth, plant, readySlots, harvest, starterSeeds, makeGarden } from '../garden/garden.js';

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

// 3. plant + harvest lifecycle
let plots = emptyGarden();
ok(plots.length === PLOTS_PER_GARDEN && plots.every((p) => p === null), 'empty garden is all open slots');
plots = plant(plots, 2, crop.id, 0);
ok(plots[2] && plots[2].seedId === crop.id, 'plant fills the chosen slot');
ok(plant(plots, 2, crop.id, 0)[2].day === 0, 'planting an occupied slot is a no-op');
ok(readySlots(plots, ark, 1).length === 0, 'nothing ready before maturity');
ok(readySlots(plots, ark, crop.growthDays).length === 1, 'one slot ready at maturity');
const h = harvest(plots, 2, ark, crop.growthDays);
ok(h && h.cropId === crop.id && h.yield === crop.yield, 'harvest returns the crop + yield');
ok(h.seeds >= 1 && h.seeds <= 3, `harvest also yields SEED to replant (${h.seeds})`);
ok(h.plots[2] === null, 'harvested slot is cleared');
ok(harvest(plots, 2, ark, 1) === null, 'cannot harvest before ready');

// 3b. makeGarden — the random NPC-placed first view
{
  const g1 = makeGarden(42, ark, 100), g2 = makeGarden(42, ark, 100);
  ok(g1.length === PLOTS_PER_GARDEN, 'makeGarden fills a full-size bed');
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'an NPC garden is deterministic from its seed');
  ok(JSON.stringify(makeGarden(7, ark, 100)) !== JSON.stringify(g1), 'a different NPC seeds a different garden');
  const planted = g1.filter(Boolean);
  ok(planted.length >= 1 && planted.length < PLOTS_PER_GARDEN, 'some plots planted, some left fallow (a tended, not packed, bed)');
  ok(planted.every((p) => cropById(ark, p.seedId)), 'every planted slot is a real ark crop');
  const stages = planted.map((p) => growth(p, cropById(ark, p.seedId), 100).stage);
  ok(new Set(stages.map((s) => Math.round(s * 3))).size >= 2, 'the bed shows a MIX of growth stages (staggered planting)');
}

// 4. deterministic starter bag
const a = starterSeeds(7, ark), b = starterSeeds(7, ark);
ok(JSON.stringify(a) === JSON.stringify(b), 'starter bag is deterministic per world seed');
ok(Object.keys(a).length >= 1 && Object.values(a).every((n) => n > 0), 'starter bag has seeds');
ok(JSON.stringify(starterSeeds(7, ark)) !== JSON.stringify(starterSeeds(99, ark)) || Object.keys(a).length < 2, 'different seeds → (usually) different bag');

console.log(`garden.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
