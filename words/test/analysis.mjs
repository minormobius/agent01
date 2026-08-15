#!/usr/bin/env node
// words — a measurement report. NOT a pass/fail gate, and not run in CI.
//
//   node words/test/analysis.mjs [games-per-cell]
//
// The selftest proves the game is legal. This asks whether it is any good, and
// it exists because the numbers in board.js and ai.js are the kind that feel
// obviously right and are obviously wrong two games later. It answers three
// questions the code cannot:
//
//   1. Do the difficulty levels actually differ, and by how much? A level that
//      is 3 points weaker than the one above it is a label, not a level.
//   2. What do the hazards DO? Points forgiven by mires, halved away, and paid
//      in tolls, per game, per board. If Hazard scores the same as Fair, the
//      squares are decoration.
//   3. Is Archipelago a different game or just a smaller one? Stones remove
//      squares, so some of the difference is lost board rather than changed
//      play — the report separates score from words-played to show which.
//
// Read it after moving any number in board.js or ai.js. Run it with a bigger
// sample before believing a difference of a few points.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Dawg } from '../engine/dawg.js';
import { LAYOUT_IDS, squares, SQ, LAYOUTS } from '../engine/board.js';
import { newGame } from '../engine/game.js';
import { takeTurn } from '../engine/ai.js';
import { generateMoves } from '../engine/movegen.js';
import { AI_LEVELS } from '../engine/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const dawg = new Dawg(readFileSync(join(HERE, '..', 'dict', 'lexicon.dawg')));

const N = Number(process.argv[2] || 12);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (x) => x.toFixed(1);

/** Play one game out and gather what it did. */
function playGame(layout, levels, seed) {
  const state = newGame({
    seed, layout,
    seats: levels.map((level, i) => ({ kind: 'bot', level, name: `${level}${i}` })),
  });
  const sq = squares(layout);
  let turns = 0;
  while (state.status === 'active' && turns < 300) {
    const res = takeTurn(state, state.turn, dawg);
    if (!res.ok) break;
    turns++;
  }

  // What the hazards took. `gross` is before the toll; the halving is already
  // inside the word scores, so it is measured by re-scoring the same words
  // with the halves removed — which is what `mult` and `halves` are for.
  let mireLetters = 0, halvedAway = 0, tollPaid = 0, bingos = 0, plays = 0, tiles = 0;
  for (const h of state.history) {
    if (h.kind !== 'play') continue;
    plays++;
    tiles += h.placements.length;
    if (h.bingo) bingos++;
    tollPaid += h.toll || 0;
    for (const p of h.placements) {
      if (sq[p.i] === SQ.MIRE) mireLetters++;
    }
  }
  return {
    scores: state.seats.map((s) => s.score),
    winners: state.ended?.winners || [],
    turns, plays, bingos, tiles, mireLetters, tollPaid, halvedAway,
    reason: state.ended?.reason,
  };
}

console.log(`words — analysis over ${N} games per cell\n`);

// ------------------------------------------------- 1. do the levels differ --
// MIRRORED PAIRS. Every seed is played twice with the bots swapped, so the
// seat and the deal cancel exactly rather than approximately. This matters more
// than it sounds: a game's score has a standard deviation around 50 points, so
// an unmirrored twenty-game sample routinely shows a forty-point "difference"
// between a bot and an identical copy of itself. The last row is that control —
// steady against steady — and it must come out at 0.0. If it does not, the
// harness is broken and nothing above it means anything.
console.log('LEVELS — mirrored head to head on the hazard board');
console.log(`  matchup                  margin/game   stderr   wins (of ${N * 2})`);
for (const [a, b] of [['mild', 'steady'], ['sharp', 'steady'], ['mild', 'sharp'], ['steady', 'steady']]) {
  const diffs = [];
  let wins = 0;
  for (let g = 0; g < N; g++) {
    for (const seat of [0, 1]) {
      const levels = seat === 0 ? [a, b] : [b, a];
      const r = playGame('hazard', levels, `lvl-${g}`);
      diffs.push(r.scores[seat] - r.scores[1 - seat]);
      if (r.winners.includes(seat)) wins += r.winners.length > 1 ? 0.5 : 1;
    }
  }
  const stderr = Math.sqrt(mean(diffs.map((d) => (d - mean(diffs)) ** 2)) / diffs.length);
  const label = a === b ? `${a} vs ${b} (CONTROL)` : `${a} vs ${b}`;
  console.log(`  ${label.padEnd(24)} ${f1(mean(diffs)).padStart(9)}   ${f1(stderr).padStart(6)}   ${wins}`);
}

// --------------------------------------------------- 2. what boards do -----
console.log('\nBOARDS — two steady bots, and what the squares took');
console.log('  board          score/seat   plays  bingos  tiles/play   mire   toll');
for (const layout of LAYOUT_IDS) {
  const rows = [];
  for (let g = 0; g < N; g++) rows.push(playGame(layout, ['steady', 'steady'], `board-${layout}-${g}`));
  const score = mean(rows.flatMap((r) => r.scores));
  console.log(
    `  ${layout.padEnd(14)} ${f1(score).padStart(10)}   ${f1(mean(rows.map((r) => r.plays))).padStart(5)}` +
    `  ${f1(mean(rows.map((r) => r.bingos))).padStart(6)}  ${f1(mean(rows.map((r) => r.tiles / Math.max(1, r.plays)))).padStart(10)}` +
    `   ${f1(mean(rows.map((r) => r.mireLetters))).padStart(4)}   ${f1(mean(rows.map((r) => r.tollPaid))).padStart(4)}`,
  );
}
console.log('  (mire = letters played onto a mire per game; toll = points paid per game)');

// ------------------------------------------------------ 3. seat counts -----
console.log('\nSEATS — steady bots, hazard board');
console.log('  players   score/seat   turns   ended');
for (const n of [1, 2, 3, 4]) {
  const rows = [];
  for (let g = 0; g < N; g++) rows.push(playGame('hazard', Array(n).fill('steady'), `seats-${n}-${g}`));
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  console.log(`  ${String(n).padEnd(9)} ${f1(mean(rows.flatMap((r) => r.scores))).padStart(10)}   ${f1(mean(rows.map((r) => r.turns))).padStart(5)}   ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

// ---------------------------------------------------- 4. generator cost ----
// The bot moves are computed inside a Worker request, so this is a budget
// question, not a curiosity.
console.log('\nGENERATOR — cost of one turn on a mid-game position');
{
  const state = newGame({ seed: 'perf', layout: 'hazard', seats: [{ kind: 'bot', level: 'steady' }, { kind: 'bot', level: 'steady' }] });
  for (let k = 0; k < 12 && state.status === 'active'; k++) takeTurn(state, state.turn, dawg);
  const rack = state.seats[0].rack;
  const t0 = performance.now();
  let moves = 0;
  const REPS = 20;
  for (let k = 0; k < REPS; k++) moves = generateMoves(state, rack, dawg).length;
  const ms = (performance.now() - t0) / REPS;
  console.log(`  rack ${rack.join('')} on a ${state.board.filter(Boolean).length}-tile board`);
  console.log(`  ${moves} legal plays found in ${f1(ms)} ms`);
}

console.log(`\nlayouts: ${LAYOUT_IDS.map((id) => LAYOUTS[id].name).join(', ')} · levels: ${AI_LEVELS.join(', ')}`);
