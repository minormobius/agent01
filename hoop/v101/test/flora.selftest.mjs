// flora.selftest.mjs — the flora kernel (garden/flora.js): the plant model the garden plot draws.
//   node hoop/v101/test/flora.selftest.mjs
//
// Pins the two ideas that make the bed legible — growth-FORM (nine distinct silhouettes inferred from
// the organism) and the GALENIC PALETTE (colour from the correspondence) — plus growth staging, the
// below-soil roots, and determinism (an NPC's garden must reproduce from its seed).

import { buildPlant, buildPlotFlora, growthForm, paletteOf, TEMPERAMENT_PALETTE, PLANET_FLOWER } from '../garden/flora.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── growth-form inference: the right silhouette for the organism ──
ok(growthForm({ name: 'Fly agaric', reagentClass: 'fungal', kind: 'fungus' }) === 'fungusCap', 'a fungus → fungusCap');
ok(growthForm({ name: 'Apple', crop: 'fruit' }) === 'broadleaf', 'a fruit tree → broadleaf');
ok(growthForm({ name: 'Stone pine', sciName: 'Pinus pinea', crop: 'nut' }) === 'conifer', 'a pine → conifer');
ok(growthForm({ name: 'Barley', crop: 'grain' }) === 'grain', 'a grain → grain');
ok(growthForm({ name: 'Radish', crop: 'root', edible: true }) === 'rosette', 'a root crop → rosette');
ok(growthForm({ name: 'Bottle gourd', sciName: 'Lagenaria siceraria' }) === 'vine', 'a gourd → vine');
ok(growthForm({ name: 'Common reed', sciName: 'Phragmites australis' }) === 'reed', 'a reed → reed');
ok(growthForm({ name: 'Rue', qualities: 'hot & dry', reagentClass: 'plant' }) === 'shrub', 'an aromatic hot·dry herb → shrub');
ok(['herbClump', 'stalk'].includes(growthForm({ name: 'Betony', qualities: 'cold & dry', reagentClass: 'plant' })), 'a soft physic herb → clump or stalk');

// ── the Galenic palette: temperament → colour, planet → flower accent ──
{
  ok(Object.keys(TEMPERAMENT_PALETTE).length === 4, 'the four temperaments each have a palette');
  const hot = paletteOf({ qualities: 'hot & dry', planet: 'Sun', reagentClass: 'plant' });
  const cold = paletteOf({ qualities: 'cold & moist', planet: 'Moon', reagentClass: 'plant' });
  ok(hot.leaf !== cold.leaf && hot.stem !== cold.stem, 'a hot·dry herb and a cold·moist herb read differently (the bed is a spectrum, not a smear)');
  ok(hot.flower === PLANET_FLOWER.Sun, 'the flower carries the ruling planet (Sun → gold)');
  ok(cold.flower === PLANET_FLOWER.Moon, 'the flower carries the ruling planet (Moon → silver)');
  // a non-alch staple falls back to a crop palette (no correspondence)
  ok(paletteOf({ crop: 'grain' }).stem && paletteOf({ crop: 'grain' }).stem !== hot.stem, 'a staple with no correspondence colours by crop kind');
}

// ── the model has the parts a renderer needs, and staging scales them ──
{
  const p = buildPlant({ name: 'Sage', qualities: 'hot & dry', planet: 'Jupiter', reagentClass: 'plant' }, { stage: 1, seed: 3 });
  ok(p.stems.length >= 1 && p.leaves.length >= 4 && p.roots.length >= 2, 'a grown plant has stems, leaves, and roots');
  ok(p.roots.every((r) => r.y1 < 0), 'roots go BELOW the soil line (−y) — the microscope substrate');
  ok(p.leaves.every((l) => l.y > 0), 'leaves are ABOVE the soil line');
  ok(p.palette.stem && p.palette.leaf && p.palette.flower, 'the model carries its palette');
}
{
  const seedling = buildPlant({ name: 'Sage', qualities: 'hot & dry', reagentClass: 'plant' }, { stage: 0.1, seed: 3 });
  const grown = buildPlant({ name: 'Sage', qualities: 'hot & dry', reagentClass: 'plant' }, { stage: 1, seed: 3 });
  ok(grown.height > seedling.height && grown.rootDepth > seedling.rootDepth, 'growth stage scales height + root depth');
  ok(seedling.flowers.length === 0, 'a sprout has no flowers');
  ok(grown.stageLabel === 'ripe' || grown.stageLabel === 'flowering', 'a grown plant is flowering/ripe');
}
{
  // a rosette root crop grows a swollen tuber; a fruit tree fruits when ripe
  const radish = buildPlant({ name: 'Radish', crop: 'root', edible: true }, { stage: 1, seed: 5 });
  ok(radish.tuber && radish.tuber.r > 0, 'a root crop swells a tuber below ground');
  const apple = buildPlant({ name: 'Apple', crop: 'fruit' }, { stage: 1, seed: 5 });
  ok(apple.fruits.length >= 1, 'a ripe fruit tree bears fruit');
  const agaric = buildPlant({ name: 'Fly agaric', reagentClass: 'fungal', kind: 'fungus' }, { stage: 1, seed: 5 });
  ok(agaric.cap && agaric.cap.r > 0 && agaric.leaves.length === 0, 'a fungus has a cap and no leaves');
}

// ── determinism: an NPC's garden reproduces exactly from its seed ──
{
  const a = buildPlant({ name: 'Mint', qualities: 'cold & moist' }, { stage: 0.8, seed: 42 });
  const b = buildPlant({ name: 'Mint', qualities: 'cold & moist' }, { stage: 0.8, seed: 42 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'same (descriptor, stage, seed) → byte-identical plant');
  const c = buildPlant({ name: 'Mint', qualities: 'cold & moist' }, { stage: 0.8, seed: 43 });
  ok(JSON.stringify(a) !== JSON.stringify(c), 'a different seed → a different plant');
}

// ── a whole plot lays out ──
{
  const descs = [
    { name: 'Sage', qualities: 'hot & dry', planet: 'Jupiter', reagentClass: 'plant' },
    { name: 'Radish', crop: 'root', edible: true },
    { name: 'Apple', crop: 'fruit' },
    { name: 'Fly agaric', reagentClass: 'fungal', kind: 'fungus' },
  ];
  const plot = buildPlotFlora(descs, { stages: [1, 0.6, 1, 0.4], seed: 7, cols: 3 });
  ok(plot.length === 4 && plot.every((s) => s.plant && s.x >= 0 && s.x <= 1), 'a plot lays out every slot with a positioned plant');
  ok(new Set(plot.map((s) => s.plant.form)).size === 4, 'the four slots read as four distinct forms');
}

console.log(`flora.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
