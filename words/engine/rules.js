// Placement legality and scoring — the one place either question is answered.
//
// The AI and the server share this file. That is deliberate: a move generator
// that scores plays with its own copy of the arithmetic will eventually
// disagree with the referee, and the disagreement shows up as a bot playing a
// move the server then rejects. Move generation here proposes only WHERE and
// WHICH LETTERS; every score on screen, in the log and in the AI's ranking
// comes out of `scorePlay` below.
//
// A cell on the board is `null` or `{ l: 'A', b: bool (came from a blank),
// s: seat }`. A placement is `{ i, letter, blank }`.

import {
  SIZE, SQ, START, squares, idx, rowOf, colOf, inBounds,
  LETTER_MULT, WORD_MULT, TOLL_COST, BINGO_BONUS,
} from './board.js';
import { tileValue, RACK_SIZE, BLANK } from './tiles.js';

export const HORIZONTAL = 'H';
export const VERTICAL = 'V';

const step = (dir) => (dir === HORIZONTAL ? 1 : SIZE);

/** Can a tile ever sit here? Stones say no, forever. */
export function isPlayable(sq, i) {
  return sq[i] !== SQ.STONE;
}

/** Is the board empty of tiles? */
export function isEmpty(board) {
  return board.every((c) => c === null);
}

/**
 * Walk from `i` in `dir` to the first cell of its run of tiles, stopping at the
 * edge, at an empty square, or at a stone.
 */
function runStart(board, sq, i, dir) {
  const d = step(dir);
  let cur = i;
  for (;;) {
    const prev = cur - d;
    if (prev < 0) return cur;
    // A horizontal step must stay on the same row.
    if (dir === HORIZONTAL && rowOf(prev) !== rowOf(cur)) return cur;
    if (sq[prev] === SQ.STONE) return cur;
    if (!board[prev]) return cur;
    cur = prev;
  }
}

/** The next cell in `dir`, or -1 when the run cannot continue. */
function nextCell(sq, i, dir) {
  const d = step(dir);
  const n = i + d;
  if (n >= SIZE * SIZE) return -1;
  if (dir === HORIZONTAL && rowOf(n) !== rowOf(i)) return -1;
  if (sq[n] === SQ.STONE) return -1;
  return n;
}

/**
 * The word covering `i` along `dir` on a board where `placed` (index -> tile)
 * is treated as already down. Returns null when it would be a single letter.
 */
export function wordAt(board, sq, placed, i, dir) {
  const at = (k) => placed.get(k) || board[k];
  if (!at(i)) return null;
  let start = i;
  for (;;) {
    const d = step(dir);
    const prev = start - d;
    if (prev < 0) break;
    if (dir === HORIZONTAL && rowOf(prev) !== rowOf(start)) break;
    if (sq[prev] === SQ.STONE || !at(prev)) break;
    start = prev;
  }
  const cells = [];
  for (let k = start; k !== -1 && at(k); k = nextCell(sq, k, dir)) {
    const tile = at(k);
    cells.push({ i: k, letter: tile.l, blank: !!tile.b, fresh: placed.has(k) });
  }
  return cells.length >= 2 ? { dir, cells, word: cells.map((c) => c.letter).join('') } : null;
}

/**
 * Every word a play creates: the main word plus one cross-word per placement.
 * Deduplicated by (first cell, direction).
 */
