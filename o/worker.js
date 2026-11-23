// o/worker.js — o.mino.mobi. Serves the static site, plus two small jobs:
//
//   /av/<did>/<cid>  An avatar thumbnail from Bluesky's CDN, re-served with CORS.
//                    The CDN sends no Access-Control-Allow-Origin, and a canvas
//                    that draws a cross-origin image without it can never be
//                    exported, so the share card would be impossible. Locked to
//                    cdn.bsky.app's avatar_thumbnail path: a DID and a CID, nothing
//                    else, so it cannot be used as an open proxy.
//
//   /<handle>        The app (single-page fallback), with the page title and
//                    link-preview title set to that handle, so a shared link
//                    reads "@alice's circle" before anyone clicks it.
//
// Everything that measures anything runs in the browser against public APIs.
// No sign-in, no secrets, no storage.

const ASSET_EXT = /\.(js|mjs|css|png|jpg|svg|ico|json|txt|html|webmanifest|map)$/i;
const HANDLE = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const DID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.-]{3,253})$/;
const CID = /^[a-z2-7]{46,100}$/;

/** `/alice.bsky.social` → `alice.bsky.social`; anything that is not a handle or DID → null. */
export function handleFromPath(path) {
  const seg = decodeURIComponent(String(path || '')).replace(/^\/+|\/+$/g, '');
  if (!seg || seg.includes('/')) return null;
  if (DID.test(seg)) return seg;
  if (ASSET_EXT.test(seg) || !HANDLE.test(seg)) return null;
  return seg.toLowerCase();
}

/** `/av/<did>/<cid>` → the thumbnail URL on Bluesky's CDN, or null. */
export function avatarPath(path) {
  const m = String(path || '').match(/^\/av\/([^/]+)\/([^/@]+)$/);
  if (!m || !DID.test(m[1]) || !CID.test(m[2])) return null;
  return `https://cdn.bsky.app/img/avatar_thumbnail/plain/${m[1]}/${m[2]}@jpeg`;
}

function harden(res, extra = {}) {
  const h = new Headers(res.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/av/')) {
      const target = avatarPath(url.pathname);
      if (!target) return new Response('not an avatar', { status: 400 });
      const up = await fetch(target, { cf: { cacheEverything: true, cacheTtl: 86400 } });
      if (!up.ok) return new Response('no avatar', { status: up.status === 404 ? 404 : 502 });
      return harden(up, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Type': up.headers.get('Content-Type') || 'image/jpeg',
      });
    }

    const res = await env.ASSETS.fetch(request);
    const who = handleFromPath(url.pathname);
    if (!who || !(res.headers.get('Content-Type') || '').includes('text/html')) return harden(res);

    // the handle was matched by a strict pattern above, so it is safe in markup
    const name = who.startsWith('did:') ? who : '@' + who;
    const title = `${name}'s circle · o.mino.mobi`;
    const set = (attr) => ({ element(el) { el.setAttribute(attr, title); } });
    return harden(new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(title); } })
      .on('meta[property="og:title"]', set('content'))
      .on('meta[name="twitter:title"]', set('content'))
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', `https://o.mino.mobi/${who}`); } })
      .transform(res));
  },
};
