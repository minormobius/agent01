// thread selftest — run before changing b/thread/thread.js:
//   node b/thread/thread.selftest.mjs
//
// // Came across from photo, where this tool used to live, along with the
// assertions that were already proving it. Two things are worth the coverage:
//
//   WHAT COUNTS AS A POST URL. `parsePostInput` is the front door — everything
//   downstream assumes it either returned something usable or null, so a
//   half-parsed URL becomes a confusing failure three calls later.
//
//   WHICH EMBEDS ARE PICTURES. `app.bsky.embed.gallery` is what a post of more
//   than four pictures became, and it spells the array `items` and the small
//   rendition `thumbnail`. This reader knew neither, so every gallery post
//   rendered as nothing at all — no error, no warning. The fixture below is the
//   shape the real API returned for bsky.app/profile/antiali.as/post/3mrxguaxess2z,
//   the post that surfaced it.

import { extractMedia, parsePostInput } from './thread.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  \u2717 ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

{
  eq(parsePostInput('at://did:plc:x/app.bsky.feed.post/abc').uri, 'at://did:plc:x/app.bsky.feed.post/abc',
    'an AT-URI is taken as-is');
  const parsed = parsePostInput('https://bsky.app/profile/alice.bsky.social/post/3kabc');
  eq(parsed.handleOrDid, 'alice.bsky.social', 'a bsky.app URL yields the handle');
  eq(parsed.rkey, '3kabc', 'and the rkey');
  eq(parsePostInput('  https://bsky.app/profile/a.b/post/xyz?ref=1  ').rkey, 'xyz',
    'whitespace and query strings are tolerated');
  eq(parsePostInput('https://example.com/nope'), null, 'anything else is rejected rather than guessed at');
  eq(parsePostInput(''), null, 'and so is nothing');

  eq(extractMedia(null).length, 0, 'a post with no embed has no media');
  // extractMedia reads *hydrated* embeds from getPostThread — the `#view`
  // suffix is load-bearing, and a raw record type yields nothing.
  eq(extractMedia({ $type: 'app.bsky.embed.images#view', images: [{}, {}] }).length, 2, 'image embeds are found');
  eq(extractMedia({ $type: 'app.bsky.embed.images', images: [{}, {}] }).length, 0,
    'an un-hydrated record embed is not mistaken for a view');

  // GALLERIES. `app.bsky.embed.gallery` is what a post of more than four
  // pictures became; it spells the array `items` and the small rendition
  // `thumbnail`. Nothing here knew that, so every gallery post was invisible —
  // in the grid *and* in the thread reader — with no error to notice. This
  // fixture is the shape the real API returned for
  // bsky.app/profile/antiali.as/post/3mrxguaxess2z.
  {
    const gallery = {
      $type: 'app.bsky.embed.gallery#view',
      items: [
        {
          $type: 'app.bsky.embed.gallery#viewImage',
          thumbnail: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:x/bafk1',
          fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafk1',
          alt: 'a wall', aspectRatio: { width: 1600, height: 1042 },
        },
        {
          $type: 'app.bsky.embed.gallery#viewImage',
          thumbnail: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:x/bafk2',
          fullsize: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafk2',
          alt: '', aspectRatio: { width: 400, height: 267 },
        },
      ],
    };
    const got = extractMedia(gallery);
    eq(got.length, 2, 'a gallery embed yields one item per picture');
    eq(got[0].type, 'image', 'and they are images like any other');
    eq(got[0].thumb, gallery.items[0].thumbnail,
      'gallery spells the small rendition `thumbnail`; the reader still gets a `thumb`');
    eq(got[0].fullsize, gallery.items[0].fullsize, 'the full size comes through');
    eq(got[0].alt, 'a wall', 'so does the alt text');
    eq(got[1].aspectRatio.width, 400, 'and the aspect ratio');
    eq(extractMedia({ $type: 'app.bsky.embed.recordWithMedia#view', media: gallery, record: null }).length, 2,
      'a gallery quoted inside recordWithMedia is found too');
  }


}

if (failures) {
  console.error(`\n\u2717 thread selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('\u2713 thread selftest passed — post-URL parsing, and images/galleries/quotes out of a hydrated embed');
