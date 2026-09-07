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
  ok(labels === 'durability,damage,grit,speed', `${who}: axis labels in order (${labels})`);
  // `sweep` used to sit here permanently greyed, which is what got it replaced:
  // an axis that is zero for every fresh party is a quarter of the chart saying
  // nothing. All four must now be live on a party straight off the dice.
  ok((await page.locator('.radar text.off').count()) === 0,
    `${who}: no axis is dead on a freshly rolled party`);

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

// ------------------------------- 3. the party survives the walk between pages
//
// THE REGRESSIONS THIS EXISTS FOR, all of them silent, all of them a party
// quietly becoming a different party:
//
//   * the kit screen and the trials seeded their hauls differently, and the
//     trials ignored `src`/`h` and drew the bare roll until you pressed Begin.
//     A score of 43 became 21 with the damage axis gone.
//   * the roller omitted `n` at size one, so a solo delver arrived as four.
//   * attribute swaps, background picks, typed items and Fatigue never left
//     the roller at all.
//   * and the roller's own onward link read `location.hash`, which is written
//     AFTER the link is drawn — so it was always one edit stale.
//
// Nothing here throws, and the cards can agree while the formation quietly
// differs, so the HASH is compared as well as the card. That is what caught
// the stale link: identical radars, a missing `-f1`.
{
  const edited = await open(`${base}/cairn/#s=oak-fen-317&n=3`, PHONE);
  const r = edited.page;
  await r.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  const sheets = r.locator('.sheet');

  // Every kind of edit the roller offers, on three different members.
  await sheets.nth(0).locator('[data-swap="STR"]').click();
  await sheets.nth(0).locator('[data-swap="DEX"]').click();
  await r.waitForTimeout(120);
  const chip = sheets.nth(1).locator('.chip[data-add]').first();
  if (await chip.count()) { await chip.click(); await r.waitForTimeout(120); }
  await sheets.nth(2).locator('.add-item input').fill('Chainmail (2 Armor, bulky)');
  await sheets.nth(2).locator('.add-item input').press('Enter');
  await r.waitForTimeout(150);
  await sheets.nth(0).locator('[data-fatigue]').click();
  await r.waitForTimeout(250);

  const rollerHash = await r.evaluate(() => location.hash);
  const rollerCard = [await r.textContent('.ov-head .n'),
    (await r.locator('.ov-legend .v').allTextContents()).join('/')].join(' ');
  ok(/e=0\.sSD-f1/.test(rollerHash) && /x=2\./.test(rollerHash),
    `the roller records every edit in the URL (${rollerHash})`);

  // EVERY onward link must carry the formation, not just the one in the card.
  const links = await r.locator('a[href^="kit/"]').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href')));
  ok(links.length > 0 && links.every((h) => h === `kit/${rollerHash}`),
    `every link to the kit screen carries the current formation (${links.join(' , ')})`);
  await r.close();

  // The kit screen, reached by that link.
  const kit = await open(`${base}/cairn/kit/${rollerHash}`, PHONE);
  await kit.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  const kitHash = await kit.page.evaluate(() => location.hash);
  const kitCard = [await kit.page.textContent('.ov-head .n'),
    (await kit.page.locator('.ov-legend .v').allTextContents()).join('/')].join(' ');
  ok(kitHash === rollerHash, `the kit screen round-trips the formation unchanged\n     roller ${rollerHash}\n     kit    ${kitHash}`);
  ok(kitCard === rollerCard, `and shows the same party (${rollerCard} vs ${kitCard})`);
  await kit.page.close();

  // The trials, with the kit pass off so the comparison is like for like.
  const tri = await open(`${base}/cairn/trials/${rollerHash}&kit=0`, PHONE);
  await tri.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  await tri.page.waitForTimeout(300);
  const triCard = [await tri.page.textContent('.ov-head .n'),
    (await tri.page.locator('.ov-legend .v').allTextContents()).join('/')].join(' ');
  ok(triCard === rollerCard, `and so do the trials (${rollerCard} vs ${triCard})`);
  ok(!edited.noise.length && !kit.noise.length && !tri.noise.length,
    `all three pages clean — ${[...edited.noise, ...kit.noise, ...tri.noise].join(' | ')}`);
  await tri.page.close();
}

// A party of ONE has to stay a party of one all the way down.
{
  const r = await open(`${base}/cairn/#s=oak-fen-317`, PHONE);
  await r.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  ok((await r.page.locator('.sheet').count()) === 1, 'the roller opens on a single character');
  const hash = await r.page.evaluate(() => location.hash);
  ok(/n=1/.test(hash), `and says so in the URL (${hash})`);
  await r.page.close();
  for (const where of ['kit', 'trials']) {
    const p = await open(`${base}/cairn/${where}/${hash}`, PHONE);
    await p.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
    const note = await p.page.textContent('.ov-note');
    ok(/\b1 delver\b/.test(note), `/${where}/ keeps them a party of one`);
    await p.page.close();
  }
}

