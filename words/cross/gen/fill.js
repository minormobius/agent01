// Filling a grid: the constraint search that turns a shape into a crossword.
//
// The problem is a CSP. Variables are the slots, a slot's domain is every
// answer of its length, and two slots that share a cell must agree on the
// letter there. It is NP-hard in general and completely tractable in practice,
// provided three things are true, which is what this file is about.
//
// ---------------------------------------------------------------- 1. MRV --
//
// Always extend the slot with the FEWEST remaining candidates. This is the
// single decision that matters. Filling in reading order means discovering in
// the bottom-right corner that the top-left made it impossible, thirty
// assignments too late; filling most-constrained-first means the slot that is
// about to become impossible is the slot being worked on, so the failure
// happens where it can still be cheaply undone. Ties go to the slot with the
// most unassigned crossings — the same argument one step ahead.
//
// ------------------------------------------------- 2. INCREMENTAL DOMAINS --
//
// A slot's candidate set is a bitset (../gen/lexicon.js) that is narrowed in
// place as crossings get pinned, and restored from a copy on the way back out.
// Recomputing a slot's candidates from its pattern each time it is examined is
// the obvious implementation and it is roughly twenty times slower: MRV asks
// for every unassigned slot's domain SIZE at every node, and popcount over a
// bitset that is already correct is nearly free.
//
// ------------------------------------------------------ 3. ARC CONSISTENCY --
//
// The moment a word is placed, every crossing slot's domain is narrowed, and a
// placement that empties one is rejected immediately rather than three levels
// deeper. That much is forward checking, and ON ITS OWN IT IS NOT ENOUGH — it
// was tried here first, and 15x15 grids filled zero times out of twenty.
//
// The reason is that forward checking only ever asks whether a slot still has
// SOME word. It never asks whether two crossing slots can still AGREE. Take an
// empty cell whose across slot permits only J or Q there, while its down slot
// permits only E or S. Both domains are large and healthy; the cell is already
// impossible, and forward checking cannot see it. The search will happily build
// another fifteen assignments on top of that cell before finding out.
//
// So propagation happens at the level of LETTERS, which is AC-3 over this
// problem's real constraint: for every empty cell, take the letters its across
// slot still permits there, intersect with the letters its down slot permits,
// and if the intersection is empty the grid is dead NOW. If it is merely
// smaller, both slots are narrowed to the words that use a surviving letter —
// which can empty a third slot, hence the queue. This one change took 15x15
// from 0/20 to filling on the first grid.
//
// -------------------------------------------------------------- FAILURE ---
//
// Backtracking search has a heavy tail: most fills finish in a few hundred
// assignments and a few would run until the heat death of the universe. So the
// search is BUDGETED — it gives up after `nodeBudget` assignments and reports
// that it gave up. Retrying is the caller's decision, because the caller knows
// what to vary (see puzzle.js: first the ordering jitter, then the grid). This
// is a restart strategy, and restarts are how the heavy tail is cut off:
// re-rolling a stuck search is enormously cheaper than finishing it.
//
// DETERMINISM. Every choice comes from the injected `rand`. No Math.random, no
// clock, no iteration over anything whose order is not fixed by the data.

//
// ------------------------------------------------------------ ON SPEED ----
//
// AC-3 is only worth having if an arc is cheap, and the first working version
// was not: it recomputed a slot's permitted letters from scratch at every
// visit, and narrowed a domain by building the union of the letters it was
// KEEPING. Both are backwards, and together they made a 15x15 take minutes.
// Two changes fixed it, and both are the same idea — work proportional to what
// CHANGED, not to what is:
//
//   * a slot's letter masks are cached and invalidated when its domain moves,
//     and computed by enumerating the words when the domain is small enough
//     that enumerating is cheaper than probing 26 letters;
//   * narrowing clears the letters being REMOVED (usually one or two) instead
//     of intersecting with the union of the letters being kept (usually
//     twenty-odd). Same result, an order of magnitude less memory traffic.

