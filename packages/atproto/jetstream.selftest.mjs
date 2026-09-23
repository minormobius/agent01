/**
 * jetstream.js — the URL builder.
 *
 * Everything else in this module needs a socket. `url()` does not, and `url()`
 * is where the expensive mistake lives: a filter parameter the server does not
 * accept is rejected BEFORE the WebSocket upgrade, so the only symptom a page
 * ever sees is a connection that never opens. There is no error event, no
 * message, and the reconnect loop hides the rest.
 *
 * That is not hypothetical. `bsky/dweet` shipped `kinds: [KIND.COMMIT]` — the
 * constants are lowercase — and `undefined` stringified into the query string
 * without complaint. Measured against the live host on 2026-09-22:
 *
 *     ?kinds=undefined  ->  400 {"error":"InvalidRequest",
 *                                "message":"subscribe: invalid options:
 *                                           unknown kind \"undefined\""}
 *     ?kinds=commit     ->  426, i.e. the options were fine
 *
 * so that surface had never once connected, and reported it as "disconnected —
 * retrying".
 *
 *   node packages/atproto/jetstream.selftest.mjs
 */
import { JetstreamClient, KIND, HOSTS, MAX_COLLECTIONS, MAX_DIDS, LOOKBACK_HOURS } from './jetstream.js';

let fail = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`);
};
const params = (opts) => new URL(new JetstreamClient({ onEvent() {}, ...opts }).url()).searchParams;

console.log('\nkinds — the parameter that fails before the upgrade');
ok([...params({ kinds: [KIND.commit] }).getAll('kinds')].join() === 'commit',
  'a valid kind goes through');
ok(params({}).getAll('kinds').length === 0, 'no kinds means no parameter (all four)');
for (const bad of [undefined, null, 'COMMIT', 'Commit', 'commits', '', 0]) {
  let threw = null;
  try { params({ kinds: [bad] }); } catch (e) { threw = e.message; }
  ok(threw !== null && /unknown Jetstream kind/.test(threw),
    `refuses ${JSON.stringify(bad)}`, threw ? threw.slice(0, 64) : 'DID NOT THROW');
}
// The error has to NAME the value, or the next person debugging this is back
// where we started: a dead socket and no idea why.
let msg = '';
try { params({ kinds: ['COMMIT'] }); } catch (e) { msg = e.message; }
ok(msg.includes('"COMMIT"'), 'the error names the wrong value', msg);
ok(msg.includes('commit, identity, account, sync'), 'and lists the valid ones');
// The uppercase spelling that caused it must stay undefined rather than being
// quietly aliased — an alias would make both spellings work here and neither
// obviously wrong anywhere else.
ok(KIND.COMMIT === undefined, 'KIND has no uppercase alias');

console.log('\nthe rest of the query string');
{
  const p = params({ collections: ['a.b.c', 'd.e.f'], dids: ['did:plc:x'], kinds: ['commit'] });
  ok(p.getAll('collections').join() === 'a.b.c,d.e.f', 'collections are repeated, not joined');
  ok(p.getAll('dids').join() === 'did:plc:x', 'dids are repeated');
}
{
  const many = Array.from({ length: MAX_COLLECTIONS + 20 }, (_, i) => `x.y.n${i}`);
  ok(params({ collections: many }).getAll('collections').length === MAX_COLLECTIONS,
    'collections are capped at the server limit, not discovered as a rejection');
  const dids = Array.from({ length: 12 }, (_, i) => `did:plc:${i}`);
  ok(params({ dids }).getAll('dids').length === 12, 'a short did list is untouched');
  ok(MAX_DIDS === 10_000, 'the dids cap is the documented 10,000');
}

console.log('\ncursor vs since');
{
  ok(params({ cursor: 42 }).get('cursor') === '42', 'an explicit seq is used verbatim');
  // A seq we have actually seen always wins: after a drop we resume where we
  // stopped rather than replaying the window again.
  ok(params({ cursor: 42, since: 6 }).get('cursor') === '42', 'a cursor beats `since`');

  const micros = Number(params({ since: 6 }).get('cursor'));
  const expected = (Date.now() - 6 * 3600_000) * 1000;
  ok(Math.abs(micros - expected) < 5_000_000, '`since` becomes unix MICROseconds',
    `${micros}`);

  // Past the window the server clamps SILENTLY, so the client clamps loudly
  // instead and the UI can report the depth actually asked for.
  const deep = Number(params({ since: 24 * 7 }).get('cursor'));
  const floor = (Date.now() - LOOKBACK_HOURS * 3600_000) * 1000;
  ok(deep >= floor - 5_000_000, 'a week is clamped to the lookback window',
    `${((Date.now() * 1000 - deep) / 3600e6).toFixed(1)}h`);
}

console.log('\nhosts');
{
  const c = new JetstreamClient({ onEvent() {} });
  ok(c.url().startsWith(HOSTS[0]), 'starts on the first host');
  c.hostIndex++;
  ok(c.url().startsWith(HOSTS[1]), 'rotation picks the next');
  c.hostIndex = HOSTS.length;
  ok(c.url().startsWith(HOSTS[0]), 'and wraps');
  ok(c.url().includes('/xrpc/network.bsky.jetstream.subscribeEvents'),
    'the v2 path, not v1 /subscribe');
}

console.log(fail ? `\n${fail} failure(s)` : '\njetstream url builder holds');
process.exit(fail ? 1 : 0);
