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

import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { decodePng, inkStats, looksBlank } from './lib/png.mjs';
// The server, the CSP, the collector and the Chrome launch live in the lib so
// lab-bench.mjs runs the tenant's code in the SAME sandbox rather than a second
// copy of it that quietly drifts. Every comment that was here moved with them.
import { CSP, serveTenant, findChrome, chromeArgs, runChrome } from './lib/headless.mjs';
import { tmpdir } from 'node:os';

const dir = process.argv[2];
/** Optional: where to write the screenshot. Absent means skip the picture
 *  entirely, so a local `node scripts/lab-smoke.mjs <dir>` stays fast. */
const shotPath = process.argv[3] ?? null;
if (!dir || !existsSync(join(dir, 'index.html'))) {
  console.error(`usage: node scripts/lab-smoke.mjs <tenant-dir> [screenshot.png]   (needs index.html)`);
  process.exit(2);
}
const ci = Boolean(process.env.GITHUB_ACTIONS);
const err = (m) => console.log(ci ? `::error::${m}` : `  ✘ ${m}`);
const warn = (m) => console.log(ci ? `::warning::${m}` : `  ! ${m}`);

const found = [];
const site = serveTenant(dir);
const chrome = findChrome();

if (!chrome) {
  warn('no Chrome on this machine — skipping the smoke test');
  process.exit(0);
}

const port = await site.listen();

const profile = mkdtempSync(join(tmpdir(), 'labsmoke-'));

