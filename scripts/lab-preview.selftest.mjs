#!/usr/bin/env node
// lab-preview.selftest.mjs — the front page's tenant preview, in a real browser,
// under the real CSP.
//
//   node scripts/lab-preview.selftest.mjs
//
// TWO THINGS THAT MUST BOTH HOLD, and they pull against each other:
//
//   1. The frame LOADS. lab/www/_headers has to allow it from both ends —
//      frame-src for the embedder, frame-ancestors for the tenant. Set either
//      back to 'none' and every preview is silently blank.
//   2. The frame is SANDBOXED WITHOUT allow-same-origin. Tenants are
//      subdirectories, so a framed tenant is same-origin with the front page and
//      could reach straight into it. That one omitted token is the whole
//      security property.
//
// The failure mode this exists for is the tempting one: a tenant that stores
// something renders empty in the preview (opaque origins have no storage), and
// the obvious fix is to add allow-same-origin. That would make the previews look
// better and hand every agent-written site the run of the listing page. This
// test fails if anyone does it.
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

// --- static assertions, before spending a browser on it --------------------
const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
const sandbox = (page.match(/setAttribute\('sandbox',\s*'([^']*)'/) || [])[1];
if (!sandbox) bad('index.html sets no sandbox attribute on the preview frame');
else if (/allow-same-origin/.test(sandbox)) {
  bad(`the preview frame allows same-origin: "${sandbox}"\n` +
      '      Tenants share this origin. With allow-same-origin a framed tenant can\n' +
      '      reach window.parent and this page. If a preview renders empty, that is\n' +
      '      the opaque origin working — link to the full site instead.');
} else console.log(`  ✓ sandbox has no allow-same-origin: "${sandbox}"`);

const CSP = (readFileSync(join(ROOT, '_headers'), 'utf8')
  .split('\n').find((l) => /^\s*Content-Security-Policy:/i.test(l)) || '')
  .replace(/^\s*Content-Security-Policy:\s*/i, '').trim();
for (const d of ['frame-src', 'frame-ancestors']) {
  const v = (CSP.match(new RegExp(`${d} ([^;]*)`)) || [])[1]?.trim();
  if (v === "'self'") console.log(`  ✓ ${d} is 'self' — the factory may frame its own tenants, nobody else may`);
  else bad(`${d} is ${v ?? '(absent)'}, expected 'self' — previews will not load`);
}

// --- and now actually load it ---------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Clicks the first preview button. The verdict is not read from the page —
// see below — this only has to make the click happen.
const PROBE = `<script>
(function () {
  var n = 0;
  var t = setInterval(function () {
    if (++n > 80) { clearInterval(t); return; }
    var b = document.querySelector('.card .btn[aria-pressed]');
    if (b) { clearInterval(t); b.click(); }
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

const served = [];
const server = createServer((req, res) => {
  served.push(req.url);
  const url = new URL(req.url, 'http://x');
  let p = join(ROOT, decodeURIComponent(url.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404, { 'Content-Security-Policy': CSP }); res.end('nf'); return; }
  let body = readFileSync(p);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    body = Buffer.from(body.toString('utf8').replace('</main>', '</main>' + PROBE));
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream',
                       'Content-Security-Policy': CSP });
  res.end(body);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const p = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-gpu',
                           '--virtual-time-budget=15000', '--dump-dom', `http://127.0.0.1:${port}/`],
                  { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.on('close', () => {
    server.close();

    // THE ASSERTION IS SERVER-SIDE, and that is not laziness — two in-page
    // probes were written first and both reported a working frame as broken.
    // Cross-origin contentDocument returns null rather than throwing, so
    // polling it cannot tell "opaque" from "blocked"; and setTimeout runs on
    // Chrome's virtual clock while the frame navigates on the real network, so
    // any in-page deadline fires first. The request the server receives has
    // neither problem: nothing but the frame ever asks for a tenant path.
    // `class="card open"` on the previewed one, so match the prefix not the exact string.
    const cards = (out.match(/class="card[ "]/g) || []).length;
    if (cards > 0) console.log(`  ✓ the listing rendered ${cards} cards`);
    else bad('the listing rendered no cards — tenants.json missing or unreadable?');

    const framed = served.find((u) => /^\/[a-z0-9][a-z0-9-]*\/$/.test(u));
    if (framed) console.log(`  ✓ the sandboxed frame fetched ${framed} — the CSP permits it`);
    else bad('no tenant path was ever requested — the frame was blocked, or no card was clickable');

    console.log(fail ? `✗ lab-preview: ${fail} failed` : '✓ lab-preview — preview loads, sandbox stays opaque');
    process.exit(fail ? 1 : 0);
  });
});
