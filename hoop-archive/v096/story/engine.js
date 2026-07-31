// hoop/story/engine.js — the INFERENCE-FREE story hot path, ported to JS.
//
// A faithful port of hoop-backend's pure player verbs (the "no LLM in the hot path" core):
//   state_gate.meets_state · dispatcher.dispatch · placement.interact (crystallize/recall) ·
//   inventory take/drop · equipment equip/derive_stats · dialogue talk/choose · power-tier leveling.
// Every function here is deterministic and calls NO model — the offline lanes (pregen/tier-labeling/
// world-evolution) are someone else's job; this is only what a player touch triggers.
//
// THE KEYSTONE (INTEGRATION.md §1): a feature is anonymous geometry until first touch; on first touch
// `interact()` pulls ONE pool item via the tier-gated dispatcher and FREEZES the binding on a stable
// `feature_key`. Every later touch recalls the same item, forever. hoop's chamber address (js/postal.js)
// IS that feature_key — infinite, deterministic, atproto-stable — so this engine drops straight onto the
// ship once its world.features are chamber addresses instead of the hand-authored station below.
//
// The engine is storage-agnostic: it talks to a small `store` interface. `MemoryStore` (here) backs the
// node selftests + a client-only demo with zero backend; a D1-backed store (later) implements the same
// methods in the Worker, and nothing above the store changes. No inference, no Date.now in any branch
// that decides WHAT crystallizes — dispatch orders candidates deterministically (by id), so the same
// (player-state, feature) always yields the same item.

// ── leveling: power_tier is a pure step function of XP (placement.py) ──
export const POWER_THRESHOLDS = [0, 30, 80, 150, 250];   // index i ⇒ min XP for power_tier i+1
export const XP_BASE = 10, XP_PER_REVELATION = 5;
export function powerTierForXp(xp) { let t = 1; for (let i = 0; i < POWER_THRESHOLDS.length; i++) if (xp >= POWER_THRESHOLDS[i]) t = i + 1; return t; }

// EXPLORATION leveling: revelation_tier (how much of the WORLD you understand) advances from encounter-XP
// as a FLOOR, so wandering reveals higher-tier world content — "know 2/5 things ⇒ get 1–2 tier stuff."
// NOTE: narrative_tier is NO LONGER on this floor — that axis is the STORY SPINE, driven by hoopybot
// (story/hoopy.js): you advance it by learning enough of the right things and reporting to your guide.
// Same step function as power for the revelation floor.
export const exploreTierForXp = powerTierForXp;

// ── the gate: does pre-loaded state satisfy a `requires` blob? (state_gate.meets_state) ──
// REPUTATION GATING IS IGNORED (hoopy's note: "completely ignore reputation gating, it's not working
// very well"). `min_rep` is intentionally NOT checked here, and `min_standing` is skipped in npcVisible
// below. Only facts + items still gate (story progress, not reputation). REP_PREFIX stays exported
// because dialogue effects (choose) may still ADJUST rep as flavour — it just never blocks anything.
export const REP_PREFIX = 'rep.';
export function meetsState(state, requires) {
  if (!requires) return true;
  const facts = state.facts || {};
  for (const [k, expected] of Object.entries(requires.facts || {})) if (facts[k] !== expected) return false;
  const items = state.items;   // a Set of lowercased names+tags the player carries
  for (const tok of (requires.items || [])) if (!items.has(String(tok).toLowerCase())) return false;
  return true;   // min_rep deliberately not enforced
}
// Everything meetsState needs, loaded once so a candidate list filters without re-querying.
export function loadGateState(store, playerId) {
  const facts = store.getFacts(playerId);
  const items = new Set();
  for (const row of store.listInventoryRows(playerId)) {
    const ci = store.contentById(row.content_item_id); if (!ci) continue;
    if (ci.content && ci.content.name) items.add(ci.content.name.toLowerCase());
    for (const t of (ci.tags || [])) items.add(String(t).toLowerCase());
  }
  return { facts, items };
}

