// ecology.js — THE CURATED OVERWORLD ECOLOGY. The chosen, interesting palette the overworld is grown
// from: the 55 alch reagent-herbs (auto-bridged from the vendored correspondence overlay), a variety of
// fruit & nut trees, bees & pollinators (the swarms), spider action, a deep chthonic band and a deep
// benthic band with amphibian CROSSOVER members between them — and birds as the cross-web upper trophic
// layer. Real, iNaturalist-resolvable organisms, so the biome food-web model wires + scores them for free.
//
// Two faces on every organism:
//   • GAME metadata — band(s), body-plan (for the sprite casting), reagent flags (for alchemy).
//   • MODEL params  — the biome-catalog shape (guild, mass/area, habitats, growth params) so
//     `toCatalog()` feeds it straight into biome's assembler + viability solver. "Does it close?" is
//     answered by rolling communities from toCatalog() and scoring them (test/close.selftest.mjs).
//
// This is a CURATED PALETTE, not one sealed box: a closed biome is a subset (a roll) drawn from it. The
// reagent herbs carry their alchemy correspondence via the botanical binomial (alch/alchemy.js
// findReagent). Animal reagents (eye of newt & co.) are flagged `baroque` — their correspondence table
// is the deferred Paracelsian expansion; they ship as fauna now, reagents when that lands.
//
// MECHANISM ONLY — no placement, recipe, or line is authored here; those are content. Pure, node-tested.

import { CORRESPONDENCES } from '../alch/correspondences.js';

// ── the bands: terrain types the flora define (6 surface by moisture + 2 by depth) ────────────────
export const BANDS = {
  physic:   { name: 'Physic Garden',    depth: 'surface', kicker: '✚', blurb: 'the cultivated herb-beds — the alchemist’s reagents at hand.' },
  meadow:   { name: 'Sunlit Meadow',    depth: 'surface', kicker: '❀', blurb: 'open herb-rich grass, pollinators in clouds.' },
  grove:    { name: 'Orchard Grove',    depth: 'surface', kicker: '✿', blurb: 'fruit & nut trees, the air thick with bees.' },
  thicket:  { name: 'Deep Thicket',     depth: 'surface', kicker: '❧', blurb: 'close trees and leaf-litter — the spiders’ country.' },
  heath:    { name: 'Dry Heath',        depth: 'surface', kicker: '∴', blurb: 'warm scrub — the hot, dry, aromatic herbs.' },
  fen:      { name: 'Reed Fen',         depth: 'water',   kicker: '≈', blurb: 'half land, half water — the benthic threshold.' },
  chthonic: { name: 'The Chthonic Deep', depth: 'under',  kicker: '⚱', blurb: 'root-zone and cave — decomposers, blind hunters, fungi.' },
  benthic:  { name: 'The Benthic Dark',  depth: 'under',  kicker: '⬮', blurb: 'lake-bottom dark — filterers, crayfish, the eel in the mud.' },
};
export const BAND_KEYS = Object.keys(BANDS);

// ── builders (the biome-catalog param shape; mirrors biome/gacha/build-catalog.mjs P()/A()) ───────
const INITBIO = { herbivore: 200, nectarivore: 60, carnivore: 40, omnivore: 120, detritivore: 15000 };
// producer: P(id, common, sci, habitats, bands, {fix,turn,hi,area,dens,poll}, extra)
const P = (id, common, sciName, habitats, bands, o = {}, extra = {}) => ({
  id, common, sciName, kind: 'producer', guild: 'producer', habitats,
  area_m2: o.area ?? 2000, fix: o.fix ?? 1.4, autoResp: 0.35, turnover: o.turn ?? 0.03,
  harvestIndex: o.hi ?? 0, initDensity: o.dens ?? 8,
  pollinatable: !!o.poll, harvestable: (o.hi ?? 0) > 0,
  bands: [].concat(bands), ...extra,
});
// animal: A(id, common, sci, guild, mass_g, habitats, bands, {thermy,initBio,plan,poll,harv,micro,reagent,baroque})
const A = (id, common, sciName, guild, mass_g, habitats, bands, o = {}) => ({
  id, common, sciName, kind: 'animal', guild, mass_g, habitats,
  thermy: o.thermy ?? 'ecto', initBio: o.initBio ?? INITBIO[guild] ?? 100,
  pollinator: !!o.poll, harvestable: !!o.harv, microbialProxy: !!o.micro,
  bands: [].concat(o.bands ?? bands), plan: o.plan ?? 'quad',
  ...(o.reagent ? { reagent: true, reagentClass: o.reagentClass ?? 'animal' } : {}),
  ...(o.baroque ? { baroque: true } : {}),
  ...(o.swarm ? { swarm: true } : {}),
});

