// rind/rind.js — THE RIND: floor 2, the structural skin below the nave — the UPPER RIND.
//
// Per hoopy's bible ("The Seven as Rind Factions"): in the rind you leave the three nave factions and walk
// into the domain of one of the Seven. The thirteen verbs persist but are RE-READ at the ship's true scale
// and age — industrial, liminal, machine-sacred: a workshop becomes a forge-cathedral, a chapel a
// megastructure to a forgotten machine-god. The floor is TAGGED BY WHOSE DOMAIN you are in. The UPPER rind
// is where the strange is still familiar — four of the Seven: Mercury, Mars, Venus, Jupiter. (The LOWER
// rind — Saturn · Sol · Luna, and the Signal Chamber Luna keeps — is the deeper floor, built separately.)
//
//        ┌──────────┐            Mercury (the arteries) is the HUB — the shaft foot, where you arrive from
//  mars  │ mercury ★│  venus     the nave and disperse — with three domain-stations spoked off alternating
//        └────┬─────┘            hex sides (dirs 0·2·4, so the spokes touch only the hub). Hub links to all
//          jupiter                three; the three don't interlink. The hub carries the shaft UP to the
//                                 nave commons (sunk in-game by descent.js).
//
// Built by composing the SAME v2 engine as the nave (solveChunk + explicit closedSides + inherited seam
// ports + one shared foam seed), so the floors are siblings, not special cases. Pure (no DOM); node-tested
// in test/rind.selftest.mjs. The game streams it in on descent, paced like the nave wards.
//
// NB: this is the GAME's rind FLOOR — the playable cousin of the repo-root `/rind` structural-modelling
// WING (which models the cylinder's hull/cables). Same name, different layer: one you walk, one you solve.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { createWorld, addChunk, midKey, buildWalk } from '../v099/v8/manager.js';
import { ROLES } from '../v099/econ/econ.js';
import { TRAFFIC_FOOTPRINT, GRAND_MIN, MIN_ROOM } from '../v099/rooms.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../chunkroller/shapes.js';
import { latticeVectors } from '../chunkroller/builder.js';

// ── the upper rind's four domains of the Seven. Each re-reads the nave's verbs at scale (bible §"The Seven
// as Rind Factions"): the verb mix is the domain's verbs cranked, a `grand` is its signature megastructure,
// and roles not listed get weight 0 so each chunk reads unmistakably as one of the Seven's domains.
//   • Mercury — signals/transit between zones → move·trade·learn (the humming arteries; the shaft-foot hub).
//   • Mars    — hull, welding, damage-control → make·mend (the forge-cathedral; repair as rite at scale).
//   • Venus   — green decks, life-support     → grow·heal (vast strange gardens off any botanist's schedule).
//   • Jupiter — the long table, court         → govern·play (an abandoned hall of judgment too large to fill).
// (Grow + play live HERE now — Venus's gardens, Jupiter's court — the bible re-reads every verb at scale;
// the old "infrastructure only, no grow/play" rind was built off a now-outdated doc.)
export const RIND_CHUNKS = [
  { key: 'rind-mercury', label: 'Mercury · the Arteries',       station: 'mercury', color: '#9aa6b2',
    mix: [['move', 3.0], ['trade', 2.2], ['learn', 2.0], ['store', 1.4], ['dwell', 1.2]], floors: { move: 1, trade: 1, learn: 1, dwell: 1 }, grand: ['move'] },
  { key: 'rind-mars',    label: 'Mars · the Forge-Cathedral',   station: 'mars',    color: '#b5462f',
    mix: [['make', 3.0], ['mend', 2.6], ['store', 1.6], ['dwell', 1.0]], floors: { make: 1, mend: 1, dwell: 1 }, grand: ['make'] },
  { key: 'rind-venus',   label: 'Venus · the Green Deep',       station: 'venus',   color: '#5a9e6f',
    mix: [['grow', 3.0], ['heal', 2.4], ['serve', 1.5], ['dwell', 1.0]], floors: { grow: 1, heal: 1, dwell: 1 }, grand: ['grow'] },
  { key: 'rind-jupiter', label: 'Jupiter · the Long Table',     station: 'jupiter', color: '#c2a24a',
    mix: [['govern', 3.0], ['play', 2.4], ['serve', 1.4], ['dwell', 1.0]], floors: { govern: 1, play: 1, dwell: 1 }, grand: ['govern'] },
];

// the hub is chunk 0; the three stations spoke off hex directions 0·2·4 (alternating → mutually
// non-adjacent, so the only seams are hub↔station). CONNECTIONS are hub→each station.
export const SPOKE_DIRS = [0, 2, 4];
const CONNECTIONS = [[0, 1], [0, 2], [0, 3]];

