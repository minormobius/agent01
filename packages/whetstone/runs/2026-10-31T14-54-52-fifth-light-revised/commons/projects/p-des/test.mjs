// node test.mjs — exits 0 when everything passes.
import assert from 'node:assert/strict';
import { Sim, Interrupt, Resource, Store, Container, forecast, simulateProject } from './des.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

// fake clock: time only moves when slept; records every sleep
function fakeClock() {
  const c = { t: 1000, sleeps: [] };
  c.now = () => c.t;
  c.sleep = (ms) => { c.sleeps.push(ms); c.t += ms; return Promise.resolve(); };
  return c;
}

// ------------------------------------------------------------------ M1
test('M1 time order, priority, then schedule order', () => {
  const s = new Sim(), log = [];
  s.schedule(5, () => log.push('a5'));
  s.schedule(1, () => log.push('b1'));
  s.schedule(5, () => log.push('c5-p-1'), { priority: -1 });
  s.schedule(5, () => log.push('d5'));
  s.schedule(5, () => log.push('e5-p2'), { priority: 2 });
  s.schedule(0, () => log.push('f0'));
  assert.equal(s.run(), 6);
  assert.deepEqual(log, ['f0', 'b1', 'c5-p-1', 'a5', 'd5', 'e5-p2']);
  assert.equal(s.now, 5);
});
test('M1 events scheduled from events, same time, keep FIFO', () => {
  const s = new Sim(), log = [];
  s.schedule(1, () => { log.push('x'); s.schedule(0, () => log.push('x+0')); });
  s.schedule(1, () => log.push('y'));
  s.run();
  assert.deepEqual(log, ['x', 'y', 'x+0']);
});
test('M1 cancel', () => {
  const s = new Sim(), log = [];
  const h = s.schedule(2, () => log.push('no'));
  s.schedule(1, () => log.push('yes'));
  assert.equal(s.cancel(h), true);
  assert.equal(s.cancel(h), false);
  assert.equal(s.run(), 1);
  assert.deepEqual(log, ['yes']);
  assert.equal(s.now, 1);
});
test('M1 cancel from inside an earlier event at the same time', () => {
  const s = new Sim(), log = [];
  let h;
  s.schedule(3, () => s.cancel(h));
  h = s.schedule(3, () => log.push('no'));
  assert.equal(s.run(), 1);
  assert.deepEqual(log, []);
});
test('M1 run until: inclusive, now becomes until, resumable', () => {
  const s = new Sim(), log = [];
  for (const t of [1, 2, 3, 4]) s.schedule(t, () => log.push(t));
  assert.equal(s.run({ until: 2 }), 2);
  assert.equal(s.now, 2);
  assert.equal(s.run({ until: 2.5 }), 0);
  assert.equal(s.now, 2.5);
  assert.equal(s.run(), 2);
  assert.deepEqual(log, [1, 2, 3, 4]);
  assert.equal(s.now, 4);
  assert.equal(s.run({ until: 10 }), 0);
  assert.equal(s.now, 10);
});
test('M1 bad delays throw', () => {
  const s = new Sim();
  assert.throws(() => s.schedule(-1, () => {}), RangeError);
  assert.throws(() => s.schedule(NaN, () => {}));
  assert.throws(() => s.schedule('1', () => {}));
  assert.throws(() => s.timeout(-0.001));
  assert.throws(() => s.run({ until: -1 }));
});
test('M1 seeded random: same seed same stream, different seed different, range', () => {
  const a = new Sim({ seed: 42 }), b = new Sim({ seed: 42 }), c = new Sim({ seed: 43 });
  const xa = Array.from({ length: 1000 }, () => a.random());
  const xb = Array.from({ length: 1000 }, () => b.random());
  const xc = Array.from({ length: 1000 }, () => c.random());
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  assert.ok(xa.every((x) => x >= 0 && x < 1));
  assert.deepEqual([new Sim().random()], [new Sim({ seed: 1 }).random()]);
});
test('M1 distributions: moments within 4 SE over 100k draws', () => {
  const s = new Sim({ seed: 7 }), N = 100000;
  const m = (f) => { let a = 0, q = 0; for (let i = 0; i < N; i++) { const x = f(); a += x; q += x * x; } const mu = a / N; return { mu, sd: Math.sqrt(q / N - mu * mu) }; };
  const u = m(() => s.random()); near(u.mu, 0.5, 4 * Math.sqrt(1 / 12 / N));
  const e = m(() => s.exponential(2)); near(e.mu, 0.5, 4 * 0.5 / Math.sqrt(N)); near(e.sd, 0.5, 0.01);
  const un = m(() => s.uniform(3, 7)); near(un.mu, 5, 4 * Math.sqrt(16 / 12 / N));
  const tri = m(() => s.triangular(1, 2, 6)); // mean (1+2+6)/3 = 3, var (1+4+36-2-6-12)/18 = 21/18
  near(tri.mu, 3, 4 * Math.sqrt(21 / 18 / N)); near(tri.sd, Math.sqrt(21 / 18), 0.01);
  for (let i = 0; i < 1000; i++) { const x = s.triangular(1, 2, 6); assert.ok(x >= 1 && x <= 6); }
  assert.equal(s.triangular(4, 4, 4), 4);
  assert.throws(() => s.exponential(0));
  assert.throws(() => s.triangular(3, 1, 2));
});
test('M1 same seed same model → same trace', () => {
  const trace = (seed) => {
    const s = new Sim({ seed }), out = [];
    const tick = (k) => { out.push([s.now, k]); if (k < 200) s.schedule(s.exponential(1), () => tick(k + 1), { priority: Math.floor(s.random() * 3) }); };
    s.schedule(0, () => tick(0)); s.schedule(0, () => tick(100));
    s.run();
    return out;
  };
  assert.deepEqual(trace(5), trace(5));
  assert.notDeepEqual(trace(5), trace(6));
});

