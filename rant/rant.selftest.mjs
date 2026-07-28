#!/usr/bin/env node
/**
 * rant — selftest.
 *
 * `scripts/preflight.mjs` runs every `*.selftest.mjs` under a directory the
 * branch touched, in a plain node process with no toolchain. So this file does
 * NOT try to be the Rust test suite — that lives in `cargo test -p rant-core`
 * (80 tests) and runs as the gate in `deploy-rant.yml`.
 *
 * What it checks instead is everything a Rust test *cannot* see:
 *
 *  1. The five parts of a surface exist and agree with each other.
 *  2. The golden rule: wrangler `name` + `custom_domain` route.
 *  3. The auth worker's OAuth ceiling covers the collections we write — a
 *     mismatch here is a runtime consent failure with no compile-time signal.
 *  4. The one fragile join: the import specifier wasm-bindgen emits for the
 *     shared OAuth client must resolve to the path the deploy stages it at.
 *     wasm-bindgen chooses the `./snippets/<hash>/` prefix, so this is a
 *     property of a tool's output, not of our source. Checked only when
 *     `public/pkg/` has been built.
 *  5. The house posts parse as the frontmatter contract claims.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

console.log('rant selftest');

// ─── 1. the five parts ───────────────────────────────────────────────────────
{
  for (const f of [
    'rant/CLAUDE.md',
    'rant/wrangler.jsonc',
    'rant/Cargo.toml',
    'rant/crates/rant-core/src/lib.rs',
    'rant/crates/rant-worker/src/lib.rs',
    'rant/crates/rant-view/src/lib.rs',
    'rant/public/rant.css',
    '.github/workflows/deploy-rant.yml',
  ]) {
    check(`exists: ${f}`, existsSync(join(ROOT, f)));
  }

  const reg = JSON.parse(read('deploy-registry.json'));
  const s = reg.surfaces.find((x) => x.surface === 'rant');
  check('registry entry exists', !!s);
  if (s) {
    check('registry dir is rant/', s.dir === 'rant', s.dir);
    check('registry endpoint is rant.mino.mobi', s.endpoint === 'rant.mino.mobi', s.endpoint);
    check('registry declares the auth dependency', (s.uses || []).includes('auth.mino.mobi'));
    check('registry note stays under the 1200c preflight cap', (s.note || '').length <= 1200);

    // The workflow must trigger on the owning branch, or a push deploys nothing.
    const wf = read('.github/workflows/deploy-rant.yml');
    check('workflow triggers on the owning branch', wf.includes(s.branch), s.branch);
    for (const p of s.paths || []) {
      const glob = p.replace(/\*/g, '');
      check(`workflow watches ${p}`, wf.includes(glob));
    }
  }

  check('landing catalogue lists rant', read('index.html').includes("n:'rant'"));
  check('spec assigns rant a family', /\brant:\s*'[a-z]+'/.test(read('spec/curated.js')));
}

