// fold — fold.mino.mobi. Thin worker in front of static assets.
//
// The site is entirely static: one HTML file, four ES modules, a 55 KB wasm
// engine and a 16 KB coordinate set. There is no API, no D1, no secrets and
// nothing user-supplied ever reaches this worker.
//
// Note that Workers Static Assets serves a request matching an asset DIRECTLY,
// without invoking this worker — so the headers that actually apply to nearly
// every request come from `_headers`, not from here. This exists for the
// requests that miss, and to keep the wasm content type correct on hosts that
// would otherwise guess.

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
