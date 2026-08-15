#!/usr/bin/env node
// LEVEL_4 reaches the page through campaign.mjs (originally lp-194a16;
// rewritten by lp-6c88fb when the six per-level sections were replaced).
//
// WHY THIS FILE WAS REWRITTEN RATHER THAN LEFT ALONE. Its previous form
// asserted, against index.html, that the page imports LEVEL_4, wraps it in
// autoSplit(), grades it with feasible() and renders it into `id="lvl4"`.
// Every one of those was correct until the page stopped having six per-level
// sections. lp-6c88fb moved all six behind `campaign.mjs`, so the old
// assertions became guaranteed failures that say nothing about a regression —
// and a checker that fails correct work is worse than no checker.
//
// WHAT REPLACED THEM, AND WHY IT IS STRONGER. The old checks were regexes over
// a page, and a regex can only see call ORDER. This file imports the real
// modules and asserts the PROPERTY that call order existed to guarantee:
//
//   · the campaign entry's `base` IS the LEVEL_4 literal, by identity — not a
//     copy, not a re-declaration, checked with === rather than with a name;
//   · the oracle genuinely REFUSES the level until the split is filled, run
//     rather than asserted from the shape of a line of source;
//   · `buildNetwork` really does fill every fan-out share, and they sum to 1.
//
// It keeps two text checks, and only two, both about the DEPARTURE: the page
// must no longer import level4.mjs and must no longer resolve the split
// itself. A half-done move fails here rather than passing twice.
//
// Run: node plant/test/index-level4-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEVEL_4 } from '../levels/level4.mjs';
import { entryOf, buildNetwork, grade, LEVELS, ORDER } from '../campaign.mjs';
import { feasible } from '../production.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const ID = 'level4';
const entry = entryOf(ID);

console.log('\nLEVEL_4 is carried by campaign.mjs — the entry IS the module literal, not a copy');
{
  ok('campaign.mjs declares an entry for this level', !!entry);
  ok('its base is LEVEL_4 itself, by identity', entry.base === LEVEL_4);
  ok('the level is in the play order', ORDER.includes(ID));
}

console.log('\nthe fan-out is still resolved before grading — now once, by the controller');
{
  ok('the entry is flagged autoSplit', entry.autoSplit === true);

  // The old gate asserted `autoSplit(withSourceRate(LEVEL_4, ...))` by regex.
  // This runs the unsplit level instead: the refusal is the whole reason that
  // call order was mandatory, and it is a fact rather than a spelling.
  let threw = false;
  try { feasible(entry.knob.apply(entry.base, entry.knob.start)); } catch { threw = true; }
  ok('the oracle REFUSES this level until its shares are filled', threw);

  const net = buildNetwork(entry, entry.knob.start);
  const counts = new Map();
  for (const e of net.edges) counts.set(e.from, (counts.get(e.from) || 0) + 1);
  const fanned = net.edges.filter((e) => counts.get(e.from) > 1);
  ok('the built network really does fan out', fanned.length > 1, `${fanned.length} edges`);
  ok('every fan-out edge carries a numeric share',
    fanned.every((e) => typeof e.share === 'number'));
  const sum = fanned.reduce((a, e) => a + e.share, 0);
  ok('the shares of the group sum to 1', Math.abs(sum - 1) < 1e-9, String(sum));
  ok('and the filled network grades without throwing',
    typeof grade(entry, entry.knob.start).ok === 'boolean');
}

console.log('\na visitor still has a lever — the page builds it from this knob');
{
  ok('the knob declares more than one setting', entry.knob.samples.length > 1,
    `${entry.knob.samples.length}`);
  ok('the opening setting is a member of the declared domain',
    entry.knob.keys.has(entry.knob.key(entry.knob.start)));
}

console.log('\nthe page no longer does any of this itself — the move happened');
{
  ok('index.html no longer imports ./levels/level4.mjs',
    !/levels\/level4\.mjs/.test(html));
  ok('index.html no longer resolves a split itself', !/\bautoSplit\b/.test(html));
  ok('index.html imports the campaign controller instead',
    /import\s*\{[^}]*\bCampaign\b[^}]*\}\s*from\s*['"]\.\/campaign\.mjs['"]/.test(html));
  ok('and renders every level through the one shared board',
    /\bdrawLevel\s*\(\s*\$\('gameBoard'\)/.test(html));
}

console.log('\nno level was lost in the move');
{
  ok('every declared level is in the play order',
    LEVELS.every((e) => ORDER.includes(e.id)) && ORDER.length === LEVELS.length);
}

console.log('');
if (failed) { console.log(`✗ index-level4-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level4-wiring selftest passed\n');
