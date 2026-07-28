// shop.js — the WARES market at the trade desk. The combat loop drops loot into your pack; the shop is
// where that loot (and coins) become gear you choose. Pure + seeded: a desk's shelf is deterministic
// from (worldSeed, deskKey, restockEpoch), so it's identical on every machine and restocks on a clock
// (the garden day — sleeping brings fresh stock). Prices ride each item's own `stats.value` ("worth in
// trade"), scaled into the coin economy (combat spoils are single/double digits, so are prices).

import { rollItem } from './sprite/item/genome.js';

const fnv = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const PRICE_K = 0.1;   // value 240 (treasure) → ~24 coins · value 80 (midden) → ~8
export function buyPrice(item) { const v = (item && item.stats && item.stats.value) || 0; return Math.max(2, Math.round(v * PRICE_K)); }
export function sellPrice(item) { return Math.max(1, Math.round(buyPrice(item) * 0.5)); }   // shops buy low

// the shelf for one desk this epoch: n deterministic items, each with its buy price.
export function shopStock(worldSeed, deskKey, epoch, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = fnv('shop:' + (worldSeed >>> 0) + ':' + deskKey + ':' + epoch + ':' + i);
    const item = rollItem(s);
    out.push({ slot: i, seed: s, item, price: buyPrice(item) });
  }
  return out;
}

export const SHOP_SIZE = 6;
