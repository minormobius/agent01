// node test.mjs — runs every check, writes evidence.json (one pass/fail per check, dated today, UTC),
// refreshes today's point in measures.json, and exits 0 only if every check passed.
// Check ids are what links.json traces to requirements.json.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, lint, trace, status, coverage, tpm, earned, report, dayNumber, dateOf } from './vv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TODAY = new Date().toISOString().slice(0, 10);
const results = [];
function check(id, fn) {
  try { fn(); results.push({ check: id, result: 'pass', at: TODAY }); }
  catch (e) { results.push({ check: id, result: 'fail', at: TODAY }); console.log(`FAIL ${id}\n  ${(e.message || e).split('\n').join('\n  ')}`); }
}
const R = (id, o = {}) => ({ id, text: `${id} shall work`, parent: null, strength: 'shall', method: 'test', acceptance: 'ok', rationale: '', ...o });
const P = (load) => load.problems.map((p) => `${p.id}:${p.code}`);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const t0 = Date.now();

// ---------------- M1 ----------------
check('T-M1-BADID', () => {
  const l = load([R('A'), R('a'), R('A-'), R('A--B'), R('A-B-9'), R('9A'), { ...R('X'), id: 7 }, R('AB_C')]);
  assert.deepEqual(P(l), ['7:bad-id', '9A:bad-id', 'A-:bad-id', 'A--B:bad-id', 'AB_C:bad-id', 'a:bad-id']);
  assert.equal(l.reqs.length, 8);
});
check('T-M1-DUP', () => {
  const list = [R('B'), R('A'), R('B'), R('B'), R('A')];
  const l = load(list);
  assert.equal(l.reqs, list);
  assert.deepEqual(P(l), ['A:duplicate-id', 'B:duplicate-id']);
});
check('T-M1-PARENT', () => {
  assert.deepEqual(P(load([R('A'), R('B', { parent: 'Z' }), R('C', { parent: 'A' }), R('D', { parent: undefined })])), ['B:unknown-parent']);
});
check('T-M1-CYCLE', () => {
  // A->B->C->A is a cycle; D hangs off it (not a member); E is its own parent; F->G->F
  const l = load([R('A', { parent: 'C' }), R('B', { parent: 'A' }), R('C', { parent: 'B' }), R('D', { parent: 'A' }),
    R('E', { parent: 'E' }), R('F', { parent: 'G' }), R('G', { parent: 'F' }), R('H')]);
  assert.deepEqual(P(l), ['A:cycle', 'B:cycle', 'C:cycle', 'E:cycle', 'F:cycle', 'G:cycle']);
  // the tail is walked first: T -> U -> V -> U; T is not a member
  assert.deepEqual(P(load([R('T', { parent: 'U' }), R('U', { parent: 'V' }), R('V', { parent: 'U' })])), ['U:cycle', 'V:cycle']);
  // DECISION: a self-parent is still a leaf ("no *other* requirement names it"), so leaf checks apply
  assert.deepEqual(P(load([R('E', { parent: 'E', method: 'x' })])), ['E:bad-method', 'E:cycle']);
});
check('T-M1-LEAF', () => {
  const l = load([
    R('P', { method: 'nonsense', acceptance: '' }),        // parent: neither applies
    R('P-1', { parent: 'P', method: 'Test' }),              // bad-method (case matters)
    R('P-2', { parent: 'P', acceptance: '   ' }),           // missing-acceptance (blank)
    R('P-3', { parent: 'P', strength: 'should', acceptance: undefined }), // fine: only shall needs it
    R('P-4', { parent: 'P', method: undefined, acceptance: null }),
  ]);
  assert.deepEqual(P(l), ['P-1:bad-method', 'P-2:missing-acceptance', 'P-4:bad-method', 'P-4:missing-acceptance']);
});
check('T-M1-SORT', () => {
  const l = load([R('b'), R('B', { parent: 'Q' }), R('Ab', { method: 'x' }), R('AB', { parent: 'Q' })]);
  assert.deepEqual(P(l), ['AB:unknown-parent', 'Ab:bad-id', 'Ab:bad-method', 'B:unknown-parent', 'b:bad-id']);
  assert.deepEqual(load([]).problems, []);
});
check('T-M1-LINT', () => {
  const L = (text, strength = 'shall') => lint({ text, strength });
  assert.deepEqual(L('The pump shall start.'), []);
  assert.deepEqual(L('The pump will start.'), ['no-shall']);
  assert.deepEqual(L('The pump will start.', 'should'), []);
  assert.deepEqual(L('The pump SHALL start.'), []);
  assert.deepEqual(L('The shallow pump starts.'), ['no-shall']);
  assert.deepEqual(L('It shall start in TBD seconds.'), ['tbd']);
  assert.deepEqual(L('Limit (tbc) shall hold'), ['tbd']);
  assert.deepEqual(L('It shall be Tbr.'), ['tbd']);
  assert.deepEqual(L('TBDX shall hold; XTBR too'), []);
  assert.deepEqual(L('It shall be fast and/or cheap'), ['and-or', 'vague']);
  assert.deepEqual(L('It shall be faster, robustness, easyish'), []);
  assert.deepEqual(L('It shall be User-Friendly'), ['vague']);
  assert.deepEqual(L('It shall restart as needed'), ['vague']);
  assert.deepEqual(L('It shall restart as\n needed'), ['vague']);
  assert.deepEqual(L('It shall log errors, warnings, etc.'), ['vague']);
  assert.deepEqual(L('State-of-the-art; TBD', 'may'), ['tbd', 'vague']);
  assert.deepEqual(L('It shall be QUICKLY done'), ['vague']);
  assert.deepEqual(L('Fast. TBR. and/or', 'shall'), ['and-or', 'no-shall', 'tbd', 'vague']);
  assert.deepEqual(lint({ strength: 'shall' }), ['no-shall']);
});

