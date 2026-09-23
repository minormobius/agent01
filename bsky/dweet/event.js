/**
 * A Jetstream v2 event → a dweet, or nothing.
 *
 * This is one small function in its own file for one reason: it is where the
 * wire format lives, and getting the wire format wrong is invisible. A handler
 * that reads the wrong key does not throw and does not log — it just returns
 * early, every time, and the feed is empty forever while the socket is
 * perfectly healthy.
 *
 * ─── the shape, measured from the live firehose 2026-09-22 ─────────────────
 *
 * A v2 message is an envelope, and **the payload inside it is FLAT**:
 *
 *   { "$type": "message",
 *     "payload": {
 *       "$type": "network.bsky.jetstream.subscribeEvents#commit",
 *       "did": "did:plc:…", "collection": "app.bsky.feed.post",
 *       "rkey": "3mw4nco5knc25", "rev": "3mw4ncoxwsq2j",
 *       "cid": "bafyrei…", "operation": "create",
 *       "record": { … }, "seq": 26210877813, "time": "2026-09-22T16:25:42Z" } }
 *
 * There is **no `payload.commit`**. dweet's feed handler read
 * `payload.commit.operation`, so every event it ever received was dropped on
 * the first line — a second, independent reason the feed was empty, and one
 * that fixing the socket alone would not have touched.
 *
 * The confusion is real and has a source: the ARCHIVE's snapshot events *are*
 * nested (`{ did, seq, time, kind, commit: { operation, collection, rkey, rev,
 * cid, record } }`), and `bsky/CLAUDE.md` records the same mistake being made
 * in the other direction — the archive paths reading `evt.collection` and
 * silently discarding 16,234 events. Two shapes, one field name, and both
 * failures are silence. Hence this file and its selftest.
 *
 * A DELETE carries no `record` and no `cid` — only `collection`, `rkey`, `did`,
 * `rev`, `seq` and `time`. That is not an error case; it is how a deletion is
 * expressed, and a feed that ignores it leaves deleted work on screen.
 */
import { validate, LANGS, MAX_CHARS } from './sandbox.js';

export const NSID = 'com.minomobi.dweet.dweet';

/**
 * The at:// URI of the record an event is about.
 *
 * Deliberately the same rule as `eventUri()` in packages/atproto/jetstream.js,
 * spelled out here so this module can be tested in node without the staged
 * copy of that package. The selftest pins the format.
 */
export function uriOf(payload) {
  if (!payload?.did || !payload?.collection || !payload?.rkey) return null;
  return `at://${payload.did}/${payload.collection}/${payload.rkey}`;
}

/**
 * @param {object} payload  a Jetstream v2 payload, flat (see above)
 * @returns {null
 *   | {kind: 'delete', uri: string}
 *   | {kind: 'dweet', uri, did, src, lang, title, createdAt, cid, seq, captureTime}}
 *
 * Returns null for anything this surface should not act on. A record that
 * fails `validate()` is DROPPED, never repaired: it arrived from a stranger's
 * repo, and a feed that quietly fixes up malformed records is a feed that will
 * eventually run something nobody wrote.
 */
export function dweetFromEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.collection !== NSID) return null;

  const uri = uriOf(payload);
  if (!uri) return null;

  if (payload.operation === 'delete') return { kind: 'delete', uri };
  if (payload.operation !== 'create' && payload.operation !== 'update') return null;

  const rec = payload.record;
  if (!rec || typeof rec.src !== 'string') return null;

  const lang = LANGS.includes(rec.lang) ? rec.lang : 'js';
  const v = validate({ src: rec.src, lang });
  if (!v.ok) return null;

  return {
    kind: 'dweet',
    uri,
    did: payload.did,
    cid: payload.cid,
    seq: payload.seq,
    src: rec.src,
    lang,
    title: typeof rec.title === 'string' ? rec.title.slice(0, 64) : '',
    remixOf: typeof rec.remixOf === 'string' ? rec.remixOf : null,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : (payload.time || new Date().toISOString()),
    captureTime: Number.isInteger(rec.captureTime) && rec.captureTime >= 0
      ? rec.captureTime : undefined,
  };
}

/** Exported for the selftest's benefit, so the cap it asserts is the real one. */
export { MAX_CHARS };
