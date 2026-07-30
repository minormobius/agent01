// node scripts/lab-smoke.selftest.mjs
//
// Proves lab-smoke.mjs CATCHES a broken page, which is the only direction that
// matters. Its first version reported a page with four deliberate bugs as clean
// — it beaconed failures back over the network and Chrome exited before the
// packets left — so "the smoke test passed" meant nothing at all for a while.
//
// "ENVIRONMENTS THAT CANNOT RUN IT" TURNED OUT TO BE NO ENVIRONMENT AT ALL. This
// header used to claim some sandboxes ship a Chromium that cannot open HTTP
// connections even to loopback. Not true anywhere it was believed: lab-smoke
// drove Chrome with spawnSync, which blocks the Node event loop, so its own
// server could never answer — in the dev container AND on GitHub runners alike.
// One bug, read as two different environmental limitations.
//
// The exit-2 path stays, because "could not check" must never read as "fine".
// In CI it is a FAILURE: a runner can do this, so an unverifiable result there
// means the harness broke, and a silent skip would restore exactly the blind
// spot being tested.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SMOKE = new URL('./lab-smoke.mjs', import.meta.url).pathname;
const ci = Boolean(process.env.GITHUB_ACTIONS);
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const META = '<title>t</title><meta property="og:title" content="t"><meta property="og:description" content="d">';

