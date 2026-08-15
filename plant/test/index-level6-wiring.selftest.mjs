#!/usr/bin/env node
// LEVEL_6 reaches the page through campaign.mjs (originally lp-479467;
// rewritten by lp-6c88fb when the six per-level sections were replaced by one
// campaign panel).
//
// WHY THIS FILE WAS REWRITTEN RATHER THAN LEFT ALONE — see the same note in
// index-level4-wiring.selftest.mjs. The previous form asserted, against
// index.html, an import of `LEVEL_6, withShareA as withShareA6`, a call to
// feasible(), and a render into `id="lvl6"`. All correct until the page
// stopped having six per-level sections.
//
// ONE OLD CONCERN IS NOW MOOT AND THAT IS WORTH SAYING OUT LOUD. The previous
// file's most interesting paragraph was about an ALIAS: level5.mjs and
// level6.mjs both export `withShareA`, and index.html imported both into one
// module scope, so the second had to be renamed or the page was a SyntaxError.
// campaign.mjs imports both itself, under its own aliases, and the page
// imports neither — so the hazard no longer exists in index.html at all. It is
// recorded here rather than deleted because the next person to wonder why this
// file lost a check deserves the answer.
//
// Run: node plant/test/index-level6-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEVEL_6 } from '../levels/level6.mjs';
import { entryOf, buildNetwork, grade, LEVELS, ORDER } from '../campaign.mjs';
import { feasible } from '../production.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const ID = 'level6';
const entry = entryOf(ID);

console.log('\nLEVEL_6 is carried by campaign.mjs — the entry IS the module literal, not a copy');
{
  ok('campaign.mjs declares an entry for this level', !!entry);
  ok('its base is LEVEL_6 itself, by identity', entry.base === LEVEL_6);
  ok('the level is in the play order', ORDER.includes(ID));
}

console.log('\nno split step — this level’s shares are always explicit');
{
  ok('the entry is NOT flagged autoSplit', !entry.autoSplit);
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

console.log('\nthe alias hazard has left the page — both helpers are now the controller’s problem');
{
  ok('index.html imports neither withShareA nor an alias of it',
    !/\bwithShareA/.test(html));
  ok('index.html no longer imports ./levels/level6.mjs', !/levels\/level6\.mjs/.test(html));
  ok('index.html no longer imports ./levels/level5.mjs either', !/levels\/level5\.mjs/.test(html));
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
  ok('index.html imports the campaign controller instead',
    /import\s*\{[^}]*\bCampaign\b[^}]*\}\s*from\s*['"]\.\/campaign\.mjs['"]/.test(html));
  ok('and renders every level through the one shared board',
    /\bdrawLevel\s*\(\s*\$\('gameBoard'\)/.test(html));
  ok('the page grades nothing itself', !/\bfeasible\s*\(/.test(html));
}

console.log('\nno level was lost in the move');
{
  ok('every declared level is in the play order',
    LEVELS.every((e) => ORDER.includes(e.id)) && ORDER.length === LEVELS.length);
}

console.log('');
if (failed) { console.log(`✗ index-level6-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level6-wiring selftest passed\n');
