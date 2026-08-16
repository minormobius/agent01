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
export const CONTENT_VERSION = 2;

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

    // traps: one likely anywhere, a second along the danger direction
    const nTrap = (rng() < Math.min(0.95, 0.5 * T.traps) ? 1 : 0) +
      (rng() < Math.min(0.95, d * 0.45 * T.traps) ? 1 : 0);
    for (let i = 0; i < nTrap; i++) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, rng() < 0.6
        ? { type: 'trap', trap: 'spike', dmg: tier(depthT) > 0.6 ? 2 : 1 }
        : { type: 'trap', trap: 'snare' }));
    }

    // obstacles: a little rubble, more in big rooms (safety-checked below)
    const nObst = Math.min(3, Math.floor(rng() * (1.7 + cand.length * 0.12) * T.obstacles));
    for (let i = 0; i < nObst; i++) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, { type: 'obstacle' }));
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

  // -- the safety gate: obstacles must not sever the dungeon. Re-check the
  //    crawl graph with obstacles blocked; while broken, drop the newest
  //    obstacle — deterministic, and the selftest asserts the result.
  const blockedSet = () => new Set(effects.filter((e) => e.type === 'obstacle').map((e) => e.room + ':' + e.tile));
  for (;;) {
    const rep = crawlReport(json, { blocked: blockedSet() });
    if (rep.complete && rep.allRoomsReachable) break;
    let last = -1;
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].type === 'obstacle') { last = i; break; }
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
