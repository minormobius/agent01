/* Ecumene — the simulation. One step is one year.

   ZONES are the cells of a spherical Voronoi diagram laid over the planet.
   They start as mappa's own cells; a zone that gets dense SPLITS into three
   (its site stays, two more go in beside it) and the whole diagram is
   rebuilt from the sites (../../orb/js/sphere.js, ORB.voronoi), so the mesh
   is always exactly Voronoi, finest where the city is. Each zone keeps the
   world cell under it for its ground (js/world.js): livability, fresh
   water, roughness.

   A year:
     1. the network: roads between neighbouring land zones (slower where
        dense: a crowded zone's streets jam), and the player's LINES: stops,
        rides between consecutive stops, boarding (access + half a headway)
        and alighting. A line's headway is its round trip over its trains.
     2. demand: from every settled zone, one Dijkstra over the whole network
        (cut off at TMAX minutes). Workers spread over the jobs they reach by
        a gravity model, exp(−β t). Where the best path rides a line, the
        trip goes by transit with a logit share against the best road-only
        time. Transit trips are assigned down the shortest-path tree, so
        every ride segment knows its load.
     3. lines: load against capacity. Overfull rides are slower next year
        and the excess is STRANDED.
     4. growth: each zone's ceiling is what its ACCESS (the jobs it reaches,
        the same sum the trips came from) lets it build up to, scaled by its
        fresh water (a river carries a city, rain alone a town) and its
        ground. Water scales the ceiling but never sets it alone: an early
        version took the lower of the two, and the water bound everywhere,
        so a line changed nothing. The selftest now measures that a line
        grows the city along it. Logistic growth toward the ceiling, spill
        into neighbours when nearly full, and now and then a new town at the
        best open site.
     5. populous zones split (a count, not a density, as in polis: the
        children start under it, so a split never cascades); fares come in.
   So a line raises the access of every zone along it, the ceiling follows,
   the city grows along it, and the line fills: the loop the game is about.

   Deterministic: the same seed and the same lines on the same years give
   the same planet. Pure: no DOM, runs in node and in the worker. */
import { R, nearestCell } from "./world.js";

export const P_ = {
  ROAD_KMH: 40, CONGEST: 250,     // road speed falls as 1/(1 + density/CONGEST)
  LINE_KMH: 70, DWELL: 1, ACCESS: 3, EGRESS: 2, MIN_HEADWAY: 2,
  BETA: 0.04, THETA: 0.12, TMAX: 120,
  WORK: 0.45,                     // workers (and jobs) per person
  R_GROW: 0.07, RURAL: 18, URBAN: 6000, A_REF: 100000, ALPHA: 1, A_MAX: 4, W_HALF: 400,
  SPILL_AT: 0.6, SPILL: 0.05,
  ORIGIN_MIN: 600, MAX_ORIGINS: 1600,
  SPLIT_POP: 8000, SPLIT_MIN_AREA: 1.5, MAX_ZONES: 6000, MAX_SPLITS: 60,
  TRAIN_CAP: 260, SERVICE_MIN: 1080, CROWD_SLOW: 1.5,
  TOWN_EVERY: 4, TOWNS0: 7, TOWN_POP: 6000, WARMUP: 60,
  FARE: 0.000008,                 // credits per rider (×365 a year inside)
  TRAIN_UPKEEP: 10, TRACK_UPKEEP: 0.25, // a year: per train, per km of line
  COST_KM: 4, COST_WATER: 3, COST_STOP: 20, COST_TRAIN: 90, START_CREDITS: 700,
};

export class Sim {
  constructor(world, seed) {
    this.world = world; this.seed = seed >>> 0; this.year = 0; this.credits = P_.START_CREDITS;
    this.rng = mulberry(this.seed ^ 0x9e3779b9);
    const W = world, n = W.N;
    this.sites = Array.from(W.V); this.geo = []; this.pop = []; this.jobs = [];
    for (let i = 0; i < n; i++) { this.geo.push(i); this.pop.push(0); this.jobs.push(0); }
    this.lines = []; this.history = []; this.stats = {}; this.crowd = new Map();
    this.rebuild();
    for (let k = 0; k < P_.TOWNS0; k++) this.foundTown(5);
  }

