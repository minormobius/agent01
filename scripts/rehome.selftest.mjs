// rehome selftest — run before changing scripts/lib/rehome.mjs:
//   node scripts/rehome.selftest.mjs
//
// The tool's whole value is that you trust its answer enough not to check by
// hand, so the parts that could be quietly wrong are the parts under test:
//
//   1. THE SPECIFIER ARITHMETIC. `../lib/x.js` is a claim about two paths, and
//      a rehome invalidates it from either end. Getting this off by one
//      directory produces a file that looks fine and fails at build. It is
//      exercised in all four directions (importer moves, target moves, both,
//      neither) and on the rewrite that has to survive a byte-exact splice.
//   2. THE URL MATCHER. Its first version was a substring test, which matched
//      `/threads/list` in an unrelated worker and "thread" in four docs — 77
//      hits, mostly noise, which get skimmed, which is the same as not having
//      them. The boundary rule is asserted against the exact false positives
//      that motivated it.
//   3. PATH OWNERSHIP. Which surface claims a file decides whether an import
//      is "fixed" or is a new cross-surface dependency no build can satisfy.
//      The root surface claims everything, so it must lose to every other.
//   4. THE STUB. It exists because a link ALREADY POSTED points at the old
//      address; a stub without og: tags renders as bare text and is the
//      visible half of the breakage it was written to prevent.

import {
  commonDir, findRelativeImports, globToRegExp, ownerOf, pathMatches, planMoves,
  redirectHtml, registryAfterMove, relSpecifier, resolveSpec, retargetImports,
  tidy, urlPattern, urlPatterns,
} from './lib/rehome.mjs';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ═══════════════════ 1. paths and ownership ═══════════════════
{
  eq(tidy('./photo/src/'), 'photo/src', 'paths get one spelling');
  eq(tidy('photo\\src'), 'photo/src', 'and one separator');

  ok(globToRegExp('photo/**').test('photo/src/App.jsx'), '`dir/**` matches at any depth');
  ok(globToRegExp('photo/**').test('photo/a.js'), '…including one level down');
  ok(!globToRegExp('photo/**').test('photograph/a.js'), 'and not a prefix of another directory');
  ok(globToRegExp('photo/*.js').test('photo/a.js'), 'a single star matches within a directory');
  ok(!globToRegExp('photo/*.js').test('photo/src/a.js'), '…and does not cross a separator');

  const surfaces = [
    { surface: 'root', dir: '.', paths: ['**'] },
    { surface: 'photo', dir: 'photo', paths: ['photo/**'] },
    { surface: 'b', dir: 'b', paths: ['b/**'] },
    { surface: 'osapi', dir: 'os/api', paths: ['os/api/**'] },
    { surface: 'os', dir: 'os', paths: ['os/**'] },
  ];
  eq(ownerOf(surfaces, 'photo/src/App.jsx').surface, 'photo', 'a file belongs to the surface whose dir holds it');
  eq(ownerOf(surfaces, 'os/api/src/index.js').surface, 'osapi',
    'the DEEPEST dir wins — os/api is inside os, and the inner surface owns it');
  eq(ownerOf(surfaces, 'os/src/main.js').surface, 'os', '…while the rest of os still belongs to os');
  // The root surface's glob matches everything. If it were considered in order
  // it would own every file in the repo and every import would look local.
  eq(ownerOf(surfaces, 'README.md').surface, 'root', 'anything unclaimed falls to the root surface');
  ok(pathMatches(['photo/**'], 'photo/x'), 'pathMatches is the same rule');
}

