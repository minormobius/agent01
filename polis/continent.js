// continent.js — the HINTERLANDS sim at CONTINENT scale: a whole mappa landmass run
// as a natural CLOSED SYSTEM through deep time.
//
// A continent is bounded by ocean, so population, food and development stay inside it —
// nothing is imported from off-map. We solve, per era, over the real mappa cell graph
// (no resampling): the climate sets each cell's fertility, fertility sets a carrying
// capacity, population grows logistically toward it and MIGRATES along the graph toward
// spare capacity (people flow to food; rivers and coasts are cheap corridors). The
// surplus of a thriving population accrues as DEVELOPMENT POINTS — a closed continental
// budget reinvested to raise the productivity (and trade reach) of the places people
// actually live, which lifts the ceiling endogenously.
//
// SEA LEVEL CHASES THE CLIMATE: the active land each tick is `elev >= seaLevel(era)`, and
// seaLevel comes straight from the climate forcing — so a warming that raises the sea
// drowns the coastal lowlands (and their cities), a glacial lowstand exposes shelf and
// grows the continent. Capacity, population and development all breathe with the coast.
//
// Pure + deterministic (same world+seed ⇒ same history); node + browser.

import { buildClimate } from '../mappa/climate-forcing.js';

const yearAt = (f) => Math.round(-12000 + 14100 * (1 - Math.pow(1 - f, 2.5)));

// key a sphere point to match river-segment endpoints against cell centres (both engines
// round identically — see mappa viewer's computeAnthro)
const vkey = (p) => Math.round(p[0] * 2048) + ',' + Math.round(p[1] * 2048) + ',' + Math.round(p[2] * 2048);

// pick the largest connected landmass (a natural closed system). seaRef is low (a glacial
// lowstand) so the continent includes every shelf cell that is EVER land; per era the
// active subset shrinks as the sea rises. Returns the cell subgraph + stable geography.
export function pickContinent(world, { seaRef = -0.032 } = {}) {
  const N = world.N, isLand = (i) => world.elev[i] >= seaRef;
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestArea = -1, nc = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0 || !isLand(s)) continue;
    const c = nc++; comp[s] = c; const q = [s]; let area = 0;
    for (let h = 0; h < q.length; h++) { const i = q[h]; area += world.area[i]; for (const j of world.adj[i]) if (comp[j] < 0 && isLand(j)) { comp[j] = c; q.push(j); } }
    if (area > bestArea) { bestArea = area; best = c; }
  }
  const cells = []; for (let i = 0; i < N; i++) if (comp[i] === best) cells.push(i);
  const n = cells.length, idx = new Map(); cells.forEach((g, l) => idx.set(g, l));
  const adj = cells.map((g) => world.adj[g].filter((j) => idx.has(j)).map((j) => idx.get(j)));
  const elev = Float32Array.from(cells, (g) => world.elev[g]);
  const area = Float32Array.from(cells, (g) => world.area[g]);
  const temp0 = Float32Array.from(cells, (g) => world.temperature[g]);
  const moist0 = Float32Array.from(cells, (g) => world.moisture[g]);
  // coast (adjacent to open ocean → maritime trade access) + river cells (cheap routes)
  const coast = new Uint8Array(n), river = new Uint8Array(n);
  cells.forEach((g, l) => { for (const j of world.adj[g]) if (world.water[j] === 1) { coast[l] = 1; break; } });
  const gk = new Map(); cells.forEach((g, l) => gk.set(vkey(world.V[g]), l));
  for (const r of world.rivers) { const a = gk.get(vkey(r.a)); if (a != null) river[a] = 1; const b = gk.get(vkey(r.b)); if (b != null) river[b] = 1; }
  // undirected edge list (each once) for conservative flow, with a route-ease weight
  const edges = [];
  for (let i = 0; i < n; i++) for (const j of adj[i]) if (j > i) {
    const ease = 1 + (river[i] && river[j] ? 0.9 : 0) + (coast[i] && coast[j] ? 0.5 : 0);
    edges.push([i, j, ease]);
  }
  // normalise area so the mean cell area is 1 (keeps capacity numbers scale-free)
  let sa = 0; for (let i = 0; i < n; i++) sa += area[i]; const aScale = n / (sa || 1);
  const areaN = Float32Array.from(area, (a) => a * aScale);
  return { world, cells, idx, adj, edges, elev, area: areaN, temp0, moist0, coast, river, n, seaRef };
}

// per-era fertility of an ACTIVE land cell from the era climate + geography
function fertilityOf(cont, i, sea, tShift, hum) {
  const T = cont.temp0[i] + tShift, M = Math.max(0, Math.min(1, cont.moist0[i] * hum));
  const tv = Math.max(0, Math.min(1, (T + 4) / 8)) * Math.max(0, Math.min(1, (32 - T) / 12)); // 0 below −4°C, plateau temperate, 0 by 32°C
  const above = Math.max(0, cont.elev[i] - sea);
  let fr = tv * M * Math.max(0, 1 - Math.min(1, above * 1.6));                                 // wet lowland fertile; high/steep not
  if (cont.river[i]) fr += 0.42 * (1 - M) * tv;                                                // river irrigation waters dry land (the Nile)
  return fr;
}

const K = {
  KPP: 52000,      // people per unit (fertility × normalised area) at zero development
  TRADE: 22000,    // extra capacity a coastal/river cell imports (fed from away, dev-scaled)
  DEVK: 1.5,       // capacity multiplier at full development
  DEV_CAP: 3,      // development ceiling per cell (diminishing returns)
  GROWTH: 0.14,    // logistic growth rate
  MIG: 0.18,       // migration relaxation rate per edge
  DEV_GEN: 0.004,  // development points generated per (pop × fertility) per tick
  DEV_SPEND: 0.5,  // fraction of the accumulated points spent each tick
  DEV_EFFECT: 4e-5,// points → development-level conversion (per unit pop-weighted)
  SEED_POP: 8,     // founding population dropped into the best cells at the deglaciation
};

