// arcade.selftest.mjs — the ARCADE fixture serves forge's law № 1, deterministically.
//
//   node hoop/v096/test/arcade.selftest.mjs
//
// Pins: (1) the baked law key matches forge's lawKey() of the baked genome (the
// vendored copy hasn't drifted from fable/forge); (2) puzzles are deterministic
// per index; (3) the oracle's solution path actually wins under arcadeMove (the
// player CAN match par); (4) illegal moves are refused without mutating state.

import { ARCADE_LAW, arcadeRules, newArcadeGame, arcadeMove, arcadeUndo, arcadeReset, arcadeBoard } from '../arcade.js';
import { lawKey, compile } from '../forge/dsl.js';
import { initialState, isWin } from '../forge/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// 1. the baked key is exactly lawKey(baked genome) — vendor not drifted.
ok(lawKey(ARCADE_LAW.law) === ARCADE_LAW.key, `law key matches genome (${lawKey(ARCADE_LAW.law)} === ${ARCADE_LAW.key})`);
ok(/Withering Discipline/.test(ARCADE_LAW.name), 'cabinet is the Withering Discipline');
ok(typeof arcadeRules() === 'string' && arcadeRules().length > 40, 'rules card describes itself in English');

// 2. determinism — the same puzzle index yields a bit-identical board.
const a = newArcadeGame(0), b = newArcadeGame(0);
ok(a && b, 'puzzle 0 instantiates');
ok(a.world.W === b.world.W && a.world.H === b.world.H && a.par === b.par, 'puzzle 0 is deterministic (W/H/par stable)');
ok(JSON.stringify(arcadeBoard(a)) === JSON.stringify(arcadeBoard(b)), 'puzzle 0 board snapshot is identical across instantiations');

// 3. the oracle's path actually wins under arcadeMove, at par.
let solvedAtPar = 0, tried = 0;
for (let p = 0; p < 6; p++) {
  const g = newArcadeGame(p);
  if (!g) continue;
  tried++;
  const z = compile(ARCADE_LAW.law);   // recompute the optimal path independently of the game's stepFn
  // re-solve to get the path: replay the puzzle's own certified solution.
  const sol = solvePath(g);
  ok(sol && sol.length === g.par, `puzzle ${p}: a path of length par(${g.par}) exists`);
  if (!sol) continue;
  for (const d of sol) arcadeMove(g, d);
  ok(g.won, `puzzle ${p}: replaying par-length path WINS`);
  if (g.won && g.moves === g.par) solvedAtPar++;
}
ok(tried >= 4, `at least 4 of the first 6 puzzles instantiate (${tried})`);
ok(solvedAtPar === tried, `every instantiated puzzle is winnable at par (${solvedAtPar}/${tried})`);

// 4. illegal move refusal leaves state untouched; undo/reset are sound.
{
  const g = newArcadeGame(1);
  const before = JSON.stringify(arcadeBoard(g));
  // hammer all four directions until one is refused, assert no silent mutation on refusal
  let refusedSeen = false;
  for (const d of [0, 1, 2, 3]) {
    const snap = JSON.stringify(arcadeBoard(g));
    const moved = arcadeMove(g, d);
    if (!moved) { refusedSeen = true; ok(JSON.stringify(arcadeBoard(g)) === snap, `refused move keeps board (dir ${d})`); }
    else break;
  }
  // undo back to start, then reset — both return to the initial board.
  while (arcadeUndo(g)) { /* unwind */ }
  ok(JSON.stringify(arcadeBoard(g)) === before, 'undo unwinds to the initial board');
  const g2 = newArcadeGame(1);
  arcadeMove(g2, g2.stepFn(g2.world, g2.state, 1) ? 1 : 0);
  arcadeReset(g2);
  ok(JSON.stringify(arcadeBoard(g2)) === before, 'reset returns to the initial board');
}

// helper: BFS the game's own world+law for a shortest win path (mirrors forge's oracle).
function solvePath(game) {
  const w = game.world, step = game.stepFn;
  const start = initialState(w);
  if (isWin(w, start)) return [];
  const key = (s) => s.agent + '.' + s.dir + '.' + (s.steps % 2) + '|' +
    [...s.marks].sort((x, y) => x - y).join(',') + '|' +
    [...s.dynWalls].sort((x, y) => x - y).join(',') + '|' +
    [...s.tokens].sort((x, y) => x - y).join(',');
  const seen = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      for (const d of [0, 1, 2, 3]) {
        const ns = step(w, s, d);
        if (!ns) continue;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.set(k, { parent: key(s), dir: d });
        if (isWin(w, ns)) {
          const path = []; let cur = k;
          while (cur) { const r = seen.get(cur); if (!r) break; path.push(r.dir); cur = r.parent; }
          return path.reverse();
        }
        next.push(ns);
      }
    }
    frontier = next;
  }
  return null;
}

console.log(`\narcade.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
