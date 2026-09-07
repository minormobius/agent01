// packages/feedgen selftest — the SkyFeed converter and the shared matcher.
//
// The invariant worth guarding is at the bottom: the *same post*, expressed as
// a hydrated AppView postView and as a raw Jetstream commit, must get the same
// verdict from the same filter chain. If those two ever disagree, a feed's
// preview on b.mino.mobi stops describing what hose.mino.mobi actually serves,
// and nobody would notice until the feed looked wrong.

import { fromSkyfeed, parseFeedRef } from './skyfeed.js';
import { fromPostView, fromCommit, passes, needsHydration, listUris, MATCHER_VERSION } from './match.js';

let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`  ✗ ${name}\n      got  ${g}\n      want ${w}`); failed++; }
  else console.log(`  ✓ ${name}`);
};
const ok = (name, cond) => eq(name, !!cond, true);

// ── the converter ────────────────────────────────────────────────────────────
// Structurally the real "txt for airports" builder — same block types in the
// same order. The live blocklist regexes are deliberately not vendored here:
// this asserts the block→filter mapping, not somebody's wordlist.
const BUILDER = {
  displayName: 'txt for airports',
  blocks: [
    { type: 'input', inputType: 'firehose', firehoseSeconds: 86400 },
    { type: 'remove', subject: 'language', language: 'en', operator: '!=' },
    { type: 'remove', subject: 'item', value: 'reply' },
    { type: 'remove', subject: 'image_count', value: '1' },
    { type: 'remove', subject: 'image_count', value: '2+' },
    { type: 'remove', subject: 'embed', value: 'post' },
    { type: 'remove', subject: 'language' },
    { type: 'regex', value: 'politics|discourse', invert: true, target: 'text|alt_text|link', caseSensitive: false },
    { type: 'remove', subject: 'list', listUri: 'at://did:plc:x/app.bsky.graph.list/bots' },
    { type: 'regex', value: ' ', caseSensitive: false },
    { type: 'sort', sortType: 'created_at' },
  ],
};

console.log('converter');
const { def, warnings } = fromSkyfeed({ displayName: 'txt for airports', description: 'd', skyfeedBuilder: BUILDER });
eq('no warnings on a clean feed', warnings, []);
eq('firehose input carries its window', def.inputs, [{ type: 'firehose', seconds: 86400 }]);
eq('sort created_at → latest', def.sort, { type: 'latest' });
eq('language != en → keep en, strictly', def.filters[0], { type: 'lang', code: 'en', strict: true });
eq('remove reply', def.filters[1], { type: 'removeReplies' });
eq('image_count 1 + 2+ collapse to one no-images filter', def.filters[2], { type: 'media', has: ['image'], mode: 'none' });
eq('embed post → no quotes', def.filters[3], { type: 'media', has: ['quote'], mode: 'none' });
eq('bare language block → noLang', def.filters[4], { type: 'noLang' });
eq('inverted regex → exclude, target preserved', def.filters[5],
  { type: 'regex', mode: 'exclude', pattern: 'politics|discourse', target: 'text|alt_text|link', caseSensitive: false });
eq('list block → author exclusion', def.filters[6], { type: 'list', uri: 'at://did:plc:x/app.bsky.graph.list/bots', mode: 'exclude' });
eq('plain regex → include', def.filters[7].mode, 'include');
eq('one filter per block, images collapsed', def.filters.length, 8);
eq('listUris finds the list', listUris(def), ['at://did:plc:x/app.bsky.graph.list/bots']);
eq('no hydration needed without engagement filters', needsHydration(def), false);

