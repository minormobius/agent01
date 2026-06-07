// CodeScan — pull text (e.g. activation codes) off an image, entirely client-side.
//
// All the heavy lifting runs in Rust/WASM (os/crates/codescan-ocr → src/wasm/
// codescan_ocr*): image decode + neural text detection/recognition via the
// `ocrs` engine. This module just (1) boots the wasm, (2) fetches the two ocrs
// model files once (through the same-origin /api/model proxy — see worker.js),
// and (3) hands image bytes to the wasm and parses the JSON it returns.

import init, { init_engine, extract_text, init_panic_hook, is_ready } from '../wasm/codescan_ocr.js';
import wasmUrl from '../wasm/codescan_ocr_bg.wasm?url';

// ocrs detection + recognition models, proxied same-origin to dodge S3 CORS.
const MODEL_URLS = {
  detection: '/api/model?name=text-detection',
  recognition: '/api/model?name=text-recognition',
};

let wasmInit = null;   // Promise — wasm module booted
let engineInit = null; // Promise — models loaded into the engine

async function ensureWasm() {
  if (!wasmInit) {
    wasmInit = init(wasmUrl).then(() => init_panic_hook());
  }
  return wasmInit;
}

async function fetchModel(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model fetch failed: ${res.status} ${res.statusText}`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ received, total: total || null });
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

// Boot wasm + load both models. Idempotent and concurrency-safe: repeated calls
// share one in-flight promise; a failure clears it so the next call can retry.
// `onProgress({ stage, received, total })` — stage ∈ detection | recognition | init.
export async function ensureEngine({ onProgress } = {}) {
  await ensureWasm();
  if (is_ready()) return;
  if (!engineInit) {
    engineInit = (async () => {
      onProgress?.({ stage: 'detection' });
      const detection = await fetchModel(MODEL_URLS.detection, (p) =>
        onProgress?.({ stage: 'detection', ...p }),
      );
      onProgress?.({ stage: 'recognition' });
      const recognition = await fetchModel(MODEL_URLS.recognition, (p) =>
        onProgress?.({ stage: 'recognition', ...p }),
      );
      onProgress?.({ stage: 'init' });
      init_engine(detection, recognition);
    })().catch((err) => {
      engineInit = null; // allow retry on a fresh call
      throw err;
    });
  }
  return engineInit;
}

// Run OCR over an image (File/Blob or raw Uint8Array of PNG/JPEG/WebP/GIF/BMP).
// Returns { text, lines: string[] }.
export async function scanImage(fileOrBytes, { onProgress } = {}) {
  await ensureEngine({ onProgress });
  const bytes =
    fileOrBytes instanceof Uint8Array
      ? fileOrBytes
      : new Uint8Array(await fileOrBytes.arrayBuffer());
  const json = extract_text(bytes, '');
  return JSON.parse(json);
}

// Heuristic: pull out tokens that look like activation / license / serial codes
// from OCR'd text — runs of 4+ uppercase-alnum, optionally dash/space grouped
// (e.g. "ABCD-1234-EFGH", "XK7Q9T2M"). Case-folded so lowercase reads still hit.
const CODE_RE = /\b[A-Z0-9]{4,}(?:[-\s][A-Z0-9]{3,}){0,6}\b/g;

export function findCodes(text) {
  const upper = (text || '').toUpperCase();
  const seen = new Set();
  const out = [];
  for (const m of upper.matchAll(CODE_RE)) {
    const code = m[0].replace(/\s+/g, ' ').trim();
    // skip plain words: require at least one digit OR length ≥ 6 (codey)
    const looksCodey = /[0-9]/.test(code) || code.replace(/[-\s]/g, '').length >= 6;
    if (looksCodey && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
