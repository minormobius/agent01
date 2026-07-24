// flora.js — THE FLORA KERNEL. A pure, seeded PLANT MODEL for the garden plot, grown by real generative
// botany (garden/grow.js): the shoot and the root are each a FORAGING NETWORK (space-colonization /
// physarum family) — the shoot forages up toward a light-cloud, the root down toward a water/nutrient
// cloud, branch thickness follows Murray's law, and leaves/florets are placed by PHYLLOTAXIS (the
// golden angle). No more hand-sketched boxy stems. The renderer just strokes the segments it returns.
//
// Two ideas keep the bed legible: the GROWTH-FORM shapes the attractor clouds (a tree's crown is high &
// round, a shrub's low & wide, a reed's a vertical column, a rosette's leaves spring from the collar
// over a taproot) so no two silhouettes read alike; and the GALENIC PALETTE colours each alch reagent
// by its temperament (hot·dry warm & silver, cold·moist lush blue-green, …) with the flower in the
// ruling planet's colour — the appearance IS the alchemy. Deterministic from (descriptor, stage, seed):
// an NPC's garden reproduces exactly. Coordinates: base at (0,0) on the soil surface; +y UP (shoot),
// −y DOWN (root); x centred; normalized plot-units. Node-tested (test/flora.selftest.mjs).

import { forage, crownCloud, rootCloud, phyllotaxis, vogelSpiral, GOLDEN_ANGLE } from './grow.js';

function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rngFor = (s) => mulberry32(xmur3(String(s))());
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// ── the Galenic palettes: temperament → colour language (read/alch's four TEMPERAMENTS) ──
export const TEMPERAMENT_PALETTE = {
  'hot & dry':    { stem: '#8a6a3a', leaf: '#8fa06b', leafHi: '#c8d59a', flower: '#e6a13c' },
  'hot & moist':  { stem: '#5f7d3e', leaf: '#5fae52', leafHi: '#a6e08a', flower: '#e07aa0' },
  'cold & moist': { stem: '#4a7d63', leaf: '#4f9a86', leafHi: '#9fe0cf', flower: '#e8f0f6' },
  'cold & dry':   { stem: '#6a6f5a', leaf: '#7c8a72', leafHi: '#aab29a', flower: '#9a7fb0' },
};
export const PLANET_FLOWER = { Sun: '#f4c542', Moon: '#e8eef2', Mercury: '#c8d0d8', Venus: '#e78fb0', Mars: '#d9483b', Jupiter: '#5aa9e6', Saturn: '#7d6f86' };
const CROP_PALETTE = {
  grain: { stem: '#c7a94e', leaf: '#b7b562', leafHi: '#e6d98a', flower: '#e8d27a' },
  legume: { stem: '#5f7d3e', leaf: '#63a256', leafHi: '#a6d68a', flower: '#f0f0f0' },
  root: { stem: '#5f7d3e', leaf: '#6faa5a', leafHi: '#b6e090', flower: '#e9e6c0' },
  tuber: { stem: '#5f7d3e', leaf: '#6faa5a', leafHi: '#b6e090', flower: '#f0c94a' },
  oil: { stem: '#7d9a55', leaf: '#9ab06a', leafHi: '#d6e0a0', flower: '#f2e04a' },
  fruit: { stem: '#6b4a2e', leaf: '#4f8a45', leafHi: '#9fd08a', flower: '#f6dfe8' },
  nut: { stem: '#6b4a2e', leaf: '#4a7e42', leafHi: '#93c07e', flower: '#dfe0c0' },
  default: { stem: '#5f7d3e', leaf: '#5fae52', leafHi: '#a6e08a', flower: '#eae4c6' },
};

// ── growth-form inference: an organism descriptor → one of nine silhouettes ──
const AROMATIC_SHRUB = /rue|wormwood|southernwood|lavender|hyssop|savin|sage|savory|rosemary|thyme|oregano/i;
const VINE = /gourd|melon|cucumber|pumpkin|squash|grape|hop/i;
const REEDY = /reed|cattail|rush|sedge|papyrus|iris|flag/i;
const EDIBLE_ROOTISH = /radish|parsnip|leek|onion|turnip|beet|carrot|garlic|celery/i;
export function growthForm(d) {
  const n = (d.name || '') + ' ' + (d.sciName || '');
  if (d.kind === 'fungus' || d.reagentClass === 'fungal') return 'fungusCap';
  if (/pine|conifer|spruce|fir|cedar/i.test(n)) return 'conifer';
  if (d.crop === 'fruit' || d.crop === 'nut') return 'broadleaf';
  if (d.crop === 'grain' || /barley|rye|wheat|oat|maize|sorghum/i.test(n)) return 'grain';
  if (d.crop === 'root' || d.crop === 'tuber' || (d.edible && EDIBLE_ROOTISH.test(n))) return 'rosette';
  if (VINE.test(n)) return 'vine';
  if (REEDY.test(n)) return 'reed';
  if (AROMATIC_SHRUB.test(n)) return 'shrub';
  return (rngFor(n + ':form')() < 0.4) ? 'stalk' : 'herbClump';
}
export function paletteOf(d) {
  const base = (d.qualities && TEMPERAMENT_PALETTE[d.qualities]) || CROP_PALETTE[d.crop] || CROP_PALETTE.default;
  const flower = (d.planet && PLANET_FLOWER[d.planet]) || base.flower;
  return { stem: base.stem, leaf: base.leaf, leafHi: base.leafHi, flower, root: '#c9b48c' };
}

