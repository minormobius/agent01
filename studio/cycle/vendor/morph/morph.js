// morph.js — a city's form, laid down in time: lanes → districts → streets → blocks → plots → buildings,
// and then rebuilt, plot by plot, for seven centuries. Pure, DOM-free, deterministic.
//
// The model is urban morphology's (M. R. G. Conzen, Alnwick 1960): a town plan is three things laid
// down at different times and lasting differently long — the STREET system (longest), the PLOT pattern,
// and the BUILDINGS on the plots (shortest) — so a city is a palimpsest, read by the order its layers
// were laid in. Here, in the order they happen:
//
//   THE COUNTRYSIDE comes first: lanes radiating from the market town to the frame's edge, and hamlets
//   on them. Everything later inherits both. A lane is never erased: whatever district is laid over it
//   is cut along it, and it stays a street (an old road: Broadway through the Manhattan grid). A hamlet
//   is a small cell of its own in the district diagram (a POWER diagram, a weighted Voronoi), so when
//   the city reaches it the later plan flows round it and it survives as an urban village.
//
//   DISTRICTS are GRAINS (bismuth's word, packages/bismuth/poly.js): each was laid out in one era by
//   one idea of a street — an organic core, a planned grid, a boulevard scheme round a rond-point, a
//   suburb, a modern grid — each lattice at its own angle and clipped to its district, so where two
//   plans meet the seam is sharp (the Commissioners' grid stops dead at Greenwich Village) and leaves
//   triangular blocks. The core's edge is where the wall stood: a ring boulevard (the Ringstraße).
//
//   SLIVERS are not built: a block too small or too thin to hold a building is absorbed by its
//   neighbour (the minor street between them is closed), or left as a traffic island, or a pocket
//   square. A plot that only fronts a closed street is a yard.
//
//   THE FABRIC is a field, not a district setting: land value falls from the core (bid-rent) and rises
//   on the big streets, and heights follow it smoothly. Where a district was NOT planned (the organic
//   core, a village, a suburb) its plots and heights also blend toward its neighbour's over a seam, as
//   growth does; a PLANNED district keeps its edge.
//
//   PLOTS are cut back from each frontage to the middle of the block (the straight skeleton,
//   `geom.zones`), as wide as the plan's plots: burgage strips in the core.
//
//   BUILDINGS have histories. Each plot is first built in its plan's style; then the city's waves of
//   redevelopment (1780, 1870, 1965, 2005) rebuild a plot when its land has become worth far more than
//   what stands on it (the rent gap): likely on a valuable street, rarely on a quiet one, so old
//   buildings survive where values stayed low. A rebuilding often takes the neighbouring plots too (the
//   burgage cycle: plots amalgamate), so a modern office stands on what were six medieval strips.
//
//   const city = generate({ seed: 7 });
//   standing(city, 1900)  → { blocks, buildings } as they stood that year

import * as G from './geom.js';

export const VERSION = 2;
export const PRESENT = 2025;

import { Rand } from './rand.js';
export { Rand };

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------- styles --
// How each era BUILT: storeys from [at low land value, at high], depth behind the frontage, roof,
// and how readily a rebuilding in this style swallows its neighbours' plots (and how wide it gets).
export const STYLES = {
  village:   { label: 'village houses', year: 1200, storeys: [1, 2], storeyH: 3.0, depth: [8, 12], roof: 'hip', pitch: 0.9, setback: 0, merge: 0, maxW: 20 },
  medieval:  { label: 'medieval houses', year: 1300, storeys: [2, 4], storeyH: 3.2, depth: [10, 15], roof: 'hip', pitch: 0.85, setback: 0, merge: 0, maxW: 12 },
  georgian:  { label: 'Georgian terraces', year: 1800, storeys: [3, 5], storeyH: 3.4, depth: [12, 16], roof: 'hip', pitch: 0.5, setback: 0, merge: 0.15, maxW: 22 },
  haussmann: { label: 'apartment blocks', year: 1870, storeys: [5, 7], storeyH: 3.5, depth: [14, 18], roof: 'mansard', pitch: 1.6, setback: 0, merge: 0.45, maxW: 34 },
  villa:     { label: 'detached houses', year: 1930, storeys: [1, 2], storeyH: 3.0, depth: [9, 12], roof: 'hip', pitch: 0.65, setback: 7, side: 2.5, merge: 0, maxW: 30 },
  modern:    { label: 'modern slabs', year: 1965, storeys: [5, 18], storeyH: 3.4, depth: [16, 24], roof: 'flat', pitch: 0, setback: 3, merge: 0.75, maxW: 70, tower: 0.08 },
  glass:     { label: 'glass towers', year: 2005, storeys: [8, 40], storeyH: 3.6, depth: [18, 28], roof: 'flat', pitch: 0, setback: 2, merge: 0.85, maxW: 80, tower: 0.35 },
};
// the city's waves of redevelopment: who rebuilds, how likely at the highest land value
export const WAVES = [
  { year: 1780, style: 'georgian', p: 0.22 },
  { year: 1870, style: 'haussmann', p: 0.3 },
  { year: 1965, style: 'modern', p: 0.32 },
  { year: 2005, style: 'glass', p: 0.14 },
];

// ---------------------------------------------------------------------------- plans --
// How each era LAID OUT streets. `planned`: a plan's edge is a legal line, kept sharp; growth blends.
export const PLANS = {
  organic: {
    label: 'the old core', year: [1250, 1320], planned: false,
    lattice: 'voronoi', cell: 70, jitter: 0.75, street: [5, 8], avenue: 11,
    plotW: [5, 8.5], merge: 0.06, style: 'medieval', square: 0.02,
  },
  village: {
    label: 'a village', year: [1100, 1220], planned: false,
    lattice: 'voronoi', cell: 55, jitter: 0.8, street: [5, 7], avenue: 9,
    plotW: [9, 16], merge: 0.05, style: 'village', square: 0.12,
  },
  grid: {
    label: 'a planned grid', year: [1770, 1840], planned: true,
    lattice: 'grid', cell: [70, 110], street: [12, 15], avenue: 22, avenueEvery: 4,
    plotW: [7, 11], merge: 0.2, style: 'georgian', square: 0.03,
  },
  radial: {
    label: 'a boulevard scheme', year: [1855, 1890], planned: true,
    lattice: 'radial', ring: 85, plaza: 55, street: [14, 18], avenue: 30, avenueEvery: 2,
    plotW: [10, 16], merge: 0.15, style: 'haussmann', square: 0.02,
  },
  suburb: {
    label: 'a suburb', year: [1905, 1945], planned: false,
    lattice: 'voronoi', cell: 120, jitter: 1.0, relax: false, street: [9, 12], avenue: 16,
    plotW: [14, 22], merge: 0.03, style: 'villa', square: 0.04,
  },
  modern: {
    label: 'a modern grid', year: [1955, 1975], planned: true,
    lattice: 'grid', cell: [90, 140], street: [16, 20], avenue: 32, avenueEvery: 3,
    plotW: [14, 22], merge: 0.55, style: 'modern', square: 0.05,
  },
};
export const KINDS = ['organic', 'grid', 'radial', 'modern', 'suburb'];   // what a district may be (villages come from the countryside)
// kept for older callers: a plan with its first style's fabric
export const ERAS = Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { ...p, year: p.year[0] }]));

const RING = 26, SEAM = 16, OLDROAD = 13, QUAY = 18;     // street widths: the old wall's ring, a seam between plans, an old lane, a quay

// ---------------------------------------------------------------------------- history --
// A European town's population through the centuries (the settlement field's input, one value a tick
// from 1100 to the present): a medieval rise, the Black Death, slow early-modern growth, then the
// industrial city's boom and the modern plateau. `peak` scales the whole curve.
export const HISTORY = [[1100, 300], [1300, 4000], [1350, 2800], [1500, 6000], [1700, 12000], [1800, 20000], [1900, 40000], [1960, 60000], [2025, 70000]];
export function envelope(T = 240, peak = 70000) {
  const out = [], k = peak / 70000;
  for (let t = 0; t < T; t++) {
    const y = 1100 + t * (PRESENT - 1100) / (T - 1);
    let i = 1; while (i < HISTORY.length - 1 && HISTORY[i][0] < y) i++;
    const [y0, p0] = HISTORY[i - 1], [y1, p1] = HISTORY[i];
    out.push(Math.round(k * p0 * Math.pow(p1 / p0, Math.min(1, (y - y0) / (y1 - y0)))));
  }
  return out;
}

