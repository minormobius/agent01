#!/usr/bin/env node
// The crossword generator's selftest. Gates the deploy; no dependencies.
//
//     node words/cross/test/cross.selftest.mjs
//
// The load-bearing checks, in the order they would hurt if they broke:
//
//   1. DETERMINISM. A permalink is a promise that a seed means one puzzle
//      forever, and every other feature is built on it. Checked by generating
//      the same seed twice and comparing every letter — and by pinned expected
//      answers for fixed seeds, which is the check that actually fires when
//      somebody changes a heuristic and does not realise they have rewritten
//      every link that was ever shared.
//   2. THE FILL IS A CROSSWORD. Every entry is a real answer, and every letter
//      is agreed on by the across and the down entry through it. A generator
//      that is confidently wrong about this produces something that looks
//      exactly like a crossword and cannot be solved.
//   3. EVERY ANSWER HAS A CLUE. An answer nobody can clue is a blank square in
//      the finished puzzle. Checked against the actual shard files.
//   4. The grid rules, and the permalink codec's round trip.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Lexicon, popcount } from '../gen/lexicon.js';
import { generateGrid, isLegalGrid, findSlots, numberGrid, MIN_ENTRY, maxEntry, SIZES } from '../gen/grid.js';
import { fillGrid, DIFFICULTIES } from '../gen/fill.js';
import { puzzleFrom, encodePermalink, decodePermalink, dailySeed, obscurity } from '../gen/puzzle.js';
import { parseShard, renderClue, shardsFor } from '../gen/clues.js';
import { rngFrom } from '../../engine/rng.js';

/**
 * The pinned puzzle's answers. Regenerate with CROSS_REPIN=1 — and only when
 * the generator was MEANT to change, because every permalink anybody has shared
 * now opens a different puzzle.
 */
const PINNED_SIGNATURE =
  '1A=ATOM 1D=ALL 2D=TOO 3D=OVA 4D=MENTIONED 5A=ACTS 5D=APPLIANCE 6D=CHILE 7D=TOKEN 8D=START 9A=LOVE 10A=PHOT 11A=LOAN 12A=PIKA 13A=TILLER 14D=ILL 15A=RESILIENT 15D=RAJAH 16D=ERODE 17D=SEIZE 18A=AREOLA 19A=JOIN 20A=NADA 21D=ALA 22D=DIS 23D=APT 24A=ADZE 25A=CLIP 26A=HEED 27A=EAST';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DICT = path.join(HERE, '..', 'dict');

