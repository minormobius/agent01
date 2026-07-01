// encounter.js — CREEPS: the hazard-room foes of the in-world combat layer. Pure + seeded, so a given
// room always holds the same creep until you slay it (and the slain set rides the save). Creeps aren't a
// hand-authored bestiary — they're rolled hostile crew (the arena's model), armed through the same
// pack/equip pipeline as the player, then scaled by deck depth so the ship gets meaner as you go.

import { rollCharacter, deriveCombat } from '../stats.js';
import { packForCharacter } from '../pack.js';
import { autoEquip, defaultPlan } from '../bodyplan.js';
// Creep SPRITES are, for now, restricted to two types: the humanoid rolled-crew scrapper, and the
// BEE SWARM (v3/swarm.js, vendored from the Sprite Lab's bee kernel). A creep is still rolled hostile
// CREW for stats/loot — only its sprite changes. The other body plans (poly/quad/axial/isopod) stay
// vendored in v3/ but are OFF the roster until they're polished — re-add them to BEASTS to bring back.
import { buildSwarmGenome } from '../v3/swarm.js';
import { gradeEncounter } from './solver.js';   // the solvability oracle — certify a fight is winnable-but-not-trivial

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
  swarm: { build: buildSwarmGenome, fam: null, names: ['Sting-cloud', 'Hive-scatter', 'Drone-swarm', 'Wrath-of-bees'], glyph: '✸' },
};
// the roster: mostly humanoid scrappers, with bee swarms mixed in.
export const CREEP_PLANS = ['humanoid', 'humanoid', 'swarm'];
// build a beast genome for `plan` from `fseed` — pick a family preset (if the plan has them); tag _plan+seed.
function beastGenome(plan, fseed, deck) {
  const B = BEASTS[plan]; if (!B) return null;
  const keys = B.fam ? Object.keys(B.fam) : [], key = keys.length ? keys[(fseed >>> 4) % keys.length] : plan;
  const genes = { ...((B.fam && B.fam[key]) || {}) };
  if ((deck | 0) >= 2 && typeof genes.chassis === 'number') genes.chassis = Math.max(genes.chassis, 0.7);   // the deep rind turns them steel
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
  // SWARM MOVESET — a bee swarm plays nothing like a humanoid bruiser: fragile, flux-rich, and it fights
  // with AREA — BLAST (engulf a whole cluster) when foes bunch, else LANCE from range, else sting. `kit`
  // overrides the universal set (engine.skillsFor reads it); `ai:'swarm'` (engine aiPlan) picks blast vs
  // lance by how clustered the targets are; `mods` gives it the flux + apow to cast and thins its guard.
  const swarm = plan === 'swarm'
    ? { kit: ['strike', 'lance', 'blast'], ai: 'swarm', body: 'swarm', footprint: 1.9, mods: { stat: { flux: 18, apow: 5, def: -1, hp: -4 }, passive: { fluxRegen: 3 } } }
    : {};
  // a humanoid creep may be a PERSON MORPH: normal · robot (grey/red-eye) · wraith (pale-blue). Deterministic.
  const morph = plan === 'humanoid' ? [null, null, 'robot', 'wraith'][(fseed >>> 14) % 4] : null;
  const morphName = morph === 'robot' ? 'Sentinel-' + (fseed % 90 + 9) : morph === 'wraith' ? 'Wraith' : name;
  return {
    id: 1, name: morph ? morphName : name, character, combat, weapon: eq.mainhand,
    // sprite: humanoid → {seed, role, morph} (index.html mints a crew sprite); beast → {plan, genome} (prebuilt)
    sprite: beast ? { seed: beast.genome.seed, plan, family: beast.family, genome: beast.genome } : { seed: 'foe' + fseed, role: vocation, morph },
    glyph, accent: '#cf3b3b', level, vocation, plan, morph, ...swarm,
  };
}

