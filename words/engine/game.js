// The game itself: seats, turns, and the four things a player can do.
//
// A state is plain JSON — the worker stores it in D1 as a blob and the browser
// stores the same shape in localStorage for offline play, so the rules run
// identically in both places and an offline game can be handed to the server
// later without translation.
//
// Hidden information lives in this object (every rack, and the bag order), so
// nothing here goes to a client unredacted. `redact()` is the only function
// that produces something safe to send, and the worker calls it on every path
// out.

import { newBoard, DEFAULT_LAYOUT, LAYOUTS, assertLayouts, squares } from './board.js';
import { newBag, refill, draw, returnToBag, rackValue, RACK_SIZE, BLANK } from './tiles.js';
import { validatePlay, scorePlay, spendRack, isEmpty } from './rules.js';

export const MIN_SEATS = 1;
export const MAX_SEATS = 4;
/** Consecutive scoreless turns, per seat, that end a game (6 in a two-player). */
export const SCORELESS_PER_SEAT = 3;
/** A bag this empty cannot be exchanged against. */
export const MIN_BAG_TO_EXCHANGE = RACK_SIZE;

export const AI_LEVELS = ['mild', 'steady', 'sharp'];

/**
 * Start a game.
 * @param {object} opts
 * @param {string} opts.seed        fixes the bag, and so the whole game
 * @param {string} opts.layout      a board id from LAYOUTS
 * @param {Array}  opts.seats       [{ name, kind: 'human'|'bot', level }]
 */
export function newGame({ seed, layout = DEFAULT_LAYOUT, seats }) {
  assertLayouts();
  if (!LAYOUTS[layout]) throw new Error(`unknown layout: ${layout}`);
  if (!Array.isArray(seats) || seats.length < MIN_SEATS || seats.length > MAX_SEATS) {
    throw new Error(`a game seats ${MIN_SEATS}-${MAX_SEATS} players`);
  }
  const bag = newBag(seed);
  const state = {
    version: 1,
    seed: String(seed),
    layout,
    board: newBoard(),
    bag,
    turn: 0,
    ply: 0,
    scoreless: 0,
    status: 'active',   // active | done
    seats: seats.map((s, i) => ({
      seat: i,
      name: s.name || (s.kind === 'bot' ? `Bot ${i + 1}` : `Player ${i + 1}`),
      kind: s.kind === 'bot' ? 'bot' : 'human',
      level: s.kind === 'bot' ? (AI_LEVELS.includes(s.level) ? s.level : 'steady') : null,
      // A seat nobody has claimed yet. Offline every seat is filled the moment
      // the game starts; online, the invited seats sit open until someone opens
      // the link, and the lobby needs to be able to say so.
      joined: s.joined !== false,
      score: 0,
      rack: [],
    })),
    history: [],
    ended: null,        // { reason, out: seat|null, adjustments: [{seat, delta}] }
  };
  for (const s of state.seats) refill(s.rack, state.bag);
  return state;
}

const err = (error) => ({ ok: false, error });

function turnGuard(state, seat) {
  if (state.status !== 'active') return err('the game is over');
  if (seat !== state.turn) return err('not your turn');
  return null;
}

function advance(state) {
  state.ply++;
  state.turn = (state.turn + 1) % state.seats.length;
}

/**
 * End the game and settle racks. Two endings:
 *   - someone went out: they take the sum of every other rack, the others each
 *     lose their own (the classic settlement, and the reason a bad endgame rack
 *     costs twice)
 *   - everyone stalled: each player just loses their own rack
 */
function finish(state, reason, outSeat = null) {
  const adjustments = [];
  if (outSeat !== null) {
    let pot = 0;
    for (const s of state.seats) {
      if (s.seat === outSeat) continue;
      const v = rackValue(s.rack);
      if (v) { s.score -= v; adjustments.push({ seat: s.seat, delta: -v }); }
      pot += v;
    }
    if (pot) {
      state.seats[outSeat].score += pot;
      adjustments.push({ seat: outSeat, delta: pot });
    }
  } else {
    for (const s of state.seats) {
      const v = rackValue(s.rack);
      if (v) { s.score -= v; adjustments.push({ seat: s.seat, delta: -v }); }
    }
  }
  state.status = 'done';
  state.ended = { reason, out: outSeat, adjustments };

  const best = Math.max(...state.seats.map((s) => s.score));
  state.ended.winners = state.seats.filter((s) => s.score === best).map((s) => s.seat);
  return state;
}

/** Play tiles. `placements` is [{ i, letter, blank }]. */
export function applyPlay(state, seat, placements, dawg) {
  const guard = turnGuard(state, seat);
  if (guard) return guard;

  const legal = validatePlay(state, placements, dawg);
  if (!legal.ok) return err(legal.error);

  const player = state.seats[seat];
  const spend = spendRack(player.rack, placements);
  if (!spend.ok) return err(spend.error);

  const scored = scorePlay(state, placements);
  for (const p of placements) {
    state.board[p.i] = { l: p.letter, b: !!p.blank, s: seat };
  }
  player.rack = spend.rack;
  player.score += scored.score;

  const entry = {
    ply: state.ply, seat, kind: 'play',
    words: scored.words.map((w) => w.word),
    word: scored.words.length ? scored.words[0].word : '',
    score: scored.score, gross: scored.gross, toll: scored.toll, bingo: scored.bingo,
    placements: placements.map((p) => ({ i: p.i, letter: p.letter, blank: !!p.blank })),
  };
  state.history.push(entry);
  state.scoreless = scored.score > 0 ? 0 : state.scoreless + 1;

  refill(player.rack, state.bag);

  if (player.rack.length === 0 && state.bag.length === 0) {
    advance(state);
    finish(state, 'played out', seat);
    return { ok: true, entry, state };
  }
  advance(state);
  if (state.scoreless >= state.seats.length * SCORELESS_PER_SEAT) finish(state, 'stalled');
  return { ok: true, entry, state };
}

