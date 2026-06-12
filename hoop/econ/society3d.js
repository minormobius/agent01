// society3d.js — the FOAM SOCIETY kernel: the econ genome run over rind's actual 3D chamber foam.
//
// econ.js v1 lived on a flat rectangle with crow-flight supply wiring. The real world is the
// annular sector foam (rind/wayfind.js sectorFoam — the 33k-chamber foamview scene): a chamber
// GRAPH where gravity is radial and travel is ANISOTROPIC — azimuthal is level street, radial is
// climb, and climb is only cheap where a ramp exists. Two ways to get the roads:
//
//   · buildFoamCity() — the CERTIFIED route: wayfind's planRoute() corkscrew ramps + azimuthal
//     roads become reserved right-of-way before anything is built (leg 1 of FOAM.md).
//   · createFoamGrower() — the GROWN route (leg 3): no imposed route at all. A provisional city is
//     assembled with no roads, a society settles it, and its lived trips (hats + freight) become
//     the demand for the desire-line kernel (paint/flux.js) over the chamber graph with the
//     anisotropic base costs. The stationary traffic field is the Laplace transform of THIS town's
//     NPC motion; the right-of-way is its superlevel set — and because climbing is dear, the climb
//     demand concentrates onto a few reinforced radial threads: the ramp EMERGES (or measurably
//     fails to — emergent stats report the radial span the network actually threads). Then the
//     city is assembled FRESH around the carved right-of-way (grow-then-settle), so every
//     downstream invariant — doors on the road, supply discount on decks, access, the oracle —
//     works unchanged.
//
// In both cases buildings claim the remaining chambers as connected clumps keyed by chamber index
// (painting the society IS colouring chambers), supply is wired by road-aware Dijkstra, and the
// access signal joins the oracle via scoreFoamSociety. Deterministic from (genome, seed); pure;
// node + browser (no DOM).

import { ROLES, DOMAINS, DEFAULT_GENOME, makePlace, buildSociety } from './econ.js';
import { mulberry32 } from '../paint/voronoi.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';
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

// the foam + its nav graph for a sector (shared by both road regimes)
function sectorNav({ Ri = 250, T = 50, cell = 1, arcDeg = 18, axial = 10, grade = 0.4, seed = 1 } = {}) {
  const foam = WAYFIND.sectorFoam({ Ri, T, cell, arcDeg, axial, grade, seed });
  return { foam, nav: WAYFIND.buildNav(foam) };
}

