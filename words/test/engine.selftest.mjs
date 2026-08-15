#!/usr/bin/env node
// words — engine selftest. No browser, no network, no Cloudflare.
//
//   node words/test/engine.selftest.mjs
//
// preflight picks this up automatically for any branch that touches words/.
// The load-bearing check is CROSS-VALIDATION: every move the generator emits
// is fed back through the referee (`validatePlay` with the real lexicon) and
// re-scored. A generator and a referee that disagree is the one bug class that
// would let a bot play something the server then rejects, and it is invisible
// to any test that only checks the generator against itself.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Dawg } from '../engine/dawg.js';
import {
  SIZE, START, SQ, LAYOUTS, LAYOUT_IDS, squares, assertLayouts, newBoard, idx,
} from '../engine/board.js';
import { DISTRIBUTION, BAG_SIZE, newBag, rackValue, BLANK, RACK_SIZE } from '../engine/tiles.js';
import { validatePlay, scorePlay, wordsFormed, HORIZONTAL, VERTICAL } from '../engine/rules.js';
import { generateMoves, anchors, crossChecks } from '../engine/movegen.js';
import {
  newGame, applyPlay, applyPass, applyExchange, applyResign, redact, replay, botToMove,
} from '../engine/game.js';
import { chooseMove, takeTurn, leaveValue, bestExchange, moveKey, topMoves } from '../engine/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const dawg = new Dawg(readFileSync(join(HERE, '..', 'dict', 'lexicon.dawg')));

let pass = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, got, want) {
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// --------------------------------------------------------------- lexicon --
eq('dawg word count', dawg.wordCount, 168551);
for (const w of ['HELLO', 'QUIXOTIC', 'JO', 'XI', 'SYZYGY', 'STRENGTHS', 'ZYZZYVAS']) {
  ok(`dawg has ${w}`, dawg.has(w));
}
for (const w of ['QQQQ', 'ZZZZZ', 'ASDFGH', 'A', 'I', '']) {
  ok(`dawg rejects "${w}"`, !dawg.has(w));
}
// We ship ENABLE, and ENABLE is NOT the tournament lists. It has 96 two-letter
// words where Collins has 127 — no ZA, no QI, no EW. Players arriving from a
// tournament habit will notice, so this is asserted rather than left to be
// discovered: change the lexicon and this test tells you the game changed.
eq('ENABLE two-letter words', [...dawg.words()].filter((w) => w.length === 2).length, 96);
for (const w of ['ZA', 'QI', 'ETAERIO']) ok(`ENABLE does not have ${w}`, !dawg.has(w));
ok('dawg is case-insensitive', dawg.has('hello'));
ok('dawg rejects non-letters', !dawg.has('HEL-LO'));
{
  // The continuations mask must agree with brute force on a real prefix.
  const node = dawg.walk('QU');
  let brute = 0;
  for (let l = 1; l <= 26; l++) {
    const ch = String.fromCharCode(64 + l);
    if (dawg.walk('QU' + ch) || dawg.has('QU' + ch)) brute |= 1 << (l - 1);
  }
  eq('continuations(QU) matches brute force', dawg.continuations(node), brute);
}

// ----------------------------------------------------------------- board --
ok('layouts validate', assertLayouts());
for (const id of LAYOUT_IDS) {
  const sq = squares(id);
  eq(`${id} expands to 225 squares`, sq.length, SIZE * SIZE);
  eq(`${id} start square is the star`, sq[START], SQ.START);
  // Eight-fold symmetry: the quadrant is diagonal-symmetric, so the board must
  // survive both mirrors AND transposition.
  let sym = true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = sq[idx(r, c)];
      if (r === 7 && c === 7) continue;
      if (v !== sq[idx(SIZE - 1 - r, c)] || v !== sq[idx(r, SIZE - 1 - c)] || v !== sq[idx(c, r)]) sym = false;
    }
  }
  ok(`${id} is eight-fold symmetric`, sym);
}
ok('fair has no hazards', !squares('fair').some((s) => [SQ.MIRE, SQ.HALF, SQ.TOLL, SQ.STONE, SQ.QL].includes(s)));
ok('hazard has every hazard', [SQ.MIRE, SQ.HALF, SQ.TOLL, SQ.QL].every((h) => squares('hazard').includes(h)));
ok('archipelago has stones', squares('archipelago').includes(SQ.STONE));
{
  const bad = { ...LAYOUTS };
  // A layout whose quadrant is not diagonal-symmetric must be rejected loudly.
  const original = LAYOUTS.fair.quadrant;
  LAYOUTS.fair = { ...LAYOUTS.fair, quadrant: ['Td......', '........', '........', '........', '........', '........', '........', '.......*'] };
  squares.cache?.delete?.('fair');
  let threw = false;
  try { assertLayouts(); } catch { threw = true; }
  ok('asymmetric quadrant is rejected', threw);
  LAYOUTS.fair = { ...LAYOUTS.fair, quadrant: original };
  void bad;
}

