/* Ecumene's economy oracle: the game played headless by a few bots, with
   the money curve each one gets. A measurement, not a pass/fail; read it
   after moving any price, fare, cost or rule.

     node games/ecumene/test/economy.mjs [years=40] [seeds=3,11,896933214] [bots=idle,metro,greedy,freight]

   The bots, all building only where the rules let them (sim.canBuild):
     idle     builds nothing: what the world does alone
     metro    a line across the biggest city it can afford and hasn't served
              yet, stops every ~4 km; a train more wherever a ride is ≥90% full
     greedy   metro, and spends every spare coin on trains (frequency sells)
     freight  metro, plus a 4-wagon line from the nearest food surplus to the
              hungriest town it may build in
     sprinkle short lines in the densest cores: two or three stops, 2-5 km,
              wherever no stop is yet within 2 km, one a year if affordable
              (a player's strategy: it printed money under flat fares)
     sprinkle+ the same, buying trains until every short line runs every 3 min
     core     sprinkle+ with four stops each, walking the densest districts
   For each: funds at a few years, net a year, riders, and the PAYBACK of
   the first line (years until what it earned covered what it cost). A game
   where a bot's money compounds without limit, or the first line pays back
   in a year or two, is a game with no economy. */
import { loadEcumene } from "./harness.mjs";
const E = await loadEcumene(), P = E.P_;
const YEARS = +(process.argv[2] || 40);
const SEEDS = (process.argv[3] || "3,11,896933214").split(",").map(Number);
const BOTS = (process.argv[4] || "idle,metro,greedy,freight,sprinkle").split(",");
const f = (x) => Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + "M" : Math.abs(x) >= 1e4 ? Math.round(x / 1e3) + "k" : Math.abs(x) >= 1e3 ? (x / 1e3).toFixed(1) + "k" : Math.round(x) + "";
const pt = (s, i) => [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]];
const may = (s, p) => !s.canBuild || s.canBuild(p);

