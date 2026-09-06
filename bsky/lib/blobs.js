/**
 * Blobs — images, video and link cards.
 *
 * An AppView without pictures is a text log, and this is the piece that makes
 * the difference. The awkward part is that the SAME post arrives in two
 * different shapes depending on where it came from, and only one of them
 * carries usable URLs:
 *
 *   HYDRATED (getPosts / getAuthorFeed) — `post.embed` is a `#view`: the CDN
 *   has already been consulted, so `thumb`, `fullsize`, `playlist` and
 *   `thumbnail` are complete URLs. Use them as given.
 *
 *   RAW (Jetstream, and anything we stored from it) — `record.embed` holds
 *   BLOB REFS, not URLs: `{$type:'blob', ref:{$link:'bafkrei…'}, mimeType}`.
 *   A blob ref is meaningless without the DID of the repo holding it, which is
 *   why every function here takes `did` alongside the embed.
 *
 * So `renderEmbed(record, did, viewEmbed)` prefers the view when there is one
 * and reconstructs from the ref when there is not. Both paths were checked
 * against live data on 2026-09-06; the constructed URLs return 200 image/jpeg.
 *
 * URL shapes (cdn.bsky.app, no auth, CORS-open):
 *   avatar        /img/avatar/plain/<did>/<cid>@jpeg
 *   feed thumb    /img/feed_thumbnail/plain/<did>/<cid>@jpeg
 *   feed fullsize /img/feed_fullsize/plain/<did>/<cid>@jpeg
 *   video         https://video.bsky.app/watch/<urlencoded did>/<cid>/playlist.m3u8
 *                 …/thumbnail.jpg
 *
 * Note the video host percent-encodes the DID and the image host does not.
 */

const IMG_CDN = 'https://cdn.bsky.app/img';
const VIDEO_CDN = 'https://video.bsky.app/watch';

/** Pull the CID out of a blob ref in either of its serialisations. */
export function blobCid(blob) {
  if (!blob) return null;
  // JSON from Jetstream/PDS uses ref.$link; some paths carry a bare string.
  return blob.ref?.$link || blob.ref?.toString?.() || blob.cid || null;
}

/** @returns {string|null} */
export function imageUrl(did, blob, size = 'feed_thumbnail') {
  const cid = blobCid(blob);
  if (!cid || !did) return null;
  return `${IMG_CDN}/${size}/plain/${did}/${cid}@jpeg`;
}

/** @returns {{playlist:string, thumbnail:string}|null} */
export function videoUrls(did, blob) {
  const cid = blobCid(blob);
  if (!cid || !did) return null;
  const d = encodeURIComponent(did);   // the video host wants it encoded
  return {
    playlist: `${VIDEO_CDN}/${d}/${cid}/playlist.m3u8`,
    thumbnail: `${VIDEO_CDN}/${d}/${cid}/thumbnail.jpg`,
  };
}

/**
 * Whether this browser plays HLS from a plain `<video src>`.
 *
 * Duplicated from lib/video.js on purpose: blobs.js renders markup and must
 * not pull in the video module (and through it, eventually, hls.js) just to
 * decide which two attributes to write. Both cache, both ask the browser the
 * same question, and neither can drift into a user-agent sniff.
 */
