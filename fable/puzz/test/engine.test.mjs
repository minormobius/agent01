// Reproducible engine tests — run with `node fable/puzz/test/engine.test.mjs`.
// No DOM, no network: the generator/solver/grader all run in plain node.
// Exits non-zero on any failure.
import { puzzleForSeed, rankBand } from '../js/atlas.js';
import { countSolutions, logicSolve } from '../js/solver.js';

let failures = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };

console.log('puzz engine tests\n');

// 1. Every seed in a band generates, is uniquely solvable, and is fair.
{
  const N = 80;
  let unique = 0, fair = 0, made = 0;
  for (let n = 1; n <= N; n++) {
    const p = puzzleForSeed(n);
    if (!p) { fail(`seed ${n} produced no puzzle`); continue; }
    made++;
    const cons = p.inst.genusDef.rebuildConstraints(p.inst);
    const { count } = countSolutions(p.inst.givens, cons, { max: 2 });
    if (count === 1) unique++; else fail(`seed ${n} (${p.inst.label}) has ${count} solutions`);
    const ls = logicSolve(p.inst.givens, cons);
    if (ls.solved) fair++; else fail(`seed ${n} (${p.inst.label}) is not pure-logic solvable`);
  }
  console.log(`generation: ${made}/${N} made, ${unique} unique, ${fair} fair`);
}

// 2. Determinism: same seed ⇒ identical givens + grade, twice.
{
  for (const n of [3, 17, 42, 99]) {
    const a = puzzleForSeed(n), b = puzzleForSeed(n);
    const ga = JSON.stringify(Array.from(a.inst.givens));
    const gb = JSON.stringify(Array.from(b.inst.givens));
    if (ga !== gb) fail(`seed ${n} givens not deterministic`);
    if (a.report.interest !== b.report.interest) fail(`seed ${n} grade not deterministic`);
  }
  console.log('determinism: identical re-generation across repeated calls');
}

// 3. The logic solution matches the stored solution (no divergent uniqueness).
{
  let ok = 0;
  for (let n = 1; n <= 40; n++) {
    const p = puzzleForSeed(n);
    const cons = p.inst.genusDef.rebuildConstraints(p.inst);
    const ls = logicSolve(p.inst.givens, cons);
    let match = ls.solved;
    if (match) for (let i = 0; i < p.inst.V; i++) if (ls.cells[i] !== p.inst.solution[i]) { match = false; break; }
    if (match) ok++; else fail(`seed ${n} logic solution diverges from stored solution`);
  }
  console.log(`consistency: ${ok}/40 logic solutions match stored solution`);
}

// 4. The interest ranking is a total order (sanity) and bounded 0..100.
{
  const band = rankBand(1, 24);
  let monotone = true;
  for (let i = 1; i < band.length; i++) if (band[i].report.interest > band[i - 1].report.interest) monotone = false;
  if (!monotone) fail('rankBand not sorted by interest desc');
  for (const p of band) {
    if (p.report.interest < 0 || p.report.interest > 100) fail(`interest ${p.report.interest} out of range`);
    if (p.report.difficulty < 0 || p.report.difficulty > 100) fail(`difficulty ${p.report.difficulty} out of range`);
  }
  console.log(`ranking: band sorted, scores in [0,100], top = #${band[0].n} (${band[0].report.interest})`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll engine tests passed.');
process.exit(failures ? 1 : 0);
