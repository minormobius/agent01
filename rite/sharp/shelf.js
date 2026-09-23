// sharp/shelf — the words you decided to keep.
//
// A kept word is a small record: the word, how it sounds, what it scored, and
// whatever the registries last said about it. Two places it can live:
//
//   local   localStorage on this browser. Always on, needs no account, and
//           survives nothing — a cleared cache, another device, a private
//           window and it is gone.
//   repo    one `com.minomobi.sharp.word` record per word in the signer's own
//           ATProto repo. Theirs, portable, readable by anything on the
//           network, and this site stores none of it.
//
// The local shelf is the source of truth for the session; the repo is the
// durable copy. They reconcile by word, newest wins — so keeping a word on a
// phone and then opening the page on a laptop converges rather than forking.
//
// Storage is INJECTED. That is what makes this testable in node and what keeps
// the module honest about the fact that localStorage can simply refuse: in a
// private window every call here throws, and a shelf that throws is a page that
// does not render.

export const COLLECTION = 'com.minomobi.sharp.word';
export const STORE_KEY = 'sharp.shelf.v1';
export const MAX_ENTRIES = 500;

/** A localStorage-backed store that degrades to memory when storage is denied. */
export function browserStore(ls) {
  const mem = new Map();
  let usable = true;
  try {
    const probe = '__sharp_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch { usable = false; }
  return {
    durable: usable,
    read() {
      if (!usable) return mem.get(STORE_KEY) || null;
      try { return ls.getItem(STORE_KEY); } catch { return null; }
    },
    write(text) {
      if (!usable) { mem.set(STORE_KEY, text); return false; }
      try { ls.setItem(STORE_KEY, text); return true; } catch { usable = false; mem.set(STORE_KEY, text); return false; }
    },
  };
}

/** An in-memory store, for node and for tests. */
export function memoryStore() {
  let value = null;
  return { durable: false, read: () => value, write: (t) => { value = t; return false; } };
}

// ---------- entries ----------

const clean = (w) => String(w || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * Build a shelf entry from whatever the page happens to know. Every field but
 * the word is optional: a word kept from the checker has no seed, one kept from
 * the minter has no frequency, and neither is a reason to refuse.
 */
export function entryFrom(source = {}, now = new Date()) {
  const word = clean(source.word);
  if (!word) return null;
  const e = {
    word,
    keptAt: (source.keptAt instanceof Date ? source.keptAt : now).toISOString(),
    syllables: source.syllables ?? 1,
    taken: source.taken ?? null,
    score: source.score ?? null,
    say: source.say ? { ipa: source.say.ipa || null, arpabet: source.say.arpabet || null } : null,
    rhymes: Array.isArray(source.rhymes) ? source.rhymes.slice(0, 8) : [],
    homophones: Array.isArray(source.homophones) ? source.homophones.slice(0, 4) : [],
    origin: source.origin || 'mint',
    style: source.style || null,
    seed: source.seed || null,
    domains: normaliseDomains(source.domains),
    note: source.note ? String(source.note).slice(0, 280) : null,
    uri: source.uri || null,          // the ATProto record, once it has one
  };
  return e;
}

function normaliseDomains(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && d.domain && d.verdict)
    .slice(0, 24)
    .map((d) => ({ domain: String(d.domain), verdict: String(d.verdict), checkedAt: d.checkedAt || null }));
}

/** The one number a shelf row wants: how many registries said yes. */
export function freeCount(entry) {
  return (entry.domains || []).filter((d) => d.verdict === 'free').length;
}

// ---------- the shelf ----------

export class Shelf {
  constructor(store) {
    this.store = store || memoryStore();
    this.entries = this._load();
  }

  _load() {
    const raw = this.store.read();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e) => entryFrom(e, new Date(e.keptAt || Date.now()))).filter(Boolean);
    } catch {
      // Corrupt storage is not worth a broken page. Start clean.
      return [];
    }
  }

  save() {
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    return this.store.write(JSON.stringify(this.entries));
  }

  get durable() { return !!this.store.durable; }
  get size() { return this.entries.length; }
  has(word) { return this.entries.some((e) => e.word === clean(word)); }
  get(word) { return this.entries.find((e) => e.word === clean(word)) || null; }

  /** Add or refresh a word. Newest wins, and the shelf stays newest-first. */
  keep(source, now = new Date()) {
    const entry = entryFrom(source, now);
    if (!entry) return null;
    const existing = this.get(entry.word);
    if (existing) {
      // Merge rather than replace: a re-keep from the minter must not wipe the
      // domain verdicts a later lookup wrote.
      entry.uri = entry.uri || existing.uri;
      entry.domains = entry.domains.length ? entry.domains : existing.domains;
      entry.note = entry.note ?? existing.note;
      this.entries = this.entries.filter((e) => e.word !== entry.word);
    }
    this.entries.unshift(entry);
    this.save();
    return entry;
  }

  /** Attach the registry verdicts a lookup produced. */
  setDomains(word, domains, now = new Date()) {
    const e = this.get(word);
    if (!e) return null;
    e.domains = normaliseDomains((domains || []).map((d) => ({ ...d, checkedAt: d.checkedAt || now.toISOString() })));
    this.save();
    return e;
  }

  drop(word) {
    const w = clean(word);
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.word !== w);
    if (this.entries.length !== before) this.save();
    return before - this.entries.length;
  }

  clear() { this.entries = []; this.save(); }

  /** Fold in what the repo holds. Same word on both sides: the newer keptAt wins. */
  merge(remote) {
    const by = new Map(this.entries.map((e) => [e.word, e]));
    let added = 0, updated = 0;
    for (const r of remote) {
      const e = entryFrom(r, new Date(r.keptAt || Date.now()));
      if (!e) continue;
      const mine = by.get(e.word);
      if (!mine) { by.set(e.word, e); added++; continue; }
      if (Date.parse(e.keptAt) > Date.parse(mine.keptAt)) {
        e.domains = e.domains.length ? e.domains : mine.domains;
        by.set(e.word, e);
        updated++;
      } else if (!mine.uri && e.uri) {
        mine.uri = e.uri;           // learn the record's address without losing the newer copy
        updated++;
      }
    }
    this.entries = [...by.values()].sort((a, b) => Date.parse(b.keptAt) - Date.parse(a.keptAt));
    this.save();
    return { added, updated, total: this.entries.length };
  }

  toJSON() { return this.entries; }
}

