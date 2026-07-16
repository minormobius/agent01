// hoop/v096/story/quests.js — the DETERMINISTIC side-quest generator. Pure, no DOM, no LLM.
//
// A side quest = hook + learning goal + resolution, templated over hoopy's existing content — the same
// paradigm as the deck spine (hoopy.js), but optional, parallel, and unlimited. Every `rumor` is a seed
// (80 in the export). You don't stumble on rumors directly; the PEOPLE you meet tip you to them — meet an
// NPC and they mention a rumor that shares their world (theme overlap). That opens a thread; chase the
// theme (encounter a few more things tagged like it) and it RESOLVES, paying coins into the same economy
// the arcades feed. No inference: the quest for a seed is identical on every machine — the seed id is the
// permalink. ~80 quests preparable from the current export, surfaced by ~118/120 NPCs.

import { namesAPerson } from './promote.js';   // v105: person-vs-room discrimination for the marker

const QUEST_SEED_TYPES = new Set(['rumor']);   // plot_beats are the MAIN spine (storyboard); rumors are the side threads
const norm = (s) => String(s || '').toLowerCase().trim();

// broad deck/place themes — a quest keys on its seed's SPECIFIC tags first, so two threads don't collapse
// into "go look at Nave stuff." Broad tags are a fallback when a seed has nothing more specific.
const BROAD = new Set(['nave', 'drift', 'rind', 'signal', 'vessel', 'purpose', 'approach', 'curve',
  'curvature', 'infrastructure', 'maintenance', 'ship', 'circulation', 'continuant', 'continuants', 'seven']);

export function questThemes(seed) {
  const tags = (seed.tags || []).map(norm).filter(Boolean);
  const specific = tags.filter((t) => !BROAD.has(t));
  return specific.length ? specific : tags;
}

export const QUEST_GOAL = 3;   // three-beat: the lead + a couple of corroborations

// a seed (rumor) → a deterministic side quest.
export function questForSeed(seed) {
  if (!seed || !QUEST_SEED_TYPES.has(seed.type)) return null;
  const c = seed.content || {};
  const tier = seed.narrative_tier || 1;
  return {
    id: 'sq:' + seed.id,
    seedId: seed.id, seedType: seed.type,
    title: c.name || seed.id,
    hook: c.description || '',
    reveal: c.revelation_hint || '',
    themes: questThemes(seed),
    tier,
    needed: QUEST_GOAL,
    refs: seed.world_refs || seed.refs || [],
    reward: 6 + tier * 4,   // coins — the side-quest payout, priced into the arcade/cafe economy
  };
}

// all quests from a content array, keyed by seed id.
export function buildQuestBank(content) {
  const bank = new Map();
  for (const ci of content || []) { const q = questForSeed(ci); if (q) bank.set(q.seedId, q); }
  return bank;
}

// does an encountered item corroborate this quest? (tag overlap with the quest's themes)
export function corroborates(ci, quest) {
  if (!ci || !quest) return false;
  const themes = new Set(quest.themes);
  for (const t of (ci.tags || [])) if (themes.has(norm(t))) return true;
  return false;
}

// progress over the player's encounters: distinct corroborating items met (the NPC who tipped you off
// shares the theme, so they count as the first). done when the count reaches the goal.
export function questProgress(store, playerId, quest) {
  const ids = new Set();
  for (const pl of store.listPlacements(playerId)) {
    const ci = store.contentById(pl.content_item_id);
    if (ci && corroborates(ci, quest)) ids.add(ci.id);
  }
  const learned = ids.size;
  return { learned, needed: quest.needed, done: learned >= quest.needed, progress: Math.min(1, quest.needed ? learned / quest.needed : 1) };
}

// the content ids already counted toward a quest (distinct corroborating placements) — the filter the
// seek logic uses so a waypoint never points at someone you've already learned.
export function questCounted(store, playerId, quest) {
  const ids = new Set();
  for (const pl of store.listPlacements(playerId)) {
    const ci = store.contentById(pl.content_item_id);
    if (ci && corroborates(ci, quest)) ids.add(ci.id);
  }
  return ids;
}

// PEOPLE OF INTEREST for an open thread — waypoints point at PEOPLE, not rooms. From `npcs`, those
// whose tags corroborate the theme and who aren't yet counted, deterministic by id; the host picks
// the nearest placed one to chase (and seats one when none is placed). Wanderers are excluded — an
// ambient voice can't hold a waypoint.
export function seekCandidates(quest, npcs, counted) {
  return (npcs || [])
    .filter((c) => c && c.type === 'npc' && !(c.content && c.content.ambient)
      && corroborates(c, quest) && !(counted && counted.has(c.id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// the best unopened quest an NPC can tip you to: most theme overlap with the NPC's tags, tie-break by
// seed id (deterministic). `taken(seedId)` is true when the quest is already open or done.
export function pickQuestForNpc(bank, npcCi, taken) {
  const tags = new Set((npcCi && npcCi.tags || []).map(norm));
  if (!tags.size) return null;
  let best = null, bestScore = 0;
  for (const q of bank.values()) {
    if (taken && taken(q.seedId)) continue;
    let score = 0; for (const t of q.themes) if (tags.has(t)) score++;
    if (score > 0 && (score > bestScore || (score === bestScore && (best === null || q.seedId < best.seedId)))) { bestScore = score; best = q; }
  }
  return best;
}

// a navigable marker hint from the seed's refs (an NPC name / a terminal / the rind / a place)
const ABSTRACT = /^the (seven|ship|player|drift|continuants|rind-?walkers|tabard)$/i;
export function questMarker(quest, npcNames) {
  for (const r of (quest.refs || [])) { const id = npcNames && npcNames.get(norm(r)); if (id) return { anchor: id, hint: 'find ' + r }; }
  // v105 npc reform: a ref that NAMES A PERSON who isn't placed yet is a PERSON marker, not a room. It used
  // to fall through to the terminal/rind/place branches below — the "waypoint chases a room" bug. The surface
  // emergency-promotes a stand-in for `person` so the ◇ resolves to someone walkable (see promote.js).
  for (const r of (quest.refs || [])) if (namesAPerson(r) && !(npcNames && npcNames.get(norm(r)))) return { person: String(r).trim(), hint: 'find ' + String(r).trim() };
  for (const r of (quest.refs || [])) if (/terminal/i.test(r)) return { terminal: true, hint: r };
  for (const r of (quest.refs || [])) if (/rind|shaft|signal|deep|lower/i.test(r)) return { place: 'rind', hint: r };
  for (const r of (quest.refs || [])) if (!ABSTRACT.test(String(r).trim())) return { place: r, hint: r };
  return (quest.refs && quest.refs[0]) ? { hint: quest.refs[0] } : null;
}