// ------------------------------------------------------------------ M2
test('M2 process, timeout value, return value via yielding the process', () => {
  const s = new Sim(), log = [];
  const child = s.process(function* (x) { const v = yield s.timeout(3, 'hi'); log.push([s.now, v]); return x * 2; }, 21);
  s.process(function* () { const r = yield child; log.push([s.now, 'child', r]); });
  s.run();
  assert.deepEqual(log, [[3, 'hi'], [3, 'child', 42]]);
  assert.equal(child.isAlive, false);
});
test('M2 process starts now, not synchronously; isAlive true until it returns', () => {
  const s = new Sim(), log = [];
  s.run({ until: 5 });
  const p = s.process(function* () { log.push(s.now); yield s.timeout(1); });
  assert.deepEqual(log, []);
  assert.equal(p.isAlive, true);
  s.run();
  assert.deepEqual(log, [5]);
  assert.equal(s.now, 6);
  assert.equal(p.isAlive, false);
});
test('M2 event succeed once; later calls throw; value delivered to every waiter', () => {
  const s = new Sim(), log = [];
  const ev = s.event();
  for (const k of ['a', 'b']) s.process(function* () { log.push([k, yield ev, s.now]); });
  s.schedule(4, () => ev.succeed('go'));
  s.run();
  assert.deepEqual(log, [['a', 'go', 4], ['b', 'go', 4]]);
  assert.throws(() => ev.succeed('again'));
});
test('M2 yielding an already-fired event resumes at once with its value', () => {
  const s = new Sim(), log = [];
  const ev = s.event(); ev.succeed(9);
  s.schedule(2, () => s.process(function* () { log.push([yield ev, s.now]); }));
  s.run();
  assert.deepEqual(log, [[9, 2]]);
});
test('M2 interrupt: pending timeout abandoned, Interrupt with cause, process continues', () => {
  const s = new Sim(), log = [];
  const p = s.process(function* () {
    try { yield s.timeout(10); log.push('not here'); }
    catch (e) { assert.ok(e instanceof Interrupt); log.push(['int', e.cause, s.now]); }
    yield s.timeout(1);
    log.push(['done', s.now]);
  });
  s.schedule(3, () => p.interrupt('stop'));
  s.run();
  assert.deepEqual(log, [['int', 'stop', 3], ['done', 4]]);
  // the abandoned timeout still exists (it fires at 10, resuming nobody), as in SimPy
  assert.equal(s.now, 10);
  assert.throws(() => p.interrupt('again'));
});
test('M2 interrupt withdraws a pending resource request', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(5); r.release(q); });
  const w = s.process(function* () {
    try { yield r.request(); log.push('granted?!'); } catch (e) { log.push(['int', s.now]); }
  });
  s.process(function* () { yield s.timeout(1); const q = r.request(); yield q; log.push(['third', s.now]); r.release(q); });
  s.schedule(2, () => { assert.equal(r.queueLength, 2); w.interrupt(); assert.equal(r.queueLength, 1); });
  s.run();
  assert.deepEqual(log, [['int', 2], ['third', 5]]);
  assert.equal(r.inUse, 0);
});
test('M2 uncaught Interrupt ends the process and surfaces only if nobody is waiting', () => {
  const s = new Sim();
  const p = s.process(function* () { yield s.timeout(10); });
  const log = [];
  s.process(function* () { try { yield p; } catch (e) { log.push(e instanceof Interrupt); } });
  s.schedule(1, () => p.interrupt());
  s.run();
  assert.deepEqual(log, [true]);
  const s2 = new Sim();
  s2.process(function* () { yield s2.timeout(1); throw new Error('boom'); });
  assert.throws(() => s2.run(), /boom/);
});
test('M2 allOf / anyOf', () => {
  const s = new Sim(), log = [];
  s.process(function* () {
    const all = yield s.allOf([s.timeout(3, 'a'), s.timeout(1, 'b'), s.timeout(2, 'c')]);
    log.push([s.now, all]);
    const any = yield s.anyOf([s.timeout(5, 'x'), s.timeout(2, 'y'), s.timeout(2, 'z')]);
    log.push([s.now, any]);
    log.push([s.now, yield s.allOf([])]);
  });
  s.run();
  assert.deepEqual(log, [[3, ['a', 'b', 'c']], [5, { index: 1, value: 'y' }], [5, []]]);
});
test('M2 anyOf with a process handle and an event', () => {
  const s = new Sim(), log = [];
  const ev = s.event();
  const worker = s.process(function* () { yield s.timeout(4); return 'w'; });
  s.process(function* () { const r = yield s.anyOf([ev, worker]); log.push([s.now, r]); });
  s.run();
  assert.deepEqual(log, [[4, { index: 1, value: 'w' }]]);
});
test('M2 a process waits on a process that waits on a process', () => {
  const s = new Sim();
  const a = s.process(function* () { yield s.timeout(1); return 1; });
  const b = s.process(function* () { return (yield a) + (yield s.timeout(2, 10)); });
  let got;
  s.process(function* () { got = [yield b, s.now]; });
  s.run();
  assert.deepEqual(got, [11, 3]);
});

