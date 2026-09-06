/**
 * Known-answer tests for lib/prefs.js.
 *
 * A preferences module fails QUIETLY: a bad merge does not throw, it just
 * silently restores a default the reader turned off, or — worse — erases a
 * whole section they never touched. Both read as "the app forgot my settings"
 * rather than as a bug, so the negative cases are the point of this file.
 *
 *   node bsky/lib/prefs.selftest.mjs
 */

// localStorage does not exist in node, and prefs.js is written to survive its
// absence (private mode, blocked site data). Both paths are exercised: the
// first assertion runs with NO storage at all, and a stub is installed after.
let fails = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
};

const fresh = async () => {
  // A fresh module instance per case — the module memoises into `cache`.
  const m = await import(`./prefs.js?${Math.random()}`);
  return m;
};

console.log('lib/prefs.selftest\n');

// 1. No localStorage at all: defaults apply, nothing throws.
{
  const p = await fresh();
  ok('no localStorage: defaults still read', p.get('topbar.chips') === true);
  ok('no localStorage: set() does not throw', (() => {
    try { p.set('topbar.chips', false); return true; } catch { return false; }
  })());
  ok('no localStorage: set() is still readable in-session', p.get('topbar.chips') === false);
}

// From here on, a stub.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// 2. Dotted paths, defaults, and persistence.
{
  store.clear();
  const p = await fresh();
  ok('get returns a nested default', p.get('notifs.kinds.like') === true);
  ok('get returns an object', typeof p.get('topbar') === 'object');
  ok('get on a missing path is undefined, not a throw', p.get('nope.nothing') === undefined);

  p.set('notifs.kinds.like', false);
  ok('set writes through', p.get('notifs.kinds.like') === false);
  ok('set persists to storage', JSON.parse(store.get('bsky:prefs')).notifs.kinds.like === false);

  const reloaded = await fresh();
  ok('a new instance reads the stored value', reloaded.get('notifs.kinds.like') === false);
  ok('siblings of a changed key keep their defaults', reloaded.get('notifs.kinds.reply') === true);
  ok('untouched sections keep their defaults', reloaded.get('topbar.tagline') === true);
}

// 3. Forward compatibility. A value stored by an OLDER build knows nothing
//    about keys added since; those must come back as defaults rather than as
//    undefined, or every call site needs its own guard.
{
  store.clear();
  store.set('bsky:prefs', JSON.stringify({ version: 1, topbar: { chips: false } }));
  const p = await fresh();
  ok('a partial stored object keeps the stored key', p.get('topbar.chips') === false);
  ok('a partial stored object defaults the rest', p.get('topbar.status') === true);
  ok('a partial stored object defaults a whole missing section',
    p.get('notifs.showReplyText') === true);
}

// 4. Corrupt storage must not take the app down with it.
{
  store.clear();
  store.set('bsky:prefs', 'not json{');
  const p = await fresh();
  ok('unparseable storage falls back to defaults', p.get('topbar.chips') === true);

  store.set('bsky:prefs', JSON.stringify('a string'));
  const p2 = await fresh();
  ok('a non-object in storage falls back to defaults', p2.get('topbar.chips') === true);
}

// 5. Subscribers. The top bar is applied from one, so a set that does not
//    notify makes every switch look inert.
{
  store.clear();
  const p = await fresh();
  let seen = 0;
  const off = p.subscribe(() => { seen++; });
  p.set('topbar.compact', true);
  ok('set notifies subscribers', seen === 1);
  p.reset();
  ok('reset notifies subscribers', seen === 2);
  ok('reset restores the default', p.get('topbar.compact') === false);
  ok('reset clears storage', !store.has('bsky:prefs'));
  off();
  p.set('topbar.compact', true);
  ok('unsubscribe stops the callbacks', seen === 2);

  // One throwing listener must not stop the others, or one bad screen freezes
  // every other reaction to the same change.
  const p2 = await fresh();
  let after = 0;
  p2.subscribe(() => { throw new Error('boom'); });
  p2.subscribe(() => { after++; });
  p2.set('topbar.compact', true);
  ok('a throwing listener does not block the next one', after === 1);
}

// 6. The record door. `fromRecord` passes `{topbar, notifs}` whether or not the
//    record carries them — so an undefined MUST be skipped rather than written,
//    or a record from an older build wipes a section it never knew about.
{
  store.clear();
  const p = await fresh();
  const rec = p.toRecord();
  ok('toRecord carries the $type', rec.$type === 'com.minomobi.bsky.prefs');
  ok('toRecord carries both sections', Boolean(rec.topbar && rec.notifs));
  ok('toRecord is versioned', rec.version === 1);

  p.fromRecord({ topbar: { chips: false } });
  ok('fromRecord applies its own values', p.get('topbar.chips') === false);
  ok('fromRecord does NOT erase an absent section', p.get('notifs.showReplyText') === true);
  ok('fromRecord does NOT erase absent siblings', p.get('topbar.status') === true);

  ok('fromRecord(null) is a no-op, not a wipe',
    p.fromRecord(null) && p.get('topbar.chips') === false);
}

console.log(fails ? `\nprefs selftest FAILED (${fails})` : '\nprefs selftest passed');
process.exit(fails ? 1 : 0);
