// Repo sync — download CAR from PDS, parse with Rust/WASM, ingest into DuckDB
// This is the core pipeline: PDS → CAR → WASM → NDJSON → DuckDB → SQL

import init, { parseCarToNdjson, carStats } from '../wasm/pds_car_parser.js';
import wasmUrl from '../wasm/pds_car_parser_bg.wasm?url';

let wasmReady = false;

async function ensureWasm() {
  if (!wasmReady) {
    await init(wasmUrl);
    wasmReady = true;
  }
}

// Download the full repo as a CAR file
export async function downloadRepo(pdsUrl, did, accessJwt, { onProgress } = {}) {
  const url = `${pdsUrl}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessJwt}` }
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`getRepo failed: ${res.status} ${err}`);
  }

  // Stream the response to track progress
  const contentLength = parseInt(res.headers.get('content-length') || '0');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) {
      onProgress({ received, total: contentLength || null });
    }
  }

  // Concatenate chunks
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  return data;
}

// Parse a CAR file into NDJSON using the Rust/WASM parser
export async function parseCar(carBytes, did) {
  await ensureWasm();
  return parseCarToNdjson(carBytes, did);
}

// Get quick stats from a CAR file
export async function getCarStats(carBytes) {
  await ensureWasm();
  const statsJson = carStats(carBytes);
  return typeof statsJson === 'string' ? JSON.parse(statsJson) : statsJson;
}

// Full pipeline: download + parse + return NDJSON
export async function syncRepo(pdsUrl, did, accessJwt, { onProgress, onStatus } = {}) {
  if (onStatus) onStatus('downloading');

  const carBytes = await downloadRepo(pdsUrl, did, accessJwt, {
    onProgress: (p) => {
      if (onProgress) onProgress(p);
    }
  });

  if (onStatus) onStatus('parsing');

  const ndjson = await parseCar(carBytes, did);

  if (onStatus) onStatus('done');

  return { ndjson, carSize: carBytes.length };
}
