// test.mjs — Stopwatch tests. `node test.mjs` exits 0 on success and writes evidence.json, stamped by
// Fresh. Each test's name is a check id in links.json. (Modulo, day 1)
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { record, replay } from './harness.mjs';
import { study, controller, verdictOf, interval, tquantile, MANAGER_LIMIT, report } from './stopwatch.mjs';
import { stamp, filter, artifactsFor, linksOf } from './fresh.mjs';
import { makeClinic } from './fakeclinic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tests = [];
const test = (check, fn) => tests.push({ check, fn });

// ---------------------------------------------------------------- models for the harness
function queueModel(sim) {                      // M1–M4-style, seeded random, signals
  sim.process(function* arrivals() {
    for (let i = 0; i < 20; i++) {
      yield sim.timeout(sim.exponential(1 / 3));
      sim.decide('arrive', { i, late: sim.random() < 0.3 });
    }
  });
  sim.process(function* door() {
    for (;;) { const v = yield sim.signal('door'); sim.decide('door', { v, at: sim.now }); }
  });
}
const randomModel = (sim) => sim.process(function* () {
  for (let i = 0; i < 5; i++) { yield sim.timeout(1); sim.decide('pick', Math.random() < 0.5 ? 'a' : 'b'); }
});
const quietRandom = (sim) => sim.process(function* () {   // calls Math.random but the decision never shows it
  yield sim.timeout(1); sim.decide('x', 1); yield sim.timeout(1); sim.decide('y', Math.random() < 2);
});

test('h1-record-replay', async () => {
  for (const scale of [1, 20, 0.001]) {
    const log = await record(queueModel, { seed: 7, until: 100, scale });
    assert.ok(log.filter((e) => e.kind === 'arrive').length === 20);
    const r = await replay(queueModel, log, { seed: 7, until: 100 });
    assert.deepEqual(r, { ok: true, mismatches: [] }, `scale ${scale}`);
  }
  // a wrong seed is a different model: caught, with an index
  const log = await record(queueModel, { seed: 7, until: 100 });
  const bad = await replay(queueModel, log, { seed: 8, until: 100 });
  assert.equal(bad.ok, false);
  assert.equal(bad.mismatches[0].index, 0);
});

test('h1-injections', async () => {
  const injections = [{ at: 0, name: 'door', value: 'z' }, { at: 12.5, name: 'door', value: 'a' },
    { at: 12.5, name: 'door', value: 'b' }, { at: 40, name: 'door', value: 'c' }, { at: 500, name: 'door', value: 'never' }];
  const log = await record(queueModel, { seed: 3, until: 100, scale: 20, injections });
  const inj = log.filter((e) => e.kind === 'inject');
  assert.deepEqual(inj.map((e) => [e.t, e.data.value]), [[0, 'z'], [12.5, 'a'], [12.5, 'b'], [40, 'c']]);
  const doors = log.filter((e) => e.kind === 'door').map((e) => [e.t, e.data.v]);
  // two injections at the same instant: a signal() waiter sees the first; the second finds nobody waiting yet
  assert.deepEqual(doors, [[0, 'z'], [12.5, 'a'], [40, 'c']]);
  const r = await replay(queueModel, log, { seed: 3, until: 100 });
  assert.deepEqual(r, { ok: true, mismatches: [] });
  // a log edited after the fact is caught
  // a replay that makes fewer decisions than the log (or more) is caught
  assert.equal((await replay(queueModel, log, { seed: 3, until: 50 })).ok, false);
  const extra = [...log, { t: 100, kind: 'door', data: { v: 'x', at: 100 } }];
  const rx = await replay(queueModel, extra, { seed: 3, until: 100 });
  assert.equal(rx.ok, false);
  assert.equal(rx.mismatches.at(-1).got, undefined);
  const edited = log.map((e) => (e.kind === 'door' && e.data.v === 'c' ? { ...e, data: { ...e.data, v: 'C' } } : e));
  assert.equal((await replay(queueModel, edited, { seed: 3, until: 100 })).ok, false);
});

