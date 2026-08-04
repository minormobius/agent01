#!/usr/bin/env node
// Known-answer tests for the ticket graph (scripts/lib/beads.mjs).
//
// The properties under test are the ones a long unattended run depends on and
// that no human will be awake to notice breaking:
//
//   1. the ledger folds append-only patches in order          (memory survives)
//   2. blocked-ness is DERIVED, never stale                   (queue keeps producing)
//   3. a dangling dep blocks rather than silently passing     (no phantom work)
//   4. a cycle blocks every member                            (no infinite dispatch)
//   5. knowledge beads are never dispatched                   (findings ≠ tasks)
//   6. the ready queue prefers what unblocks the most         (the point of a graph)
//
// Each assertion carries a CONTROL where the naive implementation would pass,
// so a rewrite that quietly reverts to "status says blocked" fails here.

import {
  parseLedger, computeGraph, readyQueue, summarize, mintId, toLine, validate, normalize,
} from './lib/beads.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const L = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n');
const graphOf = (text) => computeGraph(parseLedger(text).beads);

console.log('\nledger folding');
{
  const text = L(
    { id: 'lp-000001', title: 'first', kind: 'task', status: 'proposed', created: '2026-08-01T00:00:00Z' },
    { id: 'lp-000002', title: 'second', kind: 'task', status: 'ready', created: '2026-08-01T00:01:00Z' },
    { id: 'lp-000001', status: 'ready', priority: 0 },                 // patch, not a rewrite
    { id: 'lp-000001', title: 'first, renamed' },
  );
  const { beads, problems } = parseLedger(text);
  eq('two beads survive four records', beads.length, 2);
  eq('later record wins', beads[0].status, 'ready');
  eq('patches accumulate rather than replace', beads[0].priority, 0);
  eq('untouched fields persist through a patch', beads[0].created, '2026-08-01T00:00:00Z');
  eq('title patch applied', beads[0].title, 'first, renamed');
  eq('first-seen order is preserved', beads.map((b) => b.id), ['lp-000001', 'lp-000002']);
  eq('clean ledger has no problems', problems, []);
}

{
  const { beads, problems } = parseLedger([
    '{"id":"lp-00000a","title":"good","kind":"task","status":"ready"}',
    'not json at all',
    '',
    '// a comment',
    '{"no":"id"}',
    '{"id":"lp-00000b","title":"also good","kind":"task","status":"ready"}',
  ].join('\n'));
  eq('a corrupt line does not lose the rest of the graph', beads.length, 2);
  eq('both bad lines are reported', problems.length, 2);
  ok('problem carries a line number', problems.every((p) => typeof p.line === 'number'));
}

{
  const text = L(
    { id: 'lp-00000c', title: 'made in error', kind: 'task', status: 'ready' },
    { id: 'lp-00000c', tombstone: true },
  );
  eq('a tombstone removes the bead', parseLedger(text).beads.length, 0);
}

console.log('\nblocked-ness is derived, not stored');
{
  // The dependency is DONE. A stale stored flag would still say blocked.
  const g = graphOf(L(
    { id: 'lp-0000d1', title: 'dep', kind: 'task', status: 'done' },
    { id: 'lp-0000d2', title: 'dependent', kind: 'task', status: 'ready', deps: ['lp-0000d1'] },
  ));
  const dependent = g.nodes.find((n) => n.id === 'lp-0000d2');
  ok('a satisfied dependency unblocks without anyone editing the dependent', dependent.ready && !dependent.blocked);

  // CONTROL: flip the dependency back to open and the same bead must block.
  const g2 = graphOf(L(
    { id: 'lp-0000d1', title: 'dep', kind: 'task', status: 'in_progress' },
    { id: 'lp-0000d2', title: 'dependent', kind: 'task', status: 'ready', deps: ['lp-0000d1'] },
  ));
  const blocked = g2.nodes.find((n) => n.id === 'lp-0000d2');
  ok('CONTROL: an open dependency blocks', blocked.blocked && !blocked.ready);
  eq('the unmet dependency is named', blocked.unmet, ['lp-0000d1']);
}

{
  // `dropped` resolves a dependency. Without this a decision not to do
  // something strands everything behind it and the queue silently dries up.
  const g = graphOf(L(
    { id: 'lp-0000e1', title: 'abandoned', kind: 'task', status: 'dropped' },
    { id: 'lp-0000e2', title: 'behind it', kind: 'task', status: 'ready', deps: ['lp-0000e1'] },
  ));
  ok('a dropped dependency does not strand its dependents',
    g.nodes.find((n) => n.id === 'lp-0000e2').ready);
}

console.log('\ndangling and cyclic deps refuse to schedule');
{
  const g = graphOf(L(
    { id: 'lp-0000f1', title: 'typo in dep', kind: 'task', status: 'ready', deps: ['lp-nosuch'] },
  ));
  const n = g.nodes[0];
  ok('a dep on a missing bead blocks rather than passing', n.blocked && !n.ready);
  eq('the dangling dep is reported', g.dangling, [{ id: 'lp-0000f1', dep: 'lp-nosuch' }]);
}

