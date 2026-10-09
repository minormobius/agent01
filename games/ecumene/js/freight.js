/* Ecumene — commodities and freight. Run once a year, between the
   passengers and the growth.

   FOOD is grown on every zone's open country (mappa's cell: livability ×
   rain × warmth, js/world.js `yieldKm`) at a yield that improves with the
   years; a zone loses its farms as it fills with city (none past 300/km²).
   Everyone eats one unit a year. ORE is mined at the geology's deposits
   (js/world.js `deposits`) once someone is near enough to work them; a
   town's industry wants ORE_PER units a person.

   Every land zone belongs to its nearest town, so a town is a region: its
   own farms feed it first. What's left over, and what's short, is traded
   between NODES (the towns and the working mines) over two networks:
     road  between any two nodes within ROAD_KM that no sea divides; cost
           is the distance, and the cargo that arrives decays as
           exp(−cost/HAUL): carts are slow, and food spoils.
     rail  the player's lines that carry WAGONS: each run of a line between
           the nodes its stops fall in, at RAIL_COST of the distance, but
           with a capacity, WAGON_CAP units a year per wagon.
     sea   ships between any two PORTS (towns on the open sea), at SEA_COST
           of the distance, keeping cargo SEA_KEEP× as well as a cart. Nobody's
           monopoly: a coastal city can feed itself across the water, so the
           player's freight is the business of the interior.
   Every (short node, source) pair is served in order of cost, cheapest
   first, until the shortfall is met or the source runs dry (a greedy
   min-cost allocation). Then any rail run carrying more than its capacity scales
   down every flow through it. What arrives sets the town's food
   satisfaction (which caps its zones' ceilings in js/sim.js grow) and its
   ore satisfaction (which draws jobs to it). Rail freight earns its fare
   per unit-km.

   So a hungry city is a city a line can feed: a freight line from a
   breadbasket lifts its ceiling, and the selftest measures that. */
import { R, nearestCell } from "./world.js";
import { arc } from "./sim.js";

export const F_ = {
  FOOD_Y: 20, FOOD_GROWTH: 0.015,      // units per yield-km², ×(1 + FOOD_GROWTH·year)
  FARM_DENS: 300,                      // a zone has no farms left at this density
  ORE_PER: 0.25, MINE_KM: 45, MINE_STOP_KM: 12,
  ROAD_KM: 70, HAUL: 65, RAIL_COST: 0.12, CMAX: 600,
  SEA_COST: 0.5, SEA_KEEP: 4, SEA_KM: 350, RAIL_KEEP: 80,   // a train keeps cargo 80× as well as a cart: it is there in hours   // coastal shipping between ports up to SEA_KM apart: cost per km, and it keeps 4× as well as a cart
  WAGON_CAP: 40e3, STOP_SNAP_KM: 14,
  // the market (prices in units of a normal year's food price): what a unit costs to send a km
  // by cart, by ship and by rail (the line's tariff), and the ₵ a price unit is worth
  ROAD_P: 0.006, SEA_P: 0.002, RAIL_P: 0.0008, CREDIT: 0.005, MIN_KEEP: 0.03,
  EPS_FOOD: 0.4, EPS_ORE: 0.8,         // how far demand falls as the price rises: need × price^−EPS
  P_MIN: 0.2, P_MAX: 20,               // unsold, a unit is still worth P_MIN (stores, fodder); no price passes P_MAX
  TAU: 0.04, ROUNDS: 160, TOLL0: 0.05, TOLL_POW: 16,   // a run's toll: TOLL0 × (load / room)^TOLL_POW
  PULL_EPS: 0.2, PULL_MIN: 0.85, PULL_MAX: 1.3, PULL_EASE: 0.3,   // land farmed ∝ price^PULL_EPS, within these, eased in at this rate a year
  FOOD_FLOOR: 0.3,                     // a starving town's ceiling is this share of its fed one
  FOOD_STALL: 0.6,                     // and its growth slows with hunger, stopping at this share fed
  AG0: 22, AG_DECAY: 90, AG_FLOOR: 3,  // farmers a yield-km² needs: AG0 until AG_FROM, then falling (machines) to AG_FLOOR
  AG_FROM: 60,                         // the machines arrive with the player (the end of the warm-up)
  STAFFED: 0.7,                        // a farm at this share of its farmers grows all it can
};

