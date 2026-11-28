// des-spec-check.mjs — black-box checks of a des.mjs written from SPEC.md alone (Morphyx).
// Usage: node shelf/des-spec-check.mjs [path/to/des.mjs] [fuzzSeed] [fuzzCount]
// Exit 1 on any failure. Part B is a differential fuzzer for M5 (fixed durations) against
// an independent reading of the forecast rules.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = path.resolve(process.argv[2] || './des.mjs');
const FSEED = Number(process.argv[3] || 7), FCOUNT = Number(process.argv[4] || 400);
const D = await import(pathToFileURL(target).href);
const { Sim, Resource, Store, Container, Interrupt, forecast } = D;

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
async function t(name, fn) {
  try { const r = await fn(); if (r === true) pass++; else { fail++; console.log('FAIL', name, r === undefined ? '' : JSON.stringify(r)); } }
  catch (e) { fail++; console.log('FAIL', name, 'threw', e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e); }
}
const throws = (f) => { try { f(); return false; } catch { return true; } };

// ---------------- M1
await t('M1 time order, priority, then FIFO', () => {
  const s = new Sim(), log = [];
  s.schedule(2, () => log.push('a'));
  s.schedule(1, () => log.push('b'), { priority: 5 });
  s.schedule(1, () => log.push('c'), { priority: -1 });
  s.schedule(1, () => log.push('d'), { priority: 5 });
  s.schedule(0, () => log.push('e'));
  const n = s.run();
  return eq(log, ['e', 'c', 'b', 'd', 'a']) && n === 5 && s.now === 2 || { log, n, now: s.now };
});
await t('M1 events scheduled during run at same time go after existing ones', () => {
  const s = new Sim(), log = [];
  s.schedule(1, () => { log.push('x'); s.schedule(0, () => log.push('z')); });
  s.schedule(1, () => log.push('y'));
  s.run(); return eq(log, ['x', 'y', 'z']) || log;
});
await t('M1 lower priority scheduled later still jumps ahead at same time', () => {
  const s = new Sim(), log = [];
  s.schedule(1, () => { log.push('x'); s.schedule(0, () => log.push('hi'), { priority: -1 }); });
  s.schedule(1, () => log.push('y'));
  s.run(); return eq(log, ['x', 'hi', 'y']) || log;
});
await t('M1 cancel', () => {
  const s = new Sim(), log = [];
  const h = s.schedule(1, () => log.push('a')); s.schedule(2, () => log.push('b'));
  s.cancel(h); const n = s.run(); return eq(log, ['b']) && n === 1 || { log, n };
});
await t('M1 cancel from inside an earlier event', () => {
  const s = new Sim(), log = [];
  let h; s.schedule(1, () => s.cancel(h)); h = s.schedule(1, () => log.push('a'));
  s.run(); return eq(log, []) || log;
});
await t('M1 negative delay throws', () => throws(() => new Sim().schedule(-1, () => {})));
await t('M1 until: stops before later events, now = until, resumable', () => {
  const s = new Sim(), log = [];
  s.schedule(1, () => log.push(1)); s.schedule(5, () => log.push(5));
  const n1 = s.run({ until: 3 }); const now1 = s.now;
  const n2 = s.run(); return n1 === 1 && now1 === 3 && n2 === 1 && s.now === 5 && eq(log, [1, 5]) || { n1, now1, n2, now: s.now };
});
await t('M1 until with empty calendar advances now', () => { const s = new Sim(); s.run({ until: 10 }); return s.now === 10 || s.now; });
await t('M1 seeds: same→same, different→different', () => {
  const a = new Sim({ seed: 42 }), b = new Sim({ seed: 42 }), c = new Sim({ seed: 43 });
  const xa = [], xb = [], xc = [];
  for (let i = 0; i < 50; i++) { xa.push(a.random()); xb.push(b.random()); xc.push(c.random()); }
  return eq(xa, xb) && !eq(xa, xc) && xa.every((x) => x >= 0 && x < 1);
});
await t('M1 default seed is 1', () => { const a = new Sim(), b = new Sim({ seed: 1 }); return a.random() === b.random(); });
await t('M1 distributions: ranges and means', () => {
  const s = new Sim({ seed: 3 }); const N = 200000; let se = 0, su = 0, st = 0, ok = true;
  for (let i = 0; i < N; i++) {
    const e = s.exponential(2), u = s.uniform(3, 7), tr = s.triangular(1, 2, 6);
    if (e < 0 || u < 3 || u >= 7 || tr < 1 || tr > 6) ok = false;
    se += e; su += u; st += tr;
  }
  return ok && near(se / N, 0.5, 0.01) && near(su / N, 5, 0.02) && near(st / N, 3, 0.02) || { e: se / N, u: su / N, t: st / N, ok };
});
await t('M1 triangular degenerate mode at edge', () => {
  const s = new Sim(); for (let i = 0; i < 1000; i++) { const x = s.triangular(0, 0, 1); const y = s.triangular(0, 1, 1); if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return false; } return true;
});

