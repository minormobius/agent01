// Shared OCR engine — used both by the Web Worker (ocr.worker.js, the normal
// path) and as a main-thread fallback (app.js) when module workers aren't
// available. All heavy work runs in Rust/WASM (wasm/codescan_ocr*).
//
// `import.meta.url` resolves relative to THIS module, so the wasm + model paths
// are correct whether engine.js is imported on the main thread or in a worker.

import init, { init_engine, extract_text, init_panic_hook, is_ready } from './wasm/codescan_ocr.js';

const WASM_URL = new URL('./wasm/codescan_ocr_bg.wasm', import.meta.url);
const MODEL_URLS = {
  detection: '/api/model?name=text-detection',
  recognition: '/api/model?name=text-recognition',
};

// Photos larger than this on their long edge are downscaled before OCR: it cuts
// decode + detection time a lot while leaving plenty of detail for codes/labels.
const MAX_DIM = 2400;

let wasmInit = null;
let engineInit = null;

async function ensureWasm() {
  if (!wasmInit) wasmInit = init(WASM_URL).then(() => init_panic_hook());
  return wasmInit;
}

async function fetchModel(url, stage, onProgress) {
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
    onProgress?.({ stage, received, total: total || null });
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}

// Boot wasm + load both models. Idempotent + concurrency-safe; a failure clears
// the in-flight promise so a later call can retry.
export async function ensureEngine(onProgress) {
  await ensureWasm();
  if (is_ready()) return;
  if (!engineInit) {
    engineInit = (async () => {
      onProgress?.({ stage: 'detection' });
      const det = await fetchModel(MODEL_URLS.detection, 'detection', onProgress);
      onProgress?.({ stage: 'recognition' });
      const rec = await fetchModel(MODEL_URLS.recognition, 'recognition', onProgress);
      onProgress?.({ stage: 'init' });
      init_engine(det, rec);
    })().catch((err) => { engineInit = null; throw err; });
  }
  return engineInit;
}

// Gently downscale very large images (and fix EXIF orientation while we're at
// it — phone photos are exactly the big ones). Returns the bytes to hand to the
// wasm decoder. Any failure falls back to the original bytes untouched.
async function toScanBytes(buf, mime) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return new Uint8Array(buf);
  }
  try {
    const bmp = await createImageBitmap(new Blob([buf], { type: mime }), { imageOrientation: 'from-image' });
    const max = Math.max(bmp.width, bmp.height);
    if (max <= MAX_DIM) { bmp.close?.(); return new Uint8Array(buf); }
    const scale = MAX_DIM / max;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return new Uint8Array(buf);
  }
}

// Run OCR over an image's encoded bytes. Returns { text, lines }.
export async function scanBytes(buf, mime, onProgress) {
  await ensureEngine(onProgress);
  onProgress?.({ stage: 'scan' });
  const bytes = await toScanBytes(buf, mime);
  return JSON.parse(extract_text(bytes, ''));
}
