// mobility.js — who lives, works and goes out in a city, and how they get about, through the
// centuries. Pure, DOM-free, deterministic. Reads a city from morph.js (and its ground, when it has one).
//
// ACTIVITY is read off the buildings AS DRAWN, in the year asked: each building's floors are homes,
// shops, workshops, offices or works by its period, its street and what its land is worth (a medieval
// house is a shop below and a family above; a Haussmann block has its café on the ground floor; a
// modern slab is offices where land is dear and flats where it is not; a low-value riverside building
// is a warehouse while the river carries freight, 1780–1975). Floor space per person falls with the
// centuries the way it did (twelve square metres a head in a medieval town, forty now), so the same
// buildings hold fewer people as the city gets richer. Leisure is the share of ground floors given to
// taverns, cafés, theatres and restaurants, which rises in the 1890s and again in the 2000s, plus the
// squares (markets) and the parks.
//
// TRANSPORT is solved era by era and persists (path dependency, the city's own word for it): the
// railway arrives in the 1840s at a terminus on the edge of the old town, where land was cheap, and
// clears the houses on its line; horse omnibuses, horse trams, electric trams, motor buses each open
// their lines when the city is big enough, planned from that year's demand along the roads that can
// take them (radial, from the centre to wherever most people live beyond walking); most cities tore
// their trams up in the 1950s and some brought them back as light rail; cars arrive with the century's
// car ownership curve. Each era's TRIPS (to work, and out) are spread by a gravity model over the street
// graph, split between the modes that exist (a logit on time), and routed: cars and footfall become
// flows on streets, riders become loads on lines.
//
//   transport(city)              → city.transport: { rail, lines, eras, events } (and clears the rail's line)
//   activity(city, year)         → { buildings: [{ id, res, jobs, fun, use }], grid, totals }
//   flowsAt(city, year)          → the era in force that year: { year, edges flows, modes, … }
import * as G from './geom.js';
import { Rand, hash2 } from './rand.js';
import { standing, PRESENT } from './morph.js';

export const USES = ['homes', 'homes over a shop', 'shops', 'an inn', 'offices', 'offices over shops', 'works'];
const MAIN = new Set(['ring', 'old road', 'main road', 'main street', 'avenue']);
const lerpT = (T, y) => { if (y <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const [y0, a] = T[i - 1], [y1, b] = T[i]; return a + (b - a) * (y - y0) / (y1 - y0); } return T[T.length - 1][1]; };
// square metres of home per person, by year (crowded medieval rooms → today's flats)
export const SPACE = [[1100, 12], [1700, 13], [1850, 15], [1900, 18], [1950, 26], [1980, 34], [2025, 40]];
// the share of a commercial ground floor that is for going out (taverns → cafés → restaurants, bars)
export const FUN = [[1100, 0.2], [1850, 0.24], [1900, 0.34], [1960, 0.24], [2000, 0.4], [2025, 0.45]];
// cars per person (a logistic: almost none before 1920, most of the rise 1950–1975)
export const carsPerHead = (y) => (y < 1905 ? 0 : 0.55 / (1 + Math.exp(-(y - 1960) / 8)));

const cache = new WeakMap();
const memo = (city) => { let m = cache.get(city); if (!m) cache.set(city, (m = {})); return m; };

/** The point the city is centred on: its old core's seed (the market), else the frame's middle. */
export function centreOf(city) {
  const d = city.districts.find((x) => x.isCore);
  return d ? d.seed : city.lanes.length ? city.lanes[0].o : [0, 0];
}

