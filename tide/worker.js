// tide worker — pure static assets for tide.mino.mobi.
//
// tide is the THERMODYNAMICS wing of the O'Neill cylinder modelling package: the
// radial atmosphere column (temperature / humidity / CO₂ vs altitude), the fog
// optics, the fountain + linear-sun azimuthal cross-section, and the water/energy
// ledger that closes across them. Every model is deterministic client-side JS, so
// this worker just serves files. Directory paths resolve to their index.html via
// the assets binding.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'tide' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
