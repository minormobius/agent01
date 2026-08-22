#!/usr/bin/env node
// cross — drive the solver in a real browser.
//
//   npm i playwright            # NOT a repo dependency; install it ad hoc
//   node words/test/serve-local.mjs 8788 &
//   node words/cross/test/cross-ui-check.mjs http://127.0.0.1:8788
//
// NOT a deploy gate and NOT part of preflight — it needs a browser binary the
// repo does not carry, which is why it is `-check` and not `*.selftest.mjs`.
// Its job is the class of bug that only exists in a browser: the generator runs
// in a Web Worker with a module import graph, the clue fetch is a real request,
// and the phone keyboard is an off-screen input. None of that is reachable from
// node, and all of it is load-bearing.

import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';

/**
 * Playwright's own browser if it has one, otherwise the pre-installed Chromium
 * this sandbox carries. The path is versioned, so it is found rather than
 * hard-coded — a pinned one goes stale the first time the image is rebuilt.
 */
function chromiumPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  for (const dir of fs.readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = `${root}/${dir}/${exe}`;
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
let failures = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${what}${cond || !detail ? '' : `\n        ${detail}`}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

console.log(`\ncross ui-check against ${BASE}`);

// A 9x9 so the run is quick; the generator is the same at every size.
await page.goto(`${BASE}/cross/?p=v1.9.m.UITEST`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#puzzle:not([hidden]) .cell', { timeout: 60000 });

ok(errors.length === 0, 'no page errors while generating', errors.join('\n        '));

const cells = await page.locator('#grid .cell').count();
ok(cells === 81, '9x9 renders 81 cells', `got ${cells}`);
const blocks = await page.locator('#grid .cell.block').count();
ok(blocks > 0 && blocks < 30, `the grid has blocks (${blocks})`);

// THE BUG THE GAME NEXT DOOR SHIPPED: an element that is `hidden` but has a
// `display` rule is laid out anyway, and if it is a full-page overlay it eats
// every click while looking perfect in a screenshot.
const covered = await page.evaluate(() => {
  const first = document.querySelector('#grid .cell:not(.block)');
  const r = first.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !first.contains(top) && top !== first ? (top.id || top.className || top.tagName) : null;
});
ok(covered === null, 'nothing invisible is covering the grid', `covered by: ${covered}`);

// Clues actually arrived from the worker endpoint.
const clueCount = await page.locator('#acrossList li').count();
const noclue = await page.locator('.cluelist li.noclue').count();
ok(clueCount > 0, `across clues render (${clueCount})`);
ok(noclue === 0, 'every entry has a real clue', `${noclue} entries fell back to "(n letters)"`);

// Typing. Click the first white square, type a letter, and check it lands and
// the cursor advances — this is the whole off-screen-input mechanism.
await page.locator('#grid .cell:not(.block)').first().click();
await page.keyboard.type('ABC');
const typed = await page.evaluate(() => [...document.querySelectorAll('#grid .cell')]
  .map((c) => c.querySelector('.letter')?.textContent || '').join('').slice(0, 6));
ok(typed.startsWith('ABC'), 'typing fills consecutive squares', `grid starts "${typed}"`);

// Check marks wrong letters rather than silently doing nothing.
await page.click('#checkBtn');
const bad = await page.locator('#grid .cell.bad').count();
ok(bad > 0, 'Check marks wrong letters', `${bad} marked`);

// Reveal solves it, which is also the end-to-end proof that the fill is a real
// crossword: the done banner only appears if every crossing agrees.
await page.click('#revealBtn');
await page.waitForSelector('#done:not([hidden])', { timeout: 10000 });
ok(true, 'Reveal completes the puzzle and the solved banner appears');

// Determinism, from the browser's point of view: the same link reloaded gives
// the same answers.
const first = await page.evaluate(() => [...document.querySelectorAll('#grid .cell .letter')].map((n) => n.textContent).join(''));
await page.goto(`${BASE}/cross/?p=v1.9.m.UITEST`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#puzzle:not([hidden]) .cell', { timeout: 60000 });
await page.click('#revealBtn');
const second = await page.evaluate(() => [...document.querySelectorAll('#grid .cell .letter')].map((n) => n.textContent).join(''));
ok(first === second, 'the same permalink gives the same puzzle on reload');

// A malformed permalink must not leave the page in a spinner forever.
await page.goto(`${BASE}/cross/?p=nonsense`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#setup', { timeout: 10000 });
ok(await page.locator('#puzzle').isHidden(), 'a bad permalink falls back to the setup form');

await page.screenshot({ path: '/tmp/cross-ui.png', fullPage: false }).catch(() => {});
await browser.close();

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
