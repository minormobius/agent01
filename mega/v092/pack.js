// pack.js — the player's starting PACK: a deterministic handful of genomed items.
//
// Items come from the shared item-genome engine (../sprite/item). The pack is seeded off the world
// seed so a given world hands you a consistent opening kit; later the lore engine, world drops, and
// combat spoils will push/splice items into this same array and the cylinder re-tiles. A pack is just
// `item[]` — no extra wrapper — so anything that can `rollItem`/`splice` can contribute to it.

import { rollItem, rollHoard, hoardWithTech, DEFAULT_HOARD } from '../sprite/item/genome.js';

// xmur3-ish: turn (seed, salt) into a stable 32-bit roll index
function mix(seed, salt) { let h = Math.imul((seed >>> 0) ^ 0x9e3779b1, 2654435761) ^ Math.imul(salt + 1, 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }

// A starting pack leans utilitarian + low-tech (salvage era): a blade, a light, a hold-vessel, a charm…
// We bias the hoard a touch primitive so the opening kit reads as scavenged, then roll `n` from it.
// If `kit` (an item kingdom — a character's vocation kit) is given, that kingdom is over-represented,
// so a Wright opens with craft tools, a Warden with wards, etc. — wiring character → inventory.
export function startingPack(seed = 7, n = 9, kit = null) {
  let hoard = hoardWithTech(rollHoard(mix(seed, 99)), 0.34, 0.18);
  if (kit) {
    const km = { ...hoard.kingdomMix };
    const other = Object.entries(km).reduce((s, [k, w]) => s + (k === kit ? 0 : w), 0);
    km[kit] = other * 1.15;                        // the vocation's kingdom ≈ half the opening kit
    hoard = { ...hoard, kingdomMix: km };
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(rollItem(mix(seed, i * 131 + 7), hoard));
  return out;
}

// The pack a freshly-embarked character starts with: kit-biased and seeded off the character.
export function packForCharacter(character, n = 9) {
  return startingPack(character?.seed || 7, n, character?.kit || null);
}

// Drop one item into a pack (combat spoil / world find). Returns the new length.
export function addToPack(pack, item) { pack.push(item); return pack.length; }

export default startingPack;
