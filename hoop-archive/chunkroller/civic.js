// chunkroller/civic.js — run econ's civic kernel over a CHUNK's rooms + derive per-NPC stats.
//
// A chunk room and an econ "place" are the same vocabulary (foam.js builds rooms from econ's ROLES). This
// adapts a solveChunk record's rooms[] into the econ `field` shape (the supply web + closure), then runs
// buildSociety/socialMetrics/scoreSociety UNCHANGED to get a vitality readout — the same Thriving…Failing
// oracle the econ tool uses. NPC stats come from stats.js rollCharacter keyed to each resident's vocation.
//
// Pure (no DOM); node-tested in test/civic.selftest.mjs.

import { DOMAINS, makePlace, buildSociety, socialMetrics, scoreSociety, removeImpact, DEFAULT_GENOME } from '../v099/econ/econ.js';
import { rollCharacter, TRIAD_ORDER } from '../v099/stats.js';
import { asSeed } from '../v099/crew.js';

const domObj = (id) => DOMAINS.find((d) => d.id === id) || DOMAINS[0];

// enrich a chunk room into an econ place (the supply atom); keep its footprint (cell count) + room id.
export function roomsToPlaces(rooms) {
  return rooms.map((room, i) => {
    const pl = makePlace(i, room.role, domObj(room.domain));
    pl.x = room.x; pl.y = room.y; pl.footprint = room.cells ? room.cells.length : 1; pl.rid = i;
    return pl;
  });
}

// wire the supply web over the places — REPLICATED from econ.buildField (lines 63-76), O(n^2) nearest
// (a chunk is tens of rooms, not thousands). Returns the `field` shape the society/score functions read.
export function fieldFromRooms(rooms, W = 900, H = 600) {
  const places = roomsToPlaces(rooms);
  const spacing = Math.max(5, Math.sqrt((W * H) / Math.max(1, places.length)));
  const byRes = new Map();
  for (const pl of places) for (const r of pl.out) { let a = byRes.get(r); if (!a) { a = []; byRes.set(r, a); } a.push(pl); }
  const edges = []; let need = 0, met = 0;
  for (const pl of places) for (const r of [...new Set(pl.in)]) {
    need++;
    const list = byRes.get(r); if (!list) continue;
    let best = null, bd = Infinity;
    for (const q of list) { if (q.id === pl.id) continue; const d = (q.x - pl.x) ** 2 + (q.y - pl.y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best) { met++; edges.push({ from: pl.id, to: best.id, r, fx: pl.x, fy: pl.y, tx: best.x, ty: best.y }); }
  }
  const counts = {}; for (const pl of places) counts[pl.role] = (counts[pl.role] || 0) + 1;
  return { W, H, spacing, places, edges, byRes, counts, need, met, closure: need ? met / need : 1 };
}

// the full civic readout over a chunk: society + metrics + vitality (the econ kernel, unchanged).
export function scoreChunk(rooms, W = 900, H = 600, seed = 1) {
  const field = fieldFromRooms(rooms, W, H);
  const society = buildSociety(field, { seed, genome: DEFAULT_GENOME });
  const metrics = socialMetrics(field, society);
  const vital = scoreSociety(field, society, metrics);
  return { field, society, metrics, vital };
}

// the shock of removing one place (room) — the two-web damage, for the click dossier.
export function roomShock(field, society, metrics, placeId) { return removeImpact(field, society, metrics, placeId); }

// per-NPC stat blocks (FLESH·CHASSIS·ANIMA) derived from each resident's vocation (their work role, else
// home/dwell), + the chunk aggregate (mean triad, cast histogram). Seeded per resident → stable.
export function npcRoster(society) {
  const people = society.people.map((p) => {
    const work = p.hats.find((h) => h.kind === 'work');
    const vocation = work ? work.role : 'dwell';
    const c = rollCharacter(asSeed('cr:' + p.idx + ':' + p.name + ':' + p.home), { vocation });
    return { idx: p.idx, name: p.name, vocation, hats: p.hats.length, work: !!work, triad: c.triad, cast: c.cast, attrs: c.attrs, vocTag: c.vocTag };
  });
  const triadAvg = { flesh: 0, chassis: 0, anima: 0 };
  for (const n of people) for (const k of TRIAD_ORDER) triadAvg[k] += (n.triad && n.triad[k]) || 0;
  const P = people.length || 1; for (const k of TRIAD_ORDER) triadAvg[k] /= P;
  const casts = {}; for (const n of people) { const lbl = (n.cast && n.cast.label) || 'mixed'; casts[lbl] = (casts[lbl] || 0) + 1; }
  return { people, triadAvg, casts, count: people.length };
}
