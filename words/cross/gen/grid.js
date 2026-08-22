// Procedural crossword grids: blocks placed at random, under the constraints
// that make the result a crossword rather than a stencil.
//
// THE CONSTRAINTS, and what each one is actually for:
//
//   1. 180° ROTATIONAL SYMMETRY. Cell i and cell (n*n-1-i) are always the same
//      colour. This is convention rather than mechanics — but it is the
//      convention, and a grid without it reads as broken to anybody who has
//      solved a crossword before. It also halves the search.
//
//   2. EVERY WHITE RUN IS AT LEAST 3 LONG, across and down. This single rule
//      does two jobs. It bans 1- and 2-letter entries, and — because a white
//      cell is then necessarily inside an across run AND a down run — it makes
//      every square CHECKED: every letter is confirmed by a second clue. An
//      unchecked square is a square the solver can only get by knowing the
//      answer exactly, which in a procedurally generated puzzle is a square
//      nobody can get.
//
//   3. THE WHITE CELLS ARE CONNECTED. A disconnected corner is a second, tiny
//      puzzle sharing a page, and its answers get no help from anything the
//      solver has already filled in.
//
//   4. NO ENTRY LONGER THAN maxEntry(). This one is about fillability, not
//      looks. An unconstrained greedy placement happily leaves three full-width
//      rows stacked on top of each other, and a stack of 15s is the hardest
//      thing in crossword construction — every one of the fifteen crossings has
//      to agree with two other fifteens at once. Human setters build those by
//      hand and are pleased with themselves afterwards. Capping the longest
//      entry at 11 costs a grid nothing anyone will notice and moves the fill
//      from "usually fails" to "usually first try".
//
// The generator is greedy over a seeded shuffle: propose a cell and its partner,
// take them if the grid still satisfies all three, stop at the block target. It
// is not clever, and it does not need to be — REJECTION IS THE ALGORITHM. What
// makes it produce grids rather than noise is that it never accepts an
// intermediate state that breaks a rule, so it cannot paint itself into one.
//
// It does not check whether the result can be FILLED. That is not knowable from
// the shape, and it is fill.js's job to say so; puzzle.js reacts by asking for
// another grid. See the note on the seed hierarchy there.

import { shuffle } from '../../engine/rng.js';

/** No entry shorter than this. Also what makes every square checked — see (2). */
export const MIN_ENTRY = 3;

/**
 * No entry longer than this — see (4). Only big grids are capped: below 13 the
 * cap cannot do any work anyway. A 7×7 capped at 5 has no legal grid at all,
 * because 7 = 3 + block + 3 forces the block into the same column of every row,
 * which is a solid black column splitting the grid in two — so the cap is left
 * alone at small sizes and `slotTarget` does the fillability work instead.
 */
export function maxEntry(size) {
  return size <= 11 ? size : 11;
}

/** The sizes offered. All odd, so the grid has a true centre cell. */
export const SIZES = [5, 7, 9, 11, 13, 15];

/**
 * How many entries a grid of this size should have.
 *
 * THIS, AND NOT A BLOCK COUNT, IS THE TARGET, and the difference is the whole
 * reason grids fill. A block count was aimed at first — 12% of a 7×7 is six —
 * and six blocks on a 7×7 leaves six rows of six or seven letters crossing
 * seven full columns. That is not a small crossword, it is a 6×7 double word
 * rectangle, one of the hardest objects in word puzzles, and the filler failed
 * four out of five of them. It was right to.
 *
 * Entry count measures what actually matters: how INTERLOCKED the grid is. Few
 * entries means long ones, long ones cross each other, and every crossing is
 * one more simultaneous constraint. The ratio is taken from published
 * crosswords — a 15×15 daily runs 72-78 entries, 0.34 per cell — and the same
 * figure gives 17 for a 7×7 and 9 for a 5×5, which is what a newspaper mini
 * looks like.
 */
export function slotTarget(size, density = DEFAULT_DENSITY) {
  return Math.round(density * size * size);
}