// ---------------------------------------------------------------------------- the city --
/**
 * opts: seed, size (the frame's side, m), districts, kinds (the first is the core's, the rest the
 * later plans), villages (how many hamlets), lanes, plotScale, streetScale, heightScale.
 */
export function generate(opts = {}) {
  const o = { seed: 1, size: 1400, districts: 6, kinds: KINDS, villages: 3, lanes: 5, plotScale: 1, streetScale: 1, heightScale: 1, ...opts };
  if (o.field) o.size = o.field.meta.frame * 1000;
  const S = o.size, half = S / 2, frame = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const city = { seed: o.seed, size: S, frame, ground: o.ground || null, lanes: [], roads: [], bridges: [], fields: [], water: [], districts: [], blocks: [], streets: [], plots: [], frontages: [], buildings: [], squares: [], years: [Infinity, PRESENT] };

  if (o.field) fromField(city, o); else countryside(city, o);
  indexParts(city);

  // ---- each district's lattice, laid in each of its pieces
  for (const d of city.districts) layDistrict(city, d, o);

  // ---- streets: each block edge drawn back by half its street's width
  for (const b of city.blocks) rankEdges(city, b, o);
  for (const b of city.blocks) b.lot = G.inset(b.cell, b.widths.map((x) => x.w / 2));

  // ---- slivers and squares
  slivers(city);
  for (const b of city.blocks) {
    if (b.square || b.island || !b.lot.length) continue;
    const d = city.districts[b.district], centre = d.isCore || d.kind === 'village';
    if (b.plaza || (centre && G.inside(b.cell, d.seed)) || Rand(o.seed, `square/${b.id}`).chance(d.plan.square)) { b.square = 'square'; city.squares.push(b.id); }
    else if (city.ground) {
      // too steep to build: a park on the scarp
      const c = G.centroid(b.lot);
      if (city.ground.slopeAt(c[0], c[1]) > 0.3) { b.square = 'green'; city.squares.push(b.id); }
    }
  }
  for (const b of city.blocks) for (let i = 0; i < b.cell.length; i++) {
    if (b.widths[i].w > 0) city.streets.push({ block: b.id, a: b.cell[i], b: b.cell[(i + 1) % b.cell.length], width: b.widths[i].w, rank: b.widths[i].rank, year: b.year });
  }

  // ---- plots, then the first building on each, then the waves of rebuilding
  for (const b of city.blocks) if (b.lot.length && !b.square && !b.island) layPlots(city, b, o);
  if (city.ground) { const hs = city.plots.map((p) => p.elev).sort((a, b) => a - b); city.lowGround = hs[Math.floor(hs.length * 0.1)] || 0; }
  for (const f of city.frontages) firstBuild(city, f, o);
  for (const w of WAVES) for (const f of city.frontages) rebuild(city, f, w, o);

  city.stats = stats(city);
  return city;
}

/**
 * The plan read off the SETTLEMENT FIELD (polis/field.js: one Voronoi of sites grown by a land market,
 * cells dividing where rent is high). Each built cell is a piece of the city, laid out in the plan of
 * the era it was first built in: the walled town (built by the time the walls went up) is the old core
 * and its edge the ring; then extramural growth, Georgian grids, boulevard schemes, suburbs, modern
 * grids. Neighbouring cells of one era are one district. The field's LANES run through the cells
 * (site to the shared edge to the next site), so a lane is never erased; its tier says what street it
 * became. River and sea cells are water, fronted by quays; a lane across a river cell is a bridge once
 * the field built one. Unbuilt cells are the countryside, farmed or wild. Land value is the field's rent.
 */
