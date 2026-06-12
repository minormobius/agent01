// society3d.js — the FOAM SOCIETY kernel: the econ genome run over rind's actual 3D chamber foam.
//
// econ.js v1 lived on a flat rectangle with crow-flight supply wiring. The real world is the
// annular sector foam (rind/wayfind.js sectorFoam — the 33k-chamber foamview scene): a chamber
// GRAPH where gravity is radial and travel is ANISOTROPIC — azimuthal is level street, radial is
// climb, and climb is only cheap where a certified spiral ramp exists. This module inverts the
// v1 order of operations into the one a load-bearing foam forces:
//
//   1. INFRASTRUCTURE FIRST. wayfind's planRoute() finds two certified corkscrew ramps + level
//      azimuthal roads through the chamber graph; those chambers become RIGHT-OF-WAY — reserved,
//      unbuildable, the city yields to them.
//   2. BUILDINGS CLAIM THE REMAINDER. The buildable chambers agglomerate into buildings sized by
//      function (the econ genome's FOOTPRINT), via weighted graph-Voronoi over chamber adjacency —
//      so a building is a connected clump of real chambers, keyed by chamber index (the foamview's
//      own id space; painting the society IS colouring chambers by owner).
//   3. SUPPLY MOVES ON ROADS, NOT THROUGH WALLS. Each resource's supplier assignment is a
//      label-propagating Dijkstra over the chamber graph with anisotropic edge costs: level run at
//      cost 1, radial climb at VERT× (hauling through stair-holes in plates), right-of-way edges
//      discounted (an engineered drivable deck). The "nearest" baker is nearest BY ROAD.
//   4. THE ORACLE LEARNS GEOGRAPHY. `access` — median road-cost from a dwelling to the nearest of
//      each everyday basket role (serve/heal/learn/worship/play/trade) — joins the vitality score.
//      Move the ramps and the score moves: wayfinding and society are finally one model.
//
// buildSociety / socialMetrics / removeImpact from econ.js run over the result unchanged (places
// expose planar (x, y) = (arc, axial); their radial blindness for hat-picking is a charted next
// leg — see FOAM.md). Deterministic from (genome, seed); pure; node + browser (no DOM).

import { ROLES, DOMAINS, DEFAULT_GENOME, makePlace } from './econ.js';
import { mulberry32 } from '../paint/voronoi.js';
import '../vendor/wayfind.js';                       // UMD → globalThis.HOOPWAYFIND (verbatim rind copy)

const WAYFIND = globalThis.HOOPWAYFIND;

// everyday destinations whose road-distance from home is the access metric (the 15-minute basket)
export const ACCESS_BASKET = ['serve', 'heal', 'learn', 'worship', 'play', 'trade'];

function pickRole(rng, genome) {
  const ent = Object.entries(genome.roleMix), tot = ent.reduce((s, [, w]) => s + w, 0);
  let r = rng() * tot; for (const [k, w] of ent) { r -= w; if (r <= 0) return k; } return 'dwell';
}

