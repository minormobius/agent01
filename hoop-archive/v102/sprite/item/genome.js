// genome.js — the ITEM GENOME: the quantitative half of the genotype + the life-cycle over it.
//
// An item's genotype = a POSITION IN THE TREE (taxa.js: kingdom, phylum, species, material) + a
// VECTOR OF TRAIT GENES (the orthogonal dials, each 0..1). The tree is cladistic/heritable; the
// genes are quantitative traits that cut across it and can be selected on independently — so a
// genome is `{ kingdom, phylum, species, material, genes }`.
//
//   roll     — rollItem(n, hoard): a hoard (population genome) → one item genome → expressed stats
//   express  — genes × material × phylum.base → display stats; spikes earn affixes & sprite cues
//   oracle   — scoreItem: stats → worth 0..100 + grade (junk→mythic)
//   breed    — splice(a, b, n): heredity. same phylum breeds true; cross-kingdom breeds CHIMERAS
//   mutate   — mutate(item, n, rate): jitter genes; rare phylum/kingdom hops
//   hoard    — DEFAULT_HOARD + HOARD_ARCHETYPES + rollHoard(n): the population-level bias (cousin
//              of econ's society genome) — an armory vs a reliquary vs a midden.
//
// Determinism is load-bearing: (n, hoard) ⇒ the same item everywhere, so /?n= is a permalink.

import { rng, R } from './prng.js';
import { KINGDOMS, KINGDOM_ORDER, PHYLA, phylaOf, MATERIALS, materialsAt, eraSpecies } from './taxa.js';

// ── TRAITS — the orthogonal genes. label + the [lo,hi] display range each gene expresses into. ──
export const TRAITS = {
  durability: { label: 'Durability', kind: 'pts',  desc: 'resists wear & breakage' },
  potency:    { label: 'Potency',    kind: 'pts',  desc: 'efficacy at its verb' },
  mass:       { label: 'Mass',       kind: 'kg',   desc: 'heft to carry' },
  value:      { label: 'Value',      kind: 'coin', desc: 'worth in trade' },
  tech:       { label: 'Tech',       kind: 'idx',  desc: 'salvaged-primitive ↔ ship-grade' },
  ornament:   { label: 'Ornament',   kind: 'idx',  desc: 'functional ↔ baroque' },
  complexity: { label: 'Complexity', kind: 'idx',  desc: 'simple ↔ many-parted mechanism' },
  provenance: { label: 'Provenance', kind: 'idx',  desc: 'fresh ↔ storied & renowned' },
};
export const TRAIT_ORDER = Object.keys(TRAITS);
const GENE_DEFAULT = 0.5;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ERAS = [[0.0, 'salvage'], [0.25, 'forge-age'], [0.5, 'guild-craft'], [0.72, 'fine-works'], [0.88, 'ship-grade']];
export const eraOf = (tech) => { let e = ERAS[0][1]; for (const [t, n] of ERAS) if (tech >= t) e = n; return e; };

// ── SPIKES — a gene at an extreme earns a named affix + a sprite cue (this replaces v1's affix deck) ──
const HI = 0.80, LO = 0.20;
const SPIKE = {
  durability: { hi: ['Sturdy', 'bulk'],   lo: ['Brittle', 'crack'] },
  potency:    { hi: ['Keen', 'edge'],      lo: ['Dull', null] },
  mass:       { hi: ['Heavy', 'bulk'],     lo: ['Light', null] },
  value:      { hi: ['Fine', 'trim'],      lo: [null, null] },
  tech:       { hi: ['Wrought', 'rivet'],  lo: ['Crude', null] },
  ornament:   { hi: ['Ornate', 'filigree'],lo: ['Plain', null] },
  complexity: { hi: ['Intricate', 'gears'],lo: ['Simple', null] },
  provenance: { hi: ['Ancient', 'patina'], lo: [null, null] },
};
function spikesOf(genes) {
  const out = [];
  for (const t of TRAIT_ORDER) {
    const g = genes[t];
    if (g >= HI && SPIKE[t].hi[0]) out.push({ trait: t, dir: 'hi', word: SPIKE[t].hi[0], cue: SPIKE[t].hi[1], mag: g });
    else if (g <= LO && SPIKE[t].lo[0]) out.push({ trait: t, dir: 'lo', word: SPIKE[t].lo[0], cue: SPIKE[t].lo[1], mag: 1 - g });
  }
  return out;
}

