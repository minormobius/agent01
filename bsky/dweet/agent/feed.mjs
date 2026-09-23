/**
 * What dweets exist on the network.
 *
 *   node agent/feed.mjs --tail 30          tail the live firehose for 30s
 *   node agent/feed.mjs --at alice.bsky.social [--limit 50]
 *                                          list one repo's dweets
 *
 * Both print `at://` uris, which every other tool here accepts — so
 * `feed.mjs --at someone | …` then `check.mjs at://…` then
 * `render.mjs at://… --out shots` is the whole read path.
 *
 * ─── the two halves, and why both ──────────────────────────────────────────
 *
 * **`--at` is the answer for one account** and costs one request: a PDS's
 * `listRecords` is public, unauthenticated, and returns the records
 * themselves, so nothing has to be fetched twice.
 *
 * **`--tail` is the answer for the network**, and there is no other: this
 * lexicon has no index, no AppView and no search. A `collections` filter on
 * Jetstream v2 is server-side, so one socket carries every dweet anyone posts
 * and nothing else — which is the same reason the page itself needs no
 * backend. It only ever hands you what happens NEXT plus the replay window
 * (~36h), so a quiet tail means nobody has posted lately, not that nothing
 * exists.
 *
 * A note for whoever debugs this next: the `kinds` parameter takes lowercase
 * values, and a wrong one is rejected BEFORE the WebSocket upgrade with a
 * non-101 — which looks exactly like a blocked proxy. This surface shipped
 * `KIND.COMMIT` (undefined) once and its feed was empty for days.
 */
import { arg, has, num, emit, die, resolveHandle, resolvePds } from './common.mjs';
import { dweetFromEvent, NSID } from '../event.js';
import { countChars, sizeClass, dwitterPortable } from '../sandbox.js';

const HOSTS = ['wss://jetstream.us-east.bsky.network', 'wss://jetstream.us-west.bsky.network'];
const PATH = '/xrpc/network.bsky.jetstream.subscribeEvents';

const row = (d) => ({
  uri: d.uri, did: d.did, lang: d.lang, title: d.title || null,
  chars: countChars(d.src), tier: sizeClass(d.src).label,
  dwitter: dwitterPortable(d), createdAt: d.createdAt, src: d.src,
});

const show = (r) => `  ${r.uri}\n`
  + `    ${r.lang.padEnd(4)} ${String(r.chars).padStart(3)}ch ${r.tier.padEnd(5)}`
  + `${r.dwitter ? ' dwitter' : '        '}  ${r.title || ''}\n`
  + `    ${r.src.length > 96 ? r.src.slice(0, 95) + '…' : r.src}`;

if (arg('--at')) {
  let did, pds;
  try {
    did = await resolveHandle(arg('--at'));
    pds = await resolvePds(did);
  } catch (err) { die(err.message); }

  const url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}`
    + `&collection=${NSID}&limit=${num('--limit', 50)}`;
  const res = await fetch(url);
  if (!res.ok) die(`listRecords failed (${res.status})`);
  const records = (await res.json()).records || [];

  // listRecords hands back {uri, value}; dweetFromEvent wants the flat
  // firehose shape. Reuse the one validator rather than a second one that
  // could drift from it.
  const rows = records.map((r) => {
    const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(r.uri);
    const d = dweetFromEvent({
      collection: NSID, did: m?.[1], rkey: m?.[3], operation: 'create', record: r.value,
    });
    return d?.kind === 'dweet' ? row(d) : null;
  }).filter(Boolean);

  emit({ did, pds, count: rows.length, dweets: rows },
    [`${arg('--at')} -> ${did}`, `  ${rows.length} dweet(s) of ${records.length} record(s)`, '',
     ...rows.map(show)]);
  process.exit(0);
}

const seconds = num('--tail', has('--tail') ? 30 : 0);
if (!seconds) die('give --tail <seconds> or --at <handle>');

const found = new Map();
let opened = false;
let host = 0;

function connect() {
  const p = new URLSearchParams();
  p.append('collections', NSID);
  p.append('kinds', 'commit');                 // lowercase; see the header
  p.set('cursor', String((Date.now() - 36 * 3600_000) * 1000));   // the whole replay window
  const ws = new WebSocket(`${HOSTS[host % HOSTS.length]}${PATH}?${p}`, 'xrpc.v1.json');
  ws.onopen = () => { opened = true; };
  ws.onerror = () => {};
  ws.onclose = () => { if (!done) { host++; setTimeout(connect, 500); } };
  ws.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    const d = dweetFromEvent(msg?.payload);
    if (d?.kind === 'dweet' && !found.has(d.uri)) found.set(d.uri, row(d));
    if (d?.kind === 'delete') found.delete(d.uri);
  };
  return ws;
}

let done = false;
const ws = connect();
const ka = setInterval(() => {}, 1000);
setTimeout(() => {
  done = true;
  try { ws.close(); } catch { /* already gone */ }
  clearInterval(ka);
  const rows = [...found.values()];
  emit({ seconds, connected: opened, count: rows.length, dweets: rows },
    [`tailed ${NSID} for ${seconds}s`,
     opened ? '' : '  never connected — the socket was refused before the upgrade',
     `  ${rows.length} dweet(s), including the ~36h replay window`,
     ...(rows.length ? ['', ...rows.map(show)]
       : ['', '  Nothing. This lexicon is new, so an empty tail is the normal answer,',
          '  not a fault — and the replay window only reaches back about 36 hours.']),
    ].filter((l) => l !== ''));
  process.exit(0);
}, seconds * 1000);
