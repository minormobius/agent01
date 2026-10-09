/* Ecumene's invariants, and the claim the game rests on: a line grows the
   city along it.
     node games/ecumene/test/ecumene.selftest.mjs   (~30 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEcumene } from "./harness.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const E = await loadEcumene(), P = E.P_;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- the copy of mappa's engine */
const mine = path.join(here, "../js/mappa-engine.js"), theirs = path.join(here, "../../../mappa/engine.js");
if (fs.existsSync(theirs)) ok(fs.readFileSync(mine, "utf8") === fs.readFileSync(theirs, "utf8"), "js/mappa-engine.js is byte-identical to mappa/engine.js (cp ../../mappa/engine.js js/mappa-engine.js)");

/* ---- the planet */
const w = E.makeWorld(3), w2 = E.makeWorld(3);
ok(w.landCells >= 450 && w.livable >= 250, "a world with room to live");
ok(w.fresh.reduce((a, b) => a + b, 0) === w2.fresh.reduce((a, b) => a + b, 0), "the world is deterministic");
ok([...w.fresh].every((f, i) => w.water[i] === 0 ? f > 0 : f === 0), "fresh water on land only");
{ let riv = 0, dry = 0, nr = 0, nd = 0; for (let i = 0; i < w.N; i++) if (w.water[i] === 0) { if (w.flow[i] > 60) { riv += w.fresh[i]; nr++; } else { dry += w.fresh[i]; nd++; } }
  ok(nr > 0 && riv / nr > 2 * dry / nd, "a river carries more than the rain"); }

/* ---- the sim */
const s = new E.Sim(w, 3); s.warmup();
const pt = (i) => [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]];
{ let A = 0; for (let i = 0; i < s.n; i++) A += s.area[i];
  ok(Math.abs(A / (4 * Math.PI * E.R * E.R) - 1) < 0.01, "zone areas sum to the planet"); }
ok(s.polys.every((p) => p.length >= 3), "every zone is a polygon");
ok(s.nbrs.every((ns, i) => ns.every((j) => s.nbrs[j].includes(i))), "adjacency is symmetric");
ok(s.n > w.N, "the cities have split the mesh");
ok([...s.geo.keys()].every((i) => s.land[i] === (w.water[s.geo[i]] === 0 ? 1 : 0)), "a zone is land when its ground is");
ok(s.pop.every((p, i) => s.land[i] || p === 0), "nobody lives at sea");
{ // a split shares its people three ways, and no child is over the threshold it split at
  const t = new E.Sim(w, 3); let big = 0; for (let i = 0; i < t.n; i++) if (t.land[i] && t.area[i] > 50 && t.area[i] < 300) { big = i; break; }
  for (let i = 0; i < t.n; i++) t.pop[i] = 0;   // alone, so nothing else splits with it
  t.pop[big] = 3 * P.SPLIT_POP - 3; const before = t.pop.reduce((a, b) => a + b, 0), n0 = t.n;
  t.refine();
  ok(t.n === n0 + 2 && Math.abs(t.pop.reduce((a, b) => a + b, 0) - before) < 1e-6, "a split adds two zones and keeps every person");
  let calls = 0; while (t.refine() > 0 && calls < 30) calls++;
  ok(calls < 12 && t.pop.every((p, i) => p <= P.SPLIT_POP || t.area[i] <= P.SPLIT_MIN_AREA || p / t.area[i] <= 60), "splitting settles: a few rounds and every zone is under the line (" + calls + " rounds)");
}
{ // determinism, lines included
  const run = () => { const a = new E.Sim(E.makeWorld(5), 5); a.warmup(); a.setLines([{ id: 1, color: "#f00", stops: [pt(0), pt(1)], trains: 2 }]); for (let k = 0; k < 4; k++) a.step(); return a.pop.reduce((x, y) => x + y, 0); };
  ok(run() === run(), "the same seed and lines give the same planet");
}
{ // track over water costs more than the same length over land
  let land = -1, sea = -1;
  for (let i = 0; i < w.N && (land < 0 || sea < 0); i++) for (const j of w.adj[i]) { if (w.water[i] === 0 && w.water[j] === 0 && land < 0) land = i * 1e4 + j; if (w.water[i] === 1 && w.water[j] === 1 && sea < 0) sea = i * 1e4 + j; }
  const V = (i) => [w.V[3 * i], w.V[3 * i + 1], w.V[3 * i + 2]], per = (k) => { const a = V(Math.floor(k / 1e4)), b = V(k % 1e4); return E.trackCost(w, a, b) / (E.arc(a, b) * E.R); };
  ok(per(sea) > 2 * per(land) / Math.sqrt(3), "water costs more per km");
}

