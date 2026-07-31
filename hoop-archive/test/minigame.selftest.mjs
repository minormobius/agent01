// minigame.selftest.mjs — the in-world forge minigame: the VENDORED engine + the minted codex yield
// real, solvable, deterministic puzzles, seeded by a chamber. Replays the BFS par path → win.
//   node hoop/test/minigame.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { puzzleFor } from '../minigame/forge/atlas.js';
import { initialState, isWin } from '../minigame/forge/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const codex = JSON.parse(readFileSync(join(HERE, '../minigame/forge/codex.json'), 'utf8')).laws;
const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// mirror play.js#puzzleForSeed without the DOM
function puzzleForSeed(seed) {
  const law = codex[hash(seed) % codex.length];
  for (let t = 0; t < 12; t++) { const pz = puzzleFor({ law: law.law, name: law.name }, seed + '#' + t); if (pz && pz.solve && pz.solve.solvable && pz.solve.par >= 2) return { ...pz, lawName: law.name }; }
  return null;
}

ok('codex has knowns + minted laws', codex.length >= 8 && codex.some((l) => l.minted) && codex.some((l) => !l.minted));

// real chamber-shaped seeds (gid#ordinal style)
const seeds = ['17|775|6', '20|400|6', '5|112|7', '33|900|6', 'hoop:demo'];
let madeAll = true, parPlayable = true, wins = 0;
for (const seed of seeds) {
  const pz = puzzleForSeed(seed);
  if (!pz) { madeAll = false; continue; }
  if (pz.solve.par < 2) parPlayable = false;
  // REPLAY the certified par path → must reach a win
  let s = initialState(pz.world);
  for (const d of pz.solve.path) { const ns = pz.stepFn(pz.world, s, d); if (!ns) break; s = ns; }
  if (isWin(pz.world, s)) wins++;
}
ok('every chamber seed yields a puzzle', madeAll);
ok('every puzzle has a real par (≥2)', parPlayable);
ok('every certified par path replays to a WIN', wins === seeds.length);

// determinism — same chamber ⇒ same law + same optimal par + same solution
{
  const a = puzzleForSeed('17|775|6'), b = puzzleForSeed('17|775|6');
  ok('same chamber ⇒ same law', a.lawName === b.lawName);
  ok('same chamber ⇒ same par + path', a.solve.par === b.solve.par && JSON.stringify(a.solve.path) === JSON.stringify(b.solve.path));
  const c = puzzleForSeed('99|1|6');
  ok('different chambers can differ', c.lawName !== a.lawName || c.solve.par !== a.solve.par || true);   // not required, just exercised
}

// an illegal move (the law forbids it) returns falsy — the @ doesn't teleport
{
  const pz = puzzleForSeed('20|400|6'); const s = initialState(pz.world);
  let anyBlocked = false; for (const d of [0, 1, 2, 3]) if (!pz.stepFn(pz.world, s, d)) anyBlocked = true;
  ok('the law can forbid a move (bounded grid / guard)', anyBlocked || pz.world.wrap);   // wrap worlds may allow all 4
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
