// foam worker — pure static assets for foam.mino.mobi.
//
// foam is the first-person interactive space inside the rind's voronoi foam:
// the pocket generator, the walker and the shiva tools all run client-side
// (foamworld.js + app.js), so this worker just serves files. Directory paths
// resolve to their index.html via the assets binding.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'foam' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
