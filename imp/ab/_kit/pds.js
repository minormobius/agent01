/**
 * pds.js — the lab's backend, which is the visitor's own repository.
 *
 *   import { labPds } from '/_kit/pds.js';
 *   const store = labPds();                      // slug inferred from the URL
 *
 *   await store.signIn('alice.bsky.social');     // redirects to Bluesky
 *   await store.ready();                         // call once on page load
 *   store.user()                                 // { did, handle } or null
 *
 *   await store.save('board', { cells, turn }); // one named slot, overwrites
 *   await store.load('board')                    // → { cells, turn } | null
 *   await store.list()                           // everything this site saved
 *   await store.remove('board')
 *
 *   await store.postScore(4200, { unit: 'points', detail: 'level 7' });
 *   await store.scoresOf('bob.bsky.social')      // → [{value, unit, …}]
 *
 * WHY THERE IS NO LAB DATABASE. Every site here shares minomobi.com, and a
 * server-side store shared by pages a stranger's mention caused to exist is a
 * place other people's content accumulates with nobody reading it. That is the
 * failure this whole factory is built around, arriving from the other
 * direction. So state goes to the VISITOR'S repo: they keep it, they can move
 * it to another client, and they can delete it without asking anyone. The lab
 * stores nothing and pays for nothing.
 *
 * TWO COLLECTIONS FOR EVERY SITE, NOT TWO PER SITE — com.minomobi.lab.doc and
 * com.minomobi.lab.score, schemas in lab/lexicons/. ATProto OAuth cannot grant
 * a scope by prefix (`repo:com.minomobi.lab.*` is illegal; only exact NSIDs or
 * the blanket `repo:*`, which is transition:generic wearing a hat), and your
 * site's name was not known when the auth worker was deployed. So the per-site
 * type lives INSIDE the record: `site` is the slug, `kind` is your own name for
 * the thing. One short consent screen covers the whole factory.
 *
 * THE RECORD KEY IS PREFIXED WITH YOUR SLUG AND THAT IS NOT COSMETIC. One
 * collection holding every site's records means two sites both saving to a key
 * called `save` would silently overwrite each other in the same visitor's repo.
 * These helpers prefix for you; if you call auth.pds directly, prefix yourself.
 */

import { AuthClient } from './auth.js';

const DOC = 'com.minomobi.lab.doc';
const SCORE = 'com.minomobi.lab.score';

/** The slug is the first path segment: minomobi.com/<slug>/. Inferred rather
 *  than passed, because a site that hardcodes the wrong one writes into another
 *  site's records and nothing complains. */
function inferSlug() {
  const seg = String(location.pathname).split('/').filter(Boolean)[0] ?? '';
  return /^[a-z0-9][a-z0-9-]{0,30}$/.test(seg) ? seg : 'lab';
}

const AT_URI = /^at:\/\/(did:[a-z0-9:._%-]+)\//i;

export function labPds({ slug = inferSlug(), auth = new AuthClient() } = {}) {
  const key = (name) => `${slug}.${String(name || 'default').replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 40)}`;
  const mine = (r) => r?.value?.site === slug;

  return {
    auth,
    slug,

    /** Pick up a session after the OAuth redirect. Safe to call on every load. */
    async ready() { await auth.init(); return auth.getUser(); },
    user() { return auth.getUser(); },
    onChange(fn) { auth.onAuthChange(fn); },
    async signOut() { return auth.logout(); },

    /** Send them to Bluesky. NARROW SCOPE ON PURPOSE: ask for the write you are
     *  about to do and nothing else, so the consent screen is two lines. A site
     *  that only saves never asks for scores. */
    async signIn(handle, { scores = false } = {}) {
      const scope = ['atproto', `repo:${DOC}`, ...(scores ? [`repo:${SCORE}`] : [])].join(' ');
      return auth.login(handle, { scope });
    },

    /** Save one named slot. Overwrites — putRecord at a deterministic key, so
     *  "the board" stays one record instead of a thousand. */
    async save(name, data, { title = '', text = '', kind = 'save' } = {}) {
      const now = new Date().toISOString();
      return auth.pds.putRecord(DOC, key(name), {
        $type: DOC,
        site: slug,
        kind,
        ...(title ? { title } : {}),
        ...(text ? { text } : {}),
        data: JSON.stringify(data ?? null),
        createdAt: now,
        updatedAt: now,
      });
    },

    /** null when they have never saved, which is not an error. */
    async load(name) {
      const rec = await auth.pds.getRecord(DOC, key(name));
      if (!rec?.value || rec.value.site !== slug) return null;
      try { return JSON.parse(rec.value.data ?? 'null'); } catch { return null; }
    },

    async remove(name) { return auth.pds.deleteRecord(DOC, key(name)); },

    /** Everything THIS site saved. The collection holds every lab site's docs,
     *  so filtering on `site` is required, not tidiness. */
    async list(limit = 100) {
      const res = await auth.pds.listRecords(DOC, limit);
      return (res?.records ?? []).filter(mine);
    },

    /** A score is append-only: every run is its own record, so a history exists
     *  and a personal best is a max rather than a thing you can lose. */
    async postScore(value, { unit = 'points', higherIsBetter = true, detail = '', game = '' } = {}) {
      if (!Number.isInteger(value)) throw new TypeError('score value must be an integer — use milliseconds, not seconds');
      if (!auth.hasScope(`repo:${SCORE}`)) await auth.ensureScope([`repo:${SCORE}`]);
      return auth.pds.createRecord(SCORE, {
        $type: SCORE,
        site: slug,
        value,
        unit,
        higherIsBetter,
        ...(detail ? { detail } : {}),
        ...(game ? { game } : {}),
        createdAt: new Date().toISOString(),
      });
    },

    /** SOMEBODY ELSE'S SCORES, and only somebody the visitor NAMED.
     *
     *  There is no lab scoreboard to query, so a leaderboard is built from the
     *  repos of players a visitor typed in or follows. That is a real constraint
     *  and it is the same one the whole factory runs on: show what was asked
     *  for, never what was merely going past. Unauthenticated — these are public
     *  records — so it works before anyone signs in.
     *
     *  Reads the handle's own PDS, discovered from the DID document, because a
     *  repo lives on its PDS and not on the AppView. */
    async scoresOf(handle, limit = 50) {
      const id = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      ).then((r) => (r.ok ? r.json() : null));
      if (!id?.did) return [];
      const doc = await fetch(`https://plc.directory/${id.did}`).then((r) => (r.ok ? r.json() : null));
      const pds = (doc?.service ?? []).find((s) => s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint;
      if (!pds) return [];
      const url = `${pds}/xrpc/com.atproto.repo.listRecords`
        + `?repo=${encodeURIComponent(id.did)}&collection=${SCORE}&limit=${limit}`;
      const res = await fetch(url).then((r) => (r.ok ? r.json() : null));
      return (res?.records ?? [])
        .filter((r) => r?.value?.site === slug)
        .map((r) => ({ ...r.value, handle, did: id.did, rkey: (r.uri ?? '').split('/').pop() }));
    },

    /** Sort a mixed pile of score records the way the records themselves say to.
     *  A time-attack board and a points board are the same shape with
     *  higherIsBetter flipped, and assuming descending ranks the slowest player
     *  first. */
    rank(scores) {
      const desc = scores.every((s) => s.higherIsBetter !== false);
      return [...scores].sort((a, b) => (desc ? b.value - a.value : a.value - b.value));
    },

    /** did out of an at:// uri, for the rare page that needs it. */
    didOf(uri) { return (String(uri).match(AT_URI) ?? [, null])[1]; },
  };
}
