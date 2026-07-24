// node b/lathe/engine.selftest.mjs
// Gates: determinism, the type invariant over a large sample, sink/scope
// coherence, the known-toy encodings (the thesis), coverage of the vocabulary,
// and termination of the typed walk.

import {
  generateToy, validate, resemblance, fingerprint, spaceSize,
  SUBJECTS, SOURCES, LENSES, VIEWS, SINKS, KNOWN,
} from './engine.js';

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

console.log('— determinism —');
{
  const a = generateToy('tabard');
  const b = generateToy('tabard');
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical genome');
  const c = generateToy('tabard2');
  check(JSON.stringify(a) !== JSON.stringify(c), 'different seed → different genome');
  check(a.title === b.title && a.tagline === b.tagline, 'naming is deterministic too');
}

console.log('\n— the type invariant (the oracle) —');
{
  let ok = 0, firstErr = null;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const g = generateToy('seed-' + i);
    const v = validate(g);
    if (v.ok) ok++; else if (!firstErr) firstErr = { seed: 'seed-' + i, errors: v.errors, g };
  }
  check(ok === N, `all ${N} generated toys are type-correct${firstErr ? ' — first failure: ' + JSON.stringify(firstErr) : ''}`);
}

console.log('\n— the walk always terminates in a drawable port —');
{
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const g = generateToy('walk-' + i);
    const v = validate(g);
    if (!v.ok || VIEWS[g.view].in !== v.port) bad++;
  }
  check(bad === 0, 'every walk ends on a port its view can consume');
}

console.log('\n— sinks and procedural scope —');
{
  let withSink = 0, scopeOk = 0, readonlyClean = 0, n = 1500;
  for (let i = 0; i < n; i++) {
    const g = generateToy('sink-' + i);
    if (g.sink === 'share') {
      withSink++;
      if (g.scope === 'atproto repo:app.bsky.feed.post') scopeOk++;
    } else if (g.scope === null) readonlyClean++;
  }
  check(withSink > 0 && withSink < n, `some toys write, most do not (${withSink}/${n})`);
  check(scopeOk === withSink, 'every writing toy carries exactly the scope its sink implies');
  check(readonlyClean === n - withSink, 'every read-only toy carries no scope at all');
  // the oracle must reject a scope that does not authorise the sink's write
  const tampered = { ...generateToy('sink-0'), sink: 'share', scope: 'atproto' };
  check(!validate(tampered).ok, 'oracle rejects a write sink whose scope does not authorise it');
}

console.log('\n— the oracle rejects ill-typed genomes —');
{
  const base = generateToy('reject');
  check(!validate({ ...base, view: 'wall', chain: [{ lens: 'ngrams', params: { n: 2 } }] }).ok,
    'rejects terms → picture wall');
  check(!validate({ ...base, source: 'follows', chain: [{ lens: 'ngrams', params: { n: 2 } }] }).ok,
    'rejects accounts → n-grams');
  check(!validate({ ...base, subject: 'list', source: 'likes' }).ok,
    'rejects a source its subject does not support');
  check(!validate({ ...base, source: 'nope' }).ok, 'rejects an unknown node');
  check(!validate({ subject: 'one', source: 'posts', chain: [{ lens: 'overlap', params: {} }], view: 'grid', sink: 'none' }).ok,
    'rejects a pair-only lens on a single handle');
}

console.log('\n— the thesis: the hand-written toys live in this space —');
{
  let ok = 0;
  for (const k of KNOWN) {
    const g = { ...k.genome, scope: SINKS[k.genome.sink].scope };
    const v = validate(g);
    if (v.ok) ok++; else console.error(`      ${k.name}: ${v.errors.join('; ')}`);
  }
  check(ok === KNOWN.length, `all ${KNOWN.length} encoded real toys validate under the same algebra`);
  const r = resemblance(generateToy('cousin-1'));
  check(r && typeof r.score === 'number' && r.score >= 0 && r.score <= 1, 'resemblance returns a bounded score');
}

console.log('\n— coverage: the generator reaches its whole vocabulary —');
{
  const seenSrc = new Set(), seenLens = new Set(), seenView = new Set(), seenSubj = new Set();
  for (let i = 0; i < 8000; i++) {
    const g = generateToy('cov-' + i);
    seenSubj.add(g.subject); seenSrc.add(g.source); seenView.add(g.view);
    g.chain.forEach((c) => seenLens.add(c.lens));
  }
  check(seenSubj.size === Object.keys(SUBJECTS).length, `every subject reachable (${seenSubj.size}/${Object.keys(SUBJECTS).length})`);
  check(seenSrc.size === Object.keys(SOURCES).length, `every source reachable (${seenSrc.size}/${Object.keys(SOURCES).length})`);
  check(seenView.size === Object.keys(VIEWS).length, `every view reachable (${seenView.size}/${Object.keys(VIEWS).length})`);
  const missLens = Object.keys(LENSES).filter((k) => !seenLens.has(k));
  check(missLens.length === 0, `every lens reachable${missLens.length ? ' — missing: ' + missLens.join(', ') : ''}`);
}

console.log('\n— the space is actually large, and diverse —');
{
  const size = spaceSize();
  check(size > 500, `vocabulary admits ${size.toLocaleString()} distinct type-correct shapes (before params)`);
  const shapes = new Set();
  for (let i = 0; i < 4000; i++) shapes.add(fingerprint(generateToy('div-' + i)));
  check(shapes.size > 150, `4000 seeds yielded ${shapes.size} distinct shapes`);
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures === 0 ? 1 * 0 : 1);
