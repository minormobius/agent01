// The reference's own tests: each named check is one requirement's evidence (requirements.json,
// links.json). Writes evidence.json, so `node cli.mjs .` reports vv's own coverage.
import { writeFileSync } from 'node:fs';
import { load, lint, trace, status, tpm, earned } from './vv.mjs';
const today = new Date().toISOString().slice(0, 10);
const ev = [];
const t = (check, ok) => ev.push({ check, result: ok ? 'pass' : 'fail', at: today });
const R = (id, o = {}) => ({ id, text: `${id} shall work.`, parent: null, strength: 'shall', method: 'test', acceptance: 'x', ...o });
t('t-bad-id', load([R('bad id')]).problems.some((p) => p.code === 'bad-id'));
t('t-dup', load([R('A'), R('A'), R('A')]).problems.filter((p) => p.code === 'duplicate-id').length === 1);
t('t-cycle', load([R('A', { parent: 'B' }), R('B', { parent: 'A' })]).problems.filter((p) => p.code === 'cycle').length === 2);
t('t-acceptance', load([R('A', { acceptance: '' })]).problems.some((p) => p.code === 'missing-acceptance'));
t('t-lint-tbd', lint({ text: 'Limit is TBD.' }).includes('tbd'));
t('t-lint-vague', lint({ text: 'It shall be fast.' }).includes('vague') && !lint({ text: 'breakfast shall be served' }).includes('vague'));
t('t-orphans', JSON.stringify(trace([R('A'), R('B')], [{ from: 'c', to: 'A', kind: 'verifies' }]).orphans) === '["B"]');
t('t-dangling', JSON.stringify(trace([R('A')], [{ from: 'c', to: 'Z', kind: 'verifies' }]).dangling) === '[0]');
const L = [{ from: 'c', to: 'A', kind: 'verifies' }];
t('t-latest', status([R('A')], L, [{ check: 'c', result: 'fail', at: '2026-01-01' }, { check: 'c', result: 'pass', at: '2026-01-02' }], { asOf: '2026-01-02' }).A === 'verified');
t('t-rollup', status([R('P'), R('A', { parent: 'P' })], L, [{ check: 'c', result: 'pass', at: '2026-01-01' }], { asOf: '2026-01-01' }).P === 'verified');
const m = { direction: 'max', threshold: 10, history: [{ at: '2026-01-01', value: 4 }, { at: '2026-01-03', value: 6 }] };
t('t-margin', tpm(m, { asOf: '2026-01-03' }).margin === 4);
t('t-breach', tpm(m, { asOf: '2026-01-03' }).projectedBreach === '2026-01-08');
const plan = { workPackages: [{ id: 'W', budget: 10, start: '2026-01-01', finish: '2026-01-10', reqs: ['A'] }] };
t('t-ev', earned([R('A')], L, [], plan, [], { asOf: '2026-01-05' }).EV === 0);
t('t-es', Math.abs(earned([R('A')], L, [{ check: 'c', result: 'pass', at: '2026-01-01' }], plan, [], { asOf: '2026-01-05' }).ES - 10) < 1e-9);
writeFileSync('evidence.json', JSON.stringify(ev, null, 1));
const bad = ev.filter((e) => e.result === 'fail');
for (const b of bad) console.log(`FAIL ${b.check}`);
process.exit(bad.length ? 1 : 0);
