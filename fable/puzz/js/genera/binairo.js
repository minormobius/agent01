// Genus: Binairo (a.k.a. Takuzu / Unruly).
//
// An N×N grid (N even). Each cell is one of two colors. Rules:
//   R1 (triple)  : no three of the same color consecutively in a row or column.
//   R2 (balance) : each row and column has exactly N/2 of each color.
//   R3 (distinct): no two rows are identical; no two columns are identical.
//
// Cell encoding: TRUE = color A, FALSE = color B (solver.js states).
//
// Each rule is a constraint object with a sound propagator (used for deduction
// + the technique fingerprint) and a COMPLETE valid() check (used at search
// leaves — this is what makes the uniqueness certificate trustworthy even if a
// propagator is incomplete).

import { UNKNOWN, TRUE, FALSE, assign, findSolution, isUnique, logicSolve, countSolutions } from '../solver.js';

const other = (v) => (v === TRUE ? FALSE : v === FALSE ? TRUE : UNKNOWN);

// Enumerate the lines (rows then cols) of an N×N grid as index arrays.
function lines(N) {
  const ls = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    ls.push(row);
  }
  for (let c = 0; c < N; c++) {
    const col = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    ls.push(col);
  }
  return ls;
}

function tripleConstraint(N, ls) {
  return {
    technique: 'triple',
    propagate(cells) {
      const changed = [];
      for (const L of ls) {
        for (let i = 0; i + 2 < L.length; i++) {
          const a = cells[L[i]], b = cells[L[i + 1]], c = cells[L[i + 2]];
          // a a U  -> U = other(a)
          if (a !== UNKNOWN && a === b && c === UNKNOWN) {
            if (assign(cells, L[i + 2], other(a), changed) < 0) return { contradiction: true };
          }
          // U a a  -> first = other(a)
          else if (b !== UNKNOWN && b === c && a === UNKNOWN) {
            if (assign(cells, L[i], other(b), changed) < 0) return { contradiction: true };
          }
          // a U a  -> middle = other(a)
          else if (a !== UNKNOWN && a === c && b === UNKNOWN) {
            if (assign(cells, L[i + 1], other(a), changed) < 0) return { contradiction: true };
          }
          // a a a  -> contradiction
          else if (a !== UNKNOWN && a === b && b === c) {
            return { contradiction: true };
          }
        }
      }
      return { changed, technique: 'triple' };
    },
    valid(cells) {
      for (const L of ls) {
        for (let i = 0; i + 2 < L.length; i++) {
          if (cells[L[i]] === cells[L[i + 1]] && cells[L[i + 1]] === cells[L[i + 2]]) return false;
        }
      }
      return true;
    },
  };
}

function balanceConstraint(N, ls) {
  const half = N / 2;
  return {
    technique: 'balance',
    propagate(cells) {
      const changed = [];
      for (const L of ls) {
        let t = 0, f = 0;
        for (const idx of L) {
          if (cells[idx] === TRUE) t++;
          else if (cells[idx] === FALSE) f++;
        }
        if (t > half || f > half) return { contradiction: true };
        if (t === half && f < half) {
          for (const idx of L) if (cells[idx] === UNKNOWN) {
            if (assign(cells, idx, FALSE, changed) < 0) return { contradiction: true };
          }
        } else if (f === half && t < half) {
          for (const idx of L) if (cells[idx] === UNKNOWN) {
            if (assign(cells, idx, TRUE, changed) < 0) return { contradiction: true };
          }
        }
      }
      return { changed, technique: 'balance' };
    },
    valid(cells) {
      for (const L of ls) {
        let t = 0;
        for (const idx of L) if (cells[idx] === TRUE) t++;
        if (t !== half) return false;
      }
      return true;
    },
  };
}

