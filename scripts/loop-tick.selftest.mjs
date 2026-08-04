#!/usr/bin/env node
// Drives the governor (scripts/loop-tick.mjs) through every stop condition.
//
// This is the component whose bug is expensive rather than visible. A
// scheduler that dispatches when it should halt does not throw, does not go
// red, and does not stop — it spends a subscription month in a circle
// overnight. So every halt has a paired CONTROL that must dispatch on the same
// world with one field changed: a regression that made `decide` always halt
// would pass the halt tests and fail here, and vice versa.
//
// `decide` is pure, so all of this runs with no runner, no ledger and no clock.

import { decide, trend, rank, artifactOf } from './loop-tick.mjs';
import { normalize } from './lib/beads.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const NOW = '2026-08-04T12:00:00Z';
const hoursAgo = (h) => new Date(Date.parse(NOW) - h * 3600 * 1000).toISOString();

// class-a by default: these tests are about the governor, not the taxonomy,
// and an untagged bead is now correctly unschedulable (see the class section).
const bead = (over = {}) => normalize({
  id: over.id ?? 'lp-000001', title: over.title ?? 'a task', kind: 'task',
  status: 'ready', priority: 2, created: '2026-08-01T00:00:00Z',
  tags: over.tags ?? ['class-a'], ...over,
});
/** budget records are ISSUED turns now, not judged runs */
const issued = (n, at) => Array.from({ length: n }, (_, i) => ({ turn: i + 1, bead: 'lp-x', at }));

const CONFIG = {
  enabled: true,
  budget: { turnsPerRun: 1, turnsPerDay: 12, hardStopTurns: 40, maxConcurrentWork: 2 },
  stop: { noImprovementTurns: 5, repeatedGateFailures: 2, emptyReadyQueue: true },
};
// The baseline world: enabled, one ready bead, nothing spent. Must dispatch.
const WORLD = { config: CONFIG, beads: [bead()], turns: [], runs: [], now: NOW, openOrders: [] };

console.log('\nthe baseline dispatches (or every test below is vacuous)');
{
  const d = decide(WORLD);
  ok('a healthy world dispatches', d.act === 'dispatch', d.reason);
  ok('it dispatches exactly turnsPerRun beads', d.dispatch.length === 1);
  ok('the work order names the bead and its turn number',
    d.dispatch[0].bead === 'lp-000001' && d.dispatch[0].turn === 1);
}

console.log('\nthe master switch');
{
  const d = decide({ ...WORLD, config: { ...CONFIG, enabled: false } });
  ok('enabled:false halts', d.act === 'halt' && d.reason === 'disabled');
  ok('and dispatches nothing', d.dispatch.length === 0);
  ok('a MISSING enabled halts too — the default is off, not on',
    decide({ ...WORLD, config: { budget: CONFIG.budget, stop: CONFIG.stop } }).act === 'halt');
  ok('a truthy-but-not-true enabled does not count as on',
    decide({ ...WORLD, config: { ...CONFIG, enabled: 'yes' } }).act === 'halt');
}

console.log('\nthe hard stop');
{
  const turns = issued(40, hoursAgo(200));
  ok('at hardStopTurns it halts', decide({ ...WORLD, turns }).reason === 'hard stop');
  ok('CONTROL: one turn short of it, it dispatches',
    decide({ ...WORLD, turns: turns.slice(0, 39) }).act === 'dispatch');
  ok('the hard stop ignores age — it is a lifetime cap, not a rolling one',
    decide({ ...WORLD, turns }).act === 'halt');
  // THE BUG THIS REPLACED: the budget used to count JUDGED runs, so a judge
  // that never fired left the brake inert while spend continued.
  ok('CONTROL: 40 judged runs with nothing issued does NOT halt — the meter is issuance',
    decide({ ...WORLD, runs: Array.from({length:40},(_,i)=>({turn:i+1,score:0.5,at:hoursAgo(200)})) }).act === 'dispatch');
}

console.log('\nthe daily gauge is rolling, not calendar');
{
  const recent = issued(12, hoursAgo(3));
  ok('12 turns in the last 24h halts', decide({ ...WORLD, turns: recent }).reason === 'daily budget spent');
  ok('CONTROL: 11 dispatches', decide({ ...WORLD, turns: recent.slice(0, 11) }).act === 'dispatch');

  // THE RUNAWAY THIS PREVENTS: a calendar-day budget lets 12 turns at 23:50 and
  // 12 more at 00:10 spend two days in twenty minutes. Rolling 24h does not.
  const old = issued(12, hoursAgo(25));
  ok('turns older than 24h no longer count against the day', decide({ ...WORLD, turns: old }).act === 'dispatch');
  const straddle = [...old.slice(0, 6), ...recent.slice(0, 6)];
  ok('CONTROL: a straddling window counts only what is inside it',
    decide({ ...WORLD, turns: straddle }).act === 'dispatch');
}