// ── dispatch: pick approved, unseen, tier-legal, gate-passing content, varied by tags (dispatcher.py) ──
// Variety greedily maximizes new tags per pick (dispatcher.select_with_variety). Candidate order is
// deterministic (the store returns by id) — no random(), so the keystone stays reproducible.
export function selectWithVariety(candidates, n) {
  const pool = candidates.slice(), out = [], seen = new Set();
  while (pool.length && out.length < n) {
    let bi = 0, bn = -1;
    for (let i = 0; i < pool.length; i++) { let g = 0; for (const t of (pool[i].tags || [])) if (!seen.has(t)) g++; if (g > bn) { bn = g; bi = i; } }
    const pick = pool.splice(bi, 1)[0]; out.push(pick); for (const t of (pick.tags || [])) seen.add(t);
  }
  return out;
}
export function dispatch(store, playerId, contentType, n = 1, opts = {}) {
  const p = store.getPlayerState(playerId);
  const seen = new Set(p.seen_ids || []);
  let candidates = store.queryContent({ type: contentType, revTier: p.revelation_tier, narTier: p.narrative_tier, powTier: p.power_tier })
    .filter((c) => !seen.has(c.id));
  const gstate = loadGateState(store, playerId);
  candidates = candidates.filter((c) => meetsState(gstate, c.requires || {}));
  // THE ROLE→TAG BRIDGE: when a feature carries a tag (a resident's econ role, a building's domain),
  // prefer pool content authored for it. Graceful: if nothing matches the tag we fall back to the
  // whole tier-legal set, so an unmapped role still gets *a* figure rather than silence.
  if (opts.tag) { const tagged = candidates.filter((c) => (c.tags || []).includes(opts.tag)); if (tagged.length) candidates = tagged; }
  const selected = selectWithVariety(candidates, n);
  for (const item of selected) store.markSeen(playerId, item.id);
  return selected;
}

// ── crystallize / recall: the keystone binding (placement.interact) ──
function renderItem(ci) {
  const c = ci.content || {};
  return { content_item_id: ci.id, type: ci.type, name: c.name || null,
           description: c.description || c.response || '', revelation_tier: ci.revelation_tier, tags: ci.tags || [] };
}
function bindAndLevel(store, playerId, featureKey, item) {
  store.bindPlacement(playerId, featureKey, item.id);
  const gain = XP_BASE + XP_PER_REVELATION * ((item.revelation_tier || 1) - 1);
  const p = store.getPlayerState(playerId);
  const xp = (p.xp || 0) + gain, before = p.power_tier, after = powerTierForXp(xp);
  store.setPlayerXp(playerId, xp, after);
  // exploration floor lifts REVELATION only (never lowers). narrative_tier is hoopybot's (story/hoopy.js).
  const et = exploreTierForXp(xp);
  const revFrom = p.revelation_tier;
  if (et > revFrom) store.setPlayerTier(playerId, 'revelation_tier', et);
  const out = { xp, xp_gain: gain, power_tier: after, revelation_tier: Math.max(revFrom, et) };
  if (after > before) out.leveled = { from: before, to: after };
  if (et > revFrom) out.revelation_up = { from: revFrom, to: et };
  return out;
}
export function interact(store, playerId, featureKey, context = '', opts = {}) {
  const feature = store.featureByKey(featureKey);
  if (!feature) return { feature_key: featureKey, status: 'unknown_feature', item: null };
  const tag = opts.tag || feature.tag || null;            // a live resident/building feature carries its role/domain as the bridge tag

  const existing = store.getPlacement(playerId, featureKey);
  if (existing) {                                            // RECALL — same item, forever
    const count = existing.interaction_count;               // snapshot before the bump mutates it
    store.bumpPlacement(playerId, featureKey);
    const ci = store.contentById(existing.content_item_id);
    return { feature_key: featureKey, label: feature.label, status: 'recalled',
             interaction_count: count + 1, retired: !ci || ci.status !== 'active', item: ci ? renderItem(ci) : null };
  }
  if (feature.content_id) {                                  // AUTHORED placement: a hand-crafted scene PINS a specific content_item (vs procedural dispatch).
    const ci = store.contentById(feature.content_id);        // The opening chunk needs Olo at the cradle, Sevin at the margin — not a tier-legal roll.
    if (ci && ci.approved && ci.status === 'active') {        // Missing/retired pin falls through to dispatch (graceful — same discipline as recall of a retired item).
      store.markSeen(playerId, ci.id);
      const leveled = bindAndLevel(store, playerId, featureKey, ci);
      return { feature_key: featureKey, label: feature.label, status: 'crystallized', item: renderItem(ci), leveled };
    }
  }
  const items = dispatch(store, playerId, feature.type, 1, { tag });   // FIRST TOUCH — crystallize (role/domain-biased)
  if (!items.length) return { feature_key: featureKey, label: feature.label, status: 'withheld', content_type: feature.type, item: null };
  const item = items[0], leveled = bindAndLevel(store, playerId, featureKey, item);
  return { feature_key: featureKey, label: feature.label, status: 'crystallized', item: renderItem(item), leveled };
}
export function listPlacements(store, playerId) { return store.listPlacements(playerId); }

