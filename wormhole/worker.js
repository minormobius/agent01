// wormhole — thin routing worker in front of static assets.
//
// The site is fully static (index.html + engine.js + graph.js + styles.css); the
// engine runs client-side. This worker does two things:
//   1. Pretty permalinks: /f/<seed> serves index.html, which reads the seed from
//      the path and renders the field client-side.
//   2. A public JSON API (CORS-open, pure compute) for anyone who wants the raw
//      dossier: /api/field?seed=…, /api/roulette (a random field), /api/health.
//
// No D1, no AI, no secrets. Root-absolute asset paths in the HTML keep /f/<seed>
// from breaking relative URLs.

import "./engine.js";
import "./stats.js";
import "./charts.js";
import "./dataset.js";
import "./analysis.js";
import "./genome.js";
import "./paper.js";
const W = globalThis.WORMHOLE;
const PAPER = globalThis.WORMHOLE_PAPER;
const GENOME = globalThis.WORMHOLE_GENOME;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String((a[0] % 900000000) + 1);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    // ---- API ----
    if (p === "/api/health") {
      return json({ ok: true, service: "wormhole", subjects: W.SUBJECTS.length, modifiers: W.MODIFIERS.length });
    }
    if (p === "/api/field") {
      const seed = url.searchParams.get("seed") || "1";
      return json({ ...W.generate(seed), _disclaimer: "Generated fiction. Not a real field, paper, or grant." });
    }
    if (p === "/api/roulette") {
      const seed = randomSeed();
      return json({ ...W.generate(seed), _disclaimer: "Generated fiction. Not a real field, paper, or grant." });
    }
    if (p === "/api/paper") {
      const id = url.searchParams.get("id") || "1.f";
      return json(PAPER.generate(id));
    }
    if (p === "/api/genome") {
      return json({ dataTypes: GENOME.DATA_TYPES, answerTypes: GENOME.ANSWER_TYPES, techniques: GENOME.TECHNIQUES, matrix: GENOME.matrix() });
    }
    if (p === "/api/technique") {
      const id = url.searchParams.get("id") || GENOME.ids()[0];
      const seed = url.searchParams.get("seed") || "1";
      return json(GENOME.run(id, seed));
    }

    // ---- the analysis-genome roulette at /lab ----
    if (p === "/lab" || p === "/lab/") {
      const res = await env.ASSETS.fetch(new Request(new URL("/lab", url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), "content-type": "text/html; charset=utf-8" },
      });
    }

    // ---- pretty permalink: /f/<seed> → index.html ----
    if (/^\/f\/[^/]+\/?$/.test(p)) {
      const res = await env.ASSETS.fetch(new Request(new URL("/", url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), "content-type": "text/html; charset=utf-8" },
      });
    }

    // ---- pretty permalink: /p/<id> → paper.html (id may contain a dot) ----
    if (/^\/p\/[^/]+\/?$/.test(p)) {
      const res = await env.ASSETS.fetch(new Request(new URL("/paper", url.origin), request));
      return new Response(res.body, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), "content-type": "text/html; charset=utf-8" },
      });
    }

    // ---- everything else: static assets ----
    return env.ASSETS.fetch(request);
  },
};