// ═══════════════════ 2. what moves, and where it lands ═══════════════════
{
  eq(commonDir(['a/b/x.js', 'a/b/c/y.js']), 'a/b', 'the common directory is the deepest shared one');
  eq(commonDir(['a/x.js', 'b/y.js']), '', 'with nothing in common it is the root');

  // Structure below the common root is PRESERVED — moving a tree must not
  // flatten thirty files into one directory.
  const moves = planMoves(['photo/src/lib/a.js', 'photo/src/components/B.jsx'], 'b/sleuth');
  eq(moves[0].to, 'b/sleuth/components/B.jsx', 'a moved file keeps its shape below the common root');
  eq(moves[1].to, 'b/sleuth/lib/a.js', '…for every file in the set');
  eq(planMoves(['x/one.js'], 'y')[0].to, 'y/one.js', 'a single file lands by name');
  eq(planMoves([], 'y').length, 0, 'nothing in, nothing out');
}

// ═══════════════════ 3. the specifier arithmetic ═══════════════════
{
  eq(relSpecifier('a/b/c.js', 'a/b/d.js'), './d.js', 'a sibling is explicit, never bare');
  eq(relSpecifier('a/b/c.js', 'a/x/d.js'), '../x/d.js', 'and a cousin climbs');

  const src = [
    "import x from './near.js';",
    "import { y } from '../far/y.js';",
    "const z = await import('./lazy.js');",
    "const p = require('../pkg/p.js');",
    "import './side-effect.js';",
    "import react from 'react';",
    "fetch('/api/img');",
  ].join('\n');
  const hits = findRelativeImports(src);
  eq(hits.length, 5, 'every relative spelling is found');
  ok(hits.every((h) => h.spec.startsWith('.')), 'and only relative ones');
  ok(!/react|api/.test(hits.map((h) => h.spec).join()),
    'a package is not a path and an absolute URL is a worker route — neither moves');

  // The index has to point at the opening quote exactly, or the splice below
  // corrupts the file rather than editing it.
  for (const h of hits) eq(src[h.index], h.quote, `the recorded index is the opening quote (${h.spec})`);

  eq(resolveSpec('a/b/c.js', '../d/e.js'), 'a/d/e.js', 'a specifier resolves against its importer');

  // All four directions.
  const moved = { 'a/b/target.js': 'z/target.js' };
  {
    // importer stays, target moves
    const r = retargetImports("import t from './target.js';", 'a/b/i.js', 'a/b/i.js', moved);
    eq(r.text, "import t from '../../z/target.js';", 'a file that stays re-reaches what left');
  }
  {
    // importer moves, target stays
    const r = retargetImports("import s from './stays.js';", 'a/b/i.js', 'q/i.js', {});
    eq(r.text, "import s from '../a/b/stays.js';", 'a file that leaves re-reaches what stayed');
  }
  {
    // both move, together — the specifier must NOT change
    const both = { 'a/b/i.js': 'q/i.js', 'a/b/t.js': 'q/t.js' };
    const r = retargetImports("import t from './t.js';", 'a/b/i.js', 'q/i.js', both);
    eq(r.edits.length, 0, 'two files that travel together keep the specifier between them');
    eq(r.text, "import t from './t.js';", '…byte for byte');
  }
  {
    // neither moves
    const r = retargetImports("import t from './t.js';", 'a/b/i.js', 'a/b/i.js', {});
    eq(r.edits.length, 0, 'an untouched import is untouched');
  }
  {
    // multiple edits in one file must not corrupt the splice
    const many = "import a from './a.js';\nimport b from './b.js';\nconst c = 'literal./a.js';\n";
    const r = retargetImports(many, 'x/i.js', 'y/i.js', {});
    eq(r.edits.length, 2, 'both imports are edited');
    ok(r.text.includes("from '../x/a.js'") && r.text.includes("from '../x/b.js'"), 'both are correct');
    ok(r.text.includes("const c = 'literal./a.js';"), 'and a string that merely looks like one is left alone');
  }
}

