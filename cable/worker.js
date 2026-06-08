// cable — progressive cable-drawing solver. Pure static site; this worker only
// serves the assets with a couple of hardening headers. No D1, no AI, no secrets.
// The whole solver runs client-side (catalog.js → solver.js → drawing.js → app.js),
// so there is nothing to do server-side beyond handing over files.

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const out = new Headers(res.headers);
    out.set("X-Content-Type-Options", "nosniff");
    out.set("Referrer-Policy", "strict-origin-when-cross-origin");
    out.set("X-Frame-Options", "SAMEORIGIN");
    return new Response(res.body, { status: res.status, headers: out });
  },
};