function smoke(html, files = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'smoketest-')), 'site');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const r = spawnSync('node', [SMOKE, dir], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('— can this machine run the smoke test at all? —');
{
  const probe = smoke(`<!doctype html>${META}<p>hello`);
  if (probe.code === 2) {
    console.log('  ! Chrome here cannot load a page over HTTP, so nothing below can be checked.');
    console.log('  ! Not a pass: the smoke test is UNVERIFIED in this environment.');
    if (ci) {
      console.error('  ✗ in CI this must work — treating an unverifiable smoke test as a failure');
      process.exit(1);
    }
    process.exit(0);
  }
  ck(probe.code === 0, 'a clean page passes');
}

console.log('— a page that throws on load —');
{
  const r = smoke(`<!doctype html>${META}<script>const p = undefined; document.title = p.displayName;</script>`);
  ck(r.code === 1, 'REJECTED');
  ck(/\[error\]/.test(r.out), 'reported as an error, with the message');
}

// THE LINE NUMBER IS THE ONLY PART OF THE REPORT THE REPAIR AGENT CAN ACT ON
// DIRECTLY, and it was wrong by exactly the height of the injected collector —
// ~38 lines, so a two-line page reported its bug at ":40". The agent cannot see
// the served copy, so it would go hunting for line 40 of a file that has two.
// The collector is now injected as a single line with no newline after it; this
// asserts the arithmetic, because a silent off-by-38 in a report nobody reads
// twice is exactly how the repair pass would quietly stop being worth running.
console.log('— the reported line number must match the file on disk —');
{
  const r = smoke(`<!doctype html>${META}
<p>filler</p>
<script>
null.boom;
</script>`);
  ck(r.code === 1, 'REJECTED');
  ck(/:4\b/.test(r.out), `points at line 4, where the bug is (got: ${(r.out.match(/@[^\s]*:(\d+)/) || [])[0] || 'no line'})`);
}

console.log('— the exact bug isolation causes: a wrong field name —');
{
  // The agent cannot call the API, so it writes what it remembers. This is what
  // being wrong looks like, and until now nothing in the pipeline would notice.
  const r = smoke(`<!doctype html>${META}<script>
    fetch('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app')
      .then(r => r.json()).then(d => { document.title = d.profile.display_name.toUpperCase(); });
  </script>`);
  ck(r.code === 1, 'REJECTED — the rejection surfaces at load, not at 3am');
  ck(/rejection|error/.test(r.out), 'reported');
}

console.log('— a host the CSP forbids —');
{
  const r = smoke(`<!doctype html>${META}<script>fetch('https://api.github.com/zen');</script>`);
  ck(r.code === 1, 'REJECTED');
  ck(/\[csp\]|\[network\]/.test(r.out), 'reported as a CSP or network failure');
}

// THE LAST TWO CASES USE `self`, NOT THE PUBLIC APPVIEW, AND THAT IS ON PURPOSE.
//
// They used to fetch public.api.bsky.app for realism, and both then FAILED in
// this sandbox — where outbound HTTPS is blocked — for a reason that has nothing
// to do with the thing under test: the non-2xx case reported [network] instead
// of [http], and the CONTROL rejected a page that was correct. A selftest whose
// result depends on the machine's internet access cannot tell "the collector is
// broken" from "there is no network here", which is the exact confusion this
// whole file exists to prevent.
//
// `self` is inside the production CSP's connect-src, the smoke server answers
// it, and it drives the identical code paths in the collector's fetch wrapper:
// the `!r.ok` branch and the success branch. Deterministic, hermetic, and it
// tests the mechanism rather than the network. Response SHAPES are covered
// separately by the checked-in fixtures in lab/_kit/fixtures/.
console.log('— an endpoint that answers with an error —');
{
  const r = smoke(`<!doctype html>${META}<script>
    fetch('./no-such-endpoint.json');
  </script>`);
  ck(r.code === 1, 'REJECTED — a non-2xx is caught even though fetch itself resolved');
  ck(/\[http\]/.test(r.out), 'reported with the status code');
}

// THE KIT VENDORS three.js, AND A HEADLESS FLAG DECIDED WHETHER THAT WAS REAL.
// With `--disable-gpu` — which was in lab-smoke purely as boilerplate —
// `new THREE.WebGLRenderer()` throws "Error creating WebGL context", so every
// 3D page would fail the smoke test, go to the repair pass, and fail again:
// nothing an agent can write fixes a missing GPU. three.js would have been
// vendored, documented, importable and unusable. This asserts the whole chain —
// same-origin import allowed by the CSP, module executes, WebGL context exists.
console.log('— a three.js page must render, not just import —');
{
  const r = smoke(`<!doctype html>${META}<div id=app></div>
<script type="module">
import * as THREE from '/_kit/three.module.min.js';
const s = new THREE.Scene();
const c = new THREE.PerspectiveCamera(70, 1, 0.1, 100); c.position.z = 3;
s.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()));
const r = new THREE.WebGLRenderer(); r.setSize(200, 200);
document.getElementById('app').appendChild(r.domElement);
r.render(s, c);
</script>`);
  ck(r.code === 0, `three.js imports same-origin and gets a WebGL context (${r.out.trim().split('\n').pop() || 'clean'})`);
}

// WASM IS IN SCOPE NOW, and it took one CSP token. Measured both directions:
// under `script-src 'self' 'unsafe-inline'` a WebAssembly.Module throws
// CompileError with `[csp] blocked wasm-eval`; adding 'wasm-unsafe-eval' makes
// it instantiate. This asserts the enabled half, so removing the token from
// either CSP copy fails here as well as in preflight.
console.log('— WebAssembly must instantiate under the production CSP —');
{
  const r = smoke(`<!doctype html>${META}<script>
    // the smallest valid module: magic + version, no sections
    const m = new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
    new WebAssembly.Instance(m);
  </script>`);
  ck(r.code === 0, `WebAssembly compiles and instantiates (${r.out.trim().split('\n').pop() || 'clean'})`);
}

// EVERY VENDORED WASM MODULE, INSTANTIATED FOR REAL. Not "does the file exist"
// — the failure mode this catches is the module loading and then refusing to
// run, which is invisible until a stranger opens the page. Two of the three
// need an explicit path because they were built with an older wasm-bindgen that
// does not derive one from import.meta.url; an agent cannot discover that (no
// network, no console) so it is asserted here and written down in the kit.
console.log('— every vendored wasm module must instantiate —');
for (const [mod, call] of [
  ['wave_md', 'await init();'],
  ['codescan_ocr', "await init(new URL('/_kit/wasm/codescan_ocr_bg.wasm', location.href));"],
  ['pds_car_parser', "await init(new URL('/_kit/wasm/pds_car_parser_bg.wasm', location.href));"],
]) {
  const r = smoke(`<!doctype html>${META}<div id=out></div>
<script type="module">
import init from '/_kit/wasm/${mod}.js';
${call}
document.getElementById('out').textContent = 'ok';
</script>`);
  ck(r.code === 0, `${mod} instantiates under the production CSP`);
}

// kit.handleInput is the answer to "type a handle here", which is where most
// lab sites start. It is only an answer if it actually attaches — a helper that
// silently no-ops leaves every site back on a bare text box.
console.log('— kit.handleInput wires up a real combobox —');
{
  const r = smoke(`<!doctype html>${META}<input id=h><div id=out></div>
<script src="/_kit/kit.js"></script>
<script>
  const i = document.getElementById('h');
  kit.handleInput(i);
  const ok = i.getAttribute('role') === 'combobox'
    && i.getAttribute('aria-autocomplete') === 'list'
    && i.getAttribute('aria-expanded') === 'false'
    && i.getAttribute('autocapitalize') === 'none'
    && i.getAttribute('inputmode') === 'url'
    && kit.handleInput(i) === i;            // idempotent: attaching twice is safe
  if (!ok) throw new Error('handleInput did not wire the input');
  document.getElementById('out').textContent = 'ok';
</script>`);
  ck(r.code === 0, `attaches ARIA + mobile keyboard hints, and is idempotent`);
}

console.log('— CONTROL: a page that works must still pass —');
{
  const r = smoke(`<!doctype html>${META}<script>
    fetch('./profile.json').then(r => r.json()).then(d => { document.title = d.displayName || d.handle; });
  </script>`, { 'profile.json': JSON.stringify({ handle: 'bsky.app', displayName: 'Bluesky' }) });
  ck(r.code === 0, 'a correct call that reads a field that EXISTS passes');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