// ---------------------------------------------------------------------------- activity --
/** What each building standing in `year` holds: residents, jobs and leisure, and a gridded heatmap. */
export function activity(city, year, o = {}) {
  const m = memo(city), key = `${year}|${o.cell || 50}|${city.transport && city.transport.rail ? 1 : 0}`;
  if (!m.acts) m.acts = new Map();
  if (m.acts.has(key)) return m.acts.get(key);
  const res = activityOf(city, year, o);
  m.acts.set(key, res);
  return res;
}
function activityOf(city, year, o) {
  const cell = o.cell || 50, S = city.size, n = Math.ceil(S / cell);
  const grid = { cell, n, res: new Float32Array(n * n), jobs: new Float32Array(n * n), fun: new Float32Array(n * n) };
  const put = (x, y, r, j, f) => {
    const i = Math.floor((x + S / 2) / cell), k = Math.floor((y + S / 2) / cell);
    if (i < 0 || k < 0 || i >= n || k >= n) return;
    grid.res[k * n + i] += r; grid.jobs[k * n + i] += j; grid.fun[k * n + i] += f;
  };
  const space = lerpT(SPACE, year), funShare = lerpT(FUN, year), out = [];
  const tot = { res: 0, jobs: 0, fun: 0, homes: 0, shops: 0, offices: 0, works: 0 };
  const g = city.ground, rw = g && g.river ? g.river.width / 2 : 0;
  const rail = city.transport && city.transport.rail;
  let rb = null;
  if (rail) { rb = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of rail.path) { rb[0] = Math.min(rb[0], x - 180); rb[1] = Math.min(rb[1], y - 180); rb[2] = Math.max(rb[2], x + 180); rb[3] = Math.max(rb[3], y + 180); } }
  for (const b of standing(city, year).buildings) {
    const A = Math.abs(G.area(b.footprint)) * 0.8, fl = b.storeys, f = city.frontages[b.frontage], rank = f ? f.rank : 'street', main = MAIN.has(rank);
    const v = b.strips.reduce((s, id) => s + city.plots[id].value, 0) / b.strips.length, d = city.districts[b.district];
    const R = Rand(city.seed, `use/${b.id}`), u = R.f(), c = G.centroid(b.footprint);
    const riverside = rank === 'quay' || (g && g.river && g.riverDistAt(c[0], c[1]) < rw + 60);
    let shop = false, office = 0, hotel = false, works = false, inn = false;
    // freight: the wharves on the river (1780–1975), and the goods yards and factories that gather on the
    // railway once it comes (cheap land beside a line is where the works go: path dependency)
    const byRail = rail && rail.year <= year && year < 1975 && c[0] > rb[0] && c[0] < rb[2] && c[1] > rb[1] && c[1] < rb[3] && nearPath(rail.path, c) < 180;
    if (year >= 1780 && year < 1975 && (riverside || byRail) && v < (byRail ? 0.55 : 0.5) && b.style !== 'villa' && b.style !== 'glass') works = true;
    else switch (b.style) {
      case 'village': inn = u < 0.08; break;
      case 'medieval': shop = main || v > 0.5 || u < 0.35; break;
      case 'georgian': shop = (main && v > 0.35) || u < 0.1; break;
      case 'haussmann': shop = main || u < 0.5; break;
      case 'modern': if (v > 0.7 || (d.isCore && u < 0.4) || u < 0.1) office = fl; else shop = main; break;
      case 'glass': if (u < 0.65) office = fl; shop = true; hotel = u > 0.85; break;      // a third of the towers are flats
    }
    let res = 0, jobs = 0, fun = 0, use = 'homes';
    if (works) { jobs = A * fl / 45; use = 'works'; tot.works++; }
    else {
      const ground = shop || inn ? 1 : 0, homes = Math.max(0, fl - ground - office);
      res = A * homes / (space * (b.style === 'villa' ? 1.6 : b.style === 'village' ? 1.2 : 1));
      jobs = A * office / 24 + A * ground / 28;
      // before the factory and the office, most work was done at home: the workshop, the loom, the servants
      if (year < 1850 && (b.style === 'medieval' || b.style === 'village' || b.style === 'georgian')) jobs += res * lerpT([[1700, 0.35], [1850, 0.1]], year);
      // a floor of workshops, ateliers and offices over the shops of a main street (1850–1960), and service:
      // a Georgian or Haussmann household, or a villa, kept servants until the First World War
      if (year >= 1850 && year < 1960 && shop && main && homes > 1 && (b.style === 'haussmann' || b.style === 'georgian')) { res -= A / space; jobs += A / 22; }
      if (year < 1914 && (b.style === 'georgian' || b.style === 'haussmann' || b.style === 'villa')) jobs += res * 0.1;
      fun = inn ? A : A * ground * funShare;
      if (hotel) { fun += A * fl * 0.25; jobs += A * fl * 0.02; }
      if (office) { use = shop ? 'offices over shops' : 'offices'; tot.offices++; }
      else if (ground) { use = inn ? 'an inn' : homes ? 'homes over a shop' : 'shops'; tot.shops++; }
      else tot.homes++;
    }
    out.push({ id: b.id, res, jobs, fun, use });
    tot.res += res; tot.jobs += jobs; tot.fun += fun;
    put(c[0], c[1], res, jobs, fun);
  }
  // the squares are markets and gatherings, the greens parks
  for (const blk of city.blocks) {
    if (!blk.square || blk.year > year || !blk.lot.length) continue;
    const c = G.centroid(blk.lot), a = Math.abs(G.area(blk.lot)), f = a * (blk.square === 'green' ? 0.03 : 0.15);
    put(c[0], c[1], 0, 0, f); tot.fun += f;
  }
  if (rail && rail.year <= year) {      // the station: porters, clerks, hotels and cafés round it
    const [x, y] = rail.station; put(x, y, 0, 400, 300); tot.jobs += 400; tot.fun += 300;
  }
  return { buildings: out, grid, totals: tot, year };
}

const nearPath = (P, c) => { let d = Infinity; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / L2)); d = Math.min(d, Math.hypot(c[0] - a[0] - t * dx, c[1] - a[1] - t * dy)); } return d; };

// ---------------------------------------------------------------------------- the street graph --
/**
 * The streets as a graph: every block edge with a street on it (its centreline), split where another
 * block's corner lands on it (a T-junction), the same street from its two sides merged; plus the bridges.
 * Each edge carries the year its block was laid out, so the graph of any year is a filter.
 */
