/* The market: a freight line feeds a hungry city and makes its food cheaper,
   prices hold where goods flow, a full line's toll, and farms that answer
   the price.
     node games/ecumene/test/market.selftest.mjs   (~40 s) */
import { loadEcumene } from "./harness.mjs";
const E = await loadEcumene(), P = E.P_;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

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
    const wag = (w) => { const t = base(); t.setLines([{ id: 1, color: "#f00", stops: [t.towns[used].p, t.towns[h].p], trains: 1, wagons: w }]); t.step(); return t.fr.lines.get(1); };
    const one = wag(1), four = wag(4);
    ok(one.load > 0.97 && one.toll > 0.04 && four.toll < one.toll / 4, "a full line charges what its room is worth (one wagon: full, toll ×" + one.toll.toFixed(2) + "); with four it has room and the toll falls (×" + four.toll.toFixed(3) + ")");
  }
  // the farms answer the price: where food is dear more land is farmed, where cheap less
  const f30 = s0.fr, pl = s0.farmPull; let up = 0, dn = 0, bad = 0;
  T.forEach((t, k) => { if (k >= pl.length || f30.price.food[k] == null) return; const p = f30.price.food[k]; if (p > 1.15) { if (pl[k] > 1) up++; else bad++; } else if (p < 0.85) { if (pl[k] < 1) dn++; else bad++; } });
  ok(up + dn > 0 && bad === 0, "dear food draws farmers, cheap food sends them to town (" + up + " towns farming more, " + dn + " less)");
}
console.log(fails ? `ecumene market: ${fails}/${checks} FAILED` : `ecumene market: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