// the side of polygon A (by direction) that abuts polygon B — matched on shared segment midpoints.
// (Identical to nave.js#sharedSide; the bounded-floor seam contract is shared.)
function sharedSide(polyA, sideOf, polyB) {
  const bKeys = new Set(); for (let e = 0; e < polyB.length; e++) bKeys.add(midKey(polyB, e));
  for (let k = 0; k < 6; k++) { const ks = []; for (let e = 0; e < polyA.length; e++) if (sideOf[e] === k) ks.push(midKey(polyA, e)); if (ks.length && ks.every((x) => bKeys.has(x))) return k; }
  return -1;
}

// biome (roleMix/roleFloors/grand) for rind chunk i.
export function rindBiome(i) {
  const c = RIND_CHUNKS[i] || RIND_CHUNKS[0];
  return { key: c.key, label: c.label, station: c.station, color: c.color, roleMix: c.mix, roleFloors: c.floors, grand: c.grand };
}

// ── THE LOWER RIND (bible Zone 4) — the deep stasis machinery that predates civilization aboard. Three of
// the Seven whose domains predate the Nave (Saturn · Sol · Luna), plus the **Signal Chamber** — Luna's lost
// inner sanctum, "whose position has been lost to the sands of time," the descent's payoff where Luna makes
// contact through the terminal that uses the name she knows. Register: cosmic, machine-sacred, stasis-
// without-witness. Saturn is the HUB (the shaft foot from the upper rind — the keeper of the oldest layer).
//   • Saturn — cold hull, structural deep, the tale-count → worship·store·dwell (the machine-god register).
//   • Sol    — the fusion-heart → worship·make (the literal burning center; most sacred, least survivable).
//   • Luna   — navigation, dream-logs → learn·store (the archives of the ship's dreaming; she knows your name).
//   • Signal Chamber — Luna's lost sanctum → learn·worship (the contact terminal; the chapter's close).
export const LOWER_RIND_CHUNKS = [
  { key: 'lower-saturn', label: 'Saturn · the Cold Deep',     station: 'saturn', color: '#6b6f7a',
    mix: [['worship', 3.0], ['store', 2.4], ['dwell', 1.8], ['mend', 1.0]], floors: { worship: 1, store: 1, dwell: 1 }, grand: ['worship'] },
  { key: 'lower-sol',    label: 'Sol · the Fusion-Heart',     station: 'sol',    color: '#e8b54a',
    mix: [['worship', 3.0], ['make', 2.6], ['mend', 1.6], ['dwell', 1.0]], floors: { worship: 1, make: 1, dwell: 1 }, grand: ['make'] },
  { key: 'lower-luna',   label: 'Luna · the Dream-Archive',   station: 'luna',   color: '#8aa0c8',
    mix: [['learn', 3.0], ['store', 2.6], ['dwell', 1.2]], floors: { learn: 1, store: 1, dwell: 1 }, grand: ['learn'] },
  { key: 'lower-signal', label: 'The Signal Chamber',         station: 'signal', color: '#b39bd8',
    mix: [['learn', 3.0], ['worship', 2.4], ['store', 1.6], ['dwell', 1.0]], floors: { learn: 1, worship: 1, dwell: 1 }, grand: ['learn'] },
];
// biome for lower-rind chunk i (same shape as rindBiome, over LOWER_RIND_CHUNKS).
export function lowerRindBiome(i) {
  const c = LOWER_RIND_CHUNKS[i] || LOWER_RIND_CHUNKS[0];
  return { key: c.key, label: c.label, station: c.station, color: c.color, roleMix: c.mix, roleFloors: c.floors, grand: c.grand };
}

// prepare the rind layout (cheap: geometry + topology, no solving). Returns a STATE driven one chunk at a
// time by rindSolveNext — so the game can pace the four solves on descent (streamed like the nave wards)
// instead of freezing on a single block. The hub (0) solves first so the stations can inherit its ports.
export function prepareRind(seed, { shape = SAMPLE_SHAPE, W = 900, H = 600, roomSize = 12, cx = W / 2, cy = H / 2, biome = rindBiome } = {}) {
  seed = (seed | 0) >>> 0;
  const R = Math.min(W, H) * 0.46;
  const poly0 = shapePoly(shape, cx, cy, R), sideOf = shapeSideOf(shape);
  const T = latticeVectors(poly0, sideOf);
  const polys = [poly0]; for (const d of SPOKE_DIRS) polys.push(poly0.map((p) => ({ x: p.x + T[d].x, y: p.y + T[d].y })));
  const activeSides = polys.map(() => new Set());
  for (const [a, b] of CONNECTIONS) {
    const sa = sharedSide(polys[a], sideOf, polys[b]), sb = sharedSide(polys[b], sideOf, polys[a]);
    if (sa >= 0) activeSides[a].add(sa);
    if (sb >= 0) activeSides[b].add(sb);
  }
  // `biome(i)` maps chunk index → its domain (roleMix/floors/grand/label/station). Default = the UPPER rind
  // (Mercury/Mars/Venus/Jupiter); prepareLowerRind passes lowerRindBiome (Saturn/Sol/Luna + the Signal
  // Chamber). The geometry/topology is identical — only the domains differ — so the two floors share this.
  return { seed, W, H, cx, cy, sideOf, polys, activeSides, roomSize, biome, recs: [], meta: [], order: polys.map((_, i) => i), idx: 0 };
}
// prepare the LOWER rind: the same four-chunk star, but the deep domains (Saturn hub · Sol · Luna · the
// Signal Chamber). Reached by descending a SECOND shaft from the upper rind (the game offsets it again).
export function prepareLowerRind(seed, opts = {}) { return prepareRind(seed, { ...opts, biome: lowerRindBiome }); }

