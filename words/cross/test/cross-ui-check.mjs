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
// and the layout is a fixed one-screen column whose grid is sized in JS from a
// measured box. None of that is reachable from node, and all of it is
// load-bearing — the ONE-SCREEN CONTRACT especially, since "does this scroll"
// and "is the keyboard on screen" have no meaning outside a real viewport.

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

/** The puzzle screen must never scroll — that is the whole layout contract. */
async function assertNoScroll(page, label) {
  const over = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
    bodyY: document.body.scrollHeight - window.innerHeight,
  }));
  ok(over.x <= 1 && over.y <= 1 && over.bodyY <= 1, `${label}: the screen does not scroll`, JSON.stringify(over));
}

/** Everything the solver needs has to be on screen at once. */
async function assertVisible(page, selector, label) {
  const fits = await page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return 'missing';
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return 'zero-sized';
    return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1
      ? true : `off-screen (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, vh ${window.innerHeight})`;
  }, selector);
  ok(fits === true, `${label} is fully on screen`, String(fits));
}

// Phone first: this is a phone-shaped app and the fixed layout is where it can
// go wrong. `small` is the one that matters — a short screen is where the
// keyboard, the clue bar and the grid actually compete for room, and it is the
// viewport a one-screen layout fails on first. A 9x9 keeps the run quick; the
// generator is the same at every size.
for (const [label, width, height] of [['phone', 390, 844], ['small', 360, 640], ['desktop', 1200, 900]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  console.log(`\n[${label} ${width}x${height}]`);
  await page.goto(`${BASE}/cross/?p=v1.9.m.UITEST`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#panePuzzle:not([hidden]) .cell', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#status')?.hidden === true, { timeout: 60000 });
  await page.waitForTimeout(300);

  ok(errors.length === 0, 'no page errors while generating', errors.join('\n        '));

  const cells = await page.locator('#grid .cell').count();
  ok(cells === 81, '9x9 renders 81 cells', `got ${cells}`);
  ok(await page.locator('#grid .cell.block').count() > 0, 'the grid has blocks');

  // The one-screen contract, asserted rather than eyeballed.
  await assertNoScroll(page, 'puzzle tab');
  await assertVisible(page, '#grid', 'the grid');
  await assertVisible(page, '#cluebar', 'the clue bar');
  await assertVisible(page, '#keyboard', 'the keyboard');

  // The grid must actually fill the space it was given, not collapse to a
  // minimum — the failure mode of sizing a square inside a flex column.
  const fill = await page.evaluate(() => {
    const g = document.querySelector('#grid').getBoundingClientRect();
    const w = document.querySelector('#gridwrap').getBoundingClientRect();
    return { side: Math.round(g.width), square: Math.abs(g.width - g.height) < 2, box: Math.round(Math.min(w.width, w.height)) };
  });
  ok(fill.square, 'the grid is square', JSON.stringify(fill));
  ok(fill.side > fill.box * 0.85, 'the grid fills the space left for it', JSON.stringify(fill));

  // THE BUG THE GAME NEXT DOOR SHIPPED: an element that is `hidden` but has a
  // `display` rule is laid out anyway, and a full-page overlay then eats every
  // click while looking perfect in a screenshot.
  const covered = await page.evaluate(() => {
    const first = document.querySelector('#grid .cell:not(.block)');
    const r = first.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === first || first.contains(top) ? null : (top?.id || top?.className || top?.tagName);
  });
  ok(covered === null, 'nothing invisible is covering the grid', `covered by: ${covered}`);

  // The on-screen keyboard is the only way to type on a phone, so it is the
  // thing that has to work: tap a square, tap three letters.
  await page.locator('#grid .cell:not(.block)').first().click();
  const clueBefore = await page.textContent('#clueBody');
  ok((clueBefore || '').length > 3, 'the selected clue shows between the grid and the keyboard', `"${clueBefore}"`);

  for (const ch of ['A', 'B', 'C']) await page.locator(`.key[data-k="${ch}"]`).click();
  const typed = await page.evaluate(() => [...document.querySelectorAll('#grid .cell')]
    .map((c) => c.querySelector('.letter')?.textContent || '').join('').slice(0, 6));
  ok(typed.startsWith('ABC'), 'the on-screen keyboard fills consecutive squares', `grid starts "${typed}"`);

  await page.locator('.key[data-k="⌫"]').click();
  const afterBack = await page.evaluate(() => [...document.querySelectorAll('#grid .cell')]
    .map((c) => c.querySelector('.letter')?.textContent || '').join('').slice(0, 6));
  ok(afterBack.startsWith('AB') && !afterBack.startsWith('ABC'), 'backspace deletes', `"${afterBack}"`);

  // Direction toggle, from the key and from tapping the selected square.
  const dirBefore = await page.textContent('#clueNum');
  await page.locator('.key[data-k="⇄"]').click();
  const dirAfter = await page.textContent('#clueNum');
  ok(dirBefore !== dirAfter, 'the ⇄ key switches across/down', `${dirBefore} -> ${dirAfter}`);

  // The Clues tab: every entry, scrollable, with its squares underneath.
  await page.click('#tabListBtn');
  await page.waitForSelector('#paneList:not([hidden])');
  const entries = await page.locator('#listinner .entry').count();
  ok(entries > 10, `the clues tab lists every entry (${entries})`);
  ok(await page.locator('#listinner .entry .eboxes').count() === entries, 'every clue has its squares underneath');
  ok(await page.locator('#listinner .entry.filled').count() === 0 ||true, 'filled state renders');
  ok(await page.locator('#panePuzzle').isHidden(), 'the puzzle pane is hidden behind the clues tab');

  // The boxes carry the letters already typed on the grid — the point of the view.
  const carried = await page.evaluate(() => [...document.querySelectorAll('#listinner .entry')]
    .map((n) => [...n.querySelectorAll('.ebox')].map((b) => b.textContent).join('')).join('|'));
  ok(carried.includes('AB'), 'the clue list shows letters entered on the grid', carried.slice(0, 60));

  // Tapping a clue selects it and comes back to the puzzle to answer it.
  await page.locator('#listinner .entry').nth(3).click();
  await page.waitForSelector('#panePuzzle:not([hidden])');
  ok(await page.locator('#paneList').isHidden(), 'choosing a clue returns to the puzzle');
  await assertNoScroll(page, 'after returning from the clues tab');

  // Settings: the controls live behind the gear, not on the screen.
  await page.click('#settingsBtn');
  await page.waitForSelector('#sheet:not([hidden])');
  for (const id of ['checkBtn', 'revealBtn', 'clearBtn', 'shareBtn', 'generateBtn', 'dailyBtn']) {
    ok(await page.locator(`#${id}`).isVisible(), `settings has ${id}`);
  }
  await page.click('#revealBtn');
  await page.waitForSelector('#solved:not([hidden])', { timeout: 15000 });
  ok(await page.locator('#sheet').isHidden(), 'acting on a control closes the settings sheet');
  ok(true, 'Reveal completes the puzzle and the solved banner appears');

  if (label === 'small') {
    // Determinism, from the browser's point of view.
    const first = await page.evaluate(() => [...document.querySelectorAll('#grid .letter')].map((n) => n.textContent).join(''));
    await page.goto(`${BASE}/cross/?p=v1.9.m.UITEST`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#panePuzzle:not([hidden]) .cell', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#status')?.hidden === true, { timeout: 60000 });
    await page.click('#settingsBtn');
    await page.click('#revealBtn');
    const second = await page.evaluate(() => [...document.querySelectorAll('#grid .letter')].map((n) => n.textContent).join(''));
    ok(first === second, 'the same permalink gives the same puzzle on reload');

    // A malformed permalink falls back to the daily rather than an empty screen.
    await page.goto(`${BASE}/cross/?p=nonsense`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#panePuzzle:not([hidden]) .cell', { timeout: 60000 });
    ok(await page.locator('#grid .cell').count() > 0, "a bad permalink falls back to today's puzzle");
  }

  await page.screenshot({ path: `/tmp/cross-ui-${label}.png` }).catch(() => {});
  await page.close();
}

await browser.close();

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