let failures = 0;
let checks = 0;
function ok(cond, what, detail = '') {
  checks++;
  if (cond) return true;
  failures++;
  console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, what) => ok(a === b, what, a === b ? '' : `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
function section(name) { console.log(`\n${name}`); }

const t0 = Date.now();
const answersText = fs.readFileSync(path.join(DICT, 'answers.txt'), 'utf8');
const lex = new Lexicon(answersText);

// ------------------------------------------------------------- lexicon ----

section('lexicon');
ok(lex.size >= 40000, 'at least 40,000 answers', `got ${lex.size}`);
console.log(`  ${lex.size} answers, id ${lex.id}`);

{
  // Sorted and unique, because Lexicon.has binary searches and the bit index's
  // meaning is positional: an out-of-order file silently changes every puzzle.
  const words = [];
  for (const line of answersText.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    words.push(line.slice(0, line.indexOf(' ')));
  }
  let sorted = true, unique = true, shape = true;
  for (let i = 0; i < words.length; i++) {
    if (!/^[A-Z]{3,15}$/.test(words[i])) { shape = false; break; }
    if (i && words[i] < words[i - 1]) sorted = false;
    if (i && words[i] === words[i - 1]) unique = false;
  }
  ok(shape, 'every answer is 3-15 letters of A-Z');
  ok(sorted, 'answers.txt is sorted');
  ok(unique, 'answers.txt has no duplicates');

  // The bit index has to agree with the words it was built from. Checked on a
  // spread of real patterns rather than one, because an off-by-one in the
  // stride shows up only at some lengths.
  let indexOk = true;
  for (const len of lex.lengths()) {
    const idx = lex.index(len);
    for (const p of [0, len - 1, len >> 1]) {
      for (const l of [0, 4, 25]) {
        const bits = idx.full();
        const block = idx.block(p, l);
        for (let i = 0; i < bits.length; i++) bits[i] &= block[i];
        let expected = 0;
        for (const w of idx.words) if (w.charCodeAt(p) - 65 === l) expected++;
        if (popcount(bits) !== expected) indexOk = false;
      }
    }
  }
  ok(indexOk, 'the (position, letter) bit index matches the word list');

  ok(lex.has('ORANGE') && lex.has('THE') === lex.has('THE'), 'has() finds a known answer');
  ok(!lex.has('ZZZZQX'), 'has() rejects a non-answer');

  // The id is what a permalink promises against, so it must be a function of
  // the data and not of the comment header.
  const reheaded = answersText.replace(/^#[^\n]*\n/, '# a different header\n');
  eq(new Lexicon(reheaded).id, lex.id, 'the lexicon id ignores the header comment');
  const changed = answersText.replace(/\nORANGE \d+/, '\nORANGE 1');
  ok(new Lexicon(changed).id !== lex.id, 'the lexicon id changes when an answer changes');
}

// ---------------------------------------------------------------- grids ----

section('grids');
{
  let legal = 0, total = 0;
  for (const size of SIZES) {
    for (let k = 0; k < 12; k++) {
      total++;
      const grid = generateGrid(size, rngFrom(`selftest|${size}|${k}`));
      if (!isLegalGrid(grid.blocks, size)) continue;
      legal++;

      // Rule 1: 180° symmetry.
      const n = size * size;
      let symmetric = true;
      for (let i = 0; i < n; i++) if (grid.blocks[i] !== grid.blocks[n - 1 - i]) symmetric = false;
      ok(symmetric, `${size}x${size} #${k} is 180° symmetric`);

      // Rule 2 restated the other way round: EVERY white cell must be in an
      // across entry AND a down entry. That is what makes every square checked,
      // and it is asserted here rather than trusted, because the filler and the
      // UI both index straight into `crossings`.
      let allChecked = true;
      for (let i = 0; i < n; i++) {
        if (grid.blocks[i]) continue;
        if (grid.crossings[i * 2] < 0 || grid.crossings[i * 2 + 1] < 0) allChecked = false;
      }
      ok(allChecked, `${size}x${size} #${k}: every white square is checked both ways`);

      // Entry lengths inside the rules.
      const slots = findSlots(grid.blocks, size);
      eq(slots.length, grid.slots.length, `${size}x${size} #${k}: findSlots agrees with the grid`);
      const bad = slots.filter((s) => s.len < MIN_ENTRY || s.len > maxEntry(size));
      eq(bad.length, 0, `${size}x${size} #${k}: every entry is ${MIN_ENTRY}..${maxEntry(size)}`);

      // Numbering: a number appears exactly where an entry starts.
      const numbers = numberGrid(grid);
      const numbered = new Set();
      for (let i = 0; i < n; i++) if (numbers[i]) numbered.add(i);
      const starts = new Set(slots.map((s) => s.cells[0]));
      eq(numbered.size, starts.size, `${size}x${size} #${k}: numbers sit on entry starts`);
    }
  }
  ok(legal / total > 0.85, 'at least 85% of generated grids are legal', `${legal}/${total}`);
  console.log(`  ${legal}/${total} grids legal on the first try`);
}

// ---------------------------------------------------------------- fills ----