// ------------------------------------------------------------------ M3
test('M3 capacity, FIFO, priority, stats on a hand-checked trace', () => {
  const s = new Sim(), r = new Resource(s, { capacity: 1 }), log = [];
  const job = (name, at, dur, prio) => s.process(function* () {
    yield s.timeout(at);
    const q = r.request({ priority: prio });
    yield q; log.push([name, s.now]);
    yield s.timeout(dur); r.release(q);
  });
  job('A', 0, 4, 0); job('B', 1, 2, 0); job('C', 2, 2, -1); job('D', 3, 1, 0);
  s.run();
  // A 0-4; at 4 queue has B(p0,t1), C(p-1,t2), D(p0,t3): C first, then B, then D
  assert.deepEqual(log, [['A', 0], ['C', 4], ['B', 6], ['D', 8]]);
  const st = r.stats();
  assert.equal(s.now, 9);
  near(st.utilization, 9 / 9);
  assert.equal(st.served, 4);
  near(st.meanWait, (0 + 2 + 5 + 5) / 4); // A0, C 4-2, B 6-1, D 8-3
  // queue length: 1 on [1,2), 2 on [2,3), 3 on [3,4), 2 on [4,6), 1 on [6,8) → 1+2+3+4+2 = 12
  near(st.meanQueue, 12 / 9);
});
test('M3 capacity 2, utilization counts units', () => {
  const s = new Sim(), r = new Resource(s, { capacity: 2 });
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(10); r.release(q); });
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(5); r.release(q); });
  s.run();
  near(r.stats().utilization, 15 / 20);
  assert.equal(r.stats().meanQueue, 0);
  assert.equal(r.inUse, 0);
});
test('M3 releasing an ungranted request withdraws it; reneging with anyOf', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(10); r.release(q); });
  s.process(function* () {
    const q = r.request();
    const got = yield s.anyOf([q, s.timeout(3)]);
    if (got.index === 1) { r.release(q); log.push(['reneged', s.now, r.queueLength]); }
  });
  s.run();
  assert.deepEqual(log, [['reneged', 3, 0]]);
  assert.equal(r.stats().served, 1);
});
test('M3 M/M/1 against theory: Wq = ρ/(μ−λ)', () => {
  const s = new Sim({ seed: 3 }), r = new Resource(s), lam = 0.8, mu = 1;
  s.process(function* () {
    for (;;) {
      yield s.timeout(s.exponential(lam));
      s.process(function* () { const q = r.request(); yield q; yield s.timeout(s.exponential(mu)); r.release(q); });
    }
  });
  s.run({ until: 200000 });
  const st = r.stats();
  near(st.utilization, 0.8, 0.02, 'rho');
  near(st.meanWait, 4, 0.4, 'Wq');      // 0.8/(1-0.8)
  near(st.meanQueue, 3.2, 0.35, 'Lq');  // ρ²/(1−ρ)
});

// ------------------------------------------------------------------ M4
test('M4 store: FIFO, put blocks while full, get while empty, items is a copy', () => {
  const s = new Sim(), st = new Store(s, { capacity: 2 }), log = [];
  s.process(function* () { for (const x of ['a', 'b', 'c', 'd']) { yield st.put(x); log.push(['put', x, s.now]); } });
  s.process(function* () { yield s.timeout(5); for (let i = 0; i < 4; i++) { log.push(['got', yield st.get(), s.now]); yield s.timeout(1); } });
  s.run({ until: 1 });
  const items = st.items; items.push('zzz');
  assert.deepEqual(st.items, ['a', 'b']);
  s.run();
  assert.deepEqual(log, [['put', 'a', 0], ['put', 'b', 0], ['got', 'a', 5], ['put', 'c', 5], ['got', 'b', 6], ['put', 'd', 6], ['got', 'c', 7], ['got', 'd', 8]]);
});
test('M4 container: get waits for the amount; strict FIFO; level', () => {
  const s = new Sim(), c = new Container(s, { capacity: 100, init: 10 }), log = [];
  s.process(function* () { yield c.get(30); log.push(['big', s.now, c.level]); });
  s.process(function* () { yield s.timeout(1); yield c.get(5); log.push(['small', s.now, c.level]); });
  s.process(function* () { for (let i = 0; i < 5; i++) { yield s.timeout(2); yield c.put(10); } });
  s.run();
  // level 10 →(t2) 20 →(t4) 30: big takes 30 → 0; small (behind it) waits → (t6) 10 → small takes 5
  assert.deepEqual(log, [['big', 4, 0], ['small', 6, 5]]);
  assert.equal(c.level, 5 + 20);
  assert.throws(() => c.get(101));
  assert.throws(() => new Container(s, { capacity: 5, init: 6 }));
});
test('M4 container put waits while it would overflow', () => {
  const s = new Sim(), c = new Container(s, { capacity: 10, init: 8 }), log = [];
  s.process(function* () { yield c.put(5); log.push(['put', s.now, c.level]); });
  s.process(function* () { yield s.timeout(3); yield c.get(4); });
  s.run();
  assert.deepEqual(log, [['put', 3, 9]]);
});

