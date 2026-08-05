#!/usr/bin/env node
// Presence check for LEVEL_6's wiring into plant/index.html (lp-479467).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Same house style as
// index-level5-wiring.selftest.mjs, which this file's structure mirrors
// almost verbatim: index.html has no DOM/browser test, so this reads the
// file as TEXT (fs.readFileSync, no jsdom, no headless browser) and asserts
// by substring/regex that the module imports LEVEL_6 and its withShareA
// helper, feeds the split network straight into feasible() with NO
// autoSplit() call (LEVEL_6's shares are always explicit and already sum to
// 1, same as LEVEL_5 — see levels/level6.mjs's header), and renders the
// result via drawLevel() and verdictLine(). That proves the wiring exists
// SYNTACTICALLY: the right names are imported and called in the right
// places. It does NOT prove a browser renders it pixel-correct, that the
// slider actually fires the handler, or that the SVG paints — a real
// assertion would need a DOM.
//
// ONE DELIBERATE DIFFERENCE FROM THE LEVEL_5 TEST: level5.mjs and level6.mjs
// both export a function named `withShareA`, and index.html already imports
// LEVEL_5's under that bare name — importing a second `withShareA` under the
// same identifier from a different module is a SyntaxError (duplicate
// declaration), so the Level 6 import must alias it. This test checks for
// `withShareA as withShareA6` rather than a bare `withShareA` import, and
// checks calls against the alias.
//
// House style matches the other selftests in this directory: every check is
// named, failures are counted and printed, exit code carries the verdict.
//
// Run: node plant/test/index-level6-wiring.selftest.mjs

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

console.log('\nLEVEL_6 and its withShareA helper are imported from their own module, not redefined inline');
{
  // Aliased (not a bare `withShareA`) because level5.mjs's own withShareA is
  // already imported under that name earlier in the same module scope.
  ok('imports LEVEL_6 and withShareA (aliased) from ./levels/level6.mjs',
    /import\s*\{\s*LEVEL_6\s*,\s*withShareA\s+as\s+withShareA6\s*\}\s*from\s*['"]\.\/levels\/level6\.mjs['"]/.test(html));
}

console.log('\nthe split is fed straight to feasible() — no autoSplit(), since LEVEL_6\'s shares are always explicit');
{
  const lvl6Block = html.slice(html.indexOf('// ── Level 6'));
  ok('calls withShareA6(LEVEL_6, ...) to apply the player\'s lever',
    /withShareA6\(\s*LEVEL_6\s*,/.test(lvl6Block));
  // A wiring mistake for this level specifically would be routing it through
  // autoSplit() the way LEVEL_4 is — LEVEL_6's edges already carry explicit
  // shares that sum to 1, so autoSplit() has nothing to do here and its
  // presence anywhere near the LEVEL_6 block would signal the wrong call
  // order was copied from the Level 4 section instead of adapted from it.
  ok('does NOT call autoSplit anywhere in the Level 6 block — this level\'s shares are always explicit',
    !/autoSplit/.test(lvl6Block));
}

console.log('\nthe split network is graded by feasible() and rendered like every other level');
{
  const lvl6Block = html.slice(html.indexOf('// ── Level 6'));
  ok('calls feasible(...) on the shared level', /feasible\(\s*lvl\s*\)/.test(lvl6Block));
  ok('renders via drawLevel(...) into an svg element', /drawLevel\(\s*\$\('lvl6'\)/.test(lvl6Block));
  ok('reports the outcome via verdictLine(...)', /verdictLine\(\s*v\s*\)/.test(lvl6Block));
}

console.log('\na visitor has a lever: a share-A control wired to a handler that redraws the level');
{
  ok('a slider control with id="shareA6" exists in the markup', /id="shareA6"/.test(html));
  ok('the lvl6 svg mount point exists in the markup', /id="lvl6"/.test(html));
  ok('the lvl6 verdict mount point exists in the markup', /id="lvl6Verdict"/.test(html));
  ok('the shareA6 slider is wired to an input handler that redraws the level',
    /\$\('shareA6'\)\.addEventListener\('input',\s*drawLvl6\)/.test(html));
  ok('a reset control returns the slider to the shipped share', /id="lvl6Reset"/.test(html));
  ok('the reset control is wired to a click handler',
    /\$\('lvl6Reset'\)\.addEventListener\('click',/.test(html));
}

console.log('\nlevels 1-5\'s existing wiring is still intact — this ticket only adds a sixth block');
{
  ok('LEVEL_1 wiring still present', /import\s*\{[^}]*LEVEL_1[^}]*\}\s*from\s*['"]\.\/level-view\.js['"]/.test(html));
  ok('LEVEL_2 wiring still present', /from\s*['"]\.\/levels\/level2\.mjs['"]/.test(html));
  ok('LEVEL_3 wiring still present', /from\s*['"]\.\/levels\/level3\.mjs['"]/.test(html));
  ok('LEVEL_4 wiring still present', /from\s*['"]\.\/levels\/level4\.mjs['"]/.test(html));
  ok('LEVEL_4\'s autoSplit import is unaffected by the LEVEL_6 block',
    /import\s*\{\s*autoSplit\s*\}\s*from\s*['"]\.\/production\.mjs['"]/.test(html));
  ok('LEVEL_5 wiring (and its bare withShareA import) still present',
    /import\s*\{\s*LEVEL_5\s*,\s*withShareA\s*\}\s*from\s*['"]\.\/levels\/level5\.mjs['"]/.test(html));
}

console.log('');
if (failed) { console.log(`✗ index-level6-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level6-wiring selftest passed\n');
