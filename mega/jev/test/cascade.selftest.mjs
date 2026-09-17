// cascade.selftest.mjs — the router's job is to send the right work upstairs
// and to send nothing else. The measured trap it exists to avoid is pinned
// here as a regression: a decision whose ANSWER is confident but whose state
// is missing must still escalate, because that is exactly the case a plain
// confidence gate got wrong 15 times out of 15.
//
//   node mega/jev/test/cascade.selftest.mjs

import {
  DEFAULTS, buildCascadeQuestions, isSelfCheck, confidenceOf, partition, narrow, sizeOf, runCascade,
} from '../cascade.mjs';

let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };

const D = (id, ask, extra = {}) => ({ id, ask, ...extra });
const decisions = [
  D('a', 'Is device D-101 over 70C?', { slice: 'D-101 temp=88' }),
  D('b', 'Is device D-102 over 70C?', { slice: 'D-102 temp=51' }),
  D('c', 'Is device D-999 over 70C?', { slice: '' }),
];

// ------------------------------------------------------ question building ---
{
  const q = buildCascadeQuestions(decisions);
  ok(Object.keys(q).length === 6, 'every decision becomes exactly two questions');
  ok(q.a.type === 'noul', 'a bare decision is a noul');
  ok(q.have__a.type === 'noul', 'the self-check is a noul');
  ok(/AVAILABILITY/.test(q.have__a.instructions), 'the self-check asks about availability, not the question');
  ok(q.have__a.instructions.includes(decisions[0].ask), 'the self-check quotes the decision it guards');
  ok(isSelfCheck('have__a') && !isSelfCheck('a'), 'self-check ids are identifiable');

  const withCriteria = buildCascadeQuestions([D('x', 'which door', { criteria: { left: 'l', right: 'r' } })]);
  ok(withCriteria.x.type === 'choice', 'criteria make it a choice');
  ok(withCriteria.have__x.type === 'noul', 'the self-check stays a noul even for a choice');
}
{
  let threw = 0;
  for (const bad of [[], [{ id: 'a' }], [D('a', 'q'), D('a', 'q')], [D('have__a', 'q')]]) {
    try { buildCascadeQuestions(bad); } catch { threw++; }
  }
  ok(threw === 4, 'empty, malformed, duplicate and reserved-prefix inputs all throw');
}

// ------------------------------------------------------------- confidence ---
ok(confidenceOf({ noul: 0.97 }) === 0.97, 'noul confidence is distance from the coin flip (high side)');
ok(Math.abs(confidenceOf({ noul: 0.03 }) - 0.97) < 1e-9, 'and the low side too');
ok(confidenceOf({ choice: 'x', confidence: 0.8 }) === 0.8, 'a choice reports its own confidence');
ok(confidenceOf(null) === 0 && confidenceOf({}) === 0, 'a missing answer has no confidence');

// ----------------------------------------------- THE regression that matters ---
{
  // Exactly the measured failure: the model is confident about a device that
  // is not in the state. Answer confidence 0.96 would sail through a 0.9
  // gate; the self-check at 0.14 must send it upstairs anyway.
  const answers = {
    a: { noul: 0.99 }, have__a: { noul: 0.98 },
    b: { noul: 0.98 }, have__b: { noul: 0.99 },
    c: { noul: 0.96 }, have__c: { noul: 0.14 },
  };
  const { local, escalate } = partition(decisions, answers);
  ok(escalate.length === 1 && escalate[0].decision.id === 'c',
    'a CONFIDENT answer with an absent state still escalates');
  ok(escalate[0].reason === 'insufficient_state', 'and it says why');
  ok(local.length === 2 && local.every((r) => !r.reason), 'the supported ones stay local');
  ok(confidenceOf(answers.c) > DEFAULTS.confThreshold,
    'the escalated one would have passed a confidence gate — which is the point');
}

// ------------------------------------------------------- the other reasons ---
{
  const { escalate } = partition(decisions, {
    a: { noul: 0.99 }, have__a: { noul: 0.98 },
    b: { noul: 0.55 }, have__b: { noul: 0.97 },
    have__c: { noul: 0.99 },
  }, { maxEscalationRate: 1 });   // this case is about reasons, not the cap
  const by = Object.fromEntries(escalate.map((r) => [r.decision.id, r.reason]));
  ok(by.b === 'low_confidence', 'a supported but unsure answer escalates as low_confidence');
  ok(by.c === 'no_answer', 'a missing answer escalates as no_answer');
  ok(!by.a, 'a well-supported confident answer does not');
}
{
  const { escalate } = partition([D('a', 'q')], { a: { noul: 0.99 } });
  ok(escalate[0]?.reason === 'no_self_check', 'a missing self-check escalates rather than defaulting to trust');
}

