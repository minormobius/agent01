// bindings.selftest.mjs — pins the item↔place affinity matrix (mega/sprite/item/bindings.js).
// Run: node mega/sprite/item/test/bindings.selftest.mjs
import { CIVIC_ROLES, CIVIC_DOMAINS, BINDINGS, DOMAIN_KINGDOM, hoardForPlace, bindingsFor } from '../bindings.js';
import { KINGDOM_ORDER } from '../taxa.js';
import { rollItem, rollMany } from '../genome.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const RELS = ['makes', 'wants', 'holds', 'wears'];

// ── the matrix is well-formed ──
{
  ok(CIVIC_ROLES.length === 13, 'thirteen civic roles');
  ok(Object.keys(BINDINGS).every((r) => CIVIC_ROLES.includes(r)), 'every binding keys a real civic role');
  ok(CIVIC_ROLES.every((r) => BINDINGS[r]), 'every civic role has a binding');
  // every referenced kingdom is real (ignoring the `any` flag)
  let okKingdoms = true;
  for (const r of CIVIC_ROLES) for (const rel of RELS) { const s = BINDINGS[r][rel]; if (!s) continue; for (const k in s) if (k !== 'any' && !KINGDOM_ORDER.includes(k)) okKingdoms = false; }
  ok(okKingdoms, 'every binding references real item-kingdoms');
  ok(Object.keys(DOMAIN_KINGDOM).every((d) => CIVIC_DOMAINS.includes(d)), 'domain→kingdom keys are real econ domains');
  ok(Object.values(DOMAIN_KINGDOM).every((s) => Object.keys(s).every((k) => KINGDOM_ORDER.includes(k))), 'domain→kingdom values are real kingdoms');
}

// ── hoardForPlace yields a hoard rollItem accepts, with a sane kingdomMix ──
{
  ok(CIVIC_ROLES.every((role) => { const w = Object.values(hoardForPlace({ role }).kingdomMix); return w.length > 0 && w.every((x) => x > 0); }), 'every role hoard has a non-empty mix with positive weights');
  ok(CIVIC_ROLES.every((role) => { const it = rollItem(7, hoardForPlace({ role })); return it && it.worth >= 0 && it.worth <= 100; }), 'every role hoard rolls valid, scorable items');
  // focused places stay focused (a farm makes mostly sustain), markets stock broadly (any)
  ok(Object.keys(hoardForPlace({ role: 'grow' }).kingdomMix).length <= 3, 'a farm hoard is focused (few kingdoms)');
  ok(Object.keys(hoardForPlace({ role: 'trade' }).kingdomMix).length === KINGDOM_ORDER.length, 'a market hoard stocks every kingdom (any)');
}

// ── the matrix actually biases what a place produces ──
{
  const seeds = [...Array(1200).keys()];
  const count = (items, k) => items.filter((i) => i.kingdom === k).length;
  // a make×metal workshop should out-produce strike/craft vs a worship temple
  const forge = rollMany(seeds, hoardForPlace({ role: 'make', domain: 'metal' }));
  const temple = rollMany(seeds, hoardForPlace({ role: 'worship' }));
  ok(count(forge, 'strike') + count(forge, 'craft') > count(temple, 'strike') + count(temple, 'craft'), 'a metal workshop out-produces strike/craft vs a temple');
  ok(count(temple, 'adorn') + count(temple, 'channel') > count(forge, 'adorn') + count(forge, 'channel'), 'a temple out-produces adorn/channel vs a workshop');
  // a library makes lore; a make×paper shop also leans lore
  const library = rollMany(seeds, hoardForPlace({ role: 'learn' }));
  ok(count(library, 'lore') > count(forge, 'lore'), 'a library out-produces lore vs a metal workshop');
  // domain steers the same role
  const weaver = rollMany(seeds, hoardForPlace({ role: 'make', domain: 'fiber' }));
  ok(count(weaver, 'ward') > count(forge, 'ward'), 'make×fiber leans ward (garments) where make×metal does not');
}

// ── place tech flows through to the items ──
{
  const seeds = [...Array(600).keys()];
  const avg = (a) => a.reduce((s, x) => s + x.stats.tech, 0) / a.length;
  const primitive = rollMany(seeds, hoardForPlace({ role: 'make', domain: 'metal', techMean: 0.15 }));
  const shipgrade = rollMany(seeds, hoardForPlace({ role: 'make', domain: 'metal', techMean: 0.95 }));
  ok(avg(shipgrade) > avg(primitive) + 25, 'a place techMean carries into its items');
}

// ── reverse lookup ──
{
  const sustain = bindingsFor('sustain');
  ok(sustain.makes.includes('grow') && sustain.makes.includes('heal'), 'sustain is made by grow & heal');
  ok(sustain.wants.includes('dwell') || sustain.holds.includes('dwell'), 'dwellings want/hold sustain');
  const lore = bindingsFor('lore');
  ok(lore.makes.includes('learn'), 'lore is made by learn');
  // trade/store stock everything (any) → they appear in every kingdom's holds
  ok(bindingsFor('strike').holds.includes('trade') && bindingsFor('channel').holds.includes('store'), 'markets & warehouses hold every kingdom');
}

console.log(`bindings.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
