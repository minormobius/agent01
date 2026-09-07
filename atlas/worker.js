// atlas — thin routing worker in front of static assets.
//
// The site is static (index.html + /lib/*.js + /geo/*.json + /data/*.json), and
// Workers Static Assets serves any matching asset WITHOUT invoking this worker.
// So the worker has exactly one job: the two extensionless detail pages, which
// are not asset paths and therefore do fall through to here.
//
// Caching for /geo and /data lives in `_headers`, NOT here — a cache-control
// header set in this file would never reach an asset request, because this file
// never runs for one. That was found by checking the response on the live
// origin rather than by reading the config.
//
// The assets layer 307-redirects '/sources.html' to '/sources', so the pages are
// fetched by their canonical path and the redirect never reaches the browser.

const PAGES = new Set(['/sources', '/method']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/$/, '') || '/';

    if (PAGES.has(p)) {
      const res = await env.ASSETS.fetch(new Request(new URL(p, url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
