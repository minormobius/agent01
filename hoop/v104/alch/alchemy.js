// alchemy.js — THE CORRESPONDENCE → EFFECT KERNEL. The spine of the alchemy vertical.
//
// read/alch (vendored: ./correspondences.js) rescued 55 real garden herbs, each tagged with the four
// axes an alchemist reads: a Galenic TEMPERAMENT (hot/cold × dry/moist → element + humour), a DEGREE
// (Macer's stated intensity, 1st–4th — a natural potency scale), a PLANET (one of the Seven — which
// are ALREADY this game's cosmology: the rind factions, the borges tellers), and — via the planet — a
// METAL (the herb→planet→metal bridge). This kernel is the pure function that turns those four axes
// into the game's own effect vocabulary:
//
//   TEMPERAMENT → a COMBAT effect      (heal / damage / buff / debuff — the arena/engine.js SKILLS kinds)
//   PLANET      → a SOCIAL/ANIMA effect (persuasion / acuity / … — dips into the mind characteristics)
//   METAL       → a LUBRICANT/CHASSIS effect (servo / frame / core — for mechanical/android players)
//   DEGREE      → POTENCY (the magnitude dial on all of the above)
//   PREPARATION → DELIVERY (self / touch / ranged — the vessel decides reach)
//
// IMPORTANT — this is MECHANISM, not content. It exposes the grammar as data (HUMOUR_EFFECT,
// PLANET_EFFECT, METAL_EFFECT, PREPARATIONS) and one pure `prepare()` that yields an effect payload in
// the shape the game's consume verb + arena resolver already read (mechanics.use). Which reagents grow
// where, which recipes exist, and which NPCs react to which draught is CONTENT — hoopy authors that
// against these stable keys. Nothing here hard-codes a recipe, a reagent placement, or a line.
//
// Pure, DOM-free, deterministic, node-tested (test/alch.selftest.mjs). No randomness.

import { PLANETS, TEMPERAMENTS, CORRESPONDENCES } from './correspondences.js';
// v104 unified language: funnel the vendored correspondence planet names (capitalised Sun/Moon/Jupiter)
// onto the ONE canonical planet key (sol/luna/jupiter) every other vertical speaks — so a reagent's
// planet is the SAME token a character, item, gem or foe carries (that is what planetOf's Sun/Moon
// aliases were built for). Keeps the vendored data untouched; adds the bridge on top.
import { planetOf, matchups, colourOf } from '../planets.js';

// ── the four grammar tables (author against these keys) ───────────────────────────────────────────

// TEMPERAMENT → combat effect. Faithful to Galenic pharmacology: hot = stimulant/caustic, cold =
// sedative/cooling, moist = softening/soothing, dry = binding/astringent. So:
//   hot & dry (choler/Fire)   → caustic  → DAMAGE (a burn that bleeds)         e.g. mustard, garlic, rue
//   hot & moist (blood/Air)   → rousing  → BUFF   (warm the blood, quicken)    e.g. borage, sanguine herbs
//   cold & moist (phlegm/Water)→ cooling → HEAL   (soothe, mend, quench)       e.g. gourd, melon, purslane
//   cold & dry (melancholy/Earth)→ sedative→ DEBUFF(numb, bind, slow)          e.g. poppy (the sedative), sorrel
export const HUMOUR_EFFECT = {
  'hot & dry':    { key: 'caustic', combatKind: 'attack', status: 'bleed', element: 'Fire',  humour: 'choler',     glyph: '🜂' },
  'hot & moist':  { key: 'rousing', combatKind: 'buff',   stat: 'atk',     element: 'Air',   humour: 'blood',      glyph: '🜁' },
  'cold & moist': { key: 'cooling', combatKind: 'heal',                    element: 'Water', humour: 'phlegm',     glyph: '🜄' },
  'cold & dry':   { key: 'sedate',  combatKind: 'debuff', status: 'slow',  element: 'Earth', humour: 'melancholy', glyph: '🜃' },
};

