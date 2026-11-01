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
// genome BEFORE analysis: analysis.js throws at evaluation unless
// WORMHOLE_GENOME already exists. Getting this backwards doesn't fail a test —
// it fails the Cloudflare upload, so the deploy goes red while the code looks
// fine. Guarded by worker-imports.selftest.mjs.
import "./genome.js";
import "./analysis.js";
import "./paper.js";
import "./flora.js";
const W = globalThis.WORMHOLE;
const PAPER = globalThis.WORMHOLE_PAPER;
const GENOME = globalThis.WORMHOLE_GENOME;
const FLORA = globalThis.WORMHOLE_FLORA;

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

    // the marginalia for any paper id, as a standalone SVG (default: one
    // Letter page, 816×1056 at 96dpi, with LaTeX-ish 1in side margins)
    if (p === "/api/flora") {
      const id = url.searchParams.get("id") || "1.f";
      const field = url.searchParams.get("field") || id.split(".")[0];
      const clamp = (v, lo, hi, d) => { const n = v == null || v === "" ? NaN : Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
      const w = clamp(url.searchParams.get("w"), 200, 4000, 816), h = clamp(url.searchParams.get("h"), 200, 12000, 1056);
      const m = clamp(url.searchParams.get("margin"), 20, Math.min(w, h) / 3, Math.round(w * 0.13));
      const g = FLORA.genome(id, field, { palette: url.searchParams.get("ink"), habit: url.searchParams.get("habit") });
      if (url.searchParams.get("format") === "json") return json({ ...FLORA.describe(g), id, field });
      const out = FLORA.grow(g, { width: w, height: h, box: { x0: m, y0: m * 0.8, x1: w - m, y1: h - m * 0.8 } }, { animate: false, idPrefix: "a" });
      return new Response(out.svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400", ...CORS } });
    }

    // ---- the analysis-genome roulette at /lab, the marginalia herbarium at /flora ----
    if (p === "/lab" || p === "/lab/" || p === "/flora" || p === "/flora/") {
      const page = p.startsWith("/lab") ? "/lab" : "/flora";
      const res = await env.ASSETS.fetch(new Request(new URL(page, url.origin), request));
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
