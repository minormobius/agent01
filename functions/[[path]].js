// Host-based routing for subdomains served from the same Pages project.
// bakery.minomobi.com → /_bakery/  (committed build output)
// Everything else      → normal static asset resolution

const SUBDOMAIN_MAP = {
  'bakery.minomobi.com': '/_bakery',
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const prefix = SUBDOMAIN_MAP[url.hostname];

  if (prefix) {
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const rewritten = new URL(prefix + path, url.origin);
    const resp = await context.env.ASSETS.fetch(new Request(rewritten, context.request));
    if (resp.ok) return resp;
    // SPA fallback — serve index.html for client-side routes
    const fallback = new URL(prefix + '/index.html', url.origin);
    return context.env.ASSETS.fetch(new Request(fallback, context.request));
  }

  return context.env.ASSETS.fetch(context.request);
}