// Ties: an injection at the same sim instant as model entries. Random models (integer times, so
// ties are common) queue entries both at setup and from inside processes, hop with zero delays,
// and decide on shared state the injection changes synchronously (a subscribed box) or through a
// signal. Record and replay must agree on every one. Day 1's replay pre-scheduled each injection
// and failed this whenever the model queued an entry at setup for the injection's instant. (Morphyx, day 2)
function tieModel(c) {
  let x = c * 2654435761 >>> 0;
  const r = (n) => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % n; };
  const plan = [];
  for (let i = 0, k = 2 + r(5); i < k; i++) plan.push({ setup: r(2) === 0, at: r(6), hops: r(3), pre: r(3) });
  return (sim) => {
    const box = sim.subscribe('x'); let sig = 0, hits = 0;
    sim.process(function* () { for (;;) { yield sim.signal('x'); sig++; } });
    const look = (i) => { hits++; sim.decide('look', { i, size: box.size, sig, hits }); };
    const chain = (i, n) => (n ? sim.schedule(0, () => chain(i, n - 1)) : look(i));
    plan.forEach((p, i) => {
      if (p.setup) sim.schedule(p.at, () => chain(i, p.hops));
      else sim.process(function* () {
        if (p.pre && p.pre <= p.at) yield sim.timeout(p.pre);
        yield sim.timeout(p.at - (p.pre && p.pre <= p.at ? p.pre : 0));
        for (let h = 0; h < p.hops; h++) yield sim.timeout(0);
        look(i);
      });
    });
  };
}
test('h1-tie-order', async () => {
  let x = 99;
  const r = (n) => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % n; };
  for (let c = 0; c < 300; c++) {
    const model = tieModel(c);
    const injections = [];
    for (let i = 0, k = 1 + r(4); i < k; i++) injections.push({ at: r(7), name: 'x', value: i });
    const scale = [1, 7, 0.25][c % 3];
    const log = await record(model, { seed: 1, until: 8, scale, injections });
    const res = await replay(model, log, { seed: 1, until: 8 });
    assert.ok(res.ok, `case ${c} scale ${scale}: ${JSON.stringify(res.mismatches[0])}`);
  }
});

