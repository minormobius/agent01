// The opponent. Deterministic: no RNG anywhere in this file.
//
// Given a position, a rack and a level, the bot always plays the same move.
// That is a design choice, not an accident of implementation:
//
//   * a game is replayable from `{seed, moves[]}` — the bot's turns do not have
//     to be stored, they can be recomputed, which is why the move log is the
//     whole record;
//   * a bug is reproducible from the position alone;
//   * and the difficulty levels mean something you can state in a sentence
//     rather than "it rolls a dice and sometimes blunders".
//
// The three levels differ in WHAT THEY CAN SEE, not in how honest they are:
//
//   mild    only looks at plays of up to four tiles, and only at the points on
//           the board. It cannot find a bingo, and it will happily wreck its
//           own rack for eight points. This is a beginner, not a cheat.
//           MEASURED: 93 points a game weaker than steady (60 mirrored
//           games, +/-8), winning 6 of 60.
//   steady  every play, points weighed against the rack it would keep.
//   sharp   steady, plus it stops pretending the bag matters once the bag is
//           empty: with no draws left a "good leave" is not a promise of a
//           better rack, it is dead weight you will be charged for, and going
//           out first takes everyone else's tiles.
//           MEASURED: level with steady overall (+0.6 +/-9.3 over 60 mirrored
//           games) — its edge is confined to the endgame, where the reasoning
//           is strictly better rather than merely different.
//
// THE HONEST PART. Greedy-plus-leave is a strong baseline and three separate
// attempts to beat it did not, each measured over 50-100 mirrored games (the
// same seeds played twice with the bots swapped, so seat and deal cancel):
//
//   * penalising the premium squares a play leaves open: -16 points a game at
//     the weight it shipped with, and nothing at any weight worth having;
//   * weighing the rack leave harder: nothing;
//   * one-ply lookahead against sampled opponent racks (Monte Carlo over the
//     unseen pool, seeded from the position so it stayed deterministic): -25
//     points a game when each candidate drew its own samples, 0 once they
//     shared them (common random numbers), and -9 with the budget moved from
//     candidates to samples. It cost eighty move generations per turn to not
//     help, so it is gone.
//
// Those are recorded so the next person does not spend the afternoon I did.
// The thing that would actually work is a real multi-ply equity with a proper
// sample count — that is a different project, not a tuning pass.
//
// The leave values are the standard shape (a blank is worth about a bingo's
// worth of future, an S about eight points) rather than anything derived: this
// is a heuristic evaluator, and `test/analysis.mjs` measures what it is worth
// rather than asserting it.

import { generateMoves } from './movegen.js';
import { SIZE } from './board.js';
import { BLANK, RACK_SIZE, tileValue, rackValue } from './tiles.js';
import { applyPlay, applyPass, applyExchange, AI_LEVELS } from './game.js';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** How much a duplicate of this letter hurts. Everything else costs 1.5. */
const DUP_COST = { E: 1, A: 1.5, I: 2, O: 2, U: 4, S: 1, V: 4, W: 3, C: 2, G: 2 };

/**
 * What a rack is worth to keep, in points of future. Positive is good.
 * Not an equity table — a shape: blanks and S are hoarded, doubles and
 * vowel-heavy or vowel-starved racks are penalised, and Q without U is the
 * classic trap.
 */
export function leaveValue(rack) {
  if (!rack.length) return 0;
  let v = 0;
  const counts = new Map();
  for (const t of rack) counts.set(t, (counts.get(t) || 0) + 1);

  const blanks = counts.get(BLANK) || 0;
  v += 24 * Math.min(blanks, 1) + 18 * Math.max(0, blanks - 1);
  v += 8 * Math.min(counts.get('S') || 0, 2);

  for (const [t, n] of counts) {
    if (t === BLANK || n < 2) continue;
    v -= (DUP_COST[t] ?? 1.5) * (n - 1);
  }

  const letters = rack.filter((t) => t !== BLANK);
  const vowels = letters.filter((t) => VOWELS.has(t)).length;
  const want = Math.round(letters.length * 0.42);
  v -= 1.8 * Math.abs(vowels - want);

  if (counts.get('Q') && !counts.get('U') && !blanks) v -= 9;
  v -= 2.5 * (counts.get('V') || 0);

  return v;
}

/** Points an exchange forfeits by not being a play — it burns a whole turn. */
export const EXCHANGE_HANDICAP = 6;

/** Roughly what the other racks are worth to whoever goes out first. */
export const OUT_BONUS = 15;

/** `rack` minus one instance of each tile in `tiles`. */
export function without(rack, tiles) {
  const pool = [...rack];
  for (const t of tiles) {
    const at = pool.indexOf(t);
    if (at !== -1) pool.splice(at, 1);
  }
  return pool;
}

/** The tiles left after a play. */
function leaveAfter(rack, placements) {
  return without(rack, placements.map((p) => (p.blank ? BLANK : p.letter)));
}

/** A stable identity for a play, so ties break the same way every time. */
export function moveKey(move) {
  return move.placements
    .map((p) => `${String(p.i).padStart(3, '0')}${p.blank ? p.letter.toLowerCase() : p.letter}`)
    .sort()
    .join('');
}

