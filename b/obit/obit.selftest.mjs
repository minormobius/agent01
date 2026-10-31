// obit selftest — run before changing reduce.js, stats.js or the obit's prose:
//   node b/obit/obit.selftest.mjs
//
// Three things are pinned here, because each fails silently:
//
//   • credit — the curator files a lot of work by quoting their own
//     screenshot of it. Read naively, the curator becomes the most prolific
//     artist of the chapter and 75 works lose their makers.
//   • captions — the curator's text is mostly a bare link stub, cut out by
//     BYTE offset. An emoji before the link shifts every offset after it.
//   • the prose — the obituary states numbers in words, in static HTML, so it
//     reads without JavaScript. Every number in a data-stat span is checked
//     against the frozen file, so the words cannot drift from the data.

import { readFileSync } from 'node:fs';
import { captionOf, mediumOf, mediumOfRecord, reducePost } from './reduce.js';
import * as S from './stats.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const CUR = 'did:plc:curator', ART = 'did:plc:artist';
const author = (did, handle) => ({ did, handle, displayName: handle, avatar: '' });

// ---- captions: link facets out by byte offset, emoji included ------------
{
  const text = '🎨 the hex site bsky.app/profile/abel...';
  const start = new TextEncoder().encode('🎨 the hex site ').length;
  const rec = {
    text,
    facets: [{ index: { byteStart: start, byteEnd: new TextEncoder().encode(text).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://bsky.app/profile/x/post/y' }] }],
  };
  eq(captionOf(rec), '🎨 the hex site', 'the link stub is cut at the byte offset, after a 4-byte emoji');
  eq(captionOf({ text: 'bsky.app/profile/abel...', facets: [{ index: { byteStart: 0, byteEnd: 24 },
    features: [{ $type: 'app.bsky.richtext.facet#link' }] }] }), '', 'a bare stub leaves no caption');
  eq(captionOf({ text: '  plain  ' }), 'plain', 'no facets: trimmed text');
  eq(captionOf({ text: '@someone hi', facets: [{ index: { byteStart: 0, byteEnd: 8 },
    features: [{ $type: 'app.bsky.richtext.facet#mention' }] }] }), '@someone hi', 'a mention is kept');
}

// ---- medium: one word per work, video > image > link > quote > text -------
{
  const v = { embeds: [{ $type: 'app.bsky.embed.recordWithMedia#view', media: { $type: 'app.bsky.embed.video#view' } }] };
  eq(mediumOf(v), 'video', 'video inside recordWithMedia is a video, not a quote');
  eq(mediumOf({ embeds: [{ $type: 'app.bsky.embed.external#view' }] }), 'link', 'external is a link');
  eq(mediumOf({ embeds: [{ $type: 'app.bsky.embed.record#view' }] }), 'quote', 'a bare quote is a quote');
  eq(mediumOf({}), 'text', 'nothing is text');
  eq(mediumOfRecord({ $type: 'app.bsky.embed.recordWithMedia', media: { $type: 'app.bsky.embed.images' } }), 'image', 'raw recordWithMedia images');
}

// ---- credit: the curator's screenshot-wrapper is unwrapped to the artist --
const view = (did, handle, rkey, value, embeds = [], counts = {}) => ({
  $type: 'app.bsky.embed.record#viewRecord',
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, author: author(did, handle),
  value: { $type: 'app.bsky.feed.post', createdAt: '2026-03-01T00:00:00Z', text: '', ...value },
  embeds, likeCount: 0, ...counts,
});
const threadPost = (rkey, quoted, by = CUR) => ({
  uri: `at://${by}/app.bsky.feed.post/${rkey}`, author: author(by, by === CUR ? 'curator' : 'someone'),
  record: { createdAt: '2026-03-02T00:00:00Z', text: '' }, likeCount: 1,
  embed: quoted && { $type: 'app.bsky.embed.record#view', record: quoted },
});
{
  const artwork = view(ART, 'artist', 'art1', {
    text: 'my piece', embed: { $type: 'app.bsky.embed.video', video: { ref: { $link: 'bafvid' } } },
  }, [], { likeCount: 40 });
  const wrapper = view(CUR, 'curator', 'wrap1', { text: 'look at this' }, [{
    $type: 'app.bsky.embed.recordWithMedia#view',
    media: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 'https://shot' }] },
    record: { record: artwork },
  }], { likeCount: 3 });
  const people = new Map();
  const row = reducePost(threadPost('t1', wrapper), people, CUR);
  eq(row.w.by, ART, 'a curator wrapper around someone else is credited to the artist');
  eq(row.w.likes, 40, 'the likes are the artwork\'s, not the wrapper\'s');
  eq(row.w.kind, 'video', 'the medium is the artwork\'s own');
  eq(row.w.via?.cap, 'look at this', 'the wrapper survives as via');
  ok(row.w.thumb?.includes('bafvid'), 'the artwork\'s own media wins over the screenshot');
  ok(people.has(ART), 'the artist is remembered');

  const textArt = view(ART, 'artist', 'art2', { text: 'words only' });
  const shot = view(CUR, 'curator', 'wrap2', {}, [{
    $type: 'app.bsky.embed.recordWithMedia#view',
    media: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 'https://shot' }] },
    record: { record: textArt },
  }]);
  const r2 = reducePost(threadPost('t2', shot), new Map(), CUR);
  eq(r2.w.thumb, 'https://shot', 'a text work documented by screenshot keeps the screenshot');
  eq(r2.w.kind, 'image', 'and reads as the picture it is shown as');

  const tower = view(CUR, 'curator', 'tower2', { text: 'late-2026 thread' }, [{
    $type: 'app.bsky.embed.record#view', record: view(CUR, 'curator', 'tower1', { text: 'mid-2026 thread' }),
  }]);
  eq(reducePost(threadPost('t3', tower), new Map(), CUR).w.by, CUR, 'the self QT tower stays the curator\'s own');

  const other = view(CUR, 'curator', 'c9', {}, [{ $type: 'app.bsky.embed.record#view', record: artwork }]);
  eq(reducePost(threadPost('t4', other, ART), new Map(), CUR).w.by, ART,
    'a curator wrapper unwraps whoever files it: it is documentation of the artist either way');
  const theirs = view(ART, 'artist', 'a7', {}, [{ $type: 'app.bsky.embed.record#view', record: view(CUR, 'curator', 'c8', {}) }]);
  eq(reducePost(threadPost('t6', theirs), new Map(), CUR).w.by, ART,
    'only the curator\'s wrappers unwrap: an artist quoting the curator is still the artist\'s post');

  const gone = reducePost(threadPost('t5', { $type: 'app.bsky.embed.record#viewNotFound', uri: 'at://x/y/z' }), new Map(), CUR);
  eq(gone.w.gone, 'viewNotFound', 'a deleted work is kept, and marked');
}