// solve the NEXT rind chunk; stores it in st.recs[i] and returns { i, rec } (or null when all four done).
// The caller decides which world to add it to — buildRind adds to a fresh world; the game addChunks each
// rec into the live world tagged deck = 1. Inherited ports come from already-solved neighbours (the hub).
export function rindSolveNext(st) {
  if (st.idx >= st.order.length) return null;
  const i = st.order[st.idx++], sideOf = st.sideOf;
  const closed = []; for (let k = 0; k < 6; k++) if (!st.activeSides[i].has(k)) closed.push(k);
  const inherit = [];
  for (const [a, b] of CONNECTIONS) {
    const j = a === i ? b : b === i ? a : -1; if (j < 0 || !st.recs[j]) continue;
    const sj = sharedSide(st.polys[j], sideOf, st.polys[i]);
    for (const p of st.recs[j].ports) if (sideOf[p.edge] === sj) inherit.push({ x: p.x, y: p.y });
  }
  const bi = (st.biome || rindBiome)(i);
  const rec = solveChunk({
    poly: st.polys[i], sideOf, inherit, closedSides: closed,
    seed: (st.seed ^ (i * 0x9e37 + 0x51)) >>> 0, foamSeed: st.seed, W: st.W, H: st.H,
    roomSize: st.roomSize, footprint: TRAFFIC_FOOTPRINT,
    grand: bi.grand, grandMin: GRAND_MIN, minRoom: MIN_ROOM, roleMix: bi.roleMix, roleFloors: bi.roleFloors,
    v2: true, tension: 0.6, portRange: [1, 1],
  });
  st.recs[i] = rec;
  st.meta[i] = { key: bi.key, label: bi.label, station: bi.station, color: bi.color, dir: i === 0 ? -1 : SPOKE_DIRS[i - 1] };
  return { i, rec };
}

// build the whole rind in one go (the standalone view + tests). Returns world (4 records), per-chunk meta,
// the connection graph + bbox. Deterministic from `seed` (one shared foam seed → seamless seams).
export function buildRind(seed, opts) {
  const st = prepareRind(seed, opts);
  const world = createWorld();
  let r; while ((r = rindSolveNext(st))) addChunk(world, r.rec);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ch of world.chunks) for (const p of ch.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { world, meta: st.meta, connections: CONNECTIONS, sideOf: st.sideOf, bbox: { x0, y0, x1, y1 }, seed: st.seed };
}
// build the whole LOWER rind in one go (the deep domains). Same shape as buildRind; rindSolveNext reads the
// lower-rind biome off the state, so the only difference is the domains.
export function buildLowerRind(seed, opts = {}) { return buildRind(seed, { ...opts, biome: lowerRindBiome }); }

// connectivity check (page + tests): which chunk pairs actually share a seam crossing — should equal
// CONNECTIONS exactly (hub links all three stations; the stations never link to each other).
export function rindLinks(rind) {
  const walk = buildWalk(rind.world);
  const portLoc = rind.world.chunks.map((ch) => new Set(ch.ports.filter((p) => p.cell != null && p.cell >= 0).map((p) => Math.round(p.x) + ',' + Math.round(p.y))));
  const linked = new Set();
  for (let a = 0; a < portLoc.length; a++) for (let b = a + 1; b < portLoc.length; b++) { for (const k of portLoc[a]) if (portLoc[b].has(k)) { linked.add(a + '-' + b); break; } }
  return { walk, linked };
}

// the union of roles the upper rind ever places (for the manifest/lexicon cousin + tests): the four
// domains' verbs re-read at scale — make·mend (Mars) · grow·heal (Venus) · govern·play (Jupiter) ·
// move·trade·learn (Mercury) + store + dwell. (No worship here — that is Saturn/Sol, the lower rind.)
export function rindRoles() {
  const s = new Set(); for (const c of RIND_CHUNKS) for (const [r] of c.mix) s.add(r);
  return [...s].filter((r) => ROLES[r]).sort();
}
// the union of roles the LOWER rind ever places: the deep domains' verbs — worship·store·dwell (Saturn) ·
// worship·make (Sol) · learn·store (Luna) · learn·worship (the Signal Chamber). The sacred/archive register.
export function lowerRindRoles() {
  const s = new Set(); for (const c of LOWER_RIND_CHUNKS) for (const [r] of c.mix) s.add(r);
  return [...s].filter((r) => ROLES[r]).sort();
}
