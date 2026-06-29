// biome/over/fauna.js — roll a biome, cast its animals, and assign each a sprite body plan.
//
// This is the bridge between two halves of the repo:
//   • biome's own `gacha/catalog.json` — ~150 real organisms (guild · mass · thermy · habitat · genus),
//   • the `mega/sprite` critter kernels (vendored under ./sprite/) — five pixel body plans, each a pure
//     `build*Genome` + `*Frame` generator: POLY (arthropods), QUAD (legged vertebrates), AXIAL
//     (worms/snakes/fish), RADIAL (echinoderms).
//
// Pure + node-testable: this module never touches a canvas or the sprite kernels. It produces plain
// DESCRIPTORS — `{ plan, family, genes, ... }` — that the renderer feeds to the right `build*Genome`.
// Determinism is load-bearing: `rollBiome(n)` must reproduce the identical biome + cast for ever, so a
// `?n=<n>` permalink means something (the same contract as /gacha). Randomness comes only from `Rand`.

import { Rand } from '../gacha/prng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const log10 = (x) => Math.log(Math.max(1e-6, x)) / Math.LN10;

// ── the body plans we can render (vendored kernels under ./sprite/). RADIAL has no FAMILIES export,
//    so its cast members carry genes directly; the others name a family the renderer spreads. ──
export const PLANS = ['poly', 'quad', 'axial', 'radial'];

// ── biome archetypes. Each biases which habitats/guilds are eligible, dials the forest density
//    (treeSpacing → eden), and carries a palette the renderer paints the ground/water with. ──
export const BIOMES = {
  meadow: {
    name: 'Sunlit Meadow', kicker: '❀',
    blurb: 'Open grass under a bright canopy — pollinators in clouds, grazers at ease.',
    habitats: ['land', 'air'], treeSpacing: 1.45,
    guildBias: { nectarivore: 2.4, herbivore: 1.6, carnivore: 0.7, omnivore: 1, detritivore: 0.6 },
    palette: { meadow: [104, 150, 78], grove: [60, 104, 58], water: [60, 132, 150], deep: [40, 92, 120], ground: '#1d3a22' },
  },
  thicket: {
    name: 'Deep Thicket', kicker: '❧',
    blurb: 'Close-grown trees and leaf-litter — spiders, beetles, and things that creep the floor.',
    habitats: ['land', 'soil', 'air'], treeSpacing: 0.66,
    guildBias: { detritivore: 2.2, carnivore: 1.6, herbivore: 1.2, omnivore: 1.2, nectarivore: 0.7 },
    palette: { meadow: [56, 88, 52], grove: [28, 62, 38], water: [44, 104, 120], deep: [26, 70, 92], ground: '#13251a' },
  },
  wetland: {
    name: 'Reed Wetland', kicker: '≈',
    blurb: 'Mega-lakes braided by streams — waterfowl, fish below, dragonfly swarms above.',
    habitats: ['lake', 'shore', 'land', 'air'], treeSpacing: 1.15,
    guildBias: { herbivore: 1.5, detritivore: 1.4, carnivore: 1.2, nectarivore: 1.1, omnivore: 1.3 },
    palette: { meadow: [78, 128, 88], grove: [44, 92, 64], water: [54, 140, 168], deep: [30, 96, 132], ground: '#163026' },
  },
  heath: {
    name: 'Dry Heath', kicker: '∴',
    blurb: 'Sparse scrub on warm ground — reptiles basking, ants in long files.',
    habitats: ['land', 'soil', 'air'], treeSpacing: 1.7,
    guildBias: { herbivore: 1.4, detritivore: 1.3, carnivore: 1.1, omnivore: 1.1, nectarivore: 1.1 },
    palette: { meadow: [128, 134, 78], grove: [92, 100, 56], water: [78, 132, 132], deep: [54, 100, 108], ground: '#2a2a18' },
  },
  grove: {
    name: 'Flowering Grove', kicker: '✿',
    blurb: 'Fruit trees in bloom — the air thick with bees, moths, and hoverflies.',
    habitats: ['land', 'air'], treeSpacing: 0.88,
    guildBias: { nectarivore: 3.2, herbivore: 1.2, carnivore: 0.9, omnivore: 1, detritivore: 0.8 },
    palette: { meadow: [112, 148, 84], grove: [52, 104, 60], water: [60, 136, 152], deep: [38, 96, 124], ground: '#1e3622' },
  },
  fen: {
    name: 'Tidal Fen', kicker: '◌',
    blurb: 'Half land, half water — amphibious life, fish in the shallows, snails on the mud.',
    habitats: ['lake', 'shore', 'land', 'soil', 'air'], treeSpacing: 1.25,
    guildBias: { detritivore: 1.8, herbivore: 1.4, carnivore: 1.3, omnivore: 1.4, nectarivore: 0.9 },
    palette: { meadow: [82, 122, 92], grove: [46, 86, 66], water: [48, 128, 150], deep: [28, 86, 118], ground: '#15291f' },
  },
};
export const BIOME_KEYS = Object.keys(BIOMES);