// ------------------------------------------------------------------ M5
test('M5 fixed durations, no limits: every percentile is the critical path', () => {
  const p = { tasks: [
    { id: 'a', duration: 3, deps: [] }, { id: 'b', duration: 2, deps: ['a'] },
    { id: 'c', duration: 4, deps: ['a'] }, { id: 'd', duration: 1, deps: ['b', 'c'] },
  ], resources: {} };
  const f = forecast(p, { runs: 50 });
  for (const k of ['mean', 'p50', 'p80', 'p95']) assert.equal(f[k], 8);
  assert.deepEqual(f.criticality, { a: 1, b: 0, c: 1, d: 1 });
});
test('M5 resources serialize; list order decides; later task that fits is not held back', () => {
  const p = { tasks: [
    { id: 'big', duration: 5, uses: { crew: 2 } },
    { id: 'big2', duration: 5, uses: { crew: 2 } },
    { id: 'small', duration: 1, uses: { crew: 1 } },
  ], resources: { crew: 3 } };
  const r = simulateProject(p, [5, 5, 1]);
  assert.deepEqual(r.start, [0, 5, 0]); // big2 doesn't fit at 0, small does
  assert.equal(r.finish, 10);
  // big2 critical (ends at 10); big ends at 5 when big2 starts and shares crew → critical; small ends at 1 → not
  assert.deepEqual(r.critical, [true, true, false]);
});
test('M5 tasks finishing at the same instant all release before the scan', () => {
  // a and b both end at 2. Released together, 'wide' (listed first, needs 2) starts at 2.
  // Scanned after each release, 'narrow' would grab the first freed unit and 'wide' would wait.
  const p = { tasks: [
    { id: 'a', duration: 2, uses: { r: 1 } }, { id: 'b', duration: 2, uses: { r: 1 } },
    { id: 'wide', duration: 3, deps: ['a'], uses: { r: 2 } },
    { id: 'narrow', duration: 1, deps: ['a'], uses: { r: 1 } },
  ], resources: { r: 2 } };
  const r = simulateProject(p, [2, 2, 3, 1]);
  assert.deepEqual(r.start, [0, 0, 2, 5]);
  assert.equal(r.finish, 6);
});
test('M5 all-or-nothing units: a task never takes some of what it needs', () => {
  const p = { tasks: [
    { id: 'x', duration: 4, uses: { a: 1 } },
    { id: 'y', duration: 1, uses: { a: 1, b: 1 } },
    { id: 'z', duration: 2, uses: { b: 1 } },
  ], resources: { a: 1, b: 1 } };
  const r = simulateProject(p, [4, 1, 2]);
  assert.deepEqual(r.start, [0, 4, 0]);
  assert.equal(r.finish, 5);
  assert.deepEqual(r.critical, [true, true, false]); // z ends at 2, y starts at 4
});
test('M5 criticality through a shared resource with no dependency', () => {
  const p = { tasks: [{ id: 'a', duration: 3, uses: { m: 1 } }, { id: 'b', duration: 3, uses: { m: 1 } }], resources: { m: 1 } };
  assert.deepEqual(forecast(p, { runs: 10 }).criticality, { a: 1, b: 1 });
});
test('M5 nearest-rank percentiles and stochastic determinism', () => {
  const p = { tasks: [{ id: 't', duration: { dist: 'uniform', min: 0, max: 10 } }], resources: {} };
  const a = forecast(p, { runs: 2000, seed: 9 }), b = forecast(p, { runs: 2000, seed: 9 });
  assert.deepEqual(a, b);
  near(a.mean, 5, 0.3); near(a.p80, 8, 0.4); near(a.p95, 9.5, 0.3);
  // nearest-rank exactness with a known sample: 5 runs of a single task replays the sim's draws
  const r5 = forecast(p, { runs: 5, seed: 2 });
  const xs = (() => { const s = new Sim({ seed: 2 }); return Array.from({ length: 5 }, () => s.uniform(0, 10)); })().sort((x, y) => x - y);
  assert.equal(r5.p50, xs[2]); assert.equal(r5.p80, xs[3]); assert.equal(r5.p95, xs[4]);
});
test('M5 triangular PERT-ish chain: mean = sum of means', () => {
  const tri = { dist: 'triangular', min: 2, mode: 4, max: 9 };
  const p = { tasks: [{ id: 1, duration: tri }, { id: 2, duration: tri, deps: [1] }, { id: 3, duration: tri, deps: [2] }] };
  const f = forecast(p, { runs: 20000, seed: 4 });
  near(f.mean, 15, 0.1);
  assert.ok(f.p50 <= f.p80 && f.p80 <= f.p95);
});
test('M5 bad projects are refused by name', () => {
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, deps: ['zz'] }] }), /unknown task zz/);
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, deps: ['b'] }, { id: 'b', duration: 1, deps: ['a'] }] }), /cycle/);
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, uses: { r: 3 } }], resources: { r: 2 } }), /never start/);
  assert.throws(() => forecast({ tasks: [{ id: 'a', duration: 1, uses: { q: 1 } }], resources: {} }), /unknown resource/);
});
test('M5 zero-duration milestones and empty projects', () => {
  const p = { tasks: [{ id: 'm0', duration: 0 }, { id: 'a', duration: 2, deps: ['m0'] }, { id: 'm1', duration: 0, deps: ['a'] }] };
  const f = forecast(p, { runs: 3 });
  assert.equal(f.p95, 2);
  assert.deepEqual(f.criticality, { m0: 1, a: 1, m1: 1 });
  assert.equal(forecast({ tasks: [] }, { runs: 3 }).mean, 0);
});