function fromField(city, o) {
  const F = o.field, K = 1000, T = F.meta.ticks, FIRST = 1100;
  const yearOf = (t) => Math.round(FIRST + Math.max(0, t) * (PRESENT - FIRST) / (T - 1));
  city.yearOf = yearOf; city.years[0] = FIRST;
  const at = (id) => [F.sites[id].x * K, F.sites[id].y * K];
  const live = F.sites.filter((s) => !s.dead && F.polys[s.id] && F.polys[s.id].length >= 3);
  const P = new Map();
  for (const s of live) { const Q = G.ccw(G.clean(F.polys[s.id].map(([x, y]) => [x * K, y * K]))); if (Q.length >= 3) P.set(s.id, Q); }
  const built = live.filter((s) => P.has(s.id) && s.builtAt >= 0 && !s.water && !s.river);
  const rents = built.map((s) => s.rent).sort((a, b) => a - b), hi = rents[Math.floor(rents.length * 0.95)] || 1;
  city.nucleus = at(F.nucleus);

  // ---- neighbours: built and river cells sharing an edge
  const river = live.filter((s) => P.has(s.id) && s.river && !s.water);
  const box = new Map();
  for (const s of [...built, ...river]) { const Q = P.get(s.id); box.set(s.id, [Math.min(...Q.map((p) => p[0])) - 1, Math.min(...Q.map((p) => p[1])) - 1, Math.max(...Q.map((p) => p[0])) + 1, Math.max(...Q.map((p) => p[1])) + 1]); }
  const shares = (a, b) => {
    const ba = box.get(a), bb = box.get(b);
    if (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3]) return false;
    const A = P.get(a), B = P.get(b);
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (G.sharedLength(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length]) > 1) return true;
    return false;
  };
  // a river cell beside the town is built when the town reaches it, on both banks of the channel
  // (the field leaves the cell itself unbuilt: its water is only the channel the ground cuts through it)
  const builtAt = new Map(built.map((s) => [s.id, s.builtAt]));
  for (const r of river) {
    let first = null;
    for (const s of built) if (shares(r.id, s.id) && (!first || s.builtAt < first.builtAt)) first = s;
    if (first) builtAt.set(r.id, first.builtAt);
  }
  const cellsAll = [...built, ...river.filter((r) => builtAt.has(r.id))];
  city.rentOf = (id) => Math.max(0.05, Math.min(1, Math.pow(Math.max(0, F.sites[id].rent) / hi, 0.6)));
  for (const s of live) if (P.has(s.id) && !s.water && !builtAt.has(s.id)) city.fields.push({ poly: P.get(s.id), use: s.river ? 0 : s.use, site: s.id });

  // ---- the plan of each built cell, by the year it was first built
  const wallYear = F.wall ? yearOf(F.wall.at) : null;
  const planOf = (s) => {
    const y = yearOf(builtAt.get(s.id));
    if (wallYear != null ? y <= wallYear : y < 1450) return 'core';
    if (y < 1750) return 'organic';
    if (y < 1850) return 'grid';
    if (y < 1905) return 'radial';
    if (y < 1950) return 'suburb';
    return 'modern';
  };
  const parent = new Map(cellsAll.map((s) => [s.id, s.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const plan = new Map(cellsAll.map((s) => [s.id, planOf(s)]));
  const nbrs = new Map(cellsAll.map((s) => [s.id, []]));
  for (let i = 0; i < cellsAll.length; i++) for (let j = i + 1; j < cellsAll.length; j++) {
    const a = cellsAll[i].id, b = cellsAll[j].id;
    if (shares(a, b)) { nbrs.get(a).push(b); nbrs.get(b).push(a); }
  }
  // the field builds cell by cell, so neighbours were often built decades apart and the eras speckle;
  // a planned extension is laid out as one piece. So each cell takes the plan most of the land round it
  // has (by area), twice over, if that plan is not an anachronism for when the cell was built. The
  // walled town keeps its wall.
  const START = { core: 0, organic: 1450, grid: 1750, radial: 1850, suburb: 1905, modern: 1950 };
  for (let pass = 0; pass < 3; pass++) {
    const next = new Map(plan);
    for (const s of cellsAll) {
      if (plan.get(s.id) === 'core') continue;
      const w = new Map();
      for (const id of [s.id, ...nbrs.get(s.id)]) { const k = plan.get(id); if (k !== 'core') w.set(k, (w.get(k) || 0) + Math.abs(G.area(P.get(id)))); }
      let best = plan.get(s.id), bw = w.get(best) || 0;
      for (const [k, v] of w) if (v > bw && START[k] <= yearOf(builtAt.get(s.id)) + 50) { best = k; bw = v; }
      next.set(s.id, best);
    }
    for (const [k, v] of next) plan.set(k, v);
  }
  for (const s of cellsAll) for (const id of nbrs.get(s.id)) if (plan.get(id) === plan.get(s.id)) parent.set(find(s.id), find(id));
  const groups = new Map();
  for (const s of cellsAll) { const r = find(s.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); }

  // ---- the lanes: each runs site → the shared edge → the next site
  const TIER = [['old road', OLDROAD], ['lane', 8], ['main street', 11], ['main road', 16]];
  const lanes = F.lanes.filter((l) => l.removedAt < 0 && !F.sites[l.a].dead && !F.sites[l.b].dead);
  const dirs = new Map();
  const bridged = new Map(F.bridges.map((b) => [b.seat, yearOf(b.at)]));
  for (const l of lanes) {
    const A = at(l.a), B = at(l.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], [rank, width] = TIER[l.tier] || TIER[1], year = yearOf(l.at);
    if (F.sites[l.a].water || F.sites[l.b].water) continue;
    const seat = F.sites[l.a].river ? l.a : F.sites[l.b].river ? l.b : -1;
    if (seat >= 0 && bridged.has(seat) && o.ground && o.ground.river) {
      // the deck: where this lane crosses the channel
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), wet = [];
      for (let t = 0; t <= L; t += 2) { const p = [A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L]; if (o.ground.water(p[0], p[1]) === 'river') wet.push(t); }
      if (wet.length) {
        const t0 = Math.max(0, wet[0] - 8), t1 = Math.min(L, wet[wet.length - 1] + 8), pt = (t) => [A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L];
        city.bridges.push({ a: pt(t0), b: pt(t1), year: Math.max(year, bridged.get(seat)), width: Math.min(width, 14) });
      }
    }
    for (const [s, from, to] of [[l.a, A, B], [l.b, B, A]]) {
      if (!dirs.has(s)) dirs.set(s, []);
      const road = { a: from, b: [from[0] + (m[0] - from[0]) * 1.05, from[1] + (m[1] - from[1]) * 1.05], rank, width, year, tier: l.tier, site: s };
      dirs.get(s).push({ angle: Math.atan2(to[1] - from[1], to[0] - from[0]), road });
      city.roads.push(road);
    }
  }

  // ---- the districts
  const ordered = [...groups.values()].sort((a, b) => Math.min(...a.map((s) => builtAt.get(s.id))) - Math.min(...b.map((s) => builtAt.get(s.id))) || a[0].id - b[0].id);
  for (const cells of ordered) {
    let key = plan.get(cells[0].id);
    const area = cells.reduce((t, s) => t + Math.abs(G.area(P.get(s.id))), 0);
    if (key === 'radial' && area < 150000) key = 'grid';                 // a boulevard scheme needs room
    const kind = key === 'core' ? 'organic' : key, pl = PLANS[kind];
    const year = Math.min(...cells.map((s) => yearOf(builtAt.get(s.id))));
    const isCore = key === 'core' && cells.some((s) => s.id === F.nucleus || Math.hypot(s.x - F.sites[F.nucleus].x, s.y - F.sites[F.nucleus].y) < 0.3);
    // where its plan is centred, and which way a planned grid runs: along its busiest old road
    const centre = G.centroid(P.get(cells.reduce((b2, s) => (Math.abs(G.area(P.get(s.id))) > Math.abs(G.area(P.get(b2.id))) ? s : b2)).id));
    let seed = isCore ? at(F.nucleus) : centre, angle = Math.atan2(city.nucleus[1] - centre[1], city.nucleus[0] - centre[0]), best = 0;
    for (const s of cells) for (const r of city.roads) {
      if (r.a[0] !== at(s.id)[0] || r.a[1] !== at(s.id)[1]) continue;
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * (r.tier === 0 || r.tier === 3 ? 2 : 1);
      if (L > best) { best = L; angle = Math.atan2(r.b[1] - r.a[1], r.b[0] - r.a[0]); }
    }
    if (kind === 'radial') { const c = cells.reduce((b2, s) => (Math.hypot(at(s.id)[0] - centre[0], at(s.id)[1] - centre[1]) < Math.hypot(at(b2.id)[0] - centre[0], at(b2.id)[1] - centre[1]) ? s : b2)); seed = at(c.id); }
    const label = isCore ? (wallYear != null ? 'the walled town' : 'the old core') : kind === 'organic' ? 'growth outside the walls' : pl.label;
    const d = { id: city.districts.length, kind, plan: pl, label, era: { ...pl, year }, year, seed, parts: cells.map((s) => P.get(s.id)), region: P.get(cells[0].id), area, centre, angle, isCore, cells: cells.map((s) => s.id) };
    // each cell cut along its lanes into wedges, each piece dated by its own cell
    // each cell cut along the lanes that survive its plan: an unplanned district keeps every lane; a
    // planned one keeps only the old roads and main roads, and its lattice erases the field paths
    // (in the old core the field's cells are already its blocks, their edges its streets: the lanes
    // between them run along those edges, and only the through routes cut across)
    const keeps = (r) => r.tier === 0 || r.tier === 3 || (r.tier === 2 && (d.kind === 'suburb' || d.kind === 'organic'));
    for (const s of cells) for (const { road } of dirs.get(s.id) || []) if (!keeps(road)) road.erased = year;
    // the lattice is laid over whole cells, then cut straight along the roads it kept
    d.pieces = cells.map((s) => ({ poly: P.get(s.id), year: yearOf(builtAt.get(s.id)), site: s.id }));
    d.cutRoads = cells.flatMap((s) => (dirs.get(s.id) || []).map((x) => x.road).filter((r) => r.erased == null));
    city.districts.push(d);
  }
}

/** A convex cell cut by rays from a point inside it into convex wedges (a gap wider than π is halved). */
function wedges(Pc, c, angles) {
  if (!angles.length) return [Pc];
  const a = [...angles].map((x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((x, y) => x - y);
  const rays = [];
  for (let i = 0; i < a.length; i++) {
    rays.push(a[i]);
    const nx = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI;
    if (nx - a[i] > Math.PI - 1e-6) rays.push(a[i] + (nx - a[i]) / 2);
  }
  if (rays.length === 1) rays.push(rays[0] + Math.PI);
  const out = [];
  for (let i = 0; i < rays.length; i++) {
    const t0 = rays[i], t1 = i + 1 < rays.length ? rays[i + 1] : rays[0] + 2 * Math.PI;
    if (t1 - t0 < 1e-9) continue;
    const u = [Math.cos(t0), Math.sin(t0)], v = [Math.cos(t1), Math.sin(t1)];
    let W = G.clipHalf(Pc, -u[1], u[0], -(-u[1] * c[0] + u[0] * c[1]));
    W = G.clipHalf(W, v[1], -v[0], -(v[1] * c[0] - v[0] * c[1]));
    if (W.length >= 3 && Math.abs(G.area(W)) > 1) out.push(W);
  }
  return out;
}

/** The synthetic countryside: lanes out of a market town, hamlets on them, districts round it. */
function countryside(city, o) {
  const S = o.size, half = S / 2, frame = city.frame;
  // ---- the countryside: the market town and the lanes out of it
  const R = Rand(o.seed, 'countryside');
  const core = [R.range(-0.08, 0.08) * S, R.range(-0.08, 0.08) * S];
  const nl = Math.max(3, Math.min(8, o.lanes | 0)), a0 = R.range(0, Math.PI * 2);
  for (let k = 0; k < nl; k++) {
    const a = a0 + (k / nl) * Math.PI * 2 + R.range(-0.25, 0.25) * (Math.PI * 2 / nl);
    city.lanes.push({ id: k, o: core, u: [Math.cos(a), Math.sin(a)], angle: a });
  }
  city.lanes.sort((p, q) => p.angle - q.angle);

  // ---- district seeds: the core, the later plans round it, and hamlets out on the lanes
  const n = Math.max(1, Math.min(12, o.districts | 0)), kinds = o.kinds.filter((k) => PLANS[k] && k !== 'village');
  const coreKind = kinds[0] || 'organic', later = kinds.slice(1).length ? kinds.slice(1) : [coreKind];
  const RD = Rand(o.seed, 'districts');
  const seeds = [{ p: core, kind: coreKind, w: 0 }];
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2 + RD.range(-0.35, 0.35), r = RD.range(0.28, 0.46) * S;
    seeds.push({ p: [core[0] + Math.cos(a) * r, core[1] + Math.sin(a) * r], kind: RD.pick(later), w: 0 });
  }
  const RV = Rand(o.seed, 'villages');
  for (let v = 0, tries = 0; v < (o.villages | 0) && tries < 40; tries++) {
    const lane = RV.pick(city.lanes), r = RV.range(0.3, 0.44) * S, p = [core[0] + lane.u[0] * r, core[1] + lane.u[1] * r];
    if (Math.abs(p[0]) > half - 60 || Math.abs(p[1]) > half - 60) continue;
    const D = Math.min(...seeds.map((s) => Math.hypot(s.p[0] - p[0], s.p[1] - p[1])));
    if (D < 230) continue;
    const rv = RV.range(110, 160);
    seeds.push({ p, kind: 'village', w: 2 * D * rv - D * D, lane: lane.id, rv });     // its cell reaches ~rv toward its neighbours
    v++;
  }
  const regions = G.power(seeds.map((s) => s.p), seeds.map((s) => s.w), frame);
  // a hamlet out toward the frame has no neighbour beyond it, so its cell would run to the edge: it keeps
  // an octagon of its fields' reach, and the land beyond goes to the district it borders most (a later
  // plan reaches round the village and past it). So a district is one or more convex PARTS.
  const parts = regions.map((r) => (r.length ? [r] : []));
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    if (s.kind !== 'village' || !regions[i].length) continue;
    const r = s.rv * 1.25, oct = [];
    for (let k = 0; k < 8; k++) oct.push([s.p[0] + Math.cos((k + 0.5) * Math.PI / 4) * r, s.p[1] + Math.sin((k + 0.5) * Math.PI / 4) * r]);
    let rest = regions[i];
    parts[i] = [G.clipConvex(rest, oct)].filter((x) => x.length);
    for (let k = 0; k < 8 && rest.length; k++) {
      const [nx, ny, c] = G.edgeLine(oct, k);
      const out = G.clipHalf(rest, -nx, -ny, -c);          // beyond this side of the octagon
      rest = G.clipHalf(rest, nx, ny, c);
      if (!out.length || Math.abs(G.area(out)) < 1) continue;
      let best = -1, most = 0, near = Infinity;
      const cen = G.centroid(out);
      seeds.forEach((t, j) => {
        if (t.kind === 'village' || !regions[j].length) return;
        let L = 0;
        for (let e = 0; e < out.length; e++) for (let f = 0; f < regions[j].length; f++) L += G.sharedLength(out[e], out[(e + 1) % out.length], regions[j][f], regions[j][(f + 1) % regions[j].length]);
        const dd = Math.hypot(t.p[0] - cen[0], t.p[1] - cen[1]);
        if (L > most + 1e-6 || (most === 0 && L === 0 && dd < near)) { best = j; most = L; near = dd; }
      });
      if (best >= 0) parts[best].push(out); else parts[i].push(out);
    }
  }
  const orphans = [];
  seeds.forEach((s, i) => {
    const area = parts[i].reduce((t, P) => t + Math.abs(G.area(P)), 0);
    if (!parts[i].length) return;
    if (area < 6000) { orphans.push(...parts[i]); return; }
    const plan = PLANS[s.kind], Ry = Rand(o.seed, `year/${i}`);
    let year = Math.round(Ry.range(plan.year[0], plan.year[1]));
    if (i > 0 && s.kind !== 'village') year = Math.max(year, city.districts[0] ? city.districts[0].year + 60 : year);
    const toCore = Math.atan2(core[1] - s.p[1], core[0] - s.p[0]);
    city.districts.push({ id: city.districts.length, kind: s.kind, plan, era: { ...plan, year }, year, seed: s.p, parts: parts[i], region: parts[i][0], area, centre: G.centroid(parts[i][0]), angle: toCore + Ry.range(-0.25, 0.25), isCore: i === 0 });
    city.years[0] = Math.min(city.years[0], year);
  });
  for (const P of orphans) {            // a cell too small to be a district joins the nearest one
    const c = G.centroid(P);
    let best = city.districts[0], bd = Infinity;
    for (const d of city.districts) { const dd = Math.hypot(d.seed[0] - c[0], d.seed[1] - c[1]); if (dd < bd) { bd = dd; best = d; } }
    best.parts.push(P); best.area += Math.abs(G.area(P));
  }

  // each district is cut along the lanes it inherits
  for (const d of city.districts) d.pieces = d.parts.flatMap((P) => cutByLanes(P, city.lanes, core).map((poly) => ({ poly, year: d.year })));
  // the lanes are the old roads
  for (const L of city.lanes) city.roads.push({ a: L.o, b: [L.o[0] + L.u[0] * S * 1.5, L.o[1] + L.u[1] * S * 1.5], rank: 'old road', width: OLDROAD, year: city.years[0] });

}

/** What stood in a given year: the blocks laid by then, and the buildings standing then. */
export function standing(city, year) {
  return {
    blocks: city.blocks.filter((b) => b.year <= year),
    buildings: city.buildings.filter((b) => b.from <= year && (b.to == null || b.to > year)),
    districts: city.districts.filter((d) => d.year <= year),
  };
}

// ---------------------------------------------------------------------------- the plan --
/** A district's region, cut along the lanes that cross it (the core is cut into wedges between them). */
function cutByLanes(region, lanes, core) {
  if (G.inside(region, core, -1e-6)) {
    const out = [];
    for (let k = 0; k < lanes.length; k++) {
      const u = lanes[k].u, v = lanes[(k + 1) % lanes.length].u;
      // left of lane k and right of lane k+1: the wedge between them (their gap is under π)
      let W = G.clipHalf(region, -u[1], u[0], -(-u[1] * core[0] + u[0] * core[1]));
      W = G.clipHalf(W, v[1], -v[0], -(v[1] * core[0] - v[0] * core[1]));
      if (W.length) out.push(W);
    }
    return out;
  }
  let pieces = [region];
  for (const L of lanes) {
    const next = [];
    for (const P of pieces) {
      const span = G.lineSpan(P, L.o, L.u[0], L.u[1]);
      if (span && span[0] > 1) { for (const half of G.split(P, L.o, L.u[0], L.u[1])) if (half.length && Math.abs(G.area(half)) > 50) next.push(half); }
      else next.push(P);
    }
    pieces = next;
  }
  return pieces;
}

/** A district's lattice of block cells, clipped to one piece of its region. */
function layDistrict(city, d, o) {
  // an unplanned core or village grows block by block inside each piece (the field's own grain);
  // a planned lattice (and a suburb's) is laid once across the whole district and clipped to its pieces
  d.perPiece = d.kind === 'organic' || d.kind === 'village';
  if (d.perPiece) for (const piece of d.pieces) lay(city, d, o, [piece]);
  else lay(city, d, o, d.pieces);
}
function lay(city, d, o, pieces) {
  const e = d.plan, R = Rand(o.seed, `lattice/${d.id}/${city.blocks.length}`);
  const add = (cell, avenue = null) => {
    // the lattice cell's fragments in each piece, merged back together wherever no road divides them
    // (a piece boundary inside one plan is a field cell's edge, not a street)
    let frags = [];
    for (const piece of pieces) {
      const C0 = G.clipConvex(cell, piece.poly);
      if (C0.length >= 3 && G.area(C0) >= 1) frags.push({ poly: C0, piece, edges: [piece.poly] });
    }
    // first whole groups (three field cells meeting inside one block are convex only together), then pairs
    if (frags.length > 1) {
      const up = frags.map((_, i) => i), root = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
      for (let i = 0; i < frags.length; i++) for (let j = i + 1; j < frags.length; j++) {
        const A = frags[i].poly, B = frags[j].poly;
        for (let a = 0; a < A.length; a++) for (let b = 0; b < B.length; b++) {
          if (G.sharedLength(A[a], A[(a + 1) % A.length], B[b], B[(b + 1) % B.length]) > 0.5 && !roadAlong(city, A[a], A[(a + 1) % A.length])) up[root(i)] = root(j);
        }
      }
      const groups = new Map();
      frags.forEach((f, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
      frags = [...groups.values()].flatMap((gr) => {
        if (gr.length < 2) return gr;
        const H = G.hull(gr.flatMap((f) => f.poly)), sum = gr.reduce((t, f) => t + Math.abs(G.area(f.poly)), 0);
        if (Math.abs(Math.abs(G.area(H)) - sum) > 1e-6 * sum + 1e-6) return gr;
        const keep = gr.reduce((b2, f) => (Math.abs(G.area(f.poly)) > Math.abs(G.area(b2.poly)) ? f : b2));
        return [{ poly: H, piece: keep.piece, edges: gr.flatMap((f) => f.edges) }];
      });
    }
    for (let merged = true; merged && frags.length > 1;) {
      merged = false;
      for (let i = 0; i < frags.length && !merged; i++) for (let j = i + 1; j < frags.length && !merged; j++) {
        const A = frags[i].poly, B = frags[j].poly;
        let shared = null;
        for (let a = 0; a < A.length && !shared; a++) for (let b = 0; b < B.length && !shared; b++) if (G.sharedLength(A[a], A[(a + 1) % A.length], B[b], B[(b + 1) % B.length]) > 0.5) shared = [A[a], A[(a + 1) % A.length]];
        if (!shared || roadAlong(city, shared[0], shared[1])) continue;
        const H = G.hull([...A, ...B]);
        if (Math.abs(Math.abs(G.area(H)) - Math.abs(G.area(A)) - Math.abs(G.area(B))) > 1e-6 * Math.abs(G.area(H)) + 1e-6) continue;   // their union is not convex
        const keep = Math.abs(G.area(A)) >= Math.abs(G.area(B)) ? frags[i] : frags[j];
        frags[i] = { poly: H, piece: keep.piece, edges: [...frags[i].edges, ...frags[j].edges] };
        frags.splice(j, 1); merged = true;
      }
    }
    if (d.cutRoads && d.cutRoads.length) frags = frags.flatMap((fr) => cutAlongRoads(fr, d.cutRoads));
    for (const fr of frags) {
      if (Math.abs(G.area(fr.poly)) < 40) continue;
      for (const { poly: C, banks } of clipToLand(city, fr.poly)) {
        if (C.length < 3 || G.area(C) < 40) continue;
        const av = avenue ? C.map((p, i) => avenue(p, C[(i + 1) % C.length])) : null;
        const onPiece = C.map((p, i) => fr.edges.some((E) => G.onBoundary(E, p, C[(i + 1) % C.length]) >= 0));
        city.blocks.push({ id: city.blocks.length, district: d.id, year: fr.piece.year ?? d.year, site: fr.piece.site ?? -1, cell: C, avenue: av, onPiece, banks, roadLines: fr.roadLines || null });
      }
    }
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pc of pieces) for (const p of pc.poly) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const reg = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  const centre = [(minX + maxX) / 2, (minY + maxY) / 2], span = Math.hypot(maxX - minX, maxY - minY);

  if (e.lattice === 'grid') {
    // a rectangular lattice at the district's angle, its origin on the district's seed (so its pieces
    // either side of a lane are one grid, interrupted)
    const RG = Rand(o.seed, `grid/${d.id}`);
    const ux = Math.cos(d.angle), uy = Math.sin(d.angle), vx = -uy, vy = ux;
    const bw = RG.range(e.cell[0], e.cell[1]), bd = RG.range(e.cell[0], e.cell[1]) * RG.range(1.1, 1.6);
    const ox = d.seed[0], oy = d.seed[1], k = e.avenueEvery || 99;
    const cu = (centre[0] - ox) * ux + (centre[1] - oy) * uy, cv = (centre[0] - ox) * vx + (centre[1] - oy) * vy;
    const nu = Math.ceil(span / bw) + 1, nv = Math.ceil(span / bd) + 1, iu = Math.round(cu / bw), iv = Math.round(cv / bd);
    for (let i = iu - nu; i <= iu + nu; i++) for (let j = iv - nv; j <= iv + nv; j++) {
      const cx = ox + ux * (i + 0.5) * bw + vx * (j + 0.5) * bd, cy = oy + uy * (i + 0.5) * bw + vy * (j + 0.5) * bd;
      const onLine = (p, q) => {
        const su = ((p[0] - ox) * ux + (p[1] - oy) * uy) / bw, sv = ((p[0] - ox) * vx + (p[1] - oy) * vy) / bd;
        const tu = ((q[0] - ox) * ux + (q[1] - oy) * uy) / bw, tv = ((q[0] - ox) * vx + (q[1] - oy) * vy) / bd;
        const on = (s, t) => Math.abs(s - t) < 1e-6 && Math.abs(s - Math.round(s)) < 1e-6 && ((Math.round(s) % k) + k) % k === 0;
        return on(su, tu) || on(sv, tv);
      };
      add(G.orientedRect(cx, cy, ux, uy, bw / 2, bd / 2), onLine);
    }
  } else if (e.lattice === 'radial') {
    // rings and spokes round a rond-point on the district's seed; sectors DOUBLE outward from a base
    // of 8, so every spoke runs on through the outer rings and the avenue spokes stay straight
    const c = d.seed, r0 = e.plaza, dr = e.ring, k = e.avenueEvery || 99, BASE = 8;
    const rmax = Math.max(...reg.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));     // the box's far corner
    const fOf = (ring) => { const ra = r0 + ring * dr, want = (2 * Math.PI * (ra + dr / 2)) / (dr * 1.3); let f = 1; while (BASE * f * 2 <= want) f *= 2; return f; };
    const at = (a, r) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    // the rond-point itself: a polygon on the first ring's spokes
    const f0 = BASE * fOf(0), plaza = [];
    for (let s = 0; s < f0; s++) plaza.push(at(d.angle + (s / f0) * Math.PI * 2, r0));
    const before = city.blocks.length;
    add(plaza, () => true);
    for (let i = before; i < city.blocks.length; i++) city.blocks[i].plaza = true;
    for (let ring = 0; r0 + ring * dr < rmax; ring++) {
      const ra = r0 + ring * dr, rb = ra + dr, f = fOf(ring), spokes = BASE * f, split = fOf(ring + 1) / f;
      for (let s = 0; s < spokes; s++) {
        const a0 = d.angle + (s / spokes) * Math.PI * 2, a1 = d.angle + ((s + 1) / spokes) * Math.PI * 2;
        // the outer side follows the next ring's spokes, so the rings meet without gaps
        const cell = [at(a0, ra)];
        for (let k = 0; k <= split; k++) cell.push(at(a0 + (a1 - a0) * (k / split), rb));
        cell.push(at(a1, ra));
        const onLine = (p, q) => {
          const rp = Math.hypot(p[0] - c[0], p[1] - c[1]), rq = Math.hypot(q[0] - c[0], q[1] - c[1]);
          if (Math.abs(rp - r0) < 1e-6 && Math.abs(rq - r0) < 1e-6) return true;
          const idx = (pt) => ((((Math.atan2(pt[1] - c[1], pt[0] - c[0]) - d.angle) / (Math.PI * 2)) * spokes) % spokes + spokes) % spokes;
          const sp = idx(p), sq = idx(q), on = (x) => Math.abs(x - Math.round(x)) < 1e-6;
          return on(sp) && on(sq) && Math.round(sp) % spokes === Math.round(sq) % spokes && Math.round(sp) % (f * k) === 0;
        };
        add(G.ccw(cell), onLine);
      }
    }
    d.plaza = c;
  } else {
    // organic, village, suburb: a Voronoi of jittered points in the pieces, relaxed once (Lloyd) unless
    // the plan wants its cells raw
    const cell = e.cell, pts = [];
    for (let x = minX - cell; x <= maxX + cell; x += cell) for (let y = minY - cell; y <= maxY + cell; y += cell) {
      const p = [x + R.range(-0.5, 0.5) * cell * e.jitter, y + R.range(-0.5, 0.5) * cell * e.jitter];
      if (pieces.some((pc) => G.inside(pc.poly, p, cell * 0.2))) pts.push(p);
    }
    if (!pts.length) pts.push(G.centroid(pieces[0].poly));
    let cells = G.voronoi(pts, reg);
    if (e.relax !== false) cells = G.voronoi(cells.map((C, i) => (C.length ? G.centroid(C) : pts[i])), reg);
    for (const C of cells) if (C.length) add(C);
  }
}

/** A fragment cut along every road segment that crosses it (by the road's whole line: a road ending
 * inside a block runs on to the block's next street). The cut edges remember their road. */
function cutAlongRoads(fr, roads) {
  let out = [fr];
  for (const r of roads) {
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, c = -(nx * r.a[0] + ny * r.a[1]);
    const next = [];
    for (const f of out) {
      const P = f.poly;
      let lo = Infinity, hi = -Infinity, neg = false, pos = false;
      for (const p of P) { const t = ux * (p[0] - r.a[0]) + uy * (p[1] - r.a[1]), sd = nx * p[0] + ny * p[1] + c; lo = Math.min(lo, t); hi = Math.max(hi, t); if (sd < -0.5) neg = true; if (sd > 0.5) pos = true; }
      if (!(neg && pos) || hi < 0 || lo > L) { next.push(f); continue; }
      const line = [nx, ny, c], A = G.clipHalf(P, nx, ny, c), B = G.clipHalf(P, -nx, -ny, -c);
      for (const Q of [A, B]) if (Q.length >= 3) next.push({ ...f, poly: Q, roadLines: [...(f.roadLines || []), { line, road: r }] });
    }
    out = next;
  }
  return out;
}

/**
 * A block cell cut back to dry land: where the ground's river runs through it, the cell is cut by two
 * lines either side of the channel (the channel is nearly straight across one block) and the strip
 * between is water; where the sea reaches it, it is cut along the shore. The cut edges are BANKS
 * (returned as lines), and become quays.
 */
function clipToLand(city, C) {
  const g = city.ground;
  if (!g) return [{ poly: C, banks: null }];
  let out = [{ poly: C, banks: [] }];
  if (g.river) {
    const w2 = g.river.width / 2, near = [...C, G.centroid(C)].some((p) => g.riverDistAt(p[0], p[1]) < w2 + 40);
    if (near) {
      // the channel's points over this cell, and the line they make
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of C) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const P = g.river.path, m = w2 + 40, pts = P.filter(([x, y]) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m);
      if (pts.length >= 2) {
        const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        const c0 = -(nx * a[0] + ny * a[1]);
        // the channel strays from the chord by its bend: widen the strip to cover it
        let bend = 0; for (const [x, y] of pts) bend = Math.max(bend, Math.abs(nx * x + ny * y + c0));
        const half = w2 + Math.min(bend, 25);
        const left = [nx, ny, c0 - half], right = [-nx, -ny, -c0 - half];
        out = [];
        for (const L2 of [left, right]) { const Q = G.clipHalf(C, L2[0], L2[1], L2[2]); if (Q.length >= 3) out.push({ poly: Q, banks: [L2] }); }
      }
    }
  }
  if (g.shore && [...C].some(([x, y]) => g.heightAt(x, y) < 0.5)) {
    const ux = Math.cos(g.shore.dir), uy = Math.sin(g.shore.dir), cen = G.centroid(C), s0 = g.shore.at(cen[0], cen[1]) - 4;
    const L2 = [-ux, -uy, s0];
    out = out.flatMap(({ poly, banks }) => { const Q = G.clipHalf(poly, L2[0], L2[1], L2[2]); return Q.length >= 3 ? [{ poly: Q, banks: [...banks, L2] }] : []; });
  }
  return out;
}

/** Each block edge's street: the ring (the old wall), a seam between plans, an old lane, an avenue, a street. */
function rankEdges(city, b, o) {
  const d = city.districts[b.district], e = d.plan, Rs = Rand(o.seed, `street/${b.id}`);
  b.widths = b.cell.map((p, i) => {
    const q = b.cell[(i + 1) % b.cell.length];
    let w, rank;
    // an old road along this edge? (a lane of the countryside, or of the settlement field)
    const road = roadAlong(city, p, q);
    // which district lies across? (none: the frame, the countryside, or water)
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [nx, ny] = G.edgeLine(b.cell, i), out = [mid[0] - nx * 3, mid[1] - ny * 3];
    const other = districtAt(city, out);
    const cutRoad = !road && b.roadLines && b.roadLines.find(({ line: L }) => Math.abs(L[0] * p[0] + L[1] * p[1] + L[2]) < 1e-6 && Math.abs(L[0] * q[0] + L[1] * q[1] + L[2]) < 1e-6);
    if (road) { w = road.width; rank = road.rank; }
    else if (cutRoad) { w = cutRoad.road.width; rank = cutRoad.road.rank; }
    else if (b.banks && b.banks.some((L) => Math.abs(L[0] * p[0] + L[1] * p[1] + L[2]) < 1e-6 && Math.abs(L[0] * q[0] + L[1] * q[1] + L[2]) < 1e-6)) { w = QUAY; rank = 'quay'; }
    else if (other === d && b.onPiece && b.onPiece[i] && !d.perPiece) { w = 0; rank = 'closed'; }     // inside one lattice: no street
    else if (other && other !== d) {
      if (d.isCore || other.isCore) { w = RING; rank = 'ring'; }
      else { w = SEAM; rank = 'seam'; }
    } else if (!other && waterAt(city, out)) { w = QUAY; rank = 'quay';
    } else if (b.avenue && b.avenue[i]) { w = e.avenue; rank = 'avenue'; }
    else { w = Rs.range(e.street[0], e.street[1]); rank = 'street'; }
    return { w: w * o.streetScale, rank };
  });
}

/**
 * Blocks too small to build on are not built: absorbed by a neighbour across a minor street (which is
 * closed), or left as a traffic island or a pocket square.
 */
function slivers(city) {
  const MIN_AREA = 450, MIN_R = 6.5;
  const test = (b) => !b.lot.length || Math.abs(G.area(b.lot)) < MIN_AREA || G.inradius(b.lot) < MIN_R;
  const sliver = city.blocks.map(test);
  const box = city.blocks.map((b) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of b.cell) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; });
  const minor = (r) => r === 'street' || r === 'seam' || r === 'closed';
  for (const b of city.blocks) {
    if (!sliver[b.id]) continue;
    // the neighbours sharing a minor street with it, biggest first; but a fragment whose street is
    // already closed (a lattice cell cut by a field cell's edge) joins across that, and no street is lost
    let best = null, bestEdge = -1, theirEdge = -1, bestArea = 0, bestCost = 9;
    const COST = { closed: 0, street: 1, seam: 2 };
    const [x0, y0, x1, y1] = box[b.id];
    for (const c of city.blocks) {
      if (c === b || c.absorbed != null || sliver[c.id] || !c.lot.length) continue;
      const k = box[c.id];
      if (k[0] > x1 || k[2] < x0 || k[1] > y1 || k[3] < y0) continue;
      for (let i = 0; i < b.cell.length; i++) {
        if (!minor(b.widths[i].rank)) continue;
        const p = b.cell[i], q = b.cell[(i + 1) % b.cell.length];
        for (let j = 0; j < c.cell.length; j++) {
          if (G.sharedLength(p, q, c.cell[j], c.cell[(j + 1) % c.cell.length]) > 3) {
            const A = Math.abs(G.area(c.lot)), cost = COST[b.widths[i].rank];
            if (cost < bestCost || (cost === bestCost && A > bestArea)) { best = c; bestEdge = i; theirEdge = j; bestArea = A; bestCost = cost; }
          }
        }
      }
    }
    if (best) {
      b.widths[bestEdge] = { w: 0, rank: 'closed' }; best.widths[theirEdge] = { w: 0, rank: 'closed' };
      b.lot = G.inset(b.cell, b.widths.map((x) => x.w / 2)); best.lot = G.inset(best.cell, best.widths.map((x) => x.w / 2));
      b.absorbed = best.id;
    } else if (b.lot.length) {
      if (Math.abs(G.area(b.lot)) < 200) b.island = true; else { b.square = 'pocket'; city.squares.push(b.id); }
    }
  }
}

