// hoop/story/import.js — the WORLD-EXPORT NORMALIZER. Pure, no DOM, no LLM.
//
// hoopy's authoring tool emits a `world_export` (a content_pool of his entity records + a story_bible).
// This maps each record onto the engine's content_item shape so his content is FIRST-CLASS: it flows
// through review.js/gates.js/validate.js, the filter projection, putContent, and the engine unchanged —
// and the generation lane emits the same shape, so authored + generated content are interchangeable.
//
// The mapping is small + explicit (his encoding differs only in surface):
//   • string tiers "r1"/"n1"/"p3" → integers, on the AXIS_MAP below (r→revelation, n→narrative, p→power)
//   • flat {name,description,dialogue} → content:{…}      • status approved/pending → approved + active/…
//   • requires as gate-strings ["flag.x=True"] OR his {flag,item} object → {facts,items,min_rep}
//   • refs / revelation_hint / produces / rumor's source — carried first-class (great signal for spine + gates)
// rumor is a first-class type here, in KNOWN_TYPES (review.js), and in the lexicon enum.

// His three prefixed axes → our three engine axes. ONE place to flip if hoopy's intent differs (the r/n/p
// prefixes read as revelation/narrative/plot; "plot" is the surfacing/progression axis = our power_tier).
export const AXIS_MAP = { power_tier: 'revelation_tier', narrative_tier: 'narrative_tier', plot_tier: 'power_tier' };

export const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
export function parseTier(v) {                       // "r1" | "p5" | 3 | "3" → integer 1..5
  if (v == null) return 1;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 1;
}
const coerce = (v) => /^(true|false)$/i.test(v) ? /^true$/i.test(v) : (/^-?\d+$/.test(v) ? +v : v);

// requires → {facts, items, min_rep}. Accepts: an array of gate-strings ("flag.x=True", "item Name"),
// hoopy's documented object {flag:"x=True", item:"Name"}, or our native blob (passed through).
export function parseRequires(req) {
  if (!req) return {};
  if (req.facts || req.items || req.min_rep) return req;          // already native
  const facts = {}, items = [];
  const addStr = (g) => {
    const s = String(g).trim(); if (!s) return;
    const m = /^(.+?)\s*=\s*(.+)$/.exec(s);
    if (m) facts[m[1].trim()] = coerce(m[2].trim());
    else if (/^item[:\s]\s*/i.test(s)) items.push(s.replace(/^item[:\s]\s*/i, '').toLowerCase());
    else items.push(s.toLowerCase());                              // a bare token reads as a required item/tag
  };
  if (Array.isArray(req)) req.forEach(addStr);
  else { if (req.flag) addStr(req.flag); if (req.item) items.push(String(req.item).toLowerCase()); }
  const out = {};
  if (Object.keys(facts).length) out.facts = facts;
  if (items.length) out.items = items;
  return out;
}

