// unit — the converter. Thin routing worker in front of static assets.
//
// The site is static (index.html + reference.html + /lib/*.js). Routing:
//   /reference, /tables         → reference.html
//   /<category>[/<from>/<to>]   → index.html (client reads state from the path)
//   /lib/*, /data/*, *.ext, /   → assets
//
// We fetch the detail asset by its canonical extensionless path ('/reference') —
// the assets layer 307-redirects '/reference.html' to '/reference', so fetching
// the .html directly would pass that redirect through to the browser.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const seg = p.split('/').filter(Boolean);

    // reference page
    if (p === '/reference' || p === '/reference/' || p === '/tables' || p === '/tables/') {
      return html(await env.ASSETS.fetch(new Request(new URL('/reference', url.origin), request)));
    }

    // converter deep links: /<category> or /<category>/<from>/<to>
    // (skip anything that looks like an asset: has a dot, or is lib/data)
    const isAsset = p === '/' || seg[0] === 'lib' || seg[0] === 'data' || seg[seg.length - 1]?.includes('.');
    if (!isAsset && (seg.length === 1 || seg.length === 3)) {
      return html(await env.ASSETS.fetch(new Request(new URL('/', url.origin), request)));
    }

    return env.ASSETS.fetch(request);
  },
};

function html(res) {
  return new Response(res.body, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
  });
}