console.log('converter — loud about what it drops');
const odd = fromSkyfeed({ skyfeedBuilder: { blocks: [
  { type: 'remove', subject: 'image_count', value: '1' },
  { type: 'regex', value: '([unclosed' },
  { type: 'wobble' },
  { type: 'remove', subject: 'nonsense' },
] } });
eq('partial image_count warns', odd.warnings[0].startsWith('image_count 1 has no exact equivalent'), true);
ok('invalid regex warns and is skipped', odd.warnings.some((w) => w.startsWith('invalid regex')));
ok('unknown block warns', odd.warnings.some((w) => w.includes('unsupported block "wobble"')));
ok('unknown remove subject warns', odd.warnings.some((w) => w.includes('unsupported remove subject "nonsense"')));
eq('no filter survives an invalid regex', odd.def.filters.length, 1);
eq('a record with no builder is reported, not crashed', fromSkyfeed({ displayName: 'x' }).def, null);
eq('language == excludes', fromSkyfeed({ skyfeedBuilder: { blocks: [
  { type: 'remove', subject: 'language', language: 'pt', operator: '==' } ] } }).def.filters[0],
  { type: 'lang', code: 'pt', mode: 'exclude' });

console.log('parseFeedRef');
eq('at:// uri', parseFeedRef('at://did:plc:a/app.bsky.feed.generator/k'), { repo: 'did:plc:a', rkey: 'k' });
eq('bsky.app url', parseFeedRef('https://bsky.app/profile/did:plc:a/feed/k'), { repo: 'did:plc:a', rkey: 'k' });
eq('nonsense', parseFeedRef('hello'), null);

// ── the matcher ──────────────────────────────────────────────────────────────
const base = {
  uri: 'at://did:plc:a/app.bsky.feed.post/1', did: 'did:plc:a', text: 'a quiet runway',
  altText: '', links: [], langs: ['en'], isReply: false, isRepost: false,
  media: { image: false, video: false, link: false, quote: false },
  likeCount: null, repostCount: null, createdAt: '2026-08-21T00:00:00Z',
};
const p = (over = {}) => ({ ...base, ...over, media: { ...base.media, ...(over.media || {}) } });

console.log('matcher');
const noVideo = [{ type: 'media', has: ['video'], mode: 'none' }];
ok('text post survives the video filter', passes(p(), noVideo));
ok('video post is dropped', !passes(p({ media: { video: true } }), noVideo));
ok('image post survives a video-only filter', passes(p({ media: { image: true } }), noVideo));
ok('lang en keeps en', passes(p(), [{ type: 'lang', code: 'en' }]));
ok('lang en drops pt', !passes(p({ langs: ['pt'] }), [{ type: 'lang', code: 'en' }]));
ok('lang exclude drops pt', !passes(p({ langs: ['pt'] }), [{ type: 'lang', code: 'pt', mode: 'exclude' }]));
ok('en-GB matches en', passes(p({ langs: ['en-GB'] }), [{ type: 'lang', code: 'en' }]));
ok('noLang drops untagged', !passes(p({ langs: [] }), [{ type: 'noLang' }]));
ok('removeReplies drops a reply', !passes(p({ isReply: true }), [{ type: 'removeReplies' }]));
ok('removeReposts drops a repost', !passes(p({ isRepost: true }), [{ type: 'removeReposts' }]));

console.log('strict language');
{
  const loose  = [{ type: 'lang', code: 'en' }];
  const strict = [{ type: 'lang', code: 'en', strict: true }];
  const P = (langs) => ({ ...base, langs });

  ok('monolingual en passes either way', passes(P(['en']), loose) && passes(P(['en']), strict));
  ok('en-GB still counts as en under strict', passes(P(['en-GB']), strict));
  ok('a bilingual [en, pt] post passes the loose test', passes(P(['en', 'pt']), loose));
  ok('but is dropped by strict — it HAS a language that is not en', !passes(P(['en', 'pt']), strict));
  ok('order does not matter', !passes(P(['pt', 'en']), strict));
  ok('a purely non-english post is dropped either way',
    !passes(P(['pt']), loose) && !passes(P(['pt']), strict));
  ok('an untagged post is dropped by strict rather than sneaking through every()',
    !passes(P([]), strict));
  ok('exclude mode is unaffected by strict', !passes(P(['pt', 'en']), [{ type: 'lang', code: 'pt', mode: 'exclude' }]));
}