// ---- stats on a small chapter -------------------------------------------
{
  const P = (u, t, by, w) => ({ u, t, by, cap: '', likes: 0, ...(w && { w }) });
  const W = (rkey, by, likes, kind = 'image') => ({ uri: `at://${by}/app.bsky.feed.post/${rkey}`, by, t: '2026-03-01T00:00:00Z', kind, likes });
  const ch = {
    curator: CUR, closeAt: '2026-03-10T12:00:00Z',
    posts: [
      P('r', '2026-03-02T09:00:00Z', CUR),
      P('a', '2026-03-02T10:00:00Z', CUR, W('x', ART, 5)),
      P('b', '2026-03-02T11:00:00Z', ART),                              // a voice
      P('c', '2026-03-04T10:00:00Z', CUR, W('b', ART, 9)),               // quotes an in-thread reply: not an entry
      P('d', '2026-03-09T10:00:00Z', CUR, W('x', ART, 5)),               // the same work, filed twice
      P('e', '2026-03-09T11:00:00Z', CUR, W('y', 'did:plc:b', 2, 'video')),
      P('f', '2026-03-09T12:00:00Z', CUR, { gone: 'viewNotFound', uri: 'at://gone' }),
      P('z', '2026-03-11T00:00:00Z', 'did:plc:late', W('q', 'did:plc:late', 1)), // after the close
    ],
  };
  const s = S.summary(ch);
  eq(s.entries, 3, 'entries: in-thread quotes, gone works and the epilogue are out');
  eq(s.works, 2, 'works are distinct');
  eq(s.repeats, 1, 'one repeat');
  eq(s.likes, 7, 'likes count a repeated work once');
  eq(s.artists, 2, 'artists');
  eq(s.voices, 1, 'one voice before the close');
  eq(s.after, 1, 'the epilogue is counted separately');
  eq(s.gone, 1, 'gone');
  eq(S.weekOf('2026-03-08T23:59:00Z'), '2026-03-02', 'Sunday belongs to the week of the Monday before');
  eq(S.weekOf('2026-03-09T00:00:00Z'), '2026-03-09', 'Monday starts its own week');
  eq(S.weekly(ch).map(w => w.n).join(','), '1,2', 'weekly fills every week');
  eq(S.canonGrowth(ch).map(g => g.artists).join(','), '1,1,2', 'cumulative artists');
  eq(S.silences(ch, 1)[0].days, 7, 'the longest silence');
  eq(S.loved(ch).length, 2, 'loved lists a repeated work once');
  eq(S.median([3, 1, 2, 10]), 2.5, 'median of an even list');
}

// ---- the real chapter, and the prose that describes it -------------------
{
  const ch = JSON.parse(readFileSync(new URL('./chapter-1.json', import.meta.url)));
  const s = S.summary(ch);
  ok(s.entries > 900 && s.artists > 100, `chapter 1 looks like chapter 1 (${s.entries} entries, ${s.artists} artists)`);
  const curatorRank = S.artists(ch).findIndex(a => a.did === ch.curator);
  ok(curatorRank !== 0, 'the curator is not the top artist — if they are, the wrappers stopped unwrapping');
  ok(ch.posts.every(p => !p.w || p.w.gone || p.w.by in ch.people), 'every credited artist has a person entry');

  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const derived = {
    ...s,
    top: ch.people[S.artists(ch)[0].did].h,
    loved: S.loved(ch, 1)[0].w.likes,
    silence: S.silences(ch, 1)[0].days,
    binge: S.binges(ch, 1)[0].n,
    onceOnly: S.artists(ch).filter(a => a.entries === 1).length,
    images: S.media(ch).image,
    videos: S.media(ch).video,
    peakWeek: Math.max(...S.weekly(ch).map(w => w.n)),
    sameDay: Math.round(100 * S.lag(ch).filter(l => l.days < 1).length / S.lag(ch).length),
  };
  const fmt = v => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
  let seen = 0;
  for (const m of html.matchAll(/data-stat="([a-zA-Z]+)"[^>]*>([^<]*)</g)) {
    seen++;
    const [, key, text] = m;
    ok(key in derived, `the prose cites a stat that does not exist: ${key}`);
    if (key in derived) eq(text, fmt(derived[key]), `the prose says ${key}`);
  }
  ok(seen >= 8, `the obituary cites its numbers through data-stat (${seen} found)`);
}

if (failures) { console.error(`obit selftest: ${failures} failure(s)`); process.exit(1); }
console.log('obit selftest: ok');
