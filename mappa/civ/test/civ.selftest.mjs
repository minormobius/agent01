// mappa/civ/test/civ.selftest.mjs — node selftest for the civ sim. No network, no UI.
//   node mappa/civ/test/civ.selftest.mjs
// Exercises the determinism gate, config-token round-trip, the capability DAG, the
// world adapter, the signals battery's discrimination, and a preset run end-to-end.

import { generateWorld } from '../../engine.js';
import { createSim } from '../engine.js';
import { loadCivWorld, cellK } from '../world.js';
import { defaultConfig, encodeCivConfig, decodeCivConfig, normalizeConfig } from '../config.js';
import { civSignals } from '../signals.js';
import { chronicleHash } from '../chronicle.js';
import { candidates, PREREQ, CAP, has, bit, vecTier, NCAP, NPKG, PKG_ID, pkgUnlocked } from '../caps.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const section = s => console.log('\n' + s);

// shared world (regenerated deterministically)
const rawW = generateWorld(7, { N: 1200 });
const w = loadCivWorld(rawW);

section('world adapter (M0)');
ok(w.N === rawW.N, 'N preserved');
ok(w.nbrOff.length === w.N + 1 && w.nbrIdx.length === w.nbrOff[w.N], 'CSR adjacency well-formed');
ok(w.subViab.length === w.N * NPKG, 'subViability table sized N×NPKG');
ok(w.nLandmass >= 1, 'at least one landmass detected');
let anyLand = 0, anyK = 0;
for (let i = 0; i < w.N; i++) if (w.land[i]) { anyLand++; if (cellK(w, i, PKG_ID.forager, 650) > 0) anyK++; }
ok(anyLand > 0 && anyK > 0, 'land cells have positive forager K');
ok(w.areaNorm && Math.abs(w.areaNorm.reduce((a, b) => a + b, 0) / w.N - 1) < 0.001, 'areaNorm mean ≈ 1');

section('capability DAG (caps.js)');
ok(candidates(bit(CAP.fire)).includes(CAP.pottery), 'fire → pottery is a candidate');
ok(!candidates(bit(CAP.fire)).includes(CAP.metallurgy), 'metallurgy gated (needs pottery)');
ok((PREREQ[CAP.mechanisation] & bit(CAP.wheel)) !== 0, 'mechanisation requires wheel');
ok(vecTier(bit(CAP.fire)) === 0 && vecTier(bit(CAP.electricity)) === 5, 'tiers 0..5 correct');
ok(pkgUnlocked(bit(CAP.sail), PKG_ID.maritime) && !pkgUnlocked(bit(CAP.fire), PKG_ID.plough), 'package unlock gating');

section('config token round-trip (config.js)');
{
  const c = defaultConfig(); c.agent.b0 = 0.371; c.culture.mutationRate = 0.083; c.seeding.nucleusCount = 3; c.climate = { preset: 'kurgan' };
  const dec = decodeCivConfig(encodeCivConfig(c));
  ok(Math.abs(dec.agent.b0 - 0.371) < 1e-6, 'b0 survives fixed-point round-trip');
  ok(Math.abs(dec.culture.mutationRate - 0.083) < 1e-6, 'mutationRate survives');
  ok(dec.seeding.nucleusCount === 3, 'nucleusCount survives');
  ok(dec.climate.preset === 'kurgan', 'climate preset survives');
  ok(encodeCivConfig(dec) === encodeCivConfig(c), 'token is idempotent');
}

section('determinism gate (verify)');
{
  const h1 = chronicleHash(createSim(w, defaultConfig(), 7).run(600));
  const h2 = chronicleHash(createSim(w, defaultConfig(), 7).run(600));
  ok(h1 === h2, 'same config ⇒ identical chronicle hash (' + h1 + ')');
  const h3 = chronicleHash(createSim(w, defaultConfig(), 8).run(600));
  ok(h1 !== h3, 'different civSeed ⇒ different chronicle');
}

section('emergent arc + signals discrimination (M1–M9)');
{
  const ch = createSim(w, defaultConfig(), 1).run(1400);
  const sig = civSignals(ch);
  ok(ch.meta.finalPop > 1000, 'population grew (nucleation → expansion), pop=' + ch.meta.finalPop);
  ok(ch.meta.finalCultures > 1, 'cultures diversified, n=' + ch.meta.finalCultures);
  ok(ch.meta.finalLanguages >= ch.meta.finalCultures - 1, 'language phylogeny tracked');
  ok(ch.events.some(e => e.type === 'agriculture'), 'agriculture emerged as a phase transition');
  ok(sig.score > 30, 'a rich run scores well, ★' + sig.score);
  ok(!sig.flags.includes('instant-extinction'), 'healthy run not flagged extinct');

  // a degenerate run scores low and is flagged
  const bad = defaultConfig(); bad.seeding.founders = 4; bad.agent.b0 = 0.12;
  const sigBad = civSignals(createSim(w, bad, 1).run(800));
  ok(sigBad.score < 15, 'extinction-prone run scores low, ★' + sigBad.score);
  ok(sigBad.flags.length > 0, 'degenerate run is flagged: ' + sigBad.flags.join(','));

  // stuck-forager (innovation off) is flagged stuck-foraging
  const stuck = defaultConfig(); stuck.culture.innovationBase = 0; stuck.culture.mutationRate = 0;
  const sigStuck = civSignals(createSim(w, stuck, 1).run(1000));
  ok(sigStuck.flags.includes('stuck-foraging'), 'no-innovation run flagged stuck-foraging');
}

section('preset run (kurgan, climate coupling M5)');
{
  const kurgan = normalizeConfig({ agent: { dispersalGain: 2.4 }, culture: { seedTech: ['fire', 'herding'], normWeights: [0.5, 0.35, 0.5, 0.85, 0.72, 0.5, 0.5, 0.4] }, climate: { preset: 'kurgan' }, popScale: 620 });
  const ch = createSim(w, kurgan, 1).run(1000);
  ok(ch.meta.climate === 'kurgan', 'climate preset applied');
  ok(ch.meta.finalPop > 0, 'kurgan run survived');
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
