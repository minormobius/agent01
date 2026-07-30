#!/usr/bin/env node
// lab-agent-outcome.selftest.mjs
//
// THE FIXTURES ARE THE REAL FAILURE, copied out of run 30490354053's log — the
// build for @minormobius's odyssey-trail, which died in 3m27s against a
// 20-minute cap and told them "it ran out of time... a smaller ask usually
// lands". The numbers below are what the agent actually reported: num_turns 1,
// zero output tokens, terminal_reason api_error, api_error_status 529, after
// ten 529s over three minutes.
//
// Pinning the real transcript matters more than pinning an invented one: the
// bug was never in the shell that printed the message, it was in nobody having
// read what the agent said before deciding what to tell a stranger.

import assert from 'node:assert/strict';
import { classify, requesterReason } from './lab-agent-outcome.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

const RATE_WARN = JSON.stringify({
  type: 'rate_limit_event',
  rate_limit_info: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.85, surpassedThreshold: 0.75 },
});
const OVERLOADED_RESULT = JSON.stringify({
  is_error: true, num_turns: 1, session_id: 'x', total_cost_usd: 0.005732,
  terminal_reason: 'api_error', api_error_status: 529, subtype: 'success',
  result: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
  type: 'result', duration_ms: 205500,
});
const OK_RESULT = JSON.stringify({
  is_error: false, num_turns: 23, terminal_reason: 'end_turn', subtype: 'success',
  type: 'result', result: 'Built the site.', duration_ms: 190000,
});

t('the real 529 transcript is an API failure, and it is retryable', () => {
  const c = classify(`{"type":"system","subtype":"init"}\n${RATE_WARN}\n${OVERLOADED_RESULT}`);
  assert.equal(c.kind, 'api');
  assert.equal(c.retryable, true);
  assert.equal(c.turns, 1, 'one turn means it never got to work');
  assert.match(c.detail, /529/);
});

// THE WHOLE POINT. This is the sentence two strangers were sent.
t('it does NOT tell the requester they asked for too much', () => {
  const c = classify(OVERLOADED_RESULT);
  const msg = requesterReason(c.kind);
  assert.doesNotMatch(msg, /smaller ask/, 'a 529 is not the requester asking for too much');
  assert.doesNotMatch(msg, /ran out of time/, 'it did not run out of time — it ran for 3 of 20 minutes');
  assert.match(msg, /nothing to do with your request/);
});

t('the rate-limit warning rides along even when it did not cause the failure', () => {
  const c = classify(`${RATE_WARN}\n${OVERLOADED_RESULT}`);
  assert.equal(c.rateLimit.rateLimitType, 'seven_day');
  assert.equal(c.rateLimit.utilization, 0.85);
  // 529 is the server being busy; the seven-day meter is a separate fact and
  // conflating them would send the operator chasing the wrong thing.
  assert.equal(c.kind, 'api', 'a warning is not the cause');
});

t('an exhausted account is NOT retryable — the retry would spend the same nothing', () => {
  const c = classify(JSON.stringify({
    is_error: true, num_turns: 1, type: 'result', terminal_reason: 'rate_limit', api_error_status: 429,
  }));
  assert.equal(c.kind, 'limit');
  assert.equal(c.retryable, false);
  assert.match(requesterReason('limit'), /try again a bit later/);
});

// A step timeout kills the process, so there is no result line to read. That
// absence is the signal, and it is the ONLY case where "ran out of time" is
// the honest thing to say.
t('a killed agent leaves no result line, and that is what a timeout looks like', () => {
  const c = classify('{"type":"system","subtype":"init"}\n{"type":"assistant","message":{}}');
  assert.equal(c.kind, 'timeout');
  assert.equal(c.retryable, false);
  assert.match(requesterReason('timeout'), /ran out of time/);
});

t('a clean finish reads as ok', () => {
  const c = classify(OK_RESULT, { stepFailed: false });
  assert.equal(c.kind, 'ok');
  assert.equal(c.turns, 23);
});

t('a salvaged partial page keeps its own honest message, per kind', () => {
  assert.match(requesterReason('timeout', { salvaged: true }), /ran out of build time, so I shipped/);
  // "the build never started" next to a live URL is the same species of wrong
  // as the message this file replaced — the requester can see the page.
  const api = requesterReason('api', { salvaged: true });
  assert.match(api, /shipped what it had/);
  assert.doesNotMatch(api, /never started/);
});

t('garbage and truncation do not throw — a half-written line is not a fact', () => {
  assert.equal(classify('').kind, 'timeout');
  assert.equal(classify('not json at all').kind, 'timeout');
  // A stream cut mid-line must not be parsed as a result.
  assert.equal(classify(`{"type":"result","terminal_rea`).kind, 'timeout');
  assert.equal(classify(undefined).kind, 'timeout');
});

t('the LAST result line wins, so a retry inside the step is what counts', () => {
  const c = classify(`${OVERLOADED_RESULT}\n${OK_RESULT}`, { stepFailed: false });
  assert.equal(c.kind, 'ok', 'the successful retry is the outcome, not the first attempt');
});

console.log(`\nlab-agent-outcome.selftest: ${n} checks passed`);
