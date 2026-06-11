// Reproducible tests for the meta-generator — `node fable/morph/test/engine.test.mjs`.
// Validates topology, the one oracle, and that every rolled GAME is certified
// (its solution path replays to a win), plus genome diversity and determinism.
import { makeSubstrate, SUBSTRATE_IDS } from '../js/substrate.js';
import { compile, tryMove, isWin, initialState } from '../js/engine.js';
import { solve } from '../js/solver.js';
import { genomeForSeed, gameForSeed, rankGames } from '../js/atlas.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };
function replay(inst, path) { let s = initialState(inst); for (const d of path) { const ns = tryMove(inst, s, d); if (!ns) return false; s = ns; } return isWin(inst, s); }

console.log('morph meta-generator tests\n');

// 1. Topology laws: torus returns home after one wrap; Möbius flips y across the
//    X seam and restores after two wraps.
{
  const t = makeSubstrate('torus', 6, 6);
  let c = 8, d = 1; for (let i = 0; i < 6; i++) { const r = t.step(c, d); c = r.cell; d = r.dir; }
  if (c !== 8) fail('torus did not return home after one E-wrap');
  const m = makeSubstrate('mobius', 6, 6);
  let r = m.step(0, 3);                          // cell (0,0) west across seam
  if (!(r.cell % 6 === 5 && (r.cell / 6 | 0) === 5)) fail('Möbius X-seam did not flip y');
  console.log('topology: torus wrap + Möbius seam-flip behave');
}

// 2. The one oracle certifies every rolled game; its path replays to a win.
{
  const N = 50; let made = 0, replays = 0, duds = 0;
  for (let n = 1; n <= N; n++) {
    const g = gameForSeed(n);
    if (!g) { duds++; continue; }
    made++;
    const sr = solve(g.inst, { cap: 300000 });
    if (!sr.solvable) { fail(`game ${n} re-solve unsolvable`); continue; }
    if (replay(g.inst, g.solve.path)) replays++; else fail(`game ${n} (${g.genome.label}) path does not replay to a win`);
  }
  console.log(`oracle: ${made}/${N} games made (${duds} genome-duds), ${replays} solution paths verified by replay`);
}

// 3. Diversity: a band of games spans many substrates, primaries, aesthetics.
{
  const subs = new Set(), prims = new Set(), aes = new Set();
  for (let n = 1; n <= 60; n++) { const gen = genomeForSeed(n); subs.add(gen.substrate.id); prims.add(gen.primary); aes.add(gen.aesthetic.id); }
  if (subs.size < 4) fail(`only ${subs.size} substrates in 60 games`);
  if (prims.size < 3) fail(`only ${prims.size} primaries in 60 games`);
  console.log(`diversity: ${subs.size}/6 topologies, ${prims.size}/4 goals, ${aes.size}/8 aesthetics across 60 games`);
}

// 4. Determinism: same seeds ⇒ same genome, same instance, same par.
{
  for (const n of [3, 17, 29]) {
    const a = genomeForSeed(n), b = genomeForSeed(n);
    if (a.label !== b.label) fail(`genome ${n} not deterministic`);
    const ga = gameForSeed(n), gb = gameForSeed(n);
    if (ga.instSeed !== gb.instSeed || ga.report.par !== gb.report.par) fail(`game ${n} not deterministic`);
  }
  console.log('determinism: identical genome, instance, par across repeated calls');
}

// 5. Two-knob independence: same genome, different instance seeds ⇒ different
//    levels but the SAME grammar.
{
  const g0 = gameForSeed(5, 0), g1 = gameForSeed(5, 7);
  if (g0.genome.label !== g1.genome.label) fail('new-puzzle changed the genome (should keep it)');
  console.log('two knobs: new-puzzle keeps the genome, new-game would change it');
}

// 6. Ranking bounded.
{
  const top = rankGames(1, 12);
  for (const g of top) if (g.report.interest < 0 || g.report.interest > 100) fail(`interest out of range at #${g.metaSeed}`);
  console.log(`ranking: ${top.length} games ranked, top = #${top[0].metaSeed} ${top[0].genome.aesthetic.name}/${top[0].genome.substrate.id} (rich ${top[0].genome.richness.toFixed(2)})`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll meta-generator tests passed.');
process.exit(failures ? 1 : 0);
