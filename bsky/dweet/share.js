/**
 * Putting a dweet on Bluesky.
 *
 * Everything here is pure — text in, record out — so `share.selftest.mjs` can
 * check the arithmetic that actually breaks this: grapheme budgets and UTF-8
 * facet offsets. The parts that need a browser (capturing pixels, encoding an
 * image, uploading a blob) live in `app.js`.
 *
 * ─── what the post is, and why it is not an animation ──────────────────────
 *
 * The obvious idea is to attach the animated GIF. It does not work, and the
 * reason is worth writing down before somebody spends a day on it. Measured
 * 2026-09-22:
 *
 *   • The AppView never hands out the blob you uploaded. It hands out a
 *     `cdn.bsky.app/img/...` URL, and that CDN is a TRANSCODER: the bare URL
 *     answers `image/webp`, `@jpeg` answers `image/jpeg`, `@png` answers
 *     `image/png`. The reader's client picks the format, so the uploaded
 *     bytes are not what anybody sees.
 *   • The official composer re-encodes every picture to JPEG before it is
 *     uploaded at all (`social-app/src/state/gallery.ts`).
 *   • Motion in the Bluesky app is an `app.bsky.embed.external` PLAYER on an
 *     allowlist of HOSTS — tenor, giphy, klipy, the video sites
 *     (`social-app/src/lib/strings/embed-player.ts`). It is keyed on where the
 *     link points, not on what the file is, so nothing we upload can join it.
 *
 * The one in-feed animated path is `app.bsky.embed.video`, which requires a
 * transcode through `app.bsky.video.uploadVideo` at `did:web:video.bsky.app`
 * with a service-auth JWT. That is a real piece of work, not a wall — see
 * `dweet/CLAUDE.md` — and it is not this.
 *
 * So the post is three things that each do one job well:
 *
 *   TEXT     the source, verbatim. A dweet IS its source; 256 characters fit
 *            inside Bluesky's 300-grapheme budget with room for a link, which
 *            is the arithmetic the whole format turns on.
 *   IMAGE    one still, at the moment the author framed. Large, sharp, and it
 *            survives every transcode the CDN does to it.
 *   LINK     one tap to the same dweet, RUNNING. The source travels inside
 *            the URL, so the link works before the record has propagated,
 *            works for a draft that was never posted, and needs no lookup.
 */

/** Bluesky counts graphemes, and the ceiling is 300. */
export const POST_MAX = 300;

/** What the link renders AS. Shortened the way every client shortens a long
 *  URL, because the full one is ~380 characters and the budget is 300. */
export const LINK_TEXT = 'bsky.mino.mobi/dweet/…';

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** @param {string} s */
export function graphemes(s) {
  if (!s) return 0;
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  }
  return [...s].length;
}

// ── the self-contained permalink ──────────────────────────────────

/**
 * base64url of a UTF-8 string, without padding.
 *
 * Plain `btoa` throws on anything outside Latin-1, and a dweet is very likely
 * to contain one — half the golfing tricks in the format are about packing
 * data into a string literal. Encode to UTF-8 bytes first.
 */
