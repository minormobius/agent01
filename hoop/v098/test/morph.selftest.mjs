// morph.selftest — pins the hoop ARCADE↔morph adapter contract (the proto). The morph engine itself is
// tested upstream in fable; here we pin the assumptions hoop's arcade relies on:
//   • each cabinet's metaSeed resolves to a 4-direction SQUARE substrate (the N/E/S/W d-pad can drive it),
//   • the puzzle is solvable, and replaying the solver's path through the INTERACTIVE mover reaches a win
//     (the same solver/interactive-consistency guarantee the forge path has).
import { gameForSeed, exactGame, genomeForSeed } from '../morph/atlas.js';
import { initialState, tryMove, isWin } from '../morph/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// mirrors index.html morphMetaFor(): pick the first square, non-degenerate metaSeed on the cabinet's line.
function metaFor(li) {
  const base = ((li + 1) * 2654435761) >>> 0;
  for (let k = 0; k < 64; k++) {
    const ms = (base + k) >>> 0, gen = genomeForSeed(ms);
    if (gen.substrate.id === 'hex') continue;
    if (gen.primary === 'lights' && gen.substrate.W * gen.substrate.H > 16) continue;
    if (gameForSeed(ms, 0)) return ms;
  }
  return base;
}

const CABINETS = 8, PUZZLES = 3;
for (let li = 0; li < CABINETS; li++) {
  const meta = metaFor(li);
  for (let inst = 0; inst < PUZZLES; inst++) {
    const g = exactGame(meta, inst) || gameForSeed(meta, inst);
    ok(!!g, `cabinet ${li} puzzle ${inst}: a game resolves`);
    if (!g) continue;
    ok(g.inst.sub.dirs === 4, `cabinet ${li} puzzle ${inst}: 4-direction substrate (got ${g.inst.sub.dirs})`);
    ok(g.solve && g.solve.solvable, `cabinet ${li} puzzle ${inst}: solvable`);
    ok(g.solve.par >= 4, `cabinet ${li} puzzle ${inst}: par ≥ 4`);
    // replay the solver path through the interactive mover → must win
    let s = initialState(g.inst), broke = false;
    for (const d of g.solve.path) { const ns = tryMove(g.inst, s, d); if (!ns) { broke = true; break; } s = ns; }
    ok(!broke && isWin(g.inst, s), `cabinet ${li} puzzle ${inst}: solver path replays to a win`);
    // determinism: same (meta,inst) → identical board
    const g2 = exactGame(meta, inst) || gameForSeed(meta, inst);
    ok(g2 && g2.solve.par === g.solve.par && g2.genome.label === g.genome.label, `cabinet ${li} puzzle ${inst}: deterministic`);
  }
}

console.log(`morph.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