section('fills');
{
  // A filled grid has to be a crossword, not a picture of one: the two entries
  // through a square must agree on its letter, and every entry must be a word.
  for (const size of SIZES) {
    const grid = generateGrid(size, rngFrom(`fill|${size}`), { density: DIFFICULTIES.easy.density });
    if (!isLegalGrid(grid.blocks, size)) continue;
    const r = fillGrid(grid, lex, rngFrom(`fill|${size}|f`), DIFFICULTIES.easy);
    if (!ok(r.ok, `${size}x${size} fills`, r.reason)) continue;

    let allWords = true;
    for (const w of r.words) if (!lex.has(w)) allWords = false;
    ok(allWords, `${size}x${size}: every entry is in the lexicon`);

    let agree = true;
    grid.slots.forEach((slot, si) => {
      const word = r.words[si];
      slot.cells.forEach((cell, p) => {
        if (r.letters[cell] !== word.charCodeAt(p) - 64) agree = false;
      });
    });
    ok(agree, `${size}x${size}: crossing entries agree on every letter`);

    eq(new Set(r.words).size, r.words.length, `${size}x${size}: no answer appears twice`);
  }

  // An impossible request is reported, not searched for until the heat death of
  // the universe. maxRank is a hard cut, unlike the softMax difficulties use.
  const grid = generateGrid(9, rngFrom('impossible'));
  const r = fillGrid(grid, lex, rngFrom('impossible|f'), { maxRank: 5 });
  ok(!r.ok && /no answers|leaves no answers/.test(r.reason || ''),
    'an empty answer pool is reported rather than searched', JSON.stringify(r.reason));
}

// --------------------------------------------------------------- puzzles ----

section('puzzles, and determinism');
{
  // (1) The same seed twice, in the same process.
  for (const size of [5, 9, 15]) {
    const a = puzzleFrom({ seed: 'repeatable', size, difficulty: 'medium' }, lex);
    const b = puzzleFrom({ seed: 'repeatable', size, difficulty: 'medium' }, lex);
    ok(a.ok && b.ok, `${size}x${size} "repeatable" generates`);
    eq(JSON.stringify(a.entries), JSON.stringify(b.entries), `${size}x${size}: the same seed gives the same puzzle`);
  }

  // (2) A different seed gives a different puzzle. (If this ever fails, the
  //     seed is not reaching the generator at all.)
  const p1 = puzzleFrom({ seed: 'alpha', size: 11, difficulty: 'medium' }, lex);
  const p2 = puzzleFrom({ seed: 'beta', size: 11, difficulty: 'medium' }, lex);
  ok(JSON.stringify(p1.entries) !== JSON.stringify(p2.entries), 'different seeds give different puzzles');

  // (3) A different lexicon gives a different puzzle — which is exactly why the
  //     lexicon id is stamped into the permalink.
  eq(p1.lexiconId, lex.id, 'the puzzle carries the lexicon id');

  // (4) THE PINNED PUZZLE. This is the check that fires when a heuristic is
  //     tuned and every shared link quietly changes meaning. It is SUPPOSED to
  //     fail then. If you have deliberately changed the generator, re-pin it
  //     and understand that old permalinks now open different puzzles.
  const pinned = puzzleFrom({ seed: 'PIN1', size: 9, difficulty: 'medium' }, lex);
  ok(pinned.ok, 'the pinned puzzle generates');
  const signature = pinned.entries.map((e) => `${e.num}${e.dir}=${e.answer}`).join(' ');
  const EXPECTED = process.env.CROSS_REPIN ? signature : PINNED_SIGNATURE;
  if (process.env.CROSS_REPIN) {
    console.log(`\n  CROSS_REPIN: paste this into PINNED_SIGNATURE\n  ${JSON.stringify(signature)}\n`);
  }
  eq(signature, EXPECTED, 'the pinned puzzle is byte-for-byte what it was');

  // Every size and difficulty must actually produce a puzzle. This is the
  // slowest part of the test and the one that would matter most in production:
  // a size that cannot be generated is a page that spins forever.
  for (const size of SIZES) {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const p = puzzleFrom({ seed: `cover-${size}`, size, difficulty }, lex);
      if (!ok(p.ok, `${size}x${size} ${difficulty} generates`, p.reason)) continue;
      let clean = true;
      for (const e of p.entries) {
        if (!lex.has(e.answer) || e.answer.length !== e.len) clean = false;
      }
      ok(clean, `${size}x${size} ${difficulty}: entries are consistent`);
    }
  }

  // Difficulty has to point the right way, or it is a lie in the interface.
  // Compared over several seeds because a single grid is noisy.
  const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  const scores = {};
  for (const difficulty of ['easy', 'hard']) {
    scores[difficulty] = median([0, 1, 2, 3, 4].map((k) => {
      const p = puzzleFrom({ seed: `tilt${k}`, size: 13, difficulty }, lex);
      return p.ok ? p.stats.obscurity : Infinity;
    }));
  }
  ok(scores.easy < scores.hard, 'easy puzzles use commoner answers than hard ones',
    `easy ${scores.easy} vs hard ${scores.hard}`);
  console.log(`  90th-percentile answer rank: easy ${scores.easy}, hard ${scores.hard}`);
}

