// deck.selftest.mjs — pins THE DECK PROJECTION (hoop/econ/deck.js + voronoi.js buildSceneCustom):
// a solved region's mid-shell band rendered in /paint's 8/24 membrane language, with the city
// deciding what every membrane is. Run: node hoop/test/deck.selftest.mjs
import { ringLattice } from '../econ/region.js';
import { coarseSolve } from '../econ/record.js';
import { deckScene } from '../econ/deck.js';
import { buildSceneCustom } from '../paint/voronoi.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── buildSceneCustom, synthetic: the painter honours the caller's membrane classification ──
{
  const seeds = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) seeds.push({ x: 80 + x * 90, y: 80 + y * 90 });
  // open between rooms 0–1; door between 1–2; everything else walls
  const sc = buildSceneCustom({ W: 430, H: 430, wallSpacing: 8, roomSpacing: 20, seeds, seed: 3,
    edgeKind: (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; return k === '0,1' ? 'open' : k === '1,2' ? 'door' : 'wall'; } });
  ok(sc.paintCells.length > 100 && sc.paintCells.every((c) => c.poly.length >= 3), 'a valid custom scene paints');
  ok(sc.opens.length === 1 && sc.doors.length === 1, 'the classification is honoured (1 open, 1 door)');
  // the opened membrane carries NO wall nuclei ON it; a walled membrane does (distance measured
  // to the membrane SEGMENT — a midpoint disc would catch neighbouring perpendicular walls)
  const segDist = (n, e) => { const dx = n.x - e.m[0], dy = n.y - e.m[1]; const t = Math.max(-e.len / 2, Math.min(e.len / 2, dx * e.along[0] + dy * e.along[1])); return Math.hypot(n.x - (e.m[0] + e.along[0] * t), n.y - (e.m[1] + e.along[1] * t)); };
  const onMembrane = (e) => sc.wallNuclei.filter((n) => segDist(n, e) < 1.5).length;
  const o = sc.opens[0];
  ok(onMembrane(o) === 0, 'an OPEN membrane has zero wall nuclei along it (the wall is removed)');
  const walled = sc.adjEdges.find((e) => { const k = e.a < e.b ? e.a + ',' + e.b : e.b + ',' + e.a; return k !== '0,1' && k !== '1,2'; });
  ok(onMembrane(walled) > 0, 'a WALL membrane keeps its nuclei');
  ok(sc.floorNuclei.some((n) => n.door), 'doors and opens are floor-bridged');
}

// ── the deck of a solved region ──
const L = ringLattice({ Ri: 150, T: 12, cell: 1, regionsPerRing: 36 });
const rec = coarseSolve({ lattice: L, seed: 7, axMin: 0, axMax: 5 });
const d = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14 });
{
  ok(d.stats.rooms > 200 && d.scene.paintCells.length > 3000, 'a deck band projects to a real paint scene (' + d.stats.rooms + ' rooms, ' + d.scene.paintCells.length + ' cells)');
  ok(d.stats.roadRooms > 0 && d.scene.opens.length > 0, 'the right-of-way reaches this deck as zero-wall concourse');
  ok(d.scene.opens.every((e) => d.owner[e.a] === -1 && d.owner[e.b] === -1), 'opens ONLY ever join two road rooms');
  // exactly one street door per road-fronting building; none for landlocked ones
  const doored = new Map();
  for (const e of d.scene.doors) {
    const bo = d.owner[e.a] >= 0 && d.owner[e.b] === -1 ? d.owner[e.a] : d.owner[e.b] >= 0 && d.owner[e.a] === -1 ? d.owner[e.b] : -1;
    if (bo >= 0) doored.set(bo, (doored.get(bo) || 0) + 1);
  }
  ok([...doored.values()].every((n) => n === 1), 'every street-doored building has EXACTLY one street door (sequestration)');
  const fronting = new Set();
  for (const e of d.scene.adjEdges) {
    const bo = d.owner[e.a] >= 0 && d.owner[e.b] === -1 ? d.owner[e.a] : d.owner[e.b] >= 0 && d.owner[e.a] === -1 ? d.owner[e.b] : -1;
    if (bo >= 0) fronting.add(bo);
  }
  ok(doored.size === fronting.size, 'every building that fronts the street on this deck gets its door (' + doored.size + '/' + fronting.size + ')');
  // interior doors connect each building's band footprint exactly as far as geometry allows
  const comps = (edges, members) => {
    const par = new Map([...members].map((i) => [i, i]));
    const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (const e of edges) if (par.has(e.a) && par.has(e.b)) par.set(find(e.a), find(e.b));
    return new Set([...members].map(find)).size;
  };
  let treeOK = true;
  const byB = new Map();
  d.owner.forEach((o, i) => { if (o >= 0) { let s = byB.get(o); if (!s) { s = new Set(); byB.set(o, s); } s.add(i); } });
  for (const [b, members] of byB) {
    if (members.size < 2) continue;
    const geo = d.scene.adjEdges.filter((e) => members.has(e.a) && members.has(e.b));
    const dr = d.scene.doors.filter((e) => members.has(e.a) && members.has(e.b));
    if (comps(dr, members) !== comps(geo, members)) { treeOK = false; break; }
  }
  ok(treeOK, 'interior door trees connect each building exactly as far as its geometry allows');
  ok(d.bill.length === d.stats.buildings && d.bill.every((g) => g.glyph && g.n >= 1), 'every deck-present building gets a glyph anchor');
  // determinism (the regenerate-a-year-later contract, at the render layer)
  const d2 = deckScene({ lattice: L, seed: 7, record: rec, az: 3, ax: 1, axSpan: 14 });
  ok(d2.scene.paintCells.length === d.scene.paintCells.length && d2.scene.doors.length === d.scene.doors.length && d2.scene.opens.length === d.scene.opens.length, 'the deck render is deterministic');
}

console.log(`deck.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
