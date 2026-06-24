// morph.selftest — pins the hoop ARCADE↔morph adapter contract. Mirrors index.html's `morphFirstPlayable`
// (first solvable+headline instance; lights capped to 3×3 so its BFS is instant) across EVERY substrate
// (incl. hex). For each: a game resolves, carries the right direction count (4 square / 6 hex), and
// replaying the solver's path through the INTERACTIVE mover reaches a win — the consistency guarantee.
import { genomeForSeed } from '../morph/atlas.js';
import { Rand } from '../morph/prng.js';
import { buildInstance } from '../morph/instance.js';
import { solve, analyzePath } from '../morph/solver.js';
import { gradeInstance, headlineUsed } from '../morph/difficulty.js';
import { initialState, tryMove, isWin } from '../morph/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// the proto's resolver, replicated (kept in sync with index.html morphFirstPlayable).
function firstPlayable(metaSeed, instSeed) {
  let genome = genomeForSeed(metaSeed);
  if (genome.primary === 'lights') genome = { ...genome, substrate: { ...genome.substrate, W: 3, H: 3 }, label: genome.label.replace(/\d+×\d+/, '3×3') };
  for (let k = 0; k < 36; k++) {
    let inst; try { inst = buildInstance(genome, new Rand('morph::' + metaSeed + '::i' + (instSeed + k))); } catch (e) { continue; }
    const sr = solve(inst, { cap: 150000 });
    if (!sr.solvable || sr.par < 4) continue;
    const pa = analyzePath(inst, sr.path);
    if (!headlineUsed(inst, pa)) continue;
    return { genome, inst, solve: sr, report: gradeInstance(inst, sr, pa), instSeed: instSeed + k };
  }
  return null;
}
function gameForSubstrate(subId) {
  for (let ms = 1; ms < 16000; ms++) {
    if (genomeForSeed(ms).substrate.id !== subId) continue;
    const g = firstPlayable(ms, 0);
    if (g) return { ms, ...g };
  }
  return null;
}

const SUBS = ['grid', 'cylinder', 'torus', 'mobius', 'klein', 'hex'];
for (const sub of SUBS) {
  const g = gameForSubstrate(sub);
  ok(!!g, `substrate ${sub}: a game resolves`);
  if (!g) continue;
  const expectDirs = sub === 'hex' ? 6 : 4;
  ok(g.inst.sub.dirs === expectDirs, `substrate ${sub}: ${expectDirs}-direction (got ${g.inst.sub.dirs})`);
  ok(g.solve.par >= 4, `substrate ${sub}: par ≥ 4 (par ${g.solve.par})`);
  ok(g.report && g.report.diffTier, `substrate ${sub}: graded (tier ${g.report && g.report.diffTier})`);
  for (let inst = 0; inst <= 3; inst++) {
    const gi = firstPlayable(g.ms, inst);
    if (!gi) { ok(false, `substrate ${sub} inst ${inst}: resolves`); continue; }
    let s = initialState(gi.inst), broke = false;
    for (const d of gi.solve.path) { const ns = tryMove(gi.inst, s, d); if (!ns) { broke = true; break; } s = ns; }
    ok(!broke && isWin(gi.inst, s), `substrate ${sub} inst ${inst}: solver path replays to a win`);
  }
  console.log(`  ${sub} → ${g.genome.label} | par ${g.solve.par} | dirs ${g.inst.sub.dirs}`);
}

console.log(`morph.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
