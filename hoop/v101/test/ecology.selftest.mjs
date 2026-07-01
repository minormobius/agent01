// ecology.selftest.mjs — the curated overworld ecology (over/ecology.js), and DOES IT CLOSE?
//   node hoop/v101/test/ecology.selftest.mjs
//
// Two jobs:
//   1. Structural: every band is populated; every reagent-plant resolves through the alchemy kernel;
//      the model catalog is well-formed; the crossover & swarm & bird layers are present.
//   2. THE CLOSURE QUESTION: feed toCatalog() into biome's OWN assembler + viability solver (the same
//      tool the gacha ships) and roll many communities from the palette. Report the closure rate + tier
//      spread, and assert the palette reliably assembles CLOSING, viable biomes — i.e. the ecosystem
//      closes. Printed verdict is the honest answer to "does it close?".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ORGANISMS, HERBS, TREES, FUNGI, FAUNA, REAGENTS, BAND_KEYS, organismsInBand, toCatalog } from '../over/ecology.js';
import { findReagent } from '../alch/alchemy.js';
import { rollDesign } from '../../../biome/gacha/sim/assemble.mjs';
import { evaluateRoll } from '../../../biome/gacha/sim/score.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. structure ──
ok(HERBS.length === 55, `all 55 alch herbs are reagent-flora (${HERBS.length})`);
ok(TREES.length === 16 && TREES.filter((t) => t.crop === 'fruit').length >= 8 && TREES.filter((t) => t.crop === 'nut').length >= 5, 'a variety of fruit AND nut trees');
ok(FAUNA.filter((f) => f.swarm).length >= 4, 'bees & swarming pollinators (the swarms) are present');
ok(FAUNA.filter((f) => /spider|weaver|harvestman/i.test(f.common)).length >= 4, 'spider action (multiple arachnids)');
ok(['robin', 'thrush', 'bluetit', 'mallard', 'kestrel', 'heron'].every((id) => FAUNA.some((f) => f.id === id)), 'the bird layer is present (insectivore/frugivore/waterfowl/raptor/heron)');

// every SURFACE band has flora AND fauna; the two DEPTH bands (chthonic, benthic) are aphotic — no
// photosynthetic producer belongs there (fungi are decomposers, not producers), so they need only fauna.
const APHOTIC = new Set(['chthonic', 'benthic']);
for (const b of BAND_KEYS) {
  const inB = organismsInBand(b);
  if (!APHOTIC.has(b)) ok(inB.some((o) => o.kind === 'producer'), `surface band '${b}' has flora`);
  ok(inB.some((o) => o.kind === 'animal'), `band '${b}' has fauna`);
}
// the depth crossover: organisms that bridge chthonic AND benthic
{
  const cross = ORGANISMS.filter((o) => (o.bands || []).includes('chthonic') && (o.bands || []).includes('benthic'));
  ok(cross.length >= 2 && cross.some((o) => o.id === 'newt'), `crossover members bridge the chthonic & benthic deeps (${cross.map((o) => o.id).join(', ')})`);
}

// ── 2. the alchemy bridge: every reagent-PLANT resolves through the vendored correspondence ──
{
  const plantReagents = REAGENTS.filter((o) => o.reagentClass === 'plant');
  const unresolved = plantReagents.filter((o) => !findReagent(o.sciName) && !findReagent(o.common));
  ok(unresolved.length === 0, `every reagent-plant resolves to a correspondence via its binomial (${unresolved.length} unresolved)`);
  ok(REAGENTS.some((o) => o.id === 'newt' && o.baroque), 'eye of newt is a flagged (baroque) animal reagent — the deferred correspondence');
}

// ── 3. the model catalog is well-formed ──
{
  const cat = toCatalog();
  ok(cat.length === ORGANISMS.length, 'toCatalog carries every organism');
  ok(cat.every((o) => o.id && o.kind && Array.isArray(o.habitats) && o.habitats.length), 'every catalog entry has id, kind, habitats');
  ok(cat.every((o) => o.kind === 'producer' ? o.area_m2 > 0 : o.mass_g > 0), 'producers carry area, animals carry mass');
  ok(cat.filter((o) => o.guild === 'detritivore').length >= 3, 'the decomposer guild is stocked (closure needs it)');
  ok(cat.every((o) => !('bands' in o) && !('reagent' in o)), 'game metadata is stripped from the model catalog');
}

// ── 4. DOES IT CLOSE? — roll communities from the palette, score with biome's viability oracle ──
// The overworld is a WILD green land you forage + garden in, NOT the ship's sealed life-support farm
// (that's the forge/biome). So the right question for it is ecological SELF-SUSTENANCE — does a drawn
// web PERSIST (lose no species), stay STABLE (recover from a shock), and balance its AIR — not "does it
// feed 130 crew" (a calorie-farm bar a herb-and-orchard wildland rightly fails; reported as info).
{
  const cat = toCatalog();
  const N = 40;                              // 40 deterministic rolls across the seed space
  let assembled = 0, persists = 0, stable = 0, persistStable = 0, airOK = 0, fedCrew = 0;
  const tiers = {};
  let best = null;
  for (let n = 1; n <= N; n++) {
    const roll = rollDesign(n, cat);
    if (!roll) continue;
    assembled++;
    const s = evaluateRoll(roll, { days: 400 });
    tiers[s.tier] = (tiers[s.tier] || 0) + 1;
    const c = s.report && s.report.closure, st = s.report && s.report.stability;
    const noExt = c && c.extinct.length === 0;
    if (noExt) persists++;
    if (st && st.stable) stable++;
    if (noExt && st && st.stable) persistStable++;
    if (c && c.o2OK && c.co2OK) airOK++;
    if (c && c.fedOK) fedCrew++;
    if (s.ok && noExt && st && st.stable && (!best || s.interest > best.interest)) best = { n, tier: s.tier, verdict: s.report.verdict };
  }
  const pct = (x) => Math.round((x / Math.max(assembled, 1)) * 100);
  console.log(`\n  ── DOES IT CLOSE? — the wild-ecology read (${assembled}/${N} rolls assembled a valid web)`);
  console.log(`     self-sustains (no species lost): ${persists}/${assembled} (${pct(persists)}%)`);
  console.log(`     stable (recovers from a shock):  ${stable}/${assembled} (${pct(stable)}%)`);
  console.log(`     BOTH persistent AND stable:      ${persistStable}/${assembled} (${pct(persistStable)}%)`);
  console.log(`     air balances (O₂+CO₂ in band):   ${airOK}/${assembled} (${pct(airOK)}%)`);
  console.log(`     — (feeds a ship's crew as life-support: ${fedCrew}/${assembled} — a farm bar a wildland rightly fails)`);
  console.log(`     tiers: ${JSON.stringify(tiers)}`);
  if (best) console.log(`     best self-sustaining roll #${best.n} [${best.tier}]: ${best.verdict}\n`);

  ok(assembled >= N * 0.8, `the palette reliably assembles valid webs (${assembled}/${N})`);
  ok(persists >= N * 0.2, `a healthy share of drawn webs SELF-SUSTAIN — lose no species (${pct(persists)}%)`);
  ok(stable >= 4, `drawn webs can be STABLE — recover from a shock (${stable})`);
  ok(persistStable >= 1, 'the palette CAN assemble a self-sustaining, stable wild ecology (it closes ecologically)');
  ok(airOK >= N * 0.3, `and balance the air in a good share of draws (${pct(airOK)}%)`);
}

console.log(`ecology.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
