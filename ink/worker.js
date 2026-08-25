// ink — thin assets worker.
//
// The whole surface is static and runs client-side: the simulation, the rubric
// and the renderer are all ES modules in js/. There is no build, no D1, no AI
// and no secret. The only route that is not an asset is a health probe, which
// spec.mino.mobi's live-status sweep and any uptime check can read.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'ink',
        what: 'two Fluoddity populations on one sheet, gated by fluoddity\'s interestingness rubric',
        engine: 'cpu port of fluoddity/engine.js FRAG_ENTITY (10-term Fourier rule)',
        deterministic: true,
      }, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
