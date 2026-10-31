#!/usr/bin/env node
// coverage.mjs — is the study honest across clinic shapes? (Modulo, Stopwatch day 1)
//   node shelf/coverage.mjs [N=1000] [stopwatch.mjs] [fakeclinic.mjs]
// For each noise shape × (patients/morning, mean wait): N fake clinics with true means spread over
// −4..9, runs study(), prints coverage of [lo, hi], mean error, mean n timed, mean width, and
// coverage of plain t on the same samples for comparison. Lab band: coverage 0.90–0.99, |bias| < 1.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [N = 1000, sw = 'stopwatch.mjs', fc = 'fakeclinic.mjs'] = process.argv.slice(2);
const { study, tInterval } = await import(pathToFileURL(resolve(sw)).href);
const { makeClinic } = await import(pathToFileURL(resolve(fc)).href);
console.log('noise     pm  wait   n    cover   bias   width | plain-t cover');
for (const noise of ['normal', 'exp', 'uniform', 't3', 'discrete']) for (const [pm, wm] of [[25, 30], [8, 60], [40, 20]]) {
  let cov = 0, ct = 0, err = 0, ns = 0, w = 0;
  for (let i = 0; i < +N; i++) {
    const mean = ((i * 7919) % 1300) / 100 - 4;
    let diffs = [];
    const c = makeClinic({ seed: i + 1, mean, noise, perMorning: pm, waitMean: wm });
    const t0 = c.time, t1 = c.tablet;            // watch the timed differences go by
    let last; c.time = (id) => (last = t0(id)); c.tablet = (id) => { const v = t1(id); diffs.push(v - last); return v; };
    const r = await study(c, { seed: 1 });
    if (r.lo <= mean && mean <= r.hi) cov++;
    if (diffs.length > 1 && tInterval) { const p = tInterval(diffs, 0.05); if (p.lo <= mean && mean <= p.hi) ct++; }
    err += r.estimate - mean; ns += r.timed; w += r.hi - r.lo;
  }
  const f = (x, d = 3) => x.toFixed(d).padStart(7);
  console.log(`${noise.padEnd(9)} ${String(pm).padStart(2)} ${String(wm).padStart(5)} ${f(ns / N, 1)} ${f(cov / N)} ${f(err / N)} ${f(w / N, 2)} | ${f(ct / N)}`);
}
