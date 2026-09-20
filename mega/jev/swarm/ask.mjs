// ask.mjs — one call, one global state, one question per particle.
//
// THIS IS THE SWARM SHAPE THE CONCEPT PILE ASKED FOR, and the cost model is
// the whole point. Breadth is free only when the questions SHARE a state; a
// swarm is the case where each agent has its own. So the arrangement under
// test is (a): ONE call carrying every particle's slice as one document, with
// N questions each addressing its own row by index. The alternative (b) — N
// calls with one slice each — is 256 calls per tick and is not run here. Say
// that plainly rather than implying the comparison was made.
//
// Addressing rows by index is already known to work: the calibration run put
// 24 items in a state array and asked questions "about the item whose index
// is 7", and the indexing was perfect at n=1024.

import { TURN_WORDS } from './swarm.mjs';

/**
 * The state: every particle's own reading, already reduced to what it steers
 * on. The caller computes; the model decides.
 *
 * The four raw body-frame projections are NOT sent. What a particle acts on
 * is the asymmetry between its two sensors, and that is a subtraction — so
 * the harness does it, per the rule this surface has relearned six times.
 * Ahead / left / right strengths plus the signed difference, which is the
 * quantity the decision actually turns on.
 */
export function swarmDoc(senses, { note = '' } = {}) {
  const rows = senses.map(({ s }, i) => {
    const ahead = (s.sig[0] + s.sig[2]) / 2;
    const left = s.sig[0], right = s.sig[2];
    const diff = left - right;
    const n = (x) => (Math.abs(x) < 1000 ? x.toFixed(2) : x.toExponential(1));
    return `${String(i).padStart(3)}  ${n(left).padStart(9)} ${n(right).padStart(9)} ` +
      `${n(diff).padStart(9)} ${n(ahead).padStart(9)}`;
  });
  return [
    'A SWARM OF PARTICLES MOVING OVER A SHARED TRAIL FIELD.',
    '',
    'Every particle leaves a trail as it moves. The trails fade and spread.',
    'No particle can see any other particle — each one senses only the trail',
    'field, at two points ahead of itself, one off to its left and one off to',
    'its right. Those two readings are all it has.',
    '',
    'Below, one row per particle. LEFT and RIGHT are how strong the trail is',
    'at that particle\'s own left and right sensor, in its own frame. DIFF is',
    'LEFT minus RIGHT, so a positive DIFF means there is more trail to its',
    'left. AHEAD is the mean of the two.',
    '',
    `  id       left     right      diff     ahead`,
    ...rows,
    note ? `\n${note}` : '',
  ].join('\n');
}

/** One `score` over the turn ladder per particle, addressed by its row. */
export function swarmQuestions(senses, instruction) {
  const qs = {};
  for (let i = 0; i < senses.length; i++) {
    qs[`p${i}`] = { type: 'score', criteria: TURN_WORDS,
      instructions: `${instruction} This question is about the particle whose id is ${i}.` };
  }
  return qs;
}

/**
 * The two framings, and the difference between them is the experiment.
 *
 * MIMIC gives no goal at all — it asks what this particle should do, which is
 * the question the deterministic brain implicitly answers. GOAL states an
 * objective the swarm might have. Neither is told what the rule does, because
 * handing over the rule would make agreement with the rule a tautology.
 */
export const FRAMINGS = {
  mimic: 'Which way should this particle turn, given what its sensors read?',
  goal: 'This particle should move so the swarm forms strong, lasting trails rather than scattering. Which way should it turn?',
};

/** Score (0..4 over the rungs) back to a turn in [-1, 1]. */
export const turnFromScore = (score, rungs) => {
  const s = Math.max(0, Math.min(rungs.length - 1, score));
  const lo = Math.floor(s), hi = Math.min(rungs.length - 1, lo + 1);
  return rungs[lo] + (rungs[hi] - rungs[lo]) * (s - lo);
};