// ── EXPRESSION — genotype → phenotype (display stats). The genome is the cause; stats are observed. ──
export function express(genome) {
  const P = PHYLA[genome.phylum], M = MATERIALS[genome.material], g = genome.genes;
  const mass = Math.round(P.base.mass * lerp(0.55, 1.7, g.mass) * M.weight * 10) / 10;
  const durability = Math.round(Math.min(125, P.base.durability * lerp(0.45, 1.4, g.durability) * M.durability));
  const potency = Math.round(Math.min(135, P.base.potency * lerp(0.45, 1.45, g.potency) * M.potency));
  const tech = Math.round(g.tech * 100), ornament = Math.round(g.ornament * 100);
  const complexity = Math.round(g.complexity * 100), provenance = Math.round(g.provenance * 100);
  const value = Math.round(P.base.value * lerp(0.5, 1.8, g.value) * M.value
    * (1 + g.ornament * 0.9) * (1 + g.provenance * 1.1) * (1 + g.tech * 0.4) * (1 + g.complexity * 0.3));
  return { mass, durability, potency, value, tech, ornament, complexity, provenance };
}

// ── THE ORACLE — appraise expressed stats into worth 0..100 + a grade band ──────────────────────
const WORTH_W = { value: 0.28, potency: 0.22, durability: 0.18, craft: 0.16, story: 0.16 };
const REF = { value: 240, potency: 135, durability: 125 };
export function scoreItem(stats) {
  const sig = {
    value:      clamp01(stats.value / REF.value),
    potency:    clamp01(stats.potency / REF.potency),
    durability: clamp01(stats.durability / REF.durability),
    craft:      clamp01((stats.ornament + stats.complexity) / 200),       // workmanship
    story:      clamp01((stats.provenance * 0.6 + stats.tech * 0.4) / 100), // renown + sophistication
  };
  let base = 0; for (const k in WORTH_W) base += WORTH_W[k] * sig[k];
  const heft = clamp01((stats.mass - 5) / 6);                              // only the unwieldy pay
  const worth = Math.round(clamp01(base - heft * 0.12) * 100);
  const { id, label } = gradeFor(worth);
  return { worth, grade: id, gradeLabel: label, signals: sig, headline: headlineOf(id, sig, stats) };
}
export const GRADES = [
  { id: 'junk',   label: 'Junk',   min: 0,  color: '#566066' },
  { id: 'meagre', label: 'Meagre', min: 25, color: '#9b6b3a' },
  { id: 'fair',   label: 'Fair',   min: 40, color: '#7fd8d0' },
  { id: 'solid',  label: 'Solid',  min: 55, color: '#5aa845' },
  { id: 'superb', label: 'Superb', min: 70, color: '#f4bf62' },
  { id: 'mythic', label: 'Mythic', min: 85, color: '#b39bd8' },
];
function gradeFor(w) { let g = GRADES[0]; for (const t of GRADES) if (w >= t.min) g = t; return g; }
function headlineOf(grade, sig, s) {
  if (grade === 'mythic') return `A mythic specimen — exceptional on every axis.`;
  if (sig.story > 0.7) return `Storied & sophisticated (provenance ${s.provenance}, ${eraOf(s.tech / 100)}).`;
  if (sig.value > 0.7) return `Treasure-grade — worth ${s.value} in trade.`;
  if (sig.potency > 0.7) return `Potent (${s.potency}) — it does its work and then some.`;
  if (sig.craft > 0.7) return `Finely wrought — ornament ${s.ornament}, complexity ${s.complexity}.`;
  if (grade === 'junk') return `Junk — nothing here stands out.`;
  return `A serviceable ${grade} piece.`;
}

// ── NAMING — material × (era-skinned) species, dressed by spikes; high provenance earns a relic name ──
const RELIC_ADJ = ['Ashen', 'Hollow', 'Sunken', 'Forgotten', 'Elder', 'Riven', 'Gilded', 'Pale'];
export function nameItem(genome, stats, spikes, era) {
  const species = speciesName(genome, era);                     // medieval or sci-fi skin per tech
  const pre = spikes.find((s) => s.dir === 'hi' && ['potency', 'durability', 'value', 'ornament', 'tech', 'mass'].includes(s.trait));
  const matName = MATERIALS[genome.material].name;
  let s = `${matName} ${species}`;
  if (pre) s = `${pre.word} ${s}`;
  if (genome.genes.provenance >= 0.88) {                        // a true relic gets a proper name
    const adj = RELIC_ADJ[Math.floor(genome.genes.provenance * 997) % RELIC_ADJ.length];
    s = `the ${adj} ${species}`;
  } else if (genome.genes.complexity >= HI) s = `${s} Mechanism`;
  return s;
}
const canonSpecies = (genome) => { const list = PHYLA[genome.phylum].species; return genome.species && list.includes(genome.species) ? genome.species : list[0]; };
function speciesName(genome, era) {
  const list = PHYLA[genome.phylum].species;
  const idx = Math.max(0, list.indexOf(canonSpecies(genome)));
  return eraSpecies(genome.phylum, idx, era || eraOf(genome.genes.tech));
}

