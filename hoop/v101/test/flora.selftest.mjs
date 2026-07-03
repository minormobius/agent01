// flora.selftest.mjs — the flora kernel (garden/flora.js): the plant model the garden plot draws.
//   node hoop/v101/test/flora.selftest.mjs
//
// Pins the two ideas that make the bed legible — growth-FORM (nine distinct silhouettes inferred from
// the organism) and the GALENIC PALETTE (colour from the correspondence) — plus growth staging, the
// below-soil roots, and determinism (an NPC's garden must reproduce from its seed).

import { buildPlant, buildPlotFlora, growthForm, paletteOf, leafShapeFor, TEMPERAMENT_PALETTE, PLANET_FLOWER } from '../garden/flora.js';

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
  ok(p.branches.length >= 3 && p.leaves.length >= 4 && p.roots.length >= 3, 'a grown plant has a branch network, leaves, and a root network');
  ok(p.branches.every((b) => b.w0 <= 0.06 && b.w1 <= 0.06), 'no radius spike — the Murray clamp caps every segment (the "one member 10× too thick" bug)');
  ok(p.roots.every((r) => r.y1 <= 0.02), 'the root network stays at/below the soil line (the foraging goes DOWN)');
  ok(p.roots.some((r) => r.y1 < -0.05), 'the roots forage well below the surface (the microscope substrate)');
  ok(p.leaves.every((l) => l.y > 0), 'leaves are ABOVE the soil line');
  ok(p.branches.every((b) => b.w0 >= b.w1 - 1e-9), 'branches taper (Murray: base wider than tip)');
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
  ok(apple.leaves.length >= 30, `a grown tree is LUSH — leaves populate the twigs, not just tips (${apple.leaves.length})`);
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

// ── leaf shape diversity, orientation, rosette foliage, footprint (the review fixes) ──
{
  // rosettes are NOT leafless (the radish/parsnip NaN-angle bug)
  const radish = buildPlant({ name: 'Radish', crop: 'root', edible: true }, { stage: 1, seed: 2 });
  const parsnip = buildPlant({ name: 'Parsnip', crop: 'root', edible: true }, { stage: 1, seed: 2 });
  ok(radish.leaves.length >= 4 && parsnip.leaves.length >= 4, 'rosettes (radish/parsnip) grow leaves — not leafless');
  ok(radish.flowers.length === 0 && parsnip.flowers.length === 0, 'root-crop rosettes do NOT flower (harvested for the root before bolting — no stray orbs)');

  // distinct leaf shapes across species
  ok(leafShapeFor('conifer', 'Stone pine') === 'needle', 'a conifer → needle leaves');
  ok(leafShapeFor('herbClump', 'Fennel') === 'pinnate', 'fennel → pinnate (feathery) leaves');
  ok(leafShapeFor('vine', 'Bottle gourd') === 'palmate', 'a gourd → palmate leaves');
  ok(leafShapeFor('rosette', 'Leek') === 'strap', 'a leek → strap leaves');
  const shapes = new Set(['Fennel', 'Sage', 'Bottle gourd', 'Radish', 'Stone pine'].map((n) => buildPlant({ name: n, qualities: 'hot & dry' }, { stage: 1, seed: 1 }).leaves[0]?.shape).filter(Boolean));
  ok(shapes.size >= 3, `leaf shape varies across species (${[...shapes].join(', ')})`);

  // leaves point up-and-out, never droop into the soil
  const tree = buildPlant({ name: 'Apple', crop: 'fruit' }, { stage: 1, seed: 4 });
  ok(tree.leaves.every((l) => l.theta == null || Math.sin(l.theta) > -0.2), 'leaves point up-and-out (no drooping into the soil)');
  ok(tree.leaves.every((l) => l.shape), 'every leaf carries a shape');

  // footprint: a canopy radius so plants can be spaced apart
  ok(tree.footprint > 0 && tree.footprint <= 1, 'a plant has a footprint (canopy radius) for non-overlapping layout');
  const herb = buildPlant({ name: 'Mint', qualities: 'cold & moist' }, { stage: 1, seed: 4 });
  ok(tree.footprint > herb.footprint, 'a tree has a wider footprint than a herb');
}

console.log(`flora.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
