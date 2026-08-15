// Move generation: every legal play available from a rack, on a position.
//
// This is Appel & Jacobson's algorithm (1988) — anchors, cross-checks, left
// parts, extend-right — with two changes for this board:
//
//   * STONES. A stone terminates a run exactly like the edge of the board, so
//     every "walk until you fall off" also stops at one, and a left part may
//     not be laid across one.
//   * SCORING IS NOT DONE HERE. The generator emits placements and hands each
//     one to `scorePlay` in rules.js. Hazard squares make incremental scoring
//     genuinely awkward (a HALF applies after the multipliers, a TOLL applies
//     to the play rather than the word), and a second implementation of that
//     arithmetic living inside the generator is exactly how a bot ends up
//     proposing moves the referee scores differently.
//
// The generator is deterministic: same position, same rack, same list, in the
// same order, every time. The AI leans on that.

import { SIZE, SQ, START, squares, rowOf, colOf, idx, inBounds } from './board.js';
import { HORIZONTAL, VERTICAL } from './rules.js';
import { scorePlay } from './rules.js';
import { letterIndex, indexLetter } from './dawg.js';
import { BLANK, RACK_SIZE } from './tiles.js';

const ALL_LETTERS = (1 << 26) - 1;
const stepOf = (dir) => (dir === HORIZONTAL ? 1 : SIZE);

/** Safety valve — a position this rich has more moves than any policy needs. */
export const MAX_MOVES = 60000;

/** Step one square along `dir`, or -1 at an edge or a stone. */
function next(sq, i, dir) {
  const n = dir === HORIZONTAL ? i + 1 : i + SIZE;
  if (n >= SIZE * SIZE) return -1;
  if (dir === HORIZONTAL && rowOf(n) !== rowOf(i)) return -1;
  return sq[n] === SQ.STONE ? -1 : n;
}

/** Step one square backwards along `dir`, or -1 at an edge or a stone. */
function prev(sq, i, dir) {
  const n = dir === HORIZONTAL ? i - 1 : i - SIZE;
  if (n < 0) return -1;
  if (dir === HORIZONTAL && rowOf(n) !== rowOf(i)) return -1;
  return sq[n] === SQ.STONE ? -1 : n;
}

/** Squares where a new word may touch the position. */
export function anchors(board, sq) {
  if (board.every((c) => c === null)) return [START];
  const out = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] || sq[i] === SQ.STONE) continue;
    const r = rowOf(i), c = colOf(i);
    let touching = false;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && board[idx(nr, nc)]) { touching = true; break; }
    }
    if (touching) out.push(i);
  }
  return out;
}

/**
 * For each empty square, the letters that would make a valid word in the
 * direction PERPENDICULAR to `dir`. All-ones where the square has no
 * perpendicular neighbours (nothing to be consistent with).
 */
export function crossChecks(board, sq, dir, dawg) {
  const perp = dir === HORIZONTAL ? VERTICAL : HORIZONTAL;
  const mask = new Int32Array(SIZE * SIZE).fill(ALL_LETTERS);
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (board[i] || sq[i] === SQ.STONE) continue;

    let before = '';
    for (let k = prev(sq, i, perp); k !== -1 && board[k]; k = prev(sq, k, perp)) before = board[k].l + before;
    let after = '';
    for (let k = next(sq, i, perp); k !== -1 && board[k]; k = next(sq, k, perp)) after += board[k].l;
    if (!before && !after) continue;

    let m = 0;
    for (let l = 1; l <= 26; l++) {
      if (dawg.has(before + indexLetter(l) + after)) m |= 1 << (l - 1);
    }
    mask[i] = m;
  }
  return mask;
}

/** A rack as counts — index 0..25 for A..Z, plus blanks. */
function rackCounts(rack) {
  const counts = new Int8Array(26);
  let blanks = 0;
  for (const t of rack) {
    if (t === BLANK) blanks++;
    else counts[letterIndex(t) - 1]++;
  }
  return { counts, blanks };
}

/**
 * Every legal play for `rack` on `state`, scored.
 * @returns {Array<{placements, dir, score, gross, toll, bingo, words, word, tilesUsed}>}
 */
