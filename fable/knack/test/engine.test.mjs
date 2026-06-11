// Reproducible engine tests — run with `node fable/knack/test/engine.test.mjs`.
// The crucial check: independently replay the solver's optimal path through the
// engine's step() and assert it reaches a winning state — this cross-checks that
// the solver and the transition function agree, which is what makes "solvable"
// and "par" trustworthy. No DOM, no network.
import { levelForSeed, rankBand } from '../js/atlas.js';
import { initialState, step, isWin } from '../js/engine.js';
import { solve } from '../js/solver.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

function replay(level, path) {
  let s = initialState(level);
  for (const d of path) { const ns = step(level, s, d); if (!ns) return false; s = ns; }
  return isWin(level, s);
}

console.log('knack engine tests\n');

// 1. Every seed generates a solvable level whose solver path actually wins.
{
  const N = 80; let made = 0, solv = 0, replays = 0;
  for (let n = 1; n <= N; n++) {
    const p = levelForSeed(n);
    if (!p) { fail(`seed ${n} produced no level`); continue; }
    made++;
    const sr = solve(p.level, { cap: 300000 });
    if (sr.solvable) solv++; else { fail(`seed ${n} (${p.level.bundle}) re-solve unsolvable`); continue; }
    if (sr.par !== p.report.par) fail(`seed ${n} par drift: stored ${p.report.par}, re-solved ${sr.par}`);
    if (replay(p.level, p.solve.path)) replays++; else fail(`seed ${n} (${p.level.bundle}) solver path does NOT win when replayed`);
  }
  console.log(`generation: ${made}/${N} made, ${solv} solvable, ${replays} solver-paths verified by replay`);
}

// 2. Determinism: same seed ⇒ identical level + path + grade.
{
  for (const n of [3, 17, 42, 99]) {
    const a = levelForSeed(n), b = levelForSeed(n);
    if (JSON.stringify(a.solve.path) !== JSON.stringify(b.solve.path)) fail(`seed ${n} path not deterministic`);
    if (a.report.interest !== b.report.interest || a.report.par !== b.report.par) fail(`seed ${n} grade not deterministic`);
    if (a.level.bundle !== b.level.bundle) fail(`seed ${n} bundle not deterministic`);
  }
  console.log('determinism: identical level, path, and grade across repeated calls');
}

// 3. Optimality sanity: no shorter winning path exists than reported par
//    (BFS guarantees this; we re-confirm par > 0 and within bundle floor).
{
  let ok = 0;
  for (let n = 1; n <= 40; n++) {
    const p = levelForSeed(n);
    if (p.report.par > 0 && p.report.par >= 3) ok++; else fail(`seed ${n} par ${p.report.par} suspiciously small`);
  }
  console.log(`par sanity: ${ok}/40 have a non-trivial optimal length`);
}

// 4. Ranking bounded and sorted.
{
  const band = rankBand(1, 24);
  for (let i = 1; i < band.length; i++) if (band[i].report.interest > band[i - 1].report.interest) fail('rankBand not sorted');
  for (const p of band) {
    if (p.report.interest < 0 || p.report.interest > 100) fail(`interest ${p.report.interest} out of range`);
    if (p.report.difficulty < 0 || p.report.difficulty > 100) fail(`difficulty ${p.report.difficulty} out of range`);
  }
  console.log(`ranking: band sorted, scores in [0,100], top = #${band[0].n} ${band[0].level.bundle} (${band[0].report.interest})`);
}

// 5. Warehouse (deep tier): A* certifies, paths replay, and A* par matches BFS
//    par on instances small enough for both — the optimality cross-check.
{
  const { solveAStar } = await import('../js/solver.js');
  let made = 0, replays = 0, agree = 0, checked = 0;
  for (let n = 1; n <= 8; n++) {
    const p = levelForSeed(n, { bundle: 'warehouse' });
    if (!p) continue;
    made++;
    if (replay(p.level, p.solve.path)) replays++; else fail(`warehouse ${n} path does not replay to a win`);
    if (p.report.par < 16) fail(`warehouse ${n} par ${p.report.par} below the deep floor`);
    if (p.solve.nodes < 700000) { // tractable enough to double-check with BFS
      const b = solve(p.level, { cap: 900000 });
      if (b.solvable) { checked++; if (b.par === p.report.par) agree++; else fail(`warehouse ${n} A* par ${p.report.par} ≠ BFS ${b.par}`); }
    }
  }
  console.log(`warehouse: ${made}/8 made, ${replays} replay-verified, A*-vs-BFS optimality agreed ${agree}/${checked}`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll engine tests passed.');
process.exit(failures ? 1 : 0);