// ---------------- M2
await t('M2 process return value via yield, timeout value', () => {
  const s = new Sim(), log = [];
  const child = s.process(function* (x) { const v = yield s.timeout(3, 'tv'); log.push([s.now, v]); return x * 2; }, 21);
  s.process(function* () { const r = yield child; log.push([s.now, r]); });
  s.run(); return eq(log, [[3, 'tv'], [3, 42]]) || log;
});
await t('M2 yielding an already finished process resumes with its value', () => {
  const s = new Sim(), log = [];
  const c = s.process(function* () { return 'done'; });
  s.process(function* () { yield s.timeout(1); const v = yield c; log.push([s.now, v]); });
  s.run(); return eq(log, [[1, 'done']]) || log;
});
await t('M2 event succeed once; second throws; waiter gets value', () => {
  const s = new Sim(), log = []; const ev = s.event();
  s.process(function* () { log.push(yield ev); });
  s.schedule(4, () => ev.succeed('v'));
  s.run(); return eq(log, ['v']) && throws(() => ev.succeed(1)) || log;
});
await t('M2 isAlive', () => {
  const s = new Sim(); const p = s.process(function* () { yield s.timeout(2); });
  const a = p.isAlive; s.run(); return a === true && p.isAlive === false;
});
await t('M2 interrupt: Interrupt with cause, timeout abandoned', () => {
  const s = new Sim(), log = [];
  const p = s.process(function* () {
    try { yield s.timeout(10); log.push(['woke', s.now]); }
    catch (e) { log.push(['int', s.now, e instanceof Interrupt, e.cause]); }
    yield s.timeout(1); log.push(['after', s.now]);
  });
  s.schedule(3, () => p.interrupt('stop'));
  s.run(); return eq(log, [['int', 3, true, 'stop'], ['after', 4]]) || log;
});
await t('M2 interrupt finished process throws', () => {
  const s = new Sim(); const p = s.process(function* () { yield s.timeout(1); }); s.run(); return throws(() => p.interrupt('x'));
});
await t('M2 interrupt withdraws pending request', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(5); r.release(q); });
  const p = s.process(function* () { try { yield r.request(); log.push('granted'); } catch (e) { log.push(['int', s.now]); } });
  s.process(function* () { yield s.timeout(1); const q = r.request(); yield q; log.push(['c', s.now]); r.release(q); });
  s.schedule(2, () => p.interrupt());
  s.run(); return eq(log, [['int', 2], ['c', 5]]) || log;
});
await t('M2 allOf values and anyOf {index,value}', () => {
  const s = new Sim(), log = [];
  s.process(function* () {
    const all = yield s.allOf([s.timeout(2, 'a'), s.timeout(1, 'b')]); log.push([s.now, all]);
    const any = yield s.anyOf([s.timeout(5, 'x'), s.timeout(3, 'y')]); log.push([s.now, any]);
  });
  s.run(); return eq(log, [[2, ['a', 'b']], [5, { index: 1, value: 'y' }]]) || log;
});
await t('M2 allOf with a process and an event', () => {
  const s = new Sim(), log = []; const ev = s.event();
  const p = s.process(function* () { yield s.timeout(2); return 7; });
  s.process(function* () { const v = yield s.allOf([p, ev]); log.push([s.now, v]); });
  s.schedule(5, () => ev.succeed('e')); s.run(); return eq(log, [[5, [7, 'e']]]) || log;
});
await t('M2 deterministic trace across two identical runs', () => {
  const mk = () => { const s = new Sim({ seed: 9 }), r = new Resource(s, { capacity: 2 }), log = [];
    for (let i = 0; i < 20; i++) s.process(function* () { yield s.timeout(s.exponential(1)); const q = r.request(); yield q; log.push([i, s.now]); yield s.timeout(s.uniform(0, 2)); r.release(q); });
    s.run(); return log; };
  return eq(mk(), mk());
});