// ── the 55 alch reagent-herbs, auto-bridged from the vendored correspondence overlay ──────────────
// Band from Galenic quality (hot·dry → heath, cold·moist → fen, hot·moist → meadow, else physic garden);
// habitat follows the band. Each is a real producer AND a live alchemy reagent (its binomial resolves
// through alch findReagent). Modest, uniform herb growth params — the model cares about producer
// presence + guild balance, and these keep the palette honest without pretending to per-herb agronomy.
const QUALITY_BAND = { 'hot & dry': 'heath', 'hot & moist': 'meadow', 'cold & moist': 'fen', 'cold & dry': 'thicket' };
const BAND_HAB = { heath: ['land'], meadow: ['land'], fen: ['shore', 'land'], thicket: ['land', 'soil'], physic: ['land'] };
const slugId = (s) => 'herb_' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// EDIBLE herbs — the kitchen-garden crops among the 55 (roots/bulbs/greens/cucurbits): they carry a
// real harvest index + feed the crew. The rest are pure PHYSIC herbs (reagents, marginal leaf yield).
// This is what makes the physic garden also a working vegetable plot — food AND medicine on one bed.
const EDIBLE_ROOT = new Set(['radish', 'parsnip', 'leek', 'onion', 'garlic']);       // roots & bulbs, high yield
const EDIBLE_LEAF = new Set(['lettuce', 'orache', 'sorrel', 'purslane', 'nettle', 'cabbage', 'mustard', 'gourd', 'melon']); // greens & cucurbits
export const HERBS = (CORRESPONDENCES.plants || []).map((p) => {
  const band = (p.qualities && QUALITY_BAND[p.qualities]) || 'physic';
  const hab = BAND_HAB[band] || ['land'];
  const slug = p.slug || slugId(p.plant);
  const edibleRoot = EDIBLE_ROOT.has(slug), edibleLeaf = EDIBLE_LEAF.has(slug);
  const hi = edibleRoot ? 0.40 : edibleLeaf ? 0.28 : 0.18;   // roots feed hardest; leaves middling; physic herbs marginal
  // A physic herb is a SMALL bed, not a field — keep its photosynthetic footprint tiny so it stays
  // ~neutral to the farm's calorie closure (it inflates neither crew demand nor food; it's a reagent
  // that happens to be a producer). The edible crops carry the real area + yield.
  const area = edibleRoot ? 2000 : edibleLeaf ? 1400 : 700;
  return P(slugId(slug), p.plant, p.bot, hab, ['physic', band],
    { fix: 1.4, turn: 0.033, hi, area, dens: 9, poll: true },
    { reagent: true, reagentClass: 'plant', planet: p.planet || null, qualities: p.qualities || null,
      edible: edibleRoot || edibleLeaf, physic: !(edibleRoot || edibleLeaf) });
});