// ─── 2. the golden rule ──────────────────────────────────────────────────────
{
  // wrangler.jsonc is JSONC; strip line comments before parsing.
  const raw = read('rant/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    check('wrangler.jsonc parses', false, e.message);
  }
  if (cfg) {
    check('worker name is `rant`', cfg.name === 'rant', cfg.name);
    const route = (cfg.routes || []).find((r) => r.pattern === 'rant.mino.mobi');
    check('rant.mino.mobi is a route', !!route);
    check('…and is flagged custom_domain', route?.custom_domain === true,
      'without this, deploy goes green and the live site never changes');
    check('main points at the generated shim', /crates\/rant-worker\/build\//.test(cfg.main || ''), cfg.main);
    check('assets directory is ./public', cfg.assets?.directory === './public', cfg.assets?.directory);
    check('SITE_URL matches the route', cfg.vars?.SITE_URL === 'https://rant.mino.mobi', cfg.vars?.SITE_URL);

    // `cargo install X` exits 101 with "binary already exists in destination"
    // instead of no-op'ing. Because deploy-rant.yml caches ~/.cargo/bin, an
    // unguarded install passes on the FIRST deploy and fails on every one after
    // — which is exactly what happened on run #2. Any `cargo install` in the
    // build command must be guarded or forced.
    const build = cfg.build?.command || '';
    const unguarded = /cargo install/.test(build)
      && !/command -v|which |--force|\|\|/.test(build);
    check('build command\u2019s cargo install is guarded', !unguarded,
      `an unguarded install breaks every deploy after the first once the cargo cache is warm: ${build}`);
  }
}

// ─── 2b. the workflow provisions tools idempotently ──────────────────────────
{
  const wf = read('.github/workflows/deploy-rant.yml');
  // Same trap, different tool: the wasm-pack installer script and any other
  // `cargo install` in the workflow run on a cache that may already hold them.
  const lines = wf.split('\n').filter((l) => /cargo install/.test(l) && !l.trim().startsWith('#'));
  for (const l of lines) {
    check(`workflow cargo install is guarded: ${l.trim().slice(0, 60)}`,
      /command -v|which |--force|\|\|/.test(l));
  }
  // wasm-pack's installer overwrites by default, so it is safe; assert we are
  // using the installer rather than `cargo install wasm-pack`.
  check('wasm-pack comes from its installer (overwrites, so cache-safe)',
    wf.includes('rustwasm.github.io/wasm-pack/installer'));
}

// ─── 2c. the wasm module is actually started ─────────────────────────────────
{
  // THE bug of this surface's life. `wasm-bindgen --target web` emits glue whose
  // default export IS the init function; a bare `<script type="module" src=…>`
  // pointing at that glue evaluates the module and never instantiates the wasm,
  // so `#[wasm_bindgen(start)]` never runs. The site served 200s with correct
  // MIME types and the entire browser half was dead: composer, subscribe,
  // recommend, the timed-view player, /mine/, /setup/. curl could not see it.
  const page = read('rant/crates/rant-worker/src/page.rs');
  const worker = read('rant/crates/rant-worker/src/lib.rs');

  check('the page does NOT script-src the wasm glue directly',
    !/<script[^>]*src="\/pkg\/rant_view\.js"/.test(page),
    'that evaluates the module without instantiating the wasm — point at /boot.js');
  check('the page loads a bootstrap module', /src="\/boot\.js"/.test(page));
  check('the worker serves /boot.js', worker.includes('"/boot.js" => boot_js()'));
  const boot = worker.slice(worker.indexOf('fn boot_js()'), worker.indexOf('fn robots('));
  check('…and the bootstrap calls init()', /init\(\)/.test(boot), boot.slice(0, 120));
  check('…and reports a failed init instead of dying quietly', /console\.error/.test(boot));

  // CSP: two clauses the sign-in dialog cannot live without.
  const csp = worker.slice(worker.indexOf('const CSP'), worker.indexOf('";', worker.indexOf('const CSP')));
  check('CSP allows WebAssembly compilation', csp.includes("'wasm-unsafe-eval'"),
    "default-src 'self' alone refuses WebAssembly.instantiateStreaming, so nothing client-side runs");
  check('CSP allows the sign-in avatars', csp.includes('cdn.bsky.app'));
  check('CSP does NOT need a third-party connect-src for typeahead',
    !csp.includes('public.api.bsky.app'),
    'the typeahead is proxied through /api/typeahead, so connect-src stays self');
  check('the worker proxies the typeahead', worker.includes('"/api/typeahead"'));

  // And no sign-in path may fall back to a prompt() again.
  for (const f of ['records.rs', 'compose.rs', 'setup.rs', 'mine.rs', 'signin.rs', 'lib.rs']) {
    const src = read(`rant/crates/rant-view/src/${f}`);
    check(`${f}: no prompt() for the handle`, !src.includes('prompt_with_message'),
      'use signin::open() — a browser prompt is not a sign-in experience');
  }
  check('the sign-in dialog exists', existsSync(join(ROOT, 'rant/crates/rant-view/src/signin.rs')));
  check('there is a sign-in browser test', existsSync(join(ROOT, 'rant/browser.test.mjs')));
  check('there is a composer browser test', existsSync(join(ROOT, 'rant/compose.test.mjs')));

  // The toolbar and the starters are rendered from rant-core's registries; the
  // Rust page tests assert the parity. Here, just make sure the page still has
  // somewhere to put them and the API still exposes the starters.
  check('the composer renders a formatting toolbar', /role="toolbar"/.test(page));
  check('the composer offers starters', /data-template=/.test(page));
  check('the worker exposes /api/templates', worker.includes('"/api/templates"'));

  // The module doc says pages are "rendered per request and not cached". It
  // said that while HTML carried max-age=300, which meant the edge served the
  // previous page for five minutes after a deploy — long enough to fail the
  // browser gate and look like a code bug. Keep the header and the claim in step.
  const claimsUncached = /rendered per request and not cached/.test(worker);
  const pageHeader = (worker.match(/const CACHE_PAGE: &str = "([^"]+)"/) || [])[1];
  check('HTML pages revalidate rather than sitting stale', pageHeader === 'no-cache',
    `CACHE_PAGE is ${pageHeader ?? 'missing'} — the docs claim pages are not cached`);
  check('…and every HTML response uses CACHE_PAGE, not CACHE_STATIC',
    !/html\([^)]*CACHE_STATIC/.test(worker),
    'an html() response still carries the 5-minute header');
  check('…and the claim in the module doc is still made', claimsUncached);

  // Share is the only action on a post page that needs no session and no
  // client-side code. It only stays that way if it is rendered as a link —
  // turning it into a <button> that a script has to wire up would look
  // identical and would be dead on any page where the wasm fails to boot, which
  // is exactly how the entire browser half shipped broken once already.
  const pageRs = read('rant/crates/rant-worker/src/page.rs');
  check('the share control is a server-rendered link',
    /<a class="btn share" href=/.test(pageRs),
    'share must be an <a href>, not a button — it must work with no JavaScript');
  check('…built by rant-core, so the encoding is under test',
    /rant_core::share::bsky_compose/.test(pageRs));
  check('…and opened in a new tab without leaking the referrer',
    /class="btn share"[^>]*rel="noopener noreferrer"/.test(pageRs));
}

// ─── 2e. the house publication resolves without a human ──────────────────────
{
  // The setup step used to end with "paste this URI into wrangler.jsonc and
  // push", which is a deploy standing between a button and its effect. The
  // worker now resolves the record from PUBLICATION_DID at request time. That
  // only works if a DID is actually configured, so: whenever the URI is not
  // pinned, the DID must be — otherwise /setup/ is back to a manual step and
  // /.well-known/site.standard.publication 404s forever.
  const wrangler = read('rant/wrangler.jsonc');
  const v = (k) => (wrangler.match(new RegExp(`"${k}":\\s*"([^"]*)"`)) || [])[1] ?? '';
  const uri = v('PUBLICATION_URI');
  const did = v('PUBLICATION_DID');
  check('the site can find its own publication',
    uri.startsWith('at://') || did.startsWith('did:'),
    'both PUBLICATION_URI and PUBLICATION_DID are empty, so no publication can ever resolve');

  const worker = read('rant/crates/rant-worker/src/lib.rs');
  const pds = read('rant/crates/rant-worker/src/pds.rs');
  check('the worker resolves it at request time',
    /publication_for_site/.test(worker) && /pub async fn publication_for_site/.test(pds));
  // Matching on `url` is what makes it safe to look inside a person's repo: the
  // operator of this site also owns an unrelated publication in the same
  // collection, and taking the first record would pick that one.
  check('…by matching the publication url against this site, not by taking the first',
    /p\.url\.trim_end_matches\('\/'\) == want/.test(pds),
    'a first-record-wins lookup will pick up an unrelated publication');
  check('…and the lookup is cached rather than run per request',
    /get_json_cached\(&url, PUBLICATION_TTL\)/.test(pds));

  // The page must not promise automation on a deployment that has none.
  const pageRs = read('rant/crates/rant-worker/src/page.rs');
  check('/setup/ leads with the fact that it is optional',
    /do not need this page to post/.test(pageRs));
  // Anchored to the exact markup that was removed rather than to the word
  // "paste": the first version of this check was case-insensitive and matched
  // the `publication_uri` field name and the doc comment recording the history,
  // so it failed on a file that was already correct.
  check('/setup/ no longer asks anyone to paste a URI back',
    !/id="vars-hint"/.test(pageRs) && !/Paste these into/.test(pageRs));
}

// ─── 3. the OAuth ceiling ────────────────────────────────────────────────────
{
  // rant-core is the source of truth for what we write; the auth worker's
  // WRITE_COLLECTIONS is the ceiling the auth server will grant. The ceiling
  // must be a superset, or `login({scope})` is refused at runtime.
  const std = read('rant/crates/rant-core/src/standard.rs');
  const ours = [...std.matchAll(/^pub const NSID_(\w+): &str = "([^"]+)";$/gm)].map((m) => m[2]);
  check('rant-core declares its NSIDs', ours.length >= 5, ours.join(', '));

  // WRITE_COLLECTIONS in rant-core is the subset we ask write scope for.
  const written = [...std.matchAll(/WRITE_COLLECTIONS: \[&str; (\d+)\][^;]*?=\s*\n?\s*\[([^\]]+)\]/gs)];
  check('rant-core lists the collections it writes', written.length === 1);

  const scope = read('workers/auth/src/oauth/scope.ts');
  for (const nsid of ours.filter((n) => n.startsWith('site.standard.'))) {
    check(`auth ceiling covers ${nsid}`, scope.includes(`'${nsid}'`),
      'add it to WRITE_COLLECTIONS in workers/auth/src/oauth/scope.ts and redeploy the auth worker');
  }
  // at.markpub.markdown lives INSIDE a document record, so it must NOT be
  // scoped — asking for write on a collection nobody writes lengthens the
  // consent screen for nothing.
  check('at.markpub.markdown is not scoped (it is not a record)',
    !scope.includes("'at.markpub.markdown'"));

  check('rant.mino.mobi is allowlisted in the auth worker',
    read('workers/auth/src/index.ts').includes("'https://rant.mino.mobi'"));
}