export function b64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @returns {string|null} — null rather than a throw, because this parses a URL. */
export function unb64url(s) {
  try {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * A URL that carries the whole dweet.
 *
 * Deliberately not `?at=<uri>`. A record URI would be canonical and would need
 * a DID document lookup, a PDS round trip and a record that has actually
 * landed — three ways for a shared link to be a dead link in the minute after
 * posting, which is the minute it gets clicked. The source is 256 characters;
 * it fits in a query string, and then the link is true offline, true for a
 * draft, and true for a house seed that is not a record at all.
 */
export function permalink(base, { src, lang, title }) {
  const p = new URLSearchParams();
  p.set('s', b64url(src));
  if (lang === 'glsl') p.set('l', 'glsl');
  if (title) p.set('t', title.slice(0, 64));
  return `${base}?${p}`;
}

/** The inverse. @returns {{src,lang,title}|null} */
export function fromPermalink(search) {
  const p = new URLSearchParams(search);
  const s = p.get('s');
  if (!s) return null;
  const src = unb64url(s);
  if (!src) return null;
  return { src, lang: p.get('l') === 'glsl' ? 'glsl' : 'js', title: p.get('t') || '' };
}

// ── the post ──────────────────────────────────────────────────────

/**
 * Build the post's text and its facets.
 *
 * The budget is the whole design. 256 characters of source plus a 22-character
 * link plus two blank lines is 280, so the SOURCE ALWAYS FITS and is never
 * truncated — a truncated dweet is not a dweet, it is a typo. What gives way
 * is the credit line, which is the only optional part, and it gives way as a
 * whole rather than being trimmed to a stub.
 *
 * @param {object} o
 * @param {string} o.src
 * @param {'js'|'glsl'} o.lang
 * @param {string} [o.title]
 * @param {number} o.chars        as the composer counted them
 * @param {string} [o.tier]       the demoscene size class, e.g. '256b'
 * @param {string} o.url          the real destination
 * @param {string} [o.note]       anything the author typed
 * @returns {{text: string, facets: object[], dropped: string[]}}
 */
export function composePost({ src, lang, title, chars, tier, url, note }) {
  const dropped = [];
  const credit = [
    title ? `"${title}"` : null,
    `${chars} chars of ${lang === 'glsl' ? 'GLSL' : 'JavaScript'}`,
    tier || null,
  ].filter(Boolean).join(' · ');

  const build = (parts) => parts.filter((p) => p != null).join('\n\n');

  // Longest first, then drop in a fixed order. The link is never dropped: a
  // still picture of an animation with no way to see it move is the failure
  // this whole feature exists to avoid.
  const candidates = [
    { parts: [note || null, credit, src, LINK_TEXT], drops: null },
    { parts: [note || null, src, LINK_TEXT], drops: 'credit' },
    { parts: [credit, src, LINK_TEXT], drops: 'note' },
    { parts: [src, LINK_TEXT], drops: 'note and credit' },
  ];
  let text = null;
  for (const c of candidates) {
    const t = build(c.parts);
    if (graphemes(t) <= POST_MAX) { text = t; if (c.drops) dropped.push(c.drops); break; }
  }
  // Only reachable if the source itself is over budget, which `validate()`
  // already refuses. Fall back to something postable rather than throwing at
  // the last step, after the picture has already been uploaded.
  if (text == null) {
    text = build([src, LINK_TEXT]);
    dropped.push('everything but the source');
  }

  return { text, facets: [linkFacet(text, LINK_TEXT, url)], dropped };
}

/**
 * A `#link` facet over `needle`, in UTF-8 BYTES.
 *
 * Byte offsets, not string indices — and a dweet is exactly the kind of text
 * that makes the difference visible, because golfed JavaScript is full of
 * non-ASCII. Off by one here and the link either covers the wrong span or is
 * silently dropped by the client.
 */
export function linkFacet(text, needle, uri) {
  const enc = new TextEncoder();
  const at = text.lastIndexOf(needle);
  if (at < 0) throw new Error('link text is not in the post');
  return {
    index: {
      byteStart: enc.encode(text.slice(0, at)).length,
      byteEnd: enc.encode(text.slice(0, at + needle.length)).length,
    },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
  };
}

/**
 * Alt text for the still.
 *
 * A still of an animation needs to say that it IS a still, or a reader using a
 * screen reader is told about a picture and never learns there is anything to
 * press. It also carries the source, because for this art form the source is
 * the description — there is no other honest way to describe a dweet.
 */
export function altText({ title, lang, chars, src, atSeconds }) {
  const when = atSeconds > 0 ? ` at t=${atSeconds.toFixed(1)}s` : '';
  return [
    `A still${when} from ${title ? `"${title}"` : 'a dweet'} — an animation drawn by `
      + `${chars} characters of ${lang === 'glsl' ? 'GLSL' : 'JavaScript'}. Its whole source:`,
    src,
  ].join('\n');
}

/**
 * The record.
 *
 * @param {object} o
 * @param {string} o.text
 * @param {object[]} o.facets
 * @param {{blob:object, width:number, height:number, alt:string}} [o.image]
 */
export function feedPost({ text, facets, image }) {
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
  };
  if (facets?.length) record.facets = facets;
  if (image) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: [{
        image: image.blob,
        alt: image.alt,
        // Every client lays an image out from this BEFORE the bytes arrive. If
        // it disagrees with the picture the feed jumps as the image loads.
        aspectRatio: { width: image.width, height: image.height },
      }],
    };
  }
  return record;
}

/**
 * Choose which captured moment becomes the still.
 *
 * Two rules, in this order, and the order is the whole point:
 *
 *  1. IF THE FIRST CANDIDATE HAS ANYTHING IN IT, TAKE IT. Candidate 0 is the
 *     author's own `captureTime` — the frame they were looking at when they
 *     pressed post. Overriding that because a later frame is busier would be
 *     second-guessing a choice somebody made on purpose.
 *  2. Otherwise take the FULLEST of the rest. A dweet that draws nothing at
 *     t=0 is the common case, not an edge: the house heartbeat's loop is
 *     `for(a=t%8;a>0;a-=.01)`, which at t=0 runs zero times, and its still
 *     came out a perfectly black 1280x720 — measured, 0 lit pixels of 921,600.
 *     Those sketches accumulate, so the fullest candidate is also the most
 *     finished-looking one, where "first non-blank" would catch the heart
 *     one-quarter drawn.
 *
 * "Has anything in it" is measured rather than assumed, and the threshold is
 * deliberately generous — a dark, sparse sketch is a legitimate picture and
 * must not be rejected. If every candidate is under it, the first is returned
 * with `blank: true`, because a dweet that really is nearly black should show
 * as nearly black and say so, not be hunted for.
 *
 * @param {ArrayLike<number>[]} frames  RGBA
 * @returns {{frame: ArrayLike<number>, index: number, blank: boolean}}
 */
export function pickStill(frames, minLitRatio = 0.0015, threshold = 24) {
  const score = (f) => {
    let lit = 0, seen = 0;
    // A PRIME stride, so a regular pattern — a grid, a scanline sketch, a
    // column of bars — cannot align with the sampling and read as empty.
    for (let p = 0; p < f.length; p += 17 * 4) {
      seen++;
      if (f[p] + f[p + 1] + f[p + 2] > threshold) lit++;
    }
    return lit / seen;
  };

  const scores = frames.map(score);
  if (scores[0] >= minLitRatio) return { frame: frames[0], index: 0, blank: false };

  let best = -1, bestScore = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] >= minLitRatio && scores[i] > bestScore) { bestScore = scores[i]; best = i; }
  }
  if (best < 0) return { frame: frames[0], index: 0, blank: true };
  return { frame: frames[best], index: best, blank: false };
}

/**
 * The scopes a share needs, on top of the dweet collection itself.
 *
 * Both are already in the auth worker's ceiling (verified live 2026-09-22: 87
 * collections, `repo:app.bsky.feed.post` and `blob:image/*` among them), so
 * this needs no deploy of `workers/auth`. But a scope is only GRANTED if it is
 * asked for, and a session minted before this line was written does not have
 * it — which is what `ensureScope` is for, from a real gesture.
 */
export const SHARE_SCOPES = ['repo:app.bsky.feed.post', 'blob:image/*'];