// ---------------- M3
await t('M3 priority then FIFO grant order', () => {
  const s = new Sim(), r = new Resource(s), log = [];
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(10); r.release(q); });
  [['a', 0], ['b', -1], ['c', 0], ['d', -1]].forEach(([n, p], i) => s.process(function* () {
    yield s.timeout(1 + i); const q = r.request({ priority: p }); yield q; log.push(n); yield s.timeout(1); r.release(q); }));
  s.run(); return eq(log, ['b', 'd', 'a', 'c']) || log;
});
await t('M3 inUse, queueLength; release ungranted withdraws', () => {
  const s = new Sim(), r = new Resource(s, { capacity: 2 });
  const a = r.request(), b = r.request(), c = r.request(), d = r.request();
  s.run();
  const s1 = [r.inUse, r.queueLength]; r.release(c); const s2 = [r.inUse, r.queueLength];
  r.release(a); s.run(); const s3 = [r.inUse, r.queueLength];
  return eq([s1, s2, s3], [[2, 2], [2, 1], [2, 0]]) || [s1, s2, s3];
});
await t('M3 stats by hand', () => {
  // cap 1. A holds 0..4, B requests at 1 gets 4..6, C requests at 2 gets 6..7. now=10.
  const s = new Sim(), r = new Resource(s);
  const job = (at, hold) => s.process(function* () { yield s.timeout(at); const q = r.request(); yield q; yield s.timeout(hold); r.release(q); });
  job(0, 4); job(1, 2); job(2, 1); s.run({ until: 10 });
  const st = r.stats();
  // busy 7 of 10 -> 0.7. queue: 1..2:1, 2..4:2, 4..6:1 => 1+4+2=7 -> 0.7. waits 0,3,4 -> 7/3.
  return near(st.utilization, 0.7) && near(st.meanQueue, 0.7) && near(st.meanWait, 7 / 3) && st.served === 3 || st;
});
await t('M3 stats with capacity 2', () => {
  const s = new Sim(), r = new Resource(s, { capacity: 2 });
  s.process(function* () { const q = r.request(); yield q; yield s.timeout(4); r.release(q); });
  s.run({ until: 8 }); const st = r.stats();
  return near(st.utilization, 0.25) && near(st.meanQueue, 0) && st.served === 1 && near(st.meanWait, 0) || st;
});

