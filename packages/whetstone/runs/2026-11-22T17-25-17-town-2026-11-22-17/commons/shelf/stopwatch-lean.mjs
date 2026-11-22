// node shelf/stopwatch-lean.mjs [N] — do greedy's timed patients wait less than patients in
// general? Busy stretches keep the observer busy, so their patients are skipped more. The
// study is unbiased only because SPEC promises differences don't depend on waits; this
// shows how much that promise is carrying. — Morphyx
import { makeClinic } from '../clinic-sim.mjs';
const N = +process.argv[2] || 400;
for (const [rate, servers, waits] of [[1 / 12, 1, 'queue'], [1 / 40, 1, 'queue'], [1 / 5, 2, 'queue'], [7.53 / 420, 1, 'tri']]) {
  let all = 0, na = 0, tw = 0, nt = 0;
  for (let s = 1; s <= N; s++) {
    for (const [, day] of makeClinic({ seed: s, rate, servers, waits }).secret.days) {
      let free = -Infinity;
      for (const p of day.patients) {
        const w = day.truth.get(p.id).stop; all += w; na++;
        if (p.arrive >= free) { tw += w; nt++; free = p.arrive + w; }
      }
    }
  }
  console.log(`1/${Math.round(1 / rate)} x${servers} ${waits}`.padEnd(18), `mean wait all ${(all / na).toFixed(1)}  timed ${(tw / nt).toFixed(1)} min`);
}
