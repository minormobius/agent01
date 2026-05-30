// Single-worker entrypoint for the photo.mino.mobi deploy. Cloudflare picks
// up `_worker.js` from the publish directory as the request handler, and
// `env.ASSETS.fetch(request)` is the canonical fall-through to the static
// assets the Vite build produces (dist/).
//
// The only custom route is /api/img — a same-origin image proxy used by the
// orb (and anything else that needs canvas/WebGPU access to cross-origin
// Bluesky images). cdn.bsky.app appears to Origin-check cross-origin browser
// fetches and returns 403; server-side fetch doesn't send a browser Origin
// header, so the upstream returns 200, and we re-emit with permissive CORS
// so canvas/WebGPU can read the bytes.

const ALLOWED_HOST_SUFFIXES = ['.bsky.app', '.bsky.network'];
const PROXY_VERSION = 'orb-img-proxy-v3-worker';

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/img') return handleImgProxy(request);
    // Everything else: serve the Vite build output as-is.
    return env.ASSETS.fetch(request);
  },
};