// ------------------------------------------------------------ permalinks ----

section('permalinks');
{
  for (const size of SIZES) {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const link = encodePermalink({ seed: 'Ab_9-z', size, difficulty });
      const back = decodePermalink(link);
      eq(JSON.stringify(back), JSON.stringify({ seed: 'Ab_9-z', size, difficulty }), `round trip ${link}`);
    }
  }
  for (const bad of ['', 'nonsense', 'v1.15.m.', 'v1.14.m.abc', 'v9.15.m.abc', 'v1.15.x.abc', `v1.15.m.${'x'.repeat(33)}`]) {
    eq(decodePermalink(bad), null, `rejects ${JSON.stringify(bad)}`);
  }
  ok(/^d\d{8}$/.test(dailySeed(new Date('2026-08-22T23:30:00Z'))), 'the daily seed is a UTC date');
  eq(dailySeed(new Date('2026-08-22T23:30:00Z')), dailySeed(new Date('2026-08-22T00:30:00Z')),
    'the daily seed is the same all day, everywhere');
}

// ----------------------------------------------------------------- clues ----

section('clues');
{
  const shards = new Map();
  for (const file of fs.readdirSync(path.join(DICT, 'clues'))) {
    shards.set(file[0], parseShard(fs.readFileSync(path.join(DICT, 'clues', file), 'utf8')));
  }
  console.log(`  ${shards.size} shards, ${[...shards.values()].reduce((n, m) => n + m.size, 0)} clues`);

  // EVERY answer needs a clue: an answer without one is a blank square with a
  // number next to it in the finished puzzle.
  let missing = 0, empty = 0, selfReferential = 0;
  for (const len of lex.lengths()) {
    for (const word of lex.index(len).words) {
      const entry = shards.get(word[0])?.get(word);
      if (!entry) { missing++; continue; }
      const rendered = renderClue(entry);
      if (!rendered || rendered.length < 8) empty++;
      // A clue containing its own answer is a giveaway; the builder masks these.
      if (new RegExp(`\\b${word}\\b`, 'i').test(entry.clue)) selfReferential++;
    }
  }
  eq(missing, 0, 'every answer has a clue');
  eq(empty, 0, 'no clue is empty or trivially short');
  eq(selfReferential, 0, 'no clue contains its own answer');

  // And the path a real request takes: puzzle -> shard list -> rendered clues.
  const p = puzzleFrom({ seed: 'clued', size: 11, difficulty: 'medium' }, lex);
  const needed = shardsFor(p.entries.map((e) => e.answer));
  ok(needed.every((s) => shards.has(s)), 'every shard a puzzle needs exists');
  const unclued = p.entries.filter((e) => !renderClue(shards.get(e.answer[0])?.get(e.answer)));
  eq(unclued.length, 0, 'every entry of a real puzzle renders a clue');
  console.log(`  a 11x11 needs ${needed.length} shards for ${p.entries.length} clues`);
}

console.log(`\n${checks - failures}/${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
