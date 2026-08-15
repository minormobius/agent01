// gacha.js — the TRADE half of the trade↔grow↔dwell triangle. Pure, no DOM. A trade desk is bound to ONE
// biome (a viability-scored, closeable food web from food/biomes.json); you spend ◈ coins to PULL seeds
// from that biome's crop pool. Collecting every crop CLOSES the biome. Determinism is load-bearing: a pull
// is seeded from (worldSeed, biomeId, pullIndex), so a reloaded/atproto save re-rolls the exact same draw.

export const TIER_FOIL = { Legendary: '#f0c860', Epic: '#b07be0', Rare: '#5aa9d8', Uncommon: '#62b87a', Common: '#8a9b92' };
export const PULL_COST = 12;        // ◈ per pull (the first pull at each biome is free — handled by the caller)
const NEW_BIAS = 4;                 // unowned crops pull this much likelier, so a collection actually converges
const SEEDS_NEW = 3, SEEDS_DUPE = 2;

export const biomeList = (ark) => (ark && ark.biomes) || [];
export const biomeById = (ark, id) => biomeList(ark).find((b) => b.id === id) || null;
// a trade desk deterministically owns one biome, by a stable key hash → index.
export function biomeForKey(ark, key) {
  const bs = biomeList(ark); if (!bs.length) return null;
  let h = 2166136261; for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return bs[(h >>> 0) % bs.length];
}

// collection progress for a biome given the set of owned crop ids (array or Set).
export function progress(biome, owned) {
  const set = owned instanceof Set ? owned : new Set(owned || []);
  const have = (biome.crops || []).filter((c) => set.has(c.id)).length;
  const total = (biome.crops || []).length;
  return { have, total, complete: total > 0 && have >= total, pct: total ? have / total : 0 };
}

// deterministic per-pull RNG: mulberry32 seeded from world + biome + pull index.
export function pullRng(worldSeed, biomeId, pullIndex) {
  let h = (worldSeed >>> 0) ^ 0x9e3779b9;
  for (const ch of String(biomeId) + ':' + pullIndex) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 7), 1 | t); t ^= t + Math.imul(t ^ (t >>> 13), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one pull from `biome`'s pool, weighted by crop rarity × new-bias. Returns the crop, whether it's new to
// the collection, and how many seeds it grants (new crops a little more). Pure — `rng` supplies randomness.
export function pull(biome, owned, rng) {
  const crops = (biome && biome.crops) || []; if (!crops.length) return null;
  const set = owned instanceof Set ? owned : new Set(owned || []);
  const weights = crops.map((c) => (c.weight || 10) * (set.has(c.id) ? 1 : NEW_BIAS));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = (rng ? rng() : Math.random()) * sum, i = 0;
  while (i < crops.length - 1 && (r -= weights[i]) > 0) i++;
  const crop = crops[i], isNew = !set.has(crop.id);
  return { crop, isNew, seeds: isNew ? SEEDS_NEW : SEEDS_DUPE };
}
