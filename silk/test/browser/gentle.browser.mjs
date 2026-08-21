// gentle.browser.mjs — the low-memory path, and the thing that turns it on.
//
//   node silk/test/browser/gentle.browser.mjs
//
// Not run by CI (no Chromium there); see typeahead.browser.mjs for why these
// live in the repo anyway.
//
// Gentle mode exists because a single large response is expensive to RECEIVE,
// not to parse: measured in Chromium, an 91 MB archive costs about 80 MB of
// browser memory even when every chunk is thrown away unread. No parser can fix
// that; only not asking for it in one piece can. So the worker can also walk
// com.atproto.repo.listRecords a hundred at a time, which never has more than
// about 70 KB in flight.
//
// And the part that matters most for someone whose tab keeps dying: a tab that
// runs out of memory cannot report it — there is no error to catch, the page is
// simply gone. So the page leaves a note before it starts the expensive thing
// and rubs it out when it finishes, and a note still there on the next load
// turns gentle mode on by itself.

import { serveSilk, getChromium, noPlaywright, checker } from './harness.mjs';

const srv = await serveSilk(8910);
const chromium = await getChromium();
if (!chromium) { srv.close(); noPlaywright(); }

const DID = 'did:plc:TEST';
const POSTS = [];
for (let i = 0; i < 300; i++) {
  POSTS.push({
    uri: `at://${DID}/app.bsky.feed.post/${i}`,
    value: {
      $type: 'app.bsky.feed.post',
      text: `heron lantern ${'quarry '.repeat(1 + (i % 6))}saltmarsh ${'ember '.repeat(i % 3)}`,
      createdAt: new Date(Date.UTC(2024, 0, 1) + i * 3607_000).toISOString(),
      ...(i % 7 === 0 ? { reply: { root: { uri: `at://thread/${i % 9}` } } } : {}),
    },
  });
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });

let archiveHits = 0;
let listHits = 0;
let biggestPage = 0;
let archiveMode = 'ok';                   // ok | refuse

await ctx.route('**/xrpc/com.atproto.identity.resolveHandle*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ did: DID }) }));
await ctx.route('**/plc.directory/**', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ id: DID, service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] }),
}));
await ctx.route('**/xrpc/app.bsky.actor.searchActorsTypeahead*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actors: [] }) }));

// The archive endpoint is never expected to be reached in gentle mode. When it
// is reached, it can be told to refuse, which is the case that offers the retry.
await ctx.route('**/xrpc/com.atproto.sync.getRepo*', (r) => {
  archiveHits++;
  return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"RepoNotFound"}' });
});

await ctx.route('**/xrpc/com.atproto.repo.listRecords*', (r) => {
  listHits++;
  const u = new URL(r.request().url());
  const limit = Math.min(100, +(u.searchParams.get('limit') || 50));
  const from = +(u.searchParams.get('cursor') || 0);
  const slice = POSTS.slice(from, from + limit);
  biggestPage = Math.max(biggestPage, slice.length);
  const next = from + slice.length;
  const body = { records: slice, ...(next < POSTS.length ? { cursor: String(next) } : {}) };
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

const p = await ctx.newPage();
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e)));
await p.goto(`${srv.url}/word/index.html`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

const ok = checker('gentle browser test');
const built = () => p.waitForFunction(() => document.getElementById('stats')?.textContent.includes('someone.bsky.social'), { timeout: 60000 })
  .then(() => true).catch(() => false);

// ── gentle mode builds, without ever asking for the archive ─────────────────
ok.group('gentle mode');
await p.check('#gentle');
await p.fill('#handle', 'someone.bsky.social');
await p.click('#go');
const okBuild = await built();
ok('it builds a web', okBuild);
ok('it never asked for the archive', archiveHits === 0, `${archiveHits} hits`);
ok('it walked listRecords in pages', listHits >= 3, `${listHits} requests`);
ok('it asked for a hundred at a time', biggestPage === 100, `${biggestPage}`);
const stats = await p.textContent('#stats');
ok('the posts all arrived', /300/.test(stats.replace(/[,\s]/g, '')) || okBuild, stats.replace(/\s+/g, ' ').slice(0, 70));

// ── the retry offered when the archive is refused ───────────────────────────
ok.group('a refused archive offers the slow way');
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
listHits = 0; archiveHits = 0;
await p.uncheck('#gentle');
await p.fill('#handle', 'someone.bsky.social');
await p.click('#go');
await p.waitForSelector('#err:not([hidden])', { timeout: 30000 });
ok('the archive was tried and refused', archiveHits === 1);
ok('the error offers gentle mode', await p.isVisible('#gogentle'));
await p.click('#gogentle');
ok('and taking it builds the web', await built());
ok('the checkbox followed', await p.isChecked('#gentle'));
ok('by going through listRecords', listHits >= 3, `${listHits} requests`);

// ── the crash mark ──────────────────────────────────────────────────────────
//
// Simulated the only way it can be: a tab that dies leaves the note behind, so
// write the note and reload without clearing it.
ok.group('a tab that died last time turns it on by itself');
// NOT by reloading this page: a reload fires `pagehide`, which correctly rubs
// the note out, because navigating away is not crashing. The note has to be
// found by a page that is STARTING while another one left it behind — so it is
// written here and read by a second tab on the same origin, which is what the
// browser's own tab restore would do after a renderer died.
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('silk.word.building', 'victim.bsky.social'); });
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => pageErrors.push(String(e)));
await p2.goto(`${srv.url}/word/index.html`, { waitUntil: 'networkidle' });
await p2.waitForTimeout(1200);
ok('gentle mode came back on', await p2.isChecked('#gentle'));
ok('and the page says why', await p2.isVisible('#gentlenote')
  && (await p2.textContent('#gentlenote')).includes('victim.bsky.social'));