console.log('\nconcurrency counts work orders as well as in-progress beads');
{
  ok('two open work orders fill maxConcurrentWork',
    decide({ ...WORLD, openOrders: ['lp-x1','lp-x2'] }).reason === 'at concurrency');
  ok('CONTROL: one open order still leaves a slot',
    decide({ ...WORLD, openOrders: ['lp-x1'] }).act === 'dispatch');

  const busy = [bead(), bead({ id: 'lp-000002', status: 'in_progress' }), bead({ id: 'lp-000003', status: 'in_progress' })];
  ok('in-progress beads count too', decide({ ...WORLD, beads: busy }).reason === 'at concurrency');
  ok('an order plus an in-progress bead fills it — they are the same currency',
    decide({ ...WORLD, beads: [bead(), bead({ id: 'lp-000002', status: 'in_progress' })], openOrders: ['lp-x1'] }).reason === 'at concurrency');
}

console.log('\na bead already issued is never issued again');
{
  // Found by rehearsal: a work order does not change its bead's status, so the
  // bead stays `ready` and the next tick re-dispatched it — two agents, one
  // outbox, double spend.
  const d = decide({ ...WORLD, openOrders: ['lp-000001'] });
  ok('the only ready bead is already issued, so nothing dispatches', d.act === 'halt', JSON.stringify(d.dispatch));
  ok('…and it reports an empty queue, not a concurrency stop', /queue/.test(d.reason), d.reason);

  const two = [bead({ id: 'lp-000001' }), bead({ id: 'lp-000002' })];
  const d2 = decide({ ...WORLD, beads: two, openOrders: ['lp-000001'] });
  ok('CONTROL: a sibling that is NOT issued still dispatches', d2.act === 'dispatch');
  ok('…and it is the un-issued one', d2.dispatch[0]?.bead === 'lp-000002', JSON.stringify(d2.dispatch));
}

console.log('\nrepeated gate failure, measured from the tail');
{
  const runs = [{ turn: 1, score: 0.4, at: hoursAgo(5), gateFailed: true }, { turn: 2, score: 0.4, at: hoursAgo(4), gateFailed: true }];
  ok('two consecutive gate failures halt', decide({ ...WORLD, runs }).reason === 'repeated gate failure');

  // CONTROL: the same two failures with a success after them are history.
  const recovered = [...runs, { turn: 3, score: 0.6, at: hoursAgo(3) }];
  ok('CONTROL: a success since then clears the streak', decide({ ...WORLD, runs: recovered }).act === 'dispatch');
  ok('non-consecutive failures do not accumulate',
    decide({ ...WORLD, runs: [runs[0], { turn: 2, score: 0.5, at: hoursAgo(4) }, runs[1]] }).act === 'dispatch');
}

console.log('\nan empty queue is a stop condition, not a prompt to self-promote');
{
  ok('no ready beads halts',
    decide({ ...WORLD, beads: [bead({ status: 'proposed' })] }).reason === 'empty ready queue');
  ok('a proposal is NOT promoted to fill the queue',
    decide({ ...WORLD, beads: [bead({ status: 'proposed' })] }).dispatch.length === 0);
  ok('a blocked bead does not count as schedulable',
    decide({ ...WORLD, beads: [bead({ id: 'lp-0000d1', status: 'in_progress' }), bead({ id: 'lp-0000d2', deps: ['lp-0000d1'] })] }).act === 'halt');
  ok('a knowledge bead does not count as schedulable',
    decide({ ...WORLD, beads: [bead({ kind: 'dead-end' })] }).reason === 'empty ready queue');
}

console.log('\nthe plateau — the measurement, wired up as a brake');
{
  const tagged = [bead({ id: 'lp-00000a', tags: ['class-a', 'artifact:alpha'] })];
  // Five turns since the best score improved.
  const flat = [
    { turn: 1, artifact: 'alpha', score: 0.7, at: hoursAgo(30) },
    ...Array.from({ length: 5 }, (_, i) => ({ turn: i + 2, artifact: 'alpha', score: 0.6, at: hoursAgo(29 - i) })),
  ];
  const d = decide({ ...WORLD, beads: tagged, runs: flat });
  ok('an artifact that stopped improving is retired', d.act === 'halt' && d.reason === 'plateau', d.reason);

  // CONTROL: one fewer flat turn and it still runs.
  ok('CONTROL: four flat turns is not yet a plateau',
    decide({ ...WORLD, beads: tagged, runs: flat.slice(0, 5) }).act === 'dispatch');

  // CONTROL: a late improvement resets the counter.
  const improved = [...flat.slice(0, 5), { turn: 6, artifact: 'alpha', score: 0.9, at: hoursAgo(24) }];
  ok('CONTROL: an improvement resets the plateau counter',
    decide({ ...WORLD, beads: tagged, runs: improved }).act === 'dispatch');

  // EQUAL IS NOT IMPROVEMENT — a judge saturating at its own ceiling would
  // otherwise read as endless progress and the loop would never stop.
  const saturated = [
    { turn: 1, artifact: 'alpha', score: 1.0, at: hoursAgo(30) },
    ...Array.from({ length: 5 }, (_, i) => ({ turn: i + 2, artifact: 'alpha', score: 1.0, at: hoursAgo(29 - i) })),
  ];
  ok('a saturated judge is a plateau, not progress',
    decide({ ...WORLD, beads: tagged, runs: saturated }).reason === 'plateau');

  // Retiring one artifact must not stop another that is still climbing.
  const two = [bead({ id: 'lp-00000a', tags: ['class-a', 'artifact:alpha'] }), bead({ id: 'lp-00000b', tags: ['class-a', 'artifact:beta'] })];
  const mixed = [...flat, { turn: 7, artifact: 'beta', score: 0.3, at: hoursAgo(2) }];
  const d2 = decide({ ...WORLD, beads: two, runs: mixed });
  ok('retiring one artifact does not halt the loop', d2.act === 'dispatch', d2.reason);
  ok('and the surviving artifact is the one dispatched', d2.dispatch[0]?.artifact === 'beta');
  ok('the retired artifact is named in the decision', d2.retired?.includes('alpha'));
}

