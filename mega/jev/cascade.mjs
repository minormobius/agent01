// cascade.mjs — a three-tier decision router.
//
// Tier 1 is Jev: fast, cheap, decision-only, and — measured — able to say
// when the state does not contain what a decision needs, but ONLY if you ask
// it as its own question. Tier 2 is a cheap chat model. Tier 3 is the
// expensive one. Work falls through only as far as it has to.
//
// The measurements this is built on are in CLAUDE.md, but two of them decide
// the whole shape of this file:
//
//   1. Reading the confidence of Jev's ANSWER is not an escalation signal.
//      Asked about devices absent from the state entirely, it answered at
//      94-97% confidence, 15/15 above a 0.9 gate. Separation margin: 0.0
//      points. Asking "is the information here?" as a separate question
//      separated the same classes by 62 points. So every decision is sent as
//      TWO questions and the routing reads the second one.
//
//   2. Breadth is free — 1024 questions against one state in 549 ms — so
//      doubling the question count to carry the self-check costs nothing.
//      That is the only reason this design is affordable.
//
// This module is pure: it builds requests and partitions answers. The
// callers inject the three transports, so it is testable with no network and
// carries no keys.

export const DEFAULTS = {
  // Route on the self-check, at the midpoint. Measured: answerable items
  // landed at 0.98-0.99 and unanswerable ones at 0.02-0.36, so anywhere in
  // that gulf works and the midpoint is the least arbitrary choice.
  haveThreshold: 0.5,
  // A second, weaker guard on the answer itself. It is NOT the routing
  // signal — it cannot be, per (1) above — but a decision the model is
  // openly unsure of is still worth a better opinion when one is cheap.
  confThreshold: 0.75,
  // Stop a runaway: at most this share of a batch may leave tier 1.
  maxEscalationRate: 0.6,
  // How many escalations may be in flight at once. Bounded rather than
  // unlimited so a large batch cannot open 200 sockets to a rate-limited
  // upper tier and turn a latency win into a wall of 429s.
  concurrency: 6,
  // A hard ceiling on how many decisions may reach the top tier in one
  // batch. Measured the hard way: 30 escalations reaching claude-opus-5 at
  // once returned 429 on all 30, so the cascade's real throughput ceiling is
  // the expensive tier's rate limit, not tier 1's speed. Past the budget a
  // decision keeps tier 2's answer and is marked, rather than failing.
  tier3Budget: Infinity,
};

const SELF_CHECK_PREFIX = 'have__';

/** True for a question id this module generated rather than the caller. */
export const isSelfCheck = (id) => id.startsWith(SELF_CHECK_PREFIX);

/**
 * Build the tier-1 request: every decision twice, once as itself and once as
 * "do I have what I need for this?".
 *
 * @param {Array<{id:string, ask:string, criteria?:object}>} decisions
 * @returns {object} questions, keyed for the Jev API
 */
export function buildCascadeQuestions(decisions) {
  if (!Array.isArray(decisions) || !decisions.length) throw new Error('cascade: no decisions');
  const questions = {};
  for (const d of decisions) {
    if (!d?.id || !d?.ask) throw new Error(`cascade: decision needs {id, ask}`);
    if (isSelfCheck(d.id)) throw new Error(`cascade: "${SELF_CHECK_PREFIX}" is reserved (${d.id})`);
    if (questions[d.id]) throw new Error(`cascade: duplicate decision id ${d.id}`);

    questions[d.id] = d.criteria
      ? { type: 'choice', instructions: d.ask, criteria: d.criteria }
      : { type: 'noul', instructions: d.ask };

    // Deliberately worded to ask about AVAILABILITY, not about the question.
    // Without that last clause it drifts into answering the question again.
    questions[SELF_CHECK_PREFIX + d.id] = {
      type: 'noul',
      instructions: `Consider this question: "${d.ask}" Does the state above actually contain the ` +
        `information needed to answer it? Answer about the AVAILABILITY of the information, ` +
        `not about the question itself.`,
    };
  }
  return questions;
}

/** Confidence of an answer, whatever its type. */
export function confidenceOf(answer) {
  if (!answer) return 0;
  if (typeof answer.confidence === 'number') return answer.confidence;
  if (typeof answer.noul === 'number') return Math.max(answer.noul, 1 - answer.noul);
  return 0;
}

/**
 * Split a tier-1 response into what tier 1 keeps and what goes upstairs.
 *
 * A decision escalates when the self-check says the information is not there,
 * when either answer is missing, or when the answer's own confidence is low.
 * `maxEscalationRate` then trims the queue by ascending self-check score, so
 * a batch that goes badly wrong costs a bounded amount rather than an
 * unbounded one — the worst cases still get the better model.
 */
