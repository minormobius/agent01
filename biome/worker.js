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

    return env.ASSETS.fetch(request);
  },
};
