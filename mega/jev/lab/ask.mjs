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

import { exposureFromScore, applyDeadband } from './book.mjs';

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

// The exposure ladder, as an ORDERED array — which is what `score` takes,
// and the ordering is the whole point: leverage has a direction and a
// magnitude, and a `choice` throws the ordering away. Measured on six real
// states, `choice` over these same seven quanta answered the extreme -3x on
// five of them while the ladder graded them -2.8x to -1.7x.
export const EXPOSURE_LEVELS = [
  'Maximum short: the tape is being sold hard and holding it — heavy selling flow, high efficiency downward.',
  'Moderate short: selling clearly has the upper hand, but not overwhelmingly.',
  'Light short: a mild downward lean, enough to tilt but not to commit.',
  'Flat: no side has the upper hand, or conditions are too unclear or too costly to carry exposure at all.',
  'Light long: a mild upward lean, enough to tilt but not to commit.',
  'Moderate long: buying clearly has the upper hand, but not overwhelmingly.',
  'Maximum long: the tape is being bought hard and holding it — heavy buying flow, high efficiency upward.',
];

export function buildQuestions() {
  return {
    exposure: { type: 'score',
      instructions: 'Which level of exposure MATCHES what the market is observably doing right now? ' +
        'This describes the tape in front of you, not a forecast. Pick the level the figures fit best.',
      criteria: EXPOSURE_LEVELS },
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
  // How far the ladder target must sit from the current position before it
  // is worth the trip. This REPLACES the old confidence latch: with a
  // continuous target, a wobble of 1.4 → 1.6 → 1.3 would resize on nothing
  // and pay for it every time. Going flat is exempt — getting out stays
  // cheap.
  deadband: 0.35,
  // The ceiling. The ladder is what makes this enforceable: Jev cannot
  // return a level off the end of the array, so it cannot ask for more.
  cap: 3,
};

/**
 * Turn a reply into a target exposure the book can carry, applying the gate
 * and the deadband. Returns the number plus exactly why, so the page can
 * show the reason rather than just the outcome.
 *
 * Note what is deliberately NOT done: the target is never scaled down by the
 * score's confidence. The score is already the expectation over the whole
 * distribution, so a hedged read has ALREADY been pulled toward the middle
 * of the ladder — which is flat. Scaling it again by confidence would count
 * the same uncertainty twice. A bimodal read (mass at both extremes) lands
 * near flat for the same reason, which is the right answer for sizing.
 */
export function decide(answers, current, gate = GATE) {
  const g = { ...GATE, ...gate };
  const a = answers?.action, reg = answers?.regime, sc = answers?.exposure;
  const have = answers?.have_figures?.noul ?? answers?.have_state?.noul;
  const decidable = answers?.have_decidable?.noul;
  const base = { have, decidable, regime: reg?.choice, stance: a?.choice,
    confidence: sc?.confidence ?? a?.confidence, score: sc?.score };

  if (typeof sc?.score !== 'number' && !a?.choice) {
    return { ...base, action: 'hold', exposure: current, reason: 'no answer from the model', blocked: true };
  }
  if (typeof have !== 'number') {
    return { ...base, action: 'hold', exposure: current, reason: 'no self-check returned', blocked: true };
  }
  if (have < g.haveThreshold) {
    return { ...base, action: 'hold', exposure: current,
      reason: `state insufficient (${have.toFixed(2)}) — escalate, do not act`, blocked: true };
  }

  const raw = typeof sc?.score === 'number'
    ? exposureFromScore(sc.score, g.cap)
    : targetExposureFromStance(a.choice, current, g.cap);
  const target = applyDeadband(raw, current, g.deadband);
  const moved = target !== current;

  return { ...base,
    exposure: target,
    action: labelFor(target, current),
    reason: moved
      ? `ladder ${sc?.score != null ? sc.score.toFixed(2) : '—'} → ${target.toFixed(2)}x`
      : `ladder ${sc?.score != null ? sc.score.toFixed(2) : '—'} → ${raw.toFixed(2)}x, inside the ${g.deadband} deadband`,
    blocked: !moved && Math.abs(raw - current) > 1e-9,
  };
}

/** Fallback when only the categorical stance came back. */
function targetExposureFromStance(stance, current, cap) {
  if (stance === 'buy') return cap;
  if (stance === 'sell') return -cap;
  if (stance === 'bail') return 0;
  return current;
}

/** The mark on the price chart: what this decision DID, not what it wanted. */
function labelFor(target, current) {
  if (target === current) return 'hold';
  if (target === 0) return 'bail';
  return target > current ? 'buy' : 'sell';
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