// PLANET → social/anima effect + the anima characteristic it draws on (stats.js: will/cogit/nerve).
// The Seven are already the game's factions, so an herb's planet also names an AFFINITY the content can
// read (a Venus balm gifted to a Venus-aligned NPC lands harder — hoopy's call, but the key is here).
export const PLANET_EFFECT = {
  Mercury: { social: 'acuity',       anima: 'cogit', note: 'quickness of wit — reads a room, learns fast' },
  Venus:   { social: 'persuasion',   anima: 'will',  note: 'charm and desire — bends a hearer' },
  Sun:     { social: 'presence',     anima: 'will',  note: 'radiant authority — commands a room' },
  Moon:    { social: 'insight',      anima: 'cogit', note: 'empathy, dream-sight — reads what is hidden' },
  Jupiter: { social: 'largesse',     anima: 'will',  note: 'magnanimity — the gifting virtue (standing)' },
  Mars:    { social: 'intimidation', anima: 'nerve', note: 'dominance and threat — cows a hearer' },
  Saturn:  { social: 'resolve',      anima: 'will',  note: 'gravity and endurance — steadies, binds' },
};

// METAL (via the planet bridge) → lubricant/mechanical effect on the CHASSIS characteristics
// (stats.js: frame/servo/core). This is the vertical for the ship's mechanical players — an oil pressed
// under the right planet tunes a joint. Quicksilver (Mercury) is the great lubricant, by tradition.
export const METAL_EFFECT = {
  gold:        { chassis: 'core',  note: 'incorruptible, conductive — charge & integrity' },
  silver:      { chassis: 'servo', note: 'smooth, reflective — precision of motion' },
  quicksilver: { chassis: 'servo', note: 'liquid metal — the great lubricant' },
  copper:      { chassis: 'core',  note: 'conductive — charge & flux' },
  iron:        { chassis: 'frame', note: 'hard, structural — armor & frame' },
  tin:         { chassis: 'frame', note: 'plating — frame' },
  lead:        { chassis: 'core',  note: 'dense, damping — shielding (and it slows)' },
};

// PREPARATION (the vessel) → delivery. Maps onto the item taxonomy's `sustain` kingdom phyla
// (draught / salve) plus two new craft variants (smoke, oil). The vessel decides REACH:
//   self  — ingested, affects the drinker (draught/tonic/elixir)
//   touch — applied to a target in reach   (salve/poultice/balm), range 1
//   range — burned to a vapor, a ranged AoE (smoke/incense), range 4 radius 1
//   oil   — the lubricant delivery, mechanical, touch
export const PREPARATIONS = {
  draught:  { vessel: 'Draught',  deliver: 'self',  phylum: 'draught' },
  tonic:    { vessel: 'Tonic',    deliver: 'self',  phylum: 'draught' },
  elixir:   { vessel: 'Elixir',   deliver: 'self',  phylum: 'draught' },
  salve:    { vessel: 'Salve',    deliver: 'touch', phylum: 'salve', range: 1 },
  poultice: { vessel: 'Poultice', deliver: 'touch', phylum: 'salve', range: 1 },
  balm:     { vessel: 'Balm',     deliver: 'touch', phylum: 'salve', range: 1 },
  smoke:    { vessel: 'Incense',  deliver: 'range', phylum: 'draught', range: 4, radius: 1 },
  oil:      { vessel: 'Oil',      deliver: 'touch', phylum: 'salve', mechanical: true },
};

// ── reagent lookup: resolve any name to a correspondence record ────────────────────────────────────
// Matches by slug, common plant name, OR botanical binomial (so the BIOME ROSTER's sciName resolves
// straight to a reagent — the bridge step 2 needs). Case/space-insensitive. Returns null for a plant
// the scholarly overlay hasn't attributed (the ~40 Capitulare plants with no correspondence) — those
// are edible/terrain plants but not (yet) alchemically live, and the kernel says so honestly.
const _norm = (s) => String(s || '').toLowerCase().trim();
const _index = (() => {
  const byKey = new Map();
  for (const p of CORRESPONDENCES.plants || []) {
    for (const k of [p.slug, p.plant, p.bot]) if (k) byKey.set(_norm(k), p);
  }
  return byKey;
})();
export function findReagent(name) { return _index.get(_norm(name)) || null; }

// Macer's degree phrasing → an integer potency 1..4 ("3rd degree" → 3, "hot 3°, dry" → 3, null → 1).
export function parseDegree(degree) {
  if (degree == null) return 1;
  const s = String(degree);
  const ord = s.match(/(\d)(?:st|nd|rd|th)?\s*degree/i) || s.match(/(\d)\s*°/);
  const n = ord ? +ord[1] : 1;
  return Math.max(1, Math.min(4, n));
}

