// chem.selftest.mjs — the molecular layer: real named reactions, ATOM-balanced, considered endpoints.
//   node hoop/forge/test/chem.selftest.mjs

import { MOLECULES, REACTIONS, REACTION, CYCLES, COVERED, validate, reactionImbalance, chemCycle, rxnString } from '../chem.js';
import { PRODUCT } from '../catalogue.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// 1) the whole layer validates
ok(validate().length === 0, 'chem validates' + (validate().length ? ': ' + validate().join('; ') : ''));

// 2) EVERY named reaction is atom-balanced (real chemistry conserves) — the molecular rigor
for (const r of REACTIONS) ok(reactionImbalance(r) < 1e-9, `${r.name} (${r.id}) is atom-balanced: ${rxnString(r)}`);
// spot-check a couple of landmark reactions
ok(reactionImbalance(REACTION.photosynthesis) < 1e-9 && rxnString(REACTION.photosynthesis).includes('→'), 'photosynthesis balances 6CO₂+6H₂O → C₆H₁₂O₆+6O₂');
ok(reactionImbalance(REACTION.hall_heroult) < 1e-9, 'Hall–Héroult balances 2Al₂O₃+3C → 4Al+3CO₂');
ok(reactionImbalance(REACTION.haber) < 1e-9, 'Haber–Bosch balances N₂+3H₂ → 2NH₃');

// 3) molecules carry element atom-counts (ties to the element ledger)
for (const [id, m] of Object.entries(MOLECULES)) ok(m.formula && Object.keys(m.el).length >= 1, `${id} has a formula + element counts`);

// 4) the covered elements have molecular cycles ending at CONSIDERED endpoints (real catalogue products)
ok(COVERED.length >= 6 && COVERED.includes('C') && COVERED.includes('Fe'), `${COVERED.length} elements have molecular cycles (${COVERED.join(',')})`);
for (const sym of COVERED) {
  const c = CYCLES[sym];
  const eps = c.nodes.flatMap((n) => n.endpoints || []);
  ok(eps.length >= 1 && eps.every((e) => PRODUCT[e]), `${sym}: cycle reaches considered endpoint products (${eps.join(',')})`);
  ok(c.nodes.some((n) => n.ref), `${sym}: cycle has at least one named reaction`);
}

// 5) chemCycle builds a render-ready, scaled, looping cycle with molecular detail
const fe = chemCycle('Fe', 100);
ok(fe.nodes.some((n) => n.formula === 'Fe₂O₃') && fe.nodes.some((n) => n.process === 'Direct reduction'), 'Fe cycle carries molecular formulas + named processes');
ok(fe.nodes.some((n) => n.reaction && n.reaction.includes('→')), 'Fe cycle exposes the balanced reaction string');
ok(fe.links.every((l) => isFinite(l.value) && l.value >= 0) && fe.links.some((l) => l.value > 50), 'Fe cycle links scale to the flow (100)');
const pool = fe.nodes[0].id, out = fe.links.filter((l) => l.from === pool).reduce((a, l) => a + l.value, 0), back = fe.links.filter((l) => l.to === pool).reduce((a, l) => a + l.value, 0);
ok(out > 0 && back > 0, 'the molecular Fe cycle loops back to its pool');
// carbon's molecular cycle has the biome + forge + pump structure
const cC = chemCycle('C', 400);
ok(cC.nodes.some((n) => n.process === 'Photosynthesis') && cC.nodes.some((n) => n.kind === 'pump'), 'carbon molecular cycle spans photosynthesis (biome) + the pump (forge)');

// 6) determinism
ok(JSON.stringify(chemCycle('Al', 50)) === JSON.stringify(chemCycle('Al', 50)), 'chemCycle is deterministic');

console.log(`\nchem.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