// ── the STAPLE farm crops: the calorie base. The overworld IS the ship's farm (crew nutrition +
// bioprocessing), so it carries real staples — period-appropriate roots, grains, legumes, an oil-seed,
// a tuber (the Capitulare's beans & peas among them). High harvest index; legumes fix nitrogen. Not
// alchemical (no correspondence) — plain food producers. ──
export const STAPLES = [
  P('crop_broadbean',  'Broad bean',       'Vicia faba',              ['land'], ['physic', 'meadow'], { fix: 1.9, turn: 0.035, hi: 0.35, area: 2600, dens: 9 }, { crop: 'legume' }),
  P('crop_pea',        'Field pea',        'Pisum sativum',           ['land'], ['physic', 'meadow'], { fix: 1.8, turn: 0.036, hi: 0.32, area: 2400, dens: 10 }, { crop: 'legume' }),
  P('crop_turnip',     'Turnip',           'Brassica rapa',           ['land'], ['physic', 'meadow'], { fix: 1.5, turn: 0.033, hi: 0.45, area: 2400, dens: 9 }, { crop: 'root' }),
  P('crop_barley',     'Barley',           'Hordeum vulgare',         ['land'], ['meadow'],           { fix: 1.6, turn: 0.030, hi: 0.40, area: 3000, dens: 8 }, { crop: 'grain' }),
  P('crop_rye',        'Rye',              'Secale cereale',          ['land'], ['meadow', 'heath'],  { fix: 1.5, turn: 0.030, hi: 0.38, area: 3000, dens: 8 }, { crop: 'grain' }),
  P('crop_flax',       'Flax',             'Linum usitatissimum',     ['land'], ['meadow'],           { fix: 1.4, turn: 0.030, hi: 0.30, area: 2200, dens: 9 }, { crop: 'oil' }),
  P('crop_sunchoke',   'Jerusalem artichoke','Helianthus tuberosus',  ['land'], ['physic', 'meadow'], { fix: 1.6, turn: 0.034, hi: 0.50, area: 2500, dens: 7, poll: true }, { crop: 'tuber' }),
];

// ── trees: a variety producing FRUIT & NUT (the Capitulare orchard). Fruit trees are pollination-gated
// (poll:true — no bees, no fruit); nut trees are wind/other. In the overworld an orchard is a GARNISH,
// not the calorie base — so their footprint (area) is kept modest, else a grove-heavy roll inflates the
// modeled crew demand faster than the staples can feed it. Nuts are calorie-dense (a touch more yield). ──
export const TREES = [
  // fruit
  P('tree_apple',   'Apple',        'Malus domestica',    ['land'], 'grove', { fix: 1.1, turn: 0.0068, hi: 0.04, area: 2400, dens: 18, poll: true }, { crop: 'fruit', reagent: false }),
  P('tree_pear',    'Pear',         'Pyrus communis',     ['land'], 'grove', { fix: 1.0, turn: 0.0065, hi: 0.04, area: 2300, dens: 18, poll: true }, { crop: 'fruit' }),
  P('tree_cherry',  'Cherry',       'Prunus avium',       ['land'], 'grove', { fix: 1.0, turn: 0.0080, hi: 0.04, area: 2200, dens: 18, poll: true }, { crop: 'fruit' }),
  P('tree_plum',    'Plum',         'Prunus domestica',   ['land'], 'grove', { fix: 1.0, turn: 0.0080, hi: 0.04, area: 2100, dens: 18, poll: true }, { crop: 'fruit' }),
  P('tree_peach',   'Peach',        'Prunus persica',     ['land'], 'grove', { fix: 1.0, turn: 0.0090, hi: 0.04, area: 2000, dens: 16, poll: true }, { crop: 'fruit' }),
  P('tree_fig',     'Fig',          'Ficus carica',       ['land'], 'grove', { fix: 1.1, turn: 0.0070, hi: 0.05, area: 2200, dens: 16, poll: true }, { crop: 'fruit' }),
  P('tree_mulberry','Mulberry',     'Morus nigra',        ['land'], 'grove', { fix: 1.1, turn: 0.0075, hi: 0.05, area: 2300, dens: 16, poll: false }, { crop: 'fruit' }),
  P('tree_quince',  'Quince',       'Cydonia oblonga',    ['land'], 'grove', { fix: 0.9, turn: 0.0070, hi: 0.04, area: 2000, dens: 16, poll: true }, { crop: 'fruit' }),
  P('tree_medlar',  'Medlar',       'Mespilus germanica', ['land'], 'grove', { fix: 0.9, turn: 0.0070, hi: 0.04, area: 1900, dens: 14, poll: true }, { crop: 'fruit' }),
  P('tree_sorb',    'Service-tree', 'Sorbus domestica',   ['land'], 'grove', { fix: 0.9, turn: 0.0060, hi: 0.04, area: 2100, dens: 16, poll: true }, { crop: 'fruit' }),
  // nut (calorie-dense — a little more harvest)
  P('tree_hazel',   'Hazel',        'Corylus avellana',   ['land'], ['grove', 'thicket'], { fix: 1.1, turn: 0.0090, hi: 0.06, area: 1900, dens: 16, poll: false }, { crop: 'nut' }),
  P('tree_walnut',  'Walnut',       'Juglans regia',      ['land'], 'grove', { fix: 1.0, turn: 0.0060, hi: 0.06, area: 2800, dens: 22, poll: false }, { crop: 'nut' }),
  P('tree_chestnut','Sweet chestnut','Castanea sativa',   ['land'], 'grove', { fix: 1.0, turn: 0.0055, hi: 0.07, area: 2800, dens: 22, poll: false }, { crop: 'nut' }),
  P('tree_almond',  'Almond',       'Prunus dulcis',      ['land'], 'grove', { fix: 1.0, turn: 0.0085, hi: 0.06, area: 2000, dens: 16, poll: true }, { crop: 'nut' }),
  P('tree_pine',    'Stone pine',   'Pinus pinea',        ['land'], ['grove', 'heath'], { fix: 0.9, turn: 0.0045, hi: 0.05, area: 3000, dens: 24, poll: false }, { crop: 'nut' }),
  // bay is an aromatic (a culinary/perfume plant), but it is NOT one of the 55 herbs in the read/alch
  // overlay, so it carries no Galenic/planetary correspondence — an aromatic, not (yet) a live reagent.
  P('tree_bay',     'Bay laurel',   'Laurus nobilis',     ['land'], ['grove', 'physic'], { fix: 1.0, turn: 0.0070, hi: 0, area: 3000, dens: 24, poll: false }, { aromatic: true }),
];

