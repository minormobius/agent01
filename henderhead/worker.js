// henderhead — a thin worker in front of static assets.
//
// The site is static: two pages, one WebAssembly module, and the JS that
// drives it. This worker exists for two reasons only.
//
//   1. Headers. The asset layer will not set a Content-Security-Policy for us,
//      and this site has no reason to load anything from anywhere: no
//      analytics, no fonts, no CDN. Saying so in a header is the difference
//      between meaning it and claiming it.
//   2. /api/demos — the shelf as JSON, so that anything wanting to know what
//      has been rebuilt (including, one day and only with consent, the
//      pipeline described on the front page) reads it from here rather than
//      scraping the HTML.
//
// No D1, no AI, no secrets, no state.

import { DEMOS, AUTHOR, postURL } from "./demos.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

// Everything this site needs is same-origin. 'wasm-unsafe-eval' is what lets
// the browser compile cffourier.wasm; without it the engine will not start.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/api/demos") {
      return json({
        author: AUTHOR,
        // Stated in the payload as well as on the page: whoever reads this
        // machine-side should get the constraint along with the data.
        consent: {
          asked: false,
          granted: false,
          automatedPipelineRunning: false,
          note: "No automated pipeline watches this author's feed. Nothing here is built automatically, and nothing will be until consent is asked for and given. See https://henderhead.mino.mobi/#consent",
        },
        demos: DEMOS.map((d) => ({ ...d, original: postURL(d.post) })),
      });
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", CSP);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    return new Response(res.body, { status: res.status, headers });
  },
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", ...CORS },
  });
}