export function network(city) {
  const m = memo(city);
  if (m.net) return m.net;
  const segs = [];
  // (a street along the frame is the road round the edge of the map: a main road out into the country)
  const half = city.size / 2, onFrame = (p) => Math.abs(Math.abs(p[0]) - half) < 0.5 || Math.abs(Math.abs(p[1]) - half) < 0.5;
  for (const s of city.streets) if (s.width > 0) segs.push({ a: s.a, b: s.b, width: s.width, rank: onFrame(s.a) && onFrame(s.b) ? 'main road' : s.rank, year: s.year });
  // every endpoint, hashed, so a segment can find the corners lying along it
  const H = 6, hash = new Map(), pts = [];
  const key = (x, y) => `${Math.floor(x / H)},${Math.floor(y / H)}`;
  const addPt = (p) => { const k = key(p[0], p[1]); let L = hash.get(k); if (!L) hash.set(k, (L = [])); L.push(p); pts.push(p); };
  for (const s of segs) { addPt(s.a); addPt(s.b); }
  const nodes = [], nodeOf = new Map();
  const node = (p) => { const k = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`; let i = nodeOf.get(k); if (i == null) { i = nodes.length / 2; nodes.push(p[0], p[1]); nodeOf.set(k, i); } return i; };
  const edges = new Map();
  const addEdge = (p, q, s) => {
    const a = node(p), b = node(q);
    if (a === b) return;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`, len = Math.hypot(q[0] - p[0], q[1] - p[1]), e = edges.get(k);
    if (!e) edges.set(k, { a: Math.min(a, b), b: Math.max(a, b), len, width: s.width, rank: s.rank, year: s.year, bridge: !!s.bridge });
    else { e.year = Math.min(e.year, s.year); if (s.width > e.width) { e.width = s.width; e.rank = s.rank; } }
  };
  for (const s of segs) {
    const [ax, ay] = s.a, [bx, by] = s.b, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 0.5) continue;
    const cuts = [0, 1];
    const i0 = Math.floor(Math.min(ax, bx) / H) - 1, i1 = Math.floor(Math.max(ax, bx) / H) + 1, j0 = Math.floor(Math.min(ay, by) / H) - 1, j1 = Math.floor(Math.max(ay, by) / H) + 1;
    if ((i1 - i0) * (j1 - j0) < 4000) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const P = hash.get(`${i},${j}`); if (!P) continue;
      for (const p of P) {
        const t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / (L * L);
        if (t <= 1e-4 || t >= 1 - 1e-4) continue;
        if (Math.abs((p[0] - ax) * dy - (p[1] - ay) * dx) / L < 0.3) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < cuts.length; k++) if (cuts[k + 1] - cuts[k] > 1e-4) addEdge([ax + dx * cuts[k], ay + dy * cuts[k]], [ax + dx * cuts[k + 1], ay + dy * cuts[k + 1]], s);
  }
  const xy = Float64Array.from(nodes), N = xy.length / 2;
  // a spatial index of the nodes, for "the nearest node to here"
  const NH = 40, nodeHash = new Map();
  for (let i = 0; i < N; i++) { const k = `${Math.floor(xy[2 * i] / NH)},${Math.floor(xy[2 * i + 1] / NH)}`; let L = nodeHash.get(k); if (!L) nodeHash.set(k, (L = [])); L.push(i); }
  const nearest = (x, y, ok = () => true, reach = 400) => {
    let best = -1, bd = Infinity;
    const ci = Math.floor(x / NH), cj = Math.floor(y / NH);
    for (let r = 0; r * NH <= reach + NH; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const L = nodeHash.get(`${i},${j}`); if (!L) continue;
        for (const q of L) { if (!ok(q)) continue; const d = Math.hypot(xy[2 * q] - x, xy[2 * q + 1] - y); if (d < bd) { bd = d; best = q; } }
      }
      if (best >= 0 && bd < r * NH) break;
    }
    return best;
  };
  const E = [...edges.values()];
  // the bridges: the field's (dated), or where an old lane crosses the river (as old as the lane)
  const bridges = [];
  if (city.bridges && city.bridges.length) for (const br of city.bridges) bridges.push({ a: br.a, b: br.b, year: br.year, width: br.width });
  else if (city.ground && city.ground.river) for (const L of city.lanes) {
    let s0 = null;
    for (let s = 0; s < city.size; s += 2) {
      const p = [L.o[0] + L.u[0] * s, L.o[1] + L.u[1] * s], wet = city.ground.water(p[0], p[1]) === 'river';
      if (wet && s0 == null) s0 = s;
      if (!wet && s0 != null) { bridges.push({ a: [L.o[0] + L.u[0] * (s0 - 2), L.o[1] + L.u[1] * (s0 - 2)], b: p, year: city.years[0], width: 13 }); s0 = null; }
    }
  }
  for (const br of bridges) {
    const a = nearest(br.a[0], br.a[1], () => true, 60), b = nearest(br.b[0], br.b[1], () => true, 60);
    if (a < 0 || b < 0 || a === b) continue;
    E.push({ a, b, len: Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1]), width: br.width, rank: 'bridge', year: br.year, bridge: true });
  }
  // adjacency (CSR)
  const deg = new Int32Array(N + 1);
  for (const e of E) { deg[e.a + 1]++; deg[e.b + 1]++; }
  for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
  const adj = new Int32Array(deg[N]), fill = deg.slice();
  E.forEach((e, k) => { adj[fill[e.a]++] = k; adj[fill[e.b]++] = k; });
  m.net = { xy, N, edges: E, start: deg, adj, nearest };
  return m.net;
}

// how much a driver (or a planner laying a line) prefers each kind of street
const CAR = { ring: 0.7, 'old road': 0.75, 'main road': 0.7, avenue: 0.75, 'main street': 0.85, seam: 0.9, quay: 0.9, bridge: 0.8, street: 1, lane: 1.2 };
/** Shortest paths from one node over the graph of `year`; cost per metre by `weight(edge)`. */
function dijkstra(net, src, year, weight, out) {
  const { N, start, adj, edges } = net;
  const dist = out.dist, len = out.len, pred = out.pred;
  dist.fill(Infinity); pred.fill(-1);
  dist[src] = 0; len[src] = 0;
  const hk = [], hv = [];
  const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => { const v = hv[0], k = hk.pop(), x = hv.pop(); if (hk.length) { let i = 0; const n = hk.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = x; } return v; };
  push(0, src);
  while (hk.length) {
    const d0 = hk[0], u = pop();
    if (d0 > dist[u]) continue;
    for (let q = start[u]; q < start[u + 1]; q++) {
      const e = edges[adj[q]];
      if (e.year > year) continue;
      const w = weight(e);
      if (!(w < Infinity)) continue;
      const v = e.a === u ? e.b : e.a, nd = d0 + e.len * w;
      if (nd < dist[v]) { dist[v] = nd; len[v] = len[u] + e.len; pred[v] = adj[q]; push(nd, v); }
    }
  }
  return out;
}
const buffers = (N) => ({ dist: new Float64Array(N), len: new Float64Array(N), pred: new Int32Array(N) });