/**
 * Entries per cell for a grid nobody has asked to be easier or harder.
 *
 * DENSITY IS THE DIFFICULTY KNOB, and it is the only one that measurably works
 * — see DIFFICULTIES in fill.js for the two that did not. Raising it shortens
 * the entries, which gives the filler more choice per square, which means it
 * reaches less far down the frequency list: on 7×7s, going from 0.34 to 0.46
 * moved the 90th-percentile answer rank from 28,000 to 19,400 and the fill rate
 * from 11 grids in 25 to 25 in 25. That is the same trade a newspaper makes
 * between a Monday grid and a Saturday one, arrived at from the same direction.
 */
export const DEFAULT_DENSITY = 0.34;

/** Blocks stop here regardless, so a stubborn grid is abandoned, not tarred. */
const BLOCK_CEILING_RATIO = 0.3;

/**
 * Maximal runs of white cells of at least MIN_ENTRY, in reading order:
 * every across slot top-to-bottom, then every down slot left-to-right.
 * @returns {{dir: 'A'|'D', row: number, col: number, len: number, cells: number[]}[]}
 */
export function findSlots(blocks, size) {
  const slots = [];
  const scan = (dir) => {
    for (let a = 0; a < size; a++) {
      let run = [];
      for (let b = 0; b <= size; b++) {
        const i = b === size ? -1 : (dir === 'A' ? a * size + b : b * size + a);
        if (i >= 0 && !blocks[i]) { run.push(i); continue; }
        if (run.length >= MIN_ENTRY) {
          const head = run[0];
          slots.push({ dir, row: (head / size) | 0, col: head % size, len: run.length, cells: run });
        }
        run = [];
      }
    }
  };
  scan('A');
  scan('D');
  return slots;
}

/**
 * Does every white cell sit in a run of at least MIN_ENTRY, both ways?
 * Checked directly rather than via findSlots — this runs inside the placement
 * loop, once per candidate, and allocating a slot list each time is waste.
 */
function runsAreLegal(blocks, size) {
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = 0;
      for (let b = 0; b <= size; b++) {
        const white = b < size && !blocks[dir === 0 ? a * size + b : b * size + a];
        if (white) { run++; continue; }
        if (run > 0 && run < MIN_ENTRY) return false;
        run = 0;
      }
    }
  }
  return true;
}

/**
 * Cells that sit inside a white run longer than `cap`, in either direction.
 * This is what makes the placement AIM. Left to a plain shuffle, breaking a
 * full-width row is something the generator does by accident, and it buys the
 * accident with blocks scattered everywhere else first — grids came out at 24%
 * black and still had a 15 in them. Choosing only from cells that are actually
 * in the way fixes the run that is wrong and leaves the rest of the grid alone.
 */
function overlongCells(blocks, size, cap) {
  const flagged = new Set();
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = [];
      for (let b = 0; b <= size; b++) {
        const i = b === size ? -1 : (dir === 0 ? a * size + b : b * size + a);
        if (i >= 0 && !blocks[i]) { run.push(i); continue; }
        if (run.length > cap) for (const c of run) flagged.add(c);
        run = [];
      }
    }
  }
  return flagged;
}

/**
 * The ways of blackening cell `i` that could possibly be legal, cheapest first.
 *
 * A single cell is usually enough — but not near an edge, and that is not a
 * corner case, it is why grids looked the way they did before this existed.
 * Blackening (2, c) cuts the column above it down to rows 0-1: a two-cell
 * entry, which rule 2 forbids. So does (1, c), which leaves one. NO SINGLE
 * BLOCK CAN EVER SIT IN THE SECOND OR THIRD ROW, and a full-width run there can
 * only be broken by taking the cells above it as well — which is exactly the
 * little corner staircase every hand-built crossword has, arrived at from the
 * constraint rather than from imitation.
 *
 * So the atomic move is a BAR to the nearest edge whenever the leftover piece
 * would be too short, and a single cell otherwise.
 */
