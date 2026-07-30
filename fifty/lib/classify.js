// fifty/lib/classify.js — content classification for the feed tools.
//
// Concepts 9 and 24 both need to answer "what kind of thing is this post". No
// model here on purpose: this is a transparent rule set you can read, disagree
// with, and correct in the UI. A learned classifier would be better at the job
// and worse at the thing that matters for a tool like this, which is that you
// can see exactly why a post was filed where it was.
//
// Every classification returns the rules that fired, so the interface can show
// its working rather than asserting a category.

export const CATEGORIES = [
  { id: 'news',      label: 'News & politics',   color: '#e5709a' },
  { id: 'tech',      label: 'Tech & computing',  color: '#7aa2f7' },
  { id: 'sports',    label: 'Sports',            color: '#98c379' },
  { id: 'art',       label: 'Art & photos',      color: '#c39cf0' },
  { id: 'games',     label: 'Games',             color: '#f0a868' },
  { id: 'science',   label: 'Science',           color: '#7dd3c0' },
  { id: 'food',      label: 'Food & drink',      color: '#e6b450' },
  { id: 'music',     label: 'Music & film',      color: '#d19a66' },
  { id: 'personal',  label: 'Personal & chatter', color: '#8a91a6' },
  { id: 'promo',     label: 'Promotion & links', color: '#6c7286' },
];

// Weighted term lists. Multi-word phrases are checked as phrases, which cuts
// most of the false positives that single keywords produce ("bill" vs "the bill").
const RULES = [
  ['news', 2.0, ['election', 'senate', 'congress', 'parliament', 'president', 'minister',
    'supreme court', 'legislation', 'ceasefire', 'protest', 'sanctions', 'indicted',
    'ruling', 'lawsuit', 'strike action', 'referendum', 'inflation', 'tariff', 'scotus']],
  ['tech', 2.0, ['typescript', 'javascript', 'rust', 'python', 'kubernetes', 'compiler',
    'open source', 'pull request', 'merge conflict', 'api', 'sdk', 'deploy', 'refactor',
    'database', 'latency', 'atproto', 'bluesky', 'self-hosted', 'regex', 'linux', 'git ',
    'framework', 'runtime', 'llm', 'model weights', 'gpu']],
  ['sports', 2.2, ['nba', 'nfl', 'mlb', 'premier league', 'world cup', 'olympic',
    'touchdown', 'offside', 'penalty kick', 'quarterback', 'grand slam', 'formula 1',
    'tour de france', 'the match', 'halftime', 'playoffs', 'transfer window']],
  ['art', 1.8, ['painting', 'illustration', 'sketch', 'watercolour', 'watercolor', 'gallery',
    'exhibition', 'portfolio', 'commission open', 'linocut', 'ceramics', 'shot on',
    'golden hour', 'long exposure', 'darkroom', 'my art', 'wip']],
  ['games', 2.0, ['speedrun', 'roguelike', 'playthrough', 'boss fight', 'nintendo',
    'playstation', 'steam deck', 'dungeon master', 'tabletop', 'ttrpg', 'd&d',
    'game jam', 'indie game', 'patch notes', 'nerf', 'respawn']],
  ['science', 1.9, ['peer review', 'preprint', 'arxiv', 'telescope', 'galaxy', 'genome',
    'protein', 'clinical trial', 'hypothesis', 'dataset', 'statistically', 'quantum',
    'fossil', 'ecology', 'neutrino', 'antibody', 'microbiome']],
  ['food', 2.0, ['recipe', 'sourdough', 'braised', 'roasted', 'fermenting', 'espresso',
    'pastry', 'cocktail', 'dinner', 'baked', 'restaurant', 'ramen', 'sauce', 'preheat']],
  ['music', 1.8, ['album', 'the record', 'setlist', 'gig', 'vinyl', 'playlist', 'guitar',
    'synth', 'a24', 'letterboxd', 'now watching', 'now playing', 'soundtrack',
    'director', 'season finale', 'rewatch']],
  ['promo', 1.5, ['subscribe', 'newsletter', 'my substack', 'link in bio', 'preorder',
    'out now', 'available now', 'sign up', 'kickstarter', 'patreon', 'ko-fi', 'discount code']],
];

/**
 * Classify one post. Returns { category, confidence, signals }.
 * `signals` is the list of rules that fired — the interface shows it.
 */
