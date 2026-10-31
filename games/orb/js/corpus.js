/* Orb — the high-score corpus, read straight off the network.

   Every score is a com.minomobi.lab.score record in its player's own repo.
   Nothing indexes them for us, so the page builds the index itself:

     backfill  the relay lists every repo holding the collection
               (com.atproto.sync.listReposByCollection); each repo's DID
               document names its PDS; the PDS lists its records.
     live      Jetstream streams every create/update/delete in the collection
               as it happens. It connects with a cursor a minute before the
               backfill started, so nothing written mid-backfill falls in the
               gap. Upserts by URI make the overlap harmless.

   All of it is public and CORS-open, so it runs in the browser with no
   server of ours. The cost is one request per player per page load. That's
   nothing at today's size, and the point to add a cache is when it isn't.

   The relay's list can be stale (a repo that moved or was deleted): such a
   repo just contributes nothing. Jetstream also sends every account/identity
   event on the network regardless of filter; only commits are read.

   No DOM, no auth: plain ES module taking fetch/WebSocket from globalThis,
   so test/orb.selftest.mjs drives it with fakes. */

export const COLLECTION = "com.minomobi.lab.score";

/* What counts as an Orb score. Anyone can write anything into this
   collection (other sites share it), so the board reads only well-formed
   Orb records: site "orb", game pure-<cells>-<mines> or hard-<cells>-<mines>-<climb>, an integer time
   in ms. */
export function accept(v) {
  // the game id is rules.js gameId: the sphere's, or a surface's (torus-, klein-, proj-, genus2-) before it
  return !!v && v.site === "orb" && /^((torus|klein|proj|genus2)-)?(pure-\d{2,5}-\d{1,5}|hard-\d{2,5}-\d{1,5}-\d{1,5})$/.test(v.game) && v.unit === "ms" &&
    v.higherIsBetter === false && Number.isInteger(v.value) && v.value >= 1000 && v.value <= 86400e3 &&
    typeof v.createdAt === "string" && !isNaN(Date.parse(v.createdAt));
}
const RELAY = "https://relay1.us-east.bsky.network";
const JETSTREAMS = ["wss://jetstream2.us-east.bsky.network", "wss://jetstream1.us-east.bsky.network"];
const APPVIEW = "https://public.api.bsky.app";