/** Give up the turn. */
export function applyPass(state, seat) {
  const guard = turnGuard(state, seat);
  if (guard) return guard;
  const entry = { ply: state.ply, seat, kind: 'pass', score: 0 };
  state.history.push(entry);
  state.scoreless++;
  advance(state);
  if (state.scoreless >= state.seats.length * SCORELESS_PER_SEAT) finish(state, 'stalled');
  return { ok: true, entry, state };
}

/** Swap tiles back into the bag. Needs a bag with a rack's worth left in it. */
export function applyExchange(state, seat, tiles) {
  const guard = turnGuard(state, seat);
  if (guard) return guard;
  if (!Array.isArray(tiles) || !tiles.length) return err('nothing to exchange');
  if (tiles.length > RACK_SIZE) return err('that is more than a rack');
  if (state.bag.length < MIN_BAG_TO_EXCHANGE) {
    return err(`the bag is down to ${state.bag.length} — too few to exchange`);
  }
  const player = state.seats[seat];
  const pool = [...player.rack];
  for (const t of tiles) {
    const at = pool.indexOf(t);
    if (at === -1) return err(`no ${t === BLANK ? 'blank' : t} on the rack`);
    pool.splice(at, 1);
  }
  player.rack = pool;
  // Draw the replacements BEFORE the swapped tiles go back, or a player can be
  // handed the very tiles they just rejected.
  const fresh = draw(state.bag, tiles.length);
  returnToBag(state.bag, tiles, state.seed, state.ply);
  player.rack.push(...fresh);

  // `tiles` is kept so the stored history replays EXACTLY; `redact` strips it
  // from everyone but the player who threw them.
  const entry = { ply: state.ply, seat, kind: 'exchange', count: tiles.length, tiles: [...tiles], score: 0 };
  state.history.push(entry);
  state.scoreless++;
  advance(state);
  if (state.scoreless >= state.seats.length * SCORELESS_PER_SEAT) finish(state, 'stalled');
  return { ok: true, entry, state };
}

/** Walk away. The seat is out; the others play on unless nobody is left. */
export function applyResign(state, seat) {
  if (state.status !== 'active') return err('the game is over');
  const player = state.seats[seat];
  if (player.resigned) return err('already resigned');
  player.resigned = true;
  state.history.push({ ply: state.ply, seat, kind: 'resign', score: 0 });
  const live = state.seats.filter((s) => !s.resigned);
  if (live.length <= 1) {
    finish(state, 'resigned', live.length === 1 ? live[0].seat : null);
    return { ok: true, state };
  }
  if (state.turn === seat) advance(state);
  while (state.seats[state.turn].resigned) advance(state);
  return { ok: true, state };
}

/** Whose turn it is, skipping anyone who walked away. */
export function currentSeat(state) {
  return state.seats[state.turn];
}

/**
 * The view one seat is allowed to see. Racks other than your own become counts,
 * and the bag becomes a number — this is the ONLY shape that leaves the server.
 */
export function redact(state, seat = null) {
  return {
    // NOT the game's concurrency version — that belongs to the stored row and
    // the server sets it. This is the shape of the state object, and it is
    // named apart because the two silently collided: spreading this into the
    // API response overwrote the row version with a constant 1, so every move
    // after the first was rejected as stale.
    stateVersion: state.version,
    // The seed is NEVER sent. It fixes the whole bag order, so a client
    // holding it can compute every tile every opponent will ever draw.
    layout: state.layout,
    board: state.board,
    turn: state.turn,
    ply: state.ply,
    status: state.status,
    bagCount: state.bag.length,
    scoreless: state.scoreless,
    ended: state.ended,
    you: seat,
    rack: seat !== null && state.seats[seat] ? [...state.seats[seat].rack] : [],
    seats: state.seats.map((s) => ({
      seat: s.seat, name: s.name, kind: s.kind, level: s.level,
      score: s.score, tiles: s.rack.length, resigned: !!s.resigned,
      joined: s.joined !== false,
    })),
    // Which tiles someone threw back is theirs to know.
    history: state.history.map((h) =>
      (h.kind === 'exchange' && h.seat !== seat && h.tiles) ? { ...h, tiles: undefined } : h),
  };
}

/**
 * Replay a game from its seed and move log. Every state in this engine is a
 * pure function of those two things, which is what makes the log the record:
 * `replay(seed, layout, seats, history)` reconstructs the position exactly,
 * including the bag, without trusting any stored snapshot.
 */
export function replay({ seed, layout, seats }, history, dawg) {
  const state = newGame({ seed, layout, seats });
  for (const h of history) {
    let res;
    if (h.kind === 'play') res = applyPlay(state, h.seat, h.placements, dawg);
    else if (h.kind === 'pass') res = applyPass(state, h.seat);
    else if (h.kind === 'exchange') res = applyExchange(state, h.seat, h.tiles);
    else if (h.kind === 'resign') res = applyResign(state, h.seat);
    else throw new Error(`replay: unknown move kind ${h.kind}`);
    if (!res.ok) throw new Error(`replay failed at ply ${h.ply}: ${res.error}`);
  }
  return state;
}

/** True when the seat to move is a bot — the worker loops on this. */
export function botToMove(state) {
  return state.status === 'active' && state.seats[state.turn].kind === 'bot';
}

export { isEmpty, squares };