// ------------------------------------------------------------------ bag --
eq('bag is 100 tiles', BAG_SIZE, 100);
eq('two blanks', DISTRIBUTION[BLANK], 2);
{
  const a = newBag('seed-one');
  const b = newBag('seed-one');
  const c = newBag('seed-two');
  eq('bag is deterministic', a.join(''), b.join(''));
  ok('different seeds differ', a.join('') !== c.join(''));
  eq('bag holds every tile', a.length, BAG_SIZE);
  const counts = {};
  for (const t of a) counts[t] = (counts[t] || 0) + 1;
  ok('distribution preserved', Object.entries(DISTRIBUTION).every(([t, n]) => counts[t] === n));
}
eq('rackValue', rackValue(['Q', 'A', BLANK]), 11);

// -------------------------------------------------------------- scoring --
// Hand-built positions. Each states the arithmetic it is checking, so a change
// to the scorer that breaks one says which rule it broke.
function positionOn(layout) {
  return { layout, board: newBoard(), bag: [], seats: [] };
}
/** Place letters left-to-right from (r,c) without scoring. */
function put(state, r, c, word, dir = HORIZONTAL) {
  [...word].forEach((ch, k) => {
    const i = dir === HORIZONTAL ? idx(r, c + k) : idx(r + k, c);
    state.board[i] = { l: ch, b: false, s: 0 };
  });
}
function placements(r, c, word, dir = HORIZONTAL) {
  return [...word].map((ch, k) => ({
    i: dir === HORIZONTAL ? idx(r, c + k) : idx(r + k, c),
    letter: ch, blank: false,
  }));
}

