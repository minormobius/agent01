// fin.mino.mobi — surface worker.
//
// Serves two static apps and a backend API:
//   /            -> speculative-feedback playground (TS SPA, dist/index.html)
//   /pm, /pm/*   -> personal-finance planning SPA   (dist/pm/index.html)
//   /api/*       -> backend (experiment store in D1 + real-data proxies)
//
// Backend (M2):
//   GET    /api/health
//   GET    /api/btc/candles?days=N     -> real BTC daily OHLCV (Coinbase proxy, cached)
//   GET    /api/kalshi/btc             -> open Kalshi KXBTC markets (public proxy)
//   GET    /api/pm/snapshots?market=&limit=  -> accrued real PM snapshots (D1)
//   POST   /api/runs                   -> persist a RunRecord
//   GET    /api/runs?limit=N           -> list recent runs
//   GET    /api/runs/:id               -> one run
//   DELETE /api/runs/:id               -> delete one run
// Cron (hourly): snapshot BTC spot + Kalshi BTC implied probs into spec_pm_snapshots.
//
// Everything under /api is isolated by try/catch so a backend hiccup can never
// take down asset serving or the procedural client fallback.

const COINBASE = "https://api.exchange.coinbase.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (err) {
        return json({ error: "internal", detail: String(err && err.message ? err.message : err) }, 500);
      }
    }

    // Static assets with subtree-aware SPA fallback.
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    const indexPath =
      pathname === "/pm" || pathname.startsWith("/pm/") ? "/pm/index.html" : "/index.html";
    const indexRes = await env.ASSETS.fetch(new Request(new URL(indexPath, url.origin), request));
    return new Response(indexRes.body, { status: 200, headers: indexRes.headers });
  },

  // Hourly: accrue a real PM snapshot. Liquid daily BTC PM history isn't freely
  // backfillable, so we build it forward.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(snapshotPm(env).catch(() => {}));
  },
};

