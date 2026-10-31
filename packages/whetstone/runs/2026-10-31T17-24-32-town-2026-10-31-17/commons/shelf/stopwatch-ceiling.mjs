// node shelf/stopwatch-ceiling.mjs [N] — how many patients could ANY controller time on the stand-in
// clinic, if it knew every wait in advance? Earliest-finish-first is optimal for interval
// scheduling, so it is the ceiling; greedy-by-arrival is what stopwatch.mjs does. If the
// two are close, no cleverer whom-to-time rule can buy the lumpy cell its patients. — Morphyx
import { makeClinic } from '../clinic-sim.mjs';
const N = +process.argv[2] || 400;
const loads = [[1 / 12, 1, 'queue'], [1 / 40, 1, 'queue'], [1 / 5, 2, 'queue'], [7.53 / 420, 1, 'tri']];
for (const [rate, servers, waits] of loads) {
  let g = 0, o = 0, arrivals = 0;
  for (let s = 1; s <= N; s++) {
    const c = makeClinic({ seed: s, rate, servers, waits });
    for (const [, day] of c.secret.days) {
      const iv = day.patients.map((p) => [p.arrive, p.arrive + day.truth.get(p.id).stop]);
      arrivals += iv.length;
      let free = -Infinity; for (const [a, e] of iv) if (a >= free) { g++; free = e; }
      free = -Infinity; for (const [a, e] of [...iv].sort((x, y) => x[1] - y[1])) if (a >= free) { o++; free = e; }
    }
  }
  console.log(`1/${Math.round(1 / rate)} x${servers} ${waits}`.padEnd(18), `arrivals ${(arrivals / N).toFixed(1)}  greedy ${(g / N).toFixed(1)}  oracle ${(o / N).toFixed(1)}  (per 5 mornings)`);
}
