// feedgen matching — one filter implementation, two very different input shapes.
//
// A feed definition (`com.minomobi.feedgen.def`) is an ordered list of filters,
// and those filters have to run in two places that share nothing:
//
//   * over hydrated `postView`s from the AppView — the /feedgen preview and the
//     search / list / author inputs in `b/`;
//   * over raw commit records off the Jetstream firehose — `workers/hose/`,
//     where nothing is hydrated and a post one second old has no engagement
//     counts at all.
//
// Writing the predicate twice is how the two silently disagree, so both callers
// normalise to the shape below and share `passes()`:
//
//   { uri, did, text, altText, links[], langs[], isReply, isRepost,
//     media: { image, video, link, quote },
//     likeCount, repostCount, createdAt }
//
// `likeCount`/`repostCount` are **null** when unknown (firehose ingest). An
// engagement filter facing null defers rather than guessing — see
// `needsHydration()`, which tells a caller to fetch real counts before serving.

// Bump when a change in this file alters WHAT PASSES.
//
// A ring buffer is only meaningful under the rules that filled it. Editing a
// feed's filters already empties it — but fixing a BUG in the matcher does not
// touch any feed's filters, so nothing noticed, and an adult image carousel
// admitted by the old code sat in a live feed with the fix already deployed.
// workers/hose stores this alongside its buffers and purges them when it moves.
//
//   1 → initial
//   2 → app.bsky.embed.gallery counts as an image (the carousel leak)
//   3 → lang filters can require EVERY declared language to match, not just one
export const MATCHER_VERSION = 3;

// ── normalise: hydrated AppView postView ─────────────────────────────────────

const EXT_URI = (e) => (e && e.external && e.external.uri) || null;

function facetLinks(record) {
  const out = [];
  for (const f of (record && record.facets) || []) {
    for (const feat of f.features || []) {
      if (feat.uri) out.push(feat.uri);
    }
  }
  return out;
}

// WHICH EMBEDS ARE PICTURES. `app.bsky.embed.gallery` is what a post of more
// than four images became, and it is a DIFFERENT nsid from `app.bsky.embed.images`
// — it spells its array `items` rather than `images`. A "no images" filter that
// only knows `embed.images` therefore passes every gallery post straight
// through, which is how an adult image carousel reached a text-only feed whose
// single most load-bearing filter is "no pictures".
//
// b/thread/thread.js hit the same lexicon split and documents it; this is the
// same fact in the filter layer rather than the reader layer.
const isImageEmbed = (t) => t.includes('embed.images') || t.includes('embed.gallery');

// A postView's `embed` is the *view* form (`…#view`), its `record` the raw one.
// Alt text only exists on the view for images/video, so read both.
function viewMedia(embed) {
  const t = (embed && embed.$type) || '';
  const media = (embed && embed.media) || null; // recordWithMedia
  const mt = (media && media.$type) || '';
  return {
    image: isImageEmbed(t) || isImageEmbed(mt),
    video: t.includes('embed.video') || mt.includes('embed.video'),
    link: t.includes('embed.external') || mt.includes('embed.external'),
    // recordWithMedia is a quote *plus* media; embed.record alone is a bare quote.
    quote: t.includes('embed.record'),
  };
}

function viewAltText(embed) {
  const parts = [];
  const walk = (e) => {
    if (!e) return;
    for (const img of e.images || e.items || []) if (img.alt) parts.push(img.alt);
    if (e.alt) parts.push(e.alt);
    if (e.external) {
      if (e.external.title) parts.push(e.external.title);
      if (e.external.description) parts.push(e.external.description);
    }
    if (e.media) walk(e.media);
  };
  walk(embed);
  return parts.join('\n');
}

export function fromPostView(post, isRepost = false) {
  const rec = post.record || {};
  const embed = post.embed || null;
  const links = facetLinks(rec);
  const ext = EXT_URI(embed) || EXT_URI(embed && embed.media);
  if (ext) links.push(ext);
  return {
    uri: post.uri,
    did: (post.author && post.author.did) || (post.uri || '').split('/')[2] || '',
    text: rec.text || '',
    altText: viewAltText(embed),
    links,
    langs: rec.langs || [],
    isReply: !!rec.reply,
    isRepost: !!isRepost,
    media: viewMedia(embed),
    likeCount: post.likeCount == null ? null : post.likeCount,
    repostCount: post.repostCount == null ? null : post.repostCount,
    createdAt: rec.createdAt || post.indexedAt || null,
  };
}

// ── normalise: raw Jetstream commit record ───────────────────────────────────

function recordMedia(embed) {
  const t = (embed && embed.$type) || '';
  const media = (embed && embed.media) || null;
  const mt = (media && media.$type) || '';
  return {
    image: isImageEmbed(t) || isImageEmbed(mt),
    video: t.includes('embed.video') || mt.includes('embed.video'),
    link: t.includes('embed.external') || mt.includes('embed.external'),
    quote: t.includes('embed.record'),
  };
}

