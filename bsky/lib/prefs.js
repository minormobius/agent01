/**
 * What this reader has chosen, kept in their browser.
 *
 * WHY LOCALSTORAGE AND NOT A LEXICON RECORD. A record in the reader's own repo
 * is the philosophically right answer for this project — it is the whole thesis
 * — and it would follow them between devices. It also costs a new collection in
 * `workers/auth`'s ceiling, a deploy of the highest-blast-radius worker in the
 * repo, and a write scope, and it would not work at all signed out. Most of
 * this surface works signed out on purpose.
 *
 * So: localStorage now, and the door left open. `toRecord()`/`fromRecord()`
 * exist so that syncing to `com.minomobi.bsky.prefs` later is a transport
 * change and not a rewrite — the shape is already a plain, versioned object.
 *
 * Everything degrades: private mode and blocked site data make localStorage
 * throw, so every read and write is guarded and the defaults simply apply.
 */

const KEY = 'bsky:prefs';

/** Bumped only if a stored shape stops being readable by the current code. */
const VERSION = 1;

export const DEFAULTS = {
  version: VERSION,
  topbar: {
    tagline: true,      // the "no database" note beside the brand
    chips: true,        // the feed chips row
    status: true,       // the status/connection strip under the header
    compact: false,     // tighter header, for small screens
  },
  notifs: {
    // Which kinds to show. Hiding likes is the point: on a busy account they
    // bury the replies, which are the only ones you can actually answer.
    kinds: { reply: true, follow: true, like: true },
    // Show the reply's TEXT rather than just "replied to you".
    showReplyText: true,
  },
};

/**
 * Deep-merge stored values over the defaults, so a new key is never missing.
 *
 * The deep COPY of `base` is load-bearing and is not an optimisation in
 * reverse. A shallow spread leaves `out.topbar === DEFAULTS.topbar`, and
 * `set()` walks a dotted path and assigns into the node it lands on — so
 * `set('topbar.compact', true)` mutated DEFAULTS itself. `reset()` then
 * restored the very value it was asked to discard, and every later "default"
 * in the session was whatever the reader last chose. Caught by the selftest,
 * which is the only way it would ever have been caught: nothing throws.
 */
function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(v, {});
  }
  for (const [k, v] of Object.entries(over || {})) {
    // An absent key must not erase a default. `fromRecord` passes
    // `{topbar: rec.topbar}` whether or not the record has one, so without
    // this an old record silently wipes every newer section.
    if (v === undefined) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base?.[k] === 'object'
      ? merge(base[k], v)
      : v;
  }
  return out;
}

let cache = null;

export function all() {
  if (cache) return cache;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* defaults */ }
  cache = merge(DEFAULTS, stored && typeof stored === 'object' ? stored : {});
  return cache;
}

/**
 * Read one value by dotted path — `get('notifs.kinds.like')`.
 * Returns the DEFAULT when a path is missing, never undefined, so a caller
 * never has to guard.
 */
export function get(path) {
  const walk = (o) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), o);
  const v = walk(all());
  return v === undefined ? walk(DEFAULTS) : v;
}

const listeners = new Set();

/** @returns {() => void} unsubscribe */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Write one value by dotted path, persist, and tell everyone who cares. */
export function set(path, value) {
  const next = merge(all(), {});
  const keys = path.split('.');
  let node = next;
  for (const k of keys.slice(0, -1)) {
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[keys.at(-1)] = value;
  next.version = VERSION;
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* session-only */ }
  for (const fn of listeners) { try { fn(next); } catch { /* one bad listener */ } }
  return next;
}

export function reset() {
  cache = null;
  try { localStorage.removeItem(KEY); } catch { /* fine */ }
  for (const fn of listeners) { try { fn(all()); } catch { /* one bad listener */ } }
  return all();
}

// ─── the door to a repo record ───────────────────────────────────

/**
 * The shape that WOULD be written to `com.minomobi.bsky.prefs`. Kept beside the
 * storage so that if these ever move into the reader's repo, the only thing
 * that changes is where the bytes go.
 */
export function toRecord() {
  const p = all();
  return {
    $type: 'com.minomobi.bsky.prefs',
    version: VERSION,
    topbar: p.topbar,
    notifs: p.notifs,
    updatedAt: new Date().toISOString(),
  };
}

export function fromRecord(rec) {
  if (!rec || typeof rec !== 'object') return all();
  cache = merge(DEFAULTS, { topbar: rec.topbar, notifs: rec.notifs });
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* fine */ }
  for (const fn of listeners) { try { fn(cache); } catch { /* one bad listener */ } }
  return cache;
}
