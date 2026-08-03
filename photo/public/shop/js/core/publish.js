// publish.js — the pure half of "post this to Bluesky".
//
// Everything here is a function of its arguments: no canvas, no network, no
// DOM. The UI half (`ui/post.js`) supplies an encoder and the auth client; this
// file decides *what* to encode, *what* the record looks like, and *when* to
// give up. That split is the only reason any of it is testable, and the parts
// that are easy to get quietly wrong are exactly the parts that live here.
//
// THREE THINGS THAT BITE
// ---------------------
// * **Bluesky rejects a blob over 1,000,000 bytes.** Shop exports PNG at up to
//   2400px, which for a photograph is routinely 6–10 MB. So a post is not "the
//   export"; it is a *fitted* re-encode, and the user is told what was traded
//   away. Silently posting a picture that is not the one on screen would be the
//   worse failure.
// * **JPEG has no alpha.** A document with transparency encoded as JPEG comes
//   back with black where the holes were. So transparency is detected, PNG is
//   tried first, and only if PNG cannot fit does it fall back to JPEG — over
//   white, and said out loud.
// * **Facet offsets are in BYTES, not characters.** A URL after an emoji lands
//   at the wrong index if you count with `String.length`, and the link silently
//   covers the wrong text. Everything here measures with TextEncoder.

/** The narrow scope this page asks for: write posts, upload images. Nothing else.
 *  Both tokens are already inside the auth worker's declared ceiling
 *  (`workers/auth/src/oauth/scope.ts`), so no redeploy is needed to grant them. */
export const SCOPE = 'atproto repo:app.bsky.feed.post blob:image/*';

/** What Bluesky accepts for an image blob. Not a guess: the PDS answers
 *  `BlobTooLarge` with "this file is too large. it is 1234567 bytes, and the
 *  maximum is 1000000 bytes". */
export const BLOB_LIMIT = 1_000_000;

/** Graphemes, not characters — the same thing the Bluesky composer counts. */
export const TEXT_LIMIT = 300;

export const COLLECTION = 'app.bsky.feed.post';

// ─────────────────────────────────────────────────────────── albums ──
//
// The other place a finished picture can go: `photo.mino.mobi/albums`, which
// keeps `com.minomobi.arena.image` records in your own repo. Posting and
// saving are different intents and get different scopes — someone who only
// ever posts should never see an album collection on their consent screen — so
// this is asked for just in time, the first time you save.

export const ALBUM_SCOPE =
  'atproto repo:com.minomobi.arena.image repo:com.minomobi.arena.album blob:image/*';
export const IMAGE_COLLECTION = 'com.minomobi.arena.image';
export const ALBUM_COLLECTION = 'com.minomobi.arena.album';

/**
 * An album picture is not a post: nothing downstream re-encodes it and no
 * appview enforces a megabyte, so it is fitted to what a PDS will accept
 * rather than to what Bluesky will render, and it tries PNG first. What you
 * saved should be what you made.
 */
export const ARCHIVE_LIMIT = 3_000_000;

/** One `com.minomobi.arena.image` record. */
export function buildImageRecord({ blob, alt = '', W, H, createdAt } = {}) {
  if (!blob) throw new Error('an album picture needs an uploaded image');
  return {
    $type: IMAGE_COLLECTION,
    image: blob,
    alt: String(alt || ''),
    createdAt: createdAt || new Date().toISOString(),
    ...(W && H ? { aspectRatio: { width: Math.round(W), height: Math.round(H) } } : {}),
  };
}

/**
 * The album record with one more picture on the end. Pure: takes the album's
 * `value` and returns a new one, so the caller decides when to write it.
 */
