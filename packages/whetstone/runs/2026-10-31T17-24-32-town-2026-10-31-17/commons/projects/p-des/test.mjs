// node test.mjs — exits 0 when every test passes.
import assert from 'node:assert/strict';
import { Sim, Resource, Store, Container, forecast, Interrupt } from './des.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// A fake clock that only advances when slept; records every sleep.
function fakeClock() {
  const c = { t: 1000, sleeps: [], now: () => c.t, sleep: async (ms) => { c.sleeps.push(ms); c.t += ms; } };
  return c;
}

// ---------------------------------------------------------------- M1
test('M1 events run in time order; run returns count; now advances', () => {
  const sim = new Sim(); const log = [];
  sim.schedule(5, () => log.push(['b', sim.now]));
  sim.schedule(1, () => log.push(['a', sim.now]));
  sim.schedule(5.5, () => log.push(['c', sim.now]));
  assert.equal(sim.now, 0);
  assert.equal(sim.run(), 3);
  assert.deepEqual(log, [['a', 1], ['b', 5], ['c', 5.5]]);
  assert.equal(sim.now, 5.5);
});
test('M1 same time: lower priority first, then scheduling order', () => {
  const sim = new Sim(); const log = [];
  sim.schedule(2, () => log.push('p0-first'));
  sim.schedule(2, () => log.push('p1'), { priority: 1 });
  sim.schedule(2, () => log.push('p-1'), { priority: -1 });
  sim.schedule(2, () => log.push('p0-second'));
  sim.run();
  assert.deepEqual(log, ['p-1', 'p0-first', 'p0-second', 'p1']);
});
test('M1 events scheduled from events, zero delay runs after same-time earlier ones', () => {
  const sim = new Sim(); const log = [];
  sim.schedule(1, () => { log.push('x'); sim.schedule(0, () => log.push('x0')); });
  sim.schedule(1, () => log.push('y'));
  sim.run();
  assert.deepEqual(log, ['x', 'y', 'x0']);
});
test('M1 cancel; negative delay throws', () => {
  const sim = new Sim(); const log = [];
  const h = sim.schedule(1, () => log.push('no'));
  sim.schedule(2, () => log.push('yes'));
  sim.cancel(h);
  assert.equal(sim.run(), 1);
  assert.deepEqual(log, ['yes']);
  assert.throws(() => sim.schedule(-1, () => {}), RangeError);
  assert.throws(() => sim.schedule(NaN, () => {}), RangeError);
});
test('M1 run until: stops, sets now = until, events at until run, resumes later', () => {
  const sim = new Sim(); const log = [];
  for (const t of [1, 3, 5, 7]) sim.schedule(t, () => log.push(t));
  assert.equal(sim.run({ until: 5 }), 3);
  assert.equal(sim.now, 5);
  assert.equal(sim.run({ until: 6 }), 0);
  assert.equal(sim.now, 6);
  assert.equal(sim.run(), 1);
  assert.deepEqual(log, [1, 3, 5, 7]);
  const s2 = new Sim(); assert.equal(s2.run({ until: 10 }), 0); assert.equal(s2.now, 10);
});
test('M1 seeded random: same seed same stream, different seed differs, ranges', () => {
  const a = new Sim({ seed: 42 }), b = new Sim({ seed: 42 }), c = new Sim({ seed: 43 });
  const xa = Array.from({ length: 100 }, () => a.random());
  const xb = Array.from({ length: 100 }, () => b.random());
  const xc = Array.from({ length: 100 }, () => c.random());
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  assert.ok(xa.every((x) => x >= 0 && x < 1));
  assert.deepEqual(new Sim().random(), new Sim({ seed: 1 }).random());
  const s = new Sim({ seed: 7 }); const N = 100000;
  let sum = 0, sumE = 0, sumT = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const u = s.uniform(2, 4); sum += u; lo = Math.min(lo, u); hi = Math.max(hi, u);
    sumE += s.exponential(0.5);
    const t = s.triangular(1, 2, 6); assert.ok(t >= 1 && t <= 6); sumT += t;
  }
  assert.ok(lo >= 2 && hi < 4);
  close(sum / N, 3, 0.02);
  close(sumE / N, 2, 0.05);   // mean 1/rate
  close(sumT / N, 3, 0.03);   // (1+2+6)/3
});
test('M1 same seed, same model -> same trace', () => {
  const trace = (seed) => {
    const sim = new Sim({ seed }); const log = [];
    const go = (k) => sim.schedule(sim.exponential(1), () => { log.push([k, sim.now]); if (k < 50) go(k + 1); });
    go(0); go(100); sim.run(); return log;
  };
  assert.deepEqual(trace(5), trace(5));
  assert.notDeepEqual(trace(5), trace(6));
});