{
  // On `fair`, the star (7,7) is plain and (7,5) is a double letter.
  const st = positionOn('fair');
  const sq = squares('fair');
  eq('fair (7,5) is DL', sq[idx(7, 5)], SQ.DL);
  eq('fair (7,3) is TL', sq[idx(7, 3)], SQ.TL);
  eq('fair (7,0) is TW', sq[idx(7, 0)], SQ.TW);
  // CAT from (7,5): C on DL (3*2=6) + A (1) + T (1) = 8.
  const p = placements(7, 5, 'CAT');
  const v = validatePlay(st, p, dawg);
  ok('CAT over the star is legal', v.ok, v.error);
  eq('double letter applies', scorePlay(st, p).score, 8);
}
{
  // Word multiplier: `fair` (5,5) is a double word, (4,4) a double word too.
  const st = positionOn('fair');
  const sq = squares('fair');
  eq('fair (5,5) is DW', sq[idx(5, 5)], SQ.DW);
  put(st, 7, 6, 'AT');
  // Vertical word from (5,5): D-O-A? Use a real word: (5,5)=B,(6,5)=A,(7,5)=T -> BAT,
  // and it must not collide with the A at (7,6): BAT vertical + horizontal AAT is junk.
  const st2 = positionOn('fair');
  const p = placements(5, 5, 'BAT', VERTICAL);
  const legalFirst = validatePlay(st2, p, dawg);
  ok('a first word off the star is refused', !legalFirst.ok);
}
{
  // MIRE: hazard (0,3) and (3,0) are mires. A letter there scores nothing.
  const sq = squares('hazard');
  eq('hazard (0,3) is MIRE', sq[idx(0, 3)], SQ.MIRE);
  const st = positionOn('hazard');
  put(st, 0, 0, 'JA');           // J=8 A=1 already down, no multipliers
  put(st, 0, 2, 'B');
  // Place a Z on the mire completing JABZ? not a word — use the scorer directly.
  const p = [{ i: idx(0, 3), letter: 'S', blank: false }];
  const words = wordsFormed(st.board, sq, p);
  eq('mire word is JABS', words[0].word, 'JABS');
  // J8 + A1 + B3 + S(on mire)=0 -> 12, and (0,0) is a TW but NOT freshly
  // covered, so it does not multiply.
  eq('mire scores the letter as zero', scorePlay(st, p).score, 12);
}
{
  // HALF: hazard (2,4) and (4,2) halve the word after multipliers.
  const sq = squares('hazard');
  eq('hazard (2,4) is HALF', sq[idx(2, 4)], SQ.HALF);
  const st = positionOn('hazard');
  put(st, 2, 1, 'CAT');
  const p = [{ i: idx(2, 4), letter: 'S', blank: false }];
  // CATS = 3+1+1+1 = 6, halved -> 3.
  eq('half halves the word', scorePlay(st, p).score, 3);
  const st2 = positionOn('hazard');
  put(st2, 2, 1, 'BOX');
  const p2 = [{ i: idx(2, 4), letter: 'Y', blank: false }];
  // BOXY = 3+1+8+4 = 16, halved -> 8.
  eq('half rounds down after multipliers', scorePlay(st2, p2).score, 8);
}
{
  // TOLL: hazard (1,7) and (7,1) cost a flat 8 off the PLAY.
  const sq = squares('hazard');
  eq('hazard (1,7) is TOLL', sq[idx(1, 7)], SQ.TOLL);
  const st = positionOn('hazard');
  put(st, 1, 4, 'CAT');
  const p = [{ i: idx(1, 7), letter: 'S', blank: false }];
  // CATS = 6, toll -8 -> clamped to 0, not -2.
  const s = scorePlay(st, p);
  eq('toll is charged', s.toll, 8);
  eq('a play is never negative', s.score, 0);
  const st2 = positionOn('hazard');
  put(st2, 1, 3, 'QUIZ');
  const p2 = [{ i: idx(1, 7), letter: 'S', blank: false }];
  // QUIZZES? no — QUIZS is not a word; score the geometry only.
  const gross = scorePlay(st2, p2).gross;
  eq('toll leaves the gross alone', scorePlay(st2, p2).score, Math.max(0, gross - 8));
}
{
  // QUAD LETTER: hazard (4,7) and (7,4).
  const sq = squares('hazard');
  eq('hazard (7,4) is QL', sq[idx(7, 4)], SQ.QL);
  const st = positionOn('hazard');
  put(st, 7, 5, 'AT');
  const p = [{ i: idx(7, 4), letter: 'C', blank: false }];
  // CAT with C on a quad letter: 3*4 + 1 + 1 = 14.
  eq('quad letter quadruples', scorePlay(st, p).score, 14);
}
{
  // Blanks score nothing, wherever they land.
  const st = positionOn('hazard');
  put(st, 7, 5, 'AT');
  const p = [{ i: idx(7, 4), letter: 'C', blank: true }];
  eq('a blank on a quad letter still scores zero', scorePlay(st, p).score, 2);
}
{
  // Bingo: seven tiles from the rack is +40, over and above the words.
  const st = positionOn('fair');
  const p = placements(7, 4, 'RETAINS');
  ok('RETAINS is a word', dawg.has('RETAINS'));
  const s = scorePlay(st, p);
  ok('bingo flagged', s.bingo);
  ok('bingo bonus included', s.score >= 40 + 7);
}

