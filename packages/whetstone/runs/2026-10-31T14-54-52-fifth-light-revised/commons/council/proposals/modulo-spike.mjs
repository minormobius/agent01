// Modulo's feasibility spike for the cold-chain proposal. Not the product: three measurements.
//   node proposals/modulo-spike.mjs
// 1. plant step vs closed form; 2. holdover forecast (Monte Carlo) vs closed form with no doors;
// 3. same model under run() and runRealtime() with a fake clock: identical traces?
import { Sim } from '../tools/des/des.mjs';

// One-node thermal model, exact discretisation. Parameters are PLACEHOLDERS, not a real fridge.
const P = { Ta: 32, tau: 600, q: 0.12, dt: 1 };           // °C, min, °C/min of cooling, min
const step = (T, on, p = P) => {
  const Tinf = p.Ta - (on ? p.q * p.tau : 0);
  return Tinf + (T - Tinf) * Math.exp(-p.dt / p.tau);
};
const closedHoldover = (T0, lim = 8, p = P) => p.tau * Math.log((p.Ta - T0) / (p.Ta - lim));

// The model: plant + doors + controller. Controller only sees 'temp' and drives `relay`.
function fridge(sim, { T0 = 5, power = true, doors = true, log = () => {} } = {}) {
  const st = { T: T0, relay: false, power, lastOff: -Infinity, cycles: 0, maxT: T0, breachAt: null };
  sim.process(function* plant() {
    for (;;) {
      yield sim.timeout(P.dt);
      st.T = step(st.T, st.relay && st.power);
      st.maxT = Math.max(st.maxT, st.T);
      if (st.T >= 8 && st.breachAt === null) st.breachAt = sim.now;
      sim.inject('temp', st.T);
    }
  });
  if (doors) sim.process(function* door() {
    for (;;) { yield sim.timeout(sim.exponential(1 / 30)); st.T += sim.uniform(0.2, 0.8); }
  });
  const box = sim.subscribe('temp');
  sim.process(function* controller() {
    for (;;) {
      const T = yield box.get();
      if (!st.relay && T >= 6 && sim.now - st.lastOff >= 3) { st.relay = true; st.cycles++; log('on', T); }
      else if (st.relay && T <= 3) { st.relay = false; st.lastOff = sim.now; log('off', T); }
    }
  });
  return st;
}

// 1. plant vs closed form, compressor off, 240 one-minute steps
{
  let T = 5; for (let i = 0; i < 240; i++) T = step(T, false);
  const exact = P.Ta + (5 - P.Ta) * Math.exp(-240 / P.tau);
  console.log(`1. plant after 240 min: stepped ${T.toFixed(9)}  closed ${exact.toFixed(9)}  |d| ${Math.abs(T - exact).toExponential(1)}`);
}

// 2. holdover: power off from 5 °C. Run until breach.
function holdover(seed, doors) {
  const sim = new Sim({ seed });
  const st = fridge(sim, { T0: 5, power: false, doors });
  while (st.breachAt === null && sim.now < 10000) sim.run({ until: sim.now + 10 });
  return st.breachAt;
}
{
  const c = closedHoldover(5);
  const nd = holdover(1, false);
  const xs = []; for (let s = 1; s <= 1000; s++) xs.push(holdover(s, true));
  xs.sort((a, b) => a - b);
  const pct = (p) => xs[Math.ceil(p * xs.length) - 1];
  console.log(`2. holdover no doors: sim ${nd} min (1-min grid), closed form ${c.toFixed(2)} min`);
  console.log(`   with doors (1000 runs): p10 ${pct(0.1)}  p20 ${pct(0.2)}  p50 ${pct(0.5)}  p80 ${pct(0.8)} min`);
}

// 3. run() vs runRealtime() with a fake clock: same events, same order, same times?
{
  const traceOf = async (live) => {
    const tr = [];
    let t = 0; const clock = { now: () => t, sleep: async (ms) => { t += ms; } };
    const sim = new Sim({ seed: 7, clock, trace: (e) => tr.push(`${e.time}|${e.priority}|${e.kind}|${e.label}`) });
    const st = fridge(sim, { T0: 7 });
    if (live) await sim.runRealtime({ until: 1440, scale: 10 }); else sim.run({ until: 1440 });
    return { tr, st };
  };
  const a = await traceOf(false), b = await traceOf(true);
  let firstDiff = -1; for (let i = 0; i < Math.max(a.tr.length, b.tr.length); i++) if (a.tr[i] !== b.tr[i]) { firstDiff = i; break; }
  console.log(`3. 24 h: run() ${a.tr.length} entries, runRealtime ${b.tr.length}; first difference at ${firstDiff} (−1 = none)`);
  if (firstDiff >= 0) console.log(`   run: ${a.tr[firstDiff]}\n   rt:  ${b.tr[firstDiff]}`);
  console.log(`   controller: ${a.st.cycles} compressor cycles, max ${a.st.maxT.toFixed(2)} °C, breach ${a.st.breachAt}`);
}
