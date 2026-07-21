#!/usr/bin/env node
/* FIPO poster projection-engine selftest. Run before touching project.js.
   Gates deploy-fipo.yml. Usage: node fipo/poster/project.selftest.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FIPO = require('../pitch/engine.js');
const FIPO_POSTER = require('./project.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', msg); }
}

const EVAL_RE = new RegExp('\\b(' + FIPO_POSTER.BANNED_EVALUATIVE.join('|') + ')\\b', 'i');
const TIER_RE = new RegExp('(' + FIPO_POSTER.BANNED_SECOND_TIER.join('|') + ')', 'i');
const BAD = /undefined|\[object|\{[a-z_]+\}|\bNaN\b/i;

/* 1. Determinism. */
{
  let det = true;
  for (let s = 0; s < 50; s++) {
    const g = FIPO.generate(s);
    if (JSON.stringify(FIPO_POSTER.project(g)) !== JSON.stringify(FIPO_POSTER.project(g))) { det = false; break; }
  }
  ok(det, 'project() not deterministic over 50 seeds');
}

/* 2. Charter: no evaluative words, no second-tier leaks, no text-in-image,
      flaws are configurations, typography complete. */
{
  let evaluative = false, tier = false, badText = false, flawCount = true, type = true, noTextGuard = true;
  for (let s = 0; s < 400; s++) {
    const p = FIPO_POSTER.project(FIPO.generate(s));
    if (EVAL_RE.test(p.prompt)) { evaluative = true; console.error('    evaluative word in prompt, seed', s, '→', p.prompt.match(EVAL_RE)[0]); }
    if (TIER_RE.test(p.prompt)) { tier = true; console.error('    second-tier leak in prompt, seed', s); }
    if (BAD.test(p.prompt)) { badText = true; console.error('    bad interpolation in prompt, seed', s); }
    if (!/No text/.test(p.prompt) || !/(not a photograph|not a glossy modern blockbuster finish)/.test(p.prompt)) { noTextGuard = false; console.error('    guardrail line missing, seed', s); }
    if (p.flaws.length < 1 || p.flaws.length > 2) flawCount = false;
    for (const f of p.flaws) if (EVAL_RE.test(f.text)) { evaluative = true; console.error('    evaluative flaw, seed', s, f.text); }
    const ty = p.typography;
    for (const k of ['title', 'tagline', 'starring', 'coStar', 'director', 'producer', 'studio', 'eraMark', 'rating']) {
      if (typeof ty[k] !== 'string' || !ty[k] || BAD.test(ty[k])) { type = false; console.error('    typography.' + k + ' broken, seed', s, '→', ty[k]); }
    }
    for (const pf of p.projectionFailures) {
      if (!pf.id || !pf.label || !pf.reason || BAD.test(pf.reason)) { badText = true; console.error('    projection failure malformed, seed', s); }
    }
    if (!p.brief.text || BAD.test(p.brief.text)) { badText = true; console.error('    brief broken, seed', s); }
  }
  ok(!evaluative, 'evaluative language found (charter §2)');
  ok(!tier, 'second-tier leak found (charter §3)');
  ok(!badText, 'bad interpolation found');
  ok(flawCount, 'flaw count outside 1–2');
  ok(type, 'typography pass incomplete');
  ok(noTextGuard, 'no-text guardrail missing from prompt');
}

/* 3. Every novum in the genome bank has a poster visual. */
{
  let missing = [];
  for (const n of FIPO.NOVAE) {
    if (n.creature) {
      if (!FIPO_POSTER.NOVUM_VISUALS['Giant {name}'] || !FIPO_POSTER.NOVUM_VISUALS['Frozen {name}']) missing.push(n.noun + ' (creature template)');
    } else if (n.noun === 'Blockbuster') {
      // intentionally null in the map — resolved from the derivation target
      // at project() time (the mockmorph pathway).
    } else if (!FIPO_POSTER.NOVUM_VISUALS[n.noun]) missing.push(n.noun);
  }
  ok(missing.length === 0, 'nova without visuals: ' + missing.join(', '));
}

/* 4. Coverage over 400 seeds. */
{
  const comps = new Set(), flaws = new Set(), fids = new Set(), props = new Set();
  for (let s = 0; s < 400; s++) {
    const p = FIPO_POSTER.project(FIPO.generate(s));
    comps.add(p.composition.id); fids.add(p.brief.fidelity); props.add(p.composition.prop);
    p.flaws.forEach(f => flaws.add(f.id));
  }
  ok(comps.size >= 7, `composition coverage ${comps.size}/8`);
  ok(flaws.size >= 14, `flaw coverage ${flaws.size} (<14)`);
  ok(fids.size === 4, `brief-fidelity coverage ${fids.size}/4 (got: ${[...fids].join(', ')})`);
  ok(props.size >= 8, `prop coverage ${props.size} (<8)`);
}

/* 5. The "bad projection of an okay movie" category fires with reasons. */
{
  let wrongGenre = 0, spoiler = 0, wrongMovie = 0;
  for (let s = 0; s < 400; s++) {
    const p = FIPO_POSTER.project(FIPO.generate(s));
    for (const pf of p.projectionFailures) {
      if (pf.id === 'wrong-genre') wrongGenre++;
      if (pf.id === 'marketing-spoiler') spoiler++;
      if (pf.id === 'wrong-movie') wrongMovie++;
    }
  }
  ok(wrongGenre > 10, `wrong-genre underpopulated: ${wrongGenre}/400`);
  ok(spoiler > 5, `marketing-spoiler underpopulated: ${spoiler}/400`);
  ok(wrongMovie > 5, `wrong-movie underpopulated: ${wrongMovie}/400`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
