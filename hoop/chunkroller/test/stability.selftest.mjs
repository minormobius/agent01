// stability.selftest.mjs — the room-distribution stability model + the slider solver.
//   node hoop/chunkroller/test/stability.selftest.mjs
import { sampleRooms, evaluateMix, stabilityScore, solveStableSliders, themeOf } from '../stability.js';
import { mixFromSliders, NEUTRAL, BIOMES } from '../biomes.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// ── sampler ──
const wild = mixFromSliders(NEUTRAL);
const r1 = sampleRooms(wild, 44, 7), r2 = sampleRooms(wild, 44, 7);
ok(r1.length === 44 && JSON.stringify(r1) === JSON.stringify(r2), 'sampleRooms is deterministic, n rooms');
ok(r1.every((x) => typeof x.role === 'string' && Number.isFinite(x.x) && Array.isArray(x.cells)), 'sampled rooms carry role + position + cells');

// ── evaluate ──
const e = evaluateMix(wild);
ok(e.vitality >= 0 && e.vitality <= 100 && typeof e.tier === 'string', 'evaluateMix → vitality 0..100 + a tier');
ok(JSON.stringify(evaluateMix(wild)) === JSON.stringify(e), 'evaluateMix is deterministic');

// a degenerate distribution (all homes, nothing to do/supply) scores worse than the balanced wild type
const allDwell = [['dwell', 100]];
ok(evaluateMix(allDwell).vitality < e.vitality, 'an all-homes mix is less vital than the balanced wild type');
// a thin third-place-rich mix should not be MORE fragile than all-dwell
ok(evaluateMix(allDwell).fragility >= 0, 'fragility is a share in [0,1]');

// ── the solver never worsens stability, and keeps the theme ──
const base = { ...BIOMES.dormitory.sliders };               // dormitory tends fragile (homes-heavy) — room to improve
const theme = themeOf(base);
const baseScore = stabilityScore(mixFromSliders(base));
const solved = solveStableSliders(base, { theme, seed: 3 });
ok(solved.score >= baseScore - 1e-9, `stabilize never lowers the score (${solved.score.toFixed(1)} ≥ ${baseScore.toFixed(1)})`);
ok(theme.every((k) => solved.sliders[k] >= 1.3 - 1e-9), 'stabilize keeps the biome theme above the floor');
ok(JSON.stringify(solveStableSliders(base, { theme, seed: 3 }).sliders) === JSON.stringify(solved.sliders), 'solver is deterministic from its seed');
ok(solved.vitality >= evaluateMix(mixFromSliders(base)).vitality - 1e-9, 'the solved mix is at least as vital as the base');

// ── themeOf picks the emphasized sliders ──
ok(themeOf(BIOMES.foundry.sliders).includes('industry'), 'foundry theme includes industry');
ok(themeOf(NEUTRAL).length === 0, 'wild type emphasizes nothing');

console.log(`stability.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