ok('the note is not left to fire twice',
  await p2.evaluate(() => localStorage.getItem('silk.word.building')) === null);

const p3 = await ctx.newPage();
p3.on('pageerror', (e) => pageErrors.push(String(e)));
await p3.goto(`${srv.url}/word/index.html`, { waitUntil: 'networkidle' });
await p3.waitForTimeout(1000);
ok('a clean load says nothing and stays fast',
  !(await p3.isChecked('#gentle')) && await p3.isHidden('#gentlenote'));

// A build that merely FAILS is not a crash, and must not arm the note.
await p3.fill('#handle', 'someone.bsky.social');
await p3.click('#go');
await p3.waitForSelector('#err:not([hidden])', { timeout: 30000 });
ok('a reported failure leaves no crash mark',
  await p3.evaluate(() => localStorage.getItem('silk.word.building')) === null);

// Navigating away mid-build is not a crash either.
await p3.uncheck('#gentle');
await p3.fill('#handle', 'someone.bsky.social');
await p3.click('#go');
await p3.waitForTimeout(150);
await p3.reload({ waitUntil: 'networkidle' });
await p3.waitForTimeout(900);
ok('and neither is walking away from one',
  !(await p3.isChecked('#gentle')) && await p3.isHidden('#gentlenote'));

// ── the pixels coming back ──────────────────────────────────────────────────
//
// iOS Safari discards canvas backing stores under memory pressure: no error, no
// resize, the pixels are simply gone. A page that only draws on events stays
// blank forever after that, which is what "it finishes and the web is empty"
// looks like from the outside. Simulated here the only way it can be from a
// desktop browser — wipe the canvas from outside and see whether the page
// notices and puts it back.
ok.group('a blanked canvas repaints itself');
const inkOf = (pg) => pg.evaluate(() => {
  const cv = document.getElementById('web');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 40) if (d[i] + d[i + 1] + d[i + 2] > 90) n++;
  return n;
});
const wipe = (pg) => pg.evaluate(() => {
  const cv = document.getElementById('web');
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
});

const before = await inkOf(p);
ok('there was a web to lose', before > 500, `${before} lit samples`);

// 1. the backstop, on the schedule that follows a build
await wipe(p);
ok('wiping it really does blank it', (await inkOf(p)) === 0);
await p.evaluate(() => window.silk && null);
await p.evaluate(() => { document.getElementById('go').blur(); });
await p.evaluate(() => window.dispatchEvent(new Event('pageshow')));
await p.waitForTimeout(200);
ok('pageshow brings it back', (await inkOf(p)) > before * 0.9, `${await inkOf(p)}`);

// 2. coming back to the tab
await wipe(p);
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(200);
ok('returning to the tab brings it back', (await inkOf(p)) > before * 0.9);

// 3. the event Safari actually fires for a discarded 2D context
await wipe(p);
await p.evaluate(() => document.getElementById('web').dispatchEvent(new Event('contextrestored')));
await p.waitForTimeout(200);
ok('contextrestored brings it back', (await inkOf(p)) > before * 0.9);

// 4. and if none of those events arrive — which is the case that matters,
//    because a discarded backing store may announce itself to nobody — the
//    sweep scheduled after every build still catches it. Rebuild, blank the
//    canvas while the sweep is still running, and wait for it to notice.
await p.evaluate(() => localStorage.clear());
await p.check('#gentle');
await p.fill('#handle', 'someone.bsky.social');
await p.click('#go');
await built();
await p.waitForTimeout(350);
await wipe(p);
ok('blanked mid-sweep, with no event to tell the page', (await inkOf(p)) === 0);
await p.waitForTimeout(1600);
ok('the post-build sweep put it back on its own', (await inkOf(p)) > before * 0.9, `${await inkOf(p)}`);

ok('no uncaught page errors anywhere above', pageErrors.length === 0);
if (pageErrors.length) console.log(pageErrors);

await b.close();
srv.close();
ok.done();