  /* ---------------------------------------------------------------- mesh */
  rebuild() {
    const n = this.sites.length / 3, P = Float64Array.from(this.sites), vor = globalThis.ORB.voronoi(P, n), W = this.world;
    this.n = n; this.P = P; this.verts = vor.verts; this.polys = vor.polys; this.nbrs = vor.nbrs;
    this.area = new Float64Array(n); this.land = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.area[i] = polyArea(P, vor.verts, i, vor.polys[i]) * R * R;
      this.land[i] = W.water[this.geo[i]] === 0 ? 1 : 0;
    }
  }
  /* Split zone i into three: it keeps its site, two more go in beside it. */
  split(i) {
    const p = [this.P[3 * i], this.P[3 * i + 1], this.P[3 * i + 2]], r = 0.42 * Math.sqrt(this.area[i] / Math.PI) / R;
    const f = frame(p), a0 = this.rng() * 2 * Math.PI, share = this.pop[i] / 3;
    this.pop[i] = share;
    for (let k = 1; k <= 2; k++) {
      const a = a0 + k * 2 * Math.PI / 3, q = norm([p[0] + r * (Math.cos(a) * f[0][0] + Math.sin(a) * f[1][0]), p[1] + r * (Math.cos(a) * f[0][1] + Math.sin(a) * f[1][1]), p[2] + r * (Math.cos(a) * f[0][2] + Math.sin(a) * f[1][2])]);
      this.sites.push(q[0], q[1], q[2]); this.geo.push(nearestCell(this.world, q, this.geo[i])); this.pop.push(share); this.jobs.push(this.jobs[i] / 3);
    }
    this.jobs[i] /= 3;
  }
  /* The zone containing unit vector p. */
  zoneAt(p) {
    let best = -2, bi = 0; const P = this.P;
    for (let i = 0; i < this.n; i++) { const d = P[3 * i] * p[0] + P[3 * i + 1] * p[1] + P[3 * i + 2] * p[2]; if (d > best) { best = d; bi = i; } }
    return bi;
  }
  /* Ceiling from the ground alone (no access): where a new town would do well. */
  siteScore(i) {
    const g = this.geo[i], W = this.world;
    return W.hab[g] * Math.min(W.fresh[g], 2500) * (1 + 0.15 * this.rng());
  }
  foundTown(minHops) {
    const taken = new Uint8Array(this.n), q = [], d = new Int32Array(this.n).fill(-1);
    for (let i = 0; i < this.n; i++) if (this.pop[i] > 400) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h]; if (d[i] >= minHops) continue; for (const j of this.nbrs[i]) if (d[j] < 0) { d[j] = d[i] + 1; q.push(j); } }
    let best = -1, bs = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.land[i] || d[i] >= 0) continue;
      const s = this.siteScore(i); if (s > bs) { bs = s; best = i; }
    }
    if (best >= 0) { this.pop[best] += P_.TOWN_POP; this.lastTown = best; }
    return best;
  }

  /* ---------------------------------------------------------------- lines
     line: { id, color, stops: [[x, y, z], …], trains }. Stops are points on
     the sphere; each year they are found in whatever zone now holds them. */
  setLines(lines) { this.lines = lines.map((l) => ({ id: l.id, color: l.color, stops: l.stops.map((s) => s.slice()), trains: l.trains })); }
  trackCost(a, b) { return trackCost(this.world, a, b); }
  warmup() { for (let k = 0; k < P_.WARMUP; k++) this.step(); this.history.length = 0; this.credits = P_.START_CREDITS; }

  /* ---------------------------------------------------------------- a year */
  step() {
    const t0 = Date.now();
    const net = this.network();
    const dem = this.demand(net);
    this.lineStats(net, dem);
    this.grow(dem);
    const splits = this.refine();
    this.year++;
    if (this.year % P_.TOWN_EVERY === 0) this.foundTown(4);
    const fares = this.stats.riders * 365 * P_.FARE;
    let upkeep = 0;
    for (const L of this.lines) { upkeep += P_.TRAIN_UPKEEP * L.trains; for (let k = 0; k + 1 < L.stops.length; k++) upkeep += P_.TRACK_UPKEEP * arc(L.stops[k], L.stops[k + 1]) * R; }
    this.credits += fares - upkeep; this.stats.fares = fares; this.stats.upkeep = upkeep;
    let total = 0, urban = 0; for (let i = 0; i < this.n; i++) { total += this.pop[i]; if (this.pop[i] / Math.max(1, this.area[i]) > 300) urban += this.pop[i]; }
    Object.assign(this.stats, { year: this.year, pop: total, urban, zones: this.n, splits, ms: Date.now() - t0, credits: this.credits });
    this.history.push({ year: this.year, pop: total, riders: this.stats.riders, share: this.stats.share, stranded: this.stats.stranded });
    return this.stats;
  }

  network() {
    const n = this.n, P = this.P, speed = new Float64Array(n);
    for (let i = 0; i < n; i++) speed[i] = P_.ROAD_KMH / (1 + this.pop[i] / Math.max(1, this.area[i]) / P_.CONGEST) / this.world.rough[this.geo[i]];
    // edges: [to, minutes, kind, seg] kind 0 road, 1 board, 2 alight, 3 ride
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = [];
      if (this.land[i]) for (const j of this.nbrs[i]) if (this.land[j]) {
        const km = arcI(P, i, j) * R; e.push([j, 60 * km * (0.5 / speed[i] + 0.5 / speed[j]), 0, -1]);
      }
      out.push(e);
    }
    // stops
    const stops = []; // {line, k, zone, node}
    const segs = [];  // {line, k, dir, minutes}
    this.lines.forEach((L, li) => {
      if (L.stops.length < 2 || L.trains < 1) return;
      const base = out.length, rides = [];
      L.stops.forEach((s, k) => { const z = this.zoneAt(s); stops.push({ line: li, k, zone: z, node: base + k }); out.push([]); });
      let cycle = 0;
      for (let k = 0; k + 1 < L.stops.length; k++) { const m = 60 * arc(L.stops[k], L.stops[k + 1]) * R / P_.LINE_KMH + P_.DWELL; rides.push(m); cycle += 2 * m; }
      const headway = Math.max(P_.MIN_HEADWAY, cycle / L.trains), cap = L.trains * (P_.SERVICE_MIN / Math.max(1, cycle)) * P_.TRAIN_CAP;
      L._cycle = cycle; L._headway = headway; L._cap = cap;
      for (let k = 0; k + 1 < L.stops.length; k++) for (const dir of [1, -1]) {
        const a = dir > 0 ? k : k + 1, b = dir > 0 ? k + 1 : k, key = L.id + ":" + k + ":" + dir, c = this.crowd.get(key) || 0;
        const seg = segs.length; segs.push({ line: li, k, dir, key, minutes: rides[k] * (1 + P_.CROWD_SLOW * Math.max(0, c - 0.8)) });
        out[base + a].push([base + b, segs[seg].minutes, 3, seg]);
      }
      L.stops.forEach((s, k) => {
        const z = stops[stops.length - L.stops.length + k].zone;
        if (!this.land[z]) return;
        out[z].push([base + k, P_.ACCESS + headway / 2, 1, li]);
        out[base + k].push([z, P_.EGRESS, 2, li]);
      });
    });
    return { out, nodes: out.length, stops, segs, speed };
  }

  demand(net) {
    const n = this.n, N = net.nodes, jobs = this.jobs, pop = this.pop;
    const origins = [];
    for (let i = 0; i < n; i++) if (this.land[i] && pop[i] >= P_.ORIGIN_MIN) origins.push(i);
    origins.sort((a, b) => pop[b] - pop[a]); origins.length = Math.min(origins.length, P_.MAX_ORIGINS);
    const access = new Float64Array(n), segLoad = new Float64Array(net.segs.length), boards = new Float64Array(this.lines.length);
    const dist = new Float64Array(N).fill(Infinity), road = new Float64Array(N).fill(Infinity), pred = new Int32Array(N), pedge = new Int32Array(N), via = new Uint8Array(N), flow = new Float64Array(N);
    const heap = new Heap(N);
    let trips = 0, transit = 0;
    const selfT = (i) => 60 * 0.4 * Math.sqrt(this.area[i]) / net.speed[i];
    for (const o of origins) {
      // combined search
      const order = dijkstra(net.out, o, dist, pred, pedge, via, heap, P_.TMAX, false), seenC = heap.seen.slice();
      let touched = false; for (const v of order) if (v >= n) { touched = true; break; }
      let seenR = null;
      if (touched) { dijkstra(net.out, o, road, null, null, null, heap, P_.TMAX, true); seenR = heap.seen.slice(); }
      const done = () => { reset(seenC, dist, via); if (seenR) reset(seenR, road, null); };
      // gravity over the jobs reached
      let den = 0;
      for (const v of order) if (v < n) { const t = v === o ? selfT(o) : dist[v]; den += jobs[v] * Math.exp(-P_.BETA * t); }
      access[o] = den;
      const Wk = P_.WORK * pop[o];
      trips += Wk;
      if (den <= 0) { done(); continue; }
      for (const v of order) {
        flow[v] = 0;
        if (v >= n || v === o || !via[v]) continue;
        const T = Wk * jobs[v] * Math.exp(-P_.BETA * dist[v]) / den, tr = road[v], tc = dist[v];
        const share = tr === Infinity ? 1 : 1 / (1 + Math.exp(P_.THETA * (tc - tr)));
        flow[v] = T * share; transit += T * share;
      }
      for (let k = order.length - 1; k > 0; k--) {
        const v = order[k], f = flow[v]; if (!f) continue;
        const u = pred[v], e = pedge[v];
        flow[u] += f;
        const kind = net.out[u][e][2];
        if (kind === 3) segLoad[net.out[u][e][3]] += f;
        else if (kind === 1) boards[net.out[u][e][3]] += f;
      }
      done();
    }
    // a zone nobody searches from still has access: what its neighbours see
    for (let i = 0; i < n; i++) if (this.land[i] && !access[i]) {
      let s = 0, c = 0; for (const j of this.nbrs[i]) if (access[j]) { s += access[j]; c++; }
      access[i] = c ? 0.6 * s / c : jobs[i];
    }
    return { access, segLoad, boards, trips, transit, origins: origins.length };
  }

  lineStats(net, dem) {
    let stranded = 0;
    const per = this.lines.map((L) => ({ id: L.id, riders: 0, peak: 0, cap: L._cap || 0, crowd: 0, stranded: 0, headway: L._headway || 0, segs: [] }));
    net.segs.forEach((s, k) => {
      const load = 2 * dem.segLoad[k];           // the morning flow, and its evening return the other way
      const L = per[s.line], c = load / Math.max(1, L.cap);
      L.segs.push({ k: s.k, dir: s.dir, load, crowd: c });
      L.peak = Math.max(L.peak, load); L.crowd = Math.max(L.crowd, c);
      const prev = this.crowd.get(s.key) || 0; this.crowd.set(s.key, 0.5 * prev + 0.5 * c);
      const x = Math.max(0, load - L.cap); L.stranded = Math.max(L.stranded, x);
    });
    per.forEach((L, i) => { L.riders = 2 * dem.boards[i]; stranded += L.stranded; });
    const riders = per.reduce((s, L) => s + L.riders, 0);
    this.stats = { riders, share: dem.trips ? dem.transit / dem.trips : 0, stranded, origins: dem.origins, lines: per };
  }

  grow(dem) {
    const n = this.n, W = this.world, pop = this.pop, K = new Float64Array(n), u = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!this.land[i]) { pop[i] = 0; continue; }
      const g = this.geo[i], a = this.area[i];
      u[i] = Math.min(P_.A_MAX, dem.access[i] / P_.A_REF);
      const wet = W.fresh[g] / (W.fresh[g] + P_.W_HALF);   // how much of a city its water can carry
      K[i] = a * W.hab[g] * wet * (P_.RURAL + P_.URBAN * Math.pow(u[i], P_.ALPHA));
    }
    const next = pop.slice();
    for (let i = 0; i < n; i++) {
      if (!this.land[i] || pop[i] <= 0) continue;
      const k = Math.max(1, K[i]), p = pop[i];
      next[i] += P_.R_GROW * p * (1 - p / k);
      if (p / k > P_.SPILL_AT) { // spill into neighbours with room
        const s = P_.SPILL * p * (p / k - P_.SPILL_AT);
        let room = 0; for (const j of this.nbrs[i]) if (this.land[j]) room += Math.max(0, K[j] - pop[j]);
        if (room > 0) { for (const j of this.nbrs[i]) if (this.land[j]) next[j] += s * Math.max(0, K[j] - pop[j]) / room; next[i] -= s; }
      }
    }
    for (let i = 0; i < n; i++) pop[i] = Math.max(0, next[i]);
    // jobs gather where access is high; as many as there are workers
    let tot = 0, w = 0;
    for (let i = 0; i < n; i++) { this.jobs[i] = pop[i] * (0.4 + Math.min(1, u[i])); w += this.jobs[i]; tot += pop[i]; }
    const f = w > 0 ? P_.WORK * tot / w : 0;
    for (let i = 0; i < n; i++) this.jobs[i] *= f;
    this.K = K; this.u = u;
  }

  refine() {
    const cand = [];
    for (let i = 0; i < this.n; i++) if (this.land[i] && this.area[i] > P_.SPLIT_MIN_AREA && this.pop[i] > P_.SPLIT_POP) cand.push(i);
    cand.sort((a, b) => this.pop[b] - this.pop[a]);
    let k = 0;
    for (const i of cand) { if (k >= P_.MAX_SPLITS || this.sites.length / 3 + 2 > P_.MAX_ZONES) break; this.split(i); k++; }
    if (k) this.rebuild();
    return k;
  }

  /* What the page draws. */
  snapshot() {
    return { n: this.n, P: this.P, verts: this.verts, polys: this.polys, geo: Int32Array.from(this.geo), pop: Float64Array.from(this.pop),
      area: this.area, land: this.land, stats: this.stats, credits: this.credits, year: this.year };
  }
}