import { andIntoAt, andNotAt, popcount, forEachBit, intersectsAt } from './lexicon.js';

/**
 * Give up after this many assignments unless the caller says otherwise.
 *
 * Deliberately small, and measured: on fifteen 15x15 grids, raising the budget
 * from 1,200 to 3,000 moved the fill rate from 11 to 12, and DOUBLED the time
 * spent on the three that were never going to work. A budget does not buy
 * puzzles, it buys a longer wait before the restart that was always going to be
 * the thing that worked. See puzzle.js for the restart ladder.
 */
export const DEFAULT_NODE_BUDGET = 2500;

/**
 * How many candidate words to try in a slot before backtracking out of it.
 * Unbounded is worse, not better: the 300th-best candidate for a slot whose
 * first dozen all failed is not the problem, the slot ABOVE it is, and trying
 * the other 288 is how a search spends its whole budget in one subtree. Going
 * the other way is measurably worth it up to about here and then flat — 8, 14,
 * 25 and 40 filled 7, 8, 11 and 12 of the same fifteen grids; 70 and 120 also
 * filled 12, more slowly.
 */
export const DEFAULT_BRANCH_CAP = 40;

/**
 * Spread, in rank units, of the noise added when ordering candidates.
 *
 * Ordering purely by rank gives the best words and the same puzzle every time
 * for a given shape — the commonest word that fits, everywhere. Ordering purely
 * at random gives a grid full of obscurities. The noise buys variety per seed
 * while keeping the fill in the common part of the list: at a spread of 6000
 * over a 50,000-word list a word can beat one ranked ~6,000 better than it, so
 * neighbours in frequency shuffle and the tail stays in the tail.
 */
export const DEFAULT_JITTER = 6000;

/**
 * What a difficulty means: answers ranked worse than `softMax` cost `PENALTY`
 * extra when candidates are ordered, so they are used only where nothing better
 * fits.
 *
 * A SOFT limit, and the softness is the whole design. The obvious thing is to
 * cut the list off — easy means the commonest 20,000 answers and nothing else —
 * and it was tried and measured, and it does not work: on a 15x15 the same
 * grids filled 12 times out of 15 from the full list and 4 times out of 15 from
 * the commonest 20,000. Crossword fill is mostly short words, short words are
 * where a lexicon is thinnest — 711 of the 50,000 answers are three letters —
 * and halving the list halves those too. The grid stops filling long before the
 * puzzle gets meaningfully easier.
 *
 * A penalty gets what a cutoff was for without the cliff. The fill reaches past
 * `softMax` only in the handful of squares where it must, so an easy puzzle is
 * an easy puzzle with two or three awkward crossings in it — which is what an
 * easy puzzle in a newspaper is. This is how a human constructor's scored word
 * list behaves, for the same reason.
 *
 * BE HONEST ABOUT WHAT THIS DOES, WHICH IS NOT MUCH. Measured over a hundred
 * filled grids, `softMax` and `jitter` move the 90th-percentile answer rank by
 * a few thousand and no more, because the obscure answers in a fill come from
 * the squares where NOTHING else fits, and no preference helps where there is
 * no choice. The knob that works is `density` — a blockier grid has shorter
 * entries, more choice per square, and commoner answers throughout. It is
 * listed first here because it is the one doing the work.
 */
export const DIFFICULTIES = {
  easy: { density: 0.40, softMax: 14000, jitter: 3000, label: 'Easy' },
  medium: { density: 0.36, softMax: 30000, jitter: 6000, label: 'Medium' },
  hard: { density: 0.33, softMax: Infinity, jitter: 12000, label: 'Hard' },
};

/**
 * What a word past `softMax` costs. Large enough that no amount of jitter puts
 * one ahead of an in-range word, small enough to stay well clear of overflow.
 */
const PENALTY = 1e6;

/** How many of a slot's allowed words to consider before picking among them. */
const CANDIDATE_POOL = 220;

