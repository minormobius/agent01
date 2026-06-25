// gems.js — THE LAPIDARY's crystallography kernel. Pure + seeded. The gem data is PORTED from
// cards/js/pools/gem-pool.js (a no-build static site can't reach ../../cards/ at runtime — same rule
// as vendor/auth.js: re-sync from source, don't drift). Real minerals carry real properties (crystal
// system, Mohs hardness, luster, rarity); here those properties MAP TO COMBAT — the lattice channels
// which stat a socketed gem strengthens, hardness sets the magnitude, rarity scales it.
//
//   pull (gacha) → satchel → grow (epitaxial: 3 of a lattice → 1 bigger crystal) → socket into gear.

export const CRYSTAL_SYSTEMS = {
  cubic:        { name: 'Cubic',        icon: '◆', stat: 'balanced',  blurb: 'most symmetric — balanced reinforcement' },
  tetragonal:   { name: 'Tetragonal',   icon: '◇', stat: 'def',       blurb: 'a stretched cube — wards (defence)' },
  orthorhombic: { name: 'Orthorhombic', icon: '▱', stat: 'hp',        blurb: 'three unequal axes — vitality (health)' },
  hexagonal:    { name: 'Hexagonal',    icon: '⬡', stat: 'atk',       blurb: 'six-fold prisms — edge (attack)' },
  trigonal:     { name: 'Trigonal',     icon: '△', stat: 'atk+flux',  blurb: 'three-fold — edge & charge' },
  monoclinic:   { name: 'Monoclinic',   icon: '▰', stat: 'flux',      blurb: 'one oblique angle — charge (flux)' },
  triclinic:    { name: 'Triclinic',    icon: '◁', stat: 'chaos',     blurb: 'no symmetry — a little of everything' },
};

