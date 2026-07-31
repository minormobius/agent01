// hoop/v096/story/genquest.js — the CLIENT side of the v096 generation lane. Pure-ish (the POST and the
// store are injected), so its logic is node-testable. The heavy lifting (model call + the
// review.js/gates.js/validate.js gate) runs in the WORKER (/api/story/sidequest); this module only
// builds the request from live world state, then folds an approved arc back into the in-memory pool so
// the inference-free engine can crystallize it like any other content. Nothing here calls a model.
//
// Persistence in v096 is localStorage (the surface has no auth), with an OPTIONAL repo freeze when an
// authed client is present (freezeResult) — additive, guarded, the hybrid "personal side-quests" path.

import { chunkDescriptor } from './spine.js';
import { stampProvenance } from './filter.js';

const FACTION_BY_ROLE = {   // map a civic/econ role onto a Tabard faction so the profile carries faction weight
  mend: 'continuant', make: 'continuant', govern: 'continuant', serve: 'continuant', store: 'continuant',
  move: 'continuant', heal: 'continuant', learn: 'continuant', worship: 'continuant',
  trade: 'drift', broker: 'drift', play: 'drift', grow: 'drift',
  salvage: 'rindwalker', hull: 'rindwalker', dig: 'rindwalker',
};   // 'dwell' is neutral (no faction)
const factionOfRole = (r) => FACTION_BY_ROLE[r] || null;
const THIRD_PLACES = new Set(['worship', 'serve', 'play', 'learn']);

// Build a lightweight ChunkProfile from what the client knows at a place: the focal role, the room's
// role/domain, and the roles of nearby residents. (The RICH econ-society profile is phase 3; this is
// enough to steer.) Returns the shape spine.js + prompt.js consume.
export function buildProfile({ role, roomRole, roomDomain, nearbyRoles = [], tier } = {}) {
  const roles = {}, domains = {}, factions = {};
  const bump = (m, k, n = 1) => { if (k) m[k] = (m[k] || 0) + n; };
  bump(roles, role, 2); bump(roles, roomRole, 1);
  for (const r of nearbyRoles) bump(roles, r, 1);
  bump(domains, roomDomain, 1);
  for (const r of Object.keys(roles)) bump(factions, factionOfRole(r), roles[r]);
  const profile = { roles, domains, factions };
  if (tier) profile.tier = tier;
  return profile;
}

// The RICH profile (phase 3): the whole chunk's building programme + its lived population + the civic
// web touching it — the "thick" characteristics the spine matches story arcs against. Pure: the index
// gathers `rooms` (chunk.rooms), `residentRoles` (a histogram from nearResidents), and `edges`
// (society.edges touching this chunk) and passes them in. Falls back to buildProfile when the world
// data isn't ready. scoreSociety isn't run live, so vitality/bridges are derived proxies (per the map).
export function profileFromChunk({ rooms = [], residentRoles = {}, edges = [] } = {}) {
  const roles = {}, domains = {}, factions = {};
  const bump = (m, k, n = 1) => { if (k) m[k] = (m[k] || 0) + n; };
  for (const r of rooms) { bump(roles, r.role, 1); if (r.domain) bump(domains, r.domain, 1); }   // the building programme
  for (const [role, n] of Object.entries(residentRoles)) bump(roles, role, n);                    // the lived population weights it
  for (const role of Object.keys(roles)) bump(factions, factionOfRole(role), roles[role]);
  const total = rooms.length || 1;
  const thirdPlaces = rooms.filter((r) => THIRD_PLACES.has(r.role)).length;
  const dwell = rooms.filter((r) => r.role === 'dwell').length;
  const thirdEdges = (edges || []).filter((e) => e.kind === 'third').length;
  const bridges = Math.min(1, thirdEdges / ((total - dwell) || 1));   // weak-tie proxy (shared third-places)
  const tier = thirdPlaces / total >= 0.15 ? 'Vibrant' : (dwell / total >= 0.6 ? 'Residential' : 'Working');
  return { roles, domains, factions, thirdPlaces, bridges, tier };
}

// POST the generation request. `post` is an injected async (path, body) => parsedJson (the worker call).
// Sends the chunk profile + descriptor + the nearby pool subset (the gate diffs against it). Returns the
// worker's result verbatim ({ ok, verdict, items, beats, … }) or a SKIP shell on any failure.
export async function requestSidequest(post, { profile, existing = [], match } = {}) {
  const descriptor = chunkDescriptor(profile).text;
  try {
    const res = await post('/api/story/sidequest', { profile, descriptor, existing, match });
    return res || { ok: false, verdict: 'SKIP', reason: 'no-response', items: [], beats: [] };
  } catch (e) {
    return { ok: false, verdict: 'SKIP', reason: String(e && e.message || e), items: [], beats: [] };
  }
}

// Fold an APPROVED arc into the live store so the engine can dispatch/crystallize it. Re-stamps lane
// (defensive — the worker already stamped) and registers every item via store.addContent. Returns the
// principal NPC id (to pin onto the feature) + the ids added. A non-PASS result is a no-op.
export function applyResult(store, result) {
  if (!store || !result || result.verdict !== 'PASS') return { added: [], principal: null };
  const added = [];
  let principal = null;
  for (const raw of result.items || []) {
    const ci = stampProvenance(raw, { lane: 'sidequest', provider: result.provider, genState: result.genState });
    store.addContent(ci); added.push(ci.id);
    if (!principal && ci.type === 'npc') principal = ci.id;
  }
  return { added, principal };
}

// Optional: freeze the arc into the player's OWN repo (lane:'sidequest') when an authed client exists.
// Guarded + per-item tolerant; the game never depends on it (localStorage is the durable path in v096).
export async function freezeResult(client, result, putContent) {
  if (!client || !result || result.verdict !== 'PASS') return { written: [], errors: [] };
  const written = [], errors = [];
  for (const ci of result.items || []) {
    try { await putContent(client, ci); written.push(ci.id); }
    catch (e) { errors.push({ id: ci.id, error: String(e && e.message || e) }); }
  }
  return { written, errors };
}
