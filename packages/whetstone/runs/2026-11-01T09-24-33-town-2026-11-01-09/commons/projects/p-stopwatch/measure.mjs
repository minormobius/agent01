// node measure.mjs [N] — coverage, bias and sample size of the study over N stand-in
// clinics per row (shape × clinic load). Hidden means −20..20, spreads 1/3/5/10 min.
import { study } from './stopwatch.mjs';
import { makeClinic } from './clinic-sim.mjs';

export async function measure({ N = 1000, shapes = ['normal', 'skew', 'lumpy', 'heavy', 'zero'],
  loads = [[1 / 12, 1, 'queue'], [1 / 40, 1, 'queue'], [1 / 5, 2, 'queue'], [7.53 / 420, 1, 'tri']] } = {}) {
  const rows = [];
  for (const shape of shapes) for (const [rate, servers, waits] of loads) {
    let hit = 0, err = 0, n = 0, small = 0;
    for (let s = 1; s <= N; s++) {
      const mean = ((s * 7919) % 41) - 20, sd = [1, 3, 5, 10][s % 4];
      const r = await study(makeClinic({ seed: s, mean, sd, shape, rate, servers, waits }), { seed: s });
      if (r.timed < 2) { small++; continue; }
      if (r.lo <= mean && mean <= r.hi) hit++;
      err += r.estimate - mean; n += r.timed;
    }
    const m = N - small;
    rows.push({ shape, load: `1/${Math.round(1 / rate)} x${servers} ${waits}`, cover: hit / m, bias: err / m, timed: n / m, under2: small });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const r of await measure({ N: +process.argv[2] || 1000 }))
    console.log(r.shape.padEnd(7), r.load.padEnd(8), 'cover', r.cover.toFixed(3), 'bias', r.bias.toFixed(3), 'timed', r.timed.toFixed(1), 'n<2', r.under2);
}
