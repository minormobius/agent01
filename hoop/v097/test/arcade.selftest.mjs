// arcade.selftest.mjs — the ARCADE fixture serves forge's codex laws, one per
// cabinet, deterministically.
//
//   node hoop/v096/test/arcade.selftest.mjs
//
// Pins: (1) every baked law key matches forge's lawKey() of its genome (the
// vendored copy hasn't drifted); (2) cabinet→law selection is stable; (3) puzzles
// are deterministic per (law, index); (4) the oracle's solution path wins under
// arcadeMove at par; (5) illegal moves are refused without mutating state;
// (6) rewards are positive and scale with par.

import { ARCADE_LAWS, lawIndexForKey, arcadeRules, GOAL_BLURB, newArcadeGame,
         arcadeMove, arcadeUndo, arcadeReset, arcadeBoard, arcadeReward } from '../arcade.js';
import { lawKey } from '../forge/dsl.js';
import { initialState, isWin } from '../forge/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// 1. every baked key is exactly lawKey(genome) — vendor not drifted.
ok(ARCADE_LAWS.length === 22, `full codex baked (${ARCADE_LAWS.length})`);
for (const e of ARCADE_LAWS) ok(lawKey(e.law) === e.key, `law "${e.name}" key matches genome`);
ok(/Withering Discipline/.test(ARCADE_LAWS[0].name), 'cabinet 0 is the Withering Discipline (forge codex № 1)');
ok(typeof arcadeRules(0) === 'string' && arcadeRules(0).length > 40, 'rules card describes itself in English');

// 2. cabinet key → law index is stable and in range.
const i1 = lawIndexForKey('ch5:r12'), i2 = lawIndexForKey('ch5:r12');
ok(i1 === i2 && i1 >= 0 && i1 < ARCADE_LAWS.length, 'cabinet→law selection is stable + in range');
ok(new Set([0, 1, 2, 3, 4, 5].map((n) => lawIndexForKey('cab' + n))).size > 1, 'different cabinets get different laws');

// 3. determinism — same (law, index) yields a bit-identical board.
const a = newArcadeGame(0, 0), b = newArcadeGame(0, 0);
ok(a && b, 'cabinet 0 / puzzle 0 instantiates');
ok(JSON.stringify(arcadeBoard(a)) === JSON.stringify(arcadeBoard(b)), 'board snapshot is identical across instantiations');
ok(GOAL_BLURB[a.goal], 'goal has a HUD blurb');

// 4. the oracle's path wins under arcadeMove at par, across every cabinet.
for (let L = 0; L < ARCADE_LAWS.length; L++) {
  const g = newArcadeGame(L, 0);
  ok(g, `cabinet ${L} (${ARCADE_LAWS[L].name}) deals puzzle 0`);
  if (!g) continue;
  const sol = solvePath(g);
  ok(sol && sol.length === g.par, `cabinet ${L}: a par(${g.par}) path exists`);
  if (!sol) continue;
  for (const d of sol) arcadeMove(g, d);
  ok(g.won && g.moves === g.par, `cabinet ${L}: replaying the par path WINS at par`);
  ok(arcadeReward(g) > 0, `cabinet ${L}: a win pays out (${arcadeReward(g)} coins)`);
}

// 5. illegal move refusal + undo/reset soundness.
{
  const g = newArcadeGame(0, 1);
  const before = JSON.stringify(arcadeBoard(g));
  for (const d of [0, 1, 2, 3]) {
    const snap = JSON.stringify(arcadeBoard(g));
    if (!arcadeMove(g, d)) ok(JSON.stringify(arcadeBoard(g)) === snap, `refused move keeps board (dir ${d})`);
    else break;
  }
  while (arcadeUndo(g)) { /* unwind */ }
  ok(JSON.stringify(arcadeBoard(g)) === before, 'undo unwinds to the initial board');
  const g2 = newArcadeGame(0, 1);
  if (g2.stepFn(g2.world, g2.state, 1)) arcadeMove(g2, 1);
  arcadeReset(g2);
  ok(JSON.stringify(arcadeBoard(g2)) === before, 'reset returns to the initial board');
}

// 6. reward scales with par (a harder board pays more).
ok(arcadeReward({ par: 14, report: { difficulty: 60 } }) > arcadeReward({ par: 5, report: { difficulty: 20 } }), 'reward grows with par + difficulty');

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