// ── leaf SHAPE — a small botanical taxonomy so a fennel doesn't look like a sage. The renderer draws
// each silhouette distinctly; width is the shape's aspect. Inferred from form + species name. ──
const L_NEEDLE = /thyme|rosemary|savory|hyssop|juniper|savin/i;
const L_STRAP = /leek|onion|garlic|chive|iris|flag|cattail|reed/i;
const L_PINNATE = /fennel|dill|lovage|celery|coriander|caraway|angelica|parsnip|carrot|wormwood|southernwood|mugwort|tansy|yarrow|chamomile|feverfew|agrimon|rue|vetch/i;
const L_PALMATE = /gourd|melon|cucumber|pumpkin|squash|hemp|mallow|marshmallow|fig|maple|ricinus/i;
const L_LOBED = /oak|hawthorn|radish|mustard|rocket|dandelion|sow.?thistle|borage|bugloss/i;
export const LEAF_WID = { needle: 0.06, strap: 0.14, lance: 0.26, ovate: 0.5, lobed: 0.58, palmate: 0.8, pinnate: 0.42, round: 0.95 };
export function leafShapeFor(form, name = '') {
  if (form === 'conifer' || L_NEEDLE.test(name)) return 'needle';
  if (L_STRAP.test(name)) return 'strap';
  if (L_PINNATE.test(name)) return 'pinnate';
  if (L_PALMATE.test(name) || form === 'vine') return 'palmate';
  if (L_LOBED.test(name)) return 'lobed';
  if (form === 'rosette') return 'strap';
  if (form === 'shrub') return 'lance';
  return 'ovate';
}

// per-form target dimensions (at full growth)
const H_MAX = { broadleaf: 1.15, conifer: 1.1, reed: 1.0, grain: 0.7, stalk: 0.7, shrub: 0.42, vine: 0.5, rosette: 0.26, herbClump: 0.3, fungusCap: 0.34 };
const SP_MAX = { broadleaf: 0.6, conifer: 0.4, shrub: 0.34, vine: 0.7, rosette: 0.3, reed: 0.12, grain: 0.14, herbClump: 0.24, stalk: 0.18, fungusCap: 0.2 };
// per-form MAX trunk radius (the Murray-law clamp — a tree trunk is fat, a herb stem thin)
const MAXR = { broadleaf: 0.055, conifer: 0.05, shrub: 0.03, vine: 0.022, rosette: 0.02, reed: 0.012, grain: 0.012, herbClump: 0.018, stalk: 0.02, fungusCap: 0.05 };

