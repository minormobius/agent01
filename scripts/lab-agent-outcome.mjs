#!/usr/bin/env node
// lab-agent-outcome.mjs — why did the build agent stop?
//
//   node scripts/lab-agent-outcome.mjs /tmp/agent.jsonl
//
// WHY THIS EXISTS. The harness had exactly two theories about a failed agent —
// "it tripped a check" and "it ran out of time" — and told the requester the
// second one whenever the step exited non-zero. On 2026-07-29 two builds died
// in three and a half minutes each, against a twenty-minute cap, and both
// requesters were told:
//
//     "it ran out of time before it had anything to show. a smaller ask
//      usually lands"
//
// Every clause of that was false. The agent had not run out of time; it had
// not had anything to show because IT NEVER GOT A TURN. The model API answered
// 529 Overloaded ten times over three minutes, the client exhausted its
// retries, and the run ended with num_turns:1 and zero output tokens. A smaller
// ask would have failed identically.
//
// That is the same failure this repo keeps finding in its own controls: a
// default branch wearing the costume of a diagnosis. Nobody reading that reply
// could tell an overloaded server from an over-ambitious request, and one of
// those is the requester's problem while the other is emphatically not.
//
// So the agent's own report gets read. `claude -p --output-format stream-json`
// ends with a result object carrying terminal_reason, api_error_status,
// num_turns and usage — everything needed to tell these apart, sitting in a
// file the harness was throwing away.

import { readFileSync } from 'node:fs';

/** @typedef {'ok'|'api'|'limit'|'timeout'|'error'} Kind */

/** Classify from the stream-json transcript. Pure, so the selftest can drive it
 *  with lines captured from the real failure.
 * @param {string} text @param {{stepFailed?: boolean}} [opts] */
export function classify(text, { stepFailed = true } = {}) {
  /** @type {any[]} */
  const events = [];
  for (const line of String(text ?? '').split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { events.push(JSON.parse(s)); } catch { /* a partial line is not a fact */ }
  }
  const result = [...events].reverse().find((e) => e.type === 'result');
  const rate = [...events].reverse().find((e) => e.type === 'rate_limit_event');

  // NO RESULT LINE AT ALL means the process was killed before it could write
  // one — which is what a step timeout looks like from in here. An agent that
  // finishes always emits it, even when it finishes badly.
  if (!result) {
    return {
      kind: stepFailed ? /** @type {Kind} */ ('timeout') : /** @type {Kind} */ ('ok'),
      retryable: false,
      turns: 0,
      detail: stepFailed ? 'no result line — the agent was killed mid-run' : 'no transcript',
      rateLimit: rate?.rate_limit_info ?? null,
    };
  }

  const turns = Number(result.num_turns ?? 0);
  const status = Number(result.api_error_status ?? 0);
  const terminal = String(result.terminal_reason ?? '');
  const base = { turns, rateLimit: rate?.rate_limit_info ?? null };

  if (terminal === 'api_error' || status >= 500) {
    // 529 is the service saying "not now". It is not a statement about the
    // request, so it is the one failure worth simply doing again.
    return { ...base, kind: /** @type {Kind} */ ('api'), retryable: true,
      detail: `the model API returned ${status || 'an error'} and the client gave up retrying` };
  }
  if (status === 429 || /rate.?limit|usage.?limit/i.test(terminal)) {
    // Retrying immediately would spend the same exhausted budget, so this one
    // is explicitly NOT retryable.
    return { ...base, kind: /** @type {Kind} */ ('limit'), retryable: false,
      detail: 'the account is out of model capacity for now' };
  }
  if (!result.is_error && !stepFailed) {
    return { ...base, kind: /** @type {Kind} */ ('ok'), retryable: false, detail: 'finished normally' };
  }
  return { ...base, kind: /** @type {Kind} */ ('error'), retryable: false,
    detail: String(result.result ?? (terminal || 'the agent stopped early')).slice(0, 200) };
}

/** One line for a stranger's Bluesky replies. No jargon, no status codes, and
 *  never an implied accusation that their request was the problem when it
 *  was not. */
export function requesterReason(kind, { salvaged = false } = {}) {
  // A SALVAGED PAGE CHANGES THE SENTENCE, NOT JUST THE TONE. Saying "the build
  // never started" next to a published URL is the same species of wrong as the
  // message this file exists to replace — the requester can see the page.
  if (salvaged) {
    return kind === 'timeout'
      ? 'it ran out of build time, so I shipped what it had. reply to keep going'
      : 'the build stopped early, so I shipped what it had. reply and I will pick it up';
  }
  switch (kind) {
    case 'api': return 'the model service was overloaded and the build never started. nothing to do with your request — reply and I will run it again';
    case 'limit': return 'the factory is out of model capacity for the moment. nothing to do with your request — try again a bit later';
    case 'timeout': return 'it ran out of time before it had anything to show. a smaller ask usually lands';
    default: return 'the build stopped early and left nothing to publish. reply and I will try again';
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  // `--reason <kind> [--salvaged]` prints the GITHUB_OUTPUT line the workflow
  // appends. Emitted from here rather than written inline in YAML so the
  // sentence a stranger reads is the one the selftest asserts on.
  const ri = process.argv.indexOf('--reason');
  if (ri !== -1) {
    const kind = process.argv[ri + 1] ?? 'error';
    console.log(`reason=${requesterReason(kind, { salvaged: process.argv.includes('--salvaged') })}`);
    process.exit(0);
  }
  const file = process.argv[2];
  const stepFailed = process.argv[3] !== 'success';
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { /* absent transcript is itself a signal */ }
  const c = classify(text, { stepFailed });
  console.log(`kind=${c.kind}`);
  console.log(`retryable=${c.retryable}`);
  console.log(`turns=${c.turns}`);
  console.log(`detail=${c.detail}`);
  if (c.rateLimit) {
    const u = Math.round((c.rateLimit.utilization ?? 0) * 100);
    console.log(`ratelimit=${c.rateLimit.rateLimitType} ${u}% (${c.rateLimit.status})`);
  }
}
