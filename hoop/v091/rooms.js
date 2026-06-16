// rooms.js — v091 ROOM TRAFFIC SIZING policy (item #2).
//
// v090 sized every room the same (paintRooms split a pocket into equal-area rooms, role assigned
// afterward). v091 makes more heavily TRAFFICKED rooms bigger: a room's footprint (its cell count)
// is weighted by its role, where the weight is a proxy for how many people pass through. Busy hubs
// (council, worship, recreation, café/third-places, learning, market) claim more cells; quiet rooms
// (dwellings, stores, porter posts) claim fewer. The extra elbow-room in the busy rooms is exactly
// what keeps the half-size, separated NPCs from crowding (item #1).
//
// This is the ONLY knob for the sizing — the shared engine (paint/foam chunkgen) just consumes the
// map as generic Dijkstra weights. Tune these numbers; the weighted mean is kept ≈ 1 under the
// engine's ROLE_MIX so the overall room COUNT / density barely moves — sizes just redistribute.
//
//   weighted mean over ROLE_MIX = Σ(mix_w · footprint) / Σ mix_w ≈ 1.01  (room count ≈ unchanged)
//
// Pure data, zero-dep — imported by the page (into the chunk-gen opts) and pinned by
// test/v091rooms.selftest.mjs.
export const TRAFFIC_FOOTPRINT = {
  dwell: 0.7,   // homes — few residents, low foot traffic
  store: 0.7,   // logistics — barely visited
  move: 0.8,    // porter / transit post
  mend: 1.0,    // repairer
  grow: 1.1,    // garden / farm — large yield, modest visitors
  make: 1.25,   // forge / workshop
  heal: 1.3,    // clinic
  trade: 1.4,   // market — a real crowd
  serve: 1.5,   // café / host — a third place
  learn: 1.5,   // lore / school — a third place
  play: 1.6,    // recreation — a third place
  worship: 1.6, // worship — a third place
  govern: 1.8,  // council / order — the busiest civic hub
};

// the hubs (footprint ≥ ~1.4) vs the quiet rooms (≤ ~0.8) — used by the self-test to assert the split.
export const HUB_ROLES = Object.keys(TRAFFIC_FOOTPRINT).filter((r) => TRAFFIC_FOOTPRINT[r] >= 1.4);
export const QUIET_ROLES = Object.keys(TRAFFIC_FOOTPRINT).filter((r) => TRAFFIC_FOOTPRINT[r] <= 0.8);

// GRAND ROLES — the civic centrepieces. A big pocket (≥ GRAND_MIN room-units) is biased to plant one
// of these as its anchor room (weighted toward the grandest by footprint), so a council hall / temple /
// forum reliably reads as the heart of a large district instead of being a coin-flip away.
export const GRAND_ROLES = ['serve', 'learn', 'play', 'worship', 'govern'];
export const GRAND_MIN = 3;

// MIN_ROOM — bulldoze any room under this many engine cells: too small to seat a fixture, so it gets
// merged into its largest neighbour (or handed back to the concourse). Keeps the micro-room litter out.
export const MIN_ROOM = 5;