export function wordsFormed(board, sq, placements) {
  const placed = new Map(placements.map((p) => [p.i, { l: p.letter, b: !!p.blank }]));
  const dirs = placements.length === 1
    ? [HORIZONTAL, VERTICAL]
    : (rowOf(placements[0].i) === rowOf(placements[1].i) ? [HORIZONTAL] : [VERTICAL]);
  const main = dirs[0];
  const cross = main === HORIZONTAL ? VERTICAL : HORIZONTAL;

  const out = [];
  const seen = new Set();
  const push = (w) => {
    if (!w) return;
    const key = `${w.dir}:${w.cells[0].i}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(w);
  };
  push(wordAt(board, sq, placed, placements[0].i, main));
  for (const p of placements) push(wordAt(board, sq, placed, p.i, cross));
  return out;
}

/**
 * Score a set of words. Applied per word, in this order:
 *   1. letters, each times its own multiplier (a MIRE multiplies by zero)
 *   2. the word multipliers, multiplied together
 *   3. every HALF in the word, each halving and rounding down
 * then, once for the whole play: the bingo bonus, and a flat toll per TOLL.
 * A play can be taxed to zero but never below it.
 */
export function scoreWords(sq, words, placementCount) {
  const detail = [];
  let total = 0;
  for (const w of words) {
    let sum = 0;
    let mult = 1;
    let halves = 0;
    for (const cell of w.cells) {
      const base = cell.blank ? 0 : tileValue(cell.letter);
      if (cell.fresh) {
        const kind = sq[cell.i];
        sum += base * (LETTER_MULT[kind] ?? 1);
        mult *= WORD_MULT[kind] ?? 1;
        if (kind === SQ.HALF) halves++;
      } else {
        sum += base;
      }
    }
    let score = sum * mult;
    for (let h = 0; h < halves; h++) score = Math.floor(score / 2);
    detail.push({ word: w.word, dir: w.dir, score, halves, mult, cells: w.cells });
    total += score;
  }

  const bingo = placementCount === RACK_SIZE;
  if (bingo) total += BINGO_BONUS;
  return { total, detail, bingo };
}

/**
 * Legality. Returns `{ ok: true, ... }` or `{ ok: false, error }`.
 * `dawg` may be omitted to check geometry only — move generation does exactly
 * that, because it has already proved the words from the lexicon side.
 */
export function validatePlay(state, placements, dawg) {
  const { board } = state;
  const sq = squares(state.layout);
  const bad = (error) => ({ ok: false, error });

  if (!Array.isArray(placements) || placements.length === 0) return bad('no tiles placed');
  if (placements.length > RACK_SIZE) return bad('more tiles than a rack holds');

  const seen = new Set();
  for (const p of placements) {
    if (!Number.isInteger(p.i) || p.i < 0 || p.i >= SIZE * SIZE) return bad('off the board');
    if (seen.has(p.i)) return bad('two tiles on one square');
    seen.add(p.i);
    if (sq[p.i] === SQ.STONE) return bad('that square is a stone — nothing can be placed on it');
    if (board[p.i]) return bad('that square is already taken');
    if (!/^[A-Z]$/.test(p.letter)) return bad('not a letter');
  }

  const rows = new Set(placements.map((p) => rowOf(p.i)));
  const cols = new Set(placements.map((p) => colOf(p.i)));
  if (rows.size > 1 && cols.size > 1) return bad('tiles must share one row or one column');
  const dir = rows.size === 1 ? HORIZONTAL : VERTICAL;

  // Contiguity: from the lowest to the highest placement, every square between
  // must be filled — by this play or by a tile already down. A stone in the
  // span is a gap that can never be closed.
  const sorted = [...placements].sort((a, b) => a.i - b.i);
  const d = step(dir);
  for (let k = sorted[0].i; k < sorted[sorted.length - 1].i; k += d) {
    if (sq[k] === SQ.STONE) return bad('a stone splits that word');
    if (!board[k] && !seen.has(k)) return bad('gap in the word');
  }

  const first = isEmpty(board);
  if (first) {
    if (!seen.has(START)) return bad('the first word must cover the star');
    if (placements.length < 2) return bad('the first word needs at least two letters');
  } else {
    // Must touch something already on the board.
    let touches = false;
    for (const p of placements) {
      const r = rowOf(p.i), c = colOf(p.i);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (board[idx(nr, nc)]) { touches = true; break; }
      }
      if (touches) break;
    }
    if (!touches) return bad('the word must connect to a tile already on the board');
  }

  const words = wordsFormed(board, sq, placements);
  if (!words.length) return bad('that makes no word');

  if (dawg) {
    const invalid = words.filter((w) => !dawg.has(w.word)).map((w) => w.word);
    if (invalid.length) return { ok: false, error: `not in the lexicon: ${invalid.join(', ')}`, invalid };
  }

  return { ok: true, dir, words };
}

/**
 * The score a play is worth, with its breakdown. Assumes `validatePlay` passed.
 * Tolls are charged here, against the play, after the bingo bonus.
 */
export function scorePlay(state, placements) {
  const sq = squares(state.layout);
  const words = wordsFormed(state.board, sq, placements);
  const { total, detail, bingo } = scoreWords(sq, words, placements.length);
  const tolls = placements.filter((p) => sq[p.i] === SQ.TOLL).length;
  const toll = tolls * TOLL_COST;
  const score = Math.max(0, total - toll);
  return { score, gross: total, toll, tolls, bingo, words: detail };
}

/** Does the rack hold these tiles? Blanks cover any letter. Returns the tiles spent. */
export function spendRack(rack, placements) {
  const pool = [...rack];
  const spent = [];
  for (const p of placements) {
    const want = p.blank ? BLANK : p.letter;
    const at = pool.indexOf(want);
    if (at === -1) return { ok: false, error: `no ${p.blank ? 'blank' : p.letter} on the rack` };
    pool.splice(at, 1);
    spent.push(want);
  }
  return { ok: true, rack: pool, spent };
}
