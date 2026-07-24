// lathe/engine.js — the procedural social-toy generator.
//
// THE THESIS. The ~40 hand-written social toys across mino.mobi are not 40
// unrelated ideas; they are 40 points in one small space. Every one of them is
// some binding of accounts (a SUBJECT), pulled through a public-data reader (a
// SOURCE), squeezed by one or two measurements (LENSES), and drawn (a VIEW) —
// occasionally writing something back (a SINK). unique = one handle → their
// posts → n-grams → ranked list. squares = one handle → interactions → top-k →
// avatar grid. web = one handle → posts → link co-occurrence → force graph.
//
// So: don't write the 41st toy. Write the space, and walk it.
//
// WHAT MAKES THIS A GENERATOR AND NOT A SHUFFLER. A random draw from four bags
// mostly yields nonsense — "follower list → Flesch reading level → image wall"
// is not a toy, it's a type error. This engine is a TYPED PIPELINE ALGEBRA: every
// node declares the port it consumes and the port it emits, and a genome is built
// by a typed random walk, so a toy is correct BY CONSTRUCTION. `validate()` is the
// oracle that re-checks it independently (the fable/forge move: mint freely, admit
// only what the one oracle certifies), and the node selftest asserts the invariant
// over thousands of seeds.
//
// THE VOCABULARY IS EXACTLY WHAT THE RUNTIME IMPLEMENTS. Every node named here has
// a real executor in runtime.js running against public, CORS-open Bluesky APIs. No
// node is aspirational — a generated permalink that can't run is worse than no toy.
//
// DETERMINISM IS LOAD-BEARING. seed → genome, for ever, on any machine (borges'
// rule). That is what makes /lathe/t/<seed> a permanent address for a toy rather
// than a lucky roll. Never put Date.now()/unseeded Math.random() in the generator.
//
// Shared verbatim by the browser page, the worker, and engine.selftest.mjs — run
// the selftest before touching anything in here.

// ── seeded rng (xmur3 + mulberry32, the repo's standard pair) ────────────────
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A fresh deterministic stream for `seed`, salted so independent draws within one
 *  toy (structure vs. params vs. naming) don't correlate. */