export function partition(decisions, answers, opts = {}) {
  const { haveThreshold, confThreshold, maxEscalationRate } = { ...DEFAULTS, ...opts };
  const rows = decisions.map((d) => {
    const answer = answers?.[d.id];
    const have = answers?.[SELF_CHECK_PREFIX + d.id]?.noul;
    const conf = confidenceOf(answer);
    let reason = null;
    if (answer == null) reason = 'no_answer';
    else if (typeof have !== 'number') reason = 'no_self_check';
    else if (have < haveThreshold) reason = 'insufficient_state';
    else if (conf < confThreshold) reason = 'low_confidence';
    return { decision: d, answer, have: typeof have === 'number' ? have : 0, confidence: conf, reason };
  });

  let escalate = rows.filter((r) => r.reason);
  // At least one may always go up: floor(1 * 0.6) is 0, and a cap that makes
  // a single-decision batch unescalatable would silently disable the whole
  // mechanism at small sizes.
  const cap = Math.max(1, Math.floor(rows.length * maxEscalationRate));
  let capped = [];
  if (escalate.length > cap) {
    // Keep the least-supported ones; the rest are answered locally and said
    // so, which is more honest than silently dropping the cap.
    escalate.sort((a, b) => a.have - b.have || a.confidence - b.confidence);
    capped = escalate.slice(cap);
    escalate = escalate.slice(0, cap);
  }
  const escalateIds = new Set(escalate.map((r) => r.decision.id));
  const local = rows.filter((r) => !escalateIds.has(r.decision.id));
  return { local, escalate, capped, rows };
}

/**
 * The choke. Everything an upper tier is told about one decision, and
 * nothing else — its own question and its own slice of state, never the
 * whole stream tier 1 read.
 */
export function narrow(row) {
  const d = row.decision;
  return {
    id: d.id,
    question: d.ask,
    context: d.slice ?? '',
    ...(d.criteria ? { options: Object.keys(d.criteria) } : {}),
    tier1: {
      answered: row.answer ?? null,
      state_sufficient: row.have,
      escalated_because: row.reason,
    },
  };
}

/** Bytes a payload costs, for the choke ratio a run reports. */
export const sizeOf = (x) => new TextEncoder().encode(typeof x === 'string' ? x : JSON.stringify(x)).length;

/**
 * Run the whole cascade.
 *
 * Transports are injected. `tier1` takes (state, questions) and returns the
 * Jev response. `tier2`/`tier3` take one narrowed payload and return
 * `{answer, sufficient}` — `sufficient: false` is how a middle tier passes
 * the buck upward. A missing tier3 means tier 2 is the end of the line.
 */
export async function runCascade({ state, decisions, tier1, tier2, tier3, options = {} }) {
  const questions = buildCascadeQuestions(decisions);
  const { concurrency, tier3Budget } = { ...DEFAULTS, ...options };
  let tier3Left = tier3Budget;
  const t0 = Date.now();
  const res = await tier1(state, questions);
  const tier1Ms = Date.now() - t0;

  const { local, escalate, capped, rows } = partition(decisions, res?.answers || {}, options);
  const stats = {
    decisions: decisions.length,
    handled_locally: local.length,
    escalated: escalate.length,
    capped: capped.length,
    tier1_ms: tier1Ms,
    tier1_bytes: sizeOf(state) + sizeOf(questions),
    upper_bytes: 0,
    tier2_calls: 0,
    tier3_calls: 0,
    tier3_declined: 0,
  };

  const resolved = local.map((r) => ({ ...r, tier: 1, final: r.answer }));

  // Escalations run concurrently, bounded. They are independent by
  // construction — each carries only its own slice — and the first real run
  // spent 30 of its 32.7 seconds walking them one at a time. A reactive tier
  // whose escalation path is serial is not reactive.
  const climb = async (row) => {
    const payload = narrow(row);
    stats.upper_bytes += sizeOf(payload);
    let out = null;
    if (tier2) {
      stats.tier2_calls++;
      out = await tier2(payload).catch((e) => ({ error: String(e?.message || e) }));
    }
    if (tier3 && (!out || out.error || out.sufficient === false)) {
      if (tier3Left <= 0) {
        stats.tier3_declined++;
        return { ...row, tier: tier2 ? 2 : 1, final: out, tier3_budget_exhausted: true };
      }
      tier3Left--;
      stats.tier3_calls++;
      const up = await tier3(payload).catch((e) => ({ error: String(e?.message || e) }));
      return { ...row, tier: 3, final: up, tier2: out };
    }
    return { ...row, tier: tier2 ? 2 : 1, final: out };
  };

  const queue = [...escalate];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    for (let row = queue.shift(); row; row = queue.shift()) resolved.push(await climb(row));
  });
  await Promise.all(workers);
  for (const row of capped) resolved.push({ ...row, tier: 1, final: row.answer, capped: true });

  // What the choke actually bought: the upper tiers saw this share of the
  // bytes tier 1 read. Reported rather than assumed.
  stats.choke_ratio = stats.tier1_bytes ? stats.upper_bytes / stats.tier1_bytes : 0;
  stats.total_ms = Date.now() - t0;
  return { resolved, stats, rows };
}
