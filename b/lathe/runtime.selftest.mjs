// node b/lathe/runtime.selftest.mjs
// The honesty gates. Two things must hold or a generated permalink can lie:
//   1. every node the engine can mint has an executor here (no aspirational nodes);
//   2. the lens implementations actually compute something on realistic input.
//
// WHAT THIS FILE CANNOT CATCH — read before trusting it. It checks that every node
// NAME has an executor. A name having an executor does NOT mean every BINDING of it
// runs: `list × posts` shipped broken because the executor existed but nothing
// expanded a list into its members, so it asked the API for actor=undefined and got
// a 400 — and every gate here still passed. Binding coverage needs the network, so
// it lives in live.smoke.mjs, which runs every (subject × source) pair for real.
// Run BOTH before shipping engine or runtime changes.

import { SOURCES, LENSES, VIEWS } from './engine.js';
import { REGISTRY, __test } from './runtime.js';

const { LENS, PAIR_LENS, tokenize } = __test;
let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

console.log('— vocabulary and runtime are the same set —');
{
  const missSrc = Object.keys(SOURCES).filter((k) => !REGISTRY.sources.includes(k));
  const missLens = Object.keys(LENSES).filter((k) => !REGISTRY.lenses.includes(k));
  const missView = Object.keys(VIEWS).filter((k) => !REGISTRY.views.includes(k));
  check(!missSrc.length, `every source has an executor${missSrc.length ? ' — missing: ' + missSrc : ''}`);
  check(!missLens.length, `every lens has an executor${missLens.length ? ' — missing: ' + missLens : ''}`);
  check(!missView.length, `every view has a renderer${missView.length ? ' — missing: ' + missView : ''}`);

  const extraSrc = REGISTRY.sources.filter((k) => !SOURCES[k]);
  const extraLens = REGISTRY.lenses.filter((k) => !LENSES[k]);
  const extraView = REGISTRY.views.filter((k) => !VIEWS[k]);
  check(!extraSrc.length && !extraLens.length && !extraView.length,
    'no orphan executors the engine can never reach');
}