// ---------------- M2 ----------------
const tree = [R('S', { method: undefined }), R('S-1', { parent: 'S' }), R('S-2', { parent: 'S' }), R('S-3', { parent: 'S', strength: 'should' })];
check('T-M2-TRACE', () => {
  const links = [
    { from: 'T2', to: 'S-1', kind: 'verifies' }, { from: 'T1', to: 'S-1', kind: 'verifies' },
    { from: 'T1', to: 'S-1', kind: 'verifies' }, { from: 'src/a', to: 'S-2', kind: 'implements' },
    { from: 'T9', to: 'NOPE', kind: 'verifies' }, { from: 'T3', to: 'S', kind: 'verifies' },
    { from: 'x', to: 'nope', kind: 'implements' },
  ];
  const t = trace(tree, links);
  assert.deepEqual(t.verifiedBy, { S: ['T3'], 'S-1': ['T1', 'T2'], 'S-2': [], 'S-3': [] });
  assert.deepEqual(t.implementedBy, { S: [], 'S-1': [], 'S-2': ['src/a'], 'S-3': [] });
  assert.deepEqual(t.orphans, ['S-2', 'S-3']); // S is verified-by but not a leaf; never an orphan
  assert.deepEqual(t.dangling, [4, 6]);
});

// ---------------- M3 ----------------
const L3 = [{ from: 'A', to: 'S-1', kind: 'verifies' }, { from: 'B', to: 'S-1', kind: 'verifies' }, { from: 'C', to: 'S-2', kind: 'verifies' }, { from: 'D', to: 'S-3', kind: 'verifies' }];
check('T-M3-LEAF', () => {
  const st = (ev, asOf) => status(tree, L3, ev, { asOf });
  assert.equal(st([])['S-1'], 'unverified');
  assert.equal(st([{ check: 'A', result: 'pass', at: '2026-01-01' }])['S-1'], 'partial');
  assert.equal(st([{ check: 'A', result: 'pass', at: '2026-01-01' }, { check: 'B', result: 'pass', at: '2026-01-02' }])['S-1'], 'verified');
  assert.equal(st([{ check: 'A', result: 'fail', at: '2026-01-01' }])['S-1'], 'failed');
  // latest wins, by date, not by list order
  assert.equal(st([{ check: 'A', result: 'pass', at: '2026-01-05' }, { check: 'A', result: 'fail', at: '2026-01-02' }, { check: 'B', result: 'pass', at: '2026-01-01' }])['S-1'], 'verified');
  // a tie on date: the later entry wins
  assert.equal(st([{ check: 'B', result: 'pass', at: '2026-01-01' }, { check: 'A', result: 'pass', at: '2026-01-03' }, { check: 'A', result: 'fail', at: '2026-01-03' }])['S-1'], 'failed');
  assert.equal(st([{ check: 'B', result: 'pass', at: '2026-01-01' }, { check: 'A', result: 'fail', at: '2026-01-03' }, { check: 'A', result: 'pass', at: '2026-01-03' }])['S-1'], 'verified');
  // evidence for a check that verifies nothing changes nothing
  assert.equal(st([{ check: 'Z', result: 'pass', at: '2026-01-01' }])['S-2'], 'unverified');
});
check('T-M3-ASOF', () => {
  const ev = [{ check: 'A', result: 'pass', at: '2026-01-01' }, { check: 'B', result: 'pass', at: '2026-01-01' }, { check: 'A', result: 'fail', at: '2026-01-10' }];
  assert.equal(status(tree, L3, ev, { asOf: '2026-01-09' })['S-1'], 'verified');
  assert.equal(status(tree, L3, ev, { asOf: '2026-01-10' })['S-1'], 'failed');
  assert.equal(status(tree, L3, ev, { asOf: '2025-12-31' })['S-1'], 'unverified');
});
check('T-M3-PARENT', () => {
  const E = (c, r) => ({ check: c, result: r, at: '2026-02-01' });
  const st = (ev) => status(tree, L3, ev, { asOf: '2026-03-01' }).S;
  // S's shall children are S-1 and S-2; S-3 (should) doesn't count
  assert.equal(st([]), 'unverified');
  assert.equal(st([E('D', 'pass')]), 'unverified');
  assert.equal(st([E('D', 'fail')]), 'unverified');
  assert.equal(st([E('A', 'pass'), E('B', 'pass')]), 'partial');
  assert.equal(st([E('A', 'pass'), E('B', 'pass'), E('C', 'pass'), E('D', 'fail')]), 'verified');
  assert.equal(st([E('A', 'pass'), E('C', 'fail')]), 'failed');
  // no shall children: all children count; grandparents recurse
  const t2 = [R('G'), R('G-1', { parent: 'G', strength: 'may' }), R('G-1-A', { parent: 'G-1', strength: 'should' }), R('G-1-B', { parent: 'G-1', strength: 'may' })];
  const l2 = [{ from: 'a', to: 'G-1-A', kind: 'verifies' }, { from: 'b', to: 'G-1-B', kind: 'verifies' }];
  assert.deepEqual(status(t2, l2, [E('a', 'pass')], {}), { G: 'partial', 'G-1': 'partial', 'G-1-A': 'verified', 'G-1-B': 'unverified' });
  assert.deepEqual(status(t2, l2, [E('a', 'pass'), E('b', 'pass')], {}), { G: 'verified', 'G-1': 'verified', 'G-1-A': 'verified', 'G-1-B': 'verified' });
});
check('T-M3-COVERAGE', () => {
  const ev = [{ check: 'A', result: 'pass', at: '2026-01-01' }, { check: 'C', result: 'fail', at: '2026-01-01' }];
  const s = status(tree, L3, ev, {});
  assert.deepEqual(coverage(tree, s), { verified: 0, failed: 1, partial: 1, unverified: 1, total: 3, ratio: 0 });
  const s2 = status(tree, L3, [...ev, { check: 'B', result: 'pass', at: '2026-01-02' }], {});
  assert.deepEqual(coverage(tree, s2), { verified: 1, failed: 1, partial: 0, unverified: 1, total: 3, ratio: 1 / 3 });
  assert.deepEqual(coverage([], {}), { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 });
});

