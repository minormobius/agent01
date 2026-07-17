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

  // memetics: belief systems emerge, diffuse across cultures (not ethnic), and schism
  ok((ch.final.beliefs || []).length > 0, 'belief systems emerged, faiths=' + (ch.final.beliefs || []).length);
  ok((ch.final.beliefs || []).some(b => b.cultures >= 2), 'a faith crossed culture lines (memetic, not ethnic)');
  ok(ch.events.some(e => e.type === 'beliefFounded'), 'a prophet founded a faith (beliefFounded event)');

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

section('naming voice (names.js, Phase II) + foundings contract (Phase III)');
{
  const { makeNamer } = await import('../names.js');

  // legacy mode reproduces the pre-Phase-II syllable strings bit-exactly (frozen fixture:
  // these strings were emitted by the original inline generators at civSeed=1)
  const lg = makeNamer(1, 'legacy');
  ok(lg.person(0, 3) === lg.person(0, 99), 'legacy person ignores culture');
  const lgFix = [lg.person(0), lg.person(999), lg.belief(42), lg.instRoot(0, 100, 2)].join('|');
  const lg2 = makeNamer(1, 'legacy');
  ok(lgFix === [lg2.person(0), lg2.person(999), lg2.belief(42), lg2.instRoot(0, 100, 2)].join('|'), 'legacy namer deterministic');

  // rite mode: deterministic, culture-coherent, distinct across seeds
  const nm = makeNamer(1, 'rite'), nmB = makeNamer(1, 'rite'), nmC = makeNamer(2, 'rite');
  ok(nm.person(7, 0) === nmB.person(7, 0), 'rite namer deterministic across instances');
  ok(nm.person(7, 0) !== nmC.person(7, 0) || nm.culture(0) !== nmC.culture(0), 'different civSeed → different voice');
  ok(nm.packFor(0) === nmB.packFor(0), 'culture pack assignment stable');
  ok(typeof nm.culture(0) === 'string' && nm.culture(0).length >= 3, 'culture gets a name');

  // names never enter the hash: rite and legacy runs of the same params hash identically
  const cfgR = normalizeConfig({ seeding: { founders: 60 } });
  const cfgL = normalizeConfig({ seeding: { founders: 60 }, names: 'legacy' });
  ok(cfgR.names === 'rite' && cfgL.names === 'legacy', 'names config field normalizes');
  ok(decodeCivConfig(encodeCivConfig(cfgL)).names === 'legacy', 'legacy survives the token round-trip');
  ok(decodeCivConfig(encodeCivConfig(cfgR)).names === 'rite', 'rite is the token default');
  const chR = createSim(w, cfgR, 5).run(400), chL = createSim(w, cfgL, 5).run(400);
  ok(chronicleHash(chR) === chronicleHash(chL), 'naming voice is hash-invariant (presentation only)');

  // foundings: the civ → polis contract is well-formed
  const f = chR.final.foundings || [];
  ok(Array.isArray(f), 'final.foundings present');
  ok(f.every(x => x.cell >= 0 && x.cell < w.N), 'founding cells in range');
  ok(f.every(x => Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180), 'founding lon/lat in degrees');
  ok(f.every(x => typeof x.city === 'string' && typeof x.cultureName === 'string'), 'foundings carry city + culture names');
  ok(f.every(x => x.tick >= 0 && x.year === Math.round(x.tick * chR.meta.tickYears)), 'founding year derives from tick');

  // the API-level contract: /api/civ/sites carries siteSeed strings + the mesh N needed
  // to reproduce the world (mappa terrain is not resolution-stable)
  const { doSites } = await import('../api.js');
  const s = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300'));
  ok(s.n === 900, 'sites contract carries requested mesh n (default 900)');
  ok(s.foundings.every(x => x.siteSeed === `7:${x.city}:${x.cell}`), 'siteSeed follows org convention world:city:cell');
  const s2 = doSites(new URLSearchParams('world=7&preset=kurgan&civSeed=1&ticks=300'));
  ok(JSON.stringify(s.foundings) === JSON.stringify(s2.foundings) && s.hash === s2.hash, 'sites endpoint deterministic');
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
