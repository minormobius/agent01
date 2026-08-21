// analyze.worker.js — build someone's web without blocking the page.
//
// Everything here runs off the main thread because the honest cost of this is
// tens of megabytes downloaded and a few hundred million floating-point
// operations. On the main thread that is a frozen tab and a browser offering to
// kill it; here it is a progress bar.
//
// The pipeline is engine.mjs — the same module that produced the committed
// data.json under node. There is deliberately no second implementation.

import { readCarBytes } from './car.mjs';
import { analyze, resolveHandle, pdsFor } from './engine.mjs';

const MAX_BYTES = 400 * 1024 * 1024;

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

    // Stream the CAR so the bar means something. A repo is small for most
    // people and very large for a few, and the difference is the whole
    // experience: without a byte counter a 90 MB fetch looks like a hang.
    send('progress', { stage: 'downloading the repo', frac: 0.02 });
    const url = `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`the data server said ${res.status}`);
      err.code = res.status === 429 ? 'RATE_LIMIT' : 'GET_REPO';
      throw err;
    }

    const total = +(res.headers.get('content-length') || 0);
    const chunks = [];
    let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (got > MAX_BYTES) {
        const err = new Error(`that repo is over ${Math.round(MAX_BYTES / 1e6)} MB — too big to do in a browser tab`);
        err.code = 'TOO_BIG';
        throw err;
      }
      send('progress', {
        stage: 'downloading the repo',
        frac: 0.02 + 0.38 * (total ? got / total : Math.min(0.9, got / 40e6)),
        bytes: got,
        total,
      });
    }

    const bytes = new Uint8Array(got);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.length; }
    chunks.length = 0;

    send('progress', { stage: 'reading the archive', frac: 0.42 });
    const { records } = readCarBytes(
      bytes, new Set(['app.bsky.feed.post']),
      (f, blocks) => send('progress', { stage: 'reading the archive', frac: 0.42 + 0.18 * f, blocks }),
    );

    const data = analyze(records, {
      handle: handle.trim().replace(/^@/, ''),
      did,
      onProgress: ({ stage, frac }) => send('progress', { stage, frac: 0.6 + 0.4 * frac }),
    });

    send('done', { data });
  } catch (err) {
    send('error', { code: err.code || 'UNKNOWN', message: err.message || String(err) });
  }
};
