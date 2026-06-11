// The generic deduction engine — this is the interestingness *oracle*.
//
// Every genus reduces to a boolean-cell CSP: an array of cells each in one of
// three states (UNKNOWN / TRUE / FALSE), plus a list of constraint objects.
// The solver does two jobs that the rest of the site is built on:
//
//   1. countSolutions() — bounded backtracking search that counts solutions up
//      to a cap. This is what *certifies* a generated puzzle is uniquely
//      solvable (count === 1). Correctness rests here, not on the propagators:
//      a fully-assigned grid is accepted only if every constraint's valid()
//      returns true, and search is exhaustive up to the cap.
//
//   2. logicSolve() — propagation to fixpoint with NO guessing, recording which
//      named deduction technique forced each cell. This tells us whether a
//      puzzle is solvable by pure logic ("fair") and yields the technique
//      fingerprint that the difficulty grader reads.
//
// A constraint is { propagate(cells) -> {contradiction, changed, technique},
//                   valid(cells) -> bool }.
// propagate() mutates `cells` in place (via assign()) and returns the indices
// it forced. valid() is a COMPLETE check of a fully-assigned grid.

export const UNKNOWN = 0;
export const TRUE = 1;
export const FALSE = 2;

// Assign cells[i] = val. Returns 1 if newly set, 0 if already that value,
// -1 on contradiction (already set to the opposite).
export function assign(cells, i, val, changed) {
  const cur = cells[i];
  if (cur === val) return 0;
  if (cur !== UNKNOWN) return -1;
  cells[i] = val;
  if (changed) changed.push(i);
  return 1;
}

function isComplete(cells) {
  for (let i = 0; i < cells.length; i++) if (cells[i] === UNKNOWN) return false;
  return true;
}

function allValid(cells, constraints) {
  for (const c of constraints) if (c.valid && !c.valid(cells)) return false;
  return true;
}

// Run every propagator to a fixpoint. Mutates `cells`. Records technique usage
// into trace.tech. Returns 'contradiction' | 'solved' | 'stuck'.
export function propagateToFix(cells, constraints, trace) {
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const c of constraints) {
      const r = c.propagate(cells);
      if (r.contradiction) return 'contradiction';
      if (r.changed && r.changed.length) {
        progressed = true;
        if (trace) {
          trace.tech[r.technique] = (trace.tech[r.technique] || 0) + r.changed.length;
          trace.steps = (trace.steps || 0) + 1;
        }
      }
    }
  }
  if (!isComplete(cells)) return 'stuck';
  return allValid(cells, constraints) ? 'solved' : 'contradiction';
}

// Choose the next cell to branch on. Default: the first UNKNOWN cell. A genus
// can supply a smarter chooser (e.g. most-constrained) via opts.chooseVar.
function defaultChooseVar(cells) {
  for (let i = 0; i < cells.length; i++) if (cells[i] === UNKNOWN) return i;
  return -1;
}

// Count solutions up to opts.max (default 2). Returns {count, trace}.
// count === 1  ⇒  uniquely solvable (the uniqueness certificate).
export function countSolutions(initCells, constraints, opts = {}) {
  const max = opts.max ?? 2;
  const chooseVar = opts.chooseVar || defaultChooseVar;
  const order = opts.branchOrder || [TRUE, FALSE];
  const trace = { tech: {}, branches: 0, maxDepth: 0, steps: 0, nodes: 0 };

  function search(cells, depth) {
    trace.nodes++;
    const status = propagateToFix(cells, constraints, null);
    if (status === 'contradiction') return 0;
    if (status === 'solved') return 1;
    const v = chooseVar(cells);
    if (v < 0) return 0;
    if (depth + 1 > trace.maxDepth) trace.maxDepth = depth + 1;
    let count = 0;
    for (const val of order) {
      trace.branches++;
      const copy = cells.slice();
      copy[v] = val;
      count += search(copy, depth + 1);
      if (count >= max) return count;
    }
    return count;
  }

  const count = search(initCells.slice(), 0);
  return { count, trace };
}

// Pure-logic solve: propagation only, no guessing. Returns
// {solved, cells, trace}. `solved` true ⇒ the puzzle is fair (no guess needed).
// The trace.tech map is the technique fingerprint the grader reads.
export function logicSolve(initCells, constraints) {
  const cells = initCells.slice();
  const trace = { tech: {}, branches: 0, maxDepth: 0, steps: 0, nodes: 1 };
  const status = propagateToFix(cells, constraints, trace);
  return { solved: status === 'solved', status, cells, trace };
}

// Convenience: is this set of givens uniquely solvable?
export function isUnique(initCells, constraints) {
  return countSolutions(initCells, constraints, { max: 2 }).count === 1;
}

// Find ONE complete valid solution from a partial grid, with branch choices
// driven by `rand` so generation is seeded/deterministic. Returns a completed
// cells array or null if unsatisfiable. Used by generators to lay down a full
// solution grid before carving clues out of it.
export function findSolution(initCells, constraints, rand, opts = {}) {
  const chooseVar = opts.chooseVar || ((cells) => {
    for (let i = 0; i < cells.length; i++) if (cells[i] === UNKNOWN) return i;
    return -1;
  });

  function search(cells) {
    const status = propagateToFix(cells, constraints, null);
    if (status === 'contradiction') return null;
    if (status === 'solved') return cells;
    const v = chooseVar(cells);
    if (v < 0) return null;
    const order = rand && rand.float() < 0.5 ? [TRUE, FALSE] : [FALSE, TRUE];
    for (const val of order) {
      const copy = cells.slice();
      copy[v] = val;
      const res = search(copy);
      if (res) return res;
    }
    return null;
  }
  return search(initCells.slice());
}
