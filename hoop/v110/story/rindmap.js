// rindmap.js — THE UPPER RIND AS A CONFLUENCE DUNGEON. Pure, no DOM, no network.
//
// Zone 3 is the one place the bible asks for a shape hoop's chunkgen cannot make:
//
//   "You witness each nave faction reflected at scale, THREE TIMES EACH, and then — at a
//    threshold Sevin leads you to — you CHOOSE a faction."
//
// Three separate things to walk, converging on one place where a decision happens. That is
// exactly `foam.mino.mobi/dungeon`'s CONFLUENCE mode (`starts=3`): three parties enter far apart
// on the top surface and descend to one shared chamber deep below, and **no two of their routes
// share a chamber until they arrive** — disjointness proved by max-flow with unit node capacities
// (Menger), not attempted greedily. So:
//
//   party 0/1/2  →  a nave faction's domain, reflected at the ship's scale
//   its route    →  that faction witnessed, three times over
//   the chamber  →  Sevin's threshold, where you choose
//
// The disjointness is the feature, not a constraint to work around: Mars's forge-cathedral country
// never bleeds into Venus's gardens, so each descent is a genuinely separate register, and the
// witness counter cannot be filled by wandering. You must walk all three.
//
// WHY THE MAP LIVES OUTSIDE THIS REPO. `v110/index.html` is 579 KB; the last upper-rind pass made
// the surface too bulky to work in. The floor is fetched from foam's API as a document and read
// here — this module never draws anything and never talks to the network. `fetchRindFloor` is the
// only I/O and is a thin wrapper the surface calls; everything below is a pure read of a document,
// so it is node-testable against a saved fixture and the geometry stays somebody else's problem.
//
// ⚠ VERSION DRIFT IS THE ONE REAL HAZARD. foam's generator is deterministic *under one*
// `DUNGEON_VERSION`, and a bump legitimately moves layouts (v2 removed flat ground, v3 added
// trapdoors, v4 added loops). The API stamps the version it used but does NOT accept a requested
// one, so we cannot pin — we can only record what we were served and detect the change. Every
// floor carries `version`, and `floorSignature` is what a save should store so a drifted floor is
// detectable instead of silently relocating a player's crystallizations. Asking foam for a `v=`
// request parameter is the fix; until then, treat a signature mismatch as a re-survey.
//
// Node-tested: test/rindmap.selftest.mjs.

import { hash32 } from './statblock.js';

// The three nave factions, in factionchoice.js's CHOICE_FACTIONS order so the witness counters
// this feeds (`fw.<faction>`) line up with the module that spends them.
export const RIND_FACTIONS = ['continuant', 'rindwalker', 'drift'];
// The bible's count, and factionchoice.js's WITNESS_TARGET. Kept here as the number of sites this
// module must be able to nominate per route — if a route cannot carry three, the floor is thin.
export const WITNESS_TARGET = 3;

// The request hoop makes of foam. `starts=3` is the whole point; `hex` because the grid tiling
// yields 3–4-room routes where hex yields 7–15, and a route has to hold three witnessings plus
// texture; `l` because three separate descents need room to be separate in (foam defaults
// confluence to `l` for the same reason).
export const FLOOR_PARAMS = { starts: 3, size: 'l', shape: 'hex', scale: 0.35 };

export const floorQuery = (worldSeed, params = {}) => {
  const p = { ...FLOOR_PARAMS, ...params, seed: (worldSeed >>> 0) };
  return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
};

// ── reading the document ─────────────────────────────────────────────────────────────────────────
const isConfluence = (doc) => !!(doc && doc.format === 'foam-dungeon' && doc.confluence
  && Array.isArray(doc.confluence.entrances) && doc.confluence.chamber != null);

// A floor's identity: the generator's own parameters plus the version that produced them. Two
// documents with the same signature are the same floor; a differing signature means the ground
// moved under a save. This is the string to persist, not the whole 60 KB document.
export function floorSignature(doc) {
  if (!doc) return null;
  const g = doc.generator || {};
  return [doc.format, 'v' + (doc.version ?? '?'), 'seed' + (g.seed ?? '?'), 'salt' + (g.salt ?? 0),
    g.tileShape || '?', g.size || '?', 'starts' + (g.starts ?? 1)].join(':');
}

