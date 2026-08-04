#!/usr/bin/env node
// Tests the producer/consumer boundary (scripts/loop-apply-outbox.mjs).
//
// The property that matters most is negative and structural: AN AGENT CANNOT
// PROMOTE ITS OWN WORK. Everything else here is input validation; that one is
// the gate, and if it ever regresses the loop becomes a machine that
// manufactures its own justification to keep running.
//
// So the first test asks for `ready` explicitly, the way a confused or
// adversarial agent would, and asserts it gets `proposed` anyway.

import { planOutbox } from './loop-apply-outbox.mjs';
import { normalize } from './lib/beads.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const NOW = '2026-08-04T12:00:00Z';
const LEDGER = [normalize({
  id: 'lp-000001', title: 'the work order bead', kind: 'task', status: 'in_progress',
  body: 'the brief a human wrote', created: '2026-08-01T00:00:00Z',
})];
const plan = (outbox, beads = LEDGER) => planOutbox(outbox, beads, { now: NOW, run: '7' });

const VALID = { bead: 'lp-000001', outcome: 'done', summary: 'built the thing', evidence: ['commit:abc1234'] };

console.log('\nthe gate — an agent cannot promote its own work');
{
  const p = plan({ ...VALID, propose: [
    { title: 'a follow-up I want done now', status: 'ready', priority: 0 },
    { title: 'another one', status: 'in_progress' },
  ] });
  ok('the outbox is accepted', p.ok, JSON.stringify(p.problems));
  const created = p.patches.filter((x) => x.created && x.kind === 'task');
  ok('both proposals were created', created.length === 2);
  ok('EVERY proposal is `proposed`, whatever the outbox asked for',
    created.every((c) => c.status === 'proposed'),
    created.map((c) => c.status).join(','));
  ok('a requested priority is honoured — only status is forced',
    created.some((c) => c.priority === 0));
  ok('proposals are parented to the bead that produced them',
    created.every((c) => c.parent === 'lp-000001'));
  ok('and tagged as agent-proposed so a human can find them',
    created.every((c) => c.tags.includes('proposed-by-agent')));
}

console.log('\nthe target bead\'s outcome');
{
  const p = plan(VALID);
  const target = p.patches.find((x) => x.id === 'lp-000001');
  ok('done means done', target.status === 'done');
  ok('evidence is appended', target.evidence.includes('commit:abc1234'));
  ok('the human-written brief is NOT overwritten', target.body.startsWith('the brief a human wrote'));
  ok('the summary is appended after it', target.body.includes('built the thing'));
  ok('the turn number is recorded in the body', target.body.includes('turn 7'));

  ok('blocked returns the bead to the backlog rather than closing it',
    plan({ ...VALID, outcome: 'blocked', evidence: [] }).patches[0].status === 'proposed');
  ok('failed leaves it schedulable for another attempt',
    plan({ ...VALID, outcome: 'failed', evidence: [] }).patches[0].status === 'ready');
}

console.log('\nrejection is whole — a bad outbox never half-applies');
{
  const bad = plan({ ...VALID, propose: [{ title: 'fine' }, { title: '' }] });
  ok('one bad proposal rejects the whole outbox', !bad.ok);
  ok('and yields no patches at all', bad.patches.length === 0);
  ok('the problem names the index', bad.problems.some((x) => x.includes('propose[1]')));
}

