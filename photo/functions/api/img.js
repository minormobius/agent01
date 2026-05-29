// Image proxy for the orb (and anything else that needs canvas/WebGPU access
// to cross-origin Bluesky images). cdn.bsky.app appears to Origin-check
// cross-origin fetches and returns 403; loading via plain <img src> works,
// but reading the bytes for canvas/WebGPU requires CORS, which is what this
// route provides.
//
// Usage: GET /api/img?u=<encoded original URL>
//
// Locked to *.bsky.app and *.bsky.network hosts so this can't be turned
// into an open proxy for arbitrary content. Cached at the edge for a day.

const ALLOWED_HOST_SUFFIXES = ['.bsky.app', '.bsky.network'];

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get('u');
  if (!target) return new Response('missing ?u=', { status: 400 });

  let tgt;
  try { tgt = new URL(target); } catch { return new Response('bad url', { status: 400 }); }
  if (tgt.protocol !== 'https:') return new Response('https only', { status: 400 });
  const host = tgt.hostname.toLowerCase();
  const ok = ALLOWED_HOST_SUFFIXES.some(s => host === s.slice(1) || host.endsWith(s));
  if (!ok) return new Response('host not allowed', { status: 403 });

  // Use Cloudflare's edge cache. The same image will be hit many times across
  // visitors so caching saves a round-trip to the origin.
  const upstream = await fetch(tgt.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true },
    headers: {
      // Don't pass through credentials; do pass an accept so the CDN knows
      // we want the image variant it published.
      'accept': request.headers.get('accept') || 'image/*',
    },
  });

  // Mirror upstream status + body but force CORS-friendly headers.
  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('content-length', cl);
  headers.set('cache-control', 'public, max-age=86400, immutable');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET');

  return new Response(upstream.body, { status: upstream.status, headers });
}
