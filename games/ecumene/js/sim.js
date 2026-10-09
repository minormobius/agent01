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
        rides between consecutive stops (and from the last back to the first
        on a LOOP), boarding (access + half a headway) and alighting. A
        line's headway is its round trip over its trains; an open line also
        turns back at both ends, which a loop never does. Stops of different
        lines at the same place are an INTERCHANGE: a change there takes a
        minute and half the other line's headway instead of a walk out to
        the street and back, and jobs gather at it (a station district).
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
import { freight, F_, farmers } from "./freight.js";

export const P_ = {
  ROAD_KMH: 40, CONGEST: 250,     // road speed falls as 1/(1 + density/CONGEST)
  LINE_KMH: 70, DWELL: 1, ACCESS: 3, EGRESS: 2, MIN_HEADWAY: 2,
  TURN: 3,                        // a train turning back at a terminus, each end (a loop never turns)
  HUB_KM: 0.6, TRANSFER: 1,       // stops of two lines this close are one station: change in a minute, not through the street
  HUB_JOBS: 0.5,                  // and jobs gather there: ×(1 + HUB_JOBS) for every line past the first
  BETA: 0.04, THETA: 0.12, TMAX: 120,
  WORK: 0.45,                     // workers (and jobs) per person
  R_GROW: 0.07, RURAL: 6, URBAN: 6000, A_REF: 100000, ALPHA: 1, A_MAX: 4, W_HALF: 400,
  SPILL_AT: 0.6, SPILL: 0.05, TOWN_SEED: 30,
  RIVER_FLOW: 30,                 // rivers this big get finer districts along them
  ORIGIN_MIN: 600, ORIGIN_DENS: 40, MAX_ORIGINS: 1600,   // farmers (under ORIGIN_DENS/km²) work where they live
  SPLIT_POP: 8000, SPLIT_MIN_AREA: 1.5, MAX_ZONES: 6000, MAX_SPLITS: 60,
  TRAIN_CAP: 260, SERVICE_MIN: 1080, CROWD_SLOW: 1.5,
  TOWN_EVERY: 4, TOWNS0: 7, TOWN_POP: 6000, WARMUP: 60,
  FARE_TRIP: 0.000005, FARE_KM: 0.0000005, // a fare per JOURNEY (however many lines it takes) and per km ridden; ×365 a year
  TRAIN_UPKEEP: 10, TRACK_UPKEEP: 0.25, // a year: per train, per km of line
  COST_WAGON: 60, WAGON_UPKEEP: 6,      // freight: a wagon, and its year
  COST_KM: 4, COST_WATER: 3, COST_STOP: 20, COST_TRAIN: 90, START_CREDITS: 700,
  URBAN_COST: 1200,                // building costs ×(1 + density/URBAN_COST): tunnels and land
  INDEX_EXP: 0.5,
  WAGE: 0.01, FOOD_GDP: 0.008,     // FOOD_GDP: ₵ a unit of food is worth to its farm at the usual price                     // GDP: ₵ a year a job is worth (before reach, ore and prices)
  LEVY_MAX: 0.6, LEVY_HALF: 4000, // the cities' cut of fares: LEVY_MAX·f/(f + LEVY_HALF·index), f = fares a year                 // prices follow the world's wealth: (people / people at the start)^INDEX_EXP
};

/* Building rights. You hold a charter round your home city; carrying enough
   riders a day earns the right to buy the next, wider one. The last covers
   the planet. Fees are at start prices (the index applies). */
export const TIERS = [
  { km: 35 },
  { km: 70, riders: 20e3, fee: 400 },
  { km: 140, riders: 60e3, fee: 1200 },
  { km: 300, riders: 150e3, fee: 3500 },
  { km: Infinity, riders: 400e3, fee: 9000 },
];