// ─── 4. the one fragile join ─────────────────────────────────────────────────
{
  const gluePath = join(ROOT, 'rant/public/pkg/rant_view.js');
  if (!existsSync(gluePath)) {
    console.log('  – wasm glue not built; skipping the import-specifier check');
    console.log('    (build it with: wasm-pack build crates/rant-view --target web --out-dir ../../public/pkg --out-name rant_view)');
  } else {
    const glue = readFileSync(gluePath, 'utf8');
    const m = glue.match(/from\s+['"]([^'"]*auth\.js)['"]/);
    check('the glue imports the shared OAuth client', !!m, 'no auth.js import found');
    if (m) {
      // Resolve the specifier the way a browser would, from /pkg/rant_view.js.
      const resolved = new URL(m[1], 'https://rant.invalid/pkg/rant_view.js').pathname;
      check('…and it resolves to /packages/oauth-client/auth.js',
        resolved === '/packages/oauth-client/auth.js',
        `resolves to ${resolved} — the deploy stages auth.js at rant/public/packages/oauth-client/auth.js, ` +
        'so either the staging path or the module attribute in crates/rant-view/src/auth.rs must change');

      const staged = join(ROOT, 'rant/public/packages/oauth-client/auth.js');
      if (existsSync(staged)) {
        check('the staged copy is byte-identical to packages/',
          readFileSync(staged, 'utf8') === read('packages/oauth-client/auth.js'),
          'rant/public/packages/ is a build artefact — never edit it; edit packages/');
      }
    }
    // No hand-written JS and no hand-written HTML: every page, including the
    // composer shell, is rendered by the worker.
    check('no hand-written JavaScript under rant/',
      !existsSync(join(ROOT, 'rant/src')) && !existsSync(join(ROOT, 'rant/worker.js')));
    check('the composer is worker-rendered, not a static file',
      !existsSync(join(ROOT, 'rant/public/compose.html'))
      && read('rant/crates/rant-worker/src/page.rs').includes('compose_page'));
  }
}