{ // a zone far over its ceiling (a closed line, a sliver after a split) comes down; nothing runs away
  const t = new E.Sim(E.makeWorld(3), 3); t.warmup();
  let z = 0; for (let i = 0; i < t.n; i++) if (t.land[i] && t.pop[i] > 1000) { z = i; break; }
  t.pop[z] = 2000 * Math.max(1, t.K[z]);
  const before = t.pop.reduce((a, b) => a + b, 0), peak = t.pop[z];
  for (let k = 0; k < 4; k++) t.step();
  const after = t.pop.reduce((a, b) => a + b, 0);
  ok(t.pop.every((p) => isFinite(p) && p >= 0), "an overfull zone leaves every population finite");
  ok(after < before * 1.2 && t.pop[z] < peak, "an overfull zone empties rather than explodes (seed 896933214 once ran to NaN this way)");
}
{ // a split hands its people out by the land each child got
  const t = new E.Sim(w, 3); let big = 0; for (let i = 0; i < t.n; i++) if (t.land[i] && t.area[i] > 50 && t.area[i] < 300) { big = i; break; }
  for (let i = 0; i < t.n; i++) t.pop[i] = 0;
  t.pop[big] = 3 * P.SPLIT_POP; const n0 = t.n; t.refine();
  const kids = [big, n0, n0 + 1].filter((c) => t.land[c]), dens = kids.map((c) => t.pop[c] / t.area[c]);
  ok(Math.max(...dens) / Math.min(...dens) < 1.0001, "a split's children start at one density");
}
{ // the chronicle: named towns, and a log that says what happened
  ok(s.towns.length >= P.TOWNS0 && new Set(s.towns.map((t) => t.name)).size === s.towns.length, "every town has its own name");
  ok(s.log.length > 1 && s.log[0].kind === "planet", "the log opens with the planet");
  const t = new E.Sim(E.makeWorld(3), 3); t.warmup(); let seen = 0; for (let k = 0; k < 12; k++) { t.step(); seen += t.events.length; }
  ok(seen > 0 && t.log.length > 9, "a dozen years make the news");
  const u = new E.Sim(E.makeWorld(3), 3); u.warmup(); for (let k = 0; k < 12; k++) u.step();
  ok(t.log.map((e) => e.year + e.text).join("|") === u.log.map((e) => e.year + e.text).join("|"), "the same seed tells the same story");
}

