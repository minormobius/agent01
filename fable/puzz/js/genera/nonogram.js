// Genus: Nonogram (a.k.a. Picross / Griddler).
//
// An R×C grid. Each cell is filled or blank. Numbers beside each row and column
// give the lengths of the consecutive filled runs, in order. Cells start all
// UNKNOWN; the clues ARE the puzzle, so there is nothing to carve.
//
// Cell encoding: TRUE = filled, FALSE = blank.
//
// One constraint object covers every line. Its propagator is a real nonogram
// line-solver: for each row/column it enumerates the run placements consistent
// with the clue and the cells already known, then forces any cell that is
// filled in all of them (or blank in all of them). valid() checks that a fully
// assigned line's runs match its clue exactly.

import { UNKNOWN, TRUE, FALSE, assign, logicSolve } from '../solver.js';

// Enumerate run placements of `clue` into a line of `length`, consistent with
// `known` (Int8 states). Calls cb(filledBoolArray) for each. Returns the number
// of placements (capped at `cap`; if exceeded, returns -1 = "too many").
function enumerate(clue, length, known, cb, cap) {
  let count = 0;
  const filled = new Array(length).fill(false);
  let overflow = false;
  function place(runIdx, pos) {
    if (overflow) return;
    if (runIdx === clue.length) {
      for (let i = pos; i < length; i++) if (known[i] === TRUE) return; // tail must be blank
      count++;
      if (count > cap) { overflow = true; return; }
      cb(filled);
      return;
    }
    const run = clue[runIdx];
    for (let start = pos; start + run <= length; start++) {
      let ok = true;
      for (let i = pos; i < start; i++) if (known[i] === TRUE) { ok = false; break; } // gap can't cover a known-filled
      if (!ok) continue;
      for (let i = start; i < start + run; i++) if (known[i] === FALSE) { ok = false; break; } // run can't cover a known-blank
      if (!ok) continue;
      for (let i = start; i < start + run; i++) filled[i] = true;
      place(runIdx + 1, start + run + 1);
      for (let i = start; i < start + run; i++) filled[i] = false;
      if (overflow) return;
    }
  }
  if (clue.length === 0) {
    for (let i = 0; i < length; i++) if (known[i] === TRUE) return 0; // a filled cell where the clue says empty: impossible
    cb(filled); return 1;
  }
  place(0, 0);
  return overflow ? -1 : count;
}

// Solve one line as far as logic allows. Mutates `cells` via assign().
// Returns {contradiction, changed, hadKnown}.
function solveLine(cells, idxs, clue) {
  const length = idxs.length;
  const known = idxs.map((i) => cells[i]);
  let hadKnown = false;
  for (const s of known) if (s !== UNKNOWN) { hadKnown = true; break; }

  const possFilled = new Array(length).fill(false);
  const possBlank = new Array(length).fill(false);
  let any = false;
  const n = enumerate(clue, length, known, (filled) => {
    any = true;
    for (let i = 0; i < length; i++) {
      if (filled[i]) possFilled[i] = true; else possBlank[i] = true;
    }
  }, 200000);
  if (n === -1) return { changed: [], hadKnown }; // too many arrangements — defer
  if (!any) return { contradiction: true };

  const changed = [];
  for (let i = 0; i < length; i++) {
    if (cells[idxs[i]] !== UNKNOWN) continue;
    if (possFilled[i] && !possBlank[i]) { if (assign(cells, idxs[i], TRUE, changed) < 0) return { contradiction: true }; }
    else if (!possFilled[i] && possBlank[i]) { if (assign(cells, idxs[i], FALSE, changed) < 0) return { contradiction: true }; }
  }
  return { changed, hadKnown };
}

function runsOf(line) {
  const runs = [];
  let r = 0;
  for (const v of line) {
    if (v === TRUE) r++;
    else { if (r) runs.push(r); r = 0; }
  }
  if (r) runs.push(r);
  return runs;
}