// ---------------------------------------------------------------------------- zones --
/** The town in 200 m squares: each square's people, jobs and leisure, at its weighted middle's node. */
function zonesOf(city, act, net, year, ZC = 260) {
  const S = city.size, n = Math.ceil(S / ZC), Z = new Map();
  const add = (x, y, r, j, f) => {
    const k = Math.floor((x + S / 2) / ZC) + Math.floor((y + S / 2) / ZC) * n;
    let z = Z.get(k); if (!z) Z.set(k, (z = { res: 0, jobs: 0, fun: 0, x: 0, y: 0, w: 0 }));
    z.res += r; z.jobs += j; z.fun += f; const w = r + j + f + 1e-6; z.x += x * w; z.y += y * w; z.w += w;
  };
  const byId = new Map(act.buildings.map((a) => [a.id, a]));
  for (const b of standing(city, year).buildings) { const a = byId.get(b.id); if (!a) continue; const c = G.centroid(b.footprint); add(c[0], c[1], a.res, a.jobs, a.fun); }
  const out = [];
  for (const z of Z.values()) {
    if (z.res + z.jobs + z.fun < 20) continue;
    z.x /= z.w; z.y /= z.w;
    // connected to the main-road network where one is near (as a transport model's zone connectors are),
    // or the trips of a whole quarter would all leave by the back street beside its middle
    z.node = net.nearest(z.x, z.y, (q) => net.yearOf[q] <= year && net.mainYear[q] <= year, 220);
    if (z.node < 0) z.node = net.nearest(z.x, z.y, (q) => net.yearOf[q] <= year, 600);
    if (z.node >= 0) out.push(z);
  }
  return out;
}

// ---------------------------------------------------------------------------- the eras --
// The modes, when they could exist, how fast they go (m/min), the wait, and how willing people are.
export const MODES = {
  walk:      { label: 'on foot', speed: 75 },
  omnibus:   { label: 'horse omnibus', from: 1832, to: 1914, speed: 140, wait: 12, asc: -1.6, colour: '#b48a5a', per: 20000, max: 3 },
  horsetram: { label: 'horse tram', from: 1868, to: 1902, speed: 160, wait: 8, asc: -0.8, colour: '#c9a227', per: 14000, max: 5 },
  tram:      { label: 'electric tram', from: 1894, speed: 240, wait: 6, asc: -0.4, colour: '#e0b43c', per: 11000, max: 8 },
  bus:       { label: 'motor bus', from: 1921, speed: 230, wait: 6, asc: -0.4, colour: '#5fbf6a', per: 6000, max: 12 },
  lightrail: { label: 'light rail', from: 1990, speed: 320, wait: 5, asc: 0, colour: '#57b6e0', per: 30000, max: 3 },
  car:       { label: 'car', from: 1905, speed: 380, park: 4, asc: -0.3 },
  bike:      { label: 'bicycle', from: 2008, speed: 230, asc: -1.3 },
};
const TRAMMABLE = new Set(['ring', 'old road', 'main road', 'avenue', 'main street', 'seam', 'bridge', 'quay']);

/**
 * Lay the transport down through the city's history, era by era, and record each era's trips and flows.
 * Mutates the city in one way, as the railway did: buildings on the line or the station site are cleared
 * in the year it opens, and none are built there after.
 */
export function transport(city, o = {}) {
  const net = network(city);
  // the year each node first exists (its oldest edge)
  if (!net.yearOf) {
    net.yearOf = new Float64Array(net.N).fill(Infinity); net.mainYear = new Float64Array(net.N).fill(Infinity);
    for (const e of net.edges) {
      net.yearOf[e.a] = Math.min(net.yearOf[e.a], e.year); net.yearOf[e.b] = Math.min(net.yearOf[e.b], e.year);
      if (MAIN.has(e.rank) || e.bridge) { net.mainYear[e.a] = Math.min(net.mainYear[e.a], e.year); net.mainYear[e.b] = Math.min(net.mainYear[e.b], e.year); }
    }
  }
  const R = Rand(city.seed, 'transport'), T = { rail: null, lines: [], eras: [], events: [] };
  city.transport = T;
  const C = centreOf(city), pop = (y) => activity(city, y).totals.res;
  const at = (lo, span) => Math.round(lo + R.f() * span);
  // when each thing could come, if the town is big enough by then (else it waits)
  const when = (y0, span, need) => { for (let y = at(y0, span); y <= PRESENT; y += 5) if (pop(y) >= need) return y; return null; };
  const plan = [];
  const yRail = when(1838, 14, 6000); if (yRail) plan.push({ year: yRail, act: 'rail' });
  const yOmni = when(1832, 10, 15000); if (yOmni && yOmni < 1900) plan.push({ year: yOmni, act: 'lines', mode: 'omnibus' });
  const yHorse = when(1868, 10, 20000); if (yHorse && yHorse < 1898) plan.push({ year: yHorse, act: 'lines', mode: 'horsetram' });
  const yTram = when(1894, 10, 25000); if (yTram) plan.push({ year: yTram, act: 'lines', mode: 'tram' });
  const yBus = at(1921, 8); plan.push({ year: yBus, act: 'lines', mode: 'bus' });
  // the bus network is redrawn as the town spreads: the post-war estates, then the edge
  plan.push({ year: at(1966, 8), act: 'lines', mode: 'bus' }, { year: at(2002, 8), act: 'lines', mode: 'bus' });
  const abandon = R.chance(0.65), yEnd = at(1952, 14);
  if (yTram && abandon && yEnd > yTram) plan.push({ year: yEnd, act: 'abandon' });
  const yLrt = at(1990, 18);
  if (yTram && abandon && yLrt <= PRESENT) plan.push({ year: yLrt, act: 'lightrail' });
  plan.sort((a, b) => a.year - b.year);

  // the eras whose trips are computed: each change, and the quiet decades between
  const first = Math.max(city.years[0] + 100, 1700);
  const marks = new Set([first, 1800, 1850, 1900, 1950, 1975, 2000, PRESENT, ...plan.map((p) => p.year)].filter((y) => y >= first && y <= PRESENT));
  const years = [...marks].sort((a, b) => a - b);
  // the graph as plain arrays, for drawing the flows (a structured clone carries it to a page)
  T.graph = { xy: net.xy, a: Int32Array.from(net.edges, (e) => e.a), b: Int32Array.from(net.edges, (e) => e.b), year: Float32Array.from(net.edges, (e) => e.year) };
  let p = 0;
  for (const year of years) {
    while (p < plan.length && plan[p].year <= year) { act(city, net, plan[p], C, R); p++; }
    T.eras.push(era(city, net, year));
  }
  return T;
}