// ---------- ATProto ----------

/** A shelf entry as a `com.minomobi.sharp.word` record. */
export function toRecord(entry) {
  const rec = {
    $type: COLLECTION,
    word: entry.word,
    createdAt: entry.keptAt,
    syllables: entry.syllables ?? 1,
    origin: entry.origin || 'mint',
  };
  if (entry.taken !== null && entry.taken !== undefined) rec.taken = !!entry.taken;
  if (entry.score !== null && entry.score !== undefined) rec.score = entry.score;
  if (entry.say && (entry.say.ipa || entry.say.arpabet)) {
    rec.say = {};
    if (entry.say.ipa) rec.say.ipa = entry.say.ipa;
    if (entry.say.arpabet) rec.say.arpabet = entry.say.arpabet;
  }
  if (entry.rhymes && entry.rhymes.length) rec.rhymes = entry.rhymes;
  if (entry.homophones && entry.homophones.length) rec.homophones = entry.homophones;
  if (entry.style) rec.style = entry.style;
  if (entry.seed) rec.seed = entry.seed;
  if (entry.note) rec.note = entry.note;
  if (entry.domains && entry.domains.length) {
    rec.domains = entry.domains.map((d) => {
      const o = { domain: d.domain, verdict: d.verdict };
      if (d.checkedAt) o.checkedAt = d.checkedAt;
      return o;
    });
  }
  return rec;
}

/** A listRecords row back into a shelf entry. */
export function fromRecord(row) {
  const v = row && row.value;
  if (!v || !v.word) return null;
  return entryFrom({
    word: v.word,
    keptAt: v.createdAt,
    syllables: v.syllables,
    taken: v.taken,
    score: v.score,
    say: v.say,
    rhymes: v.rhymes,
    homophones: v.homophones,
    origin: v.origin,
    style: v.style,
    seed: v.seed,
    note: v.note,
    domains: v.domains,
    uri: row.uri || null,
  }, new Date(v.createdAt || Date.now()));
}

/** The rkey at the end of an at:// URI, for a delete. */
export function rkeyOf(uri) {
  const m = String(uri || '').match(/\/([^/]+)$/);
  return m ? m[1] : null;
}

/** The scope this site asks for — exactly one collection, so consent stays short. */
export const SCOPE = `atproto repo:${COLLECTION}`;

/**
 * Can the shared auth worker actually grant that scope yet?
 *
 * A new collection has to be in WRITE_COLLECTIONS *and* the auth worker has to
 * have been redeployed, because the ceiling the authorization server validates
 * against is the one in the live client-metadata.json. Asking for a scope above
 * the ceiling fails at the authorization server — after the redirect, where the
 * error is someone else's and reads like a bug. So check first, and if the
 * ceiling is short, say so plainly and stay local. It starts working by itself
 * the day the auth worker ships.
 *
 * `known` separates the two failures, which are not the same claim: `known:
 * true` means the metadata was read and does not list the collection, and
 * `known: false` means we could not ask at all. Telling someone their feature
 * is unshipped when the truth is a dropped request is a lie, and it would hide
 * the sign-in button over a blip — so the caller should treat an unknown
 * ceiling as "try anyway", not as "no".
 *
 * @returns {Promise<{ok: boolean, known: boolean, reason?: string}>}
 */
export async function ceilingAllows(fetchImpl, authUrl = 'https://auth.mino.mobi') {
  let meta;
  try {
    const res = await fetchImpl(`${authUrl}/client-metadata.json`);
    if (!res.ok) return { ok: false, known: false, reason: `the auth worker answered ${res.status}` };
    meta = await res.json();
  } catch (e) {
    return { ok: false, known: false, reason: `could not reach the auth worker (${String((e && e.message) || e)})` };
  }
  const tokens = String((meta && meta.scope) || '').split(/\s+/).filter(Boolean);
  const want = `repo:${COLLECTION}`;
  if (tokens.includes(want) || tokens.includes('repo:*') || tokens.includes('transition:generic')) {
    return { ok: true, known: true };
  }
  return { ok: false, known: true, reason: 'the shared auth worker does not offer this collection yet' };
}