// ------------------------------------------------------------------ M6
function shopModel(sim, log) {
  const desk = new Resource(sim, { capacity: 2 });
  const shelf = new Store(sim, { capacity: 3 });
  sim.process(function* () {
    for (let i = 0; i < 30; i++) {
      yield sim.timeout(sim.exponential(1));
      sim.process(function* () {
        const q = desk.request({ priority: i % 3 });
        yield q; log.push(['in', i, sim.now]);
        yield sim.timeout(sim.triangular(0.5, 1, 3)); desk.release(q);
        yield shelf.put(i); log.push(['out', i, sim.now]);
      });
    }
  });
  sim.process(function* () { for (;;) { const x = yield shelf.get(); yield sim.timeout(0.7); log.push(['ship', x, sim.now]); } });
  return desk;
}
test('M6 same model under run() and runRealtime(fake clock): identical trace', async () => {
  const a = [], b = [];
  const s1 = new Sim({ seed: 11 }); shopModel(s1, a); const n1 = s1.run({ until: 60 });
  const clock = fakeClock();
  const s2 = new Sim({ seed: 11, clock }); shopModel(s2, b); const n2 = await s2.runRealtime({ until: 60, scale: 1000 });
  assert.deepEqual(b, a);
  assert.equal(n2, n1);
  assert.equal(s2.now, 60);
  near(clock.t - 1000, 60000, 1e-6, 'clock ends at until');
});
test('M6 fake clock: sleeps exactly up to each event, never past', async () => {
  const clock = fakeClock(), s = new Sim({ clock }), seen = [];
  for (const t of [0.5, 2, 2, 7]) s.schedule(t, () => seen.push([s.now, clock.now() - 1000]));
  await s.runRealtime({ scale: 100 });
  assert.deepEqual(seen, [[0.5, 50], [2, 200], [2, 200], [7, 700]]);
  assert.deepEqual(clock.sleeps, [50, 150, 500]);
});
test('M6 inject while runRealtime waits: arrives at clock-elapsed ÷ scale', async () => {
  // a clock whose sleep is real-ish: resolves only when we advance it, so we can inject mid-wait
  let t = 0; const pending = [];
  const clock = { now: () => t, sleep: (ms) => new Promise((r) => pending.push({ at: t + ms, r })) };
  const advance = (to) => { t = to; for (const p of pending.splice(0)) (p.at <= t ? p.r() : pending.push(p)); };
  const s = new Sim({ clock }), log = [];
  s.process(function* () {
    for (;;) { const v = yield s.signal('temp'); log.push([s.now, v]); if (v > 30) { yield s.timeout(5); log.push([s.now, 'cooled']); } }
  });
  s.schedule(100, () => log.push([s.now, 'end-of-shift']));
  const done = s.runRealtime({ until: 120, scale: 10 });
  await new Promise((r) => setImmediate(r));
  advance(250); s.inject('temp', 21);
  await new Promise((r) => setImmediate(r));
  advance(400); s.inject('temp', 35);
  await new Promise((r) => setImmediate(r));
  for (let k = 0; k < 20 && pending.length; k++) { advance(Math.max(t, Math.min(...pending.map((p) => p.at)))); await new Promise((r) => setImmediate(r)); }
  await done;
  assert.deepEqual(log, [[25, 21], [40, 35], [45, 'cooled'], [100, 'end-of-shift']]);
  assert.equal(s.now, 120);
});
test('M6 signal: next injection only; every current waiter gets it; inject under run()', () => {
  const s = new Sim(), log = [];
  s.inject('go', 'early'); // nobody waiting: dropped
  s.run();
  s.process(function* () { log.push(['a', yield s.signal('go'), s.now]); });
  s.process(function* () { log.push(['b', yield s.signal('go'), s.now]); });
  s.schedule(3, () => s.inject('go', 'now'));
  s.run();
  assert.deepEqual(log, [['a', 'now', 3], ['b', 'now', 3]]);
});
test('M6 runRealtime with the real clock and a small scale', async () => {
  const s = new Sim(), log = [];
  s.process(function* () { yield s.timeout(2); log.push(s.now); yield s.timeout(3); log.push(s.now); });
  const t0 = performance.now();
  await s.runRealtime({ scale: 5 });
  const dt = performance.now() - t0;
  assert.deepEqual(log, [2, 5]);
  assert.ok(dt >= 24, `ran too fast: ${dt}ms`);
});

test('M6 inject from inside the model lands at sim.now even when the clock runs late', async () => {
  // a clock that is always 7ms "late" after every sleep: wall elapsed > sim time when events run
  let t = 0;
  const clock = { now: () => t, sleep: (ms) => { t += ms + 7; return Promise.resolve(); } };
  const model = (s, log) => {
    s.process(function* () { for (;;) { const v = yield s.signal('x'); log.push([s.now, v]); } });
    s.process(function* () { for (let i = 0; i < 5; i++) { yield s.timeout(10); s.inject('x', i); } });
  };
  const a = [], b = [];
  const s1 = new Sim(); model(s1, a); s1.run({ until: 100 });
  const s2 = new Sim({ clock }); model(s2, b); await s2.runRealtime({ until: 100, scale: 1 });
  assert.deepEqual(b, a);
  assert.deepEqual(a.map((x) => x[0]), [10, 20, 30, 40, 50]);
});


