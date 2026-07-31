// pack.js — the player's starting PACK: a deterministic handful of genomed items.
//
// Items come from the shared item-genome engine (./sprite/item). The pack is seeded off the world
// seed so a given world hands you a consistent opening kit; later the lore engine, world drops, and
// combat spoils will push/splice items into this same array and the cylinder re-tiles. A pack is just
// `item[]` — no extra wrapper — so anything that can `rollItem`/`splice` can contribute to it.

import { rollItem, rollHoard, hoardWithTech, assemble, DEFAULT_HOARD } from './sprite/item/genome.js';
import { xmur3 } from './sprite/item/prng.js';

// xmur3-ish: turn (seed, salt) into a stable 32-bit roll index
function mix(seed, salt) { let h = Math.imul((seed >>> 0) ^ 0x9e3779b1, 2654435761) ^ Math.imul(salt + 1, 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
const hashStr = (s) => xmur3(String(s == null ? '' : s))() >>> 0;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// This is a generation ship, not a smithy: the pack leans HIGH-TECH (the item engine's tech gene is the
// "sci-fi slider" — at fine-works/ship-grade eras the species names + sprite cues read sci-fi, e.g. a
// Vibroblade / Carapace / Dataslate instead of a Sword / Breastplate / Codex). techMean 0.74 keeps the
// kit firmly techno while the spread still turns up the odd scavenged primitive.
// If `kit` (an item kingdom — a character's vocation kit) is given, that kingdom is over-represented,
// so a Wright opens with craft tools, a Warden with wards, etc. — wiring character → inventory.
export function startingPack(seed = 7, n = 9, kit = null) {
  let hoard = hoardWithTech(rollHoard(mix(seed, 99)), 0.8, 0.13);
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

// ── KEYS — minted access tokens (the `key` phylum, loot:false so they never roll as random loot). ──
// A key IS a real genomed item (so the Voronoi cylinder + sprite engine render it via the `key`
// primitive — toothed key at low tech, eye-stamped wafer at high tech), but it's hand-minted with a
// quest-supplied name/description rather than rolled. `lore` carries the flavour for the detail card.
export function mintKey({ name = 'Key', description = '', tech = 0.85, material = null, seed = 0, tags = [] } = {}) {
  const t = clamp01(tech);
  const genes = { durability: 0.55, potency: 0.2, mass: 0.08, value: 0.55, tech: t, ornament: 0.4, complexity: 0.3, provenance: 0.65 };
  const mat = material || (t >= 0.5 ? 'alloy' : 'iron');
  const item = assemble({ kingdom: 'hold', phylum: 'key', species: 'Key', material: mat, genes }, { seed: seed >>> 0, n: seed >>> 0, special: 'key' });
  if (name) item.name = name;
  item.lore = description || item.headline;
  item.tags = (tags || []).map((x) => String(x).toLowerCase());
  return item;
}

// ── BRIDGE — a story-engine content item (an NPC's `give_items` grant) → a pack item. ──
// Keys/access tokens mint a key; everything else becomes a seeded genome item that carries the
// story name + description as `lore` (the seam the lore engine will widen). `ci` is a flattened
// pool content row: { id, type, tags, content:{ name, description } }.
export function itemFromGrant(ci) {
  if (!ci) return null;
  const c = ci.content || {}, tags = (ci.tags || []).map((t) => String(t).toLowerCase());
  const seed = hashStr(ci.id || c.name);
  if (tags.some((t) => ['key', 'keycard', 'access', 'hatch', 'keeper'].includes(t)))
    return mintKey({ name: c.name, description: c.description, tech: tags.includes('keycard') || tags.includes('access') ? 0.88 : 0.4, seed, tags });
  const it = rollItem(seed);
  if (c.name) it.name = c.name;
  it.lore = c.description || it.headline;
  it.tags = tags;
  return it;
}

export default startingPack;