const trainC = (s) => s.trainCost ? s.trainCost() : P.COST_TRAIN, wagonC = (s) => s.wagonCost ? s.wagonCost() : P.COST_WAGON;
function lineCost(s, stops, trains, wagons) {
  let c = trainC(s) * trains + wagonC(s) * (wagons || 0);
  stops.forEach((p, k) => { c += s.stopCost ? s.stopCost(p) : P.COST_STOP; if (k) c += s.trackCost(stops[k - 1], p); });
  return c;
}
function cityLine(s, served, lines) {
  // clusters of settled zones (≥50/km²) the bot may build in, biggest first; in each,
  // diameters at six headings through the centre, skipping any that runs within
  // 2 km of a line already there for most of its length
  const dens = (i) => s.pop[i] / Math.max(1e-6, s.area[i]), seen = new Uint8Array(s.n), cl = [];
  for (let i = 0; i < s.n; i++) {
    if (seen[i] || !s.land[i] || dens(i) < 50 || !may(s, pt(s, i))) continue;
    const q = [i]; seen[i] = 1;
    for (let h = 0; h < q.length; h++) for (const j of s.nbrs[q[h]]) if (!seen[j] && s.land[j] && dens(j) >= 50 && may(s, pt(s, j))) { seen[j] = 1; q.push(j); }
    cl.push(q);
  }
  cl.sort((a, b) => b.reduce((t, k) => t + s.pop[k], 0) - a.reduce((t, k) => t + s.pop[k], 0));
  const near = (p) => lines.some((L) => L.stops.some((q) => E.arc(p, q) * E.R < 2.5));
  for (const c of cl) {
    if (c.length < 4) continue;
    let cx = 0, cy = 0, cz = 0, w = 0; for (const i of c) { const p = pt(s, i); cx += p[0] * s.pop[i]; cy += p[1] * s.pop[i]; cz += p[2] * s.pop[i]; w += s.pop[i]; }
    const C = [cx / w, cy / w, cz / w], l = Math.hypot(...C), Cn = C.map((x) => x / l);
    let reach = 0; for (const i of c) reach = Math.max(reach, E.arc(Cn, pt(s, i)));
    reach = Math.min(reach, 12 / E.R);   // a line of at most ~20 km: what a player can afford early
    const e1 = norm(cross(Cn, Math.abs(Cn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(Cn, e1);
    for (let k = 0; k < 6; k++) {
      const th = k * Math.PI / 6, d = [Math.cos(th) * e1[0] + Math.sin(th) * e2[0], Math.cos(th) * e1[1] + Math.sin(th) * e2[1], Math.cos(th) * e1[2] + Math.sin(th) * e2[2]];
      const end = (sg) => norm([Cn[0] + sg * reach * 0.8 * d[0], Cn[1] + sg * reach * 0.8 * d[1], Cn[2] + sg * reach * 0.8 * d[2]]);
      const A = end(-1), B = end(1), km = E.arc(A, B) * E.R; if (km < 4) continue;
      const ns = Math.max(2, Math.round(km / 4)), stops = [];
      for (let j = 0; j <= ns; j++) {
        const q = E.slerp(A, B, j / ns), z = s.zoneAt(q); if (!s.land[z]) continue;
        const p = may(s, pt(s, z)) ? pt(s, z) : q;   // a stop at the district's centre, unless that's outside the charter
        if (may(s, p) && (!stops.length || E.arc(stops[stops.length - 1], p) * E.R > 1)) stops.push(p);
      }
      if (stops.length < 3 || !stops.every((p) => may(s, p))) continue;
      if (stops.filter(near).length > stops.length / 2) continue;
      return { stops, zones: c };
    }
  }
  return null;
}
function shortLine(s, lines) {
  const dens = (i) => s.pop[i] / Math.max(1e-6, s.area[i]);
  const taken = (p) => lines.some((L) => L.stops.some((q) => E.arc(p, q) * E.R < 2));
  const order = []; for (let i = 0; i < s.n; i++) if (s.land[i] && dens(i) > 300 && may(s, pt(s, i))) order.push(i);
  order.sort((a, b) => dens(b) - dens(a));
  for (const i of order) {
    const a = pt(s, i); if (taken(a)) continue;
    let best = -1, bd = 0;
    for (const j of s.nbrs[i]) { const b = pt(s, j), km = E.arc(a, b) * E.R; if (s.land[j] && km > 1.5 && km < 5 && dens(j) > bd && may(s, b) && !taken(b)) { bd = dens(j); best = j; } }
    if (best < 0) {   // a neighbour's neighbour, for a bit more length
      for (const j of s.nbrs[i]) for (const k of s.nbrs[j]) { const b = pt(s, k), km = E.arc(a, b) * E.R; if (s.land[k] && k !== i && km > 1.5 && km < 5 && dens(k) > bd && may(s, b) && !taken(b)) { bd = dens(k); best = k; } }
    }
    if (best >= 0) {
      const stops = [a, pt(s, best)];
      if (CHAIN) { // keep walking to the densest untaken neighbour: a short line of 4 stops through the core
        let cur = best;
        for (let k = 0; k < 2; k++) {
          let nx = -1, nd = 0; for (const j of s.nbrs[cur]) { const b = pt(s, j); if (s.land[j] && dens(j) > nd && !stops.some((q) => E.arc(q, b) * E.R < 1.2) && may(s, b) && !taken(b)) { nd = dens(j); nx = j; } }
          if (nx < 0) break; stops.push(pt(s, nx)); cur = nx;
        }
      }
      return { stops };
    }
  }
  return null;
}
let CHAIN = false;
function norm(a) { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function freightLine(s) {
  const fr = s.fr; if (!fr) return null;
  let h = -1; s.towns.forEach((t, k) => { if (fr.short[k] > 20e3 && may(s, t.p) && (h < 0 || fr.short[k] > fr.short[h])) h = k; });
  if (h < 0) return null;
  let b = -1, bd = Infinity;
  s.towns.forEach((t, k) => { if (k === h || fr.local[k] - fr.need[k] < 30e3 || !may(s, t.p)) return; const d = E.arc(t.p, s.towns[h].p); if (d < bd) { bd = d; b = k; } });
  if (b < 0) return null;
  const A = s.towns[b].p, B = s.towns[h].p, stops = [A, B];
  return { stops, key: b + ">" + h };
}

function play(seed, bot) {
  const s = new E.Sim(E.makeWorld(seed), seed); s.warmup();
  const lines = [], served = new Set(), freighted = new Set(), rows = [];
  let id = 1, first = null, spentFirst = 0;
  for (let y = 1; y <= YEARS; y++) {
    if (bot !== "idle") {
      if (s.buyCharter && s.charterReady() && s.credits > s.charterFee() * 1.2) s.buyCharter();
      // trains where full; greedy keeps buying while it can
      for (const L of lines) {
        const st = s.stats.lines && s.stats.lines.find((x) => x.id === L.id);
        const keen = bot === "greedy" || bot === "sprinkle+" || bot === "core";
        if (st && (st.crowd > 0.9 || (keen && st.headway > 3)) && s.credits > trainC(s) * (keen ? 1 : 2)) { L.trains++; s.credits -= trainC(s); }
      }
      CHAIN = bot === "core";
      const c = bot.startsWith("sprinkle") || bot === "core" ? shortLine(s, lines) : cityLine(s, served, lines);
      if (c) {
        const cost = lineCost(s, c.stops, 1, 0);
        if (cost < s.credits) { s.credits -= cost; lines.push({ id: id++, color: "#f00", stops: c.stops, trains: 1, wagons: 0 }); (c.zones || []).forEach((z) => served.add(z)); if (!first) { first = lines[0].id; spentFirst = cost; } }
      }
      if (bot === "freight") {
        const fl = freightLine(s);
        if (fl && !freighted.has(fl.key)) {
          const cost = lineCost(s, fl.stops, 1, 4);
          if (cost < s.credits) { s.credits -= cost; lines.push({ id: id++, color: "#0f0", stops: fl.stops, trains: 1, wagons: 4 }); freighted.add(fl.key); }
        }
      }
      s.setLines(lines);
    }
    s.step();
    // what the first line earned this year, net of its own upkeep
    let firstNet = 0;
    if (first) {
      const st = s.stats.lines.find((x) => x.id === first), L = lines.find((x) => x.id === first);
      let km = 0; for (let k = 0; k + 1 < L.stops.length; k++) km += E.arc(L.stops[k], L.stops[k + 1]) * E.R;
      firstNet = (st ? st.fare : 0) * 365 - (P.TRAIN_UPKEEP * L.trains + P.TRACK_UPKEEP * km) * (s.index || 1);
    }
    rows.push({ y, credits: s.credits, net: (s.stats.fares || 0) - (s.stats.upkeep || 0), cargo: s.stats.cargo || 0, riders: s.stats.riders, pop: s.stats.pop, lines: lines.length,
      trains: lines.reduce((t, L) => t + L.trains, 0), firstNet, tier: s.tier != null ? s.tier : null });
  }
  let cum = 0, payback = null;
  for (const r of rows) { cum += r.firstNet; if (payback == null && first && cum >= spentFirst) payback = r.y; }
  return { rows, payback, spentFirst };
}

const MARK = [1, 3, 5, 10, 20, 30, 40, 60].filter((y) => y <= YEARS);
for (const seed of SEEDS) {
  console.log("\nworld " + seed);
  console.log("  bot      " + MARK.map((y) => ("y" + y).padStart(8)).join("") + "   net/yr@end  riders@end  lines trains  payback");
  for (const bot of BOTS) {
    const t0 = Date.now(), r = play(seed, bot), last = r.rows[r.rows.length - 1];
    console.log("  " + bot.padEnd(8) + MARK.map((y) => ("₵" + f(r.rows[y - 1].credits)).padStart(8)).join("") +
      ("₵" + f(last.net)).padStart(13) + f(last.riders).padStart(12) + String(last.lines).padStart(7) + String(last.trains).padStart(7) +
      (r.payback ? ("  " + r.payback + " yr (₵" + Math.round(r.spentFirst) + ")") : "  —") + (last.tier != null ? "  tier " + last.tier : "") + "  [" + ((Date.now() - t0) / 1000).toFixed(0) + "s]");
  }
}