/* ---- a line through the biggest city */
// the home city's densest district (the biggest city, not a farm county)
let a = -1; for (let i = 0; i < s.n; i++) if (s.land[i] && s.zoneTown[i] === s.home && (a < 0 || s.pop[i] / s.area[i] > s.pop[a] / s.area[a])) a = i;
const city = [a], seen = new Set(city);
for (let h = 0; h < city.length; h++) for (const j of s.nbrs[city[h]]) if (!seen.has(j) && s.pop[j] / s.area[j] > 30) { seen.add(j); city.push(j); }
let far = [a, a, -1]; for (const i of city) for (const j of city) { const d = E.arc(pt(i), pt(j)); if (d > far[2]) far = [i, j, d]; }
const km = far[2] * E.R, stops = []; for (let k = 0, ns = Math.max(2, Math.round(km / 4)); k <= ns; k++) stops.push(E.slerp(pt(far[0]), pt(far[1]), k / ns));
ok(city.length >= 8 && km > 8, "the start has a city worth a line (" + city.length + " zones, " + km.toFixed(0) + " km)");
{
  const net0 = s.network(), d0 = s.demand(net0);
  s.setLines([{ id: 1, color: "#f00", stops, trains: 6 }]);
  const net1 = s.network(), d1 = s.demand(net1);
  const near = city.filter((i) => stops.some((p) => E.arc(pt(i), p) * E.R < 4));
  const gain = near.map((i) => d1.access[i] / d0.access[i]).sort((x, y) => x - y);
  ok(d1.boards[0] > 0, "the line has riders");
  ok(gain[0] >= 1 - 1e-9, "a line never lowers anyone's reach");
  ok(gain[gain.length >> 1] > 1.05, "a line raises the reach of the zones it serves (median ×" + gain[gain.length >> 1].toFixed(2) + ")");
  const far0 = s.demand(s.network()); // same again: demand is a pure function of the state
  ok(Math.abs(far0.transit - d1.transit) < 1e-6, "demand is repeatable");
  // fewer trains, fuller rides; and whatever a ride can't carry is stranded
  s.step(); const six = s.stats.lines[0];
  s.setLines([{ id: 1, color: "#f00", stops, trains: 1 }]); s.step();
  const L = s.stats.lines[0];
  ok(Math.abs(six.cap - 6 * L.cap) < 1e-6 * six.cap, "capacity is per train");
  ok(L.headway > 3 * six.headway && L.riders < six.riders, "one train means a long wait, and fewer riders (" + Math.round(L.riders) + " vs " + Math.round(six.riders) + ")");
  ok(Math.abs(L.stranded - Math.max(0, ...L.segs.map((g) => g.load - L.cap))) < 1e-6, "stranded is what the fullest ride can't carry");
  const base = s.network().segs[0], key = base.key; s.crowd.set(key, 1.5);
  const slowed = s.network().segs.find((g) => g.key === key);
  ok(slowed.minutes > base.minutes * 1.5, "an overfull ride is slower (" + base.minutes.toFixed(1) + " → " + slowed.minutes.toFixed(1) + " min)");
}

/* ---- the loop: the same planet with and without a line through its home city, 25 years on.
   One world's 25 years are sensitive to anything (a town founded a year
   apart changes the rest), so it is measured on three. */
function corridor(seed) {
  const s = new E.Sim(E.makeWorld(seed), seed); s.warmup();
  const pt = (i) => [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]];
  let a = -1; for (let i = 0; i < s.n; i++) if (s.land[i] && s.zoneTown[i] === s.home && (a < 0 || s.pop[i] / s.area[i] > s.pop[a] / s.area[a])) a = i;
  const city = [a], seen = new Set(city);
  for (let h = 0; h < city.length; h++) for (const j of s.nbrs[city[h]]) if (!seen.has(j) && s.pop[j] / s.area[j] > 30) { seen.add(j); city.push(j); }
  let far = [a, a, -1]; for (const i of city) for (const j of city) { const d = E.arc(pt(i), pt(j)); if (d > far[2]) far = [i, j, d]; }
  const st = []; for (let k = 0, ns = Math.max(2, Math.round(far[2] * E.R / 4)); k <= ns; k++) st.push(E.slerp(pt(far[0]), pt(far[1]), k / ns));
  return st;
}
function run(seed, st) {
  const t = new E.Sim(E.makeWorld(seed), seed); t.warmup();
  if (st) t.setLines([{ id: 1, color: "#f00", stops: st, trains: 8 }]);
  for (let y = 0; y < 25; y++) t.step();
  const ref = st || corridor(seed);
  let along = 0; for (let i = 0; i < t.n; i++) { const q = [t.P[3 * i], t.P[3 * i + 1], t.P[3 * i + 2]]; if (t.land[i] && ref.some((p) => E.arc(q, p) * E.R < 5)) along += t.pop[i]; }
  return along;
}
{
  const gains = [3, 11, 896933214].map((seed) => { const st = corridor(seed), w0 = run(seed, null), w1 = run(seed, st); return w1 / w0 - 1; });
  const mean = gains.reduce((x, y) => x + y, 0) / gains.length;
  console.log("the loop: people along a line through the home city after 25 years, against none: " + gains.map((g) => "+" + Math.round(100 * g) + "%").join(", ") + " (worlds 3, 11, 896933214)");
  ok(gains.every((g) => g > 0) && mean > 0.12, "a line grows the city along it, in every world: +" + Math.round(100 * mean) + "% on average in 25 years");
}

