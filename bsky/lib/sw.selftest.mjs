/**
 * The service worker's SHELL list cannot be derived at runtime — a service
 * worker has no way to parse an import graph — so it is written by hand, and
 * this keeps it honest.
 *
 *   node bsky/lib/sw.selftest.mjs
 *
 * A module that exists but is not precached is the failure that matters: the
 * app looks fine online and dies at exactly one screen offline, which is the
 * hardest kind of bug to notice. Run by preflight for changed dirs.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bsky = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { fail.push(msg); console.log(`  ✗ ${msg}`); };

const sw = readFileSync(join(bsky, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/^\s*'(\/[^']*)',$/gm)].map((m) => m[1]);
if (!shell.length) bad('could not parse SHELL out of sw.js');

// 1. Every lib/*.js module is precached.
const mods = readdirSync(join(bsky, 'lib')).filter((f) => f.endsWith('.js'));
const missing = mods.filter((f) => !shell.includes(`/lib/${f}`));
if (missing.length) bad(`lib modules missing from SHELL: ${missing.join(', ')}`);
else ok(`all ${mods.length} lib modules precached`);

// 2. Every entry actually exists. `packages/` is staged at deploy time and is
//    gitignored, so it is only checkable when it happens to be present.
const notFound = shell.filter((p) => {
  if (p === '/') return false;
  if (p.startsWith('/packages/') && !existsSync(join(bsky, 'packages'))) return false;
  return !existsSync(join(bsky, p.slice(1)));
});
if (notFound.length) bad(`SHELL names files that do not exist: ${notFound.join(', ')}`);
else ok(`all ${shell.length} SHELL entries resolve`);

// 3. Every bare-absolute import anywhere in the app is precached. This is the
//    one that catches a new dependency rather than a new file.
const sources = ['app.js', ...mods.map((m) => `lib/${m}`)];
const imported = new Set();
for (const f of sources) {
  const src = readFileSync(join(bsky, f), 'utf8');
  for (const m of src.matchAll(/from\s+'(\/[^']+)'|import\('(\/[^']+)'\)/g)) {
    imported.add(m[1] || m[2]);
  }
}
/**
 * Deliberately NOT precached. `lib/vendor/` is the zstd/WASM stack for the
 * deep-history path: several hundred KB, gitignored, built at deploy time, and
 * only ever loaded by a reader who has pasted their own Jetstream key. Making
 * every installer pay for it would be the wrong trade — it is dynamically
 * imported and stale-while-revalidate caches it after first use.
 */
const EXEMPT = [/^\/lib\/vendor\//];
const unCached = [...imported]
  .filter((p) => !shell.includes(p) && !EXEMPT.some((re) => re.test(p)));
if (unCached.length) bad(`imported but not precached: ${unCached.join(', ')}`);
else ok(`all ${imported.size} imported modules precached or exempt`);

// 4. The two rules that make the worker safe, asserted as text so that
//    deleting them is a test failure and not a silent regression.
if (!/url\.pathname\.startsWith\('\/api\/'\)\)\s*return/.test(sw)) {
  bad('sw.js no longer bypasses /api/* — see rule 1, the reader\'s JWT');
} else ok('/api/* is bypassed (rule 1: never cache a personalised feed)');

if (!/url\.origin !== self\.location\.origin\)\s*return/.test(sw)) {
  bad('sw.js no longer bypasses cross-origin requests (rule 2)');
} else ok('cross-origin is bypassed (rule 2)');

if (/self\.skipWaiting\(\)/.test(sw) && !/e\.data\?\.type === 'SKIP_WAITING'/.test(sw)) {
  bad('sw.js calls skipWaiting() outside the explicit message handler');
} else ok('no unprompted skipWaiting (mixed module versions)');

// 5. The manifest must point at icons that exist, or the install prompt never
//    appears and nothing says why.
const manifest = JSON.parse(readFileSync(join(bsky, 'manifest.json'), 'utf8'));
const badIcons = manifest.icons.filter((i) => !existsSync(join(bsky, i.src.slice(1))));
if (badIcons.length) bad(`manifest icons missing: ${badIcons.map((i) => i.src).join(', ')}`);
else ok(`all ${manifest.icons.length} manifest icons exist`);

const purposes = new Set(manifest.icons.map((i) => i.purpose));
if (!purposes.has('any') || !purposes.has('maskable')) {
  bad('manifest needs both an "any" and a "maskable" icon');
} else ok('manifest declares any + maskable');

if (fail.length) { console.error(`\n${fail.length} failure(s)`); process.exit(1); }
console.log('\nsw selftest passed');
