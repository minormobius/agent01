// tree.js — the TECH TREE. Per-faction, 5 tiers, branching with exclusive decisions at T3/T5.
//
// Progression model (v1): in-run / roguelike. A hero owns a set of node ids and a pool of skill
// POINTS (earned from streak wins); buying a node spends points. Tiers gate by depth (you must own a
// node one tier shallower), and at T3/T5 the two branches are MUTUALLY EXCLUSIVE — pick Berserker OR
// Reaver, never both. The data is source-agnostic: the same `owned` set could later come from ATProto
// (persistent narrative) or items, instead of in-run points — only `earnPoints` changes.
//
// A node GRANTS one of: a verb (adds a skill to the kit), a stat delta (hp/atk/apow/def/flux/speed),
// or a passive delta (the same keys factions.js passives use). `buildLoadout(faction, owned)` folds the
// owned nodes into { kit, mods:{stat,passive} } that the engine applies per-unit (makeUnit + passiveOf).
//
// Pure + zero-dep, node-testable.

// node: { id, tier, cost, branch?, req:[ids], label, gloss, grant }
//   grant: { verb } | { stat:{...} } | { passive:{...} } | { summon:true }  (summon is the verb 'summon')
const V = (id, tier, label, verb, gloss, extra = {}) => ({ id, tier, cost: extra.cost ?? (tier <= 1 ? 0 : tier >= 4 ? 2 : 1), grant: { verb }, label, gloss, req: extra.req || [], branch: extra.branch });
const S = (id, tier, label, stat, gloss, extra = {}) => ({ id, tier, cost: extra.cost ?? (tier >= 4 ? 2 : 1), grant: { stat }, label, gloss, req: extra.req || [], branch: extra.branch });
const P = (id, tier, label, passive, gloss, extra = {}) => ({ id, tier, cost: extra.cost ?? (tier >= 4 ? 2 : 1), grant: { passive }, label, gloss, req: extra.req || [], branch: extra.branch });

export const TREES = {
  continuant: [
    // FLESH — vitality & resilience (the continuants: bleed for power, regen, fight harder hurt).
    V('c.strike', 1, 'Strike', 'strike', 'a plain blow'),
    V('c.brace', 1, 'Brace', 'brace', 'guard and answer'),
    V('c.gore', 2, 'Gore', 'gore', 'bleed for power', { req: ['c.strike'] }),
    V('c.adrenal', 2, 'Adrenal', 'adrenal', 'spend life for Flux', { req: ['c.strike'] }),
    P('c.hide', 2, 'Thick Hide', { regenPerTurn: 0.03 }, 'knits faster between blows', { req: ['c.brace'] }),
    V('c.summon', 4, 'Hound', 'summon', 'call a fast salvaged beast', { req: ['c.gore'] }),
    // ── Path · Berserker (the more hurt, the harder) ──
    P('c.bloodlust', 3, 'Berserker ▸ Bloodlust', { berserkMax: 0.2 }, 'rage climbs higher as you fall', { branch: 'A', req: ['c.gore'] }),
    S('c.brutality', 4, 'Berserker ▸ Brutality', { atk: 3 }, 'heavier hands — +Atk', { branch: 'A', req: ['c.bloodlust'] }),
    S('c.juggernaut', 5, 'Berserker ▸ Juggernaut', { hp: 14, atk: 2 }, 'an avalanche of meat', { branch: 'A', req: ['c.brutality'] }),
    // ── Path · Reaver (sustain & salvage) ──
    V('c.scavenge', 3, 'Reaver ▸ Scavenge', 'scavenge', 'a deep self-repair', { branch: 'B', req: ['c.adrenal'] }),
    P('c.regen', 4, 'Reaver ▸ Mending', { regenPerTurn: 0.05 }, 'the hull gives back faster', { branch: 'B', req: ['c.scavenge'] }),
    S('c.warlord', 5, 'Reaver ▸ Warlord', { hp: 18, flux: 6 }, 'endless and well-fed', { branch: 'B', req: ['c.regen'] }),
  ],
  drift: [
    V('d.strike', 1, 'Strike', 'strike', 'a plain blow'),
    V('d.flit', 1, 'Flit', 'flit', 'slip free without a counter'),
    V('d.lance', 2, 'Lance', 'lance', 'a bolt of anima from range', { req: ['d.strike'] }),
    V('d.feint', 2, 'Feint', 'feint', 'open their guard', { req: ['d.flit'] }),
    S('d.focus', 2, 'Focus', { apow: 3 }, 'sharper anima — +Apow', { req: ['d.strike'] }),
    V('d.summon', 4, 'Echo', 'summon', 'call a lancing decoy', { req: ['d.lance'] }),
    // ── Path · Artillery (range & area) ──
    V('d.blast', 3, 'Artillery ▸ Blast', 'blast', 'detonate anima over an area', { branch: 'A', req: ['d.lance'] }),
    S('d.barrage', 4, 'Artillery ▸ Barrage', { apow: 4 }, 'overwhelming fire — +Apow', { branch: 'A', req: ['d.blast'] }),
    P('d.zephyr', 5, 'Artillery ▸ Zephyr', { fluxRegen: 2 }, 'never let the guns go cold', { branch: 'A', req: ['d.barrage'] }),
    // ── Path · Trickster (tempo & theft) ──
    V('d.siphon', 3, 'Trickster ▸ Siphon', 'siphon', 'drain a foe\'s Flux into your own', { branch: 'B', req: ['d.feint'] }),
    P('d.mercury', 4, 'Trickster ▸ Mercury', { moveBonus: 1, hitAndRunCrit: 0.1 }, 'faster, deadlier on the move', { branch: 'B', req: ['d.siphon'] }),
    P('d.phantom', 5, 'Trickster ▸ Phantom', { hitAndRunCrit: 0.18 }, 'a blur — vicious hit-and-run', { branch: 'B', req: ['d.mercury'] }),
  ],
  rindwalker: [
    // CHASSIS — attrition & control (the makers: hold the hull, brace, pin, outlast, restore).
    V('r.strike', 1, 'Strike', 'strike', 'a plain blow'),
    V('r.brace', 1, 'Brace', 'brace', 'guard and answer'),
    V('r.rivet', 2, 'Rivet', 'rivet', 'pin a foe to the deck', { req: ['r.brace'] }),
    V('r.mend', 2, 'Mend', 'mend', 'close your wounds', { req: ['r.brace'] }),
    P('r.reservoir', 2, 'Reservoir', { fluxRegen: 1 }, 'a deeper core — +1 Flux/turn', { req: ['r.strike'] }),
    V('r.summon', 4, 'Sentry', 'summon', 'call a stout blocker drone', { req: ['r.mend'] }),
    // ── Path · Warden (hold the line) ──
    V('r.bulwark', 3, 'Warden ▸ Bulwark', 'bulwark', 'become a redoubt — heavy +Def & counter', { branch: 'A', req: ['r.rivet'] }),
    P('r.redoubt', 4, 'Warden ▸ Redoubt', { bracedDefBonus: 3 }, 'tougher still while you hold station', { branch: 'A', req: ['r.bulwark'] }),
    S('r.bastion', 5, 'Warden ▸ Bastion', { hp: 16, def: 3 }, 'a walking bulkhead', { branch: 'A', req: ['r.redoubt'] }),
    // ── Path · Steward (sustain the party) ──
    V('r.revive', 3, 'Steward ▸ Revive', 'revive', 'raise a downed ally', { branch: 'B', req: ['r.mend'] }),
    V('r.assist', 4, 'Steward ▸ Assist', 'assist', 'hand an ally an extra turn', { branch: 'B', req: ['r.revive'] }),
    P('r.wellspring', 5, 'Steward ▸ Wellspring', { fluxRegen: 2 }, 'the core never runs dry', { branch: 'B', req: ['r.assist'] }),
  ],
};

