// biome/gacha/sim/assemble.mjs — a seed → a runnable food web ("the roll").
//
// Deterministic from a roll number. Picks K organisms from the catalog under guild quotas with a
// habitat bias, then wires who-eats-whom by ECOLOGICAL RULES (no per-pair diet data needed):
//   • herbivores / nectarivores eat producers that share a habitat;
//   • detritivores eat the litter pool;
//   • carnivores eat present animals that share a habitat and fall in a prey-mass window
//     (prey between 1e-4× and 0.6× the predator's mass — Brose-style predator:prey size ratios);
//   • omnivores eat producers + smaller animals + litter;
//   • a pollinator wires a pollination edge to one flowering producer it can reach.
// Species spanning two habitats (a frog, a heron, a duck) become cross-web couplers automatically.
//
// Starving species (no prey present at t=0) are pruned iteratively; a roll is valid only if it
// still has a producer, a decomposer, and ≥6 species — else we re-roll with a salt (0..7). The
// output is exactly the `design` shape biome's builder.mjs compiles, so the existing engine +
// stability solver evaluate it unchanged. Pure, node + browser; pass the catalog array in.

import { Rand } from '../prng.js';

const GUILD_W = { producer: 1.4, herbivore: 1.2, nectarivore: 0.7, carnivore: 1.0, omnivore: 0.7, detritivore: 0.8 };
const HALFSAT = { herbivore: 3000, nectarivore: 4000, carnivore: 200, omnivore: 5000, detritivore: 9000 };
// habitat "themes" a roll can centre on (couplers still pull in adjacent habitats)
const THEMES = [
  { id: 'terrestrial', core: ['land', 'soil', 'air'], w: 3 },
  { id: 'aquatic',     core: ['lake', 'shore'],       w: 2 },
  { id: 'wetland',     core: ['shore', 'lake', 'soil'], w: 2 },
  { id: 'mixed',       core: ['land', 'lake', 'soil'], w: 2 },
  { id: 'canopy',      core: ['land', 'air'],          w: 1 },
];

const shareHab = (a, b) => a.habitats.some((h) => b.habitats.includes(h));
const touches = (o, core) => o.habitats.some((h) => core.includes(h));

// weighted sample of `k` distinct organisms from `pool`, by per-organism weight
function sampleDistinct(rand, pool, weightOf, k, forced = []) {
  const chosen = [...forced];
  const taken = new Set(forced.map((o) => o.id));
  const rest = pool.filter((o) => !taken.has(o.id));
  while (chosen.length < k && rest.length) {
    const items = rest.map((o) => ({ v: o, w: Math.max(1e-3, weightOf(o)) }));
    const pick = rand.weighted(items);
    chosen.push(pick); taken.add(pick.id);
    rest.splice(rest.indexOf(pick), 1);
  }
  return chosen;
}

// wire the diet edges among a chosen set; returns species[] in the builder's design shape
function wire(members) {
  const animals = members.filter((o) => o.kind === 'animal');
  const producers = members.filter((o) => o.kind === 'producer');
  const pollinatable = producers.filter((p) => p.pollinatable);
  const species = [];
  for (const o of members) {
    if (o.kind === 'producer') {
      species.push({ id: o.id, name: o.common, kind: 'producer', area_m2: o.area_m2, fix: o.fix,
        autoResp: o.autoResp, turnover: o.turnover, harvestIndex: o.harvestIndex, initDensity: o.initDensity });
      continue;
    }
    const eats = [];
    const preyAnimals = (maxFrac) => animals.filter((p) => p.id !== o.id && shareHab(o, p)
      && p.mass_g <= o.mass_g * maxFrac && p.mass_g >= o.mass_g * 1e-4);
    if (o.guild === 'herbivore' || o.guild === 'nectarivore') {
      for (const p of producers) if (shareHab(o, p)) eats.push(p.id);
    } else if (o.guild === 'detritivore') {
      eats.push('litter');
    } else if (o.guild === 'carnivore') {
      for (const p of preyAnimals(0.6)) eats.push(p.id);
    } else if (o.guild === 'omnivore') {
      for (const p of producers) if (shareHab(o, p)) eats.push(p.id);
      for (const p of preyAnimals(0.5)) eats.push(p.id);
      eats.push('litter');
    }
    const sp = { id: o.id, name: o.common, kind: 'animal', mass_g: o.mass_g, guild: o.guild,
      thermy: o.thermy, initBio: o.initBio, eats: [...new Set(eats)], halfSat: HALFSAT[o.guild] ?? 2000 };
    if (o.harvestable) sp.harvest = o.guild === 'herbivore' ? 0.008 : 0.012;
    if (o.pollinator && pollinatable.length) {
      const target = pollinatable.find((p) => shareHab(o, p));
      if (target) { sp.pollinates = target.id; sp.fruitPerday = 0.02; }
    }
    species.push(sp);
  }
  return species;
}