test('h2-math-random', async () => {
  const log = await record(randomModel, { seed: 1, until: 10 });
  const r = await replay(randomModel, log, { seed: 1, until: 10 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatches[0], { index: 0, expected: 'no Math.random', got: 'Math.random called' });
  // the tripwire catches it even when the decision can't diverge
  const q = await replay(quietRandom, await record(quietRandom, { seed: 1, until: 10 }), { seed: 1, until: 10 });
  assert.equal(q.ok, false);
  assert.equal(q.mismatches.length, 1);
  assert.equal(q.mismatches[0].index, 1);
  assert.equal(Math.random.name, 'random');                     // restored
  assert.ok(typeof Math.random() === 'number');
});

// ---------------------------------------------------------------- the study
const shapes = [
  { perMorning: 25, waitMean: 30 }, { perMorning: 8, waitMean: 60 }, { perMorning: 40, waitMean: 20 },
  { perMorning: 1, waitMean: 30 }, { perMorning: 0, waitMean: 30 }, { perMorning: 60, waitMean: 5 },
];
const wellFormed = (r) => {
  assert.deepEqual(Object.keys(r).sort(), ['estimate', 'hi', 'lo', 'mornings', 'reason', 'timed', 'verdict']);
  assert.ok(Number.isInteger(r.mornings) && Number.isInteger(r.timed));
  assert.ok(['tablet reads true', 'tablet reads long', 'tablet reads short', 'cannot tell'].includes(r.verdict));
  assert.ok(typeof r.reason === 'string' && r.reason.length > 10);
  assert.ok(r.lo <= r.hi);
  if (r.timed > 0) assert.ok(Number.isFinite(r.estimate) && r.lo <= r.estimate && r.estimate <= r.hi);
};

test('s1-legal-calls', async () => {
  let i = 0;
  for (const shape of shapes) for (const noise of ['normal', 'exp', 'zero']) for (const max of [1, 3, 5, 9]) {
    const c = makeClinic({ seed: ++i, mean: 2, noise, ...shape });   // throws on any illegal call
    const r = await study(c, { seed: 1, maxMornings: max });
    wellFormed(r);
    assert.equal(r.mornings, Math.min(max, MANAGER_LIMIT));
    assert.equal(c.calls.morning, Math.min(max, MANAGER_LIMIT));
    assert.equal(c.calls.time, r.timed);
  }
  // a clinic whose manager stops at 3 and a study asked for 3 never touches a 4th
  const c = makeClinic({ seed: 99, limit: 3 });
  assert.equal((await study(c, { maxMornings: 3 })).mornings, 3);
  await assert.rejects(study(makeClinic(), { alpha: 0 }));
  // a patient arriving at exactly the moment the last one was seen may be timed ("at or after")
  const exact = {
    m: [[{ id: 'a', arrive: 0 }, { id: 'b', arrive: 10.1 }, { id: 'c', arrive: 10.2 }]], k: 0,
    morning(k) { this.k = k; return this.m[k - 1] || []; },
    time(id) { return { a: 10.1, b: 3, c: 1 }[id]; },
    tablet(id) { return { a: 11, b: 4, c: 2 }[id]; },
  };
  const ids = [];
  const t0 = exact.time.bind(exact);
  exact.time = (id) => { ids.push(id); return t0(id); };
  await study(exact, { maxMornings: 1 });
  assert.deepEqual(ids, ['a', 'b']);
  // S-g: unusable readings. A blank tablet reading is left out and counted; a blank stopwatch wait
  // ends that morning's timing (we can't know when the observer is free). Still well-formed, still legal.
  const holes = makeClinic({ seed: 5, mean: 3 });
  const tab0 = holes.tablet.bind(holes), time0 = holes.time.bind(holes);
  let nth = 0, blankTime = null;
  const bad = new Set();
  holes.tablet = (id) => { if (++nth % 4 === 0) { bad.add(id); return null; } return tab0(id); };
  holes.time = (id) => { const w = time0(id); if (blankTime === null && nth > 10) { blankTime = id; bad.add(id); return undefined; } return w; };
  const rh = await study(holes, { seed: 1 });
  wellFormed(rh);
  assert.ok(Number.isFinite(rh.estimate) && Number.isFinite(rh.lo), JSON.stringify(rh));
  assert.ok(bad.size >= 2);
  assert.equal(rh.timed + bad.size, holes.calls.time);
  assert.match(rh.reason, /no usable reading/);
  // S-h: the small-sample caveat appears exactly when 0.9^n > alpha (n ≤ 28 at alpha 0.05), with the number.
  const ds = (n) => Array.from({ length: n }, (_, i) => (i % 3) - 1 + 0.5);
  assert.match(report({ mornings: 5, diffs: ds(16) }, 0.05).reason, /19% chance none of these 16/);
  assert.match(report({ mornings: 5, diffs: ds(28) }, 0.05).reason, /5% chance none of these 28/);
  assert.doesNotMatch(report({ mornings: 5, diffs: ds(29) }, 0.05).reason, /chance none/);
  assert.doesNotMatch(report({ mornings: 5, diffs: ds(16) }, 0.2).reason, /chance none/);
  // S-g (Modulo, day 3): every odd stopwatch value, every 5th call, on a strict clinic. null, '',
  // -1 used to make the next call illegal; '12' crashed the sim. Odd tablet values too: null - w is
  // a finite number, so it must be refused by type, not by isFinite of the difference.
  for (const odd of [null, undefined, NaN, '', '12', -1, Infinity, {}]) for (const where of ['time', 'tablet']) {
    for (let s = 1; s <= 8; s++) {
      const c = makeClinic({ seed: 300 + s, mean: 2 });
      const f0 = c[where].bind(c); let n = 0, planted = 0;
      c[where] = (id) => { const v = f0(id); if (++n % 5 === 0) { planted++; return odd; } return v; };
      const r = await study(c, { seed: 1 });
      wellFormed(r);
      assert.ok(Number.isFinite(r.estimate), `${where}=${String(odd)}: ${JSON.stringify(r)}`);
      // A negative *tablet* wait is still a reading: refusing it would select on the difference and
      // bias the mean. A negative stopwatch wait is refused (the observer can't be free before arrival).
      if (where === 'tablet' && odd === -1) assert.equal(r.timed, c.calls.time);
      else assert.equal(r.timed + planted, c.calls.time, `${where}=${String(odd)}: every planted reading is left out`);
    }
  }
});

test('s2-coverage-bias', async () => {
  // 600 clinics, true means spread over −4..9, three noise shapes. Bounds are the lab's.
  let hit = 0, err = 0, N = 0;
  for (const noise of ['normal', 'exp', 't3']) for (let i = 0; i < 200; i++) {
    const mean = ((i * 7919) % 1300) / 100 - 4;
    const r = await study(makeClinic({ seed: 1000 + i, mean, noise }), { seed: 1 });
    if (r.lo <= mean && mean <= r.hi) hit++;
    err += r.estimate - mean; N++;
  }
  const cov = hit / N;
  assert.ok(cov >= 0.9 && cov <= 0.99, `coverage ${cov}`);
  assert.ok(Math.abs(err / N) < 1, `bias ${err / N}`);
  // the quantile itself
  assert.ok(Math.abs(tquantile(0.975, 10) - 2.228138852) < 1e-6);
  assert.ok(Math.abs(tquantile(0.975, 1) - 12.70620474) < 1e-5);
  // symmetric data: Hall's interval is the plain t interval
  const sym = interval([-2, -1, 0, 1, 2], 0.05);
  assert.ok(Math.abs(sym.hi - 2.776445105 * Math.sqrt(2.5) / Math.sqrt(5)) < 1e-6);
  // a right-skewed sample bends the interval right of the mean
  const sk = interval([0, 0, 0, 0, 0, 0, 0, 0, 1, 10], 0.05);
  assert.ok(sk.hi - sk.estimate > sk.estimate - sk.lo);
});

test('s3-verdict-table', async () => {
  const rows = [
    [-2, 2, 'tablet reads true'], [-1, 1, 'tablet reads true'], [0.5, 2, 'tablet reads true'],
    [-2.0001, 2, 'cannot tell'], [0.5, 2.0001, 'tablet reads long'], [0, 3, 'cannot tell'],
    [1e-9, 30, 'tablet reads long'], [-30, -1e-9, 'tablet reads short'], [-3, 0, 'cannot tell'],
    [-2, -1, 'tablet reads true'], [-Infinity, Infinity, 'cannot tell'], [5, 5, 'tablet reads long'],
  ];
  for (const [lo, hi, v] of rows) assert.equal(verdictOf(lo, hi), v, `[${lo}, ${hi}]`);
  // and the study uses it
  for (const mean of [-10, 0, 10]) {
    const r = await study(makeClinic({ seed: 5, mean, sd: 1 }));
    assert.equal(r.verdict, verdictOf(r.lo, r.hi));
    assert.equal(r.verdict, { '-10': 'tablet reads short', 0: 'tablet reads true', 10: 'tablet reads long' }[mean]);
  }
});

test('s4-reproducible', async () => {
  const opts = { seed: 21, mean: 3, noise: 'exp' };
  assert.deepEqual(await study(makeClinic(opts), { seed: 4 }), await study(makeClinic(opts), { seed: 4 }));
  // through the harness: record against one clinic, replay against its twin
  const log = await record(controller(makeClinic(opts), { maxMornings: 5 }), { seed: 4, scale: 1 });
  assert.ok(log.filter((e) => e.kind === 'morning').length === 5);
  const r = await replay(controller(makeClinic(opts), { maxMornings: 5 }), log, { seed: 4 });
  assert.deepEqual(r, { ok: true, mismatches: [] });
  // a twin that isn't one (different hidden clinic) shows up as mismatches, not a silent pass
  const r2 = await replay(controller(makeClinic({ ...opts, seed: 22 }), { maxMornings: 5 }), log, { seed: 4 });
  assert.equal(r2.ok, false);
});

// ---------------------------------------------------------------- Fresh
test('f1-fresh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fresh-'));
  try {
    const files = { 'a.mjs': 'A', 'b.mjs': 'B', 'c.md': 'C' };
    for (const [f, s] of Object.entries(files)) writeFileSync(join(dir, f), s);
    const read = (p) => readFileSync(join(dir, p));
    const links = [
      { from: 'a.mjs', rel: 'implements', to: 'R1' }, { from: 'b.mjs', rel: 'implements', to: 'R2' },
      { from: 'a.mjs', rel: 'implements', to: 'R3' }, { from: 'c.md', rel: 'implements', to: 'R3' },
      { from: 'k1', rel: 'verifies', to: 'R1' }, { from: 'k2', rel: 'verifies', to: 'R2' },
      { from: 'k3', rel: 'verifies', to: 'R3' }, { from: 'k4', rel: 'verifies', to: 'R4' },
    ];
    const ev = ['k1', 'k2', 'k3', 'k4'].map((check) => stamp({ check, ok: true }, links, read));
    assert.deepEqual(Object.keys(ev[2].digests), ['a.mjs', 'c.md']);
    assert.equal(ev[0].digests['a.mjs'], '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd'); // sha256("A"), per `printf A | sha256sum`
    assert.deepEqual(ev[3].digests, {});
    assert.deepEqual(filter(ev, links, read), ev);                         // nothing changed: nothing drops
    writeFileSync(join(dir, 'a.mjs'), 'A ');
    assert.deepEqual(filter(ev, links, read).map((e) => e.check), ['k2', 'k4']);
    writeFileSync(join(dir, 'a.mjs'), 'A');                               // put back: evidence is good again
    assert.deepEqual(filter(ev, links, read).map((e) => e.check), ['k1', 'k2', 'k3', 'k4']);
    // F-d: the links moved under the evidence. R2 gains c.md (never hashed for k2): k2 drops.
    // R3 loses c.md: a later change to c.md no longer bears on k3.
    const grown = [...links, { from: 'c.md', rel: 'implements', to: 'R2' }];
    assert.deepEqual(filter(ev, grown, read).map((e) => e.check), ['k1', 'k3', 'k4']);
    const shrunk = links.filter((l) => !(l.from === 'c.md' && l.to === 'R3'));
    writeFileSync(join(dir, 'c.md'), 'C changed');
    assert.deepEqual(filter(ev, shrunk, read).map((e) => e.check), ['k1', 'k2', 'k3', 'k4']);
    assert.deepEqual(filter(ev, links, read).map((e) => e.check), ['k1', 'k2', 'k4']);
    writeFileSync(join(dir, 'c.md'), 'C');
    rmSync(join(dir, 'c.md'));                                              // deleted file: k3 drops
    assert.deepEqual(filter(ev, links, read).map((e) => e.check), ['k1', 'k2', 'k4']);
    assert.deepEqual(filter([{ check: 'k1', ok: true }], links, read), []); // never stamped
    const gone = stamp({ check: 'k3', ok: true }, links, read);            // stamped while c.md is missing
    assert.equal(gone.digests['c.md'], null);
    assert.deepEqual(filter([gone], links, read), []);                      // null never matches
    // the link shapes we accept give the same artifacts
    const pairs = { implements: links.filter((l) => l.rel === 'implements').map((l) => [l.from, l.to]),
      verifies: links.filter((l) => l.rel === 'verifies').map((l) => [l.from, l.to]) };
    assert.deepEqual(artifactsFor('k3', pairs), artifactsFor('k3', { links }));
    // requirements unverified after a change: the ones whose only evidence dropped
    const verified = (evd) => new Set(evd.flatMap((e) => linksOf(links).filter((l) => l.rel === 'verifies' && l.from === e.check).map((l) => l.to)));
    writeFileSync(join(dir, 'c.md'), 'C'); writeFileSync(join(dir, 'b.mjs'), 'b');
    assert.deepEqual([...verified(filter(ev, links, read))].sort(), ['R1', 'R3', 'R4']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the project measured on itself
test('v1-project-files', async () => {
  const reqs = JSON.parse(readFileSync(join(here, 'requirements.json'), 'utf8')).requirements;
  const links = linksOf(JSON.parse(readFileSync(join(here, 'links.json'), 'utf8')));
  const checks = new Set(tests.map((t) => t.check));
  for (const r of reqs) {
    assert.ok(links.some((l) => l.rel === 'implements' && l.to === r.id), `${r.id} has no implementing artifact`);
    assert.ok(links.some((l) => l.rel === 'verifies' && l.to === r.id && checks.has(l.from)), `${r.id} has no check in test.mjs`);
  }
  for (const l of links) if (l.rel === 'implements') assert.ok(existsSync(join(here, l.from)), `${l.from} missing`);
  for (const l of links) if (l.rel === 'verifies') assert.ok(checks.has(l.from), `${l.from} is not a test`);
});

// ---------------------------------------------------------------- run
let fail = 0;
const evidence = [];
const links = JSON.parse(readFileSync(join(here, 'links.json'), 'utf8'));
const read = (p) => readFileSync(join(here, p));
for (const t of tests) {
  try { await t.fn(); console.log('ok  ', t.check); evidence.push(stamp({ check: t.check, ok: true }, links, read)); }
  catch (e) { fail++; console.log('FAIL', t.check, '\n   ', e.message.split('\n').slice(0, 4).join('\n    ')); }
}
console.log(`${tests.length - fail}/${tests.length} passed`);
if (process.env.STOPWATCH_NO_EVIDENCE !== '1') {
  writeFileSync(join(here, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
}
process.exit(fail ? 1 : 0);
