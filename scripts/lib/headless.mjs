// headless.mjs — serve a tenant directory and drive Chrome at it.
//
// EXTRACTED FROM lab-smoke.mjs, NOT REWRITTEN. Everything here was learned the
// hard way by that file (docs/LAB-FACTORY.md §12) and the comments came with the
// code deliberately: the CSP being byte-identical to production, `spawn` never
// `spawnSync`, no `--disable-gpu`, the collector reporting through the DOM. A
// second copy of this logic would drift from the first, and the drift would be
// silent — the exact failure mode `headless-test.mjs` is a monument to.
//
// Two callers:
//   · lab-smoke.mjs  — loads index.html, asks "does it break?"
//   · lab-bench.mjs  — loads bench.html, asks "what does it measure?"
//
// Both run the tenant's own code in a browser with no credentials, no
// filesystem and a connect-src naming seven hosts. That sandbox — not the
// separation from the agent by itself — is what makes running agent-written
// code here safe.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

// Kept byte-identical to lab/www/_headers on purpose: a harness running under a
// laxer policy than production is worse than none, because it certifies pages
// the real site will break.
export const CSP = [
  "default-src 'none'",
  "script-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline'",
  "img-src 'self' https://minomobi.com https://lab.minomobi.com data: blob: https://cdn.bsky.app",
  "font-src 'self' https://minomobi.com https://lab.minomobi.com",
  "connect-src 'self' https://minomobi.com https://lab.minomobi.com https://auth.mino.mobi https://public.api.bsky.app https://plc.directory https://*.host.bsky.network",
  "media-src 'self' https://minomobi.com https://lab.minomobi.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self' https://minomobi.com https://lab.minomobi.com",
  "frame-src 'self' https://minomobi.com https://lab.minomobi.com",
  "object-src 'none'",
].join('; ');

// REPORTS THROUGH THE DOM, NOT THE NETWORK.
//
// The first version beaconed failures back to the local server and caught
// NOTHING — a page with four deliberate bugs came back clean. That was blamed on
// `sendBeacon` being fire-and-forget, the process supposedly gone before the
// packets left. THAT DIAGNOSIS WAS WRONG. The beacons were fine; the server was
// blocked by spawnSync (see runChrome below) and could not have answered a
// beacon any more than it could serve the page. A plausible story fitted to the
// symptom, and it held for a day because the fix that followed it happened to be
// an improvement for other reasons.
//
// Writing into the DOM is still right, and now for its actual reason: it needs
// no second channel at all. --dump-dom prints the DOM after scripts have run, so
// whatever the collector appended comes back in the same stdout as the page.
//
// This is also why a bench needs no new plumbing: the return channel for a
// measured value is the same channel as for an error. See lab-bench.mjs.
export const COLLECTOR = `<script>
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

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  // REQUIRED, not cosmetic: WebAssembly.instantiateStreaming REFUSES a module
  // that is not served as application/wasm, so an octet-stream fallback makes
  // every vendored wasm module fail here while working in production.
  '.wasm': 'application/wasm',
};

/** Serve a tenant directory on loopback under the production CSP, with the
 *  collector injected into every HTML response.
 *
 *  Returns { listen, close, hits }. `hits` is diagnostic and load-bearing: a run
 *  that comes back empty with hits===0 means the request never arrived, which is
 *  a different failure from a page that loaded and did nothing. */
export function serveTenant(dir) {
  const root = resolve(dir);
  // The shared kit lives one level up in production (../_kit/). Serve it from
  // the real source so a page linking it is tested against the kit it will
  // actually get, rather than 404ing here and passing anyway.
  const kitSrc = resolve('lab/_kit');
  let hits = 0;

  const server = createServer((req, res) => {
    hits++;
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

  return {
    async listen() {
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      return server.address().port;
    },
    close: () => server.close(),
    get hits() { return hits; },
  };
}

/** Find a browser without installing one. GitHub runners ship google-chrome;
 *  this sandbox has only Playwright's managed build, and CI should not be the
 *  only place this can run. */
export function findChrome() {
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

/** The flag set, minus the command (--dump-dom / --screenshot) and the URL.
 *
 *  NO `--disable-gpu`, AND THAT IS THE WHOLE REASON 3D WORKS.
 *
 *  It was here as boilerplate. With it, `new THREE.WebGLRenderer()` throws
 *  "Error creating WebGL context" — so every 3D page would fail the smoke test,
 *  go to the repair pass, and fail again, because nothing the agent could write
 *  would fix a missing GPU. three.js would have been vendored, documented,
 *  importable, and unusable.
 *
 *  Measured, not guessed — four flag sets against a real three.js page:
 *    --disable-gpu                            Error creating WebGL context
 *    (removed)                                ✓ renders
 *    --use-gl=angle --use-angle=swiftshader   ✓ renders
 *    + --enable-unsafe-swiftshader            ✓ renders
 *
 *  SwiftShader is named explicitly rather than trusting the default: a GitHub
 *  runner has no GPU, so this pins a software rasteriser that is there rather
 *  than hoping for a fallback. --enable-unsafe-swiftshader is what stops
 *  Chrome 128+ refusing SwiftShader for WebGL.
 *
 *  virtualTimeBudget: headless pauses virtual time while network fetches are
 *  pending, so this waits for a fetch-on-load to settle rather than racing it.
 *  A page load wants ~8s. A bench sweep wants far more — see lab-bench.mjs. */
export function chromeArgs({ profile, virtualTimeBudget = 8000 }) {
  return [
    '--headless=new', '--no-sandbox', '--no-first-run',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-proxy-server', '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
    `--virtual-time-budget=${virtualTimeBudget}`,
  ];
}

/** Run Chrome and collect stdout.
 *
 *  `spawn`, NEVER `spawnSync` — AND THIS IS THE WHOLE BUG THAT COST THREE
 *  WRONG FINDINGS. The caller both SERVES the page and DRIVES the browser.
 *  spawnSync blocks the Node event loop until the child exits, so from the
 *  moment Chrome launched, the HTTP server could not accept a single
 *  connection. Chrome sat waiting for a reply that could not come, and the
 *  timeout killed it:
 *
 *    spawnSync: 20047ms  bytes=0  ETIMEDOUT  serverHits=0
 *    spawn:       504ms  bytes=129  hasHtml=true  serverHits=3
 *
 *  serverHits=0 is the proof — the request never arrived. Same result on a
 *  GitHub runner and in the dev container. It was read as "this sandbox's
 *  Chromium cannot open HTTP connections" and as "--headless=new never dumps
 *  the page", and neither was true.
 *
 *  One bug, mistaken for three different environmental quirks, because the
 *  symptom every time was silence. */
export function runChrome(chrome, args, { timeoutMs = 30000 } = {}) {
  return new Promise((done) => {
    let timedOut = false;
    const p = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', errOut = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { errOut += d; });
    const kill = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutMs);
    p.on('error', (e) => {
      clearTimeout(kill);
      done({ stdout: out, stderr: errOut, status: null, error: e, timedOut });
    });
    p.on('close', (status) => {
      clearTimeout(kill);
      done({ stdout: out, stderr: errOut, status, error: null, timedOut });
    });
  });
}
