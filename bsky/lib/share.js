/**
 * The post menu — copy link, copy text, copy media, open on bsky.app.
 *
 * Clipboard notes, because this is where it goes wrong on a phone:
 *
 *   • `navigator.clipboard.writeText` needs a secure context AND a user
 *     gesture, and Safari additionally requires the write to happen in the SAME
 *     task as the tap. An `await` before it — fetching an image, say — breaks
 *     that, which is why copyMedia passes a PROMISE to ClipboardItem rather
 *     than awaiting the blob first. Safari resolves it inside the gesture; the
 *     shape looks odd and is load-bearing.
 *   • Copying an image needs `image/png`. Bluesky's CDN serves jpeg and webp,
 *     so the blob is redrawn through a canvas. Big images make this slow, which
 *     is why the caller gets a promise it can show progress against.
 *   • Where clipboard writes are unavailable at all (an insecure origin, an
 *     old browser), every action falls back to `navigator.share` and then to
 *     returning the value so the caller can show it for manual copying.
 */

/** @returns {boolean} */
export function canCopy() {
  return typeof navigator !== 'undefined' && !!navigator.clipboard && window.isSecureContext;
}

/** The public bsky.app permalink for a post. */
export function postUrl(post) {
  const handle = post.author?.handle || post.did;
  return `https://bsky.app/profile/${handle}/post/${post.rkey}`;
}

/**
 * @param {string} text
 * @returns {Promise<'copied'|'shared'|'manual'>}
 */
export async function copyText(text) {
  if (canCopy()) {
    try { await navigator.clipboard.writeText(text); return 'copied'; }
    catch { /* fall through */ }
  }
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; }
    catch { /* user cancelled, or unsupported */ }
  }
  return 'manual';
}

/**
 * Copy the first image of a post to the clipboard as a PNG.
 *
 * @param {string} src - an image URL (CORS-open; cdn.bsky.app is)
 * @returns {Promise<'copied'|'manual'>}
 */
export async function copyImage(src) {
  if (!canCopy() || typeof ClipboardItem === 'undefined') return 'manual';
  try {
    // The promise is handed to ClipboardItem UNRESOLVED on purpose — see the
    // note at the top. Awaiting it here loses Safari's gesture context.
    const png = fetch(src)
      .then((r) => r.blob())
      .then((blob) => toPng(blob));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** Re-encode any image blob as PNG, which is the only type clipboards take. */
function toPng(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        URL.revokeObjectURL(url);
        out ? resolve(out) : reject(new Error('encode failed'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}
