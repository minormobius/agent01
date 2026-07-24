// coin/compose.js — the composer's non-UI machinery: link facets, image
// preparation, and the thread post loop. Kept out of the page so it can be
// reasoned about (and unit-tested in node) separately from the DOM.

export const LIMIT = 300;          // Bluesky's grapheme limit per post
export const MAX_IMAGES = 4;       // per post
const BLOB_MAX = 950_000;          // Bluesky rejects blobs around 1 MB

/** Grapheme-ish length — Bluesky counts by grapheme, not UTF-16 code unit. */
export function textLength(s) {
  try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(s))].length; }
  catch { return [...String(s)].length; }
}

/** Byte offsets for app.bsky.richtext link facets, so URLs stay clickable. */
export function linkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text))) {
    const uri = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
    const start = enc.encode(text.slice(0, m.index)).length;
    facets.push({
      index: { byteStart: start, byteEnd: start + enc.encode(uri).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  return facets;
}

/**
 * Shrink an image until the PDS will accept it. Phone cameras produce 4–12 MB
 * files and the blob ceiling is about a megabyte, so "attach a photo" has to mean
 * "attach a photo that will actually upload".
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function prepareImage(file, opts = {}) {
  const maxEdge = opts.maxEdge || 2000;
  const bmp = await loadBitmap(file);
  let { width, height } = bmp;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  if (bmp.close) bmp.close();

  // PNG screenshots stay PNG only if they're already small; otherwise JPEG, and
  // walk the quality down until it fits rather than failing at upload time.
  for (const q of [0.92, 0.85, 0.75, 0.62, 0.5, 0.38]) {
    const blob = await toBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size <= BLOB_MAX) return { blob, width, height };
  }
  const last = await toBlob(canvas, 'image/jpeg', 0.3);
  return { blob: last, width, height };
}
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 10_000); }
}
function toBlob(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((res) => canvas.toBlob(res, type, quality));
}

/** Pull image files out of a paste or drop, ignoring everything else. */
export function imagesFromDataTransfer(dt) {
  const out = [];
  if (!dt) return out;
  for (const item of (dt.items || [])) {
    if (item.kind === 'file' && /^image\//.test(item.type)) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length) for (const f of (dt.files || [])) if (/^image\//.test(f.type)) out.push(f);
  return out;
}

/**
 * Post a thread. Each segment becomes one post; every post after the first
 * replies to its predecessor and carries the ROOT of the thread, which is what
 * makes Bluesky render it as a chain rather than a pile of orphan replies.
 *
 * @param segments [{text, images:[{blobRef, alt, width, height}]}]
 * @param pds       auth.pds
 * @param onStep    (index, total, result) => void — so the UI can show progress
 * @returns [{uri, cid}]
 */
export async function postThread(segments, pds, onStep) {
  const results = [];
  let root = null, parent = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const record = {
      $type: 'app.bsky.feed.post',
      text: seg.text,
      createdAt: new Date().toISOString(),
      langs: ['en'],
    };
    const facets = linkFacets(seg.text);
    if (facets.length) record.facets = facets;
    if (seg.images && seg.images.length) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: seg.images.slice(0, MAX_IMAGES).map((im) => ({
          alt: im.alt || '',
          image: im.blobRef,
          ...(im.width && im.height ? { aspectRatio: { width: im.width, height: im.height } } : {}),
        })),
      };
    }
    if (root) {
      record.reply = {
        root: { uri: root.uri, cid: root.cid },
        parent: { uri: parent.uri, cid: parent.cid },
      };
    }
    const res = await pds.createRecord('app.bsky.feed.post', record);
    if (!root) root = res;
    parent = res;
    results.push(res);
    if (onStep) onStep(i, segments.length, res);
  }
  return results;
}

export const postUrl = (uri) => {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/.exec(uri || '');
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
};