// ── buildPlant(descriptor, { stage=1, seed=1 }) → the model the renderer strokes ──
// { form, stage, palette, height, spread, rootDepth, branches[seg], roots[seg], leaves[], flowers[], fruits[], cap, tuber }
export function buildPlant(d = {}, { stage = 1, seed = 1 } = {}) {
  stage = clamp01(stage);
  const form = growthForm(d);
  const pal = paletteOf(d);
  const R = rngFor((d.name || d.sciName || 'plant') + '#' + seed);
  // rosettes are root/leaf crops — harvested for the root before they bolt, so they don't flower.
  const flowering = stage > 0.55 && form !== 'reed' && form !== 'grain' && form !== 'rosette';
  const ripe = stage >= 0.95;
  const height = lerp(0.06, H_MAX[form] || 0.35, stage);
  const spread = lerp(0.05, SP_MAX[form] || 0.22, stage);
  const rootDepth = lerp(0.05, form === 'broadleaf' || form === 'conifer' ? 0.7 : form === 'rosette' ? 0.5 : 0.35, stage);
  const model = { id: d.id || null, name: d.name || d.sciName || 'plant', form, stage,
    stageLabel: stage < 0.15 ? 'sprout' : stage < 0.55 ? 'growing' : ripe ? 'ripe' : 'flowering',
    palette: pal, height, spread, rootDepth, branches: [], roots: [], leaves: [], flowers: [], fruits: [], cap: null, tuber: null };

  const rMax = (MAXR[form] || 0.025) * lerp(0.45, 1, stage);   // thinner when young; the Murray clamp
  // roots — a foraging network toward the soil water/nutrient cloud (down). Every plant has one.
  const rootNet = forage({ base: { x: 0, y: 0 }, attractors: rootCloud(form, { depth: rootDepth, spread, n: Math.round(lerp(5, 30, stage)), seed: seed * 29 }),
    dirBias: { x: 0, y: -0.45 }, influence: Math.max(0.25, spread * 1.6), kill: 0.05, step: lerp(0.03, 0.055, stage), maxNodes: 150, maxRadius: rMax * 0.7, seed: seed * 29 });
  model.roots = rootNet.segments;

  if (form === 'fungusCap') {
    const h = height, capR = lerp(0.04, 0.20, stage);
    model.branches.push({ x0: 0, y0: 0, x1: (R() - 0.5) * 0.03, y1: h, w0: 0.05, w1: 0.035 });
    model.cap = { x: 0, y: h, r: capR, gills: 8 + Math.floor(R() * 8), warts: /amanita|agaric/i.test(model.name) };
    return model;
  }

  // shoot — a foraging network toward the light-cloud the growth-form scatters (up)
  const nCrown = Math.round(lerp(6, form === 'broadleaf' ? 48 : 34, stage) * (form === 'reed' || form === 'grain' ? 0.6 : 1));
  const shoot = forage({ base: { x: 0, y: 0.01 }, attractors: crownCloud(form, { height, spread, n: nCrown, seed: seed * 13 }),
    dirBias: { x: 0, y: 0.4 }, influence: Math.max(0.28, spread * 1.7), kill: 0.05, step: lerp(0.03, 0.06, stage), maxNodes: form === 'broadleaf' ? 280 : 160, maxRadius: rMax, seed: seed * 13 });
  model.branches = shoot.segments;
  const tips = shoot.tips.length ? shoot.tips : [shoot.nodes.length - 1];

  if (form === 'rosette') model.tuber = { x: 0, y: -rootDepth * 0.5, r: lerp(0.02, 0.12, stage), kind: /onion|leek|garlic/i.test(model.name) ? 'bulb' : 'taproot' };

  // leaves — phyllotaxis (golden angle) on the FOLIAGE TWIGS, culled by IRRADIANCE (a leaf lives where
  // light reaches — the lit shell of the crown, not the shaded interior or the trunk). Each leaf carries
  // a plot-space direction `theta` (points up-and-out, never into the soil) + a `shape`. Rosette = a
  // basal fan over the taproot.
  const shape = leafShapeFor(form, model.name), lwid = LEAF_WID[shape] || 0.45;
  if (form !== 'reed' && form !== 'grain' && form !== 'fungusCap') {
    if (form === 'rosette') {
      const nl = Math.round(lerp(5, 12, stage));
      for (let i = 0; i < nl; i++) { const t = nl > 1 ? i / (nl - 1) : 0.5; const theta = lerp(Math.PI * 0.16, Math.PI * 0.84, t) + (R() - 0.5) * 0.15;
        model.leaves.push({ x: (t - 0.5) * spread * 0.3, y: height * 0.06, theta, len: lerp(0.09, 0.24, stage) * (0.85 + 0.3 * ((i * 0.37) % 1)), wid: lwid, shape }); }
    } else {
      const twig = [];
      for (let i = 1; i < shoot.nodes.length; i++) if (shoot.nodes[i].children <= 1) twig.push(i);   // twigs + tips
      // IRRADIANCE SURVIVORSHIP: score each twig by exposure (height + radial offset from the axis)
      // minus shade (twigs above & near it); keep the best-lit fraction → foliage forms a canopy SHELL.
      const expo = twig.map((i) => { const n = shoot.nodes[i]; let shade = 0; for (const j of twig) { const m = shoot.nodes[j]; if (m.y > n.y + 0.02 && Math.abs(m.x - n.x) < 0.08 && m.y - n.y < 0.25) shade++; } return { i, e: n.y + Math.abs(n.x) * 0.6 - shade * 0.05 }; });
      expo.sort((a, b) => b.e - a.e);
      const keep = Math.max(3, Math.round(expo.length * lerp(0.4, 0.8, stage)));
      const size = form === 'broadleaf' ? lerp(0.025, 0.055, stage) : lerp(0.03, 0.07, stage);
      const base = R() * 6.283;
      let k = 0;
      for (const { i } of expo.slice(0, keep)) {
        const n = shoot.nodes[i], pr = n.parent >= 0 ? shoot.nodes[n.parent] : { x: n.x, y: n.y - 0.05 };
        const branchAng = Math.atan2(n.y - pr.y, n.x - pr.x), roll = base + k * GOLDEN_ANGLE, side = Math.sin(roll) >= 0 ? 1 : -1;
        let theta = branchAng + side * lerp(0.5, 1.0, Math.abs(Math.cos(roll)));   // splay up-and-out from the twig
        if (Math.sin(theta) < -0.15) theta = -theta;                                // mirror upward — never droop into the soil
        model.leaves.push({ x: n.x, y: n.y, theta, len: size * (0.8 + 0.4 * ((k * 0.6180339) % 1)), wid: lwid, shape });
        k++;
      }
    }
  }

  // flowers — an UMBEL (tiny florets in a flat cluster: fennel/dill/lovage), a DAISY (petal ring + disk:
  // chamomile/tansy/yarrow) or a simple floret. Small, at shoot tips — an umbellifer is a lace of dots,
  // not a giant gold disc.
  if (flowering) {
    const name = model.name;
    const umbel = /fennel|dill|lovage|celery|coriander|caraway|angelica|parsnip|carrot/i.test(name);
    const daisy = /chamomile|tansy|yarrow|feverfew|marigold|aster|daisy|agrimon/i.test(name);
    const nf = Math.max(1, Math.round(lerp(1, form === 'shrub' || form === 'herbClump' ? 5 : 3, stage)));
    for (let k = 0; k < Math.min(nf, tips.length); k++) {
      const n = shoot.nodes[tips[k]], r = lerp(0.009, 0.017, R());
      if (umbel) model.flowers.push({ x: n.x, y: n.y, r, kind: 'umbel', florets: vogelSpiral(9 + Math.floor(R() * 7), r * 0.7).map((p) => ({ x: n.x + p.x, y: n.y + p.y })) });
      else if (daisy) model.flowers.push({ x: n.x, y: n.y, r, kind: 'daisy', petals: 12 });
      else model.flowers.push({ x: n.x, y: n.y, r, kind: 'floret', petals: 5 });
    }
  }
  // fruit — ripe orchard/vine
  if (ripe && (form === 'broadleaf' || form === 'vine')) {
    const nf = form === 'vine' ? 1 : 3 + Math.floor(R() * 4);
    for (let k = 0; k < nf; k++) { const n = shoot.nodes[tips[(k * 3) % tips.length]]; model.fruits.push({ x: form === 'vine' ? n.x * 0.6 : n.x, y: form === 'vine' ? 0.02 : n.y, r: lerp(form === 'vine' ? 0.05 : 0.02, form === 'vine' ? 0.1 : 0.045, R()), ripe: true }); }
  }
  // FOOTPRINT — the plant's canopy radius (plot units): the widest reach of any branch or leaf from the
  // axis. The layout uses it to give each plant its own space so they don't grow on top of one another.
  let fp = spread * 0.5;
  for (const b of model.branches) fp = Math.max(fp, Math.abs(b.x1));
  for (const l of model.leaves) fp = Math.max(fp, Math.abs(l.x) + l.len * 0.7);
  model.footprint = fp;
  return model;
}

