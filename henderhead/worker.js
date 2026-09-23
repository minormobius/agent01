// henderhead — a thin worker behind static assets.
//
// The site is static: two pages, one WebAssembly module, and the JS that
// drives it. This worker exists for one route.
//
//   /api/demos — the shelf as JSON, so that anything wanting to know what has
//   been rebuilt (including, one day and only with consent, the pipeline
//   described on the front page) reads it from here rather than scraping the
//   HTML. It carries the consent state in the payload: whoever reads this
//   machine-side gets the constraint along with the data.
//
// Security headers are NOT set here, and it would be a mistake to move them
// here: Static Assets answers a request that matches a file without invoking
// the worker at all, so a header set in this file would reach /api/demos and
// no page on the site. `_headers` is what covers the pages — see the comment
// in it.
//
// No D1, no AI, no secrets, no state.

import { DEMOS, AUTHOR, postURL } from "./demos.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/api/demos") {
      return json({
        author: AUTHOR,
        consent: {
          asked: false,
          granted: false,
          automatedPipelineRunning: false,
          note: "No automated pipeline watches this author's feed. Nothing here is built automatically, and nothing will be until consent is asked for and given. See https://henderhead.mino.mobi/#consent",
        },
        demos: DEMOS.map((d) => ({ ...d, original: postURL(d.post) })),
      });
    }

    // Reached only for paths that match no asset; `_headers` has already
    // covered everything that does.
    return env.ASSETS.fetch(request);
  },
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      // `_headers` does not reach a worker-generated response, so this one
      // carries its own
      "x-content-type-options": "nosniff",
      ...CORS,
    },
  });
}