// ---------------------------------------------------------------------------- the fabric --
/** Land value, 0..1: falling from the core, higher on the big streets and round a rond-point. */
function value(city, p, rank, b) {
  let v;
  if (city.rentOf && b && b.site >= 0) v = city.rentOf(b.site);        // the settlement field's own land market
  else { const c = city.districts[0] ? city.districts[0].seed : [0, 0]; v = Math.exp(-Math.hypot(p[0] - c[0], p[1] - c[1]) / (city.size * 0.3)); }
  for (const d of city.districts) if (d.plaza) v += 0.35 * Math.exp(-Math.hypot(p[0] - d.plaza[0], p[1] - d.plaza[1]) / 160);
  v *= { ring: 1.3, avenue: 1.25, 'old road': 1.2, 'main street': 1.15, quay: 1.12, seam: 1.08 }[rank] || 1;
  if (city.ground) v *= 1 - Math.min(0.5, city.ground.slopeAt(p[0], p[1]) * 1.5);   // a slope costs to build on
  return Math.max(0, Math.min(1, v));
}

/**
 * How far an UNPLANNED district's fabric leans toward its neighbour's at this point: up to half-way at
 * the seam, nothing 150 m in. A planned district keeps its edge (0).
 */
function blend(city, d, p) {
  if (d.plan.planned) return null;
  let best = Infinity, other = null;
  for (const P of d.parts) for (let i = 0; i < P.length; i++) {
    if (!G.inside(P, p, 1)) break;                       // only the part the point is in
    const dist = G.edgeDist(P, i, p);
    if (dist < best && dist > -1) {
      const [nx, ny] = G.edgeLine(P, i), foot = [p[0] - nx * (dist + 2), p[1] - ny * (dist + 2)];
      const o = districtAt(city, foot);
      if (o && o !== d) { best = Math.max(0, dist); other = o; }
    }
  }
  if (!other) return null;
  const w = 0.5 * (1 - smooth(0, 150, best));
  return w > 0.01 ? { w, other } : null;
}
/** A bucket grid over every district's parts (and the water's), so a point finds its district quickly. */
function indexParts(city) {
  const B = 120, half = city.size / 2, nb = Math.ceil(city.size / B) + 1, grid = new Map();
  const put = (P, item) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let j = Math.floor((y0 + half) / B); j <= Math.floor((y1 + half) / B); j++) for (let i = Math.floor((x0 + half) / B); i <= Math.floor((x1 + half) / B); i++) {
      const k = j * nb + i; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([P, item]);
    }
  };
  for (const d of city.districts) for (const P of d.parts) put(P, d);
  for (const P of city.water) put(P, 'water');
  city._index = { B, half, nb, grid };
}
const atIndex = (city, p) => { const I = city._index; return I.grid.get(Math.floor((p[1] + I.half) / I.B) * I.nb + Math.floor((p[0] + I.half) / I.B)) || []; };
/** The district a point lies in, or null outside every district. */
function districtAt(city, p) {
  for (const [P, item] of atIndex(city, p)) if (item !== 'water' && G.inside(P, p, 1e-6)) return item;
  return null;
}
/** Whether a point is in the water: a river or sea cell of the field, or the ground's own water. */
function waterAt(city, p) {
  for (const [P, item] of atIndex(city, p)) if (item === 'water' && G.inside(P, p, 1e-6)) return true;
  return !!(city.ground && city.ground.water(p[0], p[1]));
}
/** An old road running along the segment p–q, if any. */
function roadAlong(city, p, q) {
  for (const r of city.roads) {
    if (r.erased != null) continue;
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const dp = -uy * (p[0] - r.a[0]) + ux * (p[1] - r.a[1]), dq = -uy * (q[0] - r.a[0]) + ux * (q[1] - r.a[1]);
    if (Math.abs(dp) > 1e-5 || Math.abs(dq) > 1e-5) continue;
    const tp = ux * (p[0] - r.a[0]) + uy * (p[1] - r.a[1]), tq = ux * (q[0] - r.a[0]) + uy * (q[1] - r.a[1]);
    if (Math.min(tp, tq) > -1e-6 && Math.max(tp, tq) < L + 1e-6) return r;
  }
  return null;
}

