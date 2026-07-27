#!/usr/bin/env node
// lab-smoke.mjs — actually load the page and see whether it works.
//
//   node scripts/lab-smoke.mjs lab/www/<name>
//
// THE PROBLEM THIS SOLVES. The build agent has no Bash, no WebFetch and no
// WebSearch — it cannot make a single request, so it cannot check that the API
// it just coded against returns what it assumed, or that its page runs at all.
// It writes `profile.displayName` from memory and finds out never. A page that
// throws on load looks exactly like a page that works, right up until a stranger
// opens it.
//
// The isolation is deliberate and worth keeping: WebFetch would be an
// unmonitored exfiltration channel, and the secret-scan gate only inspects
// published files (docs/LAB-FACTORY.md §11.6 row 2). So the answer is not to
// give the agent the network — it is for the HARNESS to do the checking and
// hand the results back. lab-build.yml feeds this report into a second agent
// pass, which is how an offline agent gets to fix a bug it could not have seen.
//
// HOW IT WORKS, with no browser automation library:
//   1. Serve the tenant directory from localhost with the PRODUCTION CSP, so a
//      request the real site would have blocked is blocked here too.
//   2. Inject a collector at the top of index.html that traps window.onerror,
//      unhandled rejections, CSP violations and failed fetches, and beacons them
//      back to this server.
//   3. Drive the Chrome already on the runner at that URL, headless.
//   4. Report what came back.
//
// The injected collector is why this needs no CDP client: the page reports on
// itself. It is stripped from what gets published — it exists only on the
// localhost copy, never in the file on disk.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'index.html'))) {
  console.error(`usage: node scripts/lab-smoke.mjs <tenant-dir>   (needs index.html)`);
  process.exit(2);
}
const ci = Boolean(process.env.GITHUB_ACTIONS);
const err = (m) => console.log(ci ? `::error::${m}` : `  ✘ ${m}`);
const warn = (m) => console.log(ci ? `::warning::${m}` : `  ! ${m}`);

// Kept byte-identical to lab/www/_headers on purpose: a smoke test under a
// laxer policy than production is worse than none, because it certifies pages
// the real site will break.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.bsky.app",
  "font-src 'self'",
  "connect-src 'self' https://public.api.bsky.app https://plc.directory",
  "media-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

// REPORTS THROUGH THE DOM, NOT THE NETWORK. The first version beaconed failures
// back to the local server and caught NOTHING — a page with four deliberate
// bugs came back clean, because --dump-dom exits the moment the load settles and
// sendBeacon is fire-and-forget: the process was gone before the packets left.
// It was a control that looked present, which is the failure this whole file
// exists to prevent, committed inside the file itself.
//
// Writing into the DOM has no flush timing to lose. --dump-dom prints the DOM
// after scripts have run, so whatever the collector appended comes back with it.
const COLLECTOR = `<script>
(function(){
  var n = 0;
  function send(kind, msg){
    if (n++ > 40) return;
    try {
      var d = document.createElement('div');
      d.setAttribute('data-labsmoke', kind);
      d.textContent = String(msg).slice(0, 400);
      d.style.display = 'none';
      (document.body || document.documentElement).appendChild(d);
    } catch(e){}
  }
  window.addEventListener('error', function(e){
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      send('resource', 'failed to load ' + (e.target.src || e.target.href));
    } else {
      send('error', (e.message || 'error') + ' @' + (e.filename||'') + ':' + (e.lineno||0));
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    send('rejection', (e.reason && (e.reason.message || e.reason.stack)) || e.reason);
  });
  document.addEventListener('securitypolicyviolation', function(e){
    send('csp', 'blocked ' + e.blockedURI + ' (' + e.violatedDirective + ')');
  });
  var f = window.fetch;
  window.fetch = function(){
    var url = String((arguments[0] && (arguments[0].url || arguments[0])) || '');
    return f.apply(this, arguments).then(function(r){
      if (!r.ok) send('http', r.status + ' from ' + url);
      return r;
    }, function(e){
      send('network', String((e && e.message) || e) + ' — ' + url);
      throw e;
    });
  };
})();
</script>`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const found = [];
const root = resolve(dir);
// The shared kit lives one level up in production (../_kit/). Serve it from the
// real source so a page linking it is tested against the kit it will actually
// get, rather than 404ing here and passing anyway.
const kitSrc = resolve('lab/_kit');

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = path.startsWith('/_kit/') ? join(kitSrc, path.slice(6)) : join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Security-Policy': CSP }); res.end('not found'); return;
  }
  let bytes = readFileSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  if (extname(file).toLowerCase() === '.html') {
    bytes = Buffer.from(COLLECTOR + bytes.toString('utf8'), 'utf8');
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': CSP });
  res.end(bytes);
});

/** Find a browser without installing one. GitHub runners ship google-chrome;
 *  this sandbox has only Playwright's managed build, and CI should not be the
 *  only place this can run. */