console.log('matcher — regex targets');
const exText = [{ type: 'regex', mode: 'exclude', pattern: 'politics', target: 'text' }];
const exAll = [{ type: 'regex', mode: 'exclude', pattern: 'politics', target: 'text|alt_text|link' }];
ok('text target ignores alt text', passes(p({ altText: 'politics' }), exText));
ok('alt_text target catches alt text', !passes(p({ altText: 'politics' }), exAll));
ok('link target catches a url', !passes(p({ links: ['https://x.example/politics'] }), exAll));
ok('case-insensitive by default', !passes(p({ text: 'POLITICS' }), exText));
ok('caseSensitive respected', passes(p({ text: 'POLITICS' }),
  [{ type: 'regex', mode: 'exclude', pattern: 'politics', target: 'text', caseSensitive: true }]));
ok('include regex requires a match', !passes(p({ text: 'nospacehere' }), [{ type: 'regex', mode: 'include', pattern: ' ' }]));
ok('an invalid pattern is skipped, not fatal', passes(p(), [{ type: 'regex', mode: 'include', pattern: '([' }]));

console.log('matcher — lists and engagement');
const listF = [{ type: 'list', uri: 'L', mode: 'exclude' }];
const lists = new Map([['L', new Set(['did:plc:bot'])]]);
ok('a listed author is dropped', !passes(p({ did: 'did:plc:bot' }), listF, { lists }));
ok('an unlisted author survives', passes(p(), listF, { lists }));
ok('an unresolvable list is skipped, not treated as empty',
  passes(p({ did: 'did:plc:bot' }), listF, { lists: new Map() }));
ok('minLikes defers when counts are unknown', passes(p(), [{ type: 'minLikes', n: 5 }]));
ok('minLikes applies when counts are known', !passes(p({ likeCount: 2 }), [{ type: 'minLikes', n: 5 }]));
eq('needsHydration spots minLikes', needsHydration({ filters: [{ type: 'minLikes', n: 5 }] }), true);

// ── galleries ────────────────────────────────────────────────────────────────
// `app.bsky.embed.gallery` is what a post of more than four images became. It is
// a DIFFERENT nsid from `app.bsky.embed.images` and spells its array `items`, so
// a "no images" filter that only knows embed.images passes every gallery post.
// That is not hypothetical: an adult image carousel reached a text-only feed
// through exactly this gap. Fixture shape is the real API response, taken from
// b/thread/thread.selftest.mjs which hit the same split in the reader layer.
console.log('galleries are pictures');
{
  const noPictures = [{ type: 'media', has: ['image'], mode: 'none' }];

  const galleryView = {
    $type: 'app.bsky.embed.gallery#view',
    items: [
      { $type: 'app.bsky.embed.gallery#viewImage', thumbnail: 't1', fullsize: 'f1', alt: 'a wall' },
      { $type: 'app.bsky.embed.gallery#viewImage', thumbnail: 't2', fullsize: 'f2', alt: '' },
    ],
  };
  const galleryRecord = {
    $type: 'app.bsky.embed.gallery',
    items: [{ image: {}, alt: 'a wall' }, { image: {}, alt: '' }],
  };
  const rec = { text: 'five pictures', langs: ['en'], createdAt: 'x', embed: galleryRecord };

  ok('a gallery is detected as an image, hydrated', fromPostView({ uri: 'at://d/c/1', record: rec, embed: galleryView }).media.image);
  ok('a gallery is detected as an image, off the wire', fromCommit('did:plc:a', '1', rec).media.image);
  ok('so a no-images feed drops it, hydrated', !passes(fromPostView({ uri: 'at://d/c/1', record: rec, embed: galleryView }), noPictures));
  ok('and drops it off the wire', !passes(fromCommit('did:plc:a', '1', rec), noPictures));
  eq('both shapes agree, as always',
    passes(fromCommit('did:plc:a', '1', rec), noPictures),
    passes(fromPostView({ uri: 'at://d/c/1', record: rec, embed: galleryView }), noPictures));

  eq('gallery alt text is read from `items`, not `images`',
    fromPostView({ uri: 'at://d/c/1', record: rec, embed: galleryView }).altText, 'a wall');
  ok('so an alt_text regex can see inside a gallery',
    !passes(fromPostView({ uri: 'at://d/c/1', record: rec, embed: galleryView }),
      [{ type: 'regex', mode: 'exclude', pattern: 'wall', target: 'text|alt_text' }]));

  const wrapped = { $type: 'app.bsky.embed.recordWithMedia#view', media: galleryView, record: {} };
  ok('a gallery inside recordWithMedia counts too',
    fromPostView({ uri: 'at://d/c/1', record: { ...rec, embed: { $type: 'app.bsky.embed.recordWithMedia', media: galleryRecord } }, embed: wrapped }).media.image);

  ok('and the old four-image lexicon still works',
    fromCommit('did:plc:a', '2', { text: 'x y', embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'q' }] } }).media.image);

  ok('MATCHER_VERSION is exported so a buffer built under older rules can be purged',
    Number.isInteger(MATCHER_VERSION) && MATCHER_VERSION >= 2);
}