// ─── 5. the house posts ──────────────────────────────────────────────────────
{
  const postsDir = join(ROOT, 'rant/posts');
  const { readdirSync } = await import('node:fs');
  const files = existsSync(postsDir) ? readdirSync(postsDir).filter((f) => f.endsWith('.md')) : [];
  check('there is at least one house post', files.length > 0);

  const slugs = new Set();
  for (const f of files) {
    const src = readFileSync(join(postsDir, f), 'utf8');
    const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
    check(`${f}: has frontmatter`, !!fm);
    if (!fm) continue;
    const fields = Object.fromEntries(
      fm[1].split('\n').filter((l) => l.includes(':')).map((l) => {
        const i = l.indexOf(':');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
    );
    check(`${f}: has a title`, !!fields.title);
    // The Rust side requires a date on every house post: an undated post would
    // be stamped with the deploy time, which is a lie about when it was written.
    check(`${f}: has an RFC-3339 date`,
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/.test(fields.date || ''), fields.date);
    check(`${f}: body is not empty`, src.slice(fm[0].length).trim().length > 0);

    const slug = f.replace(/\.md$/, '');
    check(`${f}: slug is unique`, !slugs.has(slug));
    slugs.add(slug);
  }
}

console.log(failures === 0 ? '\n✓ rant selftest passed' : `\n✗ rant selftest: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
