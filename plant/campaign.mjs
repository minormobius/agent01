// campaign.mjs — the six levels as ONE GAME: entered one at a time, won, left
// in an order that is COMPUTED rather than claimed.
//
// Vision item 1 names this module and its verbs: "the game's control logic
// lives in a module, not in event handlers, so a test can drive it without a
// browser: start(), place(...), verdict(), next()". This is that module. It
// touches no DOM, reads no event, and holds no randomness, so
// plant/test/campaign.selftest.mjs can play the whole game through and assert
// what happened.
//
// SCOPE: the module and its gate. It does NOT wire index.html — the page is
// still six sections read top to bottom, and turning it into one-level-at-a-
// time is the follow-up. Nothing here imports or assumes a page.
//
// ------------------------------------------------------- the difficulty order
//
// The levels ship numbered 1..6 by the order they were built, which is not the
// order they should be played in. vision.md suggests sorting by feasibility
// margin, AND THAT MEASURE IS WRONG HERE: LEVEL_1 ships at margin 0.02
// ("barely satisfiable by design") while LEVEL_6 ships at margin 0 and LEVEL_5
// at 0 too — the shipped margin measures how taut the DESIGNER left the knob,
// not how hard the PUZZLE is. Sorting on it would make the tutorial level the
// hardest one in the game.
//
// The measure used instead is the WIN FRACTION: of all the settings the player
// is actually offered, what proportion of them win. A level where four settings
// in five succeed is a level you can stumble into; a level where one in eight
// does is one you have to reason about. It is a property of the puzzle and of
// the control, it is finite, and it is computed with no search and no opinion —
// sweep the declared domain, call the same feasible() the gates call, count.
//
// EACH KNOB'S DOMAIN IS EXACTLY WHAT THE PAGE OFFERS, which is what keeps this
// from being a number chosen to produce a pleasing answer: `samples` for each
// level is the range and step of that level's own control in index.html today
// (ore 10..120 step 1; miner and smelter3 10..100 step 1; ore4 60..140 step 1;
// shareA5 and shareA6 0.05..0.95 step 0.01) or, for LEVEL_2, its three
// buttons. If the page ever changes a control's range it changes this measure,
// and it SHOULD: the difficulty of a puzzle you play through a slider is a
// property of the slider too. The follow-up that wires the page must take its
// control bounds from here rather than keeping a second copy.
//
// Fractional values are built as `p / 100` from integers rather than by
// accumulating `+= 0.01`, so the domain is exactly the set of decimals the page
// shows and every member is the same double a literal would give.
//
// COST: computing ORDER at module load sweeps every domain once — about 8,600
// feasible() calls, dominated by LEVEL_3's 91x91 grid. Small networks, so this
// is tens of milliseconds, but it is not free and it happens at import. It is
// not timed here (this tree has a frame-budget harness and this is not it); if
// it ever matters, LEVEL_3's declared step is the whole cost.
//
// ---------------------------------------------------------------- what a knob is
//
// The six levels do not share a control shape, and pretending they do is how a
// campaign module ends up reimplementing the levels. Each entry declares its
// own knob — the FINITE set of settings the player may choose from, and an
// `apply` that turns one of them into a level. Every `apply` calls the level's
// OWN helper (withSourceRate / withProcessorCapacity from level-view.js,
// SMELTER_OPTIONS from level2.mjs, withShareA from level5.mjs and level6.mjs).
// No level mutation is reimplemented here; if a level changes how it is played,
// it changes in one place.

import { feasible, band, autoSplit } from './production.mjs';
import { withSourceRate, withProcessorCapacity } from './level-view.js';
import { LEVEL_1 } from './levels/level1.mjs';
import { LEVEL_2_BASE, SMELTER_OPTIONS } from './levels/level2.mjs';
import { LEVEL_3 } from './levels/level3.mjs';
import { LEVEL_4 } from './levels/level4.mjs';
import { LEVEL_5, withShareA as withShareA5 } from './levels/level5.mjs';
import { LEVEL_6, withShareA as withShareA6 } from './levels/level6.mjs';