export function rngFrom(seed, salt = '') {
  return mulberry32(xmur3(String(seed) + '::' + salt)());
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const pickInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// ── PORTS — the types that flow between stages ───────────────────────────────
// A port is the shape of a table. Two nodes compose iff the upstream `out` equals
// the downstream `in`. That single rule is the whole type system.
export const PORTS = {
  posts:    { label: 'posts',    blurb: 'a table of posts — text, time, engagement, media, links' },
  accounts: { label: 'accounts', blurb: 'a table of accounts — handle, avatar, counts' },
  terms:    { label: 'terms',    blurb: 'a table of words or phrases with weights' },
  edges:    { label: 'edges',    blurb: 'a table of weighted links between things' },
  series:   { label: 'series',   blurb: 'buckets over a cycle or a timeline' },
  scalars:  { label: 'scalars',  blurb: 'one or two numbers attached to each item' },
  images:   { label: 'images',   blurb: 'a table of pictures with their posts' },
};

// ── SUBJECTS — what the toy is pointed at ────────────────────────────────────
export const SUBJECTS = {
  one:  { label: 'one handle',  arity: 1, inputs: ['handle'],            blurb: 'a single account' },
  two:  { label: 'two handles', arity: 2, inputs: ['handle', 'other'],   blurb: 'a pair, compared' },
  list: { label: 'a list',      arity: 1, inputs: ['list'],              blurb: 'everyone on a Bluesky list' },
};

// ── SOURCES — subject → port. All read public data, no auth. ─────────────────
// `subjects` limits which bindings a source is meaningful for.
//
// CAPABILITIES are a refinement on top of the port types. Two sources can both
// emit `posts` and still differ in what those posts CARRY: the feed API returns
// like/repost counts, a raw repo download does not. Ports alone would happily
// mint "every post you ever wrote → what landed → a scatter plot" and draw a
// field of zeroes. So sources declare what they `provide`, lenses declare what
// they `need`, and the typed walk honours both — a well-typed toy that cannot
// say anything is still a dud, and the oracle should refuse it.
export const SOURCES = {
  posts: {
    provides: ['engagement', 'thumbs'],
    label: 'their posts', noun: 'posts', out: 'posts', subjects: ['one', 'two', 'list'],
    blurb: 'everything they have posted, newest first', api: 'getAuthorFeed',
  },
  media: {
    provides: ['engagement', 'thumbs'],
    label: 'their pictures', noun: 'pictures', out: 'posts', subjects: ['one', 'two', 'list'],
    blurb: 'only the posts that carry images', api: 'getAuthorFeed(media)',
  },
  likes: {
    provides: ['engagement', 'thumbs'],
    label: 'what they liked', noun: 'likes', out: 'posts', subjects: ['one', 'two'],
    blurb: 'the posts they hit like on, pulled straight from their repo', api: 'listRecords(like) → getPosts',
  },
  reposts: {
    provides: ['engagement', 'thumbs'],
    label: 'what they reposted', noun: 'reposts', out: 'posts', subjects: ['one', 'two'],
    blurb: 'their reposts — taste, as distinct from voice', api: 'listRecords(repost) → getPosts',
  },
  archive: {
    // The answer to "why is this truncated": the feed API pages, this does not.
    // One getRepo call returns the entire repository as a CAR, parsed to every
    // post the account has ever written. No engagement counts ride along, hence
    // the capability declaration — see the note above.
    provides: ['thumbs'],
    label: 'their whole archive', noun: 'archive', out: 'posts', subjects: ['one', 'two'],
    blurb: 'every post they have ever written, from a full repo download — slower, but complete',
    api: 'com.atproto.sync.getRepo (CAR) → WASM parse',
  },
  follows: {
    label: 'who they follow', noun: 'follows', out: 'accounts', subjects: ['one', 'two', 'list'],
    blurb: 'the accounts they follow', api: 'getFollows',
  },
  followers: {
    label: 'who follows them', noun: 'followers', out: 'accounts', subjects: ['one', 'two'],
    blurb: 'the accounts following them', api: 'getFollowers',
  },
  mutuals: {
    label: 'their mutuals', noun: 'mutuals', out: 'accounts', subjects: ['one', 'two'],
    blurb: 'follows that follow back', api: 'getFollows ∩ getFollowers',
  },
  members: {
    label: 'the list members', noun: 'members', out: 'accounts', subjects: ['list'],
    blurb: 'everyone on the list', api: 'getList',
  },
  blocks: {
    label: 'who they block', noun: 'blocks', out: 'accounts', subjects: ['one', 'two'],
    blurb: 'their public block records', api: 'listRecords(block)',
  },
};

// ── LENSES — port → port. The measurements. ──────────────────────────────────
// `pair: true` marks a lens that only means something when two sets are compared
// (subject `two`), e.g. overlap. `terminal: true` lenses are worth ending on.
export const LENSES = {
  ngrams: {
    label: 'the phrases in them', noun: 'phrases', in: 'posts', out: 'terms',
    blurb: 'chop the text into word runs and count them',
    params: (rng) => ({ n: pick(rng, [1, 2, 3]) }),
    describe: (p) => `${p.n === 1 ? 'single words' : p.n === 2 ? 'two-word phrases' : 'three-word phrases'}`,
  },
  distinctive: {
    label: 'what is distinctive in them', noun: 'idiom', in: 'posts', out: 'terms',
    blurb: 'words weighted against ordinary English, so only the peculiar float up',
    params: () => ({}), describe: () => 'against a baseline of common English',
  },
  hashtags: {
    label: 'the hashtags', noun: 'hashtags', in: 'posts', out: 'terms',
    blurb: 'every tag they used, counted', params: () => ({}), describe: () => '',
  },
  domains: {
    label: 'the sites they link', noun: 'sites', in: 'posts', out: 'terms',
    blurb: 'the domains behind their outbound links', params: () => ({}), describe: () => '',
  },
  clock: {
    label: 'the hour of day', noun: 'hours', in: 'posts', out: 'series',
    blurb: 'fold every post onto a 24-hour dial', params: () => ({}), describe: () => 'in your timezone',
  },
  weekday: {
    label: 'the day of week', noun: 'days', in: 'posts', out: 'series',
    blurb: 'which days they show up', params: () => ({}), describe: () => '',
  },
  overTime: {
    label: 'the run of months', noun: 'months', in: 'posts', out: 'series',
    blurb: 'volume month by month', params: () => ({}), describe: () => '',
  },
  sentiment: {
    label: 'the mood', noun: 'mood', in: 'posts', out: 'series',
    blurb: 'sentiment-scored and averaged over time, off an open word list',
    params: () => ({}), describe: () => 'AFINN-style word scores',
  },
  lengths: {
    label: 'how long they run', noun: 'length', in: 'posts', out: 'scalars',
    blurb: 'word count against character count', params: () => ({}), describe: () => '',
  },
  readability: {
    label: 'how hard they read', noun: 'difficulty', in: 'posts', out: 'scalars',
    blurb: 'Flesch reading ease against length', params: () => ({}), describe: () => 'Flesch reading ease',
  },
  engagement: {
    needs: ['engagement'],
    label: 'what landed', noun: 'reach', in: 'posts', out: 'scalars',
    blurb: 'likes and reposts against length', params: () => ({}), describe: () => '',
  },
  pictures: {
    label: 'the pictures in them', noun: 'pictures', in: 'posts', out: 'images',
    blurb: 'pull out every attached image', params: () => ({}), describe: () => '',
  },
  mentions: {
    label: 'who they name', noun: 'names', in: 'posts', out: 'edges',
    blurb: 'an edge to every account they mention', params: () => ({}), describe: () => '',
  },
  cooccur: {
    label: 'what travels together', noun: 'company', in: 'posts', out: 'edges',
    blurb: 'link two tags whenever they share a post — the shape of their topics',
    params: () => ({}), describe: () => '',
  },
  replyTo: {
    label: 'who they answer', noun: 'replies', in: 'posts', out: 'edges',
    blurb: 'an edge to everyone they replied to', params: () => ({}), describe: () => '',
  },
  reach: {
    label: 'how big they are', noun: 'clout', in: 'accounts', out: 'scalars',
    blurb: 'followers against follows — the ratio that reads as clout',
    params: () => ({}), describe: () => '',
  },
  overlap: {
    label: 'what they share', noun: 'common ground', in: 'accounts', out: 'accounts', pair: true,
    blurb: 'keep only the accounts present on both sides', params: () => ({}), describe: () => '',
  },
  exclusive: {
    label: 'what only one has', noun: 'difference', in: 'accounts', out: 'accounts', pair: true,
    blurb: 'keep only the accounts present on exactly one side', params: () => ({}), describe: () => '',
  },
  handles: {
    label: 'the shape of their names', noun: 'handles', in: 'accounts', out: 'terms',
    blurb: 'count the pieces handles are built from', params: () => ({}), describe: () => '',
  },
  bios: {
    label: 'the words in their bios', noun: 'bios', in: 'accounts', out: 'terms',
    blurb: 'what a crowd says about itself, pooled from every profile description',
    params: () => ({}), describe: () => '',
  },
};

// ── VIEWS — port → pixels ────────────────────────────────────────────────────
export const VIEWS = {
  ranked:  { label: 'a ranked table',  in: 'terms',    blurb: 'ordered, with bars' },
  cloud:   { label: 'a word cloud',    in: 'terms',    blurb: 'size is weight' },
  dial:    { label: 'a radial dial',   in: 'series',   blurb: 'a cycle drawn round a circle' },
  bars:    { label: 'a bar chart',     in: 'series',   blurb: 'buckets, side by side' },
  scatter: { label: 'a scatter plot',  in: 'scalars',  blurb: 'one dot per item, two axes' },
  histo:   { label: 'a histogram',     in: 'scalars',  blurb: 'the distribution of one axis' },
  graph:   { label: 'a force graph',   in: 'edges',    blurb: 'nodes pushed apart, edges pulling in' },
  grid:    { label: 'an avatar grid',  in: 'accounts', blurb: 'faces, packed' },
  wall:    { label: 'a picture wall',  in: 'images',   blurb: 'an are.na-style wall' },
};

// ── SINKS — the optional write-back. Scope is DERIVED from the sink. ─────────
// This is where "procedurally scoped OAuth" lives: a toy asks for exactly the
// scope its own genome implies, and nothing more. A toy with no sink never
// mentions login at all.
export const SINKS = {
  none:  { label: 'read-only', scope: null, blurb: 'writes nothing, never asks who you are' },
  share: {
    label: 'post the finding', scope: 'atproto repo:app.bsky.feed.post',
    collection: 'app.bsky.feed.post',
    blurb: 'lets you post this toy’s headline result to Bluesky — the consent screen asks for posting, and nothing else',
  },
};

// ── the typed walk ───────────────────────────────────────────────────────────
const lensesFrom = (port, subject, caps) => Object.entries(LENSES)
  .filter(([, l]) => l.in === port && (!l.pair || subject === 'two')
    && (!l.needs || !caps || l.needs.every((c) => caps.has(c))))
  .map(([k]) => k);
const viewsFor = (port) => Object.entries(VIEWS).filter(([, v]) => v.in === port).map(([k]) => k);

/** Ports a view can consume — used to know when a walk may stop. */
const VIEWABLE = new Set(Object.values(VIEWS).map((v) => v.in));

/**
 * seed → a complete, type-correct toy specification.
 *
 * The walk: bind a subject, choose a source it supports, then chain lenses while
 * the current port has somewhere to go, stopping as soon as a view can draw it.
 * Because every step is chosen from the set of type-compatible successors, the
 * result cannot be ill-typed — validate() then proves it independently.
 */
export function generateToy(seed, opts = {}) {
  const s = String(seed);
  const rs = rngFrom(s, 'structure');
  const rp = rngFrom(s, 'params');

  // 1. subject
  const subject = opts.subject || pick(rs, Object.keys(SUBJECTS));

  // 2. source that supports it
  const srcKeys = Object.keys(SOURCES).filter((k) => SOURCES[k].subjects.includes(subject));
  const source = opts.source || pick(rs, srcKeys);
  let port = SOURCES[source].out;
  const caps = new Set(SOURCES[source].provides || []);

  // 3. lens chain — a typed walk. Keep going while this port has lenses; stop
  //    early (biased by depth) once something can already draw it.
  const chain = [];
  const maxLen = pickInt(rs, 1, 2);
  for (let step = 0; step < maxLen; step++) {
    const options = lensesFrom(port, subject, caps).filter((k) => !chain.some((c) => c.lens === k));
    if (!options.length) break;
    // If the current port is already drawable, we're allowed to stop; roll for it.
    // Stopping at step 0 draws a source raw — that is exactly what squares and
    // cluster are (follows → a grid of faces), so the space must contain it. The
    // roll is lower there, since most toys want at least one measurement.
    if (VIEWABLE.has(port) && rs() < (step === 0 ? 0.22 : 0.6)) break;
    const lens = pick(rs, options);
    const def = LENSES[lens];
    chain.push({ lens, params: def.params ? def.params(rp) : {} });
    port = def.out;
  }

  // 4. a view for whatever we ended on. The walk can strand on a port nothing
  //    draws (e.g. a pair-lens returning accounts with no grid in scope) — in that
  //    case back off the last lens until something can draw. Guaranteed to
  //    terminate: every SOURCE emits a port that at least one VIEW consumes.
  while (!viewsFor(port).length && chain.length) {
    chain.pop();
    port = chain.length ? LENSES[chain[chain.length - 1].lens].out : SOURCES[source].out;
  }
  const view = opts.view || pick(rs, viewsFor(port));

  // 5. sink — most toys are read-only; a minority offer the scoped write.
  const sink = opts.sink || (rs() < 0.35 ? 'share' : 'none');

  // 6. sampled knobs
  // Row budgets. These are deliberately generous: a toy that shows you the top 12
  // of something is a demo, not a tool. The runtime reports what it dropped rather
  // than truncating silently.
  const limit = pick(rp, [400, 900, 1800, 3500]);
  const topK = pick(rp, [30, 60, 120, 250]);

  const genome = { seed: s, subject, source, chain, view, sink, port, limit, topK };
  genome.title = titleFor(genome);
  genome.tagline = taglineFor(genome);
  genome.scope = SINKS[sink].scope;
  genome.fingerprint = fingerprint(genome);
  return genome;
}

/**
 * Roll toys that satisfy user-chosen constraints — "give me graph toys about two
 * handles", "anything that reads the archive".
 *
 * Rejection sampling over seeds rather than forcing the choices, deliberately: a
 * forced combination can be ill-typed (subject `list` + source `likes`) or starved
 * (source `archive` + lens `engagement`), and a generator that hands back broken
 * toys on request is worse than one that says the corner is empty. Every toy this
 * returns came out of the ordinary walk and carries its own real seed, so its
 * permalink is exactly as permanent as any other.
 *
 * @param c {subject?, source?, lens?, view?, sink?} — any field may be omitted
 * @returns {toys[], scanned, exhausted} — `exhausted` means the space really has
 *          no more matches, not that we gave up early.
 */
export function rollToys(c = {}, opts = {}) {
  const want = Math.max(1, opts.count || 12);
  const start = Math.max(1, Math.floor(opts.start || 1));
  const budget = Math.max(want * 40, opts.budget || 6000);
  const out = [], seen = new Set();
  let scanned = 0;
  for (let i = 0; i < budget && out.length < want; i++) {
    scanned++;
    const g = generateToy(String(start + i));
    if (!validate(g).ok) continue;
    if (c.subject && g.subject !== c.subject) continue;
    if (c.source && g.source !== c.source) continue;
    if (c.view && g.view !== c.view) continue;
    if (c.sink && g.sink !== c.sink) continue;
    if (c.lens && !g.chain.some((s) => s.lens === c.lens)) continue;
    const fp = fingerprint(g);
    if (opts.distinct !== false && seen.has(fp)) continue;   // don't shelve one shape twice
    seen.add(fp);
    out.push(g);
  }
  return { toys: out, scanned, exhausted: out.length < want };
}

/** Which constraint values can still yield a toy, given the others. Powers the
 *  picker so it can grey out corners of the space that are provably empty. */
export function feasible(c = {}) {
  const fields = ['subject', 'source', 'lens', 'view'];
  const out = {};
  for (const f of fields) {
    const universe = f === 'subject' ? Object.keys(SUBJECTS) : f === 'source' ? Object.keys(SOURCES)
      : f === 'lens' ? Object.keys(LENSES) : Object.keys(VIEWS);
    out[f] = universe.filter((v) => rollToys({ ...c, [f]: v }, { count: 1, budget: 900 }).toys.length > 0);
  }
  return out;
}

// ── the oracle ───────────────────────────────────────────────────────────────
/**
 * Independently certify a genome. Mirrors fable/forge: the generator may propose
 * anything; only what this admits can ship. Returns {ok, errors[]}.
 */
export function validate(g) {
  const errors = [];
  const bad = (m) => errors.push(m);

  if (!g || typeof g !== 'object') return { ok: false, errors: ['not an object'] };
  if (!SUBJECTS[g.subject]) bad(`unknown subject "${g.subject}"`);
  if (!SOURCES[g.source]) bad(`unknown source "${g.source}"`);
  else if (SUBJECTS[g.subject] && !SOURCES[g.source].subjects.includes(g.subject)) {
    bad(`source "${g.source}" does not support subject "${g.subject}"`);
  }
  if (!VIEWS[g.view]) bad(`unknown view "${g.view}"`);
  if (!SINKS[g.sink]) bad(`unknown sink "${g.sink}"`);
  if (errors.length) return { ok: false, errors };

  // type-check the chain end to end
  let port = SOURCES[g.source].out;
  const caps = new Set(SOURCES[g.source].provides || []);
  for (const step of (g.chain || [])) {
    const def = LENSES[step.lens];
    if (!def) { bad(`unknown lens "${step.lens}"`); return { ok: false, errors }; }
    if (def.in !== port) { bad(`lens "${step.lens}" wants ${def.in}, got ${port}`); return { ok: false, errors }; }
    if (def.pair && g.subject !== 'two') bad(`lens "${step.lens}" needs two handles`);
    // capability check: well-typed but starved of the data it measures
    for (const need of (def.needs || [])) {
      if (!caps.has(need)) bad(`lens "${step.lens}" needs ${need}, which "${g.source}" does not provide`);
    }
    port = def.out;
  }
  if (VIEWS[g.view].in !== port) bad(`view "${g.view}" wants ${VIEWS[g.view].in}, got ${port}`);
  // a sink that writes must carry the scope that authorises exactly that write
  const sink = SINKS[g.sink];
  if (sink.collection && g.scope && !g.scope.includes(`repo:${sink.collection}`)) {
    bad(`sink "${g.sink}" writes ${sink.collection} but scope does not authorise it`);
  }
  return { ok: errors.length === 0, errors, port };
}

// ── naming — a toy needs to be called something ──────────────────────────────
const TITLE_BY_VIEW = {
  ranked: ['the tally', 'the ledger', 'the count', 'the register'],
  cloud: ['the drift', 'the haze', 'the swarm', 'the cloud'],
  dial: ['the dial', 'the clock', 'the round', 'the hours'],
  bars: ['the bars', 'the comb', 'the ranks', 'the run'],
  scatter: ['the scatter', 'the field', 'the spray', 'the cloudfield'],
  histo: ['the spread', 'the curve', 'the mass', 'the bell'],
  graph: ['the web', 'the mesh', 'the lattice', 'the tangle'],
  grid: ['the wall', 'the muster', 'the gallery', 'the company'],
  wall: ['the wall', 'the salon', 'the plates', 'the hoard'],
};
function titleFor(g) {
  const r = rngFrom(g.seed, 'title');
  const head = pick(r, TITLE_BY_VIEW[g.view] || ['the toy']);
  // Name after the LAST thing the toy did — its final lens, or the source if it
  // draws one raw. Every node carries an explicit `noun` because deriving one from
  // the label lands on grammar words ("how big they are" → "are").
  const tail = g.chain.length ? LENSES[g.chain[g.chain.length - 1].lens] : SOURCES[g.source];
  return `${head} of ${tail.noun || 'things'}`;
}
function taglineFor(g) {
  const subj = SUBJECTS[g.subject].label;
  const src = SOURCES[g.source].label;
  const lens = g.chain.map((c) => LENSES[c.lens].label).join(', then ');
  const view = VIEWS[g.view].label;
  return `${subj} → ${src}${lens ? ' → ' + lens : ''} → ${view}`;
}

/** A stable set-of-nodes signature, for dedupe and resemblance. */
export function fingerprint(g) {
  return [g.subject, g.source, ...g.chain.map((c) => c.lens), g.view].join('·');
}

// ── the known toys, encoded ──────────────────────────────────────────────────
// The thesis, made falsifiable: if the space is real, the hand-written toys must
// be expressible as points inside it. Each of these is a genome for a tool that
// actually exists on mino.mobi. The selftest asserts every one of them validates
// under the same algebra that generates new ones — so a generated toy is the same
// KIND of object as unique, squares or web, not a lesser imitation.
export const KNOWN = [
  { id: 'unique',  name: 'unique',  url: '/unique/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'ngrams', params: { n: 3 } }], view: 'ranked', sink: 'none' } },
  { id: 'meme',    name: 'meme',    url: '/meme/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'ngrams', params: { n: 3 } }], view: 'ranked', sink: 'none' } },
  { id: 'web',     name: 'rite/web', url: 'https://rite.mino.mobi/web/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'cooccur', params: {} }], view: 'graph', sink: 'none' } },
  { id: 'squares', name: 'squares', url: '/squares/',
    genome: { subject: 'one', source: 'follows', chain: [], view: 'grid', sink: 'none' } },
  { id: 'lexicon', name: 'rite/lexicon', url: 'https://rite.mino.mobi/lexicon/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'distinctive', params: {} }], view: 'cloud', sink: 'none' } },
  { id: 'atlas',   name: 'rite/atlas', url: 'https://rite.mino.mobi/atlas/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'readability', params: {} }], view: 'scatter', sink: 'none' } },
  { id: 'signal',  name: 'rite/signal', url: 'https://rite.mino.mobi/signal/',
    genome: { subject: 'one', source: 'reposts', chain: [{ lens: 'distinctive', params: {} }], view: 'cloud', sink: 'none' } },
  { id: 'density', name: 'density', url: 'https://mino.mobi/density/',
    genome: { subject: 'one', source: 'posts', chain: [{ lens: 'lengths', params: {} }], view: 'histo', sink: 'none' } },
  { id: 'cluster', name: 'cluster', url: 'https://mino.mobi/cluster/',
    genome: { subject: 'one', source: 'mutuals', chain: [], view: 'grid', sink: 'none' } },
  { id: 'echo',    name: 'echo',    url: 'https://mino.mobi/echo/',
    genome: { subject: 'two', source: 'posts', chain: [{ lens: 'overTime', params: {} }], view: 'bars', sink: 'none' } },
  { id: 'gallery', name: 'photo wall', url: 'https://photo.mino.mobi',
    genome: { subject: 'one', source: 'media', chain: [{ lens: 'pictures', params: {} }], view: 'wall', sink: 'none' } },
  { id: 'seek',    name: 'seek', url: 'https://mino.mobi/seek/',
    genome: { subject: 'two', source: 'follows', chain: [{ lens: 'overlap', params: {} }], view: 'grid', sink: 'none' } },
];

/** Nearest known toy to a genome, by node-set Jaccard. Lets a generated toy say
 *  what it is a cousin of — and lets the gallery skip rediscovering what exists. */
export function resemblance(g) {
  const mine = new Set(fingerprint(g).split('·'));
  let best = null;
  for (const k of KNOWN) {
    const theirs = new Set(fingerprint({ ...k.genome, chain: k.genome.chain }).split('·'));
    let inter = 0;
    for (const t of theirs) if (mine.has(t)) inter++;
    const union = new Set([...mine, ...theirs]).size;
    const j = union ? inter / union : 0;
    if (!best || j > best.score) best = { ...k, score: j };
  }
  return best;
}

/** How many distinct type-correct shapes the vocabulary admits (chains ≤ 2,
 *  ignoring sampled params). Honest arithmetic for the "size of the space" claim. */
export function spaceSize() {
  let total = 0;
  for (const subject of Object.keys(SUBJECTS)) {
    for (const [sk, src] of Object.entries(SOURCES)) {
      if (!src.subjects.includes(subject)) continue;
      const caps = new Set(src.provides || []);
      const walk = (port, depth, used) => {
        let n = viewsFor(port).length;                       // stop here
        if (depth < 2) {
          for (const lk of lensesFrom(port, subject, caps)) {
            if (used.has(lk)) continue;
            n += walk(LENSES[lk].out, depth + 1, new Set([...used, lk]));
          }
        }
        return n;
      };
      total += walk(src.out, 0, new Set());
    }
  }
  return total * Object.keys(SINKS).length;
}

// Browser <script type="module"> and the worker use the exports; node selftests
// and non-module consumers reach it through globalThis (the rite/borges pattern).
if (typeof globalThis !== 'undefined') {
  globalThis.LATHE = { generateToy, rollToys, feasible, validate, resemblance, fingerprint, spaceSize, SUBJECTS, SOURCES, LENSES, VIEWS, SINKS, PORTS, KNOWN };
}