// ---------------- M4 ----------------
check('T-M4-STATUS', () => {
  const m = { id: 'm', direction: 'max', threshold: 100, history: [{ at: '2026-01-01', value: 50 }, { at: '2026-01-03', value: 70 }, { at: '2026-01-05', value: 90 }] };
  const a = tpm(m, { asOf: '2026-01-05' });
  assert.equal(a.current, 90); assert.equal(a.margin, 10); assert.equal(a.status, 'met'); // 10 is not < 10
  assert.equal(a.objectiveMet, null);
  assert.equal(tpm({ ...m, objective: 80 }, { asOf: '2026-01-05' }).objectiveMet, false);
  assert.equal(tpm({ ...m, objective: 90 }, { asOf: '2026-01-05' }).objectiveMet, true);
  assert.equal(tpm({ ...m, riskBand: 11 }, { asOf: '2026-01-05' }).status, 'at-risk');
  assert.equal(tpm({ ...m, threshold: 89 }, { asOf: '2026-01-05' }).status, 'breached');
  assert.equal(tpm({ ...m, threshold: 90 }, { asOf: '2026-01-05' }).status, 'at-risk');
  const b = tpm(m, { asOf: '2026-01-04' });
  assert.equal(b.current, 70); assert.equal(b.margin, 30);
  const mn = { id: 'n', direction: 'min', threshold: -20, history: [{ at: '2026-01-01', value: -19 }] };
  assert.equal(tpm(mn, {}).margin, 1); assert.equal(tpm(mn, {}).status, 'at-risk'); // band 2 = 10% of |-20|
  assert.deepEqual(tpm(m, { asOf: '2025-12-31' }), { current: null, margin: null, status: 'unknown', objectiveMet: null, trend: null, projectedBreach: null });
  // decimal tie on the band (vv turn 3, spec-check seed 3): min, T=17, current 18.7 → margin 1.7 = band 1.7 → met.
  // Raw floats say 1.6999999999999993 < 1.7000000000000002 → at-risk.
  const d = tpm({ id: 'd', direction: 'min', threshold: 17, history: [{ at: '2026-03-05', value: 18.7 }] }, {});
  assert.equal(d.margin, 1.7); assert.equal(d.status, 'met');
  const e = tpm({ id: 'e', direction: 'max', threshold: 0.3, history: [{ at: '2026-03-05', value: 0.27 }] }, {});
  assert.equal(e.margin, 0.03); assert.equal(e.status, 'met'); // 0.3−0.27 = 0.030000000000000027 raw; band 0.03
  assert.equal(tpm({ ...e, threshold: 0.27, history: [{ at: '2026-03-05', value: 0.27 }] }, {}).status, 'at-risk'); // margin 0, band 0.027
});
check('T-M4-TREND', () => {
  const m = { id: 'm', direction: 'max', threshold: 100, history: [{ at: '2026-01-05', value: 90 }, { at: '2026-01-01', value: 50 }, { at: '2026-01-03', value: 70 }] };
  const a = tpm(m, { asOf: '2026-01-05' });
  near(a.trend, 10); assert.equal(a.current, 90); // history order doesn't matter
  assert.equal(tpm({ ...m, history: m.history.slice(0, 1) }, {}).trend, null);
  // min, uneven spacing: slope -45/14 per day
  const n = { id: 'n', direction: 'min', threshold: 20, history: [{ at: '2026-01-01', value: 40 }, { at: '2026-01-02', value: 35 }, { at: '2026-01-04', value: 30 }] };
  near(tpm(n, { asOf: '2026-01-04' }).trend, -45 / 14);
});
check('T-M4-BREACH', () => {
  const m = { id: 'm', direction: 'max', threshold: 100, history: [{ at: '2026-01-01', value: 50 }, { at: '2026-01-03', value: 70 }, { at: '2026-01-05', value: 90 }] };
  assert.equal(tpm(m, { asOf: '2026-01-05' }).projectedBreach, '2026-01-07'); // line hits 100 on 01-06, over it on 01-07
  assert.equal(tpm(m, { asOf: '2026-01-20' }).projectedBreach, '2026-01-20'); // never before asOf
  // fitted line lands exactly on 20 at day 6 (01-07): "under" starts 01-08
  const n = { id: 'n', direction: 'min', threshold: 20, history: [{ at: '2026-01-01', value: 40 }, { at: '2026-01-02', value: 35 }, { at: '2026-01-04', value: 30 }] };
  assert.equal(tpm(n, { asOf: '2026-01-04' }).projectedBreach, '2026-01-08');
  // same, but floats miss it: unsorted, two points on one day; line 12.5 − 0.75x is exactly 8 at x=6
  // (03-11) and computes as 7.999…; "under" starts 03-12. Found by shelf/vv-spec-check.mjs (Morphyx).
  const f = { id: 'f', direction: 'min', threshold: 8, history: [{ at: '2026-03-07', value: 11 }, { at: '2026-03-05', value: 2 }, { at: '2026-03-05', value: 23 }] };
  assert.equal(tpm(f, { asOf: '2026-03-10' }).projectedBreach, '2026-03-12');
  // trend away from the threshold, or breached: null
  assert.equal(tpm({ ...m, direction: 'min', threshold: 10 }, { asOf: '2026-01-05' }).projectedBreach, null);
  assert.equal(tpm({ ...m, threshold: 80 }, { asOf: '2026-01-05' }).projectedBreach, null);
  // across a month end and a leap day
  const k = { id: 'k', direction: 'max', threshold: 10, history: [{ at: '2028-02-27', value: 0 }, { at: '2028-02-28', value: 1 }] };
  assert.equal(tpm(k, { asOf: '2028-02-28' }).projectedBreach, '2028-03-09'); // day 11 after 02-27
  // vv turn 3 (spec-check seed 99): the true slope is exactly 0. Floats said ≈ −1e-16, "falling"
  // toward a min threshold, and the projected date was past year 275760, so toISOString threw.
  // asOf 03-07 leaves x = 0,2,3,5 and Y(×10) = 330,210,90,354: n=4, Σx=10, ΣY=984, ΣxY=2460,
  // N = 4·2460 − 10·984 = 0.
  const zero = tpm({ id: 'z', direction: 'min', threshold: 24, riskBand: 0, history: [{ at: '2026-03-03', value: 21 }, { at: '2026-03-01', value: 33 }, { at: '2026-03-06', value: 35.4 }, { at: '2026-03-10', value: 17 }, { at: '2026-03-04', value: 9 }, { at: '2026-03-08', value: 16 }] }, { asOf: '2026-03-07' });
  assert.equal(zero.trend, 0); assert.equal(zero.projectedBreach, null); assert.equal(zero.margin, 11.4);
  // a real but tiny slope: 0.001/day from 0 reaches 10^6 after 10^9 days; no YYYY-MM-DD for that → null
  assert.equal(tpm({ id: 't', direction: 'max', threshold: 1e6, history: [{ at: '2026-01-01', value: 0 }, { at: '2026-01-02', value: 0.001 }] }, {}).projectedBreach, null);
  // 16 places, still exact: 0 then 0.3333333333333333 → line at x=3 is 0.9999999999999999, past 1 at x=4
  assert.equal(tpm({ id: 'q', direction: 'max', threshold: 1, history: [{ at: '2026-01-01', value: 0 }, { at: '2026-01-02', value: 1 / 3 }] }, {}).projectedBreach, '2026-01-05');
  // 17 digits: line at day 2 = 2·0.07343220193855533 − 0.010309278350515464 = 0.136555125526595196,
  // past T = 0.13655512552659518 by 1.6e-17 → 01-03. Turn 2's 1e-9 tolerance said "on the line", 01-04.
  assert.equal(tpm({ id: 'r', direction: 'max', threshold: 0.13655512552659518, history: [{ at: '2026-01-01', value: 0.010309278350515464 }, { at: '2026-01-02', value: 0.07343220193855533 }] }, {}).projectedBreach, '2026-01-03');
});

