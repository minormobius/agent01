#!/usr/bin/env node
// LEVEL_5 reaches the page through campaign.mjs (originally lp-2c1f0e-era
// level-5 wiring; rewritten by lp-6c88fb when the six per-level sections were
// replaced by one campaign panel).
//
// WHY THIS FILE WAS REWRITTEN RATHER THAN LEFT ALONE — see the same note in
// index-level4-wiring.selftest.mjs. Its previous form asserted, against
// index.html, that the page imports LEVEL_5 and its `withShareA`, calls
// feasible() and renders into `id="lvl5"`. All of that was correct until the
// page stopped having six per-level sections; asserting it now would fail
// correct work.
//
// THE CLAIM THAT MATTERED IS PRESERVED AND MADE EXECUTABLE. The old gate's
// distinctive check was NEGATIVE: this level must never be routed through
// autoSplit(), because its edges already carry explicit shares that sum to 1,
// and reaching for autoSplit here would mean the LEVEL_4 block had been copied
// instead of adapted. That is now asserted where it lives — on the campaign
// entry (`autoSplit` flag absent) and on the level itself (the oracle accepts
// it with no split step, which the old regex could only imply).
//
// Run: node plant/test/index-level5-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEVEL_5 } from '../levels/level5.mjs';
import { entryOf, buildNetwork, grade, LEVELS, ORDER } from '../campaign.mjs';
import { feasible } from '../production.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const ID = 'level5';
const entry = entryOf(ID);

console.log('\nLEVEL_5 is carried by campaign.mjs — the entry IS the module literal, not a copy');
{
  ok('campaign.mjs declares an entry for this level', !!entry);
  ok('its base is LEVEL_5 itself, by identity', entry.base === LEVEL_5);
  ok('the level is in the play order', ORDER.includes(ID));
}

console.log('\nno split step — this level’s shares are always explicit');
{
  ok('the entry is NOT flagged autoSplit', !entry.autoSplit);

  // The old gate asserted "autoSplit does not appear near the Level 5 block".
  // This asserts the reason that mattered: the level is valid oracle input on
  // its own, which is exactly what makes a split step unnecessary rather than
  // merely absent.
  let threw = false;
  try { feasible(entry.knob.apply(entry.base, entry.knob.start)); } catch { threw = true; }
  ok('the oracle ACCEPTS this level with no split step', !threw);

  const net = buildNetwork(entry, entry.knob.start);
  const counts = new Map();
  for (const e of net.edges) counts.set(e.from, (counts.get(e.from) || 0) + 1);
  const fanned = net.edges.filter((e) => counts.get(e.from) > 1);
  ok('the level really does fan out', fanned.length > 1, `${fanned.length} edges`);
  ok('every fan-out edge already carries an explicit numeric share',
    fanned.every((e) => typeof e.share === 'number'));
  const sum = fanned.reduce((a, e) => a + e.share, 0);
  ok('the shares of the group sum to 1', Math.abs(sum - 1) < 1e-9, String(sum));
  ok('the level is winnable as shipped', grade(entry, entry.knob.start).ok === true);
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
  ok('index.html no longer imports ./levels/level5.mjs', !/levels\/level5\.mjs/.test(html));
  ok('index.html no longer applies a share itself', !/\bwithShareA/.test(html));
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
if (failed) { console.log(`✗ index-level5-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level5-wiring selftest passed\n');