// ------------------------------------------------------------- legality --
{
  const st = positionOn('fair');
  ok('first play must cover the star', !validatePlay(st, placements(0, 0, 'CAT'), dawg).ok);
  ok('a single tile cannot open', !validatePlay(st, [{ i: START, letter: 'A', blank: false }], dawg).ok);
  ok('a real opener is fine', validatePlay(st, placements(7, 6, 'CAT'), dawg).ok);
  ok('nonsense is refused', !validatePlay(st, placements(7, 6, 'XQZ'), dawg).ok);
}
{
  const st = positionOn('fair');
  put(st, 7, 6, 'CAT');
  ok('a floating word is refused', !validatePlay(st, placements(0, 0, 'DOG'), dawg).ok);
  ok('diagonal placement is refused', !validatePlay(st, [
    { i: idx(6, 6), letter: 'A', blank: false }, { i: idx(5, 7), letter: 'B', blank: false },
  ], dawg).ok);
  ok('a gap is refused', !validatePlay(st, [
    { i: idx(5, 5), letter: 'D', blank: false }, { i: idx(5, 8), letter: 'O', blank: false },
  ], dawg).ok);
  ok('an occupied square is refused', !validatePlay(st, [{ i: idx(7, 6), letter: 'Z', blank: false }], dawg).ok);
  ok('a bad cross-word is refused',
    !validatePlay(st, [{ i: idx(6, 6), letter: 'Z', blank: false }, { i: idx(6, 7), letter: 'Q', blank: false }], dawg).ok);
}
{
  // Stones: nothing on them, and they break a word like the edge does.
  const st = positionOn('archipelago');
  const sq = squares('archipelago');
  const stone = sq.findIndex((s) => s === SQ.STONE);
  ok('stone found', stone >= 0);
  ok('a tile on a stone is refused', !validatePlay(st, [
    { i: stone, letter: 'A', blank: false }, { i: START, letter: 'T', blank: false },
  ], dawg).ok);
  // A word cannot span a stone: (0,2) is a stone on this layout.
  eq('archipelago (0,2) is a stone', sq[idx(0, 2)], SQ.STONE);
  const st2 = positionOn('archipelago');
  put(st2, 0, 0, 'AT');
  const w = wordsFormed(st2.board, sq, [{ i: idx(0, 3), letter: 'S', blank: false }]);
  ok('a word does not read across a stone', !w.some((x) => x.word.includes('AT')));
}

// ---------------------------------------------- generator vs the referee --
// The important one. Play out real positions and cross-check EVERY move.
function crossValidate(state, rack, label) {
  const moves = generateMoves(state, rack, dawg);
  let bad = 0, mismatched = 0;
  const seen = new Set();
  for (const m of moves) {
    const v = validatePlay(state, m.placements, dawg);
    if (!v.ok) { if (bad < 3) failures.push(`${label}: generator emitted an illegal move (${m.word}): ${v.error}`); bad++; continue; }
    const s = scorePlay(state, m.placements);
    if (s.score !== m.score) { mismatched++; }
    const k = moveKey(m);
    if (seen.has(k)) { if (bad < 3) failures.push(`${label}: duplicate move ${m.word} (${k})`); bad++; }
    seen.add(k);
    // Every tile must come from the rack.
    const pool = [...rack];
    for (const p of m.placements) {
      const want = p.blank ? BLANK : p.letter;
      const at = pool.indexOf(want);
      if (at === -1) { if (bad < 3) failures.push(`${label}: move ${m.word} uses a tile not on the rack (${want})`); bad++; break; }
      pool.splice(at, 1);
    }
  }
  ok(`${label}: every generated move is legal`, bad === 0, `${bad} bad of ${moves.length}`);
  ok(`${label}: generator scores match the referee`, mismatched === 0, `${mismatched} mismatched`);
  return moves;
}
{
  const st = positionOn('hazard');
  const moves = crossValidate(st, ['C', 'A', 'T', 'S', 'E', 'R', 'O'], 'opening on hazard');
  ok('opening finds plenty', moves.length > 200, `${moves.length}`);
  ok('every opening covers the star', moves.every((m) => m.placements.some((p) => p.i === START)));
}
{
  const st = positionOn('archipelago');
  put(st, 7, 6, 'CAT');
  crossValidate(st, ['S', 'E', 'R', BLANK, 'I', 'N', 'G'], 'blank + stones');
}
{
  const st = positionOn('fair');
  put(st, 7, 4, 'RETAINS');
  put(st, 3, 7, 'PLAYED', VERTICAL);
  crossValidate(st, ['Q', 'U', 'I', 'Z', 'Z', 'E', 'S'], 'crowded board');
}
{
  // Anchors and cross-checks are the generator's foundations; check them
  // against their definitions directly.
  const st = positionOn('fair');
  put(st, 7, 6, 'CAT');
  const sq = squares('fair');
  const a = anchors(st.board, sq);
  ok('anchors surround the word', a.includes(idx(6, 6)) && a.includes(idx(7, 5)) && a.includes(idx(7, 9)));
  ok('anchors exclude occupied squares', !a.some((i) => st.board[i]));
  const cc = crossChecks(st.board, sq, HORIZONTAL, dawg);
  // Above the C at (7,6): a letter there must make a two-letter word ?C.
  const mask = cc[idx(6, 6)];
  for (let l = 1; l <= 26; l++) {
    const ch = String.fromCharCode(64 + l);
    const allowed = (mask & (1 << (l - 1))) !== 0;
    eq(`cross-check ${ch}C`, allowed, dawg.has(ch + 'C'));
  }
}

