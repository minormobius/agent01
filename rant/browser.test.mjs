#!/usr/bin/env node
/**
 * rant — browser test.
 *
 * `curl` cannot see the bug that mattered most here. Every earlier "verified"
 * pass was curl-shaped, and all of them were consistent with the entire browser
 * module never executing:
 *
 *   - `wasm-bindgen --target web` emits glue whose DEFAULT EXPORT is the init
 *     function. `<script type="module" src=".../rant_view.js">` evaluates the
 *     module and never instantiates the wasm, so `#[wasm_bindgen(start)]` never
 *     ran. 200 OK, correct MIME, nothing worked. Hence `/boot.js`.
 *   - `default-src 'self'` forbids `WebAssembly.instantiateStreaming`. Even with
 *     the bootstrap, the module refused to compile until the CSP gained
 *     `script-src 'wasm-unsafe-eval'`.
 *
 * Both are invisible to anything that does not run JavaScript. So this exists.
 *
 * Usage:  npm i playwright && node browser.test.mjs [base-url]
 *
 * CORE checks are deterministic and gate the deploy. ADVISORY checks depend on
 * Bluesky's AppView being reachable and only warn — a third party being slow
 * should not fail a deploy, but it should be visible.
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8792';
let fails = 0;
let warns = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !extra ? '' : ` — ${extra}`}`);
  if (!cond) fails++;
};
/** Depends on a third party. Warn, do not fail. */
const adv = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '!'} ${label}${cond || !extra ? '' : ` — ${extra}`}${cond ? '' : '  (advisory)'}`);
  if (!cond) warns++;
};

// PLAYWRIGHT_CHROMIUM lets a sandbox point at a pre-installed browser; a CI
// runner that ran `playwright install chromium` needs neither.
const launch = { args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_CHROMIUM) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM;

// Some sandboxes have no direct egress and reach the internet only through an
// agent proxy whose CA is already in the browser's NSS store. Honour it when
// present — without this the test cannot reach production at all — and bypass it
// for loopback so a local `wrangler dev` still works. CI has no proxy set, so
// this is a no-op there.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxyServer) {
  launch.proxy = { server: proxyServer, bypass: '127.0.0.1,localhost,::1' };
  console.log(`  (via proxy ${proxyServer})`);
}
const browser = await chromium.launch(launch);
const page = await browser.newPage();

const consoleErrors = [];
const cspViolations = [];
const requests = [];
// Three kinds of console noise are expected. Classifying them precisely is the
// difference between a gate and an alarm nobody reads.
//
// 1. THE ANALYTICS BEACON. Cloudflare injects
//    `static.cloudflareinsights.com/beacon.min.js` into HTML at the edge, AFTER
//    the Worker has run. Our CSP blocks it, and that is the intended outcome on a
//    site whose pitch is that it stores nothing about you — so this violation is
//    the policy working, not a defect. Reported separately below rather than
//    swallowed. (To stop the injection itself, turn Web Analytics off for the
//    zone; a Worker cannot undo something added downstream of it.)
// 2. A SIGNED-OUT 401 from the auth worker's /api/me — the shared client checking
//    for an existing session and correctly finding none.
// 3. AVATAR IMAGE MISSES in a sandbox with no direct egress. The dialog degrades
//    to a placeholder circle by design.
const BEACON = /static\.cloudflareinsights\.com/;
const isExpected = (t) =>
  BEACON.test(t) ||
  /status of 401/.test(t) ||
  /ERR_CONNECTION_RESET|ERR_(NAME_NOT_RESOLVED|PROXY|TUNNEL)/.test(t) ||
  /cdn\.bsky\.app/.test(t);

let beaconBlocked = false;
page.on('console', (m) => {
  const t = m.text();
  if (BEACON.test(t) && /Content Security Policy|blocked/i.test(t)) beaconBlocked = true;
  if (m.type() === 'error' && !isExpected(t)) consoleErrors.push(t);
  if (/Content Security Policy|Refused to/i.test(t) && !isExpected(t)) cspViolations.push(t);
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('request', (r) => requests.push(r.url()));

console.log(`\nsign-in, in a browser (${BASE})`);

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

// 1. The wasm module has to actually boot, or nothing below means anything.
ok('the wasm module loaded', requests.some((u) => u.includes('rant_view_bg.wasm')));
ok('the shared OAuth client resolved', requests.some((u) => u.includes('/packages/oauth-client/auth.js')),
  requests.filter((u) => u.includes('auth.js')).join(', ') || 'never requested');
ok('no page errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));

// 2. The control must be a button that opens something — not a link.
const btn = page.locator('[data-signin]').first();
ok('a sign-in control exists', await btn.count() > 0);
ok('…and it is a <button>, not a link',
  (await btn.evaluate((e) => e.tagName)) === 'BUTTON');
ok('…labelled for ATProto', /atproto/i.test(await btn.textContent()));

await btn.click();
await page.waitForSelector('.signin-ov', { timeout: 4000 }).catch(() => {});
ok('clicking it opens the dialog', await page.locator('.signin-ov').count() > 0);
ok('the handle field is focused', await page.evaluate(() =>
  document.activeElement?.classList.contains('signin-input')));

// 3. Typeahead. Real request to the public AppView — this is what CSP was eating.
await page.locator('.signin-input').fill('bsky');
await page.waitForSelector('.signin-results.show .signin-item', { timeout: 8000 }).catch(() => {});
const suggestions = await page.locator('.signin-item').count();
adv(`typeahead returned suggestions (${suggestions})`, suggestions > 0);
// Same-origin now: the Worker proxies the AppView, so connect-src stays 'self'
// and the visitor's IP never reaches Bluesky.
ok('the typeahead went through our own origin',
  requests.some((u) => u.includes('/api/typeahead')),
  requests.filter((u) => /typeahead/i.test(u)).join(', ') || 'no typeahead request at all');
ok('…and NOT straight to the AppView from the browser',
  !requests.some((u) => u.includes('public.api.bsky.app')));
ok('no CSP violations from our own assets', cspViolations.length === 0,
  cspViolations.slice(0, 3).join(' | '));
// Surfaced, not hidden: this one is deliberate.
console.log(`  ${beaconBlocked ? 'i' : '·'} the Cloudflare analytics beacon ${
  beaconBlocked ? 'was blocked by CSP (intended — this site tracks nobody)' : 'was not injected'
}`);

if (suggestions > 0) {
  const first = await page.locator('.signin-item').first().getAttribute('data-handle');
  adv('each suggestion carries a handle', !!first, String(first));

  // 4. Keyboard: ArrowDown highlights, and clicking fills the field.
  await page.locator('.signin-input').press('ArrowDown');
  adv('ArrowDown highlights a suggestion', await page.locator('.signin-item.on').count() === 1);
  await page.locator('.signin-item').first().click();
  adv('clicking a suggestion fills the field',
    (await page.locator('.signin-input').inputValue()) === first,
    await page.locator('.signin-input').inputValue());
}

// 5. Submitting must POST to the auth worker and be redirected onward. We stub
//    the auth worker so this test does not start a real OAuth flow against
//    somebody's PDS — the contract under test is "does the click reach
//    /oauth/start with the right body", not the whole handshake.
let posted = null;
await page.route('**/oauth/start', async (route) => {
  posted = route.request().postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authUrl: `${BASE}/?__stubbed_oauth=1` }),
  });
});
await page.locator('.signin-input').fill('alice.bsky.social');
await page.locator('.signin-go').click();
await page.waitForURL(/__stubbed_oauth/, { timeout: 6000 }).catch(() => {});

ok('submitting POSTs to the auth worker', !!posted, 'never called /oauth/start');
if (posted) {
  ok('…with the handle', posted.handle === 'alice.bsky.social', JSON.stringify(posted.handle));
  ok('…with this origin', posted.origin === new URL(BASE).origin, posted.origin);
  ok('…with a returnTo', !!posted.returnTo, posted.returnTo);
  ok('…and returnTo has no fragment', !String(posted.returnTo).includes('#'), posted.returnTo);
  const toks = String(posted.scope || '').split(' ');
  ok('…with the narrow scope (5 tokens)', toks.length === 5, posted.scope);
  ok('…which is not transition:generic', !toks.includes('transition:generic'));
  ok('…covering all four collections',
    ['publication', 'document', 'graph.subscription', 'graph.recommend']
      .every((c) => toks.includes(`repo:site.standard.${c}`)), posted.scope);
}
ok('…and the browser was redirected onward', page.url().includes('__stubbed_oauth'), page.url());

// 6. The other entry points open the same dialog.
for (const path of ['/mine/', '/setup/', '/compose/']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-signin]').first();
  const n = await trigger.count();
  if (n === 0) { ok(`${path} offers sign-in`, false, 'no [data-signin]'); continue; }
  await trigger.click();
  const opened = await page.waitForSelector('.signin-ov', { timeout: 4000 }).then(() => true).catch(() => false);
  ok(`${path} opens the same dialog`, opened);
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('[data-signin]').first().click();
await page.waitForSelector('.signin-ov');
await page.locator('.signin-input').fill('bsky');
await page.waitForSelector('.signin-results.show .signin-item', { timeout: 8000 }).catch(() => {});


await browser.close();
const suffix = warns ? ` (${warns} advisory warning${warns === 1 ? '' : 's'})` : '';
console.log(fails === 0 ? `\n✓ browser test passed${suffix}` : `\n✗ ${fails} core failure(s)${suffix}`);
process.exit(fails === 0 ? 0 : 1);
