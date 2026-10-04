// The des check. Seven milestones, each a set of scenarios run against the souls' des.mjs in a
// child process and compared with the same scenarios run against the reference (solution/).
// Deterministic scenarios must match exactly; statistical ones are judged against theory (M/M/1,
// Erlang C, distribution means) inside the harness, so two correct engines with different random
// streams both pass.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const HARNESS = String.raw`
const m = await import(process.cwd() + '/des.mjs');
const { Sim, Resource, Store, Container, Interrupt, forecast } = m;
const out = {};
const near = (x, y, rel) => Math.abs(x - y) <= rel * Math.abs(y);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
// The order of two things logged at the same instant is not part of the contract (SPEC orders
// events, not the callbacks inside them), so logs are compared as time-sorted multisets.
const lastNum = (e) => { for (let i = e.length - 1; i >= 0; i--) if (typeof e[i] === 'number') return e[i]; return 0; };
const norm = (log) => log.slice().sort((a, b) => lastNum(a) - lastNum(b) || (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
async function ms(k, fn) { try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e && e.message || e).slice(0, 160) }; } }

await ms('m1', () => {
  const sim = new Sim({ seed: 7 }); const log = [];
  sim.schedule(5, () => log.push(['a', sim.now]));
  sim.schedule(5, () => log.push(['b', sim.now]), { priority: -1 });
  sim.schedule(2, () => { log.push(['c', sim.now]); sim.schedule(3, () => log.push(['d', sim.now])); });
  const h = sim.schedule(4, () => log.push(['x', sim.now])); sim.cancel(h);
  sim.schedule(9, () => log.push(['late', sim.now]));
  const n = sim.run({ until: 8 });
  const after = [sim.now, n];
  let threw = false; try { sim.schedule(-1, () => {}); } catch { threw = true; }
  const s1 = new Sim({ seed: 3 }), s2 = new Sim({ seed: 3 }), s3 = new Sim({ seed: 4 });
  const a = [s1.random(), s1.random(), s1.random()], b = [s2.random(), s2.random(), s2.random()], c = [s3.random(), s3.random(), s3.random()];
  const s = new Sim({ seed: 11 }); let e = 0, tr = 0, u = 0, uok = true; const N = 40000;
  for (let i = 0; i < N; i++) { e += s.exponential(0.5); tr += s.triangular(1, 2, 6); const x = s.uniform(3, 5); u += x; if (x < 3 || x >= 5) uok = false; }
  return { log, after, threw, sameSeed: JSON.stringify(a) === JSON.stringify(b), diffSeed: JSON.stringify(a) !== JSON.stringify(c),
    expMean: near(e / N, 2, 0.03), triMean: near(tr / N, 3, 0.02), uniMean: near(u / N, 4, 0.01), uniRange: uok };
});

await ms('m2', () => {
  const sim = new Sim(); const log = [];
  const child = sim.process(function* (x) { yield sim.timeout(3); log.push(['child', sim.now]); return x * 2; }, 21);
  sim.process(function* () { const v = yield child; log.push(['parent got', v, sim.now]); });
  const ev = sim.event();
  sim.process(function* () { const v = yield ev; log.push(['ev', v, sim.now]); });
  sim.schedule(4, () => ev.succeed('ok'));
  let twice = false; sim.schedule(5, () => { try { ev.succeed('again'); } catch { twice = true; } });
  const sleeper = sim.process(function* () {
    try { yield sim.timeout(10, 'woke'); log.push(['sleeper woke', sim.now]); }
    catch (e) { log.push(['interrupted', e instanceof Interrupt, e.cause, sim.now]); yield sim.timeout(1); log.push(['after', sim.now]); }
  });
  sim.schedule(3, () => sleeper.interrupt('alarm'));
  sim.process(function* () {
    const all = yield sim.allOf([sim.timeout(2, 'x'), sim.timeout(6, 'y')]); log.push(['all', all, sim.now]);
    const any = yield sim.anyOf([sim.timeout(5, 'slow'), sim.timeout(1, 'fast')]); log.push(['any', any, sim.now]);
  });
  sim.run();
  let deadThrows = false; try { child.interrupt('late'); } catch { deadThrows = true; }
  return { log: norm(log), twice, deadThrows, alive: [child.isAlive, sleeper.isAlive] };
});