// ------------------------------------------------------------------- AI --
{
  const st = positionOn('hazard');
  st.bag = newBag('x');
  st.seats = [{ seat: 0, kind: 'bot', level: 'steady', rack: ['R', 'E', 'T', 'A', 'I', 'N', 'S'], score: 0 }];
  const a = chooseMove(st, 0, dawg);
  const b = chooseMove(st, 0, dawg);
  eq('the bot is deterministic', JSON.stringify(a), JSON.stringify(b));
  eq('the bot plays', a.kind, 'play');
  ok('a steady bot finds the bingo with RETAINS', a.placements.length === 7, `played ${a.word} (${a.placements.length} tiles)`);

  st.seats[0].level = 'mild';
  const mild = chooseMove(st, 0, dawg);
  ok('a mild bot cannot find a bingo', mild.placements.length <= 4, `played ${mild.placements.length} tiles`);
  ok('a mild bot still scores less', mild.score <= a.score);
}
{
  ok('leaveValue prizes a blank', leaveValue([BLANK, 'A']) > leaveValue(['Z', 'A']));
  ok('leaveValue hates duplicate Us', leaveValue(['U', 'U', 'U']) < leaveValue(['A', 'E', 'T']));
  ok('leaveValue hates a lone Q', leaveValue(['Q', 'X', 'V']) < leaveValue(['R', 'E', 'T']));
  const out = bestExchange(['Q', 'U', 'U', 'V', 'W', 'X', 'I']);
  ok('bestExchange throws the clunkers', out.length >= 2 && !out.includes(BLANK));
  eq('bestExchange is deterministic', bestExchange(['Q', 'U', 'U', 'V', 'W', 'X', 'I']).join(''), out.join(''));
}
{
  const st = positionOn('hazard');
  st.bag = newBag('h');
  st.seats = [{ seat: 0, kind: 'human', rack: ['C', 'A', 'T', 'S', 'E', 'R', 'O'], score: 0 }];
  const hints = topMoves(st, st.seats[0].rack, dawg, 5);
  eq('hints come back', hints.length, 5);
  ok('hints are ordered', hints.every((h, i) => i === 0 || hints[i - 1].value >= h.value));
}

