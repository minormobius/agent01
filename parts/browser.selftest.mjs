// browser.selftest — the page in headless Chromium against the real index
// (node:sqlite) mounted on a local server, seeded with a community, two
// posts, a thread and votes. Writes need a sign-in the sandbox cannot do,
// so the test proves the reads, the routes, and that a write without a
// session is refused politely.
//
//   node parts/browser.selftest.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { Index, shape, COMMUNITY, POST, COMMENT, VOTE } from './lib/index.js';
import { handleApi } from './worker.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(path.join(here, '..', 'packages', 'cad', 'bakeoff', 'package.json'));
// Without Playwright (`npm ci` in packages/cad/bakeoff) or its Chromium this
// says so and exits 0: the preflight sweep runs every changed dir's selftests
// on a bare runner, and a crash there would read as a failing page.
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.log('↷ browser selftest skipped — playwright-core is not installed (npm ci in packages/cad/bakeoff)'); process.exit(0); }
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].filter(Boolean).find((p) => fs.existsSync(p));
if (!exe) { console.log('↷ browser selftest skipped — no Chromium at /opt/pw-browsers (set CHROME_PATH)'); process.exit(0); }
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

const sq = new DatabaseSync(':memory:');
const ix = new Index({ run: (s, ...p) => sq.prepare(s).run(...p), all: (s, ...p) => sq.prepare(s).all(...p) });
const rev = 'at://did:plc:gd6m4mw3km2betcnbbs6362q/com.minomobi.cad.revision/3mvbgqo7wnk2w';
const community = 'at://did:plc:alice/com.minomobi.cad.community/clocks';
const post1 = 'at://did:plc:bob/com.minomobi.cad.post/3p1', post2 = 'at://did:plc:carol/com.minomobi.cad.post/3p2';
const c1 = 'at://did:plc:carol/com.minomobi.cad.comment/3c1', c2 = 'at://did:plc:bob/com.minomobi.cad.comment/3c2';
const seed = (collection, uri, value) => ix.upsert(collection, shape(collection, uri, 'bafy' + uri.slice(-6), uri.split('/')[2], value));
seed(COMMUNITY, community, { name: 'clocks', title: 'Clocks', description: 'movements, escapements, cases', createdAt: '2026-09-12T10:00:00Z' });
seed(POST, post1, { community: { uri: community, cid: 'c' }, part: { uri: rev, cid: 'r' }, title: 'A lever escapement that ticks', text: 'sixty beats, two turns', createdAt: new Date(Date.now() - 3600e3).toISOString() });
seed(POST, post2, { community: { uri: community, cid: 'c' }, part: { uri: rev, cid: 'r' }, title: 'older, downvoted', createdAt: new Date(Date.now() - 2 * 86400e3).toISOString() });
seed(COMMENT, c1, { post: { uri: post1, cid: 'p' }, text: 'does the pallet clear?', createdAt: new Date(Date.now() - 3000e3).toISOString() });
seed(COMMENT, c2, { post: { uri: post1, cid: 'p' }, parent: { uri: c1, cid: 'c' }, text: 'checked mid-beat: expected touches only', createdAt: new Date(Date.now() - 2400e3).toISOString() });
seed(VOTE, 'at://did:plc:alice/com.minomobi.cad.vote/1', { subject: { uri: post1, cid: 'p' }, value: 1, createdAt: '2026-09-12T11:00:00Z' });
seed(VOTE, 'at://did:plc:carol/com.minomobi.cad.vote/2', { subject: { uri: post1, cid: 'p' }, value: 1, createdAt: '2026-09-12T11:00:00Z' });
seed(VOTE, 'at://did:plc:alice/com.minomobi.cad.vote/3', { subject: { uri: post2, cid: 'p' }, value: -1, createdAt: '2026-09-12T11:00:00Z' });
seed(VOTE, 'at://did:plc:bob/com.minomobi.cad.vote/4', { subject: { uri: c1, cid: 'c' }, value: 1, createdAt: '2026-09-12T11:00:00Z' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const site = path.join(here, 'site');
// Mounted at /parts/ the way the cad worker mounts it (prefix stripped before
// the worker sees the path), so the page's relative URLs are what is tested.
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/parts/')) { res.writeHead(404); return res.end(); }
  u.pathname = u.pathname.slice('/parts'.length); req.url = u.pathname + u.search;
  if (u.pathname.startsWith('/api/')) { const r = await handleApi(ix, new Request(`http://x${req.url}`, { method: req.method })); res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(await r.text()); }
  const p = path.join(site, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!p.startsWith(site) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/parts`;

const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox', '--proxy-server=direct://', '--disable-background-networking'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/auth\.mino\.mobi|public\.api\.bsky\.app|cad\.mino\.mobi/.test(m.location()?.url || '')) errors.push(m.text()); });
// the network is not reachable from here: the auth worker answers signed-out, profiles and the cad gateway answer empty
await page.route('https://auth.mino.mobi/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
await page.route('https://public.api.bsky.app/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ handle: 'someone.test' }) }));
await page.route('https://cad.mino.mobi/**', (r) => {
  const u = r.request().url();
  if (u.includes('searchActorsTypeahead')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actors: [{ did: 'did:plc:a', handle: 'someone.test', displayName: 'Someone' }, { did: 'did:plc:b', handle: 'somebody.else.test' }] }) });
  if (u.includes('getProfile')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ handle: 'someone.test' }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uri: rev, cid: 'r', value: { tree: { name: 'clock', components: [1, 2, 3] }, invariants: { volume: 11619.4, euler: 2, watertight: true }, message: 'published from bench/clock.json' } }) });
});
const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

await page.goto(`${base}/#/`, { waitUntil: 'load' });
check(page.url().includes('/parts/#/'), 'the page is served at /parts/, as the cad worker mounts it');
await page.waitForSelector('.post');
const front = await page.evaluate(() => ({ posts: [...document.querySelectorAll('.post h3')].map((h) => h.textContent), scores: [...document.querySelectorAll('.post .vote span')].map((s) => s.textContent), communities: [...document.querySelectorAll('.side .c a')].map((a) => a.textContent), who: document.querySelector('#who').textContent, handles: [...document.querySelectorAll('[data-did]')].map((a) => a.textContent) }));
check(front.posts[0] === 'A lever escapement that ticks' && front.posts.length === 2 && front.scores.join() === '2,-1', `the front page lists both posts, hot first, with scores (${front.scores.join(', ')})`);
check(front.communities.join() === 'clocks' && front.who === 'not signed in', 'the communities sidebar and the signed-out state render');
await page.waitForFunction(() => [...document.querySelectorAll('[data-did]')].every((a) => a.textContent.startsWith('@')));
check(true, 'author handles resolve through the cad gateway');
await page.fill('#handle', 'some'); await page.waitForFunction(() => document.querySelectorAll('.ta-list li').length === 2, null, { timeout: 5000 });
const ta = await page.evaluate(() => { const i = document.querySelector('#handle'), l = document.querySelector('.ta-list'); const ri = i.getBoundingClientRect(), rl = l.getBoundingClientRect(); return { names: [...l.querySelectorAll('li')].map((o) => o.firstChild.textContent), below: rl.top >= ri.bottom - 1, hidden: l.hidden }; });
check(ta.names.join() === 'someone.test,somebody.else.test' && ta.below && !ta.hidden, `typing in the handle field opens a list under it, never over it (${ta.names.join(', ')})`);
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
check((await page.inputValue('#handle')) === 'someone.test' && (await page.evaluate(() => document.querySelector('.ta-list').hidden)), 'arrow and enter pick a suggestion and close the list');
await page.click('.sorts a:nth-child(2)'); await page.waitForFunction(() => document.querySelector('.sorts a.on')?.textContent === 'new');
await page.click('.side .c a'); await page.waitForSelector('h2');
const comm = await page.evaluate(() => ({ h2: document.querySelector('h2').textContent, posts: document.querySelectorAll('.post').length, desc: document.querySelector('.text')?.textContent }));
check(/Clocks/.test(comm.h2) && comm.posts === 2 && /escapements/.test(comm.desc), `the community page: ${comm.h2.slice(0, 40)}…, ${comm.posts} posts`);
await page.click('.post h3 a'); await page.waitForSelector('#comment');
await page.waitForFunction(() => /components|watertight|could not/.test(document.querySelector('#part')?.textContent || ''), null, { timeout: 15000 });
const thread = await page.evaluate(() => ({ part: document.querySelector('#part').textContent, comments: document.querySelectorAll('.comment').length, nested: document.querySelectorAll('.comment .replies .comment').length, open: document.querySelector('#part .open').getAttribute('href'), firstScore: document.querySelector('.comment .meta').textContent }));
check(thread.comments === 2 && thread.nested === 1 && /1/.test(thread.firstScore), `the post page threads ${thread.comments} comments, one nested`);
check(/clock/.test(thread.part) && /3 components/.test(thread.part) && /published from/.test(thread.part) && thread.open.startsWith('https://cad.mino.mobi/?at=at%3A%2F%2F'), `the part card reads the revision through the cad gateway and links to the viewer (${thread.part.slice(0, 60)}…)`);
await page.click('.post .vote button'); await page.waitForFunction(() => window.__dialogs !== undefined || true);
await new Promise((r) => setTimeout(r, 300));
check(dialogs.some((d) => /sign in first/.test(d)), `voting signed-out is refused with a message (${dialogs[0] || 'no dialog'})`);
await page.goto(`${base}/#/found`, { waitUntil: 'load' }); await page.waitForSelector('#found');
await page.fill('#found input[name=name]', 'gears'); await page.fill('#found input[name=title]', 'Gears'); await page.click('#found button');
await page.waitForFunction(() => /sign in/.test(document.querySelector('#fstatus')?.textContent || ''));
check(true, 'founding a community signed-out is refused in the form, not thrown');
await page.goto(`${base}/#/new`, { waitUntil: 'load' }); await page.waitForSelector('#newpost');
const np = await page.evaluate(() => ({ options: [...document.querySelectorAll('select[name=community] option')].map((o) => o.textContent), files: document.querySelector('#files').textContent }));
check(np.options.join() === 'clocks' && /sign in/.test(np.files), 'post a part lists the communities and asks for a sign-in to list files');
const status = await (await fetch(`${base}/api/status`)).json();
check(status.ok && status.posts === 2 && status.votes === 4, `/api/status: ${JSON.stringify(status)}`);
check((await fetch(`${base}/api/index`, { method: 'POST' })).status === 400 && (await fetch(`${base}/api/index?repo=x`)).status === 405, 'index needs POST and a repo');
check(errors.length === 0, errors.length ? `no page errors — got:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close(); server.close();
console.log(fails ? `\n✗ ${fails} failing` : '\n✓ parts browser selftest passed');
process.exit(fails ? 1 : 0);
