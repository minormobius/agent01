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

    // The lexicon web shipped at /lexicon/ for about an hour before moving to
    // the shorter /word/. Almost nobody can have that link, but a URL that was
    // once live and now 404s is the kind of small breakage that is free to
    // avoid and annoying to discover later. 301, because the move is permanent.
    if (url.pathname === '/lexicon' || url.pathname === '/lexicon/') {
      return Response.redirect(new URL('/word/', url).toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
