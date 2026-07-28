// hoop/v095/story/board.js — the STORYBOARD derivation kernel. Pure, no LLM, no DOM.
//
// One declarative storyboard (story/storyboard.json) is the source of progression; this derives, from a
// player's world state, everything the game and the director's-board endpoint need:
//   • computeBoard → each beat's status (done | active | locked)
//   • questLog     → the player-facing log (done ✓ + active objectives), with the active marker
//   • activeMarkers→ where to point the player on the map right now
//   • tierFloors   → the tier the completed beats imply (agrees with advance.js — proven in the selftest)
// A beat is DONE when its `completes_when` world-state holds (state is truth — path-independent); ACTIVE
// when its prerequisites (prior beats done + requires state) hold and it isn't done yet; else LOCKED.
// The growth rule: append a beat with requires:{beats:[prior]} and the log/markers/board pick it up.

import { meetsState, loadGateState } from './engine.js';

const stateReq = (r) => ({ facts: r.facts, items: r.items, min_rep: r.min_rep });

// progression gates: lore-XP level (min_power) + tier floors. This is how a beat becomes available by
// EXPOSURE — explore enough lore and the beat unlocks, to be "informed" of by the next NPC.
export function progressOk(p, req) {
  if (req.min_power && (p.power_tier || 1) < req.min_power) return false;
  if (req.min_narrative && (p.narrative_tier || 1) < req.min_narrative) return false;
  if (req.min_revelation && (p.revelation_tier || 1) < req.min_revelation) return false;
  return true;
}

export function computeBoard(sb, store, playerId) {
  const g = loadGateState(store, playerId), p = store.getPlayerState(playerId);
  const beats = (sb && sb.beats) || [];
  const byId = new Map(beats.map((b) => [b.id, b]));
  const meets = (req) => meetsState(g, stateReq(req || {})) && progressOk(p, req || {});
  const isDone = (b) => meets(b.completes_when || {});
  const prereqMet = (b) => {
    const r = b.requires || {};
    for (const pid of (r.beats || [])) { const q = byId.get(pid); if (!q || !isDone(q)) return false; }
    return meets(r);
  };
  return beats.map((b) => ({ ...b, status: isDone(b) ? 'done' : prereqMet(b) ? 'active' : 'locked' }));
}

export const activeBeats = (board) => board.filter((b) => b.status === 'active');
export const activeMarkers = (board) => activeBeats(board).map((b) => b.marker).filter(Boolean);

// the quest log: everything not still locked — done beats (✓) then active objectives (with their marker)
export function questLog(board) {
  return board.filter((b) => b.status !== 'locked').map((b) => ({
    id: b.id, act: b.act, title: b.title, status: b.status,
    text: b.status === 'done' ? (b.done || b.title) : (b.log || b.title),
    marker: b.status === 'active' ? (b.marker || null) : null,
  }));
}

// the tier the COMPLETED beats imply — the storyboard's view of advancement (a floor, monotonic)
export function tierFloors(board) {
  let narrative_tier = 1, revelation_tier = 1;
  for (const b of board) if (b.status === 'done' && b.advances) {
    if (b.advances.narrative_tier) narrative_tier = Math.max(narrative_tier, b.advances.narrative_tier);
    if (b.advances.revelation_tier) revelation_tier = Math.max(revelation_tier, b.advances.revelation_tier);
  }
  return { narrative_tier, revelation_tier };
}

// has the player solved the opening (the unsealing beat is done)? — the first-chunk gate, board-derived
export const unsealed = (board) => board.some((b) => b.unseals && b.status === 'done');
