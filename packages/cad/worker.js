// cad — cad.mino.mobi. Thin worker in front of static assets.
//
// The site is static: one HTML file, the ES modules, the 1.7 MB Rust engine
// and the 0.5 MB Manifold module. No API, no D1, no secrets, nothing
// user-supplied reaches this worker. Workers Static Assets serves an asset
// match directly without invoking this — the headers that apply come from
// `_headers`; this exists for misses and to keep the wasm content type right.

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (new URL(request.url).pathname.endsWith('.wasm')) {
      const headers = new Headers(res.headers);
      headers.set('content-type', 'application/wasm');
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
};
