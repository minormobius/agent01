// node b/lathe/engine.selftest.mjs
// Gates: determinism, the type invariant over a large sample, sink/scope
// coherence, the known-toy encodings (the thesis), coverage of the vocabulary,
// and termination of the typed walk.

import {
  generateToy, rollToys, validate, resemblance, fingerprint, spaceSize, VOCAB,
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

console.log('\n— coverage: every node is reachable while it is alive —');
{
  // Coverage has to be checked per vocabulary version: a retired node (handles,
  // until:2) is correctly unreachable today but must still be reachable at the
  // versions where it lived, or its pinned permalinks would be unreproducible.
  const seenAt = new Map();                      // vocab -> {src,lens,view,subj}
  for (let v = 1; v <= VOCAB; v++) {
    const acc = { src: new Set(), lens: new Set(), view: new Set(), subj: new Set() };
    for (let i = 0; i < 6000; i++) {
      const g = generateToy(`cov-${v}-${i}`, { vocab: v });
      acc.subj.add(g.subject); acc.src.add(g.source); acc.view.add(g.view);
      g.chain.forEach((c) => acc.lens.add(c.lens));
    }
    seenAt.set(v, acc);
  }
  const aliveAt = (def, v) => (def.since || 1) <= v && (def.until == null || v <= def.until);
  const everReached = (name, all, key) => {
    for (let v = 1; v <= VOCAB; v++) if (aliveAt(all[name], v) && seenAt.get(v)[key].has(name)) return true;
    return false;
  };
  const now = seenAt.get(VOCAB);
  check(now.subj.size === Object.keys(SUBJECTS).length, `every subject reachable (${now.subj.size}/${Object.keys(SUBJECTS).length})`);
  check(now.view.size === Object.keys(VIEWS).length, `every view reachable (${now.view.size}/${Object.keys(VIEWS).length})`);
  const missSrc = Object.keys(SOURCES).filter((k) => !everReached(k, SOURCES, 'src'));
  check(!missSrc.length, `every source reachable while alive${missSrc.length ? ' — missing: ' + missSrc.join(', ') : ''}`);
  const missLens = Object.keys(LENSES).filter((k) => !everReached(k, LENSES, 'lens'));
  check(!missLens.length, `every lens reachable while alive${missLens.length ? ' — missing: ' + missLens.join(', ') : ''}`);
  // and the retirement really took effect
  check(!now.lens.has('handles'), 'a retired lens is gone from the current space');
  check(seenAt.get(2).lens.has('handles'), 'but still reachable at the vocab it lived in (pinned links keep working)');
}

console.log('\n— capabilities: no well-typed but starved toys —');
{
  // `archive` reads a raw repo, which carries no like/repost counts. A toy that
  // measured engagement on it would type-check and draw a field of zeroes.
  let starved = 0;
  for (let i = 0; i < 6000; i++) {
    const g = generateToy('cap-' + i);
    const caps = new Set(SOURCES[g.source].provides || []);
    for (const step of g.chain) {
      for (const need of (LENSES[step.lens].needs || [])) if (!caps.has(need)) starved++;
    }
  }
  check(starved === 0, 'the walk never feeds a lens a source that cannot supply it');
  check(!validate({ subject: 'one', source: 'archive', chain: [{ lens: 'engagement', params: {} }], view: 'scatter', sink: 'none' }).ok,
    'oracle rejects archive → engagement (no counts in a raw repo)');
  check(validate({ subject: 'one', source: 'posts', chain: [{ lens: 'engagement', params: {} }], view: 'scatter', sink: 'none' }).ok,
    'oracle accepts posts → engagement (the feed API carries counts)');
  const arch = rollToys({ source: 'archive' }, { count: 3 });
  check(arch.toys.length === 3, 'archive toys are reachable');
  check(rollToys({ source: 'archive', lens: 'engagement' }, { count: 1, budget: 3000 }).toys.length === 0,
    'no seed anywhere yields archive + engagement');
}

console.log('\n— constrained rolling —');
{
  for (const c of [{ view: 'graph' }, { subject: 'two' }, { source: 'follows' }, { lens: 'clock' }, { sink: 'share' }]) {
    const r = rollToys(c, { count: 5 });
    const key = Object.keys(c)[0], val = c[key];
    const allMatch = r.toys.every((g) =>
      key === 'lens' ? g.chain.some((s) => s.lens === val) : g[key] === val);
    check(r.toys.length > 0 && allMatch, `roll ${key}=${val} → ${r.toys.length} toys, all matching`);
  }
  const r = rollToys({ subject: 'list', source: 'likes' }, { count: 1, budget: 2000 });
  check(r.toys.length === 0 && r.exhausted, 'an impossible corner reports empty rather than inventing one');
  const a = rollToys({ view: 'graph' }, { count: 4 });
  const b = rollToys({ view: 'graph' }, { count: 4 });
  check(JSON.stringify(a.toys.map((t) => t.seed)) === JSON.stringify(b.toys.map((t) => t.seed)),
    'constrained rolls are deterministic too');
  check(a.toys.every((g) => validate(g).ok), 'every constrained toy still certifies');
}

console.log('\n— vocabulary versioning keeps old permalinks meaningful —');
{
  // Growing the vocabulary changes what an unpinned seed produces; pinning must
  // reproduce the older space exactly, or /lathe/t/<seed>?v=1 is a lie.
  const NEW = new Set(['archive', 'bios', 'interlink', 'kinship']);
  let leaked = 0, invalid = 0;
  for (let i = 0; i < 3000; i++) {
    const g = generateToy('v-' + i, { vocab: 1 });
    if (NEW.has(g.source) || g.chain.some((c) => NEW.has(c.lens))) leaked++;
    if (!validate(g).ok) invalid++;
  }
  check(leaked === 0, 'a v1 toy never contains a node added in v2');
  check(invalid === 0, 'every v1 toy still certifies under the current oracle');
  const a = generateToy('77', { vocab: 1 }), b = generateToy('77', { vocab: 1 });
  check(JSON.stringify(a) === JSON.stringify(b), 'pinned generation is deterministic');
  check(generateToy('77').vocab === VOCAB, 'unpinned toys carry the current vocabulary');
  let differs = 0;
  for (let i = 0; i < 200; i++) {
    if (fingerprint(generateToy('d-' + i, { vocab: 1 })) !== fingerprint(generateToy('d-' + i))) differs++;
  }
  check(differs > 0, `growing the vocabulary really does move unpinned seeds (${differs}/200) — which is why pinning exists`);
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