// ── ASSEMBLE — genome → the full item object the sprite engine + page consume ────────────────────
export function assemble(genome, meta = {}) {
  const K = KINGDOMS[genome.kingdom], M = MATERIALS[genome.material];
  const stats = express(genome);
  const spikes = spikesOf(genome.genes);
  const o = scoreItem(stats);
  const era = eraOf(genome.genes.tech);
  return {
    ...meta, genome,
    kingdom: genome.kingdom, phylum: genome.phylum, species: canonSpecies(genome), speciesName: speciesName(genome, era),
    material: genome.material, matter: M.class,
    glyph: K.glyph, accent: K.accent, does: K.does, color: M.color, sheen: M.sheen, era,
    stats, spikes, cues: spikes.map((s) => s.cue).filter(Boolean),
    worth: o.worth, grade: o.grade, gradeLabel: o.gradeLabel, signals: o.signals, headline: o.headline,
    frame: GRADES.find((g) => g.id === o.grade).color, name: nameItem(genome, stats, spikes, era),
  };
}

// ── THE ROLL — a hoard (population genome) → one item genome → assembled item ────────────────────
export function rollGenome(n, hoard = DEFAULT_HOARD) {
  const rk = rng(n, 'kingdom'), rt = rng(n, 'trait'), rp = rng(n, 'phylum'), rm = rng(n, 'mat'), rs = rng(n, 'species');
  const kingdom = R.weighted(rk, Object.entries(hoard.kingdomMix));
  const phyla = phylaOf(kingdom);
  const phylum = R.pick(rp, phyla);
  const species = R.pick(rs, PHYLA[phylum].species);
  // gene means: hoard baseline + kingdom bias; tech has its own hoard mean/spread
  const genes = {};
  for (const t of TRAIT_ORDER) {
    if (t === 'tech') { genes.tech = clamp01(hoard.techMean + (rt() - 0.5) * 2 * hoard.techSpread); continue; }
    const mean = clamp01((hoard.traitMeans[t] ?? GENE_DEFAULT) + (KINGDOMS[kingdom].bias[t] || 0));
    genes[t] = clamp01(mean + (rt() - 0.5) * 2 * hoard.spread);
  }
  const material = R.weighted(rm, materialsAt(phylum, genes.tech));
  return { kingdom, phylum, species, material, genes };
}
export function rollItem(n, hoard = DEFAULT_HOARD) {
  n = n >>> 0;
  return assemble(rollGenome(n, hoard), { n, seed: n });
}
export const forge = rollItem;
export const rollMany = (seeds, hoard = DEFAULT_HOARD) => seeds.map((s) => rollItem(s, hoard));

// ── BREEDING — heredity. Same phylum breeds true; cross-kingdom yields a CHIMERA (verb ≠ body). ──
function blendGenes(ga, gb, rnd, mut) {
  const g = {};
  for (const t of TRAIT_ORDER) {
    const mid = (ga[t] + gb[t]) / 2;
    g[t] = clamp01(mid + (rnd() - 0.5) * 2 * mut);
  }
  return g;
}
export function splice(a, b, n) {
  const A = a.genome || a, B = b.genome || b;
  const rnd = rng(n, 'splice');
  const kingdom = rnd() < 0.5 ? A.kingdom : B.kingdom;
  const phylum = rnd() < 0.5 ? A.phylum : B.phylum;            // body-plan from either parent
  const chimera = PHYLA[phylum].kingdom !== kingdom;           // mismatch ⇒ a chimera (the weird)
  const mut = chimera ? 0.12 : 0.06;
  const genes = blendGenes(A.genes, B.genes, rnd, mut);
  const speciesList = PHYLA[phylum].species;
  const species = [A.species, B.species].find((s) => speciesList.includes(s)) || R.pick(rnd, speciesList);
  const material = R.weighted(rng(n, 'splice-mat'), materialsAt(phylum, genes.tech));
  const genome = { kingdom, phylum, species, material, genes };
  return assemble(genome, { n: hashIds(A, B, n), seed: null, derived: true, lineage: { a: a.n ?? null, b: b.n ?? null, kind: 'splice', chimera } });
}