// ── taxon sniffing: the catalog has no clade field, so read the binomial. Match on the GENUS token
//    (the first word) so a substring can't misfire — the common shrew, *Sorex araneus*, must not read
//    as a spider just because its species epithet contains "araneus". A couple of keyword tests stay
//    for descriptive names ("...worm"). ──
const genusOf = (sci) => (sci || '').trim().toLowerCase().split(/\s+/)[0] || '';
const genus = (sci, ...gens) => { const g = genusOf(sci); return gens.some((x) => g === x || g.startsWith(x)); };
const has = (sci, ...words) => { const s = (sci || '').toLowerCase(); return words.some((w) => s.includes(w)); };
const ARACHNID = (s) => genus(s, 'araneus', 'tegenaria', 'pardosa', 'lycosa', 'salticus', 'argiope', 'opilio', 'phalangium', 'araneae');
const isMollusc = (s) => genus(s, 'cornu', 'helix', 'cepaea', 'lymnaea', 'planorbarius', 'planorbis', 'arion', 'limax', 'anodonta');
const isWorm = (s) => genus(s, 'lumbricus', 'eisenia', 'dendrobaena', 'tubifex', 'hirudo', 'chironomus') || has(s, 'nematod', 'worm');
const isFish = (s) => genus(s, 'cyprinus', 'carassius', 'ctenopharyngodon', 'hypophthalmichthys', 'oreochromis',
  'gasterosteus', 'rutilus', 'perca', 'esox', 'tinca', 'salmo', 'gambusia', 'poecilia', 'anguilla');
const isCrustacean = (s) => genus(s, 'daphnia', 'gammarus', 'asellus', 'astacus', 'cambarus', 'carcinus',
  'porcellio', 'armadillidium', 'cyclops', 'artemia');
const isReptile = (s) => genus(s, 'testudo', 'iguana', 'lacerta', 'podarcis', 'natrix', 'anguis', 'python', 'gekko', 'chelydra');
const isRadial = (s) => genus(s, 'asterias', 'aurelia', 'hydra', 'actinia', 'echinus', 'strongylocentrotus', 'cyanea');
// sessile / abstract detritus the catalog models as a "detritivore animal" (fungi, microbial mats) —
// they don't WANDER, so they're not cast in the overworld even though planFor would still place them.
const SESSILE = (o) => /fungus|mushroom|toadstool|microbe|bacteri|detritus|communit|biofilm|mould|mold|mycel/i.test((o.common || '') + ' ' + (o.sciName || ''));

