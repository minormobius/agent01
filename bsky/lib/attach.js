/**
 * Pictures on their way into a post — from a picker, from a paste, from a drop.
 *
 * There are now four places that attach images (the composer, a reply, every
 * card of a shuffle quote, and a paste into any of them) and they were all
 * about to grow their own copy of the same three rules. Copies drift: the reply
 * box's copy already said *"images only for now"* where the composer's said
 * which type it had refused and why a video is refused at all.
 *
 * So the rules live here, once, and they are PURE — no DOM, no object URLs, no
 * `say()`. Each caller does its own talking and its own `URL.createObjectURL`,
 * which is what makes `lib/attach.selftest.mjs` able to run the whole decision
 * in node against hand-built clipboard payloads.
 */

/** Bluesky shows at most four, and so does every other client. */
export const MAX_IMAGES = 4;

/**
 * The images on a clipboard or drop payload.
 *
 * A pasted screenshot reaches the page as a `File` with no name worth reading,
 * and it arrives through one of TWO channels depending on the browser and on
 * how the image got onto the clipboard:
 *
 *   - `dataTransfer.files` — a FileList. What Chromium hands over for a
 *     screenshot or a copied image file.
 *   - `dataTransfer.items` — where an image copied out of another page can
 *     appear as `{kind: 'file'}` with nothing in `files` at all.
 *
 * Reading only one of them works on the browser you happen to test and fails
 * silently on the other: the paste does nothing, which is indistinguishable
 * from a clipboard that held no image. Both are read, `files` first, and the
 * result is deduped by content because a payload exposes the same picture
 * through both — as a different File object each time (see `add` below).
 *
 * **Copied HTML is not an image.** Copying a picture out of a web page often
 * yields `text/html` with an `<img src>` and no file. The bytes are on somebody
 * else's origin behind their CORS policy, so there is nothing this page can
 * legally read — those pastes are left to the browser as ordinary text rather
 * than pretended at.
 *
 * @param {{files?: FileList, items?: DataTransferItemList}} transfer
 * @returns {File[]}
 */
export function imagesFrom(transfer) {
  if (!transfer) return [];
  const out = [];
  const seen = new Set();
  // Deduped by CONTENT, not identity. In a real Chromium paste the one image
  // arrives in `files` AND in `items`, and every `getAsFile()` returns a NEW
  // File object — so an identity check let a single pasted screenshot attach
  // twice. Hand-built test payloads hand back the same object, which is why
  // this hid until a real Ctrl+V was driven (2026-11-23). Two genuinely
  // different pictures with the same type, byte size and name in one paste is
  // not a case that occurs.
  const key = (f) => `${f.type}|${f.size}|${f.name}`;
  const add = (f) => {
    if (!f || !String(f.type || '').startsWith('image/')) return;
    const k = key(f);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(f);
  };
  for (const f of transfer.files || []) add(f);
  for (const it of transfer.items || []) {
    if (it?.kind === 'file') add(it.getAsFile?.());
  }
  return out;
}

/**
 * Alt text that came on the clipboard WITH the pictures.
 *
 * A clipboard item can carry several flavours at once. When a page puts an
 * image on it as `image/png` **plus** `text/html` holding
 * `<img src="…" alt="…">`, the HTML is the only place the picture's
 * description can travel, and this reads it back out. Browsers write the same
 * shape when you copy an image off a page, so this is not a private protocol:
 * it honours alt text that was already there.
 *
 * o.mino.mobi writes exactly that pair and deliberately NO `text/plain`. The
 * official client, seeing `text/html`, inserts the `text/plain` flavour into
 * the post — empty here, so nothing — and attaches the image. So the same
 * copy is an ordinary image paste in the mainline app and arrives described
 * here.
 *
 * Paired only when the pairing is unambiguous: one picture takes the first
 * described `<img>`; N pictures take N `<img>`s in order; anything else
 * guesses nothing. A wrong description is worse than an empty box, which at
 * least looks empty.
 *
 * @param {{getData?: (type: string) => string}} transfer
 * @param {number} count - how many pictures `imagesFrom` found
 * @returns {string[]} one entry per picture, '' where there is none
 */
export const MAX_ALT = 2000;
export function altFrom(transfer, count) {
  const none = Array.from({ length: Math.max(0, count | 0) }, () => '');
  if (!count || typeof transfer?.getData !== 'function') return none;
  let html = '';
  try { html = transfer.getData('text/html') || ''; } catch { return none; }
  if (!html) return none;
  const alts = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    // an attribute starts after whitespace: `\balt` would also match data-alt
    const m = tag.match(/\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    alts.push(m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim().slice(0, MAX_ALT) : '');
  }
  if (count === 1) return [alts.find(Boolean) || ''];
  return alts.length === count ? alts : none;
}

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39|nbsp);/gi, (all, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') {
      const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k] ?? all;
  });
}

/**
 * Which of these files may be attached to a post that already holds `have`.
 *
 * Returns the rejections as sentences rather than dropping them. A picker that
 * silently ignores half of what you gave it is the same bug as a control that
 * does nothing: from the outside, an image that never appears looks like the
 * app losing it.
 *
 * @param {Iterable<File>} files
 * @param {number} have - images already attached to this post
 * @returns {{accept: File[], reasons: string[]}}
 */
export function takeImages(files, have = 0) {
  const all = [...(files || [])];
  const reasons = [];
  const room = MAX_IMAGES - have;
  if (room <= 0) return { accept: [], reasons: [`${MAX_IMAGES} images is the limit`] };

  const accept = [];
  for (const file of all) {
    if (!String(file?.type || '').startsWith('image/')) {
      // Video is refused for a REASON, not by oversight: app.bsky.embed.video
      // wants a blob Bluesky's own transcoder has produced, so a raw upload
      // would post a video that plays nowhere. Saying so beats a silent skip.
      reasons.push(String(file?.type || '').startsWith('video/')
        ? "video needs Bluesky's transcoder — images only for now"
        : `not an image: ${file?.type || 'unknown type'}`);
      continue;
    }
    if (accept.length >= room) {
      reasons.push(`${MAX_IMAGES} images is the limit — kept the first ${room}`);
      break;
    }
    accept.push(file);
  }
  return { accept, reasons };
}