// ------------------------------------------------------------------ Morphyx, day 1 turn 2
test('M2 an uncaught Interrupt with nobody waiting ends the process without crashing run()', () => {
  const s = new Sim(); const p = s.process(function* () { yield s.timeout(10); });
  s.schedule(3, () => p.interrupt('stop'));
  s.run();
  assert.equal(p.isAlive, false);
  assert.ok(p.processed && !p.ok && p.value instanceof Interrupt);
  const log = []; s.process(function* () { try { yield p; } catch (e) { log.push(e.cause); } }); s.run();
  assert.deepEqual(log, ['stop'], 'a later yielder still learns how it ended');
});
test('M4 an interrupted getter does not swallow the next item (store and container)', () => {
  const s = new Sim(), st = new Store(s), c = new Container(s), got = [];
  const a = s.process(function* () { try { yield st.get(); } catch { got.push('a'); } });
  s.process(function* () { got.push(['b', yield st.get(), s.now]); });
  const x = s.process(function* () { try { yield c.get(5); } catch { got.push('x'); } });
  s.process(function* () { yield c.get(5); got.push(['y', s.now]); });
  s.schedule(1, () => { a.interrupt(); x.interrupt(); });
  s.schedule(2, () => { st.put('item'); c.put(5); });
  s.run();
  assert.deepEqual(got, ['a', 'x', ['b', 'item', 2], ['y', 2]]);
  assert.equal(c.level, 0); assert.deepEqual(st.items, []);
});
test('M4 interrupted at the instant its get was granted: the item goes back, first in line', () => {
  const s = new Sim(), st = new Store(s), got = [];
  const a = s.process(function* () { try { got.push(['a', yield st.get()]); } catch { got.push('a int'); } });
  s.schedule(1, () => { st.put('p'); a.interrupt(); });
  s.schedule(2, () => s.process(function* () { got.push(['b', yield st.get(), s.now]); }));
  s.run();
  assert.deepEqual(got, ['a int', ['b', 'p', 2]]);
});
test('M4 container: withdrawing a blocking big get lets the small one behind it through', () => {
  const s = new Sim(), c = new Container(s, { init: 10 }), got = [];
  let big;
  s.process(function* () { big = c.get(30); const r = yield s.anyOf([big, s.timeout(1)]); if (r.index === 1) c.cancel(big); });
  s.process(function* () { yield c.get(5); got.push(s.now); });
  s.run();
  assert.deepEqual(got, [1]); assert.equal(c.level, 5);
});
test('M2 an Interrupt passed on through a yielded process is a real error to the one that receives it', () => {
  const s = new Sim(); const child = s.process(function* () { yield s.timeout(10); });
  s.process(function* () { yield s.allOf([child]); });
  s.schedule(1, () => child.interrupt('x'));
  assert.throws(() => s.run(), Interrupt, 'the parent was not interrupted; its uncaught error must surface');
});
test('M6 subscribe(): a mailbox that keeps injections a signal() loop would drop', async () => {
  const model = (s, got) => {
    const box = s.subscribe('r');
    s.process(function* () { for (;;) got.push([yield box.get(), s.now]); });
    s.process(function* () { for (;;) { const v = yield s.signal('r'); got.push(['sig', v]); yield s.timeout(1); } });
  };
  const a = []; const s1 = new Sim(); model(s1, a);
  s1.schedule(2, () => { s1.inject('r', 'x'); s1.inject('r', 'y'); }); s1.run();
  assert.deepEqual(a.filter((e) => e[0] !== 'sig'), [['x', 2], ['y', 2]]);
  assert.deepEqual(a.filter((e) => e[0] === 'sig'), [['sig', 'x']], 'signal() still means "next injection": y is not queued for it');
  const clock = fakeClock(), b = []; const s2 = new Sim({ clock }); model(s2, b);
  let pressed = false;
  clock.sleep = (ms) => {                       // two readings arrive by hand at 20 ms, mid-sleep
    const before = clock.t - 1000; clock.t += ms;
    if (!pressed && before < 20 && clock.t - 1000 >= 20) { pressed = true; clock.t = 1020; s2.inject('r', 'x'); s2.inject('r', 'y'); }
    return Promise.resolve();
  };
  await s2.runRealtime({ until: 5, scale: 10 });
  assert.deepEqual(b, a);
});
test('M3 stats integrate from time 0, as the spec says, even for a resource made later', () => {
  const s = new Sim(); s.run({ until: 10 }); const r = new Resource(s);
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(10); r.release(q); });
  s.run();
  near(r.stats().utilization, 0.5);
});
// a model neither of the shop tests wrote: machines that break mid-job (interrupt), raw stock
// (Container), finished parts (Store), two operators with priority repair work, and a stop button.
function machineShop(sim, log) {
  const ops = new Resource(sim, { capacity: 2 });
  const stock = new Container(sim, { capacity: 50, init: 20 });
  const parts = new Store(sim, { capacity: 8 });
  const repairing = [false, false, false];
  const machines = [0, 1, 2].map((m) => {
    const proc = sim.process(function* () {
      let left = 0;
      for (;;) {
        try {
          if (left <= 0) { yield stock.get(2); left = sim.triangular(1, 2, 4); }
          const op = ops.request({ priority: 1 }); yield op;   // interrupted here: the request is withdrawn
          const t0 = sim.now; try { yield sim.timeout(left); left = 0; } finally { left -= sim.now - t0; ops.release(op); }
          yield parts.put([m, sim.now]); log.push(['part', m, sim.now]);
        } catch (e) {
          if (!(e instanceof Interrupt)) throw e;
          if (e.cause === 'stop') { log.push(['stopped', m, sim.now]); return m; }
          log.push(['broke', m, sim.now]);
          repairing[m] = true;
          const fix = ops.request({ priority: 0 });
          try { yield fix; yield sim.timeout(sim.uniform(0.5, 1.5)); }
          catch (e2) { log.push(['stopped in repair', m, sim.now]); return m; }  // only 'stop' reaches here
          finally { ops.release(fix); repairing[m] = false; }
          log.push(['fixed', m, sim.now]);
        }
      }
    });
    return proc;
  });
  sim.process(function* () { for (;;) { yield sim.timeout(sim.exponential(0.2)); const m = machines[Math.floor(sim.random() * 3)]; if (m.isAlive && !repairing[machines.indexOf(m)]) m.interrupt('break'); } });
  sim.process(function* () { for (;;) { yield sim.timeout(5); yield stock.put(10); log.push(['stock', stock.level, sim.now]); } });
  sim.process(function* () { for (;;) { const p = yield parts.get(); yield sim.timeout(0.8); log.push(['shipped', p[0], sim.now]); } });
  sim.process(function* () {
    yield sim.signal('stop'); log.push(['STOP', sim.now]);
    for (const m of machines) if (m.isAlive) m.interrupt('stop');
    log.push(['all stopped', yield sim.allOf(machines), sim.now]);
  });
  return { ops, machines };
}
test('M6 machine shop with breakdowns, stock and a stop button: identical both ways', async () => {
  const a = [], b = [];
  const s1 = new Sim({ seed: 'shop' }); const m1 = machineShop(s1, a);
  s1.schedule(37.25, () => s1.inject('stop'));                    // the button, simulated
  const n1 = s1.run({ until: 50 });
  const clock = fakeClock();
  const s2 = new Sim({ seed: 'shop', clock }); const m2 = machineShop(s2, b);
  clock.sleep = (ms) => {                                           // the button, pressed "by hand" mid-sleep
    const before = clock.t; clock.t += ms;
    if (before - 1000 < 3725 && clock.t - 1000 >= 3725) { clock.t = 1000 + 3725; s2.inject('stop'); }
    return Promise.resolve();
  };
  const n2 = await s2.runRealtime({ until: 50, scale: 100 });
  assert.ok(a.some((e) => e[0] === 'broke') && a.some((e) => e[0] === 'shipped'), 'model exercised breakdowns and shipping');
  assert.deepEqual(a.find((e) => e[0] === 'all stopped'), ['all stopped', [0, 1, 2], 37.25]);
  assert.deepEqual(b, a);
  assert.equal(n2, n1 - 1, 'one fewer: the simulated button was a schedule() entry, the real one is just the inject');
  assert.deepEqual(m2.ops.stats(), m1.ops.stats());
  assert.equal(m1.ops.inUse, 0, 'no operator left held by a stopped machine');
});

