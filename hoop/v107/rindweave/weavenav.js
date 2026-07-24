// weavenav.js — WAYPOINTS THROUGH THE WEAVE, with minimal antechamber crossings.
//
// The question the weave answered was "how do we intersect these threads without ladders"; the
// question THIS module answers is "which door next". The pocket dimension is a graph of pockets
// joined by zero-grade crossings (X interfaces, ring antechambers, the two nexus bonds); a quest
// target lives in some pocket (npcs: always a white thread), the player stands in another, and the
// ◇ must lead them door by door. The router runs on the ANALYTIC layer alone — every door's
// existence and position is known a priori from the weave (stations, ring slots, pair keys) — so a
// route resolves even into pockets that haven't streamed in yet.
//
// COST MODEL: crossings dominate lexicographically (cost = crossings·1e6 + walking distance), so
// Dijkstra returns the minimal-crossing route, ties broken by real walking distance (thread arc /
// ring arc / a small hex constant). Consequences the design predicts, pinned by the selftest:
//   • white → white transfers come back through the CORE — thread → antechamber → the assembly
//     ring → antechamber → thread (4 crossings) — unless the two threads share a station-adjacent
//     engine that happens to be cheaper (still ≥4 crossings via X·hall·X, so the ring wins ties by
//     distance only when it genuinely is shorter);
//   • a thread and its ring-pair partner (W_i ↔ P_i) meet in ONE shared beefy antechamber
//     (2 crossings);
//   • the NAVE is reached only through the TOP-FLOOR NEXUS (…→ RA → NX → lift), the LOWER RIND
//     only through the BOTTOM-FLOOR NEXUS (…→ RR → ND → shaft) — the two virtual endpoints.
//
// Pure, deterministic, no DOM; node-tested by ../test/weavenav.selftest.mjs.

import { PAIRS, anteKey, anteParts, isAnte, RING_ORDER } from './pocketdeck.js';

const TAU = Math.PI * 2;
const CROSS = 1e6;   // one door crossing outweighs any walkable distance — crossings minimize first

// ── the abstract door set (analytic — no solve needed) ───────────────────────────────────────
// Every door is { id, key, toKey, param } where param locates it INSIDE its pocket for distance:
// threads: u ∈ [0,1] along the band (×targetArc for units) · rings: angle · hex pockets: 0.
export function buildWeaveNav(st) {
  const doors = [], byPocket = new Map(), byPair = new Map();
  const add = (key, toKey, param) => {
    const id = doors.length;
    const d = { id, key, toKey, param };
    doors.push(d);
    let g = byPocket.get(key); if (!g) byPocket.set(key, g = []);
    g.push(id);
    const pid = [key, toKey].sort().join('|');
    let p = byPair.get(pid); if (!p) byPair.set(pid, p = []);
    p.push(id);
    return d;
  };
  // threads: hub → ZA ante (u 0), rim → ZR ante (u 1), one station door per crossing
  for (const key of RING_ORDER) {
    const p = st.pockets.get(key);
    add(key, anteKey('RA', key), 0);
    add(key, anteKey('RR', key), 1);
    for (const s of p.myStations) add(key, 'X' + s.w + ':' + s.f, s.u);
  }
  // ring antechambers: 3 doors each (ring + the pair's two threads)
  for (let i = 0; i < 6; i++) {
    for (const ring of ['RA', 'RR']) {
      const k = 'Z' + ring[1] + ':' + PAIRS[i][0] + '+' + PAIRS[i][1];
      add(k, ring, 0); add(k, PAIRS[i][0], 0); add(k, PAIRS[i][1], 0);
    }
  }
  // the rings: 6 ante doors at the odd twelfths + the nexus bond
  for (let i = 0; i < 6; i++) {
    const a = (2 * i + 1) / 12 * TAU;
    add('RA', 'ZA:' + PAIRS[i][0] + '+' + PAIRS[i][1], a);
    add('RR', 'ZR:' + PAIRS[i][0] + '+' + PAIRS[i][1], a);
  }
  add('RA', 'NX', 0.35 / 12 * TAU);
  add('RR', 'ND', (6 + 0.35) / 12 * TAU);
  // the two nexuses: the ring bond + the vertical (virtual) endpoint
  add('NX', 'RA', 0); add('NX', 'NAVE', 0);
  add('ND', 'RR', 0); add('ND', 'LOWER', 0);
  add('NAVE', 'NX', 0);
  add('LOWER', 'ND', 0);
  // X interfaces: two doors each (back to the white, back to the engine)
  for (const s of st.stations) {
    const k = 'X' + s.w + ':' + s.f;
    add(k, 'W' + s.w, 0); add(k, 'P' + s.f, 0);
  }
  return { st, doors, byPocket, byPair };
}