// ---------------- M5 ----------------
const evReqs = [R('R1'), R('R2'), R('R3')];
const evLinks = [{ from: 'a', to: 'R1', kind: 'verifies' }, { from: 'b', to: 'R2', kind: 'verifies' }, { from: 'c', to: 'R3', kind: 'verifies' }];
const plan = { workPackages: [
  { id: 'A', budget: 100, start: '2026-01-01', finish: '2026-01-10', reqs: ['R1', 'R2'] },
  { id: 'B', budget: 50, start: '2026-01-06', finish: '2026-01-15', reqs: ['R3'] },
] };
const acts = [{ wp: 'A', hours: 30, at: '2026-01-03' }, { wp: 'B', hours: 20, at: '2026-01-09' }, { wp: 'A', hours: 5, at: '2026-01-08' }];
check('T-M5-PV', () => {
  const e = earned(evReqs, evLinks, [], plan, acts, { asOf: '2026-01-08' });
  assert.equal(e.BAC, 150); assert.equal(e.AT, 8);
  near(e.byWP.A.PV, 80); near(e.byWP.B.PV, 15); near(e.PV, 95);
  assert.equal(earned(evReqs, evLinks, [], plan, acts, { asOf: '2025-12-31' }).PV, 0);
  near(earned(evReqs, evLinks, [], plan, acts, { asOf: '2026-02-01' }).PV, 150);
  // AC: hours on or before asOf; per package too
  const f = earned(evReqs, evLinks, [], plan, acts, { asOf: '2026-01-08' });
  assert.equal(f.AC, 35); assert.equal(f.byWP.A.AC, 35); assert.equal(f.byWP.B.AC, 0);
});
check('T-M5-EV', () => {
  const ev = [{ check: 'a', result: 'pass', at: '2026-01-02' }, { check: 'c', result: 'pass', at: '2026-01-09' }, { check: 'b', result: 'fail', at: '2026-01-02' }];
  const e = earned(evReqs, evLinks, ev, plan, acts, { asOf: '2026-01-08' });
  near(e.EV, 50); near(e.byWP.A.EV, 50); assert.equal(e.byWP.B.EV, 0); // c's pass is after asOf
  near(e.SV, -45); near(e.CV, 15); near(e.SPI, 50 / 95); near(e.CPI, 50 / 35);
  const z = earned(evReqs, evLinks, [], plan, [], { asOf: '2025-12-31' });
  assert.equal(z.SPI, null); assert.equal(z.CPI, null); assert.equal(z.EV, 0);
  // hours and dates claim nothing: lots of AC, no verification, no EV
  assert.equal(earned(evReqs, evLinks, [], plan, [{ wp: 'A', hours: 1e6, at: '2026-01-01' }], { asOf: '2026-02-01' }).EV, 0);
});
check('T-M5-ES', () => {
  const P = (ev, asOf = '2026-01-08') => earned(evReqs, evLinks, ev, plan, acts, { asOf });
  // PVd: 10/day for days 1-5 (=50), day 6: 65, day 7: 80 ...
  const e = P([{ check: 'a', result: 'pass', at: '2026-01-02' }]);
  assert.equal(e.ES, 5); near(e.SPIt, 5 / 8);
  // EV 50 + R3 pass = 100 -> PVd(7)=80, PVd(8)=95, PVd(9)=110 -> C=8, ES=8+5/15
  const g = P([{ check: 'a', result: 'pass', at: '2026-01-02' }, { check: 'c', result: 'pass', at: '2026-01-02' }]);
  near(g.ES, 8 + 5 / 15);
  // everything verified: EV = BAC, C = last day (15), no day 16 -> ES = 15
  const h = P(['a', 'b', 'c'].map((c) => ({ check: c, result: 'pass', at: '2026-01-02' })));
  assert.equal(h.ES, 15); near(h.SPIt, 15 / 8);
  assert.equal(P([]).ES, 0);
  // a gap where PV is flat: C is the last day of the flat stretch
  const gap = { workPackages: [{ id: 'X', budget: 10, start: '2026-01-01', finish: '2026-01-02', reqs: ['R1'] }, { id: 'Y', budget: 10, start: '2026-01-06', finish: '2026-01-07', reqs: ['R2'] }] };
  const q = earned(evReqs, evLinks, [{ check: 'a', result: 'pass', at: '2026-01-01' }], gap, [], { asOf: '2026-01-06' });
  assert.equal(q.ES, 5); assert.equal(q.AT, 6);
  // vv day 1 turn 4 (Morphyx): M5 exact. Each case below was wrong under the old 1e-9·max(1,BAC) tolerance.
  const R3s = [R('R1'), R('R2'), R('R3')], l1 = [{ from: 'a', to: 'R1', kind: 'verifies' }], p1 = [{ check: 'a', result: 'pass', at: '2026-01-01' }];
  // (a) one big unverified package widens the tolerance to 0.01: A=1 (day 1, verified), B=0.0001 (day 2), C=1e7 (day 10).
  //     EV = 1, PVd(1) = 1, PVd(2..9) = 1.0001 > 1, so C = 1 and ES = 1 + 0/0.0001 = 1. Tolerance said C = 9, ES 9.
  const big = earned(R3s, l1, p1, { workPackages: [{ id: 'A', budget: 1, start: '2026-01-01', finish: '2026-01-01', reqs: ['R1'] }, { id: 'B', budget: 0.0001, start: '2026-01-02', finish: '2026-01-02', reqs: ['R2'] }, { id: 'C', budget: 1e7, start: '2026-01-10', finish: '2026-01-10', reqs: ['R3'] }] }, [], { asOf: '2026-01-05' });
  assert.equal(big.ES, 1); assert.equal(big.SPIt, 0.2);
  // (b) tiny budgets fall under the 1e-9 floor: nothing verified, PVd(1) = 1e-10 > 0, so C = 0 and ES = 0. Tolerance said 2.
  assert.equal(earned(R3s, l1, [], { workPackages: [{ id: 'A', budget: 1e-10, start: '2026-01-01', finish: '2026-01-01', reqs: ['R1'] }, { id: 'B', budget: 1e-10, start: '2026-01-02', finish: '2026-01-02', reqs: ['R2'] }] }, [], { asOf: '2026-01-02' }).ES, 0);
  // (c) people's decimals come out as people write them: 0.1 + 0.2 is 0.3, and 0.7·3/3 is 0.7.
  //     A=0.1 (R1), B=0.2 (R2), D=0.7 (R1-R3, day 3); all three verified → EV = 0.1 + 0.2 + 0.7 = 1 = BAC.
  const dec = earned(R3s, [...l1, { from: 'b', to: 'R2', kind: 'verifies' }, { from: 'c', to: 'R3', kind: 'verifies' }],
    ['a', 'b', 'c'].map((c) => ({ check: c, result: 'pass', at: '2026-01-01' })),
    { workPackages: [{ id: 'A', budget: 0.1, start: '2026-01-01', finish: '2026-01-01', reqs: ['R1'] }, { id: 'B', budget: 0.2, start: '2026-01-01', finish: '2026-01-01', reqs: ['R2'] }, { id: 'D', budget: 0.7, start: '2026-01-03', finish: '2026-01-03', reqs: ['R1', 'R2', 'R3'] }] },
    [{ wp: 'A', hours: 0.1, at: '2026-01-01' }, { wp: 'B', hours: 0.2, at: '2026-01-01' }], { asOf: '2026-01-01' });
  assert.equal(dec.byWP.D.EV, 0.7); assert.equal(dec.PV, 0.3); assert.equal(dec.AC, 0.3); assert.equal(dec.EV, 1); assert.equal(dec.SV, 0.7);
  // EV = BAC = 1: PVd(1) = 0.3, PVd(2) = 0.3, PVd(3) = 1 ≤ 1 → C = 3 = last day, ES = 3, AT = 1
  assert.equal(dec.ES, 3); assert.equal(dec.SPIt, 3);
});

