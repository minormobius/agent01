/* Ecumene — the simulation's thread. The page sends lines and asks for
   years; a year (demand over the whole network, growth, the occasional
   rebuild of the mesh) takes tens to hundreds of ms, which would stutter
   the globe on the main thread. */
import "../../orb/js/sphere.js";
import { makeWorld } from "./world.js";
import { Sim, P_ } from "./sim.js";

let sim = null, seq = 0;
function snap() {
  const s = sim.snapshot(), off = new Int32Array(s.n + 1);
  let tot = 0; for (let i = 0; i < s.n; i++) { off[i] = tot; tot += s.polys[i].length; } off[s.n] = tot;
  const ring = new Int32Array(tot); for (let i = 0, k = 0; i < s.n; i++) for (const v of s.polys[i]) ring[k++] = v;
  return { n: s.n, P: s.P, verts: s.verts, off, ring, geo: s.geo, pop: s.pop, area: s.area, land: s.land, stats: s.stats, credits: s.credits, year: s.year, seq, home: s.home, homeName: s.homeName, tier: s.tier, charterKm: s.charterKm, charterReady: s.charterReady,
    charterFee: s.charterFee, nextRiders: s.nextRiders, index: s.index,
    u: sim.u ? Float64Array.from(sim.u) : null, gdpZ: s.gdpZ, K: sim.K ? Float64Array.from(sim.K) : null, lastTown: sim.lastTown,
    events: sim.events, towns: sim.towns.map((t, k) => ({ name: t.name, p: t.p, pop: t.pop, rural: t.rural || 0, gdp: t.gdp || 0, food: s.food[k] ?? 1, short: s.short[k] || 0, ore: s.ore[k] || 0, price: s.price[k] ?? 1, orePrice: s.orePrice[k] ?? 1, tech: s.tech[k] ?? 1 })), nbrs: sim.nbrs,
    mines: s.mines, cargo: s.cargo, runs: s.runs, hubs: s.hubs };
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    const world = makeWorld(m.seed);
    sim = new Sim(world, m.seed);
    sim.warmup();
    if (m.funds > 0) sim.credits = m.funds;   // ?funds= : a sandbox purse
    const W = world;
    self.postMessage({ type: "world", world: { seed: W.seed, N: W.N, V: W.V, adj: W.adj, cells: W.cells, water: W.water, biome: W.biome, rough: W.rough,
      fresh: W.fresh, hab: W.hab, elev: W.elev, yieldKm: W.yieldKm, rivers: W.rivers.map((r) => [r.a, r.b, r.w]) }, P: P_, warmup: P_.WARMUP });
    self.postMessage({ type: "year", snap: snap(), log: sim.log });
  } else if (m.type === "lines") {
    sim.setLines(m.lines); sim.credits -= m.spend || 0; seq = m.seq;
  } else if (m.type === "charter") {
    sim.events = [];
    if (sim.buyCharter()) self.postMessage({ type: "year", snap: snap() });
  } else if (m.type === "step") {
    sim.step();
    self.postMessage({ type: "year", snap: snap() });
  }
};
