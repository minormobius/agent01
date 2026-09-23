/**
 * share.js — the arithmetic, which is the part that fails silently.
 *
 * Two kinds of bug live here and neither throws:
 *
 *   • a post one grapheme over the limit, which the PDS rejects at the very
 *     END, after the picture has been uploaded and the author has waited;
 *   • a facet whose byte range is computed from string indices, which shifts
 *     the moment the source contains one non-ASCII character — and a golfed
 *     dweet very often does.
 *
 *   node bsky/dweet/share.selftest.mjs
 */
import {
  composePost, linkFacet, altText, feedPost, permalink, fromPermalink, pickStill,
  b64url, unb64url, graphemes, POST_MAX, LINK_TEXT, SHARE_SCOPES,
} from './share.js';
import { MAX_CHARS } from './sandbox.js';

let pass = 0;
const fails = [];
const ok = (what, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(detail ? `${what} — ${detail}` : what);
};
const eq = (what, got, want) => ok(what, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const BASE = 'https://bsky.mino.mobi/dweet/';

// ── 1. the budget, at the worst case the format allows ───────────
{
  // MAX_CHARS graphemes of source is the most a valid dweet can be, and it is
  // the case that decides whether this feature works at all.
  const src = 'é'.repeat(MAX_CHARS);
  eq('fixture is exactly the cap', graphemes(src), MAX_CHARS);

  const { text, facets, dropped } = composePost({
    src, lang: 'js', title: 'a very long title indeed, going on and on',
    chars: MAX_CHARS, tier: 'open', url: BASE + '?s=x',
  });
  ok('max source: the post fits', graphemes(text) <= POST_MAX,
    `${graphemes(text)} graphemes`);
  ok('max source: the source is intact, never truncated', text.includes(src));
  ok('max source: the link survives', text.includes(LINK_TEXT));
  ok('max source: the credit line is what gave way', dropped.length > 0, JSON.stringify(dropped));
  eq('max source: exactly one facet', facets.length, 1);
}

// ── 2. a small dweet keeps everything ────────────────────────────
{
  const { text, dropped } = composePost({
    src: 'c.width|=0', lang: 'js', title: 'tiny', chars: 10, tier: '64b',
    url: BASE, note: 'first one',
  });
  eq('small: nothing dropped', dropped.length, 0);
  ok('small: the note leads', text.startsWith('first one'));
  ok('small: the credit names the tier', text.includes('64b'));
  ok('small: the credit names the language', text.includes('JavaScript'));
  ok('small: GLSL is named GLSL', composePost({
    src: 'o=vec4(1)', lang: 'glsl', chars: 9, url: BASE,
  }).text.includes('GLSL'));
}

// ── 3. facet byte offsets, which is where non-ASCII bites ────────
{
  const src = 'x.fillText("héllo→✨",0,0)';          // 2-, 3- and 4-byte runes
  const url = BASE + '?s=abc';
  const { text, facets } = composePost({ src, lang: 'js', chars: 25, url });
  const f = facets[0];

  const bytes = new TextEncoder().encode(text);
  const covered = new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
  eq('facet: the byte range covers exactly the link text', covered, LINK_TEXT);
  eq('facet: it points at the real URL', f.features[0].uri, url);
  eq('facet: correct $type', f.features[0].$type, 'app.bsky.richtext.facet#link');

  // The bug this is here to catch: using string indices would have given a
  // start that is SMALLER than the byte start, because the text before the
  // link contains multi-byte characters.
  ok('facet: byteStart is past where a string index would have put it',
    f.index.byteStart > text.lastIndexOf(LINK_TEXT),
    `bytes ${f.index.byteStart} vs chars ${text.lastIndexOf(LINK_TEXT)}`);
}

{
  let threw = '';
  try { linkFacet('nothing here', 'missing', BASE); } catch (e) { threw = e.message; }
  ok('facet: refuses a needle that is not in the text', /not in the post/.test(threw), threw);
}

// ── 4. the permalink round-trips, including awkward source ───────
{
  const cases = [
    { src: 'c.width|=0;x.fillRect(0,0,9,9)', lang: 'js', title: '' },
    { src: 'x.font="60px serif";x.fillText("🎉→é",S(t)*99+960,540)', lang: 'js', title: 'emoji' },
    { src: 'o=vec4(FC/r,S(t),1.);', lang: 'glsl', title: 'shader' },
    { src: '"\'`\\\n\t&?=#%+', lang: 'js', title: 'url metacharacters' },
  ];
  for (const c of cases) {
    const url = permalink(BASE, c);
    const back = fromPermalink(new URL(url).search);
    eq(`permalink: ${c.title || 'plain'} src survives`, back.src, c.src);
    eq(`permalink: ${c.title || 'plain'} lang survives`, back.lang, c.lang);
    eq(`permalink: ${c.title || 'plain'} title survives`, back.title, c.title);
    ok(`permalink: ${c.title || 'plain'} is a usable URL`, /^https:\/\/[^\s]+$/.test(url));
  }
  eq('permalink: no source means no dweet', fromPermalink('?l=glsl'), null);
  eq('permalink: undecodable source is refused, not repaired',
    fromPermalink('?s=' + encodeURIComponent('!!!not base64!!!')), null);
}

{
  // base64url must be URL-safe or the query string mangles it.
  const b = b64url('~~~????>>>>ÿþ');
  ok('b64url: no +, / or = in the output', !/[+/=]/.test(b), b);
  eq('b64url: round trips bytes exactly', unb64url(b), '~~~????>>>>ÿþ');
  eq('b64url: garbage decodes to null', unb64url('####'), null);
}

// ── 5. alt text says it is a still ───────────────────────────────
{
  const alt = altText({ title: 'heartbeat', lang: 'js', chars: 138, src: 'c.width|=0', atSeconds: 2.25 });
  ok('alt: says still', /still/i.test(alt));
  ok('alt: gives the moment', alt.includes('t=2.3s') || alt.includes('t=2.2s'), alt.slice(0, 60));
  ok('alt: carries the source', alt.includes('c.width|=0'));
  ok('alt: names the count', alt.includes('138'));
  const noTime = altText({ lang: 'glsl', chars: 9, src: 'o=vec4(1);', atSeconds: 0 });
  ok('alt: t=0 is not announced as a moment', !noTime.includes('t='), noTime.slice(0, 60));
  ok('alt: an untitled dweet is "a dweet"', noTime.includes('a dweet'));
}

// ── 6. the record ────────────────────────────────────────────────
{
  const { text, facets } = composePost({ src: 'c.width|=0', lang: 'js', chars: 10, url: BASE });
  const bare = feedPost({ text, facets });
  eq('record: $type', bare.$type, 'app.bsky.feed.post');
  eq('record: carries the facet', bare.facets.length, 1);
  ok('record: no embed when there is no picture', !('embed' in bare));
  ok('record: createdAt is an ISO instant', !isNaN(Date.parse(bare.createdAt)));

  const withImage = feedPost({
    text, facets,
    image: { blob: { $type: 'blob', ref: { $link: 'bafkrei' } }, width: 1920, height: 1080, alt: 'a still' },
  });
  eq('record: embed type', withImage.embed.$type, 'app.bsky.embed.images');
  eq('record: one image', withImage.embed.images.length, 1);
  eq('record: aspect ratio is carried', withImage.embed.images[0].aspectRatio.width, 1920);
  eq('record: alt is carried', withImage.embed.images[0].alt, 'a still');
  ok('record: the blob goes in as a ref, not as bytes',
    withImage.embed.images[0].image.$type === 'blob');

  // embed is ONE field, so a caller passing both has a bug. The video is the
  // richer thing and the still is its fallback, so the video wins — pinned so
  // the precedence cannot drift into "whichever branch came first".
  const both = feedPost({
    text, facets,
    image: { blob: { $type: 'blob' }, width: 1, height: 1, alt: 'still' },
    video: { $type: 'app.bsky.embed.video', video: { $type: 'blob' }, presentation: 'gif' },
  });
  eq('record: video beats image when both are passed', both.embed.$type, 'app.bsky.embed.video');
  eq('record: a video-only post carries the video embed',
    feedPost({ text, facets, video: { $type: 'app.bsky.embed.video' } }).embed.$type,
    'app.bsky.embed.video');
}

// ── 7. pickStill — the black-thumbnail bug ──────────────────────
{
  const W = 64, H = 36, N = W * H;
  const black = () => new Uint8ClampedArray(N * 4);
  const lit = (ratio, value = 200) => {
    const f = new Uint8ClampedArray(N * 4);
    // Spread across the whole buffer so a strided sample sees them, and use a
    // stride of 1 pixel in a contiguous run — the harshest case for sampling.
    const count = Math.max(1, Math.round(N * ratio));
    for (let p = 0; p < count; p++) {
      const at = Math.floor(p * (N / count)) * 4;
      f[at] = value; f[at + 1] = value; f[at + 2] = value; f[at + 3] = 255;
    }
    return f;
  };

  // The measured case: the house heartbeat draws nothing at t=0 because its
  // loop is `for(a=t%8;a>0;a-=.01)`. Frame 0 black, frame 1 drawn.
  const picked = pickStill([black(), lit(0.3), lit(0.3)]);
  ok('pickStill: skips a blank first frame', picked.index > 0, `index ${picked.index}`);
  eq('pickStill: does not flag a rescued frame as blank', picked.blank, false);

  // The author's own captureTime is candidate 0, and a busier later frame must
  // NOT override a moment somebody chose on purpose.
  eq('pickStill: frame 0 wins whenever it has content, however busy the rest',
    pickStill([lit(0.02), lit(0.9), lit(0.9)]).index, 0);

  // A progressive-draw sketch accumulates, so the FULLEST rescue is the most
  // finished-looking one. First-non-blank would take the quarter-drawn heart.
  eq('pickStill: among rescues, the fullest frame wins',
    pickStill([black(), lit(0.05), lit(0.4), lit(0.2)]).index, 2);

  const allBlack = pickStill([black(), black(), black()]);
  eq('pickStill: an entirely dark dweet falls back to the FIRST frame',
    allBlack.index, 0);
  eq('pickStill: …and says so', allBlack.blank, true);

  // A dark but real picture must not be rejected. 1% of pixels lit at a low
  // value is a legitimate sparse sketch — points on black, which is most of
  // what this art form looks like.
  const sparse = pickStill([lit(0.01, 40)]);
  eq('pickStill: a sparse dark sketch is kept', sparse.blank, false);

  // A regular grid must not alias against the sampling stride into "empty".
  const grid = new Uint8ClampedArray(N * 4);
  for (let p = 0; p < N; p += 4) { grid[p * 4] = 255; grid[p * 4 + 1] = 255; grid[p * 4 + 2] = 255; }
  eq('pickStill: a regular pattern does not alias to blank', pickStill([grid]).blank, false);

  // Below the threshold is genuinely nothing: a near-black frame with a
  // handful of very dim pixels should still be treated as not-yet-drawn.
  eq('pickStill: pixels under the brightness floor do not count',
    pickStill([lit(0.5, 5), lit(0.3)]).index, 1);
}

// ── 8. the scopes are the ones the ceiling actually has ──────────
{
  // Not a network check — a check that nobody has quietly added a scope here
  // that `workers/auth` has never declared. Widening this list means checking
  // the live ceiling and, if it is missing, asking the auth branch owner.
  eq('scopes: exactly the two that were verified against the live ceiling',
    SHARE_SCOPES.join(' '), 'repo:app.bsky.feed.post blob:image/*');
}

if (fails.length) {
  console.error(`\nshare.selftest: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`share.selftest: ${pass} assertions passed`);