// the population genome of one crystal: real mineral data. [name, system, {hardness, luster, rarity, color}]
export const GEM_POOL = [
  ['Halite', 'cubic', { hardness: 2, luster: 'vitreous', rarity: 'common', color: [0.95, 0.95, 0.95, 0.4] }],
  ['Pyrite', 'cubic', { hardness: 6.5, luster: 'metallic', rarity: 'common', color: [0.83, 0.69, 0.22, 1] }],
  ['Garnet', 'cubic', { hardness: 7, luster: 'vitreous', rarity: 'uncommon', color: [0.55, 0.05, 0.1, 0.7] }],
  ['Spinel', 'cubic', { hardness: 8, luster: 'vitreous', rarity: 'rare', color: [0.8, 0.1, 0.2, 0.5] }],
  ['Diamond', 'cubic', { hardness: 10, luster: 'adamantine', rarity: 'legendary', color: [0.95, 0.95, 1.0, 0.3] }],
  ['Chalcopyrite', 'tetragonal', { hardness: 3.5, luster: 'metallic', rarity: 'common', color: [0.8, 0.7, 0.2, 1] }],
  ['Zircon', 'tetragonal', { hardness: 7.5, luster: 'adamantine', rarity: 'uncommon', color: [0.7, 0.5, 0.2, 0.4] }],
  ['Rutile', 'tetragonal', { hardness: 6, luster: 'adamantine', rarity: 'uncommon', color: [0.55, 0.15, 0.05, 0.8] }],
  ['Wulfenite', 'tetragonal', { hardness: 3, luster: 'adamantine', rarity: 'rare', color: [0.9, 0.5, 0.1, 0.5] }],
  ['Olivine', 'orthorhombic', { hardness: 6.5, luster: 'vitreous', rarity: 'common', color: [0.4, 0.6, 0.15, 0.5] }],
  ['Topaz', 'orthorhombic', { hardness: 8, luster: 'vitreous', rarity: 'uncommon', color: [0.9, 0.7, 0.3, 0.3] }],
  ['Tanzanite', 'orthorhombic', { hardness: 6.5, luster: 'vitreous', rarity: 'rare', color: [0.3, 0.2, 0.7, 0.3] }],
  ['Chrysoberyl', 'orthorhombic', { hardness: 8.5, luster: 'vitreous', rarity: 'rare', color: [0.6, 0.7, 0.2, 0.4] }],
  ['Apatite', 'hexagonal', { hardness: 5, luster: 'vitreous', rarity: 'common', color: [0.2, 0.6, 0.5, 0.4] }],
  ['Beryl', 'hexagonal', { hardness: 7.5, luster: 'vitreous', rarity: 'uncommon', color: [0.6, 0.85, 0.6, 0.3] }],
  ['Emerald', 'hexagonal', { hardness: 7.5, luster: 'vitreous', rarity: 'rare', color: [0.15, 0.6, 0.25, 0.4] }],
  ['Aquamarine', 'hexagonal', { hardness: 7.5, luster: 'vitreous', rarity: 'rare', color: [0.4, 0.7, 0.85, 0.25] }],
  ['Quartz', 'trigonal', { hardness: 7, luster: 'vitreous', rarity: 'common', color: [0.9, 0.9, 0.92, 0.15] }],
  ['Amethyst', 'trigonal', { hardness: 7, luster: 'vitreous', rarity: 'uncommon', color: [0.55, 0.25, 0.65, 0.35] }],
  ['Corundum', 'trigonal', { hardness: 9, luster: 'adamantine', rarity: 'rare', color: [0.6, 0.6, 0.7, 0.4] }],
  ['Ruby', 'trigonal', { hardness: 9, luster: 'adamantine', rarity: 'legendary', color: [0.7, 0.05, 0.1, 0.5] }],
  ['Sapphire', 'trigonal', { hardness: 9, luster: 'adamantine', rarity: 'legendary', color: [0.1, 0.15, 0.65, 0.4] }],
  ['Gypsum', 'monoclinic', { hardness: 2, luster: 'vitreous', rarity: 'common', color: [0.95, 0.93, 0.9, 0.3] }],
  ['Malachite', 'monoclinic', { hardness: 3.5, luster: 'silky', rarity: 'uncommon', color: [0.1, 0.55, 0.3, 0.9] }],
  ['Moonstone', 'monoclinic', { hardness: 6, luster: 'pearly', rarity: 'uncommon', color: [0.85, 0.85, 0.9, 0.4] }],
  ['Jade', 'monoclinic', { hardness: 6.5, luster: 'waxy', rarity: 'rare', color: [0.2, 0.55, 0.25, 0.8] }],
  ['Kunzite', 'monoclinic', { hardness: 7, luster: 'vitreous', rarity: 'rare', color: [0.8, 0.5, 0.7, 0.25] }],
  ['Labradorite', 'triclinic', { hardness: 6, luster: 'vitreous', rarity: 'uncommon', color: [0.35, 0.4, 0.5, 0.6] }],
  ['Turquoise', 'triclinic', { hardness: 5.5, luster: 'waxy', rarity: 'uncommon', color: [0.2, 0.65, 0.65, 0.9] }],
  ['Kyanite', 'triclinic', { hardness: 5.5, luster: 'vitreous', rarity: 'uncommon', color: [0.25, 0.35, 0.7, 0.5] }],
  ['Larimar', 'triclinic', { hardness: 5, luster: 'silky', rarity: 'rare', color: [0.45, 0.7, 0.85, 0.6] }],
  ['Alexandrite', 'triclinic', { hardness: 8.5, luster: 'vitreous', rarity: 'legendary', color: [0.2, 0.5, 0.3, 0.4] }],
];

export const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
export const TIER_RARITY = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY_COLOR = { common: '#8a9b92', uncommon: '#5aa845', rare: '#5aa9d8', legendary: '#f0c860' };
const RARITY_WEIGHT = { common: 50, uncommon: 30, rare: 16, legendary: 4 };

const fnv = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// build a gem instance from a pool row (+ optional overrides for grown crystals)
function gemFrom(row, uid, over = {}) {
  const [mineral, system, p] = row;
  const rarity = over.rarity || p.rarity, tier = RARITY_TIER[rarity];
  return { uid, mineral: over.mineral || mineral, system, hardness: over.hardness ?? p.hardness, luster: p.luster, rarity, tier, color: over.color || p.color };
}

