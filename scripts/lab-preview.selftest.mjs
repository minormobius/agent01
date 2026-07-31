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
const sandboxes = [...page.matchAll(/setAttribute\('sandbox',\s*'([^']*)'/g)].map((m) => m[1]);

// EXACTLY ONE CALL SITE, and this assertion is the point of makeFrame(). The
// security property is an ABSENCE — a token that is not there — and an absence
// is precisely what goes missing when someone adds a second way to build a
// frame. The stage and the wall both come through one function; a second
// setAttribute('sandbox', …) anywhere in this file means a second thing to
// audit, and the one that gets forgotten will be the new one.
if (sandboxes.length === 1) ok('exactly one place builds a frame');
else if (sandboxes.length === 0) bad('index.html sets no sandbox attribute anywhere');
else bad(`${sandboxes.length} separate sandbox call sites — they must go through makeFrame()`);

for (const sandbox of sandboxes) {
  if (/allow-same-origin/.test(sandbox)) {
    bad(`a frame allows same-origin: "${sandbox}"\n` +
        '      Tenants share this origin. With allow-same-origin a framed tenant can\n' +
        '      reach window.parent and this page. If a site renders empty in the\n' +
        '      window, that is the opaque origin working — link to it instead.');
  } else ok(`sandbox has no allow-same-origin: "${sandbox}"`);
}

// Ten strangers' sites at once is not the moment to leave camera, microphone,
// geolocation or autoplay on their defaults.
if (/setAttribute\('allow',\s*''\)/.test(page)) ok("allow='' denies every permission-policy feature");
else bad("frames do not set allow='' — a wall of sites could ask for camera, mic or autoplay");

const CSP = (readFileSync(join(ROOT, '_headers'), 'utf8')
  .split('\n').find((l) => /^\s*Content-Security-Policy:/i.test(l)) || '')
  .replace(/^\s*Content-Security-Policy:\s*/i, '').trim();
for (const d of ['frame-src', 'frame-ancestors']) {
  const v = (CSP.match(new RegExp(`${d} ([^;]*)`)) || [])[1]?.trim();
  // `\b` cannot match after a quote — `'self'` ends on a non-word character, so
  // the boundary never exists and this rejected a correct policy on first run.
  if (/^'self'(\s|$)/.test(v || '')) ok(`${d} starts 'self' — the factory may frame its own tenants, nobody else may`);
  else bad(`${d} is ${v ?? '(absent)'}, expected to start with 'self' — the window will not load`);
}

// 'SELF' IS NOT ENOUGH ON ITS OWN, AND THIS IS THE BUG THAT TAUGHT US.
//
// A frame sandboxed without allow-same-origin has an OPAQUE origin, and how a
// browser resolves `'self'` for such a document is not settled between engines:
// some match the document's URL (scheme/host/port), some match the opaque
// origin, which matches nothing. Where the second reading applies, every
// same-origin stylesheet, script and image in the preview is refused — the
// tenant renders as unstyled HTML, white with a serif font, which is exactly
// what was reported and exactly what blocking /_kit/tokens.css reproduces.
//
// A HOST SOURCE has no such ambiguity: it is matched against the request URL
// and never consults the document's origin. So every directive that names
// 'self' must also name the hosts outright. Same policy, no interpretation.
const NEEDED = ['https://minomobi.com', 'https://lab.minomobi.com'];
for (const directive of CSP.split(';').map((d) => d.trim()).filter((d) => /'self'/.test(d))) {
  const name = directive.split(/\s+/)[0];
  const missing = NEEDED.filter((h) => !directive.includes(h));
  if (!missing.length) ok(`${name} names its hosts as well as 'self'`);
  else bad(`${name} relies on 'self' alone — add ${missing.join(' ')}.\n` +
           '      In a sandboxed opaque origin \'self\' can match nothing, and the\n' +
           '      preview renders unstyled. A host source is matched against the URL.');
}

// --- the browser passes ----------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const STAGE_FIRST = `<script>
// The wall is the DEFAULT now, so a stage test has to opt out the way a
// returning visitor would — by writing the same key exit writes. Injected at
// </main>, which runs before the page script reads it.
try { localStorage.setItem('minomobi.wall', '0'); } catch (e) {}
</script>`;

// Clicks the LAST card's preview button. Last, not first, because the stage
// opens on a random site — starting from the far end makes an accidental match
// unlikely rather than one-in-forty-six.
const PIN_PROBE = STAGE_FIRST + `<script>
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

// PASS 2 — no reduced-motion override: autoplay must be ON, and advancing must
// actually change the site.
//
// COUNTING LOADED SITES WAS THE FIRST VERSION OF THIS AND IT WAS FLAKY. Under
// --virtual-time-budget the clock only advances while the page is idle, but the
// frame navigates on the real network — so "did two sites load in 12s?" came
// back 2 most runs and 1 sometimes. A gate that fails at random teaches people
// to re-run it, which is the same disease as a gate that never fires. Both
// halves are deterministic instead: the autoplay flag is set synchronously at
// init, and `next` is a click.
const ROLL_PROBE = STAGE_FIRST + `<script>
(function () {
  var n = 0;
  var t = setInterval(function () {
    if (++n > 80) { clearInterval(t); return; }
    if (!document.querySelectorAll('.card').length) return;
    clearInterval(t);
    var say = function (id, text) {
      var d = document.createElement('div'); d.id = id; d.textContent = text;
      document.documentElement.appendChild(d);
    };
    say('probe-autoplay', document.getElementById('stage').dataset.cycling);
    // Before and after, read synchronously: show() updates the label in the
    // same tick as the click, so this cannot race anything.
    var name = document.getElementById('stage-name');
    say('probe-before', name.textContent);
    document.getElementById('stage-next').click();
    say('probe-after', name.textContent);
  }, 50);
})();
</script>`;

const rolling = await runPass({ probe: ROLL_PROBE, flags: [], budget: 12000 });

const autoplay = (rolling.out.match(/<div id="probe-autoplay">([^<]*)</) || [])[1];
if (autoplay === 'true') ok('the window starts rotating on its own');
else bad(`autoplay is off without prefers-reduced-motion (data-cycling="${autoplay}")`);

// Read the LABEL, not the network. Clicking `next` sets frame.src, but Chrome
// can reach its virtual-time budget before that request leaves — so counting
// requests failed about one run in three on a page that advanced correctly.
// show() updates the label in the same tick as the click; that is the fact.
const before = (rolling.out.match(/<div id="probe-before">([^<]*)</) || [])[1];
const after = (rolling.out.match(/<div id="probe-after">([^<]*)</) || [])[1];
if (before && after && before !== after) ok(`advancing moved the window: ${before} → ${after}`);
else bad(`advancing did not change the site (${before ?? '?'} → ${after ?? '?'})`);

// PASS 3 — THE WALL. Reduced motion again for determinism: it makes each cell
// tune instantly instead of running the snow transition first, so the tenant
// each screen opens on is requested inside the run rather than 240ms later on a
// clock that virtual time is already racing.
//
// The probe opens the wall, records what it built, closes it, and records again
// — teardown is half the feature. Ten iframes left running behind a hidden
// panel is exactly the leak this toggle would otherwise be.
const WALL_PROBE = `<script>
(function () {
  var say = function (id, text) {
    var d = document.createElement('div'); d.id = id; d.textContent = text;
    document.documentElement.appendChild(d);
  };
  // No opt-out prelude: the wall is the default, so it should open by itself.
  // WAIT FOR THE STAGGER. Panels are given a src 180ms apart so ten navigations
  // do not race for the same connections, which means a synchronous read right
  // after the wall builds sees ten empty frames. Poll until they are all tuned.
  var n = 0;
  var t = setInterval(function () {
    var cells = document.querySelectorAll('.cell');
    var tuned = document.querySelectorAll('.cell iframe[src]');
    if (++n > 200) { clearInterval(t); say('probe-wall-timeout', 'gave up with ' + tuned.length + '/' + cells.length); return; }
    if (!cells.length || tuned.length < cells.length) return;
    clearInterval(t);
    say('probe-wall-cells', String(cells.length));
    say('probe-wall-hidden', String(document.getElementById('wall').hidden));
    var names = [];
    document.querySelectorAll('.cell-label').forEach(function (l) { names.push(l.textContent); });
    say('probe-wall-names', names.join(' '));
    say('probe-wall-frames', String(tuned.length));
    document.getElementById('wall-off').click();
    say('probe-wall-after', String(document.querySelectorAll('.cell').length));
    say('probe-wall-hidden-after', String(document.getElementById('wall').hidden));
  }, 50);
})();
</script>`;

const wallRun = await runPass({
  probe: WALL_PROBE, flags: ['--force-prefers-reduced-motion', '--window-size=1280,900'], budget: 20000,
});
const probe = (id) => (wallRun.out.match(new RegExp(`<div id="${id}">([^<]*)<`)) || [])[1];

const cellCount = Number(probe('probe-wall-cells'));
if (cellCount >= 6 && cellCount <= 12) ok(`the wall built ${cellCount} screens for a 1280x900 viewport`);
else bad(`the wall built ${cellCount} screens — expected 6 to 12`);

if (probe('probe-wall-hidden') === 'false') ok('the wall opened by itself — it is the default');
else bad('the wall stayed hidden after being switched on');

if (Number(probe('probe-wall-frames')) === cellCount) ok('every screen got a source');
else bad(`${probe('probe-wall-frames')} of ${cellCount} screens have a src`);

// pickFor() excludes what the other screens are already showing. A wall with
// the same site on two panels reads as a bug, and with 46 tenants there is no
// reason for it.
const names = (probe('probe-wall-names') || '').split(' ').filter(Boolean);
if (names.length && new Set(names).size === names.length) ok(`all ${names.length} screens on different sites`);
else bad(`duplicate sites on the wall: ${names.join(' ')}`);

// Distinct requests should be at least one per screen — proof the frames really
// navigated rather than merely being given an attribute.
if (wallRun.tenants.length >= cellCount) ok(`${wallRun.tenants.length} tenants actually loaded`);
else bad(`only ${wallRun.tenants.length} tenants loaded for ${cellCount} screens`);

if (probe('probe-wall-after') === '0') ok('exit tore every screen down');
else bad(`${probe('probe-wall-after')} cells survived exit — ten hidden iframes keep running`);

if (probe('probe-wall-hidden-after') === 'true') ok('exit gave the viewport back');
else bad('the wall is still covering the page after exit');

console.log(fail ? `✗ lab-preview: ${fail} failed` : '✓ lab-preview — stage and wall both load, sandboxed, and tear down');
process.exit(fail ? 1 : 0);