/**
 * Above this many surviving words, read a domain's permitted letters by probing
 * 26 letters per position rather than by walking the words. The crossover
 * scales with the bitset's width because that is what a probe costs when it
 * misses. See masksOf.
 */
const probeAbove = (stride) => 6 * stride + 64;

/**
 * How many slots one assignment may revise before propagation gives up and lets
 * the search find out the hard way.
 *
 * Run to a fixpoint, AC-3 revises ninety slots per assignment on a 15x15 — a
 * full sweep of the grid and then some, every time a word is placed. It is not
 * wasted work, it just costs more than it returns: on the same fifteen grids,
 * unbounded propagation filled 12 and bounded-at-30 filled 10, in 2.5 times
 * less wall clock. Since a failed grid is answered by restarting rather than by
 * persevering (see puzzle.js), the throughput is what matters, and cheap
 * attempts win. Below about 20 it collapses — at 15 the same grids filled 3.
 */
export const DEFAULT_PROPAGATION_POPS = 32;

/**
 * Fill `grid` from `lexicon`.
 *
 * @param {{size:number, blocks:Uint8Array, slots:object[], crossings:Int32Array}} grid
 * @param {import('./lexicon.js').Lexicon} lexicon
 * @param {() => number} rand seeded
 * @param {{softMax?: number, maxRank?: number, nodeBudget?: number, branchCap?: number,
 *          jitter?: number, maxPops?: number}} [opts]
 * @returns {{ok: boolean, letters: Uint8Array|null, words: string[]|null, nodes: number, reason?: string}}
 */
