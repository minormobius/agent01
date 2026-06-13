// biome/gacha/build-catalog.mjs — author the gacha's organism pool ("the deck") and enrich it
// with iNaturalist photos, writing catalog.json. ~85 real organisms across every guild and
// habitat, each with the traits the assembler needs (mass, guild, thermy, habitats) to wire a
// random food web by body-size + guild rules. Producers carry growth params; animals carry a
// per-guild starting biomass. iNat photo resolution mirrors graph/build-organisms.mjs.
//
// Run: node biome/gacha/build-catalog.mjs        (writes catalog.json)
//      node biome/gacha/build-catalog.mjs --dry  (prints, writes nothing)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'catalog.json');
const DRY = process.argv.includes('--dry');
const UA = { 'User-Agent': 'biome.mino.mobi/gacha catalog (github.com/minormobius/agent01)' };

// ── builders ──────────────────────────────────────────────────────────────────────────────
// producer: area-based primary producer. p(id, common, sci, habitats, {fix,turn,hi,area,dens,poll})
const P = (id, common, sciName, habitats, o = {}) => ({
  id, common, sciName, kind: 'producer', guild: 'producer', habitats,
  area_m2: o.area ?? 3500, fix: o.fix ?? 1.6, autoResp: 0.35, turnover: o.turn ?? 0.03,
  harvestIndex: o.hi ?? 0, initDensity: o.dens ?? 8,
  pollinatable: !!o.poll, harvestable: (o.hi ?? 0) > 0,
});
// animal: mass-based heterotroph. a(id, common, sci, guild, mass_g, habitats, {thermy,initBio,...})
const INITBIO = { herbivore: 200, nectarivore: 60, carnivore: 40, omnivore: 120, detritivore: 15000 };
const A = (id, common, sciName, guild, mass_g, habitats, o = {}) => ({
  id, common, sciName, kind: 'animal', guild, mass_g, habitats,
  thermy: o.thermy ?? 'ecto', initBio: o.initBio ?? INITBIO[guild] ?? 100,
  pollinator: !!o.poll, harvestable: !!o.harv, microbialProxy: !!o.micro,
});