export class Sim {
  constructor(world, seed) {
    this.world = world; this.seed = seed >>> 0; this.year = 0; this.credits = P_.START_CREDITS;
    this.rng = mulberry(this.seed ^ 0x9e3779b9);
    const W = world, n = W.N;
    this.sites = Array.from(W.V); this.geo = []; this.pop = []; this.jobs = [];
    for (let i = 0; i < n; i++) { this.geo.push(i); this.pop.push(0); this.jobs.push(0); }
    this.lines = []; this.history = []; this.stats = {}; this.crowd = new Map();
    this.towns = []; this.events = []; this.log = []; this.flags = new Map(); this.names = new Set();
    this.rebuild();
    this.riverDetail(); this.riverDetail();   // twice: the valleys get two levels of detail
    // the countryside, farmed from the start: each habitable zone at 60% of the farmers its land takes
    for (let i = 0; i < this.n; i++) if (this.land[i]) this.pop[i] = 0.6 * farmers(this, i);
    for (let k = 0; k < P_.TOWNS0; k++) this.foundTown(5);
    this.chronicle();
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
    this.pop[i] = share; const kids = [i];
    for (let k = 1; k <= 2; k++) {
      const a = a0 + k * 2 * Math.PI / 3, q = norm([p[0] + r * (Math.cos(a) * f[0][0] + Math.sin(a) * f[1][0]), p[1] + r * (Math.cos(a) * f[0][1] + Math.sin(a) * f[1][1]), p[2] + r * (Math.cos(a) * f[0][2] + Math.sin(a) * f[1][2])]);
      kids.push(this.sites.length / 3);
      this.sites.push(q[0], q[1], q[2]); this.geo.push(nearestCell(this.world, q, this.geo[i])); this.pop.push(share); this.jobs.push(this.jobs[i] / 3);
    }
    this.jobs[i] /= 3;
    return kids;
  }
  /* Finer districts along the rivers: every land zone a real river runs
     through (flow ≥ RIVER_FLOW) is split once, so the river has district
     boundaries to follow and the valley its own detail. Done once, at the
     start, before anyone lives there. */
  riverDetail() {
    const W = this.world, hit = new Set();
    for (const r of W.rivers) {
      if (r.flow < P_.RIVER_FLOW) continue;
      const steps = Math.max(2, Math.ceil(arc(r.a, r.b) * R / 6));
      for (let k = 0; k <= steps; k++) { const z = this.zoneAt(slerp(r.a, r.b, k / steps)); if (this.land[z] && this.area[z] > 4 * P_.SPLIT_MIN_AREA) hit.add(z); }
    }
    if (!hit.size) return 0;
    for (const z of [...hit].sort((a, b) => a - b)) this.split(z);
    this.rebuild();
    return hit.size;
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
    for (let i = 0; i < this.n; i++) if (this.pop[i] / Math.max(1e-6, this.area[i]) > 60) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h]; if (d[i] >= minHops) continue; for (const j of this.nbrs[i]) if (d[j] < 0) { d[j] = d[i] + 1; q.push(j); } }
    let best = -1, bs = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.land[i] || d[i] >= 0) continue;
      const s = this.siteScore(i); if (s > bs) { bs = s; best = i; }
    }
    if (best >= 0) {
      this.pop[best] += P_.TOWN_POP; this.lastTown = best;
      const t = { name: this.townName(), p: [this.P[3 * best], this.P[3 * best + 1], this.P[3 * best + 2]], year: this.year, mark: 0, pop: P_.TOWN_POP };
      this.towns.push(t);
      const g = this.geo[best], W = this.world;
      this.emit("town", t.name + " is founded" + (W.flow[g] > 60 ? " on a river" : W.fresh[g] > 900 ? " by a lake" : ""), t.p);
    }
    return best;
  }

  /* A town's name: two or three syllables, drawn from the sim's own rng so a
     seed always names its towns the same. */
  townName() {
    const A = ["ar", "bel", "cor", "dun", "el", "fen", "gal", "har", "is", "kel", "lin", "mar", "nor", "ost", "pel", "quar", "ros", "sal", "tor", "ul", "ven", "wy", "yar", "zel", "ash", "bri", "cal", "dor", "eth", "lo"];
    const B = ["a", "e", "i", "o", "en", "an", "or", "is", "ia", "um"];
    const C = ["ford", "mere", "ton", "holm", "by", "wick", "stead", "mouth", "dale", "port", "brook", "vale", "ness", "gate", "", "", ""];
    for (let k = 0; k < 50; k++) {
      const r = () => this.rng(), w = A[r() * A.length | 0] + (r() < 0.5 ? B[r() * B.length | 0] : "") + C[r() * C.length | 0];
      const name = w[0].toUpperCase() + w.slice(1);
      if (name.length >= 4 && !this.names.has(name)) { this.names.add(name); return name; }
    }
    return "Town " + (this.towns.length + 1);
  }
  /* What happened this year, for the page's log: { year, kind, text, p, line }. */
  emit(kind, text, p, line) { const e = { year: this.year, kind, text, p: p || null, line: line == null ? null : line }; this.events.push(e); this.log.push(e); }
  /* Once per crossing: true the first time `key` turns on, after it was off. */
  edge(key, on) { const was = this.flags.get(key) || false; this.flags.set(key, on); return on && !was; }
  /* Cities: every settled zone belongs to its nearest town. */
  chronicle() {
    const T = this.towns; if (!T.length) return;
    const tot = new Float64Array(T.length), rur = new Float64Array(T.length), gdp = new Float64Array(T.length), P = this.P, zt = new Int32Array(this.n).fill(-1);
    const gz = this.gdpZ = new Float64Array(this.n);   // GDP zone by zone, for the map
    for (let i = 0; i < this.n; i++) {
      if (!this.land[i]) continue;
      let best = -2, bi = 0; for (let t = 0; t < T.length; t++) { const q = T[t].p, d = P[3 * i] * q[0] + P[3 * i + 1] * q[1] + P[3 * i + 2] * q[2]; if (d > best) { best = d; bi = t; } }
      zt[i] = bi;   // every piece of land belongs to its nearest town: its farms feed it
      // a town is its people who don't farm; its farmers are its countryside
      const fm = Math.min(this.pop[i], farmers(this, i));
      if (best > Math.cos(60 / R)) tot[bi] += this.pop[i] - fm;
      rur[bi] += fm;
      // GDP: jobs, worth more where they reach more and where the ore comes in; and what the farms grow
      // a zone split since growth has no reach yet
      const u = this.u && this.u[i] != null ? Math.min(1, this.u[i]) : 0, ind = this.fr && this.fr.ore[bi] != null ? 0.85 + 0.3 * this.fr.ore[bi] : 1;
      // the farms earn what they grow at what food fetches
      const fr = this.fr, food = fr && fr.price && fr.price.food[bi] != null ? Math.min(3, fr.price.food[bi]) : 1, hand = fr && fr.perHand && fr.perHand[bi] != null ? fr.perHand[bi] : 0.5;
      gz[i] = (this.jobs[i] * P_.WAGE * (0.7 + 0.6 * u) * ind + fm * hand * food * P_.FOOD_GDP) * (this.index || 1);
      gdp[bi] += gz[i];
    }
    this.zoneTown = zt;
    const MARKS = [50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6];
    T.forEach((t, k) => {
      t.pop = tot[k]; t.rural = rur[k]; t.gdp = gdp[k];
      while (t.mark < MARKS.length && tot[k] >= MARKS[t.mark]) {
        if (this.year > 0 && t.mark >= 1) this.emit("city", t.name + " passes " + fmtN(MARKS[t.mark]), t.p);
        t.mark++;
      }
    });
    const sorted = T.map((t, k) => [tot[k], k]).sort((a, b) => b[0] - a[0]);
    if (sorted.length > 1 && sorted[0][0] > 1.05 * sorted[1][0] && this.edge("biggest:" + sorted[0][1], true)) { for (const [, k] of sorted.slice(1)) this.flags.set("biggest:" + k, false); if (this.year > 1) this.emit("city", T[sorted[0][1]].name + " is now the largest city", T[sorted[0][1]].p); }
  }

  /* ---------------------------------------------------------------- lines
     line: { id, color, stops: [[x, y, z], …], trains }. Stops are points on
     the sphere; each year they are found in whatever zone now holds them. */
  setLines(lines) { this.lines = lines.map((l) => ({ id: l.id, color: l.color, stops: l.stops.map((s) => s.slice()), trains: l.trains, wagons: l.wagons || 0, loop: !!l.loop && l.stops.length >= 3 })); }
  /* Prices now: the index, and what building costs at p (a stop) or from a to b (track). */
  densAt(p) { const z = this.zoneAt(p); return this.pop[z] / Math.max(1e-6, this.area[z]); }
  trackCost(a, b) { return trackCost(this.world, a, b, (p) => this.densAt(p)) * (this.index || 1); }
  trainCost() { return P_.COST_TRAIN * (this.index || 1); }
  wagonCost() { return P_.COST_WAGON * (this.index || 1); }
  stopCost(p) { return P_.COST_STOP * (1 + this.densAt(p) / P_.URBAN_COST) * (this.index || 1); }
  /* The charter: where you may build, and whether the next one is yours to buy. */
  canBuild(p) { return this.home == null || arc(p, this.towns[this.home].p) * R <= TIERS[this.tier].km + 1e-9; }
  charterReady() { const t = TIERS[this.tier + 1]; return !!t && (this.stats.riders || 0) >= t.riders; }
  charterFee() { const t = TIERS[this.tier + 1]; return t ? t.fee * (this.index || 1) : Infinity; }
  buyCharter() {
    if (!this.charterReady() || this.credits < this.charterFee()) return false;
    this.credits -= this.charterFee(); this.tier++;
    const km = TIERS[this.tier].km;
    this.emit("charter", km === Infinity ? "The charter now covers the whole planet" : "The charter now reaches " + km + " km from " + this.towns[this.home].name, this.towns[this.home].p);
    return true;
  }
  warmup() {
    for (let k = 0; k < P_.WARMUP; k++) this.step();
    this.history.length = 0; this.credits = P_.START_CREDITS;
    // home: the biggest city at the start; prices index from here
    let h = 0; this.towns.forEach((t, k) => { if (t.pop > this.towns[h].pop) h = k; });
    this.home = h; this.tier = 0; this.pop0 = this.stats.pop; this.index = 1;
    const big = this.towns.filter((t) => t.pop > 1000).sort((a, b) => b.pop - a.pop);
    this.log = [{ year: this.year, kind: "planet", text: big.length + " towns and cities, " + fmtN(this.stats.pop) + " people", p: null, line: null }]
      .concat(big.slice(0, 8).map((t) => ({ year: this.year, kind: "town", text: t.name + ", " + fmtN(t.pop) + " people", p: t.p, line: null })));
    this.events = [];
  }

  /* ---------------------------------------------------------------- a year */
  step() {
    const t0 = Date.now();
    const net = this.network();
    const dem = this.demand(net);
    this.lineStats(net, dem);
    this.fr = freight(this);
    this.grow(dem);
    this.events = [];
    const splits = this.refine();
    this.year++;
    if (this.year % P_.TOWN_EVERY === 0) this.foundTown(4);
    this.chronicle();
    const gross = this.stats.lines.reduce((s, L) => s + L.fare, 0) * 365;
    // the concession: the cities you serve take a share of the fares that grows with them
    const levy = gross * P_.LEVY_MAX * gross / (gross + P_.LEVY_HALF * (this.index || 1)), fares = gross - levy;
    this.stats.gross = gross; this.stats.levy = levy;
    let upkeep = 0;
    for (const L of this.lines) { upkeep += P_.TRAIN_UPKEEP * L.trains + P_.WAGON_UPKEEP * (L.wagons || 0); for (const [a, b] of legs(L)) upkeep += P_.TRACK_UPKEEP * arc(L.stops[a], L.stops[b]) * R; }
    upkeep *= this.index || 1;
    const cargo = this.fr ? this.fr.revenue : 0;
    this.credits += fares + cargo - upkeep; this.stats.fares = fares + cargo; this.stats.cargo = cargo; this.stats.upkeep = upkeep;
    let total = 0, urban = 0; for (let i = 0; i < this.n; i++) { total += this.pop[i]; if (this.pop[i] / Math.max(1, this.area[i]) > 300) urban += this.pop[i]; }
    Object.assign(this.stats, { year: this.year, pop: total, urban, zones: this.n, splits, ms: Date.now() - t0, credits: this.credits });
    // the lines, the money and the planet, each said once when it changes
    for (const L of this.stats.lines) {
      if (this.edge("full:" + L.id, L.crowd > 1.05 && L.stranded > 200)) this.emit("full", "is full: " + fmtN(L.stranded) + " riders a day left on the platform", null, L.id);
      else if (this.edge("room:" + L.id, L.crowd < 0.85 && this.flags.get("full:" + L.id) === false && this.flags.has("full:" + L.id) && this.flags.get("wasfull:" + L.id))) this.emit("room", "has room again", null, L.id);
      if (L.crowd > 1.05 && L.stranded > 200) this.flags.set("wasfull:" + L.id, true); else if (L.crowd < 0.85) this.flags.set("wasfull:" + L.id, false);
      if (this.edge("busy:" + L.id, L.riders > 50e3)) this.emit("line", "carries " + fmtN(L.riders) + " riders a day", null, L.id);
    }
    if (this.fr) {
      const fr = this.fr;
      this.towns.forEach((t, k) => {
        if (this.edge("hungry:" + k, fr.food[k] < 0.85 && fr.short[k] > 20e3)) this.emit("hunger", t.name + " is going hungry: " + Math.round(100 * (1 - fr.food[k])) + "% short of food", t.p);
        if (this.edge("fed:" + k, fr.food[k] > 0.97) && this.flags.get("wasHungry:" + k)) this.emit("fed", t.name + " is fed again", t.p);
        if (fr.food[k] < 0.85 && fr.short[k] > 20e3) this.flags.set("wasHungry:" + k, true); else if (fr.food[k] > 0.97) this.flags.set("wasHungry:" + k, false);
        const tk = this.agTech ? this.agTech[k] || 1 : 1;   // the farms getting better, each doubling said once
        for (const m of [2, 4, 8]) if (this.edge("tech:" + k + ":" + m, tk >= m) && this.year > 1) this.emit("tech", "The farms round " + t.name + " grow " + (m === 2 ? "twice" : m + "×") + " what they did", t.p);
        const p = fr.price ? fr.price.food[k] : 1;   // the market: dear food, said once until it eases
        if (this.edge("dear:" + k, p > 1.6 && fr.need[k] > 20e3)) this.emit("dear", "Food in " + t.name + " costs ×" + p.toFixed(1) + " the usual", t.p);
        else if (p < 1.3) this.flags.set("dear:" + k, false);
      });
      fr.mines.forEach((m, k) => { if (this.edge("mine:" + k, m.on) && this.year > 1) this.emit("mine", "A " + m.kind + " mine opens" + nearTown(this, m.p), m.p); });
      for (const [id, f] of fr.lines) if (this.edge("cargo:" + id, f.food + f.ore > 50e3)) this.emit("cargo", "carries " + fmtN(f.food + f.ore) + " of freight a year", null, id);
    }
    // a new interchange, said once (its lines are named on the page, which knows their colours)
    const hubKeys = new Set((this.hubs || []).map((h) => h.lines.join("+") + "@" + h.p.map((x) => Math.round(x * 2000)).join(",")));
    (this.hubs || []).forEach((h) => { const key = h.lines.join("+") + "@" + h.p.map((x) => Math.round(x * 2000)).join(","); if (!(this.hubSeen || new Set()).has(key)) { this.emit("hub", nearTown(this, h.p), h.p); this.events[this.events.length - 1].lines = h.lines; } });
    this.hubSeen = hubKeys;
    if (this.pop0) this.index = Math.max(1, Math.pow(total / this.pop0, P_.INDEX_EXP));
    if (this.home != null && this.edge("charterReady:" + this.tier, this.charterReady()))
      this.emit("charter", "You've earned a wider charter: " + (TIERS[this.tier + 1].km === Infinity ? "the whole planet" : TIERS[this.tier + 1].km + " km") + ", for ₵" + Math.round(this.charterFee()), this.towns[this.home].p);
    if (this.edge("broke", this.credits < 0)) this.emit("money", "Funds are overdrawn: the lines still run, but nothing new can be built");
    const PM = [2e6, 5e6, 10e6, 20e6, 50e6];
    for (const m of PM) if (this.edge("planet:" + m, total >= m) && this.year > 1) this.emit("planet", "The planet passes " + fmtN(m) + " people");
    if (this.edge("meshfull", this.n + 2 > P_.MAX_ZONES)) this.emit("planet", "The map is as fine as it gets: districts no longer split");
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
      const lg = legs(L);
      // both ways round: a loop runs half its trains each way, so its cycle is twice the ring, like an open line's out and back
      let cycle = L.loop ? 0 : 2 * P_.TURN;
      for (const [a, b] of lg) { const m = 60 * arc(L.stops[a], L.stops[b]) * R / P_.LINE_KMH + P_.DWELL; rides.push(m); cycle += 2 * m; }
      const headway = Math.max(P_.MIN_HEADWAY, cycle / L.trains), cap = L.trains * (P_.SERVICE_MIN / Math.max(1, cycle)) * P_.TRAIN_CAP;
      L._cycle = cycle; L._headway = headway; L._cap = cap;
      lg.forEach(([s0, s1], k) => { for (const dir of [1, -1]) {
        const a = dir > 0 ? s0 : s1, b = dir > 0 ? s1 : s0, key = L.id + ":" + k + ":" + dir, c = this.crowd.get(key) || 0;
        const seg = segs.length; segs.push({ line: li, k, dir, key, km: arc(L.stops[s0], L.stops[s1]) * R, minutes: rides[k] * (1 + P_.CROWD_SLOW * Math.max(0, c - 0.8)) });
        out[base + a].push([base + b, segs[seg].minutes, 3, seg]);
      } });
      L.stops.forEach((s, k) => {
        const z = stops[stops.length - L.stops.length + k].zone;
        if (!this.land[z]) return;
        out[z].push([base + k, P_.ACCESS + headway / 2, 1, li]);
        out[base + k].push([z, P_.EGRESS, 2, li]);
      });
    });
    // interchanges: every pair of stops of two lines within HUB_KM; a change is kind 4, and boards the other line
    const hubs = [], hubOf = new Map(), lineAt = (s) => this.lines[s.line];
    for (let x = 0; x < stops.length; x++) for (let y = x + 1; y < stops.length; y++) {
      const A = stops[x], B = stops[y]; if (A.line === B.line) continue;
      const pa = lineAt(A).stops[A.k], pb = lineAt(B).stops[B.k];
      if (arc(pa, pb) * R > P_.HUB_KM) continue;
      out[A.node].push([B.node, P_.TRANSFER + lineAt(B)._headway / 2, 4, B.line]);
      out[B.node].push([A.node, P_.TRANSFER + lineAt(A)._headway / 2, 4, A.line]);
      let h = hubOf.get(x) ?? hubOf.get(y);
      if (h == null) { h = hubs.length; hubs.push({ p: pa, zone: A.zone, lines: new Set() }); }
      hubOf.set(x, h); hubOf.set(y, h); hubs[h].lines.add(lineAt(A).id); hubs[h].lines.add(lineAt(B).id);
    }
    this.hubs = hubs.map((h) => ({ p: h.p, zone: h.zone, lines: [...h.lines].sort((a, b) => a - b) }));
    return { out, nodes: out.length, stops, segs, speed };
  }

  demand(net) {
    const n = this.n, N = net.nodes, jobs = this.jobs, pop = this.pop;
    const origins = [];
    for (let i = 0; i < n; i++) if (this.land[i] && pop[i] >= P_.ORIGIN_MIN && pop[i] / Math.max(1e-6, this.area[i]) >= P_.ORIGIN_DENS) origins.push(i);
    origins.sort((a, b) => pop[b] - pop[a]); origins.length = Math.min(origins.length, P_.MAX_ORIGINS);
    const access = new Float64Array(n), segLoad = new Float64Array(net.segs.length), boards = new Float64Array(this.lines.length);
    const dist = new Float64Array(N).fill(Infinity), road = new Float64Array(N).fill(Infinity), pred = new Int32Array(N), pedge = new Int32Array(N), via = new Uint8Array(N), flow = new Float64Array(N);
    const heap = new Heap(N);
    let trips = 0, transit = 0, changes = 0;
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
        else if (kind === 4) { boards[net.out[u][e][3]] += f; changes += f; }
      }
      done();
    }
    // a zone nobody searches from still has access: what its neighbours see
    const searched = access.slice();   // (read from a copy: filling in order let one filled zone feed the next, and a line could lower a reach)
    for (let i = 0; i < n; i++) if (this.land[i] && !access[i]) {
      let s = 0, c = 0; for (const j of this.nbrs[i]) if (searched[j]) { s += searched[j]; c++; }
      access[i] = c ? 0.6 * s / c : jobs[i];
    }
    return { access, segLoad, boards, trips, transit, changes, origins: origins.length };
  }

  lineStats(net, dem) {
    let stranded = 0;
    const per = this.lines.map((L) => ({ id: L.id, riders: 0, peak: 0, cap: L._cap || 0, crowd: 0, stranded: 0, headway: L._headway || 0, segs: [], km: 0, fare: 0 }));
    net.segs.forEach((s, k) => {
      const load = 2 * dem.segLoad[k];           // the morning flow, and its evening return the other way
      const L = per[s.line], c = load / Math.max(1, L.cap);
      L.segs.push({ k: s.k, dir: s.dir, load, crowd: c }); L.km += load * s.km;
      L.peak = Math.max(L.peak, load); L.crowd = Math.max(L.crowd, c);
      const prev = this.crowd.get(s.key) || 0; this.crowd.set(s.key, 0.5 * prev + 0.5 * c);
      const x = Math.max(0, load - L.cap); L.stranded = Math.max(L.stranded, x);
    });
    per.forEach((L, i) => { L.riders = 2 * dem.boards[i]; stranded += L.stranded; });
    /* Fares: one per JOURNEY, however many lines it takes, and a rate per km
       ridden. A flat fare per boarding paid a change of lines twice, and a web
       of short lines that made people change earned as much from fewer of
       them (measured: 40% fewer journeys, the same fares). The journey fare
       is shared between lines by their boardings; each keeps its own km. */
    const journeys = 2 * dem.transit, boardings = per.reduce((s, L) => s + L.riders, 0);
    per.forEach((L) => { L.fare = P_.FARE_KM * L.km + (boardings > 0 ? P_.FARE_TRIP * journeys * L.riders / boardings : 0); });
    this.stats = { riders: journeys, boardings, transfers: 2 * (dem.changes || 0), hubs: (this.hubs || []).length, share: dem.trips ? dem.transit / dem.trips : 0, stranded, origins: dem.origins, lines: per,
      riderKm: per.reduce((s, L) => s + L.km, 0) };
  }

  grow(dem) {
    const n = this.n, W = this.world, pop = this.pop, K = new Float64Array(n), u = new Float64Array(n), eat = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!this.land[i]) { pop[i] = 0; continue; }
      const g = this.geo[i], a = this.area[i];
      u[i] = Math.min(P_.A_MAX, dem.access[i] / P_.A_REF);
      const wet = W.fresh[g] / (W.fresh[g] + P_.W_HALF);   // how much of a city its water can carry
      const t = this.zoneTown ? this.zoneTown[i] : -1, fed = this.fr && t >= 0 && this.fr.food[t] != null ? this.fr.food[t] : 1;
      eat[i] = Math.max(0, Math.min(1, (fed - F_.FOOD_STALL) / (1 - F_.FOOD_STALL)));   // a hungry town grows slower, and not at all past FOOD_STALL
      // the town's ceiling, and the farmers its land takes (who feed themselves)
      K[i] = a * W.hab[g] * wet * (P_.RURAL + P_.URBAN * Math.pow(u[i], P_.ALPHA)) * (F_.FOOD_FLOOR + (1 - F_.FOOD_FLOOR) * fed) + farmers(this, i);
    }
    /* Below its ceiling a zone grows logistically; near it, some of its people
       move next door, to wherever there is room; over it (a ceiling falls when
       a line is closed or a split leaves a sliver), a quarter of the excess
       leaves each year. Every move is bounded by what is there and what has
       room, so nothing here can overshoot: the explicit logistic step alone
       did, by a factor of a hundred a year, once a zone sat far over its
       ceiling. */
    const next = pop.slice();
    for (let i = 0; i < n; i++) {
      if (!this.land[i] || pop[i] <= 0) continue;
      const k = Math.max(1, K[i]), p = pop[i];
      // spill is the town's: farmers stay on the land they farm (until the machines put them over the ceiling)
      const fm = farmers(this, i), pt = Math.max(0, p - fm), kt = Math.max(1, k - fm);
      let out;
      if (p <= k) {
        // two populations in one zone: the farmers settle toward what the land takes, and the
        // town grows on its own people (from a seed, so any zone can start one)
        if (p < fm) next[i] += 0.1 * (fm - p);
        else next[i] += P_.R_GROW * eat[i] * Math.max(pt, P_.TOWN_SEED) * (1 - pt / kt);
        out = pt / kt > P_.SPILL_AT ? P_.SPILL * pt * (pt / kt - P_.SPILL_AT) : 0;
      }
      else out = 0.25 * (p - k);
      if (out <= 0) continue;
      let room = 0; for (const j of this.nbrs[i]) if (this.land[j]) room += Math.max(0, K[j] - pop[j]);
      const moved = Math.min(out, 0.5 * room);
      if (moved > 0) for (const j of this.nbrs[i]) if (this.land[j]) next[j] += moved * Math.max(0, K[j] - pop[j]) / room;
      next[i] -= p > k ? out : moved;   // over the ceiling the rest leave anyway
    }
    for (let i = 0; i < n; i++) pop[i] = next[i] > 0 && isFinite(next[i]) ? next[i] : 0;
    // jobs gather where access is high, and at interchanges; as many as there are workers
    let tot = 0, w = 0; const hubJobs = new Map();
    for (const h of this.hubs || []) hubJobs.set(h.zone, Math.max(hubJobs.get(h.zone) || 1, 1 + P_.HUB_JOBS * (h.lines.length - 1)));
    for (let i = 0; i < n; i++) {
      const t = this.zoneTown ? this.zoneTown[i] : -1, ind = this.fr && t >= 0 && this.fr.ore[t] != null ? 0.85 + 0.3 * this.fr.ore[t] : 1;   // industry follows the ore (a town founded since the market has none yet)
      // farmers work their own fields: only the rest of a zone's people fill (and make) the jobs others travel to
      const town = Math.max(0, pop[i] - farmers(this, i));
      this.jobs[i] = town * (0.4 + Math.min(1, u[i])) * ind * (hubJobs.get(i) || 1); w += this.jobs[i]; tot += town;
    }
    const f = w > 0 ? P_.WORK * tot / w : 0;
    for (let i = 0; i < n; i++) this.jobs[i] *= f;
    this.K = K; this.u = u;
  }

  refine() {
    const cand = [];
    for (let i = 0; i < this.n; i++) if (this.land[i] && this.area[i] > P_.SPLIT_MIN_AREA && this.pop[i] > P_.SPLIT_POP && this.pop[i] / this.area[i] > 60) cand.push(i);   // cities split; farmland doesn't need the detail
    cand.sort((a, b) => this.pop[b] - this.pop[a]);
    let k = 0; const groups = [];
    for (const i of cand) { if (k >= P_.MAX_SPLITS || this.sites.length / 3 + 2 > P_.MAX_ZONES) break; groups.push(this.split(i)); k++; }
    if (k) {
      this.rebuild();
      // the people of a split go to its children by the land each one got. An equal
      // three-way share once put a third of a district into a 0.6 km² sliver, a
      // thousand times over its ceiling, and the overshoot ran away (seed 896933214).
      for (const g of groups) {
        let tot = 0, area = 0;
        for (const c of g) { tot += this.pop[c]; if (this.land[c]) area += this.area[c]; }
        for (const c of g) this.pop[c] = this.land[c] && area > 0 ? tot * this.area[c] / area : 0;
      }
    }
    return k;
  }

  /* What the page draws. */
  snapshot() {
    return { n: this.n, P: this.P, verts: this.verts, polys: this.polys, geo: Int32Array.from(this.geo), pop: Float64Array.from(this.pop),
      area: this.area, land: this.land, stats: this.stats, credits: this.credits, year: this.year,
      gdpZ: this.gdpZ ? Float64Array.from(this.gdpZ) : null, tech: this.agTech ? this.agTech.slice() : [],
      price: this.fr && this.fr.price ? Array.from(this.fr.price.food) : [], orePrice: this.fr && this.fr.price ? Array.from(this.fr.price.ore) : [],
      food: this.fr ? Array.from(this.fr.food) : [], short: this.fr ? Array.from(this.fr.short) : [], ore: this.fr ? Array.from(this.fr.ore) : [],
      mines: this.fr ? this.fr.mines : [], cargo: this.fr ? [...this.fr.lines].map(([id, f]) => ({ id, food: f.food, ore: f.ore, load: f.load, toll: f.toll, earned: f.earned })) : [],
      runs: this.fr ? this.fr.runs : [],
      hubs: this.hubs || [],
      home: this.home != null ? this.towns[this.home].p : null, homeName: this.home != null ? this.towns[this.home].name : "", tier: this.tier || 0,
      charterKm: this.home != null ? TIERS[this.tier].km : Infinity, charterReady: this.home != null && this.charterReady(), charterFee: this.home != null ? this.charterFee() : 0,
      nextRiders: this.home != null && TIERS[this.tier + 1] ? TIERS[this.tier + 1].riders : 0, index: this.index || 1 };
  }
}