// walking distance between two params INSIDE one pocket
function podDist(st, key, a, b) {
  if (a === b) return 0;
  const p = st.pockets.get(key);
  if (p && p.kind === 'ring') { const rad = p.rad; let d = Math.abs(a - b) % TAU; if (d > TAU / 2) d = TAU - d; return d * rad; }
  if (p && (key[0] === 'W' || key[0] === 'P')) return Math.abs(a - b) * (p.targetArc || 2000);
  return 150;   // antechambers / interfaces / nexuses: one small floor
}

// where is (x, y) inside pocket `key`, as a param (thread u / ring angle / 0)
export function navLocate(st, key, x, y) {
  const p = st.pockets.get(key);
  if (!p) return 0;
  if (p.kind === 'ring') return Math.atan2(y - p.cy, x - p.cx) >= 0 ? Math.atan2(y - p.cy, x - p.cx) : Math.atan2(y - p.cy, x - p.cx) + TAU;
  if (key[0] === 'W' || key[0] === 'P') {
    const sp = p.spine; let bi = 0, bd = Infinity;
    for (let i = 0; i < sp.length; i++) { const d = (sp[i].x - x) ** 2 + (sp[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi / (sp.length - 1);
  }
  return 0;
}

// ── the route: Dijkstra over doors, crossings lexicographically first ─────────────────────────
// from / to: { key, param }. Returns { hops (pocket keys walked, in order), doors (door ids, the
// crossing sequence), crossings, dist } or null (no route — shouldn't happen on the full weave).
export function routeWeave(nav, from, to) {
  const { st, doors, byPocket, byPair } = nav;
  if (from.key === to.key) return { hops: [from.key], doors: [], crossings: 0, dist: podDist(st, from.key, from.param, to.param) };
  // Dijkstra over doors. Standing AT a door (inside door.key's pocket) you can (a) walk to any
  // other door of the same pocket, or (b) cross through the pair to its reciprocal door.
  const dist = new Array(doors.length).fill(Infinity), prev = new Array(doors.length).fill(-1);
  const pq = [];   // [cost, doorId] — a linear-scan pq; the graph is ~230 nodes
  const push = (c, i, p) => { if (c >= dist[i]) return; dist[i] = c; prev[i] = p; pq.push([c, i]); };
  for (const i of byPocket.get(from.key) || []) push(podDist(st, from.key, from.param, doors[i].param), i, -1);
  let bestEnd = -1, bestCost = Infinity;
  while (pq.length) {
    let bi = 0; for (let k = 1; k < pq.length; k++) if (pq[k][0] < pq[bi][0]) bi = k;
    const [c, i] = pq.splice(bi, 1)[0];
    if (c > dist[i] || c >= bestCost) continue;
    const d = doors[i];
    if (d.key === to.key) { const fin = c + podDist(st, to.key, d.param, to.param); if (fin < bestCost) { bestCost = fin; bestEnd = i; } continue; }
    for (const k of byPocket.get(d.key) || []) if (k !== i) push(c + podDist(st, d.key, d.param, doors[k].param), k, i);
    const pid = [d.key, d.toKey].sort().join('|');
    for (const j of byPair.get(pid) || []) if (j !== i && doors[j].key === d.toKey) push(c + CROSS, j, i);
  }
  if (bestEnd < 0) return null;
  const seq = [];
  for (let i = bestEnd; i >= 0; i = prev[i]) seq.push(i);
  seq.reverse();
  // consecutive PAIR-MATES in the chain are crossings (a.toKey===b.key && b.toKey===a.key —
  // impossible for a same-pocket walk step); everything else is walking inside a pocket.
  const doorSeq = [], hops = [from.key];
  for (let k = 0; k + 1 < seq.length; k++) {
    const a = doors[seq[k]], b = doors[seq[k + 1]];
    if (a.toKey === b.key && b.toKey === a.key) { doorSeq.push(seq[k]); hops.push(b.key); }
  }
  return { hops, doors: doorSeq, crossings: doorSeq.length, dist: bestCost - doorSeq.length * CROSS };
}

// a route CONSTRAINED to leave the player's pocket through a given first door (for hysteresis):
// walk to that door, cross, then route freely from the reciprocal side. Null if no such door.
function routeVia(nav, from, to, firstToKey) {
  const { st, doors, byPocket, byPair } = nav;
  const cand = (byPocket.get(from.key) || []).map((i) => doors[i]).find((d) => d.toKey === firstToKey);
  if (!cand) return null;
  const pid = [cand.key, cand.toKey].sort().join('|');
  const recip = (byPair.get(pid) || []).map((i) => doors[i]).find((d) => d.key === cand.toKey);
  if (!recip) return null;
  const walkIn = podDist(st, from.key, from.param, cand.param);
  if (recip.key === to.key) return { crossings: 1, dist: walkIn + podDist(st, to.key, recip.param, to.param), hops: [from.key, to.key], first: cand };
  const rest = routeWeave(nav, { key: recip.key, param: recip.param }, to);
  if (!rest) return null;
  return { crossings: 1 + rest.crossings, dist: walkIn + rest.dist, hops: [from.key, ...rest.hops], first: cand };
}

// ── the surface hook: "aim the ◇" ────────────────────────────────────────────────────────────
// Given player (key,x,y) and target (key,x,y | 'NAVE' | 'LOWER'), return the NEXT waypoint: the
// first crossing door's WORLD position in the player's current pocket (or the target itself when
// already in the same pocket), plus the route breadcrumb for the journal.
//
// HYSTERESIS (opts.prefer = the toKey of the door the ◇ pointed at last time): near-tied routes
// (white→white is often 4 crossings BOTH via the ring and via an engine hall, distance deciding)
// would otherwise flip the marker mid-corridor as the player's position slides the tie. If the
// preferred door still yields a route with THE SAME crossing count and ≤25%+200u extra walk, keep
// pointing at it — the ◇ only re-aims when the old door is genuinely worse, not merely tied.
export function weaveWaypoint(nav, player, target, opts = {}) {
  const { st, doors } = nav;
  const from = { key: player.key, param: navLocate(st, player.key, player.x, player.y) };
  const to = target.key === 'NAVE' || target.key === 'LOWER'
    ? { key: target.key, param: 0 }
    : { key: target.key, param: navLocate(st, target.key, target.x, target.y) };
  if (from.key === to.key) return { x: target.x, y: target.y, label: null, hops: [from.key], crossings: 0, direct: true };
  const r = routeWeave(nav, from, to);
  if (!r || !r.doors.length) return null;
  let first = doors[r.doors[0]], hops = r.hops, crossings = r.crossings;
  if (opts.prefer && first.toKey !== opts.prefer) {
    const via = routeVia(nav, from, to, opts.prefer);
    if (via && via.crossings === r.crossings && via.dist <= r.dist * 1.25 + 200) { first = via.first; hops = via.hops; crossings = via.crossings; }
  }
  const pos = doorWorldPos(st, first);
  if (!pos) return null;
  return { x: pos.x, y: pos.y, label: doorLabel(st, first), hops, crossings, direct: false, toKey: first.toKey };
}

// a door's world position — the SOLVED door cell when the segment is in, else the analytic spot
export function doorWorldPos(st, d) {
  const p = st.pockets.get(d.key);
  if (!p) return null;
  // prefer the placed door cell (exact)
  if (p.doors) for (const pd of p.doors) {
    if (pd.toKey !== d.toKey) continue;
    const rec = p.segs[pd.si] && p.segs[pd.si].rec;
    if (rec && rec.cells[pd.cell]) return { x: rec.cells[pd.cell].x, y: rec.cells[pd.cell].y };
  }
  // analytic fallback
  if (p.kind === 'ring') return { x: p.cx + Math.cos(d.param) * p.rad, y: p.cy + Math.sin(d.param) * p.rad };
  if (d.key[0] === 'W' || d.key[0] === 'P') { const sp = p.spine, i = Math.max(0, Math.min(sp.length - 1, Math.round(d.param * (sp.length - 1)))); return { x: sp[i].x, y: sp[i].y }; }
  const slot = st.slots.get(d.key);
  return slot ? { x: slot.x, y: slot.y } : null;
}

export function doorLabel(st, d) {
  const t = d.toKey;
  return t === 'RA' ? 'the assembly ring' : t === 'RR' ? 'the reclaim ring'
    : t === 'NX' ? 'the fulfillment nexus' : t === 'ND' ? 'the dispatch nexus'
    : t === 'NAVE' ? 'the lift to the nave' : t === 'LOWER' ? 'the shaft to the lower rind'
    : isAnte(t) ? (t[1] === 'A' ? 'an assembly-ring antechamber' : 'a reclaim-ring antechamber')
    : t[0] === 'X' ? 'an interface chamber'
    : t[0] === 'W' ? `the ${st.geo.warps[+t.slice(1)].id} thread` : `the ${st.geo.wefts[+t.slice(1)].id} hall`;
}

// the journal breadcrumb — "→ antechamber → the assembly ring → the perfusion thread"
export function routeBreadcrumb(st, hops) {
  const name = (k) => k === 'RA' ? 'assembly ring' : k === 'RR' ? 'reclaim ring' : k === 'NX' ? 'fulfillment nexus' : k === 'ND' ? 'dispatch nexus'
    : k === 'NAVE' ? 'the nave' : k === 'LOWER' ? 'the lower rind'
    : isAnte(k) ? 'antechamber' : k[0] === 'X' ? 'interface'
    : k[0] === 'W' ? st.geo.warps[+k.slice(1)].id + ' thread' : k[0] === 'P' ? st.geo.wefts[+k.slice(1)].id + ' hall' : k;
  return hops.map(name).join(' → ');
}