// drop animals with no available prey, repeatedly (a pruned prey can starve its predator)
function prune(species) {
  let live = species.slice();
  for (let pass = 0; pass < 8; pass++) {
    const present = new Set(live.map((s) => s.id));
    const before = live.length;
    live = live.filter((s) => {
      if (s.kind === 'producer') return true;
      const real = (s.eats || []).filter((e) => e === 'litter' || present.has(e));
      s.eats = real;                                   // trim dangling edges
      return real.length > 0;                          // starves if nothing left to eat
    });
    if (live.length === before) break;
  }
  return live;
}

const NAMES_ADJ = ['Verdant', 'Sunlit', 'Drowned', 'Brackish', 'Teeming', 'Fallow', 'Gilded', 'Murky',
  'Fevered', 'Quiet', 'Riotous', 'Frostbit', 'Lush', 'Starving', 'Ancient', 'Restless', 'Hidden', 'Bountiful'];
const NAMES_NOUN = ['Mire', 'Shallows', 'Canopy', 'Meadow', 'Fen', 'Thicket', 'Reach', 'Hollow', 'Loam',
  'Bloom', 'Reef', 'Glade', 'Slough', 'Vivarium', 'Terrarium', 'Basin', 'Drift', 'Commons'];
function nameRoll(rand, n) {
  return `the ${rand.pick(NAMES_ADJ)} ${rand.pick(NAMES_NOUN)}`;
}

// ── the headline call: roll number → { design, meta } (or null if it never assembled) ──
export function rollDesign(n, catalog, { salts = 8 } = {}) {
  for (let salt = 0; salt < salts; salt++) {
    const rand = new Rand('biome::gacha::' + n + (salt ? '::s' + salt : ''));
    const theme = rand.weighted(THEMES.map((t) => ({ v: t, w: t.w })));
    const weightOf = (o) => (GUILD_W[o.guild] ?? 1) * (touches(o, theme.core) ? 3 : 1);

    const producers = catalog.filter((o) => o.kind === 'producer');
    const decomposers = catalog.filter((o) => o.guild === 'detritivore');
    const forced = [
      ...sampleDistinct(rand, producers, weightOf, 2),
      ...sampleDistinct(rand, decomposers, weightOf, 1),
    ];
    const K = rand.range(14, 34);
    const members = sampleDistinct(rand, catalog, weightOf, K, forced);

    let species = prune(wire(members));
    const prod = species.filter((s) => s.kind === 'producer').length;
    const dec = species.filter((s) => s.guild === 'detritivore').length;
    if (prod >= 1 && dec >= 1 && species.length >= 6) {
      const totalArea = species.filter((s) => s.kind === 'producer').reduce((a, s) => a + (s.area_m2 || 0), 0);
      const hasLake = members.some((o) => o.habitats.includes('lake'));
      const crew = Math.max(8, Math.min(300, Math.round(totalArea / 300)));
      const design = { name: nameRoll(rand, n), crew, photoperiod: 0.7,
        waterPerCrew: hasLake ? 13000 : 9000, species };
      const guilds = {}; for (const s of species) guilds[s.guild || s.kind] = (guilds[s.guild || s.kind] || 0) + 1;
      const habitats = [...new Set(members.flatMap((o) => o.habitats))].sort();
      const edges = species.reduce((a, s) => a + (s.eats ? s.eats.length : 0), 0);
      return { n, salt, design, meta: { theme: theme.id, crew, habitats, guilds, edges,
        nSpecies: species.length, members: species.map((s) => s.id) } };
    }
  }
  return null;   // never assembled a valid web (rare; degenerate seed)
}

const Assemble = { rollDesign };
if (typeof globalThis !== 'undefined') globalThis.GachaAssemble = Assemble;
export default Assemble;
