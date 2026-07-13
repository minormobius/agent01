// planets.selftest.mjs — THE SEVEN, the unified design language keystone.
//
//   node hoop/v104/test/planets.selftest.mjs
//
// Pins the load-bearing structure (the strawman colours/leans are free to tune, the SHAPE is not): seven
// planets; the faction→planet clusters PARTITION the Seven; every lean is derived from stats.js verbs and is a
// valid share; planetOf funnels every vocabulary (name · Sun/Moon · metal · glyph · verb) onto a key; and the
// combat advantage is a balanced 7-way rock-paper-scissors.

import { PLANETS, PLANET_ORDER, FACTION_PLANETS, planetOf, leanOf, dominantDomain, factionOfPlanet, planetsOfFaction, blendLean, advantage } from '../planets.js';
import { VOCATIONS, TRIAD_ORDER } from '../stats.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ── 1. the Seven, ordered ──
ok(Object.keys(PLANETS).length === 7, 'exactly seven planets');
ok(PLANET_ORDER.length === 7 && new Set(PLANET_ORDER).size === 7, 'PLANET_ORDER is the seven, no dupes');
ok(PLANET_ORDER.every((k) => PLANETS[k]), 'every ordered key is a real planet');
ok(PLANETS.mars.metal === 'iron' && PLANETS.venus.metal === 'copper' && PLANETS.sol.metal === 'gold', 'classical planet→metal bridge intact');

// ── 2. faction→planet clusters PARTITION the Seven (this is what lets a faction unlock its planets) ──
const clustered = [].concat(...Object.values(FACTION_PLANETS));
ok(clustered.length === 7 && new Set(clustered).size === 7, 'the faction clusters cover all seven, disjoint');
ok(['continuant', 'rindwalker', 'drift'].every((f) => FACTION_PLANETS[f] && FACTION_PLANETS[f].length), 'each nave faction owns ≥1 planet');
ok(factionOfPlanet('venus') === 'continuant' && factionOfPlanet('mars') === 'rindwalker' && factionOfPlanet('mercury') === 'drift', 'signature planets sit in the expected faction');
ok(planetsOfFaction('rindwalker').length === 3, 'rindwalker owns the 3 forge/deep planets (Mars·Saturn·Sol)');

// ── 3. every lean is DERIVED from stats.js verbs, and is a valid triad share ──
for (const k of Object.keys(PLANETS)) {
  const L = PLANETS[k].lean, s = TRIAD_ORDER.reduce((a, d) => a + L[d], 0);
  ok(approx(s, 1), `${k} lean is a normalised share (sums to 1)`);
  ok(TRIAD_ORDER.every((d) => L[d] >= 0 && L[d] <= 1), `${k} lean components in [0,1]`);
}
// derivation check: Venus = avg(grow, heal) leans, re-normalised
const gh = { flesh: 0, chassis: 0, anima: 0 };
for (const v of ['grow', 'heal']) for (const d of TRIAD_ORDER) gh[d] += VOCATIONS[v].lean[d] / 2;
const gt = TRIAD_ORDER.reduce((a, d) => a + gh[d], 0);
ok(TRIAD_ORDER.every((d) => approx(PLANETS.venus.lean[d], gh[d] / gt)), 'Venus lean == normalised average of grow+heal (derived, not invented)');
// the dominant domains land where the metals say they should
ok(dominantDomain('venus') === 'flesh', 'Venus (copper, green) is FLESH-dominant');
ok(dominantDomain('mars') === 'chassis', 'Mars (iron, forge) is CHASSIS-dominant');
ok(dominantDomain('mercury') === 'anima', 'Mercury (quicksilver, flux) is ANIMA-dominant');

// ── 4. planetOf funnels every vocabulary onto a key ──
ok(planetOf('mars') === 'mars' && planetOf('Mars') === 'mars', 'name (any case) → key');
ok(planetOf('Sun') === 'sol' && planetOf('Moon') === 'luna', 'classical Sun/Moon → sol/luna');
ok(planetOf('iron') === 'mars' && planetOf('copper') === 'venus' && planetOf('lead') === 'saturn', 'metal → planet');
ok(planetOf('☿') === 'mercury' && planetOf('♀') === 'venus' && planetOf('♄') === 'saturn', 'glyph → planet');
ok(planetOf('grow') === 'venus' && planetOf('govern') === 'jupiter', 'a governed verb → planet (fallback)');
ok(planetOf('banana') === null && planetOf(null) === null, 'unknown / null → null');

// ── 5. blendLean averages a 2-planet species ──
const blend = blendLean(['mars', 'venus']);
ok(approx(TRIAD_ORDER.reduce((a, d) => a + blend[d], 0), 1), 'a 2-planet blend is still a normalised share');
ok(blend.flesh > leanOf('mars').flesh && blend.flesh < leanOf('venus').flesh, 'blending Mars+Venus lands FLESH between the two');

// ── 6. combat: a BALANCED 7-way rock-paper-scissors ──
let wins = 0, losses = 0, ties = 0, net = 0;
const perPlanetWins = {};
for (const a of PLANET_ORDER) { perPlanetWins[a] = 0;
  for (const b of PLANET_ORDER) { const r = advantage(a, b); net += r; if (a === b) { ties++; continue; } if (r > 0) { wins++; perPlanetWins[a]++; } else if (r < 0) losses++; }
}
ok(ties === 7 && advantage('mars', 'mars') === 0, 'a mirror match is a tie');
ok(wins === losses, 'the ledger is symmetric (every win is someone\'s loss)');
ok(net === 0, 'the whole 7×7 advantage matrix sums to zero (balanced)');
ok(PLANET_ORDER.every((k) => perPlanetWins[k] === 3), 'every planet beats EXACTLY three others (a fair heptagram)');
ok(advantage('gold', 'iron') === advantage('sol', 'mars'), 'advantage funnels its args through planetOf (metals work)');

console.log(`\nplanets.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