// doc → the rind floor hoop plays on. Returns { ok:false, reason } rather than throwing: a floor
// that cannot be read must degrade to "the rind is not available", never break the surface.
export function readRindFloor(doc, { worldSeed = 0 } = {}) {
  if (!isConfluence(doc)) return { ok: false, reason: 'not a confluence document (need starts=3)' };
  const rooms = new Map((doc.rooms || []).map((r) => [r.id, r]));
  const chamberId = doc.confluence.chamber;
  const chamber = rooms.get(chamberId);
  if (!chamber) return { ok: false, reason: 'the confluence chamber is not among the rooms' };

  const entrances = doc.confluence.entrances.slice();
  if (entrances.length !== RIND_FACTIONS.length) {
    return { ok: false, reason: `${entrances.length} entrances, need ${RIND_FACTIONS.length} (one per nave faction)` };
  }

  // WHICH SHAFT BELONGS TO WHICH FACTION is seeded, not fixed: two worlds put the Drift's descent
  // down a different mouth, so a player who has walked one world does not know the next by rote.
  // A rotation (rather than a shuffle) keeps every faction on exactly one route by construction.
  const rot = hash32('rindparty', worldSeed) % RIND_FACTIONS.length;
  const factionForParty = (i) => RIND_FACTIONS[(i + rot) % RIND_FACTIONS.length];

  // a party's territory: every room the generator assigned to that side (the chamber is side -1).
  const territory = new Map(RIND_FACTIONS.map((_, i) => [i, []]));
  for (const r of doc.rooms || []) if (r.side != null && r.side >= 0 && territory.has(r.side)) territory.get(r.side).push(r);

  const parties = entrances.map((entranceId, i) => {
    const path = (doc.paths || [])[i] || null;
    const own = territory.get(i) || [];
    // the ROUTE is the planned descent, chamber excluded — the rooms you pass on the way down.
    const routeIds = (path && path.rooms ? path.rooms : own.map((r) => r.id)).filter((id) => id !== chamberId);
    const route = routeIds.map((id) => rooms.get(id)).filter(Boolean);
    return {
      party: i,
      faction: factionForParty(i),
      entrance: entranceId,
      route,
      rooms: own,
      // THE WITNESS SITES — where this faction is seen at scale. Biggest first, because "witnessed
      // at scale" is a claim about size: a forge-cathedral has to actually be a big room. Ties break
      // on depth then id so the choice is stable across machines.
      witnessSites: own.slice()
        .sort((a, b) => (b.area - a.area) || (a.depth - b.depth) || (a.id - b.id))
        .slice(0, WITNESS_TARGET),
    };
  });

  // THE DISJOINTNESS CERTIFICATE, re-checked here rather than trusted. foam proves it generator-side
  // and pins it in CI; hoop re-checks because a floor that leaks would let a player fill another
  // faction's witness counter without walking its descent, which silently breaks the choice.
  const ownerOf = new Map();
  for (const [side, rs] of territory) for (const r of rs) ownerOf.set(r.id, side);
  const leaks = [];
  for (const p of parties) {
    for (const r of p.route) {
      const o = ownerOf.get(r.id);
      if (o != null && o !== p.party) leaks.push({ party: p.party, room: r.id, ownedBy: o });
    }
  }

  const thin = parties.filter((p) => p.witnessSites.length < WITNESS_TARGET).map((p) => p.faction);

  return {
    ok: true,
    signature: floorSignature(doc),
    version: doc.version ?? null,
    seed: (doc.generator || {}).seed ?? null,
    worldSeed,
    parties,
    threshold: { id: chamberId, room: chamber, depth: doc.confluence.depth ?? chamber.depth ?? null },
    seams: doc.confluence.seams || [],
    trapdoors: doc.trapdoors || [],
    loops: doc.loops || [],
    disjoint: leaks.length === 0,
    leaks,
    thin,                        // factions whose route cannot carry three witnessings
    roomCount: (doc.rooms || []).length,
  };
}