// ── plan resolver: every catalog ANIMAL → exactly one body plan + family. Total by construction
//    (the final `else` is QUAD), so the renderer can always build a sprite. ──
export function planFor(org) {
  const sci = org.sciName || '', g = org.guild, m = org.mass_g ?? 1, hab = org.habitats || [];
  const aquatic = hab.includes('lake');

  if (isRadial(sci)) return { plan: 'radial', family: null };
  if (isWorm(sci)) return { plan: 'axial', family: 'worm' };
  if (isMollusc(sci)) return { plan: 'axial', family: 'worm' };      // soft-bodied → a slow tube reads best
  if (isFish(sci) || (aquatic && g !== 'producer' && m > 30 && org.thermy === 'ecto' && !isCrustacean(sci)))
    return { plan: 'axial', family: 'eel' };
  if (isReptile(sci) && has(sci, 'natrix', 'anguis', 'python')) return { plan: 'axial', family: 'snake' };

  // arthropods — the creeps & swarms. Nectarivores (bees/flies/moths), small ecto inverts, spiders, crustacea.
  if (ARACHNID(sci)) return { plan: 'poly', family: 'spider' };
  if (isCrustacean(sci)) return { plan: 'poly', family: 'crab' };
  if (g === 'nectarivore' && org.thermy === 'ecto') return { plan: 'poly', family: 'ant' };  // hummingbird is endo → falls through to quad
  const tinyEcto = org.thermy === 'ecto' && m < 5 && !isReptile(sci);
  if (tinyEcto && (g === 'herbivore' || g === 'carnivore' || g === 'detritivore' || g === 'omnivore'))
    return { plan: 'poly', family: g === 'carnivore' ? 'spider' : 'ant' };

  // everything else is a legged vertebrate (mammal · bird · reptile · amphibian) → quadruped profile
  let family = 'hound';
  if (g === 'omnivore') family = 'boar';
  else if (g === 'herbivore' && m >= 30000) family = 'bear';     // big grazers read heavy
  else if (g === 'herbivore' && m >= 4000) family = 'boar';
  else if (isReptile(sci)) family = 'boar';                       // low, robust, plantigrade-ish
  else if (g === 'carnivore') family = 'hound';
  return { plan: 'quad', family };
}

// ── per-organism display + behaviour, derived from mass (the one observable that scales everything,
//    cf. biome's Kleiber allometry). Small ⇒ small/fast/swarming; large ⇒ big/slow/solitary. ──
function traitsFor(org, plan) {
  const m = org.mass_g ?? 1, ls = log10(m);                 // ~ -3.2 (aphid) .. 5.65 (horse)
  const size = clamp(Math.round(16 + 4 * ls), 12, 42);     // world px (kept in the trees' size band)
  const speed = clamp(Math.round(38 - 5 * ls), 12, 44);    // world px / s
  const cadence = clamp(1.5 - 0.12 * ls, 0.6, 1.9);        // sprite gait multiplier

  // social mode → how the renderer populates a tile. Arthropods + nectarivores + tiny ecto = SWARM.
  let social = 'troop';
  const swarmy = plan === 'poly' || org.guild === 'nectarivore' || (m < 1 && org.thermy === 'ecto');
  if (swarmy) social = 'swarm';
  else if (m > 8000) social = 'solo';

  // groups-per-tile × members-per-group. Big solitary animals are rare (a tile often has none).
  const pop = social === 'swarm' ? { groups: 2, groupSize: clamp(Math.round(13 - 3 * (ls + 3)), 5, 14) }
    : social === 'solo' ? { groups: 1, groupSize: 1, sparse: 0.35 }   // sparse = P(this group exists in a tile)
      : { groups: 1, groupSize: clamp(4 - Math.round(ls), 2, 5) };
  return { mass_g: m, size, speed, cadence, social, pop };
}

// hue for a sprite: the body plan's natural family hue, nudged toward the biome and jittered per species.
const FAMILY_HUE = { ant: 28, spider: 14, crab: 18, hound: 30, boar: 24, bear: 20, robot: 210, worm: 10, snake: 96, eel: 150 };
function hueFor(org, plan, family, biomeKey, rnd) {
  let h = family ? (FAMILY_HUE[family] ?? 30) : 42;        // radial default amber
  if (org.thermy === 'endo') h = (h + 6) % 360;            // mammals a touch warmer
  if (biomeKey === 'heath') h = (h + 18) % 360;            // dry biome → ochre shift
  if (biomeKey === 'wetland' || biomeKey === 'fen') h = (h + 8) % 360;
  return Math.round((h + (rnd.float() * 24 - 12) + 360)) % 360;
}

