/**
 * Every event handler must name a function that exists.
 *
 *   node bsky/lib/wiring.selftest.mjs
 *
 * Written because `$('me-signout')?.addEventListener('click', signOut)` shipped
 * while `signOut` was never defined. Nothing caught it:
 *
 *   - it is not a syntax error, so `node --check` passes;
 *   - the reference is only evaluated when that line RUNS, so the module loads
 *     and the whole app boots normally;
 *   - the line is guarded by `?.`, so signed OUT the element is null and the
 *     line never executes — every test that was not signed in passed;
 *   - and when it does run it throws a ReferenceError that aborts the rest of
 *     `renderMe()`, silently killing every handler wired AFTER it. Three
 *     unrelated buttons died from one missing function.
 *
 * A grep for the button's id finds it in the HTML and proves nothing, which is
 * how it was "verified" the first time.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bsky = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['app.js', ...readdirSync(join(bsky, 'lib')).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`)];

let failed = 0;
const bad = (m) => { failed++; console.log(`  ✗ ${m}`); };

// `addEventListener('click', name)` and `el.onclick = name` — bare identifiers
// only. An inline arrow or `function (…)` is self-evidently defined.
const LISTENER = /addEventListener\(\s*'[^']+'\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
// app.js's own on(id, event, fn) wrapper. Added because moving the Me tab's
// buttons onto it silently took them OUT of this test's view — the guard has to
// know every way a handler gets attached, or it stops guarding the moment the
// wiring is refactored.
const ONWRAPPER = /(?:^|[^.\w])on\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
const ONHANDLER = /\.on(?:click|change|input|submit|load|error)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g;

const KEYWORDS = new Set(['function', 'async', 'this', 'null', 'undefined', 'true', 'false', 'new']);

let checked = 0;
for (const rel of files) {
  const src = readFileSync(join(bsky, rel), 'utf8');

  // Everything this file could legally be naming.
  const defined = new Set();
  for (const re of [
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  ]) for (const m of src.matchAll(re)) defined.add(m[1]);

  // Imported bindings: `import x, {a as b, c} from` and `import * as ns from`.
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1];
    for (const nm of clause.matchAll(/\*\s+as\s+([A-Za-z_$][\w$]*)/g)) defined.add(nm[1]);
    for (const nm of clause.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) defined.add(nm[2]);
    for (const nm of clause.replace(/\{[^}]*\}/g, '').matchAll(/([A-Za-z_$][\w$]*)/g)) defined.add(nm[1]);
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) for (const part of braces[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) defined.add(name);
    }
  }

  for (const [re, kind] of [[LISTENER, 'addEventListener'], [ONHANDLER, 'on-handler'],
                            [ONWRAPPER, 'on() wrapper']]) {
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (KEYWORDS.has(name)) continue;
      checked++;
      if (!defined.has(name)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad(`${rel}:${line} — ${kind} names \`${name}\`, which is not defined in this file`);
      }
    }
  }
}

if (!failed) console.log(`  ✓ all ${checked} named event handlers resolve`);

// The one that actually broke, pinned by name so a future refactor cannot
// quietly drop it again.
const app = readFileSync(join(bsky, 'app.js'), 'utf8');
for (const fn of ['signOut', 'signIn', 'promptInstall', 'applyUpdate', 'route']) {
  if (new RegExp(`(?:async\\s+)?function\\s+${fn}\\b`).test(app)) console.log(`  ✓ ${fn} is defined`);
  else bad(`app.js no longer defines ${fn}`);
}

// ─── the other half: defined, and never called ───────────────────
//
// The `signOut` bug was a NAME with no function. `applyTopbar` was the mirror
// image — a function with no caller, so four switches in the Me tab wrote their
// prefs faithfully and nothing on screen ever moved. Neither is a syntax error
// and neither throws, so only a reader noticing the feature does not work would
// find it.
//
// A top-level function whose name appears exactly once in the file is defined
// and referenced nowhere. That is either dead code or an unwired feature, and
// both are worth failing a build over.
{
  // Counted on the RAW source, comments included. Two attempts at being cleverer
  // both failed, and the second failed in the direction that matters:
  //
  //   - stripping template literals removes real call sites — this file builds
  //     its DOM from them, and `${when(post)}` is a call;
  //   - stripping block comments with a regex is worse. `accept="image/*"` in a
  //     template literal opens a comment that never legally closes, and one
  //     match swallowed 12,775 characters of live code — reporting three wired
  //     functions as dead.
  //
  // Recognising which `/*` is a comment needs a real tokenizer, which is not
  // worth it here. Counting raw occurrences instead means a function mentioned
  // by name in a comment can hide from this check — a MISS, never a false
  // alarm. A guard that occasionally misses is worth keeping; one that fails a
  // build wrongly gets deleted the first time it is inconvenient.
  const orphans = [];
  for (const m of app.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = m[1];
    const uses = app.match(new RegExp(`\\b${name}\\b`, 'g'))?.length || 0;
    if (uses <= 1) orphans.push(name);
  }
  if (orphans.length) bad(`defined but never called: ${orphans.join(', ')}`);
  else console.log('  ✓ every top-level function in app.js is referenced');
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nwiring selftest passed');
