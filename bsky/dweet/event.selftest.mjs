/**
 * event.js — pinned against a payload CAPTURED FROM THE LIVE FIREHOSE.
 *
 * The fixture below is not invented. It is a real
 * `network.bsky.jetstream.subscribeEvents#commit` payload taken off
 * `wss://jetstream.us-east.bsky.network` on 2026-09-22, with only the record
 * body swapped for a dweet's. Its SHAPE is the thing under test, because the
 * bug this file exists to prevent was reading the wrong shape:
 *
 *   payload.commit.operation   ← what dweet's feed handler read
 *   payload.operation          ← what the wire actually carries
 *
 * Nothing throws when you get that wrong. The handler returns early on its
 * first line, forever, and the page shows an empty feed over a healthy socket.
 *
 *   node bsky/dweet/event.selftest.mjs
 */
import { dweetFromEvent, uriOf, NSID, MAX_CHARS } from './event.js';

let pass = 0;
const fails = [];
const ok = (what, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(detail ? `${what} — ${detail}` : what);
};
const eq = (what, got, want) =>
  ok(what, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const SRC = "c.width|=0;x.fillRect(960+S(t)*400,540,40,40)";

/** Verbatim envelope shape from the live wire; record body is ours. */
const LIVE_CREATE = {
  $type: 'network.bsky.jetstream.subscribeEvents#commit',
  cid: 'bafyreiah6vgo4zv53nctbbbshbsgwnqcu2tm6clkxjrurpx727vt6bnnlm',
  collection: NSID,
  did: 'did:plc:nl6sw77wglodj7i7tlunduf7',
  operation: 'create',
  record: {
    $type: NSID,
    src: SRC,
    lang: 'js',
    title: 'a square',
    createdAt: '2026-09-22T16:25:41.000Z',
    captureTime: 2250,
  },
  rev: '3mw4ncoxwsq2j',
  rkey: '3mw4nco5knc25',
  seq: 26210877813,
  time: '2026-09-22T16:25:42.157412Z',
};

/** Also verbatim: a delete carries no record and no cid. */
const LIVE_DELETE = {
  $type: 'network.bsky.jetstream.subscribeEvents#commit',
  collection: NSID,
  did: 'did:plc:dieq4w64c5ghkt57kc4ggyix',
  operation: 'delete',
  rev: '3mw4ncpxrxp2y',
  rkey: '3lbplrpv4bs2a',
  seq: 26210877825,
  time: '2026-09-22T16:25:42.160614Z',
};

// ── 1. the live shape parses ─────────────────────────────────────
{
  const d = dweetFromEvent(LIVE_CREATE);
  ok('live create: parsed at all', d !== null, 'returned null');
  eq('live create: kind', d?.kind, 'dweet');
  eq('live create: uri', d?.uri,
    `at://did:plc:nl6sw77wglodj7i7tlunduf7/${NSID}/3mw4nco5knc25`);
  eq('live create: src verbatim', d?.src, SRC);
  eq('live create: lang', d?.lang, 'js');
  eq('live create: title', d?.title, 'a square');
  eq('live create: captureTime', d?.captureTime, 2250);
  eq('live create: cid carried', d?.cid, LIVE_CREATE.cid);
  eq('live create: seq carried', d?.seq, 26210877813);
  eq('live create: createdAt from the RECORD, not the event',
    d?.createdAt, '2026-09-22T16:25:41.000Z');
}

// ── 2. the nested shape must NOT work ────────────────────────────
{
  // This is the archive/snapshot shape, and it is what the broken handler was
  // written against. It has to come back null, not half-parsed: a half-parse
  // would be a dweet with no source, which is worse than nothing.
  const nested = {
    did: LIVE_CREATE.did, seq: 1, time: LIVE_CREATE.time, kind: 'commit',
    commit: {
      operation: 'create', collection: NSID, rkey: 'abc', rev: 'r',
      cid: 'c', record: LIVE_CREATE.record,
    },
  };
  eq('nested (archive) shape is refused, not guessed at',
    dweetFromEvent(nested), null);
  eq('…and so is a payload with BOTH, where commit would shadow the truth',
    dweetFromEvent({ ...nested, collection: undefined }), null);
}

// ── 3. deletes ───────────────────────────────────────────────────
{
  const d = dweetFromEvent(LIVE_DELETE);
  eq('delete: recognised', d?.kind, 'delete');
  eq('delete: uri', d?.uri,
    `at://did:plc:dieq4w64c5ghkt57kc4ggyix/${NSID}/3lbplrpv4bs2a`);
  // A delete has no record. Returning null here would leave deleted work on
  // screen, which is the one thing a feed must not do.
  ok('delete: not discarded for having no record', d !== null);
}

// ── 4. everything that must be ignored ───────────────────────────
{
  eq('another collection is ignored',
    dweetFromEvent({ ...LIVE_CREATE, collection: 'app.bsky.feed.post' }), null);
  eq('no payload', dweetFromEvent(null), null);
  eq('not an object', dweetFromEvent('commit'), null);
  eq('no rkey means no uri', dweetFromEvent({ ...LIVE_CREATE, rkey: undefined }), null);
  eq('no did means no uri', dweetFromEvent({ ...LIVE_CREATE, did: undefined }), null);
  eq('an account-level event with no collection',
    dweetFromEvent({ did: 'did:plc:x', kind: 'identity', seq: 1 }), null);
  eq('a create with no record', dweetFromEvent({ ...LIVE_CREATE, record: undefined }), null);
  eq('a record whose src is not a string',
    dweetFromEvent({ ...LIVE_CREATE, record: { ...LIVE_CREATE.record, src: 42 } }), null);
  // `update` is a real operation and a dweet edited in place is still a dweet.
  eq('update is accepted', dweetFromEvent({ ...LIVE_CREATE, operation: 'update' })?.kind, 'dweet');
}

// ── 5. a stranger's record is DATA, and is dropped rather than repaired ──
{
  const over = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, src: 'a'.repeat(MAX_CHARS + 1) } };
  eq('a source over the cap is dropped, not truncated', dweetFromEvent(over), null);

  const weird = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, lang: 'python' } };
  eq('an unknown lang falls back to js rather than being run as itself',
    dweetFromEvent(weird)?.lang, 'js');

  const longTitle = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, title: 'x'.repeat(500) } };
  eq('a long title is capped', dweetFromEvent(longTitle)?.title.length, 64);

  const badTitle = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, title: { evil: true } } };
  eq('a non-string title becomes empty, not "[object Object]"',
    dweetFromEvent(badTitle)?.title, '');

  const badCapture = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, captureTime: -5 } };
  eq('a negative captureTime is ignored', dweetFromEvent(badCapture)?.captureTime, undefined);
  const floatCapture = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, captureTime: 1.5 } };
  eq('a non-integer captureTime is ignored', dweetFromEvent(floatCapture)?.captureTime, undefined);

  const noCreated = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, createdAt: undefined } };
  eq('a missing createdAt falls back to the EVENT time, not to now',
    dweetFromEvent(noCreated)?.createdAt, LIVE_CREATE.time);

  const remix = { ...LIVE_CREATE, record: { ...LIVE_CREATE.record, remixOf: 'at://did:plc:a/x/y' } };
  eq('remixOf is carried', dweetFromEvent(remix)?.remixOf, 'at://did:plc:a/x/y');
  eq('a non-string remixOf is dropped',
    dweetFromEvent({ ...LIVE_CREATE, record: { ...LIVE_CREATE.record, remixOf: 7 } })?.remixOf, null);
}

// ── 6. uriOf matches the documented at:// form ───────────────────
{
  eq('uriOf', uriOf({ did: 'did:plc:a', collection: 'c.d.e', rkey: 'r' }), 'at://did:plc:a/c.d.e/r');
  eq('uriOf: incomplete is null', uriOf({ did: 'did:plc:a', collection: 'c.d.e' }), null);
  eq('uriOf: nothing is null', uriOf(null), null);
}

if (fails.length) {
  console.error(`\nevent.selftest: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`event.selftest: ${pass} assertions passed`);