await ms('m3', () => {
  const sim = new Sim(); const res = new Resource(sim, { capacity: 2 }); const log = [];
  const job = function* (name, arrive, hold, pr) {
    yield sim.timeout(arrive); const req = res.request({ priority: pr }); yield req;
    log.push([name, 'got', sim.now]); yield sim.timeout(hold); res.release(req); log.push([name, 'done', sim.now]);
  };
  sim.process(job, 'a', 0, 5, 0); sim.process(job, 'b', 0, 3, 0); sim.process(job, 'c', 1, 2, 5); sim.process(job, 'd', 2, 2, 1); sim.process(job, 'e', 2, 1, 1);
  const quitter = sim.process(function* () { yield sim.timeout(1); const r = res.request({ priority: 0 }); try { yield r; log.push(['q', 'got', sim.now]); } catch (e) { log.push(['q', 'gave up', sim.now]); } });
  sim.schedule(2.5, () => quitter.interrupt('bored'));
  const snaps = []; for (const at of [0.5, 1.5, 2.25, 2.75, 4.5, 6.5]) sim.schedule(at, () => snaps.push([at, res.inUse, res.queueLength]));
  sim.run();
  const st = res.stats();
  const det = { log: norm(log), snaps, stats: [r6(st.utilization), r6(st.meanQueue), r6(st.meanWait), st.served] };
  // M/M/1 and M/M/2 against theory.
  const mm = (c, lam, mu, T, seed) => {
    const s = new Sim({ seed }); const r = new Resource(s, { capacity: c });
    s.process(function* () { for (;;) { yield s.timeout(s.exponential(lam)); s.process(function* () { const q = r.request(); yield q; yield s.timeout(s.exponential(mu)); r.release(q); }); } });
    s.run({ until: T }); return r.stats();
  };
  const a1 = mm(1, 0.7, 1, 200000, 5);
  const erlangC = (c, a) => { let sum = 0, f = 1; for (let k = 0; k < c; k++) { if (k) f *= k; sum += a ** k / f; } const fc = f * c; const top = a ** c / fc * (c / (c - a)); return top / (sum + top); };
  const a2 = mm(2, 1.5, 1, 200000, 9);
  const wq2 = erlangC(2, 1.5) / (2 * 1 - 1.5);
  return { det, mm1: [near(a1.meanWait, 0.7 / 0.3, 0.1), near(a1.utilization, 0.7, 0.02)], mm2: [near(a2.meanWait, wq2, 0.1), near(a2.utilization, 0.75, 0.02)] };
});

await ms('m4', () => {
  const sim = new Sim(); const st = new Store(sim, { capacity: 2 }); const log = [];
  sim.process(function* () { for (let i = 0; i < 5; i++) { yield st.put('p' + i); log.push(['put', i, sim.now]); } });
  sim.process(function* () { yield sim.timeout(3); for (let i = 0; i < 5; i++) { const x = yield st.get(); log.push(['got', x, sim.now]); yield sim.timeout(1); } });
  const tank = new Container(sim, { capacity: 10, init: 2 });
  sim.process(function* () { yield tank.get(5); log.push(['drew 5', sim.now]); });
  sim.process(function* () { for (let i = 0; i < 4; i++) { yield sim.timeout(2); yield tank.put(3); log.push(['filled', sim.now]); } });
  const snaps = []; for (const at of [0.5, 2.5, 3.5, 4.5, 5.5, 7.5, 8.5]) sim.schedule(at, () => snaps.push([at, st.items.length, st.items[0] ?? null, tank.level]));
  sim.run();
  return { log: norm(log), snaps, level: tank.level, items: st.items };
});

await ms('m5', () => {
  const chain = { tasks: [{ id: 'A', duration: 3, deps: [] }, { id: 'B', duration: 4, deps: ['A'] }, { id: 'C', duration: 2, deps: [] }, { id: 'D', duration: 1, deps: ['B', 'C'] }], resources: {} };
  const f1 = forecast(chain, { runs: 50, seed: 2 });
  const crew = { tasks: [
    { id: 'dig', duration: 4, deps: [], uses: { crew: 2 } }, { id: 'frame', duration: 3, deps: ['dig'], uses: { crew: 1 } },
    { id: 'wire', duration: 2, deps: ['dig'], uses: { crew: 1, sparky: 1 } }, { id: 'plumb', duration: 2, deps: ['dig'], uses: { crew: 1 } },
    { id: 'paint', duration: 1, deps: ['frame', 'wire', 'plumb'], uses: { crew: 2 } } ], resources: { crew: 2, sparky: 1 } };
  const f2 = forecast(crew, { runs: 20, seed: 3 });
  const tri = { tasks: [{ id: 'T', duration: { dist: 'triangular', min: 2, mode: 4, max: 9 }, deps: [] }], resources: {} };
  const f3 = forecast(tri, { runs: 20000, seed: 4 });
  return { chain: [f1.p50, f1.p80, f1.p95, f1.mean, f1.criticality], crew: [f2.p50, f2.mean, f2.criticality],
    tri: [near(f3.mean, 5, 0.02), f3.p50 <= f3.p80 && f3.p80 <= f3.p95, f3.p95 <= 9 && f3.p50 >= 2] };
});

