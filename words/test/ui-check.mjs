#!/usr/bin/env node
// words — drive the client in a real browser.
//
//   npm i playwright            # NOT a repo dependency; install it ad hoc
//   node words/test/ui-check.mjs [base-url]
//
// Defaults to a local static server if you start one; pass a URL to drive
// production. NOT part of preflight and NOT a deploy gate — it needs a browser
// binary the repo does not carry, and it is named `ui-check` rather than
// `*.selftest.mjs` for exactly that reason.
//
// WHY IT EXISTS. The engine and the worker have selftests; the client had
// nothing, and the first time anything opened the page in a browser it found a
// bug no amount of reading would have: `.modal` sets `display: grid`, and ANY
// display rule silently overrides the `hidden` attribute — so a
// `position: fixed; inset: 0` overlay marked hidden was laid out over the whole
// page and swallowed every click. The site was completely unusable, and it
// looked perfect in a screenshot, because the thing blocking the clicks was
// invisible. One `[hidden] { display: none !important; }` fixed it.
//
// Serve the directory locally with any static server on 127.0.0.1 to test the
// OFFLINE path (which is most of this file) without touching the network.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://words.mino.mobi';
const OUT = process.env.WORDS_SHOTS || '/tmp';

// The sandbox's egress is the agent proxy, and its TLS is a local CA the
// browser does not ship with — hence the proxy option and ignoreHTTPSErrors.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY || 'http://127.0.0.1:34711', bypass: '127.0.0.1,localhost' },
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true,
});
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

const step = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) { console.log(`  FAIL ${name}: ${e.message}`); }
};

console.log(`driving ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });

await step('the legend rendered every square', async () => {
  const n = await page.locator('#legend li').count();
  if (n !== 9) throw new Error(`${n} legend rows, expected 9`);
});
await step('the three boards are offered', async () => {
  const n = await page.locator('#layoutPick button').count();
  if (n !== 3) throw new Error(`${n} boards`);
});
await step('the lexicon loaded into the page', async () => {
  const txt = await page.locator('#lexNote').textContent();
  if (!/168,551/.test(txt)) throw new Error(`lexNote says: ${txt.slice(0, 60)}`);
});
await step('the word checker works', async () => {
  await page.fill('#lookup', 'quixotic');
  await page.waitForFunction(() => document.getElementById('lookupResult').textContent === 'a word', null, { timeout: 10000 });
  await page.fill('#lookup', 'zzzzz');
  await page.waitForFunction(() => document.getElementById('lookupResult').textContent === 'not a word', null, { timeout: 10000 });
});
await page.screenshot({ path: `${OUT}/shot-home.png`, fullPage: false });

// --- start an offline game against a bot ---
await step('an offline game starts', async () => {
  await page.fill('#myName', 'Probe');
  await page.click('#startLocal');
  await page.waitForSelector('#game:not([hidden])', { timeout: 20000 });
  const squares = await page.locator('#board .sq').count();
  if (squares !== 225) throw new Error(`${squares} squares`);
});
await step('a rack was dealt', async () => {
  const n = await page.locator('#rack .rt:not(.empty)').count();
  if (n !== 7) throw new Error(`${n} tiles`);
});
await step('the scoreboard shows both seats', async () => {
  const n = await page.locator('#scores .pl').count();
  if (n !== 2) throw new Error(`${n} seats`);
});
await page.screenshot({ path: `${OUT}/shot-board.png` });

// --- place a tile from the hint, and check the live score ---
await step('a hint offers plays', async () => {
  await page.click('#hintBtn');
  await page.waitForSelector('#modal:not([hidden])', { timeout: 20000 });
  const n = await page.locator('#modalBody button').count();
  if (n < 1) throw new Error('no hints offered');
});
await step('taking a hint stages the play and scores it live', async () => {
  await page.locator('#modalBody button').first().click();
  await page.waitForSelector('#pending:not([hidden])', { timeout: 10000 });
  const cls = await page.locator('#pending').getAttribute('class');
  if (!/ok/.test(cls)) throw new Error(`pending is ${cls}: ${await page.locator('#pending').textContent()}`);
  const pts = Number(await page.locator('#pending .pts').textContent());
  if (!(pts > 0)) throw new Error(`scored ${pts}`);
  console.log(`       live score: ${pts} for ${(await page.locator('#pending span').first().textContent())}`);
});
await page.screenshot({ path: `${OUT}/shot-staged.png` });

await step('the play banks and the bot answers', async () => {
  const before = await page.locator('#log li').count();
  await page.click('#playBtn');
  await page.waitForFunction((n) => document.querySelectorAll('#log li').length > n + 1, before, { timeout: 30000 });
  const rows = await page.locator('#log li').count();
  console.log(`       log went ${before} -> ${rows} entries`);
  const mine = Number((await page.locator('#scores .pl .sc').first().textContent()));
  if (!(mine > 0)) throw new Error(`my score is ${mine}`);
});
await page.screenshot({ path: `${OUT}/shot-played.png` });

await step('the game survives a reload (it is stored)', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  const n = await page.locator('#resumeList li').count();
  if (n < 1) throw new Error('no saved games listed');
});

await step('the service worker registered', async () => {
  const reg = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  if (reg < 1) throw new Error('no service worker');
});

console.log(errors.length ? `\n${errors.length} page errors:` : '\nno page errors');
for (const e of [...new Set(errors)].slice(0, 10)) console.log(`  ! ${e}`);

await browser.close();