// a PACK of creeps for a hazard room — the in-world fights are now MULTI-OPPONENT. Returns 1–3 foes
// (deeper decks bring more), deterministic. The LEAD (index 0) is the room's canonical creep — its id
// tracks the cleared flag + the map glyph; the extras are seeded off the room so they vary (a humanoid
// might be flanked by a bee swarm). Ids are unique (1..n) as createBattle expects.
// Fights are 1..3 foes. The solver now COUNTS the player's summon (solver.js), which evens the action
// economy enough that most 3-foe fights certify; the rest fall back to a safe scale-down. Deeper decks
// bias toward larger packs AND scale per-foe stats.
export const MAX_PACK = 3;
export function creepPack(worldSeed, chunkId, room, deck = 0) {
  const pseed = fnv('pack:' + (worldSeed >>> 0) + ':' + chunkId + ':' + room);
  const n = 1 + ((pseed >>> 20) % 2) + ((deck | 0) >= 2 && (pseed >>> 22) % 2 ? 1 : 0);   // 1..3 (deck ≥2 can add a third)
  const pack = [];
  for (let i = 0; i < n; i++) {
    const cr = creepFor(worldSeed, chunkId, i === 0 ? room : room + ':m' + i, deck);   // extras get a sub-room seed
    cr.id = i + 1;
    pack.push(cr);
  }
  return pack;
}

// scale a pack's foe combat blocks by `k` (bounded) — the knob the difficulty tuner turns.
function scalePack(pack, k) {
  return pack.map((f) => ({ ...f, combat: { ...f.combat,
    hp: Math.max(6, Math.round(f.combat.hp * k)),
    atk: Math.max(2, Math.round(f.combat.atk * k)),
    apow: Math.max(2, Math.round((f.combat.apow || f.combat.atk) * k)) } }));
}
// THE SOLVER GATE — tune a pack so the fight is PROVABLY winnable but not trivial for THIS player. The
// oracle (solver.js) plays the deterministic AI and certifies "can the player, played well, win?"; we
// binary-search a stat scalar toward a comfortable/fair/tight grade. Bounded iterations + node cap keep it
// cheap at battle-open; an inconclusive ('unknown', hit the cap) grade ships the pack as-is (never a false
// unwinnable). Returns { foes, tier, par, margin }.
// a solvable fight (winnable, even if barely) is acceptable — a solo hero outnumbered SHOULD sweat.
const WINNABLE = new Set(['comfortable', 'fair', 'tight', 'brutal']);
export function certifyPack(player, basePack, { seed = 1, W = 14, H = 10, cap = 16000, tries = 3 } = {}) {
  const n = basePack.length;
  // action-economy compensation: one hero vs a pack is lopsided, so start the foes weaker the more of them
  // there are — the first grade then usually lands winnable and we don't pay for a long search.
  const econ = n <= 1 ? 1.0 : n === 2 ? 0.62 : 0.46;
  let lo = 0.2, hi = econ * 1.5, k = econ, good = null, weakest = null;
  for (let i = 0; i < tries; i++) {
    const foes = scalePack(basePack, k);
    const g = gradeEncounter({ player, foes, seed, W, H }, { cap });
    const rec = { foes, tier: g.tier, par: g.par, margin: g.margin, k };
    if (!weakest || k < weakest.k) weakest = rec;                                       // the easiest fight we tried (safe fallback)
    if (WINNABLE.has(g.tier)) { good = rec; break; }                                    // provably winnable → ship it
    if (g.tier === 'trivial') { lo = k; k = (k + hi) / 2; }                             // too easy → stronger
    else { hi = k; k = (lo + k) / 2; }                                                  // impossible/unknown → weaker (bias SAFE: never ship an unwinnable fight)
  }
  return good || weakest || { foes: basePack, tier: 'unknown', par: -1, margin: 0 };
}

// loot dropped on a win: a seed for rollItem (so index.html mints the genome item) + a coin bounty.
export function spoilsFor(worldSeed, chunkId, room, deck = 0) {
  const fseed = fnv('loot:' + (worldSeed >>> 0) + ':' + chunkId + ':' + room);
  return { itemSeed: fseed, coins: 6 + (deck | 0) * 4 + (fseed % 7) };
}