// ---------------- M4
await t('M4 store FIFO, get waits, put waits while full', () => {
  const s = new Sim(), st = new Store(s, { capacity: 2 }), log = [];
  s.process(function* () { for (const x of ['a', 'b', 'c', 'd']) { yield st.put(x); log.push(['put', x, s.now]); } });
  s.process(function* () { yield s.timeout(5); for (let i = 0; i < 4; i++) { const x = yield st.get(); log.push(['got', x, s.now]); yield s.timeout(1); } });
  s.run();
  const puts = log.filter((l) => l[0] === 'put').map((l) => [l[1], l[2]]);
  const gots = log.filter((l) => l[0] === 'got').map((l) => [l[1], l[2]]);
  return eq(puts, [['a', 0], ['b', 0], ['c', 5], ['d', 6]]) && eq(gots, [['a', 5], ['b', 6], ['c', 7], ['d', 8]]) || log;
});
await t('M4 store.items is a copy', () => {
  const s = new Sim(), st = new Store(s); st.put(1); st.put(2); s.run(); const it = st.items; it.push(9); return eq(st.items, [1, 2]);
});
await t('M4 container get waits for amount; put waits at capacity', () => {
  const s = new Sim(), c = new Container(s, { capacity: 10, init: 3 }), log = [];
  s.process(function* () { yield c.get(5); log.push(['g5', s.now, c.level]); });
  s.process(function* () { yield s.timeout(1); yield c.put(4); log.push(['p4', s.now]); yield c.put(9); log.push(['p9', s.now]); });
  s.process(function* () { yield s.timeout(3); yield c.get(6); log.push(['g6', s.now]); });
  s.run();
  // t1: 3+4=7 → g5 fires → level 2. p9 needs 11>10 → waits. t3: g6 waits (2<6)... deadlock unless order lets p9 in. 2+9=11>10 still. stuck.
  // decision 3 (SimPy order): the putter, whose own put succeeded, resumes before the getter it unblocked
  return eq(log.slice(0, 2), [['p4', 1], ['g5', 1, 2]]) && c.level === 2 || { log, level: c.level };
});
await t('M4 container init level', () => { const s = new Sim(); return new Container(s, { init: 4 }).level === 4; });

// ---------------- M5
await t('M5 fixed durations, no resources: all percentiles = critical path', () => {
  const r = forecast({ tasks: [{ id: 'a', duration: 3, deps: [] }, { id: 'b', duration: 4, deps: ['a'] }, { id: 'c', duration: 2, deps: [] }, { id: 'd', duration: 1, deps: ['c', 'b'] }], resources: {} }, { runs: 50 });
  return r.mean === 8 && r.p50 === 8 && r.p80 === 8 && r.p95 === 8 && eq(r.criticality, { a: 1, b: 1, c: 0, d: 1 }) || r;
});
await t('M5 resources: skip-not-block in list order', () => {
  // r cap 2. a uses 2 (len 5), b uses 1 (dep none, len 1), c uses 1 (len 1). At 0: a fits takes 2; b,c don't fit.
  // Order: list [b2, a, c]: b2 uses 2 → takes all; a needs 2 → no; c needs 1 → no.
  const r = forecast({ tasks: [{ id: 'x', duration: 4, uses: { r: 2 } }, { id: 'y', duration: 1, uses: { r: 3 } }, { id: 'z', duration: 2, uses: { r: 1 } }], resources: { r: 3 } }, { runs: 5 });
  // t0: x takes 2, y needs 3 doesn't fit, z takes 1 (skip-not-block). z ends 2; x ends 4; y 4..5.
  return r.p50 === 5 && eq(r.criticality, { x: 1, y: 1, z: 0 }) || r;
});
await t('M5 criticality through shared resource', () => {
  const r = forecast({ tasks: [{ id: 'a', duration: 3, uses: { m: 1 } }, { id: 'b', duration: 2, uses: { m: 1 } }], resources: { m: 1 } }, { runs: 3 });
  return r.p95 === 5 && eq(r.criticality, { a: 1, b: 1 }) || r;
});
await t('M5 nearest-rank percentiles on uniform task', () => {
  const r = forecast({ tasks: [{ id: 'a', duration: { dist: 'uniform', min: 0, max: 10 } }], resources: {} }, { runs: 1000, seed: 5 });
  return near(r.mean, 5, 0.4) && near(r.p50, 5, 0.6) && near(r.p80, 8, 0.6) && near(r.p95, 9.5, 0.4) && r.p50 <= r.p80 && r.p80 <= r.p95 || r;
});
await t('M5 deterministic by seed', () => {
  const p = { tasks: [{ id: 'a', duration: { dist: 'triangular', min: 1, mode: 2, max: 9 } }, { id: 'b', duration: { dist: 'uniform', min: 1, max: 5 }, deps: ['a'] }], resources: {} };
  return eq(forecast(p, { runs: 200, seed: 3 }), forecast(p, { runs: 200, seed: 3 })) && !eq(forecast(p, { runs: 200, seed: 3 }), forecast(p, { runs: 200, seed: 4 }));
});