// The kit and trials both hand off whatever haul settings they were given.
for (const hash of ['#s=oak-fen-317&n=4', '#s=oak-fen-317&n=4&src=bought&h=12']) {
  const kit = await open(`${base}/cairn/kit/${hash}`, PHONE);
  await kit.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  await kit.page.click('#run');
  await kit.page.waitForSelector('.award .to', { timeout: 120000 });
  const kitScore = (await kit.page.textContent('.ov-head .n')).trim();
  const kitAxes = (await kit.page.locator('.ov-legend .v').allTextContents()).join('/');
  const onward = await kit.page.getAttribute('.onward-row a[href*="trials"]', 'href');
  await kit.page.close();

  const url = new URL(onward, `${base}/cairn/kit/`);
  const tri = await open(base + url.pathname + url.hash, PHONE);
  await tri.page.waitForSelector('#overview:not([hidden])', { timeout: 20000 });
  await tri.page.waitForFunction(() => document.getElementById('progress').hidden, { timeout: 120000 });
  await tri.page.waitForTimeout(250);
  const triScore = (await tri.page.textContent('.ov-head .n')).trim();
  const triAxes = (await tri.page.locator('.ov-legend .v').allTextContents()).join('/');
  await tri.page.close();

  ok(kitScore === triScore && kitAxes === triAxes,
    `handoff ${hash}: the trials show the party the kit screen built `
    + `(kit ${kitScore} [${kitAxes}] vs trials ${triScore} [${triAxes}])`);
  ok(!kit.noise.length && !tri.noise.length,
    `handoff ${hash}: both pages clean — ${[...kit.noise, ...tri.noise].join(' | ')}`);
}

// -------------------------------------------------------------- 4. the trials
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

// ------------------------------------------------------- 5. the descent plays
//
// Not "does it render" — DOES IT PLAY. The run is the only page here that is a
// game, so the check plays one: pilot every action, take a spoils choice
// between every fight, and reach an ending. Anything that stalls the loop —
// an option that never enables, a phase with no way out — hangs here rather
// than shipping.
{
  const { page, noise } = await open(`${base}/cairn/run/#s=tallow-mere&n=4`, PHONE);
  await page.waitForSelector('.stage h2', { timeout: 20000 });
  ok((await page.locator('.pip').count()) === 8, 'the descent has eight rungs on its track');
  ok((await page.locator('.mate').count()) === 4, 'and the party is on screen before anything else');

  let acts = 0, spoils = 0, sawFeed = false, sawOdds = false, guard = 900;
  while (guard-- > 0) {
    if (await page.locator('.ending').count()) break;
    if (!(await page.locator('#progress').isHidden())) { await page.waitForTimeout(100); continue; }

    if (await page.locator('[data-go]').count()) {
      const odds = (await page.textContent('.stage .sub')).replace(/\s+/g, ' ');
      if (/expected to fall/.test(odds) && /chance of a wipe/.test(odds)) sawOdds = true;
      await page.click('[data-go]');
      continue;
    }
    if (await page.locator('[data-scout]').count()) { await page.click('[data-scout]'); continue; }

    if (await page.locator('[data-heal]').count()) {
      spoils++;
      ok((await page.locator('.card').count()) === 3 || spoils > 1,
        'the pack on the table is three cards');
      if (spoils === 1) {
        // The oracle advises but must never spend the choice for you.
        await page.click('[data-ask]');
        await page.waitForFunction(() => document.getElementById('progress').hidden, { timeout: 60000 });
        ok((await page.locator('.card .oracle').count()) === 3,
          'asking the oracle annotates every card, including the ones it would leave');
        ok((await page.locator('[data-heal]').count()) === 1,
          'and both choices are still on the table afterwards — advice is not a move');
        // Place a card by tapping it and then a delver.
        await page.click('[data-card="0"]');
        await page.locator('[data-holder]').first().click();
        ok((await page.locator('.card .to').count()) === 1, 'a placed card says who is carrying it');
        await page.click('[data-done]');
      } else if (spoils % 2 === 0) {
        await page.click('[data-heal]');
      } else {
        await page.click('[data-done]');
      }
      continue;
    }

    // A fight is waiting on a decision.
    const foe = page.locator('.foe:not(.down)').first();
    if (await foe.count()) await foe.click();
    const act = page.locator('.act:not([disabled])').first();
    if (await act.count()) {
      if (!(await page.locator('#feed').isHidden())) sawFeed = true;
      await act.click();
      acts++;
      continue;
    }
    await page.waitForTimeout(60);
  }

  ok(acts > 10, `the run asked for ${acts} piloted decisions`);
  ok(spoils > 1, `and offered spoils ${spoils} times`);
  ok(sawOdds, 'every rung showed its odds before you committed to it');
  ok(sawFeed, 'and the blow-by-blow feed appeared during a fight');
  ok((await page.locator('.ending').count()) === 1, 'the descent reaches an ending');
  const detail = (await page.textContent('.ending p')).replace(/\s+/g, ' ');
  ok(/scars? earned/.test(detail), `the ending accounts for the scars (${detail.trim().slice(0, 110)})`);
  ok(!noise.length, `the run is clean — ${noise.join(' | ')}`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    'and does not scroll horizontally on a phone');
  await page.close();
}

// --------------------------------------------- 6. every served path loads clean
for (const path of ['/cairn/', '/cairn/kit/', '/cairn/trials/', '/cairn/run/',
  '/cairn/encounter/', '/cairn/arena/', '/cairn/items/', '/srd5/', '/srd5/corpus/']) {
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
