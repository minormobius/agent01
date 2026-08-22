// A puzzle from a seed: the top of the generator, and the permalink codec.
//
// THE PUZZLE IS THE SEED. Nothing is stored anywhere. `puzzleFrom` is a pure
// function of (seed, size, difficulty, lexicon), so a permalink is those four
// things and about twenty characters, the same URL gives the same puzzle to
// everybody who opens it, and the server does not need to know a puzzle exists
// to serve it. That is also why the lexicon's id is IN the permalink: the
// function is only pure with respect to a given answer list, so a link carries
// the identity of the list it was made against and says so when they differ,
// rather than silently handing over a different puzzle with the same name.
//
// ------------------------------------------------------- the seed ladder --
//
// One seed has to drive several independent decisions, and they must not share
// a stream — if the grid and the fill both draw from one generator, changing
// how many numbers the grid happens to consume changes the fill too, and a
// one-line edit to the grid code silently rewrites every existing permalink.
// So each decision gets its own generator, seeded from a NAME:
//
//     rngFrom(`${seed}|grid|${attempt}`)      rngFrom(`${seed}|fill|${a}|${j}`)
//
// Adding a decision later means adding a name, not renumbering anything.
//
// ---------------------------------------------------------- the restarts --
//
// Two things can go wrong and neither is a bug: a grid can come out unfillable,
// and a fill can come out ugly. Both are answered the same way — throw it away
// and re-roll — because backtracking search has a heavy tail and restarting is
// enormously cheaper than finishing. The ladder tries several fills per grid
// (cheap: the grid is already built) before trying another grid.
//
// The QUALITY GATE is the second half of that. A fill that succeeds is not
// automatically a fill worth solving: the last few squares of a hard grid are
// where the filler reaches for the 40,000th-commonest word, and one such
// crossing can spoil an otherwise ordinary puzzle. So a finished fill is scored
// on how obscure its answers are and rejected if it is worse than the
// difficulty asks for — and the threshold RELAXES as attempts are used up, so
// the generator prefers a good puzzle, accepts a mediocre one rather than
// nothing, and always terminates.

import { rngFrom } from '../../engine/rng.js';
import { generateGrid, numberGrid, isLegalGrid, SIZES } from './grid.js';
import { fillGrid, DIFFICULTIES } from './fill.js';

export { SIZES, DIFFICULTIES };

/** Permalink format version. Bump only for a change that must not be readable as the old one. */
export const PERMALINK_VERSION = 1;

/** How many grids to try, and how many fills per grid. */
const GRID_ATTEMPTS = 8;
const FILLS_PER_GRID = 3;

/**
 * How obscure a fill may be, as the rank at the 90th percentile of its answers.
 * The gate actually enforced is this, scaled by how many attempts are left, so
 * the last attempt accepts anything that filled at all.
 *
 * The numbers are measured rather than chosen. A filled 15x15 lands around a
 * 90th percentile of 33,000, and setting `easy` below what the grids can
 * actually produce does not make easy puzzles — it makes the generator spend
 * every attempt and then accept the best one anyway, slowly. This is the honest
 * range: the difference between easy and hard here is a handful of answers in
 * the tail, not a different vocabulary, because the fill has no choice at all
 * in the squares that produce the tail. See DIFFICULTIES in fill.js.
 */
const OBSCURITY_GATE = { easy: 30000, medium: 42000, hard: Infinity };

/** The rank at the 90th percentile — one obscure crossing should not fail a grid. */
export function obscurity(words, lexicon) {
  const ranks = [];
  for (const w of words) {
    const idx = lexicon.index(w.length);
    let lo = 0, hi = idx.words.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (idx.words[mid] === w) { at = mid; break; }
      if (idx.words[mid] < w) lo = mid + 1; else hi = mid - 1;
    }
    ranks.push(at < 0 ? Infinity : idx.ranks[at]);
  }
  ranks.sort((a, b) => a - b);
  return ranks[Math.floor(ranks.length * 0.9)] ?? Infinity;
}

/**
 * Generate the puzzle for a seed.
 *
 * @param {object} spec
 * @param {string} spec.seed          any string; the puzzle's identity
 * @param {number} spec.size          one of SIZES
 * @param {'easy'|'medium'|'hard'} spec.difficulty
 * @param {import('./lexicon.js').Lexicon} lexicon
 * @returns {object} the puzzle, or {ok: false, reason} if every attempt failed
 */