/**
 * Score every candidate and sort best-first. Ties break on raw points, then
 * tiles used, then the move key — total order, no RNG, no dependence on the
 * order the generator happened to emit.
 */
export function rank(state, rack, moves, level = 'steady') {
  const leaveWeight = level === 'mild' ? 0 : level === 'sharp' ? 1 : 0.7;
  // Once the bag is empty there is nothing to draw, so the leave heuristic is
  // measuring a future that does not exist. `state.bag` is absent when the
  // client ranks moves for a hint, which is not an endgame question.
  const endgame = level === 'sharp' && state.bag?.length === 0;

  const scored = moves.map((m) => {
    const kept = leaveAfter(rack, m.placements);
    let value = m.score;
    let leave = 0;
    if (endgame) {
      // Dead weight is charged against you at the end, and going out first
      // takes everyone else's. Both are in the scoring, not guesses.
      leave = -rackValue(kept) + (kept.length === 0 ? OUT_BONUS : 0);
      value += leave;
    } else if (leaveWeight) {
      leave = leaveValue(kept);
      value += leaveWeight * leave;
    }
    return { ...m, leave, value, key: moveKey(m) };
  });
  scored.sort((a, b) =>
    b.value - a.value ||
    b.score - a.score ||
    b.tilesUsed - a.tilesUsed ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return scored;
}

/** Candidate plays a level is allowed to consider. */
function visible(moves, level) {
  if (level !== 'mild') return moves;
  const small = moves.filter((m) => m.tilesUsed <= 4);
  // If a mild bot's only legal plays are long ones, it still has to play one.
  return small.length ? small : moves;
}

/**
 * The best tiles to throw back, chosen by what the kept rack would be worth.
 * Exhaustive over the 127 non-empty subsets of a seven-tile rack.
 */
export function bestExchange(rack) {
  let best = null;
  for (let mask = 1; mask < (1 << rack.length); mask++) {
    const out = [], keep = [];
    for (let i = 0; i < rack.length; i++) ((mask >> i) & 1 ? out : keep).push(rack[i]);
    // Never throw a blank back; it is worth more than anything it could draw.
    if (out.includes(BLANK)) continue;
    const v = leaveValue(keep) - 0.5 * out.length;
    const key = [...out].sort().join('');
    if (!best || v > best.v || (v === best.v && key < best.key)) best = { v, out, key };
  }
  return best ? best.out : [...rack];
}

/**
 * What the bot in `seat` would do. Never mutates the state.
 * @returns {{kind:'play'|'exchange'|'pass', ...}}
 */
export function chooseMove(state, seat, dawg, { level } = {}) {
  const player = state.seats[seat];
  const lvl = AI_LEVELS.includes(level || player.level) ? (level || player.level) : 'steady';
  const rack = player.rack;

  const all = generateMoves(state, rack, dawg);
  const ranked = rank(state, rack, visible(all, lvl), lvl);
  const best = ranked[0];
  const canExchange = state.bag.length >= RACK_SIZE;

  if (!best) {
    return canExchange
      ? { kind: 'exchange', tiles: bestExchange(rack), considered: 0 }
      : { kind: 'pass', considered: 0 };
  }

  // Playing and exchanging are both "points now plus a rack afterwards", so
  // they can be compared on one number. Exchanging scores nothing and costs a
  // turn, hence the flat handicap. A mild bot never does this — it plays the
  // best thing it can see, which is most of what makes it mild.
  if (canExchange && lvl !== 'mild') {
    const out = bestExchange(rack);
    const kept = without(rack, out);
    const exchangeValue = leaveValue(kept) - EXCHANGE_HANDICAP;
    if (best.value < exchangeValue) {
      return { kind: 'exchange', tiles: out, keptValue: Math.round(exchangeValue), considered: all.length };
    }
  }
  return {
    kind: 'play',
    placements: best.placements,
    score: best.score,
    word: best.word,
    words: best.words.map((w) => w.word),
    value: best.value,
    leave: best.leave,
    open: best.open,
    considered: all.length,
    level: lvl,
  };
}

/** Choose and apply. Returns the same `{ok, entry, state}` shape as game.js. */
export function takeTurn(state, seat, dawg, opts) {
  const move = chooseMove(state, seat, dawg, opts);
  if (move.kind === 'play') {
    const res = applyPlay(state, seat, move.placements, dawg);
    if (res.ok) res.ai = move;
    return res;
  }
  if (move.kind === 'exchange') {
    const res = applyExchange(state, seat, move.tiles);
    if (res.ok) { res.ai = move; return res; }
    return applyPass(state, seat); // bag ran short between the look and the act
  }
  return applyPass(state, seat);
}

/**
 * The best plays available to a HUMAN seat — the hint button, and the endgame
 * review. Same generator, same ranking, no hidden information used.
 */
export function topMoves(state, rack, dawg, n = 5, level = 'sharp') {
  const ranked = rank(state, rack, generateMoves(state, rack, dawg), level);
  return ranked.slice(0, n).map((m) => ({
    placements: m.placements, word: m.word, score: m.score,
    words: m.words.map((w) => w.word), tilesUsed: m.tilesUsed, value: Math.round(m.value * 10) / 10,
  }));
}

export { AI_LEVELS, RACK_SIZE, tileValue, SIZE };