// ---------------- gaps found by running shelf/des-mutants.json against this file
await t('M1 event exactly at until runs', () => {
  const s = new Sim(), log = []; s.schedule(5, () => log.push(5)); const n = s.run({ until: 5 }); return n === 1 && eq(log, [5]) && s.now === 5 || { n, log };
});
await t('M2 abandoned timeout leaves the calendar (run ends at the last live event)', () => {
  const s = new Sim(); const p = s.process(function* () { try { yield s.timeout(10); } catch { yield s.timeout(1); } });
  s.schedule(3, () => p.interrupt()); s.run(); return s.now === 4 || s.now;
});
await t('M2 two interrupts at once: second thrown at the next yield', () => {
  const s = new Sim(), log = [];
  const p = s.process(function* () {
    for (let k = 0; k < 3; k++) { try { yield s.timeout(10); log.push(['t', s.now]); } catch (e) { log.push([e.cause, s.now]); } }
  });
  s.schedule(1, () => { p.interrupt('a'); p.interrupt('b'); }); s.run();
  return eq(log, [['a', 1], ['b', 1], ['t', 11]]) || log;
});
// Decision 1 (ta-8ae0ce): steps are atomic; a process started from inside a step runs its
// first step after the current one ends (SimPy's Initialize order). Sync start gives p1 c1 p2 c2 p3.
await t('M2 child started inside a step runs after the parent yields (SimPy order)', () => {
  const s = new Sim(), log = [];
  s.process(function* () {
    log.push('p1'); s.process(function* () { log.push('c1'); yield s.timeout(0); log.push('c2'); });
    log.push('p2'); yield s.timeout(0); log.push('p3');
  });
  s.run(); return eq(log, ['p1', 'p2', 'c1', 'p3', 'c2']) || log;
});
// SPEC M1 "same time: lower priority, then order scheduled" read as one line for everything,
// resumptions included (SimPy). A separate now-queue gives a q r.
await t('M2 timeout(0) taken before a succeed() resumes first', () => {
  const s = new Sim(), log = []; const ev = s.event();
  s.process(function* () { yield ev; log.push('q'); });
  s.process(function* () { yield s.timeout(0); log.push('r'); });
  s.process(function* () { ev.succeed(); log.push('a'); });
  s.run(); return eq(log, ['a', 'r', 'q']) || log;
});
await t("M2 a child's first-step error does not come out of the parent's process() line", () => {
  const s = new Sim(); let leaked = false;
  s.process(function* () {
    try { s.process(function* () { throw new Error('child'); yield s.timeout(1); }); } catch { leaked = true; }
    yield s.timeout(1);
  });
  try { s.run(); } catch { /* where the engine surfaces it is its business; only the parent's line matters */ }
  return !leaked || 'leaked into parent';
});
await t('M5 nearest rank exactly: runs=2 and runs=5', () => {
  const p = { tasks: [{ id: 'a', duration: { dist: 'uniform', min: 0, max: 1 } }], resources: {} };
  const r2 = forecast(p, { runs: 2, seed: 2 }); const r5 = forecast(p, { runs: 5, seed: 2 });
  // runs=2: p50 = s[0], p80 = p95 = s[1]; mean = (s0+s1)/2. runs=5: p50 = s[2] < p80 = s[3] < p95 = s[4].
  return r2.p50 < r2.p80 && r2.p80 === r2.p95 && near(r2.p50 + r2.p95, 2 * r2.mean, 1e-12) && r5.p50 < r5.p80 && r5.p80 < r5.p95 || { r2, r5 };
});

