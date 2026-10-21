// Sizing for Modulo's proposal (proposals/modulo.md). Run: node proposals/modulo-sizing.mjs
// Part 1 (des): how many patients can one person time per session at the clinic's real rate?
// Part 2: what can n paired timings detect?
// Assumptions are marked; none of them has been checked against the clinic.
import { Sim, Resource } from '../tools/des/des.mjs';

// From the board's digest: tablet era 113 visits in 15 weekdays = 7.53/day.
// ASSUMPTION: a 7-hour clinic day (420 min), Poisson arrivals.
// ASSUMPTION: waits ~ triangular(14, 34, 54), the tablet era's min / median / max.
// Rule: the observer (capacity 1) times an arrival only if free; busy -> missed, never substituted.
function session(seed, minutes) {
  const sim = new Sim({ seed }); const obs = new Resource(sim, { capacity: 1 });
  let timed = 0, missed = 0, arrivals = 0;
  sim.process(function* () {
    for (;;) {
      yield sim.timeout(sim.exponential(7.53 / 420));
      if (sim.now > minutes) return;
      arrivals++;
      const w = sim.triangular(14, 34, 54);
      if (obs.inUse) { missed++; continue; }
      const r = obs.request();
      sim.process(function* () { yield r; yield sim.timeout(w); obs.release(r); timed++; });
    }
  });
  sim.run();
  return { timed, missed, arrivals };
}
for (const [label, mins] of [['morning 3.5h', 210], ['full day 7h', 420]]) {
  let T = 0, M = 0, A = 0; const N = 20000; const to10 = [];
  for (let s = 1; s <= N; s++) { const r = session(s, mins); T += r.timed; M += r.missed; A += r.arrivals; }
  for (let k = 0; k < 4000; k++) { let n = 0, d = 0; while (n < 10) { n += session(`k${k}d${d}`, mins).timed; d++; } to10.push(d); }
  to10.sort((a, b) => a - b);
  console.log(`${label}: arrivals ${(A / N).toFixed(2)}, timed ${(T / N).toFixed(2)}, missed ${(M / N).toFixed(2)}; ` +
    `sessions to 10 timed p50 ${to10[1999]} p80 ${to10[3199]} p95 ${to10[3799]}`);
}

// Paired differences d = tablet wait − stopwatch wait ~ offset + Normal(0, sd). Two-sided t-test at 5%.
const sim = new Sim({ seed: 7 });
const norm = () => { const u = 1 - sim.random(), v = sim.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const t975 = { 9: 2.262, 14: 2.145, 19: 2.093 };
for (const n of [10, 15, 20]) for (const sd of [2, 5, 10]) for (const off of [0, 5]) {
  let rej = 0, hw = 0; const R = 20000;
  for (let r = 0; r < R; r++) {
    let s = 0, ss = 0; const xs = [];
    for (let i = 0; i < n; i++) { const x = off + sd * norm(); xs.push(x); s += x; }
    const m = s / n; for (const x of xs) ss += (x - m) ** 2; const se = Math.sqrt(ss / (n - 1) / n);
    if (Math.abs(m / se) > t975[n - 1]) rej++; hw += t975[n - 1] * se;
  }
  console.log(`n ${n} sd ${sd} offset ${off}: reject ${(rej / R).toFixed(3)}, mean 95% CI half-width ${(hw / R).toFixed(2)} min`);
}