// ── inventory (inventory.py) ──
export function take(store, playerId, contentItemId, qty = 1) { return store.addInventory(playerId, contentItemId, qty); }
export function listInventory(store, playerId) {
  return store.listInventoryRows(playerId).map((row) => {
    const ci = store.contentById(row.content_item_id) || {}, c = ci.content || {};
    return { id: row.id, qty: row.qty, content_item_id: row.content_item_id, type: ci.type,
             name: c.name, description: c.description, mechanics: c.mechanics || null, equipped_slot: store.equippedSlotOf(playerId, row.id) };
  });
}
export function drop(store, playerId, inventoryId) { return store.dropInventory(playerId, inventoryId); }

// ── equipment + derived stats (equipment.py) ──
export const BASE_HP = 20, BASE_ATK = 2, BASE_DEF = 1;
export function deriveStats(store, playerId) {
  const p = store.getPlayerState(playerId);
  let hp = BASE_HP + 5 * (p.power_tier - 1), atk = BASE_ATK + (p.power_tier - 1), def = BASE_DEF;
  for (const { slot, inventory_id } of store.equippedRows(playerId)) {
    const row = store.inventoryRow(playerId, inventory_id); if (!row) continue;
    const ci = store.contentById(row.content_item_id); const st = (ci && ci.content && ci.content.mechanics && ci.content.mechanics.stats) || {};
    hp += (+st.hp || 0); atk += (+st.atk || 0); def += (+st.def || 0);
  }
  const hpCur = p.hp_current == null ? hp : p.hp_current;
  store.setPlayerHp(playerId, hp, hpCur);
  return { hp_max: hp, hp_current: hpCur, atk, def };
}
export function equip(store, playerId, inventoryId) {
  const row = store.inventoryRow(playerId, inventoryId); if (!row) return { error: 'not in inventory' };
  const ci = store.contentById(row.content_item_id) || {}, mech = (ci.content && ci.content.mechanics) || {};
  if (!mech.slot) return { error: `'${ci.content && ci.content.name}' is not equippable (no slot)` };
  store.setEquip(playerId, mech.slot, inventoryId);
  return { ok: true, slot: mech.slot, name: ci.content.name, stats: deriveStats(store, playerId) };
}
export function unequip(store, playerId, slot) { store.unequip(playerId, slot); return { ok: true, slot, stats: deriveStats(store, playerId) }; }

// ── dialogue trees (dialogue.py) — gated choices + effects, per-(player,NPC) memory ──
function npcVisible(gstate, npcState, choice) {
  const req = choice.requires || {};
  if (!meetsState(gstate, req)) return false;
  // min_standing (reputation) intentionally IGNORED — see meetsState. A choice gated only on standing
  // is always shown, so hoopy's dialogue trees read in full without the rep economy behind them.
  for (const [k, v] of Object.entries(req.npc_flags || {})) if ((npcState.flags || {})[k] !== v) return false;
  return true;
}
// state-gated ENTRY: a tree may declare `entries: [{when, node}]` — when the player is at the start/an
// entry node (not mid-branch), talk opens at the LAST entry whose `when` the state satisfies, so a keystone
// NPC greets differently as the story advances instead of repeating its intro. No entries → plain start.
function entryNode(tree, st, gstate, start) {
  const cur = st.current_node || start, entries = tree.entries;
  if (!entries || !entries.length) return cur;
  const entrySet = new Set(entries.map((e) => e.node));
  if (cur && cur !== start && !entrySet.has(cur)) return cur;   // deep in a branch → stay put
  let pick = start;
  for (const e of entries) if (meetsState(gstate, e.when || {})) pick = e.node;
  return pick;
}
export function talk(store, playerId, npcContentId) {
  const npc = store.contentById(npcContentId);
  if (!npc || npc.type !== 'npc') return { error: 'not an npc' };
  const name = (npc.content || {}).name, tree = (npc.content || {}).dialogue;
  if (!tree || !tree.nodes) return { npc: name, says: (npc.content || {}).description || 'They regard you in silence.', choices: [], no_tree: true };
  const start = tree.start || Object.keys(tree.nodes)[0];
  const st = store.getNpcState(playerId, npcContentId, start);
  const gstate = loadGateState(store, playerId);
  const nodeId = entryNode(tree, st, gstate, start), node = tree.nodes[nodeId] || tree.nodes[start];
  const choices = (node.choices || []).filter((c) => npcVisible(gstate, st, c)).map((c) => ({ id: c.id, text: c.text }));
  return { npc: name, standing: st.standing, says: node.says || '', node: nodeId, choices };
}
export function choose(store, playerId, npcContentId, choiceId) {
  const npc = store.contentById(npcContentId);
  if (!npc || npc.type !== 'npc') return { error: 'not an npc' };
  const tree = (npc.content || {}).dialogue || {}, nodes = tree.nodes || {};
  const start = tree.start || Object.keys(nodes)[0];
  const st = store.getNpcState(playerId, npcContentId, start);
  const gstate = loadGateState(store, playerId);
  const node = nodes[entryNode(tree, st, gstate, start)] || {};
  const choice = (node.choices || []).find((c) => c.id === choiceId && npcVisible(gstate, st, c));
  if (!choice) return { error: 'choice unavailable' };
  const eff = choice.effects || {};
  for (const [k, v] of Object.entries(eff.set_facts || {})) store.setFact(playerId, k, v);
  for (const [faction, n] of Object.entries(eff.adjust_rep || {})) store.incrFact(playerId, REP_PREFIX + faction, n);
  const flags = { ...(st.flags || {}), ...(eff.set_npc_flags || {}) };
  const given = [];
  for (const itemId of (eff.give_items || [])) { take(store, playerId, itemId); given.push(itemId); }
  const goto = eff.end ? start : (choice.goto || start);   // on end, reset to start so talk re-picks the state-gated entry next time
  store.setNpcState(playerId, npcContentId, { standing: st.standing + (eff.adjust_standing || 0), flags, current_node: goto });
  const result = talk(store, playerId, npcContentId);
  return { ...result, chose: choice.text, ended: !!eff.end, gave_items: given };
}

