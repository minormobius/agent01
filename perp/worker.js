// perp.mino.mobi — static assets plus long-lived caching for the data files.
// The JSON series only change when the daily refresh workflow commits new ones,
// and each deploy replaces the whole asset manifest, so they cache hard.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/data/') && res.ok) {
      const out = new Response(res.body, res);
      out.headers.set('cache-control', 'public, max-age=1800, stale-while-revalidate=86400');
      return out;
    }
    return res;
  },
};
