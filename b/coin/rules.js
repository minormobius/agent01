// coin/rules.js — the constraint algebra.
//
// /coin began with one rule: a post may only be sent if it contains a phrase
// nobody has ever posted. That is one point in a space. A constraint is just a
// PREDICATE OVER A DRAFT, and predicates compose — so instead of hardcoding the
// novelty gate, this is the set of them, and a "ruleset" is any subset.
//
// Two axes matter:
//   scope — 'post'   checked against each post on its own
//           'thread' checked against the whole chain (haiku across three posts,
//                    each post starting where the last ended, and so on)
//   kind  — 'pure'   computable in the browser from the text alone, instantly
//           'corpus' needs the network (is this phrase new to Bluesky?)
//
// Pure rules are the interesting design space precisely because they are free:
// they turn the composer into a writing constraint the way Oulipo did — a
// lipogram, a univocalic, a fixed syllable count. Corpus rules are the ones that
// make a post objectively new rather than merely difficult.
//
// Wildcards are seeded, so "today's word" is the same word for everyone without
// any server: a shared daily constraint out of nothing but the date.

// ── seeded rng (same pair the rest of this repo uses) ───────────────────────
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const rngFrom = (seed) => mulberry32(xmur3(String(seed))());
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ── text helpers ─────────────────────────────────────────────────────────────
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}
export function syllables(w) {
  const s = String(w).toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return 0;
  const groups = s.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
const VOWELS = 'aeiou';

// A bank of ordinary-but-not-empty words for wildcards. Deliberately concrete
// and common enough that any sentence can host one, odd enough to bend a draft.
const WILDCARDS = (`anchor amber attic bargain beacon bramble candle cavern cinder clover compass copper
 cradle crooked current dapple drift ember fathom ferment flint fodder furrow gallow gasket gather glimmer
 granite gravel harbor hollow hunger island kettle knuckle lantern lattice ledger lichen lumber marrow
 meadow mercy mildew mineral mortar needle orchard otter paddle parcel pasture pebble pigment pilgrim
 plaster plunder quarry quiver ransom rafter reckon relic ribbon rigging rubble saddle salvage scaffold
 sediment shingle shovel silt sinew smolder solder spindle splinter stipple stubble sulphur tallow tangle
 tender thicket thimble threshold timber tinder trestle trowel tunnel varnish vessel wander whittle willow
 winnow yonder`).split(/\s+/).filter(Boolean);

/** Today's wildcard — same word for everyone, derived from the date alone. */
export function dailyWildcard(dayKey) {
  return pick(rngFrom('coin-wildcard::' + dayKey), WILDCARDS);
}
export const dayKeyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// ── the rules ────────────────────────────────────────────────────────────────
// check(text, ctx) -> { ok, msg }   (msg is shown whether it passes or not)
// ctx carries { novelty } for corpus rules, filled in by the page.
export const RULES = {
  // ── corpus: objectively new, not merely hard ──────────────────────────────
  novel: {
    label: 'says something new', scope: 'post', kind: 'corpus',
    blurb: 'contains a two- or three-word phrase that returns zero posts across all of Bluesky',
    params: () => ({}),
    describe: () => 'a phrase nobody has posted',
    check(text, ctx) {
      const n = ctx && ctx.novelty;
      if (!n) return { ok: false, msg: 'checking…', pending: true };
      if (n.inconclusive && !n.ok) return { ok: false, msg: 'couldn’t reach search', pending: true };
      return n.ok
        ? { ok: true, msg: `${n.novelCount} phrase${n.novelCount === 1 ? '' : 's'} nobody has posted`, detail: n.novel }
        : { ok: false, msg: 'nothing new yet' };
    },
  },
  novelBigram: {
    label: 'a new PAIR of words', scope: 'post', kind: 'corpus',
    blurb: 'strictly harder: the novel phrase must be two words, not three — far rarer',
    params: () => ({}),
    describe: () => 'a two-word phrase nobody has posted',
    check(text, ctx) {
      const n = ctx && ctx.novelty;
      if (!n) return { ok: false, msg: 'checking…', pending: true };
      const bi = (n.novel || []).filter((p) => p.split(' ').length === 2);
      return bi.length
        ? { ok: true, msg: `“${bi[0]}” — never posted`, detail: bi }
        : { ok: false, msg: (n.novel || []).length ? 'new, but only as a three-word phrase' : 'no new word-pair' };
    },
  },

  // ── lexical form: free, instant, and where the Oulipo lives ───────────────
  wildcard: {
    label: 'uses the word of the day', scope: 'post', kind: 'pure',
    blurb: 'a given word must appear — seeded from the date, so everyone gets the same one',
    params: (rng) => ({ word: pick(rng, WILDCARDS) }),
    describe: (p) => `must contain “${p.word}”`,
    check(text, ctx, p) {
      const w = (p.word || '').toLowerCase();
      const has = words(text).some((x) => x === w || x.startsWith(w));
      return has ? { ok: true, msg: `“${p.word}” ✓` } : { ok: false, msg: `must use “${p.word}”` };
    },
  },
  avgWord: {
    label: 'long words only', scope: 'post', kind: 'pure',
    blurb: 'the mean word length must clear a bar — short filler words drag it down',
    params: (rng) => ({ n: pick(rng, [5, 5.5, 6, 6.5]) }),
    describe: (p) => `mean word length ≥ ${p.n}`,
    check(text, ctx, p) {
      const w = words(text);
      if (!w.length) return { ok: false, msg: `mean word length ≥ ${p.n}` };
      const avg = w.reduce((a, x) => a + x.length, 0) / w.length;
      return avg >= p.n
        ? { ok: true, msg: `mean ${avg.toFixed(2)} ≥ ${p.n}` }
        : { ok: false, msg: `mean ${avg.toFixed(2)}, needs ${p.n}` };
    },
  },
  lipogram: {
    label: 'a forbidden letter', scope: 'post', kind: 'pure',
    blurb: 'one letter is banned outright — the Oulipo constraint, and the hardest easy rule here',
    params: (rng) => ({ letter: pick(rng, ['e', 'a', 't', 'o', 'i', 's', 'n']) }),
    describe: (p) => `no letter “${p.letter}”`,
    check(text, ctx, p) {
      const l = (p.letter || 'e').toLowerCase();
      const hits = (String(text).toLowerCase().match(new RegExp(l, 'g')) || []).length;
      return hits === 0
        ? { ok: true, msg: `no “${l}” ✓` }
        : { ok: false, msg: `${hits} “${l}”${hits === 1 ? '' : 's'} to remove` };
    },
  },
  univocalic: {
    label: 'one vowel only', scope: 'post', kind: 'pure',
    blurb: 'every vowel in the post must be the same one',
    params: (rng) => ({ vowel: pick(rng, [...VOWELS]) }),
    describe: (p) => `“${p.vowel}” is the only vowel allowed`,
    check(text, ctx, p) {
      const v = (p.vowel || 'a').toLowerCase();
      const bad = [...VOWELS].filter((x) => x !== v);
      const found = [...String(text).toLowerCase()].filter((c) => bad.includes(c));
      return found.length === 0
        ? { ok: true, msg: `only “${v}” ✓` }
        : { ok: false, msg: `${found.length} other vowel${found.length === 1 ? '' : 's'}` };
    },
  },
  noRepeats: {
    label: 'never the same word twice', scope: 'post', kind: 'pure',
    blurb: 'every word in the post must be distinct',
    params: () => ({}),
    describe: () => 'no word used twice',
    check(text) {
      const w = words(text);
      const seen = new Set(), dupes = new Set();
      for (const x of w) { if (seen.has(x)) dupes.add(x); seen.add(x); }
      return dupes.size === 0
        ? { ok: w.length > 0, msg: w.length ? 'all distinct ✓' : 'no word used twice' }
        : { ok: false, msg: `repeated: ${[...dupes].slice(0, 3).join(', ')}` };
    },
  },
  alliterate: {
    label: 'alliteration', scope: 'post', kind: 'pure',
    blurb: 'a run of words sharing an initial letter',
    params: (rng) => ({ n: pick(rng, [3, 4, 5]) }),
    describe: (p) => `${p.n}+ words starting with one letter`,
    check(text, ctx, p) {
      const w = words(text);
      const c = new Map();
      for (const x of w) c.set(x[0], (c.get(x[0]) || 0) + 1);
      let best = 0, letter = '';
      for (const [k, v] of c) if (v > best) { best = v; letter = k; }
      return best >= p.n
        ? { ok: true, msg: `${best}× “${letter}” ✓` }
        : { ok: false, msg: `best is ${best}× “${letter || '—'}”, needs ${p.n}` };
    },
  },
  monosyllabic: {
    label: 'one beat per word', scope: 'post', kind: 'pure',
    blurb: 'every word must be a single syllable',
    params: () => ({}),
    describe: () => 'all words monosyllabic',
    check(text) {
      const w = words(text);
      const bad = w.filter((x) => syllables(x) > 1);
      return w.length && !bad.length
        ? { ok: true, msg: 'all one beat ✓' }
        : { ok: false, msg: bad.length ? `${bad.length} long word${bad.length === 1 ? '' : 's'}: ${bad.slice(0, 2).join(', ')}` : 'all words monosyllabic' };
    },
  },
  acrostic: {
    label: 'an acrostic', scope: 'post', kind: 'pure',
    blurb: 'the first letters of the words spell something',
    params: (rng) => ({ word: pick(rng, ['coin', 'hapax', 'lathe', 'bsky', 'new']) }),
    describe: (p) => `first letters spell “${p.word}”`,
    check(text, ctx, p) {
      const target = (p.word || 'coin').toLowerCase();
      const initials = words(text).map((x) => x[0]).join('');
      return initials.startsWith(target)
        ? { ok: true, msg: `spells “${target}” ✓` }
        : { ok: false, msg: `first letters are “${initials.slice(0, target.length) || '—'}”, need “${target}”` };
    },
  },
  question: {
    label: 'must be a question', scope: 'post', kind: 'pure',
    blurb: 'the post has to end in a question mark',
    params: () => ({}),
    describe: () => 'ends with ?',
    check(text) {
      const t = String(text).trim();
      return t.endsWith('?') ? { ok: true, msg: 'a question ✓' } : { ok: false, msg: 'must end with ?' };
    },
  },
  exact: {
    label: 'an exact length', scope: 'post', kind: 'pure',
    blurb: 'a fixed number of words — no more, no fewer',
    params: (rng) => ({ n: pick(rng, [7, 10, 12, 14, 17]) }),
    describe: (p) => `exactly ${p.n} words`,
    check(text, ctx, p) {
      const n = words(text).length;
      return n === p.n ? { ok: true, msg: `${n} words ✓` } : { ok: false, msg: `${n} of ${p.n} words` };
    },
  },

  // ── thread-scope: the constraint spans the chain ──────────────────────────
  haiku: {
    label: 'a haiku thread', scope: 'thread', kind: 'pure',
    blurb: 'three posts of 5, 7 and 5 syllables',
    params: () => ({ pattern: [5, 7, 5] }),
    describe: (p) => `${p.pattern.join('–')} syllables across ${p.pattern.length} posts`,
    checkThread(segments, ctx, p) {
      const pat = p.pattern || [5, 7, 5];
      const live = segments.filter((s) => s.text.trim());
      if (live.length !== pat.length) return { ok: false, msg: `needs exactly ${pat.length} posts (have ${live.length})` };
      const counts = live.map((s) => words(s.text).reduce((a, w) => a + syllables(w), 0));
      const ok = counts.every((c, i) => c === pat[i]);
      return ok ? { ok: true, msg: `${counts.join('–')} ✓` } : { ok: false, msg: `${counts.join('–')}, needs ${pat.join('–')}` };
    },
  },
  chain: {
    label: 'each post picks up the last', scope: 'thread', kind: 'pure',
    blurb: 'every post after the first must begin with the word the previous one ended on',
    params: () => ({}),
    describe: () => 'each post starts on the previous post’s last word',
    checkThread(segments) {
      const live = segments.filter((s) => s.text.trim());
      if (live.length < 2) return { ok: false, msg: 'needs at least two posts' };
      for (let i = 1; i < live.length; i++) {
        const prev = words(live[i - 1].text), cur = words(live[i].text);
        if (!prev.length || !cur.length) return { ok: false, msg: `post ${i + 1} is empty` };
        if (cur[0] !== prev[prev.length - 1]) {
          return { ok: false, msg: `post ${i + 1} must start with “${prev[prev.length - 1]}”` };
        }
      }
      return { ok: true, msg: 'the chain holds ✓' };
    },
  },
  shrinking: {
    label: 'each post shorter', scope: 'thread', kind: 'pure',
    blurb: 'every post in the thread must be strictly shorter than the one before',
    params: () => ({}),
    describe: () => 'each post shorter than the last',
    checkThread(segments) {
      const live = segments.filter((s) => s.text.trim());
      if (live.length < 2) return { ok: false, msg: 'needs at least two posts' };
      for (let i = 1; i < live.length; i++) {
        const a = words(live[i - 1].text).length, b = words(live[i].text).length;
        if (b >= a) return { ok: false, msg: `post ${i + 1} (${b}) must be under ${a} words` };
      }
      return { ok: true, msg: 'narrowing ✓' };
    },
  },
};

/** Rules that need the novelty endpoint — the page only calls it when one is on. */
export const needsNovelty = (ruleset) => ruleset.some((r) => RULES[r.id] && RULES[r.id].kind === 'corpus');

/** Run every post-scope rule against one draft. */
export function checkPost(text, ruleset, ctx = {}) {
  return ruleset
    .filter((r) => RULES[r.id] && RULES[r.id].scope === 'post')
    .map((r) => {
      const def = RULES[r.id];
      let res;
      try { res = def.check(text, ctx, r.params || {}); }
      catch (e) { res = { ok: false, msg: 'rule error' }; }
      return { id: r.id, label: def.label, ...res };
    });
}

/** Run every thread-scope rule against the whole chain. */
export function checkThread(segments, ruleset, ctx = {}) {
  return ruleset
    .filter((r) => RULES[r.id] && RULES[r.id].scope === 'thread')
    .map((r) => {
      const def = RULES[r.id];
      let res;
      try { res = def.checkThread(segments, ctx, r.params || {}); }
      catch (e) { res = { ok: false, msg: 'rule error' }; }
      return { id: r.id, label: def.label, ...res };
    });
}

/** Serialise a ruleset into a URL fragment: "novel,avgWord:6,wildcard:tinder". */
export function encodeRules(ruleset) {
  return ruleset.map((r) => {
    const p = r.params || {};
    const keys = Object.keys(p);
    if (!keys.length) return r.id;
    return r.id + ':' + keys.map((k) => (Array.isArray(p[k]) ? p[k].join('-') : p[k])).join('-');
  }).join(',');
}
export function decodeRules(str) {
  return String(str || '').split(',').map((tok) => tok.trim()).filter(Boolean).map((tok) => {
    const [id, rest] = tok.split(':');
    const def = RULES[id];
    if (!def) return null;
    const params = def.params ? def.params(rngFrom('decode::' + tok)) : {};
    if (rest != null) {
      const keys = Object.keys(params);
      const vals = rest.split('-');
      if (keys.length === 1 && Array.isArray(params[keys[0]])) params[keys[0]] = vals.map(Number);
      else keys.forEach((k, i) => {
        if (vals[i] == null) return;
        params[k] = isNaN(Number(vals[i])) ? vals[i] : Number(vals[i]);
      });
    }
    return { id, params };
  }).filter(Boolean);
}

/**
 * The day's ruleset — same for everyone, derived from the date. One corpus rule
 * (so a post is genuinely new) plus one pure rule (so it is also shaped), which
 * keeps the daily challenge hard in two different directions without needing a
 * server to agree on anything.
 */
export function dailyRules(dayKey) {
  const rng = rngFrom('coin-daily::' + dayKey);
  const corpus = pick(rng, ['novel', 'novel', 'novelBigram']);
  const pureIds = Object.keys(RULES).filter((k) => RULES[k].kind === 'pure' && RULES[k].scope === 'post');
  const pureId = pick(rng, pureIds);
  const out = [{ id: corpus, params: {} }];
  const def = RULES[pureId];
  out.push({ id: pureId, params: def.params ? def.params(rng) : {} });
  if (pureId === 'wildcard') out[1].params = { word: dailyWildcard(dayKey) };
  return out;
}

export const DEFAULT_RULES = [{ id: 'novel', params: {} }];
