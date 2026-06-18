// food/nutrition.mjs — turn a biome/gacha organism into a FOOD item.
//
// Pure, zero-dep, node + browser. The build script (build-biomes.mjs) runs this
// over a few rolled ecosystems and bakes the result into biomes.json; the cafe
// reads those numbers and never has to reach into biome's heavy sim at runtime.
//
// The chain the user pointed at: biome/gacha procedurally generates a closed food
// web; its HARVESTABLE organisms (crops, fruit, grain — and the herbivores/fish
// the web can spare) are what a cafe could actually plate. This module derives the
// nutrition (kcal + a macro lean) and the game effects (what eating it does):
//
//   • cost            — coins to buy. DIRT CHEAP (1–2): nobody starves on this
//                       ship; food is a maintenance tick, not a money sink. Coins
//                       earned at arcades accumulate for items later.
//   • restoreStamina  — immediate stamina back (you eat, you perk up)
//   • nourish         — fuel for the slow-drain buff (well-fed ⇒ stamina lasts)
//
// Nothing here is canon ecology — it's a believable gloss on the organism traits
// the gacha catalog already carries (harvestIndex, fix, mass, guild, thermy).

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = Math.round;

// producer kind from its common name (just for the menu label + macro lean)
function plantClass(org) {
  const n = (org.common || '').toLowerCase();
  if (/wheat|rice|maize|corn|barley|oat|rye|grain|millet|sorghum/.test(n)) return 'grain';
  if (/potato|cassava|yam|taro|beet|carrot|turnip|root/.test(n)) return 'root';
  if (/apple|pear|berry|fig|grape|plum|cherry|fruit|tomato|squash|pumpkin|melon/.test(n)) return 'fruit';
  if (/bean|pea|clover|lentil|soy|lupin|vetch|alfalfa/.test(n)) return 'legume';
  return 'greens';   // grass, reed, cattail, bamboo, sunflower leaf… the closed-ecology forage
}

// kind: how the menu and macros treat it
export function foodKind(org) {
  if (org.kind === 'producer') return 'plant';
  if ((org.habitats || []).includes('lake')) return 'fish';
  return 'meat';
}

// kcal + macro fractions (carb/protein/fat, ~sum 1) — a per-serving gloss.
export function macrosOf(org) {
  const kind = foodKind(org);
  if (kind === 'plant') {
    const cls = plantClass(org);
    const hi = org.harvestIndex ?? 0.2, fix = org.fix ?? 1.6;
    const kcal = round(60 + hi * 420 + fix * 20);                       // grain/root dense, forage thin
    let m = { carb: 0.72, protein: 0.16, fat: 0.12 };
    if (cls === 'legume') m = { carb: 0.45, protein: 0.40, fat: 0.15 }; // N-fixers carry protein
    else if (cls === 'fruit') m = { carb: 0.86, protein: 0.06, fat: 0.08 };
    else if (cls === 'grain') m = { carb: 0.78, protein: 0.14, fat: 0.08 };
    else if (cls === 'greens') m = { carb: 0.60, protein: 0.25, fat: 0.15 };
    return { kcal, macros: m, cls };
  }
  // animals: protein-dense; fish leaner than land meat; bigger beasts a touch fattier
  const kcal = round(120 + Math.log10(Math.max(10, org.mass_g || 1000)) * 38);
  const m = kind === 'fish'
    ? { carb: 0.02, protein: 0.68, fat: 0.30 }
    : { carb: 0.03, protein: 0.55, fat: 0.42 };
  return { kcal, macros: m, cls: kind };
}

// the full food item the cafe serves. `yieldKg` = standing biomass from the
// solved roll (kept as a scarcity/flavour signal; no longer priced in).
export function deriveFood(org, { yieldKg = 0 } = {}) {
  const kind = foodKind(org);
  const { kcal, macros, cls } = macrosOf(org);
  // dirt cheap: a hearty plate is 2 coins, anything lighter is 1. A maintenance tick.
  const cost = kcal > 250 ? 2 : 1;
  const restoreStamina = clamp(round(kcal / 9), 6, 42);
  const nourish = clamp(round(kcal / 6), 8, 60);
  return {
    id: org.id,
    name: org.common,
    sci: org.sciName || '',
    kind, cls, guild: org.guild || 'producer',
    habitat: (org.habitats || [])[0] || 'land',
    thumb: (org.inat && (org.inat.thumb || org.inat.photo)) || null,
    kcal, macros,
    yieldKg: round(yieldKg),
    cost, restoreStamina, nourish,
    blurb: blurbFor(org, kind, cls, kcal),
  };
}

function blurbFor(org, kind, cls, kcal) {
  const lead = kind === 'fish' ? 'Netted from the lake deck' : kind === 'meat' ? 'Reared on the green decks' : 'Grown on the green decks';
  const tone = kcal > 280 ? 'hearty' : kcal > 180 ? 'a decent plate' : 'light fare';
  return `${lead} — ${tone} (${cls}).`;
}

// pull the edible foods out of a rolled ecosystem. `members` = the roll's species
// ids; `catalogById` = the gacha catalog keyed by id; `last` = solved biomass map.
export function foodsFromRoll(memberIds, catalogById, last = {}) {
  const foods = [];
  for (const id of memberIds) {
    const org = catalogById[id];
    if (!org || !org.harvestable) continue;                              // only what the web can spare
    foods.push(deriveFood(org, { yieldKg: last[id] || 0 }));
  }
  // dearest/most-nourishing first so the menu reads top-down
  foods.sort((a, b) => b.nourish - a.nourish);
  return foods;
}
