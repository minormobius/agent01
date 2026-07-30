// hoop/story/filter.js — the POOL FILTER PROJECTION. Pure, no DOM, no LLM, no network.
//
// The content pool is a "quasi-database" that must be TOTALLY FILTERABLE (v096 decision): the shared
// authored spine and a player's live-generated personal side-quests live side by side, and an
// experimental/swappable generator (Gemini now, huwupy's local model later) must stay cleanly
// separable and RIPPABLE. This module is the one place that derives a filtered VIEW of content[] for
// the engine to load — a disposable projection (ARCHITECTURE.md), never a mutation of truth.
//
// Provenance fields on a content_item (lexicon story.content): `lane` ('spine'|'sidequest'),
// `provider` ('authored'|'gemini-2.5-flash'|'local:<model>'…), `genState` (the steer digest). Absent
// `lane` ⇒ 'spine' (back-compat: every pre-v096 record is canon spine).

export const laneOf = (ci) => (ci && ci.lane) || 'spine';
export const providerOf = (ci) => (ci && ci.provider) || 'authored';

// A filter SPEC is all-optional; an omitted axis is a pass-through (keep everything on that axis):
//   { lane, providers:{allow?:[],deny?:[]}, types:[], approved:bool, status, maxRevelation, maxNarrative, tagsAny:[] }
// `lane:'all'` (or omitted) keeps both lanes; `lane:'spine'|'sidequest'` restricts. `providers.deny`
// drops by exact match OR a 'local:*' style prefix (trailing '*'). Returns a NEW array; input untouched.
function providerMatch(p, pat) {
  if (pat.endsWith('*')) return p.startsWith(pat.slice(0, -1));
  return p === pat;
}
export function poolFilter(content, spec = {}) {
  const types = spec.types && new Set(spec.types);
  const allow = spec.providers && spec.providers.allow;
  const deny = (spec.providers && spec.providers.deny) || [];
  const tagsAny = spec.tagsAny && new Set(spec.tagsAny);
  return (content || []).filter((ci) => {
    if (spec.lane && spec.lane !== 'all' && laneOf(ci) !== spec.lane) return false;
    const prov = providerOf(ci);
    if (allow && !allow.some((pat) => providerMatch(prov, pat))) return false;
    if (deny.some((pat) => providerMatch(prov, pat))) return false;
    if (types && !types.has(ci.type)) return false;
    if (spec.approved != null && !!ci.approved !== spec.approved) return false;
    if (spec.status && (ci.status || 'active') !== spec.status) return false;
    if (spec.maxRevelation != null && (ci.revelation_tier || 1) > spec.maxRevelation) return false;
    if (spec.maxNarrative != null && (ci.narrative_tier || 1) > spec.maxNarrative) return false;
    if (tagsAny && !(ci.tags || []).some((t) => tagsAny.has(t))) return false;
    return true;
  });
}

// Stamp provenance onto a freshly generated item BEFORE it goes through review.js. Pure; returns a new
// object. The generator calls this so every non-authored record is filterable by where it came from.
export function stampProvenance(ci, { lane = 'sidequest', provider, genState } = {}) {
  const out = { ...ci, lane };
  if (provider != null) out.provider = provider;
  if (genState != null) out.genState = String(genState).slice(0, 256);
  return out;
}

// Merge the shared spine with a player's own side-quests into one content[] the engine loads. SPINE WINS
// on id collision (canon is authoritative; a side-quest can never silently shadow an authored item) —
// collisions are surfaced, not applied, so the caller can warn. Deterministic (input order preserved).
export function mergePools(spine, sidequests = []) {
  const byId = new Map();
  const collisions = [];
  for (const ci of spine || []) if (ci && ci.id != null) byId.set(ci.id, ci);
  for (const ci of sidequests) {
    if (!ci || ci.id == null) continue;
    if (byId.has(ci.id)) { collisions.push(ci.id); continue; }   // spine wins; report the clash
    byId.set(ci.id, ci);
  }
  return { content: [...byId.values()], collisions };
}
