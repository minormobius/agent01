// fakeclinic.mjs — a clinic built to SPEC "The study", strict about every rule. Test support. (Modulo, day 1)
//
// makeClinic({ seed, mean, noise, arrivals, waits, limit = 5 })
//   mean     the true mean of (tablet − stopwatch), minutes
//   noise    'normal' | 'exp' | 'uniform' | 't3' | 'discrete' | 'zero': centred noise around mean
//   sd       scale of the noise (default 3)
//   perMorning  patients per morning (default 25); arrivals uniform over 240 minutes, sorted
//   waitMean    mean stopwatch wait (default 30), exponential + 5
// Same arguments → same clinic, so a replay can be given "a second clinic built the same way".
// Every illegal call throws, with the rule it broke; `clinic.calls` keeps a count for tests.
import { makeRng } from './tools/des/des.mjs';

export function makeClinic({ seed = 1, mean = 0, noise = 'normal', sd = 3, perMorning = 25, waitMean = 30, limit = 5 } = {}) {
  const rng = makeRng(seed);
  const u = () => rng();
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const draw = {
    normal: () => normal() * sd,
    exp: () => (-Math.log(1 - u()) - 1) * sd,                         // skewed, mean 0
    uniform: () => (u() * 2 - 1) * sd * Math.sqrt(3),
    t3: () => { const z = normal(); let c = 0; for (let i = 0; i < 3; i++) c += normal() ** 2; return z / Math.sqrt(c / 3) * sd / Math.sqrt(3); },
    discrete: () => (u() < 0.9 ? -1 : 9) * sd / 3,                      // mean 0, rare big ones
    zero: () => 0,
  }[noise];
  if (!draw) throw new Error('unknown noise ' + noise);
  const mornings = [];
  const byId = new Map();
  let id = 0;
  for (let k = 1; k <= 7; k++) {
    const n = Math.max(0, Math.round(perMorning + (u() - 0.5) * perMorning * 0.4));
    const arr = Array.from({ length: n }, () => Math.round(u() * 240 * 10) / 10).sort((a, b) => a - b);
    const ps = arr.map((arrive) => {
      const w = 5 + -Math.log(1 - u()) * (waitMean - 5);
      const p = { id: `p${++id}`, k, arrive, sw: w, tab: w + mean + draw() };
      byId.set(p.id, p);
      return p;
    });
    mornings.push(ps);
  }
  // tab is not clipped at 0: clipping would move the true mean away from `mean`.
  let asked = 0;
  let lastSeen = -Infinity, lastIdx = -1;
  const timed = new Set();
  const clinic = {
    calls: { morning: 0, time: 0, tablet: 0 },
    truth: () => { let s = 0, c = 0; for (const p of byId.values()) { s += p.tab - p.sw; c++; } return s / c; },
    morning(k) {
      clinic.calls.morning++;
      if (k !== asked + 1) throw new Error(`morning ${k} out of order (next is ${asked + 1})`);
      if (k > limit) throw new Error(`the manager stops you at ${limit}`);
      asked = k; lastSeen = -Infinity; lastIdx = -1;
      return mornings[k - 1].map(({ id, arrive }) => ({ id, arrive }));
    },
    time(pid) {
      clinic.calls.time++;
      const p = byId.get(pid);
      if (!p) throw new Error(`no patient ${pid}`);
      if (p.k !== asked) throw new Error(`${pid} is not in morning ${asked}`);
      if (timed.has(pid)) throw new Error(`${pid} already timed`);
      const idx = mornings[asked - 1].indexOf(p);
      if (idx <= lastIdx) throw new Error(`${pid} out of arrival order`);
      if (p.arrive < lastSeen) throw new Error(`${pid} arrives at ${p.arrive}, observer busy until ${lastSeen}`);
      timed.add(pid); lastIdx = idx; lastSeen = p.arrive + p.sw;
      return p.sw;
    },
    tablet(pid) {
      clinic.calls.tablet++;
      const p = byId.get(pid);
      if (!p || p.k > asked) throw new Error(`tablet for ${pid}: morning not asked for`);
      return p.tab;
    },
  };
  return clinic;
}