function act(city, net, step, C, R) {
  const T = city.transport, y = step.year;
  if (step.act === 'rail') { railway(city, net, y, C, R); return; }
  if (step.act === 'abandon') {
    let n = 0;
    for (const L of T.lines) if ((L.mode === 'tram' || L.mode === 'horsetram') && L.to == null) { L.to = y; n++; }
    if (n) T.events.push({ year: y, text: `the last tram runs; ${n} lines become bus routes`, kind: 'abandon' });
    // the buses take over the tram routes
    for (const L of T.lines.filter((x) => x.mode === 'tram' && x.to === y)) T.lines.push({ ...L, id: T.lines.length, mode: 'bus', from: y, to: null, was: 'tram' });
    return;
  }
  if (step.act === 'lightrail') {
    // light rail on the busiest of the old tram corridors, now a bus route
    const era = T.eras[T.eras.length - 1], old = T.lines.filter((x) => x.was === 'tram' && x.to == null);
    if (!old.length || !era) return;
    old.sort((a, b) => (era.load[b.id] || 0) - (era.load[a.id] || 0));
    const L = old[0];
    T.lines.push({ ...L, id: T.lines.length, mode: 'lightrail', from: y, to: null, was: null, name: `light rail ${String.fromCharCode(65)}` });
    T.events.push({ year: y, text: `light rail returns on the old ${L.name} corridor`, kind: 'lightrail' });
    return;
  }
  // a mode's lines: carried over from its predecessor, then new ones where people live beyond walking
  const M = MODES[step.mode];
  if (step.mode === 'tram') {
    for (const L of T.lines) if (L.mode === 'horsetram' && L.to == null) { L.to = y; T.lines.push({ ...L, id: T.lines.length, mode: 'tram', from: y, to: null }); }
    for (const L of T.lines) if (L.mode === 'omnibus' && L.to == null) L.to = y;
  }
  if (step.mode === 'horsetram') for (const L of T.lines) if (L.mode === 'omnibus' && L.to == null) L.to = Math.min(MODES.omnibus.to, y + 25);
  const act0 = activity(city, y), zones = zonesOf(city, act0, net, y), popn = act0.totals.res;
  const want = Math.max(1, Math.min(M.max, Math.round(popn / M.per)));
  const live = () => T.lines.filter((L) => L.to == null && (L.mode === step.mode || (step.mode === 'bus' && (L.mode === 'tram' || L.mode === 'lightrail'))));
  const covered = (z) => live().some((L) => L.nodes.some((q) => Math.hypot(net.xy[2 * q] - z.x, net.xy[2 * q + 1] - z.y) < 420));
  const hubs = [C];
  if (T.rail && T.rail.year <= y) hubs.push(T.rail.station);
  const hubNode = hubs.map(([x, y2]) => net.nearest(x, y2, (q) => net.yearOf[q] <= y, 600)).filter((q) => q >= 0);
  if (!hubNode.length) return;
  const buf = buffers(net.N), made = [];
  const tram = step.mode !== 'bus';
  const weight = (e) => (tram ? (TRAMMABLE.has(e.rank) && e.width >= 9 ? 1 : 6) : e.width >= 8 ? (MAIN.has(e.rank) ? 1 : 1.3) : 4);
  let have = T.lines.filter((L) => L.mode === step.mode && L.to == null).length;
  for (let tries = 0; have < want && tries < 40; tries++) {
    // the most people not yet within a walk of a line, beyond walking distance of the centre
    let best = null, bv = 0;
    for (const z of zones) {
      const far = Math.hypot(z.x - C[0], z.y - C[1]);
      if (far < 650 || covered(z)) continue;
      const v = z.res * Math.min(1, far / 1200);
      if (v > bv) { bv = v; best = z; }
    }
    if (!best || bv < 150) break;
    // from the hub (the station if it is nearer to them, else the centre) out to them
    const h = hubNode[hubNode.length > 1 && Math.hypot(best.x - hubs[1][0], best.y - hubs[1][1]) < Math.hypot(best.x - C[0], best.y - C[1]) * 0.7 ? 1 : 0];
    dijkstra(net, h, y, weight, buf);
    if (!(buf.dist[best.node] < Infinity)) { best.res = 0; continue; }
    const nodes = [best.node];
    for (let v = best.node; buf.pred[v] >= 0;) { const e = net.edges[buf.pred[v]]; v = e.a === v ? e.b : e.a; nodes.push(v); }
    nodes.reverse();
    if (buf.len[best.node] < 500) { best.res = 0; continue; }
    const L = { id: T.lines.length, mode: step.mode, from: y + Math.round(R.f() * 4), to: null, nodes, length: buf.len[best.node], name: `${M.label} ${T.lines.filter((x) => x.mode === step.mode).length + 1}` };
    L.stops = stopsOf(net, nodes);
    T.lines.push(L); made.push(L); have++;
  }
  if (made.length) T.events.push({ year: y, text: `${M.label}: ${made.length} new line${made.length > 1 ? 's' : ''}, ${(made.reduce((s, L) => s + L.length, 0) / 1000).toFixed(1)} km`, kind: step.mode });
}
function stopsOf(net, nodes) {
  const out = [nodes[0]];
  let acc = 0;
  for (let i = 1; i < nodes.length; i++) {
    acc += Math.hypot(net.xy[2 * nodes[i]] - net.xy[2 * nodes[i - 1]], net.xy[2 * nodes[i] + 1] - net.xy[2 * nodes[i - 1] + 1]);
    if (acc > 380 || i === nodes.length - 1) { out.push(nodes[i]); acc = 0; }
  }
  return out;
}

