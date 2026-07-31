// v3/solver.js — the world worker: holds the record (the single authority on the trunk network +
// its frozen extension), solves regions off the render thread, and posts TRIMMED region views —
// just what the page draws and walks, never the whole model. The page asks; the world answers.
// MULTI-FLOOR: a region is solved in 3D ONCE (cached); the page asks for a specific FLOOR (gz) and
// gets that radial slice + its stairs (the vertical right-of-way that emerged from the solve).
import { ringLattice } from '../econ/region.js';
import { coarseSolve, extendRecord, solveRegion } from '../econ/record.js';
import { deckScene, gateLinks } from '../econ/deck.js';

let L = null, record = null, SEED = 7;
// v4 ROOM SCALE — the disconnect from /sprite/fixture was here: v3's lattice (cell:1) packs ~442 tiny
// chambers per region (acrossRatio ~2 → blocky little rooms). The fixture demo's rooms are big single
// cells richly subdivided (~6 foam cells across). So v4 COARSENS the lattice (cell:2 → ~116 chambers,
// fewer/bigger rooms, also ~6× faster to solve) and makes each chamber large + finely graded inside:
//   PX 280 (a chamber is big on screen) · roomSpacing PX·0.20 (acrossRatio 5.0 ≈ the fixture look) ·
//   wallSpacing PX·0.045 (the fixture's thin clean walls). nz falls to 6 decks (bigger, fewer).
const AXSPAN = 8, PX = 280, GRADE = 0.4;                    // MUST equal index.html PX
const ROOM_SPACING = PX * 0.20, WALL_SPACING = PX * 0.045; // interior richness · wall thinness — the /sprite/fixture proportions
const LAT = { Ri: 150, T: 12, cell: 2, regionsPerRing: 30 }; // cell:2 → fewer, bigger chambers (was cell:1)
const solveCache = new Map();                              // "az,ax" -> solved (3D); LRU-capped
function getSolved(az, ax) {
  const k = az + ',' + ax; let s = solveCache.get(k);
  if (s) { solveCache.delete(k); solveCache.set(k, s); return s; }      // touch (LRU)
  s = solveRegion({ lattice: L, seed: SEED, grade: GRADE, record, az, ax, axSpan: AXSPAN });
  solveCache.set(k, s);
  while (solveCache.size > 14) solveCache.delete(solveCache.keys().next().value);
  return s;
}

function trim(d, links, az, ax) {
  // inspector text per building (precomputed — the page never touches the model)
  const city = d.solved.city, soc = d.solved.society;
  const inspect = {};
  const hatStr = (q) => q.hats.map((h) => (h.kind === 'work' ? h.role : h.kind)).join(', ');
  for (const i of new Set(d.owner.filter((o) => o >= 0))) {
    const p = city.places[i];
    const mem = (soc.placeMembers.get(p.id) || []).slice(0, 4);
    inspect[i] = '<b>' + p.glyph + ' ' + p.role + (p.domain ? '·' + p.domain : '') + '</b> — ' + p.footprint + ' chambers' + (p.onRoad ? ' · fronts the street' : '') +
      (mem.length ? '<br>' + mem.map((j) => '· ' + soc.people[j].name + ' <span class="w">(' + hatStr(soc.people[j]) + ')</span>').join('<br>') : '<br>a quiet place');
  }
  // REAL RESIDENTS of this deck: people whose home building has chambers here, with their on-deck
  // hats mapped to deck building indices + kinds (the substrate for IDed, schedule-driven NPCs).
  const onDeck = new Set(d.owner.filter((o) => o >= 0));
  const idOf = new Map(); city.places.forEach((p, i) => idOf.set(p.id, i));
  const people = [], placeSets = [];                      // placeSets[i] = every place id person i belongs to (home + hats)
  for (const person of soc.people) {
    const home = idOf.get(person.home);
    if (home == null || !onDeck.has(home)) continue;
    const hats = [];
    for (const h of person.hats) { const b = idOf.get(h.place); if (b != null && b !== home && onDeck.has(b)) hats.push({ b, kind: h.kind, role: h.role }); }
    const work = person.hats.find((h) => h.kind === 'work');
    people.push({ name: person.name, home, role: work ? work.role : 'dwell', hats });
    placeSets.push(new Set([person.home, ...person.hats.map((h) => h.place)]));
    if (people.length >= 90) break;
  }
  // THE SOCIAL WEB among the residents you can meet on this deck: two people are tied if they share any
  // place (home/work/club) — Granovetter co-membership. Ship each one a capped list of acquaintance
  // indices so the inspector can name who they know (and the renderer can draw the live tie-lines).
  const placeToPeople = new Map();
  placeSets.forEach((set, i) => { for (const pid of set) { let a = placeToPeople.get(pid); if (!a) { a = []; placeToPeople.set(pid, a); } a.push(i); } });
  for (let i = 0; i < people.length; i++) {
    const seen = new Set();
    for (const pid of placeSets[i]) for (const j of placeToPeople.get(pid)) if (j !== i) seen.add(j);
    people[i].ties = [...seen].slice(0, 8);
  }
  return {
    az, ax, gz: d.gz, frame: d.frame, K: d.K, nReal: d.nReal,
    seeds: d.seeds, bandGid: d.band.map((c) => c.gid), ghostGid: d.ghostBand.map((c) => c.gid),
    walls: d.walls, stairs: d.stairs, people,
    scene: {
      wallSpacing: d.scene.wallSpacing,
      paintCells: d.scene.paintCells.map((c) => ({ wall: c.wall, room: c.room, door: c.door, poly: c.poly })),
      doors: d.scene.doors.map((e) => ({ a: e.a, b: e.b, m: e.m })),
      opens: d.scene.opens.map((e) => ({ a: e.a, b: e.b, m: e.m })),
    },
    owner: Array.from(d.owner), role: d.role, isGate: [...d.isGate], bill: d.bill,
    links, stats: d.stats, inspect,
  };
}

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      SEED = m.seed >>> 0;
      L = ringLattice(LAT);   // v4: cell:2 — fewer, bigger chambers (the fixture room scale)
      record = coarseSolve({ lattice: L, seed: SEED, axMin: 0, axMax: 5 });
      postMessage({ type: 'ready', hubs: record.hubs, axMin: record.axMin, axMax: record.axMax, R: L.regionsPerRing, nz: L.nz, gzMid: Math.floor(L.nz / 2) });
      return;
    }
    if (m.type === 'solve') {
      const R = L.regionsPerRing, az = ((m.az % R) + R) % R, ax = m.ax, gz = m.gz;
      if (gz < 0 || gz >= L.nz) return;
      if (ax > record.axMax) record = extendRecord(record, ax + 2);   // the frontier; history frozen
      const solved = getSolved(az, ax);
      const d = deckScene({ lattice: L, seed: SEED, record, az, ax, axSpan: AXSPAN, pxPerCell: PX, roomSpacing: ROOM_SPACING, wallSpacing: WALL_SPACING, gz, solved });
      const links = gateLinks(d, { lattice: L, seed: SEED, record, az, ax, axSpan: AXSPAN });
      postMessage({ type: 'region', view: trim(d, links, az, ax) });
    }
  } catch (err) { postMessage({ type: 'error', message: String(err && err.stack || err) }); }
};