/* Farming takes people. A zone's open country needs `farmers(sim, i)` hands
   to grow all it can; fewer grow less. The need falls with the years as the
   farms mechanize, which is what empties the countryside into the cities. */
export function agDens(year) { return Math.max(F_.AG_FLOOR, F_.AG0 * Math.exp(-Math.max(0, year - F_.AG_FROM) / F_.AG_DECAY)); }
export function farmers(sim, i) {
  const dens = sim.pop[i] / Math.max(1e-6, sim.area[i]), farm = Math.max(0, 1 - dens / F_.FARM_DENS);
  return sim.area[i] * farm * sim.world.yieldKm[sim.geo[i]] * agDens(sim.year) * pull(sim, i);
}
/* How much of its land a zone farms, from what food fetched in its town last
   year (eased in over a few years): dear food puts more land under the
   plough and more people on it, cheap food lets fields go and sends their
   people to the city. 1 at the normal price. */
export function pull(sim, i) {
  const t = sim.zoneTown ? sim.zoneTown[i] : -1;
  return sim.farmPull && t >= 0 && sim.farmPull[t] != null ? sim.farmPull[t] : 1;
}

export function freight(sim) {
  const W = sim.world, T = sim.towns, D = W.deposits, n = sim.n, nt = T.length;
  const out = { food: new Float64Array(nt).fill(1), ore: new Float64Array(nt), short: new Float64Array(nt), need: new Float64Array(nt), local: new Float64Array(nt),
    lines: new Map(), revenue: 0, mines: [], moved: { food: 0, ore: 0 } };
  if (!nt) return out;
  const zt = sim.zoneTown, yieldNow = F_.FOOD_Y * (1 + F_.FOOD_GROWTH * sim.year);
  // the farms answer last year's prices
  const last = sim.fr && sim.fr.price ? sim.fr.price.food : null, prev = sim.farmPull || [];
  sim.farmPull = T.map((t, k) => {
    const target = last && last[k] != null ? Math.min(F_.PULL_MAX, Math.max(F_.PULL_MIN, Math.pow(last[k], F_.PULL_EPS))) : 1;
    return prev[k] != null ? prev[k] + F_.PULL_EASE * (target - prev[k]) : target;
  });
  // food: grown and eaten, town by town
  const grown = new Float64Array(nt), eat = new Float64Array(nt);
  for (let i = 0; i < n; i++) {
    if (!sim.land[i] || zt[i] < 0) continue;
    const dens = sim.pop[i] / Math.max(1e-6, sim.area[i]), farm = Math.max(0, 1 - dens / F_.FARM_DENS);
    const need = farmers(sim, i), staffed = need > 0 ? Math.min(1, sim.pop[i] / (need * F_.STAFFED)) : 0;
    grown[zt[i]] += sim.area[i] * farm * W.yieldKm[sim.geo[i]] * yieldNow * staffed * pull(sim, i);
    eat[zt[i]] += sim.pop[i];
  }
  // the mines that are worked: a settled zone near them, or a freight stop on them
  const stops = [];
  for (const L of sim.lines) if ((L.wagons || 0) > 0) for (const s of L.stops) stops.push(s);
  const mineOn = D.map((d) => {
    if (stops.some((s) => arc(s, d.p) * R < F_.MINE_STOP_KM)) return true;
    for (const t of T) if (t.pop > 2000 && arc(t.p, d.p) * R < F_.MINE_KM) return true;
    return false;
  });
  // nodes: towns 0..nt-1, then mines
  const node = T.map((t) => t.p).concat(D.map((d) => d.p)), N = node.length;
  const roads = roadEdges(sim, node);
  const adj = Array.from({ length: N }, () => []);
  for (const [a, b, km] of roads) { adj[a].push([b, km, -1]); adj[b].push([a, km, -1]); }
  // the sea: every coastal town is a port, and ships run between any two (nobody's monopoly)
  const ports = []; T.forEach((t, k) => { if (isPort(W, t.p)) ports.push(k); });
  for (let x = 0; x < ports.length; x++) for (let y = x + 1; y < ports.length; y++) {
    const a = ports[x], b = ports[y], km = arc(node[a], node[b]) * R;
    if (km > F_.SEA_KM) continue;
    adj[a].push([b, km * F_.SEA_COST, -2]); adj[b].push([a, km * F_.SEA_COST, -2]);
  }
  out.ports = ports;
  // rail: each wagon line, as the run of nodes its stops fall in
  const runs = [];   // { line, a, b, km, cap, load, food, ore, earned }
  sim.lines.forEach((L) => {
    if (!(L.wagons > 0) || L.stops.length < 2) return;
    const seq = [], ring = L.loop && L.stops.length >= 3 ? L.stops.concat([L.stops[0]]) : L.stops;   // a loop runs on round to its first stop
    for (const s of ring) {
      let v = -1;
      D.forEach((d, k) => { if (v < 0 && arc(s, d.p) * R < F_.MINE_STOP_KM) v = nt + k; });
      if (v < 0) { const z = sim.zoneAt(s); if (sim.land[z] && zt[z] >= 0) v = zt[z]; }
      seq.push(v);
    }
    let km = 0, last = -1, lastStop = null;
    ring.forEach((s, k) => {
      if (lastStop) km += arc(lastStop, s) * R;
      lastStop = s;
      const v = seq[k]; if (v < 0) return;
      if (last >= 0 && v !== last) {
        const r = { line: L.id, a: last, b: v, km, cap: L.wagons * F_.WAGON_CAP, load: 0, food: 0, ore: 0, earned: 0 }, id = runs.length;
        runs.push(r); adj[last].push([v, km * F_.RAIL_COST, id]); adj[v].push([last, km * F_.RAIL_COST, id]);
      }
      if (v !== last) { last = v; km = 0; }
    });
  });
  // supply and demand, per commodity: harvests and mines sell, towns buy
  const supply = { food: new Float64Array(N), ore: new Float64Array(N) }, want = { food: new Float64Array(N), ore: new Float64Array(N) };
  for (let t = 0; t < nt; t++) {
    out.need[t] = eat[t]; out.local[t] = grown[t];
    supply.food[t] = grown[t]; want.food[t] = eat[t]; want.ore[t] = F_.ORE_PER * eat[t];
  }
  D.forEach((d, k) => { if (mineOn[k]) supply.ore[nt + k] = d.rich; out.mines.push({ kind: d.kind, p: d.p, on: mineOn[k], rich: d.rich }); });
  const flows = [];  // { c, src, dst, x, d, cost, runs: [ids] }
  // every route a seller has to a buyer: the cheapest, and (if that rides a line) the cheapest without one
  const routes = Array.from({ length: N }, () => []);
  for (let j = 0; j < N; j++) {
    if (!(want.food[j] > 0 || want.ore[j] > 0)) continue;
    const all = paths(adj, j, N, false); let road = null;
    for (let i = 0; i < N; i++) {
      if (i === j || !(supply.food[i] > 0 || supply.ore[i] > 0) || !(all.cost[i] < F_.CMAX)) continue;
      const add = (sp) => { const r = route(sp, i, j); if (r.d > F_.MIN_KEEP) routes[i].push(r); };
      add(all);
      if (all.rail[i] > 0) { road = road || paths(adj, j, N, true); if (road.cost[i] < F_.CMAX) add(road); }
    }
  }
  // what a full run's last unit of room is worth, per commodity: the congestion toll, and the line's margin.
  // Food and ore share the wagons: ore is sold into the room food left.
  const mu = { food: new Float64Array(runs.length), ore: new Float64Array(runs.length) }, used = new Float64Array(runs.length);
  out.price = {};
  for (const c of ["food", "ore"]) {
    const m = market(c, supply[c], want[c], routes, runs, mu[c], N, used);
    for (const f of m.flows) for (const r of f.runs) used[r] += f.x;
    out.price[c] = m.p;
    for (const f of m.flows) flows.push(f);
    if (c === "food") out.spare = m.left.slice(0, nt);   // what found no buyer: food a new line could sell
  }
  // rail capacity: the tolls ration a full run; what overshoot is left scales down every flow through it
  for (const f of flows) for (const r of f.runs) runs[r].load += f.x;
  for (const f of flows) { let k = 1; for (const r of f.runs) if (runs[r].load > runs[r].cap) k = Math.min(k, runs[r].cap / runs[r].load); f.x *= k; }
  for (const r of runs) r.load = 0;
  const got = { food: new Float64Array(N), ore: new Float64Array(N) };
  for (const f of flows) {
    got[f.c][f.dst] += f.x * f.d;
    // the line earns its tariff on the km it carries, and the toll where it is full
    for (const r of f.runs) { runs[r].load += f.x; runs[r][f.c] += f.x; const e = f.x * (runs[r].km * F_.RAIL_P + mu[f.c][r]) * F_.CREDIT; runs[r].earned += e; out.revenue += e; }
    if (f.runs.length) out.moved[f.c] += f.x;
  }
  for (let t = 0; t < nt; t++) {
    const need = out.need[t];
    out.food[t] = need > 0 ? Math.min(1, got.food[t] / need) : 1;
    out.short[t] = Math.max(0, need - got.food[t]);
    out.ore[t] = want.ore[t] > 0 ? Math.min(1, got.ore[t] / want.ore[t]) : 0;
  }
  for (const r of runs) {
    const s = out.lines.get(r.line) || { food: 0, ore: 0, load: 0, cap: r.cap, earned: 0, toll: 0 };
    s.food += r.food; s.ore += r.ore; s.load = Math.max(s.load, r.load / r.cap); s.earned += r.earned; s.toll = Math.max(s.toll, mu.food[runs.indexOf(r)], mu.ore[runs.indexOf(r)]); out.lines.set(r.line, s);
  }
  out.flows = flows; out.tolls = mu;
  out.runs = runs.map((r) => ({ line: r.line, a: node[r.a], b: node[r.b], load: r.load, cap: r.cap }));
  return out;
}

