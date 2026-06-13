// Worker entry for photo.mino.mobi.
//
// photo is deployed as a Cloudflare Worker with an assets binding (see
// wrangler.jsonc — `main: "worker.js"`, `assets: { directory: "./dist",
// binding: "ASSETS" }`). The worker handles its own routing — currently
// only /api/img — and falls through to `env.ASSETS.fetch(request)` for
// everything else, which serves the Vite build output as static files
// (the React app at /, plus the static /orb, /astro, /prism, /fractal,
// and /vendor trees).
//
// Earlier attempts to put this code at functions/api/img.js (Pages
// Functions) or public/_worker.js (Pages _worker.js convention) didn't
// work — neither convention is honored by Workers-with-assets, which is
// what this deploy actually uses. The error
//   "Uploading a Pages _worker.js file as an asset"
// from wrangler is the giveaway: _worker.js is for Pages, not Workers.
//
// /api/dm/post is the backend for the /dm group-chat picture sender — it
// posts an uploaded image as the morphyx service account and DMs it into
// morphyx's group chat. See dm-worker.js for the full flow.
//
// /api/img is a same-origin image proxy used by the orb (and anything
// else needing canvas/WebGPU access to cross-origin Bluesky images).
// cdn.bsky.app appears to Origin-check cross-origin browser fetches and
// returns 403; server-side fetch doesn't send a browser Origin header,
// so the upstream returns 200, and we re-emit with permissive CORS so
// canvas/WebGPU can read the bytes.

import { handleDmPost, handleDmConvos } from './dm-worker.js';

const ALLOWED_HOST_SUFFIXES = ['.bsky.app', '.bsky.network'];
const PROXY_VERSION = 'orb-img-proxy-v4-worker-main';

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  });
}

async function handleImgProxy(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'accept',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, proxy: PROXY_VERSION, error: 'GET only' }, 405);
  }

  const target = url.searchParams.get('u');
  if (!target) {
    return jsonResponse({
      ok: false,
      proxy: PROXY_VERSION,
      message: 'image proxy is alive · pass ?u=<encoded URL> to fetch',
    }, 400);
  }

  let tgt;
  try { tgt = new URL(target); }
  catch { return jsonResponse({ ok: false, proxy: PROXY_VERSION, error: 'bad url' }, 400); }
  if (tgt.protocol !== 'https:') {
    return jsonResponse({ ok: false, proxy: PROXY_VERSION, error: 'https only' }, 400);
  }
  const host = tgt.hostname.toLowerCase();
  const allowed = ALLOWED_HOST_SUFFIXES.some(s => host === s.slice(1) || host.endsWith(s));
  if (!allowed) {
    return jsonResponse({ ok: false, proxy: PROXY_VERSION, error: 'host not allowed: ' + host }, 403);
  }

  const upstream = await fetch(tgt.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true },
    headers: { 'accept': request.headers.get('accept') || 'image/*' },
  });

  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('content-length', cl);
  headers.set('cache-control', 'public, max-age=86400, immutable');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET');
  headers.set('x-orb-proxy', PROXY_VERSION);

  return new Response(upstream.body, { status: upstream.status, headers });
}

// /api/model — same-origin proxy for the ocrs OCR models used by /codescan.
// The models live in an S3 bucket that sends no CORS headers, so the browser
// can't fetch them directly; we proxy them same-origin and let Cloudflare's
// edge cache the (immutable) bytes. Whitelisted names only.
const OCRS_MODELS = {
  'text-detection': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten',
  'text-recognition': 'https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten',
};

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
    if (url.pathname === '/api/img') return handleImgProxy(request);
    if (url.pathname === '/api/model') return handleModelProxy(request);
    if (url.pathname === '/api/dm/convos') return handleDmConvos(request, env);
    if (url.pathname === '/api/dm/post') return handleDmPost(request, env);
    // Everything else: serve the Vite build output as-is.
    return env.ASSETS.fetch(request);
  },
};
