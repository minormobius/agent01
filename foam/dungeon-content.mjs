// foam/dungeon-content.mjs — the CONTENT layer: loot, traps, obstacles and
// enemies rolled as a SEPARATE seeded pass on top of a finished map.
//
// The map and its contents are deliberately different documents with
// different seeds. A map permalink freezes geometry forever; a content roll
// binds to that geometry through its layout signature and can be rerolled
// endlessly without touching the map — same dungeon, different furnishing.
// Everything reduces to two primitives:
//
//   TILE EFFECTS — things that ARE a tile: loot caches, endpoint treasure,
//     traps (hidden until stepped on), obstacles (impassable rubble).
//   AGENTS — things that STAND on a tile and act: enemies, typed by depth.
//
// Placement rules the roller enforces (and the selftest pins):
//   - door / entrance / goal marker tiles are reserved: no effects, no
//     agents (treasure is the one exception — it sits ON the goal marker).
//   - the entrance room is safe ground: loot at most, nothing hostile.
//   - every endpoint room holds a treasure and a guardian.
//   - one thing per tile, across both primitives.
//   - obstacles may NEVER break the dungeon: after placement the crawl
//     graph is re-checked with obstacles blocked, and obstacles are removed
//     (deterministically, newest first) until entrance → every endpoint is
//     walkable again.
//
// Deterministic: (layout signature, roll) → identical content, everywhere.

import { fnv, mulberry } from './foamworld.js';
import { layoutSignature } from './dungeon-export.mjs';
import { crawlReport } from './dungeon-crawl.mjs';

// v1 → v2: TUNING. rollContent takes a tuning block — proportion dials for
// each category and a DIRECTION for danger: gradient +1 ramps hostiles
// toward the endpoints (the classic), 0 spreads them flat, −1 inverts the
// dungeon (deadly at the door, quiet in the deep). The tuning is recorded
// in the document: (mapSig, roll, tuning) → identical content, and the
// /dungeon/content/ page is the console for it.
//
// v2 → v3: LINES MADE OF TILES. Obstacles and traps are no longer lone
// tiles wearing outlines — they are RUNS of tiles laid along a lattice
// direction: rubble WALLS and TRIPWIRES, either full-span (across the room
// until the floor runs out) or partial (a 2–4 tile segment). Each tile in a
// run carries `line` (a per-document run id) and `span: 'full'|'partial'`.
// Renderers fill the tiles — a linear feature you read at a glance — and
// the safety gate still carves the minimal gap through any wall that would
// sever the dungeon.
// v3 → v4: WALLS NEVER PARTITION. The crawl graph's sampling bridges are
// now computed from geometry alone (a bridge could previously hop
// apex-to-apex across a wall — found by a human crawler walking through a
// solid one), and the gate gained a second invariant: every room's free
// tiles stay one connected component. Rubble is texture and cover; a
// spanning wall keeps a breach.
export const CONTENT_VERSION = 4;

export const DEFAULT_TUNING = {
  loot: 1,        // 0..2 — cache/treasure abundance
  traps: 1,       // 0..2 — trap density
  obstacles: 1,   // 0..2 — rubble density
  enemies: 1,     // 0..2 — enemy density (endpoint guardians always stand)
  toughness: 1,   // 0..2 — shifts the mite→shade→wraith bands
  gradient: 1,    // −1..1 — danger direction: +deep, 0 flat, −entrance
};

// enemy types by depth band; bump combat: player deals 1, enemy deals `dmg`
// when bumped and again when adjacent at end of turn
export const ENEMY_TYPES = {
  mite:   { hp: 1, dmg: 1, gold: 2,  color: '#9fd86e' },
  shade:  { hp: 2, dmg: 1, gold: 5,  color: '#8fa0ff' },
  wraith: { hp: 3, dmg: 2, gold: 12, color: '#ff7ea0' },
};

