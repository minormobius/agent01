// node test.mjs — runs every check, prints PASS/FAIL lines, writes evidence.json (one entry per
// check it ran, dated today UTC), exits 1 if any failed. Expected values are worked by hand,
// in the comments, never by calling vv to compute them.
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, lint, trace, status, coverage, tpm, earned } from './vv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const today = new Date().toISOString().slice(0, 10);
const evidence = [];
let failed = 0;
function check(id, fn) {
  try { fn(); evidence.push({ check: id, result: 'pass', at: today }); console.log(`PASS ${id}`); }
  catch (e) { failed++; evidence.push({ check: id, result: 'fail', at: today }); console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`); }
}
const R = (id, o = {}) => ({ id, text: 'It shall work.', parent: null, strength: 'shall', method: 'test', acceptance: 'ok', rationale: '', ...o });
const V = (from, to) => ({ from, to, kind: 'verifies' });
const E = (check, result, at) => ({ check, result, at });
const codes = (list) => load(list).problems.map((p) => `${p.id}:${p.code}`);

// ---------------- M1 ----------------
check('C-LOAD-CODES', () => {
  const list = [R('OK'), R('bad'), R('X-', { parent: 'NOPE' }), R('M1', { method: 'guess' }), R('M2', { acceptance: '' }),
    R('M3', { acceptance: '   ' }), R('M4', { strength: 'may', acceptance: '' })];
  assert.deepEqual(codes(list), ['M1:bad-method', 'M2:missing-acceptance', 'M3:missing-acceptance',
    'X-:bad-id', 'X-:unknown-parent', 'bad:bad-id']); // 'X-' < 'bad': code-unit order
  assert.equal(load(list).reqs, list);
  assert.deepEqual(load([]).problems, []);
});
check('C-LOAD-DUP', () => {
  assert.deepEqual(codes([R('A'), R('A'), R('A'), R('B')]), ['A:duplicate-id']);
});
check('C-LOAD-CYCLE', () => {
  // A→B→C→A is a cycle; T hangs off it (parent A) and is not on it; S is its own parent.
  // A, B, C are each someone's parent, so none is a leaf; T is a leaf.
  const list = [R('A', { parent: 'C' }), R('B', { parent: 'A' }), R('C', { parent: 'B' }), R('T', { parent: 'A' }), R('S', { parent: 'S' })];
  assert.deepEqual(codes(list), ['A:cycle', 'B:cycle', 'C:cycle', 'S:cycle']);
  // same graph, tail listed first: walking from T must still not mark T
  assert.deepEqual(codes([list[3], ...list.slice(0, 3)]), ['A:cycle', 'B:cycle', 'C:cycle']);
});
check('C-LOAD-LEAF', () => {
  // a parent with a bad method and no acceptance is fine; only leaves are held to those rules
  const list = [R('P', { method: 'vibes', acceptance: '' }), R('K', { parent: 'P', method: 'analysis' }),
    R('Q', { method: 'demonstration', strength: 'should', acceptance: null })];
  assert.deepEqual(codes(list), []);
  // D21: "no *other* requirement names it": a self-parent is a one-member cycle and still a leaf
  const self = [R('S', { parent: 'S', method: 'vibes', acceptance: ' ' })];
  assert.deepEqual(load(self).problems.map((p) => p.code), ['bad-method', 'cycle', 'missing-acceptance']);
});
check('C-LINT-WORDS', () => {
  const t = (text, strength = 'may') => lint({ text, strength });
  assert.deepEqual(t('Shutdown time is tbr.'), ['tbd']);
  assert.deepEqual(t('Value TBC, see note'), ['tbd']);
  assert.deepEqual(t('TBDs pending'), []); // not the word
  assert.deepEqual(t('Breakfast is steadfast'), []); // fast only as a whole word
  assert.deepEqual(t('It is User-Friendly'), ['vague']);
  assert.deepEqual(t('logs, alarms, etc.'), ['vague']);
  assert.deepEqual(t('Retry As  Needed'), ['vague']);
  assert.deepEqual(t('a state-of-the-art pump'), ['vague']);
  assert.deepEqual(t('easily done'), []); // "easy" is listed, "easily" is not
  assert.deepEqual(t('Red AND/OR blue, quickly, TBD'), ['and-or', 'tbd', 'vague']);
});
check('C-LINT-SHALL', () => {
  assert.deepEqual(lint({ text: 'The tank must hold 5 L.', strength: 'shall' }), ['no-shall']);
  assert.deepEqual(lint({ text: 'A shallow tank.', strength: 'shall' }), ['no-shall']);
  assert.deepEqual(lint({ text: 'The tank SHALL hold 5 L.', strength: 'shall' }), []);
  assert.deepEqual(lint({ text: 'The tank should hold 5 L.', strength: 'should' }), []);
  assert.deepEqual(lint({ text: 'Fast, fast, TBD and/or etc', strength: 'shall' }), ['and-or', 'no-shall', 'tbd', 'vague']);
});

// ---------------- M2 ----------------
check('C-TRACE', () => {
  const reqs = [R('P'), R('A', { parent: 'P' }), R('B', { parent: 'P' })];
  const links = [V('t2', 'A'), V('T1', 'A'), V('t2', 'A'), { from: 'src', to: 'A', kind: 'implements' }, V('x', 'GONE'),
    { from: 'y', to: 'GONE2', kind: 'implements' }];
  const tr = trace(reqs, links);
  assert.deepEqual(tr.verifiedBy, { P: [], A: ['T1', 't2'], B: [] });
  assert.deepEqual(tr.implementedBy, { P: [], A: ['src'], B: [] });
  assert.deepEqual(tr.dangling, [4, 5]);
  assert.deepEqual(tr.orphans, ['B']); // P is a parent, not an orphan
});
check('C-TRACE-SORT', () => {
  const reqs = ['A-9', 'A-10', 'B', 'AB'].map((id) => R(id));
  assert.deepEqual(trace(reqs, []).orphans, ['A-10', 'A-9', 'AB', 'B']); // plain string order
  const tr = trace(reqs, [V('b', 'B'), V('B1', 'B'), V('a', 'B'), { from: 'z', to: 'B', kind: 'implements' }, { from: 'Z', to: 'B', kind: 'implements' }]);
  assert.deepEqual(tr.verifiedBy.B, ['B1', 'a', 'b']); // a locale sort would give a, b, B1
  assert.deepEqual(tr.implementedBy.B, ['Z', 'z']);
});

// ---------------- M3 ----------------
const leafReqs = [R('A'), R('B'), R('C'), R('D'), R('N')];
const leafLinks = [V('a1', 'A'), V('a2', 'A'), V('b1', 'B'), V('b2', 'B'), V('c1', 'C'), V('c2', 'C'), V('d1', 'D')];
check('C-STATUS-LEAF', () => {
  const ev = [E('a1', 'pass', '2026-03-01'), E('a2', 'pass', '2026-03-02'), // A verified
    E('b1', 'pass', '2026-03-01'), E('b2', 'fail', '2026-03-03'), // B failed
    E('c1', 'pass', '2026-03-01'), // C partial (c2 has no result)
    E('d1', 'pass', '2026-03-09')]; // D: only after asOf → unverified; N: nothing verifies it
  assert.deepEqual(status(leafReqs, leafLinks, ev, { asOf: '2026-03-05' }),
    { A: 'verified', B: 'failed', C: 'partial', D: 'unverified', N: 'unverified' });
});
check('C-STATUS-LATEST', () => {
  const ev = [E('b1', 'pass', '2026-03-01'), E('b2', 'fail', '2026-03-02'), E('b2', 'pass', '2026-03-04'),
    E('a1', 'pass', '2026-03-01'), E('a2', 'pass', '2026-03-03'), E('a2', 'fail', '2026-03-03'), // tie: later in list wins
    E('c1', 'fail', '2026-03-05'), E('c1', 'pass', '2026-03-01'), E('c2', 'pass', '2026-03-01')]; // fail is later by date
  const s = status(leafReqs, leafLinks, ev, { asOf: '2026-03-05' });
  assert.deepEqual([s.A, s.B, s.C], ['failed', 'verified', 'failed']);
  const s3 = status(leafReqs, leafLinks, ev, { asOf: '2026-03-03' }); // b2's pass not yet in; c1's fail not yet in
  assert.deepEqual([s3.B, s3.C], ['failed', 'verified']);
});
check('C-STATUS-PARENT', () => {
  const reqs = [R('TOP'), R('P1', { parent: 'TOP' }), R('S1', { parent: 'P1' }), R('S2', { parent: 'P1' }),
    R('W1', { parent: 'P1', strength: 'should' }), // a failing "should" under shall siblings is ignored
    R('P2', { parent: 'TOP', strength: 'may' }), R('M1', { parent: 'P2', strength: 'may' }), R('M2', { parent: 'P2', strength: 'should' })];
  const links = [V('s1', 'S1'), V('s2', 'S2'), V('w1', 'W1'), V('m1', 'M1'), V('m2', 'M2')];
  const at = '2026-01-01';
  let s = status(reqs, links, [E('s1', 'pass', at), E('s2', 'pass', at), E('w1', 'fail', at), E('m1', 'pass', at)], { asOf: at });
  // P1 over S1,S2 → verified. P2 has no shall child → over all: M1 verified, M2 unverified → partial.
  // TOP: P1 is shall, P2 is may → only P1 counts → verified.
  assert.deepEqual([s.P1, s.P2, s.TOP, s.W1], ['verified', 'partial', 'verified', 'failed']);
  s = status(reqs, links, [], { asOf: at });
  assert.deepEqual([s.P1, s.P2, s.TOP], ['unverified', 'unverified', 'unverified']);
  s = status(reqs, links, [E('s1', 'fail', at)], { asOf: at });
  assert.deepEqual([s.P1, s.TOP], ['failed', 'failed']);
});
check('C-COVERAGE', () => {
  const st = { A: 'verified', B: 'failed', C: 'partial', D: 'unverified', N: 'verified' };
  assert.deepEqual(coverage(leafReqs, st), { verified: 2, failed: 1, partial: 1, unverified: 1, total: 5, ratio: 0.4 });
  assert.deepEqual(coverage([], {}), { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 });
  const tree = [R('P'), R('K', { parent: 'P' })];
  assert.equal(coverage(tree, { P: 'verified', K: 'failed' }).total, 1); // leaves only
});

// ---------------- M4 ----------------
const H = (...pairs) => pairs.map(([at, value]) => ({ at, value }));
check('C-TPM-STATUS', () => {
  const mass = { id: 'MASS', req: 'A', direction: 'max', threshold: 200, objective: 150, history: H(['2026-01-01', 190]) };
  let r = tpm(mass, { asOf: '2026-01-01' }); // margin 10 < band 20 → at-risk; 190 > 150 → objective not met
  assert.deepEqual([r.current, r.margin, r.status, r.objectiveMet, r.trend, r.projectedBreach], [190, 10, 'at-risk', false, null, null]);
  r = tpm({ ...mass, history: H(['2026-01-01', 150]) }, { asOf: '2026-01-02' });
  assert.deepEqual([r.margin, r.status, r.objectiveMet], [50, 'met', true]);
  r = tpm({ ...mass, history: H(['2026-01-01', 180]) }); // margin 20 = band → met (band is strict)
  assert.equal(r.status, 'met');
  r = tpm({ ...mass, history: H(['2026-01-01', 200.5]) });
  assert.equal(r.status, 'breached');
  const thr = { id: 'T', direction: 'min', threshold: -50, riskBand: 3, history: H(['2026-01-01', -48]) };
  r = tpm(thr); // margin −48 − (−50) = 2 < 3 → at-risk; no objective → null
  assert.deepEqual([r.margin, r.status, r.objectiveMet], [2, 'at-risk', null]);
  assert.deepEqual(tpm({ ...mass, history: H(['2026-02-01', 1]) }, { asOf: '2026-01-31' }),
    { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null });
});
check('C-TPM-TREND', () => {
  // points (0,10) (2,14) (4,15) (6,21): mean x 3, mean y 15; sxy = −3·−5 + −1·−1 + 1·0 + 3·6 = 34; sxx = 20 → slope 1.7
  // intercept 15 − 5.1 = 9.9; line > 30 when x > 11.82 → x = 12 → 2026-01-13.
  const m = { id: 'L', direction: 'max', threshold: 30, history: H(['2026-01-05', 15], ['2026-01-01', 10], ['2026-01-07', 21], ['2026-01-03', 14]) };
  let r = tpm(m, { asOf: '2026-01-07' });
  assert.ok(Math.abs(r.trend - 1.7) < 1e-12);
  assert.equal(r.current, 21); // latest by date, not by list position
  assert.equal(r.projectedBreach, '2026-01-13');
  r = tpm(m, { asOf: '2026-01-20' }); // already past on the line at asOf → asOf itself
  assert.equal(r.projectedBreach, '2026-01-20');
  r = tpm({ ...m, direction: 'min', threshold: 0 }, { asOf: '2026-01-07' }); // rising for min: away → null
  assert.equal(r.projectedBreach, null);
  // falling for min: (0,100) (10,90) → slope −1; under 50 when x > 50 → day 51 from 2026-01-01 = 2026-02-21
  r = tpm({ id: 'F', direction: 'min', threshold: 50, history: H(['2026-01-01', 100], ['2026-01-11', 90]) }, { asOf: '2026-01-11' });
  assert.deepEqual([r.trend, r.projectedBreach], [-1, '2026-02-21']);
  // exactly on the threshold isn't past it: (0,0) (1,1), threshold 5 → over at x = 6 → 01-07
  r = tpm({ id: 'E', direction: 'max', threshold: 5, history: H(['2026-01-01', 0], ['2026-01-02', 1]) }, { asOf: '2026-01-02' });
  assert.equal(r.projectedBreach, '2026-01-07');
  r = tpm({ id: 'B', direction: 'max', threshold: 5, history: H(['2026-01-01', 0], ['2026-01-02', 9]) }, { asOf: '2026-01-02' });
  assert.deepEqual([r.status, r.projectedBreach], ['breached', null]);
});

check('C-TPM-FLOAT', () => {
  // Found by shelf/vv-oracle.mjs (exact rationals). asOf 2027-03-05 keeps five points; by day number
  // (2027-02-21 = x 1): (1,−11) (1,9.5) (4,11) (7,−14) (13,4). n 5, Σx 26, Σy −0.5, Σxx 236, Σxy −3.5 →
  // slope (5·−3.5 − 26·−0.5)/(5·236 − 26²) = −4.5/504 = −1/112; intercept (−0.5 + 26/112)/5 = −3/56.
  // Line = −13.5 when x/112 = 13.5 − 3/56 = 753/56 → x = 1506 exactly = 2027-02-21 + 1505 = 2031-04-06.
  // Exactly on isn't past, so the breach is x 1507 = 2031-04-07. Float arithmetic said 04-06 (D16).
  const H2 = (...ps) => ps.map(([at, value]) => ({ at, value }));
  const m = { id: 'O', direction: 'min', threshold: -13.5, objective: 14.5, history: H2(['2027-02-21', -11], ['2027-02-21', 9.5], ['2027-02-27', -14], ['2027-03-18', -5], ['2027-02-24', 11], ['2027-03-19', 16.5], ['2027-03-05', 4]) };
  const r = tpm(m, { asOf: '2027-03-05' });
  assert.equal(r.projectedBreach, '2031-04-07');
  // a float-noise slope toward the threshold: the crossing is far past 9999-12-31 → null, and no throw or hang (D17)
  const n = tpm({ id: 'N', direction: 'max', threshold: 10, history: H2(['2026-01-01', 0], ['2026-01-02', 1e-12]) }, { asOf: '2026-01-02' });
  assert.deepEqual([n.status, n.projectedBreach], ['met', null]);
  // a real slope of 1e-6/day: crosses 10 at x = 1e7, about year 29400, unwritable as YYYY-MM-DD → null (D17)
  const far = tpm({ id: 'F', direction: 'max', threshold: 10, history: H2(['2026-01-01', 0], ['2026-01-02', 1e-6]) }, { asOf: '2026-01-02' });
  assert.equal(far.projectedBreach, null);
});

// ---------------- M5 ----------------
// Plan: W1 100h days 1–10 (Jan 1–10), W2 50h days 6–10 (Jan 6–10), W3 30h days 11–13 (Jan 11–13).
const evReqs = [R('A'), R('B'), R('C'), R('D')];
const evLinks = [V('a', 'A'), V('b', 'B'), V('c', 'C'), V('d', 'D')];
const plan = { workPackages: [
  { id: 'W1', budget: 100, start: '2026-01-01', finish: '2026-01-10', reqs: ['A', 'B'] },
  { id: 'W2', budget: 50, start: '2026-01-06', finish: '2026-01-10', reqs: ['C'] },
  { id: 'W3', budget: 30, start: '2026-01-11', finish: '2026-01-13', reqs: ['D'] }] };
const actuals = [{ wp: 'W1', hours: 30, at: '2026-01-02' }, { wp: 'W2', hours: 10, at: '2026-01-07' },
  { wp: 'W1', hours: 99, at: '2026-01-09' }, { wp: 'ZZ', hours: 5, at: '2026-01-07' }];
check('C-EVM-PV', () => {
  // asOf Jan 7 = day 7: W1 100·7/10 = 70; W2 50·2/5 = 20; W3 0 → PV 90
  const r = earned(evReqs, evLinks, [], plan, actuals, { asOf: '2026-01-07' });
  assert.deepEqual([r.BAC, r.PV, r.AT], [180, 90, 7]);
  assert.deepEqual(r.byWP.W2, { PV: 20, EV: 0, AC: 10 });
  assert.equal(r.AC, 45); // 30 + 10 + 5 (unknown WP still costs); the 99 on Jan 9 not yet
  assert.equal(earned(evReqs, evLinks, [], plan, [], { asOf: '2026-02-01' }).PV, 180); // clamped at 1
  assert.equal(earned(evReqs, evLinks, [], plan, [], { asOf: '2025-12-01' }).PV, 0); // clamped at 0
});
check('C-EVM-EV', () => {
  const ev = [E('a', 'pass', '2026-01-03'), E('b', 'fail', '2026-01-03'), E('c', 'pass', '2026-01-03'), E('d', 'pass', '2026-01-08')];
  // day 7: A verified (50 of W1), B failed, C verified (50), D's pass is after asOf → EV 100
  let r = earned(evReqs, evLinks, ev, plan, actuals, { asOf: '2026-01-07' });
  assert.deepEqual([r.EV, r.SV, r.CV, r.SPI], [100, 10, 55, 100 / 90]);
  assert.ok(Math.abs(r.CPI - 100 / 45) < 1e-12);
  assert.deepEqual(r.byWP.W1, { PV: 70, EV: 50, AC: 30 });
  // a later fail takes earned value away again
  r = earned(evReqs, evLinks, [...ev, E('c', 'fail', '2026-01-07')], plan, actuals, { asOf: '2026-01-07' });
  assert.equal(r.EV, 50);
  r = earned(evReqs, evLinks, [], plan, [], { asOf: '2026-01-07' });
  assert.deepEqual([r.EV, r.AC, r.CPI, r.CV], [0, 0, null, 0]);
});
check('C-EVM-ES', () => {
  // PVd: day n ≤ 5: 10n; days 6–10: 10n + 10(n−5); day 11: 150+10 = 160, 12: 170, 13: 180.
  // EV 100 → PVd(7) = 90 ≤ 100 < PVd(8) = 110 → ES = 7 + 10/20 = 7.5; AT 7 → SPIt 7.5/7
  const ev = [E('a', 'pass', '2026-01-03'), E('c', 'pass', '2026-01-03')];
  let r = earned(evReqs, evLinks, ev, plan, [], { asOf: '2026-01-07' });
  assert.equal(r.ES, 7.5);
  assert.equal(r.SPIt, 7.5 / 7);
  // everything verified: EV 180 = PVd(13), no day 14 → ES = 13
  const all = ['a', 'b', 'c', 'd'].map((c) => E(c, 'pass', '2026-01-02'));
  r = earned(evReqs, evLinks, all, plan, [], { asOf: '2026-01-04' });
  assert.deepEqual([r.EV, r.ES, r.AT, r.SPIt], [180, 13, 4, 13 / 4]);
  // nothing verified: C = 0, ES = 0 + 0/10 = 0
  assert.equal(earned(evReqs, evLinks, [], plan, [], { asOf: '2026-01-04' }).ES, 0);
  // between days: B + D = 80; PVd(6) = 60 + 10 = 70, PVd(7) = 90 → ES 6.5
  r = earned(evReqs, evLinks, [E('b', 'pass', '2026-01-01'), E('d', 'pass', '2026-01-01')], plan, [], { asOf: '2026-01-06' });
  assert.deepEqual([r.EV, r.ES], [80, 6.5]);
  // EV exactly a day's PV: A + C + D = 130 = PVd(9) = 90 + 40 → ES 9; on day 9 SPI = SPIt = 1
  r = earned(evReqs, evLinks, ['a', 'c', 'd'].map((c) => E(c, 'pass', '2026-01-01')), plan, [], { asOf: '2026-01-09' });
  assert.deepEqual([r.EV, r.PV, r.ES, r.SPI, r.SPIt], [130, 130, 9, 1, 1]);
  // a plateau: W1 10h Jan 1–2, W2 10h Jan 5–6. PVd 5, 10, 10, 10, 15, 20. EV 10 → C = 4 (largest), ES = 4
  const gap = { workPackages: [{ id: 'W1', budget: 10, start: '2026-01-01', finish: '2026-01-02', reqs: ['A'] },
    { id: 'W2', budget: 10, start: '2026-01-05', finish: '2026-01-06', reqs: ['B'] }] };
  r = earned(evReqs, evLinks, [E('a', 'pass', '2026-01-01')], gap, [], { asOf: '2026-01-08' });
  assert.deepEqual([r.EV, r.ES, r.AT, r.SPIt], [10, 4, 8, 0.5]);
});

// ---------------- M6 ----------------
function cli(files, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'vv-'));
  for (const [k, v] of Object.entries(files)) writeFileSync(join(dir, k), typeof v === 'string' ? v : JSON.stringify(v));
  const r = spawnSync(process.execPath, [join(HERE, 'cli.mjs'), dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('cli exit ' + r.status + ': ' + r.stderr);
  return JSON.parse(r.stdout);
}
check('C-CLI', () => {
  const reqs = [R('A', { text: 'It shall be fast.' }), R('B')];
  const m = [{ id: 'MASS', req: 'A', direction: 'max', threshold: 10, history: H(['2026-01-09', 5]) }];
  const out = cli({ 'requirements.json': reqs, 'links.json': [V('a', 'A')], 'evidence.json': [E('a', 'pass', '2026-01-04')],
    'measures.json': m, 'actuals.json': [{ wp: 'W', hours: 1, at: '2026-01-06' }] });
  assert.deepEqual(Object.keys(out), ['asOf', 'problems', 'lint', 'coverage', 'orphans', 'status', 'tpms', 'evm']);
  assert.equal(out.asOf, '2026-01-09'); // latest across evidence, actuals and histories
  assert.deepEqual(out.lint, { A: ['vague'] });
  assert.deepEqual(out.orphans, ['B']);
  assert.deepEqual(out.status, { A: 'verified', B: 'unverified' });
  assert.equal(out.coverage.ratio, 0.5);
  assert.equal(out.tpms.MASS.status, 'met');
  assert.equal(out.evm, null); // no plan
  const early = cli({ 'requirements.json': reqs, 'links.json': [V('a', 'A')], 'evidence.json': [E('a', 'pass', '2026-01-04')] }, '--as-of', '2026-01-03');
  assert.deepEqual([early.asOf, early.status.A], ['2026-01-03', 'unverified']);
});
check('C-CLI-EMPTY', () => {
  const out = cli({});
  assert.equal(out.asOf, new Date().toISOString().slice(0, 10));
  assert.deepEqual([out.problems, out.lint, out.orphans, out.status, out.tpms, out.evm], [[], {}, [], {}, {}, null]);
  assert.equal(out.coverage.total, 0);
  const onlyActuals = cli({ 'actuals.json': [{ wp: 'W', hours: 2, at: '2026-05-05' }, { wp: 'W', hours: 1, at: '2026-04-04' }] });
  assert.equal(onlyActuals.asOf, '2026-05-05');
  const withPlan = cli({ 'plan.json': plan, 'actuals.json': actuals }, '--as-of', '2026-01-07');
  assert.deepEqual([withPlan.evm.PV, withPlan.evm.EV, withPlan.evm.AC], [90, 0, 45]);
});

function cliRaw(files, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'vv-'));
  for (const [k, v] of Object.entries(files)) writeFileSync(join(dir, k), typeof v === 'string' ? v : JSON.stringify(v));
  return spawnSync(process.execPath, [join(HERE, 'cli.mjs'), ...args.map((a) => (a === '@' ? dir : a))], { encoding: 'utf8' });
}
check('C-CLI-CYCLE', () => {
  // D18: outside the spec's promise, but a real project's CLI is where it finds out about a cycle.
  // A↔B is a cycle; K hangs off A (a leaf, verified); C stands alone (verified).
  // A and B → unverified (no defined status); K and C are leaves with passing checks → verified.
  const reqs = [R('A', { parent: 'B' }), R('B', { parent: 'A' }), R('K', { parent: 'A' }), R('C')];
  const out = cli({ 'requirements.json': reqs, 'links.json': [V('k', 'K'), V('c', 'C')],
    'evidence.json': [E('k', 'pass', '2026-02-02'), E('c', 'pass', '2026-02-02')] });
  assert.deepEqual(out.problems.map((p) => `${p.id}:${p.code}`), ['A:cycle', 'B:cycle']);
  assert.deepEqual(out.status, { A: 'unverified', B: 'unverified', K: 'verified', C: 'verified' });
  assert.deepEqual([out.coverage.verified, out.coverage.total], [2, 2]); // K and C are the only leaves
});
check('C-CLI-GATE', () => {
  // D19/D20. Clean folder: one leaf, verified → --check exits 0 even with --min-coverage 1.
  const clean = { 'requirements.json': [R('A')], 'links.json': [V('a', 'A')], 'evidence.json': [E('a', 'pass', '2026-03-01')] };
  let r = cliRaw(clean, '--check', '--min-coverage', '1', '@');
  assert.equal(r.status, 0, r.stderr);
  // --as-of=D form, before the pass: A unverified, ratio 0 → passes the bare gate, fails min 0.5
  r = cliRaw(clean, '@', '--as-of=2026-02-28', '--check');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status.A, 'unverified');
  r = cliRaw(clean, '@', '--as-of=2026-02-28', '--check', '--min-coverage=0.5');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /coverage 0 < 0\.5/);
  // without --check the same data exits 0: the gate is opt-in and the JSON doesn't change
  r = cliRaw(clean, '@', '--as-of=2026-02-28', '--min-coverage=0.5');
  assert.equal(r.status, 0);
  // a failed leaf, a load problem, a breached TPM: each alone trips the gate
  for (const extra of [
    { 'evidence.json': [E('a', 'fail', '2026-03-01')] },
    { 'requirements.json': [R('A'), R('bad')], 'links.json': [V('a', 'A'), V('a', 'bad')] },
    { 'measures.json': [{ id: 'M', req: 'A', direction: 'max', threshold: 1, history: [{ at: '2026-03-01', value: 2 }] }] },
  ]) {
    r = cliRaw({ ...clean, ...extra }, '@', '--check');
    assert.equal(r.status, 3, JSON.stringify(Object.keys(extra)) + ' should trip the gate');
  }
  assert.equal(cliRaw(clean, '@', '--as-of').status, 2); // flag without a value
});

// ---------------- M7 ----------------
// The oracle lives on the shelf. If vv is copied somewhere without it, C-ORACLE records *nothing*:
// no pass, no fail. VV-M7-ORACLE then shows unverified, which is the truth (D22).
const ORACLE = join(HERE, 'shelf', 'vv-oracle.mjs');
const skipped = new Set();
if (!existsSync(ORACLE)) { skipped.add('C-ORACLE'); console.log('SKIP C-ORACLE: shelf/vv-oracle.mjs not here, no evidence recorded'); }
else check('C-ORACLE', () => {
  // a second build of M1–M6 written from SPEC.md alone (exact rationals, no regex, own date math),
  // diffed against vv on random inputs. Fixed seed, so a failure reproduces.
  const r = spawnSync(process.execPath, [ORACLE, join(HERE, 'vv.mjs'), '400', '7'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
check('C-SELF', () => {
  const reqs = JSON.parse(readFileSync(join(HERE, 'requirements.json'), 'utf8'));
  const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'));
  assert.deepEqual(load(reqs).problems, []);
  const tr = trace(reqs, links);
  assert.deepEqual(tr.dangling, []);
  assert.deepEqual(tr.orphans, []);
  const leafCount = reqs.filter((r) => !reqs.some((o) => o.parent === r.id)).length;
  assert.ok(leafCount >= 12, `only ${leafCount} leaves`);
  // every check named in links.json is one this file runs: no link to a check that never reports
  const ran = new Set(evidence.map((e) => e.check)); ran.add('C-SELF'); ran.add('C-EVIDENCE'); for (const c of skipped) ran.add(c);
  for (const l of links) if (l.kind === 'verifies') assert.ok(ran.has(l.from), `links.json names unknown check ${l.from}`);
});
check('C-EVIDENCE', () => {
  writeFileSync(join(HERE, 'evidence.json'), JSON.stringify(evidence, null, 1) + '\n');
  const back = JSON.parse(readFileSync(join(HERE, 'evidence.json'), 'utf8'));
  assert.ok(back.length >= 1 && back.every((e) => e.at === today && (e.result === 'pass' || e.result === 'fail')));
});
// the evidence file must also carry C-EVIDENCE's own result
writeFileSync(join(HERE, 'evidence.json'), JSON.stringify(evidence, null, 1) + '\n');
console.log(`${evidence.length - failed}/${evidence.length} pass; evidence.json written`);
process.exit(failed ? 1 : 0);
