// reduce.js — one hydrated thread post (app.bsky.feed.getPosts) → one row of
// the frozen chapter file. Pure: no fetch, no DOM, so build.mjs and the
// selftest run the exact same code.

// The quoted post is the work. A media quote nests it one level deeper.
export function quotedView(post) {
  const e = post.embed;
  if (!e) return null;
  if (e.$type === 'app.bsky.embed.record#view') return e.record;
  if (e.$type === 'app.bsky.embed.recordWithMedia#view') return e.record?.record ?? null;
  return null;
}

// Strip link facets out of the curator's text. Most entries are a bare
// "bsky.app/profile/abel..." stub whose only job is the quote, and leaving it
// in would make every caption look like a caption. Byte offsets, per lexicon.
export function captionOf(record) {
  const text = record?.text ?? '';
  const facets = (record?.facets ?? [])
    .filter(f => f.features?.some(x => x.$type === 'app.bsky.richtext.facet#link'))
    .map(f => f.index).sort((a, b) => b.byteStart - a.byteStart);
  if (!facets.length) return text.trim();
  let bytes = new TextEncoder().encode(text);
  for (const { byteStart, byteEnd } of facets) {
    bytes = new Uint8Array([...bytes.slice(0, byteStart), ...bytes.slice(byteEnd)]);
  }
  return new TextDecoder().decode(bytes).trim();
}

// What a work IS, for the media mix. One word per work, decided in this order:
// a video beats a picture beats a link beats a quote of something else.
export function mediumOf(view) {
  const embeds = view?.embeds ?? [];
  const flat = [];
  for (const e of embeds) {
    if (e.$type === 'app.bsky.embed.recordWithMedia#view') flat.push(e.media, { $type: 'quote' });
    else flat.push(e);
  }
  const has = t => flat.some(e => e?.$type?.startsWith(t));
  if (has('app.bsky.embed.video')) return 'video';
  if (has('app.bsky.embed.images')) return 'image';
  if (has('app.bsky.embed.external')) return 'link';
  if (has('app.bsky.embed.record') || has('quote')) return 'quote';
  return 'text';
}

function mediaOf(view) {
  for (const e of view?.embeds ?? []) {
    const m = e.$type === 'app.bsky.embed.recordWithMedia#view' ? e.media : e;
    if (m?.$type === 'app.bsky.embed.images#view') {
      return { thumb: m.images[0]?.thumb ?? null, n: m.images.length, ar: ratio(m.images[0]?.aspectRatio) };
    }
    if (m?.$type === 'app.bsky.embed.video#view') return { thumb: m.thumbnail ?? null, n: 1, ar: ratio(m.aspectRatio) };
    if (m?.$type === 'app.bsky.embed.external#view') {
      let domain = null;
      try { domain = new URL(m.external.uri).hostname.replace(/^www\./, ''); } catch {}
      return { thumb: m.external.thumb ?? null, n: 0, domain };
    }
  }
  return { thumb: null, n: 0 };
}

// The same question for a record we only have raw — a post nested two quotes
// deep comes back from the AppView with counts but without hydrated embeds.
export function mediumOfRecord(embed) {
  const t = embed?.$type ?? '';
  if (t === 'app.bsky.embed.recordWithMedia') return mediumOfRecord(embed.media);
  if (t === 'app.bsky.embed.video') return 'video';
  if (t === 'app.bsky.embed.images') return 'image';
  if (t === 'app.bsky.embed.external') return 'link';
  if (t === 'app.bsky.embed.record') return 'quote';
  return 'text';
}

// Thumbnail URLs are a pure function of (did, blob cid) on the public CDN.
function rawMedia(did, embed) {
  const e = embed?.$type === 'app.bsky.embed.recordWithMedia' ? embed.media : embed;
  const cid = b => b?.ref?.$link ?? b?.cid ?? null;
  if (e?.$type === 'app.bsky.embed.images' && e.images?.length) {
    const c = cid(e.images[0].image);
    return { thumb: c && `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${c}`, n: e.images.length, ar: ratio(e.images[0].aspectRatio) };
  }
  if (e?.$type === 'app.bsky.embed.video') {
    const c = cid(e.video);
    return { thumb: c && `https://video.bsky.app/watch/${encodeURIComponent(did)}/${c}/thumbnail.jpg`, n: 1, ar: ratio(e.aspectRatio) };
  }
  if (e?.$type === 'app.bsky.embed.external') {
    let domain = null;
    try { domain = new URL(e.external.uri).hostname.replace(/^www\./, ''); } catch {}
    return { thumb: null, n: 0, domain };
  }
  return { thumb: null, n: 0 };
}

