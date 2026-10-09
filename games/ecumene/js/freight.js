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
  FOOD_Y: 18, FOOD_GROWTH: 0.015,      // units per yield-km², ×(1 + FOOD_GROWTH·year)
  FARM_DENS: 300,                      // a zone has no farms left at this density
  ORE_PER: 0.25, MINE_KM: 45, MINE_STOP_KM: 12,
  ROAD_KM: 95, HAUL: 110, RAIL_COST: 0.12, CMAX: 600,
  SEA_COST: 0.3, SEA_KEEP: 4,          // shipping between ports: cost per km, and it keeps 4× as well as a cart
  WAGON_CAP: 40e3, FREIGHT_RATE: 1.2e-5, STOP_SNAP_KM: 14,
  FOOD_FLOOR: 0.3,                     // a starving town's ceiling is this share of its fed one
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
  return sim.area[i] * farm * sim.world.yieldKm[sim.geo[i]] * agDens(sim.year);
}

export function freight(sim) {
  const W = sim.world, T = sim.towns, D = W.deposits, n = sim.n, nt = T.length;
  const out = { food: new Float64Array(nt).fill(1), ore: new Float64Array(nt), short: new Float64Array(nt), need: new Float64Array(nt), local: new Float64Array(nt),
    lines: new Map(), revenue: 0, mines: [], moved: { food: 0, ore: 0 } };
  if (!nt) return out;
  const zt = sim.zoneTown, yieldNow = F_.FOOD_Y * (1 + F_.FOOD_GROWTH * sim.year);
  // food: grown and eaten, town by town
  const grown = new Float64Array(nt), eat = new Float64Array(nt);
  for (let i = 0; i < n; i++) {
    if (!sim.land[i] || zt[i] < 0) continue;
    const dens = sim.pop[i] / Math.max(1e-6, sim.area[i]), farm = Math.max(0, 1 - dens / F_.FARM_DENS);
    const need = farmers(sim, i), staffed = need > 0 ? Math.min(1, sim.pop[i] / (need * F_.STAFFED)) : 0;
    grown[zt[i]] += sim.area[i] * farm * W.yieldKm[sim.geo[i]] * yieldNow * staffed;
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
    adj[a].push([b, km * F_.SEA_COST, -2]); adj[b].push([a, km * F_.SEA_COST, -2]);
  }
  out.ports = ports;
  // rail: each wagon line, as the run of nodes its stops fall in
  const runs = [];   // { line, a, b, km, cap, load, food, ore }
  sim.lines.forEach((L) => {
    if (!(L.wagons > 0) || L.stops.length < 2) return;
    const seq = [];
    for (const s of L.stops) {
      let v = -1;
      D.forEach((d, k) => { if (v < 0 && arc(s, d.p) * R < F_.MINE_STOP_KM) v = nt + k; });
      if (v < 0) { const z = sim.zoneAt(s); if (sim.land[z] && zt[z] >= 0) v = zt[z]; }
      seq.push(v);
    }
    let km = 0, last = -1, lastStop = null;
    L.stops.forEach((s, k) => {
      if (lastStop) km += arc(lastStop, s) * R;
      lastStop = s;
      const v = seq[k]; if (v < 0) return;
      if (last >= 0 && v !== last) {
        const r = { line: L.id, a: last, b: v, km, cap: L.wagons * F_.WAGON_CAP, load: 0, food: 0, ore: 0 }, id = runs.length;
        runs.push(r); adj[last].push([v, km * F_.RAIL_COST, id]); adj[v].push([last, km * F_.RAIL_COST, id]);
      }
      if (v !== last) { last = v; km = 0; }
    });
  });
  // supply and demand, per commodity
  const supply = { food: new Float64Array(N), ore: new Float64Array(N) }, want = { food: new Float64Array(N), ore: new Float64Array(N) };
  for (let t = 0; t < nt; t++) {
    const need = eat[t]; out.need[t] = need; out.local[t] = grown[t];
    if (grown[t] >= need) supply.food[t] = grown[t] - need; else want.food[t] = need - grown[t];
    want.ore[t] = F_.ORE_PER * eat[t];
  }
  D.forEach((d, k) => { if (mineOn[k]) supply.ore[nt + k] = d.rich; out.mines.push({ kind: d.kind, p: d.p, on: mineOn[k], rich: d.rich }); });
  const flows = [];  // { c, src, dst, x, delta, runs: [ids] }
  for (const c of ["food", "ore"]) {
    // every short node's cheapest paths, then every (short, source) pair served cheapest
    // first: a greedy min-cost allocation. (Biggest shortfall first let two big cities
    // drain a breadbasket by road before the city on a rail line from it was asked.)
    const left = supply[c].slice(), rest = want[c].slice(), pairs = [];
    for (let j = 0; j < N; j++) {
      if (!(want[c][j] > 0)) continue;
      const sp = paths(adj, j, N);
      for (let i = 0; i < N; i++) if (supply[c][i] > 0 && i !== j && sp.cost[i] < F_.CMAX) pairs.push([sp.cost[i], j, i, sp]);
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [, j, i, sp] of pairs) {
      if (rest[j] <= 0 || left[i] <= 0) continue;
      const delta = Math.exp(-sp.road[i] / F_.HAUL - sp.rail[i] / (F_.HAUL * 8) - sp.sea[i] / (F_.HAUL * F_.SEA_KEEP)), x = Math.min(left[i], rest[j] / delta);
      if (x <= 0) continue;
      left[i] -= x; rest[j] -= x * delta;
      flows.push({ c, src: i, dst: j, x, delta, runs: sp.runsTo(i) });
    }
  }
  // rail capacity: an overfull run scales down every flow through it
  for (const f of flows) for (const r of f.runs) runs[r].load += f.x;
  for (const f of flows) { let k = 1; for (const r of f.runs) if (runs[r].load > runs[r].cap) k = Math.min(k, runs[r].cap / runs[r].load); f.x *= k; }
  for (const r of runs) r.load = 0;
  const got = { food: new Float64Array(N), ore: new Float64Array(N) };
  for (const f of flows) {
    got[f.c][f.dst] += f.x * f.delta;
    for (const r of f.runs) { runs[r].load += f.x; runs[r][f.c] += f.x; out.revenue += f.x * runs[r].km * F_.FREIGHT_RATE; }
    if (f.runs.length) out.moved[f.c] += f.x;
  }
  for (let t = 0; t < nt; t++) {
    const need = out.need[t];
    out.food[t] = need > 0 ? Math.min(1, (grown[t] + got.food[t]) / need) : 1;
    out.short[t] = Math.max(0, need - grown[t] - got.food[t]);
    out.ore[t] = want.ore[t] > 0 ? Math.min(1, got.ore[t] / want.ore[t]) : 0;
  }
  for (const r of runs) {
    const s = out.lines.get(r.line) || { food: 0, ore: 0, load: 0, cap: r.cap };
    s.food += r.food; s.ore += r.ore; s.load = Math.max(s.load, r.load / r.cap); out.lines.set(r.line, s);
  }
  out.runs = runs.map((r) => ({ line: r.line, a: node[r.a], b: node[r.b], load: r.load, cap: r.cap }));
  return out;
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
function paths(adj, j, N) {
  const cost = new Float64Array(N).fill(Infinity), road = new Float64Array(N), rail = new Float64Array(N), sea = new Float64Array(N), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  cost[j] = 0;
  for (;;) {
    let u = -1, best = Infinity; for (let v = 0; v < N; v++) if (!done[v] && cost[v] < best) { best = cost[v]; u = v; }
    if (u < 0) break; done[u] = 1;
    for (const [v, c, run] of adj[u]) {
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