console.log('\nvalidation');
{
  ok('an outbox with no bead is rejected', !plan({ ...VALID, bead: undefined }).ok);
  ok('a bead not in the ledger is rejected', !plan({ ...VALID, bead: 'lp-nosuch' }).ok);
  ok('an unknown outcome is rejected', !plan({ ...VALID, outcome: 'shipped' }).ok);
  ok('an empty summary is rejected', !plan({ ...VALID, summary: '   ' }).ok);
  ok('done with no evidence is rejected',
    !plan({ ...VALID, evidence: [] }).ok);
  ok('CONTROL: done WITH evidence is accepted', plan(VALID).ok);
  ok('a non-object outbox is rejected', !plan('a string').ok);
  ok('an array outbox is rejected', !plan([VALID]).ok);
  ok('a null outbox does not throw', !plan(null).ok);

  ok('a proposal depending on an unknown bead is rejected',
    !plan({ ...VALID, propose: [{ title: 't', deps: ['lp-nosuch'] }] }).ok);
  ok('CONTROL: a proposal depending on a real bead is accepted',
    plan({ ...VALID, propose: [{ title: 't', deps: ['lp-000001'] }] }).ok);
  ok('a proposal may depend on a bead created earlier in the same outbox',
    plan({ ...VALID, learned: [{ kind: 'finding', title: 'f' }], propose: [{ title: 't' }] }).ok);
}

console.log('\nbounds — a runaway turn cannot flood the graph');
{
  const many = Array.from({ length: 13 }, (_, i) => ({ title: `proposal ${i}` }));
  ok('13 proposals is over the limit', !plan({ ...VALID, propose: many }).ok);
  ok('CONTROL: 12 is fine', plan({ ...VALID, propose: many.slice(0, 12) }).ok);
  ok('13 learned entries is over the limit',
    !plan({ ...VALID, learned: Array.from({ length: 13 }, () => ({ kind: 'finding', title: 'x' })) }).ok);
  ok('an oversized body is rejected rather than silently truncated into the ledger',
    !plan({ ...VALID, summary: 'x'.repeat(5000) }).ok);
}

console.log('\nknowledge');
{
  const p = plan({ ...VALID, learned: [
    { kind: 'dead-end', title: 'the runner cannot reach that host', body: 'tried three ways' },
    { kind: 'finding', title: 'the API paginates at 50' },
  ] });
  ok('learned entries are accepted', p.ok, JSON.stringify(p.problems));
  const know = p.patches.filter((x) => x.kind === 'dead-end' || x.kind === 'finding');
  ok('both were created', know.length === 2);
  ok('knowledge is born done', know.every((k) => k.status === 'done'));
  ok('and tagged as learned', know.every((k) => k.tags.includes('learned')));
  ok('a work kind is refused in learned[]',
    !plan({ ...VALID, learned: [{ kind: 'task', title: 'sneaky' }] }).ok);
  ok('an unknown kind is refused', !plan({ ...VALID, learned: [{ kind: 'vibe', title: 'x' }] }).ok);
}

console.log('\nno human sign-off in the engine');
{
  // THE STRUCTURAL HALF of "decide, do not ask". The prompt says it; this makes
  // it impossible. An agent that CAN file a blocking question eventually will.
  const q = plan({ ...VALID, learned: [{ kind: 'question', title: 'should we use X or Y?' }] });
  ok('an agent may NOT file a question', !q.ok);
  ok('…and the refusal tells it what to do instead',
    q.problems.some((p) => /decides|decision/.test(p)), JSON.stringify(q.problems));

  const d = plan({ ...VALID, learned: [
    { kind: 'decision', title: 'chose union merge for the ledger',
      body: 'Both sides append different records, so union is correct. Reversed by setting merge=text.' },
  ] });
  ok('CONTROL: it may file a DECISION instead', d.ok, JSON.stringify(d.problems));
  const rec = d.patches.find((x) => x.kind === 'decision');
  ok('the decision is recorded as knowledge, born done', rec && rec.status === 'done');
  ok('and it is never schedulable', rec && rec.tags.includes('learned'));
}

console.log('\nids do not collide within one turn');
{
  const p = plan({ ...VALID, learned: [
    { kind: 'finding', title: 'same title' },
    { kind: 'finding', title: 'same title' },
  ] });
  const ids = p.patches.filter((x) => x.created).map((x) => x.id);
  ok('two identically-titled beads in one turn get distinct ids',
    new Set(ids).size === ids.length, ids.join(','));
  ok('and neither collides with the existing ledger', !ids.includes('lp-000001'));
}

console.log('');
if (failed) { console.log(`✗ loop-apply-outbox selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ loop-apply-outbox selftest passed\n');
