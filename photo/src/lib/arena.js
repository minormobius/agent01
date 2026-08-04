// arena.js — albums, and the pictures in them.
//
// This was tangled into the explorer: a gallery for reading anyone's archive
// that also happened to be the only place you could upload your own pictures
// and curate them. Two different jobs sharing one header. The albums live at
// `/albums` now, and this file is what both pages (and `/shop`) talk to, so the
// record shape is written down once.
//
// THE RECORD SHAPE
// ----------------
// `com.minomobi.arena.image` is one uploaded picture: `{ image: <blob>, alt,
// aspectRatio, createdAt }`. `com.minomobi.arena.album` is an ordered list of
// entries: `{ name, description, images: [{ image: <blob>, alt, … }] }`.
// The blob refs are *yours* — they live in your repo.
//
// WHY ADDING SOMEONE ELSE'S PICTURE COPIES IT
// -------------------------------------------
// A blob is scoped to the repo that holds it: your PDS cannot serve a CID it
// does not have, and a record pointing at someone else's blob resolves for
// nobody. So "add this to my album" downloads the picture and uploads it into
// your repo. That is also the honest reading of the feature — it is *your*
// album, and a pointer would go blank the day they delete the post.
//
// What is kept instead is provenance: `source.did`, `source.rkey` and the
// post's permalink ride along in the entry, so the album can always say where
// a picture came from and link back to it.

import { getSession } from './auth.js';
import {
  ALBUM_COLLECTION, IMAGE_COLLECTION, createImageRecord, saveAlbum, uploadBlob,
} from './pds.js';
import { cidFromRef } from './cid.js';
import { blobUrl, fullUrl, proxied } from './urls.js';

/**
 * Exactly what this surface writes, and nothing else.
 *
 * The sign-in used to ask for no scope at all, which falls back to the union of
 * every collection every mino.mobi site writes — a consent screen listing forty
 * lexicons to upload a photograph. Both of these are already inside the auth
 * worker's declared ceiling, so asking for just them needs no worker change.
 */
export const ARENA_SCOPE =
  'atproto repo:com.minomobi.arena.image repo:com.minomobi.arena.album blob:image/*';

export { ALBUM_COLLECTION, IMAGE_COLLECTION };

// ─────────────────────────────────────────────────────── pure shaping ──

/**
 * One entry in an album's `images` array.
 * @param {object} blob   the blob ref returned by uploadBlob
 * @param {object} [meta] `{ alt, aspectRatio, source: { did, rkey, handle } }`
 */
export function albumEntry(blob, meta = {}) {
  if (!blob) throw new Error('an album entry needs an uploaded image');
  const entry = { image: blob, alt: String(meta.alt || '') };
  if (meta.aspectRatio) entry.aspectRatio = meta.aspectRatio;
  if (meta.source?.did) {
    entry.source = {
      did: meta.source.did,
      ...(meta.source.rkey ? { rkey: meta.source.rkey } : {}),
      ...(meta.source.handle ? { handle: meta.source.handle } : {}),
    };
  }
  return entry;
}

/** Grid-shaped media for one `com.minomobi.arena.image` record. */
export function uploadToMedia(rec, did) {
  const blob = rec?.value?.image;
  return {
    did,
    rkey: rec.rkey,
    cid: cidFromRef(blob?.ref) || '',
    alt: rec.value?.alt || '',
    text: '',
    createdAt: rec.value?.createdAt,
    aspectRatio: rec.value?.aspectRatio || null,
    mimeType: blob?.mimeType || 'image/jpeg',
    type: 'image',
    source: 'arena',
  };
}

/**
 * Grid-shaped media for an album's entries.
 *
 * `rkey` is synthetic — an album entry is a position in a list, not a record —
 * but it has to be stable and unique or React re-keys the whole grid on every
 * edit and the browser re-downloads every thumbnail.
 */
export function albumMedia(album, did) {
  return (album?.value?.images || []).map((entry, i) => ({
    did,
    rkey: `${album.rkey}#${i}`,
    index: i,
    cid: cidFromRef(entry.image?.ref) || '',
    alt: entry.alt || '',
    text: '',
    createdAt: album.value.updatedAt || album.value.createdAt,
    aspectRatio: entry.aspectRatio || null,
    mimeType: entry.image?.mimeType || 'image/jpeg',
    type: 'image',
    source: 'album',
    provenance: entry.source || null,
  }));
}

/** The two URLs worth trying for a picture we want the bytes of, best first. */
export function importCandidates(media, pdsUrlMap) {
  const out = [];
  // The original, from the author's PDS: exact bytes, and getBlob answers with
  // `access-control-allow-origin: *` so it can be read cross-origin.
  const original = blobUrl(media, pdsUrlMap);
  if (original) out.push(original);
  // The CDN's display rendition, through our own proxy — smaller, re-encoded,
  // but it exists for posts whose PDS we cannot reach.
  const cdn = fullUrl(media, pdsUrlMap);
  if (cdn && cdn !== original) out.push(proxied(cdn));
  return out;
}

// ────────────────────────────────────────────────────────── PDS calls ──

/**
 * Copy a picture into the signed-in user's repo and return the blob ref.
 * Tries the original first and falls back to the CDN rendition — a blob the
 * author's PDS refuses (deleted, moved, rate-limited) should cost you a smaller
 * copy, not the whole operation.
 */
export async function importPicture(media, pdsUrlMap) {
  if (!getSession()) throw new Error('Not signed in');
  const candidates = importCandidates(media, pdsUrlMap);
  if (!candidates.length) throw new Error('no source for that picture');

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`source responded ${res.status}`);
      const bytes = await res.blob();
      if (!bytes.size) throw new Error('source returned nothing');
      return await uploadBlob(bytes);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`could not copy that picture — ${lastErr?.message || 'unknown error'}`);
}

/** Copy a picture in, then append it to `album`. Returns the new entry. */
export async function addToAlbum(album, media, pdsUrlMap, sourceHandle) {
  const blob = await importPicture(media, pdsUrlMap);
  const entry = albumEntry(blob, {
    alt: media.alt,
    aspectRatio: media.aspectRatio,
    source: media.source === 'post'
      ? { did: media.did, rkey: media.rkey, handle: sourceHandle }
      : null,
  });
  await saveAlbum(
    { ...album.value, images: [...(album.value.images || []), entry] },
    album.rkey,
  );
  return entry;
}

/** Drop the entry at `index` from `album`. */
export async function removeFromAlbum(album, index) {
  const images = [...(album.value.images || [])];
  if (index < 0 || index >= images.length) return;
  images.splice(index, 1);
  await saveAlbum({ ...album.value, images }, album.rkey);
}

/** Upload a local file as a `com.minomobi.arena.image`. */
export async function uploadFile(file, { alt = '', aspectRatio = null } = {}) {
  const blob = await uploadBlob(file);
  const result = await createImageRecord(blob, { alt, aspectRatio });
  return { blob, result };
}