console.log('\n— pair lenses are declared as such in the engine —');
{
  const declared = Object.keys(LENSES).filter((k) => LENSES[k].pair);
  const implemented = Object.keys(PAIR_LENS);
  check(declared.sort().join() === implemented.sort().join(),
    `pair lenses agree (${implemented.join(', ')})`);
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const mkPost = (text, at, over = {}) => ({
  uri: 'at://did:plc:x/app.bsky.feed.post/' + Math.abs(text.length * 7919).toString(36),
  text, at: Date.parse(at), author: { did: 'did:plc:x', handle: 'a.test', avatar: null },
  likes: 3, reposts: 1, replies: 0, images: [], links: [], tags: [], mentions: [], replyToDid: null, ...over,
});
const POSTS = [
  mkPost('the wibble is a wonderful thing and I love it', '2026-03-02T09:15:00Z', { tags: ['wibble'], links: ['https://example.com/a'] }),
  mkPost('the wibble returns. terrible awful day', '2026-03-04T22:40:00Z', { tags: ['wibble', 'mood'], links: ['https://example.com/b', 'https://other.org/z'] }),
  mkPost('a short one', '2026-04-11T13:00:00Z', { images: [{ thumb: 't', full: 'f', alt: 'pic' }] }),
  mkPost('mentions someone here', '2026-04-12T13:00:00Z', { mentions: ['did:plc:friend'], replyToDid: 'did:plc:friend' }),
];
const ACCTS = [
  { did: 'd1', handle: 'alice.bsky.social', avatar: null, followers: 900, follows: 100, description: 'potter and gardener in leeds' },
  { did: 'd2', handle: 'bob.bsky.social', avatar: null, followers: 20, follows: 400, description: 'gardener, birder, potter' },
];
const ACCTS_B = [
  { did: 'd2', handle: 'bob.bsky.social', avatar: null, followers: 20, follows: 400 },
  { did: 'd3', handle: 'carol.bsky.social', avatar: null, followers: 5, follows: 5 },
];

console.log('\n— the text lenses compute —');
{
  const bi = LENS.ngrams(POSTS, { n: 2 });
  check(bi.length > 0 && bi[0].weight >= 1, `ngrams(2) produced ${bi.length} phrases`);
  check(bi.some((r) => r.term === 'the wibble' && r.weight === 2), 'repeated phrase counted twice');
  const uni = LENS.ngrams(POSTS, { n: 1 });
  check(!uni.some((r) => r.term === 'the'), 'all-stopword grams dropped');

  const d = LENS.distinctive(POSTS);
  check(d.length > 0 && d.every((r) => r.count > 1), 'distinctive keeps only repeated content words');

  const tags = LENS.hashtags(POSTS);
  check(tags[0].term === '#wibble' && tags[0].weight === 2, 'hashtags counted and ranked');

  const dom = LENS.domains(POSTS);
  check(dom.some((r) => r.term === 'example.com' && r.weight === 2), 'link domains rolled up');
}

console.log('\n— the series lenses bucket —');
{
  const clock = LENS.clock(POSTS);
  check(clock.length === 24 && clock.reduce((a, b) => a + b.value, 0) === 4, '24 hour buckets, every post placed');
  const wd = LENS.weekday(POSTS);
  check(wd.length === 7 && wd.reduce((a, b) => a + b.value, 0) === 4, '7 weekday buckets');
  const ot = LENS.overTime(POSTS);
  check(ot.length === 2 && ot[0].label === '2026-03' && ot[0].value === 2, 'months ordered and counted');
  const sen = LENS.sentiment(POSTS);
  check(sen.length >= 1 && sen.every((r) => isFinite(r.value)), 'sentiment produces finite values');
  const march = sen.find((r) => r.label === '2026-03');
  check(march && isFinite(march.value), 'the month with scored words has a mood');
}

console.log('\n— the scalar lenses measure —');
{
  const len = LENS.lengths(POSTS);
  check(len.length === 4 && len.every((r) => r.x > 0 && r.y > 0), 'lengths gives words × characters');
  const rd = LENS.readability(POSTS);
  check(rd.length > 0 && rd.every((r) => isFinite(r.y)), 'Flesch scores are finite');
  const en = LENS.engagement(POSTS);
  check(en.length === 4 && en.every((r) => r.y === 4), 'engagement sums likes + reposts');
  const reach = LENS.reach(ACCTS);
  check(reach.length === 2 && reach[0].y === 900, 'reach reads follower counts');
}

console.log('\n— the structural lenses build edges/images/terms —');
{
  const pics = LENS.pictures(POSTS);
  check(pics.length === 1 && pics[0].alt === 'pic', 'pictures extracted with their post');
  const men = LENS.mentions(POSTS);
  check(men.length === 1 && men[0].weight === 1, 'mention edges built');
  const rep = LENS.replyTo(POSTS);
  check(rep.length === 1, 'reply edges built');
  const co = LENS.cooccur(POSTS);
  check(co.length > 0 && co.every((e) => e.from && e.to && e.weight > 0), `co-occurrence produced ${co.length} edges`);
  const h = LENS.handles(ACCTS);
  check(h.some((r) => r.term === 'alice'), 'handle parts counted');
  const bios = LENS.bios(ACCTS);
  check(bios.some((r) => r.term === 'gardener' && r.weight === 2), 'bio words pooled across the crowd');
  check(!bios.some((r) => r.term === 'and'), 'bio stopwords dropped');
}

console.log('\n— pair lenses fold two sets into one —');
{
  const ov = PAIR_LENS.overlap(ACCTS, ACCTS_B);
  check(ov.length === 1 && ov[0].did === 'd2', 'overlap keeps only the shared account');
  const ex = PAIR_LENS.exclusive(ACCTS, ACCTS_B);
  check(ex.length === 2 && !ex.some((a) => a.did === 'd2'), 'exclusive drops the shared account');
}

console.log('\n— tokenizer —');
{
  check(!tokenize('go to https://x.com/y now').includes('https'), 'URLs stripped');
  check(!tokenize('hi @alice.bsky.social there').some((w) => w.includes('alice')), 'handles stripped');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