{
  const g = graphOf(L(
    { id: 'lp-0000c1', title: 'a', kind: 'task', status: 'ready', deps: ['lp-0000c2'] },
    { id: 'lp-0000c2', title: 'b', kind: 'task', status: 'ready', deps: ['lp-0000c1'] },
  ));
  eq('the cycle is found', g.cycles.length, 1);
  ok('every member of a cycle is blocked', g.nodes.every((n) => n.blocked && !n.ready));
  ok('layering terminates on a cycle', Array.isArray(g.layers));
}

console.log('\nknowledge beads are memory, not work');
{
  const g = graphOf(L(
    { id: 'lp-0000a1', title: 'poly.pizza is unreachable from THIS runner', kind: 'dead-end', status: 'ready' },
    { id: 'lp-0000a2', title: 'fetch models', kind: 'task', status: 'ready', deps: ['lp-0000a1'] },
  ));
  const finding = g.nodes.find((n) => n.id === 'lp-0000a1');
  const task = g.nodes.find((n) => n.id === 'lp-0000a2');
  ok('a dead-end is never dispatched even when marked ready', !finding.ready);
  ok('depending on a finding does not block — it exists, so it can be read', task.ready);
  eq('knowledge is counted apart from work', summarize(g).knowledge, 1);
}

console.log('\nready queue orders by what it unblocks');
{
  //  leaf  — ready, priority 2, unblocks nothing
  //  hub   — ready, priority 2, unblocks three
  //  urgent— ready, priority 0
  const g = graphOf(L(
    { id: 'lp-0000b0', title: 'hub', kind: 'task', status: 'ready', priority: 2, created: '2026-08-01T00:00:02Z' },
    { id: 'lp-0000b1', title: 'leaf', kind: 'task', status: 'ready', priority: 2, created: '2026-08-01T00:00:01Z' },
    { id: 'lp-0000b2', title: 'urgent', kind: 'task', status: 'ready', priority: 0, created: '2026-08-01T00:00:03Z' },
    { id: 'lp-0000b3', title: 'x', kind: 'task', status: 'proposed', deps: ['lp-0000b0'] },
    { id: 'lp-0000b4', title: 'y', kind: 'task', status: 'proposed', deps: ['lp-0000b0'] },
    { id: 'lp-0000b5', title: 'z', kind: 'task', status: 'proposed', deps: ['lp-0000b0'] },
  ));
  const q = readyQueue(g);
  eq('only ready beads are queued', q.map((n) => n.id), ['lp-0000b2', 'lp-0000b0', 'lp-0000b1']);
  eq('the hub reports its fan-out', q.find((n) => n.id === 'lp-0000b0').unblocks, 3);
  // CONTROL: age-only ordering would have put the leaf ahead of the hub.
  ok('CONTROL: newest-first/oldest-first would have ordered differently',
    ['lp-0000b1', 'lp-0000b0', 'lp-0000b2'].join() !== q.map((n) => n.id).join());
}

{
  // A `proposed` bead with no dependencies is NOT ready. Promotion is a
  // decision; a loop that self-promotes its own proposals has no gate at all.
  const g = graphOf(L({ id: 'lp-0000p1', title: 'an idea', kind: 'task', status: 'proposed' }));
  ok('proposed is a backlog, not a queue', !g.nodes[0].ready);
  eq('and it is counted as such', summarize(g).proposed, 1);
}

console.log('\nids and validation');
{
  const seed = { title: 'a bead', created: '2026-08-01T00:00:00Z', actor: 'agent' };
  eq('minting is deterministic', mintId(seed), mintId(seed));
  ok('a different title gives a different id', mintId(seed) !== mintId({ ...seed, title: 'other' }));
  ok('the shape is <prefix>-<6 hex>', /^lp-[0-9a-f]{6}$/.test(mintId(seed)));
  const taken = new Set([mintId(seed)]);
  ok('a collision is perturbed, not incremented', !taken.has(mintId(seed, taken)));
  ok('the prefix is settable', mintId(seed, new Set(), 'zz').startsWith('zz-'));
}

{
  const bad = validate(normalize({ id: 'nope', title: '', kind: 'wat', status: 'huh', priority: 9 }));
  ok('validation catches a bad id', bad.some((b) => b.includes('id')));
  ok('validation catches an empty title', bad.some((b) => b.includes('title')));
  ok('validation catches an unknown kind', bad.some((b) => b.includes('kind')));
  ok('validation catches an unknown status', bad.some((b) => b.includes('status')));
  ok('validation catches an out-of-range priority', bad.some((b) => b.includes('priority')));

  const self = validate(normalize({ id: 'lp-000001', title: 't', kind: 'task', status: 'ready', deps: ['lp-000001'] }));
  ok('a self-dependency is rejected at validation, not at scheduling', self.some((b) => b.includes('itself')));
}

{
  const line = toLine({ status: 'done', id: 'lp-000001', title: 'z' });
  ok('id sorts first in a serialized record', line.startsWith('{"id":'));
  eq('a serialized record round-trips', JSON.parse(line).status, 'done');
  ok('a record is exactly one line', !line.includes('\n'));
}

console.log('');
if (failed) { console.log(`✗ beads selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ beads selftest passed\n');