let _nativeHls = null;
function nativeHls() {
  if (_nativeHls !== null) return _nativeHls;
  if (typeof document === 'undefined') return (_nativeHls = false);
  const v = document.createElement('video');
  _nativeHls = Boolean(v.canPlayType('application/vnd.apple.mpegurl')
    || v.canPlayType('application/x-mpegURL'));
  return _nativeHls;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Aspect-ratio box. Reserving the height before the image loads is what stops
 * a feed jumping under the reader's thumb as pictures arrive.
 */
function ratio(ar, fallback = '4 / 3') {
  if (!ar?.width || !ar?.height) return fallback;
  // Very tall images get clamped; an 8000px-tall screenshot should not own the
  // whole screen.
  const r = ar.width / ar.height;
  return r < 0.6 ? '3 / 4' : `${ar.width} / ${ar.height}`;
}

/**
 * Build the media HTML for one post.
 *
 * @param {object} record   the raw record (may hold blob refs)
 * @param {string} did      the repo the blobs live in
 * @param {object} [view]   the hydrated `#view` embed, when one exists
 * @returns {string} HTML, or '' when there is nothing to show
 */
export function renderEmbed(record, did, view) {
  const e = view || record?.embed;
  if (!e) return '';
  const type = String(e.$type || '');
  const hydrated = type.includes('#view');

  // recordWithMedia nests the real media one level down, in both shapes.
  if (type.startsWith('app.bsky.embed.recordWithMedia')) {
    const media = hydrated ? e.media : e.media;
    return renderEmbed({ embed: media }, did, hydrated ? media : null)
      + quoteCard(hydrated ? e.record?.record : e.record?.record);
  }

  if (type.startsWith('app.bsky.embed.images')) {
    const images = e.images || [];
    if (!images.length) return '';
    const cells = images.slice(0, 4).map((im) => {
      const src = hydrated ? im.thumb : imageUrl(did, im.image, 'feed_thumbnail');
      const full = hydrated ? im.fullsize : imageUrl(did, im.image, 'feed_fullsize');
      if (!src) return '';
      return `<a class="imgcell" href="${esc(full || src)}" target="_blank" rel="noopener"
                 style="aspect-ratio:${ratio(im.aspectRatio)}">
                <img loading="lazy" decoding="async" alt="${esc(im.alt || '')}" src="${esc(src)}">
              </a>`;
    }).join('');
    return `<div class="media grid-${Math.min(images.length, 4)}">${cells}</div>`;
  }

  if (type.startsWith('app.bsky.embed.video')) {
    const urls = hydrated
      ? { playlist: e.playlist, thumbnail: e.thumbnail }
      : videoUrls(did, e.video);
    // The playlist ends up in an href and in a data attribute the player will
    // load. It is always built here or handed over by the AppView, so this is
    // belt and braces — but a scheme check is one line and closes the whole
    // class of question.
    if (!urls?.playlist || !/^https:\/\//.test(urls.playlist)) return '';
    // Bluesky serves video as HLS, which ONLY Safari and iOS can play from a
    // bare `<video src>`. Two different elements, decided by the browser's own
    // `canPlayType` rather than by a user-agent string:
    //
    //   native  — src set, the browser's controls, nothing downloaded.
    //   else    — NO src (a src it cannot play makes the play button silently
    //             do nothing, which is what "videos don't play" looked like),
    //             the playlist parked on data-hls, and a ▶ overlay that loads
    //             hls.js on the tap. See lib/video.js.
    const box = `class="media video" style="aspect-ratio:${ratio(e.aspectRatio, '16 / 9')}"`;
    const open = `<a class="vfallback" href="${esc(urls.playlist)}" target="_blank" rel="noopener">▶ open video</a>`;
    if (nativeHls()) {
      return `<div ${box}>
        <video controls playsinline preload="none"
               poster="${esc(urls.thumbnail || '')}" src="${esc(urls.playlist)}"></video>
        ${open}
      </div>`;
    }
    return `<div ${box}>
      <video playsinline preload="none" poster="${esc(urls.thumbnail || '')}"
             data-hls="${esc(urls.playlist)}"></video>
      <button class="vplay" data-vplay aria-label="play video">▶</button>
      ${open}
    </div>`;
  }

  if (type.startsWith('app.bsky.embed.external')) {
    const x = e.external;
    if (!x?.uri) return '';
    const thumb = hydrated ? x.thumb : imageUrl(did, x.thumb, 'feed_thumbnail');
    let host = '';
    try { host = new URL(x.uri).hostname.replace(/^www\./, ''); } catch { /* keep blank */ }
    return `<a class="card" href="${esc(x.uri)}" target="_blank" rel="noopener">
      ${thumb ? `<img class="cardimg" loading="lazy" alt="" src="${esc(thumb)}">` : ''}
      <div class="cardtext">
        <div class="cardhost">${esc(host)}</div>
        <div class="cardtitle">${esc(x.title || x.uri)}</div>
        ${x.description ? `<div class="carddesc">${esc(x.description)}</div>` : ''}
      </div></a>`;
  }

  if (type.startsWith('app.bsky.embed.record')) {
    // Both shapes reach quoteCard. The RAW one carries only `{uri, cid}` and
    // used to render nothing at all, which meant a quote in the live or rule
    // feed silently vanished.
    return quoteCard(e.record);
  }

  return '';
}

/**
 * A quoted post.
 *
 * Two things here are load-bearing:
 *
 * **`data-thread` on the card itself.** Without it a tap on the quote bubbles
 * to the enclosing `<article>`, whose own `data-thread` is the OUTER post — so
 * the quoted post was unreachable, and worse, tapping it looked like it worked
 * and took you somewhere else. The delegated handler uses `closest()`, which
 * finds the NEAREST ancestor, so an inner `data-thread` wins.
 *
 * **The raw shape renders too.** From Jetstream a quote is only
 * `{uri, cid}` — no author, no text — and the old guard `if (!rec.author)
 * return ''` dropped it entirely, so quotes disappeared from the live and rule
 * feeds. A quote whose target we cannot describe is still a quote worth
 * offering; the card says so and stays tappable.
 *
 * @param {object} rec  a hydrated `#viewRecord`, or a raw `{uri, cid}` ref
 */
function quoteCard(rec) {
  if (!rec) return '';
  const uri = rec.uri || '';
  if (!uri) return '';
  const thread = ` data-thread="${esc(uri)}"`;

  // Raw ref: no author to show, but the post is still reachable.
  if (!rec.author) {
    return `<div class="quote quote-bare"${thread}>
      <span class="muted">a quoted post — tap to open it</span>
    </div>`;
  }

  const handle = esc(rec.author.handle || '');
  const text = rec.value?.text || rec.record?.text || '';
  return `<div class="quote"${thread}>
    <div class="qhead">
      <img class="qav" alt="" data-profile="${handle}" src="${esc(rec.author.avatar || '')}">
      <b data-profile="${handle}">${esc(rec.author.displayName || rec.author.handle)}</b>
      <span class="muted" data-profile="${handle}">@${handle}</span>
    </div>
    ${text ? `<div class="qtext">${esc(text.slice(0, 240))}</div>` : ''}
    ${quoteMedia(rec)}
  </div>`;
}

/**
 * The quoted post's own pictures.
 *
 * A hydrated `#viewRecord` carries its media in an `embeds` ARRAY — a different
 * shape from a top-level post's single `embed`, which is why quotes rendered as
 * text only: nothing was looking there. Each entry is already a `#view` with
 * complete CDN URLs, so it goes straight through `renderEmbed`.
 *
 * A quote INSIDE a quote is deliberately not drawn. It nests without limit, and
 * at this size a third-level card says nothing the second-level one did not.
 */
function quoteMedia(rec) {
  const e = (rec.embeds || [])[0];
  if (!e) return '';
  const t = String(e.$type || '');
  if (t.startsWith('app.bsky.embed.record#')) return '';
  // recordWithMedia nests the real media one level down; take that and drop the
  // nested quote for the same reason.
  const view = t.startsWith('app.bsky.embed.recordWithMedia') ? e.media : e;
  if (!view) return '';
  return renderEmbed(null, rec.author?.did, view);
}

/** Avatar URL from a profile blob ref, for raw records. */
export function avatarUrl(did, blob) {
  return imageUrl(did, blob, 'avatar');
}
