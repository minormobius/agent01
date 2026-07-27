// node scripts/lab-smoke.selftest.mjs
//
// Proves lab-smoke.mjs CATCHES a broken page, which is the only direction that
// matters. Its first version reported a page with four deliberate bugs as clean
// — it beaconed failures back over the network and Chrome exited before the
// packets left — so "the smoke test passed" meant nothing at all for a while.
//
// ENVIRONMENTS THAT CANNOT RUN IT. Some sandboxes ship a Chromium that cannot
// open HTTP connections, even to loopback. There the smoke test exits 2, "could
// not check", and this selftest says so and stops. In CI that is a FAILURE:
// GitHub runners can do this, so an unverifiable result there means the harness
// broke, and a silent skip would restore exactly the blind spot being tested.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SMOKE = new URL('./lab-smoke.mjs', import.meta.url).pathname;
const ci = Boolean(process.env.GITHUB_ACTIONS);
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const META = '<title>t</title><meta property="og:title" content="t"><meta property="og:description" content="d">';

function smoke(html) {
  const dir = join(mkdtempSync(join(tmpdir(), 'smoketest-')), 'site');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
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

console.log('— an endpoint that answers with an error —');
{
  const r = smoke(`<!doctype html>${META}<script>
    fetch('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=nope.invalid');
  </script>`);
  ck(r.code === 1, 'REJECTED — a non-2xx is caught even though fetch itself resolved');
  ck(/\[http\]/.test(r.out), 'reported with the status code');
}

console.log('— CONTROL: a page that works must still pass —');
{
  const r = smoke(`<!doctype html>${META}<script>
    fetch('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app')
      .then(r => r.json()).then(d => { document.title = d.displayName || d.handle; });
  </script>`);
  ck(r.code === 0, 'a correct getProfile call passes');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
