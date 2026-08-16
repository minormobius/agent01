// table/page.check.mjs — load every page of this surface in a real browser and
// assert the things a node selftest structurally cannot see.
//
//   node table/page.check.mjs
//
// WHY THIS EXISTS. The selftests prove the models are right; they cannot prove
// the page renders. Three defects here were invisible to node and obvious to a
// browser: a CSS transform silently REPLACING an SVG transform attribute, so
// acting tokens teleported to the corner; `[hidden]` losing to `display: flex`,
// so transport controls stayed on screen; and the party overview card laying
// out 497px tall and starting at y=678 on a phone — which is to say, entirely
// invisible on the screen it was built to sit on. That last one is the reason
// the layout assertions below measure pixels instead of trusting the CSS.
//
// NOT IN THE DEPLOY GATE, deliberately. It needs a browser, and the deploy
// workflow runs plain node selftests with no install step; wiring a browser
// into the gate is a change to the deploy path, which is not something to do
// as a side effect of a UI commit. Run it by hand when you touch a page, and
// see the notes at the foot of table/CLAUDE.md for the one-line setup.
//
// If playwright-core is not installed it SKIPS with exit 0 rather than failing,
// so it is safe to run anywhere.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PHONE = { width: 390, height: 844 };  // iPhone 14/15, the narrow case

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.log('page.check: SKIPPED — playwright-core is not installed.');
  console.log('  npm i playwright-core   (Chromium is already at /opt/pw-browsers)');
  process.exit(0);
}

// Chromium ships in this container at a versioned path; take whichever is here.
const { readdirSync, existsSync } = await import('node:fs');
const browsersDir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const executablePath = existsSync(browsersDir)
  ? readdirSync(browsersDir)
      .filter((d) => d.startsWith('chromium-'))
      .map((d) => join(browsersDir, d, 'chrome-linux', 'chrome'))
      .find((p) => existsSync(p))
  : undefined;
if (!executablePath) {
  console.log(`page.check: SKIPPED — no Chromium found under ${browsersDir}.`);
  process.exit(0);
}

// ------------------------------------------------------------ a static server
// The surface is static assets behind a thin worker, so serving the directory
// is a faithful enough stand-in for everything this file asserts.
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.md': 'text/plain', '.py': 'text/plain', '.txt': 'text/plain',
};
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗', m); } };

const browser = await chromium.launch({ executablePath });

/** A page plus everything it complained about. Favicon 404s are the harness's,
 *  not the site's — this surface serves no favicon and never has. */
async function open(url, viewport) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  const noise = [];
  page.on('pageerror', (e) => noise.push(`uncaught: ${e}`));
  page.on('console', (m) => {
    // "Failed to load resource: …" carries no URL, so it cannot be filtered and
    // it duplicates the response listener below, which can. Drop it there.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      noise.push(`console: ${m.text()}`);
    }
  });
  page.on('response', (r) => {
    if (!r.ok() && !r.url().endsWith('/favicon.ico')) noise.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(url);
  return { page, noise };
}

// ------------------------------------------- 1. the Cairn party overview card
for (const size of [1, 4]) {
  const { page, noise } = await open(`${base}/cairn/#s=oak-fen-317&n=${size}`, PHONE);
  await page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  const who = `party of ${size}`;

  ok(!noise.length, `${who}: the page is clean — ${noise.join(' | ')}`);
  const score = (await page.textContent('.ov-head .n')).trim();
  ok(/^\d+$/.test(score) && Number(score) <= 100, `${who}: the score renders (${score})`);
  ok((await page.locator('.ov-legend > div').count()) === 4, `${who}: four axes in the legend`);
  ok((await page.locator('.ov-role').count()) === 5, `${who}: five role chips`);

  const pts = await page.getAttribute('.radar polygon.shape', 'points');
  ok(pts && !/NaN|undefined/.test(pts), `${who}: the radar geometry is finite (${pts})`);
  const labels = (await page.locator('.radar text').allTextContents()).join(',');
  ok(labels === 'durability,damage,grit,sweep', `${who}: axis labels in order (${labels})`);
  ok((await page.locator('.radar text.off').count()) === 1,
    `${who}: sweep alone is greyed — a fresh party owns no bomb, and the card should say so`);

  // THE LAYOUT ASSERTION THIS FILE WAS WRITTEN FOR. The card has to be wholly
  // visible without scrolling, on a phone, or it is not doing its job.
  const box = await page.locator('#overview').boundingBox();
  ok(box.y + box.height <= PHONE.height,
    `${who}: the whole card fits above the fold on ${PHONE.width}x${PHONE.height} ` +
    `(ends at ${Math.round(box.y + box.height)}px)`);
  ok(box.x >= 0 && box.x + box.width <= PHONE.width,
    `${who}: and does not overhang sideways (${Math.round(box.x)}..${Math.round(box.x + box.width)})`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    `${who}: the page does not scroll horizontally`);

  // The card is live, not a snapshot of the roll: conditioning must move it.
  // A shield is +1 armour and durability weights armour ×2, so this also pins
  // the calibration the radar is built on.
  if (size === 1) {
    const before = await page.textContent('.ov-legend > div:first-child .v');
    await page.fill('.add-item input', 'Shield (+1 Armor)');
    await page.press('.add-item input', 'Enter');
    await page.waitForFunction(
      (b) => document.querySelector('.ov-legend > div:first-child .v').textContent !== b, before,
      { timeout: 5000 }).catch(() => {});
    const after = await page.textContent('.ov-legend > div:first-child .v');
    ok(Number(after) === Number(before) + 2,
      `${who}: picking up a shield moves durability ${before} → ${after} (+2, armour counts double)`);
  }
  await page.close();
}

// ------------------------------------------------ 2. the conditioning screen
{
  const { page, noise } = await open(`${base}/cairn/kit/#s=oak-fen-317&n=4`, PHONE);
  await page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  const before = (await page.textContent('.ov-head .n')).trim();
  ok((await page.locator('.radar polygon.was').count()) === 0,
    'kit: no ghost polygon before the party has been kitted out');

  await page.click('#run');
  await page.waitForSelector('.award, .awards', { timeout: 90000 });
  await page.waitForTimeout(400);
  ok(!noise.length, `kit: the page is clean — ${noise.join(' | ')}`);

  const awards = await page.locator('.award .to').count();
  ok(awards > 0, `kit: something in the haul was worth a slot (${awards} awarded)`);
  ok((await page.locator('.pack').count()) === 4, 'kit: one pack panel per delver');
  ok((await page.locator('.radar polygon.was').count()) === 1,
    'kit: the ghost polygon shows the party as they were rolled');
  const after = (await page.textContent('.ov-head .n')).trim();
  ok(Number(after) >= Number(before),
    `kit: kitting them out does not make the party worse (${before} → ${after})`);
  ok((await page.locator('.ov-head .delta').count()) === 1,
    'kit: and the change is stated as a delta');

  // The error bar is the point. It must be on screen, not just in the model.
  const firstGain = await page.textContent('.award .gain');
  ok(/±/.test(firstGain), `kit: every gain carries its error bar (${firstGain.trim()})`);
  // Nobody may end up with a full pack: a full pack is 0 HP.
  const slots = await page.locator('.pack h3 span').allTextContents();
  ok(slots.every((s) => {
    const [used, cap] = s.split('·')[0].trim().split('/').map(Number);
    return used < cap;
  }), `kit: every pack keeps a slot free (${slots.map((s) => s.split('·')[0].trim()).join(', ')})`);

  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    'kit: the page does not scroll horizontally on a phone');
  await page.close();
}

