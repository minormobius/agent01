// hoop/story/director.js — the GLOBAL lane, pure kernel. The cross-player rollup ("the world pulse"):
// what the whole playerbase is doing, folded from the firehose of player saves.
//
// THE THESIS (ARCHITECTURE.md): this is the ONE place a "database" reappears — a question that is both
// global and hot ("how many travellers have met the Keeper / been to chamber X"). And even here it's a
// disposable PROJECTION: a `com.minomobi.hoop.story.pulse` record on the service repo, rebuildable by
// replaying Jetstream. No source-of-truth DB — the truth is still the players' own save records; this
// just folds them. Pure + deterministic (node-tested); the live Jetstream consumer (scripts/hoop-
// director.mjs) is the only impure shell around it.
//
// Idempotent per player: the pulse keeps the LATEST contribution per DID and derives the aggregates, so
// re-folding a player's newer save updates rather than double-counts.

export function emptyPulse() { return { players: {}, cursor: null, updatedAt: null }; }

// One player's save snapshot (MemoryStore.snapshot()) → their contribution. A save is one player, so we
// read the single player/placements entry. feature_key = "<gid>#<ord>" (a chamber address), so the gid
// prefix is the chamber the resident's story is anchored to.
export function extractContribution(snapshot) {
  const placements = (snapshot && snapshot.placements && snapshot.placements[0] && snapshot.placements[0][1]) || [];
  const met = placements.map(([, r]) => r.content_item_id);
  const chambers = [...new Set(placements.map(([key]) => String(key).split('#')[0]))];
  const pstate = (snapshot && snapshot.players && snapshot.players[0] && snapshot.players[0][1]) || {};
  return { met, chambers, tier: pstate.power_tier || 1, xp: pstate.xp || 0 };
}

export function foldSave(pulse, did, snapshot) {
  pulse.players[did] = extractContribution(snapshot);   // latest-wins per DID (idempotent)
  pulse.updatedAt = new Date().toISOString();
  return pulse;
}

// Derive the readable top-line from the per-player map.
export function summarize(pulse) {
  const dids = Object.keys(pulse.players || {});
  const contentCount = {}, chamberCount = {}, tierDist = {};
  let xpSum = 0;
  for (const did of dids) {
    const c = pulse.players[did];
    for (const id of c.met) contentCount[id] = (contentCount[id] || 0) + 1;
    for (const g of c.chambers) chamberCount[g] = (chamberCount[g] || 0) + 1;
    tierDist[c.tier] = (tierDist[c.tier] || 0) + 1;
    xpSum += c.xp || 0;
  }
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
  return { travellers: dids.length, totalMet: Object.values(contentCount).reduce((a, b) => a + b, 0),
           topContent: top(contentCount), topChambers: top(chamberCount), tierDist, xpSum };
}

// ── pulse ⇄ record (on the service repo). playersJson is the working state (recompute next round);
// summaryJson is the small readable rollup v3 displays. ──
export const PULSE_NSID = 'com.minomobi.hoop.story.pulse';
export function pulseToRecord(pulse) {
  return { $type: PULSE_NSID, cursor: pulse.cursor || '', playersJson: JSON.stringify(pulse.players || {}),
           summaryJson: JSON.stringify(summarize(pulse)), updatedAt: pulse.updatedAt || new Date().toISOString() };
}
export function recordToPulse(value) {
  if (!value) return emptyPulse();
  let players = {}; try { players = JSON.parse(value.playersJson || '{}'); } catch (e) { players = {}; }
  return { players, cursor: value.cursor || null, updatedAt: value.updatedAt || null };
}
export function readSummary(value) {
  if (!value || !value.summaryJson) return null;
  try { return JSON.parse(value.summaryJson); } catch (e) { return null; }
}
