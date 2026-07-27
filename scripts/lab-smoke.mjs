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
//      unhandled rejections, CSP violations and failed fetches, and records each
//      one as a hidden <div> in the page's own DOM.
//   3. Drive the Chrome already on the runner at that URL, headless.
//   4. Report what came back.
//
// The injected collector is why this needs no CDP client: the page reports on
// itself. It is stripped from what gets published — it exists only on the
// localhost copy, never in the file on disk.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.bsky.app",
  "font-src 'self'",
  "connect-src 'self' https://public.api.bsky.app https://plc.directory https://*.host.bsky.network",
  "media-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

// REPORTS THROUGH THE DOM, NOT THE NETWORK.
//
// The first version beaconed failures back to the local server and caught
// NOTHING — a page with four deliberate bugs came back clean. That was blamed on
// `sendBeacon` being fire-and-forget, the process supposedly gone before the
// packets left. THAT DIAGNOSIS WAS WRONG. The beacons were fine; the server was
// blocked by spawnSync (see below) and could not have answered a beacon any more
// than it could serve the page. A plausible story fitted to the symptom, and it
// held for a day because the fix that followed it happened to be an improvement
// for other reasons.
//
// Writing into the DOM is still right, and now for its actual reason: it needs
// no second channel at all. --dump-dom prints the DOM after scripts have run, so
// whatever the collector appended comes back in the same stdout as the page.
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
  // REQUIRED, not cosmetic: WebAssembly.instantiateStreaming REFUSES a module
  // that is not served as application/wasm, so an octet-stream fallback makes
  // every vendored wasm module fail here while working in production.
  '.wasm': 'application/wasm',
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
    // ONE LINE, AND NO TRAILING NEWLINE, SO LINE NUMBERS STAY TRUE.
    //
    // The collector is ~38 lines of source. Prepended as-is it pushed the real
    // document down by exactly that much, and every line number the browser
    // reported was 38 too high: a two-line test page reported its bug at ":40".
    // Those numbers are fed straight to the repair agent, which cannot open the
    // served copy and would go looking for line 40 of a file that has two — so
    // the report actively misdirects the one pass that exists to use it.
    //
    // Collapsed to a single line with no newline after it, the original line 1
    // continues on that same line, and every line number matches the file on
    // disk. The collector has no `//` comments, so joining is safe; the selftest
    // asserts the messages still arrive.
    bytes = Buffer.from(COLLECTOR.replace(/\n/g, ' ') + bytes.toString('utf8'), 'utf8');
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
let timedOut = false;

// `spawn`, NEVER `spawnSync` — AND THIS IS THE WHOLE BUG.
//
// This file both SERVES the page and DRIVES the browser. spawnSync blocks the
// Node event loop until the child exits, so from the moment Chrome launched,
// the HTTP server above could not accept a single connection. Chrome sat
// waiting for a reply that could not come, and the timeout killed it:
//
//   spawnSync: 20047ms  bytes=0  ETIMEDOUT  serverHits=0
//   spawn:       504ms  bytes=129  hasHtml=true  serverHits=3
//
// serverHits=0 is the proof — the request never arrived. Same result on a
// GitHub runner (`ETIMEDOUT` in every headless mode) and in the dev container.
//
// TWO WRONG DIAGNOSES CAME OUT OF THIS, both written as findings:
//
//  · "This sandbox's Chromium cannot open HTTP connections at all, including
//    loopback." It can. Our own server was never answering.
//  · "`--headless=new` accepts the mode but never dumps the page, so try
//    --headless=old and bare --headless too." A mode ladder, three 25-second
//    timeouts, fixing nothing. Deleted: --dump-dom works in every mode, on a
//    static page and on a page with a 1s setInterval, once the server can reply.
//
// It also explains the ORIGINAL failure this file was rewritten for. The first
// version had the page `sendBeacon` its errors back to this server and caught
// four deliberate bugs cleanly — that was blamed on beacon flush timing. The
// beacons were fine. The server was blocked, exactly as it is here.
//
// One bug, mistaken for three different environmental quirks, because the
// symptom every time was silence.
const args = [
  // NO `--disable-gpu`, AND THAT IS THE WHOLE REASON 3D WORKS.
  //
  // It was here as boilerplate. With it, `new THREE.WebGLRenderer()` throws
  // "Error creating WebGL context" — so every 3D page would fail the smoke
  // test, go to the repair pass, and fail again, because nothing the agent
  // could write would fix a missing GPU. three.js would have been vendored,
  // documented, importable, and unusable.
  //
  // Measured, not guessed — four flag sets against a real three.js page:
  //   --disable-gpu                        Error creating WebGL context
  //   (removed)                            ✓ renders
  //   --use-gl=angle --use-angle=swiftshader  ✓ renders
  //   + --enable-unsafe-swiftshader           ✓ renders
  //
  // SwiftShader is named explicitly rather than trusting the default: a GitHub
  // runner has no GPU, so this pins a software rasteriser that is there rather
  // than hoping for a fallback. --enable-unsafe-swiftshader is what stops
  // Chrome 128+ refusing SwiftShader for WebGL.
  '--headless=new', '--no-sandbox', '--no-first-run',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-proxy-server', '--disable-dev-shm-usage',
  `--user-data-dir=${profile}`,
  // Headless pauses virtual time while network fetches are pending, so this
  // waits for a fetch-on-load to settle rather than racing it.
  '--virtual-time-budget=8000',
  '--dump-dom', `http://127.0.0.1:${port}/`,
];
const run = await new Promise((done) => {
  const p = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', errOut = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { errOut += d; });
  const kill = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, 30000);
  p.on('error', (e) => { clearTimeout(kill); done({ stdout: out, stderr: errOut, status: null, error: e }); });
  p.on('close', (status) => { clearTimeout(kill); done({ stdout: out, stderr: errOut, status, error: null }); });
});
const attempts = [{
  mode: '--headless=new',
  status: run.status,
  bytes: (run.stdout || '').length,
  err: String(run.error?.message || (timedOut ? 'killed after 30s' : '') || run.stderr || '')
    .trim().split('\n').slice(-3).join(' | ').slice(0, 300),
}];

// THREE OUTCOMES, NOT TWO. "Could not check" must never be reported as "fine" —
// that is the whole class of bug this session kept turning up. Exit 2 means the
// harness failed, and lab-build.yml treats it as a loud warning rather than a
// pass, and never as a reason to run the repair loop.
//
// WHEN IT FAILS, SAY WHY. An earlier version reported "Chrome returned no DOM"
// and discarded run.stderr — the code whose job was to report the failure threw
// away the only evidence of it, and two wrong diagnoses followed. Everything
// known gets printed: the binary, its version, the exit status and the error.
const dom = run.stdout || '';
if (!dom.includes('<html')) {
  let version = '(unknown)';
  try { version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
  warn(`SMOKE TEST DID NOT RUN — Chrome returned no DOM.`);
  warn(`This is NOT a pass. The page was never loaded, so nothing about it is known.`);
  warn(`browser: ${chrome} — ${version}`);
  for (const a of attempts) {
    warn(`  ${a.mode}: exit=${a.status} stdout=${a.bytes}B${a.err ? ` err=${a.err}` : ''}`);
  }

  server.close();
  process.exit(2);
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