/**
 * The curator often files someone's work by quoting their own post, which is
 * a screenshot plus a quote of the artist. Credit belongs to the artist, so
 * that wrapper is unwrapped: the quoted-quoted post becomes the work, and the
 * wrapper is kept as `via`. Wrappers around the curator's OWN posts (the
 * "self QT tower") are left alone; those are the curator's work.
 */
export function innerWork(view) {
  for (const e of view?.embeds ?? []) {
    const r = e.$type === 'app.bsky.embed.record#view' ? e.record
      : e.$type === 'app.bsky.embed.recordWithMedia#view' ? e.record?.record : null;
    if (r?.$type === 'app.bsky.embed.record#viewRecord' && r.value?.$type === 'app.bsky.feed.post') return r;
  }
  return null;
}

const ratio = a => (a?.width && a?.height ? +(a.width / a.height).toFixed(3) : null);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * @param {object} post   a PostView from getPosts
 * @param {Map} people    did → {h, n, a}, filled as a side effect
 * @returns one row: {u, t, by, cap, w?}   w is absent when nothing was quoted,
 *          and w.gone is set when the quoted post was deleted or is blocked.
 */
export function reducePost(post, people, curator = post.author.did) {
  const remember = a => {
    if (a && !people.has(a.did)) people.set(a.did, { h: a.handle, n: a.displayName || '', a: a.avatar || '' });
  };
  remember(post.author);
  const row = {
    u: post.uri.split('/').pop(),
    t: post.record.createdAt,
    by: post.author.did,
    cap: clip(captionOf(post.record), 280),
    likes: post.likeCount ?? 0,
  };
  const q = quotedView(post);
  if (q) {
    if (q.$type !== 'app.bsky.embed.record#viewRecord') {
      row.w = { gone: q.$type.split('#')[1] || 'missing', uri: q.uri };
    } else if (q.value?.$type === 'app.bsky.feed.post' && q.author.did === curator
               && innerWork(q) && innerWork(q).author.did !== curator) {
      const inner = innerWork(q);
      remember(inner.author);
      const own = rawMedia(inner.author.did, inner.value.embed);
      const kind = mediumOfRecord(inner.value.embed);
      // A text post documented by the curator's screenshot: the screenshot is
      // the only picture there is, and it is a picture of this work.
      const shot = own.thumb ? own : mediaOf(q);
      row.w = {
        uri: inner.uri,
        by: inner.author.did,
        t: inner.value.createdAt,
        text: clip(inner.value.text ?? '', 240),
        kind: kind === 'text' || kind === 'quote' ? mediumOf(q) : kind,
        ...shot,
        ...(own.domain ? { domain: own.domain } : {}),
        likes: inner.likeCount ?? 0,
        reposts: inner.repostCount ?? 0,
        quotes: inner.quoteCount ?? 0,
        replies: inner.replyCount ?? 0,
        via: { uri: q.uri, cap: clip(captionOf(q.value), 280) },
      };
      for (const k of Object.keys(row.w)) if (row.w[k] == null) delete row.w[k];
    } else if (q.value?.$type === 'app.bsky.feed.post') {
      remember(q.author);
      const m = mediaOf(q);
      row.w = {
        uri: q.uri,
        by: q.author.did,
        t: q.value.createdAt,
        text: clip(q.value.text ?? '', 240),
        kind: mediumOf(q),
        ...m,
        likes: q.likeCount ?? 0,
        reposts: q.repostCount ?? 0,
        quotes: q.quoteCount ?? 0,
        replies: q.replyCount ?? 0,
      };
      for (const k of Object.keys(row.w)) if (row.w[k] == null) delete row.w[k];
    }
  }
  return row;
}
