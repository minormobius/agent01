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
const ok = (c, m) => { checks++; if (!c) { fails++; console.error("FAIL " + m); } };

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
  const t = new E.Sim(w, 3); let big = 0; for (let i = 0; i < t.n; i++) if (t.land[i] && t.area[i] > 50) { big = i; break; }
  t.pop[big] = 3 * P.SPLIT_POP - 3; const before = t.pop.reduce((a, b) => a + b, 0), n0 = t.n;
  t.refine();
  ok(t.n === n0 + 2 && Math.abs(t.pop.reduce((a, b) => a + b, 0) - before) < 1e-6, "a split adds two zones and keeps every person");
  ok(t.pop[big] < P.SPLIT_POP && t.pop[n0] < P.SPLIT_POP, "a split doesn't cascade");
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

/* ---- a line through the biggest city */
let a = 0; for (let i = 0; i < s.n; i++) if (s.pop[i] > s.pop[a]) a = i;
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
  // one train on the same line is overfull, and an overfull ride slows down
  s.setLines([{ id: 1, color: "#f00", stops, trains: 1 }]); s.step();
  const L = s.stats.lines[0];
  ok(L.crowd > 1 && s.stats.stranded > 0, "one train on a city line is overfull and strands riders (" + Math.round(100 * L.crowd) + "%)");
  const base = s.network().segs[0], key = base.key; s.crowd.set(key, 1.5);
  const slowed = s.network().segs.find((g) => g.key === key);
  ok(slowed.minutes > base.minutes * 1.5, "an overfull ride is slower (" + base.minutes.toFixed(1) + " → " + slowed.minutes.toFixed(1) + " min)");
}

/* ---- the loop: the same planet with and without the line, 25 years on */
function run(withLine) {
  const t = new E.Sim(E.makeWorld(3), 3); t.warmup();
  if (withLine) t.setLines([{ id: 1, color: "#f00", stops, trains: 8 }]);
  for (let y = 0; y < 25; y++) t.step();
  let along = 0; for (let i = 0; i < t.n; i++) { const q = [t.P[3 * i], t.P[3 * i + 1], t.P[3 * i + 2]]; if (t.land[i] && stops.some((p) => E.arc(q, p) * E.R < 5)) along += t.pop[i]; }
  return along;
}
const without = run(false), withL = run(true);
console.log("the loop: people along the line after 25 years, " + Math.round(without) + " without it, " + Math.round(withL) + " with it (+" + Math.round(100 * (withL / without - 1)) + "%)");
ok(withL > 1.2 * without, "a line grows the city along it: +" + Math.round(100 * (withL / without - 1)) + "% in 25 years");

console.log(fails ? `ecumene: ${fails}/${checks} FAILED` : `ecumene: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