/* ---- commodities and freight */
{
  const D = w.deposits;
  ok(D.length >= 6 && D.every((d) => w.water[d.cell] === 0 && d.rich > 0), "deposits sit on land and yield ore");
  ok(D.every((d, i) => D.every((e, j) => i === j || !w.adj[d.cell].includes(e.cell))), "no two deposits touch");
  ok([...w.yieldKm].every((y, i) => w.water[i] === 0 ? y >= 0 && y <= 1 : y === 0), "food grows on land only");
}
{ // a freight line from a breadbasket to the hungriest town feeds it, within its wagons' capacity
  const PRE = 30, POST = 12, base = () => { const t = new E.Sim(E.makeWorld(3), 3); t.warmup(); for (let y = 0; y < PRE; y++) t.step(); return t; };
  const s0 = base(), fr = s0.fr, T = s0.towns;
  ok(fr.food.every((x) => x >= 0 && x <= 1) && fr.ore.every((x) => x >= 0 && x <= 1), "satisfactions are shares");
  let h = -1; T.forEach((t, k) => { if (fr.short[k] > 0 && (h < 0 || fr.short[k] > fr.short[h])) h = k; });
  ok(h >= 0, "by " + PRE + " years in, a city is short of food (" + (h >= 0 ? T[h].name + ", " + Math.round(100 * fr.food[h]) + "%" : "none") + ")");
  // the breadbaskets within 350 km, biggest surplus first; a player tries them in turn
  const baskets = T.map((t, k) => [fr.local[k] - fr.need[k], k]).filter(([sur, k]) => k !== h && sur > 20e3 && E.arc(T[k].p, T[h].p) * E.R < 350).sort((x, y) => y[0] - x[0]).slice(0, 4);
  ok(baskets.length > 0, "a breadbasket within reach");
  // a hungry city without a line shrinks until its farms feed it, so food shares converge; the
  // line shows in the first year's food and in how many people the city keeps
  const run = (b, years) => {
    const t = base(); if (b >= 0) t.setLines([{ id: 1, color: "#f00", stops: [t.towns[b].p, t.towns[h].p], trains: 1, wagons: 4 }]);
    for (let y = 0; y < years; y++) t.step();
    return t;
  };
  const a1 = run(-1, 1), ph = (t) => t.fr.price.food[h];
  let used = -1, c1 = null;
  for (const [, b] of baskets) { const t = run(b, 1), F = t.fr.lines.get(1); if (F && F.food > 0 && ph(t) < 0.95 * ph(a1) && t.fr.food[h] > a1.fr.food[h] + 0.01) { c1 = t; used = b; break; } }
  ok(c1, "a line from one of them feeds the hungry city (" + T[h].name + ")");
  if (c1) {
    const F = c1.fr.lines.get(1);
    ok(c1.fr.runs.every((r) => r.load <= r.cap * (1 + 1e-9)), "the line carries food (" + Math.round(F.food) + " a year from " + T[used].name + "), never past its wagons");
    // in a market the line's food also displaces what came by road, so the city gains less than the line carries, and its food gets cheaper
    ok(c1.fr.food[h] > a1.fr.food[h] + 0.01 && ph(c1) < 0.95 * ph(a1), "the hungry city is better fed, and food there is cheaper (" + Math.round(100 * a1.fr.food[h]) + "% → " + Math.round(100 * c1.fr.food[h]) + "% fed, price ×" + ph(a1).toFixed(2) + " → ×" + ph(c1).toFixed(2) + ")");
    const a = run(-1, POST), c = run(used, POST);
    ok(c.towns[h].pop > a.towns[h].pop * 1.02, "and it keeps more people: +" + Math.round(100 * (c.towns[h].pop / a.towns[h].pop - 1)) + "% after " + POST + " years");
    ok(c1.stats.cargo > 0, "freight pays (₵" + Math.round(c1.stats.cargo) + " a year)");
    // the market: where goods flow, what a seller gets there is what it could get anywhere (within the traders' spread)
    const fr1 = c1.fr; let worst = 0, n = 0;
    for (const f of fr1.flows) {
      if (f.c !== "food" || f.src === f.dst || f.x < 0.05 * fr1.local[f.src]) continue;
      let toll = 0; for (const r of f.runs) toll += fr1.tolls.food[r];
      const net = fr1.price.food[f.dst] * f.d - f.cost - toll, own = fr1.price.food[f.src];
      worst = Math.max(worst, Math.abs(net - own) / Math.max(1, own)); n++;
    }
    ok(n > 0 && worst < 0.15, "where food flows, the dear end pays the cheap end's price plus the way (" + n + " flows, within " + Math.round(100 * worst) + "%)");
    // a full line is rationed by a toll, which is its margin; more wagons, less toll
    const more = (() => { const t = base(); t.setLines([{ id: 1, color: "#f00", stops: [t.towns[used].p, t.towns[h].p], trains: 1, wagons: 16 }]); t.step(); return t; })();
    const tl = (t) => t.fr.lines.get(1).toll;
    ok(F.load > 0.97 && tl(c1) > 0.05 && tl(more) < tl(c1) / 4, "a full line charges what its room is worth (toll ×" + tl(c1).toFixed(2) + "); with four times the wagons it isn't full and the toll falls (×" + tl(more).toFixed(3) + ")");
  }
  // the farms answer the price: where food is dear more land is farmed, where cheap less
  const f30 = s0.fr, pl = s0.farmPull; let up = 0, dn = 0, bad = 0;
  T.forEach((t, k) => { if (k >= pl.length || f30.price.food[k] == null) return; const p = f30.price.food[k]; if (p > 1.15) { if (pl[k] > 1) up++; else bad++; } else if (p < 0.85) { if (pl[k] < 1) dn++; else bad++; } });
  ok(up + dn > 0 && bad === 0, "dear food draws farmers, cheap food sends them to town (" + up + " towns farming more, " + dn + " less)");
}

