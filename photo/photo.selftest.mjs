// photo selftest — run before changing anything under photo/src/lib/:
//   node photo/photo.selftest.mjs
//
// The explorer is the oldest and most complex thing on this surface and, until
// now, the only part of it with no proof at all — while /glass, /glitch, /lens
// and /shop each carry a selftest that `scripts/preflight.mjs` runs on every
// change. That asymmetry is why a whole feature (colour extraction) could ship
// broken and stay broken: nothing was watching.
//
// This covers the parts that are pure functions of their input, which is most of
// the parts that were getting things wrong:
//
//   1. CID CONVERSION — the hand-rolled base32/multihash encoder in the hot path
//      of every image URL. It was correct and untested, which is the combination
//      that makes code frightening to touch.
//   2. IMAGE URLS — which source a picture comes from, and the CORS rule that
//      decides whether the pixels can be read back. Getting the second one
//      wrong is invisible until you sample a canvas.
//   3. FILTERS AND SORT — extracted out of a `useMemo` so the "portrait excludes
//      squares" question has an answer that isn't "open a browser and squint".
//   4. URL STATE — the round trip that makes a gallery view shareable.
//   5. THE NDJSON PREFILTER — the one-pass rewrite that removed three full
//      copies of the repo from the sync pipeline. Byte-for-byte against the
//      obvious implementation it replaced.
//   6. THE CATALOGUE — every tool the landing page advertises must actually
//      exist on disk. A 404 from the front page is the worst kind.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

import {
  base32Decode, base32Encode, cidFromRef, ensureCid, hexToCidV1Raw,
} from './src/lib/cid.js';
import { blobUrl, bloomUrl, fullUrl, postUrl, proxied, shopUrl, thumbUrl } from './src/lib/urls.js';
import {
  DEFAULT_FILTERS, applyFilters, dateRangeOf, matchesFilters, mergeMedia, sortMedia,
} from './src/lib/filters.js';
import { DEFAULT_SORT, decodeState, encodeState } from './src/lib/urlstate.js';
import { IMAGE_ARRAY_PATHS, filterPostsToBytes } from './src/lib/duckdb.js';
import {
  colorDistance, colorHue, colorToHex, medianCut,
} from './src/lib/colors.js';
import { GROUPS, NEEDS, REACT_ROUTES, TOOLS, toolsInGroup } from './src/lib/catalogue.js';
import { isAppRoute, legacyHashTarget, routeName } from './src/lib/route.js';
import {
  ARENA_SCOPE, albumEntry, albumMedia, importCandidates, uploadToMedia,
} from './src/lib/arena.js';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const approx = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);