// ---------------- M6
function fakeClock() {
  const c = { t: 0, sleeps: [], now: () => c.t, sleep: (ms) => { c.sleeps.push(ms); c.t += ms; return Promise.resolve(); } };
  return c;
}
await t('M6 fake clock: sleeps exactly to each event, never past', async () => {
  const clock = fakeClock(); const s = new Sim({ clock }), log = [];
  s.schedule(1, () => log.push([s.now, clock.t])); s.schedule(2.5, () => log.push([s.now, clock.t]));
  s.schedule(2.5, () => log.push([s.now, clock.t]));
  await s.runRealtime({ scale: 100 });
  return eq(log, [[1, 100], [2.5, 250], [2.5, 250]]) && clock.t === 250 || { log, t: clock.t, sleeps: clock.sleeps };
});
await t('M6 until: sleeps up to until and stops', async () => {
  const clock = fakeClock(); const s = new Sim({ clock }), log = [];
  s.schedule(1, () => log.push(s.now)); s.schedule(9, () => log.push(s.now));
  await s.runRealtime({ until: 5, scale: 10 });
  return eq(log, [1]) && s.now === 5 && clock.t <= 50 || { log, now: s.now, t: clock.t };
});
await t('M6 same trace under run() and runRealtime(fake)', async () => {
  const model = (s, log) => { const r = new Resource(s, { capacity: 2 }), st = new Store(s, { capacity: 3 });
    for (let i = 0; i < 15; i++) s.process(function* () { yield s.timeout(s.exponential(1)); const q = r.request({ priority: i % 3 }); yield q; yield st.put(i); log.push(['in', i, s.now]); yield s.timeout(s.triangular(0, 1, 3)); r.release(q); });
    s.process(function* () { for (let k = 0; k < 15; k++) { const x = yield st.get(); log.push(['out', x, s.now]); yield s.timeout(0.7); } });
    const p = s.process(function* () { try { yield s.timeout(100); } catch (e) { log.push(['int', s.now, e.cause]); } });
    s.schedule(4, () => p.interrupt('k')); };
  const a = new Sim({ seed: 5 }), la = []; model(a, la); a.run();
  const clock = fakeClock(); const b = new Sim({ seed: 5, clock }), lb = []; model(b, lb); await b.runRealtime({ scale: 7 });
  return eq(la, lb) && la.length > 30 || { la: la.length, lb: lb.length };
});
await t('M6 inject while waiting arrives at clock time; signal wakes', async () => {
  // A clock whose sleep is controllable: resolves when we advance it.
  let t0 = 0, pending = null;
  const clock = { now: () => t0, sleep: (ms) => new Promise((res) => { pending = { until: t0 + ms, res }; }) };
  const s = new Sim({ clock }), log = [];
  s.process(function* () { const v = yield s.signal('go'); log.push([s.now, v]); });
  s.schedule(10, () => log.push(['end', s.now]));
  const run = s.runRealtime({ scale: 100 });
  await new Promise((r) => setImmediate(r));
  t0 = 350; s.inject('go', 'G');                // 3.5 sim units in
  // let the run loop notice; then let the pending sleep (to 1000) complete
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  const mid = JSON.stringify(log);
  t0 = 1000; if (pending) pending.res();
  for (let i = 0; i < 5 && log.length < 2; i++) { await new Promise((r) => setImmediate(r)); if (pending && t0 >= pending.until) pending.res(); }
  await run;
  return mid === JSON.stringify([[3.5, 'G']]) && eq(log, [[3.5, 'G'], ['end', 10]]) || { mid, log };
});
await t('M6 signal waits for the *next* injection', () => {
  const s = new Sim(), log = [];
  s.schedule(1, () => s.inject('x', 1));
  s.process(function* () { yield s.timeout(2); log.push(yield s.signal('x')); });
  s.schedule(3, () => s.inject('x', 3)); s.run(); return eq(log, [3]) || log;
});