// ------------------------------------------------------------------ turn 3 (Modulo): abandoned claims, signal leak, trace
test('M2 interrupt inside anyOf([request, timeout]) withdraws the request: no unit granted to nobody', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield 10; r.release(q); });
  const p = s.process(function* () {
    yield 0.5;
    try { yield s.anyOf([r.request(), s.timeout(100)]); } catch (e) { log.push(['int', s.now]); }
  });
  s.process(function* () {
    yield 2; p.interrupt();
    yield 20; log.push(['after', r.inUse, r.queueLength]);
    const q = r.request(); yield q; log.push(['next got it', s.now]); r.release(q);
  });
  s.run();
  assert.deepEqual(log, [['int', 2], ['after', 0, 0], ['next got it', 22]]);
});
test('M4 interrupt inside allOf(anyOf(store.get, ...)) withdraws the get: the next item reaches the next getter', () => {
  const s = new Sim(), st = new Store(s), log = [];
  const p = s.process(function* () {
    try { yield s.allOf([s.anyOf([st.get(), s.timeout(50)]), s.timeout(1)]); } catch (e) { log.push('int'); }
  });
  s.process(function* () { yield 2; p.interrupt(); yield 1; log.push(yield st.get()); });
  s.schedule(5, () => st.put('item'));
  s.run();
  assert.deepEqual(log, ['int', 'item']);
});
test('M3 reneging without interrupt keeps the request: warn after a timeout, then keep waiting', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield 10; r.release(q); });
  s.process(function* () {
    yield 0;
    const q = r.request();
    const w = yield s.anyOf([q, s.timeout(3)]);
    if (w.index === 1) log.push(['still waiting', s.now]);
    yield q; log.push(['granted', s.now]); r.release(q);
  });
  s.run();
  assert.deepEqual(log, [['still waiting', 3], ['granted', 10]]);
});
test('M6 a signal() polling loop leaves a bounded number of dead waiters, and a held signal still hears', () => {
  const s = new Sim(), log = [];
  let held;
  s.process(function* () { held = s.signal('door'); yield s.anyOf([held, s.timeout(0.5)]); });
  s.process(function* () { for (let i = 0; i < 20000; i++) yield s.anyOf([s.signal('door'), s.timeout(1)]); });
  s.process(function* () { yield 30000; log.push(['held', yield held, s.now]); });
  s.schedule(30001, () => s.inject('door', 'shut'));
  s.run({ until: 25000 });
  assert.ok(s._signals.get('door').length < 100, `waiters ${s._signals.get('door').length}`);
  s.run();
  assert.deepEqual(log, [['held', 'shut', 30001]]);
});
test('M2 interrupt withdraws a claim inside anyOf only if nobody else is waiting on it', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield 10; r.release(q); });
  let q;                                            // one request, two watchers
  const p = s.process(function* () { yield 1; q = r.request(); try { yield s.anyOf([q, s.timeout(100)]); } catch (e) { log.push('int'); } });
  s.process(function* () { yield 1; yield q; log.push(['supervisor got it', s.now]); r.release(q); });
  s.schedule(2, () => p.interrupt());
  s.run();
  assert.deepEqual(log, ['int', ['supervisor got it', 10]]);
});
test('M6 a full bounded mailbox drops nothing; the backlog shows in putsWaiting', () => {
  const s = new Sim(), box = s.subscribe('x', { capacity: 1 }), got = [];
  for (let i = 0; i < 5; i++) s.inject('x', i);
  s.run();
  assert.deepEqual([box.items, box.putsWaiting, box.getsWaiting], [[0], 4, 0]);
  s.process(function* () { for (let i = 0; i < 5; i++) got.push(yield box.get()); });
  s.run();
  assert.deepEqual([got, box.putsWaiting], [[0, 1, 2, 3, 4], 0]);
  const c = new Container(s, { capacity: 10 }); c.get(3); c.get(1);
  assert.equal(c.getsWaiting, 2);
});
test('M6 epoch-sized fake clocks: sleeps are asked for exactly, and sub-resolution waits cannot loop forever', async () => {
  const mk = (t0) => { const c = { t: t0, sleeps: [] }; c.now = () => c.t;
    c.sleep = (ms) => { if (c.sleeps.push(ms) > 50) throw new Error('endless sleeps'); c.t += ms; return Promise.resolve(); }; return c; };
  const c = mk(1e12), s = new Sim({ clock: c }), at = [];
  s.schedule(0.1, () => at.push(s.now)); s.schedule(0.7, () => at.push(s.now));
  await s.runRealtime({ scale: 1 });
  assert.equal(c.sleeps[0], 0.1, 'first sleep is t·scale, not (start + t·scale) − now rounded at 1e12');
  assert.deepEqual(at, [0.1, 0.7]);
  const d = mk(1e15), s2 = new Sim({ clock: d }); let ran = 0;   // ulp here is 0.125 ms
  s2.schedule(0.01, () => ran++); s2.schedule(5, () => ran++);
  await s2.runRealtime({ scale: 1 });
  assert.equal(ran, 2); assert.ok(d.sleeps.length <= 3, `sleeps ${d.sleeps}`);
});
test('M6 two subscribers on one name each get every injection', () => {
  const s = new Sim(), a = s.subscribe('x'), b = s.subscribe('x');
  s.inject('x', 1); s.inject('x', 2); s.run();
  assert.deepEqual([a.items, b.items], [[1, 2], [1, 2]]);
});
function clinicTrace(sim) {               // M1–M4 only: random arrivals, a desk, a fridge, a stock, a walkout
  const desk = new Resource(sim, { capacity: 2 }), fridge = new Store(sim, { capacity: 3 }), stock = new Container(sim, { init: 5 });
  sim.process(function* arrivals() {
    for (let i = 0; i < 40; i++) {
      yield sim.exponential(1);
      const p = sim.process(function* patient() {
        const q = desk.request({ priority: i % 3 === 0 ? -1 : 0 });
        const w = yield sim.anyOf([q, sim.timeout(4)]);
        if (w.index === 1) { desk.release(q); return 'left'; }
        yield stock.get(1); yield sim.uniform(0.5, 2); desk.release(q); yield fridge.put(i);
      });
      if (i === 7) sim.schedule(0.1, function rush() { if (p.isAlive) p.interrupt('rush'); });
    }
  });
  sim.process(function* restock() { for (;;) { yield 3; yield stock.put(2); if (sim.now > 60) return; } });
  sim.process(function* pharmacist() { for (;;) { yield fridge.get(); yield sim.triangular(0.2, 0.5, 1.5); } });
}
test('M6 trace hook: an M1–M4 model gives the same trace (time, priority, kind, label) under run() and runRealtime()', async () => {
  const t1 = [], t2 = [], t3 = [];
  const s1 = new Sim({ seed: 9, trace: (e) => t1.push(e) }); clinicTrace(s1); const n1 = s1.run({ until: 80 });
  const s3 = new Sim({ seed: 9, trace: (e) => t3.push(e) }); clinicTrace(s3); s3.run({ until: 80 });
  const s2 = new Sim({ seed: 9, clock: fakeClock(), trace: (e) => t2.push(e) }); clinicTrace(s2);
  const n2 = await s2.runRealtime({ until: 80, scale: 50 });
  assert.equal(t1.length, n1); assert.equal(n2, n1);
  assert.ok(t1.length > 300, `model exercised: ${t1.length} entries`);
  assert.deepEqual(t3, t1, 'same seed, same trace');
  assert.deepEqual(t2, t1, 'same trace both ways');
  const kinds = new Set(t1.map((e) => e.kind));
  for (const k of ['schedule', 'timeout', 'deliver', 'start', 'interrupt']) assert.ok(kinds.has(k), `kind ${k} seen`);
  assert.ok(t1.some((e) => e.kind === 'schedule' && e.label === 'rush') && t1.some((e) => e.label === 'patient'));
  assert.throws(() => new Sim({ trace: 5 }), TypeError);
});
test('M6 trace marks injections with their name', () => {
  const t = [], s = new Sim({ trace: (e) => t.push(e) });
  s.schedule(2, () => s.inject('temp', 7)); s.run();
  assert.deepEqual(t.map((e) => [e.time, e.kind, e.label]), [[2, 'schedule', undefined], [2, 'inject', 'temp']]);
});