// build the genes object the renderer spreads into build*Genome (on top of that plan's FAMILIES preset).
function genesFor(org, plan, family, hue, cadence) {
  if (plan === 'radial') {
    return { arms: 4 + (org.mass_g > 200 ? 3 : 1), hue, depth: 3, glow: 0.8, coupling: 1.2 };
  }
  if (plan === 'axial') return { hue, cadence };
  if (plan === 'quad') return { hue, cadence };
  return { hue, cadence };   // poly
}

// turn one catalog organism into a full cast descriptor.
export function describe(org, biomeKey, rnd) {
  const { plan, family } = planFor(org);
  const t = traitsFor(org, plan);
  const hue = hueFor(org, plan, family, biomeKey, rnd);
  return {
    id: org.id, common: org.common, sci: org.sciName, guild: org.guild,
    plan, family, genes: genesFor(org, plan, family, hue, t.cadence), hue,
    size: t.size, speed: t.speed, cadence: t.cadence, social: t.social, pop: t.pop,
    seed: 'over:' + biomeKey + ':' + org.id,    // stable per (biome, species) → one canonical sprite
  };
}

// ── THE ROLL: seed → a biome + a cast of animals that live in it. ──
// `catalog` is the parsed gacha/catalog.json (or { organisms: {...} }). Returns a fully-resolved roll.
export function rollBiome(n, catalog, opts = {}) {
  const rnd = new Rand('over:' + n);
  const orgMap = catalog.organisms || catalog;
  const animals = Object.values(orgMap).filter((o) => o.kind === 'animal' && !SESSILE(o));

  const biomeKey = rnd.pick(BIOME_KEYS);
  const B = BIOMES[biomeKey];

  // eligibility: habitat overlap with the biome, weighted by guild bias. Air/land generalists always count.
  const eligible = animals.filter((o) => (o.habitats || ['land']).some((h) => B.habitats.includes(h)));
  const pool = eligible.length >= 6 ? eligible : animals;     // never strand a biome with too few animals
  const weighted = pool.map((o) => ({ v: o, w: (B.guildBias[o.guild] ?? 1) * (0.6 + rnd.float()) }));
  weighted.sort((a, b) => b.w - a.w);

  // pick a cast, guaranteeing the world feels alive: ≥2 swarm species (the creeps) and ≥1 quad grazer.
  const N = clamp(opts.castSize || 10, 6, 16);
  const cast = [], used = new Set();
  const add = (o) => { if (!used.has(o.id) && cast.length < N) { used.add(o.id); cast.push(describe(o, biomeKey, rnd)); } };
  const swarmFirst = weighted.filter((x) => planFor(x.v).plan === 'poly' || x.v.guild === 'nectarivore');
  const quads = weighted.filter((x) => planFor(x.v).plan === 'quad');
  for (const x of swarmFirst.slice(0, 3)) add(x.v);          // seed the swarms
  for (const x of quads.slice(0, 2)) add(x.v);               // seed the grazers
  for (const x of weighted) add(x.v);                        // fill by weight

  const swarmCount = cast.filter((c) => c.social === 'swarm').length;
  return {
    n, biomeKey, biome: { ...B, key: biomeKey },
    edenOpts: { treeSpacing: B.treeSpacing },
    cast,
    stats: { castSize: cast.length, swarms: swarmCount, plans: tally(cast.map((c) => c.plan)) },
  };
}

function tally(arr) { const o = {}; for (const x of arr) o[x] = (o[x] || 0) + 1; return o; }

const FAUNA = { BIOMES, BIOME_KEYS, PLANS, planFor, describe, rollBiome };
if (typeof globalThis !== 'undefined') globalThis.OverFauna = FAUNA;
export default FAUNA;
