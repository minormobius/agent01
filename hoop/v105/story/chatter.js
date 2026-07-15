// hoop/v095/story/chatter.js — deterministic ambient-line picker for the procedural crowd. Pure, no LLM.
//
// Instead of hand-authoring a line per NPC, a tree-less crowd NPC draws from a faction × story-phase bank
// (story/chatter.json): the active phase is the highest one whose `when` the player's state satisfies, and
// the line is chosen by a per-NPC seed so each crowd member has a stable voice that SHIFTS as the world
// advances. No inference, no Date.now — same (faction, phase, seed) → same line, so it's atproto-stable.

const FACTIONS = ['continuant', 'drift', 'rindwalker'];
// hoopy's export tags NPCs with the PLURAL/variant class name ("continuants", "rind-walkers", "Drifter").
// Normalize every spelling onto the three canonical factions so chatter-keying + role/rep all line up.
const FACTION_ALIASES = {
  continuants: 'continuant', continuant: 'continuant',
  drift: 'drift', drifts: 'drift', drifter: 'drift', drifters: 'drift',
  rindwalker: 'rindwalker', rindwalkers: 'rindwalker', 'rind-walker': 'rindwalker', 'rind-walkers': 'rindwalker', rindwalking: 'rindwalker',
};
// One token → its canonical faction, or null if it isn't a faction word.
export const normalizeFaction = (t) => { const s = String(t || '').toLowerCase().trim(); return FACTIONS.includes(s) ? s : (FACTION_ALIASES[s] || null); };
// First faction found among a tag list (now plural-tolerant), else '_default'.
export const factionOf = (tags) => { for (const t of (tags || [])) { const f = normalizeFaction(t); if (f) return f; } return '_default'; };

// Civic/econ ROLE → faction (mirrors genquest.js FACTION_BY_ROLE; kept here so the crowd can derive a
// faction from a resident's role without importing the generation lane). 'dwell' is neutral (no faction).
export const FACTION_BY_ROLE = {
  mend: 'continuant', make: 'continuant', govern: 'continuant', serve: 'continuant', store: 'continuant',
  move: 'continuant', heal: 'continuant', learn: 'continuant', worship: 'continuant',
  trade: 'drift', broker: 'drift', play: 'drift', grow: 'drift',
  salvage: 'rindwalker', hull: 'rindwalker', dig: 'rindwalker',
};
export const factionForRole = (r) => FACTION_BY_ROLE[r] || null;

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

// pick a faction+phase line, deterministic per (seed, phase) — re-rolls when the phase advances. `bump`
// advances the line each time you re-talk to the SAME crowd member (their interaction count), so an ambient
// NPC cycles through its bank instead of repeating one line forever. Still pure (no Date/random) → stable.
export function pickChatter(bank, faction, state, seed, bump = 0) {
  if (!bank || !bank.lines) return null;
  const phase = activePhase(bank, state);
  const byF = bank.lines[faction] || bank.lines._default || {};
  const list = byF[phase] || byF[(bank.phases[0] || {}).id] || [];
  if (!list.length) return null;
  return list[(hash(String(seed) + '|' + phase) + (bump | 0)) % list.length];
}
