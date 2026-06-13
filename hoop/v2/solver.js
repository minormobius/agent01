// v2/solver.js — the world worker: holds the record (the single authority on the trunk network +
// its frozen extension), solves regions off the render thread, and posts TRIMMED region views —
// just what the page draws and walks, never the whole model. The page asks; the world answers.
import { ringLattice } from '../econ/region.js';
import { coarseSolve, extendRecord } from '../econ/record.js';
import { deckScene, gateLinks } from '../econ/deck.js';

let L = null, record = null, SEED = 7;
const AXSPAN = 14, PX = 120;                                // 120 px per 15 m room — spacious

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
  return {
    az, ax, frame: d.frame, K: d.K, nReal: d.nReal,
    seeds: d.seeds, bandGid: d.band.map((c) => c.gid), ghostGid: d.ghostBand.map((c) => c.gid),
    scene: {
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
      L = ringLattice({ Ri: 150, T: 12, cell: 1, regionsPerRing: 36 });
      record = coarseSolve({ lattice: L, seed: SEED, axMin: 0, axMax: 5 });
      postMessage({ type: 'ready', hubs: record.hubs, axMin: record.axMin, axMax: record.axMax, R: L.regionsPerRing });
      return;
    }
    if (m.type === 'solve') {
      const R = L.regionsPerRing, az = ((m.az % R) + R) % R, ax = m.ax;
      if (ax > record.axMax) record = extendRecord(record, ax + 2);   // the frontier; history frozen
      const d = deckScene({ lattice: L, seed: SEED, record, az, ax, axSpan: AXSPAN, pxPerCell: PX });
      const links = gateLinks(d, { lattice: L, seed: SEED, record, az, ax, axSpan: AXSPAN });
      postMessage({ type: 'region', view: trim(d, links, az, ax) });
    }
  } catch (err) { postMessage({ type: 'error', message: String(err && err.stack || err) }); }
};
