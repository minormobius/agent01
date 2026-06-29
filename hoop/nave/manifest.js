// nave/manifest.js — the CONTENT-SLOT MANIFEST for floor 1 (the nave).
//
// The distribution machinery already exists (story/engine.js: a feature is anonymous geometry until first
// touch, then `interact()` deals ONE tier-legal pool item onto its stable feature_key and freezes it). This
// module describes the SLOTS that machinery will fill on the nave, so hoopy can author the pools:
//   • every room is a FEATURE — a place content binds to. Its ROLE is the dispatcher tag, its FACTION the
//     flavour tag, the role's TIER the band to author at (ROLES[role].tier ⇒ revelation/power tier).
//   • the six EXCLUSIVE rooms (one per lobe) are the lobe ANCHORS — the natural quest-giver / principal seat.
//   • floor 1 is no-baddies, so NO creature pools are needed here.
//
// `naveManifest(seed)` is the exact slot list for ONE world (feature_keys the engine binds). `slotProfile`
// averages the structure over many seeds — the GUARANTEED floors + the typical depth — which is what hoopy
// authors against. Pure; node-tested in test/manifest.selftest.mjs.

import { buildNave, FACTIONS, BIOMES } from './nave.js';
import { ROLES } from '../v099/econ/econ.js';

// the content TYPES a room of each role can host, beyond the always-present resident NPC. (Items at the
// productive trades, lore where it's studied/sacred/ruled.) Floor 1 hosts no creatures.
const LORE = new Set(['worship', 'learn', 'govern']);
const ITEM = new Set(['trade', 'store', 'make', 'mend']);
export function contentTypesFor(role, exclusive) {
  const t = ['npc'];
  if (LORE.has(role)) t.push('lore_fragment');
  if (ITEM.has(role)) t.push('item');
  if (exclusive) t.push('plot_beat');   // the lobe anchor — the quest hook
  return t;
}

// the stable feature_key the story engine binds content to, within ONE world (seed). Chunk + room ordinal
// — deterministic from the seed, atproto-stable, the nave's stand-in for a postal chamber address.
export const featureKey = (chunkId, roomId) => `nave:c${chunkId}:r${roomId}`;

// the exact slot list for ONE world.
export function naveManifest(seed) {
  const nave = buildNave(seed);
  const chunks = nave.world.chunks.map((ch, ci) => {
    const m = nave.meta[ci];
    const rooms = ch.rooms.map((r, ri) => ({
      key: featureKey(ci, ri), role: r.role, glyph: r.glyph || (ROLES[r.role] || {}).glyph || '·',
      tier: (ROLES[r.role] || {}).tier || 1, faction: m.faction, exclusive: r.role === m.exclusive,
      contentTypes: contentTypesFor(r.role, r.role === m.exclusive),
    }));
    return { id: ci, key: m.key, label: m.label, faction: m.faction, exclusive: m.exclusive, rooms };
  });
  const totalRooms = chunks.reduce((a, c) => a + c.rooms.length, 0);
  return { seed: nave.seed, chunks, totalRooms };
}

// the structure averaged over many seeds: the GUARANTEED floors (role-floor + commons completeness, always
// present) and the TYPICAL per-(faction,role) slot depth — what hoopy authors pool variety against.
export function slotProfile({ seeds = 16 } = {}) {
  // faction → role → summed count (for averaging); commons handled as faction 'commons'
  const sum = {};            // sum[factionKey][role] = total over seeds
  const add = (f, role) => { (sum[f] = sum[f] || {})[role] = (sum[f][role] || 0) + 1; };
  for (let s = 1; s <= seeds; s++) {
    const man = naveManifest(s);
    for (const ch of man.chunks) { const f = ch.faction || 'commons'; for (const r of ch.rooms) add(f, r.role); }
  }
  const avg = {};            // avg[factionKey][role] = mean count/world
  for (const f of Object.keys(sum)) { avg[f] = {}; for (const role of Object.keys(sum[f])) avg[f][role] = +(sum[f][role] / seeds).toFixed(1); }

  // GUARANTEED floors — independent of seed. Commons: ≥1 of every role. Each faction ward: dwell + its two
  // shared roles + its one exclusive (the v2 roleFloors); the two wards of a faction cover both exclusives.
  const guaranteed = { commons: Object.keys(ROLES).slice(), factions: {} };
  for (const [fk, f] of Object.entries(FACTIONS)) {
    const wards = BIOMES.filter((b) => b.faction === fk).map((b) => ({ exclusive: b.exclusive, level: b.level, floors: ['dwell', ...f.shared, b.exclusive] }));
    guaranteed.factions[fk] = { shared: f.shared, exclusives: f.exclusives, wards };
  }

  // POOL REQUIREMENTS — the actionable list: every (role, tier) tag that appears, which factions use it,
  // its expected slot depth/world, and the content types to author. This is the authoring checklist.
  const roleFactions = {};   // role → Set(factionKey incl 'commons')
  const roleSlots = {};      // role → mean slots/world across the whole nave
  for (const f of Object.keys(avg)) for (const role of Object.keys(avg[f])) {
    (roleFactions[role] = roleFactions[role] || new Set()).add(f);
    roleSlots[role] = +((roleSlots[role] || 0) + avg[f][role]).toFixed(1);
  }
  const pools = Object.keys(roleSlots).sort((a, b) => (ROLES[a].tier - ROLES[b].tier) || (roleSlots[b] - roleSlots[a])).map((role) => ({
    tag: role, tier: (ROLES[role] || {}).tier || 1, glyph: (ROLES[role] || {}).glyph || '·',
    factions: [...roleFactions[role]], avgSlotsPerWorld: roleSlots[role],
    contentTypes: contentTypesFor(role, false), anchor: Object.values(FACTIONS).some((f) => f.exclusives.includes(role)),
  }));

  return { seeds, guaranteed, distribution: avg, pools, noCreatures: true };
}