/* ---- the economy's rules (test/economy.mjs measures the curve itself) */
{
  const t = new E.Sim(E.makeWorld(3), 3); t.warmup();
  const home = t.towns[t.home].p, e1 = [home[1], -home[0], 0], l = Math.hypot(...e1), off = (km) => E.slerp(home, [e1[0] / l, e1[1] / l, e1[2] / l], km / (E.R * Math.PI / 2));
  ok(t.home != null && t.tier === 0 && t.canBuild(off(20)) && !t.canBuild(off(60)), "you may build within your charter, and not beyond");
  ok(!t.charterReady() && !t.buyCharter(), "a wider charter has to be earned");
  t.stats.riders = E.TIERS[1].riders; t.credits = 0;
  ok(t.charterReady() && !t.buyCharter(), "earned, it still has to be paid for");
  t.credits = 1e6; const fee = t.charterFee();
  ok(t.buyCharter() && t.tier === 1 && t.credits === 1e6 - fee && t.canBuild(off(60)), "bought, it reaches further");
  ok(t.index === 1, "prices start at 1");
  for (let y = 0; y < 10; y++) t.step();
  ok(t.index > 1 && Math.abs(t.index - Math.pow(t.stats.pop / t.pop0, P.INDEX_EXP)) < 1e-9, "prices follow the world's wealth (×" + t.index.toFixed(2) + " after 10 years)");
  let city = 0, rural = -1; for (let i = 0; i < t.n; i++) { const d = t.pop[i] / t.area[i]; if (t.land[i] && d > t.pop[city] / t.area[city]) city = i; if (t.land[i] && d < 5 && rural < 0) rural = i; }
  ok(t.stopCost(pt2(t, city)) > 2 * t.stopCost(pt2(t, rural)), "building in a dense city costs more");
  // the levy: what you keep always grows with what riders pay, but ever more slowly
  const keep = (g) => g - g * P.LEVY_MAX * g / (g + P.LEVY_HALF);
  ok([1e3, 5e3, 2e4, 1e5].every((g, k, A) => k === 0 || keep(g) > keep(A[k - 1])) && keep(2e4) / 2e4 < keep(1e3) / 1e3, "the cities' cut grows with the fares, and you always keep more for more");
  ok(t.fr.ports && t.fr.ports.length > 0, "coastal towns are ports, and ship to each other");
}
{ // fares: one per journey and a rate per km, so cutting a line into pieces earns less, never more
  const run = (split) => {
    const t = new E.Sim(E.makeWorld(3), 3); t.warmup();
    const dens = (i) => t.pop[i] / t.area[i]; let a = 0; for (let i = 0; i < t.n; i++) if (t.land[i] && dens(i) > dens(a)) a = i;
    const st = [a]; for (let k = 0; k < 5; k++) { let nx = -1, nd = 0; for (const j of t.nbrs[st[st.length - 1]]) if (t.land[j] && !st.includes(j) && dens(j) > nd && st.every((q) => E.arc(pt2(t, q), pt2(t, j)) * E.R > 1)) { nd = dens(j); nx = j; } if (nx < 0) break; st.push(nx); }
    const ps = st.map((i) => pt2(t, i));
    t.setLines(split ? ps.slice(1).map((p, k) => ({ id: k + 1, color: "#f00", stops: [ps[k], p], trains: 1 })) : [{ id: 1, color: "#f00", stops: ps, trains: 4 }]);
    t.step(); t.step(); return t.stats;
  };
  const one = run(false), cut = run(true);
  ok(cut.boardings > cut.riders * 1.2, "chopped into short lines, journeys change lines (" + (cut.boardings / cut.riders).toFixed(2) + " boardings each)");
  ok(cut.gross <= one.gross, "and earn no more than the one line (₵" + Math.round(cut.gross) + " vs ₵" + Math.round(one.gross) + " a year)");
  const L = one.lines[0];
  ok(Math.abs(L.fare - (P.FARE_KM * L.km + P.FARE_TRIP * one.riders)) < 1e-9, "a lone line's fares are its journeys and its km");
}
function pt2(s, i) { return [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]]; }