// -------------------------------------------------------------- 3. the trials
{
  const { page, noise } = await open(`${base}/cairn/trials/#s=oak-fen-317&n=4`, PHONE);
  await page.waitForSelector('.rung', { timeout: 20000 });
  ok((await page.locator('.rung').count()) === 8, 'trials: eight rungs on the ladder');

  await page.click('#begin');
  await page.waitForSelector('#next:not([hidden])', { timeout: 120000 });
  // THE PACING IS THE DESIGN: the odds are on screen before you commit.
  const odds = (await page.textContent('.next .odds')).replace(/\s+/g, ' ');
  ok(/% of the party expected to fall/.test(odds) && /% chance of a wipe/.test(odds),
    `trials: the rung is weighed before you go in — ${odds.trim().slice(0, 96)}`);

  await page.click('[data-act="auto"]');
  await page.waitForSelector('.outcome', { timeout: 240000 });
  ok(!noise.length, `trials: the page is clean — ${noise.join(' | ')}`);
  const trials = await page.locator('.trial').count();
  ok(trials >= 1 && trials <= 8, `trials: the run logged ${trials} rung(s)`);
  ok(/forecast \d+% · actual \d+%/.test(await page.textContent('.trial .note')),
    'trials: each rung records what was forecast against what happened');

  // Attrition must be visible: Strength is the resource the run spends, and if
  // nobody's bar ever moves the carry model is not wired to the page.
  const bars = await page.locator('.who em').allTextContents();
  ok(bars.length === 4, `trials: the roster shows all four (${bars.join(', ')})`);
  ok(bars.some((b) => b === 'dead' || /STR (\d+)\/(\d+)/.test(b) === true),
    'trials: and reports each delver as a Strength fraction or as dead');
  const spent = bars.some((b) => {
    const m = /STR (\d+)\/(\d+)/.exec(b);
    return b === 'dead' || (m && Number(m[1]) < Number(m[2]));
  });
  ok(spent, `trials: somebody paid for the run in Strength or in blood (${bars.join(', ')})`);

  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    'trials: the page does not scroll horizontally on a phone');
  await page.close();
}

// --------------------------------------------- 4. every served path loads clean
for (const path of ['/cairn/', '/cairn/kit/', '/cairn/trials/', '/cairn/encounter/',
  '/cairn/arena/', '/cairn/items/', '/srd5/', '/srd5/corpus/']) {
  const { page, noise } = await open(base + path);
  await page.waitForTimeout(1500);
  ok(!noise.length, `${path} loads clean — ${noise.join(' | ')}`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    `${path} does not scroll horizontally`);
  await page.close();
}

await browser.close();
server.close();
console.log(`page.check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