// Distinctness: no two parallel lines identical. Propagation handles the
// "one unknown left, completing it would duplicate a finished parallel line"
// case (sound and genuinely used by human solvers). valid() is complete.
function distinctConstraint(N, rows, cols) {
  function propGroup(cells, group, changed) {
    const states = group.map((L) => L.map((i) => cells[i]));
    for (let a = 0; a < group.length; a++) {
      // count unknowns in line a
      let unk = -1, unkCount = 0;
      for (let k = 0; k < N; k++) if (states[a][k] === UNKNOWN) { unk = k; unkCount++; }
      if (unkCount !== 1) continue;
      // find a complete parallel line that matches a everywhere a is known
      for (let b = 0; b < group.length; b++) {
        if (b === a) continue;
        let complete = true, matches = true;
        for (let k = 0; k < N; k++) {
          if (states[b][k] === UNKNOWN) { complete = false; break; }
          if (k !== unk && states[a][k] !== states[b][k]) matches = false;
        }
        if (complete && matches) {
          // setting a[unk] = b[unk] would duplicate b → force the other color
          const forced = other(states[b][unk]);
          if (assign(cells, group[a][unk], forced, changed) < 0) return false;
          states[a][unk] = forced;
        }
      }
    }
    return true;
  }
  return {
    technique: 'distinct',
    propagate(cells) {
      const changed = [];
      if (!propGroup(cells, rows, changed)) return { contradiction: true };
      if (!propGroup(cells, cols, changed)) return { contradiction: true };
      return { changed, technique: 'distinct' };
    },
    valid(cells) {
      for (const group of [rows, cols]) {
        for (let a = 0; a < group.length; a++) {
          for (let b = a + 1; b < group.length; b++) {
            let same = true;
            for (let k = 0; k < N; k++) {
              if (cells[group[a][k]] !== cells[group[b][k]]) { same = false; break; }
            }
            if (same) return false;
          }
        }
      }
      return true;
    },
  };
}

export function buildConstraints(N) {
  const ls = lines(N);
  const rows = [], cols = [];
  for (let r = 0; r < N; r++) { const row = []; for (let c = 0; c < N; c++) row.push(r * N + c); rows.push(row); }
  for (let c = 0; c < N; c++) { const col = []; for (let r = 0; r < N; r++) col.push(r * N + c); cols.push(col); }
  return [tripleConstraint(N, ls), balanceConstraint(N, ls), distinctConstraint(N, rows, cols)];
}

// Build a full valid solution grid from scratch (seeded).
function fullSolution(N, rand, constraints) {
  const empty = new Int8Array(N * N).fill(UNKNOWN);
  // Seed a few random cells to diversify, then solve to completion.
  for (let s = 0; s < N; s++) {
    const i = rand.int(N * N);
    if (empty[i] === UNKNOWN) empty[i] = rand.float() < 0.5 ? TRUE : FALSE;
  }
  let sol = findSolution(empty, constraints, rand);
  if (!sol) sol = findSolution(new Int8Array(N * N).fill(UNKNOWN), constraints, rand);
  return sol;
}

// Carve clues out of a full solution. We keep the puzzle *fair*: a clue may be
// removed only if the pure-logic engine (no guessing) can still complete the
// grid. logicSolve() solving to completion implies a unique solution, so this
// gives both fairness and uniqueness in one cheap propagation pass per
// candidate. The result is a locally-minimal set under the available
// techniques — which is exactly what makes the technique fingerprint, and thus
// the difficulty grade, honest.
function carveFair(N, solution, rand, constraints) {
  const givens = solution.slice();
  const order = rand.shuffle([...Array(N * N).keys()]);
  for (const i of order) {
    const saved = givens[i];
    givens[i] = UNKNOWN;
    if (!logicSolve(givens, constraints).solved) givens[i] = saved; // restore — needed for fairness
  }
  return givens;
}

export const binairo = {
  id: 'binairo',
  name: 'Binairo',
  family: 'shade',
  blurb: 'Two colors, balanced lines, never three in a row, every line unique.',
  techniqueInfo: {
    triple: { tier: 1, label: 'No-triple', hint: 'A pair forces its neighbours to the other color.' },
    balance: { tier: 2, label: 'Line balance', hint: 'Once half a line is one color, the rest are the other.' },
    distinct: { tier: 3, label: 'Unique lines', hint: 'A line one cell from matching a finished line is forced to differ.' },
  },
  // pick params from a seeded rand; difficulty knob 0..1 nudges size
  pickParams(rand) {
    const N = rand.weighted([
      { v: 6, w: 2 }, { v: 8, w: 4 }, { v: 10, w: 4 }, { v: 12, w: 3 }, { v: 14, w: 1 },
    ]);
    return { N };
  },
  generate(rand, params) {
    const { N } = params;
    const constraints = buildConstraints(N);
    let solution = null;
    for (let attempt = 0; attempt < 12 && !solution; attempt++) {
      solution = fullSolution(N, rand.fork('sol' + attempt), constraints);
    }
    if (!solution) return null;
    const givens = carveFair(N, solution, rand.fork('carve'), constraints);
    const grade = logicSolve(givens, constraints);
    let clues = 0;
    for (let i = 0; i < givens.length; i++) if (givens[i] !== UNKNOWN) clues++;
    return {
      genus: 'binairo',
      genusDef: binairo,
      label: `Binairo ${N}×${N}`,
      size: { rows: N, cols: N },
      V: N * N,
      givens,
      solution,
      constraints,
      meta: { N, clues, colors: ['A', 'B'] },
      grade,
    };
  },
  rebuildConstraints(inst) {
    return buildConstraints(inst.meta.N);
  },
};