// ── the invariant ────────────────────────────────────────────────────────────
console.log('one predicate, two shapes');

const RECORD = {
  text: 'the terminal at dawn, nobody about',
  langs: ['en'],
  createdAt: '2026-08-21T05:00:00Z',
  facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/politics' }] }],
  embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'an empty gate' }] },
};
const POSTVIEW = {
  uri: 'at://did:plc:a/app.bsky.feed.post/1',
  author: { did: 'did:plc:a' },
  record: RECORD,
  embed: { $type: 'app.bsky.embed.images#view', images: [{ alt: 'an empty gate' }] },
  likeCount: 0, repostCount: 0,
};

const CHAIN = [
  { type: 'lang', code: 'en' },
  { type: 'removeReplies' },
  { type: 'media', has: ['image'], mode: 'none' },
  { type: 'media', has: ['video'], mode: 'none' },
  { type: 'media', has: ['quote'], mode: 'none' },
  { type: 'noLang' },
  { type: 'regex', mode: 'exclude', pattern: 'politics', target: 'text|alt_text|link' },
  { type: 'regex', mode: 'include', pattern: ' ' },
];

const fromView = fromPostView(POSTVIEW);
const fromWire = fromCommit('did:plc:a', '1', RECORD);
eq('same uri', fromWire.uri, fromView.uri);
eq('same text', fromWire.text, fromView.text);
eq('same alt text', fromWire.altText, fromView.altText);
eq('same links', fromWire.links, fromView.links);
eq('same media flags', fromWire.media, fromView.media);

// Walk the chain one filter at a time: a blanket "both false" would pass even
// if the two shapes failed at different filters for different reasons.
for (let i = 0; i < CHAIN.length; i++) {
  const f = [CHAIN[i]];
  eq(`filter ${i} (${CHAIN[i].type}) agrees across shapes`, passes(fromWire, f), passes(fromView, f));
}
eq('whole chain agrees', passes(fromWire, CHAIN), passes(fromView, CHAIN));
ok('and this post is correctly rejected (it has an image)', !passes(fromWire, CHAIN));

const clean = { ...RECORD, embed: undefined, facets: undefined };
const cleanView = { ...POSTVIEW, record: clean, embed: undefined };
ok('a bare text post passes the whole chain', passes(fromCommit('did:plc:a', '2', clean), CHAIN));
eq('and agrees across shapes', passes(fromCommit('did:plc:a', '2', clean), CHAIN), passes(fromPostView(cleanView), CHAIN));

const videoRec = { ...clean, embed: { $type: 'app.bsky.embed.video', video: {}, alt: 'clip' } };
const videoView = { ...POSTVIEW, record: videoRec, embed: { $type: 'app.bsky.embed.video#view', alt: 'clip' } };
ok('a video post is rejected off the wire', !passes(fromCommit('did:plc:a', '3', videoRec), CHAIN));
ok('a video post is rejected when hydrated', !passes(fromPostView(videoView), CHAIN));

console.log(failed ? `\nFAILED (${failed})` : '\nfeedgen: all checks passed');
process.exit(failed ? 1 : 0);