// ── MUTATION — jitter the genes; rarely hop phylum (within kingdom) or, rarer still, the kingdom ──
export function mutate(item, n, rate = 0.14) {
  const src = item.genome || item;
  const rnd = rng(n, 'mutate');
  let kingdom = src.kingdom, phylum = src.phylum;
  if (rnd() < 0.06) { kingdom = R.pick(rnd, KINGDOM_ORDER); phylum = R.pick(rnd, phylaOf(kingdom)); }   // verb hop
  else if (rnd() < 0.22) { phylum = R.pick(rnd, phylaOf(kingdom)); }                                     // body hop
  const genes = {}; for (const t of TRAIT_ORDER) genes[t] = clamp01(src.genes[t] + (rnd() - 0.5) * 2 * rate);
  const speciesList = PHYLA[phylum].species;
  const species = speciesList.includes(src.species) ? src.species : R.pick(rnd, speciesList);
  const material = R.weighted(rng(n, 'mutate-mat'), materialsAt(phylum, genes.tech));
  const genome = { kingdom, phylum, species, material, genes };
  return assemble(genome, { n: hashIds(src, { n }, n), seed: null, derived: true, lineage: { a: item.n ?? null, kind: 'mutate' } });
}
function hashIds(a, b, n) { let h = (n >>> 0) ^ 0x9e3779b9; h = Math.imul(h ^ (a.n || 0), 2654435761); h = Math.imul(h ^ (b.n || 0), 2246822519); return h >>> 0; }

// ── HOARDS — the population genome (what a place tends to spit out). Cousin of econ's society genome. ──
export const DEFAULT_HOARD = {
  archetype: 'wild',
  kingdomMix: { strike: 10, craft: 12, ward: 8, hold: 13, adorn: 9, lore: 8, channel: 7, light: 9, sustain: 10, sound: 6 },
  traitMeans: { durability: 0.5, potency: 0.5, mass: 0.5, value: 0.5, ornament: 0.45, complexity: 0.45, provenance: 0.4 },
  techMean: 0.45, techSpread: 0.3, spread: 0.3,
};
export const HOARD_ARCHETYPES = [
  { id: 'wild',        w: 4, kingdom: {}, traits: {}, tech: [0.45, 0.30] },
  { id: 'armory',      w: 2, kingdom: { strike: 2.4, craft: 1.4, ward: 2.0, adorn: 0.4, lore: 0.3, sound: 0.3 }, traits: { durability: 0.2, potency: 0.2, ornament: -0.1 }, tech: [0.5, 0.22] },
  { id: 'reliquary',   w: 2, kingdom: { adorn: 2.6, channel: 2.0, lore: 1.4, strike: 0.4, craft: 0.4 }, traits: { ornament: 0.3, provenance: 0.3, value: 0.25, mass: -0.15 }, tech: [0.45, 0.32] },
  { id: 'scriptorium', w: 2, kingdom: { lore: 2.8, channel: 1.6, adorn: 1.2, strike: 0.3, ward: 0.3 }, traits: { provenance: 0.25, complexity: 0.2, durability: -0.1 }, tech: [0.5, 0.28] },
  { id: 'foundry',     w: 1.6, kingdom: { craft: 2.4, ward: 1.8, strike: 1.4, light: 1.3, sustain: 0.5, adorn: 0.4 }, traits: { complexity: 0.25, durability: 0.2, ornament: -0.2 }, tech: [0.8, 0.18] },
  { id: 'midden',      w: 1.6, kingdom: { hold: 2.0, sustain: 1.8, light: 1.4, adorn: 0.3, channel: 0.3 }, traits: { value: -0.25, provenance: -0.15, ornament: -0.2, durability: -0.1 }, tech: [0.22, 0.22] },
];
export function rollHoard(n) {
  const rnd = rng(n, 'hoard');
  const arc = R.weighted(rnd, HOARD_ARCHETYPES, (a) => a.w, (a) => a);
  const jit = (v, f) => v * (1 + (rnd() - 0.5) * 2 * f);
  const kingdomMix = {}; for (const k in DEFAULT_HOARD.kingdomMix) kingdomMix[k] = Math.max(0.3, jit(DEFAULT_HOARD.kingdomMix[k], 0.4) * (arc.kingdom[k] || 1));
  const traitMeans = {}; for (const t in DEFAULT_HOARD.traitMeans) traitMeans[t] = clamp01(DEFAULT_HOARD.traitMeans[t] + (arc.traits[t] || 0) + (rnd() - 0.5) * 0.1);
  return { n, archetype: arc.id, kingdomMix, traitMeans, techMean: clamp01(arc.tech[0] + (rnd() - 0.5) * 0.1), techSpread: arc.tech[1], spread: 0.28 + rnd() * 0.08 };
}

// the SCIFIWARD dial: override a hoard's tech mean (so the whole hoard slides medieval↔ship-grade).
export function hoardWithTech(hoard, techMean, techSpread = 0.14) { return { ...hoard, techMean: Math.max(0, Math.min(1, techMean)), techSpread }; }

const GENOME = { TRAITS, TRAIT_ORDER, GRADES, eraOf, express, scoreItem, nameItem, assemble, rollGenome, rollItem, forge, rollMany, splice, mutate, DEFAULT_HOARD, HOARD_ARCHETYPES, rollHoard, hoardWithTech };
if (typeof globalThis !== 'undefined') globalThis.GENOME = GENOME;
export default GENOME;