// ── binding authored bundles to chambers ─────────────────────────────────────────────────────────
// The impedance problem, concretely: hoopy authors "Gantry 78 Inboard" (verb `govern`, faction
// `jupiter`, nave_faction `continuant`) and the generator emits chambers with an area and a depth.
// A forge-cathedral needs a big room; a maintenance crawl does not. So bundles are seated on their
// OWN faction's route (the nave_faction is the projection the witness counter reads), biggest
// bundle into biggest chamber, deterministically.
//
// Returns { seats: [{bundleId, roomId, party, faction}], unseated: [bundleId] } — never throws, and
// never seats a bundle on a faction's route that isn't its own.
export function seatBundles(floor, bundles, { worldSeed = 0 } = {}) {
  const seats = [], unseated = [];
  if (!floor || !floor.ok) return { seats, unseated: (bundles || []).map((b) => b && b.id).filter(Boolean) };

  const faction = (b) => String((b.content && (b.content.nave_faction || b.content.faction)) || '').toLowerCase();
  const byFaction = new Map(RIND_FACTIONS.map((f) => [f, []]));
  for (const b of bundles || []) {
    const f = faction(b);
    if (byFaction.has(f)) byFaction.get(f).push(b); else unseated.push(b.id);
  }

  for (const p of floor.parties) {
    const mine = (byFaction.get(p.faction) || []).slice()
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));                 // stable input order
    // Witness sites first (the big rooms, in size order), then the rest of the route by area.
    const sites = [...p.witnessSites, ...p.route.filter((r) => !p.witnessSites.some((w) => w.id === r.id))
      .sort((a, b) => (b.area - a.area) || (a.id - b.id))];
    mine.forEach((b, i) => {
      const room = sites[i];
      if (!room) { unseated.push(b.id); return; }
      seats.push({ bundleId: b.id, roomId: room.id, party: p.party, faction: p.faction, area: room.area, witness: i < WITNESS_TARGET });
    });
  }
  return { seats, unseated };
}

// ── the witness counter factionchoice.js spends ──────────────────────────────────────────────────
// The surface sets `fw.<faction>` as the player crystallizes faction-tagged content in the rind.
// This says which SITES count toward that, so the counter is filled by walking a descent rather
// than by wandering: only a party's own witness sites advance its own faction.
export function witnessSites(floor) {
  const out = {};
  if (!floor || !floor.ok) return out;
  for (const p of floor.parties) out[p.faction] = p.witnessSites.map((r) => ({ roomId: r.id, area: r.area, depth: r.depth }));
  return out;
}

// facts → per-faction progress + whether the threshold should open. The threshold is Sevin's, and
// it opens only when every faction has been witnessed WITNESS_TARGET times — which, because the
// routes are disjoint, means all three descents have actually been walked.
export function thresholdState(floor, facts) {
  const f = facts || {};
  const per = {};
  for (const fac of RIND_FACTIONS) per[fac] = Math.max(0, Math.min(WITNESS_TARGET, Number(f['fw.' + fac]) || 0));
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  const open = RIND_FACTIONS.every((fac) => per[fac] >= WITNESS_TARGET);
  return { per, total, need: RIND_FACTIONS.length * WITNESS_TARGET, open, chosen: f['flag.chosen_faction'] || null };
}

// ── the only I/O ─────────────────────────────────────────────────────────────────────────────────
// A thin wrapper so the surface has one call and the kernel above stays pure. Deliberately NOT
// vendored: foam owns the geometry, hoop reads it. `fetchImpl` is injectable so tests never touch
// the network. Resolves { ok:false, reason } on any failure — the rind becoming unavailable must
// leave the player in the nave, not break the game.
export const FOAM_API = 'https://foam.mino.mobi/api/dungeon';
export async function fetchRindFloor(worldSeed, { params = {}, fetchImpl = null, base = FOAM_API, signal = null } = {}) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return { ok: false, reason: 'no fetch available' };
  const url = `${base}?${floorQuery(worldSeed, params)}`;
  try {
    const res = await f(url, signal ? { signal } : undefined);
    if (!res || !res.ok) return { ok: false, reason: `foam responded ${res ? res.status : '(no response)'}`, url };
    const doc = await res.json();
    const floor = readRindFloor(doc, { worldSeed });
    return floor.ok ? { ...floor, url, doc } : { ...floor, url };
  } catch (err) {
    return { ok: false, reason: 'foam unreachable: ' + String((err && err.message) || err), url };
  }
}

export default {
  RIND_FACTIONS, WITNESS_TARGET, FLOOR_PARAMS, FOAM_API,
  floorQuery, floorSignature, readRindFloor, seatBundles, witnessSites, thresholdState, fetchRindFloor,
};
