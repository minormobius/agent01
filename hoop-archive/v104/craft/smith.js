// smith.js — THE SMITHY KERNEL. The `make` verb for EQUIPMENT (the alchemy bench's harder-metal cousin).
// Where the alchemy bench turns garden reagents into consumables, the smithy turns the ship's own
// production COMMODITIES into gear — a genome item assembled at a chosen body-plan, material and tech era.
//
// This closes the item loop the game was missing: loot → dismantle (→ commodities) → craft (→ gear). The
// item GENOME (sprite/item/genome.js) already mints and appraises items; the smithy is the layer that lets
// a PLAYER assemble one deliberately (pick the phylum + material + tech + how much care) and pays for it in
// commodities, instead of a blind loot roll. Tech is STORY-GATED: your narrative tier sets the era ceiling
// (salvage → forge-age → guild-craft → fine-works → ship-grade), the same way the rind decks unlock — so
// ship-grade manufacturing is something you earn, not something you start with.
//
// THE MATERIAL ECONOMY. The item materials (taxa.js, 22 in 5 classes) map onto the forge's 7 conserved
// commodities — organic↔biomass (the biome/garden), mineral↔silicate, metal↔metal, synthetic↔polymer,
// exotic↔trace (the scarce keystone). A craft SPENDS those commodities; a dismantle RECOVERS a fraction
// (a loss, like the forge's reclaim < build). Precious metals, crystal and the whole exotic class cost
// `trace`, so the rarity gradient falls out of the one scarce commodity.
//
// MECHANISM ONLY — no authored item, recipe, or line here. Pure, DOM-free, deterministic, node-tested.

import { MATERIALS, MATERIAL_ORDER, PHYLA, PHYLUM_ORDER, phylaOf, KINGDOMS, MATTER_AFFINITY, materialPlanet } from '../sprite/item/taxa.js';
import { assemble, eraOf, TRAIT_ORDER } from '../sprite/item/genome.js';
import { PLANETS, bodyOf, matchups } from '../planets.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ── the seven conserved commodities (vendored from forge/forge.js — hoop is pure-static and can't import a
//    sibling wing at runtime; keep this list in sync with forge's COMMODITIES). ──
export const COMMODITIES = [
  { id: 'metal', name: 'Metal', glyph: '⬡', note: 'Fe·Al·Cu — the forge' },
  { id: 'polymer', name: 'Polymer', glyph: '◇', note: 'C·H — plastics & composites' },
  { id: 'silicate', name: 'Silicate', glyph: '◈', note: 'Si·O — glass, ceramic, substrate' },
  { id: 'volatiles', name: 'Volatiles', glyph: '≈', note: 'C·H·O·N — solvent & fuel base' },
  { id: 'water', name: 'Water', glyph: '≋', note: 'coolant & life-support' },
  { id: 'biomass', name: 'Biomass', glyph: '❧', note: 'from the biome & garden' },
  { id: 'trace', name: 'Trace', glyph: '✦', note: 'catalysts & rare elements — the scarce keystone' },
];
export const COMMODITY_IDS = COMMODITIES.map((c) => c.id);
export const commodityMeta = (() => { const m = Object.fromEntries(COMMODITIES.map((c) => [c.id, c])); return (id) => m[id] || null; })();

// each material CLASS → its primary commodity.
const CLASS_PRIMARY = { organic: 'biomass', mineral: 'silicate', metal: 'metal', synthetic: 'polymer', exotic: 'trace' };

// ── commodity coin prices at a materials market (the trade desk). Trace is dear (the scarce keystone);
//    biomass/metal/silicate are cheap bulk stock. Sell recovers half (the desk buys low). ──
export const COMMODITY_PRICE = { metal: 2, polymer: 3, silicate: 2, volatiles: 3, water: 1, biomass: 2, trace: 9 };
export const buyCommodityPrice = (id) => COMMODITY_PRICE[id] || 2;
export const sellCommodityPrice = (id) => Math.max(1, Math.round((COMMODITY_PRICE[id] || 2) * 0.5));

// ── materialRecipe(materialId) → the commodity mix a UNIT of that material costs (before size/tech scaling).
// Derived from the material's class + its own value/weight (so adding a material to taxa auto-derives). ──
export function materialRecipe(materialId) {
  const M = MATERIALS[materialId]; if (!M) return { metal: 1 };
  const cls = M.class, out = {};
  out[CLASS_PRIMARY[cls]] = 1;
  if (cls === 'synthetic') { out.metal = 0.4; out.silicate = 0.35; }        // composites bind metal + glass
  if (cls === 'mineral') out.volatiles = 0.25;                              // fired in a kiln
  if (cls === 'exotic') out.volatiles = (out.volatiles || 0) + 0.6;         // engineered from feedstock
  if (M.value >= 1.5 || cls === 'exotic') out.trace = (out.trace || 0) + 0.6;   // precious / crystal / exotic → the keystone
  return out;
}

