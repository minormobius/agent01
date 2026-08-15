// The board: 15x15, and the squares that make it ours.
//
// A layout is written as EIGHT rows of EIGHT characters — the top-left quadrant
// including the centre row and column, where (7,7) is the star. The full board
// is that quadrant mirrored in both axes, so quadrant cell (r,c) governs board
// cells (r|14-r, c|14-c). Writing a layout therefore takes 64 characters, and
// the eight-fold symmetry real boards have is a property of the FORMAT rather
// than something a designer has to keep in their head — with one rule to
// remember: keep the quadrant symmetric about its own diagonal
// (`quad[r][c] === quad[c][r]`) or the board is only two-fold symmetric.
// `assertLayouts()` checks exactly that, and the selftest runs it.
//
// ---------------------------------------------------------------- squares --
//
// The four classic premiums do what they have always done:
//
//   d  double letter    the letter placed here counts twice
//   t  triple letter    ... three times
//   D  double word      the whole word counts twice
//   T  triple word      ... three times
//
// and then there are ours. Three hazards and one premium, all of which resolve
// inside the scorer — no board mutation, no delayed effects, nothing a player
// has to remember from a previous turn:
//
//   q  QUAD LETTER   the letter counts FOUR times. The upside tile: it is the
//                    only square that makes a Z or a Q worth crossing the board
//                    for, and it sits deep in hazard country so reaching it
//                    costs something.
//   m  MIRE          a letter placed here scores ZERO. Word multipliers still
//                    apply, so a mire is not a dead square — it is a cheap
//                    place to dump a U, and an expensive place to be forced
//                    into with an X.
//   h  HALF          the word through it is HALVED (rounded down), applied
//                    after every multiplier. Two halves in one word quarter it.
//                    This is the square that punishes the greedy long play —
//                    a bingo laid through a half is a bingo you half-wasted.
//   x  TOLL          covering it costs a flat 8 points off the PLAY, not the
//                    word — so it hurts a 12-point play far more than a
//                    60-point one. Deliberately: it taxes the shuffling
//                    filler move, not the good one. A play can be taxed to
//                    zero but never below it.
//   #  STONE         nothing may ever be placed here. It is a hole in the
//                    board: words stop at it exactly as they stop at the edge.
//                    Stones change the TOPOLOGY rather than the arithmetic,
//                    which is why the archipelago layout is a different game
//                    rather than the same game with different numbers.
//
// `.` is a plain square, `*` is the start square (plain, but the first play
// must cover it).

export const SIZE = 15;
export const CENTER = 7;
export const START = CENTER * SIZE + CENTER;

/** Square kinds, as they appear in a layout string. */
export const SQ = {
  PLAIN: '.',
  START: '*',
  DL: 'd',
  TL: 't',
  QL: 'q',
  DW: 'D',
  TW: 'T',
  MIRE: 'm',
  HALF: 'h',
  TOLL: 'x',
  STONE: '#',
};

/** Letter multiplier for a freshly covered square. MIRE zeroes the letter. */
export const LETTER_MULT = { [SQ.DL]: 2, [SQ.TL]: 3, [SQ.QL]: 4, [SQ.MIRE]: 0 };
/** Word multiplier for a freshly covered square. */
export const WORD_MULT = { [SQ.DW]: 2, [SQ.TW]: 3 };
/** Flat points removed from the PLAY total per freshly covered TOLL. */
export const TOLL_COST = 8;
/** Points for using all seven rack tiles in one play. */
export const BINGO_BONUS = 40;

/** Human-facing names, for the legend and the move log. */
export const SQ_LABEL = {
  [SQ.PLAIN]: '', [SQ.START]: 'start',
  [SQ.DL]: 'double letter', [SQ.TL]: 'triple letter', [SQ.QL]: 'quad letter',
  [SQ.DW]: 'double word', [SQ.TW]: 'triple word',
  [SQ.MIRE]: 'mire', [SQ.HALF]: 'half', [SQ.TOLL]: 'toll', [SQ.STONE]: 'stone',
};

/** Short badge text drawn on an empty square. */
export const SQ_BADGE = {
  [SQ.DL]: '2L', [SQ.TL]: '3L', [SQ.QL]: '4L', [SQ.DW]: '2W', [SQ.TW]: '3W',
  [SQ.MIRE]: 'MIRE', [SQ.HALF]: '½', [SQ.TOLL]: '−8', [SQ.STONE]: '',
  [SQ.START]: '★',
};

// ------------------------------------------------------------- layouts ----