/** Divide a block among the streets it fronts, and each frontage into strips (the finest plots). */
function layPlots(city, b, o) {
  const d = city.districts[b.district], e = d.plan, B = b.lot, Z = G.zones(B);
  const R = Rand(o.seed, `plots/${b.id}`);
  Z.forEach((zone, i) => {
    if (zone.length < 3) return;
    const a = B[i], q = B[(i + 1) % B.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]);
    const closed = b.widths[i] && b.widths[i].rank === 'closed', rank = b.widths[i] ? b.widths[i].rank : 'street';
    const f = { id: city.frontages.length, block: b.id, district: d.id, edge: i, a, q, rank, closed, strips: [] };
    city.frontages.push(f);
    if (L < 3 || closed) { f.strips.push(addPlot(city, b, zone, i, Math.max(L, 0.1), closed)); return; }
    const ux = (q[0] - a[0]) / L, uy = (q[1] - a[1]) / L;
    // the plan's plot width, leaning toward the neighbour's across an unplanned seam
    const bl = blend(city, d, [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2]);
    let lo = e.plotW[0], hi = e.plotW[1];
    if (bl) { lo = lerp(lo, bl.other.plan.plotW[0], bl.w); hi = lerp(hi, bl.other.plan.plotW[1], bl.w); }
    lo *= o.plotScale; hi *= o.plotScale;
    const ws = [];
    let sum = 0;
    while (sum < L - lo * 0.5) { const w = R.range(lo, hi); ws.push(w); sum += w; }
    if (!ws.length) ws.push(L);
    const k = L / ws.reduce((s, w) => s + w, 0), cuts = [];
    let acc = 0;
    for (let m = 0; m < ws.length - 1; m++) { acc += ws[m] * k; cuts.push(acc); }
    G.slices(zone, a, ux, uy, cuts).forEach((S, m) => { if (S.length >= 3) f.strips.push(addPlot(city, b, S, i, ws[m] * k, false)); });
  });
}
function addPlot(city, b, poly, front, width, yard) {
  const B = b.lot, a = B[front], q = B[(front + 1) % B.length];
  const p = { id: city.plots.length, block: b.id, district: b.district, poly, front: [a, q], frontEdge: front, width, depth: depthFrom(poly, a, q), yard };
  const c = G.centroid(poly);
  p.value = value(city, c, b.widths[front] ? b.widths[front].rank : 'street', b);
  if (city.ground) { p.elev = city.ground.heightAt(c[0], c[1]); p.flood = city.ground.floodplain(c[0], c[1]); }
  city.plots.push(p);
  return p.id;
}
function depthFrom(P, a, q) {
  const dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  let m = 0; for (const p of P) m = Math.max(m, nx * (p[0] - a[0]) + ny * (p[1] - a[1]));
  return m;
}

