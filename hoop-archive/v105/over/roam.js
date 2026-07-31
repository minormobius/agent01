// roam.js — THE ROAMED-OVERWORLD MANAGER. Turns the still landscape (overworld.js makeChunk) into a place
// you WALK: a player, streamed chunks around them, and the two verbs the outer deck offers — FORAGE a
// plant and MEET a creature (a bee to fight). Pure logic, DOM-free, node-tested (test/roam.selftest.mjs);
// the host (index.html overlay, the /over page, the demo) owns the render + input loop and calls in here.
//
// ROAM-AND-RETURN. Chunks are generated on demand and cached by (cx,cy); a chunk is a pure function of
// (seed, cx, cy), so you can walk away and come back and the exact same trees, herbs and bees are there.
// Far chunks are pruned to bound memory; regenerating them reproduces them. `gathered` (a Set of plant
// ids) is the only mutable world state — a foraged plant stays foraged even after its chunk is pruned and
// rebuilt, because the id (`cx:cy:index`) is stable across regeneration.
//
// The player is a POINT; movement is blocked by open water (the lake), so you skirt a fen rather than
// stroll across it. Everything derives from the seed (spawn included), so an NPC's overworld — where they
// start, what grows, what flies — reproduces exactly, the same contract the ship engine and garden hold.

import { CHUNK, makeChunk, bandAt, isWater, organismById } from './overworld.js';

const key = (cx, cy) => cx + ',' + cy;

// createRoam(seed, opts) → the live roam state. keep = chunk radius kept resident around the player.
export function createRoam(seed = 1, { chunk = CHUNK, keep = 1, density = 1 } = {}) {
  const S = (seed >>> 0) || 1;
  const roam = { seed: S, chunk, keep, density, chunks: new Map(), gathered: new Set(), player: { x: 0, y: 0 }, spawn: { x: 0, y: 0 } };
  spawnPlayer(roam);
  ensureAround(roam);
  return roam;
}

// deterministic spawn: a land point near the origin chunk's centre (spiral out over water until dry).
function spawnPlayer(roam) {
  const c = roam.chunk * 0.5;
  for (let rr = 0; rr < roam.chunk * 3; rr += 34) {
    for (let a = 0; a < 12; a++) {
      const x = c + Math.cos(a * 0.5236) * rr, y = c + Math.sin(a * 0.5236) * rr;
      if (!isWater(x, y, roam.seed)) { roam.player.x = x; roam.player.y = y; roam.spawn = { x, y }; return; }
    }
  }
  roam.player.x = c; roam.player.y = c; roam.spawn = { x: c, y: c };
}

export function chunkCoordAt(roam, x, y) { return [Math.floor(x / roam.chunk), Math.floor(y / roam.chunk)]; }

// fetch (generating + caching if needed) the chunk at grid (cx,cy).
export function getChunk(roam, cx, cy) {
  const k = key(cx, cy); let c = roam.chunks.get(k);
  if (!c) { c = makeChunk(roam.seed, cx, cy, { chunk: roam.chunk, density: roam.density }); roam.chunks.set(k, c); }
  return c;
}

// ensure every chunk within `keep` of the player is resident; prune those beyond keep+1 (roam-and-return).
export function ensureAround(roam, r = roam.keep) {
  const [pcx, pcy] = chunkCoordAt(roam, roam.player.x, roam.player.y);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) getChunk(roam, pcx + dx, pcy + dy);
  const prune = r + 1;
  for (const k of [...roam.chunks.keys()]) {
    const [cx, cy] = k.split(',').map(Number);
    if (Math.abs(cx - pcx) > prune || Math.abs(cy - pcy) > prune) roam.chunks.delete(k);
  }
  return roam;
}

// resident chunks (for the renderer to iterate).
export function residentChunks(roam) { return [...roam.chunks.values()]; }

// move the player by (dx,dy) world px, blocked by open water — with axis-slide so you glance off a
// shoreline instead of sticking. Streams chunks around the new position. Returns the player point.
export function stepPlayer(roam, dx, dy) {
  const p = roam.player, nx = p.x + dx, ny = p.y + dy;
  if (!isWater(nx, ny, roam.seed)) { p.x = nx; p.y = ny; }
  else if (!isWater(nx, p.y, roam.seed)) p.x = nx;
  else if (!isWater(p.x, ny, roam.seed)) p.y = ny;
  ensureAround(roam);
  return p;
}

// ── the two roam verbs ──────────────────────────────────────────────────────────────────────────────
// the nearest un-gathered gatherable plant within reach of the player (the forage target), or null.
export function forageTarget(roam, reach = 46) {
  const { x, y } = roam.player; let best = null, bd = reach * reach;
  for (const c of roam.chunks.values()) for (const p of c.plants) {
    if (!p.gather || roam.gathered.has(p.id)) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// gather a plant → mark it taken (persists across chunk prune/rebuild) and return the yield descriptor.
export function forage(roam, plant) {
  if (!plant || roam.gathered.has(plant.id)) return null;
  roam.gathered.add(plant.id);
  const o = organismById(plant.orgId) || {};
  return { id: plant.id, orgId: plant.orgId, name: o.common || o.id, sciName: o.sciName || '', reagentClass: o.reagentClass || null, crop: o.crop || null, edible: !!o.edible };
}

// the nearest fightable creature within reach (a swarm / predator), or null — the encounter hook.
export function encounterTarget(roam, reach = 54) {
  const { x, y } = roam.player; let best = null, bd = reach * reach;
  for (const c of roam.chunks.values()) for (const f of c.fauna) {
    if (!f.fight) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; best = f; }
  }
  return best;
}
// resolve a foe descriptor from an encounter (for the host's skirmish / combat handoff).
export function foeOf(fauna) {
  if (!fauna) return null;
  const o = organismById(fauna.orgId) || {};
  return { id: fauna.id, orgId: fauna.orgId, name: o.common || o.id, sciName: o.sciName || '', swarm: !!fauna.swarm, plan: fauna.plan || 'quad', reagentClass: o.reagentClass || (fauna.swarm ? 'animal' : null) };
}
// mark a defeated creature so it doesn't re-menace on the same chunk visit (host calls after a win).
export function defeat(roam, fauna) { if (fauna) roam.gathered.add('foe:' + fauna.id); return roam; }
export function isDefeated(roam, fauna) { return !!fauna && roam.gathered.has('foe:' + fauna.id); }

export default {
  createRoam, getChunk, ensureAround, residentChunks, chunkCoordAt, stepPlayer,
  forageTarget, forage, encounterTarget, foeOf, defeat, isDefeated,
};
