// plant — the loop's work product, served. Thin routing worker in front of
// static assets, in the house style (compare loop/worker.js, moji/worker.js).
//
// This surface exists to be LOOKED AT BY STRANGERS. That is not decoration: the
// whole programme's premise is that a loop grading itself against gates it also
// writes will get very good at what it can measure and blind to everything
// else, and the only correction for that is people outside the loop. A work
// product nobody can open cannot be judged by anyone but the machine that made
// it.
//
// What is NOT here, deliberately: no ledger, no beads, no turn machinery, no
// link back to the governor. plant is the play; loop.mino.mobi is the theatre
// management. Someone arriving here should be able to judge the thing on its
// own terms without being told how it was made — otherwise the feedback is
// about the process, and the process is not what needs testing.

const HEALTH_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Liveness, plus the one fact worth alerting on. "Green is not proof" cuts
    // both ways: a health endpoint that only says "I am up" is the same mistake
    // as a deploy that only reports success. This one asserts the surface can
    // actually serve its entry point, because a worker that is up and serving
    // nothing is the failure this repo keeps rediscovering.
    if (url.pathname === '/health') {
      let index = false;
      try {
        const r = await env.ASSETS.fetch(new Request(new URL('/index.html', url)));
        index = r.ok;
      } catch { /* index stays false — reported, not thrown */ }
      return new Response(JSON.stringify({
        ok: index,
        surface: 'plant',
        serves: index ? 'index.html' : null,
      }, null, 2), { status: index ? 200 : 503, headers: HEALTH_HEADERS });
    }

    return env.ASSETS.fetch(request);
  },
};
