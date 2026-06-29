// elementfork.selftest.mjs — the FORKING element flow: an element branches through multiple pathways to
// the many catalogue products that use it (the forking catalogue). node hoop/forge/test/elementfork.selftest.mjs

import { elementFork, unifiedLedger } from '../ledger.js';
import { forkedFlow, FORKS } from '../chem.js';
import { ELEMENTS } from '../catalogue.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const u = unifiedLedger({ people: 1000, growFactor: 3, biomeDays: 120 });

// every element forks to MULTIPLE products and loops back, balanced
for (const e of ELEMENTS) {
  const f = elementFork(e.sym, { u });
  const uses = f.nodes.filter((n) => n.kind === 'use');
  const out = f.links.filter((l) => l.from === 'pool').reduce((a, l) => a + l.value, 0);
  const back = f.links.filter((l) => l.to === 'pool').reduce((a, l) => a + l.value, 0);
  ok(uses.length >= 1, `${e.sym}: forks to product endpoints (${uses.length})`);
  ok(out > 0 && back > 0 && Math.abs(out - back) < Math.max(1, out * 0.001), `${e.sym}: loops back, balanced (out ${out.toFixed(1)} ≈ in ${back.toFixed(1)})`);
  ok(f.links.every((l) => isFinite(l.value) && l.value >= 0), `${e.sym}: link values finite`);
}

// SILICON is the showcase: multiple refining pathways (wafer · glass · ceramic) — the user's point
const si = elementFork('Si', { u });
const siForms = si.nodes.filter((n) => n.kind === 'material').map((n) => n.label);
ok(siForms.length >= 2, `silicon forks into multiple material forms: ${siForms.join(', ')}`);
ok(siForms.some((l) => /glass/i.test(l)) && siForms.some((l) => /wafer|silicon/i.test(l)), 'silicon forks into BOTH glass and wafer (optics/hardware AND chips)');
ok(si.nodes.filter((n) => n.kind === 'use').length >= 5, `silicon fans out to many products (${si.nodes.filter((n) => n.kind === 'use').length})`);
// the glass and wafer pathways reach DIFFERENT products
const formProds = (formId) => si.links.filter((l) => l.from === formId).map((l) => l.to);
const waferForm = si.nodes.find((n) => /wafer|silicon/i.test(n.label) && n.kind === 'material');
const glassForm = si.nodes.find((n) => /glass/i.test(n.label) && n.kind === 'material');
ok(waferForm && glassForm && formProds(waferForm.id).join() !== formProds(glassForm.id).join(), 'the wafer and glass pathways reach different products');

// CARBON forks into food / fiber / resin (life, structure, plastic)
const c = elementFork('C', { u });
const cForms = c.nodes.filter((n) => n.kind === 'material').map((n) => n.label.toLowerCase());
ok(cForms.some((l) => l.includes('food') || l.includes('biomass')) && cForms.some((l) => l.includes('fiber')), 'carbon forks into food AND carbon fiber');

// IRON: one refining pathway (steel) but MANY products (forking catalogue even with one process)
const fe = elementFork('Fe', { u });
ok(fe.nodes.filter((n) => n.kind === 'material').length === 1 && fe.nodes.filter((n) => n.kind === 'use').length >= 3, 'iron: one pathway, many product endpoints');

// the forks are catalogue-driven: forkedFlow with no demand has no product flow (it reads real demand)
ok(forkedFlow('Si', {}).flow === 0, 'forkedFlow is demand-driven (no demand → no flow)');
ok(Object.keys(FORKS).length >= 6, `${Object.keys(FORKS).length} elements have curated multi-pathway forks`);

// determinism
ok(JSON.stringify(elementFork('Si', { u })) === JSON.stringify(elementFork('Si', { u })), 'elementFork is deterministic');

console.log(`\nelementfork.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