// ---------------- M6 ----------------
function project(files) {
  const d = mkdtempSync(join(tmpdir(), 'vv-'));
  for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), typeof v === 'string' ? v : JSON.stringify(v));
  return d;
}
const cli = (...args) => spawnSync(process.execPath, [join(HERE, 'cli.mjs'), ...args], { encoding: 'utf8' });
check('T-M6-REPORT', () => {
  const reqs = [...tree, R('BAD_ID', { text: 'fast and/or TBD' })];
  const d = project({
    'requirements.json': reqs, 'links.json': L3,
    'evidence.json': [{ check: 'A', result: 'pass', at: '2026-01-02' }, { check: 'B', result: 'pass', at: '2026-01-03' }],
    'measures.json': [{ id: 'mass', req: 'S-1', direction: 'max', threshold: 10, history: [{ at: '2026-01-04', value: 9.5 }] }],
    'actuals.json': [{ wp: 'W', hours: 3, at: '2026-01-01' }],
  });
  const r = cli(d);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(o), ['asOf', 'problems', 'lint', 'coverage', 'orphans', 'status', 'tpms', 'evm']);
  assert.equal(o.asOf, '2026-01-04'); // latest of evidence, actuals and measure histories
  assert.deepEqual(o.problems, [{ id: 'BAD_ID', code: 'bad-id' }]);
  assert.deepEqual(o.lint, { BAD_ID: ['and-or', 'no-shall', 'tbd', 'vague'] });
  assert.equal(o.coverage.verified, 1); assert.equal(o.coverage.total, 4);
  assert.deepEqual(o.orphans, ['BAD_ID']);
  assert.equal(o.status['S-1'], 'verified'); assert.equal(o.status.S, 'partial');
  assert.equal(o.tpms.mass.status, 'at-risk');
  assert.equal(o.evm, null);
  const r2 = JSON.parse(cli(d, '--as-of', '2026-01-02').stdout);
  assert.equal(r2.asOf, '2026-01-02'); assert.equal(r2.status['S-1'], 'partial'); assert.equal(r2.tpms.mass.status, 'unknown');
});
check('T-M6-EVM', () => {
  const d = project({ 'requirements.json': evReqs, 'links.json': evLinks, 'plan.json': plan, 'actuals.json': acts,
    'evidence.json': [{ check: 'a', result: 'pass', at: '2026-01-02' }] });
  const o = JSON.parse(cli(d, '--as-of', '2026-01-08').stdout);
  assert.deepEqual(o.evm, earned(evReqs, evLinks, [{ check: 'a', result: 'pass', at: '2026-01-02' }], plan, acts, { asOf: '2026-01-08' }));
  assert.equal(o.evm.ES, 5);
  // default asOf picks up the latest actual (01-09)
  assert.equal(JSON.parse(cli(d).stdout).asOf, '2026-01-09');
});
check('T-M6-EMPTY', () => {
  const d = project({});
  const o = JSON.parse(cli(d).stdout);
  assert.equal(o.asOf, TODAY);
  assert.deepEqual(o, { asOf: TODAY, problems: [], lint: {}, coverage: { verified: 0, failed: 0, partial: 0, unverified: 0, total: 0, ratio: 0 }, orphans: [], status: {}, tpms: {}, evm: null });
});
check('T-M6-ERRORS', () => {
  for (const args of [[], ['/no/such/dir'], [project({}), '--as-of', '2026-02-30'], [project({ 'links.json': '[{' })]]) {
    const r = cli(...args);
    assert.equal(r.status, 1, JSON.stringify(args));
    assert.match(r.stderr, /^cli\.mjs: /);
    assert.ok(!/\n\s+at /.test(r.stderr), 'no stack trace');
  }
});
check('T-DATES', () => {
  assert.equal(dayNumber('2026-03-01') - dayNumber('2026-02-28'), 1);
  assert.equal(dayNumber('2028-03-01') - dayNumber('2028-02-28'), 2);
  assert.equal(dateOf(dayNumber('2026-12-31') + 1), '2027-01-01');
  assert.throws(() => dayNumber('2026-02-29'));
  assert.throws(() => dayNumber('2026-1-5'));
});

