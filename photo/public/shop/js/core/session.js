// session.js — surviving a full-page OAuth redirect with your work intact.
//
// THE BUG THIS EXISTS FOR
// -----------------------
// OAuth is a full-page navigation. Everything the tab was holding — the
// pixels, the layers, the masks, the caption you had half-typed — is gone by
// the time the authorization server sends you back. The first answer to that
// was to put the *recipe* in the return URL's fragment: structure without
// pixels, re-applied to whatever picture arrived. It was never enough, and for
// one route it was actively broken:
//
//   /bloom hands a local picture to /shop through a one-shot IndexedDB baton,
//   `?seed=<key>`, which `takeSeed` DELETES as it reads. The return URL kept
//   that `?seed=` — so the round trip came back to a key whose blob had been
//   consumed on the way in, and shop opened on an empty canvas. Not a rare
//   race: a guaranteed miss, every single time, on the exact path a person
//   takes from the archive to bloom to shop to post.
//
// Two different lifetimes were sharing one URL slot. A baton is read once; a
// return address is read after a round trip. They cannot be the same value.
//
// WHAT TRAVELS NOW
// ----------------
// The whole session, in IndexedDB, addressed by `?resume=<key>`:
//
//   the document   layers, their pixels, masks, blend modes, transforms, the
//                  effect stack with its parameters and per-effect masks, the
//                  live selection — the actual work, not a description of it
//   the original   what "show original" compares against
//   the view       zoom and pan, so you come back looking at what you left
//   the dialog     the caption and alt text you had typed before you clicked
//
// That last one matters more than it sounds. You did not click "sign in"; you
// clicked **post**, with a caption written. Coming back to your picture but an
// empty caption box is still losing your work — so the return re-opens the
// dialog with the words still in it, one click from where you were.
//
// WHY INDEXEDDB
// -------------
// It stores structured clones, which means `Uint8ClampedArray` and
// `Float32Array` go in as themselves. `sessionStorage` holds strings, so every
// buffer would be base64 (a third bigger) against a ~5 MB quota that a single
// 2400px layer blows through eight times over. There is no version of this
// that fits in a URL.
//
// Nothing here touches the DOM, IndexedDB or the network — that is `handoff.js`
// and `ui/post.js`. This file decides *what* a session is, how big it is
// allowed to get, and what the return address looks like, so the selftest can
// hold all three to account.

export const SESSION_V = 1;

/**
 * How much of a session we are willing to write before a redirect.
 *
 * A 2400×1800 document is 17 MB per raster layer and another 17 for the
 * original, and masks are Float32 — four bytes a pixel. Origin quotas are
 * usually far larger than this, but "usually" is not a thing to bet an
 * afternoon of someone's work on, and a write that fails halfway is worse than
 * one that was never attempted. So there is a ceiling, and a ladder for
 * getting under it that gives up the least valuable thing first.
 */
export const SESSION_LIMIT = 128 * 1024 * 1024;

/** Bytes a structured-cloneable value will occupy, near enough to decide with. */
export function weigh(value, seen = new Set()) {
  if (value == null) return 0;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value !== 'object') return 8;
  if (seen.has(value)) return 0;
  seen.add(value);
  let n = 0;
  if (Array.isArray(value)) { for (const v of value) n += weigh(v, seen); return n; }
  for (const k of Object.keys(value)) n += k.length * 2 + weigh(value[k], seen);
  return n;
}

/**
 * Everything worth carrying across the redirect.
 *
 * Takes plain values rather than the app object: `app.view` holds canvases and
 * 2D contexts, which are not cloneable and would make the whole write throw.
 * Only the three numbers that describe where you are looking travel.
 */
export function packSession({ doc, original = null, view = null, source = null, post = null }) {
  return {
    v: SESSION_V,
    at: Date.now(),
    doc,
    original,
    view: view ? { zoom: view.zoom, panx: view.panx, pany: view.pany } : null,
    source,
    post: post ? { text: post.text || '', alt: post.alt || '' } : null,
  };
}

/**
 * Get a session under the ceiling, dropping the least valuable part first.
 *
 * The order is deliberate. `original` only backs the before/after toggle, so
 * losing it costs a comparison. Everything below it *is* the work. If the
 * document alone will not fit there is nothing left to trim, and the caller
 * has to say so rather than write a snapshot that restores half a picture.
 *
 * @returns {{ snap: object|null, dropped: string[], bytes: number }}
 */
export function trimSession(snap, limit = SESSION_LIMIT) {
  const dropped = [];
  let out = snap;
  let bytes = weigh(out);
  if (bytes <= limit) return { snap: out, dropped, bytes };

  if (out.original) {
    out = { ...out, original: null };
    dropped.push('the before/after original');
    bytes = weigh(out);
    if (bytes <= limit) return { snap: out, dropped, bytes };
  }
  return { snap: null, dropped, bytes };
}

/** Is this something we wrote, and can still read? */
export const usableSession = (snap) => !!snap && snap.v === SESSION_V && !!snap.doc;

/**
 * The address to come back to.
 *
 * `u`, `seed` and `alt` are how a picture *arrives*; once a session is stashed
 * they are at best redundant and at worst a lie — `seed` in particular names a
 * baton that was consumed on the way in. Strip them, and let one key say where
 * everything is. `__auth_session` is the token the last round trip left behind
 * and must never be carried into the next one.
 */
export function resumeUrl(href, key) {
  const url = new URL(href);
  for (const k of ['u', 'seed', 'alt', 'resume', '__auth_session']) url.searchParams.delete(k);
  url.hash = '';
  url.searchParams.set('resume', key);
  return url.toString();
}

/**
 * The address to come back to when the stash could NOT be written.
 *
 * Falls back to exactly what shop did before: whatever the URL already said,
 * plus the recipe in the fragment. Worth keeping honest — for a picture that
 * came from `?u=` this is still lossless, and refusing to sign in because we
 * could not write 30 MB to IndexedDB would be a worse answer than the one this
 * replaces.
 */
export function legacyReturnUrl(href, recipe = null, maxRecipe = 6000) {
  const url = new URL(href);
  url.searchParams.delete('__auth_session');
  url.searchParams.delete('resume');
  url.hash = '';
  // A hand-painted mask RLE can run long, and an over-long URL is refused
  // somewhere between here and the authorization server. Better to lose the
  // recipe than the sign-in.
  if (recipe && recipe.length <= maxRecipe) url.hash = `r=${recipe}`;
  return url.toString();
}

/** The key in a return address, or null. */
export function resumeKey(href) {
  try { return new URL(href).searchParams.get('resume') || null; } catch { return null; }
}

/**
 * What a session can still lose, in words, for the dialog to say BEFORE it
 * navigates rather than after.
 *
 * Undo history is the one thing deliberately left behind. It holds a snapshot
 * of every buffer at every step, which is the document over again per undo
 * level, and nobody signs in mid-edit to preserve their ability to undo the
 * edit before last. Restoring lands you exactly where you were with a clean
 * history — said out loud here, because a silently emptied undo stack is the
 * kind of surprise that makes people distrust everything else.
 */
export function describeCarry({ ok, dropped = [], hasUrl = false }) {
  if (ok) {
    const lost = dropped.length ? ` (all but ${dropped.join(' and ')})` : '';
    return `your picture, layers, stack and caption all come back with you${lost} — undo history does not.`;
  }
  return hasUrl
    ? 'this picture came from a link, so it reloads on the way back — but layers, masks and undo will not.'
    : 'this picture is too large to hold across the sign-in: the stack travels, the pixels do not. '
      + 'Save it first if you want it back.';
}
