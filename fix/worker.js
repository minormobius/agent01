// fix — the FIX message parser. Thin routing worker in front of static assets.
//
// The whole site is static (index.html + field.html + msg.html + /data/*.json +
// /lib/fix.js). This worker only does pretty permalinks:
//   /f/<tag>   → field.html   (field reference, e.g. /f/54, /f/453)
//   /m/<code>  → msg.html      (message reference, e.g. /m/D, /m/8)
// The client reads the tag / code from the path and renders from the data files.
// Everything else falls through to the ASSETS binding.
//
// We fetch the asset by its canonical extensionless path ('/field', '/msg') —
// the assets layer 307-redirects '/field.html' to '/field', so fetching the
// .html directly would pass that redirect through to the browser.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    let target = null;
    if (/^\/f\/\d+\/?$/.test(p)) target = '/field';
    else if (/^\/m\/[^/]+\/?$/.test(p)) target = '/msg';

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