// Flatten the sectioned pool.json ({items,lore_fragments,npcs,creatures,plot_beats}) into one
// content array. Tolerant of extra `_note` keys. Each entry already carries its own `type`.
export function flattenPool(poolJson) {
  const out = [];
  for (const [k, v] of Object.entries(poolJson)) { if (k.startsWith('_') || !Array.isArray(v)) continue; for (const ci of v) out.push(ci); }
  return out;
}

// ── MemoryStore: zero-backend implementation of the store interface (selftests + client demo) ──
// A D1-backed store later implements these same methods with SQL; the engine above never changes.
export class MemoryStore {
  constructor(pool = [], world = { features: [] }) {
    this.content = new Map(); for (const ci of pool) this.content.set(ci.id, ci);
    // deterministic candidate order = insertion order of approved/active items, by id
    this._byType = new Map();
    for (const ci of pool) { if (!this._byType.has(ci.type)) this._byType.set(ci.type, []); this._byType.get(ci.type).push(ci); }
    this.features = new Map((world.features || []).map((f) => [f.key, f]));
    this.world = world;
    this.players = new Map(); this.facts = new Map(); this.placements = new Map();
    this.inv = new Map(); this.equip = new Map(); this.npc = new Map(); this._invSeq = 0;
  }
  // content
  contentById(id) { return this.content.get(id) || null; }
  queryContent({ type, revTier, narTier, powTier }) {
    return (this._byType.get(type) || []).filter((c) => c.approved && c.status === 'active' &&
      (c.revelation_tier || 1) <= revTier && (c.narrative_tier || 1) <= narTier && (c.power_tier || 1) <= powTier);
  }
  // player state
  getPlayerState(id) { let p = this.players.get(id); if (!p) { p = { id, revelation_tier: 1, narrative_tier: 1, power_tier: 1, xp: 0, seen_ids: [], hp_current: null, hp_max: null }; this.players.set(id, p); } return p; }
  markSeen(id, cid) { const p = this.getPlayerState(id); if (!p.seen_ids.includes(cid)) p.seen_ids.push(cid); }
  setPlayerXp(id, xp, powerTier) { const p = this.getPlayerState(id); p.xp = xp; p.power_tier = powerTier; }
  setPlayerTier(id, axis, value) { if (axis !== 'revelation_tier' && axis !== 'narrative_tier') return; const p = this.getPlayerState(id); p[axis] = value; }   // advance.js: deterministic milestone advancement (a D1/repo store implements the same setter)
  setPlayerHp(id, hpMax, hpCur) { const p = this.getPlayerState(id); p.hp_max = hpMax; p.hp_current = hpCur; }
  // facts
  _f(id) { let m = this.facts.get(id); if (!m) { m = new Map(); this.facts.set(id, m); } return m; }
  getFacts(id) { return Object.fromEntries(this._f(id)); }
  getFact(id, key, dflt = null) { const m = this._f(id); return m.has(key) ? m.get(key) : dflt; }
  setFact(id, key, value) { this._f(id).set(key, value); }
  incrFact(id, key, by = 1) { const v = (+this.getFact(id, key, 0) || 0) + by; this.setFact(id, key, v); return v; }
  // placements
  _p(id) { let m = this.placements.get(id); if (!m) { m = new Map(); this.placements.set(id, m); } return m; }
  getPlacement(id, key) { return this._p(id).get(key) || null; }
  bindPlacement(id, key, cid) { this._p(id).set(key, { content_item_id: cid, interaction_count: 1, first_seen: this._p(id).size }); }
  bumpPlacement(id, key) { const r = this._p(id).get(key); if (r) r.interaction_count++; }
  listPlacements(id) {
    return [...this._p(id).entries()].sort((a, b) => a[1].first_seen - b[1].first_seen).map(([key, r]) => {
      const ci = this.contentById(r.content_item_id) || {}, c = ci.content || {};
      return { feature_key: key, content_item_id: r.content_item_id, type: ci.type, name: c.name, description: c.description || c.response || '', tags: ci.tags || [], revelation_tier: ci.revelation_tier, interaction_count: r.interaction_count };
    });
  }
  featureByKey(key) { return this.features.get(key) || null; }
  addFeature(f) { this.features.set(f.key, f); return f; }   // register a live hoop feature (resident chamber / building) before interact
  addContent(ci) {   // fold a generated content_item into the live pool so dispatch/crystallize can see it (v096 generation lane)
    if (!ci || ci.id == null) return null;
    this.content.set(ci.id, ci);
    if (!this._byType.has(ci.type)) this._byType.set(ci.type, []);
    const arr = this._byType.get(ci.type); if (!arr.some((c) => c.id === ci.id)) arr.push(ci);
    return ci;
  }
  // inventory
  _inv(id) { let a = this.inv.get(id); if (!a) { a = []; this.inv.set(id, a); } return a; }
  addInventory(id, cid, qty = 1) { const row = { id: ++this._invSeq, content_item_id: cid, qty }; this._inv(id).push(row); return row; }
  listInventoryRows(id) { return this._inv(id).slice(); }
  inventoryRow(id, invId) { return this._inv(id).find((r) => r.id === invId) || null; }
  dropInventory(id, invId) { const a = this._inv(id), i = a.findIndex((r) => r.id === invId); if (i < 0) return false; a.splice(i, 1); for (const [s, v] of this._eq(id)) if (v === invId) this._eq(id).delete(s); return true; }
  // equipment
  _eq(id) { let m = this.equip.get(id); if (!m) { m = new Map(); this.equip.set(id, m); } return m; }
  setEquip(id, slot, invId) { this._eq(id).set(slot, invId); }
  unequip(id, slot) { this._eq(id).delete(slot); }
  equippedRows(id) { return [...this._eq(id).entries()].map(([slot, inventory_id]) => ({ slot, inventory_id })); }
  equippedSlotOf(id, invId) { for (const [s, v] of this._eq(id)) if (v === invId) return s; return null; }
  // npc memory
  _np(id) { let m = this.npc.get(id); if (!m) { m = new Map(); this.npc.set(id, m); } return m; }
  getNpcState(id, npcId, start) { const m = this._np(id); let s = m.get(npcId); if (!s) { s = { standing: 0, flags: {}, current_node: start }; m.set(npcId, s); } return s; }
  setNpcState(id, npcId, s) { this._np(id).set(npcId, { ...this.getNpcState(id, npcId, s.current_node), ...s }); }

  // ── persistence: a JSON snapshot of PLAYER state only (content + features are the world, reloaded
  // fresh). Backend-agnostic — localStorage now, a DuckDB-WASM or D1 store later, same shape. The
  // proto is meant to be nukeable: drop the snapshot and a fresh store rebuilds from the pool. ──
  snapshot() {
    const mm = (m) => [...m.entries()].map(([k, v]) => [k, [...v.entries()]]);   // Map(id → Map) → entries
    return { v: 1, invSeq: this._invSeq, players: [...this.players.entries()],
             facts: mm(this.facts), placements: mm(this.placements), equip: mm(this.equip), npc: mm(this.npc),
             inv: [...this.inv.entries()] };
  }
  restore(s) {
    if (!s || s.v !== 1) return this;
    this._invSeq = s.invSeq || 0;
    this.players = new Map(s.players || []);
    const rm = (arr) => new Map((arr || []).map(([k, v]) => [k, new Map(v)]));
    this.facts = rm(s.facts); this.placements = rm(s.placements); this.equip = rm(s.equip); this.npc = rm(s.npc);
    this.inv = new Map(s.inv || []);
    return this;
  }
}
