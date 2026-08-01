// urls.js — where an image's bytes actually come from.
//
// There are three sources and they are not interchangeable:
//
//   cdn.bsky.app/feed_thumbnail   grid-sized, edge-cached, free to us
//   cdn.bsky.app/feed_fullsize    display-sized, edge-cached — ~286 kB typical
//   PDS getBlob                   the ORIGINAL upload — ~1.5 MB for the same
//                                 picture, served by whoever's PDS it is
//
// The lightbox used to go straight to `getBlob`, which is 5× the bytes and puts
// the cost on a stranger's server. Now it asks the CDN first and falls back to
// `getBlob`, which is the same two-tier pattern the grid already used — and the
// only path for uploaded (`arena`/`album`) images, which have no CDN presence.
//
// THE CORS RULE, WHICH IS THE WHOLE REASON `/api/img` EXISTS
// ----------------------------------------------------------
// `cdn.bsky.app` serves images to `<img>` tags fine, but returns **no**
// `access-control-allow-origin`. So any load that needs to *read the pixels* —
// `crossOrigin = 'anonymous'`, canvas, WebGPU — fails outright. `worker.js`
// proxies those same-origin with permissive CORS. Display goes direct; anything
// that samples goes through `proxied()`. Getting this backwards is invisible
// until you look at the pixels, which is exactly how the colour filter shipped
// broken.

import { ensureCid } from './cid.js';

const CDN = 'https://cdn.bsky.app/img';

const isUpload = (img) => img.source === 'arena' || img.source === 'album';

/** Full-resolution original, from the author's PDS. The expensive one. */
export function blobUrl(img, pdsUrlMap) {
  const pdsUrl = pdsUrlMap?.[img.did];
  if (!pdsUrl) return '';
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob`
    + `?did=${encodeURIComponent(img.did)}&cid=${encodeURIComponent(ensureCid(img.cid))}`;
}

/** Grid-sized. Uploads have no CDN rendition, so they fall through to the blob. */
export function thumbUrl(img, pdsUrlMap) {
  if (isUpload(img)) return blobUrl(img, pdsUrlMap);
  return `${CDN}/feed_thumbnail/plain/${img.did}/${ensureCid(img.cid)}@jpeg`;
}

/** Display-sized — what the lightbox should ask for first. */
export function fullUrl(img, pdsUrlMap) {
  if (isUpload(img)) return blobUrl(img, pdsUrlMap);
  return `${CDN}/feed_fullsize/plain/${img.did}/${ensureCid(img.cid)}@jpeg`;
}

/**
 * Same-origin proxy, for any load whose pixels will be read back. Uploads are
 * already same-origin-ish (the PDS sets permissive CORS on `getBlob`) and are
 * not on the proxy's allowlist, so they are passed through untouched.
 */
export function proxied(url) {
  if (!url) return '';
  return /^https?:\/\/[^/]*\.bsky\.app\//.test(url)
    ? `/api/img?u=${encodeURIComponent(url)}`
    : url;
}

/**
 * Open a picture in `/shop`, the layered editor on this surface.
 *
 * Shop takes the image as `?u=` and does its own proxying — it routes
 * `*.bsky.app` through `/api/img` for the same CORS reason described above,
 * because it reads the pixels rather than displaying them. A PDS `getBlob` URL
 * needs no proxy (the PDS answers with `access-control-allow-origin: *`) and is
 * passed through, so both kinds of archive picture work.
 *
 * `alt` rides along so a picture that arrives described stays described: shop's
 * post dialog pre-fills its alt field from it. Losing the description on the
 * way to an editor is how a re-post ends up worse than the original.
 */
export function shopUrl(src, { alt } = {}) {
  if (!src) return '';
  const params = new URLSearchParams({ u: src });
  if (alt) params.set('alt', alt);
  return `/shop/?${params}`;
}

/** The public permalink for a post-sourced image. */
export function postUrl(img) {
  return `https://bsky.app/profile/${img.did}/post/${img.rkey}`;
}
