// biome worker — pure static assets for biome.mino.mobi.
//
// The habitat resource-cycle suite is entirely client-side: every module's model
// runs in the browser (the box model is deterministic JS, no server compute), so
// this worker just serves files. Directory paths like /cycles/ resolve to their
// index.html via the assets binding's default not-found handling.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'biome' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Pretty endpoints: normalise the no-slash form so the advertised URLs serve the page
    // rather than a 404 (Cloudflare's asset handler resolves the trailing-slash dir index).
    if (url.pathname === '/graph' || url.pathname === '/gacha' || url.pathname === '/sprite' || url.pathname === '/balance' || url.pathname === '/inat') {
      url.pathname += '/';
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