/* What laying a stretch from a to b costs: km, ×COST_WATER over water,
   more over rough ground. Needs only world.{V, adj, water, rough}. */
export function trackCost(W, a, b) {
  const steps = Math.max(2, Math.ceil(arc(a, b) * R / 8));
  let cost = 0, g = nearestCell(W, a, -1);
  for (let k = 0; k < steps; k++) {
    const p = slerp(a, b, (k + 0.5) / steps); g = nearestCell(W, p, g);
    cost += (W.water[g] ? P_.COST_WATER : 1) * Math.sqrt(W.rough[g]);
  }
  return P_.COST_KM * cost * arc(a, b) * R / steps;
}

/* ---------------------------------------------------------------- helpers */
function dijkstra(out, src, dist, pred, pedge, via, heap, tmax, roadOnly) {
  const order = []; dist[src] = 0; if (via) via[src] = 0; heap.clear(); heap.push(src, 0);
  while (heap.size) {
    const u = heap.pop(), du = dist[u];
    if (du > tmax) break;
    order.push(u);
    const E = out[u];
    for (let e = 0; e < E.length; e++) {
      const ed = E[e]; if (roadOnly && ed[2]) continue;
      const v = ed[0], nd = du + ed[1];
      if (nd < dist[v]) {
        dist[v] = nd; if (pred) { pred[v] = u; pedge[v] = e; } if (via) via[v] = via[u] | (ed[2] === 3 ? 1 : 0);
        heap.push(v, nd);
      }
    }
  }
  return order; // heap.seen holds every node it touched, for the caller's reset
}
function reset(order, dist, via) { for (const v of order) { dist[v] = Infinity; if (via) via[v] = 0; } }