// -------------------------------------------------------------- a game ---
function playOut(seats, layout, seed, limit = 200) {
  const state = newGame({ seed, layout, seats });
  let turns = 0;
  while (state.status === 'active' && turns < limit) {
    const seat = state.turn;
    const res = takeTurn(state, seat, dawg);
    if (!res.ok) throw new Error(`turn ${turns} (seat ${seat}) failed: ${res.error}`);
    turns++;
  }
  return { state, turns };
}
for (const layout of LAYOUT_IDS) {
  for (const n of [1, 2, 3, 4]) {
    const seats = Array.from({ length: n }, (_, i) => ({ kind: 'bot', level: ['mild', 'steady', 'sharp'][i % 3], name: `B${i}` }));
    const { state, turns } = playOut(seats, layout, `game-${layout}-${n}`);
    ok(`${layout} ${n}p finishes`, state.status === 'done', `after ${turns} turns`);
    ok(`${layout} ${n}p has a winner`, (state.ended?.winners || []).length >= 1);
    ok(`${layout} ${n}p conserves tiles`,
      state.bag.length + state.seats.reduce((a, s) => a + s.rack.length, 0) + state.board.filter(Boolean).length === BAG_SIZE,
      `bag ${state.bag.length} + racks ${state.seats.reduce((a, s) => a + s.rack.length, 0)} + board ${state.board.filter(Boolean).length}`);
    ok(`${layout} ${n}p scores are consistent with the log`, (() => {
      const fromLog = state.seats.map(() => 0);
      for (const h of state.history) fromLog[h.seat] += h.score || 0;
      for (const adj of state.ended.adjustments || []) fromLog[adj.seat] += adj.delta;
      return state.seats.every((s, i) => s.score === fromLog[i]);
    })());
    ok(`${layout} ${n}p never scores negative on a play`, state.history.every((h) => (h.score || 0) >= 0));

    // The replay property: seed + log reconstructs the game exactly.
    const rerun = replay({ seed: `game-${layout}-${n}`, layout, seats }, state.history, dawg);
    eq(`${layout} ${n}p replays to the same board`,
      rerun.board.map((c) => (c ? c.l : '.')).join(''), state.board.map((c) => (c ? c.l : '.')).join(''));
    eq(`${layout} ${n}p replays to the same scores`,
      rerun.seats.map((s) => s.score).join(','), state.seats.map((s) => s.score).join(','));
  }
}
{
  // Same seed, same seats, same game — twice.
  const seats = [{ kind: 'bot', level: 'sharp' }, { kind: 'bot', level: 'steady' }];
  const a = playOut(seats, 'hazard', 'twice').state;
  const b = playOut(seats, 'hazard', 'twice').state;
  eq('a game is reproducible', JSON.stringify(a.history), JSON.stringify(b.history));
  const c = playOut(seats, 'hazard', 'other').state;
  ok('a different seed is a different game', JSON.stringify(a.history) !== JSON.stringify(c.history));
}
{
  // Turn discipline and the two non-play moves.
  const state = newGame({ seed: 'rules', layout: 'fair', seats: [{ kind: 'human' }, { kind: 'human' }] });
  ok('out-of-turn play is refused', !applyPlay(state, 1, placements(7, 6, 'CAT'), dawg).ok);
  ok('pass works', applyPass(state, 0).ok);
  eq('turn advances', state.turn, 1);
  const before = [...state.seats[1].rack];
  ok('exchange works', applyExchange(state, 1, [before[0]]).ok);
  eq('rack stays full after an exchange', state.seats[1].rack.length, RACK_SIZE);
  ok('exchange is logged with its tiles', state.history.at(-1).tiles.length === 1);
  eq('exchanged tiles are hidden from the other seat', redact(state, 0).history.at(-1).tiles, undefined);
  ok('exchanged tiles are visible to their owner', redact(state, 1).history.at(-1).tiles?.length === 1);
}
{
  // Six scoreless turns end a two-player game.
  const state = newGame({ seed: 'stall', layout: 'fair', seats: [{ kind: 'human' }, { kind: 'human' }] });
  for (let k = 0; k < 6 && state.status === 'active'; k++) applyPass(state, state.turn);
  eq('a stalled game ends', state.status, 'done');
  eq('and says why', state.ended.reason, 'stalled');
}
{
  // Resignation in a four-hander leaves the others playing.
  const state = newGame({ seed: 'quit', layout: 'fair', seats: Array.from({ length: 4 }, () => ({ kind: 'human' })) });
  ok('resign works', applyResign(state, 0).ok);
  eq('the game continues', state.status, 'active');
  ok('the resigned seat is skipped', !state.seats[state.turn].resigned);
  applyResign(state, 1); applyResign(state, 2);
  eq('the last one standing ends it', state.status, 'done');
}
{
  // Redaction: no rack but yours, no bag order, ever.
  const state = newGame({ seed: 'secret', layout: 'fair', seats: [{ kind: 'human' }, { kind: 'bot' }] });
  const view = redact(state, 0);
  eq('your rack is yours', view.rack.length, RACK_SIZE);
  ok('other racks are counts', view.seats.every((s) => typeof s.tiles === 'number'));
  ok('no rack leaks', !JSON.stringify(view.seats).includes('"rack"'));
  ok('the bag is a number', typeof view.bagCount === 'number' && !('bag' in view));
  eq('bag count is right', view.bagCount, 100 - 2 * RACK_SIZE);
  // The seed reconstructs the entire bag order, so shipping it would hand a
  // player every tile every opponent will ever draw. It leaked once.
  ok('the seed never leaves', !('seed' in view) && !JSON.stringify(view).includes(state.seed));
  // And the state-shape version must not be mistakable for the stored row's
  // concurrency version — that collision rejected every move after the first.
  ok('no bare `version` to collide with the row version', !('version' in view));
}
{
  // A one-player game is a game: the solitaire mode has to terminate too.
  const { state } = playOut([{ kind: 'bot', level: 'sharp' }], 'hazard', 'solo');
  eq('solitaire ends', state.status, 'done');
  ok('solitaire empties the bag', state.bag.length === 0);
}
{
  // botToMove drives the worker's loop; make sure it is honest.
  const state = newGame({ seed: 'loop', layout: 'fair', seats: [{ kind: 'human' }, { kind: 'bot' }] });
  ok('human to move', !botToMove(state));
  applyPass(state, 0);
  ok('bot to move', botToMove(state));
}

// ------------------------------------------------------------------ done --
console.log(`words engine selftest: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
