// cookbook.js — THE ALCHEMIST'S COOKBOOK, derived. A pure catalog over the correspondence→effect kernel
// (alchemy.js): every live reagent with its effect, the grammar tables laid out for reading, and
// EXEMPLAR RECIPES computed by actually running prepare() on coherent brews. Nothing here is authored
// content — no recipe names, no flavor lines, no NPC reactions. It exposes the mechanical recipe (which
// reagents + which vessel → which effect + what grade) as data; hoopy names and dresses them against
// these stable keys. The cookbook page AND the in-game bench both read this one kernel.
//
// Pure, DOM-free, deterministic (no RNG — recipes are chosen by potency then slug). Node-tested.

import { PLANETS, TEMPERAMENTS } from './correspondences.js';
import {
  HUMOUR_EFFECT, PLANET_EFFECT, METAL_EFFECT, PREPARATIONS,
  reagentEffect, findReagent, coherence, gradeOf, prepare,
} from './alchemy.js';
import { CORRESPONDENCES } from './correspondences.js';

const byPotencyThenName = (a, b) => (b.potency - a.potency) || a.plant.localeCompare(b.plant);

// ── the full reagent catalog: every alchemically-live herb, with its derived effect + the scholarly facts.
export function reagentCatalog() {
  return (CORRESPONDENCES.plants || [])
    .map((p) => {
      const e = reagentEffect(p.plant);
      if (!e.live) return null;
      return {
        slug: p.slug, plant: p.plant, bot: p.bot,
        planet: e.planet, qualities: e.qualities, degree: e.degree, potency: e.potency,
        glyph: e.glyph, metal: e.metal,
        combat: e.combat, social: e.social, lubricant: e.lubricant,
        signature: p.signature || null,   // read/alch's scholarly note (vendored data, not new content)
      };
    })
    .filter(Boolean)
    .sort(byPotencyThenName);
}

const _live = () => reagentCatalog();
export const reagentsByHumour = (q) => _live().filter((r) => r.qualities === q).sort(byPotencyThenName);
export const reagentsByPlanet = (pl) => _live().filter((r) => r.planet === pl).sort(byPotencyThenName);

// ── the grammar, laid out for the page: each row is a family the player can aim a brew at. ──
export function grammar() {
  return {
    humours: TEMPERAMENTS ? Object.keys(HUMOUR_EFFECT).map((q) => {
      const h = HUMOUR_EFFECT[q];
      return { qualities: q, glyph: h.glyph, element: h.element, humour: h.humour, effect: h.key,
        combatKind: h.combatKind, status: h.status || null, stat: h.stat || null,
        count: reagentsByHumour(q).length };
    }) : [],
    planets: Object.keys(PLANET_EFFECT).map((pl) => {
      const e = PLANET_EFFECT[pl];
      return { planet: pl, glyph: (PLANETS[pl] || {}).glyph || '', metal: (PLANETS[pl] || {}).metal || null,
        social: e.social, anima: e.anima, note: e.note, count: reagentsByPlanet(pl).length };
    }),
    metals: Object.keys(METAL_EFFECT).map((m) => ({ metal: m, chassis: METAL_EFFECT[m].chassis, note: METAL_EFFECT[m].note })),
    preparations: Object.keys(PREPARATIONS).map((k) => ({ key: k, ...PREPARATIONS[k] })),
  };
}

// ── describeEffect: a prepared item's mechanics.use → a short, human effect line (page + bench readout). ──
export function describeEffect(prepared) {
  if (!prepared || !prepared.ok) return prepared && prepared.reason ? prepared.reason : 'no effect';
  const u = prepared.mechanics.use, parts = [];
  const reach = u.deliver === 'self' ? 'self' : u.deliver === 'touch' ? 'touch' : u.deliver === 'range' ? `ranged ${u.range}${u.radius ? ` · r${u.radius}` : ''}` : u.deliver;
  if (u.combat) {
    const c = u.combat;
    if (c.kind === 'heal') parts.push(`heal ${c.amount} HP`);
    else if (c.kind === 'attack') parts.push(`damage ${c.damage}${c.status ? ` · ${c.status}` : ''}`);
    else if (c.kind === 'buff') parts.push(`+${c.amount} ${c.stat} · ${c.turns}t`);
    else if (c.kind === 'debuff') parts.push(`${c.status} · ${c.turns}t`);
    if (c.element) parts[parts.length - 1] += ` (${c.element})`;
  }
  if (u.social) parts.push(`+${u.social.amount} ${u.social.stat} [${u.social.anima}]`);
  if (u.gift) parts.push(`gift +${u.gift.standing} standing`);
  if (u.lubricant) parts.push(`${u.lubricant.chassis} lube +${u.lubricant.amount}`);
  return (parts.join(' · ') || 'inert') + ` (${reach})`;
}