function eqRuns(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function buildConstraints(R, C, rowClues, colClues) {
  const rowIdx = [], colIdx = [];
  for (let r = 0; r < R; r++) { const a = []; for (let c = 0; c < C; c++) a.push(r * C + c); rowIdx.push(a); }
  for (let c = 0; c < C; c++) { const a = []; for (let r = 0; r < R; r++) a.push(r * C + c); colIdx.push(a); }

  const lines = [];
  for (let r = 0; r < R; r++) lines.push({ idxs: rowIdx[r], clue: rowClues[r] });
  for (let c = 0; c < C; c++) lines.push({ idxs: colIdx[c], clue: colClues[c] });

  return [{
    technique: 'line',
    propagate(cells) {
      const changed = [];
      // bucket changes by technique flavour for the difficulty fingerprint:
      // 'overlap' = forced on a line that was still blank (classic free overlap);
      // 'chain'   = forced using cells already known (genuine chaining).
      this._tech = { overlap: 0, chain: 0 };
      for (const L of lines) {
        const r = solveLine(cells, L.idxs, L.clue);
        if (r.contradiction) return { contradiction: true };
        if (r.changed.length) {
          for (const _ of r.changed) (r.hadKnown ? this._tech.chain++ : this._tech.overlap++);
          changed.push(...r.changed);
        }
      }
      // report the dominant flavour for this round so the trace records both
      if (this._tech.chain > 0 && this._tech.overlap === 0) return { changed, technique: 'chain' };
      if (this._tech.overlap > 0 && this._tech.chain === 0) return { changed, technique: 'overlap' };
      // mixed round: bias toward the harder label so deep solves grade up
      return { changed, technique: this._tech.chain >= this._tech.overlap ? 'chain' : 'overlap' };
    },
    valid(cells) {
      for (const L of lines) {
        const line = L.idxs.map((i) => cells[i]);
        if (!eqRuns(runsOf(line), L.clue)) return false;
      }
      return true;
    },
  }];
}

function computeClues(grid, R, C) {
  const rowClues = [], colClues = [];
  for (let r = 0; r < R; r++) rowClues.push(runsOf(Array.from({ length: C }, (_, c) => grid[r * C + c])));
  for (let c = 0; c < C; c++) colClues.push(runsOf(Array.from({ length: R }, (_, r) => grid[r * C + c])));
  return { rowClues, colClues };
}

export const nonogram = {
  id: 'nonogram',
  name: 'Nonogram',
  family: 'shade',
  blurb: 'Row and column run-length clues reconstruct a hidden picture.',
  techniqueInfo: {
    overlap: { tier: 1, label: 'Free overlap', hint: 'Long runs must overlap themselves no matter where they sit.' },
    chain: { tier: 2, label: 'Cross-chaining', hint: 'A cell known from one line constrains the crossing line.' },
  },
  pickParams(rand) {
    const N = rand.weighted([
      { v: 5, w: 2 }, { v: 8, w: 4 }, { v: 10, w: 4 }, { v: 12, w: 2 }, { v: 15, w: 1 },
    ]);
    const density = 0.45 + rand.float() * 0.2;
    return { R: N, C: N, density };
  },
  generate(rand, params) {
    const { R, C, density } = params;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = rand.fork('grid' + attempt);
      const grid = new Int8Array(R * C);
      for (let i = 0; i < R * C; i++) grid[i] = a.float() < density ? TRUE : FALSE;
      // reject all-blank lines occasionally to keep pictures lively, but allow some
      const { rowClues, colClues } = computeClues(grid, R, C);
      const constraints = buildConstraints(R, C, rowClues, colClues);
      const givens = new Int8Array(R * C).fill(UNKNOWN);
      const res = logicSolve(givens, constraints);
      if (!res.solved) continue;
      // solved-by-logic ⇒ unique; confirm it reconstructs our grid
      let ok = true;
      for (let i = 0; i < R * C; i++) if (res.cells[i] !== grid[i]) { ok = false; break; }
      if (!ok) continue;
      let totalClue = 0;
      for (const rc of rowClues) totalClue += rc.length;
      for (const cc of colClues) totalClue += cc.length;
      return {
        genus: 'nonogram',
        genusDef: nonogram,
        label: `Nonogram ${R}×${C}`,
        size: { rows: R, cols: C },
        V: R * C,
        givens,
        solution: grid,
        constraints,
        meta: { R, C, rowClues, colClues, clueCount: totalClue },
        grade: res,
      };
    }
    return null;
  },
  rebuildConstraints(inst) {
    return buildConstraints(inst.meta.R, inst.meta.C, inst.meta.rowClues, inst.meta.colClues);
  },
};