// ── ASSEMBLE: a right-of-way (however obtained) + the genome → the full city. Buildings claim
//    the chambers off the row, the supply web wires by road-aware Dijkstra, access is measured.
//    Deterministic from (genome, seed, row). buildFoamCity, the grower's finalize, AND the
//    per-region solve of record (record.js) all use it — exported for that third consumer.
export function assembleCity(foam, nav, row, {
  Ri = 250, T = 50, seed = 1, genome = DEFAULT_GENOME, vert = 6, roadDiscount = 0.6, accessRef = 30,
  route = null,
} = {}) {
  const N = nav.n, cells = nav.cells, rBar = Ri + T / 2;

  // anisotropic edge costs over the chamber graph: level run cheap, climb dear, decks discounted
  const E = foam.mi.length, adjC = Array.from({ length: N }, () => []);
  for (let m = 0; m < E; m++) {
    const i = foam.mi[m], j = foam.mj[m], a = cells[i], b = cells[j];
    const rm = Ri + (a.rad + b.rad) / 2;
    const horiz = Math.hypot(rm * (b.th - a.th), b.z - a.z), dr = Math.abs(b.rad - a.rad);
    const w = (row.has(i) && row.has(j)) ? roadDiscount * Math.hypot(horiz, dr) : horiz + vert * dr;
    adjC[i].push([j, w]); adjC[j].push([i, w]);
  }

  // BUILDINGS CLAIM THE REMAINDER: buildable = chambers off the right-of-way
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

  // SUPPLY MOVES ON ROADS: per resource, 2-label Dijkstra from every producer's chambers; each
  // consumer reads (distance, supplier) at its door — skipping itself via the runner-up label.
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

  // ACCESS: median road-cost from each dwelling's door to the nearest of each basket role.
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

// ── the CERTIFIED city: wayfind's proven ramps + roads reserved first (FOAM.md leg 1) ──
export function buildFoamCity(opts = {}) {
  const { seed = 1 } = opts;
  const { foam, nav } = sectorNav(opts);
  const route = WAYFIND.planRoute(nav, { seed });
  const row = new Set();
  if (route) {
    for (const c of route.A.cells) row.add(c);
    for (const c of route.B.cells) row.add(c);
    for (const rd of route.roads) for (const c of rd.cells) row.add(c);
  }
  return assembleCity(foam, nav, row, { ...opts, route });
}

// ── the GROWN city (FOAM.md leg 3): desire-line right-of-way from the lived society ─────────────
// Steppable so the 3D page can animate the field forming. The provisional no-road city + society
// exist only to source demand; finalize() reassembles the city fresh around the emergent streets.
export function createFoamGrower(opts = {}) {
  const { Ri = 250, T = 50, seed = 1, genome = DEFAULT_GENOME, vert = 6,
    wWork = 1.0, wThird = 0.6, wSupply = 0.4 } = opts;
  const { foam, nav } = sectorNav(opts);
  const N = nav.n, cells = nav.cells;
  // the provisional settlement: no roads at all — everyone climbs raw stair-holes
  const base = assembleCity(foam, nav, new Set(), { ...opts, route: null });
  const society = buildSociety(base, { seed, genome });
  // demand at door chambers: every hat a recurring trip, every supply edge a freight run. Trips
  // are stored HUB-FIRST (workplace/parish/club/supplier as the routing source): flux on an
  // undirected graph is symmetric, so the field is identical — but hubs are ~6× fewer than homes,
  // so the per-round Dijkstra count (grouped by source) drops by the same factor.
  const agg = new Map();
  const add = (a, b, w) => { if (a < 0 || b < 0 || a === b) return; const k = a + ',' + b; agg.set(k, (agg.get(k) || 0) + w); };
  const door = (id) => base.places[id].door;
  for (const p of society.people) {
    const home = door(p.home);
    for (const h of p.hats) { if (h.place === p.home) continue; add(door(h.place), home, h.kind === 'work' ? wWork : wThird); }
  }
  for (const e of base.edges) add(door(e.to), door(e.from), wSupply);
  const trips = [];
  for (const [k, w] of agg) { const [a, b] = k.split(','); trips.push({ a: +a, b: +b, w }); }
  // the field grows over ANISOTROPIC base lengths — climbing is dear, so climb demand concentrates
  // onto few reinforced radial threads (conductance = the deck being worn into existence). The
  // ROUTING graph keeps only face/edge neighbours (3D run < 1.5·cell): the corner-diagonals the
  // 1.85·cell adjacency admits add ~half the edges and nothing to travel — halving step time.
  const cellU = opts.cell ?? 1, routeFilter = opts.routeFilter ?? 1.3;   // ≈6-neighbourhood
  const edgeList = [];
  for (let m = 0; m < foam.mi.length; m++) {
    const a = cells[foam.mi[m]], b = cells[foam.mj[m]], rm = Ri + (a.rad + b.rad) / 2;
    const horiz = Math.hypot(rm * (b.th - a.th), b.z - a.z), dr = Math.abs(b.rad - a.rad);
    if (Math.hypot(horiz, dr) > routeFilter * cellU) continue;
    edgeList.push({ a: foam.mi[m], b: foam.mj[m], len: horiz + vert * dr });
  }
  const graph = makeGraph(N, edgeList);
  // batch origins so one step stays interactive at full 33k scale (~700 origin searches per round)
  const nOrigins = new Set(trips.map((t) => t.a)).size;
  const originBatches = opts.originBatches ?? Math.max(1, Math.ceil(nOrigins / 700));
  const grower = createGrower(graph, trips, { ...opts, originBatches });
  return {
    foam, nav, graph, grower, base, society, trips,
    get iter() { return grower.iter; },
    state: grower.state,
    step: () => grower.step(),
    finalize({ roadFrac = 0.05 } = {}) {
      const ff = finalizeField(graph, grower.state, { roadFrac });
      const row = new Set();
      for (let i = 0; i < N; i++) if (ff.isRoad[i]) row.add(i);
      const city = assembleCity(foam, nav, row, { ...opts, route: null });
      // emergent stats: did the climb emerge? how far does the grown network thread the shell?
      let rLo = Infinity, rHi = -Infinity, rampSegs = 0, levelSegs = 0;
      for (const c of row) { const q = cells[c]; if (q.rad < rLo) rLo = q.rad; if (q.rad > rHi) rHi = q.rad; }
      for (let i = 0; i < graph.E; i++) {
        if (!ff.roadEdge[i]) continue;
        const dr = Math.abs(cells[graph.ea[i]].rad - cells[graph.eb[i]].rad);
        if (dr > 0.5) rampSegs++; else levelSegs++;
      }
      city.emergent = {
        chambers: row.size, rampSegs, levelSegs,
        radialSpanFrac: row.size ? (rHi - rLo) / T : 0,
        tier: ff.tier, roadEdge: ff.roadEdge, ea: graph.ea, eb: graph.eb,
      };
      return city;
    },
  };
}

// the geography-aware oracle: econ's scoreSociety blended with the access signal — the road
// network now moves the vitality number. Pass the result of scoreSociety(...) plus the city.
export function scoreFoamSociety(city, baseScore) {
  const vitality = Math.round(Math.max(0, Math.min(100, 0.85 * baseScore.vitality + 15 * city.access)));
  const tier = vitality >= 85 ? 'Thriving' : vitality >= 70 ? 'Healthy' : vitality >= 55 ? 'Stable' : vitality >= 38 ? 'Fragile' : 'Failing';
  return { ...baseScore, vitality, tier, access: city.access, signals: { ...baseScore.signals, access: city.access } };
}