// ---------------------------------------------------------------- M2
test('M2 process with timeouts; handle fires with return value', () => {
  const sim = new Sim(); const log = [];
  function* worker(name, d) { const v = yield sim.timeout(d, name + '!'); log.push([v, sim.now]); return d * 10; }
  const p = sim.process(worker, 'w', 3);
  sim.process(function* () { const r = yield p; log.push(['parent', r, sim.now]); });
  assert.equal(p.isAlive, true);
  sim.run();
  assert.equal(p.isAlive, false);
  assert.deepEqual(log, [['w!', 3], ['parent', 30, 3]]);
});
test('M2 process started from a process: first step at the end of the parent step (ta-8ae0ce)', () => {
  const sim = new Sim(); const log = [];
  function* child() { log.push('c1'); yield sim.timeout(0); log.push('c2'); }
  sim.process(function* () {
    log.push('p1'); sim.process(child); log.push('p2'); yield sim.timeout(0); log.push('p3');
  });
  sim.run();
  assert.deepEqual(log, ['p1', 'p2', 'c1', 'p3', 'c2']); // SimPy order
});
test('M2 a child error does not come out of the parent process() call', () => {
  const sim = new Sim(); const log = [];
  sim.process(function* () {
    try { sim.process(function* () { throw new Error('child'); }); log.push('parent went on'); }
    catch (e) { log.push('caught in parent'); }
    yield sim.timeout(1);
  });
  assert.throws(() => sim.run(), /child/);
  assert.deepEqual(log, ['parent went on']);
});
// ta-e02f22 (Morphyx, turn 4): one line per instant, (time, priority, seq), as in SimPy.
test('M2 a timeout(0) taken before a succeed() resumes first (one same-time line)', () => {
  const sim = new Sim(), log = []; const ev = sim.event();
  sim.process(function* () { yield ev; log.push('q'); });
  sim.process(function* () { yield sim.timeout(0); log.push('r'); });
  sim.process(function* () { ev.succeed(); log.push('a'); });
  sim.run();
  assert.deepEqual(log, ['a', 'r', 'q']); // SimPy: a r q
});
test('M2 schedule(0) made before a succeed() in the same step runs before the woken process', () => {
  const sim = new Sim(), log = []; const ev = sim.event();
  sim.process(function* () { yield ev; log.push('q'); });
  sim.process(function* () { yield sim.timeout(1); sim.schedule(0, () => log.push('f')); ev.succeed(); log.push('a'); });
  assert.equal(sim.run(), 2); // the timeout and f; resumptions are not counted
  assert.deepEqual(log, ['a', 'f', 'q']);
});
test('M2 a timeout resumes its waiter inside its own slot, ahead of later same-time events', () => {
  const sim = new Sim(), log = [];
  sim.process(function* () { yield sim.timeout(1); log.push('p'); });
  sim.run({ until: 0 }); // the first step runs and takes the timeout before f is scheduled
  sim.schedule(1, () => log.push('f'));
  sim.run();
  assert.deepEqual(log, ['p', 'f']);
});
test('M2 a process start and an interrupt are urgent: ahead of an earlier succeed()', () => {
  const sim = new Sim(), log = []; const ev = sim.event();
  sim.process(function* () { yield ev; log.push('q'); });
  sim.process(function* () { ev.succeed(); sim.process(function* () { log.push('c'); yield sim.timeout(5); }); log.push('a'); yield sim.timeout(1); });
  sim.run();
  assert.deepEqual(log, ['a', 'c', 'q']);
});
test('M2 yielding an already processed event continues in the same step', () => {
  const sim = new Sim(), log = []; const ev = sim.event();
  sim.process(function* () { ev.succeed(7); yield sim.timeout(1); sim.schedule(0, () => log.push('f')); const v = yield ev; log.push(['p', v]); });
  sim.run();
  assert.deepEqual(log, [['p', 7], 'f']);
});
test('M2 interrupt before the first step: delivered at the first yield', () => {
  const sim = new Sim(); const log = [];
  const p = sim.process(function* () {
    log.push('start');
    try { yield sim.timeout(5); log.push('not here'); } catch (e) { log.push(['int', e.cause, sim.now]); }
  });
  assert.equal(log.length, 0);
  p.interrupt('early');
  assert.equal(sim.run(), 0); // the abandoned timeout is not executed
  assert.deepEqual(log, ['start', ['int', 'early', 0]]);
});
test('M6 process() from outside during runRealtime starts at clock time and wakes the loop', async () => {
  let wake; const clock = { t: 0, now: () => clock.t,
    sleep: (ms) => new Promise((r) => { wake = () => { clock.t += ms; r(); }; }) };
  const sim = new Sim({ clock }); const log = [];
  sim.schedule(10, () => log.push(['late', sim.now]));
  const done = sim.runRealtime({ scale: 100 });
  await Promise.resolve();
  clock.t = 250; // 2.5 sim units in, loop still asleep waiting for t=10
  sim.process(function* () { log.push(['start', sim.now]); yield sim.timeout(1); log.push(['end', sim.now]); });
  for (let i = 0; i < 20 && log.length < 3; i++) { await new Promise((r) => setTimeout(r, 0)); if (wake) { const w = wake; wake = null; w(); } }
  await done;
  assert.deepEqual(log, [['start', 2.5], ['end', 3.5], ['late', 10]]);
});
test('M2 process started at top level runs before same-time events', () => {
  const sim = new Sim(); const log = [];
  sim.schedule(0, () => log.push('event'));
  sim.process(function* () { log.push('proc'); yield sim.timeout(0); log.push('proc2'); });
  sim.run();
  assert.deepEqual(log, ['proc', 'event', 'proc2']);
});
test('M2 event: succeed once, waiters receive value; second succeed throws', () => {
  const sim = new Sim(); const log = [];
  const ev = sim.event();
  sim.process(function* () { log.push(['a', yield ev, sim.now]); });
  sim.process(function* () { log.push(['b', yield ev, sim.now]); });
  sim.schedule(4, () => ev.succeed('go'));
  sim.run();
  assert.deepEqual(log, [['a', 'go', 4], ['b', 'go', 4]]);
  assert.throws(() => ev.succeed('again'));
  // yielding an already-fired event resumes at once with its value
  sim.process(function* () { log.push(['late', yield ev, sim.now]); });
  sim.run();
  assert.deepEqual(log.at(-1), ['late', 'go', 4]);
});
test('M2 interrupt: Interrupt with cause, timeout abandoned, process can go on', () => {
  const sim = new Sim(); const log = [];
  const p = sim.process(function* () {
    try { yield sim.timeout(10); log.push('not here'); }
    catch (e) { assert.ok(e instanceof Interrupt); log.push(['int', e.cause, sim.now]); }
    yield sim.timeout(1); log.push(['after', sim.now]);
    return 'done';
  });
  sim.schedule(3, () => p.interrupt('breakdown'));
  sim.run();
  assert.deepEqual(log, [['int', 'breakdown', 3], ['after', 4]]);
  assert.equal(sim.now, 4); // the abandoned timeout at 10 never ran
  assert.equal(p.value, 'done');
  assert.throws(() => p.interrupt('late'));
});
test('M2 uncaught interrupt ends the process quietly', () => {
  const sim = new Sim();
  const p = sim.process(function* () { yield sim.timeout(10); });
  sim.schedule(1, () => p.interrupt());
  sim.run();
  assert.equal(p.isAlive, false);
  assert.equal(sim.now, 1);
});
test('M2 two interrupts before delivery are both delivered, in order', () => {
  const sim = new Sim(); const got = [];
  const p = sim.process(function* () {
    for (;;) { try { yield sim.timeout(100); return; } catch (e) { got.push(e.cause); if (got.length === 2) return; } }
  });
  sim.schedule(1, () => { p.interrupt('a'); p.interrupt('b'); });
  sim.run();
  assert.deepEqual(got, ['a', 'b']);
});
test('M2 allOf / anyOf', () => {
  const sim = new Sim(); const log = [];
  sim.process(function* () {
    const v = yield sim.allOf([sim.timeout(3, 'x'), sim.timeout(1, 'y'), sim.timeout(2, 'z')]);
    log.push(['all', v, sim.now]);
    const w = yield sim.anyOf([sim.timeout(5, 'slow'), sim.timeout(2, 'fast')]);
    log.push(['any', w, sim.now]);
    const e = yield sim.allOf([]);
    log.push(['empty', e, sim.now]);
  });
  sim.run();
  assert.deepEqual(log, [['all', ['x', 'y', 'z'], 3], ['any', { index: 1, value: 'fast' }, 5], ['empty', [], 5]]);
});
test('M2 errors in processes propagate to waiters, else out of run()', () => {
  const sim = new Sim(); const log = [];
  const bad = sim.process(function* () { yield sim.timeout(1); throw new Error('boom'); });
  sim.process(function* () { try { yield bad; } catch (e) { log.push(e.message); } });
  sim.run();
  assert.deepEqual(log, ['boom']);
  const s2 = new Sim();
  s2.process(function* () { yield s2.timeout(1); throw new Error('loud'); });
  assert.throws(() => s2.run(), /loud/);
});