// One record → one content_item (engine shape + carried provenance/metadata). provider/lane default to
// the authored spine; pass {provider, lane} to override (e.g. a player's imported personal canon).
//
// Handles BOTH of hoopy's export schemas, which differ only in surface:
//   • FLAT (older):   {name, description, dialogue, power_tier:"r1", narrative_tier:"n1", plot_tier:"p3"}
//                     — the r/n/p prefixes are remapped through AXIS_MAP (his "power"=our revelation, etc).
//   • NESTED (newer): {content:{name, description, dialogue, revelation_hint}, revelation_tier:1,
//                     narrative_tier:1, power_tier:1} — fields nested under content{}, tiers already integers
//                     on our own axis names (no AXIS_MAP remap). world_refs replaces refs.
export function importRecord(rec, { provider = 'hoopy-export', lane = 'spine' } = {}) {
  const C = rec.content && typeof rec.content === 'object' ? rec.content : null;   // newer schema nests under content{}
  const get = (k) => (C && C[k] != null ? C[k] : rec[k]);                          // prefer content.<k>, fall back to flat
  const name = get('name');
  const ci = {
    id: rec.id || slug(name),
    type: rec.type,
    // newer schema carries revelation/narrative/power directly; older one prefixes r/n/p (remap via AXIS_MAP)
    revelation_tier: parseTier(C ? rec.revelation_tier : (rec[invAxis('revelation_tier')] ?? rec.revelation_tier)),
    narrative_tier: parseTier(rec.narrative_tier),
    power_tier: parseTier(C ? rec.power_tier : (rec[invAxis('power_tier')] ?? rec.power_tier)),
    tags: rec.tags || [],
    approved: rec.approved != null ? !!rec.approved : (rec.status || 'approved') !== 'pending',
    status: rec.status === 'pending' ? 'active' : (rec.status === 'retired' ? 'retired' : 'active'),
    content: { name, description: get('description') || '' },
    lane, provider,
  };
  const dialogue = get('dialogue'); if (dialogue) ci.content.dialogue = dialogue;
  const mechanics = get('mechanics'); if (mechanics) ci.content.mechanics = mechanics;
  const conclusion = get('conclusion'); if (conclusion) ci.content.conclusion = conclusion;   // plot_beat's ending tree (conclusion.js) — carry it or endings vanish
  const requires = parseRequires(rec.requires);
  if (Object.keys(requires).length) ci.requires = requires;
  const refs = rec.world_refs || rec.refs; if (refs) ci.refs = refs;   // first-class cross-entity refs (spine signal)
  const hint = get('revelation_hint'); if (hint) ci.revelation_hint = hint;
  if (rec.produces) ci.produces = rec.produces;                   // declared producers (gates.js reachability)
  if (rec.source_npc) ci.source_npc = rec.source_npc;             // rumor provenance
  if (rec.spreads_via) ci.spreads_via = rec.spreads_via;
  if (rec.trigger_conditions) ci.trigger_conditions = rec.trigger_conditions;   // plot_beat
  return ci;
}
// invert AXIS_MAP: our engine axis → his source field name (so importRecord reads the right key)
function invAxis(engineAxis) { for (const [k, v] of Object.entries(AXIS_MAP)) if (v === engineAxis) return k; return engineAxis; }