export function generateMoves(state, rack, dawg, { max = MAX_MOVES } = {}) {
  const sq = squares(state.layout);
  const board = state.board;
  const anchorList = anchors(board, sq);
  const anchorSet = new Set(anchorList);
  const moves = [];
  let truncated = false;

  // A ONE-TILE play forms both a horizontal and a vertical word, and whichever
  // of the two is the real word decides which pass finds it — sometimes both
  // do. Multi-tile plays span a row or a column and can only come out of one
  // pass, so this only has to watch the single-tile case.
  const singles = new Set();

  for (const dir of [HORIZONTAL, VERTICAL]) {
    const cross = crossChecks(board, sq, dir, dawg);
    const { counts, blanks } = rackCounts(rack);
    let free = blanks;
    const placed = []; // { i, letter, blank }

    // --- record a finished word ---
    const record = () => {
      if (placed.length === 0) return;
      if (moves.length >= max) { truncated = true; return; }
      if (placed.length === 1) {
        const key = `${placed[0].i}:${placed[0].letter}:${placed[0].blank ? 1 : 0}`;
        if (singles.has(key)) return;
        singles.add(key);
      }
      const placements = placed.map((p) => ({ i: p.i, letter: p.letter, blank: p.blank }));
      const scored = scorePlay(state, placements);
      moves.push({
        placements, dir,
        score: scored.score, gross: scored.gross, toll: scored.toll,
        bingo: scored.bingo, words: scored.words,
        word: scored.words.length ? scored.words[0].word : '',
        tilesUsed: placements.length,
      });
    };

    // --- try one letter at a square, from the rack or from a blank ---
    const withLetter = (i, l, fn) => {
      const bit = 1 << (l - 1);
      if (!(cross[i] & bit)) return;
      const letter = indexLetter(l);
      if (counts[l - 1] > 0) {
        counts[l - 1]--;
        placed.push({ i, letter, blank: false });
        fn();
        placed.pop();
        counts[l - 1]++;
      } else if (free > 0) {
        // A blank is only spent on a letter the rack does not hold: playing the
        // real tile always scores at least as much and keeps the blank, so the
        // branch this prunes can never be better.
        free--;
        placed.push({ i, letter, blank: true });
        fn();
        placed.pop();
        free++;
      }
    };

    /**
     * Continue the word rightwards from square `i` with the automaton at
     * `node`. `terminal` says whether the edge that got us here ended a word.
     */
    const extendRight = (i, node, terminal) => {
      if (moves.length >= max) { truncated = true; return; }
      const occupied = i !== -1 && board[i];
      if (!occupied && terminal) record();          // the word may stop here
      if (i === -1) return;                          // edge or stone: it must

      if (occupied) {
        const e = dawg.edge(node, letterIndex(board[i].l));
        if (!e) return;
        extendRight(next(sq, i, dir), dawg.child(e), dawg.isTerminal(e));
        return;
      }
      if (placed.length >= RACK_SIZE) return;
      if (!node) return;
      for (let e = node; ; e++) {
        const l = dawg.letter(e);
        const isTerm = dawg.isTerminal(e);
        const child = dawg.child(e);
        withLetter(i, l, () => extendRight(next(sq, i, dir), child, isTerm));
        if (dawg.isLast(e)) break;
      }
    };

    for (const anchor of anchorList) {
      const before = prev(sq, anchor, dir);

      if (before !== -1 && board[before]) {
        // The prefix is already on the board: walk it, then extend right.
        let start = before;
        for (let k = prev(sq, start, dir); k !== -1 && board[k]; k = prev(sq, k, dir)) start = k;
        let word = '';
        for (let k = start; k !== -1 && board[k]; k = next(sq, k, dir)) word += board[k].l;
        const node = dawg.walk(word);
        if (node) extendRight(anchor, node, false);
        continue;
      }

      // How far left may a rack-built prefix run? Empty, non-stone, non-anchor
      // squares only — stopping before another anchor is what makes each word
      // come out of exactly ONE anchor, so the list has no duplicates.
      let limit = 0;
      for (let k = prev(sq, anchor, dir); k !== -1 && !board[k] && !anchorSet.has(k) && limit < RACK_SIZE - 1; k = prev(sq, k, dir)) {
        limit++;
      }

      const d = stepOf(dir);
      // For each prefix length the squares are fixed, so the k-th prefix letter
      // lands on `anchor - (len - k) * d`. Building it that way keeps the
      // placement bookkeeping honest at the cost of re-walking short prefixes.
      const buildPrefix = (len, remaining, node) => {
        if (moves.length >= max) { truncated = true; return; }
        if (remaining === 0) { extendRight(anchor, node, false); return; }
        if (!node) return;
        const i = anchor - remaining * d;
        for (let e = node; ; e++) {
          const l = dawg.letter(e);
          const child = dawg.child(e);
          withLetter(i, l, () => buildPrefix(len, remaining - 1, child));
          if (dawg.isLast(e)) break;
        }
      };
      for (let len = 0; len <= limit; len++) buildPrefix(len, len, dawg.root);
    }
  }

  // The first play must cover the star with at least two tiles.
  const first = board.every((c) => c === null);
  const legal = first ? moves.filter((m) => m.placements.length >= 2) : moves;

  if (truncated) legal.truncated = true;
  return legal;
}