// ---------------------------------------------------------------- M3
test('M3 resource: capacity, FIFO, priority, stats', () => {
  const sim = new Sim(); const res = new Resource(sim, { capacity: 1 }); const log = [];
  function* job(name, at, dur, priority = 0) {
    yield sim.timeout(at);
    const req = res.request({ priority });
    const r = yield req;
    assert.equal(r, req);
    log.push([name, sim.now]);
    yield sim.timeout(dur);
    res.release(req);
  }
  sim.process(job, 'A', 0, 4);
  sim.process(job, 'B', 1, 2);      // waits 3
  sim.process(job, 'C', 2, 1, -1);  // higher priority than B: goes first, waits 2
  sim.process(function* () { yield sim.timeout(1.5); assert.equal(res.inUse, 1); assert.equal(res.queueLength, 1); });
  sim.run();
  assert.deepEqual(log, [['A', 0], ['C', 4], ['B', 5]]);
  const s = res.stats();
  assert.equal(sim.now, 7);
  close(s.utilization, 1);
  assert.equal(s.served, 3);
  close(s.meanWait, (0 + 2 + 4) / 3);
  close(s.meanQueue, (1 * 1 + 2 * 2 + 1 * 1) / 7); // B alone 1-2, B+C 2-4, B 4-5
});
test('M3 capacity 2 and utilization below 1', () => {
  const sim = new Sim(); const res = new Resource(sim, { capacity: 2 });
  for (let i = 0; i < 3; i++) sim.process(function* () { const q = res.request(); yield q; yield sim.timeout(2); res.release(q); });
  sim.run();
  const s = res.stats();
  assert.equal(sim.now, 4);
  close(s.utilization, (2 * 2 + 1 * 2) / (2 * 4));
  close(s.meanWait, 2 / 3);
  close(s.meanQueue, 2 / 4);
});
test('M3 releasing an ungranted request withdraws it; interrupt withdraws a pending request', () => {
  const sim = new Sim(); const res = new Resource(sim); const log = [];
  sim.process(function* () { const q = res.request(); yield q; yield sim.timeout(10); res.release(q); });
  const w = sim.process(function* () {
    const q = res.request();
    try { yield q; log.push('granted?!'); } catch (e) { log.push(['int', sim.now, res.queueLength]); }
  });
  sim.process(function* () {
    yield sim.timeout(1);
    const q = res.request();
    const r = yield sim.anyOf([q, sim.timeout(2)]);
    if (r.index === 1) { res.release(q); log.push(['reneged', sim.now, res.queueLength]); }
  });
  sim.schedule(5, () => w.interrupt());
  sim.process(function* () { yield sim.timeout(6); const q = res.request(); yield q; log.push(['last', sim.now]); res.release(q); });
  sim.run();
  assert.deepEqual(log, [['reneged', 3, 1], ['int', 5, 0], ['last', 10]]);
  assert.equal(res.stats().served, 2);
});