// ---------------- M7 ----------------
check('T-M7-SELF', () => {
  // vv's own requirements: no problems, at least 12 leaves, every check id here is linked
  const reqs = JSON.parse(readFileSync(join(HERE, 'requirements.json'), 'utf8'));
  const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'));
  assert.deepEqual(load(reqs).problems, []);
  const t = trace(reqs, links);
  assert.deepEqual(t.dangling, []);
  assert.ok(reqs.filter((r) => !reqs.some((c) => c.parent === r.id)).length >= 12);
  const ran = new Set(results.map((x) => x.check)); ran.add('T-M7-SELF');
  const linked = new Set(links.filter((l) => l.kind === 'verifies').map((l) => l.from));
  assert.deepEqual([...linked].filter((c) => !ran.has(c)), [], 'links name checks that do not exist');
  assert.deepEqual([...ran].filter((c) => !linked.has(c)), [], 'checks that verify nothing');
  for (const r of reqs) assert.deepEqual(lint(r), [], `${r.id} lints`);
});

// ---------------- write evidence and the self-measure ----------------
writeFileSync(join(HERE, 'evidence.json'), JSON.stringify(results, null, 2) + '\n');
const ms = Date.now() - t0;
const mPath = join(HERE, 'measures.json');
if (existsSync(mPath)) { // today's point for the suite-time measure (one point per day, latest run wins)
  const ms0 = JSON.parse(readFileSync(mPath, 'utf8'));
  const m = ms0.find((x) => x.id === 'TPM-SUITE-MS');
  if (m) { m.history = m.history.filter((h) => h.at !== TODAY); m.history.push({ at: TODAY, value: ms }); writeFileSync(mPath, JSON.stringify(ms0, null, 2) + '\n'); }
}
const failed = results.filter((x) => x.result === 'fail').length;
console.log(`${results.length - failed}/${results.length} checks pass (${ms} ms); evidence.json written`);
process.exit(failed ? 1 : 0);