// ---------------------------------------------------------------------------- the buildings --
/** The first building on each parcel of a frontage, in its plan's style, in the decades after the plan. */
function firstBuild(city, f, o) {
  const d = city.districts[f.district], R = Rand(o.seed, `first/${f.id}`);
  f.parcels = [];
  for (const id of f.strips) {
    const prev = f.parcels[f.parcels.length - 1];
    if (prev && R.chance(d.plan.merge) && !city.plots[id].yard && !city.plots[prev.strips[0]].yard) prev.strips.push(id);
    else f.parcels.push({ strips: [id], building: null });
  }
  for (const pc of f.parcels) {
    const year = city.blocks[f.block].year + Math.round(R.range(0, d.plan.planned ? 25 : 60));
    pc.building = build(city, f, pc.strips, d.plan.style, year, o);
  }
}

/** One wave of redevelopment along a frontage: the rent gap decides who is rebuilt, and how much they take with them. */
function rebuild(city, f, wave, o) {
  const d = city.districts[f.district];
  if (city.blocks[f.block].year > wave.year - 20 || f.closed) return;
  const st = STYLES[wave.style], R = Rand(o.seed, `wave/${wave.year}/${f.id}`);
  const out = [];
  for (let i = 0; i < f.parcels.length; i++) {
    const pc = f.parcels[i], cur = pc.building ? city.buildings[pc.building] : null;
    const young = cur && cur.from > wave.year - 45;
    let v = pc.strips.reduce((s, id) => s + city.plots[id].value, 0) / pc.strips.length;
    if (city.ground) {
      // the ground changes what land is worth: before the river is embanked the floodplain is a poor
      // place to build; after 1850 high ground has a view and clean air (the hill villas, Nob Hill)
      const pl = city.plots[pc.strips[0]], lift = Math.max(0, Math.min(1, (pl.elev - city.lowGround) / 40));
      if (wave.year >= 1850) v = Math.min(1, v * (1 + 0.5 * lift));
      else if (pl.flood) v *= 0.6;
    }
    const villa = cur && cur.style === 'villa';
    const p = wave.p * Math.pow(v, 1.6) * (villa ? 0.35 : 1) * (d.kind === 'village' ? 0.5 : 1);
    if (young || pc.strips.every((id) => city.plots[id].yard) || !R.chance(p)) { out.push(pc); continue; }
    // the new building takes this parcel, and (in a merging style) its neighbours, up to the style's width
    const strips = [...pc.strips], ended = [pc];
    let width = strips.reduce((s, id) => s + city.plots[id].width, 0);
    while (i + 1 < f.parcels.length && R.chance(st.merge)) {
      const nx = f.parcels[i + 1], nb = nx.building ? city.buildings[nx.building] : null;
      const w = nx.strips.reduce((s, id) => s + city.plots[id].width, 0);
      if ((nb && nb.from > wave.year - 45) || width + w > st.maxW) break;
      strips.push(...nx.strips); ended.push(nx); width += w; i++;
    }
    const year = wave.year + Math.round(R.range(0, 30));
    for (const e of ended) if (e.building != null) city.buildings[e.building].to = year;
    out.push({ strips, building: build(city, f, strips, wave.style, year, o) });
  }
  f.parcels = out;
}

