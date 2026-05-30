// splice — SpliceCraft web-port planning surface (splice.mino.mobi)
//
// Minimal Worker, deployed "like rite": a static plan page is served by the
// ASSETS binding; this Worker only handles /api/health so the deploy workflow
// can confirm the edge is live. No D1, no AI, no cron — yet. As the port grows
// (primer3 WASM spike, etc.) this is where the JSON surface would attach.

const VERSION = '2026-05-29';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ ok: true, service: 'splice', version: VERSION }),
        { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
      );
    }

    // Everything else is a static asset served by the ASSETS layer before the
    // Worker is even invoked; reaching here means an unknown non-asset path.
    return new Response('Not found', { status: 404 });
  },
};