/* ---- sculpting: loops and interchanges */
{
  const fresh = () => { const t = new E.Sim(E.makeWorld(3), 3); t.warmup(); return t; };
  const t0 = fresh(), dens = (i) => t0.pop[i] / t0.area[i];
  let c0 = -1; for (let i = 0; i < t0.n; i++) if (t0.land[i] && t0.zoneTown[i] === t0.home && (c0 < 0 || dens(i) > dens(c0))) c0 = i;
  const c = pt2(t0, c0), north = [0, 0, 1], e = norm(cross(north, c)), nn = norm(cross(c, e));
  const at = (deg, km) => { const th = deg * Math.PI / 180, d = [Math.cos(th) * e[0] + Math.sin(th) * nn[0], Math.cos(th) * e[1] + Math.sin(th) * nn[1], Math.cos(th) * e[2] + Math.sin(th) * nn[2]], a = km / E.R; return norm([Math.cos(a) * c[0] + Math.sin(a) * d[0], Math.cos(a) * c[1] + Math.sin(a) * d[1], Math.cos(a) * c[2] + Math.sin(a) * d[2]]); };
  // a ring of six stops round the city's centre, open and closed
  const ring = [0, 60, 120, 180, 240, 300].map((d) => at(d, 5));
  const ride = (loop) => { const t = fresh(); t.setLines([{ id: 1, color: "#f00", stops: ring, trains: 4, loop }]); const net = t.network(); t.step(); return { t, net, L: t.lines[0], st: t.stats.lines[0] }; };
  const open = ride(false), loop = ride(true);
  ok(E.legs(open.L).length === 5 && E.legs(loop.L).length === 6 && E.legs(loop.L)[5].join() === "5,0", "a loop has one more leg: the last stop back to the first");
  ok(open.net.segs.length === 10 && loop.net.segs.length === 12, "and rides it both ways");
  const sumRides = (L) => E.legs(L).reduce((x, [a, b]) => x + 60 * E.arc(L.stops[a], L.stops[b]) * E.R / P.LINE_KMH + P.DWELL, 0);
  ok(Math.abs(open.L._cycle - (2 * sumRides(open.L) + 2 * P.TURN)) < 1e-9 && Math.abs(loop.L._cycle - 2 * sumRides(loop.L)) < 1e-9, "an open line turns back at both ends; a loop never turns");
  // the ring's last leg costs about what the two turnbacks saved, so a ring carries about what the open line did; the leg itself is ridden
  const closing = loop.st.segs.filter((g) => g.k === 5).reduce((x, g) => x + g.load, 0);
  ok(closing > 0, "the leg that closes the ring is ridden (" + Math.round(closing) + " a day; the ring " + Math.round(loop.st.riders) + " riders, open " + Math.round(open.st.riders) + ")");
  const t2 = fresh(); t2.setLines([{ id: 1, color: "#f00", stops: ring.slice(0, 2), trains: 1, loop: true }]);
  ok(!t2.lines[0].loop, "two stops can't make a loop");
  // two lines crossing at the centre: at one shared stop, or at stops 1.5 km apart
  const we = [at(180, 6), at(180, 3), c, at(0, 3), at(0, 6)], sn = (mid) => [at(270, 6), at(270, 3), mid, at(90, 3), at(90, 6)];
  const cross2 = (mid) => {
    const t = fresh(); t.setLines([{ id: 1, color: "#f00", stops: we, trains: 3 }, { id: 2, color: "#00f", stops: sn(mid), trains: 3 }]);
    const net = t.network(), dem = t.demand(net); t.lineStats(net, dem);
    const z = t.zoneAt(c), stats = t.stats; t.grow(dem);
    return { t, net, dem, stats, jobs: t.jobs[z] };
  };
  const hub = cross2(c), apart = cross2(at(45, 1.5));
  ok(hub.t.hubs.length === 1 && hub.t.hubs[0].lines.join() === "1,2" && apart.t.hubs.length === 0, "stops of two lines at one place are an interchange; 1.5 km apart they are not");
  ok(hub.net.out.some((E4) => E4.some((ed) => ed[2] === 4)) && hub.stats.transfers > 0, "people change lines there (" + Math.round(hub.stats.transfers) + " a day)");
  ok(hub.stats.riders > apart.stats.riders, "the interchange carries more journeys (" + Math.round(hub.stats.riders) + " vs " + Math.round(apart.stats.riders) + " a day)");
  ok(hub.jobs > 1.2 * apart.jobs, "and jobs gather at it (×" + (hub.jobs / apart.jobs).toFixed(2) + ")");
}
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; }

console.log(fails ? `ecumene: ${fails}/${checks} FAILED` : `ecumene: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