// ═══════════════════════ 1. CID conversion ═══════════════════════
{
  // A real blob CID from a real post. Decoding it must reveal the multihash
  // prefix the encoder claims to write: 01 CIDv1, 55 raw, 12 sha2-256, 20 bytes.
  const real = 'bafkreifvw4djmv7ney453nfyozyvoxvrwrlnpmbfhezarsn6plkrcvrw64';
  const bytes = base32Decode(real.slice(1));
  eq([...bytes.slice(0, 4)].join(' '), '1 85 18 32', 'a real CID carries the CIDv1/raw/sha2-256/32 prefix');
  eq(bytes.length, 36, 'and is 4 header bytes + a 32-byte digest');

  const hex = [...bytes.slice(4)].map((b) => b.toString(16).padStart(2, '0')).join('');
  eq(hexToCidV1Raw(hex), real, 'hex → CID round-trips back to the original string');

  eq(ensureCid(real), real, 'a CIDv1 passes through untouched');
  eq(ensureCid(hex), real, 'a bare sha-256 hex is converted');
  eq(ensureCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG').slice(0, 2), 'Qm', 'a CIDv0 passes through');
  eq(ensureCid(''), '', 'an empty ref stays empty rather than becoming "undefined"');

  // base32 must round-trip every byte value, not just the ones a CID happens to
  // contain — the 5-bit/8-bit regrouping is where this kind of code goes wrong.
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const back = base32Decode(base32Encode(all));
  ok(all.every((v, i) => back[i] === v), 'base32 round-trips all 256 byte values');

  eq(cidFromRef({ $link: 'abc' }), 'abc', 'blob refs: the $link shape');
  eq(cidFromRef({ link: 'abc' }), 'abc', 'blob refs: the bare link shape');
  eq(cidFromRef('abc'), 'abc', 'blob refs: a plain string');
  eq(cidFromRef(null), null, 'blob refs: nothing');
}

// ═══════════════════════ 2. image URLs ═══════════════════════
{
  const cid = 'bafkreifvw4djmv7ney453nfyozyvoxvrwrlnpmbfhezarsn6plkrcvrw64';
  const did = 'did:plc:abc123';
  const map = { [did]: 'https://pds.example' };
  const post = { did, rkey: '3kabc', cid, source: 'post' };
  const upload = { did, rkey: '3kdef', cid, source: 'arena' };

  ok(thumbUrl(post, map).includes('feed_thumbnail'), 'the grid asks the CDN for a thumbnail');
  ok(fullUrl(post, map).includes('feed_fullsize'), 'the lightbox asks the CDN for a full-size rendition');
  ok(blobUrl(post, map).startsWith('https://pds.example/xrpc/com.atproto.sync.getBlob'), 'getBlob targets the PDS');
  ok(blobUrl(post, map).includes(encodeURIComponent(did)), 'and identifies the repo');

  // Uploads have no CDN rendition at all — every size must fall through to the
  // blob, or an uploaded image renders as a broken frame.
  ok(blobUrl(upload, map) === thumbUrl(upload, map), 'an upload has no CDN thumbnail');
  ok(blobUrl(upload, map) === fullUrl(upload, map), 'an upload has no CDN full-size either');
  eq(thumbUrl(post, {}), `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`,
    'CDN URLs do not need a PDS to be known');
  eq(blobUrl(post, {}), '', 'but a blob URL without a PDS is empty, not malformed');

  // THE CORS RULE. Anything whose pixels get read must go through the proxy;
  // display loads must not, or every thumbnail becomes a worker request.
  ok(proxied(thumbUrl(post, map)).startsWith('/api/img?u='), 'a CDN URL is proxied for sampling');
  ok(proxied(blobUrl(post, map)) === blobUrl(post, map), 'a PDS URL is left alone — it already allows CORS');
  eq(proxied(''), '', 'proxying nothing yields nothing');
  ok(decodeURIComponent(proxied(fullUrl(post, map)).slice('/api/img?u='.length)) === fullUrl(post, map),
    'the proxied URL round-trips through the query parameter');

  eq(postUrl(post), `https://bsky.app/profile/${did}/post/3kabc`, 'the permalink points at bsky.app');

  // Every picture in the archive opens in the editor. Shop does its own
  // proxying (it reads pixels, so it must), which is why the URL handed over is
  // the plain one — double-proxying would produce /api/img?u=/api/img?u=…
  {
    const handoff = shopUrl(fullUrl(post, map), { alt: 'a wet street' });
    ok(handoff.startsWith('/shop/?'), 'the handoff is a same-origin link into /shop');
    const q = new URLSearchParams(handoff.slice('/shop/?'.length));
    eq(q.get('u'), fullUrl(post, map), 'the picture arrives as ?u=, un-proxied');
    eq(q.get('alt'), 'a wet street', 'and its description travels with it');
    ok(!shopUrl(blobUrl(post, map)).includes('alt='), 'no description, no alt parameter');
    eq(shopUrl(''), '', 'nothing to open is not a link to nothing');
    // A getBlob URL is itself full of encoded colons and ampersands; if it were
    // not re-encoded here, shop would receive a truncated URL and fail to load
    // an upload — which is precisely the half of the archive that has no CDN.
    const blobHandoff = new URLSearchParams(shopUrl(blobUrl(post, map)).split('?')[1]);
    eq(blobHandoff.get('u'), blobUrl(post, map),
      'a PDS blob URL survives the round trip through the query string intact');

    // The second door. Shop is "I know what to do to this"; bloom is "I don't,
    // show me". Both have to hang off a picture or the second is reachable only
    // by people who already know it exists — which is how /sleuth stayed linked
    // from nowhere for months.
    const grow = bloomUrl(fullUrl(post, map));
    ok(grow.startsWith('/bloom/?u='), 'the same picture also opens in /bloom');
    eq(new URLSearchParams(grow.slice('/bloom/?'.length)).get('u'), fullUrl(post, map),
      'un-proxied there too — bloom renders thumbnails, so it proxies for itself');
    eq(new URLSearchParams(bloomUrl(blobUrl(post, map)).split('?')[1]).get('u'), blobUrl(post, map),
      'and a getBlob URL survives its encoding just the same');
    eq(bloomUrl(''), '', 'nothing to grow is not a link to nothing');
    ok(!bloomUrl(fullUrl(post, map)).includes('alt='),
      'no alt: bloom describes nothing and posts nothing, and an ignored parameter rots');
  }
}

// ═══════════════════════ 3. filters and sort ═══════════════════════
{
  const img = (over = {}) => ({
    did: 'did:plc:a', rkey: 'r' + Math.random().toString(36).slice(2), cid: 'c',
    type: 'image', source: 'post', alt: '', createdAt: '2026-01-15T00:00:00Z',
    aspectRatio: { width: 100, height: 100 }, ...over,
  });

  const landscape = img({ aspectRatio: { width: 300, height: 200 } });
  const portrait = img({ aspectRatio: { width: 200, height: 300 } });
  const square = img({ aspectRatio: { width: 200, height: 200 } });
  const noRatio = img({ aspectRatio: null });
  const shapes = [landscape, portrait, square, noRatio];

  const byAspect = (a) => applyFilters(shapes, { ...DEFAULT_FILTERS, aspect: a });
  ok(byAspect('landscape').includes(landscape), 'landscape keeps landscape');
  ok(!byAspect('landscape').includes(portrait), 'landscape drops portrait');
  ok(!byAspect('landscape').includes(square), 'landscape drops square — they are not complements');
  ok(byAspect('portrait').includes(portrait) && !byAspect('portrait').includes(square), 'portrait drops square too');
  ok(byAspect('square').length === 2 && byAspect('square').includes(square), 'square keeps only squares');
  ok(byAspect('landscape').includes(noRatio), 'an image with no declared ratio is kept, not guessed at');
  eq(byAspect('all').length, 4, 'aspect "all" keeps everything');

  const withAlt = img({ alt: 'a cat' });
  const without = img({ alt: '' });
  eq(applyFilters([withAlt, without], { ...DEFAULT_FILTERS, altText: 'has' }).length, 1, 'alt: has');
  eq(applyFilters([withAlt, without], { ...DEFAULT_FILTERS, altText: 'missing' })[0], without, 'alt: missing');

  const upload = img({ source: 'arena' });
  eq(applyFilters([withAlt, upload], { ...DEFAULT_FILTERS, source: 'posts' }).length, 1, 'source: posts');
  eq(applyFilters([withAlt, upload], { ...DEFAULT_FILTERS, source: 'uploads' })[0], upload, 'source: uploads');

  const video = img({ type: 'video' });
  eq(applyFilters([withAlt, video], { ...DEFAULT_FILTERS, blobType: 'video' })[0], video, 'type: video');

  const old = img({ createdAt: '2020-06-01T00:00:00Z' });
  const recent = img({ createdAt: '2026-06-01T00:00:00Z' });
  eq(applyFilters([old, recent], { ...DEFAULT_FILTERS, dateFrom: '2026-01-01' })[0], recent, 'dateFrom');
  eq(applyFilters([old, recent], { ...DEFAULT_FILTERS, dateTo: '2021-01-01' })[0], old, 'dateTo');
  eq(applyFilters([old, recent], { ...DEFAULT_FILTERS, dateFrom: '2026-01-01', dateTo: '2026-12-31' }).length, 1,
    'a date range is inclusive at both ends');

  // The colour rule that made the broken filter LOOK like it worked: with no
  // palette for an image, keep it. The bug was that no image ever had one.
  const red = img(), blue = img();
  const regions = (item) => (item === red ? new Set(['red']) : item === blue ? new Set(['blue']) : null);
  const unsampled = img();
  const byColour = applyFilters([red, blue, unsampled], { ...DEFAULT_FILTERS, color: 'red' }, regions);
  ok(byColour.includes(red), 'colour filter keeps a matching image');
  ok(!byColour.includes(blue), 'colour filter drops a non-matching image');
  ok(byColour.includes(unsampled), 'an un-sampled image is kept — the grid must not empty out mid-scan');
  eq(applyFilters([red, blue], { ...DEFAULT_FILTERS, color: 'red' }, null).length, 2,
    'with no palette source at all, the colour filter does nothing');

  ok(matchesFilters(withAlt, DEFAULT_FILTERS), 'the default filters match everything');

  // sort
  const a = img({ createdAt: '2026-03-01T00:00:00Z' });
  const b = img({ createdAt: '2026-01-01T00:00:00Z' });
  const newestFirst = [a, b];
  eq(sortMedia(newestFirst, 'newest')[0], a, 'newest is the identity — the SQL already ordered it');
  eq(sortMedia(newestFirst, 'oldest')[0], b, 'oldest reverses');
  ok(sortMedia(newestFirst, 'oldest') !== newestFirst, 'and does not mutate the input');
  const likes = new Map([[a, { likeCount: 3 }], [b, { likeCount: 99 }]]);
  eq(sortMedia(newestFirst, 'most-liked', (i) => likes.get(i))[0], b, 'most-liked sorts by likes');
  eq(sortMedia(newestFirst, 'most-liked', null)[0], a, 'most-liked without engagement data falls back to date order');

  // merge
  const merged = mergeMedia({
    images: [{ createdAt: '2026-01-01' }],
    videos: [{ createdAt: '2026-05-01' }],
    uploads: [{ createdAt: '2026-03-01' }],
  });
  eq(merged.length, 3, 'merge keeps everything');
  eq(merged[0].createdAt, '2026-05-01', 'merge sorts newest first');
  eq(merged[0].type, 'video', 'videos are tagged');
  eq(merged[2].source, 'post', 'post images are tagged');
  eq(merged[1].source, 'arena', 'uploads are tagged');

  const range = dateRangeOf(merged);
  eq(range.min, '2026-01-01', 'date range finds the earliest');
  eq(range.max, '2026-05-01', 'date range finds the latest');
  eq(dateRangeOf([]), null, 'an empty collection has no date range');
  eq(dateRangeOf([{ createdAt: '' }]), null, 'and neither does one with no dates');
}

// ═══════════════════════ 4. URL state ═══════════════════════
{
  eq(encodeState({}), '', 'an empty state adds nothing — defaults never reach the URL');
  eq(encodeState({ handles: [], filters: DEFAULT_FILTERS, sortBy: DEFAULT_SORT }), '',
    'and neither do explicit defaults');

  const state = {
    handles: ['alice.bsky.social', 'bob.example'],
    filters: { ...DEFAULT_FILTERS, aspect: 'portrait', altText: 'has', dateFrom: '2026-01-01' },
    sortBy: 'most-liked',
  };
  const query = encodeState(state);
  ok(query.startsWith('?'), 'a non-default state is a query string');
  ok(query.includes('u=alice.bsky.social') && query.includes('u=bob.example'), 'both handles survive');

  const back = decodeState(query);
  eq(back.handles.join(','), 'alice.bsky.social,bob.example', 'handles round-trip in order');
  eq(back.filters.aspect, 'portrait', 'filters round-trip');
  eq(back.filters.altText, 'has', 'every filter round-trips');
  eq(back.filters.dateFrom, '2026-01-01', 'dates round-trip');
  eq(back.sortBy, 'most-liked', 'sort round-trips');
  eq(back.filters.color, 'all', 'untouched filters come back as their default');

  // This string arrived from an address bar. It gets no trust at all.
  const junk = decodeState('?aspect=%F0%9F%90%9B&sort=sideways&from=yesterday&u=@carol');
  eq(junk.filters.aspect, 'all', 'a bogus enum value falls back to the default');
  eq(junk.sortBy, 'newest', 'a bogus sort falls back to the default');
  eq(junk.filters.dateFrom, '', 'a non-ISO date is rejected');
  eq(junk.handles[0], 'carol', 'a leading @ is stripped from a handle');

  eq(decodeState('').sortBy, 'newest', 'an empty query decodes to defaults');
  eq(decodeState(undefined).filters.aspect, 'all', 'and so does no query at all');
  // Links shared before the tools got real paths arrive as fragments; the same
  // decoder has to read them, because `lib/route.js` only moves the path.
  eq(decodeState('#/explore?u=alice.bsky.social').handles[0], 'alice.bsky.social',
    'a legacy fragment URL still decodes');
  eq(decodeState('#/explore').handles.length, 0, 'a bare legacy route decodes to no handles');

  // The property that matters: encode ∘ decode is the identity on valid state.
  eq(encodeState(decodeState(query)), query, 'encode(decode(x)) === x');
}

// ═══════════════════════ 5. the NDJSON prefilter ═══════════════════════
{
  const line = (collection, value) => JSON.stringify({ collection, rkey: 'r', value });
  const lines = [
    line('app.bsky.feed.post', { text: 'hello' }),
    line('app.bsky.feed.like', { subject: { uri: 'at://did:plc:x/app.bsky.feed.post/abc' } }),
    line('app.bsky.graph.follow', { subject: 'did:plc:y' }),
    line('app.bsky.feed.post', { text: 'world' }),
    line('app.bsky.feed.repost', { subject: { uri: 'at://did:plc:x/app.bsky.feed.post/def' } }),
  ];
  const ndjson = lines.join('\n');

  const { bytes, totalLines, kept } = filterPostsToBytes(ndjson);
  eq(totalLines, 5, 'every non-empty line is counted, for the record total shown to the user');
  eq(kept, 2, 'only posts are kept');

  // A like's value contains ".../app.bsky.feed.post/abc" — the quoted-name test
  // must not match it, or 95% of a repo would sail through the filter.
  const text = new TextDecoder().decode(bytes);
  ok(!text.includes('feed.like'), 'a like whose subject URI mentions a post is not a false positive');
  ok(!text.includes('graph.follow'), 'a follow is dropped');
  eq(text.trim().split('\n').length, 2, 'the output has exactly the kept lines');

  // Byte-for-byte against the split/filter/join/encode chain this replaced.
  const legacy = new TextEncoder().encode(
    ndjson.split('\n').filter((l) => l && l.includes('"app.bsky.feed.post"')).join('\n') + '\n');
  eq(bytes.length, legacy.length, 'the one-pass rewrite emits the same number of bytes');
  ok(bytes.every((b, i) => b === legacy[i]), 'and the same bytes');

  // Edge cases that would have thrown or silently miscounted.
  eq(filterPostsToBytes('').totalLines, 0, 'empty input');
  eq(filterPostsToBytes('\n\n\n').totalLines, 0, 'blank lines are not records');
  eq(filterPostsToBytes(lines[0]).kept, 1, 'a single line with no trailing newline is kept');

  // The buffer starts at 1 MiB and doubles; a repo bigger than that must survive
  // the growth path with its contents intact.
  const big = Array.from({ length: 4000 }, (_, i) => line('app.bsky.feed.post', { text: 'x'.repeat(400) + i }));
  const grown = filterPostsToBytes(big.join('\n'));
  eq(grown.kept, 4000, 'the growable buffer keeps every record across several doublings');
  ok(new TextDecoder().decode(grown.bytes).includes('x'.repeat(400) + '3999'), 'including the last one');
}

// ═══════════════════════ 6. the catalogue ═══════════════════════
{
  ok(TOOLS.length >= 10, `the landing page lists the surface (${TOOLS.length} tools)`);

  const ids = new Set();
  for (const tool of TOOLS) {
    ok(!ids.has(tool.id), `tool ids are unique (${tool.id})`);
    ids.add(tool.id);
    ok(!!tool.name && !!tool.blurb && !!tool.href, `${tool.id}: has a name, a blurb and a link`);
    ok(tool.blurb.length > 40, `${tool.id}: the blurb says something`);
    ok(GROUPS.some((g) => g.id === tool.group), `${tool.id}: belongs to a real group`);
    ok(!tool.needs || NEEDS[tool.needs], `${tool.id}: its "needs" tag has a description`);

    // The check that matters: a link from the front page must not 404. Static
    // tools live under public/ (copied verbatim into dist), except /dm, which
    // is its own Vite entry point at photo/dm/.
    if (tool.kind === 'static') {
      const dir = tool.href.replace(/^\/|\/$/g, '');
      const inPublic = existsSync(join(HERE, 'public', dir, 'index.html'));
      const asEntry = existsSync(join(HERE, dir, 'index.html'));
      ok(inPublic || asEntry, `${tool.id}: ${tool.href} exists on disk`);
    } else {
      ok(/^\/[a-z][a-z0-9-]*$/.test(tool.href), `${tool.id}: a react route is a real path`);
      ok(isAppRoute(tool.href), `${tool.id}: and the router knows it`);
    }
  }

  for (const group of GROUPS) {
    ok(toolsInGroup(group.id).length > 0, `the "${group.label}" group is not empty`);
    ok(!!group.note, `the "${group.label}" group explains itself`);
  }

  // Every route App.jsx can render must be advertised somewhere, or we are back
  // to #/sleuth: shipped, working, and reachable only by typing the URL.
  for (const expected of ['/explore', '/albums', '/codescan']) {
    ok(REACT_ROUTES.includes(expected), `${expected} is listed on the landing page`);
  }

  // THE TWO-LIST HAZARD. These paths only work because worker.js answers them
  // with index.html; a route it does not know 404s for anyone who types it, and
  // the failure is invisible from the app. Read the worker's own source rather
  // than trusting that it still imports the catalogue.
  {
    const worker = readFileSync(join(HERE, 'worker.js'), 'utf8');
    ok(/REACT_ROUTES/.test(worker) && /from '\.\/src\/lib\/catalogue\.js'/.test(worker),
      'worker.js builds its route list from the catalogue rather than a second copy');
    ok(/env\.ASSETS\.fetch\(new Request\(new URL\('\/'/.test(worker),
      'and serves the app shell for them');
    // Static Assets' default html_handling answers `/index.html` with a 307 to
    // `/`. Returned from the worker that is a redirect the browser follows, so
    // asking for the file by name would bounce every route to the landing page.
    ok(!/new URL\('\/index\.html'/.test(worker),
      'by asking for `/`, not `/index.html` — the latter is a 307 to the former');
  }

  // App.jsx has to render each one — a route the worker serves and the app does
  // not know renders the landing page, which reads as "the link is broken".
  {
    const app = readFileSync(join(HERE, 'src', 'App.jsx'), 'utf8');
    for (const href of REACT_ROUTES) {
      ok(app.includes(`case '${routeName(href)}':`), `App.jsx renders ${href}`);
    }
  }
}

// ═══════════════════════ 6b. routes, old and new ═══════════════════════
{
  eq(routeName('/explore'), 'explore', 'a path is named by its one segment');
  eq(routeName('/Explore/'), 'explore', 'slashes and case do not matter');
  eq(routeName('/'), '', 'the landing page has no name');
  ok(isAppRoute('/explore') && !isAppRoute('/shop'), 'static pages are not app routes');

  // Links shared while this surface was hash-routed have to keep working.
  eq(legacyHashTarget('/', '#/explore'), '/explore', 'a bare fragment route becomes a path');
  eq(legacyHashTarget('/', '#/explore?u=alice&aspect=portrait'), '/explore?u=alice&aspect=portrait',
    'and it keeps its query');
  eq(legacyHashTarget('/', '#/'), '/', 'the root fragment is just the root');
  eq(legacyHashTarget('/', ''), null, 'no fragment, nothing to do');
  eq(legacyHashTarget('/explore', '#anchor'), null, 'a real anchor on a real path is left alone');
  eq(legacyHashTarget('/', '#/nonsense'), null, 'an unknown route is not invented');

  // TWO ROUTES LEFT THE SURFACE ENTIRELY. /thread and /sleuth read Bluesky
  // text, never pictures, and moved to b.mino.mobi. Every address they ever had
  // still has to work — and a fragment never reaches a server, so the client
  // has to do this half itself. The deep links are translated, not dropped: a
  // redirect that loses the thing you were looking at is only half a redirect.
  eq(legacyHashTarget('/', '#/thread'), 'https://b.mino.mobi/thread/',
    'a moved route redirects off the surface');
  eq(legacyHashTarget('/', '#/thread/https%3A%2F%2Fbsky.app%2Fprofile%2Fa.b%2Fpost%2Fxyz'),
    `https://b.mino.mobi/thread/?p=${encodeURIComponent('https://bsky.app/profile/a.b/post/xyz')}`,
    'and carries its deep link across as ?p=');
  eq(legacyHashTarget('/', '#/sleuth/alice.bsky.social'), 'https://b.mino.mobi/sleuth/?u=alice.bsky.social',
    "sleuth's handle deep link becomes ?u=");
  ok(!isAppRoute('/thread') && !isAppRoute('/sleuth'),
    'and neither is an app route here any more — the worker 301s them');
}

// ═══════════════════════ 6d. embeds by shape ═══════════════════════
{
  // The SQL side of the same lexicon. extractImages matches on shape rather
  // than on embed name precisely so a new lexicon does not need this list
  // touched — but the four paths it does know must all be present, because
  // dropping one silently loses a whole class of post.
  for (const path of ['$.embed.images', '$.embed.items', '$.embed.media.images', '$.embed.media.items']) {
    ok(IMAGE_ARRAY_PATHS.includes(path), `extractImages looks under ${path}`);
  }
}

// ═══════════════════════ 6c. albums ═══════════════════════
{
  const blob = { $type: 'blob', ref: { $link: 'bafkalbum' }, mimeType: 'image/jpeg', size: 9 };

  const bare = albumEntry(blob, { alt: 'a wall' });
  eq(bare.image, blob, 'an album entry carries the blob ref itself');
  eq(bare.alt, 'a wall', 'and its description');
  ok(!('source' in bare), 'a picture of your own gets no provenance block');

  // WHY THIS MATTERS: adding someone else's picture copies the bytes into your
  // repo, because a record pointing at a blob your PDS does not hold resolves
  // for nobody. The one thing that must survive the copy is where it came from.
  const borrowed = albumEntry(blob, {
    alt: 'theirs',
    aspectRatio: { width: 4, height: 3 },
    source: { did: 'did:plc:them', rkey: '3kabc', handle: 'them.bsky.social' },
  });
  eq(borrowed.source.did, 'did:plc:them', 'a copied picture remembers whose it was');
  eq(borrowed.source.rkey, '3kabc', '…and which post');
  eq(borrowed.aspectRatio.width, 4, 'the aspect ratio survives the copy');
  let threw = false;
  try { albumEntry(null); } catch { threw = true; }
  ok(threw, 'an entry with no blob is refused rather than written');

  // Album entries are positions in a list, not records. The synthetic rkey has
  // to be stable and unique or React re-keys the grid on every edit and the
  // browser re-downloads every thumbnail.
  const album = {
    rkey: 'alb1',
    value: { name: 'linocuts', updatedAt: '2026-07-01T00:00:00Z', images: [borrowed, bare] },
  };
  const mediaList = albumMedia(album, 'did:plc:me');
  eq(mediaList.length, 2, 'every entry becomes one grid item');
  eq(mediaList[0].rkey, 'alb1#0', 'entries are keyed by album and position');
  eq(mediaList[1].rkey, 'alb1#1', '…uniquely');
  eq(mediaList[0].index, 0, 'and keep the index that removal needs');
  eq(mediaList[0].cid, 'bafkalbum', 'the blob ref is resolved to a CID');
  eq(mediaList[0].source, 'album', 'they are album pictures, so they resolve via getBlob');
  eq(mediaList[0].provenance.handle, 'them.bsky.social', 'provenance reaches the lightbox');
  eq(albumMedia({ rkey: 'x', value: {} }, 'did:plc:me').length, 0, 'an empty album is empty');

  eq(uploadToMedia({ rkey: 'i1', value: { image: blob, alt: 'up' } }, 'did:plc:me').source, 'arena',
    'an uploaded record is an arena picture');

  // The import order: the author's original first, the CDN rendition second and
  // proxied — the CDN sends no CORS header, so its bytes are unreadable direct.
  const target = { did: 'did:plc:them', rkey: '3kabc', cid: 'bafkalbum', source: 'post' };
  const cands = importCandidates(target, { 'did:plc:them': 'https://pds.example' });
  eq(cands.length, 2, 'two sources are worth trying');
  ok(cands[0].includes('com.atproto.sync.getBlob'), 'the original comes first');
  ok(cands[1].startsWith('/api/img?u='), 'the CDN fallback goes through the proxy');
  eq(importCandidates({ ...target, cid: 'bafkalbum' }, {}).length, 1,
    'with no PDS known, only the CDN is left');

  ok(ARENA_SCOPE.split(' ').every((t) => [
    'atproto', 'repo:com.minomobi.arena.image', 'repo:com.minomobi.arena.album', 'blob:image/*',
  ].includes(t)), 'the sign-in asks for two collections and image blobs, and nothing else');
}

// ═══════════════════════ 7. the rest of the pure core ═══════════════════════
{
  // medianCut — the palette quantiser.
  const pixels = [];
  for (let i = 0; i < 50; i++) pixels.push([250, 10, 10]);
  for (let i = 0; i < 50; i++) pixels.push([10, 10, 250]);
  const palette = medianCut(pixels, 2);
  eq(palette.length, 2, 'median cut splits two clusters into two colours');
  approx(palette[0].pct + palette[1].pct, 1, 1e-9, 'the percentages are a partition');
  ok(palette.every((c) => c.r <= 255 && c.g <= 255 && c.b <= 255), 'and stay in gamut');
  const flat = medianCut(Array.from({ length: 20 }, () => [128, 128, 128]), 4);
  eq(flat.length, 1, 'a uniform image yields one colour, not four identical ones');
  eq(medianCut([], 4).length, 0, 'no pixels, no palette');

  eq(colorToHex({ r: 255, g: 0, b: 128 }), '#ff0080', 'hex conversion pads correctly');
  eq(colorToHex({ r: 0, g: 0, b: 0 }), '#000000', 'and handles zero');
  approx(colorHue({ r: 255, g: 0, b: 0 }), 0, 0.01, 'red is hue 0');
  approx(colorHue({ r: 0, g: 255, b: 0 }), 120, 0.01, 'green is hue 120');
  approx(colorHue({ r: 0, g: 0, b: 255 }), 240, 0.01, 'blue is hue 240');
  eq(colorHue({ r: 7, g: 7, b: 7 }), 0, 'grey has no hue');
  approx(colorDistance({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }), 255, 0.01, 'colour distance is Euclidean');

}

// ═══════════ every import in public/ actually resolves ═══════════
//
// THE BUG THIS CATCHES. `public/**` is copied into `dist/` verbatim — no
// bundler, no module graph, nothing that reads an import statement before a
// browser does. So deleting an export and leaving one importer behind builds
// green, deploys green, and takes the entire page down on load with
// "does not provide an export named …". It happened while removing a function
// that had become unused: `npm run build` said ✓ and /shop was a blank veil.
//
// A browser resolves these at load; this resolves them at test time.
{
  const ROOT = join(HERE, 'public');
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(full); }
      else if (e.name.endsWith('.js')) files.push(full);
    }
  };
  walk(ROOT);
  ok(files.length > 20, `there is a tree of unbundled modules to check (${files.length} files)`);

  // `import { a, b as c } from './x.js'` — the only form used in this tree, and
  // the only one that can fail this way. A namespace or default import cannot.
  const NAMED = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g;
  const EXPORTED = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g;
  const EXPORT_LIST = /export\s*\{([^}]*)\}/g;

  const exportsOf = (file) => {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(EXPORTED)) names.add(m[1]);
    for (const m of src.matchAll(EXPORT_LIST)) {
      for (const part of m[1].split(',')) {
        const as = part.split(/\sas\s/);
        const name = (as[1] || as[0]).trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  const cache = new Map();
  let checked = 0;
  let dangling = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(NAMED)) {
      const target = resolve(dirname(file), m[2]);
      if (!existsSync(target)) {
        dangling.push(`${relative(HERE, file)} imports a file that is not there: ${m[2]}`);
        continue;
      }
      if (!cache.has(target)) cache.set(target, exportsOf(target));
      const available = cache.get(target);
      for (const part of m[1].split(',')) {
        const name = part.split(/\sas\s/)[0].trim();
        if (!name) continue;
        checked++;
        if (!available.has(name)) {
          dangling.push(`${relative(HERE, file)} imports { ${name} } from ${m[2]}, which does not export it`);
        }
      }
    }
  }
  eq(dangling.length, 0, `every named import in public/ resolves (${checked} checked)\n     ${dangling.join('\n     ')}`);
}

// ═══════════════════════════════ verdict ═══════════════════════════════
if (failures) {
  console.error(`\n✗ photo selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log(`✓ photo selftest passed — CIDs, image URLs, filters, URL state, `
  + `the NDJSON prefilter, ${TOOLS.length} catalogued tools, every import in public/, `
  + `and the search/palette/thread core`);