const CATALOG = [
  // ── PRODUCERS (15) ──────────────────────────────────────────────────────────────────────
  P('crop',      'Sweet potato',   'Ipomoea batatas',     ['land'],         { fix:1.7, turn:0.034, hi:0.44, area:3000, dens:6 }),
  P('wheat',     'Wheat',          'Triticum aestivum',   ['land'],         { fix:1.6, turn:0.030, hi:0.40, area:3500, dens:8 }),
  P('clover',    'White clover',   'Trifolium repens',    ['land'],         { fix:1.8, turn:0.040, hi:0.10, area:2500, dens:10, poll:true }),
  P('sunflower', 'Sunflower',      'Helianthus annuus',   ['land'],         { fix:1.5, turn:0.030, hi:0.25, area:2000, dens:5,  poll:true }),
  P('grass',     'Meadow grass',   'Poa pratensis',       ['land'],         { fix:1.9, turn:0.050, hi:0.10, area:4000, dens:8 }),
  P('apple',     'Apple',          'Malus domestica',     ['land'],         { fix:1.1, turn:0.0068, hi:0,   area:6000, dens:40, poll:true }),
  P('oak',       'Oak',            'Quercus robur',       ['land'],         { fix:1.0, turn:0.005, hi:0,    area:7000, dens:50 }),
  P('bamboo',    'Bamboo',         'Phyllostachys edulis',['land'],         { fix:2.2, turn:0.040, hi:0.20, area:3000, dens:12 }),
  P('reed',      'Common reed',    'Phragmites australis',['shore','lake'], { fix:2.0, turn:0.020, hi:0.10, area:4000, dens:10 }),
  P('cattail',   'Cattail',        'Typha latifolia',     ['shore','lake'], { fix:1.9, turn:0.025, hi:0.15, area:3500, dens:9 }),
  P('cress',     'Watercress',     'Nasturtium officinale',['shore','lake'],{ fix:1.7, turn:0.050, hi:0.30, area:2000, dens:6 }),
  P('algae',     'Phytoplankton',  'Chlorella vulgaris',  ['lake'],         { fix:2.8, turn:0.090, hi:0,    area:15000, dens:1.6 }),
  P('duckweed',  'Duckweed',       'Lemna minor',         ['lake'],         { fix:2.0, turn:0.060, hi:0.40, area:10000, dens:10 }),
  P('waterlily', 'Water lily',     'Nymphaea alba',       ['lake'],         { fix:1.3, turn:0.020, hi:0,    area:3000, dens:8, poll:true }),
  P('eelgrass',  'Eelgrass',       'Vallisneria americana',['lake'],        { fix:1.6, turn:0.030, hi:0.05, area:4000, dens:7 }),
  P('maize',     'Maize',          'Zea mays',             ['land'],         { fix:2.0, turn:0.032, hi:0.45, area:3000, dens:7 }),
  P('soybean',   'Soybean',        'Glycine max',          ['land'],         { fix:1.7, turn:0.035, hi:0.35, area:2800, dens:8 }),
  P('strawberry','Wild strawberry','Fragaria vesca',       ['land'],         { fix:1.2, turn:0.040, hi:0.30, area:1500, dens:12, poll:true }),
  P('lavender',  'Lavender',       'Lavandula angustifolia',['land'],        { fix:1.1, turn:0.025, hi:0,    area:1800, dens:9,  poll:true }),
  P('hornwort',  'Hornwort',       'Ceratophyllum demersum',['lake'],        { fix:2.2, turn:0.050, hi:0,    area:8000, dens:6 }),
  P('lotus',     'Sacred lotus',   'Nelumbo nucifera',     ['shore','lake'], { fix:1.4, turn:0.020, hi:0.10, area:3000, dens:7,  poll:true }),

  // ── HERBIVORES (14) ─────────────────────────────────────────────────────────────────────
  A('rabbit',     'Rabbit',         'Oryctolagus cuniculus',  'herbivore', 1500,   ['land'],         { thermy:'endo', harv:true }),
  A('grasshopper','Grasshopper',    'Chorthippus brunneus',   'herbivore', 0.3,    ['land'] ),
  A('aphid',      'Pea aphid',      'Acyrthosiphon pisum',    'herbivore', 0.002,  ['land'] ),
  A('snail',      'Garden snail',   'Cornu aspersum',         'herbivore', 10,     ['land','shore'] ),
  A('roedeer',    'Roe deer',       'Capreolus capreolus',    'herbivore', 22000,  ['land'],         { thermy:'endo', harv:true }),
  A('caterpillar','Cabbage white',  'Pieris rapae',           'herbivore', 0.2,    ['land'] ),
  A('waterflea',  'Water flea',     'Daphnia magna',          'herbivore', 0.0006, ['lake'] ),
  A('pondsnail',  'Pond snail',     'Lymnaea stagnalis',      'herbivore', 3,      ['lake','shore'] ),
  A('grasscarp',  'Grass carp',     'Ctenopharyngodon idella','herbivore', 3000,   ['lake'],         { harv:true }),
  A('cow',        'Cattle',         'Bos taurus',             'herbivore', 400000, ['land'],         { thermy:'endo', harv:true }),
  A('vole',       'Field vole',     'Microtus agrestis',      'herbivore', 30,     ['land','soil'],  { thermy:'endo' }),
  A('locust',     'Migratory locust','Locusta migratoria',    'herbivore', 2,      ['land'] ),
  A('mayfly',     'Mayfly nymph',   'Cloeon dipterum',        'herbivore', 0.01,   ['lake'] ),
  A('ramshorn',   'Ramshorn snail', 'Planorbarius corneus',   'herbivore', 4,      ['lake','shore'] ),

  // ── NECTARIVORES / POLLINATORS (7) ──────────────────────────────────────────────────────
  A('bee',        'Honey bee',      'Apis mellifera',         'nectarivore', 0.1,  ['air','land'],   { poll:true }),
  A('bumblebee',  'Bumblebee',      'Bombus terrestris',      'nectarivore', 0.2,  ['air','land'],   { poll:true }),
  A('hoverfly',   'Hoverfly',       'Episyrphus balteatus',   'nectarivore', 0.02, ['air','land'],   { poll:true }),
  A('butterfly',  'Painted lady',   'Vanessa cardui',         'nectarivore', 0.5,  ['air','land'],   { poll:true }),
  A('masonbee',   'Mason bee',      'Osmia bicornis',         'nectarivore', 0.12, ['air','land'],   { poll:true }),
  A('hawkmoth',   'Hawk-moth',      'Macroglossum stellatarum','nectarivore',0.3,  ['air','land'],   { poll:true }),
  A('chafer',     'Rose chafer',    'Cetonia aurata',         'nectarivore', 0.8,  ['air','land'],   { poll:true }),

  // ── CARNIVORES (21) ─────────────────────────────────────────────────────────────────────
  A('spider',     'Garden spider',  'Araneus diadematus',     'carnivore', 0.27,  ['land'] ),
  A('ladybird',   'Ladybird',       'Coccinella septempunctata','carnivore',0.04, ['land','air'] ),
  A('beetle',     'Ground beetle',  'Pterostichus melanarius','carnivore', 0.2,   ['soil','land'] ),
  A('mantis',     'Praying mantis', 'Mantis religiosa',       'carnivore', 5,     ['land'] ),
  A('shrew',      'Common shrew',   'Sorex araneus',          'carnivore', 10,    ['land','soil'],  { thermy:'endo' }),
  A('weasel',     'Weasel',         'Mustela nivalis',        'carnivore', 60,    ['land'],         { thermy:'endo' }),
  A('fox',        'Red fox',        'Vulpes vulpes',          'carnivore', 6000,  ['land'],         { thermy:'endo' }),
  A('hawk',       'Sparrowhawk',    'Accipiter nisus',        'carnivore', 250,   ['air','land'],   { thermy:'endo' }),
  A('owl',        'Tawny owl',      'Strix aluco',            'carnivore', 500,   ['air','land'],   { thermy:'endo' }),
  A('dragonfly',  'Dragonfly nymph','Aeshna cyanea',          'carnivore', 1,     ['lake'] ),
  A('backswimmer','Backswimmer',    'Notonecta glauca',       'carnivore', 0.07,  ['lake'] ),
  A('perch',      'Perch',          'Perca fluviatilis',      'carnivore', 200,   ['lake'],         { harv:true }),
  A('pike',       'Pike',           'Esox lucius',            'carnivore', 2500,  ['lake'],         { harv:true }),
  A('newt',       'Smooth newt',    'Lissotriton vulgaris',   'carnivore', 5,     ['lake','shore','soil'] ),
  A('heron',      'Grey heron',     'Ardea cinerea',          'carnivore', 1500,  ['lake','shore','air'], { thermy:'endo' }),
  A('kingfisher', 'Kingfisher',     'Alcedo atthis',          'carnivore', 40,    ['lake','air'],   { thermy:'endo' }),
  A('frogfish',   'Anglerfish',     'Lophius piscatorius',    'carnivore', 800,   ['lake'] ),
  A('stoat',      'Stoat',          'Mustela erminea',        'carnivore', 250,   ['land','soil'],  { thermy:'endo' }),
  A('kestrel',    'Kestrel',        'Falco tinnunculus',      'carnivore', 200,   ['air','land'],   { thermy:'endo' }),
  A('divingbeetle','Diving beetle', 'Dytiscus marginalis',    'carnivore', 1.2,   ['lake'] ),
  A('catfish',    'Wels catfish',   'Silurus glanis',         'carnivore', 15000, ['lake'],         { harv:true }),

  // ── OMNIVORES (11) ──────────────────────────────────────────────────────────────────────
  A('carp',       'Common carp',    'Cyprinus carpio',        'omnivore', 1500,   ['lake'],         { harv:true }),
  A('tilapia',    'Nile tilapia',   'Oreochromis niloticus',  'omnivore', 400,    ['lake'],         { harv:true }),
  A('duck',       'Mallard duck',   'Anas platyrhynchos',     'omnivore', 1000,   ['lake','land','air'], { thermy:'endo', harv:true }),
  A('crayfish',   'Crayfish',       'Astacus astacus',        'omnivore', 80,     ['lake','shore'], { harv:true }),
  A('frog',       'Marsh frog',     'Pelophylax ridibundus',  'omnivore', 30,     ['lake','shore','soil'] ),
  A('chicken',    'Chicken',        'Gallus gallus',          'omnivore', 2000,   ['land'],         { thermy:'endo', harv:true }),
  A('pig',        'Pig',            'Sus scrofa',             'omnivore', 80000,  ['land','soil'],  { thermy:'endo', harv:true }),
  A('rat',        'Brown rat',      'Rattus norvegicus',      'omnivore', 300,    ['land','soil'],  { thermy:'endo' }),
  A('hedgehog',   'Hedgehog',       'Erinaceus europaeus',    'omnivore', 800,    ['land','soil'],  { thermy:'endo' }),
  A('goose',      'Greylag goose',  'Anser anser',            'omnivore', 3500,   ['lake','land','air'], { thermy:'endo', harv:true }),
  A('terrapin',   'Pond terrapin',  'Emys orbicularis',       'omnivore', 800,    ['lake','shore','land'] ),

  // ── DETRITIVORES / DECOMPOSERS (11) ─────────────────────────────────────────────────────
  A('worm',       'Earthworm',      'Lumbricus terrestris',   'detritivore', 0.5,   ['soil'] ),
  A('springtail', 'Springtail',     'Folsomia candida',       'detritivore', 0.0008,['soil'],        { micro:true }),
  A('fungus',     'Oyster fungus',  'Pleurotus ostreatus',    'detritivore', 0.001, ['soil'],        { micro:true }),
  A('woodlouse',  'Woodlouse',      'Armadillidium vulgare',  'detritivore', 0.1,   ['soil','shore'] ),
  A('mussel',     'Swan mussel',    'Anodonta cygnea',        'detritivore', 30,    ['lake'],        { harv:true }),
  A('benthos',    'Benthic microbes','aquatic detritus community','detritivore',0.0008,['lake'],     { micro:true }),
  A('dungbeetle', 'Dung beetle',    'Geotrupes stercorarius', 'detritivore', 0.5,   ['soil'] ),
  A('millipede',  'Millipede',      'Cylindroiulus londinensis','detritivore',0.1,  ['soil'] ),
  A('soldierfly', 'Black soldier fly','Hermetia illucens',    'detritivore', 0.2,  ['soil'],        { harv:true }),
  A('mealworm',   'Mealworm',       'Tenebrio molitor',       'detritivore', 0.1,  ['soil'],        { harv:true }),
  A('waterhoglouse','Water hoglouse','Asellus aquaticus',     'detritivore', 0.07, ['lake','shore'] ),
];