// ── ROOM BUNDLES (hoopy's 2026-06 refactor) ──────────────────────────────────────────────────────────
// His newest export replaces the standalone npc/item/lore_fragment types with ONE bundled-per-room type,
// `room_bundle`, whose `content` nests a full NPC (name + voice + a branching `dialogue.nodes` tree) and a
// `lore` fragment, plus the room's zone/verb/faction/nave_faction. The engine consumes FLAT items, so a
// bundle is EXPLODED into the items it already understands: an `npc` (its dialogue tree is byte-compatible
// with engine.js's talk/choose) + a `lore_fragment`. The placement signal the rest of the game keys on —
// faction (the nave campaign + the upper-rind witness) and zone (the floor) — is lifted into `tags`:
// crucially `nave_faction` (the continuant/drift/rindwalker projection) is tagged even when `faction` is a
// Seven's-domain name (mars/venus/…), so chatter.js#factionOf resolves a rind bundle to its nave faction.
export function expandRoomBundle(rec, { provider = 'hoopy-export', lane = 'spine' } = {}) {
  const C = rec.content && typeof rec.content === 'object' ? rec.content : {};
  const npc = C.npc && typeof C.npc === 'object' ? C.npc : {};
  const tags = [...new Set([...(rec.tags || []), C.zone, C.faction, C.nave_faction, C.verb].filter(Boolean).map((t) => String(t).toLowerCase()))];
  const meta = {
    revelation_tier: parseTier(rec.revelation_tier), narrative_tier: parseTier(rec.narrative_tier), power_tier: parseTier(rec.power_tier),
    approved: rec.approved != null ? !!rec.approved : (rec.status || 'approved') !== 'pending',
    status: rec.status === 'pending' ? 'active' : (rec.status === 'retired' ? 'retired' : 'active'),
    lane, provider,
  };
  const requires = parseRequires(rec.requires); if (Object.keys(requires).length) meta.requires = requires;
  const refs = rec.world_refs || rec.refs; if (refs && refs.length) meta.refs = refs;
  if (rec.produces) meta.produces = rec.produces;
  // KEEP THE BUNDLE A UNIT: the npc + its lore share a `room` id (the bundle's id), and the npc carries its
  // lore's id. So when a principal is placed in a chamber, that chamber can bind to THIS principal's own lore
  // (the entry tripwire reveals the keeper's lore, not a random pool pick) — and the lore knows its keeper.
  const roomId = rec.id || slug(npc.name || C.name) || slug(C.name);
  const loreId = roomId + ':lore';
  const out = [];
  if (npc.name || npc.dialogue) {
    const c = { name: npc.name || C.name || 'someone', description: C.description || npc.voice || '' };
    if (npc.dialogue) c.dialogue = npc.dialogue;
    // a LOAD-BEARING anchor (Olo/Solen/Sevin/Luna) carries hoopy's {tier, gates} block + its zone/faction —
    // keep them on the served npc so anchors.js can derive the advancement chain from the served pool (the
    // explode otherwise drops them, leaving the chain empty). Harmless on ordinary keepers (no load_bearing).
    if (C.load_bearing && typeof C.load_bearing === 'object') c.load_bearing = C.load_bearing;
    if (C.zone) c.zone = C.zone;
    if (C.nave_faction) c.nave_faction = C.nave_faction;
    out.push({ id: roomId, type: 'npc', content: c, tags: tags.slice(), room: roomId, roomName: C.name || null, ...(C.lore ? { lore: loreId } : {}), verb: C.verb || null, ...meta });
  }
  if (C.lore) {
    // hoopy's 2026-06 model nests lore as an OBJECT {name, description} (not a bare string). Pull the prose out
    // — String(C.lore) on the object yielded the "[object Object]" the chamber was "speaking" — and prefer the
    // lore's OWN name (e.g. "The Fractured Guide-Rail") for the fragment's title.
    const L = (C.lore && typeof C.lore === 'object') ? C.lore : { description: String(C.lore || '') };
    const loreText = String(L.description || L.name || '');
    const loreName = L.name || (C.name ? C.name + ' — lore' : (npc.name ? npc.name + '’s ground' : 'a fragment'));
    out.push({ id: loreId, type: 'lore_fragment', room: roomId, npcId: roomId,
      content: { name: loreName, description: loreText },
      tags: tags.slice(), ...meta });
  }
  return out.length ? out : [importRecord(rec, { provider, lane })];   // never silently drop a bundle
}

// ── WANDERERS (hoopy's 2026-06 ambient layer) ────────────────────────────────────────────────────────
// A `wanderer` is an AMBIENT one-liner NPC: content.{line, name, verb, zone, faction, description}. It has a
// single authored `line`, not a branching tree. The engine talks to `npc`s via a dialogue.nodes tree, so we
// wrap the line as a ONE-NODE tree (greet, no choices) and mark `content.ambient` so the UI renders the light
// one-liner popup, not a principal's two-pane screen. zone/faction/verb lift into `tags` so placement
// (chatter.js#factionOf, the chamber spread, the deck-climb) keys on it exactly as it does a bundle's npc.
export function expandWanderer(rec, { provider = 'hoopy-export', lane = 'spine' } = {}) {
  const C = rec.content && typeof rec.content === 'object' ? rec.content : {};
  const tags = [...new Set([...(rec.tags || []), C.zone, C.faction, C.verb].filter(Boolean).map((t) => String(t).toLowerCase()))];
  const line = String(C.line || C.description || '').trim();
  const content = { name: C.name || 'a wanderer', description: C.description || line, ambient: true };
  if (line) content.dialogue = { start: 'greet', nodes: { greet: { says: line, choices: [] } } };
  const out = {
    id: rec.id || slug(C.name) || 'wanderer', type: 'npc', content, tags,
    revelation_tier: parseTier(rec.revelation_tier), narrative_tier: parseTier(rec.narrative_tier), power_tier: parseTier(rec.power_tier),
    approved: rec.approved != null ? !!rec.approved : (rec.status || 'approved') !== 'pending',
    status: rec.status === 'pending' ? 'active' : (rec.status === 'retired' ? 'retired' : 'active'),
    lane, provider,
  };
  const requires = parseRequires(rec.requires); if (Object.keys(requires).length) out.requires = requires;
  const refs = rec.world_refs || rec.refs; if (refs && refs.length) out.refs = refs;
  return [out];
}