// ---------------------------------------------------------------- M4
test('M4 store: FIFO, get waits while empty, put waits while full', () => {
  const sim = new Sim(); const st = new Store(sim, { capacity: 2 }); const log = [];
  sim.process(function* () {
    for (const x of ['a', 'b', 'c', 'd']) { yield st.put(x); log.push(['put', x, sim.now]); }
  });
  sim.process(function* () {
    yield sim.timeout(5);
    assert.deepEqual(st.items, ['a', 'b']);
    for (let i = 0; i < 4; i++) { const x = yield st.get(); log.push(['got', x, sim.now]); yield sim.timeout(1); }
  });
  sim.run();
  assert.deepEqual(log, [
    ['put', 'a', 0], ['put', 'b', 0], ['got', 'a', 5], ['put', 'c', 5],
    ['got', 'b', 6], ['put', 'd', 6], ['got', 'c', 7], ['got', 'd', 8]]);
  const items = st.items; items.push('zzz'); assert.deepEqual(st.items, []);
});
test('M4 container: get waits for the amount; put waits for room', () => {
  const sim = new Sim(); const tank = new Container(sim, { capacity: 10, init: 2 }); const log = [];
  sim.process(function* () { yield tank.get(5); log.push(['got5', sim.now, tank.level]); });
  sim.process(function* () { yield sim.timeout(1); yield tank.put(4); log.push(['put4', sim.now, tank.level]); });
  sim.process(function* () { yield sim.timeout(2); yield tank.put(9); log.push(['put9', sim.now, tank.level]); });
  sim.process(function* () { yield sim.timeout(3); yield tank.get(6); log.push(['got6', sim.now, tank.level]); });
  sim.run();
  // level 2 -> 6 at t1, get5 -> 1; t2 put9 fits? 1+9=10 yes -> 10; t3 get6 -> 4
  assert.deepEqual(log, [['put4', 1, 1], ['got5', 1, 1], ['put9', 2, 10], ['got6', 3, 4]]);
  assert.equal(tank.level, 4);
});