// each combat family's natural vessel (Galenic delivery): heal → a draught you drink; a caustic → an
// incense you burn at range; a rousing tonic you drink; a soporific smoke you throw. Content can override.
const HUMOUR_PREP = { 'cold & moist': 'draught', 'hot & dry': 'smoke', 'hot & moist': 'tonic', 'cold & dry': 'smoke' };

// ── deriveRecipes: EXEMPLAR recipes, computed (not authored). For every combat family, every planet, and
// the lubricant line, pick the strongest COHERENT brew from the pool and actually prepare() it — so each
// card is a real, graded, game-ready preparation. Deterministic. `per` caps reagents per brew (2–3). ──
export function deriveRecipes({ per = 3 } = {}) {
  const out = [];
  const take = (list) => list.slice(0, per).map((r) => r.plant);

  // combat recipes — one per humour family (heal / damage / buff / debuff)
  for (const q of Object.keys(HUMOUR_EFFECT)) {
    const pool = reagentsByHumour(q); if (pool.length < 1) continue;
    const names = take(pool), prepKey = HUMOUR_PREP[q] || 'draught';
    const res = prepare(names, prepKey); if (!res.ok) continue;
    out.push({ family: 'combat', axis: q, key: HUMOUR_EFFECT[q].key, glyph: HUMOUR_EFFECT[q].glyph,
      reagents: names, preparation: prepKey, vessel: res.vessel, grade: res.grade, label: res.label,
      coherence: res.coherence, potency: res.potency, effect: describeEffect(res), use: res.mechanics.use });
  }
  // social recipes — one per planet (persuasion / acuity / …), drunk as a draught
  for (const pl of Object.keys(PLANET_EFFECT)) {
    const pool = reagentsByPlanet(pl); if (pool.length < 1) continue;
    const names = take(pool);
    const res = prepare(names, 'draught'); if (!res.ok) continue;
    out.push({ family: 'social', axis: pl, key: PLANET_EFFECT[pl].social, glyph: (PLANETS[pl] || {}).glyph || '',
      reagents: names, preparation: 'draught', vessel: res.vessel, grade: res.grade, label: res.label,
      coherence: res.coherence, potency: res.potency, effect: describeEffect(res), use: res.mechanics.use });
  }
  // lubricant recipe — the mechanical vertical: metal-bearing reagents pressed to an oil
  {
    const metalled = _live().filter((r) => r.lubricant).sort(byPotencyThenName);
    if (metalled.length) {
      const names = take(metalled);
      const res = prepare(names, 'oil');
      if (res.ok) out.push({ family: 'lubricant', axis: 'oil', key: 'lubricant', glyph: '⚙',
        reagents: names, preparation: 'oil', vessel: res.vessel, grade: res.grade, label: res.label,
        coherence: res.coherence, potency: res.potency, effect: describeEffect(res), use: res.mechanics.use });
    }
  }
  return out;
}

// ── pairingsFor: given a reagent slug, which others sing with it (share humour → strong combat brew;
// share planet → strong social brew). The "what goes with what" the player learns. Deterministic. ──
export function pairingsFor(slug) {
  const r = reagentEffect(findReagent(slug) ? findReagent(slug).plant : slug);
  if (!r || !r.live) return { humourMates: [], planetMates: [] };
  const others = _live().filter((x) => x.slug !== r.slug);
  return {
    humourMates: others.filter((x) => x.qualities && x.qualities === r.qualities).sort(byPotencyThenName).slice(0, 6),
    planetMates: others.filter((x) => x.planet && x.planet === r.planet).sort(byPotencyThenName).slice(0, 6),
  };
}

export default { reagentCatalog, reagentsByHumour, reagentsByPlanet, grammar, describeEffect, deriveRecipes, pairingsFor };