export function fillGrid(grid, lexicon, rand, opts = {}) {
  // `maxRank` is a hard exclusion and stays available — the selftest uses it to
  // check that an impossible pool is reported rather than searched for — but
  // difficulty is expressed with `softMax`. See DIFFICULTIES.
  const maxRank = opts.maxRank ?? Infinity;
  const softMax = opts.softMax ?? Infinity;
  const nodeBudget = opts.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const branchCap = opts.branchCap ?? DEFAULT_BRANCH_CAP;
  const jitter = opts.jitter ?? DEFAULT_JITTER;
  const maxPops = opts.maxPops ?? DEFAULT_PROPAGATION_POPS;

  const { size, slots, crossings, posIn } = grid;
  const n = size * size;
  const fail = (reason, nodes = 0) => ({ ok: false, letters: null, words: null, nodes, reason });

  // Pools are per LENGTH and shared by every slot of that length, so they are
  // built once; a slot's own bitset starts as a copy of one.
  const pools = new Map();
  for (const s of slots) {
    if (pools.has(s.len)) continue;
    const idx = lexicon.index(s.len);
    if (!idx) return fail(`no answers of length ${s.len}`);
    const pool = idx.pool(maxRank);
    if (popcount(pool) === 0) return fail(`difficulty leaves no answers of length ${s.len}`);
    pools.set(s.len, pool);
  }

  const state = slots.map((slot) => {
    const idx = lexicon.index(slot.len);
    const bits = pools.get(slot.len).slice();
    return {
      slot, idx, bits,
      count: popcount(bits),
      word: -1,
      /** Cached permitted-letter mask per position; `masksOk` is the validity flag. */
      masks: new Int32Array(slot.len),
      masksOk: false,
    };
  });

  /** letters[cell] = 0 when empty, else the letter index + 1. */
  const letters = new Uint8Array(n);
  /** Answers already placed — a puzzle never repeats one. */
  const used = new Set();
  let nodes = 0;
  let exhausted = false;

  /**
   * The letters slot `st` still permits at each position, as 26-bit masks.
   *
   * This is the hottest function in the generator — it was 70% of the running
   * time in the first version that was fast enough to measure — so it is
   * written to touch as little as possible. It walks the domain bitset one
   * 32-word GROUP at a time and takes whichever of two shortcuts applies:
   *
   *   * an empty group contributes nothing and is skipped outright;
   *   * a COMPLETE group contributes a mask the lexicon precomputed, so
   *     thirty-two words are read in one step.
   *
   * Only partial groups are walked word by word, out of a flat Uint8Array of
   * letter indices rather than out of JavaScript strings. Late in a fill almost
   * every group is empty, so this is fast exactly when it is called most.
   *
   * A domain too big for that gets probed instead — see the branch below. Both
   * paths were measured; each is roughly twice the speed of the other on the
   * domains it is not for.
   */
  function masksOf(st) {
    if (st.masksOk) return st.masks;
    const idx = st.idx;
    const len = idx.len;
    const masks = st.masks;
    const bits = st.bits;
    if (st.count > probeAbove(idx.stride)) {
      // A big domain permits nearly every letter nearly everywhere, so ASKING
      // is cheaper than reading: `intersectsAt` bails on the first word that
      // has the letter, which for a present letter is almost immediate. It is
      // the absent letters that cost a full scan, and a big domain has few.
      for (let p = 0; p < len; p++) {
        let m = 0;
        for (let l = 0; l < 26; l++) {
          if (intersectsAt(bits, idx.bits, idx.blockAt(p, l))) m |= 1 << l;
        }
        masks[p] = m;
      }
      st.masksOk = true;
      return masks;
    }

    masks.fill(0);
    const { groupLetters, groupFull, letters } = idx;
    for (let g = 0; g < bits.length; g++) {
      const v = bits[g];
      if (v === 0) continue;
      if (v === groupFull[g]) {
        // The whole group survives: its letters are known in advance.
        const base = g * len;
        for (let p = 0; p < len; p++) masks[p] |= groupLetters[base + p];
        continue;
      }
      let rest = v;
      while (rest) {
        const lsb = rest & -rest;
        const w = (g << 5) + (31 - Math.clz32(lsb));
        const base = w * len;
        for (let p = 0; p < len; p++) masks[p] |= 1 << letters[base + p];
        rest ^= lsb;
      }
    }
    st.masksOk = true;
    return masks;
  }

  /**
   * The letters slot `st` permits at ONE position.
   *
   * The same question as masksOf, asked about a single square, and worth its own
   * function because that is how propagation asks it: the slot being revised
   * needs all its positions, but each slot CROSSING it needs exactly one. Doing
   * the whole row of positions for every crossing was most of the remaining
   * running time — the work is proportional to the entry's length, and it was
   * being thrown away len - 1 times out of len.
   */
  function maskAt(st, p) {
    if (st.masksOk) return st.masks[p];
    const idx = st.idx;
    const bits = st.bits;
    if (st.count > probeAbove(idx.stride)) {
      let m = 0;
      for (let l = 0; l < 26; l++) {
        if (intersectsAt(bits, idx.bits, idx.blockAt(p, l))) m |= 1 << l;
      }
      return m;
    }
    const len = idx.len;
    const { groupLetters, groupFull, letters } = idx;
    let m = 0;
    for (let g = 0; g < bits.length; g++) {
      const v = bits[g];
      if (v === 0) continue;
      if (v === groupFull[g]) { m |= groupLetters[g * len + p]; continue; }
      let rest = v;
      while (rest) {
        const lsb = rest & -rest;
        m |= 1 << letters[(((g << 5) + (31 - Math.clz32(lsb))) * len) + p];
        rest ^= lsb;
      }
    }
    return m;
  }

  /**
   * Drop from `st` every word using a letter of `removeMask` at `p`.
   * Clearing what goes, rather than intersecting with the union of what stays:
   * `removeMask` normally holds one or two letters and the complement holds
   * twenty-odd, and this loop is the hot one.
   */
  function excludeLetters(st, p, removeMask) {
    const idx = st.idx;
    for (let l = 0; l < 26; l++) {
      if (!(removeMask & (1 << l))) continue;
      andNotAt(st.bits, idx.bits, idx.blockAt(p, l));
    }
    st.masksOk = false;
    return popcount(st.bits);
  }

  /** Slots already waiting in the propagation queue — dedup, not correctness. */
  const queued = new Uint8Array(state.length);

  /**
   * AC-3 from `queue`, recording undo state into `trail`.
   * @returns {boolean} false as soon as some arc has no support left
   */
  function propagate(queue, trail) {
    let budget = maxPops;
    while (queue.length) {
      // Out of propagation budget: what is left in the queue is simply not
      // revised. Sound — under-propagating never prunes a legal fill, it only
      // lets the search discover the contradiction later.
      if (budget-- <= 0) return true;
      const si = queue.pop();
      queued[si] = 0;
      const st = state[si];
      if (st.word >= 0) continue;
      const mine = masksOf(st);
      for (let p = 0; p < st.slot.cells.length; p++) {
        const cell = st.slot.cells[p];
        if (letters[cell]) continue; // pinned: both sides already agree here
        const cj = crossings[cell * 2 + (st.slot.dir === 'A' ? 1 : 0)];
        if (cj < 0 || cj === si) continue;
        const other = state[cj];
        if (other.word >= 0) continue;
        const q = posIn[cell * 2 + (st.slot.dir === 'A' ? 1 : 0)];
        const theirs = maskAt(other, q);
        const common = mine[p] & theirs;
        if (!common) return false;
        if (common !== mine[p]) {
          trail.save(si);
          st.count = excludeLetters(st, p, mine[p] & ~common);
          if (!st.count) return false;
          if (!queued[si]) { queued[si] = 1; queue.push(si); }
          // The exclusion invalidated the cache, and recomputing it here — 26
          // probes per position, inside the innermost loop — was most of the
          // running time of the first version that worked. It is not needed:
          // only position `p` is known to have changed, the other positions'
          // masks can now only be too GENEROUS, and a too-generous mask makes
          // propagation miss a pruning opportunity but never take a wrong one.
          // The slot has just been re-queued, so the next visit sees the truth.
          mine[p] = common;
        }
        if (common !== theirs) {
          trail.save(cj);
          other.count = excludeLetters(other, q, theirs & ~common);
          if (!other.count) return false;
          if (!queued[cj]) { queued[cj] = 1; queue.push(cj); }
        }
      }
    }
    return true;
  }

  /**
   * Place `wordIdx` in slot `si`: pin its letters, narrow every crossing, then
   * propagate.
   * @returns {object|null} the undo record, or null if the placement is dead
   */
  function assign(si, wordIdx) {
    const st = state[si];
    const word = st.idx.words[wordIdx];
    const cells = [];
    const savedList = [];
    const savedSet = new Set();
    const trail = {
      cells,
      saved: savedList,
      /** Saves a slot's ORIGINAL domain; a second call for the same slot is a no-op. */
      save(k) {
        if (savedSet.has(k)) return;
        savedSet.add(k);
        savedList.push({ si: k, bits: state[k].bits.slice(), count: state[k].count });
      },
    };
    const queue = [];
    let ok = true;

    for (let p = 0; p < st.slot.cells.length && ok; p++) {
      const cell = st.slot.cells[p];
      const letter = word.charCodeAt(p) - 65;
      if (letters[cell]) continue; // already pinned, and the domain guaranteed agreement
      letters[cell] = letter + 1;
      cells.push(cell);

      const cj = crossings[cell * 2 + (st.slot.dir === 'A' ? 1 : 0)];
      if (cj < 0 || cj === si) continue;
      const other = state[cj];
      if (other.word >= 0) continue;
      trail.save(cj);
      const q = posIn[cell * 2 + (st.slot.dir === 'A' ? 1 : 0)];
      other.count = andIntoAt(other.bits, other.idx.bits, other.idx.blockAt(q, letter));
      other.masksOk = false;
      if (other.count === 0) ok = false; // forward check: this crossing is dead
      else if (!queued[cj]) { queued[cj] = 1; queue.push(cj); }
    }

    if (ok) ok = propagate(queue, trail);
    // However it ended, the queue flags must not leak into the next call.
    for (const k of queue) queued[k] = 0;

    if (!ok) { undo(trail); return null; }
    st.word = wordIdx;
    used.add(word);
    return trail;
  }

  function undo(trail) {
    for (const cell of trail.cells) letters[cell] = 0;
    for (const s of trail.saved) {
      const st = state[s.si];
      st.bits.set(s.bits);
      st.count = s.count;
      st.masksOk = false;
    }
  }

  /** The unassigned slot to work on next: fewest candidates, then most crossings. */
  function pickSlot() {
    let best = -1, bestCount = Infinity, bestDegree = -1;
    for (let i = 0; i < state.length; i++) {
      const st = state[i];
      if (st.word >= 0 || st.count > bestCount) continue;
      let degree = 0;
      for (const cell of st.slot.cells) if (!letters[cell]) degree++;
      if (st.count < bestCount || degree > bestDegree) {
        best = i; bestCount = st.count; bestDegree = degree;
      }
    }
    return best;
  }

  /**
   * The candidates worth trying in a slot: the best `branchCap` of them, ranked
   * by frequency plus seeded noise.
   *
   * The obvious implementation walks the slot's whole domain, and the whole
   * domain of an open seven-letter slot is 7,879 words — scored, shuffled and
   * discarded, at every node. It was most of the running time.
   *
   * So the domain is only ever walked when it is SMALL. When it is big, the
   * lexicon's rank-ordered index is walked instead, taking the first
   * `CANDIDATE_POOL` words the slot still allows: the commonest words that fit,
   * found without touching the rest. Both paths end with the same seeded
   * jitter over a small pool, and both stop early — which is the point, since a
   * fill that has to reach past the two hundredth-commonest word that fits is
   * not going to be a fill anybody enjoys solving.
   */
  function candidates(si) {
    const st = state[si];
    const pool = [];
    if (st.count <= CANDIDATE_POOL) {
      forEachBit(st.bits, (w) => pool.push(w));
    } else {
      const order = st.idx.byRank;
      const bits = st.bits;
      for (let i = 0; i < order.length && pool.length < CANDIDATE_POOL; i++) {
        const w = order[i];
        if (bits[w >>> 5] & (1 << (w & 31))) pool.push(w);
      }
    }

    const ranks = st.idx.ranks;
    const bestIdx = [];
    const bestKey = [];
    for (const w of pool) {
      const key = ranks[w] + (ranks[w] > softMax ? PENALTY : 0) + rand() * jitter;
      if (bestIdx.length === branchCap && key >= bestKey[bestKey.length - 1]) continue;
      let at = bestIdx.length;
      while (at > 0 && bestKey[at - 1] > key) at--;
      bestIdx.splice(at, 0, w);
      bestKey.splice(at, 0, key);
      if (bestIdx.length > branchCap) { bestIdx.pop(); bestKey.pop(); }
    }
    return bestIdx;
  }

  function search(assigned) {
    if (assigned === state.length) return true;
    if (nodes >= nodeBudget) { exhausted = true; return false; }

    const si = pickSlot();
    if (si < 0 || state[si].count === 0) return false;

    for (const w of candidates(si)) {
      const word = state[si].idx.words[w];
      if (used.has(word)) continue;
      nodes++;
      const trail = assign(si, w);
      if (!trail) continue;
      if (search(assigned + 1)) return true;
      state[si].word = -1;
      used.delete(word);
      undo(trail);
      if (exhausted) return false;
    }
    return false;
  }

  if (!search(0)) {
    return fail(exhausted ? 'budget exhausted' : 'no fill exists for this grid', nodes);
  }
  return { ok: true, letters, words: state.map((st) => st.idx.words[st.word]), nodes };
}
