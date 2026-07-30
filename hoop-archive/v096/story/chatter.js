// hoop/v095/story/chatter.js — deterministic ambient-line picker for the procedural crowd. Pure, no LLM.
//
// Instead of hand-authoring a line per NPC, a tree-less crowd NPC draws from a faction × story-phase bank
// (story/chatter.json): the active phase is the highest one whose `when` the player's state satisfies, and
// the line is chosen by a per-NPC seed so each crowd member has a stable voice that SHIFTS as the world
// advances. No inference, no Date.now — same (faction, phase, seed) → same line, so it's atproto-stable.

const FACTIONS = ['continuant', 'drift', 'rindwalker'];
export const factionOf = (tags) => (tags || []).find((t) => FACTIONS.includes(t)) || '_default';

function phaseOk(when, state) {
  if (!when) return true;
  const nar = state.narrative_tier || 1, rev = state.revelation_tier || 1, facts = state.facts || {}, items = state.items;
  if (when.min_narrative && nar < when.min_narrative) return false;
  if (when.max_narrative && nar > when.max_narrative) return false;
  if (when.min_revelation && rev < when.min_revelation) return false;
  for (const [k, v] of Object.entries(when.facts || {})) if (facts[k] !== v) return false;
  for (const tok of (when.items || [])) { if (!items || !items.has(String(tok).toLowerCase())) return false; }
  return true;
}

// the active phase = the LAST phase (banks list them ascending) whose gate the state satisfies
export function activePhase(bank, state) {
  let id = (bank.phases[0] || {}).id;
  for (const ph of (bank.phases || [])) if (phaseOk(ph.when, state)) id = ph.id;
  return id;
}

const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// pick a faction+phase line, deterministic per (seed, phase) — re-rolls when the phase advances
export function pickChatter(bank, faction, state, seed) {
  if (!bank || !bank.lines) return null;
  const phase = activePhase(bank, state);
  const byF = bank.lines[faction] || bank.lines._default || {};
  const list = byF[phase] || byF[(bank.phases[0] || {}).id] || [];
  if (!list.length) return null;
  return list[hash(String(seed) + '|' + phase) % list.length];
}