/* What laying a stretch from a to b costs, at start prices: km, ×COST_WATER
   over water, more over rough ground, and ×(1 + density/URBAN_COST) through
   a city (densAt, optional). Needs only world.{V, adj, water, rough}. */
export function trackCost(W, a, b, densAt) {
  const steps = Math.max(2, Math.ceil(arc(a, b) * R / 4));
  let cost = 0, g = nearestCell(W, a, -1);
  for (let k = 0; k < steps; k++) {
    const p = slerp(a, b, (k + 0.5) / steps); g = nearestCell(W, p, g);
    cost += (W.water[g] ? P_.COST_WATER : 1) * Math.sqrt(W.rough[g]) * (densAt ? 1 + densAt(p) / P_.URBAN_COST : 1);
  }
  return P_.COST_KM * cost * arc(a, b) * R / steps;
}

/* ---------------------------------------------------------------- helpers */
function nearTown(sim, p) {
  let best = -2, nm = ""; for (const t of sim.towns) { const d = t.p[0] * p[0] + t.p[1] * p[1] + t.p[2] * p[2]; if (d > best) { best = d; nm = t.name; } }
  return nm ? " near " + nm : "";
}
function fmtN(x) { return x >= 1e6 ? (x / 1e6).toFixed(x >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : x >= 1e3 ? Math.round(x / 1e3) + "k" : Math.round(x) + ""; }
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
/* A line's legs, as pairs of stop indices: each stop to the next, and on a loop the last back to the first. */
export function legs(L) {
  const g = []; for (let k = 0; k + 1 < L.stops.length; k++) g.push([k, k + 1]);
  if (L.loop && L.stops.length >= 3) g.push([L.stops.length - 1, 0]);
  return g;
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
