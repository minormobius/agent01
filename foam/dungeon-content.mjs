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

export const CONTENT_VERSION = 1;

// enemy types by depth band; bump combat: player deals 1, enemy deals `dmg`
// when bumped and again when adjacent at end of turn
export const ENEMY_TYPES = {
  mite:   { hp: 1, dmg: 1, gold: 2,  color: '#9fd86e' },
  shade:  { hp: 2, dmg: 1, gold: 5,  color: '#8fa0ff' },
  wraith: { hp: 3, dmg: 2, gold: 12, color: '#ff7ea0' },
};

export function rollContent(json, opts = {}) {
  const roll = Math.max(1, Math.floor(opts.roll ?? 1));
  const sig = layoutSignature(json);
  const rng = mulberry(fnv(0xC0A7E47, sig, roll));
  const maxDepth = Math.max(1, ...json.rooms.map((r) => r.depth));
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
      const type = depthT > 0.75 ? 'wraith' : 'shade';
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

    // loot: likelier and richer the deeper you are
    if (rng() < (isEntrance ? 0.35 : 0.4 + depthT * 0.35)) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, { type: 'loot', gold: 4 + Math.floor(rng() * 8) + Math.floor(room.depth * 0.8) }));
    }
    if (isEntrance) continue;          // safe ground: nothing hostile below

    // traps: one likely anywhere, a second deep down; snares cut the turn
    const nTrap = (rng() < 0.5 ? 1 : 0) + (rng() < depthT * 0.45 ? 1 : 0);
    for (let i = 0; i < nTrap; i++) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, rng() < 0.6
        ? { type: 'trap', trap: 'spike', dmg: depthT > 0.6 ? 2 : 1 }
        : { type: 'trap', trap: 'snare' }));
    }

    // obstacles: a little rubble, more in big rooms (safety-checked below)
    const nObst = Math.min(3, Math.floor(rng() * (1.7 + cand.length * 0.12)));
    for (let i = 0; i < nObst; i++) {
      const t = takeTile(room, cand);
      if (t) effects.push(place(room, t, { type: 'obstacle' }));
    }

    // enemies: sparse near the surface, thick near the endpoints
    const nEnemy = (rng() < 0.3 + depthT * 0.5 ? 1 : 0) + (depthT > 0.5 && rng() < 0.35 ? 1 : 0);
    for (let i = 0; i < nEnemy; i++) {
      const t = takeTile(room, cand);
      if (!t) continue;
      const type = depthT < 0.34 ? 'mite' : depthT < 0.72 ? (rng() < 0.7 ? 'shade' : 'mite') : (rng() < 0.55 ? 'wraith' : 'shade');
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
    effects,
    agents,
  };
}

// blocked-set view of a content document, for buildCrawl / reachableWithin
export function contentBlocked(content) {
  return new Set(content.effects.filter((e) => e.type === 'obstacle').map((e) => e.room + ':' + e.tile));
}