// ── reagentEffect: one herb → its full effect descriptor ───────────────────────────────────────────
// The atom the bench composes. Pure derivation from the correspondence — no game state.
//   { slug, plant, bot, planet, qualities, degree, potency, glyph, metal,
//     combat:{key,kind,status?,stat?}, social:{stat,anima}, lubricant:{chassis}, live:true }
// `live:false` (+ null axes) for an un-attributed plant — still a valid garden crop, just not alchemical.
export function reagentEffect(name) {
  const p = findReagent(name);
  if (!p) return { name, live: false, combat: null, social: null, lubricant: null };
  const temper = p.qualities && HUMOUR_EFFECT[p.qualities];
  const planet = p.planet && PLANET_EFFECT[p.planet];
  const metalName = p.planet && PLANETS[p.planet] && PLANETS[p.planet].metal;
  const metal = metalName && METAL_EFFECT[metalName];
  const pKey = p.planet ? planetOf(p.planet) : null;                 // canonical key (Sun→sol, Venus→venus …)
  return {
    slug: p.slug, plant: p.plant, bot: p.bot,
    planet: p.planet || null, planetKey: pKey,                       // correspondence name + the ONE canonical token
    qualities: p.qualities || null,
    degree: p.degree || null, potency: parseDegree(p.degree),
    glyph: temper ? temper.glyph : null, metal: metalName || null,
    colour: pKey ? colourOf(pKey) : null,                           // the reagent's register colour (shared palette)
    combat: temper ? { key: temper.key, kind: temper.combatKind, status: temper.status || null, stat: temper.stat || null } : null,
    social: planet ? { stat: planet.social, anima: planet.anima } : null,
    lubricant: metal ? { chassis: metal.chassis, metal: metalName } : null,
    matchups: pKey ? matchups(pKey) : null,                         // the reagent's 7-way combat matchup (shared RPS)
    live: !!(temper || planet),
  };
}

// ── coherence: do the reagents AGREE? (the alchemy analog of the kitchen's flavor coherence) ────────
// A brew of reagents that share a temperament (and planet) is COHERENT — one clean, strong effect. A
// brew of clashing humours is muddled — weaker, and past a point it curdles. This is the crafting skill
// axis: hoopy/players learn which herbs sing together. Pure count-based agreement in [0,1].
export function coherence(reagents) {
  const live = reagents.filter((r) => r && r.live);
  if (live.length < 2) return live.length ? 1 : 0;
  const share = (key) => {
    const counts = {};
    for (const r of live) { const v = key(r); if (v) counts[v] = (counts[v] || 0) + 1; }
    const top = Math.max(0, ...Object.values(counts));
    return top / live.length;               // fraction in the plurality bucket
  };
  const humourAgree = share((r) => r.qualities);
  const planetAgree = share((r) => r.planet);
  return +(0.7 * humourAgree + 0.3 * planetAgree).toFixed(4);   // humour dominates the brew; planet colours it
}

const GRADES = [[0.85, 'S', 'Quintessence'], [0.7, 'A', 'Sovereign'], [0.55, 'B', 'True'],
  [0.4, 'C', 'Serviceable'], [0.25, 'D', 'Rough'], [-1, 'F', 'Muddled']];
export function gradeOf(coh) { for (const [min, g, label] of GRADES) if (coh >= min) return { grade: g, label }; return { grade: 'F', label: 'Muddled' }; }

