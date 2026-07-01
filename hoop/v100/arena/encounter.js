// encounter.js — CREEPS: the hazard-room foes of the in-world combat layer. Pure + seeded, so a given
// room always holds the same creep until you slay it (and the slain set rides the save). Creeps aren't a
// hand-authored bestiary — they're rolled hostile crew (the arena's model), armed through the same
// pack/equip pipeline as the player, then scaled by deck depth so the ship gets meaner as you go.

import { rollCharacter, deriveCombat } from '../stats.js';
import { packForCharacter } from '../pack.js';
import { autoEquip, defaultPlan } from '../bodyplan.js';
// the non-humanoid BODY PLANS (vendored from the Sprite Lab, mega.mino.mobi/sprite): poly (ant/spider/
// crab), quad (hound/boar/bear), axial (worm/snake/eel), isopod (pill-bug/mech-pod). A creep is still
// rolled hostile CREW for stats/loot — only its SPRITE changes, so balance is untouched, the variety isn't.
import { buildPolyGenome, FAMILIES as POLY_FAM } from '../v3/poly.js';
import { buildQuadGenome, FAMILIES as QUAD_FAM } from '../v3/quad.js';
import { buildAxialGenome, FAMILIES as AXIAL_FAM } from '../v3/axial.js';
import { buildIsopodGenome, FAMILIES as ISOPOD_FAM } from '../v3/isopod.js';

// hazard roles: rooms with no friendly component fixture (holds + transit ducts), where scrappers lurk.
// (make/mend are deliberately left out — they're reserved for the crafting/repair fixtures.)
export const CREEP_ROLES = ['store', 'move'];
export const isCreepRole = (role) => CREEP_ROLES.includes(role);

const FOE_NAMES = ['Raider', 'Sentry', 'Revenant', 'Picket', 'Scrapper', 'Warden-9', 'Husk', 'Stalker', 'Marauder', 'Wraith'];
const CREEP_VOCATIONS = ['make', 'move', 'govern', 'mend', 'serve'];   // sturdy/aggressive casts
const GLYPHS = ['☠', '⊗', '✖', '☣'];

const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
export const creepId = (chunkId, room) => 'cr' + chunkId + ':r' + room;

// ── THE BESTIARY: the body plan a creep wears. `humanoid` is the original rolled-crew scrapper; the four
//    beast plans each draw from the Sprite Lab kernel of the same name, choosing one FAMILY preset per foe
//    (a spider vs an ant, a hound vs a bear) and leaning MECHANICAL on the deep decks (chassis). The genome
//    is tagged `_plan` so the battle overlay knows which frame renderer to call, and given a stable `.seed`
//    so its sprite caches per-foe. Only the sprite changes — stats/loot stay the rolled-crew model. ──
const BEASTS = {
  poly:   { build: buildPolyGenome,   fam: POLY_FAM,   names: ['Skitterer', 'Chelae', 'Web-picket', 'Ironmite'],   glyph: '❉' },
  quad:   { build: buildQuadGenome,   fam: QUAD_FAM,   names: ['Maw-hound', 'Tusk-boar', 'Rend-bear', 'Chassis-hound'], glyph: '⊛' },
  axial:  { build: buildAxialGenome,  fam: AXIAL_FAM,  names: ['Rust-serpent', 'Duct-eel', 'Coil-wraith', 'Mechworm'], glyph: '∿' },
  isopod: { build: buildIsopodGenome, fam: ISOPOD_FAM, names: ['Carapace', 'Woodlouse-hulk', 'Deep-pod', 'Mech-pod'], glyph: '⬢' },
};
export const CREEP_PLANS = ['humanoid', 'poly', 'quad', 'axial', 'isopod'];
// build a beast genome for `plan` from `fseed` — pick a family preset, lean mech on deep decks; tag _plan+seed.
function beastGenome(plan, fseed, deck) {
  const B = BEASTS[plan]; if (!B) return null;
  const keys = Object.keys(B.fam), key = keys[(fseed >>> 4) % keys.length];
  const genes = { ...(B.fam[key] || {}) };
  if ((deck | 0) >= 2 && 'chassis' in genes === false) genes.chassis = 0.7;   // the deep rind turns them steel
  else if ((deck | 0) >= 2 && typeof genes.chassis === 'number') genes.chassis = Math.max(genes.chassis, 0.7);
  const g = B.build('foe' + fseed + ':' + plan, genes);
  g._plan = plan; g.seed = 'foe' + fseed + ':' + plan; g._family = key;
  return { genome: g, family: key };
}

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
  // pick a body plan (deterministic); humanoid keeps the crew sprite, a beast carries its own genome.
  const plan = CREEP_PLANS[(fseed >>> 8) % CREEP_PLANS.length];
  const beast = plan === 'humanoid' ? null : beastGenome(plan, fseed, deck);
  const name = beast ? BEASTS[plan].names[(fseed >>> 12) % BEASTS[plan].names.length] : FOE_NAMES[fseed % FOE_NAMES.length];
  const glyph = beast ? BEASTS[plan].glyph : GLYPHS[(fseed >>> 3) % GLYPHS.length];
  return {
    id: 1, name, character, combat, weapon: eq.mainhand,
    // sprite: humanoid → {seed, role} (index.html mints a crew sprite); beast → {plan, genome} (prebuilt)
    sprite: beast ? { seed: beast.genome.seed, plan, family: beast.family, genome: beast.genome } : { seed: 'foe' + fseed, role: vocation },
    glyph, accent: '#cf3b3b', level, vocation, plan,
  };
}

// loot dropped on a win: a seed for rollItem (so index.html mints the genome item) + a coin bounty.
export function spoilsFor(worldSeed, chunkId, room, deck = 0) {
  const fseed = fnv('loot:' + (worldSeed >>> 0) + ':' + chunkId + ':' + room);
  return { itemSeed: fseed, coins: 6 + (deck | 0) * 4 + (fseed % 7) };
}