async function getJSON(url, ms = 20000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function inat(sciName) {
  const j = await getJSON(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sciName)}&rank=species&per_page=1`);
  const t = j?.results?.[0]; if (!t) return null; const ph = t.default_photo;
  return { inatId: t.id, photo: ph?.medium_url ?? ph?.url ?? null, thumb: ph?.square_url ?? null, attribution: ph?.attribution ?? null };
}

const ids = new Set();
for (const o of CATALOG) { if (ids.has(o.id)) throw new Error('duplicate id ' + o.id); ids.add(o.id); }

const out = { generatedAt: new Date().toISOString(), source: 'curated + iNaturalist', count: CATALOG.length, organisms: {} };
let withPhoto = 0;
for (const o of CATALOG) {
  process.stderr.write(`· [${o.guild}] ${o.sciName} … `);
  const enr = await inat(o.sciName);
  if (enr?.photo) withPhoto++;
  out.organisms[o.id] = { ...o, inat: enr ?? null };
  process.stderr.write(`${enr?.photo ? 'iNat#' + enr.inatId : 'no-photo'}\n`);
}
process.stderr.write(`\n${CATALOG.length} organisms, ${withPhoto} with photo\n`);

if (DRY) console.log(JSON.stringify(out, null, 2));
else { writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); process.stderr.write(`wrote ${OUT}\n`); }
