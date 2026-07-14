// moji — the emoji wiki. Thin routing worker in front of static assets.
//
// The whole site is static (index.html + emoji.html + /data/*.json). The only
// job here is pretty per-emoji permalinks: /e/<id> (id = hyphen-joined lowercase
// code points, e.g. /e/1f600, /e/1f44b-1f3fb) serves emoji.html, which reads the
// id from the path and renders client-side from /data/emoji.json. Everything
// else falls through to the ASSETS binding.
//
// No D1, no AI, no secrets — just Cloudflare Pages-style asset serving with one
// rewrite. Root-absolute asset paths in the HTML keep /e/<id> from breaking
// relative URLs.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // /e/<id> and /emoji → the detail page (client reads the id from the path)
    if (/^\/e\/[^/]+\/?$/.test(p) || p === '/emoji' || p === '/emoji/') {
      const res = await env.ASSETS.fetch(new Request(new URL('/emoji.html', url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
