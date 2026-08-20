// silk worker — pure static assets for silk.mino.mobi.
//
// Everything on this surface runs client-side: the fabric, the agent, the
// metrics and the renderer are five dependency-free ES modules the browser
// imports directly. There is no build step, no D1, no KV, no AI binding and no
// secret beyond the shared Cloudflare deploy credentials. Directory paths
// resolve to their index.html through the assets binding.
//
// /health exists so the deploy workflow can prove the CUSTOM DOMAIN is bound
// rather than trusting a green run — docs/DEPLOYS.md §4. Note the shape of the
// JSON: the probe greps it, and `JSON.stringify(x, null, 2)` would emit
// `"ok": true` with a space, which is the trap plant/ documented after watching
// a healthy service report failure for two minutes.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'silk' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
