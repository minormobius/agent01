// atlas — thin routing worker in front of static assets.
//
// The site is static (index.html + /lib/*.js + /geo/*.json + /data/*.json).
// Routing does two things:
//   /sources, /method            → their pages, served at extensionless paths
//   /geo/*, /data/*              → assets, with a long cache: these files are
//                                  rebuilt by the ETL and redeployed, never
//                                  edited in place, so they are safe to pin.
// The assets layer 307-redirects '/sources.html' to '/sources', so the detail
// pages are fetched by their canonical path and the redirect never reaches the
// browser.

const PAGES = { '/sources': '/sources', '/method': '/method' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/$/, '') || '/';

    if (PAGES[p]) {
      const res = await env.ASSETS.fetch(new Request(new URL(PAGES[p], url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const res = await env.ASSETS.fetch(request);
    if (/^\/(geo|data)\//.test(p) && res.status === 200) {
      const headers = new Headers(res.headers);
      headers.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
};