/** A building on a parcel (consecutive strips of one frontage): on its front, as deep, tall and roofed as its style built. */
function build(city, f, strips, styleName, year, o) {
  const st = STYLES[styleName], d = city.districts[f.district];
  const parcel = strips.length === 1 ? city.plots[strips[0]].poly : G.hull(strips.flatMap((id) => city.plots[id].poly));
  if (strips.every((id) => city.plots[id].yard)) return null;
  const R = Rand(o.seed, `building/${f.id}/${strips[0]}/${year}`);
  const { a, q } = f, dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const c0 = -(nx * a[0] + ny * a[1]);
  if (st.setback === 0 && strips.length === 1 && R.chance(0.03)) return null;     // a gap: a yard, a gate
  const setback = st.setback, depth = R.range(st.depth[0], st.depth[1]);
  let F = G.clipHalf(parcel, nx, ny, c0 - setback);
  F = G.clipHalf(F, -nx, -ny, -c0 + setback + depth);
  if (st.side) {
    const w = F.map((pt, i) => { const nb = F[(i + 1) % F.length], mid = [(pt[0] + nb[0]) / 2, (pt[1] + nb[1]) / 2]; return Math.abs(nx * mid[0] + ny * mid[1] + c0 - setback) < 0.5 ? 0 : st.side; });
    F = G.inset(F, w);
  }
  if (F.length < 3 || G.area(F) < 18) return null;
  // height: the style's range, along the land's value (and an unplanned seam leans to its neighbour's)
  const v = strips.reduce((s, id) => s + city.plots[id].value, 0) / strips.length;
  let lo = st.storeys[0], hi = st.storeys[1];
  const bl = blend(city, d, G.centroid(F));
  if (bl && bl.other.year <= year) { const os = STYLES[bl.other.plan.style]; lo = lerp(lo, os.storeys[0], bl.w); hi = lerp(hi, os.storeys[1], bl.w); }
  let storeys = Math.max(1, Math.round((lo + (hi - lo) * Math.pow(v, 0.8) + R.range(-0.6, 0.6)) * o.heightScale));
  if (st.tower && Math.abs(G.area(F)) > 450 && R.chance(st.tower * v)) storeys = Math.round(storeys * R.range(1.6, 2.6));
  const h = storeys * st.storeyH;
  const roof = st.roof === 'hip' ? G.hipRoof(F, st.pitch) : st.roof === 'mansard' ? mansard(F, st.storeyH * 1.1) : null;
  const b = { id: city.buildings.length, plot: strips[0], strips, frontage: f.id, district: f.district, style: styleName, from: year, to: null, footprint: F, storeys, height: h, roof: st.roof, roofFaces: roof, base: 0, fall: 0 };
  if (city.ground) {
    // levelled on the ground: its platform at the mean of the natural surface under it (cut = fill),
    // and how far the ground falls across it (a slope shows a storey more on the low side)
    const hs = [...F, G.centroid(F)].map((pt) => city.ground.heightAt(pt[0], pt[1]));
    b.base = hs.reduce((s2, x) => s2 + x, 0) / hs.length; b.fall = Math.max(...hs) - Math.min(...hs);
  }
  city.buildings.push(b);
  return b.id;
}
/** A mansard: a steep lower slope up to a set height, then flat (the hip zones, capped). */
function mansard(F, h) {
  const steep = 2.2, cap = h / steep;
  return G.zones(F).map((Z, i) => ({ edge: i, poly: Z.map((p) => [p[0], p[1], Math.min(cap, Math.max(0, G.edgeDist(F, i, p))) * steep]) })).filter((r) => r.poly.length >= 3);
}