// The Chrome launch, its flag set and the spawn-not-spawnSync rule that cost
// three wrong findings all live in lib/headless.mjs — read runChrome there
// before changing anything about how the browser is driven.
const args = [
  ...chromeArgs({ profile, virtualTimeBudget: 8000 }),
  '--dump-dom', `http://127.0.0.1:${port}/`,
];
const run = await runChrome(chrome, args, { timeoutMs: 30000 });
const attempts = [{
  mode: '--headless=new',
  status: run.status,
  bytes: (run.stdout || '').length,
  err: String(run.error?.message || (run.timedOut ? 'killed after 30s' : '') || run.stderr || '')
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

  site.close();
  process.exit(2);
}

// ---------------------------------------------------------------- the picture
//
// A SECOND BROWSER PASS, ON PURPOSE. --dump-dom and --screenshot are both
// headless "commands" and only one of them runs per invocation, so asking for
// both silently gets you the DOM and no image. Cheaper to spend four seconds
// than to debug an empty file.
//
// The screenshot is for TWO readers. The blank check below is one. The other is
// the build agent: lab-build.yml hands it this path, and Claude Code's Read
// tool renders images — so the agent that wrote the page can look at it. Every
// NOTE.txt that says "untested in a browser, correct on paper" was written next
// to a runner that had Chromium installed the whole time.
let shot = null;
if (shotPath) {
  const shotArgs = args.filter((a) => a !== '--dump-dom' && !a.startsWith('http://'));
  shotArgs.push('--hide-scrollbars', '--window-size=1200,800', `--screenshot=${shotPath}`,
    `http://127.0.0.1:${port}/`);
  await new Promise((done) => {
    const p = spawn(chrome, shotArgs, { stdio: 'ignore' });
    const kill = setTimeout(() => { p.kill('SIGKILL'); done(); }, 45000);
    p.on('error', () => { clearTimeout(kill); done(); });
    p.on('close', () => { clearTimeout(kill); done(); });
  });
  if (existsSync(shotPath)) {
    try {
      const stats = inkStats(decodePng(readFileSync(shotPath)));
      shot = stats;
      // NOT FATAL BY ITSELF. It is reported as a problem so the repair pass sees
      // it, but a decoder that got confused must not be able to fail a build on
      // its own — hence the deliberately wide threshold in lib/png.mjs.
      if (looksBlank(stats)) {
        found.push({ kind: 'render', msg:
          `the page screenshots as an essentially blank rectangle (${stats.distinct} distinct colours, `
          + `${Math.round(stats.topShare * 100)}% of it one colour). It loads without errors and shows nothing.` });
      }
      console.log(`  · screenshot ${shotPath} — ${stats.distinct} colours, top ${Math.round(stats.topShare * 100)}%`);
    } catch (e) {
      console.log(`  ! could not read the screenshot back: ${String(e.message).slice(0, 80)}`);
    }
  } else {
    console.log('  ! no screenshot was produced');
  }
}

site.close();
for (const m of dom.matchAll(/<div data-labsmoke="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
  found.push({ kind: m[1], msg: m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() });
}

if (!found.length) {
  console.log(`  ✓ smoke: ${dir}/index.html loads clean under the production CSP`);
  process.exit(0);
}

// Deduplicate — one broken call in a loop should read as one problem.
const uniq = [...new Map(found.map((f) => [f.kind + f.msg, f])).values()];

// THIS SANDBOX HAS AUTHORITY OVER SAME-ORIGIN AND NONE OVER CROSS-ORIGIN.
//
// It killed a build for doing the right thing. @words.bsky.social asked for a
// site, the agent built one that checks whether the visitor is signed in, and the
// page called https://auth.mino.mobi/api/me — which is IN the production
// connect-src, three lines up. There is no route to the internet from this
// headless Chrome, so the fetch failed, `network` was recorded, the repair pass
// could not fix a thing that was not broken, and the build was refused. Every
// site with a sign-in button would have failed the same way, on a factory whose
// own instructions say never to reimplement OAuth and to import AuthClient.
//
// The second half of the same bug: signed out, /api/me answers 401. That is the
// correct answer to "am I logged in", and `http` would have recorded it as a
// failure even with a working network.
//
// So the split is by what this harness can actually observe. It serves the
// tenant directory itself, so a same-origin fetch that fails or 404s is a missing
// file and a real defect. A cross-origin fetch to an origin the PRODUCTION CSP
// allows is a request that production permits and this sandbox cannot perform —
// its failure is evidence about the sandbox, not the page.
//
// A cross-origin fetch to an origin the CSP does NOT allow still fails the build,
// and it does not need this code to do it: the browser refuses the request and
// reports a `csp` violation, which stays fatal.
const ALLOWED_ORIGINS = (CSP.match(/connect-src ([^;]+)/)?.[1] ?? '')
  .split(/\s+/)
  .filter((s) => s.startsWith('http'));
/** Does this URL's origin appear in the production connect-src?
 *
 *  Written out rather than built as a regex. The first version was a chain of
 *  .replace() calls on the CSP source and it got `https://*.host.bsky.network`
 *  wrong — it matched one label, where CSP matches any depth, so every real PDS
 *  host (`morel.us-east.host.bsky.network`) fell through to fatal. Suffix attacks
 *  are the thing to be careful of here: `auth.mino.mobi.evil.com` must not match
 *  `auth.mino.mobi`, which is why the wildcard test keeps the leading dot. */
const productionAllows = (url) => {
  let u;
  try { u = new URL(url); } catch { return false; }
  return ALLOWED_ORIGINS.some((pattern) => {
    const m = pattern.match(/^(https?):\/\/(.+?)\/?$/);
    if (!m) return false;
    const [, scheme, host] = m;
    if (`${scheme}:` !== u.protocol) return false;
    // `*.host.bsky.network` matches any depth of subdomain but NOT the bare
    // domain — same as CSP.
    return host.startsWith('*.')
      ? u.hostname.endsWith(host.slice(1))
      : host === u.hostname;
  });
};
/** The URL a network/http report is about — these messages end in " — <url>"
 *  (network) or "<status> from <url>" (http). */
const reportedUrl = (f) => (f.msg.match(/https?:\/\/\S+/) ?? [''])[0];

const excused = [];
const fatal = [];
for (const f of uniq) {
  const url = reportedUrl(f);
  const crossOrigin = url && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1');
  if ((f.kind === 'network' || f.kind === 'http') && crossOrigin && productionAllows(url)) {
    excused.push(f);
  } else {
    fatal.push(f);
  }
}

console.log('');
// Still printed, and still handed to the repair agent — it may well be a clue
// about a page that also has a real problem. It just cannot fail the build alone.
for (const f of excused) {
  warn(`smoke [${f.kind}] ${f.msg} — production allows this origin; this sandbox has no route to it, so it is not a verdict on the page`);
}
for (const f of fatal) err(`smoke [${f.kind}] ${f.msg}`);
console.log('');

if (!fatal.length) {
  console.log(`  ✓ smoke: ${dir}/index.html loads clean under the production CSP`
    + ` (${excused.length} unreachable-from-here call${excused.length === 1 ? '' : 's'} to allowed origins)`);
  process.exit(0);
}
err(`${fatal.length} problem(s) loading ${dir}/index.html`);
// The report is the product: lab-build hands it back to the agent.
process.exit(1);
