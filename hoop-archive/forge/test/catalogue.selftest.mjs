// catalogue.selftest.mjs — the needs-derived product catalogue (element-tagged).
//   node hoop/forge/test/catalogue.selftest.mjs
//
// Pins: (1) the catalogue is COMPLETE by the needs method — every loop has products, every tracked element
// appears somewhere; (2) compositions are well-formed and normalise to 1; (3) the living-materials subset +
// the carbon thread are present; (4) the family bridge to graph.js works; (5) the per-element index (the
// Sankey substrate) returns sane results; (6) determinism.

import {
  ELEMENTS, ELEMENT, LOOPS, PRODUCTS, PRODUCT, composition, productsWithElement,
  byLoop, livingProducts, familyMix, validate, buildCatalogue,
} from '../catalogue.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// 1) completeness — the whole point of the needs method
ok(validate().length === 0, 'catalogue validates' + (validate().length ? ': ' + validate().join('; ') : ''));
ok(LOOPS.length === 15, `15 need-loops (${LOOPS.length})`);
ok(PRODUCTS.length >= 40, `the catalogue is rich — ${PRODUCTS.length} product classes (was 5)`);
ok(LOOPS.every((l) => byLoop(l.id).length >= 1), 'every loop is covered by ≥1 product (no unmet need)');
ok(ELEMENTS.every((e) => productsWithElement(e.sym).length >= 1), 'every tracked element appears in ≥1 product');

// 2) compositions well-formed + normalised
for (const p of PRODUCTS) {
  const c = composition(p.id), sum = Object.values(c).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - 1) < 1e-9, `${p.id}: composition normalises to 1 (${sum.toFixed(4)})`);
  ok(Object.keys(c).length >= 1, `${p.id}: has a composition`);
}

// 3) the living-materials subset + the carbon thread
const living = livingProducts();
ok(living.length >= 12, `the living-materials sub-catalogue is substantial (${living.length} classes)`);
ok(living.some((p) => p.id === 'carbon_fiber') && living.some((p) => p.id === 'crop') && living.some((p) => p.id === 'digest_culture'), 'living set includes fiber, food, and the microbial recyclers');
// carbon fiber is the carbon thread: overwhelmingly C, flagged as an anchor (the pump)
ok(composition('carbon_fiber').C > 0.9 && PRODUCT['carbon_fiber'].anchor, 'woven carbon fiber is ~all carbon + flagged as an anchor (the carbon pump)');
ok(composition('cf_cable').C > 0.85, 'carbon-fiber cable carries the carbon into structure');
// the bio elements C,N,Ca are now tracked distinctly (they weren't in the 7-family model)
for (const s of ['C', 'N', 'Ca', 'P']) ok(ELEMENT[s] && ELEMENT[s].bio, `${s} is a tracked bio element`);

// 4) the user's theory is represented: logistics droids + carbon fiber as anchors
ok(PRODUCT['droid'] && PRODUCT['droid'].loop === 'labor' && PRODUCT['droid'].anchor, 'logistics droids are in the catalogue, flagged as an anchor');
const anchors = PRODUCTS.filter((p) => p.anchor).map((p) => p.id);
ok(anchors.includes('carbon_fiber') && anchors.includes('droid') && anchors.includes('seed_archive'), `the anchor products are the theory's pillars (${anchors.join(', ')})`);

// 5) family bridge (to graph.js's 7 commodities) — every product rolls up to families summing to 1
for (const p of PRODUCTS) { const fm = familyMix(p.id), sum = Object.values(fm).reduce((a, b) => a + b, 0); ok(Math.abs(sum - 1) < 1e-9, `${p.id}: familyMix sums to 1`); }
ok(familyMix('hull_plate').metal > 0.5, 'hull plate rolls up mostly to the metal family');
ok(familyMix('crop').carbon + familyMix('crop').water > 0.8, 'a crop rolls up to carbon + water families');

// 6) per-element index (the Sankey substrate) — carbon is widespread; copper concentrates in compute/energy
const carbonProducts = productsWithElement('C');
ok(carbonProducts.length > 25 && carbonProducts[0].frac >= composition(carbonProducts[carbonProducts.length - 1].id).C, 'carbon flows through most products, sorted by fraction');
ok(productsWithElement('Cu').some((x) => PRODUCT[x.id].loop === 'energy' || PRODUCT[x.id].loop === 'compute'), 'copper concentrates in the energy/compute loops');

// 7) determinism + the packaged catalogue
ok(JSON.stringify(buildCatalogue()) === JSON.stringify(buildCatalogue()), 'buildCatalogue is deterministic');
const cat = buildCatalogue();
ok(cat.products.length === PRODUCTS.length && cat.products[0].composition && cat.products[0].familyMix && cat.issues.length === 0, 'buildCatalogue packages composition + familyMix + clean validate');

console.log(`\ncatalogue.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
