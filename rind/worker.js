// rind worker — pure static assets for rind.mino.mobi.
//
// rind is the STRUCTURE wing of the O'Neill cylinder modelling package: the foam
// rind itself — the layered, braced, navigable space-frame that is the cylinder's
// shell — plus the Rust/WASM frame solver that scores it. Everything runs in the
// browser (geometry generation in JS, structural scoring in an optional WASM
// solver with a JS-free fallback), so this worker just serves files. Directory
// paths resolve to their index.html via the assets binding.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'rind' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