export function rollContent(json, opts = {}) {
  const roll = Math.max(1, Math.floor(opts.roll ?? 1));
  const T = { ...DEFAULT_TUNING, ...(opts.tuning ?? {}) };
  const sig = layoutSignature(json);
  const rng = mulberry(fnv(0xC0A7E47, sig, roll));
  const maxDepth = Math.max(1, ...json.rooms.map((r) => r.depth));
  // the danger direction: remap depth by the gradient. +1 keeps depth as
  // is, 0 flattens everything to the middle band, −1 mirrors the dungeon.
  const eff = (depthT) => Math.min(1, Math.max(0, 0.5 + T.gradient * (depthT - 0.5)));
  const tier = (depthT) => Math.min(1, Math.max(0, eff(depthT) * T.toughness));
  const effects = [], agents = [];
  const taken = new Set();               // 'room:tile' with anything on it
  let agentId = 0;

  // trapdoor passage endpoints stay clear — landing on a spike trap after a
  // blind drop is unfair even by this dungeon's standards
  for (const td of json.trapdoors ?? []) {
    taken.add(td.fromRoom + ':' + td.fromTile);
    taken.add(td.toRoom + ':' + td.toTile);
  }

  const place = (room, tile, rec) => { taken.add(room.id + ':' + tile.key); rec.room = room.id; rec.tile = tile.key; return rec; };
  const takeTile = (room, cand) => {
    while (cand.length) {
      const t = cand.splice(Math.floor(rng() * cand.length), 1)[0];
      if (!taken.has(room.id + ':' + t.key)) return t;
    }
    return null;
  };

  // -- line laying: walk the lattice from a start tile in a direction (and
  //    its opposite, for full spans), collecting free floor tiles
  const shape = json.tile.shape;
  const DIRS = shape === 'hex'
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stepKey = (t, d) => shape === 'hex'
    ? (t.q === undefined ? null : (t.q + d[0]) + ',' + (t.r + d[1]))
    : (t.i === undefined ? null : (t.i + d[0]) + ',' + (t.j + d[1]));
  const walkLine = (room, byKey, start, dir, maxLen, out) => {
    let cur = start;
    while (cur && out.length < maxLen) {
      if (cur !== start && (cur.kind !== 'floor' || taken.has(room.id + ':' + cur.key))) break;
      if (!out.includes(cur)) out.push(cur);
      const nk = stepKey(cur, dir);
      cur = nk ? byKey.get(nk) : null;
    }
  };
  let lineId = 0;
  // aperiodic tiles have no lattice direction — lines walk by ANGLE: pick a
  // bearing, then repeatedly step to the edge-adjacent neighbour best
  // aligned with it. Adjacency from shared rounded polygon vertices.
  const polyAdjCache = new Map();
  const polyAdjacency = (room) => {
    if (polyAdjCache.has(room.id)) return polyAdjCache.get(room.id);
    const vk = (p) => Math.round(p[0] * 512) + ',' + Math.round(p[1] * 512);
    const adj = new Map(room.tiles.map((t) => [t.key, []]));
    const owner = new Map();
    for (const t of room.tiles) {
      if (!t.poly) continue;
      for (let i = 0; i < t.poly.length; i++) {
        const a = vk(t.poly[i]), b = vk(t.poly[(i + 1) % t.poly.length]);
        const ek = a < b ? a + '|' + b : b + '|' + a;
        const o = owner.get(ek);
        if (o !== undefined && o !== t.key) { adj.get(t.key).push(o); adj.get(o).push(t.key); }
        else owner.set(ek, t.key);
      }
    }
    polyAdjCache.set(room.id, adj);
    return adj;
  };
  const layLineAngular = (room, byKey, cand, maxLen, full) => {
    const start = takeTileLattice(room, cand);   // any non-fallback tile
    if (!start) return null;
    const adj = polyAdjacency(room);
    const th = rng() * 2 * Math.PI;
    const walkDir = (dirX, dirZ, out) => {
      let cur = start;
      for (;;) {
        if (out.length >= (full ? 99 : maxLen)) break;
        let best = null, bs = 0.35;
        for (const nk of adj.get(cur.key) ?? []) {
          const n = byKey.get(nk);
          if (out.includes(n) || n === start) continue;
          if (n.kind !== 'floor' || taken.has(room.id + ':' + n.key)) continue;
          const dx = n.x - cur.x, dz = n.z - cur.z;
          const L = Math.hypot(dx, dz) || 1;
          const cos = (dx * dirX + dz * dirZ) / L;
          if (cos > bs) { bs = cos; best = n; }
        }
        if (!best) break;
        out.push(best);
        cur = best;
      }
    };
    const out = [start];
    walkDir(Math.cos(th), Math.sin(th), out);
    if (full) walkDir(-Math.cos(th), -Math.sin(th), out);
    return out.length ? { tiles: out, line: lineId++, span: full ? 'full' : 'partial' } : null;
  };
  const layLine = (room, byKey, cand, maxLen, full) => {
    if (shape !== 'grid' && shape !== 'hex') return layLineAngular(room, byKey, cand, maxLen, full);
    const start = takeTileLattice(room, cand);
    if (!start) return null;
    // try a few directions from the same start, keep the longest run — a
    // one-tile "line" defeats the point
    const d0 = Math.floor(rng() * DIRS.length);
    let best = null;
    for (let k = 0; k < 3; k++) {
      const dir = DIRS[(d0 + k) % DIRS.length];
      const out = [];
      walkLine(room, byKey, start, dir, full ? 99 : maxLen, out);
      if (full) walkLine(room, byKey, start, [-dir[0], -dir[1]], 99, out);
      if (!best || out.length > best.length) best = out;
      if (best.length >= (full ? 4 : maxLen)) break;
    }
    return best?.length ? { tiles: best, line: lineId++, span: full ? 'full' : 'partial' } : null;
  };
  const takeTileLattice = (room, cand) => {
    // line starts need lattice coords (the rare fallback tile has none)
    for (let i = 0; i < cand.length; i++) {
      const j = Math.floor(rng() * cand.length);
      const t = cand[j];
      if (t.key !== 'c' && !taken.has(room.id + ':' + t.key)) { cand.splice(j, 1); return t; }
    }
    return null;
  };

  for (const room of json.rooms) {
    // candidates: plain floor tiles only — markers stay reserved
    const cand = room.tiles.filter((t) => t.kind === 'floor');
    const depthT = room.depth / maxDepth;
    const isEntrance = room.role === 'entrance';
    const isEndpoint = room.role === 'endpoint';

    if (isEndpoint) {
      // the prize sits on the goal marker itself; a guardian stands nearby —
      // in this room, or (when the room is all markers, no free floor) on
      // the threshold: the room across its first door
      const goal = room.tiles.find((t) => t.kind === 'goal') ?? cand[0];
      if (goal) effects.push(place(room, goal, { type: 'treasure', gold: 25 + room.depth * 2 }));
      const type = tier(depthT) > 0.75 ? 'wraith' : 'shade';
      let g = takeTile(room, cand), gRoom = room;
      if (!g) {
        for (const d of room.doors) {
          const far = json.rooms.find((r) => r.id === d.to);
          const farCand = far.tiles.filter((t) => t.kind === 'floor');
          g = takeTile(far, farCand);
          if (g) { gRoom = far; break; }
        }
      }
      if (g) agents.push(place(gRoom, g, { id: agentId++, type, hp: ENEMY_TYPES[type].hp }));
    }

    const d = eff(depthT);             // gradient-remapped danger depth
    // loot: likelier and richer the deeper you are, scaled by the dial
    if (rng() < Math.min(0.95, (isEntrance ? 0.35 : 0.4 + depthT * 0.35) * T.loot)) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, { type: 'loot', gold: 4 + Math.floor(rng() * 8) + Math.floor(room.depth * 0.8) }));
    }
    if (isEntrance) continue;          // safe ground: nothing hostile below

    const byKey = new Map(room.tiles.map((t) => [t.key, t]));

    // trap TRIPWIRES: runs of trap tiles sharing one mechanism — one likely
    // anywhere, a second along the danger direction
    const nTripwire = (rng() < Math.min(0.95, 0.45 * T.traps) ? 1 : 0) +
      (rng() < Math.min(0.95, d * 0.4 * T.traps) ? 1 : 0);
    for (let i = 0; i < nTripwire; i++) {
      const full = rng() < 0.25;
      const len = 2 + Math.floor(rng() * 3);
      const mech = rng() < 0.6
        ? { type: 'trap', trap: 'spike', dmg: tier(depthT) > 0.6 ? 2 : 1 }
        : { type: 'trap', trap: 'snare' };
      const L = layLine(room, byKey, cand, len, full);
      if (L) for (const t of L.tiles) effects.push(place(room, t, { ...mech, line: L.line, span: L.span }));
    }

    // rubble WALLS: runs of blocked tiles, full-span or a segment — the
    // safety gate below carves a gap through any wall that severs the map
    const nWall = Math.min(2, Math.floor(rng() * (0.9 + cand.length * 0.05) * T.obstacles));
    for (let i = 0; i < nWall; i++) {
      const full = rng() < 0.35;
      const len = 2 + Math.floor(rng() * 3);
      const L = layLine(room, byKey, cand, len, full);
      if (L) for (const t of L.tiles) effects.push(place(room, t, { type: 'obstacle', line: L.line, span: L.span }));
    }

    // enemies: sparse where the gradient says calm, thick where it says not
    const nEnemy = (rng() < Math.min(0.95, (0.3 + d * 0.5) * T.enemies) ? 1 : 0) +
      (d > 0.5 && rng() < Math.min(0.95, 0.35 * T.enemies) ? 1 : 0);
    for (let i = 0; i < nEnemy; i++) {
      const t = takeTile(room, cand);
      if (!t) continue;
      const τ = tier(depthT);
      const type = τ < 0.34 ? 'mite' : τ < 0.72 ? (rng() < 0.7 ? 'shade' : 'mite') : (rng() < 0.55 ? 'wraith' : 'shade');
      agents.push(place(room, t, { id: agentId++, type, hp: ENEMY_TYPES[type].hp }));
    }
  }

  // -- the safety gate, two invariants: obstacles must not sever the
  //    dungeon, and a wall must NEVER PARTITION A ROOM — rubble is texture
  //    and cover, not architecture. While either fails, carve: drop the
  //    newest obstacle tile in an offending room (a breach in that wall),
  //    falling back to the newest anywhere. Deterministic.
  const blockedSet = () => new Set(effects.filter((e) => e.type === 'obstacle').map((e) => e.room + ':' + e.tile));
  for (;;) {
    const rep = crawlReport(json, { blocked: blockedSet() });
    if (rep.complete && rep.allRoomsReachable && rep.partitionedRoomIds.length === 0) break;
    const bad = new Set(rep.partitionedRoomIds);
    let last = -1;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].type === 'obstacle' && bad.has(effects[i].room)) { last = i; break; }
    }
    if (last < 0) {
      for (let i = effects.length - 1; i >= 0; i--) if (effects[i].type === 'obstacle') { last = i; break; }
    }
    if (last < 0) break;               // nothing left to remove — cannot happen on a crawlable map
    taken.delete(effects[last].room + ':' + effects[last].tile);
    effects.splice(last, 1);
  }

  return {
    format: 'foam-dungeon-content',
    version: CONTENT_VERSION,
    mapSig: sig,
    roll,
    tuning: T,
    effects,
    agents,
  };
}

// tuning <-> compact hash param ('tune=lo,tr,ob,en,tf,gr'); omits at default
export function tuningToParam(T) {
  const v = { ...DEFAULT_TUNING, ...T };
  const s = [v.loot, v.traps, v.obstacles, v.enemies, v.toughness, v.gradient].join(',');
  return s === '1,1,1,1,1,1' ? null : s;
}
export function tuningFromParam(s) {
  if (!s) return { ...DEFAULT_TUNING };
  const [loot, traps, obstacles, enemies, toughness, gradient] = s.split(',').map(Number);
  const c = (v, lo, hi, d) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    loot: c(loot, 0, 2, 1), traps: c(traps, 0, 2, 1), obstacles: c(obstacles, 0, 2, 1),
    enemies: c(enemies, 0, 2, 1), toughness: c(toughness, 0, 2, 1), gradient: c(gradient, -1, 1, 1),
  };
}

// blocked-set view of a content document, for buildCrawl / reachableWithin
export function contentBlocked(content) {
  return new Set(content.effects.filter((e) => e.type === 'obstacle').map((e) => e.room + ':' + e.tile));
}