// ═══════════════════ 4. addresses already in the wild ═══════════════════
{
  const re = urlPattern({ endpoint: 'photo.mino.mobi', path: 'thread' });

  ok(re.test('<a href="/thread">'), 'a bare path is found');
  ok(re.test('href="https://photo.mino.mobi/#/thread"'), 'the fragment form this surface used to serve is found');
  ok(re.test("u: 'https://photo.mino.mobi/thread'"), 'and the absolute form');
  ok(re.test('go to /thread now'), 'and one in prose, because a doc is a reference too');

  // THE FALSE POSITIVES THAT MOTIVATED THE BOUNDARY. Each of these was a real
  // hit from the substring version, in a file with nothing to do with photo.
  ok(!re.test("fetch(`${httpBase()}/threads/list`)"), 'not /threads/list in an unrelated worker');
  ok(!re.test("if (url.pathname.startsWith('/threads/'))"), 'not /threads/ either');
  ok(!re.test('Read channels/threads, send messages'), 'not the word in a sentence');
  ok(!re.test('/thread-reader'), 'not a longer path that merely starts the same');

  ok(urlPattern({ path: 'sleuth' }).test('#/sleuth'), 'with no endpoint the path forms still match');
  ok(!urlPattern({ path: 'sleuth' }).test('sleuthing about'), 'and a longer word does not');

  eq(urlPatterns({ endpoint: 'x.mino.mobi', paths: ['a', 'b'] }).length, 2, 'one matcher per public path');
  eq(urlPatterns({ paths: [] }).length, 0, 'and none for none');
}

// ═══════════════════ 5. the registry ═══════════════════
{
  const registry = {
    surfaces: [
      { surface: 'photo', dir: 'photo', paths: ['photo/**'] },
      { surface: 'b', dir: 'b', paths: ['b/index.html'] },
    ],
  };
  const { registry: next, notes } = registryAfterMove(registry, {
    moves: [{ from: 'photo/src/x.js', to: 'b/sleuth/x.js' }],
    toSurface: 'b',
  });
  ok(next.surfaces[1].paths.includes('b/**'), 'the destination starts claiming what arrived');
  ok(notes.length === 1, 'and says so');
  eq(registry.surfaces[1].paths.length, 1, 'the registry it was handed is not mutated');

  const again = registryAfterMove(next, {
    moves: [{ from: 'photo/src/y.js', to: 'b/sleuth/y.js' }],
    toSurface: 'b',
  });
  eq(again.notes.length, 0, 'a second move under the same glob changes nothing');

  let threw = false;
  try { registryAfterMove(registry, { moves: [], toSurface: 'nope' }); } catch { threw = true; }
  ok(threw, 'an unknown destination is refused rather than invented');
}

// ═══════════════════ 6. the forwarding address ═══════════════════
{
  const html = redirectHtml({ to: 'https://sleuth.mino.mobi/', title: 'sleuth' });
  // Each of these is load-bearing; the comment in lib/rehome.mjs says why.
  ok(/rel="canonical" href="https:\/\/sleuth\.mino\.mobi\/"/.test(html), 'canonical, so the move is followed not duplicated');
  ok(/property="og:title"/.test(html) && /property="og:description"/.test(html),
    'og tags, because the link already posted to Bluesky points HERE');
  ok(/name="robots" content="noindex"/.test(html), 'noindex on the stub itself');
  ok(/<a href="https:\/\/sleuth\.mino\.mobi\/">/.test(html),
    'a visible link, because meta-refresh is not guaranteed and a dead end is worse than a slow one');
  ok(/location\.replace\("https:\/\/sleuth\.mino\.mobi\/"\)/.test(html), 'and a script for the fast path');

  ok(redirectHtml({ to: '/albums' }).includes('href="/albums"'), 'a same-origin path works too');
  ok(!redirectHtml({ to: '/x', title: '<script>bad</script>' }).includes('<script>bad'),
    'a title is escaped — this file is written from argv');
  let threw = false;
  try { redirectHtml({ to: 'javascript:alert(1)' }); } catch { threw = true; }
  ok(threw, 'and the target must be a URL or a path');
}

// ═══════════════════════════════ verdict ═══════════════════════════════
if (failures) {
  console.error(`\n✗ rehome selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ rehome selftest passed — ownership, closure shaping, specifier arithmetic, '
  + 'the URL boundary rule, registry patching and the forwarding stub');
