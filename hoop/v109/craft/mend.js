// mend.js — THE MEND VERB for equipment: working an item's own genome to make it better. The lapidary
// (gems.js) already grows + sockets CRYSTALS into gear; this is the other half — reworking the PIECE:
//
//   temper(item, trait)  — push one gene (durability / potency) up a step. A quick hone.
//   reforge(item)        — re-work the whole piece: re-roll its genes biased UPWARD (same body + material).
//   upgrade(item)        — advance it one tech ERA (re-materialing at the new tech). Gated by your rank.
//
// Each SPENDS commodities (the smithy's material→commodity economy) — mend, like make, draws on the ship's
// stock. Items don't wear (durability is a fixed quality, not a depleting bar), so there is no "repair";
// mend is improvement, not restoration. Deterministic from (item, seed). Pure, node-tested.

import { assemble, eraOf, TRAIT_ORDER } from '../sprite/item/genome.js';
import { MATERIALS, PHYLA } from '../sprite/item/taxa.js';
import { ERAS, materialRecipe, availableMaterials } from './smith.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function jitter(seed, salt) { let h = (seed >>> 0) ^ 0x9e3779b9; for (const c of String(salt)) h = Math.imul(h ^ c.charCodeAt(0), 2654435761); h ^= h >>> 15; return ((h >>> 0) / 4294967296); }

export const TEMPER_TRAITS = ['durability', 'potency'];
const STEP = 0.13;   // one temper hones a gene by this much

// the genome an item carries (crafted or rolled). Guarded so a hand-built item still mends.
const genomeOf = (item) => (item && item.genome) ? item.genome : null;

// ── temper — hone ONE gene up a step, re-assemble. Cheapest mend. ──
export function temper(item, trait, opts = {}) {
  const g0 = genomeOf(item); if (!g0 || !TEMPER_TRAITS.includes(trait)) return null;
  const genes = { ...g0.genes };
  if (genes[trait] >= 0.985) return null;                      // already maxed
  genes[trait] = clamp01(genes[trait] + STEP);
  return assemble({ ...g0, genes }, { n: hash(item, opts.seed, 'temper' + trait), seed: null, derived: true, mended: 'temper', lineage: { of: item.n ?? null, kind: 'temper', trait } });
}

// ── reforge — re-work the whole piece: lift every "quality" gene toward a higher floor (biased re-roll),
//    keeping the body-plan, material and tech. Turns a rough piece fine. ──
const LIFT = ['durability', 'potency', 'value', 'ornament', 'complexity'];
export function reforge(item, opts = {}) {
  const g0 = genomeOf(item); if (!g0) return null;
  const seed = (opts.seed >>> 0) || 1, genes = { ...g0.genes };
  for (const t of LIFT) { const r = jitter(seed, t + (item.n || 0)); genes[t] = clamp01(Math.max(genes[t], 0.55 + r * 0.4)); }   // never worse; usually better
  return assemble({ ...g0, genes }, { n: hash(item, opts.seed, 'reforge'), seed: null, derived: true, mended: 'reforge', lineage: { of: item.n ?? null, kind: 'reforge' } });
}

// the tech of the NEXT era above `tech`, or null if already at/above the top.
export function nextEraTech(tech) {
  for (const e of ERAS) if (e.tech > tech + 1e-6) return e.tech;
  return null;
}
export const canUpgrade = (item, ceiling) => { const g = genomeOf(item); if (!g) return false; const nx = nextEraTech(g.genes.tech); return nx != null && nx <= (ceiling ?? 1) + 1e-9; };

// ── upgrade — advance one tech ERA. Re-pick a material appropriate to the new tech (keeping the current
//    one if it still fits), lift stats a touch, re-assemble. Gated by the caller's rank ceiling. ──
export function upgrade(item, ceiling, opts = {}) {
  const g0 = genomeOf(item); if (!g0) return null;
  const nx = nextEraTech(g0.genes.tech); if (nx == null || nx > (ceiling ?? 1) + 1e-9) return null;
  const seed = (opts.seed >>> 0) || 1;
  const genes = { ...g0.genes, tech: nx };
  for (const t of ['durability', 'potency']) genes[t] = clamp01(genes[t] + 0.05);   // a better era makes a better piece
  // keep the material if it survives to the new tech; else step up to the best available there
  let material = g0.material;
  if (MATERIALS[material].tech[0] > nx || MATERIALS[material].tech[1] < nx) {
    const avail = availableMaterials(g0.phylum, nx);
    material = avail[0] || material;
  }
  return assemble({ ...g0, material, genes }, { n: hash(item, opts.seed, 'upgrade'), seed: null, derived: true, mended: 'upgrade', lineage: { of: item.n ?? null, kind: 'upgrade' } });
}

// ── COSTS — every mend spends commodities, drawn on the item's own material recipe scaled by its heft.
//    temper is cheap, reforge dearer, upgrade dearest (+ trace: you're buying it into a higher tech). ──
function baseUnits(item) {
  const g = genomeOf(item), mass = (item.stats && item.stats.mass) || (g && PHYLA[g.phylum] && PHYLA[g.phylum].base.mass) || 1;
  return mass * 4;
}
function scaleRecipe(recipe, units) { const out = {}; for (const [k, v] of Object.entries(recipe)) { const n = Math.round(v * units); if (n > 0) out[k] = n; } return out; }
export function temperCost(item) { const g = genomeOf(item); if (!g) return {}; return scaleRecipe(materialRecipe(g.material), baseUnits(item) * 0.4); }
export function reforgeCost(item) { const g = genomeOf(item); if (!g) return {}; const c = scaleRecipe(materialRecipe(g.material), baseUnits(item) * 0.8); c.volatiles = (c.volatiles || 0) + 2; return c; }
export function upgradeCost(item) {
  const g = genomeOf(item); if (!g) return {};
  const nx = nextEraTech(g.genes.tech) || g.genes.tech;
  const c = scaleRecipe(materialRecipe(g.material), baseUnits(item) * 1.1);
  c.trace = (c.trace || 0) + Math.max(1, Math.ceil(nx * 5));   // buying into a higher era costs the keystone
  return c;
}

function hash(item, seed, salt) { let h = ((seed >>> 0) || 1) ^ 0x9e3779b9; h = Math.imul(h ^ (item.n || 0), 2654435761); for (const c of String(salt)) h = Math.imul(h ^ c.charCodeAt(0), 2246822519); return h >>> 0; }

export default { TEMPER_TRAITS, temper, reforge, upgrade, nextEraTech, canUpgrade, temperCost, reforgeCost, upgradeCost };