/* A route from seller i to buyer j along a path: what a unit costs to send
   (carts, ships, and the line's tariff), the share of it that arrives (food
   spoils on a cart, less on a ship, little on a train), and the runs it rides. */
function route(sp, i, j) {
  return { j, c: F_.ROAD_P * sp.road[i] + F_.RAIL_P * sp.rail[i] + F_.SEA_P * sp.sea[i],
    d: Math.exp(-sp.road[i] / F_.HAUL - sp.rail[i] / (F_.HAUL * F_.RAIL_KEEP) - sp.sea[i] / (F_.HAUL * F_.SEA_KEEP)), runs: sp.runsTo(i) };
}

/* The market for one commodity: a price at every buyer. Each round every
   seller spreads what it has over its buyers (and over keeping it unsold,
   worth P_MIN) by a logit on the NETBACK, what a unit fetches there after
   the haul, the spoilage and the tolls: price × arriving share − cost −
   tolls. A town selling to itself has no haul. Each buyer's price is the
   one at which its people would buy exactly what arrives (demand need ×
   price^−EPS, so food is a necessity: it barely falls when dear), and each
   run of a line charges a toll that climbs steeply as it fills (TOLL0 at
   its wagons, ×20 at 120%), so a full line is rationed by price and keeps
   the gap between its ends: that is its margin. The flows are averaged
   over the rounds (the method of successive averages, as in traffic
   assignment): chasing each round's best buyer outright swings everything
   back and forth and never settles, and so did a toll that rose and fell
   with each round's load. What's left is spatial price equilibrium, near
   enough: where goods flow, the dear end costs the cheap end plus the way
   between. (The old allocation, cheapest pair first, found roughly the
   same flows; it threw the prices away, and with them any reason to pay
   for scarcity.) */