function stats(city) {
  const A = (P) => Math.abs(G.area(P));
  // the land is the frame, or (laid on a settlement field) the town's own districts
  const now = standing(city, PRESENT).buildings, land = city.rentOf ? city.districts.reduce((t, d) => t + d.parts.reduce((u, P) => u + A(P), 0), 0) : A(city.frame);
  const lots = city.blocks.reduce((s, b) => s + (b.lot.length ? A(b.lot) : 0), 0);
  const built = now.reduce((s, b) => s + A(b.footprint), 0), floor = now.reduce((s, b) => s + A(b.footprint) * b.storeys, 0);
  const byStyle = {};
  for (const b of now) byStyle[b.style] = (byStyle[b.style] || 0) + 1;
  return {
    districts: city.districts.length, blocks: city.blocks.length, plots: city.plots.length, buildings: now.length, everBuilt: city.buildings.length,
    streetShare: 1 - lots / land, coverage: built / land, far: floor / land,
    tallest: now.reduce((m, b) => Math.max(m, b.height), 0), byStyle,
    absorbed: city.blocks.filter((b) => b.absorbed != null).length, islands: city.blocks.filter((b) => b.island).length,
    survivors: now.filter((b) => b.from < 1800).length, bridges: city.bridges.length, quays: city.streets.filter((x) => x.rank === 'quay').length,
  };
}
