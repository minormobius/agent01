#!/usr/bin/env node
// Presence check for LEVEL_5's wiring into plant/index.html (lp-d8ba07).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Same house style as
// index-level4-wiring.selftest.mjs, which this file's structure mirrors
// almost verbatim: index.html has no DOM/browser test, so this reads the
// file as TEXT (fs.readFileSync, no jsdom, no headless browser) and asserts
// by substring/regex that the module imports LEVEL_5 and withShareA, feeds
// the split network straight into feasible() with NO autoSplit() call (this
// level's shares are always explicit and already sum to 1 — see
// levels/level5.mjs's header and level5.selftest.mjs's no-throw-invariant
// case), and renders the result via drawLevel() and verdictLine(). That
// proves the wiring exists SYNTACTICALLY: the right names are imported and
// called in the right places. It does NOT prove a browser renders it
// pixel-correct, that the slider actually fires the handler, or that the
// SVG paints — a real assertion would need a DOM.
//
// House style matches the other selftests in this directory: every check is
// named, failures are counted and printed, exit code carries the verdict.
//
// Run: node plant/test/index-level5-wiring.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nLEVEL_5 and withShareA are imported from their own module, not redefined inline');
{
  ok('imports LEVEL_5 and withShareA from ./levels/level5.mjs',
    /import\s*\{\s*LEVEL_5\s*,\s*withShareA\s*\}\s*from\s*['"]\.\/levels\/level5\.mjs['"]/.test(html));
}

console.log('\nthe split is fed straight to feasible() — no autoSplit(), since LEVEL_5\'s shares are always explicit');
{
  ok('calls withShareA(LEVEL_5, ...) to apply the player\'s lever',
    /withShareA\(\s*LEVEL_5\s*,/.test(html));
  // A wiring mistake for this level specifically would be routing it through
  // autoSplit() the way LEVEL_4 is — LEVEL_5's edges already carry explicit
  // shares that sum to 1, so autoSplit() has nothing to do here and its
  // presence anywhere near the LEVEL_5 block would signal the wrong call
  // order was copied from the Level 4 section instead of adapted from it.
  const lvl5Block = html.slice(html.indexOf('// ── Level 5'));
  ok('does NOT call autoSplit anywhere in the Level 5 block — this level\'s shares are always explicit',
    !/autoSplit/.test(lvl5Block));
}

console.log('\nthe split network is graded by feasible() and rendered like every other level');
{
  const lvl5Block = html.slice(html.indexOf('// ── Level 5'));
  ok('calls feasible(...) on the shared level', /feasible\(\s*lvl\s*\)/.test(lvl5Block));
  ok('renders via drawLevel(...) into an svg element', /drawLevel\(\s*\$\('lvl5'\)/.test(lvl5Block));
  ok('reports the outcome via verdictLine(...)', /verdictLine\(\s*v\s*\)/.test(lvl5Block));
}

console.log('\na visitor has a lever: a share-A control wired to a handler that redraws the level');
{
  ok('a slider control with id="shareA5" exists in the markup', /id="shareA5"/.test(html));
  ok('the lvl5 svg mount point exists in the markup', /id="lvl5"/.test(html));
  ok('the lvl5 verdict mount point exists in the markup', /id="lvl5Verdict"/.test(html));
  ok('the shareA5 slider is wired to an input handler that redraws the level',
    /\$\('shareA5'\)\.addEventListener\('input',\s*drawLvl5\)/.test(html));
  ok('a reset control returns the slider to the shipped share', /id="lvl5Reset"/.test(html));
  ok('the reset control is wired to a click handler',
    /\$\('lvl5Reset'\)\.addEventListener\('click',/.test(html));
}

console.log('\nlevels 1-4\'s existing wiring is still intact — this ticket only adds a fifth block');
{
  ok('LEVEL_1 wiring still present', /import\s*\{[^}]*LEVEL_1[^}]*\}\s*from\s*['"]\.\/level-view\.js['"]/.test(html));
  ok('LEVEL_2 wiring still present', /from\s*['"]\.\/levels\/level2\.mjs['"]/.test(html));
  ok('LEVEL_3 wiring still present', /from\s*['"]\.\/levels\/level3\.mjs['"]/.test(html));
  ok('LEVEL_4 wiring still present', /from\s*['"]\.\/levels\/level4\.mjs['"]/.test(html));
  ok('LEVEL_4\'s autoSplit import is unaffected by the LEVEL_5 block',
    /import\s*\{\s*autoSplit\s*\}\s*from\s*['"]\.\/production\.mjs['"]/.test(html));
}

console.log('');
if (failed) { console.log(`✗ index-level5-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level5-wiring selftest passed\n');