function market(c, S, need, routes, runs, mu, N, used) {
  const eps = c === "food" ? F_.EPS_FOOD : F_.EPS_ORE, p = new Float64Array(N).fill(1), A = new Float64Array(N), load = new Float64Array(runs.length);
  const sellers = []; for (let i = 0; i < N; i++) if (S[i] > 0) sellers.push(i);
  const opts = sellers.map((i) => (need[i] > 0 ? [{ j: i, c: 0, d: 1, runs: [] }] : []).concat(routes[i].filter((r) => need[r.j] > 0)));
  const nb = (r) => { let t = p[r.j] * r.d - r.c; for (const k of r.runs) t -= mu[k]; return t; };
  const x = opts.map((o) => new Float64Array(o.length));   // the flows, averaged over the rounds
  const tally = () => { A.fill(0); load.fill(0); sellers.forEach((i, s) => opts[s].forEach((r, k) => { A[r.j] += x[s][k] * r.d; for (const q of r.runs) load[q] += x[s][k]; })); };
  // a run's toll climbs steeply as it fills: next to nothing below its wagons, the whole price gap past them
  const tolls = () => { for (let k = 0; k < runs.length; k++) mu[k] = F_.TOLL0 * Math.pow((load[k] + used[k]) / runs[k].cap, F_.TOLL_POW); };
  const clear = () => { for (let j = 0; j < N; j++) if (need[j] > 0) p[j] = Math.min(F_.P_MAX, Math.max(F_.P_MIN, Math.pow(Math.max(1e-9, A[j] / need[j]), -1 / eps))); };
  for (let it = 0; it < F_.ROUNDS; it++) {
    if (it) {
      tally(); clear();
      tolls();
    }
    // every seller's answer to these prices, folded into the average (the method of successive averages)
    const a = 1 / (it + 1);
    sellers.forEach((i, s) => {
      const o = opts[s], v = o.map(nb); let m = F_.P_MIN; for (const y of v) if (y > m) m = y;
      const tau = F_.TAU * Math.max(1, m), w = v.map((y) => Math.exp((y - m) / tau)); let W = Math.exp((F_.P_MIN - m) / tau); for (const y of w) W += y;
      for (let k = 0; k < o.length; k++) x[s][k] = (1 - a) * x[s][k] + a * S[i] * w[k] / W;
    });
  }
  tally(); clear(); tolls();
  const flows = [], left = new Float64Array(N);
  sellers.forEach((i, s) => {
    let sold = 0;
    opts[s].forEach((r, k) => { const v = x[s][k]; if (v <= 1e-9) return; sold += v; flows.push({ c, src: i, dst: r.j, x: v, d: r.d, cost: r.c, runs: r.runs }); });
    left[i] = S[i] - sold;
  });
  // a seller that isn't a buyer (a mine) is quoted what its best buyer pays it
  sellers.forEach((i, s) => { if (!(need[i] > 0)) { let m = 0; for (const r of opts[s]) m = Math.max(m, nb(r)); p[i] = m; } });
  return { p, flows, left };
}