export const LAYOUTS = {
  // No hazards. The board for someone who wants the game they already know:
  // a double-word spine on the diagonal, triple words at the corners and the
  // middle of each edge.
  fair: {
    id: 'fair',
    name: 'Fair',
    blurb: 'The straight game. Double and triple letters and words, nothing else — the board to learn on, and the one to settle an argument on.',
    quadrant: [
      'T...d..T',
      '.D...t..',
      '..D...d.',
      '...D...t',
      'd...D...',
      '.t...D.d',
      '..d...D.',
      'T..t.d.*',
    ],
  },

  // The flagship. Same skeleton as Fair, with the four new squares cut into it.
  hazard: {
    id: 'hazard',
    name: 'Hazard',
    blurb: 'Fair, with teeth. Quad letters deep in the corners, mires that pay nothing, halves that cut a word in two and tolls that tax the filler move.',
    quadrant: [
      'T..md..T',
      '.D...t.x',
      '..D.h.d.',
      'm..D...t',
      'd.h.D..q',
      '.t...D.d',
      '..d...D.',
      'Tx.tqd.*',
    ],
  },

  // Stones. The board is no longer a rectangle, so the classic "run a long word
  // down the triple-word column" plan has to route around holes.
  archipelago: {
    id: 'archipelago',
    name: 'Archipelago',
    blurb: 'Stones cut the board into islands joined by narrow straits. Words break on a stone exactly as they break on the edge, so the shape of the board is the puzzle.',
    // Stones are kept well away from the star: four of them around the centre
    // would seal the only legal opening square off from the rest of the board,
    // which `assertLayouts` refuses.
    quadrant: [
      'T.#md..T',
      '.D...t.x',
      '#.D.h.#.',
      'm..D.#.t',
      'd.h.D..q',
      '.t.#.D.d',
      '..#...D.',
      'Tx.tqd.*',
    ],
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const DEFAULT_LAYOUT = 'hazard';

/**
 * Expand a layout id into a flat 225-char square-kind array.
 * Cached: the expansion is pure and gets called on every scoring pass.
 */
const _expanded = new Map();
export function squares(layoutId) {
  const hit = _expanded.get(layoutId);
  if (hit) return hit;
  const layout = LAYOUTS[layoutId];
  if (!layout) throw new Error(`unknown layout: ${layoutId}`);
  const out = new Array(SIZE * SIZE);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const qr = Math.min(r, SIZE - 1 - r);
      const qc = Math.min(c, SIZE - 1 - c);
      out[r * SIZE + c] = layout.quadrant[qr][qc];
    }
  }
  out[START] = SQ.START;
  _expanded.set(layoutId, out);
  return out;
}

export const idx = (r, c) => r * SIZE + c;
export const rowOf = (i) => (i / SIZE) | 0;
export const colOf = (i) => i % SIZE;
export const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** A stone is not a square you can play on — it is a hole in the board. */
export const isStone = (sq, i) => sq[i] === SQ.STONE;

/** An empty board: 225 nulls. A cell is null, or `{ letter, blank, seat }`. */
export function newBoard() {
  return new Array(SIZE * SIZE).fill(null);
}

/** Playable squares — everything that is not a stone. */
export function playableCount(layoutId) {
  return squares(layoutId).filter((s) => s !== SQ.STONE).length;
}

/**
 * Validate every layout: right shape, diagonal symmetry, a playable start
 * square, and no stone sealing the centre off from the rest of the board.
 * Throws on the first problem. The selftest calls this; so does the worker at
 * boot, because a malformed layout is unplayable rather than merely ugly.
 */
export function assertLayouts() {
  for (const [id, layout] of Object.entries(LAYOUTS)) {
    const q = layout.quadrant;
    if (q.length !== 8) throw new Error(`${id}: quadrant must have 8 rows, has ${q.length}`);
    for (const [r, row] of q.entries()) {
      if (row.length !== 8) throw new Error(`${id}: quadrant row ${r} must be 8 chars, is ${row.length}`);
      for (const ch of row) {
        if (!Object.values(SQ).includes(ch)) throw new Error(`${id}: unknown square '${ch}'`);
      }
    }
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (q[r][c] !== q[c][r]) {
          throw new Error(`${id}: quadrant not symmetric about its diagonal at (${r},${c}) '${q[r][c]}' vs (${c},${r}) '${q[c][r]}'`);
        }
      }
    }
    const sq = squares(id);
    if (sq[START] === SQ.STONE) throw new Error(`${id}: start square is a stone`);

    // Every playable square must be reachable from the start by rook moves that
    // do not cross a stone — otherwise part of the board can never be played.
    const seen = new Set([START]);
    const queue = [START];
    while (queue.length) {
      const i = queue.pop();
      const r = rowOf(i), c = colOf(i);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const n = idx(nr, nc);
        if (sq[n] === SQ.STONE || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    const playable = sq.filter((s) => s !== SQ.STONE).length;
    if (seen.size !== playable) {
      throw new Error(`${id}: ${playable - seen.size} playable squares are walled off from the start square`);
    }
  }
  return true;
}
