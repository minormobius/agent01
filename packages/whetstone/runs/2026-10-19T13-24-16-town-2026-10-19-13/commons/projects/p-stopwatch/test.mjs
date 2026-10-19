// node test.mjs — runs every check, writes evidence.json (stamped by Fresh), exits 0 only
// if all pass. Check ids are linked to requirements in links.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { record, replay } from './harness.mjs';
import { study, studyLogged, model, verdictOf, tQuantile, diagnose } from './stopwatch.mjs';
import { makeClinic } from './clinic-sim.mjs';
import { stamp, filter, dependsOn } from './fresh.mjs';
import { measure } from './measure.mjs';
import { load, status } from './tools/vv/vv.mjs';

const results = [];
async function check(id, fn) {
  try { await fn(); results.push({ check: id, result: 'pass' }); console.log('ok  ', id); }
  catch (e) { results.push({ check: id, result: 'fail' }); console.log('FAIL', id, '-', e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A small model: a customer stream into one server; decisions use only the sim's random.
function shop(sim) {
  const res = [];
  sim.process(function* () {
    for (let i = 0; i < 20; i++) {
      yield sim.timeout(sim.exponential(1));
      sim.decide('arrive', { i, pick: sim.random() < 0.5 ? 'a' : 'b' });
    }
  });
  sim.process(function* () {
    for (;;) { const v = yield sim.signal('door'); sim.decide('door', { v, n: res.push(v) }); }
  });
}

await check('T-H1-MATCH', async () => {
  for (const seed of [1, 2, 'x']) for (const scale of [1, 1000, 0.37]) {
    const injections = [{ at: 3, name: 'door', value: 'open' }, { at: 0, name: 'door', value: 'first' }, { at: 7.25, name: 'door', value: { z: [1, 2] } }];
    const log = await record(shop, { seed, until: 50, scale, injections });
    assert(log.filter((e) => e.kind === 'inject').length === 3, 'three injections logged');
    assert(log.some((e) => e.kind === 'door'), 'the model heard the door');
    const r = await replay(shop, log, { seed, until: 50 });
    assert(r.ok && r.mismatches.length === 0, `seed ${seed} scale ${scale}: ${JSON.stringify(r.mismatches[0])}`);
  }
});

await check('T-H1-SAMETIME', async () => {
  // Injections at exactly an event's time, and two at one time, keep their order on replay.
  const m = (sim) => {
    sim.process(function* () { for (let i = 0; i < 4; i++) { yield sim.timeout(5); sim.decide('tick', { i }); } });
    sim.process(function* () { for (;;) { const v = yield sim.signal('s'); sim.decide('heard', { v }); } });
  };
  const injections = [{ at: 5, name: 's', value: 1 }, { at: 10, name: 's', value: 2 }, { at: 10, name: 's', value: 3 }, { at: 12, name: 's', value: 4 }];
  const log = await record(m, { seed: 1, until: 30, injections });
  const order = log.filter((e) => e.kind !== 'inject').map((e) => `${e.kind}${e.data.i ?? e.data.v}@${e.t}`).join(' ');
  // Each injection lands after everything already at its time, and one at a time: 1 comes
  // after tick0 at 5, and 3 is heard because the listener re-waits after 2 before 3 is delivered.
  assert(order === 'tick0@5 heard1@5 tick1@10 heard2@10 heard3@10 heard4@12 tick2@15 tick3@20', order);
  const r = await replay(m, log, { seed: 1, until: 30 });
  assert(r.ok, JSON.stringify(r.mismatches));
});

await check('T-H2-RANDOM', async () => {
  const bad = (sim) => sim.process(function* () {
    for (let i = 0; i < 5; i++) { yield sim.timeout(1); sim.decide('pick', { v: Math.random() < 0.5 }); }
    sim.decide('x', { v: Math.random() });
  });
  const log = await record(bad, { seed: 1, until: 10 });
  const r = await replay(bad, log, { seed: 1, until: 10 });
  assert(!r.ok && r.mismatches.length >= 1, 'Math.random not caught');
  assert('expected' in r.mismatches[0] && 'got' in r.mismatches[0] && Number.isInteger(r.mismatches[0].index), 'mismatch shape');
  // A changed seed is caught too; a missing or extra decision is a mismatch.
  const log2 = await record(shop, { seed: 1, until: 50 });
  assert(!(await replay(shop, log2, { seed: 2, until: 50 })).ok, 'other seed not caught');
  const r3 = await replay(shop, log2.slice(0, -1), { seed: 1, until: 50 });
  assert(!r3.ok && r3.mismatches.at(-1).expected === null, 'extra decision not caught');
});

const loads = [{}, { rate: 1 / 40 }, { rate: 1 / 5, servers: 2 }, { rate: 7.53 / 420, waits: 'tri' }, { rate: 1 / 400 }];

await check('T-S1-SAFE', async () => {
  // The stand-in clinic throws on any impossible timing, a repeated or late morning, or a sixth.
  for (let s = 1; s <= 200; s++) {
    const L = loads[s % loads.length];
    const r = await study(makeClinic({ seed: s, mean: s % 9 - 4, sd: 1 + s % 6, ...L }), { seed: s });
    assert(r.mornings >= 1 && r.mornings <= 5 && Number.isInteger(r.timed) && r.timed >= 0, 'counts');
    assert(['tablet reads true', 'tablet reads long', 'tablet reads short', 'cannot tell'].includes(r.verdict), 'verdict');
    assert(typeof r.reason === 'string' && r.reason.length > 20, 'reason');
    assert(r.timed < 2 || (Number.isFinite(r.estimate) && r.lo <= r.estimate && r.estimate <= r.hi), 'interval');
  }
  const r = await study(makeClinic({ seed: 3, limit: 2 }), { seed: 3, maxMornings: 2 });
  assert(r.mornings === 2, 'maxMornings respected');
});

await check('T-S2-HONEST', async () => {
  const rows = await measure({ N: 300, shapes: ['normal', 'skew', 'heavy'], loads: [[1 / 40, 1, 'queue'], [7.53 / 420, 1, 'tri']] });
  for (const r of rows) {
    assert(r.cover >= 0.9 && r.cover <= 0.99, `${r.shape} ${r.load}: cover ${r.cover}`);
    assert(Math.abs(r.bias) < 1, `${r.shape} ${r.load}: bias ${r.bias}`);
  }
});

await check('T-S2-TQUANT', async () => {
  for (const [df, q] of [[1, 12.7062], [4, 2.7764], [11, 2.2010], [30, 2.0423], [200, 1.9719]])
    assert(near(tQuantile(0.975, df), q, 1e-4), `t(${df}) = ${tQuantile(0.975, df)}`);
});

await check('T-S3-VERDICT', async () => {
  const cases = [[-2, 2, 'tablet reads true'], [-2.0001, 2, 'cannot tell'], [0.5, 2.5, 'tablet reads long'],
    [-1, 1, 'tablet reads true'], [1, 3, 'tablet reads long'], [-3, -0.1, 'tablet reads short'], [0, 3, 'cannot tell'],
    [-3, 0, 'cannot tell'], [-Infinity, Infinity, 'cannot tell'], [3, 5, 'tablet reads long']];
  for (const [lo, hi, v] of cases) assert(verdictOf(lo, hi) === v, `[${lo}, ${hi}] -> ${verdictOf(lo, hi)}`);
  for (let s = 1; s <= 60; s++) {
    const r = await study(makeClinic({ seed: s, mean: s % 13 - 6, sd: 1 + s % 4 }), { seed: s });
    assert(r.verdict === verdictOf(r.lo, r.hi), 'report verdict follows its interval');
  }
});

await check('T-S4-REPRO', async () => {
  for (const s of [1, 7, 42]) {
    const opts = { seed: s, mean: 3, sd: 4, rate: 1 / 30 };
    const a = await studyLogged(makeClinic(opts), { seed: s });
    const b = await study(makeClinic(opts), { seed: s });
    assert(JSON.stringify(a.report) === JSON.stringify(b), 'same seed, same clinic, same report');
    // The controller replays against a second clinic built the same way.
    const r = await replay(model(makeClinic(opts)), a.log, { seed: s });
    assert(r.ok, `replay: ${JSON.stringify(r.mismatches[0])}`);
    assert(a.log.at(-1).kind === 'report', 'the report is the last decision');
  }
});

await check('T-F1-DROP', async () => {
  const links = JSON.parse(readFileSync('links.json', 'utf8'));
  const reqs = load(JSON.parse(readFileSync('requirements.json', 'utf8'))).reqs ?? JSON.parse(readFileSync('requirements.json', 'utf8'));
  const files = new Map();
  const disk = (p) => { if (!files.has(p)) files.set(p, readFileSync(p)); return files.get(p); };
  const checks = [...new Set(links.filter((l) => l.kind === 'verifies').map((l) => l.from))];
  const ev = checks.map((c) => stamp({ check: c, result: 'pass', at: '2026-10-04' }, links, disk));
  assert(filter(ev, links, disk).length === ev.length, 'untouched files: nothing drops');
  const verified = (evidence) => [...status(reqs, links, evidence, {}).entries ? status(reqs, links, evidence, {}).entries() : Object.entries(status(reqs, links, evidence, {}))]
    .filter(([, s]) => (s.status ?? s) === 'verified').map(([id]) => id).sort();
  const before = verified(ev);
  for (const f of ['harness.mjs', 'stopwatch.mjs', 'fresh.mjs']) {
    const changed = (p) => (p === f ? Buffer.concat([disk(p), Buffer.from('\n')]) : disk(p));
    const kept = filter(ev, links, changed);
    const want = ev.filter((e) => !dependsOn(e.check, links).includes(f));
    assert(kept.length < ev.length && JSON.stringify(kept) === JSON.stringify(want), `${f}: exactly its dependants drop`);
    const after = verified(kept);
    const lost = before.filter((id) => !after.includes(id));
    const impl = links.filter((l) => l.kind === 'implements' && l.from === f).map((l) => l.to);
    assert(impl.every((id) => lost.includes(id)), `${f}: requirements it implements now unverified (${lost})`);
  }
  assert(filter([{ check: 'T-H1-MATCH', result: 'pass' }], links, disk).length === 0, 'unstamped evidence counts for nothing');
});

// ---- Hand-worked checks (Morphyx, turn 2). Each was added because a mutant in
// shelf/stopwatch-mutants.json survived the checks above. Expected values are worked by
// hand or from printed t tables, never from the code under test.

// A scripted clinic that keeps SPEC's rules: days = [[{ id, arrive, wait, tablet }], ...].
function scripted(days, limit = days.length) {
  let asked = 0, cur = null, seen = -Infinity, idx = -1; const done = new Set();
  return {
    morning(k) { if (k !== asked + 1 || k > limit) throw new Error(`morning ${k}`); asked = k; cur = days[k - 1]; seen = -Infinity; idx = -1; return cur.map(({ id, arrive }) => ({ id, arrive })); },
    time(id) {
      const i = cur.findIndex((p) => p.id === id); const p = cur[i];
      if (!p || done.has(id) || i <= idx || p.arrive < seen) throw new Error(`impossible timing ${id}`);
      done.add(id); idx = i; seen = p.arrive + p.wait; return p.wait;
    },
    tablet(id) { for (const d of days.slice(0, asked)) { const p = d.find((q) => q.id === id); if (p) return p.tablet; } throw new Error(`tablet ${id}`); },
  };
}
// diffs 2, 4, (C skipped: busy), 6 | 0 | 8 | -2 | 2. B arrives exactly when A is seen: SPEC
// says "at or after", so B is timed. C arrives while D... no: C arrives at 12, observer busy to 15.
const fiveDays = () => [
  [{ id: 'A', arrive: 0, wait: 10, tablet: 12 }, { id: 'B', arrive: 10, wait: 5, tablet: 9 },
   { id: 'C', arrive: 12, wait: 3, tablet: 0 }, { id: 'D', arrive: 15, wait: 5, tablet: 11 }],
  [{ id: 'E', arrive: 1, wait: 2, tablet: 2 }],
  [{ id: 'F', arrive: 0, wait: 4, tablet: 12 }],
  [{ id: 'H', arrive: 5, wait: 5, tablet: 3 }],
  [{ id: 'G', arrive: 0, wait: 1, tablet: 3 }],
];

await check('T-S2-EXACT', async () => {
  // diffs 2 4 6 0 8 -2 2: n 7, mean 20/7, ss = sum d^2 - n mean^2 = 128 - 400/7 = 496/7.
  const mean = 20 / 7, se = Math.sqrt(496 / 7 / 6 / 7);
  for (const [alpha, t] of [[0.05, 2.446912], [0.1, 1.943180]]) {
    const r = await study(scripted(fiveDays()), { seed: 1, alpha });
    assert(r.mornings === 5 && r.timed === 7, `mornings ${r.mornings} timed ${r.timed}`);
    assert(near(r.estimate, mean, 1e-9), `estimate ${r.estimate}`);
    assert(near(r.lo, mean - t * se, 1e-5) && near(r.hi, mean + t * se, 1e-5), `alpha ${alpha}: [${r.lo}, ${r.hi}]`);
    assert(r.verdict === verdictOf(r.lo, r.hi), 'verdict follows interval');
  }
});

await check('T-S1-RULES', async () => {
  // Every morning offered is used (the fixed-design decision), and one timed patient gives
  // the whole line, per README.
  const one = [[], [], [{ id: 'X', arrive: 3, wait: 7, tablet: 9 }], [], []];
  const r = await study(scripted(one), { seed: 1 });
  assert(r.mornings === 5 && r.timed === 1 && r.estimate === 2, JSON.stringify(r));
  assert(r.lo === -Infinity && r.hi === Infinity && r.verdict === 'cannot tell', `n=1: [${r.lo}, ${r.hi}] ${r.verdict}`);
  const none = await study(scripted([[], [], []]), { seed: 1, maxMornings: 3 });
  assert(none.mornings === 3 && none.timed === 0 && none.verdict === 'cannot tell', JSON.stringify(none));
});

await check('T-S3-ORDER', async () => {
  // 'true' is tested before 'long': an interval inside (0, 2] reads true.
  for (const [lo, hi] of [[0.5, 1.5], [0.01, 2], [-2, -0.01]]) assert(verdictOf(lo, hi) === 'tablet reads true', `[${lo}, ${hi}]`);
});

await check('T-H1-SCALE', async () => {
  // SPEC: an injection lands when the clock reaches at × scale ms, i.e. at sim time `at`.
  const m = (sim) => sim.process(function* () { for (;;) { const v = yield sim.signal('s'); sim.decide('heard', { v }); } });
  for (const scale of [1000, 0.37, 1]) {
    const log = await record(m, { seed: 1, until: 20, scale, injections: [{ at: 3, name: 's', value: 1 }, { at: 11.5, name: 's', value: 2 }] });
    const ts = log.map((e) => `${e.kind}@${e.t}`).join(' ');
    assert(ts === 'inject@3 heard@3 inject@11.5 heard@11.5', `scale ${scale}: ${ts}`);
  }
});

await check('T-H1-SPAWN', async () => {
  // Tie rule: an injection at t lands after entries at t spawned by entries at t.
  const m = (sim) => {
    sim.process(function* () { yield sim.timeout(5); sim.decide('tick', {}); yield sim.timeout(0); sim.decide('after', {}); });
    sim.process(function* () { const v = yield sim.signal('s'); sim.decide('heard', { v }); });
  };
  const log = await record(m, { seed: 1, until: 10, injections: [{ at: 5, name: 's', value: 1 }] });
  // The inject line is where the rule shows: a listener's resumption is one more same-time
  // hop, so 'heard' comes last either way, but delivery must come after 'after'.
  const order = log.map((e) => e.kind).join(' ');
  assert(order === 'tick after inject heard', order);
  assert((await replay(m, log, { seed: 1, until: 10 })).ok, 'replay');
});

await check('T-H1-COPY', async () => {
  // A model that mutates what it logged can't rewrite the log.
  const m = (sim) => sim.process(function* () { const o = { n: 1 }; sim.decide('o', o); o.n = 2; yield sim.timeout(1); });
  const log = await record(m, { seed: 1, until: 5 });
  assert(log[0].data.n === 1, `logged ${log[0].data.n}`);
});

await check('T-H2-TIME', async () => {
  // Math.random that moves only *when* a decision is made, not what it says, is caught.
  const m = (sim) => sim.process(function* () { yield sim.timeout(1 + Math.random()); sim.decide('x', { v: 1 }); });
  const log = await record(m, { seed: 1, until: 5 });
  assert(!(await replay(m, log, { seed: 1, until: 5 })).ok, 'a moved decision time not caught');
});

await check('T-F1-HAND', async () => {
  // Hand-listed from links.json, not from dependsOn: change one file, these and only these drop.
  const links = JSON.parse(readFileSync('links.json', 'utf8'));
  const disk = (p) => readFileSync(p);
  const all = ['T-H1-MATCH', 'T-S2-HONEST', 'T-S2-TQUANT', 'T-F1-DROP', 'T-V1-SELF', 'T-S4-REPRO'];
  const ev = all.map((c) => stamp({ check: c, result: 'pass' }, links, disk));
  const drops = { 'fresh.mjs': ['T-F1-DROP'], 'clinic-sim.mjs': ['T-S2-HONEST', 'T-S2-TQUANT'], 'test.mjs': ['T-V1-SELF'],
    'harness.mjs': ['T-H1-MATCH', 'T-S4-REPRO'] };
  for (const [f, want] of Object.entries(drops)) {
    const kept = filter(ev, links, (p) => (p === f ? Buffer.concat([disk(p), Buffer.from(' ')]) : disk(p))).map((e) => e.check);
    const lost = all.filter((c) => !kept.includes(c));
    assert(JSON.stringify(lost) === JSON.stringify(want), `${f}: dropped ${lost}, want ${want}`);
  }
});

// ---- The diagnostic (Modulo, turn 3, ta-a63ca2). Values worked by hand.
await check('T-S5-DIAG', async () => {
  // Drift: one morning, back to back. w 1 2 3 4, d 0 1 2 4 (tablet 1 3 5 8).
  // mw 2.5, md 1.75, Sxx 5, Sxy 6.5, b 1.3; residuals .2 -.1 -.4 .3, SSE .30;
  // se sqrt(.30/2/5) = .173205; t(.975, 2) = 4.302653; interval [.5547, 2.0453] excludes 0.
  const drift = [[{ id: 'A', arrive: 0, wait: 1, tablet: 1 }, { id: 'B', arrive: 1, wait: 2, tablet: 3 },
    { id: 'C', arrive: 3, wait: 3, tablet: 5 }, { id: 'D', arrive: 6, wait: 4, tablet: 8 }]];
  const { report: r, log } = await studyLogged(scripted(drift), { seed: 1, maxMornings: 1 });
  const d = log.find((e) => e.kind === 'diagnostic').data;
  assert(near(d.slope, 1.3, 1e-9) && near(d.slopeLo, 1.3 - 4.302653 * Math.sqrt(0.03), 1e-5) && near(d.slopeHi, 1.3 + 4.302653 * Math.sqrt(0.03), 1e-5), JSON.stringify(d));
  assert(d.lean === null, 'nobody untimed, so no lean');
  assert(/grew by about 13\.0 min for every 10 min/.test(r.reason), r.reason);
  // The diagnostic changes nothing else: interval of d 0 1 2 4 by hand. mean 1.75,
  // ss 8.75, se sqrt(8.75/3/4), t(.975, 3) = 3.182446.
  const h = 3.182446 * Math.sqrt(8.75 / 12);
  assert(near(r.estimate, 1.75, 1e-12) && near(r.lo, 1.75 - h, 1e-5) && near(r.hi, 1.75 + h, 1e-5) && r.verdict === 'cannot tell', JSON.stringify(r));
  assert(JSON.stringify(Object.keys(r)) === JSON.stringify(['mornings', 'timed', 'estimate', 'lo', 'hi', 'verdict', 'reason']), Object.keys(r).join());
  assert(!/\.\s/.test(r.reason) && r.reason.endsWith('.'), `one sentence: ${r.reason}`);

  // Lean: A, C, D timed (wait 1, d 1, tablet 2); B arrives while A is watched, tablet 30.
  // Waits all equal, so no slope (Sxx 0). Lean 2 - 30 = -28.
  const lean = [[{ id: 'A', arrive: 0, wait: 1, tablet: 2 }, { id: 'B', arrive: 0.5, wait: 29, tablet: 30 },
    { id: 'C', arrive: 1, wait: 1, tablet: 2 }, { id: 'D', arrive: 2, wait: 1, tablet: 2 }]];
  const l = await studyLogged(scripted(lean), { seed: 1, maxMornings: 1 });
  const ld = l.log.find((e) => e.kind === 'diagnostic').data;
  assert(ld.slope === null && ld.lean === -28, JSON.stringify(ld));
  assert(/waited about 28\.0 min less than the others/.test(l.report.reason), l.report.reason);
  // Lean of exactly -5 says so (inclusive); -4.9 doesn't.
  for (const [t, says] of [[6, true], [5.9, false]]) {
    const days = [[{ id: 'A', arrive: 0, wait: 1, tablet: 1 }, { id: 'B', arrive: 0.5, wait: 5, tablet: t }, { id: 'C', arrive: 1, wait: 1, tablet: 1 }]];
    const x = await study(scripted(days), { seed: 1, maxMornings: 1 });
    assert(/waited about/.test(x.reason) === says, `untimed tablet ${t}: ${x.reason}`);
  }
  // The five-day script: b = 18/348, interval holds 0, lean +7.4 (timed waited longer): no clause.
  const five = await studyLogged(scripted(fiveDays()), { seed: 1 });
  const fd = five.log.find((e) => e.kind === 'diagnostic').data;
  assert(near(fd.slope, 18 / 348, 1e-12) && near(fd.lean, 52 / 7, 1e-12) && fd.clause === null, JSON.stringify(fd));
  // And it replays.
  assert((await replay(model(scripted(fiveDays()), {}, {}), five.log, { seed: 1 })).ok, 'replay with diagnostic');

  // Edges, by Morphyx (ta-93ec97). The log copies through JSON, so NaN reads as null
  // there; these call diagnose() directly so "not computed" can't hide a NaN.
  const P = (ws, ds) => ws.map((w, i) => ({ w, d: ds[i] }));
  const nobody = diagnose(P([1, 2, 3, 4], [0, 1, 2, 4]), [], 0.05);
  assert(nobody.lean === null, `no untimed: lean ${nobody.lean}`);
  assert(diagnose(P([1, 1, 1], [1, 2, 4]), [9], 0.05).slope === null, 'equal waits: no slope');
  assert(diagnose(P([1, 2], [1, 3]), [], 0.05).slope === null, 'two patients: no slope (0 df)');
  // Constant difference over varying waits (the unseen-lump clinic): slope 0, SSE 0, so
  // the interval is [0, 0]. It touches 0 and does not exclude it: no clause.
  const flat = diagnose(P([1, 2, 3], [2, 2, 2]), [], 0.05);
  assert(flat.slope === 0 && flat.slopeLo === 0 && flat.clause === null, JSON.stringify(flat));
  // Mirror of the drift morning: d 4 2 1 0, Sxy -6.5, b -1.3, interval [-2.045, -0.555].
  const neg = diagnose(P([1, 2, 3, 4], [4, 2, 1, 0]), [], 0.05);
  assert(near(neg.slope, -1.3, 1e-9) && /shrank by about 13\.0 min/.test(neg.clause), JSON.stringify(neg));
  // alpha reaches the slope interval: t(.9, 2) = 1.885618.
  const a20 = diagnose(P([1, 2, 3, 4], [0, 1, 2, 4]), [], 0.2);
  assert(near(a20.slopeLo, 1.3 - 1.885618 * Math.sqrt(0.03), 1e-5), JSON.stringify(a20));
  // Both fire: drift morning plus E (arrives while A is watched, tablet 60). Lean
  // 17/4 - 60 = -55.75. Drift takes the one clause.
  const both = await studyLogged(scripted([[drift[0][0], { id: 'E', arrive: 0.5, wait: 59, tablet: 60 }, ...drift[0].slice(1)]]), { seed: 1, maxMornings: 1 });
  const bd = both.log.find((e) => e.kind === 'diagnostic').data;
  assert(bd.lean === -55.75 && /grew/.test(both.report.reason) && !/waited about/.test(both.report.reason), both.report.reason);
});

// V1: links name only real checks, and every check verifies something.
await check('T-V1-SELF', async () => {
  const links = JSON.parse(readFileSync('links.json', 'utf8'));
  const ids = new Set(results.map((r) => r.check).concat('T-V1-SELF'));
  for (const l of links) if (l.kind === 'verifies') assert(ids.has(l.from), `link names unknown check ${l.from}`);
  for (const id of ids) assert(links.some((l) => l.kind === 'verifies' && l.from === id), `${id} verifies nothing`);
});

const at = new Date().toISOString().slice(0, 10);
const links = JSON.parse(readFileSync('links.json', 'utf8'));
const evidence = results.map((r) => stamp({ ...r, at }, links, (p) => readFileSync(p)));
writeFileSync('evidence.json', JSON.stringify(evidence, null, 2) + '\n');
const failed = results.filter((r) => r.result === 'fail').length;
console.log(`${results.length - failed}/${results.length} checks passed; evidence.json written (stamped)`);
process.exit(failed ? 1 : 0);
