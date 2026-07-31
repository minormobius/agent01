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
];
export const WORLD_ITEMS = ['translation_apparatus', 'translation_matrix_calibration_key'];
// Faction rep is granted by the GAME (the v100 faction-quest campaign adjusts rep), never by a pool
// entity — so a min_rep gate is the same assumed-satisfiable runtime boundary as the journey flags.
export const WORLD_REPS = ['drift', 'rindwalker', 'continuant'];
// → the shape gates.js / reviewBatch take as opts.external (facts as keys ⇒ produced true).
// Pass the imported content pool to ALSO union in the derived boundary (every flag/item the pool
// requires but nothing in it produces — deriveWorldFlags' definition of "set by the runtime"): the
// 600-record corpus gates on ~90 journey flags the static manifest can't enumerate by hand.
export const worldExternal = (content) => {
  if (!content || !content.length) return { facts: WORLD_FACTS, items: WORLD_ITEMS, reps: WORLD_REPS };
  const d = deriveWorldFlags(content);
  return {
    facts: [...new Set([...WORLD_FACTS, ...d.facts])],
    items: [...new Set([...WORLD_ITEMS, ...d.items])],
    reps: WORLD_REPS,
  };
};
// the derived runtime boundary (kept here, not progression.js, to avoid an import cycle): every
// fact/item the pool REQUIRES but nothing in it PRODUCES is, by construction, set outside the pool.
export function deriveWorldFlags(content) {
  const produced = new Set(), pool = new Set(), reqF = new Set(), reqI = new Set();
  for (const c of content) {
    for (const f of (c.produces && c.produces.sets) || []) produced.add(f);
    const nodes = (c.content && c.content.dialogue && c.content.dialogue.nodes) || {};
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
  return { content: items.map((r) => importRecord(r, opts)), bible: (json && json.story_bible) || null };
}
