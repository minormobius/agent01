// game.js — the duel. Watch a puppet dance, then reproduce the strings.
//
// Three phases, and the third is the point:
//
//   WATCH   the rival puppet dances a choreography you have never seen. Yours
//           hangs limp beside it.
//   RECALL  yours is live and the rival is still. You play what you think you
//           saw. There is a count-in, so the two clocks start together.
//   REVIEW  both dance at once — theirs from the recording, yours from what you
//           just played — and you watch them come apart.
//
// SCORING is temporal intersection-over-union, per string, averaged over the
// four. IoU is the right shape here because it penalises the two errors that
// matter in the same currency: pulling a string you should not have (union
// grows) and holding one for the wrong length (intersection shrinks). A player
// who gets every string right but every duration wrong should not score well,
// and one who gets the shape right and the timing slightly off should not be
// wiped out — IoU does both.
//
// It is scored at the BEST GLOBAL SHIFT within a quarter of a second. Human
// reaction time is not the skill being tested; remembering which strings moved,
// in what order, for how long, is. A uniform lag is forgiven, a wrong order is
// not, and the shift is small enough that it cannot rescue a bad answer.

import { KEYS, STEP, createPuppet, step, pose, perform, performanceDistance } from './puppet.js';

export { KEYS };

export const DANCE_SECS = 5.0;
export const COUNT_IN_SECS = 3.0;
export const SCORE_HZ = 120;              // grid the IoU is computed on
export const MAX_SHIFT_SECS = 0.25;

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ choreography --
// Difficulty 0..1. It moves three things at once, and they are three different
// KINDS of hard rather than three helpings of the same one:
//
//   how many moves      more to remember
//   how long each one   short pulls read as flicks rather than poses
//   how much they overlap   two strings at once is a compound shape, and a
//                           compound shape is harder to decompose than to see
//
// The third is the one that actually bites, and it is the one the selftest
// watches, because overlap is where separability is most at risk: two strings
// pulled together produce a body lean that neither produces alone.
export function choreograph(seed, difficulty = 0.4) {
  const rng = rngFrom(seed);
  const d = Math.max(0, Math.min(1, difficulty));
  const moves = Math.round(5 + d * 7);
  const holdMin = 0.62 - d * 0.44;
  const holdMax = 1.05 - d * 0.62;
  const overlapChance = 0.10 + d * 0.55;

  const out = [];
  let t = 0.12 + rng() * 0.2;
  let last = -1;
  for (let i = 0; i < moves; i++) {
    let key = (rng() * 4) | 0;
    // Avoid repeating the same string twice in a row at low difficulty: a
    // repeat is nearly invisible when the limb has not fallen back yet, and at
    // easy settings that reads as a bug rather than a challenge.
    if (key === last && d < 0.5) key = (key + 1 + ((rng() * 3) | 0)) % 4;
    last = key;
    const hold = holdMin + rng() * (holdMax - holdMin);
    const start = t;
    const end = Math.min(DANCE_SECS - 0.05, start + hold);
    if (end > start + 0.06) out.push({ key, start, end });
    // The next move either overlaps this one or waits for it.
    if (rng() < overlapChance) t = start + hold * (0.25 + rng() * 0.5);
    else t = end + 0.05 + rng() * (0.34 - d * 0.22);
    if (t > DANCE_SECS - 0.1) break;
  }
  return out;
}

/** A timeline function from a move list: (t) -> four booleans. */
export function heldFrom(moves) {
  return (t) => {
    const h = [false, false, false, false];
    for (const m of moves) if (t >= m.start && t < m.end) h[m.key] = true;
    return h;
  };
}

/** Sample a move list onto the scoring grid: four Uint8Arrays. */
export function gridFrom(moves, secs = DANCE_SECS, hz = SCORE_HZ) {
  const n = Math.round(secs * hz);
  const g = [0, 1, 2, 3].map(() => new Uint8Array(n));
  for (const m of moves) {
    const a = Math.max(0, Math.round(m.start * hz));
    const b = Math.min(n, Math.round(m.end * hz));
    for (let i = a; i < b; i++) g[m.key][i] = 1;
  }
  return g;
}

