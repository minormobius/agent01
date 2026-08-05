#!/usr/bin/env node
// Presence check for LEVEL_4's wiring into plant/index.html (lp-194a16).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. index.html has no DOM/browser test
// today — none of LEVEL_1/2/3's wiring blocks do either — so this reads the
// file as TEXT (fs.readFileSync, no jsdom, no headless browser) and asserts
// by substring/regex that the module imports LEVEL_4, threads it through
// autoSplit() and feasible(), and renders the result via drawLevel() and
// verdictLine(). That proves the wiring exists SYNTACTICALLY: the right
// names are imported and called in the right places. It does NOT prove a
// browser renders it pixel-correct, that the slider actually fires the
// handler, or that the SVG paints — a real assertion would need a DOM.
// Recorded here rather than implied by a green run, per the ticket's own
// instruction to say plainly that this is a weaker gate than a rendered
// check would be.
//
// House style matches the other selftests in this directory: every check is
// named, failures are counted and printed, exit code carries the verdict.
//
// Run: node plant/test/index-level4-wiring.selftest.mjs

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

console.log('\nLEVEL_4 is imported from its own module, not redefined inline');
{
  ok('imports LEVEL_4 from ./levels/level4.mjs',
    /import\s*\{\s*LEVEL_4\s*\}\s*from\s*['"]\.\/levels\/level4\.mjs['"]/.test(html));
}

console.log('\nthe fan-out is resolved with autoSplit(), matching the oracle levels 1-3 also call');
{
  ok('imports autoSplit from ./production.mjs',
    /import\s*\{\s*autoSplit\s*\}\s*from\s*['"]\.\/production\.mjs['"]/.test(html));
  // autoSplit must wrap LEVEL_4 (directly or via withSourceRate(LEVEL_4, ...))
  // before it reaches feasible() — feeding LEVEL_4 to feasible() unsplit
  // throws, per production.mjs's own refusal and level4.selftest.mjs's first
  // assertion, so this is the one call order that can possibly work.
  ok('calls autoSplit(...LEVEL_4...) — the level is split before use',
    /autoSplit\(\s*withSourceRate\(\s*LEVEL_4\s*,/.test(html) || /autoSplit\(\s*LEVEL_4\s*\)/.test(html));
}

console.log('\nthe split network is graded by feasible() and rendered like every other level');
{
  ok('calls feasible(...) on the split LEVEL_4 network', /feasible\(\s*lvl\s*\)/.test(html));
  ok('renders via drawLevel(...) into an svg element', /drawLevel\(\s*\$\('lvl4'\)/.test(html));
  ok('reports the outcome via verdictLine(...)', /verdictLine\(\s*v\s*\)/.test(html));
}

console.log('\na visitor has a lever: a source-rate control wired to a handler that redraws the level');
{
  ok('a slider control with id="ore4" exists in the markup', /id="ore4"/.test(html));
  ok('the ore4 svg mount point exists in the markup', /id="lvl4"/.test(html));
  ok('the ore4 verdict mount point exists in the markup', /id="lvl4Verdict"/.test(html));
  ok('the ore4 slider is wired to an input handler that redraws the level',
    /\$\('ore4'\)\.addEventListener\('input',\s*drawLvl4\)/.test(html));
  ok('a reset control returns the slider to the shipped rate', /id="ore4Reset"/.test(html));
}

console.log('\nlevels 1-3\'s existing wiring is still intact — this ticket only adds a fourth block');
{
  ok('LEVEL_1 wiring still present', /import\s*\{[^}]*LEVEL_1[^}]*\}\s*from\s*['"]\.\/level-view\.js['"]/.test(html));
  ok('LEVEL_2 wiring still present', /from\s*['"]\.\/levels\/level2\.mjs['"]/.test(html));
  ok('LEVEL_3 wiring still present', /from\s*['"]\.\/levels\/level3\.mjs['"]/.test(html));
}

console.log('');
if (failed) { console.log(`✗ index-level4-wiring selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ index-level4-wiring selftest passed\n');