console.log('\nwhere the marginal turn pays');
{
  const trends = trend([
    { turn: 1, artifact: 'climbing', score: 0.2 }, { turn: 2, artifact: 'climbing', score: 0.5 },
    { turn: 3, artifact: 'stalled', score: 0.9 }, { turn: 4, artifact: 'stalled', score: 0.8 },
    { turn: 5, artifact: 'stalled', score: 0.8 },
  ]);
  ok('a climbing artifact reports zero turns since improvement',
    trends.get('climbing').sinceImprovement === 0);
  ok('a stalled one counts them', trends.get('stalled').sinceImprovement === 2);
  ok('best is a maximum, not the last score', trends.get('stalled').best === 0.9);

  const cands = [
    { id: 'lp-00000s', tags: ['artifact:stalled'], priority: 0, unblocks: 9 },
    { id: 'lp-00000c', tags: ['artifact:climbing'], priority: 3, unblocks: 0 },
  ];
  const ranked = rank(cands, trends);
  ok('the climbing artifact wins despite worse priority and no fan-out',
    ranked[0].id === 'lp-00000c', ranked.map((r) => r.id).join(','));
  // CONTROL: with no history, the ordering falls back to fan-out then priority.
  ok('CONTROL: with no trend data, fan-out decides',
    rank(cands, new Map())[0].id === 'lp-00000s');
}

console.log('\nartifact tagging');
{
  ok('an artifact tag is read', artifactOf({ tags: ['x', 'artifact:gamma'] }) === 'gamma');
  ok('untagged work belongs to the programme, not to an artifact',
    artifactOf({ tags: ['phase'] }) === null);
  ok('a bead with no tags at all does not throw', artifactOf({}) === null);
  // Programme work must never be retired by another artifact's plateau.
  const flat = Array.from({ length: 9 }, (_, i) => ({ turn: i + 1, artifact: 'alpha', score: 0.5, at: hoursAgo(20) }));
  ok('untagged beads survive a plateau elsewhere',
    decide({ ...WORLD, beads: [bead()], runs: flat }).act === 'dispatch');
}

console.log('\nprecedence — the switch outranks everything');
{
  // Disabled AND out of budget AND empty queue: the reason must be the switch,
  // because that is the one a human is looking for when they ask "why is it not
  // running", and a lower-priority reason would send them debugging the wrong
  // thing.
  const d = decide({
    config: { ...CONFIG, enabled: false },
    beads: [], turns: issued(99, hoursAgo(1)), now: NOW,
  });
  ok('a disabled loop reports the switch, not the budget', d.reason === 'disabled');

  // And the hard stop outranks the daily gauge, for the same reason.
  const d2 = decide({ ...WORLD, turns: issued(41, hoursAgo(1)) });
  ok('the hard stop outranks the daily gauge', d2.reason === 'hard stop');
}

console.log('\nclass — the fleet may only take class A');
{
  // The rehearsal bug: the reactor's first-ever pick was a class-B bead.
  const b = decide({ ...WORLD, beads: [bead({ tags: ['class-b'] })] });
  ok('a class-B bead is never dispatched', b.act === 'halt', b.dispatch.map(d=>d.bead).join());
  ok('…and the reason names why', /class A/.test(b.detail), b.detail);
  ok('class C is not dispatched', decide({ ...WORLD, beads: [bead({ tags: ['class-c'] })] }).act === 'halt');
  ok('an UNTAGGED bead is not dispatched — fail closed', decide({ ...WORLD, beads: [bead({ tags: [] })] }).act === 'halt');
  ok('CONTROL: class A is dispatched', decide({ ...WORLD, beads: [bead({ tags: ['class-a'] })] }).act === 'dispatch');
  // and a mixed queue picks only the class-A member
  const mixed = decide({ ...WORLD, beads: [
    bead({ id: 'lp-00000B', tags: ['class-b'], priority: 0 }),
    bead({ id: 'lp-00000A', tags: ['class-a'], priority: 3 }),
  ]});
  ok('a high-priority class-B does not outrank a low-priority class-A',
    mixed.dispatch[0]?.bead === 'lp-00000A', JSON.stringify(mixed.dispatch));
}

console.log('');
if (failed) { console.log(`✗ loop-tick selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ loop-tick selftest passed\n');
