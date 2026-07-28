// hoop/v095/story/review.js — the CONTENT REVIEW / CONFLICT-PREVIEW gate. Pure, no DOM, no LLM.
//
// Before a batch of candidate content_items (LLM-generated OR hand-authored) enters the pool, run it
// through every authoring invariant we already enforce and PREVIEW what it would do:
//   • structural — required fields, known type, tiers in the Tabard 1..5 range (not the old 1..3)
//   • dialogue   — every NPC tree is clean (validate.js: no broken gotos / dead nodes / stuck nodes)
//   • quests     — no NEW orphan gates introduced (gates.js: a candidate gating on state nothing produces)
//   • canon      — id collisions are EDITS (in place, same type) not silent type-swaps that orphan saves
// Returns a report { verdict, adds, edits, conflicts, warnings, counts }. verdict='BLOCK' on any conflict.
// This is the harness the generator pours into; it's equally a linter for hand-authoring.

import { validateTree, errors } from './validate.js';
import { analyzePool, orphans } from './gates.js';

export const TIER_MAX = { revelation_tier: 5, narrative_tier: 5, power_tier: 5 };   // the Tabard ladders (fixes the old 1..3 clamp)
export const KNOWN_TYPES = new Set(['item', 'lore_fragment', 'npc', 'creature', 'plot_beat']);
const REQUIRED = ['id', 'type', 'content'];

function mergeContent(existing, candidates) {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of candidates) if (c.id) byId.set(c.id, c);   // edits replace by id; adds append
  return [...byId.values()];
}
function countByType(list) { const out = {}; for (const c of list) out[c.type] = (out[c.type] || 0) + 1; return out; }

export function reviewBatch(existing, candidates, features = []) {
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const conflicts = [], warnings = [], adds = [], edits = [], seen = new Set();
  const bad = (id, code, msg) => conflicts.push({ id, code, msg });
  const warn = (id, code, msg) => warnings.push({ id, code, msg });

  for (const c of candidates) {
    const id = c.id || '(no id)';
    for (const f of REQUIRED) if (c[f] == null) bad(id, 'missing_field', `missing required field '${f}'`);
    if (!KNOWN_TYPES.has(c.type)) bad(id, 'bad_type', `unknown type '${c.type}'`);
    if (c.id) { if (seen.has(c.id)) bad(c.id, 'dup_in_batch', 'id appears more than once in this batch'); seen.add(c.id); }

    if (c.id && existingById.has(c.id)) {                    // EDIT — must be in place, same type (engine rule)
      edits.push(c.id); const ex = existingById.get(c.id);
      if (c.type && ex.type && ex.type !== c.type) bad(c.id, 'type_change', `edit changes type ${ex.type}→${c.type} — orphans players' crystallized placements`);
    } else if (c.id) adds.push(c.id);

    for (const [k, max] of Object.entries(TIER_MAX)) { const v = c[k]; if (v != null && (!Number.isInteger(v) || v < 1 || v > max)) bad(id, 'tier_range', `${k}=${JSON.stringify(v)} out of the Tabard range 1..${max}`); }

    if (c.type === 'npc' && c.content && c.content.dialogue) for (const e of errors(validateTree(c.content.dialogue))) bad(id, 'tree_' + e.code, e.message);

    if (c.approved !== true) warn(id, 'not_approved', 'approved !== true — the engine will withhold it until approved');
    if (c.status && c.status !== 'active') warn(id, 'not_active', `status='${c.status}'`);
  }

  // QUEST conflicts: only orphan gates the candidates INTRODUCE (diff against the existing pool)
  const beforeKeys = new Set(orphans(analyzePool(existing, features)).map((o) => o.id + '|' + o.code + '|' + o.key));
  for (const o of orphans(analyzePool(mergeContent(existing, candidates), features)))
    if (!beforeKeys.has(o.id + '|' + o.code + '|' + o.key)) bad(o.id || '(pool)', 'orphan_gate', o.message);

  return { verdict: conflicts.length ? 'BLOCK' : 'PASS', adds, edits, conflicts, warnings, counts: countByType(candidates) };
}
