// fable.mino.mobi — the generative / interestingness-engine wing of mino.mobi.
// Thin Worker over a static-assets binding: it serves the site and answers a
// health probe. No D1, no secrets, no inference — every generator runs in the
// browser, deterministically from a seed.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, surface: 'fable', wings: ['puzz', 'knack', 'flux', 'gyre', 'morph', 'drift'] });
    }
    // Everything else is a static asset (the assets binding handles directory
    // index resolution, e.g. /puzz/ -> /puzz/index.html).
    return env.ASSETS.fetch(request);
  },
};