// run the closed-system hinterlands history over the continent.
export function runHinterland(world, climate, cont, { ticks = 180 } = {}) {
  const clim = climate || buildClimate(world, { seed: world.meta.seed });
  const n = cont.n;
  const pop = new Float32Array(n), dev = new Float32Array(n);
  const popH = new Float32Array(ticks * n), devH = new Float32Array(ticks * n), landH = new Uint8Array(ticks * n), fertH = new Float32Array(ticks * n);
  const env = [];
  let devPoints = 0, seeded = false;

  for (let k = 0; k < ticks; k++) {
    const f = k / (ticks - 1), year = yearAt(f), fo = clim.forcingAt(year);
    const sea = fo.seaLevelOffset, tShift = fo.tempOffset, hum = fo.humidity;
    // 1 — active land (sea level chases climate) + fertility + capacity
    const active = new Uint8Array(n), fert = new Float32Array(n), Keff = new Float32Array(n);
    let totalK = 0;
    for (let i = 0; i < n; i++) {
      if (cont.elev[i] < sea) continue;                                     // drowned this era
      active[i] = 1;
      const fr = fertilityOf(cont, i, sea, tShift, hum); fert[i] = fr;
      const base = K.KPP * fr * cont.area[i] * (1 + K.DEVK * dev[i]);
      const trade = K.TRADE * (cont.coast[i] + 0.5 * cont.river[i]) * (1 + dev[i]) * cont.area[i];
      Keff[i] = base + trade; totalK += Keff[i];
    }
    // 2 — seed the founding population once the deglaciating continent can support it
    if (!seeded) {
      const order = []; for (let i = 0; i < n; i++) if (active[i] && fert[i] > 0.25) order.push(i);
      if (order.length > 6) { order.sort((a, b) => fert[b] - fert[a]); for (const i of order.slice(0, Math.max(1, order.length >> 3))) pop[i] = K.SEED_POP; seeded = true; }
    }
    // 3 — drowned cells evacuate their people to surviving neighbours (coastal retreat)
    for (let i = 0; i < n; i++) if (!active[i] && pop[i] > 0) {
      const outs = cont.adj[i].filter((j) => active[j]);
      if (outs.length) { const s = pop[i] / outs.length; for (const j of outs) pop[j] += s; }
      pop[i] = 0;
    }
    // 4 — logistic growth toward the (climate + development) ceiling (clamped stable)
    for (let i = 0; i < n; i++) if (active[i] && pop[i] > 0) {
      const Ki = Math.max(1, Keff[i]);
      pop[i] = Math.max(0, Math.min(2 * Ki, pop[i] + K.GROWTH * pop[i] * (1 - pop[i] / Ki)));
    }
    // 5 — MIGRATION / resource flow: people move down the capacity-pressure gradient along
    //     the graph (rivers/coasts cheap), but NEVER overfill the receiver past its capacity
    //     — so the flow relaxes toward balance instead of overshooting. Edge-based →
    //     conserves population exactly (a closed continent: nobody enters or leaves).
    for (const [i, j, ease] of cont.edges) {
      if (!active[i] || !active[j]) continue;
      const pi = pop[i] / Math.max(1, Keff[i]), pj = pop[j] / Math.max(1, Keff[j]);
      if (pi === pj) continue;
      const hi = pi > pj ? i : j, lo = pi > pj ? j : i;
      const spare = Math.max(0, Keff[lo] - pop[lo]);                       // room in the receiver
      const flow = K.MIG * ease * Math.min(1, Math.abs(pi - pj)) * Math.min(pop[hi] * 0.25, spare * 0.5);
      pop[hi] -= flow; pop[lo] += flow;
    }
    // 6 — DEVELOPMENT POINTS: a closed continental budget. Thriving (populous × fertile)
    //     land generates surplus → points; spend on the places people live, raising their
    //     productivity + trade reach (which lifts capacity next tick).
    let gen = 0; for (let i = 0; i < n; i++) if (active[i]) gen += pop[i] * fert[i] * K.DEV_GEN;
    devPoints += gen;
    const spend = devPoints * K.DEV_SPEND; devPoints -= spend;
    let totalPop = 0; for (let i = 0; i < n; i++) totalPop += pop[i];
    if (totalPop > 1) for (let i = 0; i < n; i++) if (active[i] && pop[i] > 0)
      dev[i] = Math.min(K.DEV_CAP, dev[i] + spend * (pop[i] / totalPop) * K.DEV_EFFECT / Math.max(0.05, cont.area[i]));
    // 7 — record
    let tpop = 0, tdev = 0, lc = 0; for (let i = 0; i < n; i++) { popH[k * n + i] = pop[i]; devH[k * n + i] = dev[i]; landH[k * n + i] = active[i]; fertH[k * n + i] = fert[i]; tpop += pop[i]; if (active[i]) { tdev += dev[i]; lc++; } }
    env.push({ year, seaLevel: sea, tempShift: tShift, humidity: hum, regime: fo.regime,
      land: lc, totalPop: Math.round(tpop), meanDev: lc ? +(tdev / lc).toFixed(3) : 0, totalK: Math.round(totalK), devPoints: Math.round(devPoints) });
  }
  return { ticks, n, env, popH, devH, landH, fertH, cont };
}