// ── prepare: reagents + a preparation → a PREPARATION ITEM with a game-ready effect payload ─────────
// This is what the bench (a kitchen.js cousin) will call, and the shape hoopy's authored recipe items
// mirror. It NEVER invents narrative — it computes mechanics. The dominant humour sets the combat
// effect, the dominant planet the social effect, present metals the lubricant effect; the summed
// potency scales magnitude; coherence sets the grade and how much of the effect actually lands.
//
// Returns an item in the sustain-kingdom shape the game already understands, with `mechanics.use` the
// consume verb reads (envelope: { deliver, combat?, social?, lubricant?, gift? }). `ok:false` if the
// brew is empty of live reagents (an edible mash, not a preparation).
export function prepare(reagentNames, prepKey = 'draught') {
  const prep = PREPARATIONS[prepKey] || PREPARATIONS.draught;
  const reagents = (reagentNames || []).map(reagentEffect);
  const live = reagents.filter((r) => r.live);
  if (!live.length) return { ok: false, reason: 'no alchemically-live reagents — this is food, not a preparation', reagents };

  const coh = coherence(reagents);
  const { grade, label } = gradeOf(coh);
  const potency = live.reduce((s, r) => s + r.potency, 0);
  const land = 0.4 + 0.6 * coh;                 // coherence decides how much of the effect survives the brew

  // dominant humour (plurality; ties broken by highest summed potency) → the combat payload
  const dom = (pick) => {
    const buckets = {};
    for (const r of live) { const k = pick(r); if (!k) continue; (buckets[k] = buckets[k] || []).push(r); }
    let best = null;
    for (const [k, rs] of Object.entries(buckets)) {
      const w = rs.length * 100 + rs.reduce((s, r) => s + r.potency, 0);
      if (!best || w > best.w) best = { k, rs, w };
    }
    return best;
  };
  const domHumour = dom((r) => r.qualities);
  const domPlanet = dom((r) => r.planet);

  const use = { deliver: prep.deliver };
  if (prep.range != null) use.range = prep.range;
  if (prep.radius != null) use.radius = prep.radius;

  // COMBAT — from the dominant temperament. potency → magnitude; land → how much applies.
  if (domHumour) {
    const eff = HUMOUR_EFFECT[domHumour.k];
    const mag = +(potency * land).toFixed(2);
    use.combat = { kind: eff.combatKind, element: eff.element, magic: prep.deliver === 'range' };
    if (eff.combatKind === 'heal') use.combat.amount = mag;                       // hp restored (scaled downstream)
    else if (eff.combatKind === 'attack') { use.combat.damage = mag; use.combat.status = eff.status; }
    else if (eff.combatKind === 'buff') { use.combat.stat = eff.stat; use.combat.amount = Math.round(mag); use.combat.turns = 2; }
    else if (eff.combatKind === 'debuff') { use.combat.status = eff.status; use.combat.turns = Math.max(1, Math.round(mag / 2)); }
    if (prep.range != null) use.combat.range = prep.range;
    if (prep.radius != null) use.combat.radius = prep.radius;
  }
  // SOCIAL — from the dominant planet, dips into an anima characteristic.
  if (domPlanet) {
    const eff = PLANET_EFFECT[domPlanet.k];
    use.social = { stat: eff.social, anima: eff.anima, amount: +(potency * land * 0.5).toFixed(2), planet: domPlanet.k, planetKey: planetOf(domPlanet.k) };
    if (domPlanet.k === 'Jupiter') use.gift = { standing: Math.max(1, Math.round(potency * land)) };   // largesse → gifting bonus
  }
  // LUBRICANT — only when prepared as an oil (mechanical delivery); the metals of the reagents tune a joint.
  if (prep.mechanical) {
    const metals = {};
    for (const r of live) if (r.lubricant) metals[r.lubricant.chassis] = (metals[r.lubricant.chassis] || 0) + r.potency;
    const top = Object.entries(metals).sort((a, b) => b[1] - a[1])[0];
    if (top) use.lubricant = { chassis: top[0], amount: +(top[1] * land).toFixed(2) };
  }

  const glyphs = [...new Set(live.map((r) => r.glyph).filter(Boolean))].join('');
  return {
    ok: true,
    kind: 'preparation',
    vessel: prep.vessel,
    phylum: prep.phylum,           // → the sustain-kingdom item phylum (draught|salve)
    grade, label, coherence: coh, potency,
    glyphs,
    reagents: live.map((r) => ({ slug: r.slug, plant: r.plant, planet: r.planet, qualities: r.qualities })),
    // the item the game holds + consumes. mechanics.use is read by the consume verb + arena resolver.
    mechanics: { slot: 'kit', use },
  };
}

export default {
  HUMOUR_EFFECT, PLANET_EFFECT, METAL_EFFECT, PREPARATIONS,
  findReagent, parseDegree, reagentEffect, coherence, gradeOf, prepare,
};