/**
 * The railway: in along the river valley (railways follow rivers: the gradient is free) or, with no
 * river, along the widest gap between two of the old lanes, to a terminus at the edge of the old town.
 * It clears what stood on its line and the station's site.
 */
function railway(city, net, year, C, R) {
  const T = city.transport, g = city.ground, half = city.size / 2;
  let path = [];
  const coreR = Math.max(260, Math.sqrt(city.districts.filter((d) => d.isCore).reduce((s, d) => s + d.area, 0) / Math.PI) + 80);
  if (g && g.river) {
    // the valley's floor beside the river, on the town's side
    const P = g.river.path, side = (() => { let best = 0, bd = Infinity; P.forEach(([x, y], i) => { const d = Math.hypot(x - C[0], y - C[1]); if (d < bd) { bd = d; best = i; } }); const a = P[Math.max(0, best - 1)], b = P[Math.min(P.length - 1, best + 1)], nx = -(b[1] - a[1]), ny = b[0] - a[0]; return Math.sign((C[0] - P[best][0]) * nx + (C[1] - P[best][1]) * ny) || 1; })();
    const off = g.river.width / 2 + 70;
    const line = P.map(([x, y], i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [x - (b[1] - a[1]) / L * off * side, y + (b[0] - a[0]) / L * off * side]; });
    // down the valley from upstream (the river's path starts there; downstream may be the sea), on dry
    // land, to the point nearest the centre
    let k = 0, bd = Infinity; line.forEach(([x, y], i) => { const d = Math.hypot(x - C[0], y - C[1]); if (d < bd) { bd = d; k = i; } });
    path = line.slice(0, k + 1).filter(([x, y]) => Math.abs(x) < half * 1.2 && Math.abs(y) < half * 1.2 && g.heightAt(x, y) > 0.5 && !g.water(x, y));
    // a terminus is not IN the old town: stop short of it
    while (path.length > 2 && Math.hypot(path[path.length - 1][0] - C[0], path[path.length - 1][1] - C[1]) < coreR) path.pop();
  }
  if (path.length < 2) {
    // the widest gap between two lanes, out to the frame
    const L = city.lanes.map((l) => l.angle).sort((a, b) => a - b);
    let a0 = 0, gap = 0;
    for (let i = 0; i < L.length; i++) { const a = L[i], b = i + 1 < L.length ? L[i + 1] : L[0] + Math.PI * 2; if (b - a > gap) { gap = b - a; a0 = (a + b) / 2; } }
    const u = [Math.cos(a0), Math.sin(a0)];
    path = [];
    for (let s = half * 1.3; s >= coreR; s -= 40) path.push([C[0] + u[0] * s, C[1] + u[1] * s]);
  }
  // the station: a shed at the end of the line, and its forecourt
  const end = path[path.length - 1], prev = path[Math.max(0, path.length - 4)], dx = end[0] - prev[0], dy = end[1] - prev[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const shed = G.orientedRect(end[0] - ux * 70, end[1] - uy * 70, ux, uy, 80, 28);
  T.rail = { year, path, station: end, shed, name: 'the railway', through: null };
  memo(city).acts = null;                 // what stands has changed
  const { cleared, kept } = clear(city, path, 9, year, shed);
  T.rail.cleared = cleared; T.rail.kept = kept;
  T.events.push({ year, text: `the railway arrives at a terminus on the edge of the old town${cleared ? `; ${cleared} buildings cleared for the line` : ', over open ground'}${kept ? ` (${kept} later buildings never stand on it)` : ''}`, kind: 'rail' });
}
/** Clear buildings from a corridor (and a polygon) from `year`: those standing then end, later ones are never built. */
function clear(city, path, halfW, year, poly) {
  const segs = [];
  for (let i = 0; i + 1 < path.length; i++) segs.push([path[i], path[i + 1]]);
  const hit = (F) => {
    if (poly && F.some((p) => G.inside(poly, p))) return true;
    if (poly && poly.some((p) => G.inside(F, p))) return true;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      for (const p of [...F, G.centroid(F)]) { const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < halfW) return true; }
      // a segment through a footprint with no vertex near it
      for (let t = 0; t <= 1; t += 0.05) if (G.inside(F, [a[0] + dx * t, a[1] + dy * t])) return true;
    }
    return false;
  };
  let cleared = 0, kept = 0;
  const boxes = segs.map(([a, b]) => [Math.min(a[0], b[0]) - halfW, Math.min(a[1], b[1]) - halfW, Math.max(a[0], b[0]) + halfW, Math.max(a[1], b[1]) + halfW]);
  if (poly) { const bx = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of poly) { bx[0] = Math.min(bx[0], x); bx[1] = Math.min(bx[1], y); bx[2] = Math.max(bx[2], x); bx[3] = Math.max(bx[3], y); } boxes.push(bx); }
  const near = (F) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of F) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return boxes.some((B) => x1 >= B[0] && x0 <= B[2] && y1 >= B[1] && y0 <= B[3]); };
  for (const b of city.buildings) {
    if ((b.to != null && b.to <= year) || !near(b.footprint) || !hit(b.footprint)) continue;
    if (b.from <= year) { b.to = year; cleared++; } else { b.from = Infinity; b.cleared = year; kept++; }
  }
  return { cleared, kept };
}