/* A port: a town whose ground touches the open sea. */
function isPort(W, p) {
  const g = nearestCell(W, p, -1);
  return W.water[g] === 1 || W.adj[g].some((j) => W.water[j] === 1);
}

/* Road links between nodes: within ROAD_KM, and no open sea on the way.
   Kept until the nodes change. */
function roadEdges(sim, node) {
  const key = node.length + ":" + (node[0] || []).join();
  if (sim._roads && sim._roads.key === key) return sim._roads.edges;
  const W = sim.world, edges = [];
  for (let a = 0; a < node.length; a++) for (let b = a + 1; b < node.length; b++) {
    const km = arc(node[a], node[b]) * R; if (km > F_.ROAD_KM) continue;
    let wet = 0, g = nearestCell(W, node[a], -1);
    for (let k = 1; k < 8; k++) { g = nearestCell(W, slerp(node[a], node[b], k / 8), g); if (W.water[g] === 1) wet++; }
    if (wet <= 1) edges.push([a, b, km]);
  }
  sim._roads = { key, edges };
  return edges;
}

/* Cheapest paths from j over roads and rail, with the road and the rail
   cost of each split out (they decay cargo differently), and the rail runs
   on the way. Node counts are small (tens), so a plain O(N²) Dijkstra. */
function paths(adj, j, N, noRail) {
  const cost = new Float64Array(N).fill(Infinity), road = new Float64Array(N), rail = new Float64Array(N), sea = new Float64Array(N), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  cost[j] = 0;
  for (;;) {
    let u = -1, best = Infinity; for (let v = 0; v < N; v++) if (!done[v] && cost[v] < best) { best = cost[v]; u = v; }
    if (u < 0) break; done[u] = 1;
    for (const [v, c, run] of adj[u]) {
      if (noRail && run >= 0) continue;
      const nc = cost[u] + c;
      if (nc < cost[v]) { cost[v] = nc; prev[v] = u; via[v] = run; road[v] = road[u] + (run === -1 ? c : 0); rail[v] = rail[u] + (run >= 0 ? c : 0); sea[v] = sea[u] + (run === -2 ? c : 0); }
    }
  }
  return { cost, road, rail, sea, runsTo(i) { const r = []; for (let v = i; v !== j && v >= 0; v = prev[v]) if (via[v] >= 0) r.push(via[v]); return r; } };
}
function slerp(a, b, t) {
  const w = arc(a, b); if (w < 1e-9) return a.slice();
  const s = Math.sin(w), p = Math.sin((1 - t) * w) / s, q = Math.sin(t * w) / s;
  return [p * a[0] + q * b[0], p * a[1] + q * b[1], p * a[2] + q * b[2]];
}