function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
    try {
      const p = execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(pw)) {
      const p = join(pw, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch { /* no playwright cache */ }
  return '';
}
const chrome = findChrome();

if (!chrome) {
  warn('no Chrome on this machine — skipping the smoke test');
  process.exit(0);
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const profile = mkdtempSync(join(tmpdir(), 'labsmoke-'));

// TRY MORE THAN ONE HEADLESS MODE, because the flag that drives this is the one
// Chrome keeps changing. `--headless=new` + `--dump-dom` returned an EMPTY
// STDOUT and exit 0 on a GitHub runner — the mode is accepted, the page is
// never dumped. The old headless is a separate implementation with its own
// support for --dump-dom, and bare `--headless` is whatever this build defaults
// to. Try each and take the first that actually yields a document.
//
// The comment that used to sit below this said "It works on a GitHub runner; it
// does not work in the dev container." Nobody had run it on a GitHub runner. It
// was an assumption written in the voice of a measurement, and it is why a
// broken smoke test looked like a sandbox quirk for a day.
const MODES = ['--headless=new', '--headless=old', '--headless'];
const attempts = [];
let run = null;
for (const mode of MODES) {
  run = spawnSync(chrome, [
    mode, '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-proxy-server', '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
    // Headless pauses virtual time while network fetches are pending, so this
    // waits for a fetch-on-load to settle rather than racing it.
    '--virtual-time-budget=8000',
    '--dump-dom', `http://127.0.0.1:${port}/`,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] });
  const got = (run.stdout || '').includes('<html');
  attempts.push({
    mode, ok: got, status: run.status,
    bytes: (run.stdout || '').length,
    err: String(run.error?.message || run.stderr || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300),
  });
  if (got) break;
}

// THREE OUTCOMES, NOT TWO. "Could not check" must never be reported as "fine" —
// that is the whole class of bug this session kept turning up. Exit 2 means the
// harness failed, and lab-build.yml treats it as a loud warning rather than a
// pass, and never as a reason to run the repair loop.
//
// Known to happen in sandboxes whose Chromium cannot open HTTP connections at
// all, including loopback, and — until the mode ladder above — on GitHub's own
// runners.
//
// WHEN IT FAILS, SAY WHY. The first version reported "Chrome returned no DOM"
// and discarded run.stderr, so the only evidence of what went wrong was thrown
// away by the code whose job was to report it. Everything known gets printed:
// the binary, its version, and what each mode did.
const dom = run.stdout || '';
if (!dom.includes('<html')) {
  let version = '(unknown)';
  try { version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
  warn(`SMOKE TEST DID NOT RUN — no headless mode returned a DOM.`);
  warn(`This is NOT a pass. The page was never loaded, so nothing about it is known.`);
  warn(`browser: ${chrome} — ${version}`);
  for (const a of attempts) {
    warn(`  ${a.mode}: exit=${a.status} stdout=${a.bytes}B${a.err ? ` err=${a.err}` : ''}`);
  }

  // WHICH OF THE TWO IS IT? On a GitHub runner every mode above returned
  // ETIMEDOUT — Chrome starts and never exits — while the SAME binary, in the
  // same job, screenshotted the live site headless without trouble. So the
  // failure is one of exactly two things and the log could not say which:
  //
  //   (a) Chrome cannot reach this script's localhost server, or
  //   (b) --dump-dom is what hangs.
  //
  // A screenshot against the same URL separates them: if it produces a PNG,
  // Chrome reached the server and --dump-dom is the problem; if it hangs too,
  // it is the connection. Cheap, and it answers the question on the next real
  // build rather than on a guess shipped into the live path — which is a
  // mistake already made once today.
  //
  // The clock this first failed on is worth noting for (b): a page with a 1s
  // setInterval never goes idle, and --dump-dom waits for the load to settle.
  const probe = join(profile, 'probe.png');
  const shot = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=4000', `--screenshot=${probe}`,
    `http://127.0.0.1:${port}/`,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] });
  const gotPng = existsSync(probe) && statSync(probe).size > 0;
  warn(gotPng
    ? `  probe: --screenshot of the SAME url worked (${statSync(probe).size}B) — Chrome reached the server, so --dump-dom is what hangs`
    : `  probe: --screenshot of the same url also failed (${shot.error?.message || shot.status}) — Chrome cannot reach this script's server`);

  server.close();
  process.exit(2);
}
if (attempts.length > 1) {
  console.log(`  · headless fallback: ${attempts.at(-1).mode} worked (${attempts.slice(0, -1).map((a) => a.mode).join(', ')} returned nothing)`);
}
server.close();
for (const m of dom.matchAll(/<div data-labsmoke="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
  found.push({ kind: m[1], msg: m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() });
}

if (!found.length) {
  console.log(`  ✓ smoke: ${dir}/index.html loads clean under the production CSP`);
  process.exit(0);
}

// Deduplicate — one broken call in a loop should read as one problem.
const uniq = [...new Map(found.map((f) => [f.kind + f.msg, f])).values()];
console.log('');
for (const f of uniq) err(`smoke [${f.kind}] ${f.msg}`);
console.log('');
err(`${uniq.length} problem(s) loading ${dir}/index.html`);
// The report is the product: lab-build hands it back to the agent.
process.exit(1);