async function handleApi(request, env, _ctx, url) {
  const { pathname, searchParams } = url;
  const method = request.method;

  if (pathname === "/api/health") {
    return json({ ok: true, surface: "fin", milestone: "m2", db: !!env.DB, ts: Date.now() });
  }

  // --- real BTC daily OHLCV (Coinbase) ---
  if (pathname === "/api/btc/candles") {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    // Coinbase returns up to 300 daily candles: [time, low, high, open, close, volume], newest first.
    const r = await fetch(`${COINBASE}/products/BTC-USD/candles?granularity=86400`, {
      headers: { "User-Agent": "fin.mino.mobi/speclab", accept: "application/json" },
    });
    if (!r.ok) return json({ error: "coinbase", status: r.status }, 502);
    const rows = await r.json();
    const candles = (Array.isArray(rows) ? rows : [])
      .map((c) => ({ t: c[0], low: c[1], high: c[2], open: c[3], close: c[4], volume: c[5] }))
      .sort((a, b) => a.t - b.t);
    const out = json({ symbol: "BTC-USD", source: "coinbase", candles });
    out.headers.set("Cache-Control", "public, max-age=3600");
    await cache.put(cacheKey, out.clone());
    return out;
  }

  // --- Kalshi open BTC markets (public) ---
  if (pathname === "/api/kalshi/btc") {
    const r = await fetch(`${KALSHI}/markets?series_ticker=KXBTC&status=open&limit=100`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return json({ error: "kalshi", status: r.status }, 502);
    const data = await r.json();
    return json({ source: "kalshi", markets: (data && data.markets) || [] });
  }

  // --- accrued PM snapshots (D1) ---
  if (pathname === "/api/pm/snapshots") {
    if (!env.DB) return json({ snapshots: [], note: "no DB binding" });
    const market = searchParams.get("market");
    const limit = Math.min(5000, Number(searchParams.get("limit") || 2000));
    const q = market
      ? env.DB.prepare(
          "SELECT ts, market, asset_price, strike, implied_prob, close_time FROM spec_pm_snapshots WHERE market = ? ORDER BY ts ASC LIMIT ?",
        ).bind(market, limit)
      : env.DB.prepare(
          "SELECT ts, market, asset_price, strike, implied_prob, close_time FROM spec_pm_snapshots ORDER BY ts DESC LIMIT ?",
        ).bind(limit);
    const { results } = await q.all();
    return json({ snapshots: results || [] });
  }

  // --- experiment store ---
  if (pathname === "/api/runs") {
    if (!env.DB) return json({ runs: [], note: "no DB binding" });
    if (method === "POST") {
      const rec = await request.json();
      if (!rec || !rec.id) return json({ error: "missing run record" }, 400);
      const m = rec.metrics || {};
      await env.DB.prepare(
        `INSERT OR REPLACE INTO spec_runs
         (id, created_at, model, dataset_id, dataset_label, contract_version,
          brier_model, brier_pm, sharpe, total_return, abstain_rate, exogeneity_score, payload)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          rec.id,
          rec.createdAt || new Date().toISOString(),
          rec.modelName || "",
          rec.datasetId || "",
          rec.datasetLabel || "",
          rec.contractVersion || "",
          numOrNull(m.brierModel),
          numOrNull(m.brierPm),
          numOrNull(m.sharpe),
          numOrNull(m.totalReturn),
          numOrNull(m.abstainRate),
          numOrNull(m.exogeneityScore),
          JSON.stringify(rec),
        )
        .run();
      return json({ ok: true, id: rec.id });
    }
    // GET list
    const limit = Math.min(100, Number(searchParams.get("limit") || 50));
    const { results } = await env.DB.prepare(
      "SELECT payload FROM spec_runs ORDER BY created_at DESC LIMIT ?",
    )
      .bind(limit)
      .all();
    const runs = (results || []).map((r) => safeParse(r.payload)).filter(Boolean);
    return json({ runs });
  }

  const runMatch = pathname.match(/^\/api\/runs\/([\w-]+)$/);
  if (runMatch) {
    if (!env.DB) return json({ error: "no DB binding" }, 503);
    const id = runMatch[1];
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM spec_runs WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    const row = await env.DB.prepare("SELECT payload FROM spec_runs WHERE id = ?").bind(id).first();
    if (!row) return json({ error: "not found" }, 404);
    return json(safeParse(row.payload));
  }

  return json({ error: "not_found", path: pathname }, 404);
}

// Hourly snapshot: BTC spot + Kalshi BTC market-implied probabilities -> D1.
async function snapshotPm(env) {
  if (!env.DB) return;
  const ts = new Date().toISOString();
  const tickerRes = await fetch(`${COINBASE}/products/BTC-USD/ticker`, {
    headers: { "User-Agent": "fin.mino.mobi/speclab", accept: "application/json" },
  });
  const spot = tickerRes.ok ? Number((await tickerRes.json()).price) : null;

  const mr = await fetch(`${KALSHI}/markets?series_ticker=KXBTC&status=open&limit=100`, {
    headers: { accept: "application/json" },
  });
  if (!mr.ok) return;
  const markets = ((await mr.json()).markets || []).slice(0, 50);

  const stmts = markets.map((mk) => {
    const bid = numOrNull(mk.yes_bid);
    const ask = numOrNull(mk.yes_ask);
    const mid = bid != null && ask != null ? (bid + ask) / 2 / 100 : null;
    const strike = numOrNull(mk.cap_strike ?? mk.floor_strike ?? mk.strike);
    return env.DB.prepare(
      `INSERT INTO spec_pm_snapshots
       (ts, source, market, asset_symbol, asset_price, strike, implied_prob, close_time, raw)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(ts, "kalshi", mk.ticker || "", "BTC-USD", spot, strike, mid, mk.close_time || null, JSON.stringify(mk));
  });
  if (stmts.length) await env.DB.batch(stmts);
}

function numOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
