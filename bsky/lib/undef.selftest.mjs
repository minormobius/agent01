/**
 * `no-undef` over this surface's browser modules.
 *
 *   node bsky/lib/undef.selftest.mjs
 *
 * Two shipped bugs in a row were an identifier that did not exist:
 *
 *   `signOut`  — wired to a button, never defined. Killed three other buttons.
 *   `why`      — used in the status line after an unasserted string replace
 *                silently failed to add it to the destructuring. Broke For You
 *                with "Can't find variable: why".
 *
 * Neither is a syntax error, so `node --check` passes both. Both only fail when
 * the line RUNS, which is why they reached production. A scope analysis catches
 * them in a second.
 *
 * eslint is not a dependency of this repo, so this SKIPS LOUDLY when it cannot
 * be resolved rather than passing quietly — a guard that silently does nothing
 * is worse than no guard. deploy-bsky.yml installs it and gates on it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bsky = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  join(bsky, '..', 'node_modules', 'eslint', 'bin', 'eslint.js'),
  '/opt/node22/lib/node_modules/eslint/bin/eslint.js',
  '/usr/lib/node_modules/eslint/bin/eslint.js',
];
const eslint = CANDIDATES.find((p) => existsSync(p));
if (!eslint) {
  console.log('  ⚠ eslint not resolvable — no-undef NOT checked here.');
  console.log('    (deploy-bsky.yml installs it and gates the deploy on it.)');
  process.exit(0);
}

// Browser globals this surface legitimately uses. Anything not here and not
// declared in the file is the bug this test is for.
const GLOBALS = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'AbortController', 'WebSocket',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame',
  'console', 'alert', 'confirm', 'prompt', 'matchMedia', 'getComputedStyle', 'CustomEvent', 'Event',
  'Image', 'Blob', 'File', 'FileReader', 'FormData', 'TextEncoder', 'TextDecoder', 'crypto', 'caches',
  'indexedDB', 'IDBKeyRange', 'ClipboardItem', 'Intl', 'CSS', 'DOMParser', 'XMLHttpRequest', 'performance',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'structuredClone', 'BigInt', 'WebAssembly',
  'self', 'globalThis', 'atob', 'btoa', 'Uint8Array', 'DataView', 'ArrayBuffer', 'requestIdleCallback',
];

const config = join(bsky, '.eslint.undef.mjs');
writeFileSync(config, `export default [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 2023, sourceType: 'module',
    globals: ${JSON.stringify(Object.fromEntries(GLOBALS.map((g) => [g, 'readonly'])))},
  },
  rules: { 'no-undef': 'error' },
}];
`);

let failed = false;
try {
  // Self-test the test: an undefined identifier must actually be reported.
  const probe = join(bsky, '.undef.probe.js');
  writeFileSync(probe, 'export function f() { return __definitelyNotDefined__; }\n');
  let caught = false;
  try { execFileSync(eslint, ['--config', config, probe], { stdio: 'pipe' }); }
  catch (e) { caught = /no-undef/.test(String(e.stdout || '')); }
  rmSync(probe, { force: true });
  if (!caught) {
    console.log('  ✗ the probe was NOT reported — this check is not actually checking');
    failed = true;
  } else {
    console.log('  ✓ probe: an undefined identifier is reported');
  }

  try {
    execFileSync(eslint, ['--config', config, 'app.js', 'lib'], { cwd: bsky, stdio: 'pipe' });
    console.log('  ✓ app.js and lib/ are free of undefined identifiers');
  } catch (e) {
    console.log(String(e.stdout || e.message).trim());
    failed = true;
  }
} finally {
  rmSync(config, { force: true });
}

if (failed) { console.error('\nno-undef failed'); process.exit(1); }
console.log('\nundef selftest passed');