export function puzzleFrom({ seed, size, difficulty = 'medium' }, lexicon) {
  if (!SIZES.includes(size)) return { ok: false, reason: `size ${size} is not one of ${SIZES.join(', ')}` };
  const level = DIFFICULTIES[difficulty];
  if (!level) return { ok: false, reason: `unknown difficulty ${difficulty}` };

  const gate = OBSCURITY_GATE[difficulty] ?? Infinity;
  const totalAttempts = GRID_ATTEMPTS * FILLS_PER_GRID;
  let attempt = 0;
  let best = null;

  for (let g = 0; g < GRID_ATTEMPTS; g++) {
    // Later attempts ask for a slightly blockier grid: shorter entries are
    // easier to fill, so the ladder trades the shape it wanted for one it can
    // finish rather than failing. Deterministic, like everything else here.
    const density = level.density + 0.015 * g;
    const grid = generateGrid(size, rngFrom(`${seed}|grid|${g}`), { density });
    // An illegal grid is not an error — the placement loop can run out of legal
    // moves with a run still over the cap. Re-roll it like any other miss.
    if (!isLegalGrid(grid.blocks, size)) { attempt += FILLS_PER_GRID; continue; }

    for (let f = 0; f < FILLS_PER_GRID; f++, attempt++) {
      const result = fillGrid(grid, lexicon, rngFrom(`${seed}|fill|${g}|${f}`), {
        softMax: level.softMax,
        jitter: level.jitter,
      });
      if (!result.ok) continue;

      const score = obscurity(result.words, lexicon);
      if (!best || score < best.score) best = { grid, result, score };

      // The gate opens as the attempts run out: at the start only a clean fill
      // is accepted, by the end anything that filled is better than nothing.
      const slack = 1 + (3 * attempt) / totalAttempts;
      if (score <= gate * slack) return assemble(seed, size, difficulty, grid, result, lexicon, score);
    }
  }

  if (best) return assemble(seed, size, difficulty, best.grid, best.result, lexicon, best.score);
  return { ok: false, reason: `no fill found for ${size}x${size} seed "${seed}" in ${totalAttempts} attempts` };
}

function assemble(seed, size, difficulty, grid, result, lexicon, score) {
  const numbers = numberGrid(grid);
  const entries = grid.slots.map((slot, i) => ({
    num: slot.num,
    dir: slot.dir,
    row: slot.row,
    col: slot.col,
    len: slot.len,
    answer: result.words[i],
    cells: slot.cells,
  }));
  // Reading order — across before down at the same number, as a crossword prints.
  entries.sort((a, b) => (a.num - b.num) || (a.dir === 'A' ? -1 : 1));

  return {
    ok: true,
    seed,
    size,
    difficulty,
    lexiconId: lexicon.id,
    blocks: Array.from(grid.blocks),
    numbers: Array.from(numbers),
    entries,
    stats: { nodes: result.nodes, blocks: grid.blockCount, obscurity: score },
  };
}

// ------------------------------------------------------------- permalink --
//
// `v1.15.m.SEED` — version, size, difficulty initial, seed. Readable on
// purpose: a link somebody can retype from a screenshot is worth more than four
// saved characters, and the seed is the interesting part.

const DIFF_CODE = { easy: 'e', medium: 'm', hard: 'h' };
const CODE_DIFF = { e: 'easy', m: 'medium', h: 'hard' };

/** Seeds are restricted to what survives a URL, a shell and a phone keyboard. */
export const SEED_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function encodePermalink({ seed, size, difficulty }) {
  if (!SEED_PATTERN.test(seed)) throw new Error(`seed "${seed}" is not ${SEED_PATTERN}`);
  return `v${PERMALINK_VERSION}.${size}.${DIFF_CODE[difficulty] || 'm'}.${seed}`;
}

/** @returns {{seed, size, difficulty} | null} null for anything unparseable. */
export function decodePermalink(text) {
  const m = /^v(\d+)\.(\d+)\.([emh])\.([A-Za-z0-9_-]{1,32})$/.exec(String(text || '').trim());
  if (!m) return null;
  if (Number(m[1]) !== PERMALINK_VERSION) return null;
  const size = Number(m[2]);
  if (!SIZES.includes(size)) return null;
  return { seed: m[4], size, difficulty: CODE_DIFF[m[3]] };
}

/**
 * The seed for a given day, so "today's puzzle" needs no server and no store.
 * @param {Date|string} date anything Date accepts; UTC is used deliberately, so
 *   the daily is the same puzzle everywhere rather than one per timezone.
 */
export function dailySeed(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const iso = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `d${iso}`;
}
