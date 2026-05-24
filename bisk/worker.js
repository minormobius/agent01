// bisk — the SimCluster daily digest (bisk.mino.mobi)
//
// Static site served from the ASSETS binding. The digest data under
// /data/*.json is computed daily by scripts/build-bisk-digest.mjs in a
// GitHub Action and committed to the repo, so the worker itself is a thin
// asset server with a health check.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, site: 'bisk' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
