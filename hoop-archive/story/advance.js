// hoop/story/advance.js — deterministic, inference-free tier advancement (the C3 fix).
//
// The bible advances revelation_tier/narrative_tier "at long rest" via an OFFLINE player agent. The
// one rule (hoop-backend/CLAUDE.md) forbids a model in the hot path, and the JS client has no offline
// agent — so without this a player is pinned at tier 1/1/1 forever and NO content above tier 1 ever
// surfaces (the whole 5-rung arc is unreachable). This is the inference-free cousin of long-rest: a
// player crosses a tier FLOOR when they HOLD a configured set of earned story state (facts/items/rep)
// — exactly the gate the engine already evaluates (meetsState over loadGateState). Pure, deterministic
// (no Date.now, no model), monotonic (never demotes), atproto-stable.
//
// It does NOT replace the offline agent: when the backend is wired the agent may advance tiers with
// judgement; this manifest is the FLOOR that makes the single-player client playable today. See the
// design rationale in hoop/v094/CHAPTER1-OPENING.md §4.

import { loadGateState, meetsState } from './engine.js';

export const AXES = ['revelation_tier', 'narrative_tier'];   // power_tier is XP-driven (engine.js), not a milestone axis
export const TIER_MAX = 5;                                    // the Tabard bible's ladders are 1-5 (see C2 in v094/CHAPTER1-OPENING.md)

// A milestone is a tier FLOOR: when `requires` is held, the player's `axis` is at least `to`. Order
// is irrelevant — checkAdvance takes the highest satisfied `to` per axis. `requires` is the same blob
// meetsState reads (facts / items / min_rep), so milestones gate on the very state dialogue effects set.
export const MILESTONES = [
  // Narrative: Arrival → Orientation. Earned by meeting Olo, reading the Tabard terminal, and giving
  // Sevin a reason she believes (the Bay-14 stencil). The opening chunk's "advance the ball".
  { id: 'nar2-orientation', axis: 'narrative_tier', to: 2,
    requires: { facts: { 'flag.met_olo': true, 'flag.read_terminal': true, 'flag.sevin_believes': true } } },
  // (further rungs land as chapters are authored — e.g. revelation 1→2 "The Curve" on flag.saw_curve)
];

// Evaluate milestones against the player's earned state; apply any tier floor the player has reached
// but not yet been granted. Returns [{ axis, from, to }] for whatever advanced (HUD / notification).
export function checkAdvance(store, playerId, milestones = MILESTONES) {
  const gstate = loadGateState(store, playerId);
  const want = {};                                            // axis → highest satisfied floor
  for (const m of milestones) {
    if (!AXES.includes(m.axis) || !meetsState(gstate, m.requires)) continue;
    const to = Math.max(1, Math.min(TIER_MAX, m.to | 0));
    if (!(m.axis in want) || to > want[m.axis]) want[m.axis] = to;
  }
  const p = store.getPlayerState(playerId), changed = [];
  for (const axis of AXES) {
    const target = want[axis]; if (target == null) continue;
    const cur = p[axis] || 1;
    if (target > cur) { store.setPlayerTier(playerId, axis, target); changed.push({ axis, from: cur, to: target }); }
  }
  return changed;
}