class Heap { // binary heap with lazy deletion
  constructor(n) { this.k = new Int32Array(Math.max(16, n * 4)); this.p = new Float64Array(this.k.length); this.size = 0; this.seen = []; }
  clear() { this.size = 0; this.seen.length = 0; }
  push(v, pri) {
    if (this.size >= this.k.length) { const k = new Int32Array(this.k.length * 2); k.set(this.k); this.k = k; const p = new Float64Array(k.length); p.set(this.p); this.p = p; }
    let i = this.size++; this.seen.push(v);
    while (i > 0) { const pa = (i - 1) >> 1; if (this.p[pa] <= pri) break; this.k[i] = this.k[pa]; this.p[i] = this.p[pa]; i = pa; }
    this.k[i] = v; this.p[i] = pri;
  }
  pop() {
    const top = this.k[0], v = this.k[--this.size], pri = this.p[this.size];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.size) break; if (c + 1 < this.size && this.p[c + 1] < this.p[c]) c++; if (this.p[c] >= pri) break; this.k[i] = this.k[c]; this.p[i] = this.p[c]; i = c; }
    this.k[i] = v; this.p[i] = pri;
    return top;
  }
}

function polyArea(P, V, i, ring) {
  let s = 0; const a = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let k = 0; k < ring.length; k++) {
    const b = [V[3 * ring[k]], V[3 * ring[k] + 1], V[3 * ring[k] + 2]], c = [V[3 * ring[(k + 1) % ring.length]], V[3 * ring[(k + 1) % ring.length] + 1], V[3 * ring[(k + 1) % ring.length] + 2]];
    const num = Math.abs(dot(a, cross(b, c))), den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
    s += 2 * Math.atan2(num, den);
  }
  return s;
}
export function arc(a, b) { return Math.atan2(len(cross(a, b)), dot(a, b)); }
function arcI(P, i, j) { return arc([P[3 * i], P[3 * i + 1], P[3 * i + 2]], [P[3 * j], P[3 * j + 1], P[3 * j + 2]]); }
export function slerp(a, b, t) {
  const w = arc(a, b); if (w < 1e-9) return a.slice();
  const s = Math.sin(w), p = Math.sin((1 - t) * w) / s, q = Math.sin(t * w) / s;
  return [p * a[0] + q * b[0], p * a[1] + q * b[1], p * a[2] + q * b[2]];
}
function frame(p) { const a = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = norm(cross(p, a)), e2 = cross(p, e1); return [e1, e2]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