export function classifyPost(post) {
  const record = post && (post.record || post.value || post) || {};
  const text = String(record.text || '').toLowerCase();
  const embed = post && post.embed;

  const scores = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  const signals = [];

  for (const [category, weight, terms] of RULES) {
    for (const term of terms) {
      if (text.includes(term)) {
        scores[category] += weight;
        signals.push({ category, term, weight });
      }
    }
  }

  // Structural signals, which are more reliable than any keyword.
  const type = embed && embed.$type ? String(embed.$type) : '';
  if (type.includes('images')) { scores.art += 2.6; signals.push({ category: 'art', term: 'has images', weight: 2.6 }); }
  if (type.includes('video')) { scores.art += 1.8; signals.push({ category: 'art', term: 'has video', weight: 1.8 }); }
  if (type.includes('external')) {
    scores.promo += 1.2; scores.news += 0.9;
    signals.push({ category: 'promo', term: 'links out', weight: 1.2 });
    const uri = String((embed.external && embed.external.uri) || '').toLowerCase();
    for (const [host, cat, w] of [
      ['github.com', 'tech', 2.5], ['arxiv.org', 'science', 3], ['nature.com', 'science', 2.5],
      ['nytimes.com', 'news', 2.5], ['bbc.co', 'news', 2.5], ['theguardian.com', 'news', 2.5],
      ['espn.com', 'sports', 3], ['bandcamp.com', 'music', 3], ['letterboxd.com', 'music', 2.5],
      ['youtube.com', 'music', 1.0], ['substack.com', 'promo', 1.5], ['itch.io', 'games', 2.5],
    ]) {
      if (uri.includes(host)) { scores[cat] += w; signals.push({ category: cat, term: host, weight: w }); }
    }
  }

  // Short, unlinked, unstructured text is chatter — the largest real category
  // on any social network and the one keyword lists always under-count.
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words <= 18 && !type) {
    scores.personal += 2.2;
    signals.push({ category: 'personal', term: 'short, no link or media', weight: 2.2 });
  }

  let best = 'personal', bestScore = 0.9;
  for (const [id, s] of Object.entries(scores)) {
    if (s > bestScore) { best = id; bestScore = s; }
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  return {
    category: best,
    confidence: Math.min(1, bestScore / Math.max(total, 1)),
    signals: signals.filter((s) => s.category === best),
    scores,
  };
}

// Words that carry no information about a post's subject, so muting them would
// mute everything. Used to keep the mute-word suggestions useful.
const STOP = new Set(`a about above after again all also am an and any are aren't as at be because been
before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing
don't down during each few for from further had hadn't has hasn't have haven't having he her here hers
him his how i i'm if in into is isn't it it's its just like me more most my no nor not of off on once
only or other ought our out over own same shan't she should shouldn't so some such than that the their
them then there these they this those through to too under until up very was wasn't we were what when
where which while who whom why with won't would wouldn't you your yours got get one two really much
think know see thing things people time way make made going still even back new now good great lot`
  .split(/\s+/).filter(Boolean));

/**
 * Which words would cut the most volume for the fewest accounts muted?
 * Returns terms ranked by posts-hit, with the account spread, so a word used
 * heavily by one person can be told apart from one used by everybody.
 */
export function muteCandidates(posts, { min = 3, limit = 25 } = {}) {
  const byTerm = new Map();
  for (const p of posts) {
    const record = (p.post && p.post.record) || p.record || p.value || p;
    const author = (p.post && p.post.author) || p.author || {};
    const text = String(record.text || '').toLowerCase();
    const seen = new Set();
    for (const raw of text.match(/[#\w][\w'-]{2,}/g) || []) {
      const term = raw.replace(/^[^#\w]+|[^\w]+$/g, '');
      if (term.length < 3 || STOP.has(term) || /^\d+$/.test(term)) continue;
      if (seen.has(term)) continue;
      seen.add(term);
      let e = byTerm.get(term);
      if (!e) { e = { term, posts: 0, authors: new Set() }; byTerm.set(term, e); }
      e.posts++;
      if (author.did) e.authors.add(author.did);
    }
  }
  return Array.from(byTerm.values())
    .filter((e) => e.posts >= min)
    .map((e) => ({
      term: e.term,
      posts: e.posts,
      accounts: e.authors.size,
      // High leverage = lots of posts concentrated in few accounts.
      leverage: e.posts / Math.max(1, e.authors.size),
    }))
    .sort((a, b) => b.posts - a.posts || b.leverage - a.leverage)
    .slice(0, limit);
}

/** Posts per day for an account, from a sample of their feed. */
export function postRate(feed) {
  const times = feed
    .map((f) => new Date(((f.post && f.post.record) || f.record || {}).createdAt || (f.post && f.post.indexedAt)))
    .filter((d) => !Number.isNaN(+d))
    .sort((a, b) => b - a);
  if (times.length < 2) return { perDay: times.length ? 0.15 : 0, sample: times.length, spanDays: 0, latest: times[0] || null };
  const spanDays = Math.max(0.5, (times[0] - times[times.length - 1]) / 86400000);
  return {
    perDay: times.length / spanDays,
    sample: times.length,
    spanDays,
    latest: times[0],
  };
}
