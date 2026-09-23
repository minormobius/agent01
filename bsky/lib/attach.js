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
 * result is deduped by identity because a payload can legitimately expose the
 * same File through both.
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
  const add = (f) => {
    if (!f || !String(f.type || '').startsWith('image/') || seen.has(f)) return;
    seen.add(f);
    out.push(f);
  };
  for (const f of transfer.files || []) add(f);
  for (const it of transfer.items || []) {
    if (it?.kind === 'file') add(it.getAsFile?.());
  }
  return out;
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
