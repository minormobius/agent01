// typeahead.browser.mjs — the handle box, in a real browser.
//
//   node silk/test/browser/typeahead.browser.mjs
//
// NOT RUN BY CI and not a `*.selftest.mjs`: it needs Playwright and a Chromium,
// neither of which the deploy workflow has. It is committed anyway because the
// thing it checks is a CLAIM THE PAGE MAKES ABOUT ITSELF — that the directory
// lookup is the only request leaving your machine, that it never blocks the
// build, and that a stranger's display name is rendered as text. A claim with no
// runnable check behind it decays into a comment.
//
// It serves silk/ itself and stubs every network call, so it needs nothing
// running and reaches nothing real.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));   // silk/
const PORT = 8907;

const MIME = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
};
const server = createServer(async (q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(ROOT, p));
    r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    r.end(body);
  } catch { r.writeHead(404); r.end('not here'); }
});
await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

// Bare `import('playwright')` ignores NODE_PATH, which is how a globally
// installed Playwright is usually found. Resolve through require() first, which
// does honour it, and fall back to the bare specifier for a local install.
let chromium;
try {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  let mod;
  try { mod = await import(pathToFileURL(req.resolve('playwright')).href); }
  catch { mod = await import('playwright'); }
  // require() resolves the package's CJS entry, whose named exports are not
  // always detected — so take `chromium` from either shape.
  chromium = mod.chromium || mod.default?.chromium;
  if (!chromium) throw new Error('no chromium export');
} catch {
  console.error('needs playwright: npm i -D playwright && npx playwright install chromium');
  console.error('(a global install works too: NODE_PATH=/path/to/node_modules node <this file>)');
  server.close();
  process.exit(2);
}

// ── the stubbed directory ───────────────────────────────────────────────────
//
// Row 2 is the point of the exercise: a display name is an arbitrary string
// written by a stranger, and it must arrive on the page as characters.
const ACTORS = {
  min: [
    { did: 'did:plc:AAA', handle: 'minormobius.bsky.social', displayName: 'Minor Mobius', avatar: 'https://cdn.bsky.app/img/a.jpg' },
    { did: 'did:plc:BBB', handle: 'mindy.example.com', displayName: '<img src=x onerror="window.PWNED=1">' },
    { did: 'did:plc:CCC', handle: 'mint.bsky.social' },
  ],
  mi: [{ did: 'did:plc:SLOW', handle: 'stale-and-slow.bsky.social', displayName: 'Stale' }],
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });

let asked = [];
let resolveCalls = 0;
const plcLookups = [];

await ctx.route('**/xrpc/app.bsky.actor.searchActorsTypeahead*', async (r) => {
  const q = new URL(r.request().url()).searchParams.get('q');
  asked.push(q);
  if (q === 'boom') return r.fulfill({ status: 500, body: 'nope' });
  // The SHORT query answers late, so a naive implementation would show its
  // results after the longer one's had already arrived.
  if (q === 'mi') await new Promise((x) => setTimeout(x, 700));
  return r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ actors: ACTORS[q] || [] }),
  });
});
await ctx.route('**/xrpc/com.atproto.identity.resolveHandle*', (r) => {
  resolveCalls++;
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ did: 'did:plc:VIA_RESOLVE' }) });
});
// Every build is stopped one step past identity, with NO_PDS. The DID the page
// chose is read off the plc.directory URL — that is how "picking a row skips
// resolveHandle" is observed rather than assumed.
await ctx.route('**/plc.directory/**', (r) => {
  const did = r.request().url().split('/').pop();
  plcLookups.push(did);
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: did, service: [] }) });
});
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM8U/+/ngEIAAxkAxHwaLC0AAAAAElFTkSuQmCC', 'base64');
await ctx.route('**/cdn.bsky.app/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

const p = await ctx.newPage();
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e)));

await p.goto(`http://127.0.0.1:${PORT}/word/index.html`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

const rows = () => p.locator('#suggest li');
let pass = 0;
const fails = [];
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name); console.log(`  ✗ ${name}`); }
};

console.log('\nthe list');
await p.click('#handle');
await p.type('#handle', 'min', { delay: 40 });
await p.waitForTimeout(450);
ok('appears once there are two characters', await rows().count() === 3);
ok('shows the display name', (await rows().nth(0).textContent()).includes('Minor Mobius'));
ok('shows the handle', (await rows().nth(0).textContent()).includes('minormobius.bsky.social'));
ok('bolds the part you typed', (await rows().nth(0).locator('b').textContent()) === 'min');
ok('no display name → one line, not the same string twice',
  (await rows().nth(2).locator('.nm').count()) === 0
  && (await rows().nth(2).locator('.hd.solo').textContent()) === 'mint.bsky.social');
