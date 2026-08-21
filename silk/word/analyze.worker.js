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
// NOTHING HOLDS THE ARCHIVE. The first version accumulated every chunk, joined
// them into one buffer, parsed that into an array of every post record, and only
// then started work — a peak of the download, plus a second copy of it, plus
// tens of thousands of live records with their facets and embeds attached. Big
// accounts killed the tab, which is the one failure this page cannot explain
// away. Now the response is parsed as it arrives and each record is reduced to
// word ids and a timestamp on sight, so what is alive at the end of the download
// is about the size of the answer rather than about the size of the repo.

import { createCarParser } from './car.mjs';
import { createCollector, analyzeCollected, resolveHandle, pdsFor, POST_TYPE, POST_FIELDS } from './engine.mjs';

// A ceiling exists so a broken or hostile server cannot stream forever, not
// because the archive has to fit anywhere: it is never assembled. The old limit
// was 400 MB and was about holding the bytes.
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const send = (type, payload) => self.postMessage({ type, ...payload });

self.onmessage = async (e) => {
  const { handle, did: known } = e.data;
  try {
    // A DID supplied by the caller comes from the page's typeahead, which got it
    // from the same directory resolveHandle would ask. Trusting it saves a round
    // trip; anything else about the build is identical.
    send('progress', { stage: 'resolving the handle', frac: 0 });
    const did = known && String(known).startsWith('did:') ? String(known) : await resolveHandle(handle);

    send('progress', { stage: 'finding the data server', frac: 0.01 });
    const pds = await pdsFor(did);

    send('progress', { stage: 'downloading the repo', frac: 0.02 });
    const url = `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`the data server said ${res.status}`);
      err.code = res.status === 429 ? 'RATE_LIMIT' : 'GET_REPO';
      throw err;
    }

    // Download, parse and reduce are one pass. The bar covers 0.02 → 0.60 and
    // reports bytes, because for a large account this IS the wait: the arithmetic
    // afterwards is seconds and the download is a minute.
    const collector = createCollector();
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
        const err = new Error(`that repo is over ${Math.round(MAX_BYTES / 1e9)} GB — too big to do in a browser tab`);
        err.code = 'TOO_BIG';
        throw err;
      }
      parser.push(value);
      send('progress', {
        stage: 'reading the repo',
        frac: 0.02 + 0.58 * (total ? got / total : Math.min(0.9, got / 40e6)),
        bytes: got,
        total,
        posts: collector.withWords,
      });
    }
    const { blocks } = parser.end();
    send('progress', { stage: 'reading the repo', frac: 0.6, blocks, posts: collector.withWords });

    const data = analyzeCollected(collector, {
      handle: handle.trim().replace(/^@/, ''),
      did,
      onProgress: ({ stage, frac }) => send('progress', { stage, frac: 0.6 + 0.4 * frac }),
    });

    send('done', { data });
  } catch (err) {
    send('error', { code: err.code || 'UNKNOWN', message: err.message || String(err) });
  }
};