function recordAltText(embed) {
  const parts = [];
  const walk = (e) => {
    if (!e) return;
    for (const img of e.images || e.items || []) if (img.alt) parts.push(img.alt);
    if (e.alt) parts.push(e.alt);
    if (e.external) {
      if (e.external.title) parts.push(e.external.title);
      if (e.external.description) parts.push(e.external.description);
    }
    if (e.media) walk(e.media);
  };
  walk(embed);
  return parts.join('\n');
}

// A firehose post is brand new: nobody has liked it yet, and "is this a repost"
// is not a property of the record (a repost is its own `app.bsky.feed.repost`
// record, which the firehose feed never ingests). Both are therefore fixed.
export function fromCommit(did, rkey, record) {
  const embed = record.embed || null;
  const links = facetLinks(record);
  const ext = EXT_URI(embed) || EXT_URI(embed && embed.media);
  if (ext) links.push(ext);
  return {
    uri: `at://${did}/app.bsky.feed.post/${rkey}`,
    did,
    text: record.text || '',
    altText: recordAltText(embed),
    links,
    langs: record.langs || [],
    isReply: !!record.reply,
    isRepost: false,
    media: recordMedia(embed),
    likeCount: null,
    repostCount: null,
    createdAt: record.createdAt || null,
  };
}

// ── the predicate ────────────────────────────────────────────────────────────

// SkyFeed regex blocks name their haystack as a `|`-joined target list —
// "text|alt_text|link". Default to text alone, which is what the builder's own
// regex block has always meant.
function haystack(p, target) {
  const want = String(target || 'text').split('|').map((s) => s.trim()).filter(Boolean);
  const parts = [];
  for (const w of want) {
    if (w === 'text') parts.push(p.text);
    else if (w === 'alt_text' || w === 'alt') parts.push(p.altText);
    else if (w === 'link' || w === 'links') parts.push(p.links.join('\n'));
  }
  return parts.filter(Boolean).join('\n');
}

const reCache = new Map();
function compile(pattern, caseSensitive) {
  const key = (caseSensitive ? 'S:' : 'i:') + pattern;
  if (reCache.has(key)) return reCache.get(key);
  let re = null;
  try { re = new RegExp(pattern, caseSensitive ? '' : 'i'); } catch { re = null; }
  if (reCache.size > 200) reCache.clear();
  reCache.set(key, re);
  return re;
}

// True when the def carries a filter that cannot be decided from the record
// alone, so a firehose server must hydrate real counts before it serves a page.
export function needsHydration(def) {
  return ((def && def.filters) || []).some((f) => f.type === 'minLikes' || f.type === 'minReposts');
}

// ctx.lists — Map<listUri, Set<did>>, resolved by the caller and cached there.
// A list filter whose members the caller could not resolve is skipped rather
// than applied as "matches nothing": silently emptying someone's feed because a
// list fetch 500'd is worse than briefly leaving a bot in it.
export function passes(p, filters, ctx = {}) {
  for (const f of filters || []) {
    if (f.type === 'regex') {
      if (!f.pattern) continue;
      const re = compile(f.pattern, !!f.caseSensitive);
      if (!re) continue;
      const hit = re.test(haystack(p, f.target));
      if (f.mode === 'exclude' && hit) return false;
      if (f.mode !== 'exclude' && !hit) return false;
    } else if (f.type === 'media') {
      const want = Array.isArray(f.has) ? f.has : (f.has ? [f.has] : []);
      if (!want.length) continue;
      const hasAny = want.some((k) => p.media[k]);
      if (f.mode === 'none' ? hasAny : !hasAny) return false;
    } else if (f.type === 'lang') {
      if (!f.code) continue;
      const code = f.code.toLowerCase();
      const has = (l) => (l || '').toLowerCase().startsWith(code);
      if (f.mode === 'exclude') {
        if (p.langs.some(has)) return false;
      } else if (f.strict) {
        // SkyFeed's "remove language != en" removes anything whose language is
        // not en. A post tagged [en, pt] HAS a language that is not en, so a
        // some() test lets every bilingual post through — which is most of what
        // slips past a language filter, since the tag is self-declared and
        // people who post in two languages tag both.
        if (!p.langs.length || !p.langs.every(has)) return false;
      } else if (!p.langs.some(has)) return false;
    } else if (f.type === 'noLang') {
      // SkyFeed's bare `remove: language` block — drop posts that declare none.
      if (!p.langs.length) return false;
    } else if (f.type === 'list') {
      const members = ctx.lists && ctx.lists.get(f.uri);
      if (!members) continue;
      const inList = members.has(p.did);
      if (f.mode === 'include' ? !inList : inList) return false;
    } else if (f.type === 'removeReplies') {
      if (p.isReply) return false;
    } else if (f.type === 'removeReposts') {
      if (p.isRepost) return false;
    } else if (f.type === 'minLikes') {
      if (p.likeCount == null) continue; // defer — see needsHydration()
      if (p.likeCount < (f.n || 0)) return false;
    } else if (f.type === 'minReposts') {
      if (p.repostCount == null) continue;
      if (p.repostCount < (f.n || 0)) return false;
    }
  }
  return true;
}

// Every list URI a def references, so a caller can resolve them all up front.
export function listUris(def) {
  return [...new Set(((def && def.filters) || []).filter((f) => f.type === 'list' && f.uri).map((f) => f.uri))];
}
