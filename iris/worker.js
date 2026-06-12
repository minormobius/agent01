// iris worker — pure static assets for iris.mino.mobi.
//
// iris is the END-ON cross-section view of an O'Neill cylinder: a circle you switch gradient
// views over (temperature / pressure / humidity / wind), with toggleable fog and fountain
// jets, the inner-rim ratchet topography, and the reservoir + heat-pipe path that carries the
// habitat's heat out to the radiator skin. Every model is deterministic client-side JS, so
// this worker just serves files. Directory paths resolve to their index.html via the assets
// binding.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'iris' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
