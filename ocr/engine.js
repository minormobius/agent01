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

// Small crops get upscaled to at least this on their long edge so the
// recognition model has enough pixels to work with (a code that filled only a
// sliver of the original would otherwise be near-illegible after detection's
// internal resize).
const MIN_CROP_DIM = 1400;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Prepare the bytes to hand to the wasm decoder:
//   - rect (normalised {x,y,w,h} in 0..1): crop to just that region.
//   - upscale small crops toward MIN_CROP_DIM; downscale anything over MAX_DIM.
//   - fix EXIF orientation (the displayed <img> the user selected over is
//     oriented the same way, so the normalised rect lines up).
// Any failure (no OffscreenCanvas, decode error) falls back to whole-image
// original bytes — so OCR still runs, just without the crop/scale.
async function prepareBytes(buf, mime, rect) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return new Uint8Array(buf);
  }
  try {
    const bmp = await createImageBitmap(new Blob([buf], { type: mime }), { imageOrientation: 'from-image' });
    const W = bmp.width, H = bmp.height;

    let sx = 0, sy = 0, sw = W, sh = H;
    if (rect) {
      sx = Math.round(clamp01(rect.x) * W);
      sy = Math.round(clamp01(rect.y) * H);
      sw = Math.max(8, Math.round(clamp01(rect.w) * W));
      sh = Math.max(8, Math.round(clamp01(rect.h) * H));
      sw = Math.min(sw, W - sx);
      sh = Math.min(sh, H - sy);
    }

    const srcLong = Math.max(sw, sh);
    let scale = 1;
    if (srcLong > MAX_DIM) scale = MAX_DIM / srcLong;
    else if (rect && srcLong < MIN_CROP_DIM) scale = Math.min(MIN_CROP_DIM / srcLong, 4);

    // Nothing to do: whole image, already a sane size → use original bytes.
    if (!rect && scale === 1) { bmp.close?.(); return new Uint8Array(buf); }

    const tw = Math.max(1, Math.round(sw * scale));
    const th = Math.max(1, Math.round(sh * scale));
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
    bmp.close?.();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return new Uint8Array(buf);
  }
}

// Run OCR over an image's encoded bytes. Returns { text, lines }.
// opts: { rect?: {x,y,w,h} normalised 0..1, onProgress?: fn }
export async function scanBytes(buf, mime, opts = {}) {
  const { rect = null, onProgress = null } = opts;
  await ensureEngine(onProgress);
  onProgress?.({ stage: 'scan' });
  const bytes = await prepareBytes(buf, mime, rect);
  return JSON.parse(extract_text(bytes, ''));
}