function iouShifted(a, b, shift) {
  // shift > 0 means b is treated as happening `shift` samples later.
  let inter = 0, union = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const j = i - shift;
    const bv = (j >= 0 && j < n) ? b[j] : 0;
    const av = a[i];
    if (av || bv) union++;
    if (av && bv) inter++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Per-string IoU at the best single global shift, and the mean of the four.
 *  One shift for all four strings, not one each — the strings share a hand and
 *  a clock, and letting each slide independently would forgive an ordering
 *  error, which is precisely the error worth catching. */
export function scoreAgainst(target, played, hz = SCORE_HZ) {
  const A = gridFrom(target, DANCE_SECS, hz);
  const B = gridFrom(played, DANCE_SECS, hz);
  const maxShift = Math.round(MAX_SHIFT_SECS * hz);
  let best = null;
  for (let s = -maxShift; s <= maxShift; s++) {
    const per = [0, 1, 2, 3].map((k) => iouShifted(A[k], B[k], s));
    const mean = per.reduce((x, y) => x + y, 0) / 4;
    if (!best || mean > best.mean) best = { mean, per, shift: s / hz };
  }
  return { accuracy: best.mean, perString: best.per, shiftSecs: best.shift };
}

// ------------------------------------------------------------------ rounds --

export const PHASE = { READY: 'ready', WATCH: 'watch', COUNT: 'count', RECALL: 'recall', REVIEW: 'review' };

export function createDuel(opts = {}) {
  const difficulty = opts.difficulty ?? 0.4;
  const seed = opts.seed ?? 1;
  return {
    seed, difficulty,
    phase: PHASE.READY,
    t: 0,
    target: choreograph(seed, difficulty),
    played: [],
    open: [null, null, null, null],   // strings currently down, by key
    rival: createPuppet(),
    mine: createPuppet(),
    result: null,
    round: 1,
    total: 0, rounds: 0,
  };
}

export function begin(duel) {
  duel.phase = PHASE.WATCH;
  duel.t = 0;
  duel.played = [];
  duel.open = [null, null, null, null];
  duel.rival = createPuppet();
  duel.mine = createPuppet();
  duel.result = null;
  return duel;
}

/** Advance one fixed step. `held` is the player's four booleans, live. */
export function tickDuel(duel, held) {
  const rivalTimeline = heldFrom(duel.target);
  const playedTimeline = heldFrom(duel.played);
  const none = [false, false, false, false];

  duel.t += STEP;

  if (duel.phase === PHASE.WATCH) {
    step(duel.rival, rivalTimeline(duel.t));
    step(duel.mine, none);
    if (duel.t >= DANCE_SECS) {
      duel.phase = PHASE.COUNT;
      duel.t = 0;
      duel.rival = createPuppet();
      duel.mine = createPuppet();
    }
  } else if (duel.phase === PHASE.COUNT) {
    step(duel.rival, none);
    step(duel.mine, none);
    if (duel.t >= COUNT_IN_SECS) {
      duel.phase = PHASE.RECALL;
      duel.t = 0;
      duel.mine = createPuppet();
      duel.open = [null, null, null, null];
    }
  } else if (duel.phase === PHASE.RECALL) {
    // Record edges as intervals while playing them live.
    for (let k = 0; k < 4; k++) {
      if (held[k] && duel.open[k] === null) duel.open[k] = duel.t;
      else if (!held[k] && duel.open[k] !== null) {
        pushMove(duel, k, duel.open[k], duel.t);
        duel.open[k] = null;
      }
    }
    step(duel.mine, held);
    step(duel.rival, none);
    if (duel.t >= DANCE_SECS) {
      for (let k = 0; k < 4; k++) {
        if (duel.open[k] !== null) { pushMove(duel, k, duel.open[k], DANCE_SECS); duel.open[k] = null; }
      }
      duel.result = scoreAgainst(duel.target, duel.played);
      duel.total += duel.result.accuracy;
      duel.rounds++;
      duel.phase = PHASE.REVIEW;
      duel.t = 0;
      duel.rival = createPuppet();
      duel.mine = createPuppet();
    }
  } else if (duel.phase === PHASE.REVIEW) {
    // Both dance: theirs from the score, yours from what you played.
    const tt = duel.t % (DANCE_SECS + 1.0);
    if (tt <= DANCE_SECS) {
      step(duel.rival, rivalTimeline(tt));
      step(duel.mine, playedTimeline(tt));
    } else {
      step(duel.rival, none);
      step(duel.mine, none);
      if (tt >= DANCE_SECS + 0.99) { duel.rival = createPuppet(); duel.mine = createPuppet(); }
    }
  } else {
    step(duel.rival, none);
    step(duel.mine, none);
  }
  return duel;
}

function pushMove(duel, key, start, end) {
  if (end - start < 0.03) return;       // debounce a stray tap
  duel.played.push({ key, start, end });
}

export function nextRound(duel) {
  duel.round++;
  duel.seed = (duel.seed * 1664525 + 1013904223) >>> 0;
  duel.target = choreograph(duel.seed, duel.difficulty);
  return begin(duel);
}

/** What the player is shown at the end. Kept here rather than in the page so
 *  the wording is testable and cannot drift from the number it describes. */
export function verdict(accuracy) {
  if (accuracy >= 0.85) return 'puppeteer';
  if (accuracy >= 0.70) return 'good eye';
  if (accuracy >= 0.50) return 'roughly right';
  if (accuracy >= 0.30) return 'the shape of it';
  return 'not that dance';
}