/** Words a blurb may not contain. One array, read by this file and by its gate. */
export const BANNED = Object.freeze([
  'oracle', 'feasibility', 'feasible', 'margin', 'anisotropy', 'anisotropic', 'satisfiable',
]);

const intRange = (lo, hi) => {
  const out = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
};

/** `lo/100 .. hi/100` inclusive — built from integers so no error accumulates. */
const pctRange = (lo, hi) => intRange(lo, hi).map((p) => p / 100);

const grid = (as, bs, f) => {
  const out = [];
  for (const a of as) for (const b of bs) out.push(f(a, b));
  return out;
};

/**
 * A knob: the finite declared domain of one level's control, plus how a member
 * of it becomes a level.
 *
 * `key` exists because membership has to work for an object setting (LEVEL_3
 * moves two capacities at once) and has to be robust for a float one. It is the
 * string a value is recognised by, so `move({miner: 70, smelter: 45})` matches
 * even though the object is not the one in `samples`, and `move(0.1 + 0.2)`
 * does NOT match 0.3 — which is deliberate. The domain is DECLARED and finite;
 * a caller should pass a member of `samples` (a slider gives an index), and a
 * value that drifted off the grid is a bug worth refusing rather than rounding.
 *
 * Throws at module load if `start` is not itself in the domain — an opening
 * setting the player could not have chosen is a contradiction, and the cheapest
 * place to find out is import time.
 */
function knob({ kind, samples, start, apply, key = String }) {
  const keys = new Set(samples.map(key));
  if (!keys.has(key(start))) {
    throw new Error(`campaign: start value ${key(start)} is not in the declared ${kind} domain`);
  }
  return { kind, samples, start, apply, key, keys };
}

const optionById = (id) => SMELTER_OPTIONS.find((o) => o.id === id);

/**
 * The six shipped levels. `base` is the level literal exactly as its own module
 * exports it — never mutated, only read.
 *
 * `autoSplit: true` on LEVEL_4 and nowhere else: its two fan-out edges carry no
 * explicit `share`, so it is not valid input to feasible() until autoSplit()
 * fills them (plant/test/level4.selftest.mjs asserts that refusal, and this
 * file's gate re-proves it so the flag cannot quietly stop being load-bearing).
 * Every other level is either a straight line or carries explicit shares.
 *
 * `blurb` is one sentence for someone who has never seen this, and it is
 * checked against BANNED. The titles deliberately do not carry level numbers:
 * the play order below is not the file order, so "Level 2" on the third screen
 * would be a lie the moment anything is reordered.
 */
