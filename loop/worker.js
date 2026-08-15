// loop — the ticket graph's viewing surface. Thin routing worker in front of
// static assets, in the house style (compare moji/worker.js).
//
// The site is static: index.html plus data/graph.json, which is generated from
// .github/loop/ by scripts/gen-loop-data.mjs and committed. There is no
// database and no origin call — the graph is a build artifact, which is what
// makes this page cheap enough to redeploy on every loop turn.
//
// Two routes beyond plain asset serving:
//
//   /api/graph.json  — the same data, CORS-open and cache-short, so a dashboard
//                      or a probe can read the graph without scraping the page.
//                      Public by construction: everything in it is already on
//                      the page, and the ledger it comes from lives under
//                      .github/, which the root worker does not serve.
//
//   /health          — liveness plus the two facts worth alerting on: whether
//                      the loop is enabled, and whether the graph is coherent.
//                      `green is not proof` cuts both ways — a health endpoint
//                      that only says "I am up" is the same mistake as a deploy
//                      that only says "succeeded" (workers/cron learned this the
//                      expensive way: deployed, healthy, and firing nothing for
//                      its entire life).

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  // Short, not immutable: this file changes every time the loop takes a turn.
  'cache-control': 'public, max-age=60, stale-while-revalidate=300',
};

async function graph(env, url) {
  const res = await env.ASSETS.fetch(new Request(new URL('/data/graph.json', url.origin)));
  if (!res.ok) return null;
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/graph.json') {
      const res = await graph(env, url);
      if (!res) return new Response('{"error":"graph not generated"}', { status: 503, headers: JSON_HEADERS });
      return new Response(res.body, { status: 200, headers: JSON_HEADERS });
    }

    if (url.pathname === '/health') {
      const res = await graph(env, url);
      if (!res) {
        return new Response(JSON.stringify({ ok: false, why: 'data/graph.json missing' }), { status: 503, headers: JSON_HEADERS });
      }
      let d;
      try { d = await res.json(); }
      catch (e) { return new Response(JSON.stringify({ ok: false, why: `graph.json unparseable: ${e.message}` }), { status: 503, headers: JSON_HEADERS }); }

      // A graph with cycles, dangling edges or unparseable ledger lines is a
      // graph the scheduler will refuse to schedule from, which presents to a
      // human as "the loop stopped for no reason". Say it here instead.
      const coherent = !d.cycles?.length && !d.dangling?.length && !d.problems?.length;
      return new Response(JSON.stringify({
        ok: coherent,
        loopEnabled: d.enabled === true,
        branch: d.branch ?? null,
        beads: d.counts?.total ?? 0,
        ready: d.counts?.ready ?? 0,
        blocked: d.counts?.blocked ?? 0,
        remembered: d.counts?.knowledge ?? 0,
        turnsRecorded: d.runs?.length ?? 0,
        judgeCalibrated: d.judge?.calibrated === true,
        cycles: d.cycles?.length ?? 0,
        dangling: d.dangling?.length ?? 0,
        ledgerProblems: d.problems?.length ?? 0,
      }, null, 2), { status: coherent ? 200 : 503, headers: JSON_HEADERS });
    }

    return env.ASSETS.fetch(request);
  },
};
