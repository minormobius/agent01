#!/usr/bin/env node
/* FIPO pitch-genome engine selftest. Run before touching the engine.
   Gates deploy-fipo.yml. Usage: node fipo/pitch/engine.selftest.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FIPO = require('./engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', msg); }
}
// Bad-interpolation detector: broken template slots, not innocent substrings
// (a naive /NaN/i flags "Co**nan** the Barbarian").
const BAD = /undefined|\[object|\{[a-z_]+\}|\bNaN\b/i;

/* 1. Determinism — a seed is a permalink. */
{
  let deterministic = true;
  for (let s = 0; s < 50; s++) {
    const a = JSON.stringify(FIPO.generate(s));
    const b = JSON.stringify(FIPO.generate(s));
    if (a !== b) { deterministic = false; break; }
  }
  ok(deterministic, 'generate(seed) is not deterministic over 50 seeds');
}

/* 2. Completeness — every specimen has a full genome. */
{
  const REQUIRED = ['title', 'tagline', 'logline'];
  let complete = true, badText = false;
  for (let s = 0; s < 300; s++) {
    const g = FIPO.generate(s);
    for (const k of REQUIRED) {
      const v = k === 'title' ? g.title.text : g[k];
      if (typeof v !== 'string' || v.length < 3) { complete = false; console.error('    empty field', k, 'seed', s); }
      if (BAD.test(v)) { badText = true; console.error('    bad interpolation in', k, 'seed', s, '→', v); }
    }
    if (!g.commitment.length || g.commitment.some(c => !c.text)) { complete = false; console.error('    empty commitment, seed', s); }
    if (!g.novum.premise || !g.novum.short || !g.novum.noun) { complete = false; console.error('    novum incomplete, seed', s); }
    if (!g.production.era.id || !g.production.milieu.id || !g.causal.id) { complete = false; console.error('    production context incomplete, seed', s); }
    for (const f of g.failures) {
      if (!f.id || !f.label || !f.reason) { complete = false; console.error('    failure mode missing fields, seed', s); }
      if (BAD.test(f.reason)) { badText = true; console.error('    bad reason, seed', s, f.id, '→', f.reason); }
    }
    for (const ax of ['earnestness', 'competence', 'ambition', 'sincerity', 'budget']) {
      if (!(g.soul[ax] >= 0 && g.soul[ax] <= 1)) { complete = false; console.error('    axis out of range', ax, 'seed', s, g.soul[ax]); }
    }
    if (!g.region || !g.region.name) { complete = false; console.error('    no region, seed', s); }
    if (!g.comps.line || BAD.test(g.comps.line)) { badText = true; console.error('    bad comps line, seed', s); }
  }
  ok(complete, 'genome incomplete on some seed (see above)');
  ok(!badText, 'bad interpolation found in derived text (see above)');
}

/* 3. Coverage — 800 seeds should illuminate the phase space. */
{
  const eras = new Set(), causals = new Set(), patterns = new Set(), titles = new Set(),
    budgets = new Set(), commitments = new Set(), milieus = new Set(), regions = new Set(),
    failureIds = new Set();
  for (let s = 0; s < 800; s++) {
    const g = FIPO.generate(s);
    eras.add(g.production.era.id); causals.add(g.causal.id); patterns.add(g.title.pattern);
    titles.add(g.title.text); budgets.add(g.production.budget.id); milieus.add(g.production.milieu.id);
    regions.add(g.region.id);
    g.commitment.forEach(c => commitments.add(c.text));
    g.failures.forEach(f => failureIds.add(f.id));
  }
  ok(eras.size === FIPO.ERAS.length, `era coverage ${eras.size}/${FIPO.ERAS.length}`);
  ok(causals.size === Object.keys(FIPO.CAUSAL_ORDERS).length, `causal-order coverage ${causals.size}/${Object.keys(FIPO.CAUSAL_ORDERS).length}`);
  ok(patterns.size >= 12, `title-pattern coverage ${patterns.size} (<12)`);
  ok(titles.size >= 670, `title diversity ${titles.size}/800 (<670)`);
  ok(budgets.size === 4, `budget-tier coverage ${budgets.size}/4`);
  ok(milieus.size >= 10, `milieu coverage ${milieus.size} (<10)`);
  ok(commitments.size >= 28, `commitment diversity ${commitments.size} (<28)`);
  ok(regions.size >= 4, `region coverage ${regions.size} (<4)`);
  ok(failureIds.size >= 10, `failure-mode coverage ${failureIds.size} (<10)`);
}

/* 4. Coherence invariants. */
{
  let invariants = true;
  for (let s = 0; s < 500; s++) {
    const g = FIPO.generate(s);
    // scale-misjudgment flag ⇒ the gap is real
    const sm = g.failures.find(f => f.id === 'scale-misjudgment');
    if (sm && g.geometry.gap < 4) { invariants = false; console.error('    scale-misjudgment without gap, seed', s); }
    // vision-first ⇒ no earthly derivation
    if (g.causal.id === 'vision-first' && g.derivation && !g.derivation.visionary) { invariants = false; console.error('    vision-first with earthly target, seed', s); }
    // mockmorph novum ⇒ derivation exists
    if (g.novum.cat === 'mockmorph' && !g.derivation) { invariants = false; console.error('    mockmorph without derivation, seed', s); }
    // the commitment is never absent (blandness is the only unforgivable sin)
    if (!g.commitment.length) { invariants = false; console.error('    no commitment, seed', s); }
  }
  ok(invariants, 'coherence invariant violated (see above)');
}

/* 5. The interesting corner exists and is populated. */
{
  let corner = 0, cynical = 0;
  for (let s = 0; s < 800; s++) {
    const g = FIPO.generate(s);
    if (g.region.id === 'corner') corner++;
    if (g.region.id === 'cynical') cynical++;
  }
  ok(corner > 40, `interesting corner underpopulated: ${corner}/800`);
  ok(cynical > 20, `cynical basin underpopulated: ${cynical}/800`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