export const nodeById = (faction, id) => (TREES[faction] || []).find((n) => n.id === id);
export const startingNodes = (faction) => (TREES[faction] || []).filter((n) => n.tier === 1).map((n) => n.id);
const ownedBranch = (faction, owned) => { for (const id of owned) { const n = nodeById(faction, id); if (n && n.branch) return n.branch; } return null; };

// can this hero buy `id` now? (not owned · points · reqs · tier-depth gate · branch not locked)
export function canBuy(faction, owned, points, id) {
  const n = nodeById(faction, id); if (!n) return false;
  const have = owned instanceof Set ? owned : new Set(owned);
  if (have.has(id)) return false;
  if (points < n.cost) return false;
  if (!n.req.every((r) => have.has(r))) return false;
  if (n.tier > 1 && !(TREES[faction] || []).some((m) => m.tier === n.tier - 1 && have.has(m.id))) return false;   // depth gate
  if (n.branch) { const b = ownedBranch(faction, have); if (b && b !== n.branch) return false; }                  // exclusive decision
  return true;
}

// fold owned nodes → the loadout the engine applies: { kit, mods:{stat,passive} }.
export function buildLoadout(faction, owned) {
  const have = owned instanceof Set ? owned : new Set(owned);
  const kit = [], stat = {}, passive = {};
  for (const n of (TREES[faction] || [])) {
    if (!have.has(n.id)) continue;
    if (n.grant.verb) { if (!kit.includes(n.grant.verb)) kit.push(n.grant.verb); }
    if (n.grant.stat) for (const k in n.grant.stat) stat[k] = (stat[k] || 0) + n.grant.stat[k];
    if (n.grant.passive) for (const k in n.grant.passive) passive[k] = (passive[k] || 0) + n.grant.passive[k];
  }
  if (!kit.includes('strike')) kit.push('strike');   // never end up unarmed
  return { kit, mods: { stat, passive } };
}

const TREE = { TREES, nodeById, startingNodes, canBuy, buildLoadout };
if (typeof globalThis !== 'undefined') globalThis.MEGA_TREE = TREE;
export default TREE;
