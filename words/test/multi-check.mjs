#!/usr/bin/env node
// words — two people, two browsers, one game.
//
//   npm i playwright                        # not a repo dependency
//   node words/test/serve-local.mjs 8788 &  # the real worker, in-memory D1
//   node words/test/multi-check.mjs
//
// NOT a deploy gate (it needs a browser binary and a running server) and not
// named *.selftest.mjs for that reason. It is the only test that exercises the
// thing the game is actually for: two separate clients, each holding half the
// hidden information, taking turns through the server.
//
// It earned its place immediately. Joining a game writes to the game row, which
// bumped the row `version` — and the client was sending that version as its
// staleness check, so THE MOMENT A SECOND PLAYER JOINED, the first player's
// next move was rejected as stale. Every two-person game was broken on its
// first move. Nothing single-player could have shown it, and neither selftest
// did: it takes two clients and a join in between.
//
// The push subscription cannot fully pass here — Chrome disables the Push API
// in the incognito contexts Playwright uses — so that step checks the app fails
// cleanly and says something true instead.
import { chromium } from 'playwright';
const OUT = process.env.WORDS_SHOTS || '/tmp';
const BASE = process.argv[2] || 'http://127.0.0.1:8788';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const errs = [];
const newPlayer = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${name}: ${m.text()}`); });
  return page;
};
const step = async (n, f) => { try { await f(); console.log(`  ok   ${n}`); } catch (e) { console.log(`  FAIL ${n}: ${e.message}`); } };
const centre = (page, sel) => page.$eval(sel, (n) => n.scrollIntoView({ block: 'center' }));

const ada = await newPlayer('ada');
const grace = await newPlayer('grace');

let code;
await step('Ada starts a two-person game', async () => {
  await ada.goto(BASE, { waitUntil: 'networkidle' });
  await ada.fill('#myName', 'Ada');
  // seat 2 defaults to a bot; make it a person
  await ada.selectOption('#seatPick .seat:nth-child(2) select', 'human');
  await centre(ada, '#startOnline');
  await ada.click('#startOnline');
  await ada.waitForSelector('#game:not([hidden])', { timeout: 20000 });
  code = new URL(ada.url()).searchParams.get('g');
  if (!code) throw new Error('no game code in the URL');
  console.log(`       game ${code}`);
});

await step('Ada is told the seat is still open, with a link to share', async () => {
  if (await ada.locator('#shareRow').isHidden()) throw new Error('no share row');
  const link = await ada.inputValue('#shareLink');
  if (!link.includes(code)) throw new Error(link);
});

await step('Grace opens the link and takes the seat', async () => {
  await grace.goto(`${BASE}/?g=${code}`, { waitUntil: 'networkidle' });
  await grace.waitForSelector('#game:not([hidden])', { timeout: 20000 });
  const seats = await grace.locator('#scores .pl').count();
  if (seats !== 2) throw new Error(`${seats} seats`);
  const rack = await grace.locator('#rack .rt:not(.empty)').count();
  if (rack !== 7) throw new Error(`${rack} tiles`);
});

await step('their racks are different, and neither can see the other', async () => {
  const a = await ada.$$eval('#rack .rt:not(.empty)', (n) => n.map((x) => x.firstChild.textContent).join(''));
  const g = await grace.$$eval('#rack .rt:not(.empty)', (n) => n.map((x) => x.firstChild.textContent).join(''));
  if (a === g) throw new Error(`both hold ${a}`);
  const leak = await grace.evaluate(() => JSON.stringify(window.localStorage).includes('"bag"'));
  if (leak) throw new Error('bag leaked into the client');
});

await step('Grace cannot move out of turn', async () => {
  const disabled = await grace.locator('#playBtn').isDisabled();
  if (!disabled) throw new Error('Play is live on the wrong turn');
  if (await grace.locator('#banner').isHidden()) throw new Error('no "waiting" banner');
  const txt = await grace.locator('#banner').textContent();
  if (!/Ada/.test(txt)) throw new Error(`banner says: ${txt}`);
});

await step('Ada offers turn alerts (two humans) and can switch them on', async () => {
  if (await ada.locator('#notifyRow').isHidden()) throw new Error('no notify row for a two-human game');
  await centre(ada, '#notifyBtn');
  await ada.click('#notifyBtn');
  // Playwright's contexts are incognito and Chrome disables the Push API
  // there, so "it failed cleanly and said so" is the pass condition available:
  // what matters is that the page survives it and tells the truth.
  await ada.waitForFunction(() => document.getElementById('notifyBtn').disabled
    || !document.getElementById('toast').hidden, null, { timeout: 25000 });
  const on = await ada.locator('#notifyBtn').isDisabled();
  const said = on ? 'alerts on' : (await ada.locator('#toast').textContent());
  console.log(`       ${said.trim().slice(0, 80)}`);
});

await step('Ada plays, and Grace sees it without touching anything', async () => {
  await centre(ada, '#hintBtn');
  await ada.click('#hintBtn');
  await ada.waitForSelector('#modal:not([hidden])');
  await ada.locator('#modalBody button').first().click();
  await ada.waitForSelector('#pending:not([hidden])');
  const word = (await ada.locator('#pending span').first().textContent()).trim();
  await ada.click('#playBtn');
  await ada.waitForFunction(() => document.querySelectorAll('#log li').length > 0, null, { timeout: 20000 });
  console.log(`       Ada played ${word}`);
  // Grace's client polls; give it a couple of cycles.
  await grace.waitForFunction(() => document.querySelectorAll('#log li').length > 0, null, { timeout: 30000 });
  // Play stays disabled until tiles are staged — that is correct. The signal
  // that the turn arrived is that the "waiting for Ada" banner is gone and the
  // turn-only actions have come alive.
  if (await grace.locator('#hintBtn').isDisabled()) throw new Error('Grace has no turn actions after Ada moved');
  if (!(await grace.locator('#banner').isHidden())) {
    throw new Error(`Grace still shows: ${await grace.locator('#banner').textContent()}`);
  }
});

await step('the board agrees in both browsers', async () => {
  const read = (p) => p.$$eval('#board .tile', (ns) => ns.map((n) => n.firstChild.textContent).join(''));
  const a = await read(ada);
  const g = await read(grace);
  if (a !== g || !a.length) throw new Error(`"${a}" vs "${g}"`);
  console.log(`       both show ${a}`);
});

await step('Grace replies and Ada sees the score move', async () => {
  await centre(grace, '#hintBtn');
  await grace.click('#hintBtn');
  await grace.waitForSelector('#modal:not([hidden])');
  await grace.locator('#modalBody button').first().click();
  await grace.waitForSelector('#pending:not([hidden])');
  await grace.click('#playBtn');
  await ada.waitForFunction(() => document.querySelectorAll('#log li').length > 1, null, { timeout: 30000 });
  const scores = await ada.$$eval('#scores .sc', (n) => n.map((x) => Number(x.textContent)));
  if (!scores.every((x) => x > 0)) throw new Error(`scores ${scores}`);
  console.log(`       scores ${scores.join(' / ')}`);
});

await step('a third person can only watch', async () => {
  const nosy = await newPlayer('nosy');
  await nosy.goto(`${BASE}/?g=${code}`, { waitUntil: 'networkidle' });
  await nosy.waitForSelector('#game:not([hidden])', { timeout: 20000 });
  const rack = await nosy.locator('#rack .rt:not(.empty)').count();
  if (rack !== 0) throw new Error(`a spectator was dealt ${rack} tiles`);
  const banner = await nosy.locator('#banner').textContent();
  if (!/Watching/.test(banner)) throw new Error(`banner: ${banner}`);
});

await ada.screenshot({ path: `${OUT}/shot-multi-ada.png` });
await grace.screenshot({ path: `${OUT}/shot-multi-grace.png` });

console.log(errs.length ? `\n${errs.length} page errors:\n  ${[...new Set(errs)].join('\n  ')}` : '\nno page errors');
await browser.close();
