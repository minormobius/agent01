// bismuth — thin routing worker in front of static assets.
//
// The site is fully static: index.html + js/*.js, the growth engine runs
// client-side. This worker does two things:
//   1. Pretty permalinks: /c/<seed> serves index.html, which reads the seed
//      from the path and grows the crystal in the browser.
//   2. A public JSON API (CORS-open, pure compute) for anyone who wants the
//      raw brick list: /api/crystal?seed=…[&n=…], /api/genome?seed=…,
//      /api/health. The same engine module the page runs, so the API and the
//      page agree brick for brick.
//
// No D1, no AI, no secrets. Root-absolute asset paths in the HTML keep
// /c/<seed> from breaking relative URLs.

import { Growth } from "./js/crystal.js";
import { genome, normalizeSeed } from "./js/genome.js";

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

// A full crystal is a few seconds of CPU; the default cap keeps a casual
// request cheap. `n` is the number of bricks (nucleus included) to grow to;
// `full=1` grows to the end. Deterministic either way — the first n bricks
// of a crystal are the same however far you grow it.
const DEFAULT_N = 3000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (p === "/api/health") {
      return json({ ok: true, service: "bismuth", grid: genome(1).grid, disclaimer: "Generated crystals. Seeds are permanent." });
    }
    if (p === "/api/genome") {
      const seed = normalizeSeed(url.searchParams.get("seed") || "1");
      return json(genome(seed));
    }
    if (p === "/api/crystal") {
      const seed = normalizeSeed(url.searchParams.get("seed") || "1");
      const full = url.searchParams.get("full") === "1";
      const nParam = parseInt(url.searchParams.get("n") || "", 10);
      const g = new Growth(seed);
      const n = full ? Infinity : (Number.isFinite(nParam) && nParam > 0 ? Math.min(nParam, 20000) : DEFAULT_N);
      while (!g.done && g.bricks.length < n) g.step();
      return json({
        seed,
        genome: g.genome,
        complete: g.done,
        ticks: g.tick,
        bricks: g.bricks.map((b) => [b.x, b.y, b.z, b.t, b.m]),
        stats: g.done ? g.stats() : null,
        _format: "bricks are [x, y, z, tick, mason] in laying order; mason -1 is the nucleus",
      });
    }

    // ── crystal permalinks → index.html ──
    if (/^\/c\/\d+\/?$/.test(p)) {
      // "/" not "/index.html": the assets layer 307s /index.html to / and the seed would be lost
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