// ── fungi: chthonic decomposers, and the first BAROQUE reagents (fly agaric, ergot…) ──────────────
export const FUNGI = [
  A('fun_flyagaric', 'Fly agaric',      'Amanita muscaria',    'detritivore', 30, ['soil', 'land'], 'chthonic', { plan: 'radial', micro: true, reagent: true, reagentClass: 'fungal', baroque: true }),
  A('fun_bracket',   'Tinder bracket',  'Fomes fomentarius',   'detritivore', 200, ['soil', 'land'], ['chthonic', 'thicket'], { plan: 'radial', micro: true }),
  A('fun_ergot',     'Ergot',           'Claviceps purpurea',  'detritivore', 0.2, ['soil', 'land'], 'chthonic', { plan: 'radial', micro: true, reagent: true, reagentClass: 'fungal', baroque: true }),
  A('fun_cupfungus', 'Cave cup fungus', 'Peziza',              'detritivore', 5, ['soil'], 'chthonic', { plan: 'radial', micro: true }),
];

// ── fauna: pollinators/swarms · spiders · herbivores · chthonic · benthic · crossover · birds ─────
export const FAUNA = [
  // pollinators / swarms — cast as swarm creeps AND pollinate the grove
  A('bee',        'Honey bee',        'Apis mellifera',        'nectarivore', 0.1,   ['air', 'land'], ['meadow', 'grove'], { poll: true, plan: 'poly', swarm: true }),
  A('bumblebee',  'Bumblebee',        'Bombus terrestris',     'nectarivore', 0.5,   ['air', 'land'], ['meadow', 'grove'], { poll: true, plan: 'poly', swarm: true }),
  A('masonbee',   'Mason bee',        'Osmia bicornis',        'nectarivore', 0.08,  ['air', 'land'], ['meadow', 'grove'], { poll: true, plan: 'poly', swarm: true }),
  A('hoverfly',   'Marmalade hoverfly','Episyrphus balteatus', 'nectarivore', 0.02,  ['air', 'land'], ['meadow', 'grove'], { poll: true, plan: 'poly', swarm: true }),
  A('hawkmoth',   'Privet hawk-moth', 'Sphinx ligustri',       'nectarivore', 1.2,   ['air', 'land'], ['grove', 'thicket'], { poll: true, plan: 'poly', swarm: true }),
  // herbivores
  A('rabbit',     'Rabbit',           'Oryctolagus cuniculus', 'herbivore', 1500,  ['land'],        ['meadow', 'heath'], { thermy: 'endo', harv: true, plan: 'quad' }),
  A('vole',       'Field vole',       'Microtus arvalis',      'herbivore', 25,    ['land', 'soil'],['meadow', 'thicket'], { thermy: 'endo', plan: 'quad' }),
  A('grasshopper','Grasshopper',      'Chorthippus brunneus',  'herbivore', 0.3,   ['land'],        ['meadow', 'heath'], { plan: 'poly' }),
  A('aphid',      'Pea aphid',        'Acyrthosiphon pisum',   'herbivore', 0.002, ['land'],        ['meadow', 'physic'], { plan: 'poly', swarm: true }),
  A('landsnail',  'Garden snail',     'Cornu aspersum',        'herbivore', 10,    ['land', 'soil'],['thicket', 'grove'], { harv: true, plan: 'radial' }),
  // spider action (arachnid predators)
  A('orbweaver',  'Garden spider',    'Araneus diadematus',    'carnivore', 0.27,  ['land', 'air'], ['thicket', 'grove'], { plan: 'poly' }),
  A('wolfspider', 'Wolf spider',      'Pardosa amentata',      'carnivore', 0.05,  ['land', 'soil'],['thicket', 'heath'], { plan: 'poly' }),
  A('harvestman', 'Harvestman',       'Phalangium opilio',     'omnivore',  0.03,  ['land', 'soil'],['thicket'], { plan: 'poly' }),
  A('cellarspider','Cellar spider',   'Pholcus phalangioides', 'carnivore', 0.02,  ['soil'],        'chthonic', { plan: 'poly' }),
  A('cavespider', 'Cave orb-weaver',  'Meta menardi',          'carnivore', 0.1,   ['soil'],        'chthonic', { plan: 'poly' }),
  A('whipspider', 'Whip-spider',      'Damon variegatus',      'carnivore', 2,     ['soil'],        'chthonic', { plan: 'poly', reagent: true, baroque: true }),
  // chthonic — decomposers + hunters + the burrowing vertebrate
  A('springtail', 'Springtail',       'Folsomia candida',      'detritivore', 0.0008, ['soil'],     'chthonic', { micro: true, plan: 'poly' }),
  A('millipede',  'Millipede',        'Cylindroiulus britannicus','detritivore', 0.1, ['soil'],     'chthonic', { plan: 'poly' }),
  A('woodlouse',  'Pill-woodlouse',   'Armadillidium vulgare', 'detritivore', 0.05, ['soil', 'land'],['chthonic', 'thicket'], { plan: 'poly' }),
  A('earthworm',  'Earthworm',        'Lumbricus terrestris',  'detritivore', 4,    ['soil'],        'chthonic', { harv: true, plan: 'axial' }),
  A('centipede',  'Centipede',        'Lithobius forficatus',  'carnivore', 0.08,  ['soil'],        'chthonic', { plan: 'poly' }),
  A('mole',       'European mole',    'Talpa europaea',        'carnivore', 100,   ['soil'],        'chthonic', { thermy: 'endo', plan: 'quad' }),
  // benthic — filterers, grazers, the lake-bottom predators
  A('pondsnail',  'Great pond snail', 'Lymnaea stagnalis',     'herbivore', 5,     ['lake'],        'benthic', { plan: 'radial' }),
  A('mussel',     'Swan mussel',      'Anodonta cygnea',       'detritivore', 150, ['lake'],        'benthic', { plan: 'radial', harv: true }),
  A('caddis',     'Caddisfly larva',  'Limnephilus lunatus',   'detritivore', 0.05,['lake'],        'benthic', { plan: 'poly' }),
  A('crayfish',   'Crayfish',         'Astacus astacus',       'omnivore',  80,    ['lake', 'shore'],'benthic', { harv: true, plan: 'poly' }),
  A('dragonfly',  'Dragonfly nymph',  'Aeshna cyanea',         'carnivore', 1,     ['lake'],        'benthic', { plan: 'poly' }),
  // GOOD FOOD FISH — the crew's aquaculture protein (a cull straight into the food store):
  A('tench',      'Tench',            'Tinca tinca',           'omnivore',  400,   ['lake'],        'benthic', { harv: true, plan: 'axial' }),
  A('carp',       'Common carp',      'Cyprinus carpio',       'omnivore',  2000,  ['lake'],        'benthic', { harv: true, plan: 'axial' }),
  A('roach',      'Roach',            'Rutilus rutilus',       'omnivore',  200,   ['lake'],        'benthic', { harv: true, plan: 'axial' }),
  A('leech',      'Medicinal leech',  'Hirudo medicinalis',    'carnivore', 2,     ['lake', 'shore'],'benthic', { plan: 'axial', reagent: true, baroque: true }),
  // CROSSOVER — amphibians (+ eel, olm) bridge chthonic & benthic: the eye-of-newt reagents
  A('newt',       'Smooth newt',      'Lissotriton vulgaris',  'carnivore', 3,     ['lake', 'land'], ['benthic', 'chthonic', 'fen'], { plan: 'quad', reagent: true, baroque: true }),
  A('salamander', 'Fire salamander',  'Salamandra salamandra', 'carnivore', 20,    ['land', 'soil'], ['chthonic', 'thicket'], { plan: 'quad', reagent: true, baroque: true }),
  A('toad',       'Common toad',      'Bufo bufo',             'carnivore', 40,    ['land', 'lake', 'soil'], ['fen', 'chthonic', 'benthic'], { plan: 'quad', reagent: true, baroque: true }),
  A('eel',        'European eel',     'Anguilla anguilla',     'carnivore', 300,   ['lake', 'shore'],['benthic', 'fen'], { harv: true, plan: 'axial' }),
  A('olm',        'Olm',              'Proteus anguinus',      'carnivore', 15,    ['lake'],         ['benthic', 'chthonic'], { plan: 'axial', reagent: true, baroque: true }),
  // BIRDS — the cross-web upper layer (they fly, so they couple bands). Songbirds (robin/thrush/tit)
  // are insectivores/frugivores that disperse the grove; the GAME FOWL (partridge/quail/goose/mallard)
  // are EDIBLE — a bird that eats the spiders & insects and returns it to the crew as poultry (the
  // insect→fowl→crew path), plus the goose grazes producers. The kestrel & heron cap the web.
  A('robin',      'Robin',            'Erithacus rubecula',    'omnivore',  18,    ['land', 'air'],  ['thicket', 'grove', 'meadow'], { thermy: 'endo', plan: 'quad' }),
  A('thrush',     'Song thrush',      'Turdus philomelos',     'omnivore',  70,    ['land', 'air'],  ['grove', 'thicket'], { thermy: 'endo', plan: 'quad' }),
  A('bluetit',    'Blue tit',         'Cyanistes caeruleus',   'carnivore', 11,    ['land', 'air'],  ['grove', 'thicket'], { thermy: 'endo', plan: 'quad' }),
  A('partridge',  'Grey partridge',   'Perdix perdix',         'omnivore',  400,   ['land', 'air'],  ['meadow', 'heath', 'grove'], { thermy: 'endo', harv: true, plan: 'quad' }),
  A('quail',      'Common quail',     'Coturnix coturnix',     'omnivore',  100,   ['land', 'air'],  ['meadow', 'physic'], { thermy: 'endo', harv: true, plan: 'quad' }),
  A('goose',      'Greylag goose',    'Anser anser',           'herbivore', 3500,  ['lake', 'shore', 'land', 'air'], ['fen', 'meadow'], { thermy: 'endo', harv: true, plan: 'quad' }),
  A('mallard',    'Mallard',          'Anas platyrhynchos',    'omnivore',  1100,  ['lake', 'shore', 'air'], ['fen', 'benthic'], { thermy: 'endo', harv: true, plan: 'quad' }),
  A('kestrel',    'Kestrel',          'Falco tinnunculus',     'carnivore', 200,   ['air', 'land'],  ['meadow', 'heath'], { thermy: 'endo', plan: 'quad' }),
  A('heron',      'Grey heron',       'Ardea cinerea',         'carnivore', 1500,  ['lake', 'shore', 'air'], ['fen', 'benthic'], { thermy: 'endo', plan: 'quad' }),
];