// One source record → one OR MORE engine content_items. A room_bundle explodes (npc + lore); a wanderer maps
// to an ambient npc; everything else is a 1:1 importRecord. importWorldExport flat-maps this, so the rest of
// the pipeline is unchanged.
export function expandRecord(rec, opts = {}) {
  if (!rec) return [];
  if (rec.type === 'room_bundle') return expandRoomBundle(rec, opts);
  if (rec.type === 'wanderer') return expandWanderer(rec, opts);
  return [importRecord(rec, opts)];
}

// THE TOMBSTONE PREDICATE — the single source of truth for "this record is soft-deleted, never serve it."
// hoopy soft-deletes in place (the record STAYS in listRecords), so every read path MUST agree on what a
// tombstone looks like or a nuked record leaks back into the game (this is exactly the "flagging a retired
// NPC as level two" bug: the tooling gated a record hoopy had already tombstoned). We accept every
// convention seen or likely — the canonical `status:'retired'`, plus `tombstoned`/`deleted`, plus an
// explicit `tombstone:true` flag and a `deletedAt` timestamp — so a future tombstone form can't slip past.
const TOMBSTONE_STATUS = new Set(['retired', 'tombstoned', 'deleted']);
export function isTombstoned(ci) {
  if (!ci) return true;
  return TOMBSTONE_STATUS.has(ci.status) || ci.tombstone === true || ci.deleted === true || ci.deletedAt != null;
}

// ── STABLE ID DE-COLLISION (the Kaelen Voss soft-lock, systemic fix) ─────────────────────────────────
// hoopy's raw records frequently carry NO `id`, so every id-derivation below (importRecord line ~62,
// expandRoomBundle ~115, expandWanderer ~156) falls back to `slug(name)`. Distinct records with the same
// name then derive the SAME id and COLLIDE in the runtime store's `contentById` Map (last-write-wins) — so
// only one survives and the rest are silently shadowed. The load-bearing case: TWO "Kaelen Voss" room
// bundles ("The Rivet Chancel", tier-1, sets flag.commons.rindwalker_face; "The Fulcrum Cell", tier-2, sets
// flag.ward.rindwalker_known) both slug to `kaelen-voss`. The store keeps the tier-2 one, so talking to the
// tier-1 keeper never fires its gate — an unbreakable soft-lock. (Also ~181 empty-name records all slugged
// to '' and collapsed to a single entry.) gateSetters/requiredKeeperIds/the store all re-derive from
// servePool's output, so a STABLE unique id per record makes the quest oracle and the runtime store agree.
//
// The base id each record WOULD derive (mirrors the three fallbacks above). Explicit `rec.id` wins.
function baseIdOf(rec) {
  if (!rec) return '';
  if (rec.id) return rec.id;
  const C = rec.content && typeof rec.content === 'object' ? rec.content : null;
  if (rec.type === 'room_bundle') {
    const cc = C || {}; const npc = cc.npc && typeof cc.npc === 'object' ? cc.npc : {};
    return slug(npc.name || cc.name) || slug(cc.name);
  }
  if (rec.type === 'wanderer') { const cc = C || {}; return slug(cc.name) || 'wanderer'; }
  const name = C && C.name != null ? C.name : rec.name;
  return slug(name);
}
// A content fingerprint — the DISTINGUISHING fields, canonicalised so it doesn't depend on JSON key order
// (two records from the same atproto record fingerprint identically; two different records differ). The two
// Kaelens differ in zone / load_bearing.tier / dialogue, so they fingerprint apart.
function recFingerprint(rec) {
  const C = rec && rec.content && typeof rec.content === 'object' ? rec.content : (rec || {});
  const npc = C.npc && typeof C.npc === 'object' ? C.npc : {};
  return [
    rec && rec.type || '', C.name || (rec && rec.name) || '', npc.name || '',
    C.zone || '', C.faction || '', C.nave_faction || '', C.verb || '',
    typeof C.description === 'string' ? C.description : '',
    JSON.stringify(npc.dialogue || C.dialogue || ''),
    JSON.stringify(C.load_bearing || ''), JSON.stringify(C.lore || ''),
    String((rec && rec.narrative_tier) ?? ''), String((rec && rec.revelation_tier) ?? ''), String((rec && rec.power_tier) ?? ''),
  ].join('');
}
// a deterministic short hash (~40 bits, base36) — FNV-ish double-mix, no Math.random/Date (atproto-stable).
function shortHash(s) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0; }
  return (h1.toString(36) + h2.toString(36)).slice(0, 8);
}
// Assign a STABLE, ORDER-INDEPENDENT unique id to every record whose derived base id collides with another's.
// Each colliding record's suffix depends ONLY on its own content (its fingerprint hash), so the mapping is
// independent of pool order and of what else is in the pool — permalinks stay stable. Records with a unique
// base, or an explicit `rec.id` (authoritative — a real cross-ref target), are left untouched. Idempotent:
// an already-served pool has explicit ids, so nothing collides and nothing changes.
export function dedupeRawIds(items) {
  const list = items || [];
  const groups = new Map();
  for (let i = 0; i < list.length; i++) { const b = baseIdOf(list[i]); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(i); }
  const out = list.slice();
  for (const [base, idxs] of groups) {
    if (idxs.length < 2) continue;                 // a unique base — stable, leave it
    for (const i of idxs) {
      const rec = list[i];
      if (rec && rec.id) continue;                 // an explicit id is authoritative — never rewrite it
      out[i] = { ...rec, id: `${base || 'x'}-${shortHash(recFingerprint(rec))}` };
    }
  }
  return out;
}