export class Corpus {
  /* accept(value) → true for records this page cares about */
  constructor(accept, opts = {}) {
    this.accept = accept;
    this.records = new Map();   // at-uri → { uri, did, ...value }
    this.profiles = new Map();  // did → { handle, avatar, name } — verified, from the appview
    this._asked = new Map();    // did → { n: attempts, at: last attempt ms }
    this.listeners = new Set();
    this.state = "idle";        // idle | backfill | live | offline
    this.repos = 0;
    this.relay = opts.relay || RELAY;
    this.appview = opts.appview || APPVIEW;
    this.jetstreams = opts.jetstreams || JETSTREAMS;
    this.concurrency = opts.concurrency || 6;
    this._cursor = 0;           // last Jetstream time_us seen
    this._ws = null; this._tries = 0; this._closed = false;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) { try { fn(this); } catch (e) { /* a listener's problem */ } } }

  async start() {
    this.state = "backfill"; this._emit();
    this._cursor = (Date.now() - 60e3) * 1000;
    const dids = await this._listRepos().catch(() => []);
    this.repos = dids.length;
    await pool(dids, this.concurrency, (did) => this._loadRepo(did).catch(() => {}));
    await this._names(dids);
    this._emit();
    this._connect();
  }

  stop() { this._closed = true; if (this._ws) this._ws.close(); }

  /* Put a record we just wrote in now, without waiting for Jetstream. */
  upsert(uri, did, value, handle) {
    if (handle && !this.profiles.has(did)) this.profiles.set(did, { handle, avatar: null, name: null, provisional: true });
    if (!this.accept(value)) return false;
    this.records.set(uri, { uri, did, ...value });
    this._emit();
    return true;
  }

  async _listRepos() {
    const out = [];
    let cursor = "";
    for (let page = 0; page < 50; page++) {
      const q = this.relay + "/xrpc/com.atproto.sync.listReposByCollection?collection=" + COLLECTION + "&limit=1000" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const body = await getJSON(q);
      for (const r of body.repos || []) out.push(r.did);
      if (!body.cursor || !(body.repos || []).length) break;
      cursor = body.cursor;
    }
    return out;
  }

  /* Names and avatars come from the appview's getProfiles, which only
     reports a handle that verifies both ways (else "handle.invalid"). A DID
     document's alsoKnownAs is a bare claim, so it is never shown. A failed or
     partial lookup is retried (top() asks again for anyone still nameless,
     backing off), so a row never stays stuck on a raw DID. */
  async _names(dids) {
    const now = Date.now(), todo = [];
    for (const d of dids) {
      const a = this._asked.get(d) || { n: 0, at: 0 };
      if (a.n >= 5 || now - a.at < 2000 * 2 ** a.n) continue;
      this._asked.set(d, { n: a.n + 1, at: now });
      todo.push(d);
    }
    let changed = false;
    for (let i = 0; i < todo.length; i += 25) {
      const q = todo.slice(i, i + 25).map((d) => "actors=" + encodeURIComponent(d)).join("&");
      try {
        const body = await getJSON(this.appview + "/xrpc/app.bsky.actor.getProfiles?" + q);
        for (const p of body.profiles || []) {
          if (!p.handle || p.handle === "handle.invalid") continue;
          this.profiles.set(p.did, {
            handle: p.handle, name: p.displayName || null,
            avatar: p.avatar ? p.avatar.replace("/img/avatar/", "/img/avatar_thumbnail/") : null,
          });
          changed = true;
        }
      } catch (e) { /* retried on a later top() */ }
    }
    return changed;
  }

  async _loadRepo(did) {
    const doc = await resolve(did);
    let cursor = "";
    for (let page = 0; page < 20; page++) {
      const q = doc.pds + "/xrpc/com.atproto.repo.listRecords?repo=" + encodeURIComponent(did) + "&collection=" + COLLECTION + "&limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const body = await getJSON(q);
      for (const r of body.records || []) if (this.accept(r.value)) this.records.set(r.uri, { uri: r.uri, did, ...r.value });
      if (!body.cursor || !(body.records || []).length) break;
      cursor = body.cursor;
    }
  }

  _connect() {
    if (this._closed) return;
    const host = this.jetstreams[this._tries % this.jetstreams.length];
    let ws;
    try { ws = new WebSocket(host + "/subscribe?wantedCollections=" + COLLECTION + "&cursor=" + this._cursor); }
    catch (e) { return this._retry(); }
    this._ws = ws;
    ws.onopen = () => { this._tries = 0; this.state = "live"; this._emit(); };
    ws.onmessage = (m) => this._event(m.data);
    ws.onclose = () => { if (!this._closed) this._retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* already */ } };
  }

  _retry() {
    this.state = "offline"; this._emit();
    const wait = Math.min(30e3, 1000 * 2 ** this._tries++);
    setTimeout(() => this._connect(), wait);
  }

  _event(data) {
    let ev;
    try { ev = JSON.parse(data); } catch (e) { return; }
    if (ev.time_us) this._cursor = ev.time_us;
    if (ev.kind !== "commit" || !ev.commit || ev.commit.collection !== COLLECTION) return;
    const c = ev.commit, uri = "at://" + ev.did + "/" + COLLECTION + "/" + c.rkey;
    if (c.operation === "delete") {
      if (this.records.delete(uri)) this._emit();
      return;
    }
    if (!this.accept(c.record)) return;
    this.records.set(uri, { uri, did: ev.did, ...c.record });
    if (!this.profiles.has(ev.did)) this._names([ev.did]).then((ok) => ok && this._emit());
    this._emit();
  }

  /* Best value per player for one game since `since` (ms epoch): the lowest
     (a time), or with `higher` the highest (a score). Ties go to the earlier. */
  top(game, since = 0, n = 10, higher = false) {
    const best = new Map(), s = higher ? -1 : 1;
    for (const r of this.records.values()) {
      if (r.game !== game) continue;
      if (since && Date.parse(r.createdAt) < since) continue;
      const b = best.get(r.did);
      if (!b || s * r.value < s * b.value || (r.value === b.value && r.createdAt < b.createdAt)) best.set(r.did, r);
    }
    const rows = Array.from(best.values())
      .sort((a, b) => s * (a.value - b.value) || (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, n)
      .map((r) => {
        const p = this.profiles.get(r.did);
        return { ...r, handle: p ? p.handle : null, avatar: p ? p.avatar : null, name: p ? p.name : null };
      });
    const need = rows.filter((r) => { const p = this.profiles.get(r.did); return !p || p.provisional; }).map((r) => r.did);
    if (need.length) this._names(need).then((ok) => ok && this._emit());
    return rows;
  }
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

/* DID → { pds } for did:plc and did:web. */
export async function resolve(did) {
  const url = did.startsWith("did:web:")
    ? "https://" + decodeURIComponent(did.slice(8)) + "/.well-known/did.json"
    : "https://plc.directory/" + did;
  const doc = await getJSON(url);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.id === did + "#atproto_pds");
  if (!svc) throw new Error("no PDS for " + did);
  return { pds: svc.serviceEndpoint.replace(/\/$/, "") };
}

async function pool(items, k, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, run));
}