test('M4 container: a put waits while it would overflow', () => {
  const sim = new Sim(); const tank = new Container(sim, { capacity: 10, init: 9 }); const log = [];
  sim.process(function* () { yield tank.put(3); log.push(['put3', sim.now, tank.level]); });
  sim.process(function* () { yield sim.timeout(4); yield tank.get(5); log.push(['got5', sim.now]); });
  sim.run();
  assert.deepEqual(log, [['got5', 4], ['put3', 4, 7]]);
});

// ---------------------------------------------------------------- M5
test('M5 a task that does not fit is skipped, not a barrier', () => {
  const f = forecast({
    tasks: [
      { id: 'A', duration: 5, uses: { crew: 1 } },
      { id: 'B', duration: 1, uses: { crew: 2 } },
      { id: 'C', duration: 1, uses: { crew: 1 } },
    ], resources: { crew: 2 },
  }, { runs: 1 });
  // t0: A starts, B doesn't fit, C starts (ends 1). t5: B starts, ends 6.
  assert.equal(f.p50, 6);
  assert.deepEqual(f.criticality, { A: 1, B: 1, C: 0 });
});
test('M5 nearest-rank percentiles on a non-integer rank', () => {
  // One task: each run's finish is one uniform draw, in run order, from Sim({ seed }) (README decision 10).
  const s = new Sim({ seed: 4 });
  const xs = Array.from({ length: 10 }, () => s.uniform(1, 2)).sort((a, b) => a - b);
  const f = forecast({ tasks: [{ id: 't', duration: { dist: 'uniform', min: 1, max: 2 } }], resources: {} }, { runs: 10, seed: 4 });
  assert.equal(f.p50, xs[4]); assert.equal(f.p80, xs[7]); assert.equal(f.p95, xs[9]);
  close(f.mean, xs.reduce((a, b) => a + b) / 10);
});
test('M5 fixed durations, no resources: every percentile = critical path', () => {
  const project = {
    tasks: [
      { id: 'a', duration: 3, deps: [] },
      { id: 'b', duration: 4, deps: ['a'] },
      { id: 'c', duration: 2, deps: [] },
      { id: 'd', duration: 1, deps: ['b', 'c'] },
    ], resources: {},
  };
  const f = forecast(project, { runs: 50 });
  assert.deepEqual(f, { mean: 8, p50: 8, p80: 8, p95: 8, criticality: { a: 1, b: 1, c: 0, d: 1 } });
});
test('M5 resources serialise tasks; a non-fitting task does not hold back later ones', () => {
  const project = {
    tasks: [
      { id: 'big', duration: 5, uses: { crew: 2 } },
      { id: 'small1', duration: 2, uses: { crew: 1 } },
      { id: 'small2', duration: 3, uses: { crew: 1 } },
    ], resources: { crew: 2 },
  };
  // t0: big takes 2 crew; smalls wait. t5: small1, small2 start. finish 8.
  let f = forecast(project, { runs: 3 });
  assert.equal(f.p50, 8);
  assert.deepEqual(f.criticality, { big: 1, small1: 0, small2: 1 });
  project.resources.crew = 3;
  // t0: big (2) and small1 (1) start; small2 doesn't fit but nothing blocks. t2: small2 starts -> 5.
  f = forecast(project, { runs: 3 });
  assert.equal(f.p50, 5);
  assert.deepEqual(f.criticality, { big: 1, small1: 1, small2: 1 });
});
test('M5 random durations: reproducible, percentiles ordered, nearest rank', () => {
  const project = {
    tasks: [
      { id: 'a', duration: { dist: 'triangular', min: 1, mode: 2, max: 6 } },
      { id: 'b', duration: { dist: 'uniform', min: 2, max: 4 } },
      { id: 'c', duration: 1, deps: ['a', 'b'] },
    ], resources: {},
  };
  const f1 = forecast(project, { runs: 2000, seed: 9 });
  const f2 = forecast(project, { runs: 2000, seed: 9 });
  assert.deepEqual(f1, f2);
  assert.ok(f1.p50 <= f1.p80 && f1.p80 <= f1.p95);
  close(f1.criticality.c, 1);
  close(f1.criticality.a + f1.criticality.b, 1, 1e-12); // continuous: exactly one of them
  // E[max(a,b)] + 1: computed by numerical integration
  let m = 0; const K = 4000;
  for (let i = 0; i < K; i++) {
    const x = 1 + 5 * (i + 0.5) / K; // a's pdf * P(b<x) * x ... E[max] = ∫ (1 - Fa Fb)
    const Fa = x < 2 ? (x - 1) ** 2 / 5 : 1 - (6 - x) ** 2 / 20;
    const Fb = Math.min(1, Math.max(0, (x - 2) / 2));
    m += (1 - Fa * Fb) * 5 / K;
  }
  close(f1.mean, 1 + m + 1, 0.05);
  const one = forecast({ tasks: [{ id: 'x', duration: 7 }], resources: {} }, { runs: 1 });
  assert.deepEqual(one, { mean: 7, p50: 7, p80: 7, p95: 7, criticality: { x: 1 } });
});
test('M5 zero-duration tasks and errors', () => {
  const f = forecast({ tasks: [{ id: 'm', duration: 0 }, { id: 'n', duration: 2, deps: ['m'] }], resources: {} }, { runs: 2 });
  assert.equal(f.mean, 2); assert.deepEqual(f.criticality, { m: 1, n: 1 });
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, deps: ['b'] }, { id: 'b', duration: 1, deps: ['a'] }], resources: {} }));
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, uses: { r: 3 } }], resources: { r: 2 } }));
});