export const cssOf = (color) => { const [r, g, b, a] = color; return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.max(0.55, a)})`; };
export const gemGlyph = (gem) => (CRYSTAL_SYSTEMS[gem.system] || CRYSTAL_SYSTEMS.cubic).icon;

// ── THE PULL — gacha a gem. Deterministic from (worldSeed, benchKey, pullIndex). ──
export function rollGem(worldSeed, benchKey, pullIndex) {
  const rng = mulberry(fnv('gem:' + (worldSeed >>> 0) + ':' + benchKey + ':' + pullIndex));
  const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
  let r = rng() * total, rarity = 'common';
  for (const [k, w] of Object.entries(RARITY_WEIGHT)) { if ((r -= w) < 0) { rarity = k; break; } }
  const pool = GEM_POOL.filter((row) => row[2].rarity === rarity);
  const row = pool[Math.floor(rng() * pool.length)] || GEM_POOL[0];
  return gemFrom(row, 'g' + fnv(benchKey + ':' + pullIndex).toString(36));
}

// ── CRYSTALLOGRAPHY → COMBAT. The gem's properties become a stat bonus vector. ──
const SYSTEM_WEIGHTS = {
  cubic:        { atk: 0.34, def: 0.33, hp: 0.33 },
  tetragonal:   { def: 0.8, hp: 0.2 },
  orthorhombic: { hp: 0.8, def: 0.2 },
  hexagonal:    { atk: 0.8, def: 0.2 },
  trigonal:     { atk: 0.6, flux: 0.4 },
  monoclinic:   { flux: 0.8, hp: 0.2 },
  triclinic:    { atk: 0.25, def: 0.25, hp: 0.25, flux: 0.25 },
};
const LUSTER_BOOST = { adamantine: 'atk', metallic: 'def', vitreous: 'flux', pearly: 'hp', silky: 'hp', waxy: 'hp', resinous: 'hp', earthy: 'hp' };
const STAT_SCALE = { atk: 2, def: 2, hp: 6, flux: 3 };

export function gemBonus(gem) {
  if (!gem) return { atk: 0, def: 0, hp: 0, flux: 0 };
  const mag = (0.4 + (gem.hardness / 10) * 0.6) * (1 + (gem.tier || 0) * 0.5);   // hardness + rarity set the size
  const w = SYSTEM_WEIGHTS[gem.system] || SYSTEM_WEIGHTS.cubic;
  const boost = LUSTER_BOOST[gem.luster];                                          // the lustre tilts one stat
  const out = { atk: 0, def: 0, hp: 0, flux: 0 };
  for (const k of Object.keys(out)) {
    const tilt = (boost === k) ? 1.3 : 1;
    out[k] = Math.round(mag * (w[k] || 0) * STAT_SCALE[k] * tilt);
  }
  // a gem always does *something* in its dominant stat
  const dom = Object.keys(w).reduce((a, b) => (w[b] > (w[a] || 0) ? b : a), 'atk');
  if (out[dom] < 1) out[dom] = 1;
  return out;
}
export const sumBonus = (gems) => (gems || []).reduce((acc, g) => { const b = gemBonus(g); for (const k in acc) acc[k] += b[k]; return acc; }, { atk: 0, def: 0, hp: 0, flux: 0 });

// how many gems an item can hold — better gear, more sockets (1..3). `worth` ∈ 0..1.
export function socketCap(item) { const w = (item && typeof item.worth === 'number') ? item.worth : 0.3; return Math.max(1, Math.min(3, 1 + Math.floor(w * 2.6))); }

// ── EPITAXIAL GROWTH — combine 3 gems of ONE lattice into a bigger crystal (rarity+1, capped by what
//    that system offers). Same lattice grows true; the new crystal blends their colour + gains hardness. ──
export function canGrow(gems) {
  if (!gems || gems.length !== 3) return { ok: false, reason: 'pick exactly 3 gems' };
  const sys = gems[0].system;
  if (!gems.every((g) => g.system === sys)) return { ok: false, reason: 'all 3 must share a crystal system (same lattice)' };
  return { ok: true };
}
export function growGems(gems) {
  const chk = canGrow(gems); if (!chk.ok) return chk;
  const sys = gems[0].system;
  const maxTier = Math.max(...gems.map((g) => g.tier));
  const sysTiers = GEM_POOL.filter((r) => r[1] === sys).map((r) => RARITY_TIER[r[2].rarity]);
  const ceil = Math.max(...sysTiers);
  const tier = Math.min(ceil, maxTier + 1);
  const rarity = TIER_RARITY[tier];
  const candidates = GEM_POOL.filter((r) => r[1] === sys && RARITY_TIER[r[2].rarity] === tier);
  const row = candidates[0] || GEM_POOL.filter((r) => r[1] === sys).sort((a, b) => RARITY_TIER[b[2].rarity] - RARITY_TIER[a[2].rarity])[0];
  const color = [0, 1, 2, 3].map((i) => gems.reduce((s, g) => s + g.color[i], 0) / 3);   // blended hue
  const hardness = Math.min(10, gems.reduce((s, g) => s + g.hardness, 0) / 3 + 0.7);
  const uid = 'g' + fnv(gems.map((g) => g.uid).join('+')).toString(36);
  return { ok: true, gem: gemFrom(row, uid, { rarity, color, hardness, mineral: row[0] }), grewTo: rarity, sys };
}
