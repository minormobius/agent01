// Image proxy for the orb (and anything else that needs canvas/WebGPU access
// to cross-origin Bluesky images). cdn.bsky.app appears to Origin-check
// cross-origin fetches and returns 403; loading via plain <img src> works,
// but reading the bytes for canvas/WebGPU requires CORS, which is what this
// route provides.
//
// Usage:
//   GET /api/img                                — alive check, returns 400 JSON
//   GET /api/img?u=<encoded original URL>       — proxied image bytes
//
// Locked to *.bsky.app and *.bsky.network hosts so this can't be turned
// into an open proxy for arbitrary content. Cached at the edge for a day.

const ALLOWED_HOST_SUFFIXES = ['.bsky.app', '.bsky.network'];
const PROXY_VERSION = 'orb-img-proxy-v2';

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

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
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
  const ok = ALLOWED_HOST_SUFFIXES.some(s => host === s.slice(1) || host.endsWith(s));
  if (!ok) {
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
  // Tag every proxied response so a `curl -I` reveals whether the function
  // is in the path — distinct from a 200/404 served by the assets handler.
  headers.set('x-orb-proxy', PROXY_VERSION);

  return new Response(upstream.body, { status: upstream.status, headers });
}
