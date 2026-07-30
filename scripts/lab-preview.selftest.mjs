#!/usr/bin/env node
// lab-preview.selftest.mjs — the front page's stage, in a real browser, under
// the real CSP.
//
//   node scripts/lab-preview.selftest.mjs
//
// THREE THINGS, and the first two pull against each other:
//
//   1. The frame LOADS. lab/www/_headers has to allow it from both ends —
//      frame-src for the embedder, frame-ancestors for the tenant. Set either
//      back to 'none' and the window is silently blank.
//   2. The frame stays SANDBOXED WITHOUT allow-same-origin. Tenants are
//      subdirectories, so a framed tenant is same-origin with the front page
//      and could reach straight into it. That one omitted token is the whole
//      security property.
//   3. The stage behaves: it rotates on its own, it holds still for
//      prefers-reduced-motion, and `preview` on a card pins it.
//
// The failure mode (2) exists for is the tempting one: a tenant that uses
// localStorage renders empty in an opaque origin, and the one-word fix that
// makes it render hands every agent-written site the run of the listing page.
// A comment does not survive that pressure; a failing test does.
//
// Chrome, served from localhost, same technique as lab-smoke.mjs: this process
// is the server AND drives the browser, so spawn, never spawnSync.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.argv[2] || 'lab/www';
let fail = 0;
const bad = (m) => { fail++; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// --- static assertions, before spending a browser on them ------------------
const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
const sandbox = (page.match(/setAttribute\('sandbox',\s*'([^']*)'/) || [])[1];
if (!sandbox) bad('index.html sets no sandbox attribute on the stage frame');
else if (/allow-same-origin/.test(sandbox)) {
  bad(`the stage frame allows same-origin: "${sandbox}"\n` +
      '      Tenants share this origin. With allow-same-origin a framed tenant can\n' +
      '      reach window.parent and this page. If a site renders empty in the\n' +
      '      window, that is the opaque origin working — link to it instead.');
} else ok(`sandbox has no allow-same-origin: "${sandbox}"`);

const CSP = (readFileSync(join(ROOT, '_headers'), 'utf8')
  .split('\n').find((l) => /^\s*Content-Security-Policy:/i.test(l)) || '')
  .replace(/^\s*Content-Security-Policy:\s*/i, '').trim();
for (const d of ['frame-src', 'frame-ancestors']) {
  const v = (CSP.match(new RegExp(`${d} ([^;]*)`)) || [])[1]?.trim();
  if (v === "'self'") ok(`${d} is 'self' — the factory may frame its own tenants, nobody else may`);
  else bad(`${d} is ${v ?? '(absent)'}, expected 'self' — the window will not load`);
}

// --- the browser passes ----------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Clicks the LAST card's preview button. Last, not first, because the stage
// opens on a random site — starting from the far end makes an accidental match
// unlikely rather than one-in-forty-six.
const PIN_PROBE = `<script>
(function () {
  var n = 0;
  var t = setInterval(function () {
    if (++n > 80) { clearInterval(t); return; }
    var cards = document.querySelectorAll('.card');
    if (!cards.length) return;
    clearInterval(t);
    var last = cards[cards.length - 1];
    last.querySelector('.btn[aria-pressed]').click();
  }, 50);
})();
</script>`;

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(pw)) {
    for (const d of readdirSync(pw)) {
      const p = join(pw, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('  ! no browser found — static checks only');
  process.exit(fail ? 1 : 0);
}

const TENANT = /^\/[a-z0-9][a-z0-9-]*\/$/;

function runPass({ probe, flags, budget }) {
  return new Promise((resolve) => {
    const served = [];
    const server = createServer((req, res) => {
      served.push(req.url);
      const url = new URL(req.url, 'http://x');
      let p = join(ROOT, decodeURIComponent(url.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { res.writeHead(404, { 'Content-Security-Policy': CSP }); res.end('nf'); return; }
      let body = readFileSync(p);
      if (probe && (url.pathname === '/' || url.pathname === '/index.html')) {
        body = Buffer.from(body.toString('utf8').replace('</main>', '</main>' + probe));
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream',
                           'Content-Security-Policy': CSP });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const p = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-gpu',
                               ...flags, `--virtual-time-budget=${budget}`, '--dump-dom',
                               `http://127.0.0.1:${port}/`],
                      { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => {
        server.close();
        const tenants = [...new Set(served.filter((u) => TENANT.test(u)))];
        resolve({ out, served, tenants });
      });
    });
  });
}

// Read the attribute off the STAGE ELEMENT, not the first match in the file.
// The stylesheet contains the literal `.stage[data-pinned=""]`, so a document-
// wide search finds the CSS selector and reports an empty pin on a page that
// pinned correctly — which it did, once, and looked exactly like a real bug.
const attr = (dom, name) => {
  const tag = (dom.match(/<section[^>]*id="stage"[^>]*>/) || [])[0] || '';
  return (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
};

// PASS 1 — reduced motion. Two jobs: it is the accessible behaviour and it is
// the only way to test pinning deterministically, because under
// --virtual-time-budget the 9s dwell fires almost immediately and a rotating
// stage would load every tenant during the run.
const pinned = await runPass({
  probe: PIN_PROBE, flags: ['--force-prefers-reduced-motion'], budget: 12000,
});

const cards = (pinned.out.match(/class="card[ "]/g) || []).length;
if (cards > 0) ok(`the listing rendered ${cards} cards`);
else bad('the listing rendered no cards — tenants.json missing or unreadable?');

if (!pinned.tenants.length) {
  bad('the stage never requested a tenant — the frame was blocked, or it never started');
} else {
  ok(`the sandboxed frame fetched ${pinned.tenants[0]} — the CSP permits it`);
}

// THE ASSERTIONS ARE SERVER-SIDE AND ATTRIBUTE-SIDE, never in-page probing of
// the frame. Two in-page probes were written first and both called a working
// frame broken: cross-origin contentDocument returns null rather than throwing,
// so polling it cannot tell "opaque" from "blocked"; and setTimeout runs on
// Chrome's virtual clock while the frame navigates on the real network, so any
// in-page deadline fires first. A request the server received, and an attribute
// left in the final DOM, have neither problem.
const pinnedSlug = attr(pinned.out, 'data-pinned');
const pinnedCard = (pinned.out.match(/class="card pinned"[^>]*data-name="([^"]*)"/) ||
                    pinned.out.match(/data-name="([^"]*)"[^>]*class="card pinned"/) || [])[1];

if (pinnedSlug) ok(`preview pinned the stage to "${pinnedSlug}"`);
else bad('clicking preview did not pin the stage (data-pinned is empty)');

if (pinnedSlug && pinnedCard === pinnedSlug) ok('the pinned card and the stage agree');
else if (pinnedSlug) bad(`stage says "${pinnedSlug}" but the pinned card is "${pinnedCard}"`);

if (pinnedSlug && pinned.tenants.includes(`/${pinnedSlug}/`)) ok(`the stage actually loaded /${pinnedSlug}/`);
else if (pinnedSlug) bad(`/${pinnedSlug}/ was never requested — pinning updated the label but not the frame`);

if (attr(pinned.out, 'data-cycling') === 'false') ok('pinning stopped the rotation');
else bad('the stage is still cycling after a pin');

// Under reduced motion the stage must hold still. More than one tenant fetched
// means it rotated anyway — and the virtual clock would have made that obvious.
if (pinned.tenants.length <= 2) ok(`held still for prefers-reduced-motion (${pinned.tenants.length} site${pinned.tenants.length === 1 ? '' : 's'} loaded: opening + the pin)`);
else bad(`rotated under prefers-reduced-motion — loaded ${pinned.tenants.length} sites: ${pinned.tenants.join(' ')}`);

// PASS 2 — no reduced-motion override, no probe: it must rotate unprompted.
const rolling = await runPass({ probe: null, flags: [], budget: 12000 });
if (rolling.tenants.length >= 2) ok(`rotates on its own — ${rolling.tenants.length} sites took the window`);
else bad(`the stage did not rotate: ${rolling.tenants.length} site(s) loaded`);

console.log(fail ? `✗ lab-preview: ${fail} failed` : '✓ lab-preview — stage loads, rotates, pins, stays opaque');
process.exit(fail ? 1 : 0);
