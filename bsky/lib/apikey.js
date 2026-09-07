/**
 * The visitor's own Jetstream key — storage only, and deliberately nothing else.
 *
 * This is split out of `archive.js` because of a real failure: the Me tab's
 * "save key" button called `await archive()`, and `archive.js` statically
 * imports `lib/vendor/` — the zstd WASM and the bundled SDK, both built at
 * deploy time. If either fails to load, that dynamic import rejects and the
 * button dies **silently**: no error, no message, nothing written.
 *
 * Saving a key is `localStorage.setItem`. It has no business depending on a
 * WASM decompressor. Keeping them apart means the key can always be pasted and
 * always be cleared, even when the deep-history machinery is broken — which is
 * exactly the state you are in when you are trying to set the key up.
 *
 * `archive.js` re-exports these, so existing callers are unaffected.
 */

const KEY_STORAGE = 'bsky:jetstream-key';

/** Where a visitor mints their own key. Free; sign in with Bluesky. */
export const KEY_URL = 'https://bsky.network/account';

/** @returns {string} '' when unset, or when site data is blocked. */
export function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

/**
 * @param {string} key  an empty or blank string clears it
 * @returns {boolean} false when storage is unavailable (private mode) — the
 *   caller must say so rather than pretending the key was kept.
 */
export function setKey(key) {
  try {
    const k = String(key ?? '').trim();
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch { return false; }
}

export function hasKey() { return Boolean(getKey()); }
