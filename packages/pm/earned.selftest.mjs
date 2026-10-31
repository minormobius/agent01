// earned.selftest.mjs — verifiedEarned against hand-worked answers.
import assert from 'node:assert/strict';
import { verifiedEarned } from './earned.mjs';
import { computeEVM } from './engine.mjs';

const T = (id, cost, pct, extra = {}) => ({
  id, name: id, plannedCost: cost, actualCost: cost * pct / 100, plannedStart: '2026-01-01',
  plannedEnd: '2026-01-11', duration: 80, percentComplete: pct, parentId: null, ...extra,
});
const asOf = new Date('2026-01-06T00:00:00Z');
const tasks = [
  T('A', 100, 100, { reqs: ['R1', 'R2'] }),   // claims all, half verified → earns 50
  T('B', 200, 50, { reqs: ['R3'] }),          // claims half, verified → earns 200
  T('C', 300, 80),                           // no requirements → earns 0
  T('D', 400, 0, { parentId: null }),         // linked via links, one of two failed → earns 200
  T('P', 0, 0), T('P1', 50, 100, { parentId: 'P', reqs: ['R6'] }), // parent skipped; child unverified
];
const status = { R1: 'verified', R2: 'partial', R3: 'verified', R4: 'verified', R5: 'failed', R6: 'unverified' };
const links = [{ from: 'D', to: 'R4', kind: 'implements' }, { from: 'D', to: 'R5', kind: 'implements' },
  { from: 'D', to: 'R9', kind: 'verifies' }];
const r = verifiedEarned(tasks, status, { asOf, links });

assert.equal(r.evm.ev, 50 + 200 + 0 + 200 + 0);
assert.equal(r.claimedEv, computeEVM(tasks, asOf).ev);
assert.equal(r.claimedEv, 100 + 100 + 240 + 0 + 50);
assert.equal(r.unverifiedClaim, 490 - 450);
assert.deepEqual(r.unlinked, ['C']);
assert.deepEqual(r.byTask.D.reqs, ['R4', 'R5']);
assert.deepEqual(r.byTask.D.failed, ['R5']);
assert.equal(r.byTask.P, undefined);
assert.equal(r.byTask.P1.earned, 0);
assert.equal(r.evm.ac, computeEVM(tasks, asOf).ac);          // cost is untouched
assert.equal(tasks[0].percentComplete, 100);                 // input not mutated
assert.ok(r.es.es >= 0 && r.es.sac === 10);
// Everything verified and complete → verified EV is BAC.
const all = verifiedEarned([T('X', 10, 100, { reqs: ['Q'] })], { Q: 'verified' }, { asOf });
assert.equal(all.evm.ev, all.evm.bac);
console.log('pm earned selftest: verified EV, claims, links, parents, no mutation');