function movesFor(i, size) {
  const r = (i / size) | 0;
  const c = i % size;
  const moves = [[i]];
  const bar = (cells) => { if (cells.length > 1) moves.push(cells); };
  const col = (from, to) => { const out = []; for (let x = from; x <= to; x++) out.push(x * size + c); return out; };
  const row = (from, to) => { const out = []; for (let x = from; x <= to; x++) out.push(r * size + x); return out; };
  if (r > 0 && r < MIN_ENTRY) bar(col(0, r));
  if (size - 1 - r > 0 && size - 1 - r < MIN_ENTRY) bar(col(r, size - 1));
  if (c > 0 && c < MIN_ENTRY) bar(row(0, c));
  if (size - 1 - c > 0 && size - 1 - c < MIN_ENTRY) bar(row(c, size - 1));
  return moves;
}

/** How many entries the grid has. findSlots without the allocation. */
function countSlots(blocks, size) {
  let count = 0;
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = 0;
      for (let b = 0; b <= size; b++) {
        const white = b < size && !blocks[dir === 0 ? a * size + b : b * size + a];
        if (white) { run++; continue; }
        if (run >= MIN_ENTRY) count++;
        run = 0;
      }
    }
  }
  return count;
}

/**
 * Cells that would SPLIT a run rather than merely shorten one: at least
 * MIN_ENTRY white cells survive on both sides of it, in its row or its column.
 *
 * This is what makes a grid efficient, and efficiency here is not an
 * optimisation — it is the difference between a crossword and a grid with a
 * wide-open middle. A block dropped at the end of a run costs a cell and buys
 * no new entry; a block dropped in the middle of one turns a single 11 into a
 * 4 and a 6, which is two entries where there was one and eleven crossings
 * replaced by shorter, easier ones. Preferring splits reaches the entry target
 * with about a third fewer blocks, which is why these grids come out at the
 * black-square ratio a newspaper prints instead of a quarter black.
 */
function splittingCells(blocks, size) {
  const out = new Set();
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = [];
      for (let b = 0; b <= size; b++) {
        const i = b === size ? -1 : (dir === 0 ? a * size + b : b * size + a);
        if (i >= 0 && !blocks[i]) { run.push(i); continue; }
        for (let k = MIN_ENTRY; k + MIN_ENTRY < run.length; k++) out.add(run[k]);
        run = [];
      }
    }
  }
  return out;
}

/** The longest white run in either direction. */
function longestRun(blocks, size) {
  let best = 0;
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = 0;
      for (let b = 0; b <= size; b++) {
        const white = b < size && !blocks[dir === 0 ? a * size + b : b * size + a];
        if (white) { run++; if (run > best) best = run; } else run = 0;
      }
    }
  }
  return best;
}

