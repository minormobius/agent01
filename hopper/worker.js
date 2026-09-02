// hopper — thin routing worker in front of static assets.
//
// The game is fully static: index.html + js/*.js; the bismuth engine and the
// level's survey run client-side. This worker does two things:
//   1. Pretty permalinks: /l/<n> serves index.html, which reads the level
//      from the path.
//   2. A small JSON API (CORS-open, pure compute): /api/level?n=… returns a
//      level's slab, packs, and — after running the survey — its bucket;
//      /api/health. The same engine module the page runs, so the API and the
//      page agree brick for brick.
//
// No D1, no AI, no secrets. Root-absolute asset paths in the HTML keep
// /l/<n> from breaking relative URLs.

import { level, survey, bucketOf, normalizeLevel, slabTop } from "./js/level.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (p === "/api/health") {
      return json({ ok: true, service: "hopper", disclaimer: "Generated levels. Level numbers are permanent." });
    }
    if (p === "/api/level") {
      const n = normalizeLevel(url.searchParams.get("n") || "1");
      const lv = level(n);
      // the survey is a few seconds of CPU on a high level; the bucket is
      // only computed on request
      const withBucket = url.searchParams.get("bucket") === "1";
      let bucket = null, reach = null;
      if (withBucket) { reach = survey(lv).reach; bucket = bucketOf(lv, reach); }
      return json({ level: lv, slabTop: slabTop(lv), bucket, reach, _note: "bucket needs &bucket=1 (runs the survey: the engine stacks the packs to the end)" });
    }

    // ── level permalinks → index.html ──
    if (/^\/l\/\d+\/?$/.test(p)) {
      // "/" not "/index.html": the assets layer 307s /index.html to / and the level would be lost
      const res = await env.ASSETS.fetch(new Request(new URL("/", url.origin), request));
      return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
    }
    // ── everything else: static assets ──
    const res = await env.ASSETS.fetch(request);
    return new Response(res.body, { status: res.status, headers: withHeaders(res.headers) });
  },
};

function withHeaders(h) {
  const out = new Headers(h);
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
}