// ------------------------------------------------------------- the cap -----
{
  const many = Array.from({ length: 10 }, (_, i) => D(`d${i}`, `q${i}`));
  const answers = {};
  many.forEach((d, i) => { answers[d.id] = { noul: 0.99 }; answers[`have__${d.id}`] = { noul: i / 100 }; });
  const { escalate, capped, local } = partition(many, answers, { maxEscalationRate: 0.3 });
  ok(escalate.length === 3, 'the escalation cap is enforced');
  ok(capped.length === 7, 'what the cap turns away is reported, not silently dropped');
  ok(escalate.every((r) => r.have <= Math.min(...capped.map((c) => c.have))),
    'the cap keeps the LEAST supported decisions, not the first ones seen');
  ok(local.length === 7, 'capped decisions are still answered locally');
}

// ------------------------------------------------------------- the choke ---
{
  const row = { decision: decisions[2], answer: { noul: 0.96 }, have: 0.14, confidence: 0.96, reason: 'insufficient_state' };
  const n = narrow(row);
  ok(n.question === decisions[2].ask && n.context === '', 'the narrowed payload carries the question and its slice');
  ok(n.tier1.escalated_because === 'insufficient_state', 'and why tier 1 gave up');
  const big = 'x'.repeat(50_000);
  const rowBig = { ...row, decision: { ...decisions[0], slice: 'D-101 temp=88' } };
  ok(sizeOf(narrow(rowBig)) < sizeOf(big) / 100,
    'the upper tier sees its slice, not the stream tier 1 read');
  ok(!JSON.stringify(n).includes('have__'), 'the self-check plumbing does not leak upstairs');
}

// ----------------------------------------------------------- end to end ----
{
  const calls = { t1: 0, t2: 0, t3: 0 };
  const seenUpstairs = [];
  const state = 'D-101 temp=88\nD-102 temp=51\n' + 'padding '.repeat(2000);
  const r = await runCascade({
    state, decisions,
    tier1: async () => { calls.t1++; return { answers: {
      a: { noul: 0.99 }, have__a: { noul: 0.98 },
      b: { noul: 0.98 }, have__b: { noul: 0.99 },
      c: { noul: 0.96 }, have__c: { noul: 0.14 },
    } }; },
    tier2: async (p) => { calls.t2++; seenUpstairs.push(p); return { answer: null, sufficient: false }; },
    tier3: async () => { calls.t3++; return { answer: false, sufficient: true }; },
  });
  ok(calls.t1 === 1, 'tier 1 is called exactly once for the whole batch');
  ok(calls.t2 === 1 && calls.t3 === 1, 'only the escalated decision reaches tiers 2 and 3');
  ok(r.stats.handled_locally === 2 && r.stats.escalated === 1, 'the stats match the split');
  ok(r.resolved.length === 3, 'every decision comes back resolved');
  ok(r.resolved.find((x) => x.decision.id === 'c').tier === 3, 'tier 2 passing the buck reaches tier 3');
  ok(r.resolved.filter((x) => x.tier === 1).length === 2, 'the rest never left tier 1');
  ok(r.stats.choke_ratio < 0.05, `the upper tiers saw under 5% of tier 1's bytes (got ${r.stats.choke_ratio.toFixed(4)})`);
  ok(!JSON.stringify(seenUpstairs).includes('padding'), 'the padded stream never reached tier 2');
}
{
  // tier 2 answering confidently must NOT wake tier 3
  let t3 = 0;
  const r = await runCascade({
    state: 's', decisions,
    tier1: async () => ({ answers: { a: { noul: 0.99 }, have__a: { noul: 0.98 }, b: { noul: 0.99 }, have__b: { noul: 0.98 }, c: { noul: 0.9 }, have__c: { noul: 0.1 } } }),
    tier2: async () => ({ answer: true, sufficient: true }),
    tier3: async () => { t3++; return { answer: true }; },
  });
  ok(t3 === 0, 'a confident tier 2 ends the climb');
  ok(r.stats.tier3_calls === 0 && r.stats.tier2_calls === 1, 'and the call counts say so');
}
{
  // a throwing tier 2 must fall through, not take the run down
  const r = await runCascade({
    state: 's', decisions: [D('a', 'q')],
    tier1: async () => ({ answers: { a: { noul: 0.9 }, have__a: { noul: 0.1 } } }),
    tier2: async () => { throw new Error('502 from the cheap one'); },
    tier3: async () => ({ answer: true, sufficient: true }),
  });
  ok(r.resolved[0].tier === 3, 'a failing tier 2 escalates rather than losing the decision');
  ok(/502/.test(JSON.stringify(r.resolved[0].tier2)), 'and the failure is kept for the log');
}
{
  // no tier 3 configured: tier 2 is the end of the line, nothing hangs
  const r = await runCascade({
    state: 's', decisions: [D('a', 'q')],
    tier1: async () => ({ answers: { a: { noul: 0.9 }, have__a: { noul: 0.1 } } }),
    tier2: async () => ({ answer: true, sufficient: false }),
  });
  ok(r.resolved[0].tier === 2 && r.stats.tier3_calls === 0, 'without a tier 3, tier 2 is final');
}

if (failures.length) {
  console.error(`✗ cascade selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ cascade selftest: ${passed} checks passed`);
