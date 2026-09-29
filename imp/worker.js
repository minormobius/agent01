// imp — the static site, plus one rule about where model-written code may run.
//
// imp.mino.mobi serves the evaluation pages. /ab/ holds blinded build-a-bot
// sites for the A/B vote (bakeoff/buildabot/): HTML written by a model for a
// stranger's request. Code like that must never run on a *.mino.mobi origin,
// which is SAME-SITE with auth.mino.mobi — the SSO cookie (Domain=.mino.mobi,
// SameSite=Lax) rides on its fetches, and the auth worker trusts any
// *.mino.mobi origin, so a tenant page there could act as the signed-in user.
//
// So /ab/ is served ONLY from imp.minomobi.com: a different registrable domain,
// exactly as production serves tenants from minomobi.com. Cross-site, the Lax
// cookie is never sent. The pages run with a normal origin (localStorage works,
// as it does in production) under production's lab CSP, 'self' being this host.
// On imp.mino.mobi, /ab/* redirects there; on imp.minomobi.com, everything
// that is not /ab/ redirects back.
const TENANT_HOST = 'imp.minomobi.com';
const HOME_HOST = 'imp.mino.mobi';

// scripts/lib/headless.mjs CSP (production's), verbatim.
const LAB_CSP = [
  "default-src 'none'",
  "script-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' https://minomobi.com https://lab.minomobi.com 'unsafe-inline'",
  "img-src 'self' https://minomobi.com https://lab.minomobi.com data: blob: https://cdn.bsky.app",
  "font-src 'self' https://minomobi.com https://lab.minomobi.com",
  "connect-src 'self' https://minomobi.com https://lab.minomobi.com https://auth.mino.mobi https://public.api.bsky.app https://plc.directory https://*.host.bsky.network",
  "media-src 'self' https://minomobi.com https://lab.minomobi.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self' https://minomobi.com https://lab.minomobi.com",
  "frame-src 'self' https://minomobi.com https://lab.minomobi.com",
  "object-src 'none'",
].join('; ');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ab = url.pathname === '/ab' || url.pathname.startsWith('/ab/');
    if (url.hostname === TENANT_HOST && !ab) return Response.redirect(`https://${HOME_HOST}${url.pathname}${url.search}`, 302);
    if (url.hostname !== TENANT_HOST && ab) return Response.redirect(`https://${TENANT_HOST}${url.pathname}${url.search}`, 302);
    const res = await env.ASSETS.fetch(request);
    if (!ab) return res;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', LAB_CSP);
    headers.set('X-Robots-Tag', 'noindex');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