/** One era: trips by gravity, split by mode, routed; flows per street and loads per line. */
function era(city, net, year) {
  const T = city.transport, act = activity(city, year), zones = zonesOf(city, act, net, year);
  // the jobs the town's own workers cannot fill are filled from outside: by train, to the station, and
  // by road, through the gates where the main roads leave the town (the four most outlying main-road
  // junctions, one each way)
  const workers = zones.reduce((s, z) => s + z.res, 0) * 0.45, jobs = zones.reduce((s, z) => s + z.jobs, 0);
  const inbound = Math.max(0, jobs * 0.9 - workers), railShare = T.rail && T.rail.year <= year ? lerpT([[1860, 0.3], [1900, 0.6], [1950, 0.45], [1975, 0.15], [2025, 0.25]], year) : 0;
  const gates = [];
  if (inbound > 0) {
    if (railShare > 0) { const [x, y] = T.rail.station, q = net.nearest(x, y, (k) => net.yearOf[k] <= year, 600); if (q >= 0) gates.push({ x, y, node: q, res: 0, jobs: 0, fun: 0, ext: inbound * railShare, gate: 'rail' }); }
    const mainNode = new Uint8Array(net.N);
    for (const e of net.edges) if (e.year <= year && MAIN.has(e.rank)) { mainNode[e.a] = 1; mainNode[e.b] = 1; }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let best = -1, bv = -Infinity;
      for (let q = 0; q < net.N; q++) if (mainNode[q]) { const v = net.xy[2 * q] * dx + net.xy[2 * q + 1] * dy; if (v > bv) { bv = v; best = q; } }
      if (best >= 0 && !gates.some((g) => g.node === best)) gates.push({ x: net.xy[2 * best], y: net.xy[2 * best + 1], node: best, res: 0, jobs: 0, fun: 0, ext: 0, gate: 'road' });
    }
    const roads = gates.filter((g) => g.gate === 'road');
    for (const g of roads) g.ext = inbound * (1 - railShare) / roads.length;
    zones.push(...gates);
  }
  const Z = zones.length;
  const lines = T.lines.filter((L) => L.from <= year && (L.to == null || L.to > year));
  // how far each zone is from its nearest stop, of which line
  const near = zones.map((z) => {
    let best = null, bd = 450;
    for (const L of lines) for (const q of L.stops) { const d = Math.hypot(net.xy[2 * q] - z.x, net.xy[2 * q + 1] - z.y); if (d < bd) { bd = d; best = L; } }
    return best ? { line: best, walk: bd } : null;
  });
  const cars = carsPerHead(year), bikes = year >= MODES.bike.from;
  const flowCar = new Float32Array(net.edges.length), flowWalk = new Float32Array(net.edges.length), load = {};
  const modes = { walk: 0, transit: 0, car: 0, bike: 0 };
  const buf = buffers(net.N), dist = new Float64Array(Z * Z);
  const preds = [];
  const carW = (e) => CAR[e.rank] || 1;
  for (let i = 0; i < Z; i++) {
    dijkstra(net, zones[i].node, year, carW, buf);
    for (let j = 0; j < Z; j++) dist[i * Z + j] = buf.len[zones[j].node] + Math.hypot(zones[j].x - net.xy[2 * zones[j].node], zones[j].y - net.xy[2 * zones[j].node + 1]);
    preds.push(Int32Array.from(buf.pred));
  }
  // the time by each mode between i and j (minutes), and the logit split
  const theta = 0.11, beta = 0.07;
  const split = (i, j) => {
    const d = Math.max(150, dist[i * Z + j]);
    const u = [], k = [];
    u.push(-theta * d / MODES.walk.speed); k.push('walk');
    const a = near[i], b = near[j];
    if (a && b) {
      const ma = MODES[a.line.mode], mb = MODES[b.line.mode], slow = ma.speed < mb.speed ? ma : mb;
      const t = (a.walk + b.walk) / 75 + Math.max(ma.wait, mb.wait) + d / slow.speed + (a.line === b.line ? 0 : 6);
      u.push(-theta * t + Math.min(ma.asc, mb.asc)); k.push('transit');
    }
    if (bikes && d < 6000) { u.push(-theta * (d / MODES.bike.speed + 1) + MODES.bike.asc); k.push('bike'); }
    const m = Math.max(...u), e = u.map((x) => Math.exp(x - m)), s = e.reduce((p, q) => p + q, 0);
    const sh = {}; k.forEach((n, q) => (sh[n] = e[q] / s));
    // a household with a car chooses again with the car in the set
    if (cars > 0) {
      const tc = d / MODES.car.speed * (1 + 0.6 * cars) + MODES.car.park, uc = -theta * tc + MODES.car.asc;
      const m2 = Math.max(m, uc), e2 = u.map((x) => Math.exp(x - m2)), ec = Math.exp(uc - m2), s2 = e2.reduce((p, q) => p + q, 0) + ec;
      const own = Math.min(1, cars * 2.2);      // the share of trips made by people with a car to hand
      k.forEach((n, q) => (sh[n] = (1 - own) * sh[n] + own * e2[q] / s2));
      sh.car = own * ec / s2;
    }
    return { sh, t: Math.min(...u.map((x, q) => -x / theta)) };
  };
  // trips: a commute from homes to jobs and an outing to leisure, each spread by gravity on the best time
  const trips = new Float64Array(Z * Z), byPurpose = { work: new Float32Array(Z * Z), fun: new Float32Array(Z * Z) };
  const best = new Float64Array(Z * Z);
  const S = [];
  for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) { const s = split(i, j); best[i * Z + j] = s.t; S.push(s.sh); }
  for (const [prod, attr, rate] of [['res', 'jobs', 0.45 * 2], ['res', 'fun', 0.3 * 2], ['ext', 'jobs', 2]]) {
    for (let i = 0; i < Z; i++) {
      const P = (zones[i][prod] || 0) * rate; if (P <= 0) continue;
      let sum = 0; for (let j = 0; j < Z; j++) sum += zones[j][attr] * Math.exp(-beta * best[i * Z + j]);
      if (sum <= 0) continue;
      for (let j = 0; j < Z; j++) { const t = P * zones[j][attr] * Math.exp(-beta * best[i * Z + j]) / sum; trips[i * Z + j] += t; byPurpose[attr === 'fun' ? 'fun' : 'work'][i * Z + j] += t; }
    }
  }
  // route them: cars and walkers on the streets, riders on their lines
  let total = 0;
  for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) {
    const t = trips[i * Z + j]; if (t <= 0) continue;
    const sh = S[i * Z + j]; total += t;
    for (const k in sh) modes[k] += t * sh[k];
    if (sh.transit) { const a = near[i].line, b = near[j].line; load[a.id] = (load[a.id] || 0) + t * sh.transit / (a === b ? 1 : 2); if (a !== b) load[b.id] = (load[b.id] || 0) + t * sh.transit / 2; }
    if (i === j) continue;
    const car = t * (sh.car || 0) / 1.3, walk = t * ((sh.walk || 0) + (sh.bike || 0) * 0.5);
    if (car < 1e-3 && walk < 1e-3) continue;
    const pred = preds[i];
    for (let v = zones[j].node; pred[v] >= 0;) { const q = pred[v], e = net.edges[q]; flowCar[q] += car; flowWalk[q] += walk; v = e.a === v ? e.b : e.a; }
  }
  for (const k in modes) modes[k] /= total || 1;
  // the trip table itself, compactly, so a day can be sampled back out of it (motion.js): the zones (their
  // middle and node), the trips by purpose (both ways, a day), each pair's mode shares in 1/255ths, and
  // the line each zone walks to
  const zxy = new Float32Array(Z * 3), share = new Uint8Array(Z * Z * 4), walkTo = new Int16Array(Z).fill(-1);
  zones.forEach((z, i) => { zxy[3 * i] = z.x; zxy[3 * i + 1] = z.y; zxy[3 * i + 2] = z.node; if (near[i]) walkTo[i] = near[i].line.id; });
  for (let q = 0; q < Z * Z; q++) { const sh = S[q]; share[4 * q] = Math.round((sh.walk || 0) * 255); share[4 * q + 1] = Math.round((sh.transit || 0) * 255); share[4 * q + 2] = Math.round((sh.car || 0) * 255); share[4 * q + 3] = Math.round((sh.bike || 0) * 255); }
  const od = { Z, zxy, work: byPurpose.work, fun: byPurpose.fun, share, walkTo };
  // what each building held this era (for the inspector), and the heatmaps
  const nb = city.buildings.length, bRes = new Float32Array(nb), bJobs = new Float32Array(nb), bFun = new Float32Array(nb), bUse = new Uint8Array(nb);
  for (const a of act.buildings) { bRes[a.id] = a.res; bJobs[a.id] = a.jobs; bFun[a.id] = a.fun; bUse[a.id] = USES.indexOf(a.use) + 1; }
  return { year, residents: act.totals.res, jobs: act.totals.jobs, fun: act.totals.fun, trips: total, grid: act.grid, held: { res: bRes, jobs: bJobs, fun: bFun, use: bUse }, modes, flowCar, flowWalk, load, lines: lines.map((L) => L.id), zones: Z, od, cars, inbound, gates: gates.map((g) => ({ x: g.x, y: g.y, gate: g.gate, people: g.ext })) };
}

/** The era in force in `year` (the latest computed at or before it). */
export function eraAt(city, year) {
  const E = city.transport ? city.transport.eras : [];
  let e = null; for (const x of E) if (x.year <= year) e = x;
  return e;
}
/** The lines running in `year`, and the railway if it is open. */
export function linesAt(city, year) {
  const T = city.transport;
  if (!T) return { lines: [], rail: null };
  return { lines: T.lines.filter((L) => L.from <= year && (L.to == null || L.to > year)), rail: T.rail && T.rail.year <= year ? T.rail : null };
}
export { hash2, dijkstra, buffers, CAR, MAIN };
