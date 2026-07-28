// encounter.js — CREEPS: the hazard-room foes of the in-world combat layer. Pure + seeded, so a given
// room always holds the same creep until you slay it (and the slain set rides the save). Creeps aren't a
// hand-authored bestiary — they're rolled hostile crew (the arena's model), armed through the same
// pack/equip pipeline as the player, then scaled by deck depth so the ship gets meaner as you go.

import { rollCharacter, deriveCombat } from '../stats.js';
import { packForCharacter } from '../pack.js';
import { autoEquip, defaultPlan } from '../bodyplan.js';

// hazard roles: rooms with no friendly component fixture (holds + transit ducts), where scrappers lurk.
// (make/mend are deliberately left out — they're reserved for the crafting/repair fixtures.)
export const CREEP_ROLES = ['store', 'move'];
export const isCreepRole = (role) => CREEP_ROLES.includes(role);

const FOE_NAMES = ['Raider', 'Sentry', 'Revenant', 'Picket', 'Scrapper', 'Warden-9', 'Husk', 'Stalker', 'Marauder', 'Wraith'];
const CREEP_VOCATIONS = ['make', 'move', 'govern', 'mend', 'serve'];   // sturdy/aggressive casts
const GLYPHS = ['☠', '⊗', '✖', '☣'];

const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
export const creepId = (chunkId, room) => 'cr' + chunkId + ':r' + room;

// the deterministic creep that haunts (chunkId, room) at `deck` depth. Returns a foe spec the arena
// engine's createBattle() accepts (id/name/character/combat/sprite), plus a map glyph + level.
export function creepFor(worldSeed, chunkId, room, deck = 0) {
  const fseed = fnv((worldSeed >>> 0) + ':' + chunkId + ':' + room);
  const vocation = CREEP_VOCATIONS[fseed % CREEP_VOCATIONS.length];
  const character = rollCharacter(fseed, { vocation });
  const eq = autoEquip(defaultPlan(), packForCharacter(character, 7));            // creeps are crew too — armed/armoured
  const combat = deriveCombat(character, { weapon: eq.mainhand, armour: eq.body || eq.offhand });
  const level = 1 + (deck | 0);
  combat.hp = Math.round(combat.hp * (1 + (deck | 0) * 0.15));                    // deeper decks bite harder
  combat.atk = Math.round(combat.atk * (1 + (deck | 0) * 0.1));
  return {
    id: 1, name: FOE_NAMES[fseed % FOE_NAMES.length], character, combat, weapon: eq.mainhand,
    sprite: { seed: 'foe' + fseed, role: vocation }, glyph: GLYPHS[(fseed >> 3) % GLYPHS.length],
    accent: '#cf3b3b', level, vocation,
  };
}

// loot dropped on a win: a seed for rollItem (so index.html mints the genome item) + a coin bounty.
export function spoilsFor(worldSeed, chunkId, room, deck = 0) {
  const fseed = fnv('loot:' + (worldSeed >>> 0) + ':' + chunkId + ':' + room);
  return { itemSeed: fseed, coins: 6 + (deck | 0) * 4 + (fseed % 7) };
}