// the whole palette (game-facing: carries band/plan/reagent metadata)
export const ORGANISMS = [...HERBS, ...STAPLES, ...TREES, ...FUNGI, ...FAUNA];

// THE CANONICAL FARM. A single closed plot is a community DRAWN from the palette (biome's assembler over
// a seed), the same way biome ships its 5 cafe biomes by searching seeds for closers — random 14–34-
// species draws essentially never fully close for ANY palette (biome's own 149-deck closes 0/40 at
// random). Searching this palette, seed 21 is a LEGENDARY, STABLE, fully-closing farm: it feeds ~82
// crew, holds the air (O₂ 21 kPa, CO₂ ~200 ppm), and recovers from shocks — out-performing biome's own
// deck (whose best closer is an unstable Epic). This is the overworld's canonical farm; the plants→
// terrain layer + the gacha draw from `rollDesign(CANONICAL_FARM_SEED, toCatalog())`. Pinned by the
// closure selftest so a palette edit that breaks the closer is caught.
export const CANONICAL_FARM_SEED = 21;

// organisms by band (for the terrain layer + the gacha's per-band pools)
export function organismsInBand(band) { return ORGANISMS.filter((o) => (o.bands || []).includes(band)); }
// every reagent-bearing organism (plants live now; animal/fungal reagents are `baroque`, deferred)
export const REAGENTS = ORGANISMS.filter((o) => o.reagent);