export const LEVELS = Object.freeze([
  {
    id: 'level1',
    title: 'The ore line',
    blurb: 'Move the ore supply up or down until the depot gets every gear it asked for.',
    base: LEVEL_1,
    knob: knob({
      kind: 'rate',
      samples: intRange(10, 120),
      start: 120,
      apply: (level, rate) => withSourceRate(level, rate),
    }),
  },
  {
    id: 'level2',
    title: 'Three smelters',
    blurb: 'Three smelters sit on the shelf: pick the one that keeps the depot full.',
    base: LEVEL_2_BASE,
    knob: knob({
      kind: 'choice',
      samples: SMELTER_OPTIONS.map((o) => o.id),
      start: 'cheap',
      apply: (level, id) => withProcessorCapacity(level, 'smelter', optionById(id).capacity),
    }),
  },
  {
    id: 'level3',
    title: 'Two machines in a row',
    blurb: 'Two machines feed each other in a line, and the smaller of the two decides what reaches the depot.',
    base: LEVEL_3,
    knob: knob({
      kind: 'capacities',
      samples: grid(intRange(10, 100), intRange(10, 100), (miner, smelter) => ({ miner, smelter })),
      start: { miner: 70, smelter: 45 },
      // Defensive on purpose: `move(null)` must be REFUSED, and a key function
      // that reads a property off its argument would throw instead.
      key: (v) => (v && typeof v === 'object' ? `${v.miner}x${v.smelter}` : String(v)),
      apply: (level, v) => withProcessorCapacity(
        withProcessorCapacity(level, 'miner', v.miner), 'smelter', v.smelter,
      ),
    }),
  },
  {
    id: 'level4',
    title: 'One vein, two stockpiles',
    blurb: 'One ore vein now feeds two stockpiles at once, so it has to be big enough for both.',
    base: LEVEL_4,
    autoSplit: true,
    knob: knob({
      kind: 'rate',
      samples: intRange(60, 140),
      start: 102,
      apply: (level, rate) => withSourceRate(level, rate),
    }),
  },
  {
    id: 'level5',
    title: 'One well, two fields',
    blurb: 'One well, two fields: choose how much water goes left before the other side dries out.',
    base: LEVEL_5,
    knob: knob({
      kind: 'share',
      samples: pctRange(5, 95),
      start: 30 / 100,
      apply: (level, shareA) => withShareA5(level, shareA),
    }),
  },
  {
    id: 'level6',
    title: 'Two recipes',
    blurb: 'Two recipes turn ore into ingots at different rates, so decide which one gets the ore.',
    base: LEVEL_6,
    knob: knob({
      kind: 'share',
      samples: pctRange(5, 95),
      start: 40 / 100,
      apply: (level, shareA) => withShareA6(level, shareA),
    }),
  },
]);

const BY_ID = new Map(LEVELS.map((e) => [e.id, e]));

/** The entry for `id`, or a throw naming it — a typo must not read as an empty game. */
export function entryOf(id) {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`campaign: no level ${id}`);
  return e;
}

/** The level `value` produces, ready for feasible() — split filled where needed. */
export function buildNetwork(entry, value) {
  const net = entry.knob.apply(entry.base, value);
  return entry.autoSplit ? autoSplit(net) : net;
}

/** feasible() on that network. The same oracle the level gates call, unwrapped. */
export function grade(entry, value) {
  return feasible(buildNetwork(entry, value));
}

/**
 * The fraction of this level's declared settings that win. Deterministic, no
 * search, no model: sweep, count, divide.
 */
export function winFraction(entry) {
  let wins = 0;
  for (const value of entry.knob.samples) if (grade(entry, value).ok) wins++;
  return wins / entry.knob.samples.length;
}

/** `{ id: fraction }` for every level, computed once at load. */
export const WIN_FRACTION = Object.freeze(
  Object.fromEntries(LEVELS.map((e) => [e.id, winFraction(e)])),
);

/**
 * Sort comparator over `{ id, win }`: most-winning first (easiest first), ties
 * broken by id ascending so the order is total and stable regardless of the
 * engine's sort. Exported so the tie rule is testable without needing two real
 * levels to tie — today none do.
 */
