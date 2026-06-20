// fin.mino.mobi — surface worker.
//
// Two static apps share this surface, plus a reserved backend API:
//   /            -> speculative-feedback playground (TS SPA, dist/index.html)
//   /pm, /pm/*   -> personal-finance planning SPA   (dist/pm/index.html)
//   /api/*       -> backend (experiment store + server-side runs; M2+)
//
// The assets binding is configured with not_found_handling:"none", so a miss
// returns 404 and THIS worker decides the SPA fallback. That lets /pm/* deep
// links boot the PM app on refresh instead of being swallowed by the root
// index (which a plain single-page-application handler would do).

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // --- Backend API surface -------------------------------------------------
    // M1 ships only a liveness probe; the experiment store + server-side run
    // endpoints land in M2 (Worker + D1). Everything is namespaced under /api/
    // so the asset apps and the API never collide.
    if (pathname === "/api/health") {
      return json({ ok: true, surface: "fin", milestone: "m1", ts: Date.now() });
    }
    if (pathname.startsWith("/api/")) {
      return json({ error: "not_implemented", path: pathname }, 501);
    }

    // --- Static assets -------------------------------------------------------
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;

    // SPA fallback, subtree-aware: /pm/* -> PM app, everything else -> playground.
    const indexPath =
      pathname === "/pm" || pathname.startsWith("/pm/")
        ? "/pm/index.html"
        : "/index.html";
    const indexRes = await env.ASSETS.fetch(new Request(new URL(indexPath, url.origin), request));
    // Serve the shell with 200 so the client router can take over the path.
    return new Response(indexRes.body, {
      status: 200,
      headers: indexRes.headers,
    });
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
