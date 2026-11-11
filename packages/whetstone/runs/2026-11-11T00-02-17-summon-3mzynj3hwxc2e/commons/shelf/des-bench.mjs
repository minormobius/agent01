// des-bench.mjs — speed of a des.mjs on large runs, plus an M/M/c check against Erlang C (Morphyx).
// Usage: node shelf/des-bench.mjs [path/to/des.mjs]
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { Sim, Resource, Store } = await import(pathToFileURL(path.resolve(process.argv[2] || './des.mjs')).href);

const T = (name, f) => {
  const t = performance.now(); const n = f(); const ms = performance.now() - t;
  console.log(name.padEnd(36), String(n).padStart(8), 'events', ms.toFixed(0).padStart(6), 'ms', (n / ms / 1000).toFixed(2).padStart(6), 'M ev/s');
};
function erlangCWait(lam, mu, c) { // mean wait in queue, M/M/c
  const a = lam / mu, rho = a / c; let sum = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; sum += term; }
  const last = term * a / c; // a^c / c!
  const pc = last / (1 - rho) / (sum + last / (1 - rho));
  return pc / (c * mu - lam);
}

T('1M callbacks scheduled up front', () => { const s = new Sim(); for (let i = 0; i < 1e6; i++) s.schedule(s.random() * 1000, () => {}); return s.run(); });
T('1 process, 1M timeouts', () => { const s = new Sim(); s.process(function* () { for (let i = 0; i < 1e6; i++) yield s.timeout(1); }); return s.run(); });
T('M/M/5 rho=.9, 400k customers', () => {
  const lam = 4.5, mu = 1, c = 5, N = 4e5;
  const s = new Sim({ seed: 2 }), r = new Resource(s, { capacity: c });
  s.process(function* () { for (let i = 0; i < N; i++) { yield s.timeout(s.exponential(lam)); s.process(function* () { const q = r.request(); yield q; yield s.timeout(s.exponential(mu)); r.release(q); }); } });
  const n = s.run(); const st = r.stats();
  console.log(`   Wq sim ${st.meanWait.toFixed(3)} vs Erlang C ${erlangCWait(lam, mu, c).toFixed(3)}; util ${st.utilization.toFixed(3)} vs ${(lam / mu / c).toFixed(3)}`);
  return n;
});
T('M/M/1, 100k already queued', () => { const s = new Sim(), r = new Resource(s);
  for (let i = 0; i < 1e5; i++) s.process(function* () { const q = r.request(); yield q; yield s.timeout(1); r.release(q); });
  return s.run(); });
T('Store pipe, 300k items, cap 10', () => { const s = new Sim(), st = new Store(s, { capacity: 10 });
  s.process(function* () { for (let i = 0; i < 3e5; i++) yield st.put(i); });
  s.process(function* () { for (let i = 0; i < 3e5; i++) { yield st.get(); yield s.timeout(1); } });
  return s.run(); });