export function byDifficulty(a, b) {
  if (b.win !== a.win) return b.win - a.win;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The play order. COMPUTED from WIN_FRACTION, not written down. */
export const ORDER = Object.freeze(
  LEVELS.map((e) => ({ id: e.id, win: WIN_FRACTION[e.id] })).sort(byDifficulty).map((r) => r.id),
);

const num = (x) => Number(x.toFixed(2));
const copy = (v) => (v && typeof v === 'object' ? { ...v } : v);

/**
 * One sentence about the current state, for someone who has never read this
 * repository. It is NOT level-view.js's verdictLine(): that one speaks the
 * inspector's vocabulary ("satisfiable"), which is exactly the vocabulary a
 * first screen must not use.
 *
 * A failure names EVERY sink that fell short, not the first — verdictLine
 * shipped reading `deficits[0]` and had to be fixed, and the same mistake is
 * not going to be made again here.
 */
function sentence(v) {
  if (!v.ok) {
    if (v.deficits.length === 0) return '✗ This does not work yet.';
    const parts = v.deficits.map(
      (d) => `${d.sinkId} wanted ${num(d.demand)} ${d.resource} and got ${num(d.achieved)}`,
    );
    return `✗ ${parts.join('; ')}.`;
  }
  const pct = Math.round(v.margin * 100);
  const spare = pct > 0 ? `with ${pct}% to spare` : 'with nothing to spare';
  return `✓ Everything is fed, ${spare} (${band(v.margin)}).`;
}

/**
 * One player, one game. No DOM, no events, no randomness — every method is a
 * pure function of the moves made so far.
 *
 * TWO SENSES OF "ok", kept apart on purpose because a renderer will meet both:
 *   · `move()` returns `{ accepted }` — did the game take this setting?
 *   · `verdict()` returns `{ ok }`    — does the factory work right now?
 * They are different questions and a shared field name would be read wrong
 * exactly once, in the page, silently.
 *
 * `won` is `ok && moves > 0`: a level opens already fed on five of the six, and
 * a level you win by arriving is not a level. The player has to have ACTED,
 * which is vision item 1's bar ("an intention they formed, acted on") restated
 * as a state machine. Reversing this is deleting one clause.
 */
export class Campaign {
  constructor() {
    this.start();
  }

  /** The level being played. */
  get id() {
    return ORDER[this.index];
  }

  get entry() {
    return entryOf(this.id);
  }

  /** Enter ORDER[0] and forget everything. Returns the opening state. */
  start() {
    this.index = 0;
    this.finished = false;
    this._enter();
    return this.state();
  }

  _enter() {
    this.value = copy(this.entry.knob.start);
    this.moves = 0;
  }

  /**
   * Choose a setting. A value outside the declared domain is REFUSED — not
   * thrown, and it costs no move: a rejected setting was never applied, so
   * charging the player for it would punish a caller bug as if it were a
   * mistake, and a throw would put a try/catch in every event handler the
   * follow-up writes.
   */
  move(value) {
    if (this.finished) {
      return { accepted: false, reason: 'finished', value: copy(this.value), moves: this.moves };
    }
    const k = this.entry.knob;
    if (!k.keys.has(k.key(value))) {
      return { accepted: false, reason: 'not-a-setting', value: copy(this.value), moves: this.moves };
    }
    this.value = copy(value);
    this.moves += 1;
    return { accepted: true, reason: null, value: copy(this.value), moves: this.moves };
  }

  /**
   * feasible()'s own result, plus `won`, `line` and the `network` it was
   * computed from. The spread is deliberate: the result is a valid verdict for
   * level-view.js's drawLevel(), so the follow-up can render the board without
   * a second call and without this file duplicating a field of it.
   */
  verdict() {
    const network = buildNetwork(this.entry, this.value);
    const v = feasible(network);
    return { ...v, won: v.ok && this.moves > 0, line: sentence(v), network };
  }

  /**
   * Advance exactly one level and return its id, or return null and finish.
   * NEVER WRAPS: past the last level `finished` latches true, the id stays put,
   * and every further call returns null.
   *
   * It does not require a win. The module is mechanism and the page is policy —
   * the page offers the button when `won`; a module that refuses to advance
   * leaves a stuck stranger with no way out and nobody to ask.
   */
  next() {
    if (this.finished) return null;
    if (this.index >= ORDER.length - 1) {
      this.finished = true;
      return null;
    }
    this.index += 1;
    this._enter();
    return this.id;
  }

  /** A plain, detached snapshot — mutating it does nothing to the game. */
  state() {
    return {
      id: this.id,
      index: this.index,
      total: ORDER.length,
      value: copy(this.value),
      moves: this.moves,
      finished: this.finished,
    };
  }
}