// ── toCatalog(): strip the game metadata → the plain biome-catalog array the assembler/solver read.
// This is the bridge that lets "does it close?" be answered by biome's own viability oracle.
//
// THE PHYSIC-GARDEN CAP. All 55 alch herbs GROW in the overworld (terrain + garden + reagents), but a
// physic garden is a small CORNER of the farm, not half its fields. The pure-medicinal herbs are
// ecologically redundant in the box model (same guild/habitat/near-identical params) and calorically
// marginal, so flooding the food web with 43 of them just mis-weights the producer draw toward
// "medicine" and misreports the farm as unable to feed its crew. We pass a REPRESENTATIVE sample of
// them (spanning the bands) to the model — the standard collapse of redundant producers — while the
// EDIBLE herbs, staples, orchard, fungi and fauna (the actual calorie base) all pass through. The game
// roster (ORGANISMS) is untouched; this only shapes what the closure MODEL sees. ────────────────────
// THE PLOT MODEL. The palette is the OVERWORLD's biodiversity — every herb, every spider, every
// amphibian, the whole orchard. But a single CLOSED PLOT (the sealed box the viability oracle scores)
// samples a REPRESENTATIVE few of each over-represented guild, not the entire species list crammed into
// one box: a physic garden is a corner (not half the fields), an orchard is a garnish (not 16 fields),
// and predators are the light PEST-CONTROL / stabilizing term (a few, not all 17 — a 17-carnivore box
// starves its own predators). So the model catalog collapses each over-full guild to a representative
// sample (spanning bands, deterministic); the staples, edible crops, fungi and food fish/fowl — the
// actual calorie base — all pass through whole. The GAME roster (ORGANISMS) is untouched: the terrain,
// the reagents, the combat creeps still see the full palette. This only shapes what CLOSURE sees.
export const PHYSIC_MODEL_CAP = 8;
export const TREE_MODEL_CAP = 5;
export const CARNIVORE_MODEL_CAP = 6;   // predators are the stabilizing term — a few, not the whole zoo
const repSample = (list, cap) => {                      // one per non-physic band first, then fill (deterministic)
  const seen = new Set(), rep = [];
  for (const o of list) { const b = (o.bands || []).find((x) => x !== 'physic') || 'physic'; if (!seen.has(b)) { seen.add(b); rep.push(o); } }
  for (const o of list) { if (rep.length >= cap) break; if (!rep.includes(o)) rep.push(o); }
  return new Set(rep.slice(0, cap).map((o) => o.id));
};
export function toCatalog() {
  const keepPhysic = repSample(ORGANISMS.filter((o) => o.physic), PHYSIC_MODEL_CAP);
  const treeIds = new Set(TREES.map((t) => t.id));
  const keepTree = repSample(TREES, TREE_MODEL_CAP);
  const carn = ORGANISMS.filter((o) => o.guild === 'carnivore');
  const keepCarn = repSample(carn, CARNIVORE_MODEL_CAP);
  const carnIds = new Set(carn.map((o) => o.id));
  return ORGANISMS.filter((o) =>
    (!o.physic || keepPhysic.has(o.id)) &&
    (!treeIds.has(o.id) || keepTree.has(o.id)) &&
    (!carnIds.has(o.id) || keepCarn.has(o.id))
  ).map((o) => {
    const { bands, plan, reagent, reagentClass, baroque, swarm, planet, qualities, crop, aromatic, edible, physic: _p, ...cat } = o;
    return cat;
  });
}

export default { BANDS, BAND_KEYS, HERBS, TREES, FUNGI, FAUNA, ORGANISMS, REAGENTS, organismsInBand, toCatalog };
