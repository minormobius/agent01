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
// VERSION DRIFT — closed. foam's generator is deterministic only *under one* `DUNGEON_VERSION`,
// and a bump legitimately moves layouts (v2 removed flat ground, v3 added trapdoors, v4 added
// loops), so an unpinned floor could silently relocate a player's crystallizations. The API now
// takes `v=`: it serves exactly that generator or refuses with a 409 naming the current and
// available versions. Geometry is never silently substituted. So hoop PINS (`PINNED_VERSION`),
// and foam's freeze policy — bumping the version must freeze the outgoing generator as a
// versioned module and register it — is what keeps a pinned floor stable across their bumps.
//
// The failure mode this buys is the one worth having: if v4 is ever retired, our requests fail
// LOUDLY (409) instead of quietly returning different floors. Treat a 409 as "re-survey the rind",
// never as "fall back to latest" — falling back is exactly the silent substitution the pin exists
// to prevent.
//
// Responses also carry `x-layout-signature`, a hash of the layout-bearing subset of the document
// and the same fingerprint foam's CI pins golden signatures against. That is what a save should
// store; we do not re-derive it.
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
// The generator hoop is pinned to. Bump this DELIBERATELY, together with a re-survey: every
// rind floor in every world moves when it changes.
export const PINNED_VERSION = 4;
export const FLOOR_PARAMS = { starts: 3, size: 'l', shape: 'hex', scale: 0.35, v: PINNED_VERSION };

export const floorQuery = (worldSeed, params = {}) => {
  const p = { ...FLOOR_PARAMS, ...params, seed: (worldSeed >>> 0) };
  return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
};

// ── reading the document ─────────────────────────────────────────────────────────────────────────
const isConfluence = (doc) => !!(doc && doc.format === 'foam-dungeon' && doc.confluence
  && Array.isArray(doc.confluence.entrances) && doc.confluence.chamber != null);

// doc → the rind floor hoop plays on. Returns { ok:false, reason } rather than throwing: a floor
// that cannot be read must degrade to "the rind is not available", never break the surface.
//
// `layoutSignature` is foam's `x-layout-signature` response header — the fingerprint to persist
// and compare. It is deliberately NOT derived from the document here: foam computes it over the
// layout-bearing subset and pins golden values against it in CI, so re-deriving would invent a
// second, weaker notion of "the same floor" that could disagree with theirs.
export function readRindFloor(doc, { worldSeed = 0, layoutSignature = null } = {}) {
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
    signature: layoutSignature,          // foam's x-layout-signature; null when read from a saved doc
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
    // 409 = OUR PIN IS GONE. foam refuses rather than substituting geometry, naming what it has.
    // This is a re-survey, never a retry without the pin: falling back to latest would hand every
    // player a different rind and silently orphan their crystallizations — the exact failure the
    // pin exists to prevent. Surface it; do not paper over it.
    if (res && res.status === 409) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false, retired: true, url,
        requested: body.requested ?? PINNED_VERSION,
        current: body.current ?? null,
        available: body.available || [],
        reason: `foam no longer carries dungeon v${body.requested ?? PINNED_VERSION}`
          + (body.available && body.available.length ? ` (has ${body.available.join(', ')})` : '')
          + ' — the rind must be re-surveyed against a new pin, not silently re-served',
      };
    }
    if (!res || !res.ok) return { ok: false, reason: `foam responded ${res ? res.status : '(no response)'}`, url };
    const doc = await res.json();
    const sig = (res.headers && typeof res.headers.get === 'function') ? res.headers.get('x-layout-signature') : null;
    const floor = readRindFloor(doc, { worldSeed, layoutSignature: sig });
    return floor.ok ? { ...floor, url, doc } : { ...floor, url };
  } catch (err) {
    return { ok: false, reason: 'foam unreachable: ' + String((err && err.message) || err), url };
  }
}

export default {
  RIND_FACTIONS, WITNESS_TARGET, FLOOR_PARAMS, FOAM_API, PINNED_VERSION,
  floorQuery, readRindFloor, seatBundles, witnessSites, thresholdState, fetchRindFloor,
};