// ---------------------------------------------------------------- M6
function shop(sim, log) {
  const res = new Resource(sim, { capacity: 2 });
  const st = new Store(sim);
  sim.process(function* () {
    for (let i = 0; i < 8; i++) {
      yield sim.timeout(sim.exponential(1));
      const id = i;
      sim.process(function* () {
        const q = res.request(); yield q; log.push(['start', id, sim.now]);
        yield sim.timeout(sim.uniform(0.5, 2)); res.release(q); yield st.put(id); log.push(['done', id, sim.now]);
      });
    }
  });
  sim.process(function* () { for (let i = 0; i < 8; i++) { const x = yield st.get(); log.push(['ship', x, sim.now]); } });
}
test('M6 same model, same trace under run() and runRealtime() with a fake clock', async () => {
  const a = new Sim({ seed: 3 }), la = []; shop(a, la); const na = a.run();
  const clock = fakeClock();
  const b = new Sim({ seed: 3, clock }), lb = []; shop(b, lb); const nb = await b.runRealtime({ scale: 10 });
  assert.deepEqual(lb, la);
  assert.equal(nb, na);
  assert.equal(b.now, a.now);
  close(clock.t - 1000, a.now * 10, 1e-6); // slept exactly up to the last event
});
test('M6 sleeps exactly up to each event, never past', async () => {
  const clock = fakeClock();
  const sim = new Sim({ clock }); const seen = [];
  for (const t of [1, 2.5, 2.5, 4]) sim.schedule(t, () => seen.push([sim.now, clock.now() - 1000]));
  const n = await sim.runRealtime({ scale: 100, until: 10 });
  assert.equal(n, 4);
  assert.deepEqual(seen, [[1, 100], [2.5, 250], [2.5, 250], [4, 400]]);
  assert.deepEqual(clock.sleeps, [100, 150, 150, 600]);
  assert.equal(sim.now, 10);
});
test('M6 inject while waiting: arrives at clock-elapsed / scale; signal waits for next', async () => {
  const clock = fakeClock();
  // this clock's sleep lets the outside world inject partway through
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms);
    if (clock.t - 1000 < 300 && clock.t + ms - 1000 > 300) { clock.t = 1300; sim.inject('door', 'open'); return; }
    clock.t += ms;
  };
  const sim = new Sim({ clock }); const log = [];
  sim.process(function* () { const v = yield sim.signal('door'); log.push([v, sim.now]); yield sim.timeout(1); log.push(['after', sim.now]); });
  sim.schedule(10, () => log.push(['tick', sim.now]));
  await sim.runRealtime({ scale: 100 });
  assert.deepEqual(log, [['open', 3], ['after', 4], ['tick', 10]]);
  assert.equal(clock.t, 2000);
});
test('M6 inject from model code under run(); undelivered injections are dropped', () => {
  const sim = new Sim(); const log = [];
  sim.inject('x', 'too early');
  sim.process(function* () { yield sim.timeout(1); log.push(yield sim.signal('x')); });
  sim.schedule(2, () => sim.inject('x', 'hello'));
  sim.run();
  assert.deepEqual(log, ['hello']);
});
test('M6 an injection wakes a long sleep (real clock)', async () => {
  const sim = new Sim(); const t0 = performance.now(); const log = [];
  sim.process(function* () { const v = yield sim.signal('go'); log.push([v, performance.now() - t0]); });
  sim.schedule(400, () => {});
  setTimeout(() => sim.inject('go', 'now'), 30);
  await sim.runRealtime({ scale: 1 });
  assert.equal(log[0][0], 'now');
  assert.ok(log[0][1] < 200, `handled at ${log[0][1]} ms, not woken`);
});
test('M6 real clock: events not before their time', async () => {
  const sim = new Sim(); const t0 = performance.now(); const at = [];
  sim.schedule(20, () => at.push(performance.now() - t0));
  await sim.runRealtime({ scale: 1 });
  assert.ok(at[0] >= 19, `ran at ${at[0]} ms`);
});