// ── ERAS + tech gating. The narrative tier sets the ceiling; you may craft any era at or below it. ──
export const ERAS = [
  { id: 'salvage', tech: 0.10, label: 'Salvage', note: 'scavenged from the dead decks' },
  { id: 'forge-age', tech: 0.30, label: 'Forge-age', note: "the nave's own hand-smiths" },
  { id: 'guild-craft', tech: 0.55, label: 'Guild-craft', note: 'the practised trades' },
  { id: 'fine-works', tech: 0.78, label: 'Fine-works', note: 'ship-grade fabrication' },
  { id: 'ship-grade', tech: 0.94, label: 'Ship-grade', note: "the rind's forge — ship-original" },
];
// narrative tier (1..5) → the highest tech you can craft. Ship-grade is earned late, like the lower rind.
export function techCeilingForTier(tier) { return [0.34, 0.55, 0.78, 0.94, 1.0][clamp((tier | 0) - 1, 0, 4)]; }
export const erasUpTo = (ceiling) => ERAS.filter((e) => e.tech <= ceiling + 1e-9);
export const eraById = (id) => ERAS.find((e) => e.id === id) || null;

// materials you can work at a tech ceiling (their low band ≤ ceiling), weighted by the phylum's affinity —
// so a blade offers metals/synthetics, a charm offers crystal/exotic. Sorted best-affinity first.
export function availableMaterials(phylumId, ceiling) {
  const P = PHYLA[phylumId]; if (!P) return [];
  const aff = P.mats || {}, kc = MATTER_AFFINITY[P.kingdom] || {};
  return MATERIAL_ORDER
    .filter((m) => MATERIALS[m].tech[0] <= ceiling + 1e-9)
    .map((m) => ({ id: m, w: (aff[m] || 0.4) * (kc[MATERIALS[m].class] || 1) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || MATERIALS[a.id].tech[0] - MATERIALS[b.id].tech[0])
    .map((x) => x.id);
}

// ── buildCraftGenome(spec) → a genome the item engine can assemble. spec:
//   { phylum, material, tech(0..1), quality(0..1), species?, seed? }
// quality is the care/skill dial: it lifts the durability/potency/value/ornament/complexity gene MEANS.
// A crafted item is FRESH (low provenance) — renown is earned in use, not at the anvil. Deterministic. ──
function jitter(seed, salt) { let h = (seed >>> 0) ^ 0x9e3779b9; for (const c of String(salt)) h = Math.imul(h ^ c.charCodeAt(0), 2654435761); h ^= h >>> 15; return ((h >>> 0) / 4294967296) - 0.5; }
export function buildCraftGenome(spec) {
  const phylum = PHYLA[spec.phylum] ? spec.phylum : PHYLUM_ORDER[0];
  const P = PHYLA[phylum], kingdom = P.kingdom, seed = (spec.seed >>> 0) || 1;
  const tech = clamp01(spec.tech == null ? 0.4 : spec.tech);
  const q = clamp01(spec.quality == null ? 0.6 : spec.quality);
  const material = (spec.material && MATERIALS[spec.material]) ? spec.material : (availableMaterials(phylum, Math.max(tech, 0.2))[0] || MATERIAL_ORDER[0]);
  const species = (spec.species && P.species.includes(spec.species)) ? spec.species : P.species[0];
  // gene means: quality lifts the "good" axes; the kingdom's own bias still applies; a small seeded jitter.
  const lift = (base) => clamp01(base + (q - 0.5) * 0.7 + (KINGDOMS[kingdom].bias ? 0 : 0));
  const genes = {};
  for (const t of TRAIT_ORDER) {
    if (t === 'tech') { genes.tech = tech; continue; }
    if (t === 'provenance') { genes.provenance = clamp01(0.1 + jitter(seed, 'prov') * 0.1); continue; }   // fresh from the anvil
    if (t === 'mass') { genes.mass = clamp01(0.5 + jitter(seed, 'mass') * 0.2); continue; }
    let base = 0.5;
    if (t === 'durability' || t === 'potency' || t === 'value') base = lift(0.5) + (KINGDOMS[kingdom].bias[t] || 0);
    else if (t === 'ornament' || t === 'complexity') base = 0.35 + q * 0.5;                                // care shows as finish
    genes[t] = clamp01(base + jitter(seed, t) * 0.12);
  }
  return { kingdom, phylum, species, material, genes };
}

// ── itemRegister(item|materialId) → the v104 planet register a piece of gear carries (from its material).
//    A crafted or looted item speaks the same alphabet as its wielder: its planet sets its combat matchup;
//    faction sets the school. Faction chooses which attribute the register FAVOURS (the body it leans on). ──
export function itemRegister(item) {
  const materialId = typeof item === 'string' ? item : (item && item.material);
  const pk = materialPlanet(materialId);
  const P = pk && PLANETS[pk]; if (!P) return null;
  return { planet: P.key, register: P.adj, glyph: P.glyph, colour: P.colour, metal: P.metal, temperament: P.temperament, matchups: matchups(P.key) };
}
// which triad attribute a faction's body leans on — the "faction = school" half of the forge (plan.html).
export const favoursOf = (faction) => bodyOf(faction) || null;

// craftItem(spec) → the assembled item object (the pack/shop shape), tagged crafted + stamped with its
// planet register (so combat & the other verticals can read a crafted item's flavor). `spec.faction`
// (optional) records the school it was forged under.
export function craftItem(spec) {
  const genome = buildCraftGenome(spec);
  const item = assemble(genome, { n: (spec.seed >>> 0) || 1, seed: (spec.seed >>> 0) || 1, crafted: true });
  const reg = itemRegister(genome.material);
  if (reg) { item.planet = reg.planet; item.register = reg.register; item.planetGlyph = reg.glyph; item.planetColour = reg.colour; }
  if (spec && spec.faction) { item.faction = spec.faction; item.favours = favoursOf(spec.faction); }
  return item;
}

// ── craftCost(spec) → the commodity bill to forge it. Driven by SIZE (phylum mass × material weight),
//    the material recipe, the TECH surcharge (high tech always wants some trace), and the QUALITY dial. ──
const COST_K = 6;   // tuning: turns the unit-scale into legible small integers
export function craftCost(spec) {
  const phylum = PHYLA[spec.phylum] ? spec.phylum : PHYLUM_ORDER[0];
  const material = (spec.material && MATERIALS[spec.material]) ? spec.material : (availableMaterials(phylum, 0.5)[0] || MATERIAL_ORDER[0]);
  const tech = clamp01(spec.tech == null ? 0.4 : spec.tech), q = clamp01(spec.quality == null ? 0.6 : spec.quality);
  const massKg = PHYLA[phylum].base.mass * MATERIALS[material].weight;
  const recipe = materialRecipe(material);
  const scale = massKg * (0.7 + q * 0.7) * (1 + tech * 0.6) * COST_K;
  const cost = {};
  for (const [k, v] of Object.entries(recipe)) cost[k] = Math.max(1, Math.round(v * scale));
  if (tech > 0.68) cost.trace = (cost.trace || 0) + Math.ceil((tech - 0.68) * 6);   // the ship-grade tax
  return cost;
}

// ── dismantle(item) → the commodities recovered by breaking it down. A LOSS process (you get less back
//    than it cost to build — the forge's reclaim<build rule), scaled by the item's mass + worth. Feeds
//    the smithy: unwanted loot becomes craft stock. ──
export const RECLAIM_FRACTION = 0.5;
export function dismantle(item) {
  if (!item) return {};
  const material = item.material && MATERIALS[item.material] ? item.material : 'iron';
  const massKg = (item.stats && item.stats.mass) || PHYLA[item.phylum] && PHYLA[item.phylum].base.mass || 1;
  const worth = (item.worth || 30) / 100;
  const recipe = materialRecipe(material);
  const scale = massKg * (0.7 + worth * 0.6) * COST_K * RECLAIM_FRACTION;
  const out = {};
  for (const [k, v] of Object.entries(recipe)) { const n = Math.floor(v * scale); if (n > 0) out[k] = n; }
  // always return at least 1 of the primary commodity, so nothing dismantles to nothing
  const primary = CLASS_PRIMARY[MATERIALS[material].class];
  if (!out[primary]) out[primary] = 1;
  return out;
}

// can this wallet afford a cost? + the shortfall (for the UI).
export function canAfford(wallet, cost) {
  wallet = wallet || {};
  for (const k of Object.keys(cost)) if ((wallet[k] || 0) < cost[k]) return false;
  return true;
}
export function shortfall(wallet, cost) {
  wallet = wallet || {}; const out = {};
  for (const k of Object.keys(cost)) { const d = cost[k] - (wallet[k] || 0); if (d > 0) out[k] = d; }
  return out;
}
// spend/earn helpers — pure, return a NEW wallet.
export function spend(wallet, cost) { const w = { ...(wallet || {}) }; for (const k of Object.keys(cost)) w[k] = (w[k] || 0) - cost[k]; return w; }
export function earn(wallet, gain) { const w = { ...(wallet || {}) }; for (const k of Object.keys(gain)) w[k] = (w[k] || 0) + gain[k]; return w; }

export default {
  COMMODITIES, COMMODITY_IDS, commodityMeta, materialRecipe, ERAS, techCeilingForTier, erasUpTo, eraById,
  availableMaterials, buildCraftGenome, craftItem, craftCost, dismantle, RECLAIM_FRACTION, canAfford, shortfall, spend, earn,
  itemRegister, favoursOf,
};