ok('a display name full of markup is TEXT',
  await p.evaluate(() => !window.PWNED)
  && (await rows().nth(1).locator('.nm').textContent()).startsWith('<img'));

console.log('\nwhat it does not ask');
await p.fill('#handle', '');
asked = [];
await p.type('#handle', 'm', { delay: 40 });
await p.waitForTimeout(350);
ok('one character asks nothing', await p.isHidden('#suggest') && asked.length === 0);
await p.fill('#handle', '');
asked = [];
await p.type('#handle', 'did:plc:ZZZ', { delay: 10 });
await p.waitForTimeout(400);
ok('a typed DID asks nothing — it is already the answer', asked.length === 0 && await p.isHidden('#suggest'));

console.log('\nthe staleness guard');
await p.fill('#handle', '');
await p.type('#handle', 'mi', { delay: 20 });
await p.waitForTimeout(200);
await p.type('#handle', 'n', { delay: 20 });
await p.waitForTimeout(1100);
ok('a late answer for a shorter prefix does not win',
  (await rows().count()) === 3 && !(await p.textContent('#suggest')).includes('stale'));

console.log('\nthe keyboard');
await p.keyboard.press('ArrowDown');
ok('down highlights the first row', await rows().nth(0).getAttribute('aria-selected') === 'true');
await p.keyboard.press('ArrowDown');
await p.keyboard.press('ArrowDown');
await p.keyboard.press('ArrowDown');
ok('down wraps round', await rows().nth(0).getAttribute('aria-selected') === 'true');
await p.keyboard.press('ArrowUp');
ok('up wraps back', await rows().nth(2).getAttribute('aria-selected') === 'true');
await p.keyboard.press('Escape');
ok('escape closes it', await p.isHidden('#suggest'));

console.log('\npicking a row');
plcLookups.length = 0; resolveCalls = 0;
await p.fill('#handle', '');
await p.type('#handle', 'min', { delay: 40 });
await p.waitForTimeout(450);
await p.keyboard.press('ArrowDown');
await p.keyboard.press('Enter');
await p.waitForTimeout(900);
ok('fills the field with the handle', await p.inputValue('#handle') === 'minormobius.bsky.social');
ok('skips resolveHandle', resolveCalls === 0);
ok('uses the DID the list carried', plcLookups.includes('did:plc:AAA'));
ok('closes the list', await p.isHidden('#suggest'));

plcLookups.length = 0; resolveCalls = 0;
await p.fill('#handle', '');
await p.type('#handle', 'min', { delay: 40 });
await p.waitForTimeout(450);
await rows().nth(2).click();
await p.waitForTimeout(900);
ok('a pointer click picks it too — blur must not eat the event',
  await p.inputValue('#handle') === 'mint.bsky.social' && plcLookups.includes('did:plc:CCC'));

console.log('\nthe escape hatch: it is still an ordinary text box');
plcLookups.length = 0; resolveCalls = 0;
await p.fill('#handle', 'never.indexed.example');
await p.waitForTimeout(450);
await p.keyboard.press('Enter');
await p.waitForTimeout(900);
ok('a handle the directory never offered still builds',
  resolveCalls === 1 && plcLookups.includes('did:plc:VIA_RESOLVE'));

console.log('\na directory that fails is silent');
await p.fill('#handle', '');
// The banner still carries the previous failed BUILD. The point is that a failed
// LOOKUP neither raises one of its own nor disturbs that one.
const errBefore = (await p.isVisible('#err')) ? await p.textContent('#err') : null;
plcLookups.length = 0; resolveCalls = 0;
await p.type('#handle', 'boom', { delay: 30 });
await p.waitForTimeout(600);
ok('a 500 shows no list', await p.isHidden('#suggest'));
ok('a 500 raises no banner of its own',
  errBefore === ((await p.isVisible('#err')) ? await p.textContent('#err') : null));
await p.keyboard.press('Enter');
await p.waitForTimeout(900);
ok('and the build still runs', resolveCalls === 1);

ok('no uncaught page errors anywhere above', pageErrors.length === 0);
if (pageErrors.length) console.log(pageErrors);

await b.close();
server.close();

console.log(fails.length
  ? `\n✗ typeahead browser test FAILED — ${fails.length} of ${pass + fails.length}:\n  ${fails.join('\n  ')}`
  : `\n✓ typeahead browser test passed (${pass} checks)`);
process.exit(fails.length ? 1 : 0);
