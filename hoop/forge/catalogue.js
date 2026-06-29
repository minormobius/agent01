// hoop/forge/catalogue.js — THE PRODUCT CATALOGUE, derived from the ship's NEEDS (see NEEDS.md).
//
// ~50 end-product classes across the 15 loops of a closed generation ship, each tagged with its LOOP, the
// NEED it closes, a `living` flag (bio-derived), and — the key thing — an ELEMENTAL composition vector over
// a tracked element set. The element vectors are what will drive the periodic-table → looping-Sankey
// endpoint: click an element, follow it through every product that contains it, through use → waste →
// recycling → back. Pure, zero-dep, deterministic. NOT yet wired into graph.js/the page — this is the
// settled catalogue the next refactor (products 5 → ~50, families → elements) builds from.
//
// Composition vectors are authored as RELATIVE weights and normalised on read (composition()), so they're
// approximate-but-plausible, not lab-exact — enough to make the flows legible and the loops close.

// ── tracked elements (~14 covering ~99% of a ship's mass + every loop). z/period/group place them on the
// periodic table; `family` bridges to the current 7 commodity families; `bio` marks the CHNOPS+Ca set. ──
export const ELEMENTS = [
  { sym: 'H',  name: 'Hydrogen',  z: 1,  period: 1, group: 1,  family: 'water',     bio: true },
  { sym: 'C',  name: 'Carbon',    z: 6,  period: 2, group: 14, family: 'carbon',    bio: true },
  { sym: 'N',  name: 'Nitrogen',  z: 7,  period: 2, group: 15, family: 'volatiles', bio: true },
  { sym: 'O',  name: 'Oxygen',    z: 8,  period: 2, group: 16, family: 'water',     bio: true },
  { sym: 'Al', name: 'Aluminium', z: 13, period: 3, group: 13, family: 'metal',     bio: false },
  { sym: 'Si', name: 'Silicon',   z: 14, period: 3, group: 14, family: 'mineral',   bio: false },
  { sym: 'P',  name: 'Phosphorus',z: 15, period: 3, group: 15, family: 'organic',   bio: true },
  { sym: 'S',  name: 'Sulfur',    z: 16, period: 3, group: 16, family: 'volatiles', bio: true },
  { sym: 'Ca', name: 'Calcium',   z: 20, period: 4, group: 2,  family: 'mineral',   bio: true },
  { sym: 'Ti', name: 'Titanium',  z: 22, period: 4, group: 4,  family: 'metal',     bio: false },
  { sym: 'Fe', name: 'Iron',      z: 26, period: 4, group: 8,  family: 'metal',     bio: false },
  { sym: 'Ni', name: 'Nickel',    z: 28, period: 4, group: 10, family: 'trace',     bio: false },
  { sym: 'Cu', name: 'Copper',    z: 29, period: 4, group: 11, family: 'metal',     bio: false },
  { sym: 'RE', name: 'Rare-earth',z: 60, period: 6, group: 0,  family: 'trace',     bio: false, bucket: true },   // lanthanide bucket (magnets, phosphors, catalysts)
];
export const ELEMENT = Object.fromEntries(ELEMENTS.map((e) => [e.sym, e]));

