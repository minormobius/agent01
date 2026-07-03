// climate-forcing.selftest.mjs — guards the causal climate forcing (buildClimate).
//
// Contracts:
//  · deterministic from (world, seed)
//  · the window opens in an ICE AGE and DEGLACIATES (the causal kickoff for polis)
//  · SEA LEVEL tracks deglaciation and LAGS temperature (ice-sheet inertia) — a
//    volcanic winter cools sharply but the ice, hence the sea, barely moves
//  · volcanic winters are sourced from the WORLD'S OWN volcanoes
//  · a super-eruption occurs in a meaningful fraction of worlds and can strike the
//    civilized era (the "cast back into the dark")
//
// Run: node mappa/test/climate-forcing.selftest.mjs

import { generateWorld } from '../engine.js';
import { buildClimate } from '../climate-forcing.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const w = generateWorld(12345, { N: 6000 });
const C = buildClimate(w, { seed: 12345 });
const g = C.forcingAt(C.y0), holo = C.forcingAt(-1000), now = C.forcingAt(1900);

console.log('deglaciation backbone (seed 12345):');
ok(g.tempOffset < -4 && g.ice > 0.9, `opens in an ice age (T=${g.tempOffset.toFixed(1)}°C, ice=${g.ice.toFixed(2)})`);
ok(Math.abs(g.seaLevelOffset - (-0.032)) < 1e-3, 'glacial sea-level lowstand');
ok(now.tempOffset > g.tempOffset + 4, `deglaciates (Δ=${(now.tempOffset - g.tempOffset).toFixed(1)}°C by 1900 CE)`);
ok(now.ice < g.ice - 0.4, `ice sheets retreat (${g.ice.toFixed(2)} → ${now.ice.toFixed(2)})`);
ok(now.seaLevelOffset > g.seaLevelOffset + 0.02, `sea level rises with deglaciation (${g.seaLevelOffset.toFixed(3)} → ${now.seaLevelOffset.toFixed(3)})`);
const regimes = new Set(C.series.map((s) => s.regime));
ok(regimes.has('glacial') && regimes.has('deglaciation') && regimes.has('interglacial'), `regimes traversed: ${[...regimes].join(', ')}`);

console.log('determinism:');
const C2 = buildClimate(w, { seed: 12345 });
ok(JSON.stringify(C.series) === JSON.stringify(C2.series), 'same (world, seed) → identical series');

console.log('volcanic winters (causal, sourced from the world):');
ok(C.drivers.sources.length > 0 && C.drivers.sources.every((s) => w.volc[s.cell] > 0.3), 'eruption sources are the world\'s real volcanoes');
// find a strong volcanic-cooling sample and confirm the ice (hence sea) barely moved
let vw = null; for (let i = 4; i < C.series.length; i++) if (C.series[i].volc < -1.2) { vw = i; break; }
if (vw != null) {
  const s = C.series[vw], before = C.series[vw - 4];
  ok(s.tempOffset < before.tempOffset - 0.8, `a volcanic winter cools sharply (${before.tempOffset.toFixed(1)} → ${s.tempOffset.toFixed(1)}°C)`);
  ok(Math.abs(s.ice - before.ice) < 0.05 && Math.abs(s.seaLevelOffset - before.seaLevelOffset) < 0.003, 'but the ice (and sea level) barely notices — millennial inertia');
} else {
  // seed 12345 may lack a strong pulse; use seed 7 which has a super-eruption
  const C7 = buildClimate(generateWorld(7, { N: 6000 }), { seed: 7 });
  let j = -1; for (let i = 4; i < C7.series.length; i++) if (C7.series[i].volc < -1.2) { j = i; break; }
  const s = C7.series[j], before = C7.series[j - 4];
  ok(s.tempOffset < before.tempOffset - 0.8, 'a volcanic winter cools sharply (seed 7)');
  ok(Math.abs(s.ice - before.ice) < 0.05, 'but the ice barely notices — millennial inertia (seed 7)');
}

console.log('super-eruptions across worlds ("cast back into the dark"):');
let supers = 0, civilStrike = 0, n = 40;
for (let s = 1; s <= n; s++) {
  const cw = generateWorld(s * 101 + 3, { N: 3500 });
  const cc = buildClimate(cw, { seed: s * 101 + 3 });
  if (cc.drivers.superErupt) { supers++; if (cc.drivers.superErupt.year > -2000) civilStrike++; }
}
ok(supers / n > 0.2 && supers / n < 0.55, `super-eruptions in a meaningful minority of worlds (${supers}/${n})`);
ok(civilStrike > 0, `at least one strikes the civilized era (year > −2000 BCE): ${civilStrike}`);

console.log('tilt paces deglaciation:');
// a fixed geology with a higher forced tilt should deglaciate no colder than a low one
const lo = buildClimate({ ...w, meta: { ...w.meta, axialTilt: 0.15 } }, { seed: 12345 }).forcingAt(0).tempOffset;
const hi = buildClimate({ ...w, meta: { ...w.meta, axialTilt: 0.55 } }, { seed: 12345 }).forcingAt(0).tempOffset;
ok(hi >= lo, `higher axial tilt → warmer interglacial (${lo.toFixed(1)} → ${hi.toFixed(1)}°C at 0 CE)`);

console.log(fail === 0 ? `\n✓ all green — ${pass} passed, 0 failed` : `\n✗ ${fail} FAILED (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
