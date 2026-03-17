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

export async function downloadRepo(pdsUrl, did, { onProgress } = {}) {
  const url = `${pdsUrl}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`getRepo failed: ${res.status} ${err}`);
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress({ received, total: contentLength || null });
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
