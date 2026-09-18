// ask.mjs — what the lab actually asks Jev, and how it reads the answer.
//
// Three questions per decision, one call. The shapes are not arbitrary:
//
//   action      a CHOICE over exactly buy/hold/sell/bail, so the reply can
//               never be an action the book cannot execute.
//   have_state  the escalation primitive. Measured: reading the ANSWER's
//               confidence separated answerable from unanswerable by 0.0
//               points, while asking "is the information here?" separated
//               them by 62. So the gate reads this, never the confidence.
//   regime      a CHOICE describing what is observably happening NOW. Jev
//               scored 69% on exactly this kind of determinate call with no
//               training data, beating a fitted model out of sample. It is
//               never asked what happens next — asked to call direction it
//               returned 0.36-0.60 across the board, which is the honest
//               answer and the reason this page does not ask.

export const ENDPOINT = '/jev/api/ask';

// Measured, not assumed. The same five states, one call, two framings:
//
//   "what should the paper position do?"        hold x5, confidence 0.46-0.79
//   "which stance matches what the tape does?"  sell x5, confidence 0.70-0.96
//
// Taker skew was -0.89 to -0.98 on every one of those windows — the tape was
// being sold hard — so "sell" is the correct DESCRIPTION and "hold" is a
// refusal. Asked to weigh a trade it declines, because weighing a trade is a
// prediction and it does not make those. Asked to classify what is in front
// of it, it answers confidently and correctly, which is exactly where it
// beat a fitted model out of sample with no training data.
//
// So the question asks for a STANCE, and the harness — not the model — owns
// what that costs to act on. The caller computes; the model decides.
export const ACTION_CRITERIA = {
  buy: 'The tape is observably being bought and holding it: efficiency high with an upward net move, more bars up than down, aggressors lifting the offer.',
  sell: 'The tape is observably being sold and holding it: efficiency high with a downward net move, more bars down than up, aggressors hitting the bid.',
  hold: 'Nothing observable has changed since the last look: the picture is the same one that produced the current stance.',
  bail: 'Conditions are observably unfit to carry any position: churn with no direction, or a spread wide relative to the movement on offer.',
};

export const REGIME_CRITERIA = {
  trending_up: 'Price is moving up and holding the move: high efficiency, most bars up, buying aggressors.',
  trending_down: 'Price is moving down and holding the move: high efficiency, most bars down, selling aggressors.',
  ranging: 'Churn that goes nowhere: low efficiency, the range travelled far exceeds the net move.',
  volatile_directionless: 'Large moves in both directions with no net progress: high volatility, low efficiency, mixed flow.',
  quiet: 'Little movement of any kind: low volatility, small range, thin flow.',
};

export function buildQuestions() {
  return {
    action: { type: 'choice',
      instructions: 'Which of these stances MATCHES what the market is observably doing right now? ' +
        'This is a description of the tape in front of you, not a forecast. Pick the one the figures fit best.',
      criteria: ACTION_CRITERIA },
    // TWO availability questions, because measuring them separately produced
    // the sharpest result this surface has. Against one real state document:
    //
    //   are the figures present and readable?              0.95
    //   enough to judge whether a change beats its cost?   0.84   <- gates
    //   enough to decide what the position should do?      0.24
    //   enough to know which way the price goes next?      0.06
    //
    // That is not a wording artefact; it is the model cleanly separating
    // "the data is here" from "this is not decidable". So the gate reads
    // have_figures, which is a genuine availability check the state can
    // satisfy, and have_decidable is displayed and never gates — it is the
    // most honest number on the page and hiding it would be the whole
    // dishonesty of trading demos in one move.
    have_figures: { type: 'noul',
      instructions: 'Does the state above contain the market figures it refers to — spread, volatility, range, ' +
        'efficiency, taker flow, funding — well enough to judge whether changing the position is worth its ' +
        'stated cost? Answer about the AVAILABILITY of those figures, not about which way to trade.' },
    have_decidable: { type: 'noul',
      instructions: 'Consider the question of what the paper position should do right now. Does the state above ' +
        'actually contain the information needed to decide it? Answer about the AVAILABILITY of the information, ' +
        'not about the decision itself.' },
    regime: { type: 'choice',
      instructions: 'Which of these describes what the market has been doing over the last minute? ' +
        'This is a description of what has already happened, not a forecast.',
      criteria: REGIME_CRITERIA },
  };
}

export const GATE = {
  // Below this, the state is judged insufficient and the lab does not act on
  // the answer. 0.5 is the midpoint of the 62-point gulf that was measured.
  haveThreshold: 0.5,
  // Hysteresis. The delve loop dithered on a bare threshold until it was
  // latched; here every flip costs fee plus half spread, so it matters more.
  // A NEW position needs this much confidence; keeping one needs only `exit`.
  //
  // These are exposed as a control on the page rather than tuned in private.
  // Measured action confidences sit around 0.4-0.6, so the bar decides how
  // often the lab acts at all — which makes it exactly the kind of knob that
  // should be visible, and counted as a trial when you move it.
  enter: 0.55,
  exit: 0.40,
};

/**
 * Turn a reply into something the book can execute, applying the gate and
 * the latch. Returns the action plus exactly why it was chosen, so the page
 * can show the reason rather than just the outcome.
 */
export function decide(answers, current, gate = GATE) {
  const a = answers?.action, reg = answers?.regime;
  // Back-compat with the single-self-check shape the selftest also covers.
  const have = answers?.have_figures?.noul ?? answers?.have_state?.noul;
  const decidable = answers?.have_decidable?.noul;
  if (!a?.choice) return { action: 'hold', reason: 'no answer from the model', blocked: true, decidable };
  if (typeof have !== 'number') return { action: 'hold', reason: 'no self-check returned', blocked: true, decidable };
  if (have < gate.haveThreshold) {
    return { action: 'hold', reason: `state insufficient (${have.toFixed(2)}) — escalate, do not act`,
      blocked: true, have, decidable, regime: reg?.choice };
  }
  const conf = a.confidence ?? 0;
  const wanted = a.choice;
  const holdingSame = (wanted === 'buy' && current > 0) || (wanted === 'sell' && current < 0);
  const needed = holdingSame ? gate.exit : gate.enter;
  if (wanted !== 'hold' && wanted !== 'bail' && conf < needed) {
    return { action: 'hold', reason: `${wanted} at ${conf.toFixed(2)} is under the ${holdingSame ? 'keep' : 'enter'} bar of ${needed}`,
      blocked: true, have, decidable, confidence: conf, regime: reg?.choice };
  }
  return { action: wanted, reason: `${wanted} at ${conf.toFixed(2)}`, have, decidable, confidence: conf,
    regime: reg?.choice, regimeConfidence: reg?.confidence };
}

export async function ask(state, { endpoint = ENDPOINT, signal } = {}) {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ state, questions: buildQuestions() }),
  });
  const body = await res.json().catch(() => ({ error: 'unparseable reply' }));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}
