// uni — the Unicode browser. Thin routing worker in front of static assets.
//
// The whole site is static (index.html + block.html + char.html + /data/*.json
// + /lib/uni.js). This worker only does pretty permalinks:
//   /b/<slug>  → block.html   (block grid, e.g. /b/basic-latin)
//   /c/<hex>   → char.html    (character detail, e.g. /c/1F600)
// The client reads the slug / hex from the path and renders from the data files.
// Everything else falls through to the ASSETS binding.
//
// We fetch the asset by its canonical extensionless path ('/block', '/char') —
// the assets layer 307-redirects '/block.html' to '/block', so fetching the
// .html directly would pass that redirect through to the browser.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    let target = null;
    if (/^\/b\/[^/]+\/?$/.test(p)) target = '/block';
    else if (/^\/c\/[^/]+\/?$/.test(p)) target = '/char';
    else if (p === '/monster' || p === '/monster/') target = '/monster';

    if (target) {
      const res = await env.ASSETS.fetch(new Request(new URL(target, url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