// ── the 15 loops (the needs taxonomy) ──
export const LOOPS = [
  { id: 'air',        name: 'Air',          kind: 'life',    desc: 'breathable atmosphere — O₂, CO₂ scrub, trace-gas + humidity control' },
  { id: 'water',      name: 'Water',        kind: 'life',    desc: 'potable · grey · black · coolant — the hydrological loop' },
  { id: 'food',       name: 'Food',         kind: 'life',    desc: 'the calorie + nutrition loop (the bio-regen core)' },
  { id: 'waste',      name: 'Waste',        kind: 'life',    desc: 'closure — turning waste back into feedstock' },
  { id: 'body',       name: 'Body',         kind: 'body',    desc: 'health · medicine · hygiene — maintenance for people' },
  { id: 'textiles',   name: 'Textiles',     kind: 'skin',    desc: 'clothing + technical cloth — incl. woven carbon fiber' },
  { id: 'habitat',    name: 'Habitat',      kind: 'skin',    desc: 'the built interior — fixtures, furniture, light, plumbing' },
  { id: 'structure',  name: 'Structure',    kind: 'vessel',  desc: 'hull · frames · cable · shielding — the body of the ship' },
  { id: 'energy',     name: 'Energy',       kind: 'vessel',  desc: 'generation · storage · distribution' },
  { id: 'compute',    name: 'Compute',      kind: 'vessel',  desc: 'control · sensing · comms — the nervous system' },
  { id: 'labor',      name: 'Labor',        kind: 'labor',   desc: 'machines · logistics droids · tools — the factory builds itself' },
  { id: 'mobility',   name: 'Mobility',     kind: 'labor',   desc: 'transport · conveyance · droid docks' },
  { id: 'propulsion', name: 'Propulsion',   kind: 'vessel',  desc: 'thrust · reaction mass · navigation' },
  { id: 'society',    name: 'Society',      kind: 'society',  desc: 'records · culture · governance · art' },
  { id: 'continuity', name: 'Continuity',   kind: 'society',  desc: 'the generation loop — genetic stock · nurseries · the living archive' },
];
export const LOOP = Object.fromEntries(LOOPS.map((l) => [l.id, l]));