test('M6 keepAlive: an idle controller waits for injections, without sleeping, until stop()', async () => {
  const c = fakeClock(), s = new Sim({ clock: c }), log = [];
  const box = s.subscribe('cmd');
  s.process(function* ctl() { for (;;) { const v = yield box.get(); log.push([v, s.now]); if (v === 'quit') s.stop(); } });
  // default: empty queue returns at once, even with a process waiting on a mailbox
  assert.equal(typeof (await s.runRealtime()), 'number'); assert.deepEqual(log, []);
  const run = s.runRealtime({ keepAlive: true, scale: 100 });
  let done = false; run.then(() => { done = true; });
  const tick = () => new Promise((r) => setImmediate(r));
  await tick(); assert.equal(done, false);
  c.t += 200; s.inject('cmd', 'a'); await tick();
  c.t += 300; s.inject('cmd', 'quit'); await run;
  assert.deepEqual(log, [['a', 2], ['quit', 5]]);
  assert.deepEqual(c.sleeps, []); // idling never touched the clock
});
test('M6 stop() ends runRealtime mid-sleep', async () => {
  const s = new Sim({ clock: { now: () => 0, sleep: () => new Promise(() => {}) } }); // a sleep that never ends
  let ran = false; s.schedule(10, () => { ran = true; });
  const run = s.runRealtime({ until: 20 }); setImmediate(() => s.stop());
  let to; const late = new Promise((_, rej) => { to = setTimeout(() => rej(new Error('stop() did not end the sleep')), 300); });
  await Promise.race([run, late]); clearTimeout(to); assert.equal(ran, false); assert.equal(s.now, 0);
});

// ------------------------------------------------------------------ run
let fail = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