function heap() {
  const a = [];
  return {
    size: () => a.length,
    push(e) { a.push(e); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } },
    pop() { const t = a[0], l = a.pop(); if (a.length) { a[0] = l; let k = 0; for (;;) { const L = 2 * k + 1, R = L + 1; let m = k; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return t; },
  };
}

// graph-Voronoi over the buildable chambers, region size ∝ weight — paint's assignZones with the
// farthest-point seeding swapped for seeded-random seeds: farthest-point is O(zones·edges) BFS,
// hopeless at thousands of buildings over a 33k-chamber graph; random seeds + the same weighted
// multi-source Dijkstra keep the sized-connected-region guarantee at O(E log N).
function growBuildings(NB, adjList, weights, seedRng) {
  const nZ = Math.min(weights.length, NB);
  const zoneOf = new Int32Array(NB).fill(-1), cost = new Float64Array(NB).fill(Infinity);
  const taken = new Set(), h = heap();
  for (let zi = 0; zi < nZ; zi++) {
    let s = Math.floor(seedRng() * NB);
    while (taken.has(s)) s = (s + 1) % NB;
    taken.add(s); cost[s] = 0; zoneOf[s] = zi; h.push([0, s, zi]);
  }
  while (h.size()) {
    const [c, u, zi] = h.pop(); if (c > cost[u]) continue;
    const inc = 1 / Math.max(1e-6, weights[zi]);
    for (const v of adjList[u]) { const nc = c + inc; if (nc < cost[v]) { cost[v] = nc; zoneOf[v] = zi; h.push([nc, v, zi]); } }
  }
  return zoneOf;        // isolated pockets stay -1 (voids) — the foam thinning makes a few
}

// label-propagating Dijkstra: distance + OWNING SOURCE for every chamber, keeping the best TWO
// distinct labels per chamber so a place that produces a good can still find its nearest *other*
// supplier of it (trade/mend/store are in==out). Sources: [chamber, label][]. Returns {dist,label}
// arrays of length 2N — slot 2i is the best, 2i+1 the runner-up with a different label.
function dijkstra2(N, adjC, sources) {
  const dist = new Float64Array(2 * N).fill(Infinity), label = new Int32Array(2 * N).fill(-1);
  const h = heap();
  for (const [c, lbl] of sources) { if (0 < dist[2 * c]) { dist[2 * c] = 0; label[2 * c] = lbl; h.push([0, c, lbl]); } }
  const better = (i, d, lbl) => {
    if (label[2 * i] === lbl) { if (d < dist[2 * i]) { dist[2 * i] = d; return true; } return false; }
    if (d < dist[2 * i]) { if (label[2 * i] !== -1) { dist[2 * i + 1] = dist[2 * i]; label[2 * i + 1] = label[2 * i]; } dist[2 * i] = d; label[2 * i] = lbl; return true; }
    if (label[2 * i + 1] === lbl) { if (d < dist[2 * i + 1]) { dist[2 * i + 1] = d; return true; } return false; }
    if (d < dist[2 * i + 1]) { dist[2 * i + 1] = d; label[2 * i + 1] = lbl; return true; }
    return false;
  };
  while (h.size()) {
    const [d, u, lbl] = h.pop();
    if ((label[2 * u] === lbl && d > dist[2 * u]) || (label[2 * u + 1] === lbl && d > dist[2 * u + 1])) continue;
    if (label[2 * u] !== lbl && label[2 * u + 1] !== lbl) continue;
    for (const [v, w] of adjC[u]) { const nd = d + w; if (nd < dist[2 * v + 1] || label[2 * v] === lbl) { if (better(v, nd, lbl)) h.push([nd, v, lbl]); } }
  }
  return { dist, label };
}

// plain multi-source Dijkstra (distance field only) — the access metric
function dijkstra1(N, adjC, sources) {
  const dist = new Float64Array(N).fill(Infinity), h = heap();
  for (const c of sources) if (dist[c] > 0) { dist[c] = 0; h.push([0, c]); }
  while (h.size()) {
    const [d, u] = h.pop(); if (d > dist[u]) continue;
    for (const [v, w] of adjC[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; h.push([nd, v]); } }
  }
  return dist;
}

// ── the headline call: a seeded sector of the foam → a full city with a scored society shape ──
// Returns the same shape buildWorld() produces (places/edges/byRes/counts/closure/…) PLUS the
// foam-specific layer: chambers (positions), chamberOwner (chamber → building | -1 row | -2 void),
// rightOfWay, route (wayfind's certificate, drawable as ribbons), access (0..1), travel costs.
export function buildFoamCity({
  Ri = 250, T = 50, cell = 1, arcDeg = 18, axial = 10, grade = 0.4, seed = 1,
  genome = DEFAULT_GENOME, vert = 6, roadDiscount = 0.6, accessRef = 30,
} = {}) {
  const foam = WAYFIND.sectorFoam({ Ri, T, cell, arcDeg, axial, grade, seed });
  const nav = WAYFIND.buildNav(foam);
  const N = nav.n, cells = nav.cells, rBar = Ri + T / 2;

  // 1. RIGHT-OF-WAY: the certified ramp + road chains come first; the city yields to them.
  const route = WAYFIND.planRoute(nav, { seed });
  const row = new Set();
  if (route) {
    for (const c of route.A.cells) row.add(c);
    for (const c of route.B.cells) row.add(c);
    for (const rd of route.roads) for (const c of rd.cells) row.add(c);
  }

  // anisotropic edge costs over the chamber graph: level run cheap, climb dear, decks discounted
  const E = foam.mi.length, adjC = Array.from({ length: N }, () => []);
  for (let m = 0; m < E; m++) {
    const i = foam.mi[m], j = foam.mj[m], a = cells[i], b = cells[j];
    const rm = Ri + (a.rad + b.rad) / 2;
    const horiz = Math.hypot(rm * (b.th - a.th), b.z - a.z), dr = Math.abs(b.rad - a.rad);
    const w = (row.has(i) && row.has(j)) ? roadDiscount * Math.hypot(horiz, dr) : horiz + vert * dr;
    adjC[i].push([j, w]); adjC[j].push([i, w]);
  }

  // 2. BUILDINGS CLAIM THE REMAINDER: buildable = chambers off the right-of-way
  const c2b = new Int32Array(N).fill(-1), buildable = [];
  for (let i = 0; i < N; i++) if (!row.has(i)) { c2b[i] = buildable.length; buildable.push(i); }
  const NB = buildable.length;
  const adjB = Array.from({ length: NB }, () => []);
  for (let m = 0; m < E; m++) { const a = c2b[foam.mi[m]], b = c2b[foam.mj[m]]; if (a >= 0 && b >= 0) { adjB[a].push(b); adjB[b].push(a); } }

  const rng = mulberry32(seed >>> 0);
  const program = []; let budget = NB;
  while (budget > 0 && program.length < NB) {
    const role = pickRole(rng, genome);
    const fp = Math.max(1, Math.round(genome.footprint[role] ?? 4));
    const dom = ROLES[role].dom ? DOMAINS[Math.floor(rng() * Math.max(1, Math.min(DOMAINS.length, genome.domains)))] : null;
    program.push({ role, domain: dom, fp }); budget -= fp;
  }
  const zoneOf = growBuildings(NB, adjB, program.map((b) => Math.pow(b.fp, 0.65)), mulberry32((seed ^ 0x9e3779b9) >>> 0));

  // realise non-empty buildings as econ PLACES, chamber-indexed; planar (x,y) = (arc, axial)
  const members = Array.from({ length: program.length }, () => []);
  for (let bi = 0; bi < NB; bi++) { const z = zoneOf[bi]; if (z >= 0) members[z].push(buildable[bi]); }
  const places = [], chamberOwner = new Int32Array(N).fill(-2);  // -2 void, -1 right-of-way
  for (const c of row) chamberOwner[c] = -1;
  for (let z = 0; z < program.length; z++) {
    const mem = members[z]; if (!mem.length) continue;
    const b = program[z], pl = makePlace(places.length, b.role, b.domain);
    let th = 0, rad = 0, zz = 0;
    for (const ci of mem) { const q = cells[ci]; th += q.th; rad += q.rad; zz += q.z; }
    pl.th = th / mem.length; pl.rad = rad / mem.length; pl.zax = zz / mem.length;
    pl.x = pl.th * rBar; pl.y = pl.zax;                          // planar coords for econ.js society
    pl.footprint = mem.length; pl.cells = mem;
    // the DOOR: a member chamber that touches the right-of-way if any, else the centroid-nearest
    let door = -1;
    for (const ci of mem) { if (door >= 0) break; for (const [v] of adjC[ci]) if (row.has(v)) { door = ci; break; } }
    if (door < 0) { let bd = Infinity; for (const ci of mem) { const q = cells[ci]; const d = (q.th - pl.th) ** 2 * rBar * rBar + (q.rad - pl.rad) ** 2 + (q.z - pl.zax) ** 2; if (d < bd) { bd = d; door = ci; } } }
    pl.door = door; pl.onRoad = row.size > 0 && [...(adjC[door] || [])].some(([v]) => row.has(v));
    for (const ci of mem) chamberOwner[ci] = pl.id;
    places.push(pl);
  }

  // 3. SUPPLY MOVES ON ROADS: per resource, 2-label Dijkstra from every producer's chambers; each
  //    consumer reads (distance, supplier) at its door — skipping itself via the runner-up label.
  const byRes = new Map();
  for (const pl of places) for (const r of pl.out) { let a = byRes.get(r); if (!a) { a = []; byRes.set(r, a); } a.push(pl); }
  const edges = []; let need = 0, met = 0;
  const consumers = new Map();                                   // resource → consumer places
  for (const pl of places) for (const r of [...new Set(pl.in)]) { let a = consumers.get(r); if (!a) { a = []; consumers.set(r, a); } a.push(pl); need++; }
  for (const [r, cons] of consumers) {
    const prods = byRes.get(r); if (!prods) continue;
    const sources = []; for (const p of prods) for (const ci of p.cells) sources.push([ci, p.id]);
    const { dist, label } = dijkstra2(N, adjC, sources);
    for (const pl of cons) {
      const d0 = dist[2 * pl.door], l0 = label[2 * pl.door], d1 = dist[2 * pl.door + 1], l1 = label[2 * pl.door + 1];
      const lbl = l0 !== pl.id ? l0 : l1, d = l0 !== pl.id ? d0 : d1;
      if (lbl < 0 || !isFinite(d)) continue;
      met++;
      const to = places[lbl];
      edges.push({ from: pl.id, to: lbl, r, cost: d, fx: pl.x, fy: pl.y, tx: to.x, ty: to.y });
    }
  }

  // 4. ACCESS: median road-cost from each dwelling's door to the nearest of each basket role.
  const dwellings = places.filter((p) => p.role === 'dwell');
  const perDwelling = new Float64Array(dwellings.length);
  let basketsFound = 0;
  for (const role of ACCESS_BASKET) {
    const dests = places.filter((p) => p.role === role);
    if (!dests.length) continue;
    basketsFound++;
    const dist = dijkstra1(N, adjC, dests.flatMap((p) => p.cells));
    for (let i = 0; i < dwellings.length; i++) { const d = dist[dwellings[i].door]; perDwelling[i] += isFinite(d) ? d : accessRef * 4; }
  }
  let access = 0, medCost = Infinity;
  if (dwellings.length && basketsFound) {
    const per = [...perDwelling].map((s) => s / basketsFound);
    for (let i = 0; i < dwellings.length; i++) dwellings[i].accessCost = per[i];   // painted by /econ/foam/
    const sorted = per.slice().sort((a, b) => a - b);
    medCost = sorted[sorted.length >> 1];
    access = Math.max(0, Math.min(1, 1 - medCost / (accessRef * 1.0)));
  }

  const counts = {}; for (const pl of places) counts[pl.role] = (counts[pl.role] || 0) + 1;
  const spacing = Math.sqrt((foam.arcLen * foam.Lx) / Math.max(1, places.length));
  return {
    // econ.js-compatible surface (buildSociety / socialMetrics / removeImpact run unchanged)
    places, edges, byRes, counts, need, met, closure: need ? met / need : 1, spacing,
    W: foam.arcLen, H: foam.Lx,
    // the foam layer (chamber-indexed — the foamview's id space; painting = colouring by owner)
    chambers: cells, chamberOwner, adjC, rightOfWay: row, route, foam,
    access, accessMedianCost: medCost, avgFootprint: places.length ? NB / places.length : 0,
    voids: NB - places.reduce((s, p) => s + p.footprint, 0),
  };
}

// the geography-aware oracle: econ's scoreSociety blended with the access signal — the road
// network now moves the vitality number. Pass the result of scoreSociety(...) plus the city.
export function scoreFoamSociety(city, baseScore) {
  const vitality = Math.round(Math.max(0, Math.min(100, 0.85 * baseScore.vitality + 15 * city.access)));
  const tier = vitality >= 85 ? 'Thriving' : vitality >= 70 ? 'Healthy' : vitality >= 55 ? 'Stable' : vitality >= 38 ? 'Fragile' : 'Failing';
  return { ...baseScore, vitality, tier, access: city.access, signals: { ...baseScore.signals, access: city.access } };
}
