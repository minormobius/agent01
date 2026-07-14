// planets.selftest.mjs — THE SEVEN, the unified design-language keystone (faction→body model).
//
//   node hoop/v104/test/planets.selftest.mjs
//
// Pins the load-bearing structure (strawman colours are free; the SHAPE is not): three factions carry the
// triad (DERIVED from each faction's verbs, landing the right domain with no skew); seven planets carry the
// flavor; planetOf funnels every vocabulary; the combat advantage is a balanced 7-way RPS; and identityOf
// composes the 3×7 = 21 species.

import { FACTIONS, FACTION_ORDER, PLANETS, PLANET_ORDER, READING_ORDER, bodyOf, bodyLean, factionOfBody, planetOf, advantage, matchups, identityOf, allIdentities } from '../planets.js';
import { VOCATIONS, TRIAD_ORDER, TRIAD } from '../stats.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ── 1. FACTION → BODY: a clean three-way split, DERIVED from each faction's verbs ──
ok(FACTION_ORDER.length === 3 && FACTION_ORDER.every((f) => FACTIONS[f]), 'three factions');
ok(bodyOf('continuant') === 'flesh', 'Continuant is the FLESH body (grow·heal·govern·serve)');
ok(bodyOf('rindwalker') === 'chassis', 'Rindwalker is the CHASSIS body (make·mend·worship·store)');
ok(bodyOf('drift') === 'anima', 'Drift is the ANIMA body (learn·play·move·trade)');
ok(new Set(FACTION_ORDER.map(bodyOf)).size === 3, 'the three bodies are distinct (no skew — each triad domain is owned once)');
ok(['flesh', 'chassis', 'anima'].every((d) => factionOfBody(d)), 'every triad domain maps back to a faction');
for (const f of FACTION_ORDER) {
  const L = bodyLean(f), s = TRIAD_ORDER.reduce((a, d) => a + L[d], 0);
  ok(approx(s, 1), `${f} body lean is a normalised share`);
  ok(TRIAD_ORDER.slice().sort((a, b) => L[b] - L[a])[0] === bodyOf(f), `${f} lean is dominant in its own body`);
}
// derivation check: Continuant lean == normalised average of its four verbs
const cv = { flesh: 0, chassis: 0, anima: 0 };
for (const v of ['govern', 'grow', 'serve', 'heal']) for (const d of TRIAD_ORDER) cv[d] += VOCATIONS[v].lean[d] / 4;
const ct = TRIAD_ORDER.reduce((a, d) => a + cv[d], 0);
ok(TRIAD_ORDER.every((d) => approx(FACTIONS.continuant.lean[d], cv[d] / ct)), 'Continuant lean == derived average of govern·grow·serve·heal (not invented)');
ok(TRIAD.flesh && TRIAD.chassis && TRIAD.anima, 'the triad domains are the stats.js TRIAD (shared substrate)');

// ── 2. PLANET → FLAVOR: seven, ordered, metal-bridged ──
ok(Object.keys(PLANETS).length === 7 && new Set(PLANET_ORDER).size === 7 && new Set(READING_ORDER).size === 7, 'seven planets, two 7-orderings');
ok(PLANETS.mars.metal === 'iron' && PLANETS.venus.metal === 'copper' && PLANETS.sol.metal === 'gold', 'classical planet→metal bridge');
ok(!('lean' in PLANETS.mars), 'a planet carries NO triad lean now — the body does (that is the whole fix)');

// ── 3. planetOf funnels every vocabulary onto a key ──
ok(planetOf('Mars') === 'mars' && planetOf('Sun') === 'sol' && planetOf('Moon') === 'luna', 'name + classical Sun/Moon');
ok(planetOf('iron') === 'mars' && planetOf('copper') === 'venus' && planetOf('lead') === 'saturn', 'metal → planet');
ok(planetOf('☿') === 'mercury' && planetOf('♀') === 'venus', 'glyph → planet');
ok(planetOf('grow') === 'venus' && planetOf('govern') === 'jupiter', 'a governed verb → planet (fallback)');
ok(planetOf('nope') === null && planetOf(null) === null, 'unknown / null → null');

// ── 4. combat: a BALANCED 7-way rock-paper-scissors ──
let net = 0; const wins = {};
for (const a of PLANET_ORDER) { wins[a] = 0; for (const b of PLANET_ORDER) { const r = advantage(a, b); net += r; if (r > 0) wins[a]++; } }
ok(net === 0, 'the 7×7 advantage matrix sums to zero (balanced)');
ok(PLANET_ORDER.every((k) => wins[k] === 3), 'every planet beats EXACTLY three others (a fair heptagram)');
ok(advantage('mars', 'mars') === 0, 'a mirror match is a tie');
ok(advantage('gold', 'iron') === advantage('sol', 'mars'), 'advantage funnels its args through planetOf');
const m = matchups('mars');
ok(m.beats.length === 3 && m.yields.length === 3, 'matchups() splits the other six into 3 beaten / 3 yielded');

// ── 5. the 3×7 IDENTITY ──
const id = identityOf('rindwalker', 'mars');
ok(id.name === 'The Iron Wright', 'identityOf composes the archetype name (metal adj + faction role)');
ok(id.body === 'chassis' && id.metal === 'iron' && id.glyph === '♂', 'identity carries its body (faction) + flavor (planet)');
ok(identityOf('continuant', 'venus').name === 'The Verdant Tender', 'a second identity reads right');
ok(identityOf('drift', 'gold').faction === 'drift' && identityOf('drift', 'gold').planet === 'sol', 'identityOf funnels the planet arg (gold→sol)');
ok(identityOf('bogus', 'mars') === null && identityOf('drift', 'nope') === null, 'a bad axis → null');
const all = allIdentities();
ok(all.length === 21 && new Set(all.map((x) => x.name)).size === 21, 'allIdentities() = the 21 distinct species (3 bodies × 7 flavors)');

console.log(`\nplanets.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
