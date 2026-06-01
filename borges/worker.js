// borges — the Book of Sand. Worker entry: pretty per-tale permalinks, then
// static assets. /t/<n> (the Tabard permalink a teller posts before telling)
// and /tale resolve to tale.html, which reads the page number from the URL and
// generates the tale client-side. Everything else falls through to the asset
// store ("/" → index.html, the General Prologue).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // Tale permalinks: /t/1729, /t/1729/, /tale, /tale?n=1729
    if (/^\/t\/\d+\/?$/.test(p) || p === "/tale" || p === "/tale/") {
      const res = await env.ASSETS.fetch(new Request(new URL("/tale.html", url.origin), request));
      // serve with the original URL's caching but as tale.html content
      return new Response(res.body, {
        status: res.status,
        headers: withHeaders(res.headers),
      });
    }

    const res = await env.ASSETS.fetch(request);
    return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
  },
};

function withHeaders(h) {
  const out = new Headers(h);
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
}
