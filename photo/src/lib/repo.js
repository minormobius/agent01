// Repo sync — download public CAR from PDS, parse with Rust/WASM
// Adapted from os/src/lib/repo.js — no auth required for public repos

import init, { parseCarToNdjson } from '../wasm/pds_car_parser.js';
import wasmUrl from '../wasm/pds_car_parser_bg.wasm?url';

let wasmReady = false;

async function ensureWasm() {
  if (!wasmReady) {
    await init(wasmUrl);
    wasmReady = true;
  }
}

/**
 * Stream a public repo's CAR into one contiguous buffer.
 *
 * The WASM parser needs a single `Uint8Array`, so a repo has to be whole in
 * memory at some point. What it does *not* need is to be there twice: the
 * obvious version keeps every chunk in an array and then concatenates, which
 * peaks at 2× the repo — and this pipeline is already tight enough that a big
 * account OOMs a phone. When the server sends `content-length` (bsky.network
 * does) we allocate once and fill in place. Only the unknown-length case falls
 * back to collect-then-concatenate.
 */
export async function downloadRepo(pdsUrl, did, { onProgress } = {}) {
  const url = `${pdsUrl}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`getRepo failed: ${res.status} ${err}`);
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  let received = 0;

  if (contentLength > 0) {
    const data = new Uint8Array(contentLength);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // A truncated or over-long body would otherwise throw inside `set` —
      // stop at the declared size and let the parser report a bad CAR.
      if (received + value.length > contentLength) {
        data.set(value.subarray(0, contentLength - received), received);
        received = contentLength;
        break;
      }
      data.set(value, received);
      received += value.length;
      if (onProgress) onProgress({ received, total: contentLength });
    }
    return received === contentLength ? data : data.subarray(0, received);
  }

  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress({ received, total: null });
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

export async function parseCar(carBytes, did) {
  await ensureWasm();
  return parseCarToNdjson(carBytes, did);
}