// a whole plot's worth of plants: descriptors[] + per-slot stage → an arrangement the renderer lays out.
export function buildPlotFlora(descriptors, { stages = [], seed = 1, cols = 3 } = {}) {
  const R = rngFor('plot#' + seed);
  return (descriptors || []).map((d, i) => {
    const st = stages[i] != null ? stages[i] : 1;
    const col = i % cols, row = Math.floor(i / cols);
    return { slot: i, col, row, x: (col + 0.5) / cols + (R() * 2 - 1) * 0.06, y: 0.35 + row * 0.42 + (R() * 2 - 1) * 0.04, plant: buildPlant(d, { stage: st, seed: seed * 131 + i }) };
  });
}

// descriptorForCrop — adapt a garden-ark crop (id/common/sciName/category) into a flora descriptor.
// `corr` (optional) is the alch correspondence for its binomial ({qualities, planet} from
// alchemy.findReagent) — supply it and an alch herb keeps its temperament colour; omit it and a staple
// colours by crop kind. The category maps to the growth-form's crop tag.
const CATEGORY_CROP = { GRAIN: 'grain', LEGUME: 'legume', OIL: 'oil', ROOT: 'root', TUBER: 'tuber', FRUIT: 'fruit', NUT: 'nut' };
export function descriptorForCrop(crop = {}, corr = null) {
  return { id: crop.id, name: crop.common || crop.id, sciName: crop.sciName || '',
    crop: CATEGORY_CROP[crop.category] || crop.crop || null, edible: true,
    qualities: corr && corr.qualities, planet: corr && corr.planet };
}

export default { TEMPERAMENT_PALETTE, PLANET_FLOWER, growthForm, paletteOf, buildPlant, buildPlotFlora, descriptorForCrop, leafShapeFor };
