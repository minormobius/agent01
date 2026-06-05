// Worker entry for ocr.mino.mobi (and, once registered, ocr.ascential.work).
//
// Standalone OCR tool: drop an image, get the text (e.g. an activation code)
// out. All OCR runs client-side in Rust/WASM (wasm/codescan_ocr*, built from
// os/crates/codescan-ocr). The worker only does two things:
//
//   1. /api/model — same-origin proxy for the two ocrs model files. They live
//      in an S3 bucket that sends no CORS headers, so the browser can't fetch
//      them directly; we proxy them here and let the edge cache the (immutable)
//      bytes. Whitelisted names only.
//   2. everything else — serve the static assets (index.html, app.js, wasm,
//      styles). `not_found_handling: single-page-application` in wrangler.jsonc
//      makes unknown paths fall back to index.html.

const OCRS_MODELS = {
  'text-detection': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten',
  'text-recognition': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten',
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function handleModelProxy(request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  const target = OCRS_MODELS[name];
  if (!target) {
    return jsonResponse({ ok: false, error: 'unknown model', allowed: Object.keys(OCRS_MODELS) }, 400);
  }

  const upstream = await fetch(target, { cf: { cacheTtl: 31536000, cacheEverything: true } });
  if (!upstream.ok) {
    return jsonResponse({ ok: false, error: `upstream ${upstream.status}` }, 502);
  }

  const headers = new Headers();
  headers.set('content-type', 'application/octet-stream');
  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('content-length', cl);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  return new Response(upstream.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/model') return handleModelProxy(request);
    return env.ASSETS.fetch(request);
  },
};