// ---------------- Part B: M5 differential fuzz, fixed integer durations.
function lcg(seed) { let x = seed >>> 0 || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function refForecast({ tasks, resources }) {
  const free = { ...resources }, start = {}, fin = {}, done = new Set(); let now = 0;
  const running = [];
  const fits = (t) => Object.entries(t.uses || {}).every(([k, u]) => free[k] >= u);
  const scan = () => { for (const t of tasks) if (!(t.id in start) && (t.deps || []).every((d) => done.has(d)) && fits(t)) {
    for (const [k, u] of Object.entries(t.uses || {})) free[k] -= u; start[t.id] = now; fin[t.id] = now + t.duration; running.push(t); } };
  scan();
  while (done.size < tasks.length) {
    // tasks of duration 0 finish "now": take the smallest finish time among running
    const tmin = Math.min(...running.map((t) => fin[t.id]));
    now = tmin;
    for (let i = running.length - 1; i >= 0; i--) if (fin[running[i].id] === tmin) { const t = running[i]; running.splice(i, 1); done.add(t.id); for (const [k, u] of Object.entries(t.uses || {})) free[k] += u; }
    scan();
  }
  const T = Math.max(...tasks.map((t) => fin[t.id]));
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const crit = new Set(tasks.filter((t) => fin[t.id] === T).map((t) => t.id));
  const shares = (a, b) => Object.keys(a.uses || {}).some((k) => (a.uses[k] > 0) && (b.uses || {})[k] > 0);
  let changed = true;
  while (changed) { changed = false; for (const y of [...crit]) for (const x of tasks) if (!crit.has(x.id) && fin[x.id] === start[y] && ((byId[y].deps || []).includes(x.id) || shares(x, byId[y]))) { crit.add(x.id); changed = true; } }
  return { T, crit: Object.fromEntries(tasks.map((t) => [t.id, crit.has(t.id) ? 1 : 0])) };
}
let fz = 0, fzBad = 0;
{
  const R = lcg(FSEED);
  for (let n = 0; n < FCOUNT; n++) {
    const k = 2 + Math.floor(R() * 7), nres = Math.floor(R() * 3); const resources = {};
    for (let j = 0; j < nres; j++) resources['r' + j] = 1 + Math.floor(R() * 3);
    const tasks = [];
    for (let i = 0; i < k; i++) {
      const deps = []; for (let j = 0; j < i; j++) if (R() < 0.3) deps.push('t' + j);
      const uses = {}; for (const rn of Object.keys(resources)) if (R() < 0.5) uses[rn] = 1 + Math.floor(R() * resources[rn]);
      tasks.push({ id: 't' + i, duration: 1 + Math.floor(R() * 5), deps, uses });
    }
    // shuffle listing order (deps may point forward in the list)
    for (let i = tasks.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }
    const proj = { tasks, resources }; const ref = refForecast(proj);
    let got; try { got = forecast(proj, { runs: 3 }); } catch (e) { got = { err: String(e) }; }
    fz++;
    if (!(got.mean === ref.T && got.p50 === ref.T && got.p95 === ref.T && eq(got.criticality, ref.crit))) {
      fzBad++; if (fzBad <= 3) console.log('FUZZ DIFF', JSON.stringify(proj), 'ref', JSON.stringify(ref), 'got', JSON.stringify(got));
    }
  }
}
if (fzBad) fail++; else pass++;
console.log(`${pass} pass, ${fail} fail; M5 fuzz ${fz - fzBad}/${fz} agree`);
process.exit(fail ? 1 : 0);