await ms('m6', async () => {
  const fake = () => { const c = { t: 0, sleeps: [], pending: [], now() { return c.t; },
    async sleep(ms) { c.sleeps.push(ms); const target = c.t + ms; c.pending.sort((a, b) => a.at - b.at);
      const p = c.pending[0]; if (p && p.at <= target) { c.pending.shift(); c.t = p.at; p.fn(); } else c.t = target; } }; return c; };
  const model = (sim, log, withSignal) => {
    const res = new Resource(sim, { capacity: 1 });
    sim.process(function* () { yield sim.timeout(5); log.push(['tick', sim.now]); });
    sim.process(function* () { const r = res.request(); yield r; yield sim.timeout(7); res.release(r); log.push(['machine done', sim.now]); });
    sim.process(function* () { yield sim.timeout(1); const r = res.request(); yield r; log.push(['second got machine', sim.now]); res.release(r); });
    if (withSignal) sim.process(function* () { const v = yield sim.signal('go'); log.push(['go', v, sim.now]); yield sim.timeout(2); log.push(['acted', sim.now]); });
    sim.schedule(20, () => log.push(['end', sim.now]));
  };
  const plain = []; const s1 = new Sim({ seed: 1 }); model(s1, plain, false); s1.run();
  const c2 = fake(); const rt = []; const s2 = new Sim({ seed: 1, clock: c2 }); model(s2, rt, false);
  const wall = []; for (const at of [5, 7, 20]) s2.schedule(at, () => wall.push([s2.now, c2.now()]), { priority: 9 });
  await s2.runRealtime({ scale: 2 });
  const c3 = fake(); const sig = []; const s3 = new Sim({ seed: 1, clock: c3 }); model(s3, sig, true);
  c3.pending.push({ at: 24, fn: () => s3.inject('go', 'now') });
  const atRun = []; s3.schedule(5, () => atRun.push([s3.now, c3.now()]));
  await s3.runRealtime({ scale: 2 });
  // Each event ran exactly when the clock reached it (a fake clock only moves by sleeping, so a
  // sleep past an event would show here), and the model saw the same thing as under run().
  return { same: JSON.stringify(norm(plain)) === JSON.stringify(norm(rt)), wall, sig: norm(sig), atRun };
});

console.log(JSON.stringify(out));
`;

const node = (cwd, args) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') }; }
};
function evaluate(dir) {
  const h = join(mkdtempSync(join(tmpdir(), 'des-')), 'harness.mjs');
  writeFileSync(h, HARNESS);
  try { return JSON.parse(node(dir, [h]).out); } catch { return {}; }
}

export default async function check(dir) {
  const ref = mkdtempSync(join(tmpdir(), 'des-ref-'));
  cpSync(join(HERE, 'files'), ref, { recursive: true });
  cpSync(join(HERE, 'solution'), ref, { recursive: true });
  const want = evaluate(ref), got = evaluate(dir);
  const same = (k) => want[k] != null && !want[k].error && JSON.stringify(got[k]) === JSON.stringify(want[k]);
  const ms = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].filter(same);
  const tests = node(dir, ['test.mjs']).ok;
  const readme = existsSync(join(dir, 'README.md')) && readFileSync(join(dir, 'README.md'), 'utf8').length > 600;
  if (tests && readme && ms.length === 6) ms.push('m7');
  return {
    pass: ms.length === 7,
    detail: { milestones: `${ms.length}/7`, passed: ms.map((x) => x.toUpperCase()), tests_pass: tests, readme,
      failing: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].filter((k) => !ms.includes(k)).map((k) => `${k.toUpperCase()}${got[k]?.error ? `: ${got[k].error}` : ''}`) },
    progress: ms.length / 7,
  };
}

// For the selftest: the reference's own answers, so a broken scenario shows up before the souls do.
export const _evaluate = evaluate;
