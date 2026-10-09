/* Farming gets better where food is dear, and the know-how travels with
   trade; a century on, the planet still eats.
     node games/ecumene/test/farms.selftest.mjs   (~40 s) */
import { loadEcumene } from "./harness.mjs";
const E = await loadEcumene(), P = E.P_;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- farming gets better where food is dear, and the know-how travels with trade */
{
  const t = new E.Sim(E.makeWorld(3), 3); t.warmup();
  const fedOf = (x) => { let need = 0, ate = 0; x.towns.forEach((_, k) => { if (k < x.fr.need.length) { need += x.fr.need[k]; ate += x.fr.food[k] * x.fr.need[k]; } }); return ate / need; };
  for (let y = 0; y < 100; y++) t.step();
  const fed = fedOf(t), tech = t.agTech, top = Math.max(...tech);
  ok(fed > 0.78, "a century on, the planet still eats: " + Math.round(100 * fed) + "% fed, " + fmtM(t.stats.pop) + " people, the best farms ×" + top.toFixed(1));
  ok(tech.every((x) => x >= 1 - 1e-9) && top > 1.5, "dear food paid for better farms, and none got worse");
  // GDP, district by district, adds up to each town's
  const sum = new Float64Array(t.towns.length); for (let i = 0; i < t.n; i++) if (t.land[i] && t.zoneTown[i] >= 0) sum[t.zoneTown[i]] += t.gdpZ[i];
  ok(t.towns.every((x, k) => Math.abs(sum[k] - x.gdp) <= 1e-6 * Math.max(1, x.gdp)), "districts' GDP adds up to their towns'");
  // know-how by rail: a line between a town and better farms than its own closes the gap faster than any road
  const s1 = new E.Sim(E.makeWorld(3), 3); s1.warmup(); for (let y = 0; y < 10; y++) s1.step();
  const T = s1.towns; let a = -1, b = -1, best = Infinity;
  T.forEach((x, i) => T.forEach((z, j) => { const km = E.arc(x.p, z.p) * E.R; if (i < j && km > 80 && km < 200 && km < best) { best = km; a = i; b = j; } }));
  const lift = (line) => {
    const u = new E.Sim(E.makeWorld(3), 3); u.warmup(); for (let y = 0; y < 10; y++) u.step();
    u.agTech[a] = 4; u.agTech[b] = 1;   // the best farms at a, the worst at b
    if (line) u.setLines([{ id: 1, color: "#f00", stops: [u.towns[a].p, u.towns[b].p], trains: 1, wagons: 6 }]);
    u.step(); return u.agTech[b];
  };
  const withL = lift(true), without = lift(false);
  ok(a >= 0 && withL > without + 0.15, "a freight line carries know-how: farms at " + (a >= 0 ? T[b].name : "?") + " ×" + without.toFixed(2) + " without it, ×" + withL.toFixed(2) + " with it, a year on");
}
function fmtM(x) { return (x / 1e6).toFixed(1) + "M"; }
console.log(fails ? `ecumene farms: ${fails}/${checks} FAILED` : `ecumene farms: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
