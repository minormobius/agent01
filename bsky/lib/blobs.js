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
      + quoteCard(hydrated ? e.record?.record : null);
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
    if (!urls?.playlist) return '';
    // HLS plays natively in Safari/iOS — the mobile target. Elsewhere the
    // poster shows and the tap falls through to the anchor. No hls.js: a
    // 300 KB library for a fallback path is not worth it here.
    return `<div class="media video" style="aspect-ratio:${ratio(e.aspectRatio, '16 / 9')}">
      <video controls playsinline preload="none"
             poster="${esc(urls.thumbnail || '')}" src="${esc(urls.playlist)}"></video>
      <a class="vfallback" href="${esc(urls.playlist)}" target="_blank" rel="noopener">▶ open video</a>
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
    return quoteCard(hydrated ? e.record : null);
  }

  return '';
}

/** A quoted post, when the hydrated view gives us one. */
function quoteCard(rec) {
  if (!rec || !rec.author) return '';
  const text = rec.value?.text || rec.record?.text || '';
  return `<div class="quote">
    <div class="qhead">
      <img class="qav" alt="" src="${esc(rec.author.avatar || '')}">
      <b>${esc(rec.author.displayName || rec.author.handle)}</b>
      <span class="muted">@${esc(rec.author.handle)}</span>
    </div>
    ${text ? `<div class="qtext">${esc(text.slice(0, 240))}</div>` : ''}
  </div>`;
}

/** Avatar URL from a profile blob ref, for raw records. */
export function avatarUrl(did, blob) {
  return imageUrl(did, blob, 'avatar');
}