// SERVING RULES for the LIVE service repo (the records `loadPool` reads back, already in engine field-shape:
// {id, type, content, tags, *_tier, status, …}). hoopy's 2026-06 model stores his RAW records there and
// SOFT-deletes by setting status:'retired' (a "nuke" tombstones in place — the records STAY in listRecords),
// so a clean served pool is:
//   1. DROP tombstones (isTombstoned — else a republish double-serves old + new, and stale/nuked content
//      leaks back into the gate, the oracle, and the game).
//   2. EXPLODE room_bundle → npc + lore_fragment   (the principals + their ground).
//   3. MAP wanderer → ambient npc                  (the authored crowd one-liners).
//   4. pass everything else through VERBATIM — it is already engine-shaped, and re-normalizing it through
//      importRecord would drop fields the records legitimately carry (e.g. plot_beat.conclusion, the ending
//      tree). The two raw types are the only ones the engine can't read directly.
// Pure; the same rules the engine, gates, and the filter projection all see. Idempotent on an already-served
// pool (no room_bundle/wanderer/tombstone left to transform).
export function servePool(items, opts = {}) {
  // drop tombstones FIRST (so a retired record can't force a live one to be renamed), then de-collide the
  // LIVE ids (the Kaelen fix) before exploding — so npc id, lore id (`<id>:lore`), and every cross-ref
  // derive from the deduped, unique base.
  const live = (items || []).filter((ci) => !isTombstoned(ci));
  const out = [];
  for (const ci of dedupeRawIds(live)) {
    if (ci.type === 'room_bundle') { out.push(...expandRoomBundle(ci, opts)); continue; }
    if (ci.type === 'wanderer') { out.push(...expandWanderer(ci, opts)); continue; }
    out.push(ci);
  }
  return out;
}