// ── the products. el = relative element weights (normalised on read). living = bio-derived. ──
export const PRODUCTS = [
  // air
  { id: 'co2_bed',     name: 'CO₂ sorbent bed',   glyph: '✣', loop: 'air',   need: 'scrub CO₂ from cabin air',          el: { Ca: 4, O: 3, C: 1, Si: 2 } },
  { id: 'o2_cell',     name: 'O₂ generation cell',glyph: '◌', loop: 'air',   need: 'electrolyse O₂ for breathing',      el: { Si: 3, Fe: 3, O: 2, Ni: 2 } },
  { id: 'gas_sensor',  name: 'Gas sensor',        glyph: '⊙', loop: 'air',   need: 'monitor atmosphere composition',    el: { Si: 4, Cu: 2, RE: 2, C: 2 } },
  { id: 'airduct',     name: 'Fan & duct set',    glyph: '➰', loop: 'air',   need: 'circulate + mix the atmosphere',    el: { Al: 5, Fe: 2, C: 3 } },
  // water
  { id: 'membrane',    name: 'Filtration membrane', glyph: '▒', loop: 'water', need: 'filter potable + grey water',     el: { C: 7, H: 1, O: 2 } },
  { id: 'still_core',  name: 'Still/condenser core', glyph: '∿', loop: 'water', need: 'distil + condense water',        el: { Fe: 4, Cu: 3, Al: 3 } },
  { id: 'pipeset',     name: 'Pipe & valve set',  glyph: '┣', loop: 'water', need: 'move water + coolant',              el: { Fe: 6, C: 4 } },
  { id: 'coolant',     name: 'Coolant',           glyph: '❄', loop: 'water', need: 'carry waste heat (iris seam)',      el: { H: 11, O: 89 } },
  // food (mostly living)
  { id: 'crop',        name: 'Staple crop',       glyph: '🌾', loop: 'food', need: 'calories + carbohydrate',           el: { C: 45, H: 7, O: 43, N: 3, P: 1, Ca: 1 }, living: true },
  { id: 'protein_cx',  name: 'Cultured protein',  glyph: '◍', loop: 'food', need: 'protein (algae/yeast/myco)',        el: { C: 50, H: 7, O: 30, N: 12, S: 1 }, living: true },
  { id: 'fats_sugars', name: 'Fats & sugars',     glyph: '◔', loop: 'food', need: 'energy-dense food + feedstock',     el: { C: 60, H: 11, O: 29 }, living: true },
  { id: 'micronutrient',name: 'Micronutrients',   glyph: '✦', loop: 'food', need: 'trace minerals + vitamins',         el: { Fe: 2, Ca: 3, P: 2, S: 1, RE: 2 }, living: true },
  { id: 'food_pack',   name: 'Food packaging',    glyph: '▢', loop: 'food', need: 'store + portion food (bioplastic)', el: { C: 8, H: 1, O: 1 }, living: true },
  // waste (living infrastructure)
  { id: 'digest_culture', name: 'Digester culture', glyph: '⌁', loop: 'waste', need: 'microbes that decompose organics', el: { C: 45, H: 7, O: 30, N: 15, P: 3 }, living: true },
  { id: 'sorbent_media',  name: 'Sorbent media',    glyph: '▦', loop: 'waste', need: 'capture + concentrate waste streams', el: { Si: 4, C: 3, Ca: 3 } },
  // body
  { id: 'pharma',      name: 'Pharmaceuticals',   glyph: '✚', loop: 'body', need: 'medicine (fermented/synthesised)',  el: { C: 55, H: 7, O: 25, N: 10, S: 3 }, living: true },
  { id: 'wound_tex',   name: 'Wound textile',     glyph: '✜', loop: 'body', need: 'bandage + surgical cloth',          el: { C: 6, O: 3, H: 1 }, living: true },
  { id: 'med_instr',   name: 'Medical instrument', glyph: '⚕', loop: 'body', need: 'diagnose + treat',                  el: { Fe: 5, Ni: 2, Si: 1, C: 2 } },
  { id: 'hygiene',     name: 'Hygiene consumable', glyph: '◯', loop: 'body', need: 'soap, sanitation (from fats)',      el: { C: 5, O: 3, H: 1, Ca: 1 }, living: true },
  // textiles
  { id: 'carbon_fiber',name: 'Woven carbon fiber',glyph: '▩', loop: 'textiles', need: 'high-strength cloth + the carbon store (the pump)', el: { C: 95, H: 3, N: 2 }, living: true, anchor: true },
  { id: 'cloth',       name: 'Cellulose cloth',   glyph: '▤', loop: 'textiles', need: 'everyday clothing',             el: { C: 45, O: 45, H: 10 }, living: true },
  { id: 'mycelium',    name: 'Mycelium leather',  glyph: '❧', loop: 'textiles', need: 'tough flexible material',       el: { C: 45, O: 30, N: 10, H: 7, S: 8 }, living: true },
  { id: 'tech_cloth',  name: 'Technical cloth',   glyph: '▥', loop: 'textiles', need: 'filters, rope, reinforcement', el: { C: 7, H: 1, O: 2 } },
  { id: 'insulation',  name: 'Insulation',        glyph: '▨', loop: 'textiles', need: 'thermal + acoustic batting',    el: { Si: 5, O: 3, C: 2 } },
  // habitat
  { id: 'partition',   name: 'Partition',         glyph: '▱', loop: 'habitat', need: 'divide + enclose space',         el: { Al: 4, Si: 3, C: 3 } },
  { id: 'furniture',   name: 'Furniture',         glyph: '🪑', loop: 'habitat', need: 'beds, seats, surfaces',          el: { C: 5, O: 3, Fe: 2 }, living: true },
  { id: 'lighting',    name: 'Lighting',          glyph: '☀', loop: 'habitat', need: 'sun-strip + lamps',              el: { Si: 4, Cu: 2, Al: 2, RE: 2 } },
  { id: 'plumb_fix',   name: 'Plumbing fixture',  glyph: '⊓', loop: 'habitat', need: 'sinks, recyclers, drains',       el: { Fe: 5, Cu: 2, C: 3 } },
  { id: 'flooring',    name: 'Flooring',          glyph: '▦', loop: 'habitat', need: 'deck surface',                   el: { C: 5, O: 3, Si: 2 } },
  // structure
  { id: 'hull_plate',  name: 'Hull plate',        glyph: '⬛', loop: 'structure', need: 'pressure + micrometeorite skin', el: { Fe: 7, Al: 2, C: 1 } },
  { id: 'frame',       name: 'Frame / bulkhead',  glyph: '⊟', loop: 'structure', need: 'load-bearing skeleton',        el: { Fe: 6, Al: 2, Si: 2 } },
  { id: 'cf_cable',    name: 'Carbon-fiber cable', glyph: '⌇', loop: 'structure', need: 'tethers, tension members (the pump)', el: { C: 92, H: 3, Fe: 5 }, living: true, anchor: true },
  { id: 'shielding',   name: 'Radiation shielding', glyph: '▤', loop: 'structure', need: 'block cosmic + solar radiation', el: { Al: 3, Fe: 2, C: 3, H: 2 } },
  { id: 'seals',       name: 'Seals & gaskets',   glyph: '◖', loop: 'structure', need: 'pressure seals, vibration damping', el: { C: 7, H: 1, S: 1, Si: 1 } },
  // energy
  { id: 'pv_reactor',  name: 'PV / reactor part', glyph: '◉', loop: 'energy', need: 'generate power',                  el: { Si: 5, Al: 2, Cu: 1, RE: 2 } },
  { id: 'battery',     name: 'Battery / fuel cell', glyph: '▮', loop: 'energy', need: 'store + buffer power',          el: { Ni: 3, C: 2, Cu: 1, RE: 2, Fe: 2 } },
  { id: 'capacitor',   name: 'Capacitor',         glyph: '⊪', loop: 'energy', need: 'smooth + switch power',           el: { Al: 4, Si: 2, C: 2, RE: 2 } },
  { id: 'wiring',      name: 'Wiring / busbar',   glyph: '⌇', loop: 'energy', need: 'distribute power',                el: { Cu: 8, C: 2 } },
  // compute
  { id: 'chip',        name: 'Chip',              glyph: '⊡', loop: 'compute', need: 'logic + control',                el: { Si: 6, Cu: 15, RE: 15, C: 10 } },
  { id: 'sensor',      name: 'Sensor',            glyph: '⊙', loop: 'compute', need: 'perceive the ship + world',      el: { Si: 4, Cu: 2, RE: 2, C: 2 } },
  { id: 'display',     name: 'Display',           glyph: '▭', loop: 'compute', need: 'show information',                el: { Si: 4, C: 3, RE: 1, Al: 2 } },
  { id: 'comms',       name: 'Comms gear',        glyph: '📡', loop: 'compute', need: 'signal + network',               el: { Cu: 4, Si: 3, RE: 2, Al: 1 } },
  // labor (the user's droids)
  { id: 'droid',       name: 'Logistics droid',   glyph: '🤖', loop: 'labor', need: 'move goods, do the work',         el: { Fe: 4, Cu: 1, C: 2, Si: 1, RE: 1, Al: 1 }, anchor: true },
  { id: 'arm',         name: 'Manipulator arm',   glyph: '⊦', loop: 'labor', need: 'grip + assemble',                  el: { Fe: 4, Al: 2, C: 2, Cu: 2 } },
  { id: 'motor',       name: 'Motor / actuator',  glyph: '✲', loop: 'labor', need: 'turn power into motion',           el: { Fe: 4, Cu: 3, RE: 2, C: 1 } },
  { id: 'tool',        name: 'Hand tool',         glyph: '⚒', loop: 'labor', need: 'human + droid work',               el: { Fe: 7, C: 2, Ni: 1 } },
  { id: 'drone',       name: 'Drone',             glyph: '✈', loop: 'labor', need: 'survey + reach (carbon-fiber frame)', el: { C: 4, Al: 2, Cu: 2, Si: 2 } },
  // mobility
  { id: 'pod',         name: 'Transport pod',     glyph: '◗', loop: 'mobility', need: 'carry people + cargo',          el: { Al: 4, C: 3, Fe: 2, Si: 1 } },
  { id: 'conveyor',    name: 'Conveyor / lift',   glyph: '⇅', loop: 'mobility', need: 'continuous material transport', el: { Fe: 4, C: 4, Cu: 2 } },
  // propulsion / nav
  { id: 'thruster',    name: 'Thruster part',     glyph: '➤', loop: 'propulsion', need: 'produce thrust',             el: { Fe: 4, Ti: 3, Ni: 2, Si: 1 } },
  { id: 'gyro_nav',    name: 'Gyro / nav sensor', glyph: '◈', loop: 'propulsion', need: 'hold + read the heading',    el: { Fe: 3, Si: 3, Cu: 2, RE: 2 } },
  // society
  { id: 'data_media',  name: 'Data-storage media', glyph: '▦', loop: 'society', need: 'remember (the ship\'s memory)', el: { Si: 5, C: 2, Al: 1, RE: 2 } },
  { id: 'record_stock',name: 'Record / paper stock', glyph: '▤', loop: 'society', need: 'write, post, account',        el: { C: 5, O: 4, H: 1 }, living: true },
  { id: 'instrument',  name: 'Instrument',        glyph: '♪', loop: 'society', need: 'culture, ritual, art, music',    el: { C: 4, Fe: 3, Si: 3 }, living: true },
  // continuity (the generation loop)
  { id: 'seed_archive',name: 'Genetic / seed archive', glyph: '❂', loop: 'continuity', need: 'the living stock — every species, banked', el: { C: 45, H: 7, O: 40, N: 5, P: 3 }, living: true, anchor: true },
  { id: 'nursery_fix', name: 'Nursery fixture',   glyph: '☖', loop: 'continuity', need: 'raise the next generation',   el: { C: 4, Fe: 3, Si: 3 } },
];
export const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// ── helpers ──
// normalised elemental composition of a product (mass fractions summing to 1).
export function composition(id) {
  const p = typeof id === 'string' ? PRODUCT[id] : id; if (!p) return {};
  const tot = Object.values(p.el).reduce((a, b) => a + b, 0) || 1;
  const out = {}; for (const [s, w] of Object.entries(p.el)) out[s] = w / tot;
  return out;
}
// every product that contains an element (for the per-element Sankey): [{ id, frac }], sorted by frac.
export function productsWithElement(sym) {
  return PRODUCTS.map((p) => ({ id: p.id, frac: composition(p)[sym] || 0 })).filter((x) => x.frac > 0).sort((a, b) => b.frac - a.frac);
}
export const byLoop = (loopId) => PRODUCTS.filter((p) => p.loop === loopId);
export const livingProducts = () => PRODUCTS.filter((p) => p.living);
// roll a product's element vector up to the 7 commodity families (bridge to the current graph.js model).
export function familyMix(id) {
  const comp = composition(id), fam = {};
  for (const [s, f] of Object.entries(comp)) { const k = (ELEMENT[s] || {}).family || 'trace'; fam[k] = (fam[k] || 0) + f; }
  return fam;
}

// validate the catalogue: every product references known elements + a known loop, compositions are
// non-empty, every loop has ≥1 product, every tracked element appears in ≥1 product. Returns issues[].
export function validate() {
  const issues = [];
  for (const p of PRODUCTS) {
    if (!LOOP[p.loop]) issues.push(`${p.id}: unknown loop '${p.loop}'`);
    if (!p.el || !Object.keys(p.el).length) issues.push(`${p.id}: empty composition`);
    for (const s of Object.keys(p.el || {})) if (!ELEMENT[s]) issues.push(`${p.id}: unknown element '${s}'`);
  }
  for (const l of LOOPS) if (!byLoop(l.id).length) issues.push(`loop '${l.id}' has no products`);
  for (const e of ELEMENTS) if (!productsWithElement(e.sym).length) issues.push(`element '${e.sym}' appears in no product`);
  return issues;
}

export function buildCatalogue() {
  return {
    elements: ELEMENTS, loops: LOOPS,
    products: PRODUCTS.map((p) => ({ ...p, composition: composition(p.id), familyMix: familyMix(p.id) })),
    living: livingProducts().map((p) => p.id), issues: validate(),
  };
}