// ---------------------------------------------------------------- scale (Morphyx, des turn 2)
// The heap sifts a hole and the queues are head-indexed FIFOs that compact after 1024 shifts;
// these runs are big enough to cross the compaction and to exercise ties deep in the heap.
test('scale: 20k events with many ties run in (time, priority, seq) order', () => {
  const sim = new Sim({ seed: 4 }); const want = []; const got = [];
  for (let i = 0; i < 20000; i++) {
    const t = Math.floor(sim.random() * 50), p = Math.floor(sim.random() * 3) - 1;
    want.push({ t, p, i });
    sim.schedule(t, () => got.push(i), { priority: p });
  }
  want.sort((a, b) => a.t - b.t || a.p - b.p || a.i - b.i);
  assert.equal(sim.run(), 20000);
  assert.deepEqual(got, want.map((w) => w.i));
});
test('scale: 3000 waiters, mixed priorities, withdrawals across queue compaction', () => {
  const sim = new Sim(); const res = new Resource(sim); const order = []; const reqs = [];
  for (let i = 0; i < 3000; i++) {
    const req = res.request({ priority: i % 3 }); reqs.push(req);
    sim.process(function* () { yield req; order.push(i); yield sim.timeout(1); res.release(req); });
  }
  sim.schedule(0.5, () => { for (let i = 1; i < 3000; i += 7) res.release(reqs[i]); });
  sim.run();
  const rest = [];
  for (let i = 1; i < 3000; i++) if ((i - 1) % 7 !== 0) rest.push(i);
  rest.sort((a, b) => (a % 3) - (b % 3) || a - b);
  assert.deepEqual(order, [0, ...rest]);
  assert.equal(res.stats().served, 1 + rest.length);
});
test('scale: store keeps FIFO and items across compaction', () => {
  const sim = new Sim(); const st = new Store(sim); const got = [];
  for (let i = 0; i < 5000; i++) st.put(i);
  sim.process(function* () { for (let k = 0; k < 3000; k++) got.push(yield st.get()); });
  sim.run();
  assert.deepEqual(got, Array.from({ length: 3000 }, (_, i) => i));
  assert.deepEqual(st.items, Array.from({ length: 2000 }, (_, i) => 3000 + i));
});

// ---------------------------------------------------------------- run
let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.split('\n').join('\n      ')); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