export function appendToAlbum(album, { blob, alt = '', W, H } = {}) {
  if (!blob) throw new Error('an album entry needs an uploaded image');
  const entry = {
    image: blob,
    alt: String(alt || ''),
    ...(W && H ? { aspectRatio: { width: Math.round(W), height: Math.round(H) } } : {}),
  };
  return {
    ...album,
    images: [...(album?.images || []), entry],
    updatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────── fitting ──

/**
 * The ladder of encodes to try, in order, stopping at the first that fits.
 *
 * Quality first, then size: a photograph at 2400px and q=0.58 looks markedly
 * better than the same picture at 1000px and q=0.92, and posting the larger one
 * is what someone means by "post this". Only when quality alone cannot get
 * under the limit does the picture start shrinking.
 *
 * Twelve steps is the worst case and it is bounded on purpose — an unbounded
 * binary search on a 2400px canvas spends seconds of main-thread time to save
 * a few kilobytes nobody can see.
 */
export function encodePlan({ transparent = false } = {}) {
  const jpeg = [
    { type: 'image/jpeg', quality: 0.92, scale: 1 },
    { type: 'image/jpeg', quality: 0.82, scale: 1 },
    { type: 'image/jpeg', quality: 0.70, scale: 1 },
    { type: 'image/jpeg', quality: 0.58, scale: 1 },
    { type: 'image/jpeg', quality: 0.82, scale: 0.8 },
    { type: 'image/jpeg', quality: 0.68, scale: 0.8 },
    { type: 'image/jpeg', quality: 0.80, scale: 0.62 },
    { type: 'image/jpeg', quality: 0.65, scale: 0.62 },
    { type: 'image/jpeg', quality: 0.78, scale: 0.45 },
  ];
  if (!transparent) return jpeg;
  // Lossless while the holes still matter; JPEG-over-white only as a last resort.
  return [
    { type: 'image/png', scale: 1 },
    { type: 'image/png', scale: 0.8 },
    { type: 'image/png', scale: 0.62 },
    { type: 'image/png', scale: 0.45 },
    ...jpeg,
  ];
}

/** Does this picture have anything to lose by going through JPEG? */
export function hasTransparency(px) {
  for (let q = 3; q < px.length; q += 4) if (px[q] < 255) return true;
  return false;
}

/**
 * Walk the plan until something fits.
 *
 * `encode(step, i)` returns `{ bytes, W, H }` (or null to skip a step the
 * browser cannot do — Safari has historically refused some `toBlob` types).
 * Returns the first fitting attempt, or the last one tried with `fit: false`,
 * so the caller can say "the smallest this could be made is still 1.4 MB"
 * rather than throwing something the user cannot act on.
 */
export async function fitToLimit(plan, encode, limit = BLOB_LIMIT) {
  let last = null;
  for (let i = 0; i < plan.length; i++) {
    const got = await encode(plan[i], i);
    if (!got) continue;
    last = { ...got, step: plan[i], index: i, tried: i + 1, fit: got.bytes.length <= limit };
    if (last.fit) return last;
  }
  return last;
}

/** One line of plain English about what the fit cost. */
export function describeFit(fit, W, H) {
  if (!fit) return 'nothing could be encoded';
  const kb = `${Math.round(fit.bytes.length / 1024)} kB`;
  const kind = fit.step.type === 'image/png' ? 'PNG' : `JPEG q${Math.round(fit.step.quality * 100)}`;
  const scaled = fit.W !== W || fit.H !== H ? ` · scaled from ${W}×${H}` : '';
  const flattened = fit.step.type === 'image/jpeg' && fit.transparent ? ' · flattened onto white' : '';
  return `${fit.W}×${fit.H} ${kind} · ${kb}${scaled}${flattened}`;
}

// ─────────────────────────────────────────────────────────────── text ──

/** Count the way a person does — a flag or a family emoji is one character. */
export function countGraphemes(text) {
  const s = String(text || '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * Link facets for the bare URLs in `text`.
 *
 * Without these a posted URL is inert text — it renders as a string and nobody
 * can click it, which is how "post a link to the picture" quietly fails. Only
 * explicit `http(s)://` URLs are detected: bare `example.com` is ambiguous with
 * ordinary prose ("etc.com" in a sentence), and mentions would need a handle
 * resolution this page has no scope for.
 */
export function linkFacets(text) {
  const s = String(text || '');
  const enc = new TextEncoder();
  const facets = [];
  for (const m of s.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAILING, '');
    if (!raw) continue;
    const byteStart = enc.encode(s.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(raw).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: raw }],
    });
  }
  return facets;
}

// ───────────────────────────────────────────────────────────── record ──

/**
 * The `app.bsky.feed.post` record. `blob` is whatever `uploadBlob` handed back —
 * passed through untouched, because its `$type`/`ref`/`mimeType`/`size` shape is
 * the PDS's to define, not ours.
 */
export function buildPostRecord({ text = '', alt = '', blob, W, H, createdAt } = {}) {
  if (!blob) throw new Error('a post needs an uploaded image');
  const body = String(text || '');
  const record = {
    $type: COLLECTION,
    text: body,
    createdAt: createdAt || new Date().toISOString(),
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{
        alt: String(alt || ''),
        image: blob,
        ...(W && H ? { aspectRatio: { width: Math.round(W), height: Math.round(H) } } : {}),
      }],
    },
  };
  const facets = linkFacets(body);
  if (facets.length) record.facets = facets;
  return record;
}

/** `at://did:plc:xyz/app.bsky.feed.post/3k…` → the page a person can open. */
export function postPermalink(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(String(uri || ''));
  if (!m) return null;
  return `https://bsky.app/profile/${m[1]}/post/${m[3]}`;
}
