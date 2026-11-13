/* PULL's selftest. The bench against a closed form (one strand breaks at its weakest link), and the page's claims: a
   twisted 4D yarn has no strength and a 3D one has, more with harder twist and with longer fibres; round a ribbon the
   4D yarn has strength again; a hooped bundle is stronger the tighter the hoops; a loose bundle of continuous
   filaments is worth less than its count, and the same bundle sheathed is worth more than its count; and one seed is
   one result.   node kata/pull/test/pull.selftest.mjs   (~50 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), { test, SPECIES } = await import(path.join(here, "../js/bench.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const sp = Object.fromEntries(SPECIES.map((s) => [s.id, s])), RUN = { steps: 80, strain: 0.04 }, mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
const pull = (id, extra = {}, seeds = 3) => { const out = []; for (let s = 1; s <= seeds; s++) out.push(test({ ...sp[id].opts, ...extra, seed: s }, RUN)); return { peak: mean(out.map((r) => r.peak)), broke: mean(out.map((r) => r.brokeAtPeak)), slip: mean(out.map((r) => r.slipAtPeak)) }; };
{
  const strand = pull("strand", {}, 16).peak, gamma12 = 0.9181687, exact = 0.02 * 95 ** (-1 / 5) * gamma12, again = test({ ...sp.y3hard.opts, seed: 2 }, RUN).peak, same = test({ ...sp.y3hard.opts, seed: 2 }, RUN).peak;
  ok(Math.abs(strand / exact - 1) < 0.15 && again === same, `one strand breaks at its weakest link: mean strength ${strand.toFixed(5)} over 16, the weakest of 95 Weibull links is ${exact.toFixed(5)} (the bench reads the force a step before the break, so a little under); and a seed gives the same pull twice`);
  const u = (r) => r.peak / strand, y4 = pull("y4"), soft = pull("y3soft"), hard = pull("y3hard"), short = pull("y3hard", { staple: 20 }, 2), long = pull("y3hard", { staple: 80 }, 2);
  ok(u(y4) < 0.01 && u(hard) > 2 && u(hard) > 4 * u(soft) && u(long) > u(hard) && u(hard) > u(short), `twisted yarn of short fibres: in 4D it has no strength (${u(y4).toFixed(3)} strands); in 3D ${u(soft).toFixed(2)} soft and ${u(hard).toFixed(2)} hard, and ${u(short).toFixed(2)}, ${u(hard).toFixed(2)}, ${u(long).toFixed(2)} as the fibres go from 20 to 40 to 80 diameters long`);
  const rs = pull("rib4soft"), rh = pull("rib4hard");
  ok(u(rh) > 3 && u(rh) > u(rs) + 1 && u(rs) > 1.2 && u(rs) < 3, `round a ribbon the 4D yarn holds: ${u(rs).toFixed(2)} strands soft (little more than the ribbon, which is worth two) and ${u(rh).toFixed(2)} hard`);
  const hs = pull("hoop4slack"), ht = pull("hoop4tight");
  ok(u(ht) > u(hs) * 1.3 && u(ht) / 13 > 0.9 && hs.slip > ht.slip, `a hooped bundle of 13 short fibres: ${u(hs).toFixed(1)} strands slack, ${u(ht).toFixed(1)} tight; the slack one slips (${(hs.slip * 100).toFixed(0)}% of contacts at the peak against ${(ht.slip * 100).toFixed(0)}%)`);
  const fl = pull("fil4"), rope = pull("rope4");
  ok(u(fl) / 13 < 0.85 && u(fl) / 13 > 0.45 && u(rope) / 13 > 1.05 && u(rope) > 1.5 * u(fl), `continuous filament, 13 of them: loose, ${u(fl).toFixed(1)} strands (${(u(fl) / 13).toFixed(2)} a fibre: the weakest go first and hand their load on); sheathed, ${u(rope).toFixed(1)} (${(u(rope) / 13).toFixed(2)} a fibre: more than its count, because a broken fibre takes load again a little way along)`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
