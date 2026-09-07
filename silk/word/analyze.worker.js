// analyze.worker.js — build someone's web without blocking the page.
//
// Everything here runs off the main thread because the honest cost of this is
// tens of megabytes downloaded and a few hundred million floating-point
// operations. On the main thread that is a frozen tab and a browser offering to
// kill it; here it is a progress bar.
//
// The pipeline is engine.mjs — the same module that produced the committed
// data.json under node. There is deliberately no second implementation.
//
// TWO WAYS TO GET THE POSTS, and the difference between them is memory:
//
//   archive   com.atproto.sync.getRepo — the whole repo as one CAR, parsed as
//             it streams. About 8 seconds for a 50,000-post account and about
//             120 MB of browser memory, and the memory is NOT ours: measured,
//             a 91 MB response costs ~80 MB of browser buffer even when every
//             chunk is thrown away unread. One large response is expensive to
//             receive no matter what you do with it.
//
//   pages     com.atproto.repo.listRecords, 100 at a time. About 70 KB in
//             flight at any moment and a few MB alive at the end, whatever the
//             size of the account — but ~500 round trips, so minutes rather
//             than seconds.
//
// Same collector, same engine, same output: posts are sorted by timestamp, so
// the order they arrived in does not survive into the answer.

import { createCarParser } from './car.mjs';
import { createCollector, analyzeCollected, resolveHandle, pdsFor, POST_TYPE, POST_FIELDS } from './engine.mjs';

// A ceiling exists so a broken or hostile server cannot stream forever, not
// because the archive has to fit anywhere: it is never assembled.
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const PAGE = 100;

const send = (type, payload) => self.postMessage({ type, ...payload });

// Progress messages are throttled. A fast connection hands over chunks faster
// than the main thread can paint, and the answer to that is not to make the
// main thread paint faster.
let lastSay = 0;
function say(payload, force = false) {
  const now = Date.now();
  if (!force && now - lastSay < 90) return;
  lastSay = now;
  send('progress', payload);
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ─── archive: one big CAR, parsed as it arrives ─────────────────────────────

async function readArchive(pds, did, collector) {
  say({ stage: 'downloading the repo', frac: 0.02 }, true);
  const res = await fetch(`${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
  if (!res.ok) {
    throw fail(res.status === 429 ? 'RATE_LIMIT' : 'GET_REPO', `the data server said ${res.status}`);
  }

  const parser = createCarParser({
    wantTypes: new Set([POST_TYPE]),
    keep: POST_FIELDS,
    onRecord: (rec) => collector.add(rec),
  });

  const total = +(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (got > MAX_BYTES) {
      throw fail('TOO_BIG', `that repo is over ${Math.round(MAX_BYTES / 1e9)} GB — too big to do in a browser tab`);
    }
    parser.push(value);
    say({
      stage: 'reading the repo',
      frac: 0.02 + 0.58 * (total ? got / total : Math.min(0.9, got / 40e6)),
      bytes: got,
      total,
      posts: collector.withWords,
    });
  }
  parser.end();
}

// ─── pages: 100 records at a time, nothing large ever in flight ─────────────

async function readPages(pds, did, collector) {
  const base = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}`
    + `&collection=${encodeURIComponent(POST_TYPE)}&limit=${PAGE}`;
  let cursor = '';
  let pages = 0;

  for (;;) {
    let res = await fetch(cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base);
    // One retry on a rate limit, because five hundred requests will meet one
    // sooner or later and losing four minutes of work to it would be silly.
    if (res.status === 429) {
      const wait = Math.min(30, Math.max(2, +(res.headers.get('retry-after') || 5))) * 1000;
      say({ stage: 'waiting out a rate limit', frac: 0.02 + 0.58 * (1 - Math.exp(-pages / 180)), posts: collector.withWords }, true);
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base);
    }
    if (!res.ok) {
      throw fail(res.status === 429 ? 'RATE_LIMIT' : 'NO_LIST', `the data server said ${res.status}`);
    }

    const body = await res.json();
    const records = Array.isArray(body.records) ? body.records : [];
    for (const r of records) collector.add(r && r.value);
    pages++;

    // Yield between pages. listRecords hands back the WHOLE record — facets,
    // embeds, langs, everything the CAR path is careful never to build — and
    // JSON.parse has to construct all of it before the collector can pick the
    // four fields it wants. That is garbage rather than retention, but garbage
    // still has to be collected, and on a fast connection five hundred pages
    // arrive faster than V8 bothers to. One turn of the event loop per page
    // costs nothing next to a network round trip and keeps the peak flat.
    await new Promise((r) => setTimeout(r, 0));
    cursor = body.cursor || '';
    if (!cursor || !records.length) break;

    // There is no total to divide by — listRecords does not say how many there
    // are — so the bar approaches the end of its range instead of pretending to
    // know. The post count beside it is the number that means something.
    say({
      stage: 'reading posts, a page at a time',
      frac: 0.02 + 0.58 * (1 - Math.exp(-pages / 180)),
      pages,
      posts: collector.withWords,
    });
  }
  say({ stage: 'reading posts, a page at a time', frac: 0.6, pages, posts: collector.withWords }, true);
}

// ─── ─────────────────────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { handle, did: known, mode = 'archive' } = e.data;
  try {
    // A DID supplied by the caller comes from the page's typeahead, which got it
    // from the same directory resolveHandle would ask. Trusting it saves a round
    // trip; anything else about the build is identical.
    say({ stage: 'resolving the handle', frac: 0 }, true);
    const did = known && String(known).startsWith('did:') ? String(known) : await resolveHandle(handle);

    say({ stage: 'finding the data server', frac: 0.01 }, true);
    const pds = await pdsFor(did);

    const collector = createCollector();
    if (mode === 'pages') await readPages(pds, did, collector);
    else await readArchive(pds, did, collector);

    const data = analyzeCollected(collector, {
      handle: handle.trim().replace(/^@/, ''),
      did,
      onProgress: ({ stage, frac }) => say({ stage, frac: 0.6 + 0.4 * frac }, frac >= 1),
    });

    send('done', { data, mode });
  } catch (err) {
    send('error', { code: err.code || 'UNKNOWN', message: err.message || String(err) });
  }
};