/** Are the white cells one connected region? Flood fill from the first one. */
function isConnected(blocks, size) {
  const n = size * size;
  let start = -1, white = 0;
  for (let i = 0; i < n; i++) if (!blocks[i]) { white++; if (start < 0) start = i; }
  if (start < 0) return false;
  const seen = new Uint8Array(n);
  const stack = [start];
  seen[start] = 1;
  let found = 0;
  while (stack.length) {
    const i = stack.pop();
    found++;
    const r = (i / size) | 0, c = i % size;
    if (c > 0 && !blocks[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (c < size - 1 && !blocks[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (r > 0 && !blocks[i - size] && !seen[i - size]) { seen[i - size] = 1; stack.push(i - size); }
    if (r < size - 1 && !blocks[i + size] && !seen[i + size]) { seen[i + size] = 1; stack.push(i + size); }
  }
  return found === white;
}

/** Every rule at once. Exported because the selftest asserts it on real grids. */
export function isLegalGrid(blocks, size) {
  const n = size * size;
  if (blocks.length !== n) return false;
  for (let i = 0; i < n; i++) if (blocks[i] !== blocks[n - 1 - i]) return false;
  return runsAreLegal(blocks, size)
    && isConnected(blocks, size)
    && longestRun(blocks, size) <= maxEntry(size);
}

/**
 * A grid.
 * @param {number} size odd, from SIZES
 * @param {() => number} rand seeded; the ONLY source of variation here
 * @param {{density?: number}} [opts] entries per cell to aim for — see DEFAULT_DENSITY
 * @returns {{size: number, blocks: Uint8Array, slots: object[], crossings: Int32Array}}
 */
export function generateGrid(size, rand, opts = {}) {
  const n = size * size;
  const blocks = new Uint8Array(n);

  // Every cell except the centre, in seeded order. The centre is its own
  // 180° partner, so blackening it changes the block count by one and would
  // make an even target unreachable; grids do have centre blocks in the wild,
  // but excluding it costs one cell and removes a whole special case.
  const centre = (n - 1) / 2;
  const order = [];
  for (let i = 0; i < n; i++) if (i !== centre) order.push(i);
  shuffle(order, rand);

  // Two goals. Blocks are placed until the block target is met AND no run is
  // over the cap; a placement is taken only if the grid stays legal under rules
  // 1-3 afterwards.
  //
  // The second goal drives the CHOICE, not just the stopping point: once a run
  // is too long, candidates are restricted to cells inside an over-long run.
  // Without that restriction the sweep breaks a 15 only by luck, and pays for
  // the luck with blocks everywhere else — grids came out a quarter black and
  // still had a full-width row in them.
  const cap = maxEntry(size);
  const ceiling = Math.floor(n * BLOCK_CEILING_RATIO);
  const wantSlots = slotTarget(size, opts.density ?? DEFAULT_DENSITY);
  let placed = 0;

  /** Apply a move and its 180° mirror atomically, or leave the grid untouched. */
  const tryMove = (cells) => {
    const touched = [];
    for (const c of cells) for (const x of [c, n - 1 - c]) {
      if (!blocks[x]) { blocks[x] = 1; touched.push(x); }
    }
    if (!touched.length) return false;
    if (placed + touched.length <= ceiling && runsAreLegal(blocks, size) && isConnected(blocks, size)) {
      placed += touched.length;
      return true;
    }
    for (const x of touched) blocks[x] = 0;
    return false;
  };

  const tryPlace = (i) => movesFor(i, size).some(tryMove);

  while (placed < ceiling) {
    const flagged = overlongCells(blocks, size, cap);
    if (flagged.size === 0 && countSlots(blocks, size) >= wantSlots) break;

    // While a run is over the cap, cells inside one are the only cells worth
    // blocking; otherwise anything goes. Either way, splitting cells are tried
    // before the rest — see splittingCells for why that is most of the quality.
    const splits = splittingCells(blocks, size);
    const eligible = (i) => flagged.size === 0 || flagged.has(i);
    let done = false;
    for (const pass of [true, false]) {
      for (const i of order) {
        if (!eligible(i) || splits.has(i) !== pass) continue;
        if (tryPlace(i)) { done = true; break; }
      }
      if (done) break;
    }
    if (!done) break; // nothing legal left to place; the grid is what it is
  }

  const slots = findSlots(blocks, size);

  // crossings[cell*2 + 0] = index of the across slot covering that cell,
  // crossings[cell*2 + 1] = the down slot. -1 for a block. Rule (2) guarantees
  // every white cell has both, which the selftest asserts rather than assumes.
  // posIn[] is the same lookup for the cell's POSITION within that slot: the
  // filler needs both together on every arc it checks, and looking the position
  // up in a Map each time was measurable.
  const crossings = new Int32Array(n * 2).fill(-1);
  const posIn = new Int8Array(n * 2).fill(-1);
  slots.forEach((s, si) => {
    const k = s.dir === 'A' ? 0 : 1;
    s.cells.forEach((c, p) => { crossings[c * 2 + k] = si; posIn[c * 2 + k] = p; });
  });

  return { size, blocks, slots, crossings, posIn, blockCount: placed };
}

/**
 * Clue numbers, the standard way: a white cell is numbered when it starts an
 * across run or a down run. Returns numbers[cell] (0 = unnumbered) and stamps
 * `num` onto each slot.
 */
export function numberGrid(grid) {
  const { size, blocks, slots } = grid;
  const starts = new Map(); // cell -> slots starting there
  for (const s of slots) {
    if (!starts.has(s.cells[0])) starts.set(s.cells[0], []);
    starts.get(s.cells[0]).push(s);
  }
  const numbers = new Int32Array(size * size);
  let next = 1;
  for (let i = 0; i < size * size; i++) {
    if (blocks[i] || !starts.has(i)) continue;
    numbers[i] = next;
    for (const s of starts.get(i)) s.num = next;
    next++;
  }
  return numbers;
}