// THE RUNTIME/WORLD FLAG MANIFEST. hoopy's bible defines a flag system whose progression flags are set
// by the GAME (the opening, the descent, the storyboard's completes_when), NOT by any pool entity — so a
// pool-only reachability check would (correctly) call them orphans. They are the gates.js "assumed-
// satisfiable boundary" (the same allowance tiers get): produced outside the pool, by the runtime. The
// import path feeds these to the gate as externally-satisfied. As the storyboard grows to actually set
// them, they migrate from this manifest into real storyboard producers. (Both fact./flag. prefixes — his
// export mixes them.) Player-intrinsic items (the android's built-in apparatus) join WORLD_ITEMS.
export const WORLD_FACTS = [
  'flag.player_rebuilt', 'flag.android_modified',                                   // intrinsic from the opening
  'flag.curve_noticed', 'fact.curve_noticed', 'flag.lower_rind_entered', 'fact.lower_rind_entered',
  'flag.entered_lower_rind', 'flag.signal_resonance', 'flag.found_saturn_marking',  // the journey (storyboard/descent)
  'flag.rind_survey_completed', 'flag.met_signal_chamber',
  'flag.read_terminal', 'flag.heard_luna',   // set by openTerminal (the Tabard reading room)
  'fact.mythograph.read',                     // the mythograph finale's read leg — set by openTerminal only AFTER the keeper's send (weave.js)
];
export const WORLD_ITEMS = ['translation_apparatus', 'translation_matrix_calibration_key'];
// Faction rep is granted by the GAME (the faction-quest campaign adjusts rep), never by a pool
// entity — so a min_rep gate is the same assumed-satisfiable runtime boundary as the journey flags.
export const WORLD_REPS = ['drift', 'rindwalker', 'continuant'];
// → the shape gates.js / reviewBatch take as opts.external (facts as keys ⇒ produced true).
// Pass the imported content pool to ALSO union in the derived boundary (every flag/item the pool
// requires but nothing in it produces — deriveWorldFlags' definition of "set by the runtime"): the
// 720-record corpus gates on ~90 journey flags the static manifest can't enumerate by hand.
export const worldExternal = (content) => {
  if (!content || !content.length) return { facts: WORLD_FACTS, items: WORLD_ITEMS, reps: WORLD_REPS };
  const d = deriveExternalBoundary(content);
  return {
    facts: [...new Set([...WORLD_FACTS, ...d.facts])],
    items: [...new Set([...WORLD_ITEMS, ...d.items])],
    reps: WORLD_REPS,
  };
};
// the derived runtime boundary (progression.js's deriveWorldFlags, inlined here to avoid an import
// cycle): every fact/item the pool REQUIRES but nothing in it PRODUCES is set outside the pool.
function deriveExternalBoundary(content) {
  const produced = new Set(), pool = new Set(), reqF = new Set(), reqI = new Set();
  for (const c of content) {
    for (const f of (c.produces && c.produces.sets) || []) produced.add(f);
    // both dialogue shapes produce: content.dialogue (served npcs) AND content.npc.dialogue (raw bundles)
    const nodes = (c.content && ((c.content.dialogue && c.content.dialogue.nodes)
      || (c.content.npc && c.content.npc.dialogue && c.content.npc.dialogue.nodes))) || {};
    for (const n of Object.values(nodes)) for (const ch of (n.choices || [])) for (const k of Object.keys((ch.effects && ch.effects.set_facts) || {})) produced.add(k);
    if (c.type === 'item') { pool.add(((c.content || {}).name || '').toLowerCase()); for (const t of c.tags || []) pool.add(String(t).toLowerCase()); }
    for (const k of Object.keys((c.requires && c.requires.facts) || {})) reqF.add(k);
    for (const it of (c.requires && c.requires.items) || []) reqI.add(String(it).toLowerCase());
  }
  return { facts: [...reqF].filter((f) => !produced.has(f)), items: [...reqI].filter((i) => !pool.has(i)) };
}

// A whole world_export → {content, bible}. Accepts {content_pool:{items}}, {items}, a bare array, OR
// hoopy's newer KEYED-OBJECT export ({ "0": {…}, "1": {…} } — values are the records, keyed by index/id).
export function importWorldExport(json, opts = {}) {
  let items;
  if (json && json.content_pool && Array.isArray(json.content_pool.items)) items = json.content_pool.items;
  else if (json && Array.isArray(json.items)) items = json.items;
  else if (Array.isArray(json)) items = json;
  else if (json && typeof json === 'object') items = Object.values(json).filter((v) => v && typeof v === 'object' && v.type);
  else items = [];
  // serving rule 1 (drop retired tombstones) applies to the fallback export too; dedupeRawIds de-collides
  // the live ids (the Kaelen fix) before expandRecord covers 2–4.
  const live = items.filter((r) => r && r.status !== 'retired');
  return { content: dedupeRawIds(live).flatMap((r) => expandRecord(r, opts)), bible: (json && json.story_bible) || null };
}
